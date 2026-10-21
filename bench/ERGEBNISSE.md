# Messergebnisse

Rechner: AMD Ryzen 7 3700U (4 Kerne / 8 Threads, Laptop), Node 24, 4 Läufe parallel. Rohdaten der Baselines: `bench/baseline/*.json`. Werkzeuge und Messarten: `bench/README.md`.

## Baseline (Stand `fd79151`, unveränderter Solver)

| Datensatz | Messart | weiche Kosten (Median, min–max) | Iterationen/s | Läufe mit 0 harten Fehlern | offen bleibt |
|---|---|---|---|---|---|
| synth-12 (12 Klassen, Beispielschule) | 60 s × 4 Seeds | 811,9 (775–843) | ≈ 5.900 | 4 von 4 | – |

Reproduzierbarkeit: Mit `--iter` liefert derselbe Seed bitgleiche Pläne (8 von 8 Läufen beim zweiten Durchlauf identisch, auch bei 4 parallelen Threads).
