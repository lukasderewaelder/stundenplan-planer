# Messergebnisse

Rechner: AMD Ryzen 7 3700U (4 Kerne / 8 Threads, Laptop), Node 24, 4 Läufe parallel. Rohdaten der Baselines: `bench/baseline/*.json`. Werkzeuge und Messarten: `bench/README.md`.

> **Korrektur (Messfehler im ersten Aufbau):** Die ersten Messungen und das erste Profil entstanden in einem Node-`vm`-Kontext, in dem jeder Zugriff auf eine globale Funktion oder auf `Math` über Interzeptoren läuft und etwa zehnmal langsamer ist als im Browser. Daraus folgte die falsche Aussage „die Suche ist langsam (4.700 Iterationen/s)“ und ein verzerrtes Profil. `tools/lade-engine.mjs` lädt die Engine jetzt wie ein Browser-Skript im Hauptkontext; alle Zahlen unten sind damit neu gemessen. Die Planergebnisse (weiche Kosten, Plan-Hash je Seed) waren in beiden Ladern identisch – nur die Zeiten waren falsch.

## Baseline (Stand `82577d0`, unveränderter Solver)

| Datensatz | Messart | weiche Kosten (Median, min–max) | Iterationen/s | Läufe mit 0 harten Fehlern | offen bleibt |
|---|---|---|---|---|---|
| synth-12 (12 Klassen, Beispielschule) | 60 s × 4 Seeds | 713,9 (707–731) | ≈ 35.400 | 4 von 4 | – |

Reproduzierbarkeit: Mit `--iter` liefert derselbe Seed bitgleiche Pläne (auch bei 4 parallelen Threads und auch zwischen den beiden Ladern).
