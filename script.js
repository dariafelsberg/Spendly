// ── CONSTANTS
const EXPENSE_CATEGORIES = [
  { name: 'Rechnungen',      emoji: '📄', color: '#e8533a' },
  { name: 'Auto',            emoji: '🚗', color: '#4e8cf5' },
  { name: 'Telefon',         emoji: '📱', color: '#a78bfa' },
  { name: 'Restaurants',     emoji: '🍽️', color: '#f59e42' },
  { name: 'Lebensmittel',    emoji: '🛒', color: '#34d399' },
  { name: 'Geschenke',       emoji: '🎁', color: '#f472b6' },
  { name: 'Gesundheit',      emoji: '💊', color: '#60a5fa' },
  { name: 'Wohnen',          emoji: '🏠', color: '#fb923c' },
  { name: 'Online Shopping', emoji: '🛍️', color: '#c084fc' },
  { name: 'Haustiere',       emoji: '🐾', color: '#4ade80' },
  { name: 'Sport',           emoji: '⚽', color: '#38bdf8' },
  { name: 'ÖV',              emoji: '🚋', color: '#f87171' },
  { name: 'Hygieneartikel',  emoji: '🧴', color: '#a3e635' },
];
const INCOME_CATEGORIES = [
  { name: 'Lohn',      emoji: '💼', color: '#16a34a' },
  { name: 'Sackgeld',  emoji: '🪙', color: '#84cc16' },
  { name: 'Sonstiges', emoji: '💰', color: '#4ade80' },
];
// ALL_CATS ist ein dynamischer Getter (berücksichtigt eigene Kategorien)
function allExpenseCats() { return [...EXPENSE_CATEGORIES, ...(state.customExpenseCats || [])]; }
function allIncomeCats()  { return [...INCOME_CATEGORIES,  ...(state.customIncomeCats  || [])]; }
function allCats()        { return [...allExpenseCats(), ...allIncomeCats()]; }

// ALL_CATS bleibt als Alias für Stellen erhalten, die es referenzieren (Kalender, Buchungen)
Object.defineProperty(window, 'ALL_CATS', { get: allCats });

// ── STATE
let state = {
  balance: 0, budget: 0,
  entries: [], accounts: [],
  recurringIncome: [], recurringExpense: [],
  appliedRecurringMonths: [],
  customExpenseCats: [], customIncomeCats: [],
  entryType: 'expense', editId: null,
  accountEditId: null, recurringEditId: null, recurringType: 'income',
  customCatEditId: null, customCatType: 'expense',
};

function sanitizeState() {
  if (!Array.isArray(state.entries))          state.entries = [];
  if (!Array.isArray(state.accounts))         state.accounts = [];
  if (!Array.isArray(state.recurringIncome))  state.recurringIncome = [];
  if (!Array.isArray(state.recurringExpense)) state.recurringExpense = [];
  if (!Array.isArray(state.appliedRecurringMonths)) state.appliedRecurringMonths = [];
  if (!Array.isArray(state.customExpenseCats))  state.customExpenseCats = [];
  if (!Array.isArray(state.customIncomeCats))   state.customIncomeCats = [];
  state.entries = state.entries.filter(e => e && typeof e.date === 'string' && typeof e.amount === 'number');
  // Migration: alte globale Monats-Markierung (appliedRecurringMonths) auf das
  // neue Pro-Regel-Tracking (lastAppliedMonth) übertragen, damit Regeln aus
  // der alten Version nicht plötzlich für längst vergangene Monate erneut
  // Buchungen anlegen. Läuft nur einmal, solange eine Regel noch kein
  // lastAppliedMonth hat.
  if (state.appliedRecurringMonths.length) {
    const lastGlobal = state.appliedRecurringMonths.slice().sort().pop();
    [...state.recurringIncome, ...state.recurringExpense].forEach(r => {
      if (!r.lastAppliedMonth) r.lastAppliedMonth = lastGlobal;
    });
  }
}

// ── RECURRING ENGINE ────────────────────────────────────────
// Wandelt wiederkehrende Einnahmen/Ausgaben in echte Buchungen
// (state.entries) um — jeweils am Tag des Monats, der beim Anlegen
// der Regel als Startdatum gewählt wurde (z.B. 15. für Lohn ab dem
// 15.). Existiert dieser Tag in einem kürzeren Monat nicht (z.B. 31.
// in einem 30-Tage-Monat), wird auf den letzten Tag des Monats
// geklemmt (day-clamping).
// Pro Regel merkt sich `lastAppliedMonth`, bis wohin bereits gebucht
// wurde. So werden auch neu angelegte Regeln mit einem in der
// Vergangenheit liegenden Startdatum rückwirkend nachgetragen (bis
// max. 24 Monate zurück), statt nur ab dem aktuellen Monat zu greifen.
function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function addMonths(mKey, n) {
  const [y, m] = mKey.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + n, 1));
}
// Tag des Monats, an dem eine Regel fällig ist (aus dem Startdatum),
// geklemmt auf die tatsächliche Anzahl Tage im jeweiligen Monat.
function recurringDayFor(r, year, month1based) {
  const startDay = r.createdAt ? new Date(r.createdAt + 'T00:00:00').getDate() : 1;
  const daysInMonth = new Date(year, month1based, 0).getDate();
  return Math.min(startDay, daysInMonth);
}
function applyRuleRecurring(r, type) {
  const today    = new Date();
  const todayKey = dateKey(today);
  const nowKey   = monthKey(today);
  const startDate = r.createdAt || todayKey;
  const startKey  = r.createdAt ? monthKey(new Date(r.createdAt + 'T00:00:00')) : nowKey;
  let cursor = r.lastAppliedMonth ? addMonths(r.lastAppliedMonth, 1) : startKey;
  // Nachholen auf max. 24 Monate begrenzen, damit das nicht ausufert
  const earliest = addMonths(nowKey, -23);
  if (cursor < earliest) cursor = earliest;
  let changed = false;
  while (cursor <= nowKey) {
    const [y, m] = cursor.split('-').map(Number);
    const day = recurringDayFor(r, y, m);
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    // Im Startmonat erst buchen, wenn das gewählte Startdatum tatsächlich
    // erreicht ist (z.B. Startdatum "morgen" -> heute noch nicht buchen).
    if (cursor === startKey && startDate > todayKey) break;
    // Im aktuellen Monat erst buchen, sobald der fällige Tag wirklich
    // erreicht ist — sonst würde z.B. der Lohn vom 15. schon am 1.
    // des Monats als bereits erhalten erscheinen.
    if (cursor === nowKey && dateStr > todayKey) break;
    state.entries.push({
      id: uid(), type, amount: r.amount, category: r.category,
      note: r.name, date: dateStr, accountId: r.accountId || '', recurringId: r.id,
    });
    applyAccountDelta(r.accountId || '', r.amount, type);
    r.lastAppliedMonth = cursor;
    changed = true;
    cursor = addMonths(cursor, 1);
  }
  return changed;
}
// Korrigiert bereits gebuchte Einträge, die noch mit der alten Logik
// (immer auf den 1. des Monats) angelegt wurden, auf den korrekten
// Tag der jeweiligen Regel. Läuft einmalig beim Laden.
function correctRecurringEntryDates() {
  const rulesById = {};
  [...state.recurringIncome, ...state.recurringExpense].forEach(r => { rulesById[r.id] = r; });
  let changed = false;
  state.entries.forEach(e => {
    if (!e.recurringId) return;
    const r = rulesById[e.recurringId];
    if (!r || !r.createdAt) return;
    const [y, m, d] = e.date.split('-').map(Number);
    const correctDay = recurringDayFor(r, y, m);
    if (d !== correctDay) {
      e.date = `${y}-${String(m).padStart(2, '0')}-${String(correctDay).padStart(2, '0')}`;
      changed = true;
    }
  });
  return changed;
}
// Prüft alle Regeln auf fällige Monate (und holt verpasste Monate nach,
// falls die App länger nicht geöffnet wurde oder eine Regel neu mit
// vergangenem Startdatum angelegt wurde) und speichert bei Änderungen.
function applyDueRecurring() {
  let changed = correctRecurringEntryDates();
  if (state.recurringIncome.length || state.recurringExpense.length) {
    state.recurringIncome.forEach(r  => { if (applyRuleRecurring(r, 'income'))  changed = true; });
    state.recurringExpense.forEach(r => { if (applyRuleRecurring(r, 'expense')) changed = true; });
  }
  if (changed) saveState();
  return changed;
}

// Sofort aus localStorage laden (damit die UI nicht leer flackert)
// Danach asynchron vom Server nachladen und überschreiben
function loadState() {
  try {
    const s = localStorage.getItem('budgetApp_v2');
    if (s) Object.assign(state, JSON.parse(s));
  } catch(e) {}
  sanitizeState();
  applyDueRecurring();

  // Server-Daten nachladen (überschreibt localStorage wenn neuer)
  fetch('/api/data.php', { credentials: 'include' })
    .then(r => r.ok ? r.json() : null)
    .then(res => {
      if (!res || !res.success || !res.data) return;
      // Auch leere Serverdaten ({}) übernehmen, damit ein frisches Gerät
      // nicht mit veralteten localStorage-Daten hängen bleibt
      Object.assign(state, res.data);
      sanitizeState();
      applyDueRecurring();
      // localStorage als Cache aktualisieren
      _persistLocal();
      // UI neu rendern mit Server-Daten
      // IS_HOME / IS_SETTINGS / IS_CALENDAR werden nach loadState() gesetzt,
      // daher hier dynamisch prüfen statt auf die Konstanten zu verlassen
      if (document.getElementById('donutSvg'))    render();
      if (document.getElementById('accountsList')) renderSettings();
      if (document.getElementById('calGrid'))      renderCalendar();
    })
    .catch(() => {}); // Offline? localStorage-Daten behalten
}

function _persistLocal() {
  const { balance, budget, entries, accounts, recurringIncome, recurringExpense, appliedRecurringMonths, customExpenseCats, customIncomeCats } = state;
  localStorage.setItem('budgetApp_v2', JSON.stringify({ balance, budget, entries, accounts, recurringIncome, recurringExpense, appliedRecurringMonths, customExpenseCats, customIncomeCats }));
}

function saveState() {
  _persistLocal();
  // Asynchron zum Server senden — kein await, UI bleibt reaktiv
  const { balance, budget, entries, accounts, recurringIncome, recurringExpense, appliedRecurringMonths, customExpenseCats, customIncomeCats } = state;
  fetch('/api/data.php', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { balance, budget, entries, accounts, recurringIncome, recurringExpense, appliedRecurringMonths, customExpenseCats, customIncomeCats } })
  }).catch(() => {}); // Offline: nur localStorage wurde gesichert
}

// ── CALENDAR STATE (muss vor BOOT deklariert sein, da initCalendar() dort aufgerufen wird)
let calViewDate = new Date(), calSelectedDay = null;

// ── BOOT
loadState();
const IS_HOME     = !!document.getElementById('donutSvg');
const IS_SETTINGS = !!document.getElementById('accountsList');
const IS_CALENDAR = !!document.getElementById('calGrid');

if (IS_HOME) initHome();
else if (IS_SETTINGS) initSettings();
if (IS_CALENDAR) initCalendar();

// Re-render calendar on resize (desktop <-> mobile toggle)
if (IS_CALENDAR) {
  let _calResizeTimer;
  window.addEventListener('resize', () => { clearTimeout(_calResizeTimer); _calResizeTimer = setTimeout(renderCalendar, 120); });
}

// ── HOME
function initHome() {
  const now = new Date();
  document.getElementById('monthLabel').textContent = now.toLocaleDateString('de-CH', { month: 'long', year: 'numeric' });
  document.getElementById('entryDate').valueAsDate = now;
  populateCategorySelect('expense');
  render();
  ['entryModal','budgetModal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('show'); });
  });
}

function render() { renderTopBar(); renderBudgetCard(); renderDonut(); renderTransactions(); }

function renderTopBar() {
  const vis = state.accounts.filter(a => a.visible);
  const total = vis.length
    ? vis.reduce((s, a) => s + a.balance, 0)
    : state.balance + state.entries.reduce((s, e) => s + (e.type === 'income' ? e.amount : -e.amount), 0);
  document.getElementById('totalBalanceDisplay').textContent = formatNum(total);
  const pillsEl = document.getElementById('accountPills');
  if (vis.length) {
    pillsEl.innerHTML = vis.map(a =>
      `<div class="account-pill-item"><span class="pill-name">${a.name}</span><span class="pill-val">CHF ${formatNum(a.balance)}</span></div>`
    ).join('');
    pillsEl.style.display = 'flex';
  } else {
    pillsEl.innerHTML = '';
    pillsEl.style.display = 'none';
  }
}

function renderBudgetCard() {
  const spent = totalExpenses();
  document.getElementById('budgetDisplay').textContent = 'CHF ' + formatNum(state.budget);
  const sub = document.getElementById('budgetSub');
  if (!state.budget) { sub.textContent = 'Noch kein Budget gesetzt'; sub.className = 'budget-sub'; return; }
  const rem = state.budget - spent;
  sub.textContent = rem >= 0 ? `Noch CHF ${formatNum(rem)} verfügbar` : `CHF ${formatNum(Math.abs(rem))} überzogen!`;
  sub.className = 'budget-sub' + (rem < 0 ? ' over' : '');
}

function renderDonut() {
  const spent = totalExpenses();
  document.getElementById('donutBudget').textContent = 'CHF ' + formatNum(state.budget);
  document.getElementById('donutSpent').textContent  = '−CHF ' + formatNum(spent);
  const catTotals = {};
  state.entries.filter(e => e.type === 'expense').forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.amount; });
  const activeCats = allExpenseCats().filter(c => catTotals[c.name] > 0);
  const r = 72, circ = 2 * Math.PI * r;
  let offset = 0;
  document.getElementById('donutArcs').innerHTML = (activeCats.length && spent > 0)
    ? activeCats.map(c => {
        const frac = catTotals[c.name] / Math.max(spent, state.budget, 0.01);
        const dLen = Math.min(frac, 1) * circ;
        const arc = `<circle cx="100" cy="100" r="${r}" fill="none" stroke="${c.color}" stroke-width="28"
          stroke-dasharray="${dLen.toFixed(2)} ${(circ-dLen).toFixed(2)}"
          stroke-dashoffset="${(-offset*circ).toFixed(2)}" style="transition:all .5s ease"/>`;
        offset += frac; return arc;
      }).join('') : '';
  document.getElementById('categoriesGrid').innerHTML = allExpenseCats().map(c => {
    const amt = catTotals[c.name] || 0;
    return `<div class="cat-chip" style="${amt ? `background:${c.color}15;border-color:${c.color}44` : ''}">
      <div class="cat-dot" style="background:${amt ? c.color : '#ddd'}"></div>
      <span class="cat-name">${c.emoji} ${c.name}</span>
      ${amt ? `<span class="cat-amount expense">−${formatNum(amt)}</span>` : ''}
    </div>`;
  }).join('');
}

function renderTransactions() {
  const entries = [...state.entries].sort((a, b) => new Date(b.date) - new Date(a.date));
  document.getElementById('txCount').textContent = entries.length;
  const listEl = document.getElementById('txList');
  const emptyEl = document.getElementById('txEmpty');
  listEl.querySelectorAll('.tx-item').forEach(el => el.remove());
  if (!entries.length) { emptyEl.style.display = 'block'; return; }
  emptyEl.style.display = 'none';
  entries.forEach(e => {
    const cat = ALL_CATS.find(c => c.name === e.category) || { color: '#ccc', emoji: '?' };
    const isInc = e.type === 'income';
    const isAccOnly = e.type === 'account-only';
    const acc = e.accountId ? state.accounts.find(a => a.id === e.accountId) : null;
    const accTag = acc ? `<span class="tx-account-tag">🏦 ${acc.name}</span>` : '';
    const accOnlyBadge = isAccOnly ? `<span class="tx-account-tag" style="background:#f0f4ff;color:#4e8cf5;">nur Konto</span>` : '';
    const item = document.createElement('div');
    item.className = 'tx-item';
    item.innerHTML = `
      <div class="tx-cat-dot" style="background:${cat.color}"></div>
      <div class="tx-info">
        <div class="tx-cat-label">${cat.emoji} ${e.category}</div>
        <div class="tx-note">${e.note ? e.note + (acc || isAccOnly ? ' · ' : '') : ''}${accTag}${accOnlyBadge || (!accTag ? formatDate(e.date) : '')}</div>
      </div>
      <div class="tx-amount ${isInc ? 'income' : 'expense'}">${isInc ? '+' : '−'}${formatNum(e.amount)}</div>
      <div class="tx-actions">
        <button class="tx-btn" onclick="editEntry('${e.id}')">✏️</button>
        <button class="tx-btn delete" onclick="deleteEntry('${e.id}')">🗑️</button>
      </div>`;
    listEl.appendChild(item);
  });
}

// ── BUDGET
function openBudgetModal() { document.getElementById('budgetInput').value = state.budget || ''; document.getElementById('budgetModal').classList.add('show'); }
function closeBudgetModal() { document.getElementById('budgetModal').classList.remove('show'); }
function saveBudget() {
  const val = parseFloat(document.getElementById('budgetInput').value);
  if (!isNaN(val) && val >= 0) {
    state.budget = val; saveState();
    if (IS_HOME) { renderBudgetCard(); renderDonut(); }
    if (IS_SETTINGS) { const sd = document.getElementById('budgetSettingDisplay'); if (sd) sd.textContent = 'CHF ' + formatNum(state.budget); }
  }
  closeBudgetModal();
}

// ── ENTRY MODAL
function setEntryType(type) {
  state.entryType = type;
  document.getElementById('typeBtnExpense').classList.toggle('active', type === 'expense');
  document.getElementById('typeBtnIncome').classList.toggle('active', type === 'income');
  // Checkbox nur bei Ausgabe anzeigen
  const aoGroup = document.getElementById('accountOnlyGroup');
  if (aoGroup) aoGroup.style.display = type === 'expense' ? '' : 'none';
  // Checkbox zurücksetzen wenn nicht Ausgabe
  const aoCheck = document.getElementById('accountOnlyCheck');
  if (aoCheck && type !== 'expense') aoCheck.checked = false;
  // "Nur Konto" verwendet Ausgaben-Kategorien (bleibt eine Abbuchung, zählt nur nicht ins Budget)
  populateCategorySelect(type === 'income' ? 'income' : 'expense');
}
function populateCategorySelect(type) {
  const sel = document.getElementById('entryCategory');
  if (!sel) return;
  sel.innerHTML = (type === 'income' ? allIncomeCats() : allExpenseCats())
    .map(c => `<option value="${c.name}">${c.emoji} ${c.name}</option>`).join('');
}
function populateAccountSelect(selectedId = '') {
  const sel = document.getElementById('entryAccount');
  if (!sel) return;
  sel.innerHTML = `<option value="" ${!selectedId ? 'selected' : ''}>— Kein Konto —</option>` +
    state.accounts.map(a => `<option value="${a.id}" ${a.id === selectedId ? 'selected' : ''}>${a.name} (CHF ${formatNum(a.balance)})</option>`).join('');
  const grp = document.getElementById('accountSelectGroup');
  if (grp) grp.style.display = state.accounts.length ? '' : 'none';
}
function openEntryModal(editId = null) {
  state.editId = editId;
  document.getElementById('entryModalTitle').textContent = editId ? 'Eintrag bearbeiten' : 'Eintrag hinzufügen';
  if (editId) {
    const e = state.entries.find(x => x.id === editId);
    setEntryType(e.type || 'expense');
    document.getElementById('entryAmount').value = e.amount;
    document.getElementById('entryNote').value   = e.note || '';
    document.getElementById('entryDate').value   = e.date;
    setTimeout(() => { document.getElementById('entryCategory').value = e.category; }, 0);
    document.getElementById('typeToggle').style.display = 'none';
    const aoCheck = document.getElementById('accountOnlyCheck');
    const aoGroup = document.getElementById('accountOnlyGroup');
    if (aoCheck) aoCheck.checked = (e.type === 'account-only');
    if (aoGroup) aoGroup.style.display = (e.type === 'expense' || e.type === 'account-only') ? '' : 'none';
    populateAccountSelect(e.accountId || '');
  } else {
    setEntryType('expense');
    document.getElementById('entryAmount').value = '';
    document.getElementById('entryNote').value   = '';
    document.getElementById('entryDate').valueAsDate = new Date();
    document.getElementById('typeToggle').style.display = '';
    populateAccountSelect();
  }
  document.getElementById('entryModal').classList.add('show');
}
function closeEntryModal() { document.getElementById('entryModal').classList.remove('show'); state.editId = null; }
function applyAccountDelta(accountId, amount, type) {
  if (!accountId) return;
  const acc = state.accounts.find(a => a.id === accountId);
  if (acc) acc.balance += (type === 'income' ? amount : -amount);
  // 'account-only' wird wie eine Ausgabe behandelt (Abbuchung vom Konto)
}
function saveEntry() {
  const amount    = parseFloat(document.getElementById('entryAmount').value);
  const category  = document.getElementById('entryCategory').value;
  const note      = document.getElementById('entryNote').value.trim();
  const date      = document.getElementById('entryDate').value;
  const accountId = document.getElementById('entryAccount').value;
  if (!accountId && state.accounts.length > 0) { alert('Bitte ein Konto auswählen.'); document.getElementById('entryAccount').focus(); return; }
  if (isNaN(amount) || amount <= 0 || !category) { document.getElementById('entryAmount').focus(); return; }
  if (state.editId) {
    const e = state.entries.find(x => x.id === state.editId);
    if (e) {
      // alten Delta umkehren: income → 'expense'-Richtung; expense/account-only → 'income'-Richtung
      const reverseType = (e.type === 'income') ? 'expense' : 'income';
      applyAccountDelta(e.accountId, e.amount, reverseType);
      Object.assign(e, { amount, category, note, date, accountId });
      applyAccountDelta(accountId, amount, e.type);
    }
  } else {
    const aoChecked = document.getElementById('accountOnlyCheck')?.checked;
    const finalType = (state.entryType === 'expense' && aoChecked) ? 'account-only' : state.entryType;
    state.entries.push({ id: uid(), type: finalType, amount, category, note, date, accountId });
    applyAccountDelta(accountId, amount, finalType);
  }
  saveState(); render(); closeEntryModal();
}
function editEntry(id) { openEntryModal(id); }
function deleteEntry(id) {
  if (confirm('Eintrag löschen?')) {
    const e = state.entries.find(x => x.id === id);
    if (e) {
      const reverseType = (e.type === 'income') ? 'expense' : 'income';
      applyAccountDelta(e.accountId, e.amount, reverseType);
    }
    state.entries = state.entries.filter(e => e.id !== id);
    saveState(); render();
  }
}
function toggleTxList() {
  ['txList','txHeader','txChevron'].forEach(id => document.getElementById(id).classList.toggle('open'));
}

// ── SETTINGS
function initSettings() {
  renderSettings();
  ['budgetModal','accountModal','recurringModal','customCatModal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('show'); });
  });
}
function renderSettings() {
  renderAccountsList(); renderRecurringList('income'); renderRecurringList('expense');
  renderCustomCatList('expense'); renderCustomCatList('income');
  const sd = document.getElementById('budgetSettingDisplay');
  if (sd) sd.textContent = 'CHF ' + formatNum(state.budget);
}
function renderAccountsList() {
  const el = document.getElementById('accountsList');
  el.innerHTML = !state.accounts.length
    ? '<div class="empty-tx">Noch keine Konten hinzugefügt.</div>'
    : state.accounts.map(a => `
      <div class="settings-item">
        <div class="settings-item-info">
          <div class="settings-item-name">${a.name}</div>
          <div class="settings-item-val">CHF ${formatNum(a.balance)}<span style="opacity:.6"> · ${a.visible ? '👁 sichtbar' : 'versteckt'}</span></div>
        </div>
        <div class="settings-item-actions">
          <button class="tx-btn" onclick="openAccountModal('${a.id}')">✏️</button>
          <button class="tx-btn delete" onclick="deleteAccount('${a.id}')">🗑️</button>
        </div>
      </div>`).join('');
}
function renderRecurringList(type) {
  const el   = document.getElementById(type === 'income' ? 'recurringIncomeList' : 'recurringExpenseList');
  const list = type === 'income' ? state.recurringIncome : state.recurringExpense;
  const sign = type === 'income' ? '+' : '−';
  const col  = type === 'income' ? 'var(--income)' : 'var(--danger)';
  el.innerHTML = !list.length
    ? '<div class="empty-tx">Noch keine Einträge.</div>'
    : list.map(r => {
        const acc = r.accountId ? state.accounts.find(a => a.id === r.accountId) : null;
        return `
      <div class="settings-item">
        <div class="settings-item-info">
          <div class="settings-item-name">${r.name}</div>
          <div class="settings-item-val" style="color:${col}">${sign}CHF ${formatNum(r.amount)} / Monat · ${r.category}${acc ? ' · 🏦 ' + acc.name : ''}</div>
        </div>
        <div class="settings-item-actions">
          <button class="tx-btn" onclick="openRecurringModal('${type}','${r.id}')">✏️</button>
          <button class="tx-btn delete" onclick="deleteRecurring('${type}','${r.id}')">🗑️</button>
        </div>
      </div>`;
      }).join('');
}

// ── EIGENE KATEGORIEN
const PRESET_EMOJIS = ['🏷️','🎯','⭐','🔖','💡','🧩','🎪','🌟','🔑','💎','🎠','🌈','🎭','🧸','🎲','🎸','🏋️','🌿','🍀','🦋','🐝','🌸','🎁','🔮','🎡'];

function renderCustomCatList() {
  const el = document.getElementById('customIncomeCatList');
  if (!el) return;
  const expenseList = state.customExpenseCats || [];
  const incomeList  = state.customIncomeCats  || [];
  const total = expenseList.length + incomeList.length;
  if (!total) {
    el.innerHTML = '<div class="empty-tx">Noch keine eigenen Kategorien.</div>';
    return;
  }
  const renderGroup = (groupType, label, list) => {
    if (!list.length) return '';
    const header = `<div style="font-size:.72rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;padding:8px 0 4px">${label}</div>`;
    const items = list.map(c => `
      <div class="settings-item">
        <div class="settings-item-info">
          <div class="settings-item-name">${c.emoji} ${c.name}</div>
        </div>
        <div class="settings-item-actions">
          <button class="tx-btn delete" onclick="deleteCustomCat('${groupType}','${c.id}')">🗑️</button>
        </div>
      </div>`).join('');
    return header + items;
  };
  el.innerHTML = renderGroup('expense', '📤 Ausgaben', expenseList) + renderGroup('income', '📥 Einnahmen', incomeList);
}

function openCustomCatModal(type) {
  // Standard: 'expense', falls kein Typ übergeben; Tab-UI zurücksetzen
  const initialType = type || 'expense';
  state.customCatType = initialType;
  const modal = document.getElementById('customCatModal');
  modal.dataset.catType = initialType;
  // Tab-Buttons synchronisieren
  const tabExp = document.getElementById('customCatTabExpense');
  const tabInc = document.getElementById('customCatTabIncome');
  if (tabExp) tabExp.classList.toggle('active', initialType === 'expense');
  if (tabInc) tabInc.classList.toggle('active', initialType === 'income');
  document.getElementById('customCatName').value = '';
  document.getElementById('customCatError').textContent = '';
  // Emoji-Picker rendern
  const picker = document.getElementById('customCatEmojiPicker');
  picker.innerHTML = PRESET_EMOJIS.map(e =>
    `<button type="button" class="emoji-pick-btn" onclick="selectEmoji('${e}')">${e}</button>`
  ).join('');
  selectEmoji('🏷️');
  modal.classList.add('show');
}

function closeCustomCatModal() {
  document.getElementById('customCatModal').classList.remove('show');
}

function selectEmoji(emoji) {
  document.querySelectorAll('.emoji-pick-btn').forEach(b => b.classList.toggle('selected', b.textContent === emoji));
  document.getElementById('customCatSelectedEmoji').textContent = emoji;
}

function getSelectedEmoji() {
  return document.getElementById('customCatSelectedEmoji').textContent || '🏷️';
}

function saveCustomCat() {
  const name = document.getElementById('customCatName').value.trim();
  const errEl = document.getElementById('customCatError');
  errEl.textContent = '';
  if (!name || name.length < 2) { errEl.textContent = 'Name muss mindestens 2 Zeichen lang sein.'; return; }
  const emoji = getSelectedEmoji();
  // Typ aus der Tab-Auswahl im Modal lesen
  const modal = document.getElementById('customCatModal');
  state.customCatType = modal.dataset.catType || state.customCatType;
  const list = state.customCatType === 'expense' ? state.customExpenseCats : state.customIncomeCats;
  const builtIn = state.customCatType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const allNames = [...builtIn, ...list].map(c => c.name.toLowerCase());
  if (allNames.includes(name.toLowerCase())) { errEl.textContent = 'Diese Kategorie existiert bereits.'; return; }
  const color = `hsl(${Math.floor(Math.random()*360)},65%,55%)`;
  list.push({ id: uid(), name, emoji, color });
  saveState();
  renderCustomCatList();
  closeCustomCatModal();
}

function deleteCustomCat(type, id) {
  if (!confirm('Kategorie löschen? Bestehende Einträge behalten ihren Kategorienamen.')) return;
  if (type === 'expense') state.customExpenseCats = state.customExpenseCats.filter(c => c.id !== id);
  else                    state.customIncomeCats  = state.customIncomeCats.filter(c => c.id !== id);
  saveState(); renderCustomCatList();
}
function openAccountModal(editId = null) {
  state.accountEditId = editId;
  document.getElementById('accountModalTitle').textContent = editId ? 'Konto bearbeiten' : 'Konto hinzufügen';
  if (editId) {
    const a = state.accounts.find(x => x.id === editId);
    document.getElementById('accountName').value      = a.name;
    document.getElementById('accountBalance').value   = a.balance;
    document.getElementById('accountVisible').checked = a.visible;
  } else {
    document.getElementById('accountName').value      = '';
    document.getElementById('accountBalance').value   = '';
    document.getElementById('accountVisible').checked = true;
  }
  document.getElementById('accountModal').classList.add('show');
}
function closeAccountModal() { document.getElementById('accountModal').classList.remove('show'); state.accountEditId = null; }
function saveAccount() {
  const name    = document.getElementById('accountName').value.trim();
  const balance = parseFloat(document.getElementById('accountBalance').value) || 0;
  const visible = document.getElementById('accountVisible').checked;
  if (!name) { document.getElementById('accountName').focus(); return; }
  if (state.accountEditId) {
    const a = state.accounts.find(x => x.id === state.accountEditId);
    if (a) Object.assign(a, { name, balance, visible });
  } else {
    state.accounts.push({ id: uid(), name, balance, visible });
  }
  saveState(); renderAccountsList(); closeAccountModal();
}
function deleteAccount(id) {
  if (confirm('Konto löschen?')) {
    state.accounts = state.accounts.filter(a => a.id !== id);
    // Verwaiste Konto-Referenzen in bestehenden Buchungen entfernen,
    // damit keine toten accountId-Verweise übrig bleiben
    state.entries.forEach(e => { if (e.accountId === id) e.accountId = ''; });
    saveState(); renderAccountsList();
  }
}
function openRecurringModal(type, editId = null) {
  state.recurringType = type; state.recurringEditId = editId;
  document.getElementById('recurringModalTitle').textContent =
    (editId ? 'Bearbeiten' : 'Hinzufügen') + ' – ' + (type === 'income' ? 'Einnahme' : 'Ausgabe');
  document.getElementById('recurringCategory').innerHTML =
    (type === 'income' ? allIncomeCats() : allExpenseCats())
      .map(c => `<option value="${c.name}">${c.emoji} ${c.name}</option>`).join('');
  const accSel = document.getElementById('recurringAccount');
  if (accSel) {
    accSel.innerHTML = `<option value="">— Kein Konto —</option>` +
      state.accounts.map(a => `<option value="${a.id}">${a.name} (CHF ${formatNum(a.balance)})</option>`).join('');
  }
  if (editId) {
    const r = (type === 'income' ? state.recurringIncome : state.recurringExpense).find(x => x.id === editId);
    document.getElementById('recurringName').value     = r.name;
    document.getElementById('recurringAmount').value   = r.amount;
    document.getElementById('recurringCategory').value = r.category;
    if (accSel) accSel.value = r.accountId || '';
    document.getElementById('recurringStartDate').value = r.createdAt || dateKey(new Date());
  } else {
    document.getElementById('recurringName').value   = '';
    document.getElementById('recurringAmount').value = '';
    if (accSel) accSel.value = '';
    document.getElementById('recurringStartDate').value = dateKey(new Date());
  }
  document.getElementById('recurringModal').classList.add('show');
}
function closeRecurringModal() { document.getElementById('recurringModal').classList.remove('show'); state.recurringEditId = null; }
function saveRecurring() {
  const name      = document.getElementById('recurringName').value.trim();
  const amount    = parseFloat(document.getElementById('recurringAmount').value);
  const category  = document.getElementById('recurringCategory').value;
  const accountId = document.getElementById('recurringAccount')?.value || '';
  const startDate = document.getElementById('recurringStartDate').value || dateKey(new Date());
  if (!name || isNaN(amount) || amount <= 0) { document.getElementById('recurringName').focus(); return; }
  const list = state.recurringType === 'income' ? state.recurringIncome : state.recurringExpense;
  if (state.recurringEditId) {
    const r = list.find(x => x.id === state.recurringEditId);
    if (r) Object.assign(r, { name, amount, category, accountId, createdAt: startDate });
  } else {
    list.push({ id: uid(), name, amount, category, accountId, createdAt: startDate });
  }
  applyDueRecurring();
  saveState(); renderRecurringList(state.recurringType); closeRecurringModal();
}
function deleteRecurring(type, id) {
  if (confirm('Eintrag löschen?')) {
    if (type === 'income') state.recurringIncome  = state.recurringIncome.filter(r => r.id !== id);
    else                   state.recurringExpense = state.recurringExpense.filter(r => r.id !== id);
    saveState(); renderRecurringList(type);
  }
}

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
      previews.push({
        id: 'preview-' + r.id + '-' + mKey, type, amount: r.amount, category: r.category,
        note: r.name, date: dateStr,
        accountId: r.accountId || '', recurringId: r.id, isPreview: true,
      });
    });
  };
  addPreviews(state.recurringIncome, 'income');
  addPreviews(state.recurringExpense, 'expense');
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
    const incomeEs  = es.filter(e => e.type === 'income');
    const expenseEs = es.filter(e => e.type === 'expense' || e.type === 'account-only');
    // Ein Punkt gilt als "geplant", wenn ausschliesslich Vorschau-Einträge dahinterstecken
    const incomePlanned  = incomeEs.length  && incomeEs.every(e => e.isPreview);
    const expensePlanned = expenseEs.length && expenseEs.every(e => e.isPreview);
    const dots = es.length ? `<div class="cal-day-dots">
      ${incomeEs.length  ? `<div class="cal-day-dot income${incomePlanned ? ' planned' : ''}"></div>`  : ''}
      ${expenseEs.length ? `<div class="cal-day-dot expense${expensePlanned ? ' planned' : ''}"></div>` : ''}
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
  if (real.length) {
    const net = real.reduce((s, e) => s + (e.type==='income' ? e.amount : -e.amount), 0);
    totalEl.textContent = (net >= 0 ? '+' : '−') + 'CHF ' + formatNum(Math.abs(net));
    totalEl.style.color = net >= 0 ? 'var(--income)' : 'var(--danger)';
  } else {
    totalEl.textContent = 'geplant';
    totalEl.style.color = 'var(--muted)';
  }
  document.getElementById('dayDetailList').innerHTML = entries.map(e => {
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
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── HELPERS
function totalExpenses() { return state.entries.filter(e => e.type==='expense').reduce((s,e) => s+e.amount, 0); }
function formatNum(n) { return Number(n).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatDate(d) { return d ? new Date(d).toLocaleDateString('de-CH') : ''; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }