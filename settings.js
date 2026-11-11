/* 计划陪伴 · 设置 */
(function (global) {
  'use strict';

  var Store = global.PCStore;
  var bound = false;

  var NUMBER_FIELDS = [
    { id: 'setFocus', key: 'focus', min: 1, max: 180 },
    { id: 'setShort', key: 'short', min: 1, max: 60 },
    { id: 'setLong', key: 'long', min: 1, max: 120 },
    { id: 'setLongEvery', key: 'longEvery', min: 2, max: 12 }
  ];

  var TOGGLE_FIELDS = [
    { id: 'setAutoBreak', key: 'autoStartBreak' },
    { id: 'setAutoFocus', key: 'autoStartFocus' },
    { id: 'setStrict', key: 'strict' },
    { id: 'setSound', key: 'soundOn' },
    { id: 'setVibrate', key: 'vibrate' },
    { id: 'setVoice', key: 'voice' }
  ];

  function render() {
    var s = Store.getSettings();

    NUMBER_FIELDS.forEach(function (f) {
      var el = document.getElementById(f.id);
      if (el && document.activeElement !== el) el.value = s[f.key];
    });
    TOGGLE_FIELDS.forEach(function (f) {
      var el = document.getElementById(f.id);
      if (el) el.checked = !!s[f.key];
    });

    var vol = document.getElementById('setVoiceVolume');
    var volOut = document.getElementById('setVoiceVolumeOut');
    if (vol) vol.value = Math.round(s.voiceVolume * 100);
    if (volOut) volOut.textContent = Math.round(s.voiceVolume * 100) + '%';

    var rate = document.getElementById('setVoiceRate');
    var rateOut = document.getElementById('setVoiceRateOut');
    if (rate) rate.value = Math.round(s.voiceRate * 100);
    if (rateOut) rateOut.textContent = (Math.round(s.voiceRate * 100) / 100).toFixed(2) + 'x';

    var voicePanel = document.getElementById('voicePanel');
    if (voicePanel) voicePanel.classList.toggle('is-off', !s.voice);

    var modeBtns = document.querySelectorAll('#setMode button');
    Array.prototype.forEach.call(modeBtns, function (b) {
      b.classList.toggle('is-active', b.dataset.mode === s.mode);
    });

    var themeBtns = document.querySelectorAll('#themeSwitch button');
    Array.prototype.forEach.call(themeBtns, function (b) {
      b.classList.toggle('is-active', b.dataset.themeValue === s.theme);
    });

    var companionBtns = document.querySelectorAll('#companionGrid .companion-opt');
    Array.prototype.forEach.call(companionBtns, function (b) {
      var active = b.dataset.companion === s.companion;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-checked', active ? 'true' : 'false');
    });

    var musicBox = document.getElementById('setMusic');
    if (musicBox) musicBox.checked = s.music !== false;
    var musicVol = document.getElementById('setMusicVolume');
    if (musicVol && document.activeElement !== musicVol) musicVol.value = Math.round(s.musicVolume);
    var musicOut = document.getElementById('setMusicVolumeOut');
    if (musicOut) musicOut.textContent = Math.round(s.musicVolume) + '%';

    var musicState = global.PCMusic ? global.PCMusic.state() : null;
    var musicHint = document.getElementById('musicHint');
    if (musicState && musicState.unavailable) {
      if (musicBox) musicBox.disabled = true;
      if (musicVol) musicVol.disabled = true;
      if (musicHint) musicHint.textContent = '离线且还没缓存过这段音乐：需要联网加载一次，之后就能离线听。';
    } else {
      if (musicBox) musicBox.disabled = false;
      if (musicVol) musicVol.disabled = false;
      if (musicHint) musicHint.textContent = '音乐约 3.9MB，不进离线预缓存；首次播放需联网一次，之后可离线使用。';
    }

    var storageInfo = document.getElementById('storageInfo');
    if (storageInfo) {
      var size = 0;
      try { size = new Blob([JSON.stringify(Store.state)]).size; } catch (e) { size = 0; }
      storageInfo.textContent = '本机数据约 ' + (size / 1024).toFixed(1) + ' KB，仅保存在当前浏览器。';
    }

    var warn = document.getElementById('storageWarn');
    if (warn) warn.hidden = Store.isStorageOK();
  }

  function bind() {
    if (bound) return;
    bound = true;

    NUMBER_FIELDS.forEach(function (f) {
      var el = document.getElementById(f.id);
      if (!el) return;
      el.addEventListener('change', function () {
        var value = Number(el.value);
        if (!isFinite(value)) value = Store.getSettings()[f.key];
        value = Math.min(f.max, Math.max(f.min, Math.round(value)));
        el.value = value;
        Store.updateSettings({ [f.key]: value });
        var timer = global.PCTimer;
        if (timer && (timer.running || timer.base > 0) && (f.key === 'focus' || f.key === 'short' || f.key === 'long')) {
          // 本段进行中：保存设置但不打断当前这一段，明确告诉用户何时生效
          global.PCUI.toast('已保存：' + value + ' 分钟，从下一段开始生效');
        }
      });
    });

    TOGGLE_FIELDS.forEach(function (f) {
      var el = document.getElementById(f.id);
      if (!el) return;
      el.addEventListener('change', function () {
        Store.updateSettings({ [f.key]: el.checked });
        if (f.key === 'strict') {
          global.PCUI.toast(el.checked ? '严格模式已开启：暂停、重置、跳过都会失效' : '严格模式已关闭');
        }
        if (f.key === 'voice') {
          global.PCUI.toast(el.checked ? '陪伴语音已开启' : '陪伴语音已关闭');
          if (el.checked) {
            global.PCScene.speak('我在这里，陪你把今天慢慢做完。');
          } else if (global.speechSynthesis) {
            global.speechSynthesis.cancel();
          }
        }
        render();
      });
    });

    var vol = document.getElementById('setVoiceVolume');
    if (vol) {
      vol.addEventListener('input', function () {
        var v = Math.min(1, Math.max(0, Number(vol.value) / 100));
        var out = document.getElementById('setVoiceVolumeOut');
        if (out) out.textContent = Math.round(v * 100) + '%';
        Store.updateSettings({ voiceVolume: v });
      });
    }

    var rate = document.getElementById('setVoiceRate');
    if (rate) {
      rate.addEventListener('input', function () {
        var v = Math.min(1.4, Math.max(0.6, Number(rate.value) / 100));
        var out = document.getElementById('setVoiceRateOut');
        if (out) out.textContent = v.toFixed(2) + 'x';
        Store.updateSettings({ voiceRate: v });
      });
    }

    var testBtn = document.getElementById('testVoiceBtn');
    if (testBtn) {
      testBtn.addEventListener('click', function () {
        if (!global.PCScene.isSpeechAvailable()) {
          global.PCUI.toast('当前浏览器不支持语音播报');
          return;
        }
        var ok = global.PCScene.speak('我在这里，陪你把今天慢慢做完。', true);
        if (!ok) global.PCUI.toast('语音暂时不可用');
      });
    }

    var modeBtns = document.querySelectorAll('#setMode button');
    Array.prototype.forEach.call(modeBtns, function (btn) {
      btn.addEventListener('click', function () {
        // 进行中会被计时器拦下并给出提示
        global.PCTimer.setMode(btn.dataset.mode);
        render();
      });
    });

    var themeBtns = document.querySelectorAll('#themeSwitch button');
    Array.prototype.forEach.call(themeBtns, function (btn) {
      btn.addEventListener('click', function () {
        Store.updateSettings({ theme: btn.dataset.themeValue });
        if (global.PCUI && global.PCUI.applyTheme) global.PCUI.applyTheme();
        render();
      });
    });

    var companionBtns = document.querySelectorAll('#companionGrid .companion-opt');
    Array.prototype.forEach.call(companionBtns, function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.dataset.companion;
        if (Store.getSettings().companion === id) return;
        Store.updateSettings({ companion: id });
        if (global.PCScene && global.PCScene.applyCompanion) {
          global.PCScene.applyCompanion(id, { announce: true });
        }
        render();
      });
    });

    var musicBox = document.getElementById('setMusic');
    if (musicBox) {
      musicBox.addEventListener('change', function () {
        global.PCMusic.setEnabled(musicBox.checked);
        var st = global.PCMusic.state();
        if (musicBox.checked && st.unavailable) {
          global.PCUI.toast('这段音乐还没缓存，需要联网加载一次');
        } else if (musicBox.checked && st.blocked) {
          global.PCUI.toast('浏览器拦住了播放，点一下陪伴页的小喇叭再试');
        }
        render();
      });
    }

    var musicVol = document.getElementById('setMusicVolume');
    if (musicVol) {
      musicVol.addEventListener('input', function () {
        var out = document.getElementById('setMusicVolumeOut');
        if (out) out.textContent = musicVol.value + '%';
        global.PCMusic.setVolume(Number(musicVol.value));
      });
    }

    global.document.addEventListener('pc:music', render);

    var clearBtn = document.getElementById('clearDataBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        global.PCUI.confirm('清空所有数据', '任务、专注记录、分心记录都会删除，设置与分类会保留。这个操作无法撤销。', { ok: '确认清空', danger: true })
          .then(function (yes) {
            if (!yes) return;
            Store.clearData();
            if (global.PCTimer) {
              global.PCTimer.reset();
              global.PCTimer.setPhase('focus');
            }
            global.PCUI.toast('数据已清空');
            render();
          });
      });
    }

    var seedBtn = document.getElementById('seedDemoBtn');
    if (seedBtn) {
      seedBtn.addEventListener('click', function () {
        global.PCUI.confirm('载入示例数据', '会先清空现有任务与专注记录，再写入一组用于预览统计的示例数据。示例数据只存在本机。', { ok: '载入示例' })
          .then(function (yes) {
            if (!yes) return;
            Store.seedDemo();
            if (global.PCTimer) {
              global.PCTimer.reset();
              global.PCTimer.setPhase('focus');
            }
            global.PCUI.toast('示例数据已载入，可以去看统计页');
            render();
          });
      });
    }

    var installBtn = document.getElementById('settingsInstallBtn');
    if (installBtn) {
      installBtn.addEventListener('click', function () {
        if (global.PCInstall) global.PCInstall.showGuide(true);
      });
    }

    global.document.addEventListener('pc:state', function () {
      if (document.getElementById('view-settings').classList.contains('is-active')) render();
    });
  }

  global.PCSettings = {
    bind: bind,
    render: render
  };
})(window);
