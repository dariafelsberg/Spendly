"""Erzeugt die Sprachversionen der Landingpage.

Quelle ist ../index.html (Deutsch). Übersetzungen stehen in texte.txt.
Ausgabe: ../de/index.html, ../fr/index.html, ../it/index.html, ../en/index.html, ../nl/index.html

Aufruf (im Spendly-Ordner):  python landingpage/i18n/build.py
Fehlt eine Übersetzung, bricht das Skript ab und nennt den Text.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LANGS = ['de', 'fr', 'it', 'en', 'nl']
NAMES = {'de': 'Deutsch', 'fr': 'Français', 'it': 'Italiano', 'en': 'English', 'nl': 'Nederlands'}
LOCALE = {'de': 'de-CH', 'fr': 'fr-CH', 'it': 'it-CH', 'en': 'en', 'nl': 'nl'}
OG = {'de': 'de_CH', 'fr': 'fr_CH', 'it': 'it_CH', 'en': 'en_GB', 'nl': 'nl_NL'}
SITE = 'https://spendly.ch'
# Bleibt in allen Sprachen gleich
KEEP = {'Spendly', 'Take-away', 'app.spendly.ch', 'de_CH', '© 2026 Spendly', 'Deutsch', 'Français', 'Italiano', 'English', 'Nederlands', 'Budget CHF 2’400.00'}

def load():
    d = {l: {} for l in LANGS[1:]}
    for n, line in enumerate(open(os.path.join(HERE, 'texte.txt'), encoding='utf-8'), 1):
        line = line.rstrip('\n')
        if not line.strip() or line.startswith('#'):
            continue
        p = line.split(' ¦ ')
        if len(p) != 5:
            sys.exit(f'texte.txt Zeile {n}: es braucht 5 Spalten')
        for l, v in zip(LANGS[1:], p[1:]):
            if l == 'fr':  # geschützte Leerzeichen vor : ; ? ! und in « »
                v = re.sub(r' ([:;?!»])', '\u00a0\\1', v).replace('« ', '«\u00a0')
            d[l][p[0]] = v
    return d

def norm(s):
    return re.sub(r'\s+', ' ', s).strip()

def translate(src, lang, d):
    missing = set()
    def tr(s):
        k = norm(s)
        if lang == 'de' or not re.search(r'[A-Za-zÄÖÜäöü]', k) and k != '.':
            return s
        if k in KEEP or re.fullmatch(r'CHF [\d’.]+', k):
            return s
        if k in d:
            lead = ' ' if s[:1].isspace() else ''
            trail = ' ' if s[-1:].isspace() else ''
            return lead + d[k] + trail
        missing.add(k)
        return s

    html = src
    # Tagline (Wort für Wort animiert) neu aufbauen
    if lang != 'de':
        lines = d['@TAGLINE'].split('|')
        words = []
        for i, ln in enumerate(lines):
            words.append(' '.join(f'<span class="w">{w}</span>' for w in ln.split(' ')))
        tag = '<br class="br-d"> '.join(words)
        html = re.sub(r'(<p class="tagline-text">).*?(</p>)', lambda m: m.group(1) + tag + m.group(2), html, count=1, flags=re.S)

    # Teile, die nicht übersetzt werden: style, svg, script (ausser JSON-LD und Video-Texte)
    parts = re.split(r'(<style.*?</style>|<svg.*?</svg>|<script.*?</script>|<p class="tagline-text">.*?</p>)', html, flags=re.S)
    out = []
    for part in parts:
        if part.startswith('<style') or part.startswith('<svg') or part.startswith('<p class="tagline-text">'):
            out.append(part); continue
        if part.startswith('<script'):
            if 'application/ld+json' in part and lang != 'de':
                body = re.search(r'>(.*)</script>', part, re.S).group(1)
                data = json.loads(body)
                for q in data.get('mainEntity', []):
                    q['name'] = tr(q['name'])
                    q['acceptedAnswer']['text'] = tr(q['acceptedAnswer']['text'])
                part = part.replace(body, json.dumps(data, ensure_ascii=False))
            elif lang != 'de':
                part = re.sub(r"'(Video abspielen|Video anhalten)'", lambda m: "'" + tr(m.group(1)) + "'", part)
            out.append(part); continue
        # Text zwischen Tags
        part = re.sub(r'>([^<>]+)<', lambda m: '>' + tr(m.group(1)) + '<', part)
        # Attribute
        part = re.sub(r'\b(aria-label|alt|title|content)="([^"]*)"',
                      lambda m: f'{m.group(1)}="{tr(m.group(2)) if not m.group(2).startswith(("http", "width=", "#")) and m.group(2) not in ("website", "summary_large_image") else m.group(2)}"', part)
        out.append(part)
    html = ''.join(out)
    # <title> steht in einem Teil vor <style>, wurde oben schon übersetzt
    if missing:
        sys.exit(f'{lang}: Übersetzung fehlt für:\n  ' + '\n  '.join(sorted(missing)))

    # Sprache, Adressen, Pfade
    html = html.replace('<html lang="de-CH">', f'<html lang="{LOCALE[lang]}">', 1)
    html = html.replace('content="de_CH"', f'content="{OG[lang]}"', 1)
    html = html.replace(f'<link rel="canonical" href="{SITE}/">', f'<link rel="canonical" href="{SITE}/{lang}/">', 1)
    html = html.replace(f'<meta property="og:url" content="{SITE}/">', f'<meta property="og:url" content="{SITE}/{lang}/">', 1)
    alt = ''.join(f'\n<link rel="alternate" hreflang="{l}" href="{SITE}/{l}/">' for l in LANGS)
    alt += f'\n<link rel="alternate" hreflang="x-default" href="{SITE}/">'
    html = html.replace(f'<link rel="canonical" href="{SITE}/{lang}/">', f'<link rel="canonical" href="{SITE}/{lang}/">' + alt, 1)
    html = re.sub(r'(?<=["(,\s])assets/', '/assets/', html)
    # App in derselben Sprache öffnen
    html = re.sub(r'href="https://app\.spendly\.ch/"', f'href="https://app.spendly.ch/?lang={lang}"', html)
    # Sprachwahl: aktuelle Sprache markieren
    html = html.replace(' aria-current="true"', '')
    html = html.replace(f'hreflang="{lang}" lang="{lang}">', f'hreflang="{lang}" lang="{lang}" aria-current="true">', 1)
    html = html.replace('<span class="lang-cur">Deutsch</span>', f'<span class="lang-cur">{NAMES[lang]}</span>', 1)
    return html

def main():
    d = load()
    src = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    for lang in LANGS:
        os.makedirs(os.path.join(ROOT, lang), exist_ok=True)
        with open(os.path.join(ROOT, lang, 'index.html'), 'w', encoding='utf-8', newline='\n') as f:
            f.write(translate(src, lang, d.get(lang, {})))
        print('geschrieben:', lang + '/index.html')

if __name__ == '__main__':
    main()
