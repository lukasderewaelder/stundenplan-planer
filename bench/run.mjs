// Benchmark der Gesamtberechnung: dieselbe Schuldatei mit mehreren Seeds, parallel in Threads, mit Kennzahlen und Zusammenfassung.
//   node bench/run.mjs <daten.json> [--seeds 8] [--seed0 1] [--iter 50000 | --zeit 20] [--strategie sa|lahc] [--parallel 4]
//                      [--name baseline] [--konf '{"minimal":true}']
// --iter: feste Iterationszahl (gleiche Arbeit, Ergebnis je Seed reproduzierbar, Abkühlung folgt den Iterationen)
// --zeit: festes Zeitbudget in Sekunden (gleiche Wartezeit, nicht reproduzierbar, Abkühlung folgt der Uhr)
// Ergebnis: bench/ergebnisse/<name>.json (Rohdaten je Lauf) und eine Tabelle auf der Konsole.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const hier = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const pfad = args.find(a => !a.startsWith('--') && fs.existsSync(a));
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
if (!pfad) { console.error('Aufruf: node bench/run.mjs <daten.json> [--seeds 8] [--iter N | --zeit S] [--parallel P] [--name X]'); process.exit(2); }

const seeds = Number(opt('seeds', 8)), seed0 = Number(opt('seed0', 1));
const iter = opt('iter') !== undefined ? Number(opt('iter')) : (opt('zeit') === undefined ? 50000 : 0);
const zeit = opt('zeit') !== undefined ? Number(opt('zeit')) : 600;
const parallel = Number(opt('parallel', Math.max(1, Math.floor(os.availableParallelism() / 2))));
const name = opt('name', path.basename(pfad, '.json') + '-' + (iter ? iter + 'it' : zeit + 's'));
const extra = opt('konf') ? JSON.parse(opt('konf')) : {};
const aendere = opt('aendere'); // Quelltext einer Funktion t => t (Mutationen/Experimente), nur für Vergleichsläufe

// Standardeinstellungen wie in der Oberfläche (RECHNUNG_STD): vollständige Neuberechnung
const konfFuer = seed => Object.assign({ zeitlimit: zeit, iterLimit: iter, startwert: 'leer', minimal: false, seed, teil: null, gelockert: [], reparatur: false, strategie: opt('strategie', 'sa') }, extra);

const aufgaben = Array.from({ length: seeds }, (_, i) => konfFuer(seed0 + i));
const ergebnisse = new Array(aufgaben.length);
let naechste = 0, fertig = 0;
const t0 = Date.now();

await new Promise((ok, fehler) => {
  const starte = () => {
    if (naechste >= aufgaben.length) return;
    const i = naechste++;
    const w = new Worker(path.join(hier, 'lauf-worker.mjs'), { workerData: { pfad: path.resolve(pfad), konf: aufgaben[i], aendere } });
    w.once('message', m => { ergebnisse[i] = m; });
    w.once('error', e => { ergebnisse[i] = { seed: aufgaben[i].seed, fehler: String(e && e.stack || e) }; });
    w.once('exit', () => { fertig++; process.stderr.write('\r' + fertig + '/' + aufgaben.length + ' Läufe fertig '); if (fertig === aufgaben.length) ok(); else starte(); });
  };
  for (let p = 0; p < Math.min(parallel, aufgaben.length); p++) starte();
});
process.stderr.write('\n');

const gut = ergebnisse.filter(r => r && !r.fehler);
const quantil = (liste, q) => { if (!liste.length) return NaN; const s = liste.slice().sort((a, b) => a - b), x = (s.length - 1) * q, lo = Math.floor(x), hi = Math.ceil(x); return s[lo] + (s[hi] - s[lo]) * (x - lo); };
const f = (x, n = 1) => Number.isFinite(x) ? x.toFixed(n) : '–';
const spalte = (titel, fn, n = 1) => { const w = gut.map(fn).filter(Number.isFinite); return [titel, f(quantil(w, 0.25), n), f(quantil(w, 0.5), n), f(quantil(w, 0.75), n), f(Math.min(...w), n), f(Math.max(...w), n)]; };

console.log('\nDatei ' + path.basename(pfad) + ' · ' + (iter ? iter + ' Iterationen' : zeit + ' s') + ' · ' + seeds + ' Seeds ab ' + seed0 + ' · ' + parallel + ' parallel · Strategie ' + opt('strategie', 'sa') + ' · Gesamtdauer ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
if (gut.length < ergebnisse.length) ergebnisse.filter(r => r && r.fehler).forEach(r => console.log('FEHLER Seed ' + r.seed + ': ' + r.fehler.split('\n').slice(0, 3).join(' | ')));
const zeilen = [['Kennzahl', 'p25', 'Median', 'p75', 'min', 'max'],
  spalte('weiche Kosten', r => r.weich), spalte('Iterationen/s', r => r.iterProSek, 0), spalte('Suche (s)', r => r.sucheSek), spalte('Gesamtdauer (s)', r => r.dauer),
  spalte('letzte Verbesserung (s)', r => r.letzteVerbesserung), spalte('Iteration Ende Reparatur', r => r.phase1Iter, 0),
  spalte('Co-Lücken (fehlend+teilw.)', r => r.coFehlend + r.coTeilweise, 0), spalte('offene Springer', r => r.offenSpringer, 0), spalte('offene Aufsichten (min)', r => r.offenMin, 0),
  spalte('Ausgleich Streuung (h)', r => r.ausgleichSd), spalte('Aufsichten-Stufe (s)', r => r.aufsichtSek)];
const breite = zeilen[0].map((_, c) => Math.max(...zeilen.map(z => String(z[c]).length)));
zeilen.forEach(z => console.log(z.map((x, c) => c === 0 ? String(x).padEnd(breite[c]) : String(x).padStart(breite[c])).join('  ')));
console.log('harte Fehler (Endvalidierung) = 0: ' + gut.filter(r => r.endHart === 0).length + ' von ' + gut.length + ' · Ampel: ' + ['gruen', 'gelb', 'rot'].map(a => a + ' ' + gut.filter(r => r.ampel === a).length).join(', ') + ' · nicht platziert > 0: ' + gut.filter(r => r.unplatziert > 0).length);
const offen = new Map(); gut.forEach(x => (x.pflichtOffen || []).forEach(p => { const id = p.split('×')[0]; offen.set(id, (offen.get(id) || 0) + 1); }));
console.log('Pflichtpunkte der Endvalidierung, die offen bleiben (Läufe): ' + (offen.size ? [...offen].map(([id, n]) => id + ' ' + n).join(', ') : 'keine'));
console.log('verschiedene Pläne: ' + new Set(gut.map(r => r.planHash)).size + ' von ' + gut.length + ' (gleiche Seeds + --iter müssen denselben Plan liefern)');

fs.mkdirSync(path.join(hier, 'ergebnisse'), { recursive: true });
const ziel = path.join(hier, 'ergebnisse', name + '.json');
fs.writeFileSync(ziel, JSON.stringify({ datei: path.basename(pfad), konf: aufgaben[0], seeds, seed0, parallel, node: process.version, cpu: os.cpus()[0] && os.cpus()[0].model, kerne: os.availableParallelism(), datum: new Date().toISOString(), laeufe: ergebnisse }, null, 1) + '\n');
console.log('Rohdaten: ' + path.relative(process.cwd(), ziel));
process.exit(gut.length === ergebnisse.length ? 0 : 1);
