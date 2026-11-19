/* ==========================================================
 * pages/planen.js – Planen: Netto-Vermögen, Sparkonten, Sparziele, Schulden
 * Benötigt assets/js/main.js
 *
 * Daten (in user_data.payload, siehe supabase/schema.sql):
 *   state.goals: { id, name, target, targetDate ('YYYY-MM' oder ''), accountId ('' = ohne Konto), saved, createdAt }
 *     saved = Betrag, der diesem Ziel zugeteilt ist. Auf einem Sparkonto gilt:
 *     frei = Kontostand − Summe der zugeteilten Beträge aller Ziele auf diesem Konto.
 *   state.debts: { id, name, direction ('owe' = ich schulde | 'owed' = mir schuldet jemand), person,
 *     amount (am Anfang), paidBefore (vor dem Erfassen schon bezahlt), rate, interest (% pro Jahr),
 *     dueDay, accountId, createdAt, payments: [{ id, date, amount, interest, principal, entryId }] }
 *   Ansicht über die Adresse: #konto-<id> (Sparkonto), #schuld-<id> (Schuld), sonst Übersicht.
 ========================================================== */

const round2 = n => Math.round(n * 100) / 100;
const GOAL_COLORS = ['var(--primary)', '#ff8ab3', '#ffc2d9', 'var(--transfer)', '#f59e42', '#34d399'];
let goalEditId = null, debtEditId = null, payDebtId = null, allocAccountId = null, goalAccountPrev = '';
let showAllRates = false;

// ── BERECHNUNGEN
function savingAccounts() { return state.accounts.filter(isSavingAccount); }
function goalsOn(accountId) { return state.goals.filter(g => g.accountId && g.accountId === accountId); }
function accountFree(accountId, exceptGoalId = null) {
  const acc = state.accounts.find(a => a.id === accountId);
  if (!acc) return 0;
  return round2(acc.balance - goalsOn(accountId).filter(g => g.id !== exceptGoalId).reduce((s, g) => s + (g.saved || 0), 0));
}
function monthsUntil(ym) {
  if (!ym) return 0;
  const [y, m] = ym.split('-').map(Number);
  const now = new Date();
  return (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
}
function monthLabel(d, short = false) {
  return d.toLocaleDateString('de-CH', short ? { month: 'short', year: 'numeric' } : { month: 'long', year: 'numeric' });
}
function ymLabel(ym, short = false) {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return monthLabel(new Date(y, m - 1, 1), short);
}
// Pro Monat nötig, um das Ziel bis zum Datum zu erreichen (null = kein Datum oder schon erreicht)
function goalPerMonth(g) {
  const rest = g.target - (g.saved || 0);
  if (!g.targetDate || rest <= 0) return null;
  return round2(rest / Math.max(1, monthsUntil(g.targetDate) + 1));
}

function debtRemaining(d) {
  const paid = (d.paidBefore || 0) + d.payments.reduce((s, p) => s + (p.principal ?? p.amount), 0);
  return Math.max(0, round2(d.amount - paid));
}
// Nächster Fälligkeitstag: in diesem Monat, ausser es wurde diesen Monat schon bezahlt
function nextDueDate(d) {
  const now = new Date();
  const day = Math.min(28, Math.max(1, d.dueDay || 1));
  const paidThisMonth = d.payments.some(p => p.date.slice(0, 7) === monthKey(now));
  return new Date(now.getFullYear(), now.getMonth() + (paidThisMonth ? 1 : 0), day);
}
// Abzahlplan ab heute: mit Zins als Annuität (Zins auf dem Restbetrag), ohne Zins einfach geteilt
function debtSchedule(d, rate = d.rate) {
  let rem = debtRemaining(d);
  const i = (d.interest || 0) / 100 / 12;
  const rows = [];
  if (!rate || rem <= 0) return { rows, totalInterest: 0, end: null, never: false };
  let date = nextDueDate(d), totalInterest = 0;
  while (rem > 0.004 && rows.length < 600) {
    const int = round2(rem * i);
    if (rate <= int) return { rows, totalInterest, end: null, never: true };
    const pay = round2(Math.min(rate, rem + int));
    rem = round2(rem - (pay - int));
    totalInterest = round2(totalInterest + int);
    rows.push({ date: new Date(date), amount: pay, interest: int, rest: rem });
    date = new Date(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }
  return { rows, totalInterest, end: rows.length ? rows[rows.length - 1].date : null, never: false };
}

// ── ÜBERSICHT
function render() {
  if (!dataReady) return;
  const hash = decodeURIComponent(location.hash.slice(1));
  const view = document.getElementById('planenView');
  if (hash.startsWith('konto-') && state.accounts.some(a => a.id === hash.slice(6))) view.innerHTML = accountDetailHtml(hash.slice(6));
  else if (hash.startsWith('schuld-') && state.debts.some(d => d.id === hash.slice(7))) view.innerHTML = debtDetailHtml(hash.slice(7));
  else view.innerHTML = overviewHtml();
}

function overviewHtml() {
  const everyday = round2(state.accounts.filter(a => !isSavingAccount(a)).reduce((s, a) => s + a.balance, 0));
  const saving = round2(savingAccounts().reduce((s, a) => s + a.balance, 0));
  const owe = state.debts.filter(d => d.direction !== 'owed');
  const owed = state.debts.filter(d => d.direction === 'owed');
  const debtSum = round2(owe.reduce((s, d) => s + debtRemaining(d), 0));
  const net = round2(everyday + saving - debtSum);
  const all = Math.max(1, Math.abs(everyday) + Math.abs(saving) + debtSum);
  const pct = v => (Math.abs(v) / all * 100).toFixed(1) + '%';

  const accRows = savingAccounts().map(a => {
    const n = goalsOn(a.id).length, free = accountFree(a.id);
    const sub = n ? `${n === 1 ? '1 Ziel' : n + ' Ziele'}, CHF ${formatNum(free)} frei` : 'noch kein Ziel';
    return `<a class="pl-row pl-link" href="#konto-${esc(a.id)}">
        <span class="pl-row-main"><span class="pl-name">${esc(a.name)}</span><span class="pl-sub">${sub}</span></span>
        <span class="pl-amt">${formatNum(a.balance)}</span><span class="ico ico-arrow-right pl-chev" aria-hidden="true"></span></a>`;
  }).join('');

  return `
    <section class="pl-net" aria-label="Netto-Vermögen">
      <div class="pl-label">Netto-Vermögen</div>
      <div class="pl-hero">CHF ${formatNum(net)}</div>
      <div class="pl-stack" aria-hidden="true">
        <span style="width:${pct(everyday)};background:var(--primary-dark)"></span><span style="width:${pct(saving)};background:#ff8ab3"></span><span style="width:${pct(debtSum)};background:var(--primary-light)"></span>
      </div>
      <div class="pl-legend">
        <span><i style="background:var(--primary-dark)"></i>Alltag ${formatNum(everyday)}</span>
        <span><i style="background:#ff8ab3"></i>Sparen ${formatNum(saving)}</span>
        <span><i style="background:var(--primary-light)"></i>Schulden ${formatNum(debtSum)}</span>
      </div>
    </section>

    <section class="pl-section">
      <h2 class="pl-h">Sparkonten</h2>
      ${accRows ? `<div class="pl-list">${accRows}</div>` : `<p class="pl-empty">Noch kein Sparkonto. Du legst eines an, wenn du ein Sparziel hinzufügst, oder in den Einstellungen unter Konten.</p>`}
    </section>

    <section class="pl-section">
      <h2 class="pl-h">Sparziele <button class="pl-h-link" onclick="openGoalModal()">Neues Ziel</button></h2>
      ${state.goals.length ? `<div class="pl-list">${state.goals.map(goalRowHtml).join('')}</div>` : `<p class="pl-empty">Noch kein Sparziel. Leg eines an, zum Beispiel für Ferien oder einen Notgroschen.</p>`}
    </section>

    <section class="pl-section">
      <h2 class="pl-h">Schulden <button class="pl-h-link" onclick="openDebtModal()">Neue Schuld</button></h2>
      ${owe.length ? debtChartCardHtml(owe) : ''}
      ${owe.length ? `<h3 class="pl-h3">Ich schulde</h3><div class="pl-list">${owe.map(debtRowHtml).join('')}</div>` : ''}
      ${owed.length ? `<h3 class="pl-h3">Mir schuldet</h3><div class="pl-list">${owed.map(debtRowHtml).join('')}</div>` : ''}
      ${!state.debts.length ? `<p class="pl-empty">Keine Schulden erfasst. Hier behältst du Kredite, Abzahlungen und geliehenes Geld im Blick.</p>` : ''}
    </section>`;
}

function goalRowHtml(g) {
  const acc = g.accountId ? state.accounts.find(a => a.id === g.accountId) : null;
  const saved = g.saved || 0;
  const reached = saved >= g.target;
  const per = goalPerMonth(g);
  const parts = [acc ? esc(acc.name) : 'Ohne Konto'];
  if (g.targetDate) parts.push('bis ' + ymLabel(g.targetDate));
  const sub = parts.join(', ') + (reached ? ', <b class="pl-ok">erreicht</b>' : per ? `, CHF ${formatNum(per)} pro Monat` : '');
  const w = Math.min(100, g.target ? saved / g.target * 100 : 0);
  return `<button class="pl-row pl-goal" onclick="openGoalModal(${jsArg(g.id)})">
      <span class="pl-row-top"><span class="pl-row-main"><span class="pl-name">${esc(g.name)}</span><span class="pl-sub">${sub}</span></span>
      <span class="pl-amt">${formatNum(saved)}<small>von ${formatNum(g.target)}</small></span></span>
      <span class="pl-bar"><span style="width:${w.toFixed(1)}%"></span></span></button>`;
}

function debtRowHtml(d) {
  const rem = debtRemaining(d);
  const owed = d.direction === 'owed';
  const sub = d.rate ? `CHF ${formatNum(d.rate)} am ${d.dueDay || 1}.${d.interest ? ', ' + String(d.interest).replace('.', '.') + ' %' : ''}` : (d.person ? esc(d.person) : 'ohne feste Rate');
  const w = d.amount ? (1 - rem / d.amount) * 100 : 0;
  return `<a class="pl-row pl-link pl-goal" href="#schuld-${esc(d.id)}">
      <span class="pl-row-top"><span class="pl-row-main"><span class="pl-name">${esc(d.name)}</span><span class="pl-sub">${rem <= 0 ? '<b class="pl-ok">abbezahlt</b>' : sub}</span></span>
      <span class="pl-amt${owed ? ' pl-pos' : ''}">${formatNum(rem)}<small>von ${formatNum(d.amount)}</small></span><span class="ico ico-arrow-right pl-chev" aria-hidden="true"></span></span>
      <span class="pl-bar pl-bar-paid"><span style="width:${Math.max(0, Math.min(100, w)).toFixed(1)}%"></span></span></a>`;
}

// Verlauf aller eigenen Schulden: Restbetrag Monat für Monat bis «schuldenfrei»
function debtChartCardHtml(owe) {
  const total = round2(owe.reduce((s, d) => s + debtRemaining(d), 0));
  const plans = owe.map(d => ({ d, plan: debtSchedule(d) }));
  const open = plans.filter(p => debtRemaining(p.d) > 0);
  const withEnd = open.filter(p => p.plan.end);
  const allEnd = open.length && withEnd.length === open.length;
  const end = allEnd ? new Date(Math.max(...withEnd.map(p => p.plan.end))) : null;
  const head = `<div class="pl-chart-head"><div><div class="pl-label">Noch offen, alle Schulden</div><div class="pl-chart-total">CHF ${formatNum(total)}</div></div>
      <div class="pl-chart-end"><div class="pl-label">Schuldenfrei</div><div class="pl-ok">${end ? monthLabel(end, true) : total > 0 ? 'offen' : 'jetzt'}</div></div></div>`;
  if (!withEnd.length) return `<div class="card pl-chart">${head}</div>`;
  // Monatswerte: heute + jede künftige Rate
  const now = new Date(); now.setDate(1);
  const months = Math.max(2, ...withEnd.map(p => p.plan.rows.length)) + 1;
  const values = [];
  for (let m = 0; m < months; m++) {
    values.push(open.reduce((s, p) => {
      if (!p.plan.rows.length) return s + debtRemaining(p.d);
      return s + (m === 0 ? debtRemaining(p.d) : (p.plan.rows[m - 1] ? p.plan.rows[m - 1].rest : 0));
    }, 0));
  }
  const W = 300, H = 92, pad = 6, max = Math.max(...values, 1);
  const X = m => (m / (months - 1) * W).toFixed(1);
  const Y = v => (pad + (1 - v / max) * (H - 2 * pad)).toFixed(1);
  const line = values.map((v, m) => `${m ? 'L' : 'M'}${X(m)},${Y(v)}`).join(' ');
  const dots = withEnd.length > 1 ? withEnd.filter(p => +p.plan.end !== +end).map(p => {
    const m = p.plan.rows.length; return `<circle cx="${X(m)}" cy="${Y(values[m])}" r="4" class="pl-dot-end"><title>${esc(p.d.name)} fertig</title></circle>`;
  }).join('') : '';
  // Beschriftung: heute, Jahreswechsel (höchstens 3), Ende
  const labels = [`<span style="left:0">heute</span>`];
  const yearMarks = [];
  for (let m = 1; m < months; m++) { const d = new Date(now.getFullYear(), now.getMonth() + m, 1); if (d.getMonth() === 0) yearMarks.push({ m, t: d.getFullYear() }); }
  const step = Math.ceil(yearMarks.length / 3) || 1;
  yearMarks.filter((_, i) => i % step === 0).forEach(y => { if (y.m / (months - 1) < .85 && y.m / (months - 1) > .15) labels.push(`<span style="left:${(y.m / (months - 1) * 100).toFixed(1)}%">${y.t}</span>`); });
  labels.push(`<span style="right:0">${end ? monthLabel(end, true) : ''}</span>`);
  return `<div class="card pl-chart">${head}
      <svg class="pl-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Restbetrag sinkt bis ${end ? monthLabel(end) : 'später'}">
        <path d="${line} L${W},${H} L0,${H} Z" class="pl-area"/><path d="${line}" class="pl-line" vector-effect="non-scaling-stroke"/>
        <circle cx="0" cy="${Y(values[0])}" r="4" class="pl-dot-now"/>${dots}
      </svg>
      <div class="pl-axis">${labels.join('')}</div></div>`;
}

// ── SPARKONTO: Verteilung auf die Ziele
function accountDetailHtml(id) {
  const a = state.accounts.find(x => x.id === id);
  const goals = goalsOn(id);
  const free = accountFree(id);
  const total = Math.max(a.balance, goals.reduce((s, g) => s + (g.saved || 0), 0), 1);
  const segs = goals.map((g, i) => `<span style="width:${((g.saved || 0) / total * 100).toFixed(1)}%;background:${GOAL_COLORS[i % GOAL_COLORS.length]}"></span>`).join('') +
    (free > 0 ? `<span style="width:${(free / total * 100).toFixed(1)}%;background:var(--surface)"></span>` : '');
  const rows = goals.map((g, i) => `<button class="pl-row" onclick="openGoalModal(${jsArg(g.id)})">
      <span class="pl-swatch" style="background:${GOAL_COLORS[i % GOAL_COLORS.length]}"></span>
      <span class="pl-row-main"><span class="pl-name">${esc(g.name)}</span><span class="pl-sub">Ziel ${formatNum(g.target)}${g.targetDate ? ' bis ' + ymLabel(g.targetDate) : ''}</span></span>
      <span class="pl-amt">${formatNum(g.saved || 0)}<small>${g.target ? Math.round((g.saved || 0) / g.target * 100) : 0} %</small></span></button>`).join('');
  const freeRow = `<div class="pl-row"><span class="pl-swatch pl-swatch-free"></span>
      <span class="pl-row-main"><span class="pl-name">${free < 0 ? 'Zu viel zugeteilt' : 'Noch frei'}</span><span class="pl-sub">${free < 0 ? 'mehr zugeteilt, als auf dem Konto ist' : 'keinem Ziel zugeteilt'}</span></span>
      <span class="pl-amt${free < 0 ? ' pl-neg' : ''}">${formatNum(free)}</span></div>`;
  const deposits = state.entries
    .filter(e => (e.type === 'transfer' && e.toAccountId === id) || (e.type === 'income' && e.accountId === id))
    .sort((x, y) => y.date.localeCompare(x.date)).slice(0, 5)
    .map(e => {
      const from = e.type === 'transfer' ? state.accounts.find(x => x.id === e.fromAccountId) : null;
      const title = e.note || (e.type === 'transfer' ? 'Überweisung' : e.category);
      const sub = new Date(e.date + 'T00:00:00').toLocaleDateString('de-CH', { day: 'numeric', month: 'short' }) + (from ? ', von ' + esc(from.name) : '');
      return `<div class="pl-row"><span class="pl-row-main"><span class="pl-name">${esc(title)}</span><span class="pl-sub">${sub}</span></span><span class="pl-amt pl-pos">+${formatNum(e.amount)}</span></div>`;
    }).join('');
  return `
    <a class="pl-back" href="#"><span class="ico ico-arrow-left" aria-hidden="true"></span>Planen</a>
    <h2 class="pl-title">${esc(a.name)}</h2>
    <div class="pl-hero">CHF ${formatNum(a.balance)}</div>
    <div class="pl-sub-lg">${goals.length === 1 ? '1 Sparziel' : goals.length + ' Sparziele'}</div>
    <section class="pl-section">
      <h3 class="pl-h">So ist das Geld verteilt</h3>
      <div class="pl-alloc" aria-hidden="true">${segs || '<span style="width:100%;background:var(--surface)"></span>'}</div>
      <div class="pl-list">${rows}${freeRow}</div>
    </section>
    ${goals.length
      ? `<button class="btn-save pl-wide" onclick="openAllocModal(${jsArg(id)})"${free <= 0 ? ' disabled' : ''}>Freies Geld einem Ziel zuteilen</button>`
      : `<button class="btn-save pl-wide" onclick="openGoalModal(null, ${jsArg(id)})">Sparziel hinzufügen</button>`}
    <section class="pl-section">
      <h3 class="pl-h">Letzte Einzahlungen</h3>
      ${deposits ? `<div class="pl-list">${deposits}</div>` : '<p class="pl-empty">Noch keine Einzahlungen. Überweisungen auf dieses Konto erscheinen hier.</p>'}
    </section>`;
}

// ── SCHULD: Restbetrag und Abzahlplan
function debtDetailHtml(id) {
  const d = state.debts.find(x => x.id === id);
  const owed = d.direction === 'owed';
  const rem = debtRemaining(d);
  const plan = debtSchedule(d);
  const w = d.amount ? Math.max(0, Math.min(100, (1 - rem / d.amount) * 100)) : 0;
  const kv = [];
  if (d.rate) kv.push(['Monatsrate', 'CHF ' + formatNum(d.rate)]);
  if (rem <= 0) kv.push(['Status', '<span class="pl-ok">abbezahlt</span>']);
  else if (plan.end) kv.push([owed ? 'Zurück bis' : 'Fertig bezahlt', `<span class="pl-ok">${monthLabel(plan.end, true)}</span>`]);
  if (d.interest && rem > 0 && plan.end) kv.push(['Zins total noch', 'CHF ' + formatNum(plan.totalInterest)]);
  if (d.interest) kv.push(['Zins', String(d.interest) + ' %']);
  const paid = d.payments.slice().sort((x, y) => y.date.localeCompare(x.date));
  const shortDate = dt => dt.toLocaleDateString('de-CH', { month: 'short', year: 'numeric' });
  const paidRows = paid.slice(0, showAllRates ? paid.length : 2).reverse().map(p => `<div class="pl-plan-row is-paid">
      <span class="pl-plan-dot"><span class="ico ico-check" aria-hidden="true"></span></span><span class="pl-plan-date">${shortDate(new Date(p.date + 'T00:00:00'))}</span>
      <span class="pl-plan-what">bezahlt</span><span class="pl-plan-amt">CHF ${formatNum(p.amount)}</span>
      <button class="tx-btn delete" onclick="deletePayment(${jsArg(d.id)}, ${jsArg(p.id)})" aria-label="Zahlung löschen"><span class="ico ico-trash"></span></button></div>`).join('');
  const future = plan.rows.slice(0, showAllRates ? plan.rows.length : 3).map((r, i) => `<div class="pl-plan-row${i === 0 ? ' is-next' : ''}">
      <span class="pl-plan-dot"></span><span class="pl-plan-date">${shortDate(r.date)}</span>
      <span class="pl-plan-what">${i === 0 ? (r.date < new Date(new Date().toDateString()) ? 'fällig' : 'nächste Rate') : 'Rate'}</span><span class="pl-plan-amt">CHF ${formatNum(r.amount)}</span></div>`).join('');
  const more = plan.rows.length > 3 || paid.length > 2;
  const planBox = d.rate
    ? `<section class="pl-section"><h3 class="pl-h">Abzahlplan${more ? ` <button class="pl-h-link" onclick="toggleAllRates()">${showAllRates ? 'Weniger zeigen' : `Alle ${plan.rows.length} Raten`}</button>` : ''}</h3>
        ${plan.never ? '<p class="pl-warn">Die Rate ist kleiner als der Zins. So wird die Schuld nie kleiner. Erhöhe die Monatsrate.</p>' : ''}
        ${paidRows || future ? `<div class="card pl-plan">${paidRows}${future}</div>` : '<p class="pl-empty">Alles bezahlt.</p>'}</section>`
    : `<section class="pl-section"><h3 class="pl-h">Zahlungen</h3>${paidRows ? `<div class="card pl-plan">${paidRows}</div>` : '<p class="pl-empty">Noch keine Zahlung erfasst. Ohne feste Rate trägst du jede Zahlung selbst ein.</p>'}</section>`;
  return `
    <div class="pl-top-row"><a class="pl-back" href="#"><span class="ico ico-arrow-left" aria-hidden="true"></span>Planen</a>
      <button class="pl-h-link" onclick="openDebtModal(${jsArg(d.id)})">Bearbeiten</button></div>
    <h2 class="pl-title">${esc(d.name)}</h2>
    <div class="pl-hero${owed ? ' pl-pos' : ''}">CHF ${formatNum(rem)}</div>
    <div class="pl-sub-lg">noch offen von CHF ${formatNum(d.amount)}${d.person ? ', ' + esc(d.person) : ''}</div>
    <div class="pl-bar pl-bar-paid pl-bar-lg"><span style="width:${w.toFixed(1)}%"></span></div>
    ${kv.length ? `<div class="pl-kv">${kv.map(([k, v]) => `<div class="card"><div class="pl-label">${k}</div><div class="pl-kv-v">${v}</div></div>`).join('')}</div>` : ''}
    ${planBox}
    ${rem > 0 ? `<button class="btn-save pl-wide" onclick="openPayModal(${jsArg(d.id)})"><span class="ico ico-check" aria-hidden="true"></span> ${owed ? 'Rückzahlung erhalten' : d.rate ? 'Rate bezahlt' : 'Zahlung erfassen'}</button>` : ''}`;
}
function toggleAllRates() { showAllRates = !showAllRates; render(); }

// ── SPARZIEL HINZUFÜGEN / BEARBEITEN
function fillGoalAccountSelect(selected) {
  const sel = document.getElementById('goalAccount');
  sel.innerHTML = savingAccounts().map(a =>
      `<option value="${esc(a.id)}" data-icon="piggy" data-sub="CHF ${formatNum(accountFree(a.id, goalEditId))} frei">${esc(a.name)}</option>`).join('') +
    `<option value="__none" data-icon="banned" data-sub="Den Stand trägst du selbst ein">Ohne Konto</option>` +
    `<option value="__new" data-icon="plus">Neues Sparkonto anlegen</option>`;
  sel.value = selected || '__none';
  goalAccountPrev = sel.value;
}
// «Ohne Konto» hat den Wert __none, weil die Auswahlliste leere Werte als Platzhalter ausblendet
function goalAccountValue() { const v = document.getElementById('goalAccount').value; return v === '__none' ? '' : v; }
function openGoalModal(id = null, accountId = null) {
  goalEditId = id;
  const g = id ? state.goals.find(x => x.id === id) : null;
  document.getElementById('goalModalTitle').textContent = g ? 'Sparziel bearbeiten' : 'Sparziel hinzufügen';
  document.getElementById('goalName').value = g ? g.name : '';
  document.getElementById('goalTarget').value = g ? g.target : '';
  document.getElementById('goalDate').value = g ? (g.targetDate || '') : '';
  document.getElementById('goalSaved').value = g && g.saved ? g.saved : '';
  const firstSaving = savingAccounts()[0];
  fillGoalAccountSelect(g ? (g.accountId || '') : accountId || (firstSaving ? firstSaving.id : ''));
  document.getElementById('goalDeleteBtn').hidden = !g;
  updateGoalHint();
  document.getElementById('goalModal').classList.add('show');
}
function closeGoalModal() { document.getElementById('goalModal').classList.remove('show'); goalEditId = null; }
function onGoalAccountChange() {
  const sel = document.getElementById('goalAccount');
  if (sel.value === '__new') {
    sel.value = goalAccountPrev; // bleibt beim bisherigen Konto, bis das neue angelegt ist
    openSavingAccountModal();
    return;
  }
  goalAccountPrev = sel.value;
  updateGoalHint();
}
function updateGoalHint() {
  const accId = goalAccountValue();
  const saved = parseAmount(document.getElementById('goalSaved').value) || 0;
  const hint = document.getElementById('goalSavedHint');
  document.getElementById('goalSavedLabel').textContent = accId ? 'Davon schon gespart (CHF)' : 'Schon gespart (CHF)';
  if (!accId) { hint.textContent = 'Den Stand änderst du später hier.'; hint.classList.remove('is-warn'); return; }
  const left = round2(accountFree(accId, goalEditId) - saved);
  hint.textContent = left >= 0 ? `Danach noch CHF ${formatNum(left)} frei auf dem Sparkonto.` : `Das sind CHF ${formatNum(-left)} mehr, als auf dem Sparkonto frei ist.`;
  hint.classList.toggle('is-warn', left < 0);
}
function saveGoal() {
  const name = document.getElementById('goalName').value.trim();
  const target = parseAmount(document.getElementById('goalTarget').value);
  const targetDate = document.getElementById('goalDate').value || '';
  const accountId = goalAccountValue();
  const saved = round2(parseAmount(document.getElementById('goalSaved').value) || 0);
  if (!name) { showError('Sparziel nicht gespeichert', 'Der Name fehlt. Gib dem Sparziel einen Namen, zum Beispiel Ferien.', 'goalName'); return; }
  if (isNaN(target) || target <= 0) { showError('Sparziel nicht gespeichert', 'Der Zielbetrag fehlt. Gib einen Betrag über 0 ein.', 'goalTarget'); return; }
  if (saved < 0) { showError('Sparziel nicht gespeichert', 'Der gesparte Betrag kann nicht negativ sein. Gib 0 oder mehr ein.', 'goalSaved'); return; }
  if (accountId && saved > accountFree(accountId, goalEditId)) {
    showError('Sparziel nicht gespeichert', `Auf dem Sparkonto sind nur CHF ${formatNum(accountFree(accountId, goalEditId))} frei. Gib höchstens diesen Betrag ein.`, 'goalSaved');
    return;
  }
  if (goalEditId) {
    const g = state.goals.find(x => x.id === goalEditId);
    if (g) Object.assign(g, { name, target, targetDate, accountId, saved });
  } else {
    state.goals.push({ id: uid(), name, target, targetDate, accountId, saved, createdAt: dateKey(new Date()) });
  }
  const wasNew = !goalEditId;
  saveState(); closeGoalModal(); render();
  showToast(wasNew ? 'Sparziel gespeichert' : 'Gespeichert', wasNew ? { text: `«${name}» steht jetzt unter Sparziele.` } : {});
}
function deleteGoal() {
  const id = goalEditId;
  closeGoalModal();
  deleteWithUndo(() => { state.goals = state.goals.filter(g => g.id !== id); }, 'Sparziel gelöscht', 'Das Geld bleibt auf dem Konto. Du kannst es noch ein paar Sekunden rückgängig machen.');
}

// ── NEUES SPARKONTO (direkt aus dem Sparziel)
function openSavingAccountModal() {
  document.getElementById('savingAccountName').value = '';
  document.getElementById('savingAccountBalance').value = '';
  document.getElementById('savingAccountModal').classList.add('show');
}
function closeSavingAccountModal() { document.getElementById('savingAccountModal').classList.remove('show'); }
function saveSavingAccount() {
  const name = document.getElementById('savingAccountName').value.trim();
  const balance = round2(parseAmount(document.getElementById('savingAccountBalance').value) || 0);
  if (!name) { showError('Sparkonto nicht angelegt', 'Der Name fehlt. Gib dem Konto einen Namen, zum Beispiel Sparkonto.', 'savingAccountName'); return; }
  const acc = { id: uid(), name, balance, visible: false, kind: 'saving' };
  state.accounts.push(acc);
  saveState();
  closeSavingAccountModal();
  fillGoalAccountSelect(acc.id);
  updateGoalHint();
  showToast('Sparkonto angelegt', { text: `«${name}» ist mit diesem Sparziel verknüpft.` });
}

// ── FREIES GELD EINEM ZIEL ZUTEILEN
function openAllocModal(accountId) {
  allocAccountId = accountId;
  const acc = state.accounts.find(a => a.id === accountId);
  const goals = goalsOn(accountId);
  document.getElementById('allocSub').textContent = `Auf «${acc.name}» sind CHF ${formatNum(accountFree(accountId))} frei.`;
  const sel = document.getElementById('allocGoal');
  sel.innerHTML = goals.map(g => `<option value="${esc(g.id)}" data-icon="" data-sub="${formatNum(g.saved || 0)} von ${formatNum(g.target)}">${esc(g.name)}</option>`).join('');
  sel.value = (goals.find(g => (g.saved || 0) < g.target) || goals[0]).id;
  onAllocGoalChange();
  document.getElementById('allocModal').classList.add('show');
}
function onAllocGoalChange() {
  const g = state.goals.find(x => x.id === document.getElementById('allocGoal').value);
  const free = accountFree(allocAccountId);
  const need = g ? Math.max(0, round2(g.target - (g.saved || 0))) : free;
  document.getElementById('allocAmount').value = formatNum(Math.min(free, need || free)).replace(/[’']/g, '');
}
function closeAllocModal() { document.getElementById('allocModal').classList.remove('show'); }
function saveAlloc() {
  const g = state.goals.find(x => x.id === document.getElementById('allocGoal').value);
  const amount = round2(parseAmount(document.getElementById('allocAmount').value));
  const free = accountFree(allocAccountId);
  if (!g) { showError('Nicht zugeteilt', 'Das Sparziel fehlt. Wähle ein Sparziel aus.', 'allocGoal'); return; }
  if (isNaN(amount) || amount <= 0) { showError('Nicht zugeteilt', 'Der Betrag fehlt. Gib einen Betrag über 0 ein.', 'allocAmount'); return; }
  if (amount > free) { showError('Nicht zugeteilt', `Es sind nur CHF ${formatNum(free)} frei. Gib höchstens diesen Betrag ein.`, 'allocAmount'); return; }
  g.saved = round2((g.saved || 0) + amount);
  saveState(); closeAllocModal(); render();
  showToast('Zugeteilt', { text: `«${g.name}» hat jetzt CHF ${formatNum(g.saved)} von ${formatNum(g.target)}.` });
}

// ── SCHULD HINZUFÜGEN / BEARBEITEN
function fillAccountSelect(sel, selected) {
  const list = state.accounts.filter(a => !isSavingAccount(a)).concat(savingAccounts());
  sel.innerHTML = '<option value="">Kein Konto</option>' + list.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
  sel.value = selected && list.some(a => a.id === selected) ? selected : (list[0] ? list[0].id : '');
}
function openDebtModal(id = null) {
  debtEditId = id;
  const d = id ? state.debts.find(x => x.id === id) : null;
  document.getElementById('debtModalTitle').textContent = d ? 'Schuld bearbeiten' : 'Schuld hinzufügen';
  document.getElementById('debtDirection').value = d ? (d.direction || 'owe') : 'owe';
  document.getElementById('debtName').value = d ? d.name : '';
  document.getElementById('debtPerson').value = d ? (d.person || '') : '';
  document.getElementById('debtAmount').value = d ? d.amount : '';
  document.getElementById('debtOpen').value = d ? debtRemaining(d) : '';
  document.getElementById('debtRate').value = d && d.rate ? d.rate : '';
  document.getElementById('debtInterest').value = d && d.interest ? d.interest : '';
  const day = document.getElementById('debtDueDay');
  day.innerHTML = Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}">${i + 1}. des Monats</option>`).join('');
  day.value = String(d ? (d.dueDay || 1) : 1);
  fillAccountSelect(document.getElementById('debtAccount'), d ? d.accountId : '');
  document.getElementById('debtDeleteBtn').hidden = !d;
  updateDebtFormUi();
  document.getElementById('debtModal').classList.add('show');
}
function updateDebtFormUi() {
  const owed = document.getElementById('debtDirection').value === 'owed';
  document.getElementById('debtPersonLabel').textContent = owed ? 'Wer (optional)' : 'Bei wem (optional)';
  document.getElementById('debtName').placeholder = owed ? 'z.B. Lea, Konzerttickets' : 'z.B. Privatkredit';
  document.getElementById('debtPerson').placeholder = owed ? 'z.B. Lea' : 'z.B. Bank Cler';
  document.getElementById('debtAccountLabel').textContent = owed ? 'Zurück auf Konto' : 'Bezahlt von Konto';
}
function syncDebtOpen() {
  // «Noch offen» folgt dem Anfangsbetrag, solange man es nicht selbst ändert
  const open = document.getElementById('debtOpen');
  if (!debtEditId && !open.dataset.touched) open.value = document.getElementById('debtAmount').value;
}
document.getElementById('debtOpen').addEventListener('input', e => { e.target.dataset.touched = '1'; });
function closeDebtModal() { document.getElementById('debtModal').classList.remove('show'); debtEditId = null; delete document.getElementById('debtOpen').dataset.touched; }
function saveDebt() {
  const direction = document.getElementById('debtDirection').value === 'owed' ? 'owed' : 'owe';
  const name = document.getElementById('debtName').value.trim();
  const person = document.getElementById('debtPerson').value.trim();
  const amount = round2(parseAmount(document.getElementById('debtAmount').value));
  const openRaw = document.getElementById('debtOpen').value.trim();
  const open = openRaw === '' ? amount : round2(parseAmount(openRaw));
  const rate = round2(parseAmount(document.getElementById('debtRate').value) || 0);
  const interest = Math.max(0, parseFloat(String(document.getElementById('debtInterest').value).replace(',', '.')) || 0);
  const dueDay = +document.getElementById('debtDueDay').value || 1;
  const accountId = document.getElementById('debtAccount').value || '';
  if (!name) { showError('Nicht gespeichert', 'Der Name fehlt. Gib einen Namen ein, zum Beispiel Privatkredit.', 'debtName'); return; }
  if (isNaN(amount) || amount <= 0) { showError('Nicht gespeichert', 'Der Betrag fehlt. Gib einen Betrag über 0 ein.', 'debtAmount'); return; }
  if (isNaN(open) || open < 0 || open > amount) { showError('Nicht gespeichert', '«Noch offen» muss zwischen 0 und dem Anfangsbetrag liegen. Prüf die beiden Beträge.', 'debtOpen'); return; }
  if (debtEditId) {
    const d = state.debts.find(x => x.id === debtEditId);
    if (d) {
      Object.assign(d, { direction, name, person, amount, rate, interest, dueDay, accountId });
      // «Noch offen» geändert → Differenz als «vorher bezahlt» verbuchen, Zahlungen bleiben
      const paidLater = d.payments.reduce((s, p) => s + (p.principal ?? p.amount), 0);
      d.paidBefore = Math.max(0, round2(amount - open - paidLater));
    }
  } else {
    state.debts.push({ id: uid(), direction, name, person, amount, paidBefore: round2(amount - open), rate, interest, dueDay, accountId, createdAt: dateKey(new Date()), payments: [] });
  }
  saveState(); closeDebtModal(); render();
  showToast('Gespeichert');
}
function deleteDebt() {
  const id = debtEditId;
  closeDebtModal();
  if (location.hash === '#schuld-' + id) history.replaceState(null, '', location.pathname);
  deleteWithUndo(() => { state.debts = state.debts.filter(d => d.id !== id); }, 'Schuld gelöscht', 'Bereits erfasste Zahlungen bleiben als Einträge. Du kannst es noch ein paar Sekunden rückgängig machen.');
}

// ── ZAHLUNG: Rate bezahlt / Rückzahlung erhalten → erfasst auch einen Eintrag
function openPayModal(id) {
  payDebtId = id;
  const d = state.debts.find(x => x.id === id);
  const owed = d.direction === 'owed';
  const rem = debtRemaining(d);
  const next = debtSchedule(d).rows[0];
  document.getElementById('payTitle').textContent = owed ? 'Rückzahlung erhalten' : d.rate ? 'Rate bezahlt' : 'Zahlung erfassen';
  document.getElementById('paySub').textContent = owed
    ? `Wird als Einnahme «Rückzahlung» erfasst. Noch offen: CHF ${formatNum(rem)}.`
    : `Wird als Ausgabe «Schulden» erfasst und zählt zu deinem Monatsbudget. Noch offen: CHF ${formatNum(rem)}.`;
  document.getElementById('payAmount').value = (next ? next.amount : rem).toFixed(2);
  document.getElementById('payDate').valueAsDate = new Date();
  document.getElementById('payAccountLabel').textContent = owed ? 'Auf Konto' : 'Von Konto';
  fillAccountSelect(document.getElementById('payAccount'), d.accountId);
  document.getElementById('payModal').classList.add('show');
}
function closePayModal() { document.getElementById('payModal').classList.remove('show'); payDebtId = null; }
function savePayment() {
  const d = state.debts.find(x => x.id === payDebtId);
  if (!d) return;
  const amount = round2(parseAmount(document.getElementById('payAmount').value));
  const date = document.getElementById('payDate').value || dateKey(new Date());
  const accountId = document.getElementById('payAccount').value || '';
  if (isNaN(amount) || amount <= 0) { showError('Nicht gespeichert', 'Der Betrag fehlt. Gib einen Betrag über 0 ein.', 'payAmount'); return; }
  const owed = d.direction === 'owed';
  const rem = debtRemaining(d);
  const interest = Math.min(amount, round2(rem * (d.interest || 0) / 100 / 12));
  const principal = Math.min(rem, round2(amount - interest));
  const entry = { id: uid(), type: owed ? 'income' : 'expense', amount, category: owed ? 'Rückzahlung' : 'Schulden', note: d.name, date, accountId };
  state.entries.push(entry);
  applyAccountDelta(accountId, amount, entry.type);
  d.payments.push({ id: uid(), date, amount, interest, principal, entryId: entry.id });
  saveState(); closePayModal(); render();
  if (debtRemaining(d) <= 0) showToast(owed ? 'Alles zurückbezahlt' : 'Schuld abbezahlt', { text: `«${d.name}» ist vollständig ${owed ? 'zurückbezahlt' : 'abbezahlt'}.` });
  else showToast('Gespeichert', { text: `Noch offen: CHF ${formatNum(debtRemaining(d))}.` });
}
function deletePayment(debtId, payId) {
  deleteWithUndo(() => {
    const d = state.debts.find(x => x.id === debtId);
    const p = d && d.payments.find(x => x.id === payId);
    if (!p) return;
    const e = state.entries.find(x => x.id === p.entryId);
    if (e) {
      applyAccountDelta(e.accountId, e.amount, e.type === 'income' ? 'expense' : 'income');
      state.entries = state.entries.filter(x => x.id !== e.id);
    }
    d.payments = d.payments.filter(x => x.id !== payId);
  }, 'Zahlung gelöscht', 'Der Eintrag dazu wurde auch gelöscht.');
}

// ── START
window.addEventListener('hashchange', () => { showAllRates = false; render(); window.scrollTo(0, 0); });
['goalModal', 'savingAccountModal', 'allocModal', 'debtModal', 'payModal'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('click', function (e) { if (e.target === this) this.classList.remove('show'); });
});
registerPageRender(render);
render();
