/* 计划陪伴 · 背景音乐
 * 本地 mp3 循环：首次交互后才播放、段落淡入淡出、语音时自动 duck、
 * 页面隐藏暂停、离线未缓存时静默降级。
 */
(function (global) {
  'use strict';

  var Store = global.PCStore;
  var SRC = './assets/bgm-calm.mp3';

  var audio = null;
  var started = false;      // 是否已经发生过用户交互
  var playing = false;
  var blocked = false;      // 被浏览器拦截
  var unavailable = false;  // 离线且未缓存
  var ducked = false;
  var current = 0;          // 当前实际音量（0~1）
  var raf = null;
  var resumeAfterHidden = false;
  var warmed = false;

  /* 视频/音频用 Range 请求，SW 不会缓存分片；
     这里在首次播放成功后补一次完整请求，让它进按需缓存，离线也能听 */
  function warmCache() {
    if (warmed) return;
    warmed = true;
    try {
      if (!global.navigator.serviceWorker || !global.navigator.serviceWorker.controller) return;
      fetch(SRC, { credentials: 'same-origin' }).catch(function () { /* 离线就下次再说 */ });
    } catch (e) { /* 忽略 */ }
  }

  function settings() { return Store.getSettings(); }

  function baseVol() {
    var v = Number(settings().musicVolume);
    if (!isFinite(v)) v = 30;
    return Math.max(0, Math.min(1, v / 100));
  }

  function targetVol() {
    if (!settings().music) return 0;
    return baseVol() * (ducked ? 0.25 : 1);
  }

  function state() {
    return {
      enabled: settings().music !== false,
      playing: playing,
      blocked: blocked,
      unavailable: unavailable,
      volume: Math.round(baseVol() * 100),
      ducked: ducked
    };
  }

  function emit() {
    global.document.dispatchEvent(new Event('pc:music'));
  }

  function ensure() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'none';
    audio.loop = false;
    audio.src = SRC;
    audio.volume = 0;

    audio.addEventListener('ended', function () {
      // 不用 loop 硬循环：回到开头再淡入一次
      if (!settings().music || !started) {
        playing = false;
        emit();
        return;
      }
      try { audio.currentTime = 0; } catch (e) { /* 忽略 */ }
      current = 0;
      audio.volume = 0;
      playNow();
    });

    audio.addEventListener('error', function () {
      // 离线且没缓存过：只标记不可用，不弹错误
      playing = false;
      blocked = false;
      unavailable = true;
      emit();
    });

    audio.addEventListener('playing', function () {
      playing = true;
      blocked = false;
      unavailable = false;
      fadeTo(targetVol(), 1200);
      warmCache();
      emit();
    });

    audio.addEventListener('pause', function () {
      if (audio && !audio.ended) {
        playing = false;
        emit();
      }
    });

    return audio;
  }

  function fadeTo(v, ms) {
    var a = ensure();
    if (raf) {
      cancelAnimationFrame(raf);
      raf = null;
    }
    var from = current;
    var t0 = (global.performance && global.performance.now) ? global.performance.now() : Date.now();
    function step(now) {
      var k = Math.min(1, (now - t0) / Math.max(16, ms));
      current = from + (v - from) * k;
      try { a.volume = Math.max(0, Math.min(1, current)); } catch (e) { /* iOS 忽略 */ }
      if (k < 1) {
        raf = requestAnimationFrame(step);
      } else {
        raf = null;
      }
    }
    raf = requestAnimationFrame(step);
  }

  function playNow() {
    var a = ensure();
    if (unavailable) return;
    var p;
    try {
      p = a.play();
    } catch (e) {
      blocked = true;
      playing = false;
      emit();
      return;
    }
    if (p && typeof p.then === 'function') {
      p.then(function () {
        playing = true;
        blocked = false;
        fadeTo(targetVol(), 1200);
        emit();
      }).catch(function () {
        // 自动播放被拦 / 解码失败：静默处理
        playing = false;
        if (a.error) unavailable = true;
        else blocked = true;
        emit();
      });
    }
  }

  /* 第一次用户交互后调用：开始播放（或在已播放时校准音量） */
  function start() {
    if (!settings().music) return;
    started = true;
    ensure();
    if (global.document.visibilityState === 'hidden') return;
    if (playing) {
      fadeTo(targetVol(), 600);
      return;
    }
    if (unavailable) return;
    current = 0;
    audio.volume = 0;
    playNow();
  }

  function stop(ms) {
    if (!audio) {
      playing = false;
      emit();
      return;
    }
    fadeTo(0, ms);
    setTimeout(function () {
      if (settings().music || !audio) return;
      try { audio.pause(); } catch (e) { /* 忽略 */ }
      playing = false;
      emit();
    }, ms + 40);
  }

  function setEnabled(on) {
    Store.updateSettings({ music: !!on });
    if (on) {
      started = true;
      ensure();
      if (!playing) {
        current = 0;
        audio.volume = 0;
        playNow();
      } else {
        fadeTo(targetVol(), 420);
      }
    } else {
      stop(520);
    }
    emit();
  }

  function toggle() {
    setEnabled(!settings().music);
    return settings().music;
  }

  function setVolume(v) {
    var n = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
    Store.updateSettings({ musicVolume: n });
    if (playing) fadeTo(targetVol(), 200);
    emit();
  }

  /* 语音说话时压低音乐 */
  function duck(on) {
    ducked = !!on;
    if (playing) fadeTo(targetVol(), ducked ? 320 : 640);
  }

  /* 阶段切换：0.6s 的柔和过渡，不硬切 */
  function dip() {
    if (!playing) return;
    fadeTo(targetVol() * 0.25, 300);
    setTimeout(function () {
      if (playing) fadeTo(targetVol(), 300);
    }, 320);
  }

  function onVisibility() {
    if (global.document.visibilityState === 'hidden') {
      resumeAfterHidden = playing;
      if (audio && !audio.paused) {
        try { audio.pause(); } catch (e) { /* 忽略 */ }
      }
      playing = false;
      emit();
    } else if (resumeAfterHidden) {
      resumeAfterHidden = false;
      if (settings().music) start();
    }
  }

  function init() {
    global.document.addEventListener('visibilitychange', onVisibility);
    global.addEventListener('pagehide', function () {
      if (audio && !audio.paused) {
        resumeAfterHidden = playing;
        try { audio.pause(); } catch (e) { /* 忽略 */ }
      }
    });
    global.addEventListener('online', function () {
      if (unavailable) {
        unavailable = false;
        emit();
      }
    });
  }

  global.PCMusic = {
    init: init,
    start: start,
    stop: stop,
    toggle: toggle,
    setEnabled: setEnabled,
    setVolume: setVolume,
    duck: duck,
    dip: dip,
    state: state
  };
})(window);
