<?php
require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonErr('Method not allowed', 405);
}

$body       = requestBody();
$identifier = trim($body['identifier'] ?? '');  // E-Mail oder Benutzername
$password   = $body['password']        ?? '';
$remember   = !empty($body['remember']);

if ($identifier === '' || $password === '') {
    jsonErr('Bitte alle Felder ausfüllen.');
}

$db = getDb();

// ── Benutzer suchen (nach E-Mail oder Benutzername) ──────────
$stmt = $db->prepare("
    SELECT id, username, email, salt, hash, iterations
    FROM users
    WHERE username = ? OR email = ?
    LIMIT 1
");
$stmt->execute([$identifier, $identifier]);
$user = $stmt->fetch();

if (!$user) {
    // Gleiche Fehlermeldung wie bei falschem Passwort (kein User-Enumeration)
    jsonErr('Benutzername oder Passwort falsch.', 401);
}

// ── Passwort prüfen ──────────────────────────────────────────
$rawSalt    = hex2bin($user['salt']);
$iterations = (int) $user['iterations'];
$rawHash    = hash_pbkdf2('sha256', $password, $rawSalt, $iterations, 32, true);
$hash       = bin2hex($rawHash);

if (!hash_equals($user['hash'], $hash)) {
    jsonErr('Benutzername oder Passwort falsch.', 401);
}

// ── Session erstellen ────────────────────────────────────────
$token     = randomHex(24);
$days      = $remember ? 30 : 1;
$expiresAt = date('Y-m-d H:i:s', strtotime("+{$days} days"));

// Alte Sessions dieses Users aufräumen (optional, verhindert unbegrenztes Wachstum)
$db->prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at < datetime('now')")
   ->execute([$user['id']]);

$db->prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)")
   ->execute([$user['id'], $token, $expiresAt]);

setcookie('spendly_session', $token, [
    'expires'  => strtotime("+{$days} days"),
    'path'     => '/',
    'httponly' => true,
    'samesite' => 'Lax',
]);

jsonOut([
    'success'  => true,
    'token'    => $token,
    'username' => $user['username'],
    'email'    => $user['email'],
]);