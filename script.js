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
const ALL_CATS = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

// ── STATE
let state = {
  balance: 0, budget: 0,
  entries: [], accounts: [],
  recurringIncome: [], recurringExpense: [],
  appliedRecurringMonths: [],
  entryType: 'expense', editId: null,
  accountEditId: null, recurringEditId: null, recurringType: 'income',
};

function sanitizeState() {
  if (!Array.isArray(state.entries))          state.entries = [];
  if (!Array.isArray(state.accounts))         state.accounts = [];
  if (!Array.isArray(state.recurringIncome))  state.recurringIncome = [];
  if (!Array.isArray(state.recurringExpense)) state.recurringExpense = [];
  if (!Array.isArray(state.appliedRecurringMonths)) state.appliedRecurringMonths = [];
  state.entries = state.entries.filter(e => e && typeof e.date === 'string' && typeof e.amount === 'number');
}

// ── RECURRING ENGINE ────────────────────────────────────────
// Wandelt wiederkehrende Einnahmen/Ausgaben einmal pro Kalendermonat
// in echte Buchungen (state.entries) um. appliedRecurringMonths
// verhindert doppeltes Anwenden desselben Monats.
function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function applyRecurringForMonth(key) {
  if (state.appliedRecurringMonths.includes(key)) return false;
  const [y, m] = key.split('-').map(Number);
  const dateStr = `${y}-${String(m).padStart(2, '0')}-01`;
  const makeEntry = (r, type) => ({
    id: uid(), type, amount: r.amount, category: r.category,
    note: r.name, date: dateStr, accountId: '', recurringId: r.id,
  });
  state.recurringIncome.forEach(r => {
    const e = makeEntry(r, 'income');
    state.entries.push(e);
    applyAccountDelta(e.accountId, e.amount, e.type);
  });
  state.recurringExpense.forEach(r => {
    const e = makeEntry(r, 'expense');
    state.entries.push(e);
    applyAccountDelta(e.accountId, e.amount, e.type);
  });
  state.appliedRecurringMonths.push(key);
  return true;
}
// Prüft ab dem ersten des aktuellen Monats (und holt verpasste Monate
// nach, falls die App länger nicht geöffnet wurde) und speichert bei
// Änderungen.
function applyDueRecurring() {
  if (!state.recurringIncome.length && !state.recurringExpense.length) return false;
  const now = new Date();
  let changed = false;
  // Nachholen: alle Monate seit dem ältesten offenen Eintrag bis heute,
  // maximal 24 Monate zurück, damit das nicht ausufert.
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    if (applyRecurringForMonth(monthKey(d))) changed = true;
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
  const { balance, budget, entries, accounts, recurringIncome, recurringExpense, appliedRecurringMonths } = state;
  localStorage.setItem('budgetApp_v2', JSON.stringify({ balance, budget, entries, accounts, recurringIncome, recurringExpense, appliedRecurringMonths }));
}

function saveState() {
  _persistLocal();
  // Asynchron zum Server senden — kein await, UI bleibt reaktiv
  const { balance, budget, entries, accounts, recurringIncome, recurringExpense, appliedRecurringMonths } = state;
  fetch('/api/data.php', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { balance, budget, entries, accounts, recurringIncome, recurringExpense, appliedRecurringMonths } })
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
  const activeCats = EXPENSE_CATEGORIES.filter(c => catTotals[c.name] > 0);
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
  document.getElementById('categoriesGrid').innerHTML = EXPENSE_CATEGORIES.map(c => {
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
    const acc = e.accountId ? state.accounts.find(a => a.id === e.accountId) : null;
    const accTag = acc ? `<span class="tx-account-tag">🏦 ${acc.name}</span>` : '';
    const item = document.createElement('div');
    item.className = 'tx-item';
    item.innerHTML = `
      <div class="tx-cat-dot" style="background:${cat.color}"></div>
      <div class="tx-info">
        <div class="tx-cat-label">${cat.emoji} ${e.category}</div>
        <div class="tx-note">${e.note ? e.note + (acc ? ' · ' : '') : ''}${accTag || formatDate(e.date)}</div>
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
  populateCategorySelect(type);
}
function populateCategorySelect(type) {
  const sel = document.getElementById('entryCategory');
  if (!sel) return;
  sel.innerHTML = (type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)
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
      applyAccountDelta(e.accountId, e.amount, e.type === 'income' ? 'expense' : 'income');
      Object.assign(e, { amount, category, note, date, accountId });
      applyAccountDelta(accountId, amount, e.type);
    }
  } else {
    state.entries.push({ id: uid(), type: state.entryType, amount, category, note, date, accountId });
    applyAccountDelta(accountId, amount, state.entryType);
  }
  saveState(); render(); closeEntryModal();
}
function editEntry(id) { openEntryModal(id); }
function deleteEntry(id) {
  if (confirm('Eintrag löschen?')) {
    const e = state.entries.find(x => x.id === id);
    if (e) applyAccountDelta(e.accountId, e.amount, e.type === 'income' ? 'expense' : 'income');
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
  ['budgetModal','accountModal','recurringModal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('show'); });
  });
}
function renderSettings() {
  renderAccountsList(); renderRecurringList('income'); renderRecurringList('expense');
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
    : list.map(r => `
      <div class="settings-item">
        <div class="settings-item-info">
          <div class="settings-item-name">${r.name}</div>
          <div class="settings-item-val" style="color:${col}">${sign}CHF ${formatNum(r.amount)} / Monat · ${r.category}</div>
        </div>
        <div class="settings-item-actions">
          <button class="tx-btn" onclick="openRecurringModal('${type}','${r.id}')">✏️</button>
          <button class="tx-btn delete" onclick="deleteRecurring('${type}','${r.id}')">🗑️</button>
        </div>
      </div>`).join('');
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
    (type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)
      .map(c => `<option value="${c.name}">${c.emoji} ${c.name}</option>`).join('');
  if (editId) {
    const r = (type === 'income' ? state.recurringIncome : state.recurringExpense).find(x => x.id === editId);
    document.getElementById('recurringName').value     = r.name;
    document.getElementById('recurringAmount').value   = r.amount;
    document.getElementById('recurringCategory').value = r.category;
  } else {
    document.getElementById('recurringName').value   = '';
    document.getElementById('recurringAmount').value = '';
  }
  document.getElementById('recurringModal').classList.add('show');
}
function closeRecurringModal() { document.getElementById('recurringModal').classList.remove('show'); state.recurringEditId = null; }
function saveRecurring() {
  const name     = document.getElementById('recurringName').value.trim();
  const amount   = parseFloat(document.getElementById('recurringAmount').value);
  const category = document.getElementById('recurringCategory').value;
  if (!name || isNaN(amount) || amount <= 0) { document.getElementById('recurringName').focus(); return; }
  const list = state.recurringType === 'income' ? state.recurringIncome : state.recurringExpense;
  if (state.recurringEditId) {
    const r = list.find(x => x.id === state.recurringEditId);
    if (r) Object.assign(r, { name, amount, category });
  } else {
    list.push({ id: uid(), name, amount, category });
  }
  saveState(); renderRecurringList(state.recurringType); closeRecurringModal();
}
function deleteRecurring(type, id) {
  if (confirm('Eintrag löschen?')) {
    if (type === 'income') state.recurringIncome  = state.recurringIncome.filter(r => r.id !== id);
    else                   state.recurringExpense = state.recurringExpense.filter(r => r.id !== id);
    saveState(); renderRecurringList(type);
  }
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
    const dots = es.length ? `<div class="cal-day-dots">
      ${es.some(e => e.type==='income')  ? '<div class="cal-day-dot income"></div>'  : ''}
      ${es.some(e => e.type==='expense') ? '<div class="cal-day-dot expense"></div>' : ''}
    </div>` : '';
    const cls = ['cal-day', key===todayStr?'today':'', calSelectedDay&&key===dateKey(calSelectedDay)?'selected':''].filter(Boolean).join(' ');
    html += `<div class="${cls}" onclick="selectCalDay(${year},${month},${d})"><span>${d}</span>${dots}</div>`;
  }
  document.getElementById(gridId).innerHTML = html;
}
function selectCalDay(year, month, day) { calSelectedDay = new Date(year, month, day); renderCalendar(); renderDayDetail(calSelectedDay); }
function renderDayDetail(dateObj) {
  const key = dateKey(dateObj);
  const entries = state.entries.filter(e => e.date === key);
  const detailEl = document.getElementById('dayDetail');
  document.getElementById('dayDetailTitle').textContent = dateObj.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  detailEl.style.display = '';
  if (!entries.length) {
    document.getElementById('dayDetailTotal').textContent = '';
    document.getElementById('dayDetailList').innerHTML = '<div class="empty-tx">Keine Einträge an diesem Tag.</div>';
    return;
  }
  const net = entries.reduce((s, e) => s + (e.type==='income' ? e.amount : -e.amount), 0);
  const totalEl = document.getElementById('dayDetailTotal');
  totalEl.textContent = (net >= 0 ? '+' : '−') + 'CHF ' + formatNum(Math.abs(net));
  totalEl.style.color = net >= 0 ? 'var(--income)' : 'var(--danger)';
  document.getElementById('dayDetailList').innerHTML = entries.map(e => {
    const cat = ALL_CATS.find(c => c.name === e.category) || { color: '#ccc', emoji: '?' };
    const isInc = e.type === 'income';
    const acc = e.accountId ? state.accounts.find(a => a.id === e.accountId) : null;
    const accTag = acc ? `<span class="tx-account-tag">🏦 ${acc.name}</span>` : '';
    return `<div class="tx-item">
      <div class="tx-cat-dot" style="background:${cat.color}"></div>
      <div class="tx-info">
        <div class="tx-cat-label">${cat.emoji} ${e.category}</div>
        <div class="tx-note">${e.note ? e.note + (acc ? ' · ' : '') : ''}${accTag}</div>
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