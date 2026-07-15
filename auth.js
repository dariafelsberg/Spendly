// ══════════════════════════════════════════════════════════
//  AUTH — Anmeldung für Spendly
//  Anmeldung und Passwort-Hashing laufen serverseitig über
//  /api/*.php (PBKDF2, SHA-256, 150'000 Iterationen, zufälliger
//  Salt, siehe api/register.php und api/login.php). Die Session
//  läuft primär über ein httpOnly-Cookie (spendly_session).
//  Die lokalen SESSION_KEY/SESSION_TMP-Einträge hier dienen nur
//  als zusätzlicher Client-Hinweis (z.B. für "Angemeldet
//  bleiben"-UI) und als Brute-Force-Bremse pro Gerät.
// ══════════════════════════════════════════════════════════

const SESSION_KEY    = 'budgetApp_session';    // { token, expires } in localStorage (remember me)
const SESSION_TMP    = 'budgetApp_session';    // gleiche Bezeichnung in sessionStorage (Tab/Browser zu = ausgeloggt)
const ATTEMPTS_KEY    = 'budgetApp_authAttempts'; // { count, lockUntil }
const MAX_ATTEMPTS    = 5;
const LOCK_MS         = 60 * 1000;        // 60s Sperre
const REMEMBER_MS     = 30 * 24 * 3600 * 1000; // 30 Tage

// ── CRYPTO HELPERS ──────────────────────────────────────────
function randomHex(len = 16) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

// ── LOCKOUT / BRUTE-FORCE THROTTLE ─────────────────────────
function getAttempts() {
  try { return JSON.parse(localStorage.getItem(ATTEMPTS_KEY)) || { count: 0, lockUntil: 0 }; }
  catch (e) { return { count: 0, lockUntil: 0 }; }
}
function setAttempts(a) { localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(a)); }
function registerFailedAttempt() {
  const a = getAttempts();
  a.count += 1;
  if (a.count >= MAX_ATTEMPTS) { a.lockUntil = Date.now() + LOCK_MS; a.count = 0; }
  setAttempts(a);
  return a;
}
function clearAttempts() { localStorage.removeItem(ATTEMPTS_KEY); }
function lockRemainingMs() {
  const a = getAttempts();
  return Math.max(0, a.lockUntil - Date.now());
}

// ── SESSION ─────────────────────────────────────────────────
function startSession(remember) {
  const token = randomHex(24);
  if (remember) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token, expires: Date.now() + REMEMBER_MS }));
    sessionStorage.removeItem(SESSION_TMP);
  } else {
    sessionStorage.setItem(SESSION_TMP, JSON.stringify({ token }));
    localStorage.removeItem(SESSION_KEY);
  }
}
function hasValidSession() {
  try {
    if (sessionStorage.getItem(SESSION_TMP)) return true;
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    return !!(s && s.expires && s.expires > Date.now());
  } catch (e) { return false; }
}
function logout() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_TMP);
  fetch('/api/logout.php', { method: 'POST', credentials: 'include' })
    .finally(() => { window.location.href = 'login.html'; });
}

// ── GUARD (für index.html / calendar.html / settings.html) ──
// Wird zusätzlich zum Inline-Guard im <head> aufgerufen, um
// z.B. Profilinfos (Benutzername) in den Einstellungen zu zeigen.
function renderAuthProfile() {
  const nameEl  = document.getElementById('authProfileName');
  const emailEl = document.getElementById('authProfileEmail');
  if (!nameEl || !emailEl) return;
  fetch('/api/verify.php', { credentials: 'include' })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        nameEl.textContent  = d.username || '—';
        emailEl.textContent = d.email    || '—';
      }
    })
    .catch(() => {});
}

// ══════════════════════════════════════════════════════════
//  LOGIN-SEITE: nur aktiv, wenn die entsprechenden Elemente
//  existieren (also auf login.html)
// ══════════════════════════════════════════════════════════
const onLoginPage = !!document.getElementById('loginForm');

if (onLoginPage) {
  initLoginPage();
}

function initLoginPage() {
  switchTab('login');
  updateLockoutUI();
  setInterval(updateLockoutUI, 1000);

  document.getElementById('regPassword').addEventListener('input', updatePwStrength);

  ['resetModal'].forEach(id => {
    const m = document.getElementById(id);
    if (m) m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); });
  });
}

function switchTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tabLogin').classList.toggle('active', isLogin);
  document.getElementById('tabRegister').classList.toggle('active', !isLogin);
  document.getElementById('loginForm').style.display = isLogin ? 'flex' : 'none';
  document.getElementById('registerForm').style.display = isLogin ? 'none' : 'flex';
  document.getElementById('loginError').textContent = '';
  document.getElementById('registerError').textContent = '';

  const notice = document.getElementById('registerExistsNotice');
if (notice) notice.style.display = 'none';
}

function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.textContent = show ? '🙈' : '👁️';
}

function updatePwStrength() {
  const val = document.getElementById('regPassword').value;
  const el = document.getElementById('pwStrength');
  if (!val) { el.textContent = ''; el.className = 'pw-strength'; return; }
  let score = 0;
  if (val.length >= 8) score++;
  if (val.length >= 12) score++;
  if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  const levels = [
    { label: 'Sehr schwach', cls: 'weak' },
    { label: 'Schwach', cls: 'weak' },
    { label: 'Okay', cls: 'medium' },
    { label: 'Gut', cls: 'medium' },
    { label: 'Stark', cls: 'strong' },
    { label: 'Sehr stark', cls: 'strong' },
  ];
  const lvl = levels[Math.min(score, levels.length - 1)];
  el.textContent = lvl.label;
  el.className = 'pw-strength ' + lvl.cls;
}

function updateLockoutUI() {
  const remaining = lockRemainingMs();
  const btn = document.getElementById('loginSubmitBtn');
  const err = document.getElementById('loginError');
  if (remaining > 0) {
    btn.disabled = true;
    err.textContent = `Zu viele Fehlversuche. Bitte in ${Math.ceil(remaining / 1000)}s erneut versuchen.`;
  } else {
    btn.disabled = false;
    if (err.textContent.startsWith('Zu viele')) err.textContent = '';
  }
}

async function handleLogin(event) {

    event.preventDefault();

    // Vor dem Request prüfen, ob aktuell eine Sperre wegen zu vieler
    // Fehlversuche aktiv ist
    if (lockRemainingMs() > 0) {
        updateLockoutUI();
        return;
    }

    const identifier = document.getElementById("loginIdentifier").value;
    const password = document.getElementById("loginPassword").value;
    const remember = document.getElementById("loginRemember")
        ? document.getElementById("loginRemember").checked
        : true;

    const response = await fetch("/api/login.php", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            identifier,
            password,
            remember
        })
    });

    const data = await response.json();

    if (data.success) {
        clearAttempts();
        startSession(remember);
        window.location.href = "index.html";
    } else {
        registerFailedAttempt();
        updateLockoutUI();
        document.getElementById("loginError").textContent =
            "Benutzername oder Passwort falsch";
    }
}

async function handleRegister(event) {

    event.preventDefault();

    const username = document.getElementById("regUsername").value;
    const email = document.getElementById("regEmail").value;
    const password = document.getElementById("regPassword").value;
    const passwordConfirm = document.getElementById("regPasswordConfirm").value;
    const errEl = document.getElementById("registerError");
    const notice = document.getElementById('registerExistsNotice');
    if (notice) notice.style.display = 'none';
    errEl.textContent = '';

    if (password !== passwordConfirm) {
        errEl.textContent = "Passwörter stimmen nicht überein.";
        return;
    }

    const response = await fetch("/api/register.php", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            username,
            email,
            password
        })
    });

    const data = await response.json();

    if (data.success) {
        startSession(true);
        window.location.href = "index.html";
    } else {
        errEl.textContent = data.message;
        if (notice && /bereits vergeben/i.test(data.message || '')) {
            notice.style.display = '';
        }
    }
}

function openResetConfirm() {
  document.getElementById('resetInputStep').style.display = '';
  document.getElementById('resetSentStep').style.display = 'none';
  document.getElementById('resetEmailInput').value = '';
  document.getElementById('resetEmailError').textContent = '';
  document.getElementById('resetModal').classList.add('show');
}

function closeResetConfirm() {
  document.getElementById('resetModal').classList.remove('show');
}

async function sendResetEmail() {
  const email = document.getElementById('resetEmailInput').value.trim();
  const errEl = document.getElementById('resetEmailError');
  const btn   = document.getElementById('resetSendBtn');

  errEl.textContent = '';

  if (!email || !email.includes('@')) {
    errEl.textContent = 'Bitte eine gültige E-Mail-Adresse eingeben.';
    return;
  }

  btn.disabled    = true;
  btn.textContent = '…';

  try {
    await fetch('/api/reset.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'request', email }),
    });
    // Immer Erfolg zeigen (kein User-Enumeration)
    document.getElementById('resetInputStep').style.display = 'none';
    document.getElementById('resetSentStep').style.display = '';
  } catch (e) {
    errEl.textContent = 'Verbindungsfehler. Bitte erneut versuchen.';
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Link senden';
  }
}

// Profilinfos in den Einstellungen befüllen, falls vorhanden
renderAuthProfile();