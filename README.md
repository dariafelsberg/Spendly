# Spendly

Persönliche Finanz-PWA (Budget, Kalender, Analyse, Einstellungen) als statische Seiten (Hosting: Vercel, app.spendly.ch) mit Supabase für Anmeldung und Datenspeicherung.

## Ordnerstruktur

```
Spendly/
├── app/                    Die App (Vercel-Projekt spendly-app, Root Directory «app», app.spendly.ch)
│   ├── index.html          Startseite (Einstiegspunkt der PWA, muss in app/ ganz oben bleiben)
│   ├── calendar.html       Kalender
│   ├── analyse.html        Analyse
│   ├── settings.html       Einstellungen
│   ├── account.html        Account
│   ├── login.html          Login / Registrierung
│   ├── reset-password.html Passwort zurücksetzen (Link verschickt Supabase Auth)
│   ├── datenschutz.html · impressum.html · nutzungsbedingungen.html
│   ├── manifest.json       PWA-Manifest
│   ├── vercel.json         Sicherheits-Header und täglicher Keepalive (Cron)
│   ├── api/keepalive.js    Supabase-Wecker
│   └── assets/
│       ├── css/            main.css, auth.css, fonts.css, pages/
│       ├── js/             main.js, supabase.js, auth.js, pages/
│       ├── fonts/          DM Sans, DM Serif Display (lokal)
│       └── icons/          PWA-Icons, Logo, ui/
│
├── landingpage/            Werbeseite für spendly.ch (eigenes Vercel-Projekt, Root Directory «landingpage»)
│   ├── index.html
│   ├── vercel.json
│   └── assets/fonts/
│
├── supabase/
│   ├── schema.sql          Tabelle user_data, RLS-Regeln und RPC save_user_data (einmal im SQL Editor ausführen)
│   └── email-templates/
│
└── .github/workflows/backup.yml   Wöchentliches verschlüsseltes Backup
```

## Ladereihenfolge

Jede Seite lädt zuerst `main.css` / `main.js`, danach ihre eigene Datei aus `pages/`.
Die Seitendatei meldet ihre Render-Funktion mit `registerPageRender(...)` an, damit
`main.js` nach dem Laden der Daten aus Supabase die richtige Ansicht neu zeichnet.

## Regeln

- Gilt ein Style oder eine Funktion für mehrere Seiten, gehört sie in `main.*`, sonst in `pages/<seite>.*`.
- Neue Seite: `app/<name>.html`, dazu `app/assets/css/pages/<name>.css` und `app/assets/js/pages/<name>.js`.
- Die App-Seiten laden im `<head>` zuerst supabase-js (jsDelivr) und `assets/js/supabase.js` und rufen `requireLogin()` auf.

## Supabase einrichten

1. `supabase/schema.sql` im Supabase-Dashboard unter **SQL Editor** ausführen.
2. In `app/assets/js/supabase.js` `SUPABASE_URL` und `SUPABASE_ANON_KEY` eintragen (Project Settings → API).
3. **Authentication → URL Configuration**: Site URL `https://app.spendly.ch`, Redirect URLs `https://app.spendly.ch/**` und die `*.vercel.app`-URL.
4. Alte Daten vom PHP-Server: Import-Skript (aus der alten `database.sqlite` erzeugt, nicht im Repo) im SQL Editor ausführen. Beim ersten Login mit bestätigter, gleicher E-Mail-Adresse übernimmt `claim_legacy_data()` die Daten ins neue Konto.
