/* theme.js – Hell / Dunkel / Wie Gerät
 * Wird als erstes Skript im <head> geladen, damit die Seite gleich in den
 * richtigen Farben erscheint (kein weisses Aufblitzen). Die Wahl gilt pro Gerät
 * (localStorage «spendly_theme»: 'light' | 'dark' | 'system'). */
(function () {
  var KEY = 'spendly_theme';
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function pref() {
    try { var v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; }
    catch (e) { return 'system'; }
  }
  function apply() {
    var p = pref();
    var dark = p === 'dark' || (p === 'system' && !!(mq && mq.matches));
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#8f1240' : '#e91e63');
  }
  apply();
  if (mq && mq.addEventListener) mq.addEventListener('change', apply);
  // Änderung in einem anderen Fenster (z.B. Einstellungen im Menü) → hier auch
  window.addEventListener('storage', function (e) { if (e.key === KEY) apply(); });
  document.addEventListener('DOMContentLoaded', apply);
  window.spendlyTheme = {
    get: pref,
    set: function (v) {
      try { if (v === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, v); } catch (e) {}
      apply();
      try { if (window.parent !== window && window.parent.spendlyTheme) window.parent.spendlyTheme.refresh(); } catch (e) {}
    },
    refresh: apply,
  };
})();
