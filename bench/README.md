# Benchmark des Solvers

Misst die **Gesamtberechnung** (`loeseStundenplan`: Fachunterricht + Fachlehrkräfte, danach Co-Lehrkräfte, Aufsichten, Endvalidierung) auf einer Schuldatei, mit mehreren Seeds parallel in Node-Threads.

```
node bench/run.mjs <daten.json> --seeds 8 --iter 150000 --parallel 4 --name synth12-150kit
node bench/run.mjs <daten.json> --seeds 8 --zeit 30 --parallel 4 --name synth12-30s
node bench/profil.mjs <daten.json> --iter 30000 --top 35         # wo geht die Rechenzeit hin?
node bench/gen.mjs --kopien 3 [--enge 0.5]                        # synthetische Schule (36 Klassen) nach bench/daten/synth-36.json
```

## Zwei Messarten

| Modus | Bedeutung | Verwendung |
|---|---|---|
| `--iter N` | feste Arbeit; Abkühlung folgt den Iterationen; **bitgleich reproduzierbar** (gleicher Seed → gleicher Plan, auch bei parallelen Threads) | Qualität bei gleichem Aufwand; Beweis, dass eine Beschleunigung das Verhalten nicht ändert (`planHash` gleich) |
| `--zeit S` | festes Zeitbudget; Abkühlung folgt der Uhr; nicht reproduzierbar | was die Nutzerin in S Sekunden bekommt; zeigt Gewinne durch schnelleres Rechnen |

Für Zeitmessungen `--parallel` höchstens auf die Zahl der **physischen** Kerne setzen (die Iterationen/s sinken bei voller Auslastung) und den Rechner sonst ruhen lassen.

## Kennzahlen

- **weiche Kosten**: Summe der gewichteten Wunschverstöße des Gesamtplans (kleiner ist besser).
- **harte Fehler (Endvalidierung)**: Pflichtverstöße des gespeicherten Gesamtplans inkl. Co-Bedarf, Aufsichten, Arbeitszeit. Ziel: 0.
- **Pflichtpunkte, die offen bleiben**: welche Prüfungen der Endvalidierung scheitern (z. B. `aufsicht`, `co`).
- **Iterationen/s**: Schnelligkeit der Suche (Suchzeit ohne Co-/Aufsichts-Nachlauf).
- **letzte Verbesserung**: Sekunde, ab der sich der beste Stand nicht mehr verbessert hat.
- **Co-Lücken, offene Springer/Aufsichten, Ausgleichs-Streuung**: Qualität der Nachlauf-Stufen.

## Annahmeregel für Solver-Änderungen

Vorher/nachher mit denselben Seeds auf allen Datensätzen vergleichen: Median und 25./75. Perzentil der weichen Kosten, Anteil der Läufe mit 0 harten Fehlern und Iterationen/s dürfen sich nicht verschlechtern; eine behauptete Verbesserung muss über der Streuung zwischen den Seeds liegen. Reine Beschleunigungen müssen mit `--iter` **denselben `planHash`** liefern.

## Dateien

- `bench/baseline/` – eingefrorene Referenzläufe (nur Kennzahlen, keine Personendaten); `bench/ERGEBNISSE.md` fasst sie zusammen.
- `bench/ergebnisse/` – eigene Messläufe und Profile (nicht im Repo).
- `bench/daten/privat/` – echte Schuldaten (nicht im Repo), `bench/daten/synth-*.json` – erzeugte Testschulen (nicht im Repo, mit `gen.mjs` neu erzeugbar).

## Hinweis zum Laden der Engine in Node

`tools/lade-engine.mjs` lädt die Engine als Funktionskörper im **Hauptkontext** (wie ein Browser-Skript). In einem `vm.createContext`-Kontext wären globale Zugriffe (`Math`, Funktionsnamen) etwa zehnmal langsamer und jede Zeit- und Profilmessung falsch – das war ein Fehler der ersten Messungen (siehe `ERGEBNISSE.md`).
