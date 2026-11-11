/* 计划陪伴 · 统计、日历、记录、分心 */
(function (global) {
  'use strict';

  var Store = global.PCStore;
  var D = global.PCDate;

  var selDate = D.todayStr();
  var calYear = new Date().getFullYear();
  var calMonth = new Date().getMonth() + 1;
  var bound = false;
  var pieResizeObserver = null;

  var PALETTE = ['#8fa886', '#c9a98c', '#93aab5', '#c9a0a0', '#b4b189', '#a79ac1', '#d2b58d', '#8fa6a0'];
  var PALETTE_DARK = ['#9fbb95', '#d3b394', '#a3bcc7', '#d6aeae', '#c2bf96', '#b5a8cf', '#dcbf95', '#9fb5ae'];

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function isDark() {
    return document.documentElement.dataset.theme === 'dark';
  }

  function sum(list, fn) {
    return list.reduce(function (acc, item) { return acc + fn(item); }, 0);
  }

  function recordsOf(date) {
    return Store.state.records.filter(function (r) { return r.date === date; });
  }

  function minutesOf(date) {
    return Math.round(sum(recordsOf(date), function (r) { return r.durationSec; }) / 60);
  }

  function fmtDuration(sec) {
    sec = Math.round(sec || 0);
    if (sec < 60) return '不到 1 分钟';
    var m = Math.round(sec / 60);
    if (m < 60) return m + ' 分钟';
    var h = Math.floor(m / 60);
    var rest = m % 60;
    return h + ' 小时' + (rest ? ' ' + rest + ' 分' : '');
  }

  function fmtMinutes(sec) {
    sec = Math.round(sec || 0);
    if (sec < 60) return '0 分钟';
    var m = Math.round(sec / 60);
    if (m < 60) return m + ' 分钟';
    var h = Math.floor(m / 60);
    var rest = m % 60;
    return h + ' 小时' + (rest ? ' ' + rest + ' 分' : '');
  }

  function shortDate(str) {
    var p = str.split('-');
    return Number(p[1]) + '/' + Number(p[2]);
  }

  function weekday(str) {
    return '周' + D.weekdayCN(str);
  }

  function moveSel(delta) {
    var next = D.addDays(selDate, delta);
    if (next > D.todayStr()) return;
    selDate = next;
    renderStats();
  }

  /* ---------- 概览 ---------- */
  function renderSummary() {
    var el = document.getElementById('statGrid');
    if (!el) return;
    var records = Store.state.records;
    var totalPomo = records.length;
    var totalSec = sum(records, function (r) { return r.durationSec; });
    var avg = totalPomo ? Math.round(totalSec / totalPomo) : 0;
    var activeDays = {};
    records.forEach(function (r) { activeDays[r.date] = true; });
    var dayCount = Object.keys(activeDays).length;

    var cards = [
      { icon: '🍅', label: '累计番茄', value: String(totalPomo), unit: '个', hint: '完成一次算一个' },
      { icon: '🕯️', label: '总专注时长', value: fmtMinutes(totalSec), unit: '', hint: '所有记录合计' },
      { icon: '⏳', label: '平均每次', value: avg ? Math.round(avg / 60) + ' 分钟' : '0 分钟', unit: '', hint: '专注不追求越长越好' },
      { icon: '🌿', label: '活跃天数', value: String(dayCount), unit: '天', hint: '有专注记录的日子' }
    ];

    el.innerHTML = cards.map(function (c) {
      return '<div class="stat-card">' +
        '<span class="stat-icon">' + c.icon + '</span>' +
        '<span class="stat-label">' + c.label + '</span>' +
        '<span class="stat-value">' + c.value + '<i>' + c.unit + '</i></span>' +
        '<span class="stat-hint">' + c.hint + '</span>' +
        '</div>';
    }).join('');

    var dateLabel = document.getElementById('statDateLabel');
    if (dateLabel) {
      dateLabel.textContent = selDate === D.todayStr() ? '今天 · ' + D.dateLabel(selDate) : D.dateLabel(selDate) + ' · ' + weekday(selDate);
    }
    var nextBtn = document.getElementById('statNext');
    if (nextBtn) nextBtn.disabled = selDate >= D.todayStr();
  }

  /* ---------- 饼图 ---------- */
  function categoryColor(id) {
    var index = Store.state.categories.findIndex(function (c) { return c.id === id; });
    if (index < 0) {
      var hash = 0;
      for (var i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
      index = Math.abs(hash) % PALETTE.length;
    }
    var list = isDark() ? PALETTE_DARK : PALETTE;
    return list[index % list.length];
  }

  function renderPie() {
    var canvas = document.getElementById('pieChart');
    var empty = document.getElementById('pieEmpty');
    var legend = document.getElementById('pieLegend');
    if (!canvas) return;
    var records = recordsOf(selDate);
    var totalSec = sum(records, function (r) { return r.durationSec; });

    var pieDate = document.getElementById('pieDateLabel');
    if (pieDate) pieDate.textContent = D.dateLabel(selDate);

    if (!records.length || totalSec <= 0) {
      canvas.style.display = 'none';
      if (empty) empty.hidden = false;
      if (legend) legend.innerHTML = '';
      return;
    }
    canvas.style.display = 'block';
    if (empty) empty.hidden = true;

    var groups = {};
    records.forEach(function (r) {
      var key = r.categoryId || 'c_other';
      if (!groups[key]) groups[key] = { id: key, name: r.categoryName || '其他', emoji: r.categoryEmoji || '📌', sec: 0, count: 0 };
      groups[key].sec += r.durationSec;
      groups[key].count += 1;
    });
    var slices = Object.keys(groups).map(function (k) { return groups[k]; })
      .sort(function (a, b) { return b.sec - a.sec; });

    var wrap = canvas.parentElement;
    var rect = wrap.getBoundingClientRect();
    var w = Math.max(240, Math.floor(rect.width));
    var h = Math.max(240, Math.floor(rect.height));
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var style = getComputedStyle(document.documentElement);
    var ink = style.getPropertyValue('--ink-soft').trim() || '#5d675c';
    var surface = style.getPropertyValue('--surface').trim() || '#fffdf8';
    var muted = style.getPropertyValue('--muted').trim() || '#8b938a';

    var cx = w / 2;
    var cy = h * 0.5;
    var r = Math.min(w, h) * 0.30;
    var start = -Math.PI / 2;

    if (slices.length === 1) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = categoryColor(slices[0].id);
      ctx.fill();
    } else {
      slices.forEach(function (s) {
        var sweep = (s.sec / totalSec) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, start, start + sweep);
        ctx.closePath();
        ctx.fillStyle = categoryColor(s.id);
        ctx.fill();
        start += sweep;
      });
    }

    // 甜甜圈内圈
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.56, 0, Math.PI * 2);
    ctx.fillStyle = surface;
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink;
    ctx.font = '600 17px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(fmtMinutes(totalSec), cx, cy - 8);
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('这一天', cx, cy + 12);

    // 引线标签
    start = -Math.PI / 2;
    slices.forEach(function (s) {
      var sweep = (s.sec / totalSec) * Math.PI * 2;
      var mid = start + sweep / 2;
      var pct = s.sec / totalSec;
      if (pct >= 0.045) {
        var x1 = cx + Math.cos(mid) * (r + 3);
        var y1 = cy + Math.sin(mid) * (r + 3);
        var x2 = cx + Math.cos(mid) * (r + 17);
        var y2 = cy + Math.sin(mid) * (r + 17);
        var right = Math.cos(mid) >= 0;
        var x3 = x2 + (right ? 16 : -16);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y2);
        ctx.strokeStyle = isDark() ? 'rgba(230,233,226,.32)' : 'rgba(60,68,60,.26)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = categoryColor(s.id);
        ctx.beginPath();
        ctx.arc(x1, y1, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ink;
        ctx.font = '11px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.textAlign = right ? 'left' : 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.name + ' ' + Math.round(pct * 100) + '%', right ? x3 + 5 : x3 - 5, y2);
      }
      start += sweep;
    });

    if (legend) {
      legend.innerHTML = slices.map(function (s) {
        return '<span class="legend-item"><i style="background:' + categoryColor(s.id) + '"></i>' +
          esc(s.emoji) + ' ' + esc(s.name) + ' · ' + Math.round(s.sec / 60) + ' 分钟</span>';
      }).join('');
    }
  }

  /* ---------- 近 7 天 ---------- */
  function renderWeek() {
    var el = document.getElementById('weekBars');
    if (!el) return;
    var days = [];
    for (var i = 6; i >= 0; i--) {
      var date = D.addDays(selDate, -i);
      var recs = recordsOf(date);
      days.push({
        date: date,
        minutes: Math.round(sum(recs, function (r) { return r.durationSec; }) / 60),
        count: recs.length
      });
    }
    var max = Math.max(10, Math.max.apply(null, days.map(function (d) { return d.minutes; })));
    el.innerHTML = days.map(function (d) {
      var pct = d.minutes > 0 ? Math.max(4, Math.round(d.minutes / max * 100)) : 0;
      var isSel = d.date === selDate;
      return '<div class="bar-col' + (isSel ? ' is-sel' : '') + '" title="' + d.date + ' · ' + d.count + ' 个番茄">' +
        '<span class="bar-val">' + (d.minutes > 0 ? d.minutes : '') + '</span>' +
        '<div class="bar-track"><div class="bar-fill" style="height:' + pct + '%"></div></div>' +
        '<span class="bar-label">' + shortDate(d.date) + '</span>' +
        '</div>';
    }).join('');
    var range = document.getElementById('weekRangeLabel');
    if (range) range.textContent = shortDate(days[0].date) + ' – ' + shortDate(days[6].date) + ' · 分钟';
  }

  function levelOf(minutes) {
    if (!minutes) return 0;
    if (minutes < 25) return 1;
    if (minutes < 50) return 2;
    if (minutes < 90) return 3;
    return 4;
  }

  /* ---------- 日历 ---------- */
  function renderCalendar() {
    var el = document.getElementById('calendar');
    if (!el) return;
    var label = document.getElementById('calLabel');
    if (label) label.textContent = calYear + ' 年 ' + calMonth + ' 月';

    var first = new Date(calYear, calMonth - 1, 1);
    var lead = (first.getDay() + 6) % 7;
    var days = new Date(calYear, calMonth, 0).getDate();
    var todayStr = D.todayStr();
    var html = ['一', '二', '三', '四', '五', '六', '日'].map(function (w) {
      return '<span class="cal-weekday">' + w + '</span>';
    }).join('');

    for (var b = 0; b < lead; b++) html += '<span class="cal-blank"></span>';

    for (var d = 1; d <= days; d++) {
      var dateStr = calYear + '-' + D.pad(calMonth) + '-' + D.pad(d);
      var min = minutesOf(dateStr);
      var lvl = levelOf(min);
      var cls = 'cal-cell lvl-' + lvl;
      if (dateStr === todayStr) cls += ' is-today';
      if (dateStr === selDate) cls += ' is-selected';
      if (dateStr > todayStr) cls += ' is-future';
      html += '<button class="' + cls + '" data-date="' + dateStr + '" title="' + dateStr + ' · ' + min + ' 分钟">' +
        '<span class="cal-day">' + d + '</span>' +
        (min > 0 ? '<span class="cal-min">' + min + '</span>' : '') +
        '</button>';
    }
    el.innerHTML = html;
  }

  function renderDayDetail() {
    var el = document.getElementById('dayDetail');
    if (!el) return;
    var records = recordsOf(selDate).slice().sort(function (a, b) { return a.startTs - b.startTs; });
    var totalSec = sum(records, function (r) { return r.durationSec; });

    var head = '<div class="day-detail-head">' +
      '<div><strong>' + D.dateLabel(selDate) + '</strong><span>' + weekday(selDate) +
      (selDate === D.todayStr() ? ' · 今天' : '') + '</span></div>' +
      '<div class="day-total">' + records.length + ' 个番茄 · ' + fmtMinutes(totalSec) + '</div>' +
      '</div>';

    if (!records.length) {
      el.innerHTML = head + '<p class="empty-line">这一天还没有专注记录。休息也是一种完成。</p>';
      return;
    }
    el.innerHTML = head + '<div class="day-rows">' + records.map(function (r) {
      return '<div class="day-row">' +
        '<span class="day-time">' + D.clockHM(r.startTs) + '</span>' +
        '<span class="day-task">' + esc(r.taskName || '未关联任务') + '</span>' +
        '<span class="day-cat">' + esc(r.categoryEmoji || '📌') + ' ' + esc(r.categoryName || '其他') + '</span>' +
        '<span class="day-dur">' + Math.round(r.durationSec / 60) + ' 分钟</span>' +
        '</div>';
    }).join('') + '</div>';
  }

  /* ---------- 分心统计 ---------- */
  function renderDistractions() {
    var today = D.todayStr();
    var weekStart = D.startOfWeek(today);
    var monthStart = D.startOfMonth(today);
    var all = Store.state.distractions;

    function pickRange(start, end) {
      return all.filter(function (d) { return d.date >= start && d.date <= end; });
    }
    var ranges = [
      { label: '今天', list: pickRange(today, today) },
      { label: '本周', list: pickRange(weekStart, today) },
      { label: '本月', list: pickRange(monthStart, today) }
    ];

    var cards = document.getElementById('distCards');
    if (cards) {
      cards.innerHTML = ranges.map(function (r) {
        var lost = sum(r.list, function (d) { return d.lostSec || 0; });
        return '<div class="dist-card">' +
          '<span class="dist-card-label">' + r.label + '</span>' +
          '<span class="dist-card-value">' + r.list.length + '<i>次走神</i></span>' +
          '<span class="dist-card-sub">损失 ' + fmtDuration(lost) + '</span>' +
          '</div>';
      }).join('');
    }

    var monthList = ranges[2].list;
    var byReason = {};
    monthList.forEach(function (d) {
      var key = d.reasonId || 'other';
      if (!byReason[key]) {
        byReason[key] = { name: d.reasonName || '其他', emoji: d.reasonEmoji || '📝', count: 0, lost: 0 };
      }
      byReason[key].count += 1;
      byReason[key].lost += d.lostSec || 0;
    });
    var reasons = Object.keys(byReason).map(function (k) { return byReason[k]; })
      .sort(function (a, b) { return b.count - a.count; });
    var maxCount = reasons.length ? reasons[0].count : 0;

    var reasonEl = document.getElementById('distReasons');
    if (reasonEl) {
      if (!reasons.length) {
        reasonEl.innerHTML = '<p class="empty-line">本月还没有记录到走神。很稳。</p>';
      } else {
        reasonEl.innerHTML = reasons.map(function (r) {
          return '<div class="reason-row">' +
            '<span class="reason-name">' + esc(r.emoji) + ' ' + esc(r.name) + '</span>' +
            '<div class="reason-track"><div class="reason-fill" style="width:' + Math.round(r.count / maxCount * 100) + '%"></div></div>' +
            '<span class="reason-count">' + r.count + ' 次</span>' +
            '<span class="reason-lost">' + fmtDuration(r.lost) + '</span>' +
            '</div>';
        }).join('');
      }
    }

    var lostLine = document.getElementById('distLostLine');
    if (lostLine) {
      var monthLost = sum(monthList, function (d) { return d.lostSec || 0; });
      lostLine.textContent = '本月因走神暂停共 ' + monthList.length + ' 次，损失约 ' + fmtDuration(monthLost) + '。看清原因，比责怪自己有用。';
    }
  }

  /* ---------- 记录页 ---------- */
  function renderRecords() {
    var el = document.getElementById('recordsWrap');
    if (!el) return;
    var records = Store.state.records.slice().sort(function (a, b) { return b.startTs - a.startTs; });
    if (!records.length) {
      el.innerHTML = '<div class="empty-state"><span class="empty-mark">🕯️</span><p>还没有专注记录。完成第一段专注后，这里会留下痕迹。</p></div>';
      return;
    }
    var groups = {};
    var order = [];
    records.forEach(function (r) {
      if (!groups[r.date]) {
        groups[r.date] = [];
        order.push(r.date);
      }
      groups[r.date].push(r);
    });
    order.sort(function (a, b) { return a < b ? 1 : -1; });

    el.innerHTML = order.map(function (date) {
      var list = groups[date];
      var totalSec = sum(list, function (r) { return r.durationSec; });
      var rows = list.map(function (r) {
        return '<div class="record-row">' +
          '<span class="record-time">' + D.clockHM(r.startTs) + '</span>' +
          '<div class="record-main"><span class="record-task">' + esc(r.taskName || '未关联任务') + '</span>' +
          '<span class="record-cat">' + esc(r.categoryEmoji || '📌') + ' ' + esc(r.categoryName || '其他') + '</span></div>' +
          '<span class="record-dur">' + Math.round(r.durationSec / 60) + ' 分钟</span>' +
          '</div>';
      }).join('');
      var isToday = date === D.todayStr();
      return '<section class="record-group">' +
        '<header class="record-head"><h3>' + D.dateLabel(date) + (isToday ? ' · 今天' : '') + '</h3>' +
        '<span>' + weekday(date) + ' · ' + list.length + ' 个番茄 · ' + fmtMinutes(totalSec) + '</span></header>' +
        rows +
        '</section>';
    }).join('');
  }

  /* ---------- 汇总 ---------- */
  function renderStats() {
    renderSummary();
    renderPie();
    renderWeek();
    renderCalendar();
    renderDayDetail();
    renderDistractions();
  }

  function renderAll() {
    renderStats();
    renderRecords();
  }

  function bind() {
    if (bound) return;
    bound = true;

    var prev = document.getElementById('statPrev');
    var next = document.getElementById('statNext');
    var todayBtn = document.getElementById('statToday');
    if (prev) prev.addEventListener('click', function () { moveSel(-1); });
    if (next) next.addEventListener('click', function () { if (!next.disabled) moveSel(1); });
    if (todayBtn) todayBtn.addEventListener('click', function () {
      selDate = D.todayStr();
      calYear = new Date().getFullYear();
      calMonth = new Date().getMonth() + 1;
      renderStats();
    });

    var calPrev = document.getElementById('calPrev');
    var calNext = document.getElementById('calNext');
    var calToday = document.getElementById('calToday');
    if (calPrev) calPrev.addEventListener('click', function () {
      calMonth -= 1;
      if (calMonth < 1) { calMonth = 12; calYear -= 1; }
      renderCalendar();
    });
    if (calNext) calNext.addEventListener('click', function () {
      calMonth += 1;
      if (calMonth > 12) { calMonth = 1; calYear += 1; }
      renderCalendar();
    });
    if (calToday) calToday.addEventListener('click', function () {
      var now = new Date();
      calYear = now.getFullYear();
      calMonth = now.getMonth() + 1;
      selDate = D.todayStr();
      renderStats();
    });

    var cal = document.getElementById('calendar');
    if (cal) {
      cal.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-date]');
        if (!btn) return;
        var date = btn.dataset.date;
        if (date > D.todayStr()) { global.PCUI.toast('未来还没发生，先过好今天'); return; }
        selDate = date;
        var parts = date.split('-');
        calYear = Number(parts[0]);
        calMonth = Number(parts[1]);
        renderStats();
      });
    }

    global.document.addEventListener('pc:state', function () {
      renderAll();
    });
    global.document.addEventListener('pc:theme', function () {
      renderPie();
    });

    var wrap = document.querySelector('.pie-wrap');
    if (wrap && 'ResizeObserver' in global) {
      pieResizeObserver = new ResizeObserver(function () { renderPie(); });
      pieResizeObserver.observe(wrap);
    } else {
      global.addEventListener('resize', function () { renderPie(); });
    }

    // 跨天时把选中日期与日历刷新到今天
    global.document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && selDate > D.todayStr()) {
        selDate = D.todayStr();
        renderStats();
      }
    });
  }

  global.PCStats = {
    bind: bind,
    renderStats: renderStats,
    renderRecords: renderRecords,
    renderAll: renderAll,
    selectDate: function (date) {
      selDate = date;
      renderStats();
    }
  };
})(window);
