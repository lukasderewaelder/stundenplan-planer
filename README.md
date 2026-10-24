<img src="icons/icon-192.png" alt="Stundenplaner-Icon" width="96" align="right">

# Stundenplaner

Ein Programm, das Stundenpläne für Schulen erstellt. Man gibt Klassen, Lehrkräfte, Fächer und Räume ein, lässt den Plan berechnen und kann ihn danach von Hand anpassen und ausdrucken.

Ausprobieren lässt es sich hier: https://lukasderewaelder.github.io/stundenplan-planer/

## Zum Projekt

Ich arbeite aus eigenem Interesse an diesem Programm. Es ist kein Angebot an Schulen und nichts, womit Geld verdient werden soll. Dabei hilft mir künstliche Intelligenz (KI); große Teile des Codes sind damit entstanden.

Die Pläne und Ergebnisse sind ohne Gewähr. Wer das Programm für eine echte Stundenplanung nutzt, sollte alles selbst noch einmal prüfen. Support gibt es nicht, über Rückmeldungen freue ich mich aber.

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
| `tools/` | Build, Test-Runner, Invarianten-Test, Handbuch (`handbuch.mjs`) |
| `handbuch/` | PDF-Benutzerhandbuch: `Stundenplaner-Handbuch.pdf` (eingecheckt, wird von GitHub Pages mitausgeliefert und aus dem Programm verlinkt), Quelle in `quelle/` (HTML/CSS, Kapitel unter `kapitel/`) |
| `bench/daten/privat/` | echte Schuldaten für Messungen – **nicht** im Repo (`.gitignore`) |

## Befehle (Node.js ≥ 20)

```
node tools/build.mjs                 # baut index.html aus src/
node tools/build.mjs --check         # prüft, ob index.html dem Build entspricht (Exit 1 sonst)
node tools/build.mjs --gegen <Ref>   # vergleicht den Build mit index.html aus einem Git-Stand
node tools/test.mjs                  # alle Selbsttests der Engine im Terminal (ca. 40 s)
node tools/test.mjs --schnell        # ohne die rechenintensiven Solver-Suiten (ca. 6 s)
node tools/invarianten.mjs           # nur der Invarianten-Test des Planzustands
node tools/handbuch.mjs              # Handbuch neu erzeugen: Bildschirmfotos der Beispieldaten (Chrome/Edge headless) + PDF
node tools/handbuch.mjs --nur-pdf    # nur die PDF neu schreiben (Text/Layout geändert, Bilder vorhanden)
node tools/handbuch.mjs --kapitel 3  # nur die Bilder eines Kapitels neu aufnehmen
```

Die Oberflächen-Selbsttests (`selbsttestOberflaeche`) brauchen einen Browser; die übrigen laufen headless.

## Tests im Überblick

- **Selbsttests** je Regel (Verstoß- und Gegenfall), Zusatzfälle, Solver, Auftrag, Gesamtberechnung, Dienste.
- **Invarianten-Test** (`tools/invarianten.mjs`): Nach zufälligen Zügen (platzieren, entfernen, tauschen, Raum, Lehrkraft, Blockaufteilung) und je commit/rollback muss die inkrementelle Bewertung der Neuberechnung aus dem Zustand entsprechen und rollback den Zustand exakt wiederherstellen. Läuft auf den Testdaten, den Beispieldaten und – falls vorhanden – auf den Dateien in `bench/daten/privat/`.
- **Mutationstest:** baut absichtlich Fehler in den Planzustand ein und prüft, dass der Invarianten-Test sie findet.

## Zeilenenden

Quelle der Wahrheit sind LF-Zeilenenden (`.gitattributes`). Der Build lehnt Dateien mit CR ab, damit `index.html` byte-genau reproduzierbar bleibt.

## Handbuch (PDF)

`handbuch/Stundenplaner-Handbuch.pdf` ist das Benutzerhandbuch (Einrichtung, Berechnung, Plan-Editor, Aufsichten, Arbeitszeit, Druck und Export, Regelkatalog, FAQ, Glossar). Der Link steht im Menü, im Hilfe-Dialog und auf der Startseite. Nach Änderungen an der Oberfläche oder am Text `node tools/handbuch.mjs` ausführen und die PDF mit einchecken. Das Skript braucht nur Node und einen installierten Chrome oder Edge (Pfad notfalls in `CHROME_PFAD`); es zeigt ausschließlich die eingebauten Beispieldaten und nutzt ein leeres Browserprofil. Bei nicht gefundenen Bildmarken meldet es `!!`-Warnungen – dann die Selektoren in `tools/handbuch-kapitel/` anpassen. Die Bilder unter `handbuch/bilder/` und der Planzustand `handbuch/_zustand.json` werden erzeugt und nicht eingecheckt.
