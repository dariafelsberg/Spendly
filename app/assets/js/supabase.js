// ══════════════════════════════════════════════════════════
//  SUPABASE — Verbindung zu Anmeldung (Supabase Auth) und
//  Datenbank (Tabelle public.user_data, siehe supabase/schema.sql).
//  Muss NACH der supabase-js-Bibliothek und VOR auth.js / main.js
//  geladen werden.
// ══════════════════════════════════════════════════════════

// Werte aus Supabase-Dashboard → Project Settings → API.
// Der anon-Key ist öffentlich (steckt in jeder Web-App), der Schutz
// der Daten läuft über Row Level Security in der Datenbank.
const SUPABASE_URL      = 'https://pniabxirdrrfxyymzynh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuaWFieGlyZHJyZnh5eW16eW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNDI4NTcsImV4cCI6MjEwNzYxODg1N30.28oVu_462OuTnKUOTBPXuf4o6DdQmWAC_w-CZXkPpAM';

// ── SPEICHER FÜR DIE SITZUNG ────────────────────────────────
// "Angemeldet bleiben" an → localStorage (bleibt nach Browser-Neustart),
// sonst sessionStorage (Tab/Browser zu = ausgeloggt).
const REMEMBER_KEY   = 'spendly_remember';
const SB_STORAGE_KEY = 'spendly_auth';

function setRememberLogin(remember) {
  try { localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0'); } catch (e) {}
}
function _rememberLogin() {
  try { return localStorage.getItem(REMEMBER_KEY) !== '0'; } catch (e) { return true; }
}

const _authStorage = {
  getItem(key) {
    try { return sessionStorage.getItem(key) ?? localStorage.getItem(key); }
    catch (e) { return null; }
  },
  setItem(key, value) {
    try {
      if (_rememberLogin()) { localStorage.setItem(key, value); sessionStorage.removeItem(key); }
      else                  { sessionStorage.setItem(key, value); localStorage.removeItem(key); }
    } catch (e) {}
  },
  removeItem(key) {
    try { localStorage.removeItem(key); sessionStorage.removeItem(key); } catch (e) {}
  },
};

// URL-Fragment vor dem Einlesen durch supabase-js merken (z.B. type=recovery
// beim Passwort-Reset-Link), weil die Bibliothek es danach aus der URL entfernt.
const SB_INITIAL_HASH = window.location.hash;

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: _authStorage,
    storageKey: SB_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Aktuelles Access-Token zwischenspeichern, damit main.js beim Speichern
// synchron (fetch mit keepalive) darauf zugreifen kann.
let sbAccessToken = null;
let sbUserId      = null;
sb.auth.onAuthStateChange((event, session) => {
  sbAccessToken = session ? session.access_token : null;
  sbUserId      = session ? session.user.id      : null;
});

// Leitet auf login.html um, wenn keine gültige Sitzung besteht (immer die
// ganze Seite, auch aus den eingebetteten Einstellungen).
// Gibt die Sitzung zurück (oder null).
function requireLogin() {
  return sb.auth.getSession()
    .then(({ data }) => {
      if (!data.session) { window.top.location.replace('login.html'); return null; }
      return data.session;
    })
    .catch(() => { window.top.location.replace('login.html'); return null; });
}
