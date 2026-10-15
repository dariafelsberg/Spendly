# Spendly

Persönliche Finanz-PWA (Budget, Kalender, Analyse, Einstellungen) als statische Seiten (Hosting: Vercel, app.spendly.ch) mit Supabase für Anmeldung und Datenspeicherung.

## Ordnerstruktur

```
Spendly/
├── index.html              Startseite (Einstiegspunkt der PWA, muss im Root bleiben)
├── calendar.html           Kalender
├── analyse.html            Analyse
├── settings.html           Einstellungen
├── login.html              Login / Registrierung
├── reset-password.html     Passwort zurücksetzen (Link verschickt Supabase Auth)
├── manifest.json           PWA-Manifest
├── .gitignore
│
├── supabase/
│   └── schema.sql          Tabelle user_data, RLS-Regeln und RPC save_user_data (einmal im SQL Editor ausführen)
│
└── assets/
    ├── css/
    │   ├── main.css        gemeinsame Styles (Tokens, Reset, App-Shell, Menü, Karten, Listen, Modals, Breakpoints)
    │   ├── auth.css        Login / Reset / Profil
    │   └── pages/          index.css · calendar.css · analyse.css · settings.css
    ├── js/
    │   ├── main.js         gemeinsamer Code (State, Speichern/Laden, Wiederkehrendes, App-Menü, Helper)
    │   ├── supabase.js     Supabase-Client (URL + anon-Key), requireLogin()
    │   ├── auth.js         Login, Registrierung, Passwort-Reset
    │   └── pages/          index.js · calendar.js · analyse.js · settings.js
    └── icons/              PWA-Icons
```

## Ladereihenfolge

Jede Seite lädt zuerst `main.css` / `main.js`, danach ihre eigene Datei aus `pages/`.
Die Seitendatei meldet ihre Render-Funktion mit `registerPageRender(...)` an, damit
`main.js` nach dem Laden der Daten aus Supabase die richtige Ansicht neu zeichnet.

## Regeln

- Gilt ein Style oder eine Funktion für mehrere Seiten, gehört sie in `main.*`, sonst in `pages/<seite>.*`.
- Neue Seite: `<name>.html` im Root, dazu `assets/css/pages/<name>.css` und `assets/js/pages/<name>.js`.
- Die App-Seiten laden im `<head>` zuerst supabase-js (jsDelivr) und `assets/js/supabase.js` und rufen `requireLogin()` auf.

## Supabase einrichten

1. `supabase/schema.sql` im Supabase-Dashboard unter **SQL Editor** ausführen.
2. In `assets/js/supabase.js` `SUPABASE_URL` und `SUPABASE_ANON_KEY` eintragen (Project Settings → API).
3. **Authentication → URL Configuration**: Site URL `https://app.spendly.ch`, Redirect URLs `https://app.spendly.ch/**` und die `*.vercel.app`-URL.
