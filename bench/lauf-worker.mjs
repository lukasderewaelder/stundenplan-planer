// Ein Lauf der Gesamtberechnung (loeseStundenplan) in einem eigenen Thread; liefert die Kennzahlen als schlichtes Objekt.
import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { ladeEngine } from '../tools/lade-engine.mjs';

const { pfad, konf, aendere } = workerData;
const k = ladeEngine({ aendere: aendere ? new Function('t', aendere) : null });
const daten = k.datenstandLaden(JSON.parse(fs.readFileSync(pfad, 'utf8')));

const t0 = performance.now();
const out = await k.loeseStundenplan(daten, konf, {});
const dauer = (performance.now() - t0) / 1000;
const s = out.statistik || {}, end = out.end || {};

// Zeitpunkt der letzten Verbesserung des besten Standes (aus dem Verlauf der Suche)
const verlauf = out.verlauf || [];
const endK = verlauf.length ? verlauf[verlauf.length - 1].k : 0;
let letzteVerbesserung = 0;
for (const v of verlauf) if (v.k > endK + 1e-9) letzteVerbesserung = v.t;
const sucheSek = verlauf.length ? verlauf[verlauf.length - 1].t : dauer;

const plan = JSON.stringify(out.platzierungen.map(p => [p.unterricht, p.blockNr, p.tag, p.stunde, p.dauer, p.raum, (p.co || []).slice().sort().join(',')]).sort());
const az = s.ausgleich || {}, auf = s.aufsicht || {}, co = s.coNachlauf || {};
parentPort.postMessage({
  seed: konf.seed, strategie: s.strategie, dauer, sucheSek, letzteVerbesserung,
  iterationen: s.iterationen || 0, iterProSek: sucheSek > 0 ? (s.iterationen || 0) / sucheSek : 0, phase1Iter: s.phase1Iter,
  abbruch: s.abbruch, hart: out.hart, endHart: end.hart, ampel: end.ampel, weich: out.weich, unplatziert: s.unplatziert || 0,
  coOffenSuche: s.coOffen, coFehlend: (co.fehlend || []).length, coTeilweise: (co.teilweise || []).length,
  offenMin: auf.offenMin, offenSpringer: auf.offenSpringer, offenSoll: auf.offenSoll, aufsichtSek: (auf.zeit || 0) / 1000,
  ausgleichSd: az.sd, ausgleichMin: az.min, ausgleichMax: az.max,
  pflichtOffen: (end.pflicht || []).filter(p => !p.ok).map(p => p.id + '×' + p.anzahl), hinweise: Array.isArray(end.hinweise) ? end.hinweise.length : 0,
  verstoesse: Array.from(out.verstoesse || []), planHash: crypto.createHash('sha1').update(plan).digest('hex').slice(0, 12)
});
