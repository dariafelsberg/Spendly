// ══════════════════════════════════════════════════════════
//  KONTAKTFORMULAR — POST /api/contact
//  Nimmt eine Nachricht aus «Hilfe & Feedback» (settings.html)
//  entgegen und schickt sie über Resend (resend.com) als E-Mail an
//  spendly.help@outlook.com. Antwort-an ist die E-Mail der Person,
//  so kann man in Outlook einfach auf «Antworten» klicken.
//
//  Ablauf:
//  1. Nur eingeloggte Personen: das Supabase-Token wird bei Supabase geprüft.
//  2. Höchstens 5 Nachrichten pro 24 Stunden: ein Eintrag in contact_log
//     (nur Zeitpunkt, kein Text). Die Grenze prüft die Datenbank selbst,
//     siehe supabase/2026-11-24-kontakt.sql.
//  3. Versand über die Resend-API.
//
//  In Vercel (Projekt spendly-app) als Umgebungsvariable eintragen:
//    RESEND_API_KEY  – geheimer Schlüssel von Resend
//  Optional: CONTACT_FROM (Absender), CONTACT_TO (Empfänger)
//
//  Antworten: 200 gesendet · 400 Nachricht fehlt/zu lang · 401 nicht angemeldet
//             429 Tagesgrenze erreicht · 500 nicht eingerichtet · 502 Versand fehlgeschlagen
// ══════════════════════════════════════════════════════════

// Gleiche Werte wie in assets/js/supabase.js (der anon-Key ist öffentlich)
const SUPABASE_URL      = 'https://pniabxirdrrfxyymzynh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuaWFieGlyZHJyZnh5eW16eW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNDI4NTcsImV4cCI6MjEwNzYxODg1N30.28oVu_462OuTnKUOTBPXuf4o6DdQmWAC_w-CZXkPpAM';

const TO   = process.env.CONTACT_TO   || 'spendly.help@outlook.com';
const FROM = process.env.CONTACT_FROM || 'Spendly Kontaktformular <kontakt@spendly.ch>';
const MAX_LEN = 2000;
const TOPICS = { question: 'Frage', bug: 'Fehler', idea: 'Idee', other: 'Sonstiges' };

// Zeilenumbrüche und Steuerzeichen raus (für Betreff und kurze Angaben)
const oneLine = (s, n) => String(s || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'not configured' });

  // ── 1. Anmeldung prüfen
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'not logged in' });
  let user = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (r.ok) user = await r.json();
  } catch (e) { /* unten als nicht angemeldet behandelt */ }
  if (!user || !user.id || !user.email) return res.status(401).json({ error: 'not logged in' });

  // ── Eingaben prüfen
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const topic = TOPICS[body.topic] ? body.topic : 'other';
  const subjectText = oneLine(body.subject, 100);
  const message = String(body.message || '').replace(/\r\n?/g, '\n').trim();
  if (!message) return res.status(400).json({ error: 'empty message' });
  if (message.length > MAX_LEN) return res.status(400).json({ error: 'message too long' });
  const device = body.device && typeof body.device === 'object' ? body.device : null;

  // ── 2. Tagesgrenze: die Datenbank lässt den Eintrag nur zu, wenn es weniger als 5 in 24 h gibt
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/contact_log`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: '{}',
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      // 42501 = Regel verletzt (Grenze erreicht)
      if (err && err.code === '42501') return res.status(429).json({ error: 'limit reached' });
      // Tabelle fehlt noch (SQL nicht ausgeführt): trotzdem senden, aber im Vercel-Log melden
      console.warn('contact_log nicht verfügbar:', r.status, err && (err.code || err.message));
    }
  } catch (e) {
    console.warn('contact_log nicht erreichbar:', String(e));
  }

  // ── 3. E-Mail an Spendly
  const name = oneLine(user.user_metadata && user.user_metadata.username, 60) || '–';
  const lines = [
    message,
    '',
    '──────────',
    `Thema: ${TOPICS[topic]}`,
    `Von: ${name} <${user.email}>`,
    `Gesendet: ${new Date().toLocaleString('de-CH', { timeZone: 'Europe/Zurich' })}`,
  ];
  if (device) {
    lines.push(
      `Sprache: ${oneLine(device.lang, 5)} · Währung: ${oneLine(device.currency, 3)}`,
      `Bildschirm: ${oneLine(device.screen, 20)} · Darstellung: ${oneLine(device.theme, 10)}`,
      `Browser: ${oneLine(device.userAgent, 300)}`,
    );
  } else {
    lines.push('Geräteangaben: nicht mitgesendet');
  }
  // Betreff aus dem Formular; fehlt er (ältere App-Version), die ersten Worte der Nachricht
  const subject = `[Spendly] ${TOPICS[topic]}: ${subjectText || oneLine(message, 60) + (message.length > 60 ? '…' : '')}`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [TO], reply_to: user.email, subject, text: lines.join('\n') }),
    });
    if (!r.ok) {
      console.error('Resend:', r.status, await r.text().catch(() => ''));
      return res.status(502).json({ error: 'send failed' });
    }
  } catch (e) {
    console.error('Resend nicht erreichbar:', String(e));
    return res.status(502).json({ error: 'send failed' });
  }
  return res.status(200).json({ ok: true });
};
