/* ==========================================================
 * pages/index.js – Startseite (Übersicht, Donut, Buchungsliste, Eintrag-Modal)
 * Benötigt assets/js/main.js
 ========================================================== */

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
    : state.balance + state.entries.reduce((s, e) => s + (e.type === 'income' ? e.amount : e.type === 'transfer' ? 0 : -e.amount), 0);
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
  const nowKey = monthKey(new Date());
  const catTotals = {};
  state.entries.filter(e => e.type === 'expense' && e.date.slice(0, 7) === nowKey).forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.amount; });
  const activeCats = allExpenseCats().filter(c => catTotals[c.name] > 0);
  // Bögen pro Kategorie wiederverwenden statt neu zu zeichnen, damit die
  // CSS-Transitions greifen und Änderungen weich animiert werden.
  const r = 72, circ = 2 * Math.PI * r;
  const arcsEl = document.getElementById('donutArcs');
  const existing = {};
  arcsEl.querySelectorAll('circle[data-cat]').forEach(el => { existing[el.dataset.cat] = el; });
  let offset = 0;
  (spent > 0 ? activeCats : []).forEach(c => {
    const frac = catTotals[c.name] / Math.max(spent, state.budget, 0.01);
    const dLen = Math.min(frac, 1) * circ;
    const dashOffset = (-offset * circ).toFixed(2);
    let el = existing[c.name];
    delete existing[c.name];
    if (!el) {
      el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      el.dataset.cat = c.name;
      el.setAttribute('class', 'donut-arc');
      ['cx', 'cy'].forEach(a => el.setAttribute(a, '100'));
      el.setAttribute('r', r);
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke-width', '28');
      // Neuer Bogen startet mit Länge 0 an seiner Position und wächst dann.
      el.style.strokeDasharray = `0 ${circ.toFixed(2)}`;
      el.style.strokeDashoffset = dashOffset;
      arcsEl.appendChild(el);
      el.getBoundingClientRect(); // Reflow erzwingen, damit die Transition startet
    }
    el.setAttribute('stroke', c.color);
    el.style.strokeDasharray = `${dLen.toFixed(2)} ${(circ - dLen).toFixed(2)}`;
    el.style.strokeDashoffset = dashOffset;
    offset += frac;
  });
  // Nicht mehr aktive Kategorien zusammenschrumpfen lassen und dann entfernen.
  Object.values(existing).forEach(el => {
    el.style.strokeDasharray = `0 ${circ.toFixed(2)}`;
    setTimeout(() => el.remove(), 600);
  });
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
  const nowKey = monthKey(new Date());
  const entries = state.entries
    .filter(e => e.date.slice(0, 7) === nowKey)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  document.getElementById('txCount').textContent = entries.length;
  const listEl = document.getElementById('txList');
  const emptyEl = document.getElementById('txEmpty');
  listEl.querySelectorAll('.tx-item').forEach(el => el.remove());
  if (!entries.length) { emptyEl.style.display = 'block'; return; }
  emptyEl.style.display = 'none';
  entries.forEach(e => {
    const item = document.createElement('div');
    item.className = 'tx-item';
    item.innerHTML = entryRowInner(e);
    listEl.appendChild(item);
  });
}

// ── ENTRY MODAL
// ── ENTRY MODAL
function setEntryType(type) {
  state.entryType = type;
  document.getElementById('typeBtnExpense').classList.toggle('active', type === 'expense');
  document.getElementById('typeBtnIncome').classList.toggle('active', type === 'income');
  document.getElementById('typeBtnTransfer').classList.toggle('active', type === 'transfer');
  // Checkbox nur bei Ausgabe anzeigen
  const aoGroup = document.getElementById('accountOnlyGroup');
  if (aoGroup) aoGroup.style.display = type === 'expense' ? '' : 'none';
  // Checkbox zurücksetzen wenn nicht Ausgabe
  const aoCheck = document.getElementById('accountOnlyCheck');
  if (aoCheck && type !== 'expense') aoCheck.checked = false;
  const catGroup = document.getElementById('entryCategoryGroup');
  const accGroup = document.getElementById('accountSelectGroup');
  const transferGroup = document.getElementById('transferAccountsGroup');
  if (type === 'transfer') {
    if (catGroup) catGroup.style.display = 'none';
    if (accGroup) accGroup.style.display = 'none';
    if (transferGroup) transferGroup.style.display = '';
    populateTransferAccountSelects();
  } else {
    if (catGroup) catGroup.style.display = '';
    if (transferGroup) transferGroup.style.display = 'none';
    // "Nur Konto" verwendet Ausgaben-Kategorien (bleibt eine Abbuchung, zählt nur nicht ins Budget)
    populateCategorySelect(type === 'income' ? 'income' : 'expense');
    populateAccountSelect(document.getElementById('entryAccount')?.value || '');
  }
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
function populateTransferAccountSelects(fromId = '', toId = '') {
  const fromSel = document.getElementById('entryFromAccount');
  const toSel   = document.getElementById('entryToAccount');
  if (!fromSel || !toSel) return;
  const opts = state.accounts.map(a => `<option value="${a.id}">${a.name} (CHF ${formatNum(a.balance)})</option>`).join('');
  fromSel.innerHTML = opts;
  toSel.innerHTML = opts;
  if (fromId) fromSel.value = fromId; else if (state.accounts.length) fromSel.selectedIndex = 0;
  if (toId) toSel.value = toId; else if (state.accounts.length > 1) toSel.selectedIndex = 1;
}
// Der "Überweisung"-Typ braucht mindestens 2 Konten
function trySetTransferType() {
  if (state.accounts.length < 2) {
    alert('Für eine interne Überweisung brauchst du mindestens 2 Konten. Lege in den Einstellungen unter "Konten" ein zweites Konto an.');
    return;
  }
  setEntryType('transfer');
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
    document.getElementById('typeToggle').style.display = 'none';
    if (e.type === 'transfer') {
      populateTransferAccountSelects(e.fromAccountId, e.toAccountId);
    } else {
      setTimeout(() => { document.getElementById('entryCategory').value = e.category; }, 0);
      const aoCheck = document.getElementById('accountOnlyCheck');
      const aoGroup = document.getElementById('accountOnlyGroup');
      if (aoCheck) aoCheck.checked = (e.type === 'account-only');
      if (aoGroup) aoGroup.style.display = (e.type === 'expense' || e.type === 'account-only') ? '' : 'none';
      populateAccountSelect(e.accountId || '');
    }
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
function saveEntry() {
  const amount = parseFloat(document.getElementById('entryAmount').value);
  const note   = document.getElementById('entryNote').value.trim();
  const date   = document.getElementById('entryDate').value;

  if (state.entryType === 'transfer') {
    const fromAccountId = document.getElementById('entryFromAccount').value;
    const toAccountId   = document.getElementById('entryToAccount').value;
    if (isNaN(amount) || amount <= 0) { document.getElementById('entryAmount').focus(); return; }
    if (!fromAccountId || !toAccountId) { alert('Bitte beide Konten auswählen.'); return; }
    if (fromAccountId === toAccountId) { alert('Von- und Auf-Konto müssen unterschiedlich sein.'); return; }
    if (state.editId) {
      const e = state.entries.find(x => x.id === state.editId);
      if (e) {
        applyTransferDelta(e.fromAccountId, e.toAccountId, -e.amount); // alten Transfer umkehren
        Object.assign(e, { amount, note, date, fromAccountId, toAccountId });
        applyTransferDelta(fromAccountId, toAccountId, amount);
      }
    } else {
      state.entries.push({ id: uid(), type: 'transfer', amount, category: 'Interne Überweisung', note, date, fromAccountId, toAccountId });
      applyTransferDelta(fromAccountId, toAccountId, amount);
    }
    saveState(); render(); closeEntryModal();
    return;
  }

  const category  = document.getElementById('entryCategory').value;
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
    if (finalType === 'expense' && date.slice(0, 7) === monthKey(new Date())) {
      saveState(); render(); closeEntryModal();
      popDonut(category);
      return;
    }
  }
  saveState(); render(); closeEntryModal();
}

// Kurzer "Pop" des Donuts und Hervorhebung des betroffenen Bogens,
// wenn eine neue Ausgabe im aktuellen Monat hinzugefügt wurde.
function popDonut(category) {
  const container = document.querySelector('.donut-container');
  const spentEl = document.getElementById('donutSpent');
  const arc = [...document.querySelectorAll('#donutArcs circle[data-cat]')].find(el => el.dataset.cat === category);
  [[container, 'donut-pop'], [spentEl, 'donut-spent-pop'], [arc, 'donut-arc-pop']].forEach(([el, cls]) => {
    if (!el) return;
    el.classList.remove(cls);
    el.getBoundingClientRect(); // Animation neu starten
    el.classList.add(cls);
    el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
  });
}

function toggleTxList() {
  ['txList','txHeader','txChevron'].forEach(id => document.getElementById(id).classList.toggle('open'));
}

// ── HELPERS (nur Home)
// ── HELPERS
function totalExpenses() {
  const nowKey = monthKey(new Date());
  return state.entries.filter(e => e.type==='expense' && e.date.slice(0, 7) === nowKey).reduce((s,e) => s+e.amount, 0);
}

// ── START
registerPageRender(render);
initHome();
