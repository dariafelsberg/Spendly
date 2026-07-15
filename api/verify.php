<?php
require_once __DIR__ . '/config.php';

$user = currentUser();

if ($user) {
    jsonOut([
        'success'  => true,
        'username' => $user['username'],
        'email'    => $user['email'],
    ]);
} else {
    jsonOut(['success' => false, 'message' => 'Nicht angemeldet.'], 401);
}