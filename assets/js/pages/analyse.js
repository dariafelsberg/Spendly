/* ==========================================================
 * pages/analyse.js – Analyse (Monatschart + Monatsliste)
 * Benötigt assets/js/main.js
 ========================================================== */

let insightsViewDate = new Date(); insightsViewDate.setDate(1);
// Rechtester (jüngster) Monat im aktuell angezeigten 8-Monats-Fenster der Analyse-Ansicht.
// Bleibt beim Blättern stabil, solange der ausgewählte Monat noch im Fenster liegt.
let insightsWindowAnchor = new Date(insightsViewDate);
// px, muss mit .insights-bar-track in styles.css übereinstimmen
const INSIGHTS_TRACK_HEIGHT = 150;

// ── INSIGHTS (Kalender/Analyse-Umschalter)
function setInsightsView(view) {
  const calView = document.getElementById('calendarView');
  const anaView = document.getElementById('analysisView');
  const btnCal  = document.getElementById('viewBtnCalendar');
  const btnAna  = document.getElementById('viewBtnAnalysis');
  if (calView) calView.style.display = view === 'calendar' ? '' : 'none';
  if (anaView) anaView.style.display = view === 'analysis' ? '' : 'none';
  if (btnCal) btnCal.classList.toggle('active', view === 'calendar');
  if (btnAna) btnAna.classList.toggle('active', view === 'analysis');
  if (view === 'analysis') renderInsightsView();
}
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
  if (label) label.textContent = insightsViewDate.toLocaleDateString('de-CH', { month: 'long', year: 'numeric' });
  const nextBtn = document.getElementById('insightsNavNext');
  if (nextBtn) {
    const disabled = insightsViewDate.getFullYear() === now.getFullYear() && insightsViewDate.getMonth() === now.getMonth();
    nextBtn.disabled = disabled;
    nextBtn.style.opacity = disabled ? '0.3' : '';
    nextBtn.style.cursor = disabled ? 'default' : '';
  }
  renderInsightsChart();
  renderInsightsMonthList();
}
// Netto (Einnahmen − Ausgaben) pro Monat. Überweisungen und geplante
// Vorschau-Einträge zählen nicht mit, da sie das Gesamtvermögen nicht
// verändern bzw. noch nicht real gebucht sind.
function computeMonthlyNet(monthsBack, anchorDate = new Date()) {
  const months = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() });
  }
  const relevant = state.entries.filter(e => e.type !== 'transfer' && !e.isPreview);
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
  const monthNames = ['Jan','Feb','Mrz','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
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
    const valCls = `insights-bar-value${isNeg ? ' negative' : ''}${isSelected ? ' active' : ''}`;
    return `
      <div class="insights-bar-col" onclick="selectInsightsMonth(${d.year},${d.month})" title="${monthNames[d.month]} ${d.year} · ${d.net >= 0 ? '+' : '−'}CHF ${formatNum(Math.abs(d.net))}">
        <div class="${valCls}">${formatSignedCompactChf(d.net)}</div>
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
    return sign + (abs / 1000).toLocaleString('de-CH', { maximumFractionDigits: 0 }) + 'k';
  }
  return sign + Math.round(abs).toLocaleString('de-CH');
}
// Liste der Einträge des in der Analyse-Ansicht ausgewählten Monats.
function renderInsightsMonthList() {
  const listEl = document.getElementById('insightsTxList');
  const emptyEl = document.getElementById('insightsTxEmpty');
  const countEl = document.getElementById('insightsTxCount');
  if (!listEl) return;
  const mKey = monthKey(insightsViewDate);
  const entries = state.entries
    .filter(e => e.date.slice(0, 7) === mKey)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  listEl.querySelectorAll('.tx-item').forEach(el => el.remove());
  if (countEl) countEl.textContent = entries.length;
  if (!entries.length) { if (emptyEl) emptyEl.style.display = 'block'; return; }
  if (emptyEl) emptyEl.style.display = 'none';
  entries.forEach(e => {
    const item = document.createElement('div');
    item.className = 'tx-item';
    item.innerHTML = entryRowInner(e);
    listEl.appendChild(item);
  });
}

// ── START
registerPageRender(renderInsightsView);
renderInsightsView();
