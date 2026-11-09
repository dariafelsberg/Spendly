// ══════════════════════════════════════════════════════════
//  SUPABASE-WECKER — wird von Vercel Cron täglich
//  aufgerufen (siehe vercel.json) und stupst die Datenbank an,
//  damit Supabase das Gratis-Projekt nicht wegen Inaktivität
//  pausiert oder schlafen legt (Nov. 2026: trotz Aufruf alle 3 Tage passiert, darum täglich).
//  Gleiche Werte wie in assets/js/supabase.js. Der anon-Key ist
//  öffentlich, dank Row Level Security sieht die Abfrage keine Daten.
// ══════════════════════════════════════════════════════════

const SUPABASE_URL      = 'https://pniabxirdrrfxyymzynh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuaWFieGlyZHJyZnh5eW16eW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNDI4NTcsImV4cCI6MjEwNzYxODg1N30.28oVu_462OuTnKUOTBPXuf4o6DdQmWAC_w-CZXkPpAM';

module.exports = async (req, res) => {
  // Nur Vercel Cron darf den Wecker auslösen: Ist in Vercel die Umgebungsvariable
  // CRON_SECRET gesetzt, schickt Vercel sie mit, alle anderen Aufrufe werden abgewiesen.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false });
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_data?select=user_id&limit=1`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    const body = await r.json().catch(() => null);
    // anon hat kein SELECT-Recht auf user_data – "permission denied" (42501) ist die erwartete Antwort und heisst: Postgres wurde erreicht.
    const ok = r.ok || ((r.status === 401 || r.status === 403) && body?.code === '42501');
    res.status(ok ? 200 : 502).json({ ok, supabase: r.status, at: new Date().toISOString() });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e) });
  }
};
