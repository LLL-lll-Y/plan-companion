/* 计划陪伴 · 计时引擎
 * 用时间戳计算真实经过时间，切后台/锁屏不会漂移。
 */
(function (global) {
  'use strict';

  var Store = global.PCStore;
  var CIRC = 2 * Math.PI * 104;

  // 三种时长各自独立，范围和设置页保持一致
  var PHASE_META = {
    focus: { key: 'focus', label: '专注时长', min: 1, max: 180 },
    short: { key: 'short', label: '短休息时长', min: 1, max: 60 },
    long: { key: 'long', label: '长休息时长', min: 1, max: 120 }
  };

  var T = {
    phase: 'focus',
    running: false,
    mode: 'down',
    anchor: 0,
    base: 0,
    duration: 25 * 60000,
    completed: 0,
    sessionStart: 0,
    sessionTaskId: null,
    pauseStart: 0,
    pauseRecordId: null,
    overdueOnRestore: false,
    finishing: false,
    listeners: [],
    els: {},
    raf: null,
    lastSecond: -1,
    lastPersistSec: -1
  };

  function settings() {
    return Store.getSettings();
  }

  function durationFor(phase) {
    var s = settings();
    if (phase === 'short') return s.short * 60000;
    if (phase === 'long') return s.long * 60000;
    return s.focus * 60000;
  }

  // 空闲时表盘永远以当前设置为准，避免快照里的旧时长被带回来
  function syncDuration() {
    if (!T.running && T.base === 0) T.duration = durationFor(T.phase);
  }

  function isBusy() {
    return T.running || T.base > 0;
  }

  // 正计时只作用于专注阶段；休息仍按各自的时长倒计时
  function isUpMode() {
    return T.mode === 'up' && T.phase === 'focus';
  }

  function isStrict() {
    return !!settings().strict;
  }

  function emit(type, extra) {
    var payload = Object.assign({ type: type, timer: T }, extra || {});
    T.listeners.forEach(function (fn) {
      try { fn(payload); } catch (e) { console.error('[Timer] 监听器出错', e); }
    });
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function formatClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    if (h > 0) return h + ':' + pad(m) + ':' + pad(s);
    return pad(m) + ':' + pad(s);
  }

  function elapsedMs() {
    return T.base + (T.running ? Date.now() - T.anchor : 0);
  }

  function persist() {
    Store.setTimer({
      phase: T.phase,
      running: T.running,
      mode: T.mode,
      anchor: T.anchor,
      base: T.base,
      duration: T.duration,
      completed: T.completed,
      sessionStart: T.sessionStart,
      sessionTaskId: T.sessionTaskId,
      pauseStart: T.pauseStart,
      pauseRecordId: T.pauseRecordId
    });
  }

  /* ---------- 渲染 ---------- */
  function render() {
    var els = T.els;
    if (!els.time) return;

    var up = isUpMode();
    var elapsed = elapsedMs();
    var remain = Math.max(0, T.duration - elapsed);
    var display = up ? elapsed : remain;
    // 正计时没有上限，圆环按“每小时一圈”循环，不拿专注时长当分母
    var progress = up
      ? (elapsed % 3600000) / 3600000
      : Math.min(1, T.duration > 0 ? elapsed / T.duration : 0);

    els.time.textContent = formatClock(display / 1000);
    els.panel.dataset.phase = T.phase;
    els.panel.dataset.mode = T.mode;

    var phaseName = T.phase === 'focus' ? '专注时间' : T.phase === 'short' ? '短休息' : '长休息';
    els.phaseLabel.textContent = phaseName;
    els.modeLabel.textContent = up ? '正计时 · 无上限' : '倒计时';

    // 正计时不显示剩余时间，也不拿专注时长当目标
    els.goal.hidden = true;
    els.goal.textContent = '';

    var off = CIRC * (1 - progress);
    els.ring.setAttribute('stroke-dasharray', CIRC.toFixed(2));
    els.ring.setAttribute('stroke-dashoffset', off.toFixed(2));

    // 番茄进度点
    var every = settings().longEvery;
    var filled = T.completed % every;
    if (T.completed > 0 && filled === 0 && T.phase === 'long') filled = every;
    var dotsHtml = '';
    for (var i = 0; i < every; i++) {
      dotsHtml += '<span class="dot' + (i < filled ? ' is-on' : '') + '"></span>';
    }
    els.dots.innerHTML = dotsHtml;
    if (T.phase === 'long') {
      els.cycleText.textContent = '长休息中 · 好好放松';
    } else {
      var left = every - filled;
      els.cycleText.textContent = '本轮 ' + filled + '/' + every + ' · 距长休息还差 ' + left + ' 个';
    }

    // 按钮
    var primary = els.primary;
    if (T.running) {
      primary.textContent = '暂停';
      primary.disabled = isStrict();
      primary.title = isStrict() ? '严格模式下不能暂停' : '暂停';
      primary.classList.add('is-running');
    } else {
      primary.disabled = false;
      primary.classList.remove('is-running');
      primary.textContent = T.base > 0 ? '继续' : (T.phase === 'focus' ? '开始专注' : '开始休息');
      primary.title = '';
    }

    els.reset.disabled = isStrict();
    // 正计时下这个按钮是「结束本轮」，严格模式也允许（否则永远停不下来）
    els.skip.disabled = isStrict() && !up;
    els.skip.textContent = up ? '⏹' : '⏭';
    els.skip.title = up ? '结束本轮并记录时长' : '跳过本阶段';
    els.skip.setAttribute('aria-label', els.skip.title);
    els.strictBadge.hidden = !isStrict();
    els.panel.classList.toggle('is-strict', isStrict());
    if (els.hint) {
      els.hint.textContent = up
        ? '正计时：从 0 往上累计，点 ⏹ 结束并记录本轮'
        : '空格键开始 / 暂停 · Esc 关闭弹窗';
    }

    Array.prototype.forEach.call(els.phaseBtns, function (btn) {
      var active = btn.getAttribute('data-phase') === T.phase;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.disabled = T.running;
    });

    // 时长编辑器跟着当前阶段走：专注 / 短休息 / 长休息各改各的
    var meta = PHASE_META[T.phase];
    var minutes = Math.round(T.duration / 60000);
    var locked = isBusy();
    if (els.range) {
      if (document.activeElement !== els.range) {
        els.range.min = meta.min;
        els.range.max = meta.max;
        els.range.value = minutes;
      }
      els.range.disabled = locked;
      els.range.setAttribute('aria-label', meta.label + '（分钟）');
      els.rangeOut.textContent = minutes + ' 分钟';
      els.durationLabel.textContent = meta.label;
      els.durationSummary.textContent = minutes + ' 分钟';
      Array.prototype.forEach.call(els.presets, function (b) {
        b.classList.toggle('is-active', Number(b.dataset.min) === minutes);
      });
      if (els.durationHint) {
        els.durationHint.textContent = locked
          ? (isStrict()
              ? '严格模式下不能改本段时长，先结束这一段再调。'
              : '这一段正在进行：先结束或重置本段，新时长会从下一段开始生效。')
          : '改动会立即显示在表盘上，并从下一次开始生效。';
        els.durationHint.classList.toggle('is-warn', locked);
      }
    }

    Array.prototype.forEach.call(els.modeBtns, function (b) {
      b.classList.toggle('is-active', b.dataset.mode === T.mode);
      b.setAttribute('aria-disabled', isBusy() ? 'true' : 'false');
    });

    renderTaskChip();
  }

  function renderTaskChip() {
    if (!T.els.taskChip) return;
    var task = Store.getTask(Store.state.currentTaskId);
    if (task) {
      T.els.taskChip.innerHTML = '<span class="chip-dot"></span>当前专注：<b>' + escapeHtml(task.name) + '</b>' +
        '<span class="chip-pomo">🍅 ' + task.completedPomodoros + '</span>';
      T.els.taskChip.classList.add('has-task');
    } else {
      T.els.taskChip.innerHTML = '<span class="chip-empty">还没有选择任务</span><span class="chip-link">点这里挑一个</span>';
      T.els.taskChip.classList.remove('has-task');
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- 状态操作 ---------- */
  function start() {
    if (T.running) return;
    if (T.base === 0) {
      // 每次开始都按当前设置重算，避免用旧快照/默认 25 分钟
      T.duration = durationFor(T.phase);
      T.sessionStart = Date.now();
      T.sessionTaskId = Store.state.currentTaskId;
    } else if (!T.sessionStart) {
      T.sessionStart = Date.now() - T.base;
      T.sessionTaskId = Store.state.currentTaskId;
    }
    T.anchor = Date.now();
    T.running = true;
    T.pauseStart = 0;
    T.lastSecond = -1;
    T.lastPersistSec = -1;
    persist();
    render();
    emit('start', { phase: T.phase });
  }

  function pause(info) {
    if (!T.running) return;
    T.base = elapsedMs();
    T.anchor = 0;
    T.running = false;
    T.pauseStart = Date.now();
    if (info && info.reasonId) {
      var rec = Store.addDistraction({
        reasonId: info.reasonId,
        note: info.note,
        phase: T.phase,
        lostSec: 0
      });
      T.pauseRecordId = rec.id;
    }
    persist();
    render();
    emit('pause', { phase: T.phase });
  }

  function resume() {
    if (T.running) return;
    if (T.pauseRecordId && T.pauseStart) {
      Store.updateDistraction(T.pauseRecordId, {
        lostSec: Math.max(0, Math.round((Date.now() - T.pauseStart) / 1000))
      });
      T.pauseRecordId = null;
    }
    T.pauseStart = 0;
    T.anchor = Date.now();
    T.running = true;
    T.lastSecond = -1;
    persist();
    render();
    emit('resume', { phase: T.phase });
  }

  function reset() {
    if (isStrict()) {
      emit('blocked', { message: '严格模式下不能重置' });
      return;
    }
    T.base = 0;
    T.anchor = 0;
    T.running = false;
    T.sessionStart = 0;
    T.sessionTaskId = null;
    T.pauseStart = 0;
    T.pauseRecordId = null;
    T.duration = durationFor(T.phase);
    T.lastSecond = -1;
    persist();
    render();
    emit('reset', { phase: T.phase });
  }

  function skip() {
    if (isStrict()) {
      emit('blocked', { message: '严格模式下不能跳过' });
      return;
    }
    var from = T.phase;
    T.running = false;
    T.base = 0;
    T.anchor = 0;
    T.sessionStart = 0;
    T.sessionTaskId = null;
    T.pauseStart = 0;
    T.pauseRecordId = null;
    if (from === 'long') T.completed = 0;
    T.phase = from === 'focus' ? 'short' : 'focus';
    T.duration = durationFor(T.phase);
    T.lastSecond = -1;
    persist();
    render();
    emit('skip', { from: from, phase: T.phase });
  }

  // 暂停弹窗里选择「直接结束本轮」
  function abort() {
    T.running = false;
    T.base = 0;
    T.anchor = 0;
    T.sessionStart = 0;
    T.sessionTaskId = null;
    T.pauseStart = 0;
    T.pauseRecordId = null;
    T.phase = 'focus';
    T.duration = durationFor('focus');
    T.lastSecond = -1;
    persist();
    render();
    emit('abort', {});
  }

  function setPhase(phase) {
    if (T.running) return;
    if (['focus', 'short', 'long'].indexOf(phase) < 0) return;
    T.phase = phase;
    T.base = 0;
    T.anchor = 0;
    T.sessionStart = 0;
    T.sessionTaskId = null;
    T.pauseStart = 0;
    T.pauseRecordId = null;
    T.duration = durationFor(phase);
    T.lastSecond = -1;
    persist();
    render();
    emit('phaseSwitch', { phase: phase });
  }

  function setMode(mode) {
    if (mode !== 'down' && mode !== 'up') return false;
    if (isBusy()) {
      emit('blocked', { message: T.running ? '计时进行中，先结束或重置本段再切换计时方式' : '这一段暂停中，先结束或重置本段再切换计时方式' });
      return false;
    }
    T.mode = mode;
    Store.updateSettings({ mode: mode });
    persist();
    render();
    return true;
  }

  // 按阶段改时长：focus / short / long 互不影响
  function setPhaseMinutes(phase, min) {
    var meta = PHASE_META[phase];
    if (!meta) return false;
    min = Math.min(meta.max, Math.max(meta.min, Math.round(Number(min) || meta.min)));

    if (isBusy()) {
      emit('blocked', {
        message: isStrict()
          ? '严格模式下不能改本段时长，先结束这一段再调'
          : '这一段正在进行：先结束或重置本段，新时长会从下一段开始生效'
      });
      return false;
    }

    var patch = {};
    patch[meta.key] = min;
    Store.updateSettings(patch);
    // 本轮没开始时立刻反映到表盘；进行中的本轮保持原时长
    if (!isBusy() && T.phase === phase) T.duration = min * 60000;
    persist();
    render();
    return true;
  }

  /* ---------- 阶段完成 ---------- */
  function finish(opts) {
    if (T.finishing) return;
    T.finishing = true;
    opts = opts || {};

    var elapsedSec = Math.round(elapsedMs() / 1000);
    var finishedPhase = T.phase;
    var recorded = false;
    var recordedSec = 0;

    if (finishedPhase === 'focus') {
      // 正计时按实际累计时长入库，不受专注时长设置截断
      var realSec = isUpMode() ? elapsedSec : Math.min(elapsedSec, Math.round(T.duration / 1000));
      if (realSec >= 60) {
        Store.addRecord({
          durationSec: realSec,
          startTs: T.sessionStart || (Date.now() - realSec * 1000),
          taskId: T.sessionTaskId
        });
        recorded = true;
        recordedSec = realSec;
        T.completed += 1;
      }
    }

    var next;
    if (finishedPhase === 'focus') {
      next = (recorded && T.completed % settings().longEvery === 0) ? 'long' : 'short';
    } else {
      if (finishedPhase === 'long') T.completed = 0;
      next = 'focus';
    }

    T.phase = next;
    T.base = 0;
    T.anchor = 0;
    T.running = false;
    T.sessionStart = 0;
    T.sessionTaskId = null;
    T.pauseStart = 0;
    T.pauseRecordId = null;
    T.duration = durationFor(next);
    T.lastSecond = -1;
    T.lastPersistSec = -1;
    persist();
    render();

    emit('phaseComplete', {
      from: finishedPhase,
      to: next,
      recorded: recorded,
      recordedSec: recordedSec,
      elapsedSec: elapsedSec,
      overdue: !!opts.overdue,
      restored: !!opts.restored
    });

    var s = settings();
    var autoStart = next === 'focus' ? s.autoStartFocus : s.autoStartBreak;
    if (autoStart && !opts.restored && !opts.noAuto) {
      setTimeout(function () {
        if (!T.running) start();
      }, 900);
    }

    T.finishing = false;
  }

  function checkOverdue() {
    if (isUpMode()) return; // 正计时没有终点，不会被判超时
    if (T.running && elapsedMs() >= T.duration) {
      finish({ overdue: true });
    }
  }

  /* ---------- 恢复快照 ---------- */
  function restore() {
    var snap = Store.getTimer();
    T.mode = settings().mode || 'down';
    if (!snap || !snap.duration) {
      T.duration = durationFor('focus');
      return;
    }
    T.phase = ['focus', 'short', 'long'].indexOf(snap.phase) >= 0 ? snap.phase : 'focus';
    T.mode = snap.mode || T.mode;
    T.completed = Number(snap.completed) || 0;
    T.duration = Number(snap.duration) || durationFor(T.phase);
    T.sessionStart = Number(snap.sessionStart) || 0;
    T.sessionTaskId = snap.sessionTaskId || null;
    T.base = Number(snap.base) || 0;
    T.anchor = Number(snap.anchor) || 0;
    T.running = !!snap.running;
    T.pauseStart = Number(snap.pauseStart) || 0;
    T.pauseRecordId = snap.pauseRecordId || null;

    if (T.running) {
      T.base = elapsedMs();
      T.anchor = 0;
      T.running = false;
      // 正计时恢复后不判超时，等用户自己点结束
      T.overdueOnRestore = !isUpMode() && T.base >= T.duration;
    } else if (T.sessionStart && !T.pauseStart && T.base > 0) {
      // 关页面时正在暂停，保持暂停状态
    }
    if (T.base > 0 && !T.sessionStart) {
      T.sessionStart = Date.now() - T.base;
    }

    // 空闲快照不能把旧时长带回来：一律以当前设置为准
    if (T.base === 0) T.duration = durationFor(T.phase);
  }

  function afterRestore() {
    if (T.overdueOnRestore) {
      T.overdueOnRestore = false;
      finish({ restored: true, noAuto: true });
      return true;
    }
    return false;
  }

  /* ---------- 主循环 ---------- */
  function loop() {
    T.raf = requestAnimationFrame(loop);
    if (!T.running) return;
    var e = elapsedMs();
    if (!isUpMode() && e >= T.duration) {
      finish({});
      return;
    }
    var sec = Math.floor(e / 1000);
    if (sec !== T.lastSecond) {
      T.lastSecond = sec;
      render();
      emit('tick', { elapsedMs: e });
      if (sec > 0 && sec % 10 === 0 && sec !== T.lastPersistSec) {
        T.lastPersistSec = sec;
        persist();
      }
    }
  }

  /* ---------- 绑定 ---------- */
  function bind() {
    var d = global.document;
    T.els = {
      panel: d.getElementById('timerPanel'),
      time: d.getElementById('timerTime'),
      phaseLabel: d.getElementById('timerPhaseLabel'),
      modeLabel: d.getElementById('timerModeLabel'),
      goal: d.getElementById('timerGoal'),
      ring: d.getElementById('ringProgress'),
      dots: d.getElementById('cycleDots'),
      cycleText: d.getElementById('cycleText'),
      primary: d.getElementById('btnPrimary'),
      reset: d.getElementById('btnReset'),
      skip: d.getElementById('btnSkip'),
      taskChip: d.getElementById('taskChip'),
      strictBadge: d.getElementById('strictBadge'),
      phaseBtns: d.querySelectorAll('#timerPanel .phase-btn'),
      hint: d.getElementById('timerHint'),
      range: d.getElementById('durationRange'),
      rangeOut: d.getElementById('durationRangeOut'),
      presets: d.querySelectorAll('#presetRow .preset'),
      modeBtns: d.querySelectorAll('#modeSwitch button'),
      durationLabel: d.getElementById('durationLabel'),
      durationSummary: d.getElementById('durationSummary'),
      durationHint: d.getElementById('durationHint')
    };
    if (!T.els.panel) return;

    T.els.primary.addEventListener('click', function () {
      if (T.running) {
        if (isStrict()) {
          emit('blocked', { message: '严格模式下不能暂停，先把手边这一段做完' });
          return;
        }
        emit('pauseRequest', {});
      } else if (T.base > 0) {
        resume();
      } else {
        start();
      }
    });

    T.els.reset.addEventListener('click', function () {
      reset();
      emit('notice', { message: '已重置本阶段' });
    });
    T.els.skip.addEventListener('click', function () {
      if (isUpMode()) {
        if (!isBusy()) {
          emit('notice', { message: '还没开始，先点「开始专注」' });
          return;
        }
        finish({ manual: true });
        return;
      }
      skip();
      emit('notice', { message: '已跳过本阶段' });
    });

    Array.prototype.forEach.call(T.els.phaseBtns, function (btn) {
      btn.addEventListener('click', function () {
        if (T.running) return;
        setPhase(btn.getAttribute('data-phase'));
      });
    });

    if (T.els.range) {
      T.els.range.addEventListener('input', function () {
        T.els.rangeOut.textContent = T.els.range.value + ' 分钟';
      });
      T.els.range.addEventListener('change', function () {
        var phase = T.phase;
        if (!setPhaseMinutes(phase, T.els.range.value)) {
          // 被拦下时把滑杆拨回当前值
          T.els.range.value = Math.round(T.duration / 60000);
          T.els.rangeOut.textContent = T.els.range.value + ' 分钟';
          return;
        }
        emit('notice', { message: PHASE_META[phase].label + '已设为 ' + settings()[PHASE_META[phase].key] + ' 分钟' });
      });
    }

    Array.prototype.forEach.call(T.els.presets, function (btn) {
      btn.addEventListener('click', function () {
        var phase = T.phase;
        if (!setPhaseMinutes(phase, btn.dataset.min)) return;
        emit('notice', { message: PHASE_META[phase].label + '已设为 ' + settings()[PHASE_META[phase].key] + ' 分钟' });
      });
    });

    Array.prototype.forEach.call(T.els.modeBtns, function (btn) {
      btn.addEventListener('click', function () {
        setMode(btn.dataset.mode);
      });
    });

    T.els.taskChip.addEventListener('click', function () {
      emit('taskChipClick', {});
    });

    d.addEventListener('pc:state', function () {
      renderTaskChip();
      // 空闲时始终跟随最新设置；进行中的本轮保持原时长，下一段自然取新值
      if (!T.running && T.base === 0) {
        T.mode = settings().mode || T.mode;
        syncDuration();
      }
      render();
    });

    d.addEventListener('visibilitychange', function () {
      if (d.visibilityState === 'visible') checkOverdue();
    });
    global.addEventListener('focus', checkOverdue);
    global.addEventListener('pageshow', checkOverdue);

    restore();
    render();
    if (!T.raf) T.raf = requestAnimationFrame(loop);
  }

  global.PCTimer = {
    bind: bind,
    start: start,
    pause: pause,
    resume: resume,
    reset: reset,
    skip: skip,
    abort: abort,
    finish: finish,
    setPhase: setPhase,
    setMode: setMode,
    setPhaseMinutes: setPhaseMinutes,
    checkOverdue: checkOverdue,
    afterRestore: afterRestore,
    persist: persist,
    render: render,
    formatClock: formatClock,
    on: function (fn) {
      T.listeners.push(fn);
      return function () {
        T.listeners = T.listeners.filter(function (f) { return f !== fn; });
      };
    },
    isStrict: isStrict,
    get phase() { return T.phase; },
    get mode() { return T.mode; },
    get running() { return T.running; },
    get duration() { return T.duration; },
    get base() { return T.base; },
    get completed() { return T.completed; },
    elapsedMs: elapsedMs,
    remainingSec: function () {
      var ms = elapsedMs();
      // 正计时没有剩余时间，标题栏显示已累计
      return isUpMode() ? Math.round(ms / 1000) : Math.max(0, Math.round((T.duration - ms) / 1000));
    }
  };
})(window);
