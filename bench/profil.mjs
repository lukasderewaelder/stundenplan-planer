// CPU-Profil eines Berechnungslaufs (V8-Profiler, im selben Prozess): wo geht die Rechenzeit der Suche hin?
//   node bench/profil.mjs <daten.json> [--iter 30000] [--seed 1] [--top 30] [--strategie sa|lahc]
// Ausgabe: Eigenzeit je Funktion (Self-Time), Quelldatei und Zeile unter src/engine/ statt Zeilen der zusammengesetzten Engine.
import fs from 'node:fs';
import path from 'node:path';
import inspector from 'node:inspector';
import { fileURLToPath } from 'node:url';
import { ladeEngine } from '../tools/lade-engine.mjs';

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const pfad = args.find(a => !a.startsWith('--') && fs.existsSync(a));
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
if (!pfad) { console.error('Aufruf: node bench/profil.mjs <daten.json> [--iter N] [--seed S] [--top N]'); process.exit(2); }

// Zeilen der zusammengesetzten Engine → Quelldatei
const manifest = JSON.parse(fs.readFileSync(path.join(wurzel, 'src', 'manifest.json'), 'utf8'));
const stuecke = []; let ab = 1;
for (const f of manifest.dateien.filter(x => x.startsWith('src/engine/'))) { const n = fs.readFileSync(path.join(wurzel, f), 'utf8').split('\n').length - 1; stuecke.push({ f: f.replace('src/engine/', ''), von: ab, bis: ab + n - 1 }); ab += n; }
const ort = z => { const s = stuecke.find(x => z >= x.von && z <= x.bis); return s ? s.f + ':' + (z - s.von + 1) : 'engine:' + z; };

const k = ladeEngine();
const daten = k.datenstandLaden(JSON.parse(fs.readFileSync(pfad, 'utf8')));
const konf = { zeitlimit: 600, iterLimit: Number(opt('iter', 30000)), startwert: 'leer', minimal: false, seed: Number(opt('seed', 1)), teil: null, gelockert: [], reparatur: false, strategie: opt('strategie', 'sa') };

const session = new inspector.Session(); session.connect();
const post = (m, p) => new Promise((ok, err) => session.post(m, p, (e, r) => e ? err(e) : ok(r)));
await post('Profiler.enable'); await post('Profiler.setSamplingInterval', { interval: 200 }); await post('Profiler.start');
const t0 = performance.now();
const out = await k.loeseStundenplan(daten, konf, {});
const dauer = (performance.now() - t0) / 1000;
const { profile } = await post('Profiler.stop');

// Eigenzeit je Knoten aus den Zeitabständen der Samples
const eigen = new Map(); profile.nodes.forEach(n => eigen.set(n.id, 0));
profile.samples.forEach((id, i) => eigen.set(id, eigen.get(id) + (profile.timeDeltas[i] || 0)));
const gesamt = [...eigen.values()].reduce((a, b) => a + b, 0);
const nachFunktion = new Map();
for (const n of profile.nodes) {
  const cf = n.callFrame, url = cf.url || '';
  const schluessel = (cf.functionName || '(anonym)') + ' @ ' + (url === 'engine.js' ? ort(cf.lineNumber + 1) : (url || '(nativ)') + ':' + (cf.lineNumber + 1));
  nachFunktion.set(schluessel, (nachFunktion.get(schluessel) || 0) + eigen.get(n.id));
}
const top = [...nachFunktion.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(opt('top', 30)));
const s = out.statistik || {};
console.log('Profil · ' + path.basename(pfad) + ' · ' + konf.iterLimit + ' Iterationen · Seed ' + konf.seed + ' · Gesamtdauer ' + dauer.toFixed(1) + ' s · Suche ' + (out.verlauf.length ? out.verlauf[out.verlauf.length - 1].t : '?') + ' s · ' + (s.iterationen || 0) + ' Iterationen');
console.log('Eigenzeit  Anteil  Funktion');
for (const [name, us] of top) console.log((us / 1000).toFixed(0).padStart(7) + ' ms  ' + (100 * us / gesamt).toFixed(1).padStart(5) + ' %  ' + name);
fs.mkdirSync(path.join(wurzel, 'bench', 'ergebnisse'), { recursive: true });
fs.writeFileSync(path.join(wurzel, 'bench', 'ergebnisse', 'profil-' + path.basename(pfad, '.json') + '.cpuprofile'), JSON.stringify(profile));
