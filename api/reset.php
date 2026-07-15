<?php
require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonErr('Method not allowed', 405);
}

$body  = requestBody();
$step  = $body['step'] ?? '';
$db    = getDb();

// Reset-Token-Tabelle anlegen falls nicht vorhanden
$db->exec("
    CREATE TABLE IF NOT EXISTS password_resets (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token      TEXT    NOT NULL UNIQUE,
        expires_at TEXT    NOT NULL,
        used       INTEGER NOT NULL DEFAULT 0,
        created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
");

// ── SCHRITT 1: E-Mail eingeben → Reset-Link senden ───────────
if ($step === 'request') {
    $email = trim($body['email'] ?? '');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonErr('Bitte eine gültige E-Mail-Adresse eingeben.');
    }

    $stmt = $db->prepare("SELECT id, username FROM users WHERE email = ? LIMIT 1");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    // Immer Erfolg zurückgeben – kein User-Enumeration
    if ($user) {
        // Alte Tokens dieses Users löschen
        $db->prepare("DELETE FROM password_resets WHERE user_id = ?")
           ->execute([$user['id']]);

        $token     = randomHex(32); // 64 Hex-Zeichen
        $expiresAt = date('Y-m-d H:i:s', strtotime('+1 hour'));

        $db->prepare("INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)")
           ->execute([$user['id'], $token, $expiresAt]);

        $resetUrl  = 'https://spendly.dfelsberg.sbw.media/reset-password.html?token=' . $token;
        $name      = htmlspecialchars($user['username']);
        $to        = $email;
        $subject   = 'Spendly – Passwort zurücksetzen';
        $message   = "Hallo {$name},\n\n"
                   . "Du hast angefordert, dein Spendly-Passwort zurückzusetzen.\n\n"
                   . "Klicke auf den folgenden Link (gültig für 1 Stunde):\n"
                   . $resetUrl . "\n\n"
                   . "Falls du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren.\n\n"
                   . "Dein Spendly-Team";
        $headers   = "From: noreply@spendly.dfelsberg.sbw.media\r\n"
                   . "Reply-To: noreply@spendly.dfelsberg.sbw.media\r\n"
                   . "Content-Type: text/plain; charset=UTF-8\r\n"
                   . "X-Mailer: PHP/" . PHP_VERSION;

        mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $message, $headers);
    }

    jsonOut(['success' => true]);
}

// ── SCHRITT 2: Token prüfen ───────────────────────────────────
if ($step === 'verify_token') {
    $token = $body['token'] ?? '';
    if (!$token) jsonErr('Token fehlt.', 400);

    $stmt = $db->prepare("
        SELECT pr.id, pr.user_id
        FROM password_resets pr
        WHERE pr.token = ? AND pr.expires_at > datetime('now') AND pr.used = 0
        LIMIT 1
    ");
    $stmt->execute([$token]);
    $row = $stmt->fetch();

    if (!$row) {
        jsonErr('Dieser Link ist ungültig oder abgelaufen.', 401);
    }

    jsonOut(['success' => true]);
}

// ── SCHRITT 3: Neues Passwort speichern ───────────────────────
if ($step === 'reset') {
    $token    = $body['token']    ?? '';
    $password = $body['password'] ?? '';

    if (!$token || strlen($password) < 8) {
        jsonErr('Ungültige Anfrage.');
    }

    $stmt = $db->prepare("
        SELECT id, user_id
        FROM password_resets
        WHERE token = ? AND expires_at > datetime('now') AND used = 0
        LIMIT 1
    ");
    $stmt->execute([$token]);
    $row = $stmt->fetch();

    if (!$row) {
        jsonErr('Dieser Link ist ungültig oder abgelaufen.', 401);
    }

    $userId     = (int) $row['user_id'];
    $iterations = 150000;
    $salt       = randomHex(16);
    $rawSalt    = hex2bin($salt);
    $rawHash    = hash_pbkdf2('sha256', $password, $rawSalt, $iterations, 32, true);
    $hash       = bin2hex($rawHash);

    $db->prepare("UPDATE users SET salt = ?, hash = ?, iterations = ? WHERE id = ?")
       ->execute([$salt, $hash, $iterations, $userId]);

    // Token als benutzt markieren + alle Sessions löschen
    $db->prepare("UPDATE password_resets SET used = 1 WHERE id = ?")
       ->execute([$row['id']]);
    $db->prepare("DELETE FROM sessions WHERE user_id = ?")
       ->execute([$userId]);

    jsonOut(['success' => true]);
}

jsonErr('Ungültiger Schritt.');