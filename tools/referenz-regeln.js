// Referenzfassungen (unveränderter Stand vor der Beschleunigung) von R_H01, R_H02 und R_W17 – nur für den Vergleich in tools/invarianten.mjs.
// Laufen im Kontext der Engine (nutzen deren Hilfsfunktionen) und werden dort NICHT vom Solver benutzt.
function R_H01_ref(M, P, t, det) { // Lehrkraft nicht doppelt belegt
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
function R_H02_ref(M, P, c, det) { // Klasse und Gruppe nicht doppelt belegt
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
function R_W17_ref(M, P, c, det) { // Halbgruppen füllen sich auf – nutzt die von R_H02 gefüllte Gruppenbelegung (direkt danach aufrufen)
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
