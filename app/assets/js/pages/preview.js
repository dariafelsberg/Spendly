/* ==========================================================
 * pages/preview.js – Vorschau der Startseite im Onboarding
 * Liest die Angaben aus login.html (window.parent._onb) und zeigt sie
 * so, wie sie nach der Registrierung auf der Startseite stehen. Ein neues
 * Konto hat noch keine Einträge, darum ist das ganze Budget verfügbar.
 ========================================================== */

function pvEsc(v) {
  return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}
function pvNum(n) { return Number(n).toLocaleString(I18N.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function renderPreview() {
  let onb = {};
  try { onb = window.parent._onb || {}; } catch (e) {}
  const acc = onb.account;
  const budget = onb.budget > 0 ? onb.budget : 0;
  const now = new Date();

  // Topbar: Gesamtguthaben und Konto-Pille wie auf der Startseite
  document.getElementById('totalBalanceDisplay').textContent = pvNum(acc ? acc.balance : 0);
  document.getElementById('accountPills').innerHTML = acc
    ? `<div class="account-pill-item"><span class="pill-name">${pvEsc(acc.name)}</span><span class="pill-val">${cur()} ${pvNum(acc.balance)}</span></div>`
    : `<span class="account-pill-item account-pill-add"><span class="ico ico-plus" aria-hidden="true"></span> ${t('Konto hinzufügen')}</span>`;

  document.getElementById('monthLabel').textContent = now.toLocaleDateString(I18N.locale, { month: 'long', year: 'numeric' });

  // Budgetkarte und Donut, gleiche Texte wie renderBudgetCard() und renderDonut()
  const display = document.getElementById('budgetDisplay');
  const sub = document.getElementById('budgetSub');
  const center = document.getElementById('donutBudget');
  display.classList.toggle('is-empty', !budget);
  center.classList.toggle('is-empty', !budget);
  if (budget) {
    display.textContent = cur() + ' ' + pvNum(budget);
    sub.textContent = t('Noch {betrag} verfügbar', { betrag: cur() + ' ' + pvNum(budget) });
    center.textContent = cur() + ' ' + pvNum(budget);
    document.getElementById('donutLabel').textContent = t('noch verfügbar');
    document.getElementById('donutSpent').textContent = t('von {betrag}', { betrag: cur() + ' ' + pvNum(budget) });
  } else {
    display.textContent = t('Noch kein Budget');
    sub.textContent = t('Leg fest, wie viel du pro Monat ausgeben willst.');
    center.textContent = t('Noch keine');
    document.getElementById('donutLabel').textContent = t('Ausgaben im {monat}', { monat: now.toLocaleDateString(I18N.locale, { month: 'long' }) });
    document.getElementById('donutSpent').textContent = '';
  }
}

renderPreview();
// login.html ruft das auf, wenn die Vorschau erneut gezeigt wird (geänderte Angaben)
window.renderPreview = renderPreview;
