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
│   ├── api/rates.js        Wechselkurse (EZB über Frankfurter), für Einträge in fremder Währung
│   └── assets/
│       ├── css/            main.css, auth.css, fonts.css, pages/
│       ├── js/             theme.js, i18n.js, main.js, supabase.js, auth.js, pages/
│       ├── i18n/           Wörterbücher fr.js, it.js, en.js, nl.js (Schlüssel = deutscher Text)
│       ├── fonts/          DM Sans, DM Serif Display (lokal)
│       └── icons/          PWA-Icons, Logo, ui/
│
├── landingpage/            Werbeseite für spendly.ch (eigenes Vercel-Projekt, Root Directory «landingpage»)
│   ├── index.html          Quelle (Deutsch). Nicht direkt ausgeliefert, spendly.ch/ leitet weiter
│   ├── de/ fr/ it/ en/ nl/ Sprachversionen, erzeugt von i18n/build.py (nicht von Hand ändern)
│   ├── i18n/               build.py und texte.txt (Übersetzungen), wird nicht veröffentlicht
│   ├── vercel.json         Weiterleitung von / nach Cookie bzw. Browsersprache, Sicherheits-Header
│   └── assets/
│
├── supabase/
│   ├── schema.sql          Tabelle user_data, RLS-Regeln und RPC save_user_data (einmal im SQL Editor ausführen)
│   ├── 2026-11-22-sprache-waehrung.sql   Nachtrag: Sprache und Hauptwährung im Account speichern
│   └── email-templates/
│
└── .github/workflows/backup.yml   Wöchentliches verschlüsseltes Backup
```

## Ladereihenfolge

Jede Seite lädt zuerst `main.css` / `main.js`, danach ihre eigene Datei aus `pages/`.
Die Seitendatei meldet ihre Render-Funktion mit `registerPageRender(...)` an, damit
`main.js` nach dem Laden der Daten aus Supabase die richtige Ansicht neu zeichnet.

## Sprachen und Währungen

- **App:** Deutsch ist die Quellsprache, alle Texte stehen deutsch im Code. `i18n.js` lädt das Wörterbuch der gewählten Sprache und übersetzt HTML automatisch; in JS `t('Text {wert}', { wert })`. Neuer Text: deutsch schreiben und in allen vier Wörterbüchern ergänzen. Rechtstexte (`data-no-i18n`) bleiben deutsch.
- **Beträge:** `money(n)` und `formatNum(n)` aus `main.js`, nie selbst formatieren. Hauptwährung `cur()` (Einstellungen). Ein Eintrag in fremder Währung speichert `amount` in der Hauptwährung (inkl. Auslandgebühr des Kontos) und dazu `fx = { cur, amt, rate, rateDate, fee, feePct }`.
- **Landingpage:** nur `landingpage/index.html` und `landingpage/i18n/texte.txt` ändern, danach `python landingpage/i18n/build.py` ausführen. Fehlt eine Übersetzung, bricht das Skript ab und nennt den Text.
- **E-Mails** von Supabase sind englisch (`supabase/email-templates/`).

## Regeln

- Gilt ein Style oder eine Funktion für mehrere Seiten, gehört sie in `main.*`, sonst in `pages/<seite>.*`.
- Neue Seite: `app/<name>.html`, dazu `app/assets/css/pages/<name>.css` und `app/assets/js/pages/<name>.js`.
- Die App-Seiten laden im `<head>` `theme.js`, dann `i18n.js`, danach supabase-js (jsDelivr) und `assets/js/supabase.js` und rufen `requireLogin()` auf.

## Supabase einrichten

1. `supabase/schema.sql` im Supabase-Dashboard unter **SQL Editor** ausführen.
2. In `app/assets/js/supabase.js` `SUPABASE_URL` und `SUPABASE_ANON_KEY` eintragen (Project Settings → API).
3. **Authentication → URL Configuration**: Site URL `https://app.spendly.ch`, Redirect URLs `https://app.spendly.ch/**` und die `*.vercel.app`-URL.
4. Alte Daten vom PHP-Server: Import-Skript (aus der alten `database.sqlite` erzeugt, nicht im Repo) im SQL Editor ausführen. Beim ersten Login mit bestätigter, gleicher E-Mail-Adresse übernimmt `claim_legacy_data()` die Daten ins neue Konto.
