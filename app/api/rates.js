// ══════════════════════════════════════════════════════════
//  WECHSELKURSE — /api/rates?from=EUR&to=CHF&date=2026-11-21
//  Holt den Referenzkurs der Europäischen Zentralbank über den
//  kostenlosen Dienst Frankfurter (https://frankfurter.dev, kein Schlüssel).
//  Läuft auf Vercel, damit der Browser nur mit app.spendly.ch spricht
//  (CSP bleibt 'self', keine Daten der Nutzer an Dritte).
//  An Wochenenden und Feiertagen liefert die EZB den Kurs des letzten
//  Arbeitstags; das Datum in der Antwort sagt, von welchem Tag er ist.
//  Antwort: { rate: 0.9365, date: '2026-11-20' }
// ══════════════════════════════════════════════════════════

const CURRENCIES = ['CHF', 'EUR', 'USD', 'GBP', 'AUD', 'BGN', 'BRL', 'CAD', 'CNY', 'CZK', 'DKK', 'HKD', 'HUF', 'IDR', 'ILS',
  'INR', 'ISK', 'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'ZAR'];

async function fetchRate(from, to, day) {
  const urls = [
    `https://api.frankfurter.dev/v1/${day}?base=${from}&symbols=${to}`,
    `https://api.frankfurter.app/${day}?from=${from}&to=${to}`,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (!r.ok) continue;
      const d = await r.json();
      const rate = d && d.rates && d.rates[to];
      if (rate > 0) return { rate, date: d.date || day };
    } catch (e) { /* nächste Adresse versuchen */ }
  }
  return null;
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const from = String(q.from || '').toUpperCase();
  const to = String(q.to || '').toUpperCase();
  const today = new Date().toISOString().slice(0, 10);
  let day = /^\d{4}-\d{2}-\d{2}$/.test(String(q.date || '')) ? String(q.date) : today;
  if (day > today) day = today;
  if (day < '1999-01-04') day = '1999-01-04'; // erster EZB-Kurs
  if (!CURRENCIES.includes(from) || !CURRENCIES.includes(to)) {
    return res.status(400).json({ error: 'unknown currency' });
  }
  if (from === to) return res.status(200).json({ rate: 1, date: day });

  let result = await fetchRate(from, to, day);
  // Heute ist der Kurs evtl. noch nicht veröffentlicht (kommt gegen 16 Uhr): dann der letzte
  if (!result && day === today) result = await fetchRate(from, to, 'latest');
  if (!result) return res.status(502).json({ error: 'rate unavailable' });

  // Vergangene Tage ändern sich nicht mehr: lange zwischenspeichern; heute nur eine Stunde
  res.setHeader('Cache-Control', day < today ? 'public, s-maxage=2592000, max-age=86400' : 'public, s-maxage=3600, max-age=600');
  res.status(200).json(result);
};
