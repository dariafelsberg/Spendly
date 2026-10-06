/* ==========================================================
 * main.js – gemeinsamer Code für alle Seiten
 * Konstanten, State, Speichern/Laden (localStorage + Server), Wiederkehrende
 * Buchungen, App-Menü, Budget-Modal, Eintragszeile und Helper.
 * Muss VOR der seitenspezifischen Datei in assets/js/pages/ geladen werden.
 ========================================================== */

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
  { name: 'Online Shopping', emoji: '📦', color: '#c084fc' },
  { name: 'Haustiere',       emoji: '🐾', color: '#4ade80' },
  { name: 'Sport',           emoji: '⚽', color: '#38bdf8' },
  { name: 'ÖV',              emoji: '🚋', color: '#f87171' },
  { name: 'Hygieneartikel',  emoji: '🧴', color: '#a3e635' },
  { name: 'Shopping',         emoji: '🛍️', color: '#f472b6' },
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
  recurringIncome: [], recurringExpense: [], recurringTransfers: [],
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
  if (!Array.isArray(state.recurringTransfers)) state.recurringTransfers = [];
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
    [...state.recurringIncome, ...state.recurringExpense, ...state.recurringTransfers].forEach(r => {
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
    let dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    // Im Startmonat erst buchen, wenn das gewählte Startdatum tatsächlich
    // erreicht ist (z.B. Startdatum "morgen" -> heute noch nicht buchen).
    if (cursor === startKey && startDate > todayKey) break;
    // Im aktuellen Monat erst buchen, sobald der fällige Tag wirklich
    // erreicht ist — sonst würde z.B. der Lohn vom 15. schon am 1.
    // des Monats als bereits erhalten erscheinen.
    if (cursor === nowKey && dateStr > todayKey) break;
    // Nachhol-Buchungen für bereits vergangene Monate behalten ihr
    // tatsächliches Datum (dateStr wurde oben bereits mit cursors
    // Jahr/Monat berechnet), damit sie im jeweiligen vergangenen Monat
    // vom Budget abgezogen werden statt immer im aktuellen Monat.
    if (type === 'transfer') {
      state.entries.push({
        id: uid(), type: 'transfer', amount: r.amount, category: 'Interne Überweisung',
        note: r.name, date: dateStr, fromAccountId: r.fromAccountId, toAccountId: r.toAccountId, recurringId: r.id,
      });
      applyTransferDelta(r.fromAccountId, r.toAccountId, r.amount);
    } else {
      // Bei Ausgaben-Regeln mit "Nur Konto" wird die Buchung nicht ins Budget gerechnet.
      const entryType = (type === 'expense' && r.accountOnly) ? 'account-only' : type;
      state.entries.push({
        id: uid(), type: entryType, amount: r.amount, category: r.category,
        note: r.name, date: dateStr, accountId: r.accountId || '', recurringId: r.id,
      });
      applyAccountDelta(r.accountId || '', r.amount, entryType);
    }
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
  [...state.recurringIncome, ...state.recurringExpense, ...state.recurringTransfers].forEach(r => { rulesById[r.id] = r; });
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
  // Hinweis: Die frühere Neuverteilung der Buchungen auf fortlaufende Monate
  // (inkl. Zurücksetzen von lastAppliedMonth) wurde entfernt. Sie machte manuell
  // gelöschte automatische Buchungen beim nächsten Laden wieder rückgängig.
  return changed;
}
// Prüft alle Regeln auf fällige Monate (und holt verpasste Monate nach,
// falls die App länger nicht geöffnet wurde oder eine Regel neu mit
// vergangenem Startdatum angelegt wurde) und speichert bei Änderungen.
function applyDueRecurring() {
  let changed = correctRecurringEntryDates();
  if (state.recurringIncome.length || state.recurringExpense.length || state.recurringTransfers.length) {
    state.recurringIncome.forEach(r    => { if (applyRuleRecurring(r, 'income'))    changed = true; });
    state.recurringExpense.forEach(r   => { if (applyRuleRecurring(r, 'expense'))   changed = true; });
    state.recurringTransfers.forEach(r => { if (applyRuleRecurring(r, 'transfer'))  changed = true; });
  }
  // Vor dem Server-Abgleich nicht speichern: sonst würde der (evtl. veraltete)
  // localStorage-Stand zum Server geschickt und neuere Server-Daten überschreiben.
  if (changed && serverLoaded) saveState();
  return changed;
}

// ── SEITEN-HOOK ──────────────────────────────────────────────
// Jede Seite registriert hier, wie sie sich neu zeichnet. main.js ruft das
// auf, wenn die Server-Daten eingetroffen sind oder ein Eintrag gelöscht wurde.
let pageRender = () => {};
function registerPageRender(fn) { pageRender = fn; }

// Sofort aus localStorage laden (damit die UI nicht leer flackert)
// Danach asynchron vom Server nachladen und überschreiben
function loadState() {
  try {
    const s = localStorage.getItem('budgetApp_v2');
    if (s) Object.assign(state, JSON.parse(s));
  } catch(e) {}
  sanitizeState();
  applyDueRecurring();

  // Server-Daten nachladen (überschreibt localStorage, ausser es gibt lokale
  // Änderungen, die der Server noch nicht bestätigt hat)
  fetch('/api/data.php', { credentials: 'include' })
    .then(r => r.ok ? r.json() : null)
    .then(res => {
      serverLoaded = true;
      if (!res || !res.success || !res.data) return;
      if (_hasUnsynced()) {
        // Letztes Speichern kam nicht beim Server an (z.B. Seite zu schnell
        // gewechselt oder offline) → lokalen Stand behalten und nur das
        // nachsenden, was sich vom Server-Stand unterscheidet.
        _markSynced(res.data);
        _pushToServer();
        return;
      }
      // Auch leere Serverdaten ({}) übernehmen, damit ein frisches Gerät
      // nicht mit veralteten localStorage-Daten hängen bleibt
      Object.assign(state, res.data);
      sanitizeState();
      _markSynced(_payload());
      applyDueRecurring();
      // localStorage als Cache aktualisieren
      _persistLocal();
      // UI neu rendern mit Server-Daten: jede Seite meldet ihre Render-Funktion
      // per registerPageRender() an (siehe assets/js/pages/*.js)
      pageRender();
    })
    .catch(() => { serverLoaded = true; }); // Offline? localStorage-Daten behalten
}

// true, sobald der erste Server-Abgleich in loadState() durch ist.
let serverLoaded = false;
// Unsichtbare Markierung (nur im localStorage) für lokale Änderungen,
// die der Server noch nicht bestätigt hat.
const UNSYNCED_KEY = 'budgetApp_unsynced';
let _saveSeq = 0;
function _hasUnsynced() {
  try { return !!localStorage.getItem(UNSYNCED_KEY); } catch(e) { return false; }
}

function _payload() {
  const { balance, budget, entries, accounts, recurringIncome, recurringExpense, recurringTransfers, appliedRecurringMonths, customExpenseCats, customIncomeCats } = state;
  return { balance, budget, entries, accounts, recurringIncome, recurringExpense, recurringTransfers, appliedRecurringMonths, customExpenseCats, customIncomeCats };
}

function _persistLocal() {
  localStorage.setItem('budgetApp_v2', JSON.stringify(_payload()));
}

// Zuletzt vom Server bestätigter Stand, pro Bereich (budget, accounts, …) als
// JSON-String. Daran wird erkannt, welche Bereiche sich geändert haben.
let _synced = {};
function _markSynced(data) {
  Object.keys(_payload()).forEach(k => { _synced[k] = JSON.stringify(data[k]); });
}

function saveState() {
  _persistLocal();
  try { localStorage.setItem(UNSYNCED_KEY, '1'); } catch(e) {}
  // Vor dem ersten Server-Abgleich ist unbekannt, was sich geändert hat;
  // loadState() sendet die Änderungen dann nach (Markierung ist gesetzt).
  if (serverLoaded) _pushToServer();
}

// Sendet nur die Bereiche, die sich seit dem letzten bestätigten Stand
// geändert haben — asynchron, kein await, UI bleibt reaktiv.
function _pushToServer() {
  const current = _payload();
  const changed = {}, sentJson = {};
  Object.keys(current).forEach(k => {
    const json = JSON.stringify(current[k]);
    if (json !== _synced[k]) { changed[k] = current[k]; sentJson[k] = json; }
  });
  const seq = ++_saveSeq;
  if (!Object.keys(changed).length) {
    try { localStorage.removeItem(UNSYNCED_KEY); } catch(e) {}
    return;
  }
  const body = JSON.stringify({ data: changed });
  fetch('/api/data.php', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    // keepalive: Request läuft weiter, auch wenn direkt die Seite gewechselt
    // wird (Browser erlauben das nur bis ca. 64 KB)
    keepalive: body.length < 60000,
    body
  })
    .then(r => r.ok ? r.json() : null)
    .then(res => {
      if (!res || !res.success) return;
      Object.assign(_synced, sentJson);
      // Nur der zuletzt gesendete Stand darf die Markierung entfernen
      if (seq === _saveSeq) {
        try { localStorage.removeItem(UNSYNCED_KEY); } catch(e) {}
      }
    })
    .catch(() => {}); // Offline: bleibt markiert und wird beim nächsten Laden nachgesendet
}

// ── APP MENU (Header-Icon-Overlay) ────────────────────────────
let _appMenuCloseTimer = null;
function toggleAppMenu(forceState) {
  const el = document.getElementById('appMenuOverlay');
  if (!el) return;
  const open = typeof forceState === 'boolean' ? forceState : !el.classList.contains('show');
  clearTimeout(_appMenuCloseTimer);
  if (open) {
    el.classList.add('open');        // im Layout einblenden (noch unsichtbar, Panel unten ausserhalb)
    void el.offsetWidth;             // Reflow erzwingen, damit die Transition vom Startzustand aus läuft
    el.classList.add('show');        // Panel fährt hoch, Hintergrund blendet ein
  } else {
    el.classList.remove('show');     // Panel fährt runter, Hintergrund blendet aus
    _appMenuCloseTimer = setTimeout(() => el.classList.remove('open'), 320); // erst nach der Animation ausblenden
  }
}
function closeAppMenu() { toggleAppMenu(false); }

// ── SEITENERKENNUNG (für saveBudget, das von Home UND Einstellungen genutzt wird)
const IS_HOME     = !!document.getElementById('donutSvg');
const IS_SETTINGS = !!document.getElementById('accountsList');

// ── BUDGET (Modal existiert auf index.html und settings.html)
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

// ── EINTRÄGE (Zeile, Löschen, Konto-Salden): Home-Liste und Analyse-Liste teilen sich das
// Baut das innere Markup eines einzelnen Eintrags (wird von der
// Home-Liste und der Monatsliste bei "Analyse" gemeinsam genutzt).
function entryRowInner(e) {
  if (e.type === 'transfer') {
    const fromAcc = state.accounts.find(a => a.id === e.fromAccountId);
    const toAcc   = state.accounts.find(a => a.id === e.toAccountId);
    return `
        <div class="tx-cat-dot" style="background:#7c93ff"></div>
        <div class="tx-info">
          <div class="tx-cat-label">🔄 Interne Überweisung</div>
          <div class="tx-note">${formatDate(e.date)} · ${e.note ? e.note + ' · ' : ''}${fromAcc ? fromAcc.name : '?'} → ${toAcc ? toAcc.name : '?'}</div>
        </div>
        <div class="tx-amount" style="color:#7c93ff">${formatNum(e.amount)}</div>
        <div class="tx-actions">
          <button class="tx-btn" onclick="editEntry('${e.id}')">✏️</button>
          <button class="tx-btn delete" onclick="deleteEntry('${e.id}')">🗑️</button>
        </div>`;
  }
  const cat = ALL_CATS.find(c => c.name === e.category) || { color: '#ccc', emoji: '?' };
  const isInc = e.type === 'income';
  const isAccOnly = e.type === 'account-only';
  const acc = e.accountId ? state.accounts.find(a => a.id === e.accountId) : null;
  const accTag = acc ? `<span class="tx-account-tag">🏦 ${acc.name}</span>` : '';
  const accOnlyBadge = isAccOnly ? `<span class="tx-account-tag" style="background:#f0f4ff;color:#4e8cf5;">nur Konto</span>` : '';
  return `
      <div class="tx-cat-dot" style="background:${cat.color}"></div>
      <div class="tx-info">
        <div class="tx-cat-label">${cat.emoji} ${e.category}</div>
        <div class="tx-note">${formatDate(e.date)}${(e.note || accTag || accOnlyBadge) ? ' · ' : ''}${e.note ? e.note + (accTag || accOnlyBadge ? ' · ' : '') : ''}${accTag}${accOnlyBadge}</div>
      </div>
      <div class="tx-amount ${isInc ? 'income' : 'expense'}">${isInc ? '+' : '−'}${formatNum(e.amount)}</div>
      <div class="tx-actions">
        <button class="tx-btn" onclick="editEntry('${e.id}')">✏️</button>
        <button class="tx-btn delete" onclick="deleteEntry('${e.id}')">🗑️</button>
      </div>`;
}

function applyAccountDelta(accountId, amount, type) {
  if (!accountId) return;
  const acc = state.accounts.find(a => a.id === accountId);
  if (acc) acc.balance += (type === 'income' ? amount : -amount);
  // 'account-only' wird wie eine Ausgabe behandelt (Abbuchung vom Konto)
}
// Interne Überweisung: Betrag vom Ursprungskonto abziehen, dem Zielkonto gutschreiben.
// Wirkt sich nicht auf Budget/Ausgaben-Summen aus, da kein 'expense'/'income'.
function applyTransferDelta(fromAccountId, toAccountId, amount) {
  if (!fromAccountId || !toAccountId) return;
  const fromAcc = state.accounts.find(a => a.id === fromAccountId);
  const toAcc   = state.accounts.find(a => a.id === toAccountId);
  if (fromAcc) fromAcc.balance -= amount;
  if (toAcc)   toAcc.balance += amount;
}

function editEntry(id) { openEntryModal(id); }
function deleteEntry(id) {
  if (confirm('Eintrag löschen?')) {
    const e = state.entries.find(x => x.id === id);
    if (e) {
      if (e.type === 'transfer') {
        applyTransferDelta(e.fromAccountId, e.toAccountId, -e.amount);
      } else {
        const reverseType = (e.type === 'income') ? 'expense' : 'income';
        applyAccountDelta(e.accountId, e.amount, reverseType);
      }
    }
    state.entries = state.entries.filter(e => e.id !== id);
    saveState(); pageRender();
  }
}

// ── HELPERS
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function formatNum(n) { return Number(n).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatDate(d) { return d ? new Date(d).toLocaleDateString('de-CH') : ''; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// ── START: Daten laden (die Seitendatei folgt danach)
loadState();
