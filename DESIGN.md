# DESIGN.md – Spendly

Verbindliche Gestaltungsregeln für App (`app/`) und Landingpage (`landingpage/`).
Quelle ist das Spendly CD-Manual v1.4 (19. November 2026). Wenn diese Datei und das CD-Manual sich widersprechen, gilt das CD-Manual.
Aufbau nach dem DESIGN.md-Format von «awesome-design-md».

## 1. Stimmung

Spendly ist die Budget-App für den Alltag in der Schweiz: ruhig, freundlich, aufgeräumt. Viel Weiss und Rosé, ein kräftiges Pink als einzige Akzentfarbe, Titel in einer Serifenschrift. Keine Verläufe, keine Glas-Effekte, keine Stock-Fotos mit Geldbündeln oder Sparschweinen. Die App selbst ist das wichtigste Bild.

## 2. Farben

Acht Grundfarben. Neue Grau- oder Rosatöne kommen nicht dazu.

| Token (CD) | CSS App | CSS Landingpage | Wert | Rolle |
| --- | --- | --- | --- | --- |
| spendly-pink | `--primary` | `--pink` | #E91E63 | Einzige Akzentfarbe: Kopfbereich, Flächen, Punkte, Balken. Weisse Schrift darauf erst ab 24px (oder fett ab 19px) |
| pink-dunkel | `--primary-dark` | `--pink-dunkel` | #C2185B | Pinker Text, Buttons mit weisser Schrift, Fokusring |
| pink-hell | `--primary-light` | `--pink-hell` | #FFD8E7 | Aktive Flächen, Linien und Ränder |
| tinte | `--text` | `--tinte` | #2D1B24 | Text, dunkle Flächen (Toasts) |
| grau-rose | `--muted` | `--grau-rose` | #7A5C69 | Nur Notizen und Labels |
| rose-weiss | `--bg` | `--rose-weiss` | #FDF6FA | Seitenhintergrund, Listenzeilen |
| rose-flaeche | `--surface` | `--rose-flaeche` | #F7EDF3 | Hintergrund ab 1024px, leere Donut-Spur, Lade-Platzhalter |
| weiss | `--card` | `--weiss` | #FFFFFF | Karten, Felder, Formulare |

**Verteilung:** etwa 70 % Weiss und Rosé, 20 % Pink, 10 % Tinte.

**Bedeutungsfarben (nur App und Diagramme):** einnahme #16A34A (Text #15803D), ausgabe #EF4444 (Text #B91C1C), ueberweisung #7C93FF (Text #4F5FD6), warnung-text #B45309. Helle Töne nur für Flächen und Punkte, als Schrift immer die Text-Variante. Beträge haben immer ein Vorzeichen oder Wort, nie nur Farbe.

**Kategorienfarben** (`kat-…`) nur für Punkte, Balken, Donut und Icons, nie für Schrift. Shopping #7C3AED, Gesundheit #0E7490, Abos #6366F1, Geschenke #F472B6.

**Dunkelmodus (nur App):** `:root[data-theme="dark"]` in `app/assets/css/main.css`. Hintergrund #160D12, Karte #22151C, Fläche #1D1218, Linien #4A1F33, Text #F6E9EF, pinker Text #FF6FA0, Kopfbereich #8F1240. Neue Farben immer für beide Modi festlegen.

## 3. Schrift

Ein Schriftpaar, selbst ausgeliefert (kein Google Fonts):

- **DM Serif Display Regular:** Seiten- und Abschnittstitel, Logo-Schriftzug. Nie fett, nie in Grossbuchstaben.
- **DM Sans (300 bis 700):** alles andere. Lauftext Regular 16px, Labels und Zwischentitel Medium, Knöpfe und Reiter SemiBold, Beträge Bold.

**Skala** (jede Stufe mindestens 20 % grösser): 12 · 13.2 · 16 · 20 · 24 · 30 · 40 · 48px.
In der App nur über Tokens: `--fs-label`, `--fs-note`, `--fs-body`, `--fs-lg`, `--fs-xl`, `--fs-2xl`, `--fs-3xl`, `--fs-hero`. Kleinste Grösse 12px. Labels in normaler Schreibweise, ohne Sperrung.

## 4. Icons

Ein Icon-Set: die eigenen Spendly-Linien-Icons (`app/assets/icons/ui/`, Kopien im CD-Manual).
Raster 48 × 48, Strich 2, runde Enden, keine Füllung, `currentColor`. Eingebunden als Maske: `<span class="ico ico-home"></span>`.

- Nie Lucide, Heroicons, Font Awesome oder andere Sammlungen.
- Neue Icons im gleichen Stil selbst zeichnen.
- Keine Emoji als Icons. Einzige Ausnahme: eigene Kategorien, die eine Nutzerin mit Emoji anlegt.
- In der Navigation steht neben jedem Icon ein Wort.

## 5. Komponenten

- **Karte:** `weiss` auf `rose-weiss`, Radius 16px, kein Rand, kein Schatten.
- **Button:** Radius 10px. Hauptknopf (`.btn-save`) Fläche `pink-dunkel` (App: `--btn`) mit weisser Schrift, SemiBold. Zweitknopf (`.btn-cancel`) Fläche `rose-weiss` ohne Rand, gedrückt `pink-hell`.
- **Feld:** weiss, Radius 10px, Rand `pink-hell`, Fehler direkt unter dem Feld (FieldError).
- **Listenzeile, Chip:** Radius 12px.
- **Pille:** Radius 999px.
- **Kopfbereich App:** flach `spendly-pink`, unten Radius 16px, zwei weisse Kreise (7 % und 5 %).
- **Meldung:** Toast oben, Formel «Was ist passiert. Warum. Was jetzt.». Keine `alert`/`confirm`. Löschen sofort, mit «Rückgängig».

## 6. Abstände und Layout

- 4er-Raster: 4 · 8 · 12 · 16 · 20 · 28 · 32px (`--sp-2xs` bis `--sp-2xl`).
- **Dichte statt Leerraum:** Inhalte gruppieren, Abstände aus der Skala, keine leeren Bildschirmhöhen zwischen Abschnitten.
- **Eine Layout-Idee pro Seite:** Jede Seite hat ein tragendes Muster (Landingpage: «Roter Faden» durch einen Monat). Abschnitte variieren das Muster, statt jedes Mal ein neues zu erfinden.
- Landingpage: 12 Spalten, 20px Abstand, Inhalt max. 1280px, Seitenrand 16px (Handy) und 28px (ab 640px).
- App: Handy zuerst; ab 1024px Seitenleiste links (232px) und Hintergrund `rose-flaeche`.

## 7. Tiefe

Schatten nur, wo etwas über etwas anderem liegt:

- `--shadow-raised` 0 1px 3px rgba(45,27,36,.12): aktiver Reiter, Schalterknopf
- `--shadow-float` 0 4px 16px rgba(45,27,36,.14): Plus-Knopf, Fenster, Menü
- `--shadow-bar` 0 -1px 6px rgba(45,27,36,.06): Navigation unten

Flächen bleiben flach.

## 8. Logo

Pfeil-S aus zwei Pfeilen (oben schwarz, unten `spendly-pink`), daneben «Spendly» in DM Serif Display, `tinte`. Immer die Dateien nehmen (`app/assets/icons/logo_spendly.svg`), nie neu setzen. Auf Pink oder dunklem Grund ganz weiss. Schutzraum 50 % der Logohöhe, Mindestbreite 96px.

## 9. Bilder und Bewegung

- Echte Screenshots und Aufnahmen der App, im Geräterahmen. Keine erfundenen Oberflächen.
- Bilder als WebP/AVIF mit JPG-Fallback, mit `width`/`height`, unterhalb des ersten Bildschirms `loading="lazy"`.
- Bewegung sparsam (150 bis 650 ms), immer mit `prefers-reduced-motion`.
- Keine erfundenen Testimonials oder Nutzerzahlen.

## 10. Sprache

Du-Form, kurz, ohne Fachjargon. Schweizer Rechtschreibung (ss, kein ß). Beträge `4’218.40`, `1’250.00 CHF`, Ausgaben `– 86.35`. Das Wichtigste zuerst, keine Füllwörter, keine Gedankenstriche im Satz.

## 11. Nicht erlaubt

- Verläufe (auch nicht im Logo), Glas-Effekte, Neon, Schatten auf Flächen
- Eine zweite Akzentfarbe
- Fremde Icon-Sets, Emoji als Icons
- Titel fett oder in Grossbuchstaben
- Rohe Farbwerte oder Schriftgrössen im CSS statt Tokens
- Weisse Schrift unter 24px auf `spendly-pink`
- Erfundene Zitate, Bewertungen oder Zahlen

## 12. Kurzanleitung für Agenten

Vor jeder UI-Arbeit diese Datei lesen. Farben, Schriftgrössen, Radien und Abstände nur über die CSS-Variablen. Icons aus `app/assets/icons/ui/` oder neu im gleichen Stil zeichnen. Neue Farben auch im Dunkelmodus setzen. Für Gestaltung den Skill `frontend-design` nutzen.
