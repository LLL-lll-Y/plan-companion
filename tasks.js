/* 计划陪伴 · 任务、分类与目标 */
(function (global) {
  'use strict';

  var Store = global.PCStore;
  var D = global.PCDate;
  var filter = 'all';
  var bound = false;

  var EMOJIS = ['📚', '💼', '🌿', '🫧', '📌', '🎨', '🎧', '💻', '🏃', '🍵', '🧺', '🌙', '✏️', '🧠', '🏡', '🎯', '🚀', '🌱', '🏆', '🐝'];

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtDateShort(str) {
    if (!str) return '';
    var p = str.split('-');
    return Number(p[1]) + '/' + Number(p[2]);
  }

  function fmtFocus(sec) {
    sec = Number(sec) || 0;
    if (sec < 60) return '0 分钟';
    var m = Math.round(sec / 60);
    if (m < 60) return m + ' 分钟';
    var h = Math.floor(m / 60);
    var rest = m % 60;
    return h + ' 小时' + (rest ? ' ' + rest + ' 分' : '');
  }

  function sortedTasks(list) {
    return list.slice().sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.important !== b.important) return a.important ? -1 : 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  function filtered() {
    var list = Store.state.tasks;
    if (filter === 'important') list = list.filter(function (t) { return t.important; });
    if (filter === 'open') list = list.filter(function (t) { return !t.done; });
    return sortedTasks(list);
  }

  function taskCard(task) {
    var cat = Store.getCategory(task.categoryId);
    var goal = Store.getGoal(task.goalId);
    var isCurrent = Store.state.currentTaskId === task.id;
    var meta = [];

    meta.push('<span class="meta-chip">' + (cat ? esc(cat.emoji) + ' ' + esc(cat.name) : '📌 未分类') + '</span>');
    if (goal) meta.push('<span class="meta-chip">' + esc(goal.emoji) + ' ' + esc(goal.name) + '</span>');

    var dateText = '';
    if (task.startDate && task.endDate) dateText = fmtDateShort(task.startDate) + ' – ' + fmtDateShort(task.endDate);
    else if (task.startDate) dateText = fmtDateShort(task.startDate) + ' 起';
    else if (task.endDate) dateText = '截至 ' + fmtDateShort(task.endDate);
    if (dateText) meta.push('<span class="meta-chip">' + dateText + '</span>');
    if (task.loopType && task.loopType !== 'none') {
      meta.push('<span class="meta-chip loop">' + Store.LOOP_LABELS[task.loopType] + '</span>');
    }
    meta.push('<span class="meta-chip pomo">🍅 ' + (task.completedPomodoros || 0) + '</span>');
    if (task.totalFocusSec > 0) meta.push('<span class="meta-chip">' + fmtFocus(task.totalFocusSec) + '</span>');

    return '' +
      '<article class="task-item' + (task.done ? ' is-done' : '') + (isCurrent ? ' is-current' : '') + '" data-id="' + task.id + '">' +
        '<button class="task-check" data-act="done" aria-label="' + (task.done ? '取消完成' : '标记完成') + '">' +
          '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</button>' +
        '<div class="task-main">' +
          '<div class="task-title-row">' +
            '<h3>' + esc(task.name) + '</h3>' +
            (task.important ? '<span class="task-star" title="重要">★</span>' : '') +
            (isCurrent ? '<span class="chip-current">当前专注</span>' : '') +
          '</div>' +
          '<div class="task-meta">' + meta.join('') + '</div>' +
        '</div>' +
        '<div class="task-actions">' +
          '<button data-act="focus" title="设为当前专注对象" aria-label="设为当前专注对象">◎</button>' +
          '<button data-act="important" title="标记重要" class="' + (task.important ? 'is-on' : '') + '" aria-label="标记重要">★</button>' +
          '<button data-act="edit" title="编辑" aria-label="编辑">✎</button>' +
          '<button data-act="delete" title="删除" aria-label="删除">🗑</button>' +
        '</div>' +
      '</article>';
  }

  function render() {
    var listEl = document.getElementById('taskList');
    if (!listEl) return;
    var list = filtered();
    var all = Store.state.tasks;
    var importantCount = all.filter(function (t) { return t.important; }).length;
    var openCount = all.filter(function (t) { return !t.done; }).length;

    var countAll = document.getElementById('countAll');
    var countImportant = document.getElementById('countImportant');
    var countOpen = document.getElementById('countOpen');
    if (countAll) countAll.textContent = all.length;
    if (countImportant) countImportant.textContent = importantCount;
    if (countOpen) countOpen.textContent = openCount;

    if (!list.length) {
      var tips = {
        all: '还没有任务。新建一件想做的事，我会陪你一段一段完成。',
        important: '还没有标记为重要的任务。',
        open: '没有未完成的任务，今天可以安心休息。'
      };
      listEl.innerHTML = '<div class="empty-state"><span class="empty-mark">🌱</span><p>' + tips[filter] + '</p></div>';
    } else {
      listEl.innerHTML = list.map(taskCard).join('');
    }

    renderCategoryManager();
    renderGoalManager();
  }

  function renderCategoryManager() {
    var el = document.getElementById('categoryManager');
    if (!el) return;
    el.innerHTML = Store.state.categories.map(function (c) {
      return '<div class="mini-chip">' +
        '<span class="mini-emoji">' + esc(c.emoji) + '</span><span>' + esc(c.name) + '</span>' +
        '<button data-cat-edit="' + c.id + '" aria-label="编辑分类">✎</button>' +
        '<button data-cat-del="' + c.id + '" aria-label="删除分类">×</button>' +
        '</div>';
    }).join('');
  }

  function renderGoalManager() {
    var el = document.getElementById('goalManager');
    if (!el) return;
    el.innerHTML = Store.state.goals.map(function (g) {
      var tasks = Store.state.tasks.filter(function (t) { return t.goalId === g.id; });
      var pomos = tasks.reduce(function (sum, t) { return sum + (t.completedPomodoros || 0); }, 0);
      return '<div class="mini-chip goal-chip">' +
        '<span class="mini-emoji">' + esc(g.emoji) + '</span><span>' + esc(g.name) + '</span>' +
        '<span class="mini-stat">' + tasks.length + ' 任务 · 🍅 ' + pomos + '</span>' +
        '<button data-goal-edit="' + g.id + '" aria-label="编辑目标">✎</button>' +
        '<button data-goal-del="' + g.id + '" aria-label="删除目标">×</button>' +
        '</div>';
    }).join('');
  }

  /* ---------- 任务表单 ---------- */
  function openTaskForm(task) {
    var isEdit = !!task;
    var cats = Store.state.categories;
    var goals = Store.state.goals;
    var catOptions = '<option value="">未分类</option>' + cats.map(function (c) {
      return '<option value="' + c.id + '"' + (task && task.categoryId === c.id ? ' selected' : '') + '>' +
        esc(c.emoji) + ' ' + esc(c.name) + '</option>';
    }).join('');
    var goalOptions = '<option value="">不关联目标</option>' + goals.map(function (g) {
      return '<option value="' + g.id + '"' + (task && task.goalId === g.id ? ' selected' : '') + '>' +
        esc(g.emoji) + ' ' + esc(g.name) + '</option>';
    }).join('');
    var loopOptions = Object.keys(Store.LOOP_LABELS).map(function (key) {
      return '<option value="' + key + '"' + (task && task.loopType === key ? ' selected' : '') + '>' +
        Store.LOOP_LABELS[key] + '</option>';
    }).join('');

    var body = '' +
      '<div class="form-grid">' +
        '<label class="field span2"><span>任务名称</span>' +
          '<input id="tfName" maxlength="60" placeholder="比如：读完第三章" value="' + esc(isEdit ? task.name : '') + '"></label>' +
        '<div class="field span2"><span>标记</span>' +
          '<label class="switch-row"><input type="checkbox" id="tfImportant"' + (task && task.important ? ' checked' : '') + '>' +
          '<span class="switch"></span><span class="switch-text">这件事对我重要</span></label></div>' +
        '<label class="field"><span>分类</span><select id="tfCategory">' + catOptions + '</select></label>' +
        '<label class="field"><span>目标</span><select id="tfGoal">' + goalOptions + '</select></label>' +
        '<label class="field"><span>开始日期</span><input type="date" id="tfStart" value="' + (task && task.startDate || '') + '"></label>' +
        '<label class="field"><span>结束日期</span><input type="date" id="tfEnd" value="' + (task && task.endDate || '') + '"></label>' +
        '<label class="field span2"><span>循环</span><select id="tfLoop">' + loopOptions + '</select>' +
          '<small class="hint">循环任务完成后，跨天会自动恢复为未完成。</small></label>' +
      '</div>';

    var actions = [
      { label: '取消', kind: 'ghost' },
      {
        label: isEdit ? '保存修改' : '创建任务',
        kind: 'primary',
        onClick: function (close) {
          var name = document.getElementById('tfName').value.trim();
          if (!name) {
            global.PCUI.toast('给任务起个名字吧');
            return false;
          }
          var startDate = document.getElementById('tfStart').value;
          var endDate = document.getElementById('tfEnd').value;
          if (startDate && endDate && startDate > endDate) {
            global.PCUI.toast('结束日期不能早于开始日期');
            return false;
          }
          var data = {
            name: name,
            important: document.getElementById('tfImportant').checked,
            categoryId: document.getElementById('tfCategory').value,
            goalId: document.getElementById('tfGoal').value,
            startDate: startDate,
            endDate: endDate,
            loopType: document.getElementById('tfLoop').value
          };
          if (isEdit) {
            Store.updateTask(task.id, data);
            global.PCUI.toast('已保存');
          } else {
            Store.addTask(data);
            global.PCUI.toast('任务已创建');
          }
          close();
        }
      }
    ];
    if (isEdit) {
      actions.unshift({
        label: '删除',
        kind: 'danger',
        onClick: function (close) {
          global.PCUI.confirm('删除任务', '删除「' + task.name + '」？已产生的专注记录会保留。', { ok: '删除', danger: true }).then(function (yes) {
            if (!yes) return;
            Store.deleteTask(task.id);
            global.PCUI.toast('已删除');
            render();
            close();
          });
          return false;
        }
      });
    }
    global.PCUI.modal({ title: isEdit ? '编辑任务' : '新建任务', body: body, actions: actions });
    setTimeout(function () {
      var input = document.getElementById('tfName');
      if (input) input.focus();
    }, 120);
  }

  /* ---------- 分类 / 目标表单 ---------- */
  function emojiPicker(selected) {
    return '<div class="emoji-picker" id="emojiPicker">' + EMOJIS.map(function (em) {
      return '<button type="button" data-emoji="' + em + '" class="' + (em === selected ? 'is-active' : '') + '">' + em + '</button>';
    }).join('') + '</div>' +
    '<label class="field"><span>或手动输入一个符号</span><input id="emojiCustom" maxlength="4" value="' + esc(selected || '') + '"></label>';
  }

  function openCategoryForm(cat) {
    var isEdit = !!cat;
    var body = '' +
      '<div class="form-grid">' +
        '<label class="field span2"><span>分类名称</span>' +
          '<input id="cfName" maxlength="12" value="' + esc(isEdit ? cat.name : '') + '" placeholder="比如：阅读"></label>' +
        '<div class="field span2"><span>图标</span>' + emojiPicker(isEdit ? cat.emoji : '📚') + '</div>' +
      '</div>';
    global.PCUI.modal({
      title: isEdit ? '编辑分类' : '新建分类',
      body: body,
      actions: [
        { label: '取消', kind: 'ghost' },
        {
          label: '保存',
          kind: 'primary',
          onClick: function (close) {
            var name = document.getElementById('cfName').value.trim();
            if (!name) { global.PCUI.toast('分类需要一个名字'); return false; }
            var emoji = pickEmoji();
            if (isEdit) Store.updateCategory(cat.id, { name: name, emoji: emoji });
            else Store.addCategory(name, emoji);
            global.PCUI.toast(isEdit ? '分类已更新' : '分类已添加');
            render();
            close();
          }
        }
      ],
      onMount: function (root) {
        bindEmojiPicker(root);
      }
    });
  }

  function openGoalForm(goal) {
    var isEdit = !!goal;
    var body = '' +
      '<div class="form-grid">' +
        '<label class="field span2"><span>目标名称</span>' +
          '<input id="gfName" maxlength="16" value="' + esc(isEdit ? goal.name : '') + '" placeholder="比如：考研数学"></label>' +
        '<div class="field span2"><span>图标</span>' + emojiPicker(isEdit ? goal.emoji : '🎯') + '</div>' +
      '</div>';
    global.PCUI.modal({
      title: isEdit ? '编辑目标' : '新建目标',
      body: body,
      actions: [
        { label: '取消', kind: 'ghost' },
        {
          label: '保存',
          kind: 'primary',
          onClick: function (close) {
            var name = document.getElementById('gfName').value.trim();
            if (!name) { global.PCUI.toast('目标需要一个名字'); return false; }
            var emoji = pickEmoji();
            if (isEdit) Store.updateGoal(goal.id, { name: name, emoji: emoji });
            else Store.addGoal(name, emoji);
            global.PCUI.toast(isEdit ? '目标已更新' : '目标已添加');
            render();
            close();
          }
        }
      ],
      onMount: function (root) {
        bindEmojiPicker(root);
      }
    });
  }

  function bindEmojiPicker(root) {
    var picker = root.querySelector('#emojiPicker');
    if (!picker) return;
    picker.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-emoji]');
      if (!btn) return;
      Array.prototype.forEach.call(picker.querySelectorAll('button'), function (b) { b.classList.remove('is-active'); });
      btn.classList.add('is-active');
      var custom = root.querySelector('#emojiCustom');
      if (custom) custom.value = btn.dataset.emoji;
      picker.dataset.value = btn.dataset.emoji;
    });
    var initialActive = picker.querySelector('.is-active');
    picker.dataset.value = initialActive ? initialActive.dataset.emoji : '📚';
  }

  function pickEmoji() {
    var picker = document.getElementById('emojiPicker');
    var custom = document.getElementById('emojiCustom');
    var value = '';
    if (picker) {
      var active = picker.querySelector('.is-active');
      if (active) value = active.dataset.emoji;
      else if (picker.dataset.value) value = picker.dataset.value;
    }
    if (custom && custom.value.trim()) value = custom.value.trim();
    return value ? Array.from(value).slice(0, 2).join('') : '📌';
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    if (bound) return;
    bound = true;

    var addBtn = document.getElementById('addTaskBtn');
    if (addBtn) addBtn.addEventListener('click', function () { openTaskForm(null); });

    var filterEl = document.getElementById('taskFilter');
    if (filterEl) {
      filterEl.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-filter]');
        if (!btn) return;
        filter = btn.dataset.filter;
        Array.prototype.forEach.call(filterEl.querySelectorAll('button'), function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        render();
      });
    }

    var listEl = document.getElementById('taskList');
    if (listEl) {
      listEl.addEventListener('click', function (e) {
        var item = e.target.closest('.task-item');
        if (!item) return;
        var task = Store.getTask(item.dataset.id);
        if (!task) return;
        var actBtn = e.target.closest('[data-act]');
        if (actBtn) {
          var act = actBtn.dataset.act;
          if (act === 'done') Store.toggleTaskDone(task.id);
          if (act === 'important') {
            var on = Store.toggleTaskImportant(task.id);
            global.PCUI.toast(on ? '已标记为重要' : '已取消重要标记');
          }
          if (act === 'focus') {
            if (task.done) { global.PCUI.toast('这件已经完成啦'); return; }
            Store.setCurrentTask(task.id);
            global.PCUI.toast('下一段专注：' + task.name);
          }
          if (act === 'edit') openTaskForm(task);
          if (act === 'delete') {
            global.PCUI.confirm('删除任务', '删除「' + task.name + '」？已产生的专注记录会保留。', { ok: '删除', danger: true }).then(function (yes) {
              if (yes) {
                Store.deleteTask(task.id);
                global.PCUI.toast('已删除');
                render();
              }
            });
          }
          return;
        }
        // 点击卡片本体：设为专注对象
        if (task.done) return;
        Store.setCurrentTask(task.id);
        global.PCUI.toast('下一段专注：' + task.name);
      });
    }

    var catManager = document.getElementById('categoryManager');
    if (catManager) {
      catManager.addEventListener('click', function (e) {
        var edit = e.target.closest('[data-cat-edit]');
        var del = e.target.closest('[data-cat-del]');
        if (edit) {
          openCategoryForm(Store.getCategory(edit.dataset.catEdit));
        }
        if (del) {
          var cat = Store.getCategory(del.dataset.catDel);
          if (!cat) return;
          global.PCUI.confirm('删除分类', '删除「' + cat.name + '」？属于它的任务会变为未分类。', { ok: '删除', danger: true }).then(function (yes) {
            if (yes) {
              Store.deleteCategory(cat.id);
              global.PCUI.toast('分类已删除');
              render();
            }
          });
        }
      });
    }

    var goalManager = document.getElementById('goalManager');
    if (goalManager) {
      goalManager.addEventListener('click', function (e) {
        var edit = e.target.closest('[data-goal-edit]');
        var del = e.target.closest('[data-goal-del]');
        if (edit) openGoalForm(Store.getGoal(edit.dataset.goalEdit));
        if (del) {
          var goal = Store.getGoal(del.dataset.goalDel);
          if (!goal) return;
          global.PCUI.confirm('删除目标', '删除「' + goal.name + '」？关联的任务会保留下来。', { ok: '删除', danger: true }).then(function (yes) {
            if (yes) {
              Store.deleteGoal(goal.id);
              global.PCUI.toast('目标已删除');
              render();
            }
          });
        }
      });
    }

    var addCat = document.getElementById('addCategoryBtn');
    if (addCat) addCat.addEventListener('click', function () { openCategoryForm(null); });
    var addGoal = document.getElementById('addGoalBtn');
    if (addGoal) addGoal.addEventListener('click', function () { openGoalForm(null); });

    global.document.addEventListener('pc:state', render);
  }

  global.PCTasks = {
    bind: bind,
    render: render,
    openTaskForm: openTaskForm
  };
})(window);
