/* 计划陪伴 · 数据层
 * 所有数据只保存在本机 localStorage，单键存储，方便整体备份/清空。
 */
(function (global) {
  'use strict';

  var KEY = 'plan-companion.v1';
  var storageOK = true;

  /* ---------- 固定文案数据 ---------- */
  var REASONS = [
    { id: 'water', name: '喝水', emoji: '🥤' },
    { id: 'phone', name: '刷手机', emoji: '📱' },
    { id: 'interrupt', name: '被打扰', emoji: '🔔' },
    { id: 'sleepy', name: '犯困', emoji: '😴' },
    { id: 'mood', name: '情绪', emoji: '🌧️' },
    { id: 'search', name: '找东西', emoji: '🔍' },
    { id: 'chat', name: '聊天', emoji: '💬' },
    { id: 'other', name: '其他', emoji: '📝' }
  ];

  var DEFAULT_CATEGORIES = [
    { id: 'c_study', name: '学习', emoji: '📚' },
    { id: 'c_work', name: '工作', emoji: '💼' },
    { id: 'c_life', name: '生活', emoji: '🌿' },
    { id: 'c_body', name: '健康', emoji: '🫧' },
    { id: 'c_other', name: '其他', emoji: '📌' }
  ];

  var DEFAULT_GOALS = [
    { id: 'g_exam', name: '备考', emoji: '🎯' },
    { id: 'g_skill', name: '技能提升', emoji: '🚀' },
    { id: 'g_habit', name: '养成习惯', emoji: '🌱' },
    { id: 'g_project', name: '完成项目', emoji: '🏆' }
  ];

  var LOOP_LABELS = {
    none: '不循环',
    daily: '每天',
    weekly: '每周',
    monthly: '每月',
    yearly: '每年'
  };

  /* ---------- 工具 ---------- */
  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function fmtDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function parseDate(str) {
    var p = String(str).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  var PCDate = {
    pad: pad,
    fmt: fmtDate,
    parse: parseDate,
    todayStr: function () { return fmtDate(new Date()); },
    addDays: function (str, n) {
      var d = parseDate(str);
      d.setDate(d.getDate() + n);
      return fmtDate(d);
    },
    weekdayCN: function (str) {
      return ['日', '一', '二', '三', '四', '五', '六'][parseDate(str).getDay()];
    },
    startOfWeek: function (str) {
      var d = parseDate(str);
      var offset = (d.getDay() + 6) % 7; // 周一为一周开始
      d.setDate(d.getDate() - offset);
      return fmtDate(d);
    },
    startOfMonth: function (str) {
      var d = parseDate(str);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-01';
    },
    daysInMonth: function (year, month) {
      return new Date(year, month, 0).getDate();
    },
    clockHM: function (ts) {
      var d = new Date(ts);
      return pad(d.getHours()) + ':' + pad(d.getMinutes());
    },
    dateLabel: function (str) {
      var d = parseDate(str);
      return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    },
    diffDays: function (a, b) {
      return Math.round((parseDate(b) - parseDate(a)) / 86400000);
    }
  };

  /* ---------- 初始数据 ---------- */
  function defaultSettings() {
    return {
      focus: 25,
      short: 5,
      long: 15,
      longEvery: 4,
      autoStartBreak: true,
      autoStartFocus: false,
      mode: 'down',
      strict: false,
      soundOn: true,
      vibrate: true,
      voice: false,
      voiceVolume: 0.8,
      voiceRate: 1,
      theme: 'auto',
      companion: 'li-shen-window',
      music: true,
      musicVolume: 30,
      installHinted: false
    };
  }

  // 陪伴人物 id 白名单，避免旧数据或手改设置导致画面空白
  var COMPANION_IDS = ['li-shen-window', 'li-shen-flowers', 'video-wine-1', 'video-wine-2'];

  function initialState() {
    return {
      version: 1,
      settings: defaultSettings(),
      tasks: [],
      categories: DEFAULT_CATEGORIES.map(function (c) { return Object.assign({}, c); }),
      goals: DEFAULT_GOALS.map(function (g) { return Object.assign({}, g); }),
      records: [],
      distractions: [],
      currentTaskId: null,
      timer: null,
      createdAt: Date.now()
    };
  }

  var state = null;

  function normalize(raw) {
    var s = initialState();
    if (!raw || typeof raw !== 'object') return s;
    s.settings = Object.assign(s.settings, raw.settings || {});
    s.settings.focus = clampNum(s.settings.focus, 1, 180, 25);
    s.settings.short = clampNum(s.settings.short, 1, 60, 5);
    s.settings.long = clampNum(s.settings.long, 1, 120, 15);
    s.settings.longEvery = clampNum(s.settings.longEvery, 2, 12, 4);
    if (COMPANION_IDS.indexOf(s.settings.companion) < 0) s.settings.companion = 'li-shen-window';
    s.settings.musicVolume = clampNum(s.settings.musicVolume, 0, 100, 30);
    s.settings.music = s.settings.music !== false;
    s.categories = Array.isArray(raw.categories) && raw.categories.length
      ? raw.categories.map(function (c) {
          return { id: c.id || uid('c'), name: c.name || '未命名', emoji: c.emoji || '📌' };
        })
      : s.categories;
    s.goals = Array.isArray(raw.goals) && raw.goals.length
      ? raw.goals.map(function (g) {
          return { id: g.id || uid('g'), name: g.name || '未命名', emoji: g.emoji || '🎯' };
        })
      : s.goals;
    s.tasks = Array.isArray(raw.tasks)
      ? raw.tasks.map(function (t) {
          return {
            id: t.id || uid('t'),
            name: t.name || '未命名任务',
            important: !!t.important,
            done: !!t.done,
            doneDate: t.doneDate || '',
            categoryId: t.categoryId || '',
            goalId: t.goalId || '',
            startDate: t.startDate || '',
            endDate: t.endDate || '',
            loopType: t.loopType && LOOP_LABELS[t.loopType] ? t.loopType : 'none',
            completedPomodoros: Number(t.completedPomodoros) || 0,
            totalFocusSec: Number(t.totalFocusSec) || 0,
            createdAt: t.createdAt || Date.now()
          };
        })
      : [];
    s.records = Array.isArray(raw.records) ? raw.records : [];
    s.distractions = Array.isArray(raw.distractions) ? raw.distractions : [];
    s.currentTaskId = raw.currentTaskId || null;
    s.timer = raw.timer || null;
    return s;
  }

  function clampNum(v, min, max, fallback) {
    v = Number(v);
    if (!isFinite(v)) return fallback;
    return Math.min(max, Math.max(min, Math.round(v)));
  }

  function readRaw() {
    try {
      return global.localStorage.getItem(KEY);
    } catch (e) {
      storageOK = false;
      return null;
    }
  }

  function writeRaw(text) {
    try {
      global.localStorage.setItem(KEY, text);
      return true;
    } catch (e) {
      storageOK = false;
      console.warn('[Store] 本地存储不可用，数据仅保存在当前页面内存中。', e);
      return false;
    }
  }

  function emit() {
    try {
      global.document.dispatchEvent(new CustomEvent('pc:state'));
    } catch (e) { /* 忽略不支持 CustomEvent 的极端环境 */ }
  }

  function save() {
    writeRaw(JSON.stringify(state));
    emit();
  }

  function saveSilent() {
    writeRaw(JSON.stringify(state));
  }

  /* ---------- 初始化 ---------- */
  function init() {
    var raw = readRaw();
    if (!raw) {
      state = initialState();
      saveSilent();
      return;
    }
    try {
      state = normalize(JSON.parse(raw));
    } catch (e) {
      console.warn('[Store] 数据解析失败，使用初始数据。', e);
      state = initialState();
      saveSilent();
    }
  }

  function getTask(id) {
    if (!id) return null;
    return state.tasks.find(function (t) { return t.id === id; }) || null;
  }

  function getCategory(id) {
    if (!id) return null;
    return state.categories.find(function (c) { return c.id === id; }) || null;
  }

  function getGoal(id) {
    if (!id) return null;
    return state.goals.find(function (g) { return g.id === id; }) || null;
  }

  /* ---------- 设置 ---------- */
  function getSettings() {
    return state.settings;
  }

  function updateSettings(patch) {
    Object.assign(state.settings, patch);
    save();
    return state.settings;
  }

  /* ---------- 任务 ---------- */
  function addTask(data) {
    var task = {
      id: uid('t'),
      name: (data.name || '未命名任务').trim(),
      important: !!data.important,
      done: false,
      doneDate: '',
      categoryId: data.categoryId || '',
      goalId: data.goalId || '',
      startDate: data.startDate || '',
      endDate: data.endDate || '',
      loopType: LOOP_LABELS[data.loopType] ? data.loopType : 'none',
      completedPomodoros: 0,
      totalFocusSec: 0,
      createdAt: Date.now()
    };
    state.tasks.unshift(task);
    save();
    return task;
  }

  function updateTask(id, patch) {
    var task = getTask(id);
    if (!task) return null;
    Object.assign(task, patch);
    save();
    return task;
  }

  function deleteTask(id) {
    state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
    if (state.currentTaskId === id) state.currentTaskId = null;
    save();
  }

  function toggleTaskDone(id) {
    var task = getTask(id);
    if (!task) return false;
    task.done = !task.done;
    task.doneDate = task.done ? PCDate.todayStr() : '';
    save();
    return task.done;
  }

  function toggleTaskImportant(id) {
    var task = getTask(id);
    if (!task) return false;
    task.important = !task.important;
    save();
    return task.important;
  }

  function setCurrentTask(id) {
    if (id && !getTask(id)) id = null;
    state.currentTaskId = id;
    save();
  }

  function shouldResetLoopTask(loopType, doneDate, todayStr) {
    var done = parseDate(doneDate);
    var today = parseDate(todayStr);
    var diff = Math.floor((today - done) / 86400000);
    if (diff <= 0) return false;
    if (loopType === 'daily') return diff >= 1;
    if (loopType === 'weekly') return diff >= 7;
    if (loopType === 'monthly') {
      return done.getMonth() !== today.getMonth() || done.getFullYear() !== today.getFullYear();
    }
    if (loopType === 'yearly') return done.getFullYear() !== today.getFullYear();
    return false;
  }

  // 跨天自动把循环任务的完成状态放开
  function resetLoopTasks() {
    var today = PCDate.todayStr();
    var changed = false;
    state.tasks.forEach(function (task) {
      if (task.done && task.loopType !== 'none' && task.doneDate) {
        if (shouldResetLoopTask(task.loopType, task.doneDate, today)) {
          task.done = false;
          task.doneDate = '';
          changed = true;
        }
      }
    });
    if (changed) save();
    return changed;
  }

  /* ---------- 分类 / 目标 ---------- */
  function addCategory(name, emoji) {
    var item = { id: uid('c'), name: String(name || '').trim() || '新分类', emoji: emoji || '🏷️' };
    state.categories.push(item);
    save();
    return item;
  }

  function updateCategory(id, patch) {
    var item = getCategory(id);
    if (!item) return null;
    Object.assign(item, patch);
    save();
    return item;
  }

  function deleteCategory(id) {
    state.categories = state.categories.filter(function (c) { return c.id !== id; });
    state.tasks.forEach(function (t) {
      if (t.categoryId === id) t.categoryId = '';
    });
    save();
  }

  function addGoal(name, emoji) {
    var item = { id: uid('g'), name: String(name || '').trim() || '新目标', emoji: emoji || '🎯' };
    state.goals.push(item);
    save();
    return item;
  }

  function updateGoal(id, patch) {
    var item = getGoal(id);
    if (!item) return null;
    Object.assign(item, patch);
    save();
    return item;
  }

  function deleteGoal(id) {
    state.goals = state.goals.filter(function (g) { return g.id !== id; });
    state.tasks.forEach(function (t) {
      if (t.goalId === id) t.goalId = '';
    });
    save();
  }

  /* ---------- 专注记录 ---------- */
  function addRecord(data, silent) {
    var task = getTask(data.taskId);
    var cat = getCategory(task && task.categoryId);
    var rec = {
      id: uid('r'),
      date: data.date || PCDate.todayStr(),
      startTs: data.startTs || Date.now(),
      endTs: Date.now(),
      durationSec: Math.max(0, Math.round(data.durationSec || 0)),
      taskId: task ? task.id : null,
      taskName: task ? task.name : '未关联任务',
      categoryId: cat ? cat.id : 'c_other',
      categoryName: cat ? cat.name : '其他',
      categoryEmoji: cat ? cat.emoji : '📌'
    };
    state.records.unshift(rec);
    if (state.records.length > 5000) state.records.length = 5000;
    if (task) {
      task.completedPomodoros = (task.completedPomodoros || 0) + 1;
      task.totalFocusSec = (task.totalFocusSec || 0) + rec.durationSec;
    }
    if (silent) saveSilent(); else save();
    return rec;
  }

  function recordsByDate(date) {
    return state.records.filter(function (r) { return r.date === date; });
  }

  function recordsInRange(startStr, endStr) {
    return state.records.filter(function (r) {
      return r.date >= startStr && r.date <= endStr;
    });
  }

  /* ---------- 分心记录 ---------- */
  function addDistraction(data) {
    var reason = REASONS.find(function (r) { return r.id === data.reasonId; }) || REASONS[REASONS.length - 1];
    var rec = {
      id: uid('d'),
      date: PCDate.todayStr(),
      ts: Date.now(),
      reasonId: reason.id,
      reasonName: reason.name,
      reasonEmoji: reason.emoji,
      note: String(data.note || '').slice(0, 200),
      lostSec: Math.max(0, Math.round(data.lostSec || 0)),
      phase: data.phase || 'focus'
    };
    state.distractions.unshift(rec);
    if (state.distractions.length > 2000) state.distractions.length = 2000;
    save();
    return rec;
  }

  function updateDistraction(id, patch) {
    var rec = state.distractions.find(function (d) { return d.id === id; });
    if (!rec) return null;
    Object.assign(rec, patch);
    save();
    return rec;
  }

  /* ---------- 计时快照 ---------- */
  function setTimer(snap) {
    state.timer = snap;
    saveSilent();
  }

  function getTimer() {
    return state.timer;
  }

  /* ---------- 数据管理 ---------- */
  function clearData() {
    state.tasks = [];
    state.records = [];
    state.distractions = [];
    state.currentTaskId = null;
    state.timer = null;
    save();
  }

  // 明确标注的示例数据，仅用于预览统计页，不参与任何联机
  function seedDemo() {
    var rnd = (function () {
      var seed = 20261110;
      return function () {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
    })();

    state.tasks = [];
    var demo = [
      { name: '读完《当下的力量》一章', categoryId: 'c_study', goalId: 'g_habit', important: true },
      { name: '整理房间与书桌', categoryId: 'c_life', important: false },
      { name: '写本周复盘', categoryId: 'c_work', goalId: 'g_project', important: true }
    ].map(function (item) {
      var t = {
        id: uid('t'), name: item.name, important: item.important, done: false, doneDate: '',
        categoryId: item.categoryId, goalId: item.goalId || '', startDate: '', endDate: '',
        loopType: 'none', completedPomodoros: 0, totalFocusSec: 0, createdAt: Date.now()
      };
      state.tasks.push(t);
      return t;
    });

    state.records = [];
    state.distractions = [];
    var today = PCDate.todayStr();
    for (var i = 29; i >= 0; i--) {
      var date = PCDate.addDays(today, -i);
      var sessions = Math.floor(rnd() * 5);
      if (i % 7 === 3) sessions = 0;
      if (i === 0) sessions = 3;
      for (var k = 0; k < sessions; k++) {
        var task = demo[Math.floor(rnd() * demo.length)];
        var cat = getCategory(task.categoryId);
        var minutes = 15 + Math.floor(rnd() * 4) * 10;
        var start = parseDate(date);
        start.setHours(9 + k, 15 + Math.floor(rnd() * 30), 0, 0);
        state.records.push({
          id: uid('r'),
          date: date,
          startTs: start.getTime(),
          endTs: start.getTime() + minutes * 60000,
          durationSec: minutes * 60,
          taskId: task.id,
          taskName: task.name,
          categoryId: cat ? cat.id : 'c_other',
          categoryName: cat ? cat.name : '其他',
          categoryEmoji: cat ? cat.emoji : '📌'
        });
      }
    }
    state.records.sort(function (a, b) { return b.startTs - a.startTs; });

    for (var d = 0; d < 18; d++) {
      var day = PCDate.addDays(today, -Math.floor(rnd() * 20));
      var reason = REASONS[Math.floor(rnd() * REASONS.length)] || REASONS[0];
      var when = parseDate(day);
      when.setHours(10 + Math.floor(rnd() * 8), Math.floor(rnd() * 60), 0, 0);
      state.distractions.push({
        id: uid('d'), date: day, ts: when.getTime(),
        reasonId: reason.id, reasonName: reason.name, reasonEmoji: reason.emoji,
        note: '', lostSec: 60 + Math.floor(rnd() * 9) * 60, phase: 'focus'
      });
    }
    state.distractions.sort(function (a, b) { return b.ts - a.ts; });
    state.currentTaskId = demo[0].id;
    state.timer = null;
    save();
  }

  global.PCDate = PCDate;
  global.PCStore = {
    KEY: KEY,
    REASONS: REASONS,
    LOOP_LABELS: LOOP_LABELS,
    init: init,
    save: save,
    saveSilent: saveSilent,
    isStorageOK: function () { return storageOK; },
    get state() { return state; },
    getSettings: getSettings,
    updateSettings: updateSettings,
    getTask: getTask,
    addTask: addTask,
    updateTask: updateTask,
    deleteTask: deleteTask,
    toggleTaskDone: toggleTaskDone,
    toggleTaskImportant: toggleTaskImportant,
    setCurrentTask: setCurrentTask,
    resetLoopTasks: resetLoopTasks,
    getCategory: getCategory,
    addCategory: addCategory,
    updateCategory: updateCategory,
    deleteCategory: deleteCategory,
    getGoal: getGoal,
    addGoal: addGoal,
    updateGoal: updateGoal,
    deleteGoal: deleteGoal,
    addRecord: addRecord,
    recordsByDate: recordsByDate,
    recordsInRange: recordsInRange,
    addDistraction: addDistraction,
    updateDistraction: updateDistraction,
    setTimer: setTimer,
    getTimer: getTimer,
    clearData: clearData,
    seedDemo: seedDemo
  };
})(window);
