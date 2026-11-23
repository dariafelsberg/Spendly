/* ==========================================================
 * pages/settings.js – Einstellungen (Konten, Wiederkehrendes, eigene Kategorien)
 * Benötigt assets/js/main.js
 ========================================================== */

// ── SETTINGS
function initSettings() {
  renderSettings();
  ['budgetModal','accountModal','recurringModal','customCatModal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('show'); });
  });
}
// ── DARSTELLUNG: ein runder Knopf, jeder Tipp wechselt Hell → Wie Gerät → Dunkel → Hell
const THEME_ORDER = ['light', 'system', 'dark'];
const THEME_NAMES = { light: 'Hell', system: 'Wie Gerät', dark: 'Dunkel' };
function updateThemeSwitch() {
  const box = document.getElementById('themeSwitch');
  if (!box || !window.spendlyTheme) return;
  const mode = spendlyTheme.get();
  box.dataset.mode = mode;
  const next = THEME_ORDER[(THEME_ORDER.indexOf(mode) + 1) % THEME_ORDER.length];
  document.getElementById('themeBtn').setAttribute('aria-label', t('Darstellung: {jetzt}. Wechseln zu {neu}', { jetzt: t(THEME_NAMES[mode]), neu: t(THEME_NAMES[next]) }));
}
function cycleTheme() {
  const mode = spendlyTheme.get();
  spendlyTheme.set(THEME_ORDER[(THEME_ORDER.indexOf(mode) + 1) % THEME_ORDER.length]);
  updateThemeSwitch();
  const btn = document.getElementById('themeBtn');
  btn.classList.remove('is-tapped'); void btn.offsetWidth; btn.classList.add('is-tapped');
}

function renderSettings() {
  updateThemeSwitch();
  renderLocaleSettings();
  renderAccountsList(); renderRecurringList('income'); renderRecurringList('expense'); renderRecurringList('transfer');
  renderCustomCatList('expense'); renderCustomCatList('income');
  const sd = document.getElementById('budgetSettingDisplay');
  if (sd) showBudgetSetting(sd);
  showRecurringTab(recurringTab);
}
// Ohne Budget kein 'CHF 0.00', sondern ein Hinweis
function showBudgetSetting(sd) {
  sd.textContent = state.budget ? money(state.budget) : t('Noch kein Budget');
  sd.classList.toggle('is-empty', !state.budget);
  // Computer: dasselbe Budget im Eingabefeld (nicht überschreiben, während man tippt)
  const inp = document.getElementById('budgetInlineInput');
  if (inp && document.activeElement !== inp) inp.value = state.budget ? formatNum(state.budget) : '';
}
// Computer: Budget direkt im Feld ändern (gespeichert bei "change", also beim Verlassen oder mit Enter)
function saveBudgetInline() {
  const inp = document.getElementById('budgetInlineInput');
  const raw = inp.value.trim();
  const val = raw === '' ? 0 : parseAmount(raw);
  if (isNaN(val) || val < 0) {
    showError('Budget nicht gespeichert', 'Gib einen Betrag ein, zum Beispiel 2000.', 'budgetInlineInput');
    return;
  }
  if (val === (state.budget || 0)) { showBudgetSetting(document.getElementById('budgetSettingDisplay')); return; }
  state.budget = val; saveState();
  showBudgetSetting(document.getElementById('budgetSettingDisplay'));
  showToast('Budget gespeichert', { text: val ? t('Ab sofort {betrag} pro Monat.', { betrag: money(val) }) : 'Du hast kein Monatsbudget mehr festgelegt.' });
}

// Wiederkehrend: welcher Reiter auf dem Computer offen ist (auf dem Handy stehen alle untereinander)
let recurringTab = 'expense';
function showRecurringTab(type) {
  recurringTab = type;
  ['income', 'expense', 'transfer'].forEach(t => {
    const on = t === type;
    const tab = document.getElementById('recTab-' + t);
    const panel = document.getElementById('recPanel-' + t);
    if (tab) { tab.classList.toggle('active', on); tab.setAttribute('aria-selected', on); tab.tabIndex = on ? 0 : -1; }
    if (panel) panel.classList.toggle('active', on);
  });
}
function accountRowHtml(a) {
  const goals = (state.goals || []).filter(g => g.accountId === a.id).length;
  const vis = a.visible ? iconHtml('eye_open') + ' ' + t('sichtbar') : iconHtml('eye_closed') + ' ' + t('versteckt');
  const extra = isSavingAccount(a) ? (goals === 1 ? t('1 Sparziel') : t('{n} Sparziele', { n: goals })) : vis;
  return `
      <div class="settings-item acc-row">
        <div class="settings-item-info">
          <div class="settings-item-name">${esc(a.name)}</div>
          <div class="settings-item-val">${money(a.balance)}<span style="opacity:.6"> · ${extra}</span></div>
        </div>
        <span class="acc-bal">${money(a.balance)}</span>
        <span class="acc-vis">${extra}</span>
        <div class="settings-item-actions">
          <button class="tx-btn" onclick="openAccountModal(${jsArg(a.id)})" aria-label="${t('Konto bearbeiten')}"><span class="ico ico-pencil"></span></button>
          <button class="tx-btn delete" onclick="deleteAccount(${jsArg(a.id)})" aria-label="${t('Konto löschen')}"><span class="ico ico-trash"></span></button>
        </div>
      </div>`;
}
function renderAccountsList() {
  const el = document.getElementById('accountsList');
  const everyday = state.accounts.filter(a => !isSavingAccount(a));
  const saving   = state.accounts.filter(isSavingAccount);
  // Ohne Sparkonto bleibt die Liste wie bisher (keine Zwischentitel)
  el.innerHTML = !state.accounts.length
    ? `<div class="empty-tx">${t('Noch keine Konten hinzugefügt.')}</div>`
    : !saving.length ? everyday.map(accountRowHtml).join('')
    : (everyday.length ? `<div class="settings-subhead">${t('Alltag')}</div>` + everyday.map(accountRowHtml).join('') : '') +
      `<div class="settings-subhead">${t('Sparen')}</div>` + saving.map(accountRowHtml).join('');
}
function recurringListElId(type) {
  return type === 'income' ? 'recurringIncomeList' : type === 'transfer' ? 'recurringTransferList' : 'recurringExpenseList';
}
function recurringListFor(type) {
  return type === 'income' ? state.recurringIncome : type === 'transfer' ? state.recurringTransfers : state.recurringExpense;
}
function renderRecurringList(type) {
  const el = document.getElementById(recurringListElId(type));
  if (!el) return;
  const list = recurringListFor(type);
  const sign = type === 'income' ? '+' : type === 'transfer' ? '' : '−';
  const col  = type === 'income' ? 'var(--income-text)' : type === 'transfer' ? 'var(--transfer-text)' : 'var(--danger-text)';
  const count = document.getElementById('recCount-' + type);
  if (count) count.textContent = list.length ? list.length : '';
  el.innerHTML = !list.length
    ? `<div class="empty-tx">${t('Noch keine Einträge.')}</div>`
    : list.map(r => {
        let detail, icon, account;
        // Symbol in der Farbe der Kategorie (Überweisung: Pfeile in Blau), Tag im Monat, Konto
        const day = r.createdAt ? new Date(r.createdAt + 'T00:00:00').getDate() : 1;
        if (type === 'transfer') {
          const fromAcc = state.accounts.find(a => a.id === r.fromAccountId);
          const toAcc   = state.accounts.find(a => a.id === r.toAccountId);
          detail = `${money(r.amount)} / ${t('Monat')} · ${fromAcc ? esc(fromAcc.name) : '?'} → ${toAcc ? esc(toAcc.name) : '?'}`;
          icon = iconHtml('transfer', 'var(--transfer)');
          account = `${fromAcc ? esc(fromAcc.name) : '?'} → ${toAcc ? esc(toAcc.name) : '?'}`;
        } else {
          const acc = r.accountId ? state.accounts.find(a => a.id === r.accountId) : null;
          const cat = allCats().find(c => c.name === r.category);
          icon = cat ? catIcon(cat) : '';
          account = acc ? esc(acc.name) : '';
          detail = `${sign}${money(r.amount)} / ${t('Monat')} · ${esc(catName(r.category))}${acc ? ' · ' + iconHtml('bank') + ' ' + esc(acc.name) : ''}${r.accountOnly ? ' · ' + iconHtml('banned') + ' ' + t('Budget') : ''}`;
        }
        return `
      <div class="settings-item rec-row">
        <span class="rec-icon" aria-hidden="true">${icon}</span>
        <div class="settings-item-info">
          <div class="settings-item-name">${esc(r.name)}</div>
          <div class="settings-item-val" style="color:${col}">${detail}</div>
        </div>
        <span class="rec-amt" style="color:${col}">${sign}${formatNum(r.amount)}</span>
        <span class="rec-day">am ${day}.</span>
        <span class="rec-acc">${account}</span>
        <div class="settings-item-actions">
          <button class="tx-btn" onclick="openRecurringModal('${type}',${jsArg(r.id)})" aria-label="${t('Bearbeiten')}"><span class="ico ico-pencil"></span></button>
          <button class="tx-btn delete" onclick="deleteRecurring('${type}',${jsArg(r.id)})" aria-label="${t('Löschen')}"><span class="ico ico-trash"></span></button>
        </div>
      </div>`;
      }).join('');
}

// ── EIGENE KATEGORIEN
// Symbole, die man für eigene Kategorien wählen kann (eigene Zeichnungen, assets/icons/ui)
const CUSTOM_CAT_ICONS = [
  { icon: 'universal', label: 'Allgemein' },
  { icon: 'bar', label: 'Ausgang' },
  { icon: 'takeaway', label: 'Take-away' },
  { icon: 'sofa', label: 'Möbel' },
  { icon: 'key', label: 'Miete' },
  { icon: 'plant', label: 'Garten' },
  { icon: 'bike', label: 'Velo' },
  { icon: 'fuel', label: 'Tanken' },
  { icon: 'taxi', label: 'Taxi' },
  { icon: 'health', label: 'Arzt' },
  { icon: 'medical', label: 'Krankenkasse' },
  { icon: 'tooth', label: 'Zahnarzt' },
  { icon: 'glasses', label: 'Brille' },
  { icon: 'film', label: 'Kino' },
  { icon: 'music', label: 'Musik' },
  { icon: 'gamepad', label: 'Games' },
  { icon: 'book', label: 'Bücher' },
  { icon: 'travel', label: 'Reisen' },
  { icon: 'ticket', label: 'Events' },
  { icon: 'kids', label: 'Kinder' },
  { icon: 'baby', label: 'Baby' },
  { icon: 'school', label: 'Ausbildung' },
  { icon: 'piggy', label: 'Sparen' },
  { icon: 'insurance', label: 'Versicherungen' },
  { icon: 'tax', label: 'Steuern' },
  { icon: 'card', label: 'Kreditkarte' },
  { icon: 'growth', label: 'Vorsorge' },
  { icon: 'briefcase', label: 'Arbeit' },
  { icon: 'sideincome', label: 'Nebenverdienst' },
  { icon: 'refund', label: 'Rückzahlung' },
  { icon: 'shirt', label: 'Kleider' },
  { icon: 'scissors', label: 'Coiffeur' },
  { icon: 'donation', label: 'Spenden' },
];
let selectedCustomCatIcon = null;

function renderCustomCatList() {
  const el = document.getElementById('customIncomeCatList');
  if (!el) return;
  const expenseList = state.customExpenseCats || [];
  const incomeList  = state.customIncomeCats  || [];
  const total = expenseList.length + incomeList.length;
  if (!total) {
    el.innerHTML = `<div class="empty-tx">${t('Noch keine eigenen Kategorien.')}</div>`;
    return;
  }
  const renderGroup = (groupType, label, list) => {
    if (!list.length) return '';
    const header = `<div style="font-size:var(--fs-label);font-weight:500;color:var(--muted);padding:8px 0 4px">${label}</div>`;
    const items = list.map(c => `
      <div class="settings-item">
        <div class="settings-item-info">
          <div class="settings-item-name">${catIcon(c)} ${esc(c.name)}</div>
        </div>
        <div class="settings-item-actions">
          <button class="tx-btn" onclick="openCustomCatModal('${groupType}',${jsArg(c.id)})" aria-label="${t('Kategorie bearbeiten')}"><span class="ico ico-pencil"></span></button>
          <button class="tx-btn delete" onclick="deleteCustomCat('${groupType}',${jsArg(c.id)})" aria-label="${t('Kategorie löschen')}"><span class="ico ico-trash"></span></button>
        </div>
      </div>`).join('');
    return header + items;
  };
  el.innerHTML = renderGroup('expense', iconHtml('shoppingcart') + ' ' + t('Ausgaben'), expenseList) + renderGroup('income', iconHtml('coin') + ' ' + t('Einnahmen'), incomeList);
}

function openCustomCatModal(type, editId = null) {
  // Standard: 'expense', falls kein Typ übergeben; Tab-UI zurücksetzen
  const initialType = type || 'expense';
  state.customCatEditId = editId;
  const editCat = editId ? (initialType === 'expense' ? state.customExpenseCats : state.customIncomeCats).find(c => c.id === editId) : null;
  document.getElementById('customCatModalTitle').textContent = t(editCat ? 'Kategorie bearbeiten' : 'Eigene Kategorie hinzufügen');
  document.getElementById('customCatSaveBtn').textContent = t(editCat ? 'Speichern' : 'Hinzufügen');
  // Beim Bearbeiten bleibt Ausgabe/Einnahme fix (Einträge hängen daran)
  document.getElementById('customCatTabs').hidden = !!editCat;
  state.customCatType = initialType;
  const modal = document.getElementById('customCatModal');
  modal.dataset.catType = initialType;
  // Tab-Buttons synchronisieren
  const tabExp = document.getElementById('customCatTabExpense');
  const tabInc = document.getElementById('customCatTabIncome');
  if (tabExp) tabExp.classList.toggle('active', initialType === 'expense');
  if (tabInc) tabInc.classList.toggle('active', initialType === 'income');
  document.getElementById('customCatName').value = editCat ? editCat.name : '';
  document.getElementById('customCatEmoji').value = '';
  showCustomCatEmoji('');
  // Symbol-Auswahl rendern
  const picker = document.getElementById('customCatIconPicker');
  picker.innerHTML = CUSTOM_CAT_ICONS.map(i =>
    `<button type="button" class="emoji-pick-btn" data-icon="${i.icon}" title="${esc(t(i.label))}" aria-label="${esc(t(i.label))}" aria-pressed="false" onclick="selectCustomCatIcon('${i.icon}')">${iconHtml(i.icon)}</button>`
  ).join('');
  if (editCat && editCat.emoji && !editCat.icon) {
    selectCustomCatIcon(null);
    document.getElementById('customCatEmoji').value = editCat.emoji;
    showCustomCatEmoji(editCat.emoji);
  } else {
    selectCustomCatIcon(editCat && editCat.icon ? editCat.icon : 'universal'); // Standard: allgemeines Symbol
  }
  modal.classList.add('show');
}

function closeCustomCatModal() {
  document.getElementById('customCatModal').classList.remove('show');
  state.customCatEditId = null;
}

// Eigenes Emoji: nur das erste Zeichen (Graphem) behalten; ein Emoji ersetzt das gewählte Symbol
function firstGrapheme(str) {
  if (window.Intl && Intl.Segmenter) {
    const it = new Intl.Segmenter('de', { granularity: 'grapheme' }).segment(str)[Symbol.iterator]().next();
    return it.done ? '' : it.value.segment;
  }
  return Array.from(str)[0] || '';
}
// Gewähltes Emoji in der Kachel zeigen (statt des grauen Smileys)
function showCustomCatEmoji(emoji) {
  document.getElementById('customCatEmojiValue').textContent = emoji;
  document.getElementById('customCatEmojiTile').classList.toggle('has-emoji', !!emoji);
}
function onCustomCatEmojiInput() {
  const input = document.getElementById('customCatEmoji');
  const g = firstGrapheme(input.value.trim());
  if (input.value !== g) input.value = g;
  showCustomCatEmoji(g);
  if (g) { selectCustomCatIcon(null); input.blur(); }
  else if (!selectedCustomCatIcon) selectCustomCatIcon('universal');
}

function selectCustomCatIcon(icon) {
  selectedCustomCatIcon = icon;
  const emojiInput = document.getElementById('customCatEmoji');
  if (icon && emojiInput) { emojiInput.value = ''; showCustomCatEmoji(''); }
  document.querySelectorAll('#customCatIconPicker .emoji-pick-btn').forEach(b => {
    const on = b.dataset.icon === icon;
    b.classList.toggle('selected', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function saveCustomCat() {
  const name = document.getElementById('customCatName').value.trim();
  if (!name || name.length < 2) { showError('Kategorie nicht gespeichert', 'Der Name ist zu kurz. Er braucht mindestens 2 Zeichen.', 'customCatName'); return; }
  const icon  = selectedCustomCatIcon;
  const emoji = document.getElementById('customCatEmoji').value.trim();
  const validIcon  = CUSTOM_CAT_ICONS.some(i => i.icon === icon);
  const validEmoji = emoji && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(emoji);
  if (emoji && !validEmoji) { showError('Kategorie nicht gespeichert', 'Das ist kein Emoji. Füge ein Emoji ein oder wähle ein Symbol.', 'customCatEmoji'); return; }
  if (!validIcon && !validEmoji) { showError('Kategorie nicht gespeichert', 'Es fehlt ein Symbol. Wähle eines aus der Liste oder füge ein Emoji ein.'); return; }
  // Typ aus der Tab-Auswahl im Modal lesen
  const modal = document.getElementById('customCatModal');
  state.customCatType = modal.dataset.catType || state.customCatType;
  const list = state.customCatType === 'expense' ? state.customExpenseCats : state.customIncomeCats;
  const builtIn = state.customCatType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const editId = state.customCatEditId;
  const allNames = [...builtIn, ...list.filter(c => c.id !== editId)].map(c => c.name.toLowerCase());
  if (allNames.includes(name.toLowerCase())) { showError('Kategorie nicht gespeichert', 'Diese Kategorie gibt es schon. Wähle einen anderen Namen.', 'customCatName'); return; }
  const look = validEmoji ? { emoji } : { icon };
  const cat = editId ? list.find(c => c.id === editId) : null;
  if (cat) {
    const oldName = cat.name;
    delete cat.icon; delete cat.emoji;
    Object.assign(cat, { name }, look);
    if (oldName !== name) renameCategoryEverywhere(state.customCatType, oldName, name);
  } else {
    const color = `hsl(${Math.floor(Math.random()*360)},65%,55%)`;
    list.push({ id: uid(), name, color, ...look });
  }
  saveState();
  renderCustomCatList();
  closeCustomCatModal();
}

// Einträge und wiederkehrende Buchungen hängen am Kategorienamen → beim Umbenennen mitziehen
function renameCategoryEverywhere(type, oldName, newName) {
  // Gibt es den alten Namen auch auf der anderen Seite (Einnahme/Ausgabe), nur Einträge dieses Typs ändern
  const other = type === 'expense' ? allIncomeCats() : allExpenseCats();
  const nameAlsoOther = other.some(c => c.name === oldName);
  (state.entries || []).forEach(e => {
    if (e.category === oldName && (!nameAlsoOther || e.type === type)) e.category = newName;
  });
  const rec = type === 'expense' ? state.recurringExpense : state.recurringIncome;
  (rec || []).forEach(r => { if (r.category === oldName) r.category = newName; });
}

function deleteCustomCat(type, id) {
  // Bestehende Einträge behalten ihren Kategorienamen
  deleteWithUndo(() => {
    if (type === 'expense') state.customExpenseCats = state.customExpenseCats.filter(c => c.id !== id);
    else                    state.customIncomeCats  = state.customIncomeCats.filter(c => c.id !== id);
  }, 'Kategorie gelöscht');
}
function openAccountModal(editId = null, kind = 'everyday') {
  state.accountEditId = editId;
  document.getElementById('accountModalTitle').textContent = t(editId ? 'Konto bearbeiten' : 'Konto hinzufügen');
  if (editId) {
    const a = state.accounts.find(x => x.id === editId);
    document.getElementById('accountKind').value      = isSavingAccount(a) ? 'saving' : 'everyday';
    document.getElementById('accountName').value      = a.name;
    document.getElementById('accountBalance').value   = a.balance;
    document.getElementById('accountVisible').checked = a.visible;
    document.getElementById('accountFee').value       = a.fee > 0 ? a.fee : '';
  } else {
    document.getElementById('accountKind').value      = kind === 'saving' ? 'saving' : 'everyday';
    document.getElementById('accountName').value      = '';
    document.getElementById('accountBalance').value   = '';
    document.getElementById('accountVisible').checked = kind !== 'saving';
    document.getElementById('accountFee').value       = '';
  }
  updateAccountKindUi();
  document.getElementById('accountModal').classList.add('show');
}
// Kontoart: Sparkonten zählen standardmässig nicht zum Gesamtguthaben auf Home
function updateAccountKindUi() {
  const saving = document.getElementById('accountKind').value === 'saving';
  document.getElementById('accountSavingHint').hidden = !saving;
  document.getElementById('accountName').placeholder = t(saving ? 'z.B. Sparkonto, Säule 3a' : 'z.B. Raiffeisen, Neon…');
}
function onAccountKindChange() {
  if (!state.accountEditId) document.getElementById('accountVisible').checked = document.getElementById('accountKind').value !== 'saving';
  updateAccountKindUi();
}
function closeAccountModal() { document.getElementById('accountModal').classList.remove('show'); state.accountEditId = null; }
function saveAccount() {
  const name    = document.getElementById('accountName').value.trim();
  const balance = parseAmount(document.getElementById('accountBalance').value) || 0;
  const visible = document.getElementById('accountVisible').checked;
  const kind    = document.getElementById('accountKind').value === 'saving' ? 'saving' : 'everyday';
  const feeRaw  = parseAmount(document.getElementById('accountFee').value);
  const fee     = !isNaN(feeRaw) && feeRaw > 0 ? Math.min(round2(feeRaw), 20) : 0;
  if (!name) { showError('Konto nicht gespeichert', 'Der Name fehlt. Gib dem Konto einen Namen, zum Beispiel UBS.', 'accountName'); return; }
  if (state.accountEditId) {
    const a = state.accounts.find(x => x.id === state.accountEditId);
    if (a) { Object.assign(a, { name, balance, visible, kind }); if (fee) a.fee = fee; else delete a.fee; }
  } else {
    state.accounts.push({ id: uid(), name, balance, visible, kind, ...(fee ? { fee } : {}) });
  }
  saveState(); renderAccountsList(); closeAccountModal();
}
function deleteAccount(id) {
  // Überweisungen mit diesem Konto werden mitgelöscht; "Rückgängig" holt alles zurück
  deleteWithUndo(() => {
    state.accounts = state.accounts.filter(a => a.id !== id);
    // Verwaiste Konto-Referenzen in bestehenden Buchungen entfernen,
    // damit keine toten accountId-Verweise übrig bleiben
    state.entries.forEach(e => { if (e.accountId === id) e.accountId = ''; });
    // Überweisungen ohne gültiges Konto ergeben keinen Sinn mehr — entfernen
    state.entries = state.entries.filter(e => e.type !== 'transfer' || (e.fromAccountId !== id && e.toAccountId !== id));
    state.recurringTransfers = state.recurringTransfers.filter(r => r.fromAccountId !== id && r.toAccountId !== id);
    // Sparziele und Schulden bleiben, verlieren aber die Verknüpfung
    (state.goals || []).forEach(g => { if (g.accountId === id) g.accountId = ''; });
    (state.debts || []).forEach(d => { if (d.accountId === id) d.accountId = ''; });
  }, 'Konto gelöscht', 'Überweisungen mit diesem Konto wurden auch gelöscht.');
}
// Beispiele für das Feld Bezeichnung, passend zur Art
const RECURRING_EXAMPLES = { income: ['Lohn', 'Nebenjob'], expense: ['Miete', 'Krankenkasse'], transfer: ['Sparkonto', 'Säule 3a'] };
function openRecurringModal(type, editId = null) {
  state.recurringType = type; state.recurringEditId = editId;
  document.getElementById('recurringName').placeholder = t('z.B. {beispiele}…', { beispiele: RECURRING_EXAMPLES[type].map(x => t(x)).join(', ') });
  document.getElementById('recurringModalTitle').textContent =
    t(editId ? 'Bearbeiten' : 'Hinzufügen') + ' – ' + t(type === 'income' ? 'Einnahme' : type === 'transfer' ? 'Überweisung' : 'Ausgabe');

  const catGroup = document.getElementById('recurringCategoryGroup');
  const accGroup = document.getElementById('recurringAccountGroup');
  const transferGroup = document.getElementById('recurringTransferAccountsGroup');
  const accSel = document.getElementById('recurringAccount');
  const aoGroup = document.getElementById('recurringAccountOnlyGroup');
  // Checkbox nur bei Ausgabe anzeigen
  if (aoGroup) aoGroup.style.display = type === 'expense' ? '' : 'none';
  const aoCheck = document.getElementById('recurringAccountOnlyCheck');
  if (aoCheck && type !== 'expense') aoCheck.checked = false;

  if (type === 'transfer') {
    if (catGroup) catGroup.style.display = 'none';
    if (accGroup) accGroup.style.display = 'none';
    if (transferGroup) transferGroup.style.display = '';
    const fromSel = document.getElementById('recurringFromAccount');
    const toSel   = document.getElementById('recurringToAccount');
    const opts = state.accounts.map(a => `<option value="${esc(a.id)}">${esc(a.name)} (${money(a.balance)})</option>`).join('');
    if (fromSel) fromSel.innerHTML = opts;
    if (toSel)   toSel.innerHTML = opts;
  } else {
    if (catGroup) catGroup.style.display = '';
    if (transferGroup) transferGroup.style.display = 'none';
    document.getElementById('recurringCategory').innerHTML =
      (type === 'income' ? allIncomeCats() : allExpenseCats())
        .map(c => `<option value="${esc(c.name)}">${catOptionLabel(c)}</option>`).join('');
    if (accSel) {
      accSel.innerHTML = `<option value="">${t('Kein Konto')}</option>` +
        state.accounts.map(a => `<option value="${esc(a.id)}">${esc(a.name)} (${money(a.balance)})</option>`).join('');
    }
    if (accGroup) accGroup.style.display = '';
  }

  if (editId) {
    const r = recurringListFor(type).find(x => x.id === editId);
    document.getElementById('recurringName').value     = r.name;
    document.getElementById('recurringAmount').value   = r.amount;
    document.getElementById('recurringStartDate').value = r.createdAt || dateKey(new Date());
    if (type === 'transfer') {
      const fromSel = document.getElementById('recurringFromAccount');
      const toSel   = document.getElementById('recurringToAccount');
      if (fromSel) fromSel.value = r.fromAccountId;
      if (toSel)   toSel.value = r.toAccountId;
    } else {
      document.getElementById('recurringCategory').value = r.category;
      if (accSel) accSel.value = r.accountId || '';
      if (aoCheck) aoCheck.checked = !!r.accountOnly;
    }
  } else {
    document.getElementById('recurringName').value   = '';
    document.getElementById('recurringAmount').value = '';
    if (accSel) accSel.value = '';
    if (aoCheck) aoCheck.checked = false;
    document.getElementById('recurringStartDate').value = dateKey(new Date());
  }
  document.getElementById('recurringModal').classList.add('show');
}
function closeRecurringModal() { document.getElementById('recurringModal').classList.remove('show'); state.recurringEditId = null; }
function saveRecurring() {
  const name      = document.getElementById('recurringName').value.trim();
  const amount    = parseAmount(document.getElementById('recurringAmount').value);
  const startDate = document.getElementById('recurringStartDate').value || dateKey(new Date());
  if (!name) { showError('Nicht gespeichert', t('Die Bezeichnung fehlt. Gib eine Bezeichnung ein, zum Beispiel {beispiel}.', { beispiel: t(RECURRING_EXAMPLES[state.recurringType][0]) }), 'recurringName'); return; }
  if (isNaN(amount) || amount <= 0) { showError('Nicht gespeichert', 'Der Betrag fehlt. Gib einen Betrag über 0 ein.', 'recurringAmount'); return; }

  if (state.recurringType === 'transfer') {
    const fromAccountId = document.getElementById('recurringFromAccount').value;
    const toAccountId   = document.getElementById('recurringToAccount').value;
    if (!fromAccountId || !toAccountId) { showError('Nicht gespeichert', 'Ein Konto fehlt. Wähle bei «Von Konto» und «Auf Konto» je ein Konto.', !fromAccountId ? 'recurringFromAccount' : 'recurringToAccount'); return; }
    if (fromAccountId === toAccountId) { showError('Nicht gespeichert', 'Du hast zweimal dasselbe Konto gewählt. Wähle zwei verschiedene Konten.', 'recurringToAccount'); return; }
    const list = state.recurringTransfers;
    if (state.recurringEditId) {
      const r = list.find(x => x.id === state.recurringEditId);
      if (r) Object.assign(r, { name, amount, fromAccountId, toAccountId, createdAt: startDate });
    } else {
      list.push({ id: uid(), name, amount, fromAccountId, toAccountId, createdAt: startDate });
    }
  } else {
    const category  = document.getElementById('recurringCategory').value;
    const accountId = document.getElementById('recurringAccount')?.value || '';
    const accountOnly = state.recurringType === 'expense' && !!document.getElementById('recurringAccountOnlyCheck')?.checked;
    const list = state.recurringType === 'income' ? state.recurringIncome : state.recurringExpense;
    if (state.recurringEditId) {
      const r = list.find(x => x.id === state.recurringEditId);
      if (r) Object.assign(r, { name, amount, category, accountId, accountOnly, createdAt: startDate });
    } else {
      list.push({ id: uid(), name, amount, category, accountId, accountOnly, createdAt: startDate });
    }
  }
  applyDueRecurring();
  saveState(); renderRecurringList(state.recurringType); closeRecurringModal();
}
function deleteRecurring(type, id) {
  deleteWithUndo(() => {
    if (type === 'income')          state.recurringIncome    = state.recurringIncome.filter(r => r.id !== id);
    else if (type === 'transfer')   state.recurringTransfers = state.recurringTransfers.filter(r => r.id !== id);
    else                            state.recurringExpense   = state.recurringExpense.filter(r => r.id !== id);
  }, 'Eintrag gelöscht');
}

// ── START
registerPageRender(renderSettings);
initSettings();
// Darstellung in einem anderen Fenster geändert → Knopf nachführen
window.addEventListener('storage', e => { if (e.key === 'spendly_theme') updateThemeSwitch(); });

// ── SPRACHE UND WÄHRUNG
// Sprache und Hauptwährung gelten sofort auf diesem Gerät (localStorage, siehe i18n.js)
// und werden im Account gespeichert, damit sie auf allen Geräten gleich sind.
function renderLocaleSettings() {
  const ls = document.getElementById('langSelect'), cs = document.getElementById('curSelect');
  if (!ls || !cs) return;
  if (!ls.options.length) {
    ls.innerHTML = I18N.langs.map(l => `<option value="${l}" data-icon="">${esc(I18N.langNames[l])}</option>`).join('');
    const main = cur();
    const top = [main, ...['CHF', 'EUR', 'USD', 'GBP'].filter(c => c !== main)];
    const list = [...top, ...I18N.currencies.filter(c => !top.includes(c)).sort()];
    cs.innerHTML = list.map(c => `<option value="${c}" data-icon="" data-sub="${esc(I18N.currencyName(c))}">${c}</option>`).join('');
  }
  ls.value = I18N.lang;
  cs.value = cur();
}
function _reloadAll() {
  // Einstellungen im Menü-Fenster (iframe): die ganze Seite neu laden, damit alles in der neuen Sprache erscheint
  try { if (window.top !== window && window.top.location.origin === location.origin) { window.top.location.reload(); return; } } catch (e) {}
  location.reload();
}
function changeLanguage(code) {
  if (code === I18N.lang) return;
  I18N.setLang(code);
  state.lang = code;
  saveState();
  setTimeout(_reloadAll, 150); // kurz warten, damit das Speichern losgeschickt ist
}
// Wechsel der Hauptwährung gilt ab jetzt: bisherige Beträge bleiben, wie sie sind, und behalten ihre Währung (e.base)
function changeCurrency(code) {
  const old = cur();
  if (code === old) return;
  state.entries.forEach(e => { if (!e.base) e.base = old; });
  state.currency = code;
  I18N.setCur(code);
  saveState();
  setTimeout(_reloadAll, 150);
}

// ── DEINE DATEN HERUNTERLADEN ───────────────────────────────
// CSV: nur die Einträge, für Excel und Co. (Semikolon, UTF-8 mit BOM, Punkt als
// Dezimalzeichen wie in der Schweiz, Datum JJJJ-MM-TT).
// JSON: alles, was auch in Supabase gespeichert ist (_payload aus main.js).
function _exportNotReady() {
  if (serverLoaded || state.entries.length || state.accounts.length) return false;
  showToast('Deine Daten werden noch geladen', { type: 'error', text: 'Versuche es in ein paar Sekunden noch einmal.', key: 'export' });
  return true;
}
// Zelle für CSV: Anführungszeichen verdoppeln. Texte, die mit = + - @ beginnen,
// bekommen ein ' davor, damit Excel sie nicht als Formel ausführt.
function _csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function _entryCsvRow(e) {
  const accName = id => { const a = state.accounts.find(x => x.id === id); return a ? a.name : ''; };
  const isTransfer = e.type === 'transfer';
  const type = isTransfer ? t('Interne Überweisung')
    : e.type === 'income' ? t('Einnahme')
    : e.type === 'account-only' ? t('Ausgabe') + ' (' + t('nur Konto') + ')'
    : t('Ausgabe');
  const sign = (e.type === 'expense' || e.type === 'account-only') ? -1 : 1;
  const fx = e.fx || null;
  return [
    e.date,
    type,
    isTransfer ? '' : catName(e.category || ''),
    Number((sign * e.amount).toFixed(2)),
    e.base || cur(),
    accName(isTransfer ? e.fromAccountId : e.accountId),
    isTransfer ? accName(e.toAccountId) : '',
    e.note || '',
    Array.isArray(e.tags) ? e.tags.map(x => '#' + x).join(' ') : '',
    fx ? Number(fx.amt) : '',
    fx ? fx.cur : '',
    fx && fx.rate ? Number(fx.rate) : '',
    fx && fx.feePct ? Number(fx.feePct) : '',
  ];
}
function exportEntriesCsv() {
  if (_exportNotReady()) return;
  if (!state.entries.length) {
    showToast('Noch keine Einträge', { type: 'error', text: 'Erfasse zuerst einen Eintrag. Danach kannst du deine Einträge als Tabelle herunterladen.', key: 'export' });
    return;
  }
  const head = ['Datum', 'Typ', 'Kategorie', 'Betrag', 'Währung', 'Konto', 'Nach Konto', 'Notiz', 'Tags',
    'Originalbetrag', 'Originalwährung', 'Kurs', 'Auslandgebühr (%)'].map(h => t(h));
  const rows = state.entries.slice()
    .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
    .map(_entryCsvRow);
  const csv = '﻿' + [head, ...rows].map(r => r.map(_csvCell).join(';')).join('\r\n') + '\r\n';
  _saveExport('spendly-eintraege-' + dateKey(new Date()) + '.csv', csv, 'text/csv;charset=utf-8', 'Einträge heruntergeladen');
}
function exportBackupJson() {
  if (_exportNotReady()) return;
  const data = { app: 'Spendly', format: 1, exportedAt: new Date().toISOString(), data: _payload() };
  _saveExport('spendly-sicherung-' + dateKey(new Date()) + '.json', JSON.stringify(data, null, 2), 'application/json', 'Sicherung heruntergeladen');
}
// iPhone und iPad: Teilen-Fenster («In Dateien sichern»), weil Downloads in der
// installierten App dort nicht zuverlässig gehen. Sonst ein normaler Download.
function _saveExport(name, text, mime, doneTitle) {
  const file = new File([text], name, { type: mime });
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIos && navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file] }).catch(err => { if (!err || err.name !== 'AbortError') _blobDownload(file, doneTitle); });
    return;
  }
  _blobDownload(file, doneTitle);
}
function _blobDownload(file, doneTitle) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast(doneTitle, { text: t('Die Datei {name} liegt in deinen Downloads.', { name: file.name }), key: 'export' });
}
