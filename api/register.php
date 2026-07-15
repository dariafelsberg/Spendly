<?php
require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonErr('Method not allowed', 405);
}

$body    = requestBody();
$username = trim($body['username'] ?? '');
$email    = trim($body['email']    ?? '');
$password = $body['password']      ?? '';

// ── Validierung ──────────────────────────────────────────────
if (strlen($username) < 3) {
    jsonErr('Benutzername muss mindestens 3 Zeichen lang sein.');
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    jsonErr('Ungültige E-Mail-Adresse.');
}
if (strlen($password) < 8) {
    jsonErr('Passwort muss mindestens 8 Zeichen lang sein.');
}

$db = getDb();

// ── Duplikat-Check ───────────────────────────────────────────
$stmt = $db->prepare("SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1");
$stmt->execute([$username, $email]);
if ($stmt->fetch()) {
    jsonErr('Benutzername oder E-Mail bereits vergeben.');
}

// ── Passwort hashen (PBKDF2 / SHA-256) ──────────────────────
$iterations = 150000;
$salt       = randomHex(16);                       // 32 Hex-Zeichen = 16 Byte
$rawSalt    = hex2bin($salt);
$rawHash    = hash_pbkdf2('sha256', $password, $rawSalt, $iterations, 32, true);
$hash       = bin2hex($rawHash);

// ── Benutzer speichern ───────────────────────────────────────
$stmt = $db->prepare("
    INSERT INTO users (username, email, salt, hash, iterations)
    VALUES (?, ?, ?, ?, ?)
");
$stmt->execute([$username, $email, $salt, $hash, $iterations]);
$userId = (int) $db->lastInsertId();

// ── Session starten ──────────────────────────────────────────
$token     = randomHex(24);
$expiresAt = date('Y-m-d H:i:s', strtotime('+30 days'));

$db->prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)")
   ->execute([$userId, $token, $expiresAt]);

setcookie('spendly_session', $token, [
    'expires'  => strtotime('+30 days'),
    'path'     => '/',
    'httponly' => true,
    'samesite' => 'Lax',
]);

jsonOut([
    'success'  => true,
    'token'    => $token,
    'username' => $username,
    'email'    => $email,
]);