# Stundenplaner

Stundenplan-Generator für Schulen: Wochenstundenplan erzeugen, von Hand nachbearbeiten und druckfertig ausgeben – offline, **eine** Datei (`index.html`). Veröffentlicht über GitHub Pages: https://lukasderewaelder.github.io/stundenplan-planer/

## Aufbau

`index.html` wird aus den Quelldateien unter `src/` **gebaut** und mit eingecheckt (GitHub Pages liefert sie aus). Bearbeitet wird nur `src/`.

| Ordner | Inhalt |
|---|---|
| `src/shell/` | HTML-Gerüst (Kopf, Icon-Sprite, Skript-Öffnung/-Schluss) |
| `src/css/` | Stylesheet in Abschnitten |
| `src/engine/` | Rechenkern: Datenmodell, Kompilieren, `class Plan` (Belegung, inkrementelle Bewertung), Regeln H01–H16 / W01–W18, Machbarkeit, Solver, Gesamtberechnung, Dienste/Aufsichten. Läuft im Hauptfenster **und** im Web Worker; kein DOM-Zugriff |
| `src/ui/` | Oberfläche (Stammdaten, Berechnung, Plan-Editor, Aufsichten, Import/Export, Druck) |
| `src/tests/` | Selbsttests (Expertenmodus → Ergebnis & Auswertung → Selbsttest) |
| `src/manifest.json` | Reihenfolge der Dateien – die Dateien werden Byte für Byte aneinandergehängt (kein Bundler, keine Umformung) |
| `tools/` | Build, Test-Runner, Invarianten-Test, Anleitung (`anleitung.mjs`) |
| `anleitung/` | PDF-Anleitung für Neulinge: `Stundenplaner-Anleitung.pdf` (eingecheckt, wird von GitHub Pages mitausgeliefert und aus dem Programm verlinkt), Quelle in `quelle/` (HTML/CSS) |
| `bench/daten/privat/` | echte Schuldaten für Messungen – **nicht** im Repo (`.gitignore`) |

## Befehle (Node.js ≥ 20)

```
node tools/build.mjs                 # baut index.html aus src/
node tools/build.mjs --check         # prüft, ob index.html dem Build entspricht (Exit 1 sonst)
node tools/build.mjs --gegen <Ref>   # vergleicht den Build mit index.html aus einem Git-Stand
node tools/test.mjs                  # alle Selbsttests der Engine im Terminal (ca. 40 s)
node tools/test.mjs --schnell        # ohne die rechenintensiven Solver-Suiten (ca. 6 s)
node tools/invarianten.mjs           # nur der Invarianten-Test des Planzustands
node tools/anleitung.mjs             # Anleitung neu erzeugen: Screenshots der Beispieldaten (Chrome/Edge headless) + PDF
node tools/anleitung.mjs --nur-pdf   # nur die PDF neu schreiben (Text/Layout geändert, Bilder vorhanden)
```

Die Oberflächen-Selbsttests (`selbsttestOberflaeche`) brauchen einen Browser; die übrigen laufen headless.

## Tests im Überblick

- **Selbsttests** je Regel (Verstoß- und Gegenfall), Zusatzfälle, Solver, Auftrag, Gesamtberechnung, Dienste.
- **Invarianten-Test** (`tools/invarianten.mjs`): Nach zufälligen Zügen (platzieren, entfernen, tauschen, Raum, Lehrkraft, Blockaufteilung) und je commit/rollback muss die inkrementelle Bewertung der Neuberechnung aus dem Zustand entsprechen und rollback den Zustand exakt wiederherstellen. Läuft auf den Testdaten, den Beispieldaten und – falls vorhanden – auf den Dateien in `bench/daten/privat/`.
- **Mutationstest:** baut absichtlich Fehler in den Planzustand ein und prüft, dass der Invarianten-Test sie findet.

## Zeilenenden

Quelle der Wahrheit sind LF-Zeilenenden (`.gitattributes`). Der Build lehnt Dateien mit CR ab, damit `index.html` byte-genau reproduzierbar bleibt.

## Anleitung (PDF)

`anleitung/Stundenplaner-Anleitung.pdf` erklärt das Programm für Neulinge (Rundgang mit der Beispielschule, FAQ, Glossar). Der Link steht im Menü, im Hilfe-Dialog und auf der Startseite. Nach Änderungen an der Oberfläche oder am Text `node tools/anleitung.mjs` ausführen und die PDF mit einchecken. Das Skript braucht nur Node und einen installierten Chrome oder Edge (Pfad notfalls in `CHROME_PFAD`); es zeigt ausschließlich die eingebauten Beispieldaten und nutzt ein leeres Browserprofil. Bei nicht gefundenen Bildmarken meldet es `!!`-Warnungen – dann die Selektoren in `tools/anleitung.mjs` anpassen.
