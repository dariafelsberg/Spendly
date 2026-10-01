# Spendly

Persönliche Finanz-PWA (Budget, Kalender, Analyse, Einstellungen) mit PHP-Backend auf sbw.media.

## Ordnerstruktur

```
Spendly/
├── index.html              Startseite (Einstiegspunkt der PWA, muss im Root bleiben)
├── calendar.html           Kalender
├── analyse.html            Analyse
├── settings.html           Einstellungen
├── login.html              Login / Registrierung
├── reset-password.html     Passwort zurücksetzen (Link wird in api/reset.php verschickt)
├── manifest.json           PWA-Manifest
├── .htaccess               Zugriffsschutz (.sqlite, .git)
├── .gitignore
├── database.sqlite         Laufzeit-Datenbank (nicht in Git, nur auf dem Server)
│
├── api/                    PHP-Backend (config, login, register, verify, data, reset, logout)
│
└── assets/
    ├── css/
    │   ├── main.css        gemeinsame Styles (Tokens, Reset, App-Shell, Menü, Karten, Listen, Modals, Breakpoints)
    │   ├── auth.css        Login / Reset / Profil
    │   └── pages/          index.css · calendar.css · analyse.css · settings.css
    ├── js/
    │   ├── main.js         gemeinsamer Code (State, Speichern/Laden, Wiederkehrendes, App-Menü, Helper)
    │   ├── auth.js         Login, Registrierung, Session
    │   └── pages/          index.js · calendar.js · analyse.js · settings.js
    └── icons/              PWA-Icons
```

## Ladereihenfolge

Jede Seite lädt zuerst `main.css` / `main.js`, danach ihre eigene Datei aus `pages/`.
Die Seitendatei meldet ihre Render-Funktion mit `registerPageRender(...)` an, damit
`main.js` nach dem Laden der Server-Daten die richtige Ansicht neu zeichnet.

## Regeln

- Gilt ein Style oder eine Funktion für mehrere Seiten, gehört sie in `main.*`, sonst in `pages/<seite>.*`.
- Neue Seite: `<name>.html` im Root, dazu `assets/css/pages/<name>.css` und `assets/js/pages/<name>.js`.
- `database.sqlite` nie committen oder überschreiben, sonst gehen die Server-Daten verloren.
