<?php
require_once __DIR__ . '/config.php';

// Token aus Cookie oder Body
$token = $_COOKIE['spendly_session'] ?? (requestBody()['token'] ?? null);

if ($token) {
    $db = getDb();
    $db->prepare("DELETE FROM sessions WHERE token = ?")
       ->execute([$token]);
}

// Cookie löschen
setcookie('spendly_session', '', [
    'expires'  => time() - 3600,
    'path'     => '/',
    'httponly' => true,
    'samesite' => 'Lax',
]);

jsonOut(['success' => true]);