/* 计划陪伴 · 应用编排
 * 导航、快捷键、阶段提示音、语音调度、PWA 安装引导、屏幕常亮。
 */
(function (global) {
  'use strict';

  var Store = global.PCStore;
  var D = global.PCDate;
  var doc = global.document;

  var lastPhaseCompleteAt = 0;
  var interludeSpoken = false;
  var lastDayChecked = D.todayStr();
  var toastTimers = [];

  /* ================= 主题 ================= */
  var darkQuery = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;

  function resolvedTheme() {
    var setting = Store.getSettings().theme;
    if (setting === 'dark' || setting === 'light') return setting;
    return darkQuery && darkQuery.matches ? 'dark' : 'light';
  }

  function applyTheme() {
    var theme = resolvedTheme();
    doc.documentElement.dataset.theme = theme;
    var meta = doc.getElementById('themeColorMeta');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#1b201c' : '#f4f1e9');
    var wash = doc.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (wash) wash.setAttribute('content', theme === 'dark' ? 'black-translucent' : 'default');
    doc.dispatchEvent(new Event('pc:theme'));
    var themeBtns = doc.querySelectorAll('#themeSwitch button');
    Array.prototype.forEach.call(themeBtns, function (b) {
      b.classList.toggle('is-active', b.dataset.themeValue === Store.getSettings().theme);
    });
  }

  if (darkQuery) {
    var onScheme = function () { applyTheme(); };
    if (typeof darkQuery.addEventListener === 'function') darkQuery.addEventListener('change', onScheme);
    else if (typeof darkQuery.addListener === 'function') darkQuery.addListener(onScheme);
  }

  /* ================= 提示 / 弹窗 ================= */
  var modalStack = [];

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(message, opts) {
    opts = opts || {};
    var host = doc.getElementById('toastHost');
    if (!host) return null;
    var el = doc.createElement('div');
    el.className = 'toast' + (opts.kind ? ' toast-' + opts.kind : '');
    el.innerHTML = '<span class="toast-text">' + esc(message) + '</span>';
    if (opts.action) {
      var btn = doc.createElement('button');
      btn.className = 'toast-action';
      btn.textContent = opts.action.label;
      btn.addEventListener('click', function () {
        close();
        opts.action.onClick();
      });
      el.appendChild(btn);
    }
    host.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('is-show'); });
    var timer = setTimeout(close, opts.duration || 2800);
    toastTimers.push(timer);

    function close() {
      clearTimeout(timer);
      el.classList.remove('is-show');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    }
    el.addEventListener('click', function (e) {
      if (e.target.closest('.toast-action')) return;
      close();
    });
    return { close: close, el: el };
  }

  function modal(options) {
    options = options || {};
    var overlay = doc.createElement('div');
    overlay.className = 'modal-backdrop';

    var panel = doc.createElement('div');
    panel.className = 'modal' + (options.wide ? ' modal-wide' : '');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', options.title || '对话框');

    var head = doc.createElement('div');
    head.className = 'modal-head';
    head.innerHTML = '<h3>' + esc(options.title || '') + '</h3>';
    var closeBtn = doc.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.setAttribute('aria-label', '关闭');
    closeBtn.innerHTML = '✕';
    head.appendChild(closeBtn);

    var body = doc.createElement('div');
    body.className = 'modal-body';
    body.innerHTML = options.body || '';

    var actions = doc.createElement('div');
    actions.className = 'modal-actions';

    panel.appendChild(head);
    panel.appendChild(body);
    if (options.actions && options.actions.length) panel.appendChild(actions);
    overlay.appendChild(panel);
    doc.body.appendChild(overlay);

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      overlay.classList.remove('is-show');
      modalStack = modalStack.filter(function (m) { return m.close !== close; });
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 220);
      if (options.onClose) options.onClose();
      doc.body.classList.toggle('has-modal', modalStack.length > 0);
    }

    (options.actions || []).forEach(function (action) {
      var btn = doc.createElement('button');
      btn.className = 'btn ' + (action.kind || 'ghost');
      btn.textContent = action.label;
      if (action.disabled) btn.disabled = true;
      btn.addEventListener('click', function () {
        if (action.onClick) {
          var result = action.onClick(close);
          if (result === false) return;
        }
        close();
      });
      actions.appendChild(btn);
    });

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay && !options.persistent) close();
    });

    modalStack.push({ close: close, overlay: overlay });
    doc.body.classList.add('has-modal');
    requestAnimationFrame(function () { overlay.classList.add('is-show'); });

    if (options.onMount) options.onMount(panel);
    setTimeout(function () {
      var focusTarget = panel.querySelector('input, textarea, select') || panel.querySelector('.btn.primary') || closeBtn;
      if (focusTarget && focusTarget.focus) focusTarget.focus();
    }, 80);

    return { close: close, root: panel };
  }

  function confirm(title, message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var settled = false;
      function settle(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }
      modal({
        title: title,
        body: '<p class="modal-lead">' + esc(message) + '</p>',
        actions: [
          {
            label: opts.cancel || '取消',
            kind: 'ghost',
            onClick: function (close) { settle(false); close(); }
          },
          {
            label: opts.ok || '确定',
            kind: opts.danger ? 'danger' : 'primary',
            onClick: function (close) { settle(true); close(); }
          }
        ],
        onClose: function () { settle(false); }
      });
    });
  }

  /* ================= 声音 / 震动 ================= */
  var audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      var Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return null;
      try { audioCtx = new Ctx(); } catch (e) { return null; }
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(function () { /* 忽略 */ });
    }
    return audioCtx;
  }

  function chime(kind) {
    if (!Store.getSettings().soundOn) return;
    var ctx = ensureAudio();
    if (!ctx) return;
    var notes = kind === 'focusEnd' ? [523.25, 659.25, 783.99] : [783.99, 659.25, 523.25];
    var now = ctx.currentTime;
    notes.forEach(function (freq, index) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      var start = now + index * 0.22;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.075, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 1.2);
    });
  }

  function vibrate() {
    if (!Store.getSettings().vibrate) return;
    if (navigator.vibrate) {
      try { navigator.vibrate([18, 60, 18]); } catch (e) { /* 忽略 */ }
    }
  }

  /* ================= 屏幕常亮 ================= */
  var wakeSentinel = null;

  function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    if (doc.visibilityState !== 'visible') return;
    if (wakeSentinel) return;
    try {
      navigator.wakeLock.request('screen').then(function (sentinel) {
        wakeSentinel = sentinel;
        sentinel.addEventListener('release', function () { wakeSentinel = null; });
      }).catch(function () { wakeSentinel = null; });
    } catch (e) {
      wakeSentinel = null;
    }
  }

  function releaseWakeLock() {
    if (!wakeSentinel) return;
    try {
      wakeSentinel.release().catch(function () { /* 忽略 */ });
    } catch (e) { /* 忽略 */ }
    wakeSentinel = null;
  }

  /* ================= 界面刷新 ================= */
  function refreshToday() {
    var today = D.todayStr();
    var recs = Store.state.records.filter(function (r) { return r.date === today; });
    var min = Math.round(recs.reduce(function (sum, r) { return sum + r.durationSec; }, 0) / 60);
    var pill = doc.getElementById('todayPill');
    if (pill) pill.textContent = '今日 ' + recs.length + ' 个番茄 · ' + min + ' 分钟';
    var caption = doc.getElementById('stageCaption');
    if (caption) caption.textContent = '今日陪伴 · 专注 ' + min + ' 分钟';

    var dateLine = doc.getElementById('focusDateLine');
    if (dateLine) {
      var now = new Date();
      dateLine.textContent = (now.getMonth() + 1) + ' 月 ' + now.getDate() + ' 日 · 周' + D.weekdayCN(today) + ' · 按自己的节奏来';
    }
  }

  function phaseName(phase) {
    return phase === 'focus' ? '专注' : phase === 'short' ? '短休息' : '长休息';
  }

  function updateTitle() {
    if (global.PCTimer && global.PCTimer.running) {
      doc.title = global.PCTimer.formatClock(global.PCTimer.remainingSec()) + ' · ' + phaseName(global.PCTimer.phase) + ' | 计划陪伴';
    } else {
      doc.title = '计划陪伴 · 专注与任务';
    }
  }

  function setStageLine(mood) {
    var el = doc.getElementById('stageLine');
    if (!el) return;
    var lines = {
      idle: '我在这儿，你先挑一件想做的事。',
      focus: '她也在看书，偶尔翻一页。',
      rest: '这一会儿，什么都不用做。',
      done: '刚刚那一段，已经好好收下了。'
    };
    el.textContent = lines[mood] || lines.idle;
  }

  /* ================= 暂停弹窗 ================= */
  function openPauseModal() {
    if (global.PCTimer.isStrict()) {
      toast('严格模式开着，先陪自己把这一段做完');
      return;
    }
    var selected = null;
    var body = '' +
      '<p class="modal-lead">走神是正常的。记下原因，休息一下再回来。</p>' +
      '<div class="reason-grid" id="pauseReasons">' +
      Store.REASONS.map(function (r) {
        return '<button type="button" class="reason-btn" data-reason="' + r.id + '">' +
          '<span class="reason-emoji">' + r.emoji + '</span><span>' + r.name + '</span></button>';
      }).join('') +
      '</div>' +
      '<label class="field"><span>备注（可选）</span>' +
      '<textarea id="pauseNote" rows="2" maxlength="120" placeholder="刚才被什么打断了？"></textarea></label>' +
      '<p class="hint" id="pauseHint">选择原因后会暂停计时，并把这次走神记进统计。</p>';

    modal({
      title: '先停一下',
      body: body,
      actions: [
        { label: '继续专注', kind: 'ghost' },
        {
          label: '记录并暂停',
          kind: 'primary',
          onClick: function (close) {
            if (!selected) {
              var hint = doc.getElementById('pauseHint');
              if (hint) {
                hint.textContent = '先选一个最接近的原因吧。';
                hint.classList.add('is-warn');
              }
              return false;
            }
            var note = doc.getElementById('pauseNote').value.trim();
            global.PCTimer.pause({ reasonId: selected, note: note });
            toast('已记下，先歇一会儿');
            global.PCScene.say('去缓一缓，回来我叫你。', { speak: false });
            close();
          }
        },
        {
          label: '结束本轮',
          kind: 'danger',
          onClick: function (close) {
            if (global.PCTimer.mode === 'up' && global.PCTimer.phase === 'focus') {
              // 正计时：结束即按实际累计时长结算
              global.PCTimer.finish({ manual: true });
              toast('本轮已结束，按实际时长记下了');
            } else {
              global.PCTimer.abort();
              toast('本轮已结束，随时可以重新开始');
            }
            global.PCScene.say('没关系，想开始的时候我都在。', { speak: false });
            close();
          }
        }
      ],
      onMount: function (root) {
        var grid = root.querySelector('#pauseReasons');
        grid.addEventListener('click', function (e) {
          var btn = e.target.closest('[data-reason]');
          if (!btn) return;
          selected = btn.dataset.reason;
          Array.prototype.forEach.call(grid.querySelectorAll('.reason-btn'), function (b) {
            b.classList.toggle('is-active', b === btn);
          });
          var hint = root.querySelector('#pauseHint');
          if (hint) {
            hint.textContent = '选好了，记录原因并暂停。';
            hint.classList.remove('is-warn');
          }
        });
      }
    });
  }

  /* ================= 选择专注任务 ================= */
  function openTaskPicker() {
    var tasks = Store.state.tasks.slice().sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.important !== b.important) return a.important ? -1 : 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    var body = '<p class="modal-lead">选一件接下来想做的事，番茄会累计到它身上。</p>';
    if (!tasks.length) {
      body += '<div class="empty-state small"><span class="empty-mark">🌱</span><p>还没有任务，先去「任务」页新建一件吧。</p></div>';
    } else {
      body += '<div class="picker-list">' + tasks.map(function (t) {
        var cat = Store.getCategory(t.categoryId);
        return '<button class="picker-row' + (Store.state.currentTaskId === t.id ? ' is-active' : '') + '" data-task="' + t.id + '"' + (t.done ? ' disabled' : '') + '>' +
          '<span class="picker-emoji">' + (cat ? cat.emoji : '📌') + '</span>' +
          '<span class="picker-main"><b>' + esc(t.name) + '</b>' +
          '<small>' + (cat ? esc(cat.name) : '未分类') + ' · 🍅 ' + t.completedPomodoros + (t.done ? ' · 已完成' : '') + '</small></span>' +
          '<span class="picker-check">' + (Store.state.currentTaskId === t.id ? '✓' : '') + '</span>' +
          '</button>';
      }).join('') + '</div>';
    }
    var actions = [{ label: '关闭', kind: 'ghost' }];
    if (Store.state.currentTaskId) {
      actions.unshift({
        label: '取消关联',
        kind: 'ghost',
        onClick: function (close) {
          Store.setCurrentTask(null);
          toast('已取消任务关联');
          close();
        }
      });
    }
    modal({
      title: '这一段时间给谁？',
      body: body,
      actions: actions,
      onMount: function (root) {
        root.addEventListener('click', function (e) {
          var row = e.target.closest('[data-task]');
          if (!row || row.disabled) return;
          Store.setCurrentTask(row.dataset.task);
          var task = Store.getTask(row.dataset.task);
          toast('下一段专注：' + (task ? task.name : ''));
          var closeBtn = root.querySelector('.modal-close');
          if (closeBtn) closeBtn.click();
          global.PCScene.say('好，我记下了。', { speak: false });
        });
      }
    });
  }

  /* ================= 计时事件 ================= */
  function handleStart(phase) {
    if (phase === 'focus') {
      global.PCScene.setMood('focus');
      setStageLine('focus');
      requestWakeLock();
      interludeSpoken = false;
      if (Date.now() - lastPhaseCompleteAt > 2600) {
        var line = global.PCScene.line('focusStart');
        global.PCScene.say(line, { speak: true });
      }
    } else {
      global.PCScene.setMood('rest');
      setStageLine('rest');
      releaseWakeLock();
      if (Date.now() - lastPhaseCompleteAt > 2600) {
        global.PCScene.say(global.PCScene.line('breakStart'), { speak: true });
      }
    }
    refreshToday();
  }

  function handleComplete(ev) {
    lastPhaseCompleteAt = Date.now();
    chime(ev.from === 'focus' ? 'focusEnd' : 'breakEnd');
    vibrate();

    var minutes = Math.round((ev.recordedSec || 0) / 60);
    if (ev.from === 'focus') {
      if (ev.recorded) {
        toast((ev.restored ? '离开时这一段已完成，已补记 · ' : '完成一段专注 · ') + minutes + ' 分钟');
      } else {
        toast('这一段不到 1 分钟，先不记账');
      }
      var line = ev.to === 'long' ? global.PCScene.line('longBreak') : global.PCScene.line('focusDone');
      global.PCScene.setMood(ev.to === 'long' ? 'rest' : 'rest');
      setStageLine('rest');
      global.PCScene.say(line, { speak: doc.visibilityState === 'visible' });
    } else {
      toast('休息结束，准备好就开始');
      global.PCScene.setMood('done');
      setStageLine('done');
      global.PCScene.say(global.PCScene.line('breakDone'), { speak: doc.visibilityState === 'visible' });
    }

    if (ev.to !== 'focus') releaseWakeLock();
    refreshToday();
    if (global.PCStats) global.PCStats.renderAll();
  }

  function maybeInterlude() {
    if (interludeSpoken) return;
    if (!global.PCTimer.running || global.PCTimer.phase !== 'focus') return;
    if (global.PCTimer.duration < 20 * 60000) return;
    if (global.PCTimer.elapsedMs() < 15 * 60000) return;
    interludeSpoken = true;
    if (!Store.getSettings().voice) return;
    var text = '过了好一会儿了，要不要喝口水？';
    global.PCScene.say(text, { speak: true });
  }

  function bindTimerEvents() {
    global.PCTimer.on(function (ev) {
      switch (ev.type) {
        case 'tick':
          updateTitle();
          maybeInterlude();
          break;
        case 'start':
          handleStart(ev.phase);
          if (global.PCMusic) global.PCMusic.start();
          break;
        case 'resume':
          if (global.PCMusic) global.PCMusic.start();
          if (ev.phase === 'focus') {
            global.PCScene.setMood('focus');
            setStageLine('focus');
            requestWakeLock();
          } else {
            global.PCScene.setMood('rest');
            setStageLine('rest');
          }
          break;
        case 'pause':
          releaseWakeLock();
          global.PCScene.setMood('idle');
          setStageLine('idle');
          break;
        case 'phaseComplete':
          handleComplete(ev);
          if (global.PCMusic) global.PCMusic.dip();
          break;
        case 'phaseSwitch':
          if (global.PCMusic) global.PCMusic.dip();
          break;
        case 'blocked':
        case 'notice':
          toast(ev.message);
          break;
        case 'pauseRequest':
          openPauseModal();
          break;
        case 'taskChipClick':
          openTaskPicker();
          break;
        case 'abort':
          releaseWakeLock();
          global.PCScene.setMood('idle');
          setStageLine('idle');
          break;
        case 'reset':
        case 'skip':
          releaseWakeLock();
          global.PCScene.setMood(global.PCTimer.phase === 'focus' ? 'idle' : 'rest');
          break;
      }
    });
  }

  /* ================= PWA 安装 ================= */
  var deferredPrompt = null;
  var installBanner = null;

  function isStandalone() {
    if (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) return true;
    return !!global.navigator.standalone;
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isAndroid() {
    return /android/i.test(navigator.userAgent);
  }

  function guideHtml() {
    if (isStandalone()) {
      return '<p class="modal-lead">你现在就是以安装后的方式打开的。专注时屏幕会尽量保持常亮。</p>';
    }
    var steps;
    if (isIOS()) {
      steps = '<ol class="guide-list">' +
        '<li>用 Safari 打开本站（必须是 HTTPS 地址）。</li>' +
        '<li>点击底部的「分享」按钮。</li>' +
        '<li>选择「添加到主屏幕」，确认添加。</li>' +
        '<li>从桌面图标打开，就会全屏运行。</li></ol>';
    } else if (isAndroid()) {
      steps = '<ol class="guide-list">' +
        '<li>用安卓版 Edge、Chrome 或三星浏览器打开本站（必须是 HTTPS 地址）。</li>' +
        '<li>点右上角「⋮」菜单（三星浏览器在底部菜单）。</li>' +
        '<li>选择「安装应用」或「添加到主屏幕」。</li>' +
        '<li>从桌面图标打开，就会全屏运行。</li></ol>' +
        '<p class="hint">夸克等浏览器通常只能创建网页快捷方式，不会真正以独立窗口安装。若没有安装选项，请复制链接，用 Edge 手机版打开后再安装。</p>';
    } else {
      steps = '<ol class="guide-list">' +
        '<li>用 Edge 或 Chrome 打开本站（必须是 HTTPS 地址）。</li>' +
        '<li>点地址栏右侧的安装图标，或在菜单中选择「安装此站点」。</li>' +
        '<li>安装后从桌面或开始菜单打开，即可独立全屏运行。</li></ol>';
    }
    return '<p class="modal-lead">安装到桌面后，可以像 App 一样全屏打开，并把页面资源缓存到本机，断网也能用。</p>' + steps +
      '<p class="hint">注意：浏览器要求通过 HTTPS（或 localhost）访问，直接双击本地文件无法启用安装与离线缓存。</p>';
  }

  function markInstallHinted() {
    Store.updateSettings({ installHinted: true });
  }

  function hideInstallBanner() {
    if (!installBanner) return;
    installBanner.classList.remove('is-show');
    doc.body.classList.remove('has-install-banner');
    setTimeout(function () {
      if (installBanner && installBanner.parentNode) installBanner.parentNode.removeChild(installBanner);
      installBanner = null;
    }, 300);
  }

  function showInstallBanner() {
    if (installBanner) return;
    installBanner = doc.createElement('div');
    installBanner.className = 'install-banner';
    installBanner.innerHTML = '' +
      '<div class="install-mark" aria-hidden="true">' +
        '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" fill="none" stroke="currentColor" stroke-width="2.4" opacity=".7"/>' +
        '<path d="M20 11c6 3.2 8.4 7.2 8.4 10.6C24 25 20 23.6 20 29c0-5.4-4-4-8.4-7.4C11.6 18.2 14 14.2 20 11z" fill="currentColor" opacity=".9"/></svg>' +
      '</div>' +
      '<div class="install-copy"><strong>把「计划陪伴」放到桌面</strong><span>全屏打开，离线也能用</span></div>' +
      '<button class="btn primary small" id="installNow">安装</button>' +
      '<button class="install-dismiss" aria-label="不再提示">✕</button>';
    doc.body.appendChild(installBanner);
    doc.body.classList.add('has-install-banner');
    requestAnimationFrame(function () { installBanner.classList.add('is-show'); });

    installBanner.querySelector('#installNow').addEventListener('click', function () {
      if (deferredPrompt) {
        promptInstall();
      } else {
        showInstallGuide();
      }
    });
    installBanner.querySelector('.install-dismiss').addEventListener('click', function () {
      markInstallHinted();
      hideInstallBanner();
    });
  }

  function promptInstall() {
    if (!deferredPrompt) {
      showInstallGuide();
      return;
    }
    var promptEvent = deferredPrompt;
    deferredPrompt = null;
    promptEvent.prompt();
    promptEvent.userChoice.then(function (choice) {
      if (choice && choice.outcome === 'accepted') {
        markInstallHinted();
        toast('正在添加到桌面…');
      } else {
        markInstallHinted();
      }
      hideInstallBanner();
    }).catch(function () { /* 忽略 */ });
  }

  function showInstallGuide() {
    var actions = [{ label: '知道了', kind: 'ghost' }];
    if (deferredPrompt && !isStandalone()) {
      actions = [{
        label: '立即安装',
        kind: 'primary',
        onClick: function (close) {
          close();
          setTimeout(promptInstall, 120);
        }
      }].concat(actions);
    }
    modal({ title: '添加到主屏幕', body: guideHtml(), actions: actions });
  }

  global.PCInstall = {
    showGuide: function () { showInstallGuide(); },
    prompt: promptInstall,
    isStandalone: isStandalone
  };

  global.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
  });

  global.addEventListener('appinstalled', function () {
    markInstallHinted();
    hideInstallBanner();
    toast('已添加到桌面');
  });

  function maybeShowInstallBanner() {
    if (isStandalone()) return;
    if (Store.getSettings().installHinted) return;
    setTimeout(function () {
      if (isStandalone() || Store.getSettings().installHinted) return;
      showInstallBanner();
    }, 4200);
  }

  /* ================= Service Worker ================= */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;

    var refreshing = false;
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) return;
      // 首次安装时 clients.claim() 也会触发一次，不必刷新页面
      if (!hadController) { hadController = true; return; }
      refreshing = true;
      location.reload();
    });

    global.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').then(function (reg) {
        if (reg.waiting && navigator.serviceWorker.controller) {
          offerUpdate(reg);
        }
        reg.addEventListener('updatefound', function () {
          var worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', function () {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              offerUpdate(reg);
            }
          });
        });
      }).catch(function (err) {
        console.warn('[PWA] Service Worker 注册失败：', err);
      });
    });
  }

  function offerUpdate(reg) {
    toast('有新版本可用', {
      duration: 12000,
      action: {
        label: '刷新',
        onClick: function () {
          if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          else location.reload();
        }
      }
    });
  }

  /* ================= 导航 / 快捷键 ================= */
  function switchView(name) {
    var views = doc.querySelectorAll('.view');
    Array.prototype.forEach.call(views, function (v) {
      v.classList.toggle('is-active', v.id === 'view-' + name);
    });
    var buttons = doc.querySelectorAll('.nav-btn');
    Array.prototype.forEach.call(buttons, function (b) {
      var active = b.dataset.view === name;
      b.classList.toggle('is-active', active);
      if (active) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });

    if (name === 'tasks' && global.PCTasks) global.PCTasks.render();
    if (name === 'stats' && global.PCStats) global.PCStats.renderStats();
    if (name === 'records' && global.PCStats) global.PCStats.renderRecords();
    if (name === 'settings' && global.PCSettings) global.PCSettings.render();

    // 离开陪伴页时暂停视频省电
    if (global.PCScene && global.PCScene.setVisible) global.PCScene.setVisible(name === 'focus');

    global.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function bindNav() {
    var buttons = doc.querySelectorAll('.nav-btn');
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.addEventListener('click', function () { switchView(btn.dataset.view); });
    });
    var pill = doc.getElementById('todayPill');
    if (pill) pill.addEventListener('click', function () { switchView('stats'); });
  }

  function bindKeyboard() {
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (modalStack.length) {
          modalStack[modalStack.length - 1].close();
          e.preventDefault();
        } else if (global.PCScene) {
          global.PCScene.hideBubble();
        }
        return;
      }
      if (e.code !== 'Space' && e.key !== ' ') return;
      var target = e.target;
      var tag = target && target.tagName ? target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (target && target.isContentEditable)) return;
      if (modalStack.length) return;
      e.preventDefault();
      if (global.PCTimer.running) {
        if (global.PCTimer.isStrict()) toast('严格模式下不能暂停，先做完这一段');
        else openPauseModal();
      } else if (global.PCTimer.base > 0) {
        global.PCTimer.resume();
      } else {
        global.PCTimer.start();
      }
    });
  }

  /* ================= 背景音乐按钮 ================= */
  function syncMusicButton() {
    var btn = doc.getElementById('musicToggle');
    if (!btn || !global.PCMusic) return;
    var st = global.PCMusic.state();
    btn.classList.toggle('is-off', !st.enabled);
    btn.classList.toggle('is-pending', st.enabled && !st.playing);
    btn.setAttribute('aria-pressed', st.enabled ? 'true' : 'false');
    btn.setAttribute('aria-label', st.enabled ? '背景音乐：开' : '背景音乐：关');
    btn.title = st.unavailable ? '背景音乐：需要联网加载一次'
      : (st.enabled ? '背景音乐：开（点一下静音）' : '背景音乐：关（点一下打开）');
  }

  function bindMusic() {
    if (!global.PCMusic) return;
    var btn = doc.getElementById('musicToggle');
    if (btn) {
      btn.addEventListener('click', function () {
        if (global.PCMusic.state().unavailable) {
          toast('这段音乐还没缓存，需要联网加载一次');
          return;
        }
        var on = global.PCMusic.toggle();
        if (on && global.PCMusic.state().blocked) {
          toast('浏览器拦住了播放，再点一下小喇叭试试');
        }
      });
    }
    doc.addEventListener('pc:music', syncMusicButton);
    syncMusicButton();
  }

  /* ================= 启动 ================= */
  function checkDayChange() {
    var today = D.todayStr();
    if (today !== lastDayChecked) {
      lastDayChecked = today;
      Store.resetLoopTasks();
      if (global.PCStats) global.PCStats.renderAll();
      refreshToday();
    }
  }

  function init() {
    Store.init();
    applyTheme();
    Store.resetLoopTasks();

    global.PCScene.init();
    global.PCMusic.init();
    bindMusic();
    global.PCTasks.bind();
    global.PCStats.bind();
    global.PCSettings.bind();
    bindNav();
    bindKeyboard();
    bindTimerEvents();

    global.PCTimer.bind();

    var overdue = global.PCTimer.afterRestore();
    if (!overdue && global.PCTimer.base > 0) {
      setTimeout(function () { toast('已恢复上次的计时进度'); }, 900);
    }

    refreshToday();
    global.PCTasks.render();
    global.PCStats.renderAll();
    global.PCSettings.render();
    updateTitle();

    if (global.PCTimer.running) {
      handleStart(global.PCTimer.phase);
    } else if (global.PCTimer.phase === 'focus' && global.PCTimer.base === 0) {
      global.PCScene.setMood('idle');
      setStageLine('idle');
    } else {
      global.PCScene.setMood(global.PCTimer.phase === 'focus' ? 'idle' : 'rest');
    }

    if (!Store.isStorageOK()) {
      toast('浏览器禁用了本地存储，刷新后数据会丢失', { duration: 6000 });
    }

    if (location.protocol === 'file:') {
      setTimeout(function () {
        toast('本地文件模式：功能可用；安装到桌面与离线缓存需通过 HTTP/HTTPS 访问', { duration: 6500 });
      }, 1800);
    }

    doc.addEventListener('pc:state', function () {
      refreshToday();
      if (global.PCTimer.running) {
        if (global.PCTimer.phase === 'focus') requestWakeLock();
        else releaseWakeLock();
      }
    });

    doc.addEventListener('visibilitychange', function () {
      if (doc.visibilityState === 'visible') {
        checkDayChange();
        if (global.PCTimer.running) {
          global.PCTimer.checkOverdue();
          if (global.PCTimer.phase === 'focus') requestWakeLock();
        }
        updateTitle();
      } else {
        global.PCTimer.persist();
      }
    });

    global.addEventListener('pagehide', function () { global.PCTimer.persist(); });

    setInterval(function () {
      checkDayChange();
      if (global.PCTimer.running) updateTitle();
    }, 30000);

    registerSW();
    maybeShowInstallBanner();
  }

  global.PCUI = {
    toast: toast,
    modal: modal,
    confirm: confirm,
    switchView: switchView,
    openPauseModal: openPauseModal,
    openTaskPicker: openTaskPicker,
    applyTheme: applyTheme,
    fmtDuration: function (sec) {
      sec = Math.round(sec || 0);
      if (sec < 60) return '不到 1 分钟';
      var m = Math.round(sec / 60);
      if (m < 60) return m + ' 分钟';
      var h = Math.floor(m / 60);
      var rest = m % 60;
      return h + ' 小时' + (rest ? ' ' + rest + ' 分' : '');
    }
  };

  init();
})(window);
