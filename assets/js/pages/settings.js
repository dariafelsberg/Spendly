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
function renderSettings() {
  renderAccountsList(); renderRecurringList('income'); renderRecurringList('expense'); renderRecurringList('transfer');
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
  const col  = type === 'income' ? 'var(--income)' : type === 'transfer' ? '#7c93ff' : 'var(--danger)';
  el.innerHTML = !list.length
    ? '<div class="empty-tx">Noch keine Einträge.</div>'
    : list.map(r => {
        let detail;
        if (type === 'transfer') {
          const fromAcc = state.accounts.find(a => a.id === r.fromAccountId);
          const toAcc   = state.accounts.find(a => a.id === r.toAccountId);
          detail = `CHF ${formatNum(r.amount)} / Monat · ${fromAcc ? fromAcc.name : '?'} → ${toAcc ? toAcc.name : '?'}`;
        } else {
          const acc = r.accountId ? state.accounts.find(a => a.id === r.accountId) : null;
          detail = `${sign}CHF ${formatNum(r.amount)} / Monat · ${r.category}${acc ? ' · 🏦 ' + acc.name : ''}${r.accountOnly ? ' · 🚫 Budget' : ''}`;
        }
        return `
      <div class="settings-item">
        <div class="settings-item-info">
          <div class="settings-item-name">${r.name}</div>
          <div class="settings-item-val" style="color:${col}">${detail}</div>
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
  if (confirm('Konto löschen? Überweisungen, die dieses Konto nutzen, werden ebenfalls gelöscht.')) {
    state.accounts = state.accounts.filter(a => a.id !== id);
    // Verwaiste Konto-Referenzen in bestehenden Buchungen entfernen,
    // damit keine toten accountId-Verweise übrig bleiben
    state.entries.forEach(e => { if (e.accountId === id) e.accountId = ''; });
    // Überweisungen ohne gültiges Konto ergeben keinen Sinn mehr — entfernen
    state.entries = state.entries.filter(e => e.type !== 'transfer' || (e.fromAccountId !== id && e.toAccountId !== id));
    state.recurringTransfers = state.recurringTransfers.filter(r => r.fromAccountId !== id && r.toAccountId !== id);
    saveState(); renderAccountsList(); renderRecurringList('transfer');
  }
}
function openRecurringModal(type, editId = null) {
  state.recurringType = type; state.recurringEditId = editId;
  document.getElementById('recurringModalTitle').textContent =
    (editId ? 'Bearbeiten' : 'Hinzufügen') + ' – ' + (type === 'income' ? 'Einnahme' : type === 'transfer' ? 'Überweisung' : 'Ausgabe');

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
    const opts = state.accounts.map(a => `<option value="${a.id}">${a.name} (CHF ${formatNum(a.balance)})</option>`).join('');
    if (fromSel) fromSel.innerHTML = opts;
    if (toSel)   toSel.innerHTML = opts;
  } else {
    if (catGroup) catGroup.style.display = '';
    if (transferGroup) transferGroup.style.display = 'none';
    document.getElementById('recurringCategory').innerHTML =
      (type === 'income' ? allIncomeCats() : allExpenseCats())
        .map(c => `<option value="${c.name}">${c.emoji} ${c.name}</option>`).join('');
    if (accSel) {
      accSel.innerHTML = `<option value="">— Kein Konto —</option>` +
        state.accounts.map(a => `<option value="${a.id}">${a.name} (CHF ${formatNum(a.balance)})</option>`).join('');
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
  const amount    = parseFloat(document.getElementById('recurringAmount').value);
  const startDate = document.getElementById('recurringStartDate').value || dateKey(new Date());
  if (!name || isNaN(amount) || amount <= 0) { document.getElementById('recurringName').focus(); return; }

  if (state.recurringType === 'transfer') {
    const fromAccountId = document.getElementById('recurringFromAccount').value;
    const toAccountId   = document.getElementById('recurringToAccount').value;
    if (!fromAccountId || !toAccountId) { alert('Bitte beide Konten auswählen.'); return; }
    if (fromAccountId === toAccountId) { alert('Von- und Auf-Konto müssen unterschiedlich sein.'); return; }
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
  if (confirm('Eintrag löschen?')) {
    if (type === 'income')          state.recurringIncome    = state.recurringIncome.filter(r => r.id !== id);
    else if (type === 'transfer')   state.recurringTransfers = state.recurringTransfers.filter(r => r.id !== id);
    else                            state.recurringExpense   = state.recurringExpense.filter(r => r.id !== id);
    saveState(); renderRecurringList(type);
  }
}

// ── START
registerPageRender(renderSettings);
initSettings();
