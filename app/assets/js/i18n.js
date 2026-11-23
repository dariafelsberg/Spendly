/* i18n.js – Sprache und Währung
 * Wird im <head> direkt nach theme.js geladen.
 *
 * Sprache: Deutsch ist die Quellsprache. Alle Texte stehen auf Deutsch im Code.
 * Für die anderen Sprachen liegt in assets/i18n/<sprache>.js ein Wörterbuch
 * { 'Deutscher Text': 'Übersetzung' }. Nur das Wörterbuch der gewählten Sprache
 * wird geladen.
 *   - HTML: translateDom() übersetzt Texte und die Attribute placeholder,
 *     aria-label, title, alt, data-error, data-placeholder und data-sub automatisch,
 *     wenn der deutsche Text im Wörterbuch steht. Ausnahme: alles innerhalb von
 *     [data-no-i18n] (z.B. Rechtstexte).
 *   - JS: t('Noch {betrag} verfügbar', { betrag: '12.00' }).
 *
 * Wahl der Sprache: ?lang=xx in der Adresse (Links der Landingpage), dann
 * localStorage «spendly_lang» (gilt sofort), sonst
 * Gerätesprache, sonst Deutsch. Mit dem Account synchronisiert über state.lang
 * (siehe main.js).
 *
 * Währung: cur() ist die Hauptwährung (localStorage «spendly_cur», Standard CHF).
 */
(function () {
  var LANGS = ['de', 'fr', 'it', 'en', 'nl'];
  // Sprachen in ihrer eigenen Schreibweise, damit man sie auch ohne Deutsch findet
  var LANG_NAMES = { de: 'Deutsch', fr: 'Français', it: 'Italiano', en: 'English', nl: 'Nederlands' };
  // Zahlen- und Datumsformat pro Sprache (Schweizer Varianten, Niederländisch wie in den Niederlanden)
  var LOCALES = { de: 'de-CH', fr: 'fr-CH', it: 'it-CH', en: 'en-CH', nl: 'nl-NL' };

  function detect() {
    // ?lang=fr von der Landingpage: gilt als Wahl und wird gemerkt
    try {
      var q = (location.search.match(/[?&]lang=([a-z]{2})\b/) || [])[1];
      if (q) history.replaceState(null, '', location.pathname + location.search.replace(/([?&])lang=[a-z]{2}\b&?/, '$1').replace(/[?&]$/, '') + location.hash);
      if (LANGS.indexOf(q) >= 0) { localStorage.setItem('spendly_lang', q); return q; }
    } catch (e) {}
    try {
      var saved = localStorage.getItem('spendly_lang');
      if (LANGS.indexOf(saved) >= 0) return saved;
    } catch (e) {}
    var list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || 'de'];
    for (var i = 0; i < list.length; i++) {
      var code = String(list[i] || '').slice(0, 2).toLowerCase();
      if (LANGS.indexOf(code) >= 0) return code;
    }
    return 'de';
  }

  var lang = detect();
  document.documentElement.lang = lang;
  window.SPENDLY_I18N = window.SPENDLY_I18N || {};

  // Wörterbuch synchron laden (blockiert kurz, dafür erscheint die Seite gleich übersetzt).
  // Pfad relativ zu diesem Skript, damit es auch aus Unterordnern klappt.
  if (lang !== 'de') {
    var me = document.currentScript && document.currentScript.src;
    var base = me ? me.replace(/js\/i18n\.js.*$/, '') : 'assets/';
    document.write('<script src="' + base + 'i18n/' + lang + '.js"><\/script>');
  }

  function dict() { return window.SPENDLY_I18N[lang] || {}; }

  // t('Text mit {name}', { name: 'Wert' })
  function t(key, vars) {
    var s = (lang !== 'de' && Object.prototype.hasOwnProperty.call(dict(), key)) ? dict()[key] : key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return k in vars ? vars[k] : m; });
    return s;
  }

  // ── Hauptwährung
  // Kurse kommen von der Europäischen Zentralbank (über api/rates.js). Nur diese Währungen gibt es dort.
  var CURRENCIES = ['CHF', 'EUR', 'USD', 'GBP', 'AUD', 'BGN', 'BRL', 'CAD', 'CNY', 'CZK', 'DKK', 'HKD', 'HUF', 'IDR', 'ILS',
    'INR', 'ISK', 'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'ZAR'];
  function cur() {
    try { var c = localStorage.getItem('spendly_cur'); if (CURRENCIES.indexOf(c) >= 0) return c; } catch (e) {}
    return 'CHF';
  }
  var _curNames = null;
  function currencyName(code) {
    try {
      if (!_curNames) _curNames = new Intl.DisplayNames([LOCALES[lang]], { type: 'currency' });
      var n = _curNames.of(code);
      return n ? n.charAt(0).toUpperCase() + n.slice(1) : code;
    } catch (e) { return code; }
  }

  // ── HTML übersetzen
  var ATTRS = ['placeholder', 'aria-label', 'title', 'alt', 'data-error', 'data-placeholder', 'data-sub'];
  function swapCur(s) {
    var c = cur();
    return c === 'CHF' ? s : s.replace(/\bCHF\b/g, c);
  }
  function translateText(raw) {
    var trimmed = raw.replace(/\s+/g, ' ').trim();
    if (!trimmed) return raw;
    var out = t(trimmed);
    var swapped = swapCur(out);
    if (swapped === trimmed) return raw;
    // Leerraum vorne und hinten behalten (wichtig zwischen Inline-Elementen)
    var lead = raw.match(/^\s*/)[0] ? ' ' : '', trail = raw.match(/\s*$/)[0] ? ' ' : '';
    return lead + swapped + trail;
  }
  function translateDom(root) {
    root = root || document;
    if (lang === 'de' && cur() === 'CHF') return;
    var start = root.body || root;
    var walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p || p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE') return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest('[data-no-i18n]')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var v = translateText(node.nodeValue);
      if (v !== node.nodeValue) node.nodeValue = v;
    });
    var sel = ATTRS.map(function (a) { return '[' + a + ']'; }).join(',');
    var els = (start.querySelectorAll ? start.querySelectorAll(sel) : []);
    Array.prototype.forEach.call(els, function (el) {
      if (el.closest('[data-no-i18n]')) return;
      ATTRS.forEach(function (a) {
        if (!el.hasAttribute(a)) return;
        var old = el.getAttribute(a), v = translateText(old);
        if (v !== old) el.setAttribute(a, v.trim());
      });
    });
    if (root === document && document.title) {
      // «Einstellungen - Spendly»: Teile einzeln übersetzen
      document.title = document.title.split(' - ').map(function (p) { return t(p.trim()); }).join(' - ');
    }
  }
  var _done = false;
  function translatePage() { if (_done) return; _done = true; translateDom(document); }
  document.addEventListener('DOMContentLoaded', translatePage);

  function setLang(code) {
    if (LANGS.indexOf(code) < 0) return;
    try { localStorage.setItem('spendly_lang', code); } catch (e) {}
  }
  function setCur(code) {
    if (CURRENCIES.indexOf(code) < 0) return;
    try { localStorage.setItem('spendly_cur', code); } catch (e) {}
  }

  window.t = t;
  window.cur = cur;
  window.translateDom = translateDom;
  window.translatePage = translatePage;
  window.I18N = {
    lang: lang, langs: LANGS, langNames: LANG_NAMES, locale: LOCALES[lang],
    currencies: CURRENCIES, currencyName: currencyName, setLang: setLang, setCur: setCur,
  };
})();
