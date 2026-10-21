// Erzeugt skalierte Benchmark-Schulen aus den eingebauten Beispieldaten (12 Klassen, 19 Lehrkräfte, Co, Zeitprofile, Räume, Aufsichten).
//   node bench/gen.mjs --kopien 3 [--enge 0.3] [--seed 1] [--out bench/daten/synth-36.json]
// Eine „Kopie“ ist eine vollständige Beispielschule (Klassen, Lehrkräfte, Räume, Unterricht); --kopien 5 ergibt 60 Klassen.
// Die Aufsichten (Dienste) der Beispielschule bleiben nur bei --kopien 1; größere Schulen rechnen den reinen Stundenplan.
// --enge: Anteil der Lehrkräfte, bei denen 14 zufällige Stunden gesperrt werden (nur wenn der Plan lösbar bleibt) – macht ihn knapper.
import fs from 'node:fs';
import path from 'node:path';
import { ladeEngine } from '../tools/lade-engine.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const kopien = Number(opt('kopien', 1)), enge = Number(opt('enge', 0)), seed = Number(opt('seed', 1));
const k = ladeEngine();
const rnd = (() => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();

const basis = JSON.parse(JSON.stringify(k.beispieldaten()));

// Alle Kennungen, die je Kopie neu vergeben werden (Fächer bleiben gemeinsam)
const idsVon = d => {
  const s = new Set();
  d.klassen.forEach(x => { s.add(x.id); (x.gruppen || []).forEach(g => s.add(g.id)); });
  d.lehrer.forEach(x => s.add(x.id));
  d.raeume.forEach(x => s.add(x.id));
  d.unterrichte.forEach(x => s.add(x.id));
  return s;
};
const ids = idsVon(basis);
// Zeichenketten, die genau eine Kennung sind, werden umbenannt – auch Schlüssel von Objekten; Kürzel und Namen bekommen ein Suffix
function umbenennen(wert, suffix) {
  if (typeof wert === 'string') return ids.has(wert) ? wert + suffix : wert;
  if (Array.isArray(wert)) return wert.map(x => umbenennen(x, suffix));
  if (wert && typeof wert === 'object') { const o = {}; for (const [key, v] of Object.entries(wert)) o[ids.has(key) ? key + suffix : key] = umbenennen(v, suffix); return o; }
  return wert;
}
const d = JSON.parse(JSON.stringify(basis));
for (let c = 1; c < kopien; c++) {
  const suffix = '_k' + (c + 1), b = JSON.parse(JSON.stringify(basis));
  const neu = x => { const y = umbenennen(x, suffix); if (y.name) y.name = y.name + '·' + (c + 1); if (y.kuerzel) y.kuerzel = String(y.kuerzel).slice(0, 2) + (c + 1); return y; };
  b.klassen.forEach(x => d.klassen.push(neu(x)));
  b.lehrer.forEach(x => d.lehrer.push(neu(x)));
  b.raeume.forEach(x => d.raeume.push(neu(x)));
  b.unterrichte.forEach(x => d.unterrichte.push(umbenennen(x, suffix)));
}
if (kopien > 1) { d.dienste = { bereiche: [], bedarfe: [], plan: [], auto: false }; d.gta = []; }
d.plan = { platzierungen: [] }; d.staende = [];
d.schule.name = 'Benchmark ' + kopien * 12 + ' Klassen' + (enge ? ' (eng ' + enge + ')' : '');

// Engere Verfügbarkeit: Bei einem Teil der Lehrkräfte sind zufällig gewählte Stunden gesperrt (Wert 0 in der Verfügbarkeit).
// Jede Einschränkung wird nur behalten, wenn der Machbarkeitscheck danach keine neuen Fehler meldet – so wird der Plan so knapp wie möglich, aber lösbar.
let eingeschraenkt = 0;
if (enge > 0) {
  const fehlerZahl = () => k.machbarkeit(k.normalisiere(JSON.parse(JSON.stringify(d)))).filter(x => x.stufe === 'fehler').length;
  const D = d.schule.tage.length, H = d.schule.stunden.length;
  for (const l of d.lehrer) {
    if (l.art === 'personal' || l.art === 'co' || l.ausgebildet === false || rnd() >= enge) continue;
    const alt = JSON.parse(JSON.stringify(l.verfuegbarkeit));
    for (let i = 0; i < 14; i++) { const dt = Math.floor(rnd() * D), h = Math.floor(rnd() * H); if (l.verfuegbarkeit[dt] && l.verfuegbarkeit[dt][h] > 0) l.verfuegbarkeit[dt][h] = 0; }
    if (fehlerZahl() > 0) l.verfuegbarkeit = alt; else eingeschraenkt++;
  }
}

const norm = k.normalisiere(d);
const m = k.machbarkeit(norm), fehler = m.filter(x => x.stufe === 'fehler');
const out = path.resolve(opt('out', path.join('bench', 'daten', 'synth-' + kopien * 12 + (enge ? '-eng' + Math.round(enge * 100) : '') + '.json')));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(norm) + '\n');
const bloecke = norm.unterrichte.reduce((a, u) => a + (u.aufgabe ? 0 : 1), 0);
console.log(path.relative(process.cwd(), out) + ': ' + norm.klassen.length + ' Klassen, ' + norm.lehrer.length + ' Personen, ' + norm.raeume.length + ' Räume, ' + bloecke + ' Unterrichte, ' + norm.unterrichte.reduce((a, u) => a + (u.wochenstunden || 0), 0) + ' Wochenstunden · Machbarkeit: ' + fehler.length + ' Fehler, ' + (m.length - fehler.length) + ' Hinweise/Warnungen' + (enge ? ' · ' + eingeschraenkt + ' Lehrkräfte eingeschränkt' : ''));
fehler.slice(0, 5).forEach(x => console.log('  FEHLER: ' + x.text.slice(0, 200)));
process.exit(fehler.length ? 1 : 0);
