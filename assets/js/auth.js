// ══════════════════════════════════════════════════════════
//  AUTH — Anmeldung für Spendly
//  Anmeldung, Registrierung und Passwort-Reset laufen über
//  Supabase Auth (Client: sb, siehe assets/js/supabase.js).
//  Passwörter speichert Supabase nur als bcrypt-Hash.
//  "Angemeldet bleiben" bestimmt, ob die Sitzung im localStorage
//  oder nur im sessionStorage liegt. Die Fehlversuch-Sperre hier
//  ist eine zusätzliche Bremse pro Gerät.
// ══════════════════════════════════════════════════════════

const ATTEMPTS_KEY    = 'budgetApp_authAttempts'; // { count, lockUntil }
const MAX_ATTEMPTS    = 5;
const LOCK_MS         = 60 * 1000;        // 60s Sperre

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
function logout() {
  sb.auth.signOut()
    .catch(() => {})
    .finally(() => {
      // Offline schlägt signOut() fehl und lässt die Sitzung liegen →
      // lokal gespeicherte Sitzung in jedem Fall entfernen
      _authStorage.removeItem(SB_STORAGE_KEY);
      // Auch aus den eingebetteten Einstellungen (iframe) die ganze Seite umleiten
      window.top.location.href = 'login.html';
    });
}

// ── PROFIL (Einstellungen) ──────────────────────────────────
// ── ACCOUNT BEARBEITEN (Einstellungen) ──────────────────────
// Der Benutzername liegt in den Metadaten des Logins. Die E-Mail-Adresse
// wird nur angezeigt: Sie ist das Login und lässt sich hier nicht ändern.
function updateProfileAvatar() {
  const name = document.getElementById('profileUsername').value.trim();
  document.getElementById('profileAvatar').textContent = name.charAt(0).toUpperCase();
}
function openProfileModal() {
  document.getElementById('profileError').textContent = '';
  document.getElementById('profileUsername').value = '';
  document.getElementById('profileEmail').value = '';
  updateProfileAvatar();
  document.getElementById('profileModal').classList.add('show');
  sb.auth.getSession()
    .then(({ data }) => {
      const user = data.session && data.session.user;
      if (!user) return;
      document.getElementById('profileUsername').value = (user.user_metadata && user.user_metadata.username) || '';
      document.getElementById('profileEmail').value = user.email || '';
      updateProfileAvatar();
    })
    .catch(() => {});
}
function closeProfileModal() {
  document.getElementById('profileModal').classList.remove('show');
}
function saveProfile() {
  const username = document.getElementById('profileUsername').value.trim();
  const btn = document.getElementById('profileSaveBtn');
  const errEl = document.getElementById('profileError');
  errEl.textContent = '';
  if (username.length < 3) {
    errEl.textContent = 'Der Benutzername braucht mindestens 3 Zeichen.';
    return;
  }
  btn.disabled = true;
  sb.auth.updateUser({ data: { username } })
    .then(({ error }) => {
      if (error) throw error;
      renderAuthProfile();
      closeProfileModal();
      showToast('Gespeichert');
    })
    .catch(() => {
      errEl.textContent = 'Das hat nicht geklappt. Bitte prüfe deine Verbindung und versuche es erneut.';
    })
    .finally(() => { btn.disabled = false; });
}

// ── SPENDLY-KONTO LÖSCHEN (Einstellungen) ───────────────────
// Die Datenbankfunktion delete_my_account() löscht das Login; die Daten in
// user_data werden dadurch mitgelöscht (siehe supabase/schema.sql).
function _deleteAccountInput() { return document.getElementById('deleteAccountInput'); }
function updateDeleteAccountBtn() {
  document.getElementById('deleteAccountBtn').disabled = _deleteAccountInput().value.trim().toUpperCase() !== 'LÖSCHEN';
}
function openDeleteAccountModal() {
  _deleteAccountInput().value = '';
  document.getElementById('deleteAccountError').textContent = '';
  updateDeleteAccountBtn();
  document.getElementById('deleteAccountModal').classList.add('show');
}
function closeDeleteAccountModal() {
  document.getElementById('deleteAccountModal').classList.remove('show');
}
function confirmDeleteAccount() {
  const btn = document.getElementById('deleteAccountBtn');
  const errEl = document.getElementById('deleteAccountError');
  btn.disabled = true;
  errEl.textContent = '';
  sb.rpc('delete_my_account')
    .then(({ error }) => {
      if (error) throw error;
      // Lokale Kopie entfernen. budgetApp_owner bleibt absichtlich stehen: So
      // wird ein Rest der Daten nie in ein später erstelltes Konto hochgeladen.
      ['budgetApp_v2', 'budgetApp_unsynced', 'spendly_lastEntry', 'spendly_hideBalance'].forEach(k => {
        try { localStorage.removeItem(k); } catch (e) {}
      });
      _authStorage.removeItem(SB_STORAGE_KEY);
      window.top.location.href = 'login.html';
    })
    .catch(() => {
      errEl.textContent = 'Das Konto konnte nicht gelöscht werden. Bitte prüfe deine Verbindung und versuche es erneut.';
      btn.disabled = false;
    });
}

// Der Seitenschutz läuft über requireLogin() im <head>; hier werden
// nur Benutzername und E-Mail in den Einstellungen angezeigt.
function renderAuthProfile() {
  const nameEl  = document.getElementById('authProfileName');
  const emailEl = document.getElementById('authProfileEmail');
  if (!nameEl || !emailEl) return;
  sb.auth.getSession()
    .then(({ data }) => {
      const user = data.session && data.session.user;
      if (!user) return;
      nameEl.textContent  = (user.user_metadata && user.user_metadata.username) || '…';
      emailEl.textContent = user.email || '…';
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
  btn.innerHTML = `<span class="ico ico-${show ? 'eye_closed' : 'eye_open'}"></span>`;
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

    const email = document.getElementById("loginIdentifier").value.trim();
    const password = document.getElementById("loginPassword").value;
    const remember = document.getElementById("loginRemember")
        ? document.getElementById("loginRemember").checked
        : true;
    const errEl = document.getElementById("loginError");
    errEl.textContent = '';

    if (!email.includes('@')) {
        errEl.textContent = "Bitte mit deiner E-Mail-Adresse anmelden.";
        return;
    }

    // Vor dem Anmelden setzen: bestimmt, wo supabase-js die Sitzung ablegt
    setRememberLogin(remember);

    let result;
    try {
        result = await sb.auth.signInWithPassword({ email, password });
    } catch (e) {
        errEl.textContent = "Verbindungsfehler. Bitte erneut versuchen.";
        return;
    }

    if (!result.error) {
        clearAttempts();
        window.location.href = "index.html";
    } else if (!result.error.status) {
        // supabase-js meldet Netzwerkfehler als Fehler ohne HTTP-Status
        errEl.textContent = "Verbindungsfehler. Bitte erneut versuchen.";
    } else if (result.error.code === 'email_not_confirmed') {
        errEl.textContent =
            "Bitte bestätige zuerst deine E-Mail-Adresse über den Link, den wir dir geschickt haben.";
    } else {
        registerFailedAttempt();
        updateLockoutUI();
        errEl.textContent = "E-Mail oder Passwort falsch";
    }
}

async function handleRegister(event) {

    event.preventDefault();

    const username = document.getElementById("regUsername").value.trim();
    const email = document.getElementById("regEmail").value.trim();
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

    setRememberLogin(true);

    let result;
    try {
        result = await sb.auth.signUp({
            email,
            password,
            options: {
                // Benutzername nur als Anzeigename, angemeldet wird mit E-Mail
                data: { username },
                emailRedirectTo: window.location.origin + '/index.html'
            }
        });
    } catch (e) {
        errEl.textContent = "Verbindungsfehler. Bitte erneut versuchen.";
        return;
    }

    const { data, error } = result;
    if (error) {
        if (error.code === 'user_already_exists') {
            errEl.textContent = "Diese E-Mail-Adresse ist bereits vergeben.";
            if (notice) notice.style.display = '';
        } else if (error.code === 'weak_password') {
            errEl.textContent = "Passwort ist zu schwach. Bitte ein längeres Passwort wählen.";
        } else {
            errEl.textContent = error.message || "Registrierung fehlgeschlagen.";
        }
        return;
    }

    if (data.session) {
        // E-Mail-Bestätigung ist ausgeschaltet → direkt angemeldet
        window.location.href = "index.html";
        return;
    }

    // E-Mail-Bestätigung ist aktiv. Bei bereits registrierter Adresse liefert
    // Supabase einen Benutzer ohne Identitäten zurück (ohne Fehler).
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        errEl.textContent = "Diese E-Mail-Adresse ist bereits vergeben.";
        if (notice) notice.style.display = '';
        return;
    }
    errEl.textContent =
        "Fast geschafft! Wir haben dir eine E-Mail geschickt. Bitte bestätige deine Adresse über den Link und melde dich dann an.";
}

function openResetConfirm() {
  document.getElementById('resetInputStep').style.display = '';
  document.getElementById('resetSentStep').style.display = 'none';
  document.getElementById('resetEmailInput').value = '';
  document.getElementById('resetEmailError').textContent = '';
  const m = document.getElementById('resetModal');
  _resetReturnFocus = document.activeElement;
  m.classList.add('show');
  m.querySelector('.modal').focus({ preventScroll: true }); // Fokus ins Fenster, damit Tab dort startet
}

function closeResetConfirm() {
  document.getElementById('resetModal').classList.remove('show');
  if (_resetReturnFocus && _resetReturnFocus.focus) _resetReturnFocus.focus({ preventScroll: true });
}
// Tastatur im Fenster "Passwort zurücksetzen" (Login-Seite lädt main.js nicht):
// Escape schliesst, Tab bleibt im Fenster
let _resetReturnFocus = null;
document.addEventListener('keydown', e => {
  const m = document.getElementById('resetModal');
  if (!m || !m.classList.contains('show')) return;
  if (e.key === 'Escape') { closeResetConfirm(); return; }
  if (e.key !== 'Tab') return;
  const items = [...m.querySelectorAll('button, input')].filter(el => !el.disabled && el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && (document.activeElement === first || !m.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (document.activeElement === last || !m.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
});

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
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password.html',
    });
    if (error && error.status === 429) {
      errEl.textContent = 'Zu viele Anfragen. Bitte in ein paar Minuten erneut versuchen.';
      return;
    }
    // Sonst immer Erfolg zeigen (kein User-Enumeration)
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
