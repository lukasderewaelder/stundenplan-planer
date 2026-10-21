// Invarianten-Test des Planzustands (class Plan): Nach zufälligen Zügen müssen
//   1. nach commit(): die inkrementell gepflegten Kosten (tot, vK, vL, vE, vU), die Belegung (occ, rocc) und die Personalkosten
//      gleich dem Ergebnis einer Neuberechnung aus dem Zustand sein (frischer Plan + setzeZustand, das alles von Grund auf bucht und bewertet),
//   2. nach rollback(): Zustand (start, raum, co, lk, aktiv), Belegung und Kosten exakt wie vor begin() sein.
// Das ist die Absicherung für jede Beschleunigung der Bewertung (frühe Abbrüche, Caches, weniger Allokationen).
//   node tools/invarianten.mjs [--schritte 400] [--seed 1] [--daten pfad.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ladeEngine } from './lade-engine.mjs';

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function zufall(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gleichArr = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const nahe = (x, y) => Math.abs(x - y) <= 1e-6 * (1 + Math.abs(y));

// Zustand einer Plan-Instanz als Momentaufnahme (zum Vergleich nach rollback)
function momentaufnahme(P) {
  return { z: P.zustand(), occ: P.occ.slice(), rocc: P.rocc.slice(), tot: P.tot.slice(), vK: P.vK.slice(), vL: P.vL.slice(), vE: P.vE.slice(), vU: P.vU.slice(),
    pHart: P.pHart, pWeich: P.pWeich };
}
function zustandGleich(a, b) {
  const f = [];
  for (const k of ['start', 'raum', 'co', 'lk']) if (!gleichArr(Array.from(a.z[k]), Array.from(b.z[k]))) f.push('Zustand.' + k);
  if ((a.z.aktiv || b.z.aktiv) && !gleichArr(Array.from(a.z.aktiv), Array.from(b.z.aktiv))) f.push('Zustand.aktiv');
  for (const k of ['occ', 'rocc', 'tot', 'vK', 'vL', 'vE', 'vU']) if (!gleichArr(Array.from(a[k]), Array.from(b[k]))) f.push(k);
  if (a.pHart !== b.pHart) f.push('pHart ' + a.pHart + ' ≠ ' + b.pHart);
  if (!nahe(a.pWeich, b.pWeich)) f.push('pWeich ' + a.pWeich + ' ≠ ' + b.pWeich);
  return f;
}

// Frisch aus dem Zustand von P aufgebauter Plan: die Wahrheit, gegen die der inkrementelle Stand geprüft wird
function gegenprobe(Plan, M, P) {
  const Q = new Plan(M);
  Q.setzeZustand(P.zustand());
  const f = [];
  if (!gleichArr(Array.from(P.occ), Array.from(Q.occ))) f.push('occ');
  if (!gleichArr(Array.from(P.rocc), Array.from(Q.rocc))) f.push('rocc');
  P.tot.forEach((x, r) => { if (!nahe(x, Q.tot[r])) f.push('tot[' + r + '] ' + x + ' ≠ ' + Q.tot[r]); });
  for (const k of ['vK', 'vL', 'vE', 'vU']) P[k].forEach((x, i) => { if (!nahe(x, Q[k][i])) f.push(k + '[' + i + '] ' + x + ' ≠ ' + Q[k][i]); });
  if (P.pLast) {
    if (P.pHart !== Q.pHart) f.push('pHart ' + P.pHart + ' ≠ ' + Q.pHart);
    if (!nahe(P.pWeich, Q.pWeich)) f.push('pWeich ' + P.pWeich + ' ≠ ' + Q.pWeich);
    P.pLast.forEach((x, t) => { if (!nahe(x, Q.pLast[t])) f.push('pLast[' + t + ']'); });
    if (!gleichArr(Array.from(P.pPaar), Array.from(Q.pPaar))) f.push('pPaar');
    P.pAz.forEach((x, t) => { if (!nahe(x, Q.pAz[t])) f.push('pAz[' + t + ']'); });
  }
  // who: jede belegte Zelle verweist auf ein Ereignis, das die Zelle tatsächlich belegt (Konflikte bei Doppelbelegung eingeschlossen)
  return f;
}

// Eine Folge zufälliger Züge auf einem frisch kompilierten Modell; liefert die Liste der Verstöße (leer = in Ordnung)
function lauf(k, daten, opt, schritte, seed) {
  const Plan = k.hole('Plan');
  const rnd = zufall(seed), ri = n => Math.floor(rnd() * n);
  const data = opt.personal ? k.personalGrundlage(JSON.parse(JSON.stringify(daten)), {}) : JSON.parse(JSON.stringify(daten));
  const M = k.kompiliere(data, { gelockert: [], minimal: false, referenz: null, personal: !!opt.personal, muster: !!opt.muster });
  const P = new Plan(M), P0 = P;
  const E = M.E.length, S = M.S, NP = (M.PE || []).length;
  const verstoesse = [], statistik = { commit: 0, rollback: 0, zuege: {} };
  const melde = (wo, f) => { if (f.length && verstoesse.length < 12) verstoesse.push(wo + ': ' + f.slice(0, 6).join('; ')); };
  const zaehle = n => { statistik.zuege[n] = (statistik.zuege[n] || 0) + 1; };

  // Ausgangslage wie in loeseUnterricht: feste Ereignisse roh setzen, Kosten neu berechnen, anteilige Co-Lehrkräfte verteilen
  for (let e = 0; e < E; e++) { const ev = M.E[e]; if (ev.fixStart >= 0) { P.fest[e] = 1; P.setzeRoh(e, ev.fixStart, null, null); } }
  P.initKosten();
  if (M.U.some(U => U.coZiel.length)) { P.begin(); M.U.forEach((U, u) => { if (U.coZiel.length) P.coNeu(u); }); P.commit(); }
  melde('Ausgangslage', gegenprobe(Plan, M, P));

  const beweglich = []; for (let e = 0; e < E; e++) if (!P.fest[e] && M.E[e].erlaubt.length) beweglich.push(e);
  const zufEv = () => beweglich[ri(beweglich.length)];
  const musterEv = []; if (M.musterEv) M.musterEv.forEach(g => { if (g) for (const e of g.d2.concat(g.d1, g.bi)) musterEv.push(e); });

  // Zugarten: (Name, Gewicht, Funktion) – jede arbeitet innerhalb begin() … commit()/rollback()
  const zuege = [
    ['platziere', 6, () => { const e = zufEv(); const L = M.E[e].erlaubt; if (!L.length) return; P.platziere(e, L[ri(L.length)], rnd() < 0.3); }],
    ['entferne', 2, () => { P.entferne(zufEv()); }],
    ['tausche', 3, () => {
      const e1 = zufEv(), e2 = zufEv(); if (e1 === e2 || P.start[e1] < 0 || P.start[e2] < 0) return;
      const s1 = P.start[e1], s2 = P.start[e2]; P.entferne(e1); P.entferne(e2); P.platziere(e1, s2, false); P.platziere(e2, s1, false);
    }],
    ['raumwechsel', 2, () => {
      const e = zufEv(), s = P.start[e]; if (s < 0) return; const ev = M.E[e], p = ri(ev.parts.length), part = ev.parts[p];
      if (!part.cands || part.cands.length < 2) return; const r = part.cands[ri(part.cands.length)];
      if (r === P.raum[P.rOff[e] + p] || !P.raumFrei(r, s, ev.dur, ev.wochen)) return;
      P.touch(e); P._belegeRaum(e, p, -1); P.raum[P.rOff[e] + p] = r; P._belegeRaum(e, p, 1);
    }]
  ];
  if (NP) zuege.push(['lehrkraft', 3, () => {
    const p = ri(NP), pe = M.PE[p]; if (!pe.cands.length) return;
    const t = rnd() < 0.1 ? -1 : pe.cands[ri(pe.cands.length)];
    P.setzeLehrer(p, t);
    // Wie die Suche: danach die Blöcke der Einheit, die jetzt mit der Lehrkraft kollidieren, herausnehmen und neu legen
    for (const e of pe.evs) if (P.start[e] >= 0 && P.lehrerKonflikt(e)) { const s = P.start[e]; P.entferne(e); const L = M.E[e].erlaubt; if (L.length) P.platziere(e, L[ri(L.length)], false); }
  }]);
  if (musterEv.length) zuege.push(['blockaufteilung', 2, () => {
    const e = musterEv[ri(musterEv.length)]; P.setzeAktiv(e, M.aktiv[e] ? 0 : 1);
    if (M.aktiv[e]) { const L = M.E[e].erlaubt; if (L.length) P.platziere(e, L[ri(L.length)], false); }
  }]);
  const summe = zuege.reduce((a, z) => a + z[1], 0);
  const waehle = () => { let x = rnd() * summe; for (const z of zuege) { x -= z[1]; if (x <= 0) return z; } return zuege[0]; };

  // Etwas Grundbelegung, damit die Züge auf einem gefüllten Plan arbeiten
  for (const e of beweglich.slice().sort(() => rnd() - 0.5)) { P.begin(); const L = M.E[e].erlaubt; if (L.length && P.platziere(e, L[ri(L.length)], false)) P.commit(); else P.rollback(); }
  melde('Grundbelegung', gegenprobe(Plan, M, P));

  const meldungenGleich = wo => { const a = k.bewerteAlles(M, P, null), b = k.bewerteAlles(M, P, []), f = []; a.forEach((x, r) => { if (!nahe(x, b[r])) f.push('Regel ' + k.hole('REGELN')[r].id + ': ohne Meldungen ' + x + ', mit Meldungen ' + b[r]); }); melde(wo, f); };
  const referenzGleich = (wo, P = P0) => {
    const f = [];
    for (let t = 0; t < M.T; t++) { const a = k.R_H01(M, P, t, null), b = k.R_H01_ref(M, P, t, []); if (!nahe(a, b)) f.push('R_H01 Lehrkraft ' + t + ': ' + a + ' statt Referenz ' + b); }
    for (let c = 0; c < M.C; c++) {
      const a = k.R_H02(M, P, c, null), b = k.R_H02_ref(M, P, c, []); if (!nahe(a, b)) f.push('R_H02 Klasse ' + c + ': ' + a + ' statt Referenz ' + b);
      const a2 = k.R_W17(M, P, c, null), b2 = k.R_W17_ref(M, P, c, []); if (!nahe(a2, b2)) f.push('R_W17 Klasse ' + c + ': ' + a2 + ' statt Referenz ' + b2);
    }
    melde(wo, f);
  };
  for (let i = 0; i < schritte && beweglich.length; i++) {
    const vor = momentaufnahme(P);
    const [name, , f] = waehle(); zaehle(name);
    P.begin();
    try { f(); } catch (err) { melde('Schritt ' + i + ' (' + name + ') warf', [String(err && err.stack || err).split('\n').slice(0, 3).join(' | ')]); P.rollback(); continue; }
    // Drei Ausgänge wie in der Suche: angenommen (commit), verworfen nach Bewertung (commit, dann rollback – der Normalfall bei abgelehnten
    // Zügen) und abgebrochen vor der Bewertung (rollback ohne commit, z. B. wenn platziere scheitert)
    const x = rnd();
    if (x < 0.4) { P.commit(); statistik.commit++; melde('Schritt ' + i + ' (' + name + ') nach commit', gegenprobe(Plan, M, P)); }
    else if (x < 0.8) { P.commit(); P.rollback(); statistik.rollback++; melde('Schritt ' + i + ' (' + name + ') nach commit + rollback', zustandGleich(vor, momentaufnahme(P))); }
    else { P.rollback(); statistik.rollback++; melde('Schritt ' + i + ' (' + name + ') nach rollback ohne commit', zustandGleich(vor, momentaufnahme(P))); }
    if (i % 40 === 39) referenzGleich('Schritt ' + i + ' (Regeln gleich Referenz)');
    if (i % 40 === 39) meldungenGleich('Schritt ' + i + ' (Zählung ohne = mit Einzelmeldungen)');
    if (verstoesse.length >= 12) break;
  }
  referenzGleich('Schluss (Regeln gleich Referenz)');
  // zusätzlich ein Plan voller Doppelbelegungen (jeder Block roh an einen zufälligen zulässigen Platz): hier sind die Regeln H01/H02/W17 nicht null
  { const Q = new Plan(M); for (const e of beweglich) { if (!M.aktiv[e]) continue; const L = M.E[e].erlaubt; if (!L.length) continue; Q.setzeRoh(e, L[ri(L.length)], null, null); } Q.initKosten();
    referenzGleich('Plan mit Doppelbelegungen (Regeln gleich Referenz)', Q);
    const n = [...Array(M.T).keys()].filter(t2 => k.R_H01_ref(M, Q, t2, []) > 0).length + [...Array(M.C).keys()].filter(c2 => k.R_H02_ref(M, Q, c2, []) > 0).length;
    if (!n && beweglich.length > 4) melde('Plan mit Doppelbelegungen', ['enthält keine Doppelbelegung – der Vergleich wäre wertlos']); }
  meldungenGleich('Schluss (Zählung ohne = mit Einzelmeldungen)');
  // zum Schluss: Bewertung des Gesamtplans (bewerteAlles) muss die inkrementelle Summe für alle Regeln außer H03/H08 treffen
  const alle = k.bewerteAlles(M, P, null), RI = k.hole('RI'), f = [];
  alle.forEach((x, r) => { if (r === RI.H03 || r === RI.H08) return; if (!nahe(x, P.tot[r])) f.push('Regel ' + k.hole('REGELN')[r].id + ': inkrementell ' + P.tot[r] + ', bewerteAlles ' + x); });
  melde('Schluss (bewerteAlles)', f);
  return { verstoesse, statistik, ereignisse: E, beweglich: beweglich.length };
}

export function datensaetze(k, extraPfade = []) {
  const liste = [];
  const ladeJson = (name, pfad) => { try { liste.push({ name, daten: k.datenstandLaden(JSON.parse(fs.readFileSync(pfad, 'utf8'))) }); } catch (err) { liste.push({ name, fehler: String(err.message || err) }); } };
  liste.push({ name: 'Gesamttest (2 Klassen, Co, Personal)', daten: k.gesamtTestDaten() });
  liste.push({ name: 'Beispieldaten (12 Klassen, 19 Lehrkräfte)', daten: k.beispieldaten() });
  const privat = path.join(wurzel, 'bench', 'daten', 'privat');
  if (fs.existsSync(privat)) for (const f of fs.readdirSync(privat).filter(x => x.endsWith('.json'))) ladeJson('privat/' + f, path.join(privat, f));
  extraPfade.forEach(p => ladeJson(path.basename(p), p));
  return liste;
}

const VARIANTEN = [['ohne Personal, feste Blöcke', { personal: false, muster: false }], ['mit Personal und variabler Blockaufteilung', { personal: true, muster: true }]];

// Ergebnis im Format der Selbsttests: [{ id, name, ok, info }]
export function invarianten({ schritte = 300, seed = 1, extraPfade = [], aendere = null, datensatz = null } = {}) {
  const k = ladeEngine({ mitTests: true, aendere, zusatz: [fs.readFileSync(path.join(wurzel, 'tools', 'referenz-regeln.js'), 'utf8')] });
  const erg = [];
  let nr = 0;
  for (const ds of datensaetze(k, extraPfade).filter((_, i) => datensatz === null || i === datensatz)) {
    for (const [vname, opt] of VARIANTEN) {
      const id = 'INV' + String(++nr).padStart(2, '0'), name = 'Planzustand-Invarianten: ' + ds.name + ' – ' + vname;
      if (ds.fehler) { erg.push({ id, name, ok: false, info: 'Datensatz nicht ladbar: ' + ds.fehler }); continue; }
      try {
        const r = lauf(k, ds.daten, opt, schritte, seed);
        erg.push({ id, name, ok: r.verstoesse.length === 0, info: r.verstoesse.length ? r.verstoesse.join('\n') : r.statistik.commit + ' commit, ' + r.statistik.rollback + ' rollback, ' + r.beweglich + ' bewegliche von ' + r.ereignisse + ' Ereignissen; ' + Object.entries(r.statistik.zuege).map(([n, c]) => n + ' ' + c).join(', ') });
      } catch (err) { erg.push({ id, name, ok: false, info: 'Fehler: ' + String(err && err.stack || err).split('\n').slice(0, 4).join(' | ') }); }
    }
  }
  return erg;
}

// Mutationstest: Der Invarianten-Test muss absichtlich eingebaute Fehler im Planzustand finden – sonst prüft er nichts.
// Jede Mutation ersetzt genau eine Textstelle der Engine (kommt sie nicht genau einmal vor, schlägt der Test fehl: Mutation veraltet).
const MUTATIONEN = [
  ['Lehrkraft-Zeilen werden bei Änderungen nicht neu bewertet', 'for (const t of ev.lehrer) if (this.stL[t] !== tx) { this.stL[t] = tx; this.dL.push(t); }', ''],
  ['rollback stellt die Gesamtkosten nicht wieder her', 'this.tot.set(this.totSv);', ''],
  ['rollback bucht den ersten Block nicht wieder ein', 'for (let i = 0; i < n; i++) this._belege(this.logE[i], 1);', 'for (let i = 1; i < n; i++) this._belege(this.logE[i], 1);'],
  ['Personalwechsel vergisst die Last der alten Lehrkraft', 'this.pLast[alt] -= pe.std;', ''],
  // Datensatz 1 = Beispieldaten mit Zeitprofilen: dort gibt es Überschneidungen in echter Uhrzeit
  ['Zählung der Zeitüberschneidungen ohne Einzelmeldungen prüft die Uhrzeit nicht', '((sb / H) | 0) !== da || !(a0 < _zuA1[j] && _zuA0[j] < a1)', '((sb / H) | 0) !== da', 1]
];
export function mutationstest({ schritte = 150, seed = 1 } = {}) {
  return MUTATIONEN.map(([name, von, nach, datensatz = 0], i) => {
    const id = 'MUT' + String(i + 1).padStart(2, '0');
    let anzahl = 0;
    const aendere = text => { anzahl = text.split(von).length - 1; return anzahl === 1 ? text.replace(von, () => nach) : text; };
    const r = invarianten({ schritte, seed, aendere, datensatz });
    if (anzahl !== 1) return { id, name: 'Mutation „' + name + '“ wird erkannt', ok: false, info: 'Mutation veraltet: Textstelle kommt ' + anzahl + '× vor (erwartet 1×)' };
    const gefunden = r.filter(x => !x.ok).length;
    return { id, name: 'Mutation „' + name + '“ wird erkannt', ok: gefunden > 0, info: gefunden ? gefunden + ' von ' + r.length + ' Läufen schlagen an' : 'NICHT erkannt – der Invarianten-Test ist an dieser Stelle blind' };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg =(n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
  const erg = invarianten({ schritte: Number(arg('schritte', 300)), seed: Number(arg('seed', 1)), extraPfade: arg('daten') ? [arg('daten')] : [] });
  for (const x of erg) console.log((x.ok ? 'ok      ' : 'FEHLER  ') + x.id + ' ' + x.name + '\n          ' + String(x.info).split('\n').join('\n          '));
  process.exit(erg.every(x => x.ok) ? 0 : 1);
}
