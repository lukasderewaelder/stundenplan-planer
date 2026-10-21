// ---------- Kontexte für Klassen und Lehrkräfte ----------
function istAktiv(M, P, e, t) {
  const ev = M.E[e];
  if (ev.immer.includes(t)) return true;
  const cb = P.cOff[e];
  for (let j = 0; j < ev.co.length; j++) if (ev.co[j].t === t && P.co[cb + j]) return true;
  return false;
}
// w = -1: beide Wochen zusammen; 0/1: nur Woche A bzw. B (für Klassen mit 14-tägigen Blöcken). K.wechsel: die Klasse hat solche Blöcke im Plan.
function bauK(M, P, c, w) {
  const K = P.K, H = M.H;
  if (w === undefined) w = -1;
  K.c = c; K.belegt.fill(0); K.ev.fill(-1); K.wechsel = false;
  for (const e of M.kEv[c]) {
    const s0 = P.start[e]; if (s0 < 0) continue;
    const ev = M.E[e], p = ev.kp.get(c)[0];
    if (ev.wochen.length === 1) { K.wechsel = true; if (w >= 0 && ev.wochen[0] !== w) continue; }
    for (let k = 0; k < ev.dur; k++) { const s = s0 + k; if (s >= M.S) break; K.belegt[s]++; K.ev[s] = e; K.part[s] = p; }
  }
  for (let d = 0; d < M.D; d++) {
    let n = 0, a = -1, z = -1;
    for (let h = 0; h < H; h++) if (K.belegt[d * H + h] > 0 && !M.pause[h]) { n++; if (a < 0) a = h; z = h; }
    K.n[d] = n; K.a[d] = a; K.z[d] = z;
  }
}
function bauL(M, P, t, w) {
  const L = P.L, H = M.H;
  if (w === undefined) w = -1;
  L.t = t; L.belegt.fill(0); L.ev.fill(-1); L.unt.fill(0); L.wechsel = false;
  for (const e of M.lEv[t]) {
    const s0 = P.start[e]; if (s0 < 0 || !istAktiv(M, P, e, t)) continue;
    const ev = M.E[e];
    if (ev.wochen.length === 1) { L.wechsel = true; if (w >= 0 && ev.wochen[0] !== w) continue; }
    for (let k = 0; k < ev.dur; k++) { const s = s0 + k; if (s >= M.S) break; L.belegt[s]++; L.ev[s] = e; if (!ev.aufgabe) L.unt[s]++; }
  }
  for (let d = 0; d < M.D; d++) {
    let n = 0, nu = 0, a = -1, z = -1;
    for (let h = 0; h < H; h++) if (L.belegt[d * H + h] > 0 && !M.pause[h]) { n++; if (L.unt[d * H + h] > 0) nu++; if (a < 0) a = h; z = h; }
    L.n[d] = n; L.nu[d] = nu; L.a[d] = a; L.z[d] = z;
  }
}
const evName = (M, e) => { const ev = M.E[e]; return ev.parts.map(p => M.U[p.u].name).join(' + ') + (M.U[ev.parts[0].u].bloecke.length > 1 ? ' (Block ' + (ev.parts[0].b + 1) + ')' : '') + (ev.woche && ev.woche !== 'jede' ? ' [Woche ' + ev.woche + ']' : ''); };
const tagName = (M, d) => M.data.schule.tage[d] || ('Tag ' + (d + 1));
function vm(det, r, text, extra) { if (det) det.push(Object.assign({ r, text }, extra || {})); }

/* ---------- Regelfunktionen: jede Regel als eigene Funktion ----------
   Signatur: (M, P, index, det) → Anzahl der Verstöße; det (Array) sammelt Einzelverstöße.
   Klassen-/Lehrerregeln lesen den Kontext P.K / P.L (vorher bauK/bauL).                */

// Überschneidungen in echter Uhrzeit zwischen Blöcken in VERSCHIEDENEN Rasterstunden (entstehen nur durch unterschiedliche Zeitprofile).
// aktiv(e) → zählt das Ereignis?; gleich(a, b) → betreffen beide dieselbe Ressource? Blöcke im selben Slot zählt schon die Rasterprüfung.
function zeitUeberschneidungen(M, P, liste, aktiv, gleich, det, regel, wer, extra) {
  const H = M.H; let v = 0;
  for (let i = 0; i < liste.length; i++) {
    const a = liste[i], sa = P.start[a]; if (sa < 0 || !aktiv(a)) continue;
    const ea = M.E[a], da = Math.floor(sa / H), ha = sa % H, ta = M.zeitTab[ea.zg];
    const a0 = ta.s[ha], a1 = ta.e[ha + ea.dur - 1]; if (a0 < 0 || a1 < 0) continue;
    for (let j = i + 1; j < liste.length; j++) {
      const b = liste[j], sb = P.start[b]; if (sb < 0 || Math.floor(sb / H) !== da || !aktiv(b)) continue;
      const eb = M.E[b]; if (eb.zg === ea.zg) continue;
      if (sa < sb + eb.dur && sb < sa + ea.dur) continue; // gemeinsame Rasterstunde: schon gezählt
      if (ea.wochen.length === 1 && eb.wochen.length === 1 && ea.wochen[0] !== eb.wochen[0]) continue;
      const hb = sb % H, tb = M.zeitTab[eb.zg], b0 = tb.s[hb], b1 = tb.e[hb + eb.dur - 1];
      if (b0 < 0 || b1 < 0 || !(a0 < b1 && b0 < a1)) continue;
      if (gleich && !gleich(ea, eb)) continue;
      v++;
      vm(det, regel, wer + ' ist ' + tagName(M, da) + ' zugleich in ' + evName(M, a) + ' (' + zeitText(a0) + '–' + zeitText(a1) + ') und ' + evName(M, b) + ' (' + zeitText(b0) + '–' + zeitText(b1) + ') – die Zeitprofile überschneiden sich.', Object.assign({ e: [a, b], s: sa, zeit: true }, extra));
    }
  }
  return v;
}
function R_H01(M, P, t, det) { // Lehrkraft nicht doppelt belegt
  const S = M.S, W = P.scW; W.fill(0); let v = 0;
  for (const e of M.lEv[t]) {
    const s0 = P.start[e]; if (s0 < 0 || !istAktiv(M, P, e, t)) continue;
    const ev = M.E[e];
    for (let k = 0; k < ev.dur; k++) for (const w of ev.wochen) W[w * S + s0 + k]++;
  }
  for (let s = 0; s < S; s++) {
    const m = Math.max(W[s], W[S + s]);
    if (m > 1) { v += m - 1; vm(det, 'H01', 'Lehrkraft ' + M.lKz[t] + ' ist ' + slotText(M, s) + ' Std. ' + m + '-fach eingeplant.', { l: [t], s }); }
  }
  if (M.lMix[t]) v += zeitUeberschneidungen(M, P, M.lEv[t], e => istAktiv(M, P, e, t), null, det, 'H01', 'Lehrkraft ' + M.lKz[t], { l: [t] });
  return v;
}
function R_H02(M, P, c, det) { // Klasse und Gruppe nicht doppelt belegt
  const S = M.S, U = P.scU, nu = M.kUnits[c].length; U.fill(0, 0, nu * 2 * S);
  for (const e of M.kEv[c]) {
    const s0 = P.start[e]; if (s0 < 0) continue;
    const ev = M.E[e];
    for (const u of ev.units) { if (M.unitK[u] !== c) continue; const lu = M.unitLokal[u]; for (let k = 0; k < ev.dur; k++) for (const w of ev.wochen) U[(lu * 2 + w) * S + s0 + k]++; }
  }
  let v = 0;
  for (let s = 0; s < S; s++) {
    let m = 0;
    for (let lu = 0; lu < nu; lu++) m = Math.max(m, U[(lu * 2) * S + s], U[(lu * 2 + 1) * S + s]);
    if (m > 1) { v += m - 1; vm(det, 'H02', 'Klasse ' + M.kName[c] + ' ist ' + slotText(M, s) + ' Std. doppelt belegt.', { k: [c], s }); }
  }
  if (M.kMix[c]) v += zeitUeberschneidungen(M, P, M.kEv[c], () => true, (a, b) => ((a.kMaske.get(c) || 0) & (b.kMaske.get(c) || 0)) !== 0 || M.kUnits[c].length === 1, det, 'H02', 'Klasse ' + M.kName[c], { k: [c] });
  return v;
}
function R_W17(M, P, c, det) { // Halbgruppen füllen sich auf – nutzt die von R_H02 gefüllte Gruppenbelegung (direkt danach aufrufen)
  const nu = M.kUnits[c].length; if (nu < 2) return 0;
  const S = M.S, H = M.H, U = P.scU, sch = M.kUnitSch[c], voll = sch[0];
  let v = 0;
  for (let s = 0; s < S; s++) {
    if (M.pause[s % H]) continue;
    let teil = 0, wer = '';
    for (let w = 0; w < 2; w++) {
      if (U[w * S + s] > 0) continue; // die ganze Klasse hat Unterricht
      let n = 0, da = 0, namen = '';
      for (let lu = 1; lu < nu; lu++) if (U[(lu * 2 + w) * S + s] > 0) { n += sch[lu]; da++; namen += (namen ? ', ' : '') + M.kUnitName[c][lu]; }
      if (da > 0 && da < nu - 1 && !(voll > 0 && n >= voll)) { teil++; wer = namen; }
    }
    if (teil) { v += teil / 2; vm(det, 'W17', 'Klasse ' + M.kName[c] + ': ' + slotText(M, s) + ' Std. hat nur Gruppe ' + wer + ' Unterricht – der Rest der Klasse ist frei.', { k: [c], s }); }
  }
  return v;
}
function R_H03(M, P, r, det) { // Raum nicht doppelt belegt (Raum-Bereich, nur Vollbewertung)
  const S = M.S, W = P.scW; W.fill(0);
  for (const e of M.rNutzer[r]) {
    const s0 = P.start[e]; if (s0 < 0) continue;
    const ev = M.E[e];
    for (let p = 0; p < ev.parts.length; p++) if (P.raum[P.rOff[e] + p] === r) for (let k = 0; k < ev.dur; k++) for (const w of ev.wochen) W[w * S + s0 + k]++;
  }
  let v = 0;
  for (let s = 0; s < S; s++) {
    const m = Math.max(W[s], W[S + s]) - M.rTeil[r];
    if (m > 0) { v += m; vm(det, 'H03', 'Raum ' + M.rName[r] + ' ist ' + slotText(M, s) + ' Std. überbelegt.', { raum: r, s }); }
  }
  // verschiedene Zeitprofile: Die Rasterstunden unterscheiden sich, die echten Uhrzeiten überschneiden sich
  if (M.rMix[r]) v += zeitUeberschneidungen(M, P, M.rNutzer[r], e => { const ev = M.E[e]; for (let p = 0; p < ev.parts.length; p++) if (P.raum[P.rOff[e] + p] === r) return true; return false; }, null, det, 'H03', 'Raum ' + M.rName[r], { raum: r });
  return v;
}
function R_H04(M, P, u, det) { // Sollstunden erfüllt
  let v = 0;
  for (const e of M.uEv[u]) if (P.start[e] < 0 && M.aktiv[e]) { v += M.E[e].dur; vm(det, 'H04', evName(M, e) + ' ist nicht platziert (' + M.E[e].dur + ' UStd.).', { e: [e], k: M.E[e].klassen, l: M.E[e].lehrer }); }
  return v;
}
function R_H05(M, P, e, det) { // Sperrzeiten eingehalten
  const s0 = P.start[e]; if (s0 < 0) return 0;
  const ev = M.E[e], S = M.S; let v = 0;
  for (let k = 0; k < ev.dur; k++) {
    const s = s0 + k; if (s >= S) break;
    for (const t of ev.lehrer) if (istAktiv(M, P, e, t) && M.lVerf[t * S + s] === 0) { v++; vm(det, 'H05', 'Lehrkraft ' + M.lKz[t] + ' ist ' + slotText(M, s) + ' Std. gesperrt (' + evName(M, e) + ').', { e: [e], l: [t], s }); }
    for (let p = 0; p < ev.parts.length; p++) { const r = P.raum[P.rOff[e] + p]; if (r >= 0 && M.rVerf[r * S + s] === 0) { v++; vm(det, 'H05', 'Raum ' + M.rName[r] + ' ist ' + slotText(M, s) + ' Std. gesperrt.', { e: [e], raum: r, s }); } }
    // Aufgabenblock über eine Pause, die für die Person gesperrt ist
    if (ev.aufgabe && k < ev.dur - 1) for (const t of ev.immer) if (M.lGap[t * S + s]) { v++; vm(det, 'H05', 'Lehrkraft ' + M.lKz[t] + ': Die Pause nach der ' + slotText(M, s) + ' Std. ist gesperrt (' + evName(M, e) + ' liegt darüber).', { e: [e], l: [t], s }); }
  }
  return v;
}
function R_H06(M, P, e, det) { // Raum passend
  const s0 = P.start[e]; if (s0 < 0) return 0;
  const ev = M.E[e]; let v = 0;
  for (let p = 0; p < ev.parts.length; p++) {
    const part = ev.parts[p]; if (!part.cands) continue;
    const r = P.raum[P.rOff[e] + p];
    if (r < 0) { v++; vm(det, 'H06', evName(M, e) + ': kein freier passender Raum (' + part.typ + ').', { e: [e], k: ev.klassen }); continue; }
    const typOk = part.raumFix >= 0 ? r === part.raumFix : M.rTyp[r] === part.typ;
    if (!typOk || M.rKap[r] < part.schueler) { v++; vm(det, 'H06', evName(M, e) + ': Raum ' + M.rName[r] + ' passt nicht (Typ oder Kapazität).', { e: [e], raum: r }); }
  }
  return v;
}
function R_H07(M, P, u, det) { // Blockstruktur
  const evs = M.uEv[u], H = M.H; let v = 0;
  for (const e of evs) {
    const s0 = P.start[e]; if (s0 < 0) continue;
    const ev = M.E[e], h = s0 % H;
    if (!ev.aufgabe && ev.dur === 2 && (!M.dbl[h] || h + 1 >= H || M.pause[h + 1])) { v++; vm(det, 'H07', evName(M, e) + ': Doppelblock darf ' + slotText(M, s0) + ' Std. nicht beginnen.', { e: [e], s: s0 }); }
  }
  if (!M.U[u].aufgabe) for (let i = 0; i < evs.length; i++) for (let j = i + 1; j < evs.length; j++) {
    const a = P.start[evs[i]], b = P.start[evs[j]];
    if (a >= 0 && b >= 0 && Math.floor(a / H) === Math.floor(b / H)) { v++; vm(det, 'H07', M.U[u].name + ': zwei Blöcke am selben Tag (' + tagName(M, Math.floor(a / H)) + ').', { e: [evs[i], evs[j]], k: M.U[u].klassen }); }
  }
  return v;
}
function R_H08(M, P, det) { // Kopplung eingehalten (global)
  let v = 0;
  for (const grp of M.kopplungen) {
    const sig = j => M.uEv[j].map(e => P.start[e] + ':' + M.E[e].dur).sort().join(',');
    const s0 = sig(grp[0]);
    for (let q = 1; q < grp.length; q++) if (sig(grp[q]) !== s0) { v++; vm(det, 'H08', (M.U[grp[0]].band ? M.U[grp[0]].kopplung : 'Kopplung „' + M.U[grp[0]].kopplung + '“') + ': ' + M.U[grp[q]].name + ' liegt nicht zeitgleich mit ' + M.U[grp[0]].name + '.', { e: M.uEv[grp[q]] }); }
  }
  return v;
}
function R_H09(M, P, u, det) { // Fixierungen bleiben
  let v = 0;
  for (const e of M.uEv[u]) { const ev = M.E[e]; if (ev.fixStart >= 0 && P.start[e] !== ev.fixStart) { v++; vm(det, 'H09', evName(M, e) + ' liegt nicht auf seiner Fixierung ' + slotText(M, ev.fixStart) + ' Std.', { e: [e] }); } }
  return v;
}
function R_H10(M, P, e, det) { // Keine Pausenstunden
  const s0 = P.start[e]; if (s0 < 0) return 0;
  const ev = M.E[e], h = s0 % M.H; let v = 0;
  for (let k = 0; k < ev.dur; k++) if (h + k >= M.H || (!M.slotOk[s0 + k] && (!ev.aufgabe || (M.pause[h + k] && (k === 0 || k === ev.dur - 1) && !ev.pauseRand)))) { v++; vm(det, 'H10', evName(M, e) + (h + k < M.H && !M.pause[h + k] ? ' liegt nach dem Unterrichtsschluss (' + tagName(M, Math.floor(s0 / M.H)) + ' bis ' + M.schluss[Math.floor(s0 / M.H)] + '. Stunde).' : ' liegt in einer Pause.'), { e: [e], s: s0 }); }
  return v;
}
function R_H11(M, P, c, det) { // Klassenkorridor
  const K = P.K, H = M.H; let v = 0;
  for (let d = 0; d < M.D; d++) {
    for (let h = 0; h < H; h++) {
      if (M.pause[h] || !K.belegt[d * H + h]) continue;
      if (M.lnr[h] < M.kFrueh[c] || M.lnr[h] > M.kSpaet[c]) { v++; vm(det, 'H11', 'Klasse ' + M.kName[c] + ' hat ' + slotText(M, d * H + h) + ' Std. Unterricht außerhalb ihres Korridors.', { k: [c], s: d * H + h, e: [K.ev[d * H + h]] }); }
    }
    if (K.n[d] > M.kMax[c]) { v += K.n[d] - M.kMax[c]; vm(det, 'H11', 'Klasse ' + M.kName[c] + ' hat ' + tagName(M, d) + ' ' + K.n[d] + ' UStd. (max. ' + M.kMax[c] + ').', { k: [c] }); }
  }
  return v;
}
function R_H12(M, P, t, det) { // Lehrkraft-Tagesgrenzen
  const L = P.L; let v = 0;
  for (let d = 0; d < M.D; d++) {
    const n = L.nu[d]; if (!n) continue; // nur Unterricht – Aufgaben zählen nicht (für sie gilt die Arbeitszeit je Tag, H16)
    if (n > M.lMax[t]) { v += n - M.lMax[t]; vm(det, 'H12', 'Lehrkraft ' + M.lKz[t] + ' hat ' + tagName(M, d) + ' ' + n + ' UStd. (max. ' + M.lMax[t] + ').', { l: [t] }); }
    if (n < M.lMin[t]) { v += M.lMin[t] - n; vm(det, 'H12', 'Lehrkraft ' + M.lKz[t] + ' hat ' + tagName(M, d) + ' nur ' + n + ' Stunde(n) (min. ' + M.lMin[t] + ').', { l: [t] }); }
  }
  return v;
}
function R_H13(M, P, c, det) { // Fach je Tag begrenzt
  const F = M.F, A = P.scF, H = M.H; A.fill(0);
  if (!F) return 0;
  for (const e of M.kEv[c]) {
    const s0 = P.start[e]; if (s0 < 0) continue;
    const ev = M.E[e], d = Math.floor(s0 / H), ps = ev.kp.get(c);
    for (let q = 0; q < ps.length; q++) { const f = ev.parts[ps[q]].f; if (f < 0) continue; let dup = false; for (let q2 = 0; q2 < q; q2++) if (ev.parts[ps[q2]].f === f) dup = true; if (!dup) A[d * F + f] += ev.dur; }
  }
  let v = 0;
  for (let d = 0; d < M.D; d++) for (let f = 0; f < F; f++) { const mx = M.kfMax ? M.kfMax[c * F + f] : M.fMax[f], x = A[d * F + f] - mx; if (x > 0) { v += x; vm(det, 'H13', 'Klasse ' + M.kName[c] + ' hat ' + tagName(M, d) + ' ' + A[d * F + f] + '× ' + M.fKz[f] + ' (max. ' + mx + ').', { k: [c] }); } }
  return v;
}
function R_H14(M, P, u, det) { // Wochenrhythmus
  const U = M.U[u];
  if ((U.rhythmus !== 'jede' || U.blockWoche.some(w => w !== 'jede')) && M.data.schule.wochenrhythmus !== 'AB' && !U.abAuto) { vm(det, 'H14', U.name + ' ist als Woche ' + U.rhythmus + ' markiert, die Schule hat aber keinen A/B-Rhythmus.', { e: M.uEv[u] }); return 1; }
  return 0;
}
function R_H15(M, P, c, det) { // Klassen ohne Freistunden (weich gestellt → W02)
  const K = P.K, H = M.H, spaet = M.opt.spaeterBeginnErlaubt; let v = 0;
  const id = M.h15weich ? 'W02' : 'H15';
  for (let d = 0; d < M.D; d++) {
    if (!K.n[d]) continue;
    const a = K.a[d], z = K.z[d];
    for (let h = spaet ? a + 1 : 0; h < z; h++) {
      if (M.pause[h] || K.belegt[d * H + h]) continue;
      if (h < a && M.lnr[h] < M.kFrueh[c]) continue;
      v++; vm(det, id, 'Klasse ' + M.kName[c] + ': Freistunde ' + slotText(M, d * H + h) + ' Std.', { k: [c], s: d * H + h });
    }
  }
  return v;
}
function R_H16(M, P, t, det) { // Arbeitszeitgrenzen: Höchstarbeitszeit je Tag und Wochenarbeitszeit
  const tagMax = M.lTagMax[t], woMax = M.lWocheMax[t];
  if (!tagMax && !woMax) return 0;
  const D = M.D, H = M.H, A = P.scT; A.fill(0);
  let woche = M.lWocheFix[t], v = 0;
  for (const e of M.lEv[t]) {
    const s0 = P.start[e]; if (s0 < 0 || !istAktiv(M, P, e, t)) continue;
    const ev = M.E[e], d = Math.floor(s0 / H), m = ev.minAt[s0 % H];
    for (const w of ev.wochen) A[d * 2 + w] += m;
    woche += m * (ev.azF.get(t) || ev.wf) + (ev.azV.get(t) || 0);
  }
  if (tagMax) for (let d = 0; d < D; d++) {
    const m = Math.max(A[d * 2], A[d * 2 + 1]) + M.lTagFix[t * D + d];
    if (m > tagMax + 0.5) { const x = Math.ceil((m - tagMax) / M.stdMin - 1e-9); v += x; vm(det, 'H16', 'Lehrkraft ' + M.lKz[t] + ' hat ' + tagName(M, d) + ' ' + zahlDe(m / 60, 1) + ' h Einsatz (höchstens ' + zahlDe(tagMax / 60, 1) + ' h je Tag).', { l: [t], tag: d, n: x }); }
  }
  if (woMax && woche > woMax + 3) { const x = Math.ceil((woche - woMax) / M.stdMin - 1e-9); v += x; vm(det, 'H16', 'Lehrkraft ' + M.lKz[t] + ': ' + zahlDe(woche / 60, 1) + ' h Arbeitszeit aus Unterricht, Vorbereitung und Aufgaben (Wochenarbeitszeit ' + zahlDe(woMax / 60, 1) + ' h).', { l: [t], n: x }); }
  return v;
}
function R_W01(M, P, t, det) { // Freistunden der Lehrkräfte
  const L = P.L, H = M.H; let v = 0;
  for (let d = 0; d < M.D; d++) {
    if (L.n[d] < 2) continue;
    let g = 0;
    for (let h = L.a[d] + 1; h < L.z[d]; h++) if (!M.pause[h] && !L.belegt[d * H + h]) g++;
    if (g) { const x = g + 2 * Math.max(0, g - M.lHohl[t]); v += x; vm(det, 'W01', 'Lehrkraft ' + M.lKz[t] + ' hat ' + tagName(M, d) + ' ' + g + ' Freistunde(n).', { l: [t], n: x }); }
  }
  return v;
}
function R_W03(M, P, e, det) { // Ungern-Slots
  const s0 = P.start[e]; if (s0 < 0) return 0;
  const ev = M.E[e], S = M.S; let v = 0;
  for (const t of ev.lehrer) { if (!istAktiv(M, P, e, t)) continue; for (let k = 0; k < ev.dur; k++) if (M.lVerf[t * S + s0 + k] === -1) { v++; vm(det, 'W03', M.lKz[t] + ' unterrichtet ' + slotText(M, s0 + k) + ' Std. ungern.', { e: [e], l: [t] }); } }
  return v;
}
function R_W04(M, P, e, det) { // Gewünschte Slots nutzen
  const s0 = P.start[e]; if (s0 < 0) return 0;
  const ev = M.E[e], S = M.S; let v = 0;
  for (const t of ev.lehrer) { if (!M.lWunsch[t] || !istAktiv(M, P, e, t)) continue; for (let k = 0; k < ev.dur; k++) if (M.lVerf[t * S + s0 + k] !== 2) { v++; vm(det, 'W04', M.lKz[t] + ' unterrichtet ' + slotText(M, s0 + k) + ' Std. außerhalb gewünschter Zeiten.', { e: [e], l: [t] }); } }
  return v;
}
function R_W05(M, P, e, det) { // Freie Tage der Lehrkräfte
  const s0 = P.start[e]; if (s0 < 0) return 0;
  const ev = M.E[e], d = Math.floor(s0 / M.H); let v = 0;
  for (const t of ev.lehrer) if (M.lFrei[t * M.D + d] && istAktiv(M, P, e, t)) { v += ev.dur; vm(det, 'W05', M.lKz[t] + ' unterrichtet an ihrem/seinem Wunsch-freien Tag ' + tagName(M, d) + '.', { e: [e], l: [t] }); }
  return v;
}
function R_W06(M, P, c, det) { // Fächer gleichmäßig über die Woche
  const F = M.F; if (!F) return 0;
  const B = P.scFB, Mk = P.scFM; B.fill(0); Mk.fill(0);
  for (const e of M.kEv[c]) {
    const s0 = P.start[e]; if (s0 < 0) continue;
    const ev = M.E[e], d = Math.floor(s0 / M.H);
    const ps = ev.kp.get(c);
    for (let q = 0; q < ps.length; q++) { const f = ev.parts[ps[q]].f; if (f < 0) continue; let dup = false; for (let q2 = 0; q2 < q; q2++) if (ev.parts[ps[q2]].f === f) dup = true; if (dup) continue; B[f]++; Mk[f] |= (1 << d); }
  }
  let v = 0;
  for (let f = 0; f < F; f++) {
    if (!B[f]) continue;
    let x = Mk[f], days = 0; while (x) { days += x & 1; x >>>= 1; }
    const fehl = Math.min(B[f], M.D) - days;
    if (fehl > 0) { v += fehl; vm(det, 'W06', 'Klasse ' + M.kName[c] + ': ' + M.fKz[f] + ' liegt auf nur ' + days + ' Tag(en).', { k: [c], n: fehl }); }
  }
  return v;
}
function R_W07(M, P, e, det) { // Kernfächer früh
  const s0 = P.start[e]; if (s0 < 0) return 0;
  const ev = M.E[e]; let schwer = false;
  for (const p of ev.parts) if (p.f >= 0 && M.fSchwer[p.f]) schwer = true;
  if (!schwer) return 0;
  let v = 0; const h = s0 % M.H;
  for (let k = 0; k < ev.dur; k++) if (h + k < M.H && M.lnr[h + k] > M.opt.kernfachBis) { v++; vm(det, 'W07', evName(M, e) + ' liegt ' + slotText(M, s0 + k) + ' Std. (Kernfach nach der ' + M.opt.kernfachBis + '. Stunde).', { e: [e], k: ev.klassen }); }
  return v;
}
function R_W08(M, P, u, det) { // Doppelstunden nach Fachregel
  const U = M.U[u];
  if (U.muster && M.musterEv && M.musterEv[u]) {
    const g = M.musterEv[u]; let n2 = 0, n1 = 0, nb = 0;
    for (const e of g.d2) n2 += M.aktiv[e]; for (const e of g.d1) n1 += M.aktiv[e]; for (const e of g.bi) nb += M.aktiv[e];
    const v = musterStrafe(U.muster.regel, U.muster.ws, n2, n1, nb);
    if (v) vm(det, 'W08', U.name + ': Blockaufteilung ' + n2 + '× Doppel, ' + n1 + '× Einzel' + (nb ? ', 1× Doppel 14-tägig' : '') + ' – nach der Doppelstundenregel des Fachs nicht ideal.', { e: M.uEv[u].filter(e => M.aktiv[e]) });
    return v;
  }
  if (U.w08) vm(det, 'W08', U.name + ': Blockaufteilung ' + U.bloecke.map((d, q) => d + (U.blockWoche[q] !== 'jede' ? U.blockWoche[q] : '')).join('+') + ' widerspricht der Doppelstundenregel des Fachs.', { e: M.uEv[u] });
  return U.w08;
}
function R_W09(M, P, c, det) { // Fächerfolge (Paarregeln)
  if (!M.paar.length) return 0;
  const K = P.K, H = M.H; let v = 0;
  const fachAn = s => { const e = K.ev[s]; return e < 0 ? -1 : M.E[e].parts[K.part[s]].f; };
  for (let d = 0; d < M.D; d++) for (let h = 0; h < H; h++) {
    const s = d * H + h; if (!K.belegt[s] || M.pause[h]) continue;
    const f1 = fachAn(s); if (f1 < 0) continue;
    for (const pr of M.paar) {
      if (pr.typ === 'vorPause') { if (h + 1 < H && M.pause[h + 1] && f1 === pr.a) { v++; vm(det, 'W09', 'Klasse ' + M.kName[c] + ': ' + M.fKz[f1] + ' direkt vor der Pause (' + tagName(M, d) + ').', { k: [c], s }); } continue; }
      if (!M.adj[h] || !K.belegt[s + 1] || K.ev[s + 1] === K.ev[s]) continue;
      const f2 = fachAn(s + 1); if (f2 < 0) continue;
      if (pr.typ === 'schwerHintereinander' && M.fSchwer[f1] && M.fSchwer[f2]) { v++; vm(det, 'W09', 'Klasse ' + M.kName[c] + ': ' + M.fKz[f1] + ' und ' + M.fKz[f2] + ' (Kernfächer) direkt hintereinander ' + slotText(M, s) + ' Std.', { k: [c], s }); }
      if (pr.typ === 'nichtNach' && f1 === pr.b && f2 === pr.a) { v++; vm(det, 'W09', 'Klasse ' + M.kName[c] + ': ' + M.fKz[f2] + ' direkt nach ' + M.fKz[f1] + ' (' + tagName(M, d) + ').', { k: [c], s }); }
    }
  }
  return v;
}
function R_W10(M, P, c, det) { // Wenig Raumwechsel
  const K = P.K, H = M.H; let v = 0;
  for (let d = 0; d < M.D; d++) for (let h = 0; h < H - 1; h++) {
    const s = d * H + h;
    if (!M.adj[h] || !K.belegt[s] || !K.belegt[s + 1]) continue;
    const e1 = K.ev[s], e2 = K.ev[s + 1]; if (e1 === e2) continue;
    const r1 = P.raum[P.rOff[e1] + K.part[s]], r2 = P.raum[P.rOff[e2] + K.part[s + 1]];
    if (r1 >= 0 && r2 >= 0 && r1 !== r2) { v++; vm(det, 'W10', 'Klasse ' + M.kName[c] + ' wechselt ' + slotText(M, s + 1) + ' Std. von ' + M.rName[r1] + ' nach ' + M.rName[r2] + '.', { k: [c], s: s + 1 }); }
  }
  return v;
}
function R_W11L(M, P, t, det) { // Gleichmäßige Tagesbelastung (Lehrkraft)
  const L = P.L; let sum = 0, m = 0;
  for (let d = 0; d < M.D; d++) if (M.lTagOk[t * M.D + d]) { sum += L.n[d]; m++; }
  if (!sum || !m) return 0;
  const avg = sum / m; let v = 0;
  for (let d = 0; d < M.D; d++) if (M.lTagOk[t * M.D + d]) v += Math.abs(L.n[d] - avg);
  if (v > 1e-9) vm(det, 'W11', 'Lehrkraft ' + M.lKz[t] + ': ungleichmäßige Tage (' + Array.from(L.n).join('/') + ').', { l: [t], n: v });
  return v;
}
function R_W12(M, P, t, det) { // Später Tag, später Beginn
  const L = P.L; let v = 0;
  for (let d = 0; d < M.D - 1; d++) {
    const z = L.z[d], a = L.a[d + 1];
    if (z >= 0 && a >= 0 && M.lnr[z] >= M.opt.spaetAb && M.lnr[a] === 1) { v++; vm(det, 'W12', 'Lehrkraft ' + M.lKz[t] + ': ' + tagName(M, d) + ' bis zur ' + M.lnr[z] + '. und ' + tagName(M, d + 1) + ' ab der 1. Stunde.', { l: [t] }); }
  }
  return v;
}
function R_W13(M, P, e, det) { // Wenig Nachmittagsunterricht in der Unterstufe
  const s0 = P.start[e]; if (s0 < 0) return 0;
  const ev = M.E[e];
  if (!ev.klassen.some(c => M.kJg[c] <= M.opt.unterstufeBis)) return 0;
  let v = 0; const h = s0 % M.H;
  for (let k = 0; k < ev.dur; k++) if (h + k < M.H && M.lnr[h + k] >= M.opt.nachmittagAb) { v++; vm(det, 'W13', evName(M, e) + ': Unterstufe ' + slotText(M, s0 + k) + ' Std. am Nachmittag.', { e: [e], k: ev.klassen }); }
  return v;
}
function R_W14(M, P, u, det) { // Co-Anteil einhalten
  const U = M.U[u]; if (!U.coZiel.length) return 0;
  let v = 0;
  for (const z of U.coZiel) {
    let std = 0;
    for (const e of M.uEv[u]) { if (P.start[e] < 0) continue; const ev = M.E[e]; for (let j = 0; j < ev.co.length; j++) if (ev.co[j].t === z.t && ev.co[j].u === u && P.co[P.cOff[e] + j]) std += ev.dur * ev.wf; }
    const fehl = Math.max(0, z.anteil - std);
    if (fehl > 1e-9) { const x = Math.ceil(fehl / U.maxBlock - 1e-9); v += x; vm(det, 'W14', U.name + ': Co fehlt – ' + M.lKz[z.t] + ' ist nur in ' + std + ' von ' + z.anteil + ' vorgesehenen UStd. dabei.', { e: M.uEv[u], l: [z.t], n: x }); }
  }
  return v;
}
function R_W15(M, P, c, det) { // Klassenleitung präsent
  const t = M.kKL[c]; if (t < 0) return 0;
  const K = P.K, H = M.H; let v = 0, erste = false, irgend = false, tage = 0;
  // alle Ereignisse der Klasse ansehen (in einer Stunde können zwei Halbgruppen nebeneinander liegen); tage = Bitmaske der Tage mit Klassenleitung
  for (const e of M.kEv[c]) {
    const s = P.start[e]; if (s < 0) continue;
    const ev = M.E[e]; if (!ev.lehrer.includes(t) || !istAktiv(M, P, e, t)) continue;
    tage |= 1 << Math.floor(s / H);
    if (!erste) for (let k = 0; k < ev.dur; k++) if (M.lnr[(s + k) % H] === 1) erste = true;
  }
  for (let d = 0; d < M.D; d++) {
    if (!K.n[d]) continue;
    irgend = true;
    if (!((tage >> d) & 1)) { v++; vm(det, 'W15', 'Klassenleitung ' + M.lKz[t] + ' unterrichtet ' + M.kName[c] + ' am ' + tagName(M, d) + ' nicht.', { k: [c], l: [t] }); }
  }
  if (irgend && !erste) { v++; vm(det, 'W15', 'Klassenleitung ' + M.lKz[t] + ' hat ' + M.kName[c] + ' nie in der 1. Stunde.', { k: [c], l: [t] }); }
  return v;
}
function R_W16(M, P, u, det) { // Stabilität bei Neuberechnung
  if (!M.referenz) return 0;
  const U = M.U[u];
  for (const e of M.uEv[u]) {
    const ref = M.referenz.get(U.id + '|' + (M.E[e].parts.find(p => p.u === u).b + 1));
    const now = P.start[e];
    if ((ref === undefined ? -1 : ref) !== now) { vm(det, 'W16', U.name + ' wurde gegenüber dem vorherigen Plan verschoben.', { e: M.uEv[u] }); return 1; }
  }
  return 0;
}

function R_W18(M, P, c, det) { // Klassenleitung unterrichtet die Kernfächer der eigenen Klasse
  const L = M.klKern ? M.klKern[c] : null; if (!L || !L.length) return 0;
  const t = M.kKL[c]; let v = 0;
  for (const k of L) {
    let hat = false; for (const ui of k.us) if (M.U[ui].fachL.includes(t)) { hat = true; break; }
    if (hat) continue;
    v += k.std;
    vm(det, 'W18', 'Klasse ' + M.kName[c] + ': ' + M.fKz[k.f] + ' (Kernfach, ' + zahlDe(k.std, 1) + ' UStd.) unterrichtet nicht die Klassenleitung ' + M.lKz[t] + '.', { k: [c], l: [t], e: k.us.flatMap(ui => M.uEv[ui]), n: k.std });
  }
  return v;
}

// Bewertung je Bereich (Klasse, Lehrkraft, Ereignis, Unterricht) – Grundlage der Delta-Bewertung
function evalKlasse(M, P, c, A, o, det) {
  bauK(M, P, c, -1);
  A[o + RI.H02] += R_H02(M, P, c, det);
  if (M.gew[RI.W17] > 0) A[o + RI.W17] += R_W17(M, P, c, det);
  A[o + RI.H13] += R_H13(M, P, c, det);
  A[o + RI.W06] += R_W06(M, P, c, det);
  A[o + RI.W09] += R_W09(M, P, c, det);
  A[o + RI.W10] += R_W10(M, P, c, det);
  A[o + RI.W15] += R_W15(M, P, c, det);
  A[o + RI.W18] += R_W18(M, P, c, det);
  const r15 = M.h15weich ? RI.W02 : RI.H15;
  if (!P.K.wechsel) { A[o + RI.H11] += R_H11(M, P, c, det); A[o + r15] += R_H15(M, P, c, det); return; }
  // 14-tägige Blöcke: Tagesgrenzen und Freistunden gelten in Woche A und in Woche B – gezählt wird die schlechtere Woche
  bauK(M, P, c, 0); const a0 = R_H11(M, P, c, det), b0 = R_H15(M, P, c, det);
  bauK(M, P, c, 1); const a1 = R_H11(M, P, c, det), b1 = R_H15(M, P, c, det);
  A[o + RI.H11] += Math.max(a0, a1); A[o + r15] += M.h15weich ? (b0 + b1) / 2 : Math.max(b0, b1);
}
function evalLehrer(M, P, t, A, o, det) {
  bauL(M, P, t, -1);
  A[o + RI.H01] += R_H01(M, P, t, det);
  A[o + RI.H16] += R_H16(M, P, t, det);
  if (!P.L.wechsel) {
    A[o + RI.H12] += R_H12(M, P, t, det);
    A[o + RI.W01] += R_W01(M, P, t, det);
    A[o + RI.W11] += R_W11L(M, P, t, det);
    A[o + RI.W12] += R_W12(M, P, t, det);
    return;
  }
  // 14-tägige Blöcke: Woche A und Woche B getrennt – harte Tagesgrenzen in der schlechteren Woche, weiche Kosten im Mittel beider Wochen
  const x = [0, 1].map(w => { bauL(M, P, t, w); return [R_H12(M, P, t, det), R_W01(M, P, t, det), R_W11L(M, P, t, det), R_W12(M, P, t, det)]; });
  A[o + RI.H12] += Math.max(x[0][0], x[1][0]);
  A[o + RI.W01] += (x[0][1] + x[1][1]) / 2; A[o + RI.W11] += (x[0][2] + x[1][2]) / 2; A[o + RI.W12] += (x[0][3] + x[1][3]) / 2;
}
function evalEreignis(M, P, e, A, o, det) {
  A[o + RI.H05] += R_H05(M, P, e, det);
  A[o + RI.H06] += R_H06(M, P, e, det);
  A[o + RI.H10] += R_H10(M, P, e, det);
  A[o + RI.W03] += R_W03(M, P, e, det);
  A[o + RI.W04] += R_W04(M, P, e, det);
  A[o + RI.W05] += R_W05(M, P, e, det);
  A[o + RI.W07] += R_W07(M, P, e, det);
  A[o + RI.W13] += R_W13(M, P, e, det);
}
function evalUnterricht(M, P, u, A, o, det) {
  A[o + RI.H04] += R_H04(M, P, u, det);
  A[o + RI.H07] += R_H07(M, P, u, det);
  A[o + RI.H09] += R_H09(M, P, u, det);
  A[o + RI.H14] += R_H14(M, P, u, det);
  A[o + RI.W08] += R_W08(M, P, u, det);
  A[o + RI.W14] += R_W14(M, P, u, det);
  A[o + RI.W16] += R_W16(M, P, u, det);
}

// Vollbewertung eines Plans (Kontrolle, Anzeige, Diagnose) – inkl. H03 und H08
function bewerteAlles(M, P, det) {
  const tot = new Float64Array(RN), A = new Float64Array(RN);
  const add = () => { for (let r = 0; r < RN; r++) tot[r] += A[r]; A.fill(0); };
  for (let c = 0; c < M.C; c++) { evalKlasse(M, P, c, A, 0, det); add(); }
  for (let t = 0; t < M.T; t++) { evalLehrer(M, P, t, A, 0, det); add(); }
  for (let e = 0; e < M.E.length; e++) { evalEreignis(M, P, e, A, 0, det); add(); }
  for (let u = 0; u < M.U.length; u++) { evalUnterricht(M, P, u, A, 0, det); add(); }
  for (let r = 0; r < M.R; r++) tot[RI.H03] += R_H03(M, P, r, det);
  tot[RI.H08] += R_H08(M, P, det);
  return tot;
}
function kostenVon(M, tot) {
  let hart = 0, weich = 0;
  for (let r = 0; r < RN; r++) { if (M.hart[r]) hart += tot[r]; else weich += M.gew[r] * tot[r]; }
  return { hart: Math.round(hart), weich: Math.round(weich * 10) / 10, gesamt: Math.round((hart * HART_GEWICHT + weich) * 10) / 10 };
}
// Einzelne Regel über den ganzen Plan prüfen (für Selbsttest und Diagnose)
function pruefeRegel(id, M, P, det) {
  const A = new Float64Array(RN); let v = 0;
  const idx = RI[id];
  const sc = { K: ['H02', 'H11', 'H13', 'H15', 'W02', 'W06', 'W09', 'W10', 'W15', 'W17', 'W18'], L: ['H01', 'H12', 'H16', 'W01', 'W11', 'W12'], E: ['H05', 'H06', 'H10', 'W03', 'W04', 'W05', 'W07', 'W13'], U: ['H04', 'H07', 'H09', 'H14', 'W08', 'W14', 'W16'] };
  const d2 = det ? [] : null;
  if (sc.K.includes(id)) for (let c = 0; c < M.C; c++) { A.fill(0); evalKlasse(M, P, c, A, 0, d2); v += A[idx]; }
  if (sc.L.includes(id)) for (let t = 0; t < M.T; t++) { A.fill(0); evalLehrer(M, P, t, A, 0, d2); v += A[idx]; }
  if (sc.E.includes(id)) for (let e = 0; e < M.E.length; e++) { A.fill(0); evalEreignis(M, P, e, A, 0, d2); v += A[idx]; }
  if (sc.U.includes(id)) for (let u = 0; u < M.U.length; u++) { A.fill(0); evalUnterricht(M, P, u, A, 0, d2); v += A[idx]; }
  if (id === 'H03') for (let r = 0; r < M.R; r++) v += R_H03(M, P, r, d2);
  if (id === 'H08') v += R_H08(M, P, d2);
  if (det && d2) d2.filter(x => x.r === id).forEach(x => det.push(x));
  return v;
}

