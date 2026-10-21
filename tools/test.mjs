// Führt die Selbsttests der Engine im Terminal aus (dieselben Tests wie „Expertenmodus → Ergebnis & Auswertung → Selbsttest“).
// Tests, die die Oberfläche brauchen (DOM, APP, h()), werden als „Browser“ übersprungen und bleiben dem Browser vorbehalten.
//   node tools/test.mjs             alle Suiten
//   node tools/test.mjs --schnell   ohne die rechenintensiven Solver-Suiten
//   node tools/test.mjs Z1 S5       nur Tests mit diesen Kennungen
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ladeEngine, quelltext } from './lade-engine.mjs';
import { invarianten, mutationstest } from './invarianten.mjs';

const args = process.argv.slice(2);
const schnell = args.includes('--schnell');
const nurIds = new Set(args.filter(a => !a.startsWith('--')));

// Namen, die nur das UI-Skript kennt: Ein Test, der daran mit „… is not defined“ scheitert, gehört in den Browser.
const uiNamen = new Set([...quelltext('src/ui/').matchAll(/^(?:async )?function (\w+)|^(?:const|let|var|class) (\w+)/gm)].map(m => m[1] || m[2]));
const browserTest = x => { const m = /^Fehler: (\w+) is not defined/.exec(x.info || ''); return !!m && uiNamen.has(m[1]); };

const k = ladeEngine({ mitTests: true });
const suiten = [
  ['Regeln (je Regel ein Verstoß- und ein Gegenfall)', () => k.selbsttest()],
  ['Zusatzfälle', () => k.selbsttestZusatz()],
  ['Dienste (Aufsichten)', () => k.selbsttestDienste()],
  ['Solver', () => k.selbsttestSolver(), true],
  ['Auftrag (Aufgaben, Arbeitszeit)', () => k.selbsttestAuftrag(), true],
  ['Gesamtberechnung', () => k.selbsttestGesamt(), true],
  ['Planzustand-Invarianten (inkrementell = Neuberechnung)', () => invarianten({ schritte: 300 })],
  ['Mutationstest (Invarianten-Test findet eingebaute Fehler)', () => mutationstest()]
];

let gesamt = 0, ok = 0, browser = 0;
const fehler = [];
for (const [name, lauf, schwer] of suiten) {
  if (schnell && schwer) { console.log('übersprungen  ' + name + ' (--schnell)'); continue; }
  const t0 = performance.now();
  let liste;
  try { liste = await lauf(); } catch (err) { liste = [{ id: '?', name: 'Suite abgebrochen', ok: false, info: String(err && err.stack || err) }]; }
  if (nurIds.size) liste = liste.filter(x => nurIds.has(x.id));
  const b = liste.filter(browserTest), z = liste.filter(x => !browserTest(x));
  const gut = z.filter(x => x.ok).length;
  gesamt += z.length; ok += gut; browser += b.length;
  z.filter(x => !x.ok).forEach(x => fehler.push({ suite: name, ...x }));
  console.log((gut === z.length ? 'ok            ' : 'FEHLER        ') + name + ': ' + gut + '/' + z.length + (b.length ? ' (+' + b.length + ' nur im Browser)' : '') + '  ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s');
}
for (const f of fehler) console.log('\n  ✗ [' + f.suite + '] ' + f.id + ' ' + (f.name || '') + '\n    ' + String(f.info).split('\n').join('\n    '));
console.log('\n' + ok + ' von ' + gesamt + ' Tests bestanden' + (browser ? ', ' + browser + ' nur im Browser prüfbar (übersprungen)' : '') + '. Oberflächen-Suite (selbsttestOberflaeche) läuft nur im Browser.');
process.exit(fehler.length ? 1 : 0);
