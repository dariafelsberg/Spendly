/* ==========================================================
 * pages/calendar.js – Kalender
 * Benötigt assets/js/main.js
 ========================================================== */

// ── CALENDAR STATE (muss vor BOOT deklariert sein, da initCalendar() dort aufgerufen wird)
let calViewDate = new Date(), calSelectedDay = null;

// Liefert "Vorschau"-Einträge für einen Monat, der noch nicht durch die
// Recurring-Engine gebucht wurde (also alles nach dem aktuellen Monat).
// Diese Einträge existieren NICHT in state.entries — sie werden nur zur
// Anzeige berechnet, wirken sich nicht auf Kontostand/Summen aus.
function getRecurringPreviewsForMonth(year, month) {
  const mKey     = monthKey(new Date(year, month, 1));
  const nowKey   = monthKey(new Date());
  const todayKey = dateKey(new Date());
  if (mKey < nowKey) return []; // vergangene Monate sind bereits vollständig gebucht
  const previews = [];
  const addPreviews = (list, type) => {
    list.forEach(r => {
      const startKey = r.createdAt ? monthKey(new Date(r.createdAt + 'T00:00:00')) : nowKey;
      if (mKey < startKey) return; // Regel startet erst später
      if (r.lastAppliedMonth && r.lastAppliedMonth >= mKey) return; // für diesen Monat schon real gebucht
      const day = recurringDayFor(r, year, month + 1);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      // Im aktuellen Monat nur als Vorschau zeigen, solange der Tag noch nicht erreicht ist
      if (mKey === nowKey && dateStr <= todayKey) return;
      previews.push(type === 'transfer' ? {
        id: 'preview-' + r.id + '-' + mKey, type, amount: r.amount, category: 'Interne Überweisung',
        note: r.name, date: dateStr,
        fromAccountId: r.fromAccountId, toAccountId: r.toAccountId, recurringId: r.id, isPreview: true,
      } : {
        id: 'preview-' + r.id + '-' + mKey, type, amount: r.amount, category: r.category,
        note: r.name, date: dateStr,
        accountId: r.accountId || '', recurringId: r.id, isPreview: true,
      });
    });
  };
  addPreviews(state.recurringIncome, 'income');
  addPreviews(state.recurringExpense, 'expense');
  addPreviews(state.recurringTransfers, 'transfer');
  return previews;
}

// ── CALENDAR
function initCalendar() {
  calViewDate = new Date(); calViewDate.setDate(1); calSelectedDay = new Date();
  const weekdays = ['M','D','M','D','F','S','S'].map(d => `<div>${d}</div>`).join('');
  document.getElementById('calWeekdays').innerHTML = weekdays;
  const wd2 = document.getElementById('calWeekdays2');
  if (wd2) wd2.innerHTML = weekdays;
  renderCalendar();
}

function isDesktop() { return window.matchMedia('(min-width: 768px)').matches; }
function changeMonth(delta) {
  const now = new Date();
  const next = new Date(calViewDate.getFullYear(), calViewDate.getMonth() + delta, 1);
  // On desktop, the second column already shows next month, so block one step earlier
  const limit = isDesktop() ? 1 : 0;
  const monthsAhead = (next.getFullYear() - now.getFullYear()) * 12 + next.getMonth() - now.getMonth();
  if (delta > 0 && monthsAhead > limit) return;
  calViewDate.setMonth(calViewDate.getMonth() + delta); calSelectedDay = null; renderCalendar();
}
function renderCalendar() {
  const desktop = isDesktop();
  // Show/hide second calendar card
  const card2 = document.getElementById('calCard2');
  const label2 = document.getElementById('calMonthLabel2');
  if (card2) card2.style.display = desktop ? '' : 'none';
  if (label2) label2.style.display = desktop ? '' : 'none';

  const year = calViewDate.getFullYear(), month = calViewDate.getMonth();
  const now2 = new Date();
  document.getElementById('calMonthLabel').textContent = calViewDate.toLocaleDateString('de-CH', { month: 'long', year: 'numeric' });

  // Next month for desktop
  const nextMonthDate = new Date(year, month + 1, 1);
  if (label2) label2.textContent = nextMonthDate.toLocaleDateString('de-CH', { month: 'long', year: 'numeric' });

  // Disable next button if already showing current+next (desktop) or current (mobile)
  const nextBtn = document.getElementById('calNavNext');
  if (nextBtn) {
    const isCurrentMonth = year === now2.getFullYear() && month === now2.getMonth();
    const isOneBeforeCurrent = (nextMonthDate.getFullYear() === now2.getFullYear() && nextMonthDate.getMonth() === now2.getMonth());
    const disabled = desktop ? isOneBeforeCurrent : isCurrentMonth;
    nextBtn.disabled = disabled;
    nextBtn.style.opacity = disabled ? '0.3' : '';
    nextBtn.style.cursor = disabled ? 'default' : '';
  }

  const byDay = {};
  state.entries.forEach(e => { (byDay[e.date] = byDay[e.date] || []).push(e); });
  const todayStr = dateKey(new Date());

  // Geplante (noch nicht gebuchte) wiederkehrende Einträge als Vorschau einblenden
  [
    ...getRecurringPreviewsForMonth(year, month),
    ...(desktop ? getRecurringPreviewsForMonth(nextMonthDate.getFullYear(), nextMonthDate.getMonth()) : []),
  ].forEach(e => { (byDay[e.date] = byDay[e.date] || []).push(e); });

  renderMonthGrid(year, month, byDay, todayStr, 'calGrid');
  if (desktop) renderMonthGrid(nextMonthDate.getFullYear(), nextMonthDate.getMonth(), byDay, todayStr, 'calGrid2');

  if (calSelectedDay) {
    const selYear = calSelectedDay.getFullYear(), selMonth = calSelectedDay.getMonth();
    if (selYear === year && selMonth === month) renderDayDetail(calSelectedDay);
    else if (desktop && selYear === nextMonthDate.getFullYear() && selMonth === nextMonthDate.getMonth()) renderDayDetail(calSelectedDay);
    else document.getElementById('dayDetail').style.display = 'none';
  } else {
    document.getElementById('dayDetail').style.display = 'none';
  }
}
function renderMonthGrid(year, month, byDay, todayStr, gridId) {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let html = '<div class="cal-day empty"></div>'.repeat(firstDow);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(new Date(year, month, d));
    const es  = byDay[key] || [];
    const incomeEs   = es.filter(e => e.type === 'income');
    const expenseEs  = es.filter(e => e.type === 'expense' || e.type === 'account-only');
    const transferEs = es.filter(e => e.type === 'transfer');
    // Ein Punkt gilt als "geplant", wenn ausschliesslich Vorschau-Einträge dahinterstecken
    const incomePlanned   = incomeEs.length   && incomeEs.every(e => e.isPreview);
    const expensePlanned  = expenseEs.length  && expenseEs.every(e => e.isPreview);
    const transferPlanned = transferEs.length && transferEs.every(e => e.isPreview);
    const dots = es.length ? `<div class="cal-day-dots">
      ${incomeEs.length   ? `<div class="cal-day-dot income${incomePlanned ? ' planned' : ''}"></div>`     : ''}
      ${expenseEs.length  ? `<div class="cal-day-dot expense${expensePlanned ? ' planned' : ''}"></div>`   : ''}
      ${transferEs.length ? `<div class="cal-day-dot transfer${transferPlanned ? ' planned' : ''}"></div>` : ''}
    </div>` : '';
    const cls = ['cal-day', key===todayStr?'today':'', calSelectedDay&&key===dateKey(calSelectedDay)?'selected':''].filter(Boolean).join(' ');
    html += `<div class="${cls}" onclick="selectCalDay(${year},${month},${d})"><span>${d}</span>${dots}</div>`;
  }
  document.getElementById(gridId).innerHTML = html;
}
function selectCalDay(year, month, day) { calSelectedDay = new Date(year, month, day); renderCalendar(); renderDayDetail(calSelectedDay); }
function renderDayDetail(dateObj) {
  const key = dateKey(dateObj);
  const real = state.entries.filter(e => e.date === key);
  const [year, month] = key.split('-').map(Number);
  const previews = getRecurringPreviewsForMonth(year, month - 1).filter(e => e.date === key);
  const entries = [...real, ...previews];
  const detailEl = document.getElementById('dayDetail');
  document.getElementById('dayDetailTitle').textContent = dateObj.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  detailEl.style.display = '';
  if (!entries.length) {
    document.getElementById('dayDetailTotal').textContent = '';
    document.getElementById('dayDetailList').innerHTML = '<div class="empty-tx">Keine Einträge an diesem Tag.</div>';
    return;
  }
  // Nur echte (bereits gebuchte) Einträge fliessen in die Summe ein — geplante
  // Vorschau-Einträge sind noch nicht real und würden den Saldo verfälschen.
  const totalEl = document.getElementById('dayDetailTotal');
  const realForNet = real.filter(e => e.type !== 'transfer');
  if (realForNet.length) {
    const net = realForNet.reduce((s, e) => s + (e.type==='income' ? e.amount : -e.amount), 0);
    totalEl.textContent = (net >= 0 ? '+' : '−') + 'CHF ' + formatNum(Math.abs(net));
    totalEl.style.color = net >= 0 ? 'var(--income)' : 'var(--danger)';
  } else if (real.length) {
    totalEl.textContent = 'Überweisung';
    totalEl.style.color = 'var(--muted)';
  } else {
    totalEl.textContent = 'geplant';
    totalEl.style.color = 'var(--muted)';
  }
  document.getElementById('dayDetailList').innerHTML = entries.map(e => {
    if (e.type === 'transfer') {
      const fromAcc = state.accounts.find(a => a.id === e.fromAccountId);
      const toAcc   = state.accounts.find(a => a.id === e.toAccountId);
      const plannedBadge = e.isPreview ? `<span class="tx-account-tag tx-planned-tag">🔮 geplant</span>` : '';
      return `<div class="tx-item${e.isPreview ? ' preview' : ''}">
        <div class="tx-cat-dot" style="background:#7c93ff"></div>
        <div class="tx-info">
          <div class="tx-cat-label">🔄 Interne Überweisung</div>
          <div class="tx-note">${fromAcc ? fromAcc.name : '?'} → ${toAcc ? toAcc.name : '?'}${plannedBadge}</div>
        </div>
        <div class="tx-amount" style="color:#7c93ff">${formatNum(e.amount)}</div>
      </div>`;
    }
    const cat = ALL_CATS.find(c => c.name === e.category) || { color: '#ccc', emoji: '?' };
    const isInc = e.type === 'income';
    const isAccOnly = e.type === 'account-only';
    const acc = e.accountId ? state.accounts.find(a => a.id === e.accountId) : null;
    const accTag = acc ? `<span class="tx-account-tag">🏦 ${acc.name}</span>` : '';
    const accOnlyBadge = isAccOnly ? `<span class="tx-account-tag" style="background:#f0f4ff;color:#4e8cf5;">nur Konto</span>` : '';
    const plannedBadge = e.isPreview ? `<span class="tx-account-tag tx-planned-tag">🔮 geplant</span>` : '';
    return `<div class="tx-item${e.isPreview ? ' preview' : ''}">
      <div class="tx-cat-dot" style="background:${cat.color}"></div>
      <div class="tx-info">
        <div class="tx-cat-label">${cat.emoji} ${e.category}</div>
        <div class="tx-note">${e.note ? e.note + (acc || isAccOnly || e.isPreview ? ' · ' : '') : ''}${accTag}${accOnlyBadge}${plannedBadge}</div>
      </div>
      <div class="tx-amount ${isInc ? 'income' : 'expense'}">${isInc ? '+' : '−'}${formatNum(e.amount)}</div>
    </div>`;
  }).join('');
}

// ── START
registerPageRender(renderCalendar);
initCalendar();

// Re-render calendar on resize (desktop <-> mobile toggle)
let _calResizeTimer;
window.addEventListener('resize', () => { clearTimeout(_calResizeTimer); _calResizeTimer = setTimeout(renderCalendar, 120); });
