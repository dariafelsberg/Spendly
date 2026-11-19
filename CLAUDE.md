# CLAUDE.md

Spendly ist eine Budget-PWA für die Schweiz (Handy, Tablet, Computer). Statische HTML/CSS/JS-Seiten ohne Build-Schritt, Daten und Anmeldung über Supabase, Hosting auf Vercel.

## Aufbau

- `app/` – die App, Vercel-Projekt `spendly-app`, https://app.spendly.ch
- `landingpage/` – Werbeseite, Vercel-Projekt `spendly-landingpage`, https://spendly.ch (eine Datei `index.html`, Bilder/Videos/Schriften in `assets/`)
- `supabase/` – `schema.sql` (Tabelle `user_data`, RLS, RPC `save_user_data`), E-Mail-Vorlagen
- `.github/workflows/backup.yml` – wöchentliches verschlüsseltes Backup

Details zu Seiten und Ladereihenfolge: `README.md`.

## Gestaltung

**Vor jeder UI-Arbeit `DESIGN.md` lesen.** Kurzfassung:

- Farben, Schriftgrössen, Radien und Abstände nur über CSS-Variablen (`app/assets/css/main.css` `:root`), nie Rohwerte.
- Eine Akzentfarbe: Spendly-Pink. Keine Verläufe.
- Schriften: DM Serif Display (Titel, nie fett) und DM Sans, lokal ausgeliefert.
- Icons: nur die eigenen aus `app/assets/icons/ui/`. Nie Lucide oder andere Sammlungen, keine Emoji als Icons.
- Neue Farben auch im Dunkelmodus (`:root[data-theme="dark"]`) festlegen.
- Skill `frontend-design` für UI-Arbeit nutzen.

## Code-Regeln

- Was mehrere Seiten brauchen, gehört in `main.css` / `main.js`, sonst in `assets/css/pages/<seite>.css` und `assets/js/pages/<seite>.js`.
- Seiten melden ihre Render-Funktion mit `registerPageRender(...)` an.
- Meldungen als Toast (Was ist passiert. Warum. Was jetzt.), nie `alert`/`confirm`.
- `:hover` nur in `@media (hover: hover)`. Fokusring nicht entfernen. Fenster mit `role="dialog"`, Escape und Fokusfalle.
- Bewegung mit `prefers-reduced-motion` abschalten.
- Content-Security-Policy in `app/vercel.json` und `landingpage/vercel.json`: keine fremden Skripte, Schriften oder Bilder einbinden, ohne die CSP anzupassen.
- Neue Datenfelder im Speicher müssen in der Whitelist von `save_user_data` (`supabase/schema.sql`) stehen.

## Texte

Deutsch (Schweiz), Du-Form, ss statt ß. Beträge `1’250.00 CHF`. Kurz, das Wichtigste zuerst. Keine erfundenen Testimonials oder Zahlen.

## Ablauf

- Daria committet und pusht selbst über VS Code. Nicht selbst pushen.
- Kein Test-Framework. Änderungen im Browser prüfen (Handy- und Computerbreite, hell und dunkel).
- Datenschutz: Supabase-Projekt in der EU (Frankfurt), Rechtstexte in `app/datenschutz.html`, `app/nutzungsbedingungen.html`, `app/impressum.html`. Gilt das Schweizer revDSG.
