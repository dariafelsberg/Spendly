<?php
require_once __DIR__ . '/config.php';

// Datentabelle anlegen falls nicht vorhanden
$db = getDb();
$db->exec("
    CREATE TABLE IF NOT EXISTS user_data (
        user_id   INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        payload   TEXT    NOT NULL DEFAULT '{}',
        updated_at TEXT   NOT NULL DEFAULT (datetime('now'))
    )
");

// Session prüfen
$user = currentUser();
if (!$user) {
    jsonErr('Nicht angemeldet.', 401);
}

$userId = (int) $user['id'];

// ── GET: Daten laden ─────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $db->prepare("SELECT payload FROM user_data WHERE user_id = ?");
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    $payload = $row ? json_decode($row['payload'], true) : [];
    jsonOut(['success' => true, 'data' => $payload ?: (object)[]]);
}

// ── POST: Daten speichern ────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = requestBody();
    $data = $body['data'] ?? null;

    if ($data === null) {
        jsonErr('Kein "data"-Feld im Request.');
    }

    // Nur erlaubte Felder speichern (kein UI-State wie editId etc.)
    $allowed = ['balance', 'budget', 'entries', 'accounts', 'recurringIncome', 'recurringExpense', 'appliedRecurringMonths'];
    $clean = [];
    foreach ($allowed as $key) {
        if (array_key_exists($key, $data)) {
            $clean[$key] = $data[$key];
        }
    }

    $json = json_encode($clean, JSON_UNESCAPED_UNICODE);

    $db->prepare("
        INSERT OR REPLACE INTO user_data (user_id, payload, updated_at)
        VALUES (?, ?, datetime('now'))
    ")->execute([$userId, $json]);

    jsonOut(['success' => true]);
}

jsonErr('Method not allowed.', 405);