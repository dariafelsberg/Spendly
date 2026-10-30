/* ==========================================================
 * main.js – gemeinsamer Code für alle Seiten
 * Konstanten, State, Speichern/Laden (localStorage + Server), Wiederkehrende
 * Buchungen, App-Menü, Budget-Modal, Eintragszeile und Helper.
 * Muss VOR der seitenspezifischen Datei in assets/js/pages/ geladen werden.
 ========================================================== */

// ── CONSTANTS
const EXPENSE_CATEGORIES = [
  { name: 'Rechnungen',      icon: 'bill', color: '#e8533a' },
  { name: 'Auto',            icon: 'car', color: '#4e8cf5' },
  { name: 'Telefon',         icon: 'phone', color: '#a78bfa' },
  { name: 'Restaurants',     icon: 'restaurant', color: '#f59e42' },
  { name: 'Lebensmittel',    icon: 'shoppingbasket', color: '#34d399' },
  { name: 'Geschenke',       icon: 'gift', color: '#f472b6' },
  { name: 'Gesundheit',      icon: 'pill', color: '#60a5fa' },
  { name: 'Wohnen',          icon: 'house', color: '#fb923c' },
  { name: 'Online Shopping', icon: 'package', color: '#c084fc' },
  { name: 'Haustiere',       icon: 'paw', color: '#4ade80' },
  { name: 'Sport',           icon: 'sport', color: '#38bdf8' },
  { name: 'ÖV',              icon: 'oev', color: '#f87171' },
  { name: 'Hygieneartikel',  icon: 'hygiene', color: '#a3e635' },
  { name: 'Shopping',         icon: 'shoppingbag', color: '#f472b6' },
];
const INCOME_CATEGORIES = [
  { name: 'Lohn',      icon: 'wallet', color: '#16a34a' },
  { name: 'Sackgeld',  icon: 'coin', color: '#84cc16' },
  { name: 'Sonstiges', icon: 'tag', color: '#4ade80' },
];
// ALL_CATS ist ein dynamischer Getter (berücksichtigt eigene Kategorien)
function allExpenseCats() { return [...EXPENSE_CATEGORIES, ...(state.customExpenseCats || [])]; }
function allIncomeCats()  { return [...INCOME_CATEGORIES,  ...(state.customIncomeCats  || [])]; }
function allCats()        { return [...allExpenseCats(), ...allIncomeCats()]; }
// ALL_CATS bleibt als Alias für Stellen erhalten, die es referenzieren (Kalender, Buchungen)
Object.defineProperty(window, 'ALL_CATS', { get: allCats });

// Icon einer Kategorie: Standard-Kategorien haben ein SVG-Icon (assets/icons/ui),
// eigene Kategorien behalten ihr gewähltes Emoji.
function iconHtml(name, color) {
  return `<span class="ico ico-${name}"${color ? ` style="color:${color}"` : ''}></span>`;
}
function catIcon(cat) {
  return cat.icon ? iconHtml(cat.icon, cat.color) : (cat.emoji || '');
}
// Für <option>-Texte (dort ist kein HTML möglich): nur eigene Kategorien zeigen ihr Emoji.
function catOptionLabel(cat) {
  return cat.icon ? cat.name : `${cat.emoji} ${cat.name}`;
}

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

// true, sobald alle Daten da sind (Server-Abgleich fertig, fehlgeschlagen oder
// nach spätestens 6 s, z.B. bei sehr langsamem Netz). Erst dann verschwindet
// der Ladebildschirm (Skeleton, Klasse is-loading auf <html>) und die Seite
// wird gezeichnet.
let dataReady = false;
function _finishLoad() {
  if (dataReady) return;
  dataReady = true;
  document.documentElement.classList.remove('is-loading');
  pageRender();
}
setTimeout(_finishLoad, 6000);

// Sofort aus localStorage laden (damit die UI nicht leer flackert)
// Danach asynchron vom Server nachladen und überschreiben
function loadState() {
  try {
    const s = localStorage.getItem('budgetApp_v2');
    if (s) Object.assign(state, JSON.parse(s));
  } catch(e) {}
  sanitizeState();
  applyDueRecurring();

  // Server-Daten aus Supabase nachladen (überschreibt localStorage, ausser es
  // gibt lokale Änderungen, die der Server noch nicht bestätigt hat)
  sb.auth.getSession()
    .then(({ data: { session } }) => {
      if (!session) { _finishLoad(); return { error: true }; }
      sbAccessToken = session.access_token;
      _claimLocalData(session.user.id);
      // Einmalig: Daten vom alten PHP-Server übernehmen, falls für diese
      // E-Mail-Adresse welche importiert wurden (siehe supabase/schema.sql)
      return sb.rpc('claim_legacy_data')
        .then(({ data: claimed }) => {
          // Übernommene Server-Daten gehen vor ungesendeten lokalen Änderungen
          if (claimed) { try { localStorage.removeItem(UNSYNCED_KEY); } catch(e) {} }
        }, () => {})
        .then(() => sb.from('user_data').select('payload').maybeSingle());
    })
    .then(({ data: row, error }) => {
      serverLoaded = true;
      if (error) { _finishLoad(); return; }
      if (!row) {
        // Noch kein Datensatz (neues Konto oder Umzug vom alten Server):
        // vorhandene lokale Daten als ersten Stand hochladen
        _synced = {};
        _pushToServer();
        _finishLoad();
        return;
      }
      const res = { data: row.payload || {} };
      if (_hasUnsynced()) {
        // Letztes Speichern kam nicht beim Server an (z.B. Seite zu schnell
        // gewechselt oder offline) → lokalen Stand behalten und nur das
        // nachsenden, was sich vom Server-Stand unterscheidet.
        _markSynced(res.data);
        _pushToServer();
        _finishLoad();
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
      if (dataReady) pageRender(); else _finishLoad();
    })
    .catch(() => { // Offline? localStorage-Daten behalten
      serverLoaded = true; _finishLoad();
      if (!navigator.onLine) showToast('Du bist offline', { type: 'offline', text: 'Du siehst den zuletzt gespeicherten Stand. Neue Einträge werden übertragen, sobald du wieder online bist.', duration: 8000 });
    });
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

// Merkt sich, welchem Konto die lokale Kopie gehört. Meldet sich auf dem
// Gerät ein anderes Konto an, wird die fremde lokale Kopie verworfen, damit
// sie nicht in dessen Konto hochgeladen wird.
const OWNER_KEY = 'budgetApp_owner';
function _claimLocalData(userId) {
  let owner = null;
  try { owner = localStorage.getItem(OWNER_KEY); } catch(e) {}
  if (owner && owner !== userId) {
    Object.assign(state, {
      balance: 0, budget: 0, entries: [], accounts: [],
      recurringIncome: [], recurringExpense: [], recurringTransfers: [],
      appliedRecurringMonths: [], customExpenseCats: [], customIncomeCats: [],
    });
    try {
      localStorage.removeItem('budgetApp_v2');
      localStorage.removeItem(UNSYNCED_KEY);
    } catch(e) {}
    pageRender();
  }
  try { localStorage.setItem(OWNER_KEY, userId); } catch(e) {}
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
    if (_syncNoticeShown) { _syncNoticeShown = false; showToast('Wieder verbunden', { text: 'Alle Änderungen sind übertragen.', key: 'sync' }); }
    return;
  }
  // Ohne Token (abgemeldet/abgelaufen) bleibt die Markierung gesetzt und
  // wird beim nächsten Laden nachgesendet
  if (!sbAccessToken) return;
  const body = JSON.stringify({ patch: changed });
  // Direkt per fetch statt supabase-js, damit keepalive möglich ist:
  // Request läuft weiter, auch wenn direkt die Seite gewechselt wird
  // (Browser erlauben das nur bis ca. 64 KB)
  fetch(SUPABASE_URL + '/rest/v1/rpc/save_user_data', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + sbAccessToken
    },
    keepalive: body.length < 60000,
    body
  })
    .then(r => {
      if (!r.ok) { _notifySyncProblem('Nicht auf dem Server gespeichert', 'Der Server hat nicht geantwortet. Deine Änderung ist auf diesem Gerät gesichert.', 'error'); return; }
      Object.assign(_synced, sentJson);
      if (_syncNoticeShown) { _syncNoticeShown = false; showToast('Wieder verbunden', { text: 'Alle Änderungen sind übertragen.', key: 'sync' }); }
      // Nur der zuletzt gesendete Stand darf die Markierung entfernen
      if (seq === _saveSeq) {
        try { localStorage.removeItem(UNSYNCED_KEY); } catch(e) {}
      }
    })
    .catch(() => _notifySyncProblem('Du bist offline', 'Deine Änderung ist auf diesem Gerät gespeichert und wird übertragen, sobald du wieder online bist.', 'offline')); // bleibt markiert und wird beim nächsten Laden nachgesendet
}
// Hinweis bleibt stehen, bis man ihn schliesst oder "Erneut versuchen" klappt
let _syncNoticeShown = false;
function _notifySyncProblem(title, text, type) {
  const firstTime = !_syncNoticeShown;
  _syncNoticeShown = true;
  // key 'sync': dieselbe Meldung wird an ihrem Platz aktualisiert; "Erneut versuchen" lässt sie stehen,
  // bis das Ergebnis da ist ("Wieder verbunden" oder nochmals dieser Hinweis)
  setTimeout(() => showToast(title, { type, text, sticky: true, key: 'sync',
    action: { label: 'Erneut versuchen', replace: true, onClick: _pushToServer } }), firstTime ? 1700 : 0); // erst nach "Gespeichert"
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
  const val = parseAmount(document.getElementById('budgetInput').value);
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
          <div class="tx-cat-label">${iconHtml('transfer', '#7c93ff')} Interne Überweisung</div>
          <div class="tx-note">${formatRelDate(e.date)} · ${e.note ? e.note + ' · ' : ''}${fromAcc ? fromAcc.name : '?'} → ${toAcc ? toAcc.name : '?'}</div>
        </div>
        <div class="tx-amount" style="color:var(--transfer-text)">${formatNum(e.amount)}</div>
        <div class="tx-actions">
          <button class="tx-btn" onclick="editEntry('${e.id}')"><span class="ico ico-pencil"></span></button>
          <button class="tx-btn delete" onclick="deleteEntry('${e.id}')"><span class="ico ico-trash"></span></button>
        </div>`;
  }
  const cat = ALL_CATS.find(c => c.name === e.category) || { color: '#ccc', emoji: '?' };
  const isInc = e.type === 'income';
  const isAccOnly = e.type === 'account-only';
  const acc = e.accountId ? state.accounts.find(a => a.id === e.accountId) : null;
  const accTag = acc ? `<span class="tx-account-tag">${iconHtml('bank')} ${acc.name}</span>` : '';
  const accOnlyBadge = isAccOnly ? `<span class="tx-account-tag" style="background:#f0f4ff;color:#4e8cf5;">nur Konto</span>` : '';
  return `
      <div class="tx-cat-dot" style="background:${cat.color}"></div>
      <div class="tx-info">
        <div class="tx-cat-label">${catIcon(cat)} ${e.category}</div>
        <div class="tx-note">${formatRelDate(e.date)}${(e.note || accTag || accOnlyBadge) ? ' · ' : ''}${e.note ? e.note + (accTag || accOnlyBadge ? ' · ' : '') : ''}${accTag}${accOnlyBadge}</div>
      </div>
      <div class="tx-amount ${isInc ? 'income' : 'expense'}">${isInc ? '+' : '−'}${formatNum(e.amount)}</div>
      <div class="tx-actions">
        <button class="tx-btn" onclick="editEntry('${e.id}')"><span class="ico ico-pencil"></span></button>
        <button class="tx-btn delete" onclick="deleteEntry('${e.id}')"><span class="ico ico-trash"></span></button>
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
  deleteWithUndo(() => {
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
  }, 'Eintrag gelöscht');
}

// ── FENSTER NACH UNTEN WISCHEN (Touch-Geräte)
// Das Fenster folgt dem Finger; weit genug oder schnell genug nach unten gezogen schliesst es.
function initModalSwipe() {
  document.querySelectorAll('.modal-overlay:not(.modal-center) .modal').forEach(sheet => {
    const overlay = sheet.closest('.modal-overlay');
    let startY = 0, startT = 0, dy = 0, dragging = false;
    sheet.addEventListener('touchstart', e => {
      if (e.touches.length !== 1 || sheet.scrollTop > 0) return;
      startY = e.touches[0].clientY; startT = performance.now(); dy = 0; dragging = true;
    }, { passive: true });
    sheet.addEventListener('touchmove', e => {
      if (!dragging) return;
      dy = e.touches[0].clientY - startY;
      if (dy <= 0) { sheet.style.transform = ''; sheet.style.transition = ''; return; }
      if (e.cancelable) e.preventDefault();
      sheet.style.transition = 'none';
      sheet.style.transform = `translateY(${dy}px)`;
    }, { passive: false });
    const end = () => {
      if (!dragging) return; dragging = false;
      const fast = dy > 40 && dy / (performance.now() - startT) > 0.5;
      sheet.style.transition = '';
      sheet.style.transform = '';
      if (dy > 110 || fast) {
        if (overlay.id === 'entryModal' && typeof closeEntryModal === 'function') closeEntryModal();
        else overlay.classList.remove('show');
      }
      dy = 0;
    };
    sheet.addEventListener('touchend', end);
    sheet.addEventListener('touchcancel', end);
  });
}
document.addEventListener('DOMContentLoaded', initModalSwipe);

// ── HINTERGRUND SPERREN, solange ein Fenster (Modal oder Menü) offen ist
// position: fixed statt nur overflow: hidden, weil Safari auf dem iPhone
// sonst trotzdem scrollt. Die Scrollposition wird gemerkt und zurückgesetzt.
let _scrollLockY = null;
function _updateScrollLock() {
  const open = !!document.querySelector('.modal-overlay.show, .app-menu-overlay.show');
  const b = document.body;
  if (open && _scrollLockY === null) {
    _scrollLockY = window.scrollY;
    Object.assign(b.style, { position: 'fixed', top: -_scrollLockY + 'px', left: '0', right: '0', width: '100%' });
  } else if (!open && _scrollLockY !== null) {
    Object.assign(b.style, { position: '', top: '', left: '', right: '', width: '' });
    window.scrollTo(0, _scrollLockY);
    _scrollLockY = null;
  }
}
document.addEventListener('DOMContentLoaded', () => {
  const obs = new MutationObserver(_updateScrollLock);
  document.querySelectorAll('.modal-overlay, .app-menu-overlay').forEach(el => obs.observe(el, { attributes: true, attributeFilter: ['class'] }));
});

// ── TASTATUR: Fenster bedienbar ohne Maus/Finger
// Beim Öffnen springt der Fokus ins Fenster, beim Schliessen zurück zum auslösenden Button.
// Tab bleibt im offenen Fenster, Escape schliesst es (wie "Abbrechen").
const _FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
function _openModal() {
  const list = document.querySelectorAll('.modal-overlay.show');
  return list.length ? list[list.length - 1] : null;
}
document.addEventListener('DOMContentLoaded', () => {
  const obs = new MutationObserver(records => records.forEach(r => {
    const overlay = r.target, sheet = overlay.querySelector('.modal');
    const isOpen = overlay.classList.contains('show');
    if (isOpen && !overlay._wasOpen) {
      overlay._returnFocus = document.activeElement;
      if (sheet && !sheet.contains(document.activeElement)) sheet.focus({ preventScroll: true });
    } else if (!isOpen && overlay._wasOpen) {
      const back = overlay._returnFocus;
      if (back && document.contains(back) && typeof back.focus === 'function') back.focus({ preventScroll: true });
    }
    overlay._wasOpen = isOpen;
  }));
  document.querySelectorAll('.modal-overlay').forEach(el => obs.observe(el, { attributes: true, attributeFilter: ['class'] }));
});
document.addEventListener('keydown', e => {
  // Elemente mit role="button" (z. B. Kalendertage, "Einträge") wie echte Buttons mit Enter/Leertaste auslösen
  if ((e.key === 'Enter' || e.key === ' ') && e.target.getAttribute && e.target.getAttribute('role') === 'button' && e.target.tagName !== 'BUTTON') {
    e.preventDefault();
    e.target.click();
    return;
  }
  const overlay = _openModal();
  if (e.key === 'Escape') {
    if (overlay) {
      const cancel = overlay.querySelector('.btn-cancel');
      if (cancel) cancel.click(); else overlay.classList.remove('show');
    } else if (document.querySelector('.app-menu-overlay.show')) {
      closeAppMenu();
    } else if (window.parent !== window && typeof window.parent.closeAppMenu === 'function') {
      window.parent.closeAppMenu(); // Einstellungen im Menü-Fenster (iframe)
    }
    return;
  }
  if (e.key === 'Tab' && overlay) {
    const items = [...overlay.querySelectorAll(_FOCUSABLE)].filter(el => !el.disabled && el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  }
});

// ── HELPERS
// Meldung oben am Bildschirm (ersetzt alert/confirm des Browsers).
// Aufbau nach der Regel: Was ist passiert (title). Warum (text). Was jetzt (action-Button).
// type: 'success' (Häkchen), 'error' (rot), 'offline' (WLAN aus), 'deleted' (Abfalleimer)
// Bestätigungen ohne Button verschwinden nach 1.6 s; Fehler und Meldungen mit Button
// bleiben länger stehen bzw. bis man sie schliesst (sticky).
// Mehrere Meldungen stapeln sich untereinander (höchstens 3). Fliegt eine weg,
// rutschen die darunter nach oben nach. Mit key wird eine bestehende Meldung
// an ihrem Platz ersetzt statt eine neue angehängt (z. B. derselbe Fehler zweimal).
const _TOAST_ICON = { success: 'ico-check', error: 'ico-banned', offline: 'ico-wifi-off', deleted: 'ico-trash' };
const _TOAST_MAX = 3;
function _toastStack() {
  let stack = document.getElementById('toastStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toastStack';
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  return stack;
}
function showToast(title, { text = '', type = 'success', action = null, duration, sticky = false, key = null } = {}) {
  const stack = _toastStack();
  let item = key ? [...stack.children].find(x => x.dataset.key === key && !x.classList.contains('leaving')) : null;
  const isNew = !item;
  if (isNew) {
    item = document.createElement('div');
    item.className = 'toast-item';
    if (key) item.dataset.key = key;
    item.innerHTML = '<div class="toast"></div>';
    stack.appendChild(item);
    // Zu viele Meldungen: die älteste fliegt weg
    const visible = [...stack.children].filter(x => !x.classList.contains('leaving'));
    if (visible.length > _TOAST_MAX) removeToast(visible[0]);
  }
  const el = item.querySelector('.toast');
  const simple = !text && !action && !sticky; // kurze Bestätigung: nur Titel, kein X
  el.className = 'toast toast-' + type + (simple ? ' toast-simple' : '') + (isNew ? '' : ' show');
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `
    <span class="toast-icon" aria-hidden="true"><span class="ico ${_TOAST_ICON[type] || _TOAST_ICON.success}"></span></span>
    <div class="toast-body">
      <div class="toast-title"></div>
      ${text ? '<div class="toast-text"></div>' : ''}
      ${action ? '<button type="button" class="toast-action"></button>' : ''}
    </div>
    ${simple ? '' : '<button type="button" class="toast-close" aria-label="Meldung schliessen"><span class="ico ico-close"></span></button>'}
    ${action && !sticky ? '<span class="toast-timer" aria-hidden="true"></span>' : ''}`;
  el.querySelector('.toast-title').textContent = title;
  if (text) el.querySelector('.toast-text').textContent = text;
  if (action) {
    const btn = el.querySelector('.toast-action');
    btn.textContent = action.label;
    // replace: die Meldung bleibt stehen, onClick zeigt mit demselben key die Folgemeldung an ihrem Platz
    btn.onclick = () => { if (!action.replace) removeToast(item); action.onClick(); };
  }
  if (!simple) el.querySelector('.toast-close').onclick = () => removeToast(item);
  clearTimeout(item._timer);
  if (isNew) {
    void el.offsetWidth; // Startposition oberhalb festlegen, damit das Einfliegen animiert wird
    el.classList.add('show');
  }
  if (!sticky) {
    const ms = duration || (simple ? 1600 : action ? 6000 : 5000);
    item._timer = setTimeout(() => removeToast(item), ms);
    // Zeitbalken: zeigt, wie lange "Rückgängig" noch möglich ist (läuft genau so lange wie die Meldung)
    const bar = el.querySelector('.toast-timer');
    if (bar) bar.style.animationDuration = ms + 'ms';
  }
  return item;
}
// Meldung nach oben ausfliegen lassen; danach rutschen die übrigen weich an ihren neuen Platz
function removeToast(item) {
  if (!item || item.classList.contains('leaving')) return;
  item.classList.add('leaving');
  clearTimeout(item._timer);
  item.querySelector('.toast').classList.remove('show');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => {
    const stack = item.parentNode;
    if (!stack) return;
    const others = [...stack.children].filter(x => x !== item);
    const before = others.map(o => o.getBoundingClientRect().top);
    item.remove();
    if (reduce) return;
    others.forEach((o, i) => {
      const dy = before[i] - o.getBoundingClientRect().top;
      if (dy) o.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
                        { duration: 320, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    });
  }, reduce ? 0 : 280); // so lange dauert das Ausfliegen (siehe .toast in main.css)
}
// Ohne key: alle Meldungen ausblenden; mit key: nur diese
function hideToast(key) {
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  [...stack.children].filter(x => !key || x.dataset.key === key).forEach(removeToast);
}
// Fehler beim Speichern: Meldung zeigen und den Cursor ins betroffene Feld setzen
function showError(title, text, focusId) {
  showToast(title, { text, type: 'error', key: 'error' }); // derselbe Fehler nochmals: ersetzen statt stapeln
  if (focusId) document.getElementById(focusId)?.focus();
}
// Sofort löschen und "Rückgängig" anbieten (statt vorher nachzufragen).
// doDelete ändert state; Rückgängig setzt den ganzen Stand von vorher wieder ein.
function deleteWithUndo(doDelete, title, text = 'Du kannst es noch ein paar Sekunden rückgängig machen.') {
  const before = JSON.stringify(state);
  doDelete();
  saveState(); pageRender();
  const key = 'undo-' + Date.now(); // "Wiederhergestellt" erscheint am Platz dieser Meldung
  showToast(title, { text, type: 'deleted', key, action: { label: 'Rückgängig', replace: true, onClick: () => {
    Object.assign(state, JSON.parse(before));
    saveState(); pageRender();
    showToast('Wiederhergestellt', { key });
  } } });
}
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function formatNum(n) { return Number(n).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatDate(d) { return d ? new Date(d).toLocaleDateString('de-CH') : ''; }
// Relatives Datum für Listen: "Heute", "Gestern", sonst "Mo, 12.10." (anderes Jahr: "Mo, 12.10.2025")
function formatRelDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  const date = new Date(y, m - 1, day);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - date) / 86400000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Gestern';
  if (diff === -1) return 'Morgen';
  const wd = date.toLocaleDateString('de-CH', { weekday: 'short' }).replace('.', '');
  return `${wd}, ${day}.${m}.${y !== today.getFullYear() ? y : ''}`;
}
// Betrag aus einem Eingabefeld lesen: akzeptiert "12,50", "12.50" und "1'200.50"
function parseAmount(v) { return parseFloat(String(v).trim().replace(/[\s'’]/g, '').replace(',', '.')); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// ── START: Daten laden (die Seitendatei folgt danach)
loadState();
