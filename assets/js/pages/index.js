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
  const hidden = isBalanceHidden();
  const totalEl = document.getElementById('totalBalanceDisplay');
  // Verborgen: die Zahl bleibt (unsichtbar) stehen und wird nur überdeckt, damit das Auge nicht springt
  totalEl.classList.toggle('is-masked', hidden);
  if (!totalEl._init) {
    totalEl._init = true;
    // Rollende Ziffern nur beim Öffnen der Webseite, nicht beim Wechseln der Seiten im Menü
    if (!hidden && shouldRollBalance()) rollNumber(totalEl, total);
    else { totalEl._value = total; totalEl.textContent = formatNum(total); }
  } else if (totalEl._rolling) rollNumber(totalEl, total);
  else animateNumber(totalEl, total);
  const eye = document.getElementById('balanceEye');
  if (eye) { eye.querySelector('.ico').className = 'ico ' + (hidden ? 'ico-eye_closed' : 'ico-eye_open'); eye.setAttribute('aria-label', hidden ? 'Guthaben anzeigen' : 'Guthaben verbergen'); }
  const pillsEl = document.getElementById('accountPills');
  if (vis.length) {
    pillsEl.innerHTML = vis.map(a =>
      `<div class="account-pill-item"><span class="pill-name">${a.name}</span><span class="pill-val">CHF ${hidden ? '••••' : formatNum(a.balance)}</span></div>`
    ).join('');
    pillsEl.style.display = 'flex';
  } else {
    pillsEl.innerHTML = '';
    pillsEl.style.display = 'none';
  }
}

// Guthaben verbergen (z.B. im Zug): pro Gerät gemerkt
function isBalanceHidden() { try { return localStorage.getItem('spendly_hideBalance') === '1'; } catch (e) { return false; } }
function toggleBalanceHidden() {
  try { localStorage.setItem('spendly_hideBalance', isBalanceHidden() ? '0' : '1'); } catch (e) {}
  renderTopBar();
}

// Zuletzt verwendetes Konto und Kategorie pro Typ merken (pro Gerät), für die Vorauswahl
function lastEntryPrefs() { try { return JSON.parse(localStorage.getItem('spendly_lastEntry')) || {}; } catch (e) { return {}; } }
function rememberEntryPrefs(type, category, accountId) {
  const p = lastEntryPrefs(); p.cat = p.cat || {}; p.cat[type] = category; if (accountId) p.accountId = accountId;
  try { localStorage.setItem('spendly_lastEntry', JSON.stringify(p)); } catch (e) {}
}
// Vorausgewähltes Konto: zuletzt verwendetes, sonst das erste sichtbare, sonst das erste
function defaultAccountId() {
  const last = lastEntryPrefs().accountId;
  if (last && state.accounts.some(a => a.id === last)) return last;
  const vis = state.accounts.find(a => a.visible);
  return vis ? vis.id : (state.accounts[0] ? state.accounts[0].id : '');
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
  const labelsEl = document.getElementById('donutLabels');
  const existing = {}, existingLabels = {};
  arcsEl.querySelectorAll('circle[data-cat]').forEach(el => { existing[el.dataset.cat] = el; });
  labelsEl.querySelectorAll('.donut-label').forEach(el => { existingLabels[el.dataset.cat] = el; });
  let offset = 0;
  const labelItems = [];
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

    // Label aussen auf Höhe der Bogenmitte. Winkel im Uhrzeigersinn ab 12 Uhr
    // (das SVG ist um −90° gedreht).
    const theta = (offset + Math.min(frac, 1) / 2) * 2 * Math.PI;
    let lbl = existingLabels[c.name];
    delete existingLabels[c.name];
    if (!lbl) {
      lbl = document.createElement('div');
      lbl.className = 'donut-label';
      lbl.dataset.cat = c.name;
      const name = document.createElement('span');
      name.className = 'donut-label-name';
      name.textContent = c.name;
      lbl.append(name);
      labelsEl.appendChild(lbl);
    }
    lbl.style.color = c.color;
    labelItems.push({ lbl, theta });
    offset += frac;
  });
  placeDonutLabels(labelItems, labelsEl);
  // Nicht mehr aktive Kategorien zusammenschrumpfen lassen und dann entfernen.
  Object.values(existing).forEach(el => {
    el.style.strokeDasharray = `0 ${circ.toFixed(2)}`;
    setTimeout(() => el.remove(), 600);
  });
  Object.values(existingLabels).forEach(el => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 600);
  });
  document.getElementById('categoriesGrid').innerHTML = allExpenseCats().map(c => {
    const amt = catTotals[c.name] || 0;
    return `<div class="cat-chip" data-cat="${c.name.replace(/"/g, '&quot;')}" style="${amt ? `background:${c.color}15;border-color:${c.color}44` : ''}">
      <div class="cat-dot" style="background:${amt ? c.color : '#ddd'}"></div>
      <span class="cat-name">${catIcon(c)} ${c.name}</span>
      ${amt ? `<span class="cat-amount expense">−${formatNum(amt)}</span>` : ''}
    </div>`;
  }).join('');
}

// Klick auf eine Kategorie lässt ihren Bogen im Donut pulsieren.
document.getElementById('categoriesGrid').addEventListener('click', e => {
  const chip = e.target.closest('.cat-chip');
  if (!chip) return;
  const arc = [...document.querySelectorAll('#donutArcs circle[data-cat]')].find(el => el.dataset.cat === chip.dataset.cat);
  if (!arc) return; // Kategorie ohne Ausgaben hat keinen Bogen
  arc.classList.remove('donut-arc-pulse');
  arc.getBoundingClientRect(); // Animation bei erneutem Klick neu starten
  arc.classList.add('donut-arc-pulse');
  arc.addEventListener('animationend', () => arc.classList.remove('donut-arc-pulse'), { once: true });
});

// Positioniert die Donut-Labels aussen am Ring. Überlagert ein Label ein
// bereits platziertes, wird es im Uhrzeigersinn entlang des Rings
// weitergeschoben, bis es frei ist (Labels kommen in Bogen-Reihenfolge).
function placeDonutLabels(items, labelsEl) {
  const W = labelsEl.clientWidth, H = labelsEl.clientHeight;
  const R = 0.51, GAP = 2, STEP = Math.PI / 180, MAX_STEPS = 120;
  // Box eines Labels bei Winkel theta. Die Verschiebung richtet den Text je
  // nach Seite so aus, dass er vom Ring weg zeigt.
  const boxAt = (theta, w, h) => {
    const sin = Math.sin(theta), cos = Math.cos(theta);
    const x = W * (0.5 + R * sin) + w * (-0.5 + 0.5 * sin);
    const y = H * (0.5 - R * cos) + h * (-0.5 - 0.5 * cos);
    return { x, y, w, h };
  };
  const overlaps = (a, b) =>
    a.x < b.x + b.w + GAP && b.x < a.x + a.w + GAP &&
    a.y < b.y + b.h + GAP && b.y < a.y + a.h + GAP;
  const placed = [];
  items.forEach(({ lbl, theta }) => {
    const w = lbl.offsetWidth, h = lbl.offsetHeight;
    let t = theta, box = boxAt(t, w, h);
    for (let i = 0; i < MAX_STEPS && placed.some(p => overlaps(box, p)); i++) {
      t += STEP;
      box = boxAt(t, w, h);
    }
    placed.push(box);
    const sin = Math.sin(t), cos = Math.cos(t);
    // Umgebrochene Zeilen zum Ring hin ausrichten (rechts: linksbündig, links: rechtsbündig)
    lbl.style.textAlign = sin > 0.3 ? 'left' : sin < -0.3 ? 'right' : 'center';
    lbl.style.left = `${(50 + R * 100 * sin).toFixed(2)}%`;
    lbl.style.top  = `${(50 - R * 100 * cos).toFixed(2)}%`;
    lbl.style.transform = `translate(${(-50 + 50 * sin).toFixed(1)}%, ${(-50 - 50 * cos).toFixed(1)}%)`;
    lbl.getBoundingClientRect(); // Reflow, damit neue Labels einblenden
    lbl.classList.add('show');
  });
}

function renderTransactions() {
  const nowKey = monthKey(new Date());
  const entries = state.entries
    .filter(e => e.date.slice(0, 7) === nowKey)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  document.getElementById('txCount').textContent = entries.length;
  const listEl = document.getElementById('txListInner');
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
  moveTypeIndicator(type);
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
    // Neuer Eintrag: zuletzt verwendete Kategorie dieses Typs vorauswählen
    if (!state.editId) {
      const lastCat = (lastEntryPrefs().cat || {})[type === 'income' ? 'income' : 'expense'];
      const sel = document.getElementById('entryCategory');
      if (lastCat && sel && [...sel.options].some(o => o.value === lastCat)) sel.value = lastCat;
    }
    populateAccountSelect(document.getElementById('entryAccount')?.value || '');
  }
}
// Weissen Hintergrund im Umschalter hinter den gewählten Knopf schieben
function moveTypeIndicator(type) {
  const toggle = document.getElementById('typeToggle');
  const btn = { expense: 'typeBtnExpense', income: 'typeBtnIncome', transfer: 'typeBtnTransfer' }[type];
  if (!toggle || !btn) return;
  const el = document.getElementById(btn);
  toggle.style.setProperty('--ind-x', el.offsetLeft + 'px');
  toggle.style.setProperty('--ind-w', el.offsetWidth + 'px');
}
function populateCategorySelect(type) {
  const sel = document.getElementById('entryCategory');
  if (!sel) return;
  sel.innerHTML = (type === 'income' ? allIncomeCats() : allExpenseCats())
    .map(c => `<option value="${c.name}">${catOptionLabel(c)}</option>`).join('');
}
function populateAccountSelect(selectedId = '') {
  const sel = document.getElementById('entryAccount');
  if (!sel) return;
  sel.innerHTML = `<option value="" ${!selectedId ? 'selected' : ''}>Kein Konto</option>` +
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
    populateAccountSelect(defaultAccountId());
  }
  const modal = document.getElementById('entryModal');
  const sheet = modal.querySelector('.modal');
  sheet.style.minHeight = '';
  modal.classList.add('show');
  // Höhe einfrieren, damit das Fenster beim Wechsel Ausgabe/Einnahme/Überweisung nicht springt
  // (Ausgabe ist die höchste Variante: Kategorie, Konto und "Nur Konto")
  if (!editId) sheet.style.minHeight = sheet.offsetHeight + 'px';
}
function closeEntryModal() { document.getElementById('entryModal').classList.remove('show'); state.editId = null; }
function saveEntry() {
  const amount = parseAmount(document.getElementById('entryAmount').value);
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
    saveState(); render(); closeEntryModal(); showToast('Gespeichert');
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
      // Schalter "Nur Konto" auch beim Bearbeiten übernehmen (Ausgabe ↔ Nur Konto)
      let type = e.type;
      if (type === 'expense' || type === 'account-only') {
        type = document.getElementById('accountOnlyCheck')?.checked ? 'account-only' : 'expense';
      }
      Object.assign(e, { type, amount, category, note, date, accountId });
      applyAccountDelta(accountId, amount, e.type);
    }
  } else {
    const aoChecked = document.getElementById('accountOnlyCheck')?.checked;
    const finalType = (state.entryType === 'expense' && aoChecked) ? 'account-only' : state.entryType;
    state.entries.push({ id: uid(), type: finalType, amount, category, note, date, accountId });
    rememberEntryPrefs(state.entryType === 'income' ? 'income' : 'expense', category, accountId);
    applyAccountDelta(accountId, amount, finalType);
  }
  saveState(); render(); closeEntryModal(); showToast('Gespeichert');
}

function toggleTxList() {
  const inner = document.getElementById('txListInner');
  if (document.getElementById('txList').classList.contains('open')) {
    // Zuklappen: den Teil unterhalb des Bildschirms sofort abschneiden, damit die Animation
    // nur den sichtbaren Teil schliesst und so schnell wirkt wie das Aufklappen
    const r = inner.getBoundingClientRect();
    inner.style.maxHeight = Math.max(0, Math.min(r.bottom, window.innerHeight) - r.top) + 'px';
    setTimeout(() => { inner.style.maxHeight = ''; }, 260);
  }
  ['txList','txHeader','txChevron'].forEach(id => document.getElementById(id).classList.toggle('open'));
  // Beim Aufklappen so scrollen, dass die Einträge-Karte höchstens 70% des Bildschirms belegt:
  // lange Liste → Kartenoberkante bei 30%; kurze Liste → nur so weit, bis die Karte ganz über
  // der Navigation sichtbar ist. Erst nach der Aufklapp-Animation (.25s),
  // sonst ist die Seite noch zu kurz und es gibt nichts zu scrollen.
  const list = document.getElementById('txList');
  if (list.classList.contains('open')) {
    setTimeout(() => {
      const rect = list.closest('.transactions-section').getBoundingClientRect();
      const navH = document.querySelector('.bottom-nav')?.offsetHeight || 0;
      const targetTop = Math.max(window.innerHeight * 0.3, window.innerHeight - navH - rect.height - 16);
      const delta = rect.top - targetTop;
      if (delta > 0) window.scrollBy({ top: delta, behavior: 'smooth' });
    }, 260);
  }
}

// Rollende Ziffern ("numeric text") beim ersten Anzeigen in dieser Sitzung.
// sessionStorage überlebt das Wechseln zwischen Home/Kalender/Analyse, nicht aber ein neues Öffnen.
function shouldRollBalance() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    if (sessionStorage.getItem('spendly_balanceRolled')) return false;
    sessionStorage.setItem('spendly_balanceRolled', '1');
  } catch (e) {}
  return true;
}
function rollNumber(el, value) {
  const str = formatNum(value);
  el._value = value;
  const cols = el._rollCols;
  // Läuft die Animation noch und hat der neue Wert gleich viele Zeichen: Ziffern nur neu ansteuern
  if (el._rolling && el._rollStr && el._rollStr.length === str.length) {
    [...str].forEach((ch, i) => { if (cols[i]) cols[i].style.transform = `translateY(-${Number(ch)}em)`; });
    el._rollStr = str;
    return;
  }
  clearTimeout(el._rollTimer);
  // Breite jedes Zeichens im fertigen Text messen: die rollenden Spalten bekommen genau diese Breite,
  // so steht die Zahl (und das Auge daneben) während und nach dem Rollen am selben Platz
  el.textContent = str;
  const range = document.createRange(); const widths = [];
  for (let i = 0; i < str.length; i++) { range.setStart(el.firstChild, i); range.setEnd(el.firstChild, i + 1); widths.push(range.getBoundingClientRect().width); }
  el.textContent = '';
  el._rollCols = [];
  [...str].forEach((ch, i) => {
    if (/\d/.test(ch)) {
      const col = document.createElement('span'); col.className = 'roll-col'; col.style.width = widths[i] + 'px';
      const strip = document.createElement('span'); strip.className = 'roll-strip';
      strip.textContent = '0123456789'.split('').join('\n');
      col.appendChild(strip); el.appendChild(col); el._rollCols.push(strip);
    } else {
      const s = document.createElement('span'); s.textContent = ch; el.appendChild(s); el._rollCols.push(null);
    }
  });
  el._rolling = true; el._rollStr = str;
  el.getBoundingClientRect(); // Startzustand (alle Ziffern auf 0) festhalten
  [...str].forEach((ch, i) => { const strip = el._rollCols[i]; if (strip) { strip.style.transitionDelay = (i * 5) + 'ms'; strip.style.transform = `translateY(-${Number(ch)}em)`; } });
  el._rollTimer = setTimeout(() => { el._rolling = false; el._rollCols = null; el.textContent = formatNum(el._value); }, 250 + str.length * 5);
}

// Zahl vom zuletzt angezeigten Wert zum neuen Wert hochzählen lassen (beim ersten Anzeigen direkt setzen)
function animateNumber(el, to) {
  const from = el._value;
  el._value = to;
  cancelAnimationFrame(el._raf);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (from === undefined || from === to || reduce) { el.textContent = formatNum(to); return; }
  const start = performance.now(), dur = 400;
  const step = now => {
    const t = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = formatNum(from + (to - from) * eased);
    if (t < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
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
