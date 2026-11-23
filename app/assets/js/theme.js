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
  var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var animTimer = null;
  // animate: Farben der ganzen Seite gleiten in einer halben Sekunde über (Klasse theme-anim)
  function apply(animate) {
    var p = pref();
    var root = document.documentElement;
    if (animate === true && !(reduce && reduce.matches) && root.getAttribute('data-theme')) {
      root.classList.add('theme-anim');
      clearTimeout(animTimer);
      animTimer = setTimeout(function () { root.classList.remove('theme-anim'); }, 650);
    }
    var dark = p === 'dark' || (p === 'system' && !!(mq && mq.matches));
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#7a1f42' : '#e91e63');
  }
  apply();
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { apply(true); });
  // Änderung in einem anderen Fenster (z.B. Einstellungen im Menü) → hier auch
  window.addEventListener('storage', function (e) { if (e.key === KEY) apply(true); });
  document.addEventListener('DOMContentLoaded', function () { apply(); });
  window.spendlyTheme = {
    get: pref,
    set: function (v) {
      try { if (v === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, v); } catch (e) {}
      apply(true);
      try { if (window.parent !== window && window.parent.spendlyTheme) window.parent.spendlyTheme.refresh(); } catch (e) {}
    },
    refresh: function () { apply(true); },
  };
})();
