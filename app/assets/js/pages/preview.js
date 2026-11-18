/* ==========================================================
 * pages/preview.js – Vorschau der Startseite im Onboarding
 * Liest die Angaben aus login.html (window.parent._onb) und zeigt sie
 * so, wie sie nach der Registrierung auf der Startseite stehen. Ein neues
 * Konto hat noch keine Einträge, darum ist das ganze Budget verfügbar.
 ========================================================== */

function pvEsc(v) {
  return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}
function pvNum(n) { return Number(n).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function renderPreview() {
  let onb = {};
  try { onb = window.parent._onb || {}; } catch (e) {}
  const acc = onb.account;
  const budget = onb.budget > 0 ? onb.budget : 0;
  const now = new Date();

  // Topbar: Gesamtguthaben und Konto-Pille wie auf der Startseite
  document.getElementById('totalBalanceDisplay').textContent = pvNum(acc ? acc.balance : 0);
  document.getElementById('accountPills').innerHTML = acc
    ? `<div class="account-pill-item"><span class="pill-name">${pvEsc(acc.name)}</span><span class="pill-val">CHF ${pvNum(acc.balance)}</span></div>`
    : '<span class="account-pill-item account-pill-add"><span class="ico ico-plus" aria-hidden="true"></span> Konto hinzufügen</span>';

  document.getElementById('monthLabel').textContent = now.toLocaleDateString('de-CH', { month: 'long', year: 'numeric' });

  // Budgetkarte und Donut, gleiche Texte wie renderBudgetCard() und renderDonut()
  const display = document.getElementById('budgetDisplay');
  const sub = document.getElementById('budgetSub');
  const center = document.getElementById('donutBudget');
  display.classList.toggle('is-empty', !budget);
  center.classList.toggle('is-empty', !budget);
  if (budget) {
    display.textContent = 'CHF ' + pvNum(budget);
    sub.textContent = `Noch CHF ${pvNum(budget)} verfügbar`;
    center.textContent = 'CHF ' + pvNum(budget);
    document.getElementById('donutLabel').textContent = 'noch verfügbar';
    document.getElementById('donutSpent').textContent = 'von CHF ' + pvNum(budget);
  } else {
    display.textContent = 'Noch kein Budget';
    sub.textContent = 'Leg fest, wie viel du pro Monat ausgeben willst.';
    center.textContent = 'Noch keine';
    document.getElementById('donutLabel').textContent = 'Ausgaben im ' + now.toLocaleDateString('de-CH', { month: 'long' });
    document.getElementById('donutSpent').textContent = '';
  }
}

renderPreview();
// login.html ruft das auf, wenn die Vorschau erneut gezeigt wird (geänderte Angaben)
window.renderPreview = renderPreview;
