/* ==========================================================
 * pages/analyse.js – Analyse (Monatschart + Monatsliste)
 * Benötigt assets/js/main.js
 ========================================================== */

let insightsViewDate = new Date(); insightsViewDate.setDate(1);
// Rechtester (jüngster) Monat im aktuell angezeigten 8-Monats-Fenster der Analyse-Ansicht.
// Bleibt beim Blättern stabil, solange der ausgewählte Monat noch im Fenster liegt.
let insightsWindowAnchor = new Date(insightsViewDate);
// px, muss mit .insights-bar-track in pages/analyse.css übereinstimmen
const INSIGHTS_TRACK_HEIGHT = 150;

// Monat für die Analyse-Ansicht wechseln (Pfeile) bzw. per Klick auf einen Balken auswählen.
function changeInsightsMonth(delta) {
  const now = new Date();
  const next = new Date(insightsViewDate.getFullYear(), insightsViewDate.getMonth() + delta, 1);
  const monthsAhead = (next.getFullYear() - now.getFullYear()) * 12 + next.getMonth() - now.getMonth();
  if (delta > 0 && monthsAhead > 0) return; // nicht in die Zukunft navigieren
  insightsViewDate = next;
  syncInsightsWindow();
  renderInsightsView();
}
function selectInsightsMonth(year, month) {
  insightsViewDate = new Date(year, month, 1);
  // Balken ist bereits im sichtbaren Fenster, kein Nachrutschen nötig.
  renderInsightsView();
}
// Verschiebt das 8-Monats-Fenster nur dann, wenn der ausgewählte Monat aus dem
// aktuell sichtbaren Bereich herausgewandert ist. Beim Rückwärts-Navigieren
// landet der neu sichtbare Monat ganz rechts im Fenster, beim Vorwärts-
// Navigieren ganz links. Solange der Monat noch im Fenster liegt, bleibt
// das Fenster an Ort und Stelle.
function syncInsightsWindow() {
  const now = new Date();
  const nowMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWindow = new Date(insightsWindowAnchor.getFullYear(), insightsWindowAnchor.getMonth() - 7, 1);
  const selKey   = monthKey(insightsViewDate);
  const startKey = monthKey(startOfWindow);
  const endKey   = monthKey(insightsWindowAnchor);
  if (selKey > endKey) {
    let newAnchor = new Date(insightsViewDate.getFullYear(), insightsViewDate.getMonth() + 7, 1);
    if (newAnchor > nowMonthDate) newAnchor = nowMonthDate;
    insightsWindowAnchor = newAnchor;
  } else if (selKey < startKey) {
    insightsWindowAnchor = new Date(insightsViewDate);
  }
}
// Rendert Monats-Label + Chart + Eintragsliste für den aktuell gewählten Monat.
function renderInsightsView() {
  const now = new Date();
  const label = document.getElementById('insightsMonthLabel');
  if (label) label.textContent = fmtDate(insightsViewDate, { month: 'long', year: 'numeric' });
  const nextBtn = document.getElementById('insightsNavNext');
  if (nextBtn) {
    const disabled = insightsViewDate.getFullYear() === now.getFullYear() && insightsViewDate.getMonth() === now.getMonth();
    nextBtn.disabled = disabled;
    nextBtn.style.opacity = disabled ? '0.3' : '';
    nextBtn.style.cursor = disabled ? 'default' : '';
  }
  renderTagFilter();
  // Mit Tag: Zusammenfassung über alle Monate statt Monatsansicht
  const tagged = !!insightsTag;
  ['insightsMonthNav', 'insightsChartCard'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = tagged; });
  document.getElementById('tagSummary').hidden = !tagged;
  if (tagged) {
    document.getElementById('insightsReview').hidden = true;
    renderTagSummary();
  } else {
    renderInsightsReview();
    renderInsightsChart();
  }
  renderInsightsMonthList();
}

// ── NACH TAG FILTERN
// Gewählter Tag, '' = alle. Steht auch in der Adresse (#tag=Ferien), damit Zurück funktioniert.
let insightsTag = '';
function tagFromHash() {
  const m = location.hash.match(/^#tag=(.+)$/);
  return m ? decodeURIComponent(m[1]) : '';
}
function setInsightsTag(tag) {
  insightsTag = tag;
  const hash = tag ? '#tag=' + encodeURIComponent(tag) : '';
  if (location.hash !== hash) history.replaceState(null, '', location.pathname + hash);
  renderInsightsView();
  if (tag) document.getElementById('tagSummary').scrollIntoView({ block: 'nearest' });
}
function entriesWithTag(tag) {
  const t = tag.toLowerCase();
  return state.entries.filter(e => !e.isPreview && (e.tags || []).some(x => x.toLowerCase() === t));
}
function renderTagFilter() {
  const box = document.getElementById('tagFilter');
  if (!box) return;
  const tags = allTags();
  // Tag existiert nicht mehr (z.B. Eintrag gelöscht): zurück zu allen
  if (insightsTag && !tags.some(t => t.name.toLowerCase() === insightsTag.toLowerCase())) insightsTag = '';
  box.hidden = !tags.length;
  if (!tags.length) { box.innerHTML = ''; return; }
  const chip = (tag, label) => {
    const on = tag.toLowerCase() === insightsTag.toLowerCase();
    return `<button type="button" class="tag-filter-chip${on ? ' on' : ''}" aria-pressed="${on}" onclick="setInsightsTag(${jsArg(tag)})">${label}</button>`;
  };
  box.innerHTML = chip('', esc(t('Alle'))) + tags.map(t => chip(t.name, "#" + esc(t.name))).join('');
}
function renderTagSummary() {
  const box = document.getElementById('tagSummary');
  const list = entriesWithTag(insightsTag);
  const spent = list.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
  const earned = list.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
  const dates = list.map(e => e.date).sort();
  const fmt = d => fmtDate(d, { day: 'numeric', month: 'short', year: 'numeric' });
  const range = !dates.length ? '' : dates[0] === dates[dates.length - 1] ? fmt(dates[0]) : t('{von} bis {bis}', { von: fmt(dates[0]), bis: fmt(dates[dates.length - 1]) });
  // Ausgaben nach Kategorie als dünne Balken
  const byCat = {};
  list.filter(e => e.type === 'expense').forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const max = cats.length ? cats[0][1] : 1;
  const rows = cats.map(([name, sum]) => {
    const c = catByName(name);
    return `<div class="tag-cat-row">
        <span class="tag-cat-name">${catIcon(c)} ${esc(catName(name))}</span><span class="tag-cat-amt">${formatNum(sum)}</span>
        <span class="tag-cat-bar"><span style="width:${(sum / max * 100).toFixed(1)}%;background:${c.color}"></span></span></div>`;
  }).join('');
  box.innerHTML = `
    <div class="tag-summary-head">
      <div><div class="section-label">${esc(t('#{tag}, ausgegeben', { tag: insightsTag }))}</div><div class="tag-summary-total">${money(spent)}</div></div>
      <button type="button" class="tag-summary-clear" onclick="setInsightsTag('')" aria-label="${t('Filter aufheben')}"><span class="ico ico-close"></span></button>
    </div>
    <div class="tag-summary-sub">${nEntries(list.length)}${range ? ', ' + range : ''}${earned ? ', ' + t('{betrag} eingenommen', { betrag: money(earned) }) : ''}</div>
    ${rows ? `<div class="tag-cats">${rows}</div>` : ''}`;
}

// Monatsrückblick: Ausgaben des gewählten Monats im Vergleich zum Vormonat.
// Erscheint erst in der letzten Woche des Monats (dann fair bis zum gleichen Tag
// verglichen) und bei vergangenen Monaten. Mit dem Kreuz pro Monat ausblendbar.
function reviewHiddenMonths() { try { return JSON.parse(localStorage.getItem('spendly_reviewHidden')) || []; } catch (e) { return []; } }
function hideInsightsReview() {
  const list = reviewHiddenMonths();
  list.push(monthKey(insightsViewDate));
  try { localStorage.setItem('spendly_reviewHidden', JSON.stringify(list.slice(-24))); } catch (e) {}
  document.getElementById('insightsReview').hidden = true;
}
function renderInsightsReview() {
  const box = document.getElementById('insightsReview');
  if (!box) return;
  const now = new Date();
  const y = insightsViewDate.getFullYear(), m = insightsViewDate.getMonth();
  const isCurrent = y === now.getFullYear() && m === now.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  if ((isCurrent && now.getDate() <= lastDay - 7) || reviewHiddenMonths().includes(monthKey(insightsViewDate))) { box.hidden = true; return; }
  const day = isCurrent ? now.getDate() : 31;
  const prev = new Date(y, m - 1, 1);
  const sumUntil = (date) => {
    const key = monthKey(date);
    return state.entries
      .filter(e => !e.isPreview && e.type === 'expense' && e.date.slice(0, 7) === key && Number(e.date.slice(8, 10)) <= day)
      .reduce((s, e) => s + e.amount, 0);
  };
  const cur = sumUntil(insightsViewDate), before = sumUntil(prev);
  const prevName = fmtDate(prev, { month: 'long' });
  const curName = fmtDate(insightsViewDate, { month: 'long' });
  if (!cur && !before) { box.hidden = true; return; }
  box.hidden = false;
  const text = document.getElementById('insightsReviewText');
  const sub = document.getElementById('insightsReviewSub');
  const v = { monat: curName, vormonat: prevName, tag: day };
  if (!before) {
    text.textContent = t('Im {vormonat} hast du keine Ausgaben erfasst, darum gibt es noch keinen Vergleich.', v);
  } else {
    const diff = Math.round((cur - before) / before * 100);
    v.pct = Math.abs(diff);
    // Ganze Sätze, damit jede Sprache ihre eigene Wortstellung haben kann
    const key = diff === 0
      ? (isCurrent ? 'Bis heute hast du gleich viel ausgegeben wie im {vormonat} bis zum {tag}.' : 'Im {monat} hast du gleich viel ausgegeben wie im {vormonat}.')
      : diff < 0
        ? (isCurrent ? 'Bis heute hast du {pct} % weniger ausgegeben als im {vormonat} bis zum {tag}.' : 'Im {monat} hast du {pct} % weniger ausgegeben als im {vormonat}.')
        : (isCurrent ? 'Bis heute hast du {pct} % mehr ausgegeben als im {vormonat} bis zum {tag}.' : 'Im {monat} hast du {pct} % mehr ausgegeben als im {vormonat}.');
    text.textContent = t(key, v);
    text.classList.toggle('good', diff < 0);
    text.classList.toggle('bad', diff > 0);
  }
  sub.textContent = isCurrent
    ? t('{betrag} bis heute, {vorher} im {vormonat} bis zum {tag}.', { betrag: money(cur), vorher: money(before), vormonat: prevName, tag: day })
    : t('{betrag} im {monat}, {vorher} im {vormonat}', { betrag: money(cur), vorher: money(before), monat: curName, vormonat: prevName });
}
// Netto (Einnahmen − Ausgaben − interne Überweisungen, z. B. Sparen) pro
// Monat. Geplante Vorschau-Einträge zählen nicht mit, da sie noch nicht
// real gebucht sind.
function computeMonthlyNet(monthsBack, anchorDate = new Date()) {
  const months = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() });
  }
  const relevant = state.entries.filter(e => !e.isPreview);
  return months.map(({ year, month }) => {
    const mKey = monthKey(new Date(year, month, 1));
    const net = relevant
      .filter(e => e.date.slice(0, 7) === mKey)
      .reduce((s, e) => s + (e.type === 'income' ? e.amount : -e.amount), 0);
    return { year, month, net };
  });
}
function renderInsightsChart() {
  const el = document.getElementById('insightsChart');
  if (!el) return;
  const monthNames = [...Array(12)].map((_, i) => fmtDate(new Date(2000, i, 1), { month: 'short' }).replace('.', ''));
  // Noch gar keine Einträge: Erklärung statt acht Nullen über einer leeren Fläche
  el.parentElement.classList.toggle('is-empty', !state.entries.length);
  if (!state.entries.length) {
    el.innerHTML = `<div class="insights-empty">
      <p>${t('Sobald du Einnahmen und Ausgaben erfasst, siehst du hier, wie viel dir jeden Monat übrig bleibt.')}</p>
      <a class="empty-cta" href="index.html">${t('Eintrag erfassen')}</a>
    </div>`;
    return;
  }
  const data = computeMonthlyNet(8, insightsWindowAnchor);
  const values = data.map(d => d.net);
  const maxVal = Math.max(...values, 0);
  const minVal = Math.min(...values, 0);
  const range = (maxVal - minVal) || 1;
  const zeroTop = (maxVal / range) * INSIGHTS_TRACK_HEIGHT;
  el.innerHTML = data.map(d => {
    const isSelected = d.year === insightsViewDate.getFullYear() && d.month === insightsViewDate.getMonth();
    const isNeg = d.net < 0;
    const barH = Math.max((Math.abs(d.net) / range) * INSIGHTS_TRACK_HEIGHT, d.net !== 0 ? 2 : 0);
    const barTop = isNeg ? zeroTop : zeroTop - barH;
    const barCls = `insights-bar${isNeg ? ' negative' : ''}${isSelected ? ' active' : ''}`;
    // Leere Monate (Bilanz 0) ohne Zahl, damit man sofort sieht, wo es Daten gibt.
    const valCls = `insights-bar-value${isNeg ? ' negative' : ''}${isSelected ? ' active' : ''}`;
    return `
      <div class="insights-bar-col" onclick="selectInsightsMonth(${d.year},${d.month})" role="button" tabindex="0" aria-pressed="${isSelected}" aria-label="${monthNames[d.month]} ${d.year}: ${d.net >= 0 ? '+' : '−'}${money(Math.abs(d.net))}" title="${monthNames[d.month]} ${d.year} · ${d.net >= 0 ? '+' : '−'}${money(Math.abs(d.net))}">
        <div class="${valCls}"${d.net === 0 ? ' aria-hidden="true"' : ''}>${d.net === 0 ? '&nbsp;' : formatSignedCompactChf(d.net)}</div>
        <div class="insights-bar-track">
          <div class="insights-bar-zero-line" style="top:${zeroTop}px"></div>
          <div class="${barCls}" style="top:${barTop}px; height:${barH}px"></div>
        </div>
        <div class="insights-bar-label${isSelected ? ' active' : ''}">${monthNames[d.month]}</div>
      </div>`;
  }).join('');
}
// Kompakte, vorzeichenbehaftete Beschriftung für die Balken-Zahlen
// (ohne Nachkommastellen, ab 100'000 mit "k").
function formatSignedCompactChf(n) {
  const abs = Math.abs(n);
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  if (abs >= 100000) {
    return sign + (abs / 1000).toLocaleString(I18N.locale, { maximumFractionDigits: 0 }) + 'k';
  }
  return sign + Math.round(abs).toLocaleString(I18N.locale);
}
// Aufgeklappte Kategorien bleiben beim Neuzeichnen und Monatswechsel offen.
const openInsightsCats = new Set();
function toggleInsightsCat(headerEl) {
  const group = headerEl.parentElement;
  const open = group.classList.toggle('open');
  headerEl.setAttribute('aria-expanded', open);
  if (open) openInsightsCats.add(group.dataset.cat); else openInsightsCats.delete(group.dataset.cat);
}
// Einträge des in der Analyse-Ansicht ausgewählten Monats, gruppiert nach
// Kategorie als aufklappbare Gruppen mit Gesamtbetrag.
function renderInsightsMonthList() {
  const listEl = document.getElementById('insightsTxList');
  const emptyEl = document.getElementById('insightsTxEmpty');
  const countEl = document.getElementById('insightsTxCount');
  if (!listEl) return;
  const mKey = monthKey(insightsViewDate);
  const entries = (insightsTag ? entriesWithTag(insightsTag) : state.entries.filter(e => e.date.slice(0, 7) === mKey))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  listEl.querySelectorAll('.insights-cat-group').forEach(el => el.remove());
  if (countEl) countEl.textContent = entries.length;
  if (!entries.length) { if (emptyEl) { emptyEl.textContent = t('Keine Einträge in diesem Monat.'); emptyEl.hidden = false; } return; }
  if (emptyEl) emptyEl.hidden = true;

  const groups = {};
  entries.forEach(e => {
    const key = e.type === 'transfer' ? 'Interne Überweisung' : e.category;
    if (!groups[key]) groups[key] = { name: key, entries: [], total: 0, isTransfer: e.type === 'transfer' };
    groups[key].entries.push(e);
    // Einnahmen positiv, Ausgaben negativ; Überweisungen ohne Vorzeichen
    groups[key].total += e.type === 'income' || e.type === 'transfer' ? e.amount : -e.amount;
  });
  Object.values(groups)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    .forEach(g => {
      const cat = g.isTransfer
        ? { color: '#7c93ff', icon: 'transfer' }
        : catByName(g.name);
      const totalHtml = g.isTransfer
        ? `<div class="insights-cat-total" style="color:var(--transfer-text)">${formatNum(g.total)}</div>`
        : `<div class="insights-cat-total tx-amount ${g.total >= 0 ? 'income' : 'expense'}">${g.total >= 0 ? '+' : '−'}${formatNum(Math.abs(g.total))}</div>`;
      const group = document.createElement('div');
      group.className = 'insights-cat-group' + (openInsightsCats.has(g.name) ? ' open' : '');
      group.dataset.cat = g.name;
      group.innerHTML = `
        <div class="insights-cat-header" onclick="toggleInsightsCat(this)" role="button" tabindex="0" aria-expanded="${openInsightsCats.has(g.name)}">
          <div class="tx-cat-dot" style="background:${cat.color}"></div>
          <div class="insights-cat-name">${catIcon(cat)} ${esc(catName(g.name))}</div>
          <span class="insights-cat-count">${g.entries.length}</span>
          ${totalHtml}
          <span class="insights-cat-chevron ico ico-arrow-down"></span>
        </div>
        <div class="insights-cat-body">
          ${g.entries.map(e => `<div class="tx-item">${entryRowInner(e)}</div>`).join('')}
        </div>`;
      listEl.appendChild(group);
    });
}

// ── START
insightsTag = tagFromHash();
window.addEventListener('hashchange', () => { insightsTag = tagFromHash(); renderInsightsView(); });
registerPageRender(renderInsightsView);
renderInsightsView();
