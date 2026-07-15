<?php
// ── CONFIG ──────────────────────────────────────────────────
// SQLite-Datenbankpfad (eine Ebene über dem Web-Root empfohlen)
define('DB_PATH', __DIR__ . '/../database.sqlite');

// CORS / JSON-Header für alle API-Endpunkte
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

// Einfache CORS-Regel – bei Bedarf auf deine Domain einschränken
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
header('Access-Control-Allow-Origin: ' . ($origin ?: '*'));
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── DB-VERBINDUNG ────────────────────────────────────────────
function getDb(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;

    $pdo = new PDO('sqlite:' . DB_PATH);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA journal_mode=WAL');
    $pdo->exec('PRAGMA foreign_keys=ON');

    // Tabelle anlegen falls noch nicht vorhanden
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            username    TEXT    NOT NULL UNIQUE COLLATE NOCASE,
            email       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
            salt        TEXT    NOT NULL,
            hash        TEXT    NOT NULL,
            iterations  INTEGER NOT NULL DEFAULT 150000,
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS sessions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token       TEXT    NOT NULL UNIQUE,
            expires_at  TEXT    NOT NULL,
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    ");

    return $pdo;
}

// ── HILFSFUNKTIONEN ─────────────────────────────────────────
function jsonOut(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function jsonErr(string $message, int $status = 400): never {
    jsonOut(['success' => false, 'message' => $message], $status);
}

function requestBody(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function randomHex(int $bytes = 24): string {
    return bin2hex(random_bytes($bytes));
}

// Session aus Cookie oder Body lesen und validieren
function currentUser(): ?array {
    $db = getDb();
    $token = $_COOKIE['spendly_session'] ?? requestBody()['token'] ?? null;
    if (!$token) return null;

    $stmt = $db->prepare("
        SELECT u.id, u.username, u.email
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > datetime('now')
        LIMIT 1
    ");
    $stmt->execute([$token]);
    return $stmt->fetch() ?: null;
}