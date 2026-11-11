/* 计划陪伴 · 陪伴场景
 * 真人卡面 / 循环视频 + 极缓呼吸缩放、缓慢视差、随状态变化的光影、
 * 点击与长按的温柔反馈、缩放平移与温柔语音。
 */
(function (global) {
  'use strict';

  var LINES = {
    idle: [
      '今天想从哪里开始？我把时间留给你。',
      '不着急，先挑一件最想做的事。',
      '我在这儿，不会吵你。',
      '慢慢来，一天不用塞得满满的。'
    ],
    focusStart: [
      '这一段我陪你，慢慢来。',
      '先做眼前这一小段，其他的等会儿再说。',
      '我把窗外的声音调小一点。',
      '你做你的，我在旁边看书。'
    ],
    focusClick: [
      '我在呢，你继续。',
      '写得挺顺的，别停。',
      '不用一直很专注，回来就好。',
      '这一页翻过去，就离结束近一点。'
    ],
    focusDone: [
      '看，你做到了。',
      '这一段很稳，我记下了。',
      '辛苦了，站起来伸个懒腰吧。',
      '把笔放下，喝口水。'
    ],
    breakStart: [
      '先松一口气，我帮你看着时间。',
      '起来走两步，看看窗外。',
      '什么都别想，就休息一会儿。',
      '眼睛离开屏幕，看看远处。'
    ],
    breakClick: [
      '休息也是计划的一部分。',
      '慢慢来，时间是我们的。',
      '要喝口水吗？',
      '这一会儿不用做任何事。'
    ],
    breakDone: [
      '休息够了，我们再来一小段？',
      '回来啦，我等你。',
      '准备好了就开始，不急。'
    ],
    longBreak: [
      '这一轮结束了，好好休息久一点。',
      '去走走，或者发会儿呆。',
      '你已经走了很远，先停一停。'
    ],
    strict: [
      '说好了这一段不暂停的，我陪着你。'
    ],
    // 长按时说的，比短按更慢一点
    linger: [
      '别急，我一直在。',
      '时间还够，你按自己的节奏。',
      '累了就把这一段放慢一点。',
      '我陪你到这一页结束。'
    ],
    test: [
      '我在这里，陪你把今天慢慢做完。'
    ]
  };

  /* 可选的陪伴画面：两张卡面 + 两段循环视频 */
  var COMPANIONS = {
    'li-shen-window': {
      id: 'li-shen-window',
      kind: 'image',
      name: '窗边读书',
      src: './assets/li-shen-window.jpg',
      thumb: './assets/thumb-li-shen-window.jpg'
    },
    'li-shen-flowers': {
      id: 'li-shen-flowers',
      kind: 'image',
      name: '夜里通话',
      src: './assets/li-shen-flowers.jpg',
      thumb: './assets/thumb-li-shen-flowers.jpg'
    },
    'video-wine-1': {
      id: 'video-wine-1',
      kind: 'video',
      name: '微醺 · 其一',
      src: './assets/video-wine-1.mp4',
      poster: './assets/poster-video-wine-1.jpg',
      thumb: './assets/thumb-video-wine-1.jpg'
    },
    'video-wine-2': {
      id: 'video-wine-2',
      kind: 'video',
      name: '微醺 · 其二',
      src: './assets/video-wine-2.mp4',
      poster: './assets/poster-video-wine-2.jpg',
      thumb: './assets/thumb-video-wine-2.jpg'
    }
  };
  var DEFAULT_COMPANION = 'li-shen-window';

  var bags = {};

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function pick(category) {
    var list = LINES[category] || LINES.idle;
    if (!bags[category] || !bags[category].length) {
      bags[category] = list.slice();
      // 洗牌，避免整轮重复
      for (var i = bags[category].length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = bags[category][i];
        bags[category][i] = bags[category][j];
        bags[category][j] = tmp;
      }
    }
    return bags[category].pop();
  }

  var scale = 1;
  var tx = 0;
  var ty = 0;
  var MIN_SCALE = 1;
  var MAX_SCALE = 2.8;
  var pointers = new Map();
  var dragStart = null;
  var pinchPrev = null;
  var moved = false;
  var interacted = false;

  var stage, viewport, canvas, bubble, moodChip;
  var imgEl, videoEl, blurEl, characterEl, playBtn;
  var bubbleTimer = null;
  var currentCompanion = null;
  var wantPlay = false;
  var pressTimer = null;
  var pressStart = null;
  var longPressed = false;
  var synth = global.speechSynthesis || null;
  var zhVoice = null;

  /* ================= 缩放 / 平移 ================= */
  function clampPan() {
    if (!viewport) return;
    var rect = viewport.getBoundingClientRect();
    var w = rect.width;
    var h = rect.height;
    var minX = w - w * scale;
    var minY = h - h * scale;
    tx = Math.min(0, Math.max(minX, tx));
    ty = Math.min(0, Math.max(minY, ty));
  }

  function apply() {
    if (!canvas) return;
    canvas.style.transform = 'translate(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px) scale(' + scale.toFixed(4) + ')';
    if (!interacted && scale > 1.01) {
      interacted = true;
      var hint = document.getElementById('zoomHint');
      if (hint) hint.classList.add('is-dim');
    }
  }

  function zoomAt(clientX, clientY, nextScale) {
    if (!viewport) return;
    nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
    var rect = viewport.getBoundingClientRect();
    var px = clientX - rect.left;
    var py = clientY - rect.top;
    var k = nextScale / scale;
    tx = px - (px - tx) * k;
    ty = py - (py - ty) * k;
    scale = nextScale;
    if (scale <= MIN_SCALE + 0.001) {
      tx = 0;
      ty = 0;
    }
    clampPan();
    apply();
  }

  function zoomCenter(factor) {
    var rect = viewport.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, scale * factor);
  }

  function resetZoom() {
    scale = 1;
    tx = 0;
    ty = 0;
    apply();
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function clearPress() {
    clearTimeout(pressTimer);
    pressTimer = null;
    if (characterEl) characterEl.classList.remove('is-pressing');
  }

  function shortPress() {
    say(lineForContext(), { speak: true });
    if (characterEl) {
      characterEl.classList.remove('is-touch');
      void characterEl.offsetWidth;
      characterEl.classList.add('is-touch');
      setTimeout(function () { characterEl.classList.remove('is-touch'); }, 1500);
    }
  }

  function longPress() {
    longPressed = true;
    say(pick('linger'), { speak: true, duration: 7600 });
    if (characterEl) {
      characterEl.classList.remove('is-touch');
      void characterEl.offsetWidth;
      characterEl.classList.add('is-touch');
      setTimeout(function () { characterEl.classList.remove('is-touch'); }, 1500);
    }
  }

  function bindZoom() {
    viewport.addEventListener('wheel', function (e) {
      e.preventDefault();
      var factor = Math.exp(-e.deltaY * 0.0014);
      zoomAt(e.clientX, e.clientY, scale * factor);
    }, { passive: false });

    viewport.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.zoom-controls') || e.target.closest('.media-play')) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { viewport.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      if (pointers.size === 1) {
        dragStart = { x: e.clientX, y: e.clientY, tx: tx, ty: ty };
        moved = false;
        // 按在卡面上：短按说话，按住 520ms 触发更温柔的一句
        if (e.target.closest('#character')) {
          longPressed = false;
          pressStart = { x: e.clientX, y: e.clientY, time: Date.now() };
          clearPress();
          if (characterEl) characterEl.classList.add('is-pressing');
          pressTimer = setTimeout(function () {
            if (moved) return;
            if (characterEl) characterEl.classList.remove('is-pressing');
            longPress();
          }, 520);
        }
      } else if (pointers.size === 2) {
        pinchPrev = null;
        moved = true;
        clearPress();
        pressStart = null;
      }
    });

    viewport.addEventListener('pointermove', function (e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 1 && dragStart) {
        var dx = e.clientX - dragStart.x;
        var dy = e.clientY - dragStart.y;
        if (Math.abs(dx) + Math.abs(dy) > 8) {
          if (!moved) clearPress();
          moved = true;
        }
        tx = dragStart.tx + dx;
        ty = dragStart.ty + dy;
        clampPan();
        apply();
      } else if (pointers.size === 2) {
        var pts = Array.from(pointers.values());
        var d = dist(pts[0], pts[1]);
        var mid = midpoint(pts[0], pts[1]);
        if (pinchPrev) {
          var factor = d / (pinchPrev.d || 1);
          var ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
          var rect = viewport.getBoundingClientRect();
          var px = mid.x - rect.left;
          var py = mid.y - rect.top;
          var k = ns / scale;
          tx = px - (px - tx) * k + (mid.x - pinchPrev.mid.x);
          ty = py - (py - ty) * k + (mid.y - pinchPrev.mid.y);
          scale = ns;
          clampPan();
          apply();
        }
        pinchPrev = { d: d, mid: mid };
        moved = true;
      }
    });

    function onUp(e) {
      pointers.delete(e.pointerId);
      if (pointers.size === 0) {
        dragStart = null;
        pinchPrev = null;
        clearPress();
        // 没拖动、也不是长按：当作轻点
        if (pressStart && !moved && !longPressed && Date.now() - pressStart.time < 520) {
          shortPress();
        }
        pressStart = null;
        longPressed = false;
      } else if (pointers.size === 1) {
        var rest = Array.from(pointers.values())[0];
        dragStart = { x: rest.x, y: rest.y, tx: tx, ty: ty };
        pinchPrev = null;
      }
    }
    viewport.addEventListener('pointerup', onUp);
    viewport.addEventListener('pointercancel', onUp);
    viewport.addEventListener('dblclick', function (e) {
      if (e.target.closest('.zoom-controls')) return;
      resetZoom();
    });

    var zin = document.getElementById('zoomIn');
    var zout = document.getElementById('zoomOut');
    var zreset = document.getElementById('zoomReset');
    if (zin) zin.addEventListener('click', function () { zoomCenter(1.22); });
    if (zout) zout.addEventListener('click', function () { zoomCenter(1 / 1.22); });
    if (zreset) zreset.addEventListener('click', function () { resetZoom(); });
  }

  /* ================= 陪伴画面 ================= */
  function resolveCompanion(id) {
    return COMPANIONS[id] || COMPANIONS[DEFAULT_COMPANION];
  }

  function shouldPlayVideo() {
    if (!videoEl || !currentCompanion || currentCompanion.kind !== 'video') return false;
    if (global.document.visibilityState !== 'visible') return false;
    var view = global.document.getElementById('view-focus');
    if (view && !view.classList.contains('is-active')) return false;
    return true;
  }

  function hidePlayBtn() {
    if (playBtn) playBtn.hidden = true;
  }

  function showPlayBtn() {
    if (!playBtn) return;
    playBtn.hidden = false;
    playBtn.textContent = '轻触播放';
  }

  function tryPlay() {
    if (!videoEl || !shouldPlayVideo()) return;
    wantPlay = true;
    var p = videoEl.play();
    if (p && typeof p.then === 'function') {
      p.then(function () {
        hidePlayBtn();
      }).catch(function () {
        // 浏览器拦截了自动播放：给一个封面按钮让用户点一下
        showPlayBtn();
      });
    }
  }

  function pauseVideo() {
    wantPlay = false;
    if (videoEl && !videoEl.paused) {
      try { videoEl.pause(); } catch (e) { /* 忽略 */ }
    }
  }

  function setBlur(src) {
    if (blurEl && src) blurEl.style.backgroundImage = 'url("' + src + '")';
  }

  function applyCompanion(id, opts) {
    opts = opts || {};
    var item = resolveCompanion(id);
    if (!imgEl || !videoEl) return;
    currentCompanion = item;

    if (stage) stage.dataset.companion = item.id;
    if (characterEl) {
      characterEl.setAttribute('aria-label', '和黎深说句话（当前：' + item.name + '）');
    }

    if (item.kind === 'video') {
      imgEl.hidden = true;
      videoEl.hidden = false;
      videoEl.poster = item.poster;
      setBlur(item.poster);
      if (videoEl.getAttribute('data-src') !== item.src) {
        videoEl.setAttribute('data-src', item.src);
        videoEl.src = item.src;
      }
      hidePlayBtn();
      tryPlay();
    } else {
      pauseVideo();
      videoEl.hidden = true;
      hidePlayBtn();
      imgEl.hidden = false;
      if (imgEl.getAttribute('src') !== item.src) {
        imgEl.src = item.src;
        imgEl.alt = '黎深 · ' + item.name;
      }
      setBlur(item.src);
    }

    if (opts.announce) {
      say('换成「' + item.name + '」了，这一段我陪你。', { speak: false, duration: 4200 });
    }
  }

  function syncCompanionFromSettings(opts) {
    var s = global.PCStore.getSettings();
    applyCompanion(s.companion, opts);
  }

  /* ================= 语音 ================= */
  function loadVoices() {
    if (!synth) return;
    var list = synth.getVoices() || [];
    zhVoice = list.find(function (v) { return /zh[-_]CN/i.test(v.lang) && v.localService; }) ||
      list.find(function (v) { return /zh[-_]CN/i.test(v.lang); }) ||
      list.find(function (v) { return /^zh/i.test(v.lang); }) || null;
  }

  function speak(text, force) {
    if (!synth) return false;
    var settings = global.PCStore.getSettings();
    if (!force && !settings.voice) return false;
    try {
      synth.cancel();
      if (!zhVoice) loadVoices();
      var utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'zh-CN';
      utter.rate = Math.min(1.5, Math.max(0.5, Number(settings.voiceRate) || 1));
      utter.volume = Math.min(1, Math.max(0, Number(settings.voiceVolume)));
      utter.pitch = 1.02;
      if (zhVoice) utter.voice = zhVoice;
      // 语音期间把背景音乐压低，说完恢复
      var music = global.PCMusic;
      if (music) {
        utter.onend = function () { music.duck(false); };
        utter.onerror = function () { music.duck(false); };
        music.duck(true);
      }
      synth.speak(utter);
      return true;
    } catch (e) {
      console.warn('[Scene] 语音播放失败', e);
      if (global.PCMusic) global.PCMusic.duck(false);
      return false;
    }
  }

  /* ================= 台词气泡 ================= */
  function say(text, opts) {
    if (!bubble || !text) return;
    opts = opts || {};
    bubble.textContent = text;
    bubble.hidden = false;
    // 强制 reflow 以便过渡生效
    void bubble.offsetWidth;
    bubble.classList.add('is-show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () {
      bubble.classList.remove('is-show');
      setTimeout(function () { bubble.hidden = true; }, 320);
    }, opts.duration || 6400);
    if (opts.speak) speak(text);
  }

  function hideBubble() {
    if (!bubble) return;
    bubble.classList.remove('is-show');
    bubbleTimer = setTimeout(function () { bubble.hidden = true; }, 320);
  }

  function lineForContext() {
    var timer = global.PCTimer;
    var phase = timer ? timer.phase : 'focus';
    var running = timer ? timer.running : false;
    var paused = timer && !running && timer.base > 0;
    if (paused) return pick('breakClick');
    if (phase === 'focus') return pick(running ? 'focusClick' : 'idle');
    if (phase === 'long') return pick('longBreak');
    return pick(running ? 'breakClick' : 'breakStart');
  }

  /* ================= 对外动作 ================= */
  function setMood(mood) {
    if (!stage) return;
    stage.dataset.mood = mood;
    if (currentCompanion && currentCompanion.kind === 'video') {
      // 专注与休息都让画面继续流动，只是节奏不同；离开页面时暂停
      if (shouldPlayVideo()) tryPlay();
    }
    if (!moodChip) return;
    var map = {
      idle: '安静陪伴',
      focus: '陪学中',
      rest: '一起休息',
      done: '刚刚完成',
      break: '一起休息'
    };
    moodChip.textContent = map[mood] || '安静陪伴';
  }

  function setCaption(text) {
    var el = document.getElementById('stageCaption');
    if (el) el.textContent = text;
  }

  /* 页面 / 视图切换时省电 */
  function setVisible(visible) {
    if (!visible) pauseVideo();
    else if (shouldPlayVideo()) tryPlay();
  }

  function init() {
    stage = document.getElementById('stage');
    viewport = document.getElementById('stageViewport');
    canvas = document.getElementById('stageCanvas');
    bubble = document.getElementById('stageBubble');
    moodChip = document.getElementById('moodChip');
    imgEl = document.getElementById('stageImage');
    videoEl = document.getElementById('stageVideo');
    blurEl = document.getElementById('stageBlur');
    characterEl = document.getElementById('character');
    playBtn = document.getElementById('stagePlayBtn');
    if (!stage || !viewport || !canvas) return;

    bindZoom();

    if (characterEl) {
      characterEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          say(lineForContext(), { speak: true });
        }
      });
    }

    if (playBtn) {
      playBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        tryPlay();
      });
    }

    if (videoEl) {
      videoEl.addEventListener('playing', function () {
        hidePlayBtn();
      });
      videoEl.addEventListener('error', function () {
        // 离线且未缓存时：只留封面帧，不报错
        showPlayBtn();
      });
      videoEl.addEventListener('canplay', function () {
        if (wantPlay) tryPlay();
      });
    }

    var talkBtn = document.getElementById('charTalkBtn');
    if (talkBtn) {
      talkBtn.addEventListener('click', function () {
        say(lineForContext(), { speak: true });
      });
    }

    if (synth) {
      loadVoices();
      if (typeof synth.addEventListener === 'function') {
        synth.addEventListener('voiceschanged', loadVoices);
      } else {
        synth.onvoiceschanged = loadVoices;
      }
    }

    // 初始画面
    syncCompanionFromSettings();

    // 设置里换了人物：即时切换
    global.document.addEventListener('pc:state', function () {
      var s = global.PCStore.getSettings();
      if (!currentCompanion || currentCompanion.id !== s.companion) {
        applyCompanion(s.companion, { announce: true });
      }
    });

    // 离开页面 / 回到页面
    global.document.addEventListener('visibilitychange', function () {
      setVisible(global.document.visibilityState === 'visible');
    });
    global.addEventListener('pagehide', pauseVideo);
    global.addEventListener('pageshow', function () {
      if (shouldPlayVideo()) tryPlay();
    });

    // 视频第一次真正播放前不占用解码资源
    if (videoEl) {
      videoEl.addEventListener('loadedmetadata', function () {
        if (wantPlay) tryPlay();
      });
    }
  }

  global.PCScene = {
    init: init,
    say: say,
    speak: speak,
    hideBubble: hideBubble,
    setMood: setMood,
    setCaption: setCaption,
    setVisible: setVisible,
    applyCompanion: applyCompanion,
    companion: function () { return currentCompanion; },
    companions: COMPANIONS,
    lineForContext: lineForContext,
    line: pick,
    resetZoom: resetZoom,
    isSpeechAvailable: function () { return !!synth; }
  };
})(window);
