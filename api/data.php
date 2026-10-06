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

    if (!is_array($data)) {
        jsonErr('Kein "data"-Feld im Request.');
    }

    // Nur erlaubte Felder speichern (kein UI-State wie editId etc.)
    $allowed = ['balance', 'budget', 'entries', 'accounts', 'recurringIncome', 'recurringExpense', 'recurringTransfers', 'appliedRecurringMonths', 'customExpenseCats', 'customIncomeCats'];
    $clean = [];
    foreach ($allowed as $key) {
        if (array_key_exists($key, $data)) {
            $clean[$key] = $data[$key];
        }
    }

    // Der Client schickt nur die geänderten Bereiche → mit dem bestehenden
    // Stand zusammenführen statt alles zu ersetzen. Transaktion, damit sich
    // zwei gleichzeitige Requests nicht gegenseitig überschreiben.
    $db->exec('BEGIN IMMEDIATE');
    try {
        $stmt = $db->prepare("SELECT payload FROM user_data WHERE user_id = ?");
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        $existing = $row ? (json_decode($row['payload'], true) ?: []) : [];
        $json = json_encode(array_merge($existing, $clean), JSON_UNESCAPED_UNICODE);

        $db->prepare("
            INSERT OR REPLACE INTO user_data (user_id, payload, updated_at)
            VALUES (?, ?, datetime('now'))
        ")->execute([$userId, $json]);
        $db->exec('COMMIT');
    } catch (Throwable $e) {
        $db->exec('ROLLBACK');
        throw $e;
    }

    jsonOut(['success' => true]);
}

jsonErr('Method not allowed.', 405);