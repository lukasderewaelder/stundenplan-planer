// ---------- Planzustand mit Belegungszählern und inkrementeller Bewertung ----------
class Plan {
  constructor(M) {
    this.M = M;
    const E = M.E.length, S = M.S;
    this.start = new Int32Array(E).fill(-1);
    this.rOff = new Int32Array(E + 1); this.cOff = new Int32Array(E + 1);
    for (let e = 0; e < E; e++) { this.rOff[e + 1] = this.rOff[e] + M.E[e].parts.length; this.cOff[e + 1] = this.cOff[e] + M.E[e].co.length; }
    this.raum = new Int32Array(Math.max(1, this.rOff[E])).fill(-1);
    this.co = new Uint8Array(Math.max(1, this.cOff[E]));
    this.fest = new Uint8Array(Math.max(1, E));
    this.gesperrt = new Uint8Array(Math.max(1, E));
    for (let e = 0; e < E; e++) this.gesperrt[e] = M.E[e].gesperrt ? 1 : 0;
    this.occ = new Int16Array(M.NU * 2 * S);
    this.who = new Int32Array(M.NU * 2 * S).fill(-1);
    this.rocc = new Int16Array(Math.max(1, M.R) * 2 * S);
    this.vK = new Float64Array(Math.max(1, M.C) * RN); this.vL = new Float64Array(Math.max(1, M.T) * RN);
    this.vE = new Float64Array(Math.max(1, E) * RN); this.vU = new Float64Array(Math.max(1, M.U.length) * RN);
    this.tot = new Float64Array(RN);
    // Transaktion
    this.tx = 1;
    this.stE = new Int32Array(Math.max(1, E)); this.stK = new Int32Array(Math.max(1, M.C)); this.stL = new Int32Array(Math.max(1, M.T));
    this.stX = new Int32Array(Math.max(1, E)); this.stU = new Int32Array(Math.max(1, M.U.length)); this.stCo = new Int32Array(Math.max(1, M.U.length));
    this.logE = []; this.logS = []; this.logR = []; this.logC = [];
    this.dK = []; this.dL = []; this.dX = []; this.dU = []; this.coPend = [];
    this.svA = []; this.svO = []; this.svB = new Float64Array(64 * RN); this.nSv = 0; this.totSv = new Float64Array(RN);
    // Arbeitsspeicher für Regelfunktionen
    this.K = { c: -1, belegt: new Int16Array(S), ev: new Int32Array(S), part: new Int16Array(S), n: new Int16Array(M.D), a: new Int16Array(M.D), z: new Int16Array(M.D) };
    this.L = { t: -1, belegt: new Int16Array(S), ev: new Int32Array(S), unt: new Int16Array(S), n: new Int16Array(M.D), nu: new Int16Array(M.D), a: new Int16Array(M.D), z: new Int16Array(M.D) };
    this.scT = new Float64Array(M.D * 2);
    this.scU = new Int16Array(M.maxKU * 2 * S); this.scW = new Int16Array(2 * S);
    this.scF = new Int16Array(M.D * Math.max(1, M.F)); this.scFB = new Int16Array(Math.max(1, M.F)); this.scFM = new Int32Array(Math.max(1, M.F));
    this.R = { ev: [], co: [] };
    this._tmpA = new Float64Array(RN);
    // Personal-Einheiten (nur in der Berechnung): aktuelle Fachlehrkraft je Einheit und die Personalkosten (siehe _personalInit)
    const nP = (M.PE || []).length;
    this.lk = new Int32Array(Math.max(1, nP)).fill(-1);
    for (let p = 0; p < nP; p++) this.lk[p] = M.PE[p].t;
    this.logP = []; this.pHart = 0; this.pWeich = 0; this.pHartSv = 0; this.pWeichSv = 0;
    this.logA = []; // Musterwechsel: Paare (Ereignis, vorheriger Aktiv-Wert)
    if (nP) this._personalInit();
  }
  // ---- Personalkosten der automatischen Zuteilung ----
  //   pHart  (hart): Unterricht ohne Fachlehrkraft (N. N.), gezählt in Wochenstunden – die Endprüfung meldet ihn als Pflichtverstoß.
  //   pWeich (weich): Unterrichtsdeputat überschritten (je Stunde stark), Rangfolge Klassenleitung → Klassenteam → übrige (je Stunde),
  //                   möglichst wenige verschiedene Lehrkräfte je Klasse (je Paar Klasse–Lehrkraft).
  _personalInit() {
    const M = this.M, T = M.T, C = M.C, d = M.data;
    const am = d.schule.arbeitszeitModell || ARBEITSZEIT_STD;
    if (!M.pDep) {
      // feste Grundlast je Person (ohne die Personal-Einheiten) und Deputatsgrenze (Stunden; Infinity = keine)
      M.pDep = new Float64Array(Math.max(1, T)).fill(Infinity); M.pBasis = new Float64Array(Math.max(1, T));
      if (am.stundenSoll) d.lehrer.forEach((l, t) => { if (l.deputat !== null && l.deputat !== undefined) M.pDep[t] = l.deputat; });
      M.pPaarBasis = new Int16Array(Math.max(1, C * T));
      M.U.forEach((U, ui) => {
        const std = M.uEv[ui].reduce((a, e) => a + (M.aktiv[e] ? M.E[e].dur * M.E[e].wf : 0), 0);
        U.lehrer.forEach(t => {
          if (M.uPE[ui] >= 0 && M.uLk[ui] === t) return;
          const z = U.coZiel.find(x => x.t === t);
          M.pBasis[t] += z ? z.anteil : (U.aufgabe && d.unterrichte[ui].anrechnung === false ? 0 : std);
          if (!U.aufgabe && U.rolle.get(t) === 'fach') U.klassen.forEach(c => { M.pPaarBasis[c * T + t]++; });
        });
      });
    }
    if (!M.pAzBasis) {
      // Ausgleich Soll/Ist (Wochenarbeitszeit in Minuten): feste Last ohne die Personal-Einheiten – Termine, Klassenleitung, fester Unterricht,
      // Aufgaben, feste Co-Einsätze und von Hand gesetzte Aufsichten. Automatische Aufsichten und Co-Einsätze entstehen erst danach.
      const stdMin = M.stdMin;
      M.pAzBasis = new Float64Array(Math.max(1, T)); M.pSoll = new Float64Array(Math.max(1, T)); M.pFairIdx = new Uint8Array(Math.max(1, T));
      for (let t = 0; t < T; t++) {
        let m = M.lWocheFix[t];
        for (const e of M.lEv[t]) { const ev = M.E[e]; if (!M.aktiv[e] || ev.parts.some(pt => M.uPE[pt.u] >= 0 && M.uLk[pt.u] === t)) continue; m += ev.dur * stdMin * (ev.azF.get(t) || ev.wf) + (ev.azV.get(t) || 0); }
        M.pAzBasis[t] = m; M.pSoll[t] = Math.max(0, (d.lehrer[t].arbeitszeit || 0) * 60);
      }
      try {
        const nurHand = Object.assign({}, d, { dienste: Object.assign({}, d.dienste, { plan: ((d.dienste && d.dienste.plan) || []).filter(x => x.quelle !== 'auto') }) });
        if (nurHand.dienste.plan.length) { const az = arbeitszeiten(nurHand); az.liste.forEach(x => { const t = M.lI.get(x.lehrer); if (t !== undefined && t < T) M.pAzBasis[t] += x.dienst || 0; }); }
      } catch (err) { /* ohne Aufsichten weiterrechnen */ }
      M.PE.forEach(pe => { let m = 0; for (const e of pe.evs) { if (!M.aktiv[e]) continue; const ev = M.E[e]; const U = M.U[ev.parts[0].u]; m += ev.wf * ev.dur * (stdMin + (U.pVorb || 0)); } pe.azMin = m; pe.cands.forEach(t => { if (M.pSoll[t] > 0) M.pFairIdx[t] = 1; }); });
      M.pFairN = 0; for (let t = 0; t < T; t++) if (M.pFairIdx[t]) M.pFairN++;
    }
    this.pLast = Float64Array.from(M.pBasis); this.pPaar = Int16Array.from(M.pPaarBasis);
    this.pAz = Float64Array.from(M.pAzBasis); this.fS1 = 0; this.fS2 = 0; this.pFairWert = 0;
    for (let t = 0; t < T; t++) if (M.pFairIdx[t]) { const x = (this.pAz[t] - M.pSoll[t]) / 60; this.fS1 += x; this.fS2 += x * x; }
    this.pHart = 0; this.pWeich = 0;
    this.pFairWert = this._fairWert(); this.pWeich += this.pFairWert;
    for (let t = 0; t < T; t++) this.pWeich += PERSONAL_W.deputat * Math.max(0, this.pLast[t] - M.pDep[t]);
    for (let i = 0; i < C * T; i++) if (this.pPaar[i] > 0) this.pWeich += PERSONAL_W.paar;
    for (let p = 0; p < M.PE.length; p++) { const t = this.lk[p]; this.lk[p] = -1; this.pHart += M.PE[p].nn; this._personalDelta(p, -1, t); this.lk[p] = t; }
  }
  // Ausgleich: Streuung der Differenz Ist − Soll (Stunden) über alle Personen, die automatisch Unterricht bekommen können – quadratisch,
  // damit sich die Differenz gleichmäßig verteilt (Summe der Abweichungsquadrate vom Mittelwert, in h²)
  _fairWert() { const n = this.M.pFairN; return n > 1 ? PERSONAL_W.ausgleich * Math.max(0, this.fS2 - this.fS1 * this.fS1 / n) : 0; }
  _azAdd(x, m) {
    const M = this.M;
    if (M.pFairIdx[x]) { const a = (this.pAz[x] - M.pSoll[x]) / 60, b = a + m / 60; this.fS1 += b - a; this.fS2 += b * b - a * a; }
    this.pAz[x] += m;
  }
  // Änderung der Personalkosten, wenn die Einheit p von ihrer jetzigen Person auf t wechselt (ohne etwas zu ändern)
  personalDeltaWert(p, t, fairF) {
    const M = this.M, pe = M.PE[p], T = M.T, W = PERSONAL_W, alt = this.lk[p];
    if (fairF === undefined) fairF = 1;
    if (alt === t) return 0;
    let d = 0;
    const dep = (x, plus) => W.deputat * (Math.max(0, this.pLast[x] + plus - M.pDep[x]) - Math.max(0, this.pLast[x] - M.pDep[x]));
    let s1 = this.fS1, s2 = this.fS2;
    const fair = (x, m) => { if (!M.pFairIdx[x]) return; const a = (this.pAz[x] - M.pSoll[x]) / 60, b = a + m / 60; s1 += b - a; s2 += b * b - a * a; };
    if (alt >= 0) { d += dep(alt, -pe.std) - pe.std * W.stufe[pe.stufe[alt]]; for (const c of pe.klassen) if (this.pPaar[c * T + alt] === 1) d -= W.paar; fair(alt, -pe.azMin); } else d -= pe.nn * HART_GEWICHT;
    if (t >= 0) { d += dep(t, pe.std) + pe.std * W.stufe[pe.stufe[t]]; for (const c of pe.klassen) if (this.pPaar[c * T + t] === 0) d += W.paar; fair(t, pe.azMin); } else d += pe.nn * HART_GEWICHT;
    const n = M.pFairN; if (n > 1) d += fairF * W.ausgleich * (Math.max(0, s2 - s1 * s1 / n) - Math.max(0, this.fS2 - this.fS1 * this.fS1 / n));
    return d;
  }
  // Differenz Ist − Soll (Stunden) der Person t nach dem jetzigen Stand der Personalzuteilung (ohne spätere Co-Einsätze und Aufsichten)
  differenzStd(t) { return this.M.pSoll[t] > 0 ? (this.pAz[t] - this.M.pSoll[t]) / 60 : 0; }
  _personalDelta(p, alt, t) {
    const M = this.M, pe = M.PE[p], T = M.T, W = PERSONAL_W;
    if (alt === t) return;
    if (alt >= 0) this._azAdd(alt, -pe.azMin);
    if (t >= 0) this._azAdd(t, pe.azMin);
    const fw = this._fairWert(); this.pWeich += fw - this.pFairWert; this.pFairWert = fw;
    const dep = x => W.deputat * Math.max(0, this.pLast[x] - M.pDep[x]);
    if (alt >= 0) {
      this.pWeich -= dep(alt); this.pLast[alt] -= pe.std; this.pWeich += dep(alt);
      this.pWeich -= pe.std * W.stufe[pe.stufe[alt]];
      for (const c of pe.klassen) if (--this.pPaar[c * T + alt] === 0) this.pWeich -= W.paar;
    } else this.pHart -= pe.nn;
    if (t >= 0) {
      this.pWeich -= dep(t); this.pLast[t] += pe.std; this.pWeich += dep(t);
      this.pWeich += pe.std * W.stufe[pe.stufe[t]];
      for (const c of pe.klassen) if (this.pPaar[c * T + t]++ === 0) this.pWeich += W.paar;
    } else this.pHart += pe.nn;
  }
  // Fachlehrkraft der Personal-Einheit p auf t setzen (-1 = N. N.) – innerhalb einer Transaktion, mit Belegung und Kosten
  setzeLehrer(p, t) {
    const M = this.M, pe = M.PE[p], alt = this.lk[p];
    if (alt === t) return;
    for (const e of pe.evs) { this.touch(e); this._coPlan(e); if (this.start[e] >= 0) this._belegeEinheiten(e, -1); }
    this.logP.push(p, alt);
    for (const u of pe.us) lkModellSetzen(M, u, t);
    this.lk[p] = t;
    this._personalDelta(p, alt, t);
    for (const e of pe.evs) { if (this.start[e] >= 0) this._belegeEinheiten(e, 1); this._dirty(e); this._coPlan(e); }
  }
  // Liegt das Ereignis e so, dass eine seiner Lehrkräfte gleichzeitig anderswo eingeplant oder gesperrt ist? (nach einem Personalwechsel)
  lehrerKonflikt(e) {
    const M = this.M, s0 = this.start[e]; if (s0 < 0) return false;
    if (!M.erlaubt[e * M.S + s0]) return true;
    const ev = M.E[e], S = M.S;
    for (const t of ev.immer) for (let k = 0; k < ev.dur; k++) for (const w of ev.wochen) if (this.occ[(t * 2 + w) * S + s0 + k] > 1) return true;
    return false;
  }
  raumVon(e, p) { return this.raum[this.rOff[e] + p]; }
  coVon(e, j) { return this.co[this.cOff[e] + j]; }
  // ---- Belegung ----
  _zelle(cell, s, e, sg) {
    const i = cell * this.M.S + s;
    this.occ[i] += sg;
    if (sg > 0) this.who[i] = e; else if (this.who[i] === e) this.who[i] = -1;
  }
  _belegeEinheiten(e, sg) {
    const s0 = this.start[e]; if (s0 < 0) return;
    const ev = this.M.E[e], W = ev.wochen, cb = this.cOff[e];
    for (let k = 0; k < ev.dur; k++) {
      const s = s0 + k;
      for (let a = 0; a < ev.units.length; a++) { const u = ev.units[a]; for (let b = 0; b < W.length; b++) this._zelle(u * 2 + W[b], s, e, sg); }
      for (let j = 0; j < ev.co.length; j++) if (this.co[cb + j]) { const t = ev.co[j].t; for (let b = 0; b < W.length; b++) this._zelle(t * 2 + W[b], s, e, sg); }
    }
  }
  _belegeRaum(e, p, sg) {
    const s0 = this.start[e], r = this.raum[this.rOff[e] + p]; if (s0 < 0 || r < 0) return;
    const ev = this.M.E[e], S = this.M.S, W = ev.wochen;
    for (let k = 0; k < ev.dur; k++) for (let b = 0; b < W.length; b++) this.rocc[(r * 2 + W[b]) * S + s0 + k] += sg;
  }
  _belege(e, sg) {
    this._belegeEinheiten(e, sg);
    const n = this.M.E[e].parts.length;
    for (let p = 0; p < n; p++) this._belegeRaum(e, p, sg);
  }
  _coSet(e, j, v) {
    const cb = this.cOff[e];
    if (this.co[cb + j] === v) return;
    const s0 = this.start[e], ev = this.M.E[e];
    if (s0 >= 0) { const t = ev.co[j].t, W = ev.wochen, sg = v ? 1 : -1; for (let k = 0; k < ev.dur; k++) for (let b = 0; b < W.length; b++) this._zelle(t * 2 + W[b], s0 + k, e, sg); }
    this.co[cb + j] = v;
  }
  raumFrei(r, s0, dur, W) {
    const M = this.M, S = M.S;
    for (let k = 0; k < dur; k++) {
      if (M.rVerf[r * S + s0 + k] === 0) return false;
      for (let b = 0; b < W.length; b++) if (this.rocc[(r * 2 + W[b]) * S + s0 + k] >= M.rTeil[r]) return false;
    }
    return true;
  }
  // ---- Transaktionen ----
  begin() {
    this.tx++;
    this.logE.length = 0; this.logS.length = 0; this.logR.length = 0; this.logC.length = 0; this.logP.length = 0; this.logA.length = 0;
    this.pHartSv = this.pHart; this.pWeichSv = this.pWeich;
    this.dK.length = 0; this.dL.length = 0; this.dX.length = 0; this.dU.length = 0; this.coPend.length = 0;
    this.nSv = 0; this.totSv.set(this.tot);
  }
  touch(e) {
    if (this.stE[e] === this.tx) return;
    this.stE[e] = this.tx;
    this.logE.push(e); this.logS.push(this.start[e]);
    for (let i = this.rOff[e]; i < this.rOff[e + 1]; i++) this.logR.push(this.raum[i]);
    for (let i = this.cOff[e]; i < this.cOff[e + 1]; i++) this.logC.push(this.co[i]);
    this._dirty(e);
  }
  _dirty(e) {
    const ev = this.M.E[e], tx = this.tx;
    for (const c of ev.klassen) if (this.stK[c] !== tx) { this.stK[c] = tx; this.dK.push(c); }
    for (const t of ev.lehrer) if (this.stL[t] !== tx) { this.stL[t] = tx; this.dL.push(t); }
    if (this.stX[e] !== tx) { this.stX[e] = tx; this.dX.push(e); }
    for (const p of ev.parts) if (this.stU[p.u] !== tx) { this.stU[p.u] = tx; this.dU.push(p.u); }
  }
  _coPlan(e) {
    const M = this.M, ev = M.E[e], tx = this.tx;
    if (ev.co.length) for (const p of ev.parts) { const u = p.u; if (M.U[u].coZiel.length && this.stCo[u] !== tx) { this.stCo[u] = tx; this.coPend.push(u); } }
    // Lehrkräfte dieses Blocks, die in anderen Unterrichten anteilig Co sind: dort Zuordnung neu prüfen
    for (const t of ev.immer) { const L = M.coUs[t]; if (L) for (const u of L) if (this.stCo[u] !== tx) { this.stCo[u] = tx; this.coPend.push(u); } }
  }
  _coFlush() { for (let i = 0; i < this.coPend.length; i++) this.coNeu(this.coPend[i]); this.coPend.length = 0; }
  commit() {
    this._coFlush();
    const M = this.M;
    for (const c of this.dK) this._neu(this.vK, c, 0);
    for (const t of this.dL) this._neu(this.vL, t, 1);
    for (const e of this.dX) this._neu(this.vE, e, 2);
    for (const u of this.dU) this._neu(this.vU, u, 3);
    this.dK.length = 0; this.dL.length = 0; this.dX.length = 0; this.dU.length = 0;
    return M;
  }
  _neu(A, i, typ) {
    const o = i * RN, M = this.M;
    if ((this.nSv + 1) * RN > this.svB.length) { const nb = new Float64Array(this.svB.length * 2); nb.set(this.svB); this.svB = nb; }
    const b = this.nSv * RN;
    for (let r = 0; r < RN; r++) { this.svB[b + r] = A[o + r]; this.tot[r] -= A[o + r]; A[o + r] = 0; }
    this.svA[this.nSv] = A; this.svO[this.nSv] = o; this.nSv++;
    if (typ === 0) evalKlasse(M, this, i, A, o, null);
    else if (typ === 1) evalLehrer(M, this, i, A, o, null);
    else if (typ === 2) evalEreignis(M, this, i, A, o, null);
    else evalUnterricht(M, this, i, A, o, null);
    for (let r = 0; r < RN; r++) this.tot[r] += A[o + r];
  }
  rollback() {
    const n = this.logE.length, M = this.M;
    for (let i = 0; i < n; i++) this._belege(this.logE[i], -1);
    // Personalwechsel rückwärts zurücknehmen (die betroffenen Ereignisse sind oben schon ausgetragen)
    for (let i = this.logP.length - 2; i >= 0; i -= 2) { const p = this.logP[i], alt = this.logP[i + 1], jetzt = this.lk[p]; for (const u of M.PE[p].us) lkModellSetzen(M, u, alt); this.lk[p] = alt; this._personalDelta(p, jetzt, alt); }
    this.logP.length = 0; this.pHart = this.pHartSv; this.pWeich = this.pWeichSv; if (this.pAz) this.pFairWert = this._fairWert();
    for (let i = this.logA.length - 2; i >= 0; i -= 2) musterAktivSetzen(M, this.logA[i], this.logA[i + 1]);
    this.logA.length = 0;
    let ir = 0, ic = 0;
    for (let i = 0; i < n; i++) {
      const e = this.logE[i];
      this.start[e] = this.logS[i];
      for (let x = this.rOff[e]; x < this.rOff[e + 1]; x++) this.raum[x] = this.logR[ir++];
      for (let x = this.cOff[e]; x < this.cOff[e + 1]; x++) this.co[x] = this.logC[ic++];
    }
    for (let i = 0; i < n; i++) this._belege(this.logE[i], 1);
    for (let k = 0; k < this.nSv; k++) { const A = this.svA[k], o = this.svO[k], b = k * RN; for (let r = 0; r < RN; r++) A[o + r] = this.svB[b + r]; }
    this.tot.set(this.totSv);
    this.logE.length = 0; this.nSv = 0;
    this.tx++;
  }
  // ---- Operationen (innerhalb einer Transaktion) ----
  // Blockmuster: Ereignis e aktivieren/deaktivieren (ein deaktiviertes wird aus dem Plan genommen und zählt nicht mehr als fehlend)
  setzeAktiv(e, v) {
    const M = this.M; v = v ? 1 : 0;
    if (M.aktiv[e] === v) return;
    if (!v) this.entferne(e);
    this.touch(e);
    this.logA.push(e, M.aktiv[e]);
    musterAktivSetzen(M, e, v);
  }
  entferne(e) {
    if (this.start[e] < 0) return;
    this.touch(e);
    this._belege(e, -1);
    this.start[e] = -1;
    for (let x = this.rOff[e]; x < this.rOff[e + 1]; x++) this.raum[x] = -1;
    for (let x = this.cOff[e]; x < this.cOff[e + 1]; x++) this.co[x] = 0;
    this._coPlan(e);
  }
  // Wer belegt Einheit u (Klasse/Gruppe oder Lehrkraft) in Woche w zur Rasterzeile sl? (Rückfall, wenn who[] nach einer vorübergehenden
  // Doppelbelegung innerhalb einer Transaktion nicht mehr stimmt) – ausser e; -1 = niemand gefunden
  _wer(u, w, sl, e) {
    const M = this.M, liste = u < M.T ? M.lEv[u] : M.kEv[M.unitK[u]];
    if (!liste) return -1;
    for (const x of liste) {
      if (x === e) continue;
      const s0 = this.start[x]; if (s0 < 0 || sl < s0 || sl >= s0 + M.E[x].dur) continue;
      const ex = M.E[x]; if (!ex.wochen.includes(w)) continue;
      if (ex.units.includes(u) || (u < M.T && istAktiv(M, this, x, u))) { this.who[(u * 2 + w) * M.S + sl] = x; return x; }
    }
    return -1;
  }
  // Ermittelt Konflikte für das (nicht platzierte) Ereignis e bei Start s: this.R.ev (verdrängen), this.R.co (Co abziehen).
  // this.R.blockiert: belegt, aber kein verdrängbarer Block erkennbar (dann darf e dort nicht hin)
  konflikte(e, s) {
    const M = this.M, ev = M.E[e], S = M.S, R = this.R, W = ev.wochen;
    R.ev.length = 0; R.co.length = 0; R.blockiert = false;
    for (let k = 0; k < ev.dur; k++) {
      const sl = s + k;
      for (let a = 0; a < ev.units.length; a++) {
        const u = ev.units[a];
        for (let b = 0; b < W.length; b++) {
          const i = (u * 2 + W[b]) * S + sl;
          if (this.occ[i] <= 0) continue;
          let x = this.who[i];
          if (x < 0 || this.start[x] < 0 || sl < this.start[x] || sl >= this.start[x] + M.E[x].dur) x = this._wer(u, W[b], sl, e);
          if (x === e) continue;
          if (x < 0) { R.blockiert = true; continue; }
          if (u < M.T && !M.E[x].immer.includes(u)) {
            const cx = M.E[x].co; let jj = -1;
            for (let j = 0; j < cx.length; j++) if (cx[j].t === u && this.co[this.cOff[x] + j]) { jj = j; break; }
            if (jj >= 0) { let dup = false; for (let q = 0; q < R.co.length; q += 2) if (R.co[q] === x && R.co[q + 1] === jj) dup = true; if (!dup) R.co.push(x, jj); }
          } else if (!R.ev.includes(x)) R.ev.push(x);
        }
      }
    }
  }
  _raumBelegerFuer(r, s0, e) {
    const M = this.M, ev = M.E[e], out = [];
    for (const x of M.rNutzer[r]) {
      const sx = this.start[x]; if (sx < 0 || x === e) continue;
      const ex = M.E[x];
      if (sx + ex.dur <= s0 || s0 + ev.dur <= sx) continue;
      if (!ex.wochen.some(w => ev.wochen.includes(w))) continue;
      for (let p = 0; p < ex.parts.length; p++) if (this.raum[this.rOff[x] + p] === r) { out.push(x); break; }
    }
    return out;
  }
  // Platziert e bei s. ausw=true: kollidierende Ereignisse werden verdrängt (unplatziert)
  platziere(e, s, ausw, raumWunsch) {
    const M = this.M, ev = M.E[e];
    if (!M.erlaubt[e * M.S + s] || this.fest[e]) return false;
    this.touch(e);
    const alteRaeume = [];
    for (let x = this.rOff[e]; x < this.rOff[e + 1]; x++) alteRaeume.push(this.raum[x]);
    if (this.start[e] >= 0) {
      this._belege(e, -1); this.start[e] = -1;
      for (let x = this.rOff[e]; x < this.rOff[e + 1]; x++) this.raum[x] = -1;
      for (let x = this.cOff[e]; x < this.cOff[e + 1]; x++) this.co[x] = 0;
    }
    this.konflikte(e, s);
    const R = this.R;
    if (R.blockiert) return false;
    if (R.ev.length) {
      if (!ausw) return false;
      for (const x of R.ev) if (this.fest[x]) return false;
      const opfer = R.ev.slice();
      for (const x of opfer) this.entferne(x);
    }
    const co = R.co.slice();
    for (let q = 0; q < co.length; q += 2) { const x = co[q]; this.touch(x); this._coSet(x, co[q + 1], 0); this._coPlan(x); }
    this.start[e] = s;
    this._belegeEinheiten(e, 1);
    for (let p = 0; p < ev.parts.length; p++) {
      const part = ev.parts[p];
      if (!part.cands) continue;
      let r = -1;
      const wunsch = raumWunsch ? raumWunsch[p] : alteRaeume[p];
      if (wunsch >= 0 && part.cands.includes(wunsch) && this.raumFrei(wunsch, s, ev.dur, ev.wochen)) r = wunsch;
      if (r < 0) for (const c of part.cands) if (this.raumFrei(c, s, ev.dur, ev.wochen)) { r = c; break; }
      if (r < 0 && ausw) {
        let bestR = -1, bestN = 1e9, bestO = null;
        for (const c of part.cands) {
          let vf = true; for (let k = 0; k < ev.dur; k++) if (M.rVerf[c * M.S + s + k] === 0) vf = false;
          if (!vf) continue;
          const o = this._raumBelegerFuer(c, s, e);
          if (o.some(x => this.fest[x])) continue;
          if (o.length < bestN) { bestN = o.length; bestR = c; bestO = o; }
        }
        if (bestR >= 0) { for (const x of bestO) this.entferne(x); if (this.raumFrei(bestR, s, ev.dur, ev.wochen)) r = bestR; }
      }
      if (r < 0) return false;
      this.raum[this.rOff[e] + p] = r;
      this._belegeRaum(e, p, 1);
    }
    this._coPlan(e);
    return true;
  }
  // Legt fest, in welchen Blöcken eine anteilige Co-Lehrkraft dabei ist (gierig, deterministisch)
  coNeu(u) {
    const M = this.M, U = M.U[u], S = M.S, evs = M.uEv[u];
    // Teilen sich mehrere anteilige Co-Lehrkräfte den Kurs (blockweise Besetzung), bleibt jede bei ihren bisherigen Blöcken, solange das möglich ist,
    // und weicht sonst auf Blöcke aus, die noch keine Co-Lehrkraft haben. Mit nur einer anteiligen Co-Lehrkraft ändert sich nichts.
    const teilen = U.coZiel.length > 1, gedeckt = teilen ? new Set() : null;
    for (const z of U.coZiel) {
      const kand = [];
      for (const e of evs) {
        const ev = M.E[e]; let j = -1;
        for (let q = 0; q < ev.co.length; q++) if (ev.co[q].t === z.t && ev.co[q].u === u) { j = q; break; }
        if (j < 0) continue;
        const s0 = this.start[e]; if (s0 < 0) continue;
        const eigen = this.co[this.cOff[e] + j] ? 1 : 0;
        let ok = true, pen = 0;
        for (let k = 0; k < ev.dur && ok; k++) {
          const v = M.lVerf[z.t * S + s0 + k];
          if (v === 0) { ok = false; break; }
          if (v === -1) pen++;
          for (const w of ev.wochen) if (this.occ[(z.t * 2 + w) * S + s0 + k] - eigen > 0) { ok = false; break; }
        }
        if (ok) kand.push((teilen ? (eigen ? 0 : 1e8) + (gedeckt.has(e) ? 5e8 : 0) : 0) + pen * 100000 + e, e, j);
      }
      const idx = []; for (let q = 0; q < kand.length; q += 3) idx.push(q);
      idx.sort((a, b) => kand[a] - kand[b]);
      // Arbeitszeitgrenzen (H16 hart): Die anteilige Co-Lehrkraft kommt nur in Stunden dazu, die ihre Tages- und Wochengrenze zulassen –
      // sonst bleibt die Stunde ohne Co (W14), statt die Person über die Grenze zu bringen.
      const D = M.D, H = M.H, tMax = M.lTagMax[z.t], wMax = M.lWocheMax[z.t];
      const grenze = M.hart[RI.H16] === 1 && (tMax > 0 || wMax > 0);
      let tagL = null, wocheL = 0;
      if (grenze) {
        tagL = new Float64Array(D * 2); wocheL = M.lWocheFix[z.t];
        for (const e of M.lEv[z.t]) {
          const s0 = this.start[e]; if (s0 < 0) continue;
          const ev = M.E[e];
          let aktiv = ev.immer.includes(z.t);
          if (!aktiv) { const cb = this.cOff[e]; for (let j = 0; j < ev.co.length; j++) if (ev.co[j].t === z.t && ev.co[j].u !== u && this.co[cb + j]) { aktiv = true; break; } }
          if (!aktiv) continue;
          const d = Math.floor(s0 / H), m = ev.minAt[s0 % H];
          for (const w of ev.wochen) tagL[d * 2 + w] += m;
          wocheL += m * (ev.azF.get(z.t) || ev.wf) + (ev.azV.get(z.t) || 0);
        }
      }
      let need = z.anteil; const soll = new Set();
      for (const q of idx) {
        if (need <= 0) break;
        const e = kand[q + 1], ev = M.E[e];
        if (grenze) {
          const s0 = this.start[e], d = Math.floor(s0 / H), m = ev.minAt[s0 % H], wm = m * (ev.azF.get(z.t) || ev.wf) + (ev.azV.get(z.t) || 0);
          let passt = !(wMax > 0 && wocheL + wm > wMax + 3);
          if (passt && tMax > 0) for (const w of ev.wochen) if (tagL[d * 2 + w] + m + M.lTagFix[z.t * D + d] > tMax + 0.5) { passt = false; break; }
          if (!passt) continue;
          for (const w of ev.wochen) tagL[d * 2 + w] += m;
          wocheL += wm;
        }
        soll.add(e); need -= ev.dur * ev.wf; if (gedeckt) gedeckt.add(e);
      }
      for (const e of evs) {
        const ev = M.E[e];
        for (let q = 0; q < ev.co.length; q++) {
          if (ev.co[q].t !== z.t || ev.co[q].u !== u) continue;
          const want = (soll.has(e) && this.start[e] >= 0) ? 1 : 0;
          if (this.co[this.cOff[e] + q] !== want) { this.touch(e); this._coSet(e, q, want); }
        }
      }
    }
  }
  // Setzt ohne Prüfung (Laden eines Plans, feste Ereignisse)
  setzeRoh(e, s, raeume, coListe) {
    const M = this.M, ev = M.E[e];
    this._belege(e, -1);
    this.start[e] = s;
    for (let p = 0; p < ev.parts.length; p++) {
      let r = raeume ? raeume[p] : -1;
      if ((r === undefined || r < 0) && ev.parts[p].cands) { for (const c of ev.parts[p].cands) if (this.raumFrei(c, s, ev.dur, ev.wochen)) { r = c; break; } }
      this.raum[this.rOff[e] + p] = r === undefined ? -1 : r;
    }
    for (let j = 0; j < ev.co.length; j++) this.co[this.cOff[e] + j] = coListe ? (coListe[j] ? 1 : 0) : 0;
    this._belege(e, 1);
  }
  // Vollständige Neuberechnung aller Kostenvektoren
  initKosten() {
    const M = this.M;
    this.vK.fill(0); this.vL.fill(0); this.vE.fill(0); this.vU.fill(0); this.tot.fill(0);
    for (let c = 0; c < M.C; c++) evalKlasse(M, this, c, this.vK, c * RN, null);
    for (let t = 0; t < M.T; t++) evalLehrer(M, this, t, this.vL, t * RN, null);
    for (let e = 0; e < M.E.length; e++) evalEreignis(M, this, e, this.vE, e * RN, null);
    for (let u = 0; u < M.U.length; u++) evalUnterricht(M, this, u, this.vU, u * RN, null);
    const add = A => { for (let i = 0; i < A.length; i++) this.tot[i % RN] += A[i]; };
    add(this.vK); add(this.vL); add(this.vE); add(this.vU);
  }
  hartSumme() { let h = 0; const I = this.M.hartIdx; for (let i = 0; i < I.length; i++) h += this.tot[I[i]]; return h; }
  weichSumme() { let w = 0; const I = this.M.weichIdx, g = this.M.gew; for (let i = 0; i < I.length; i++) w += g[I[i]] * this.tot[I[i]]; return w; }
  // Plan aus Platzierungen laden. roh=true: exakt übernehmen (auch mit Konflikten)
  lade(platzierungen, roh) {
    const M = this.M;
    const map = new Map();
    for (const x of platzierungen) map.set(x.unterricht + '|' + x.blockNr, x);
    const lehrerId = M.data.lehrer.map(l => l.id);
    for (let e = 0; e < M.E.length; e++) {
      const ev = M.E[e];
      const x = map.get(M.U[ev.parts[0].u].id + '|' + (ev.parts[0].b + 1));
      if (!x || x.dauer !== ev.dur || x.tag < 0 || x.tag >= M.D || x.stunde < 1 || x.stunde > M.H) continue;
      const s = x.tag * M.H + x.stunde - 1;
      const raeume = ev.parts.map(p => { const y = map.get(M.U[p.u].id + '|' + (p.b + 1)); return y && y.raum && M.rI.has(y.raum) ? M.rI.get(y.raum) : -1; });
      if (roh) {
        const coL = ev.co.map(z => { const y = map.get(M.U[ev.parts[z.p].u].id + '|' + (ev.parts[z.p].b + 1)); return y && y.co.includes(lehrerId[z.t]) ? 1 : 0; });
        this.setzeRoh(e, s, raeume, coL);
      } else {
        if (this.start[e] >= 0) continue;
        this.begin();
        if (this.platziere(e, s, false, raeume)) this.commit(); else this.rollback();
      }
    }
  }
  // Blocknummer je Ereignis: bei variabler Aufteilung fortlaufend über die aktiven Blöcke (Doppel, Einzel, 14-tägig) – wie musterExport()
  _blockNr(e, p) {
    const M = this.M, u = M.E[e].parts[p].u, g = M.musterEv && M.musterEv[u];
    if (!g) return M.E[e].parts[p].b + 1;
    let n = 0; for (const x of g.d2.concat(g.d1, g.bi)) { if (!M.aktiv[x]) continue; n++; if (x === e) return n; }
    return M.E[e].parts[p].b + 1;
  }
  // gewählte Blockaufteilung je Unterricht mit variabler Aufteilung: [{ id, bloecke, woche }]
  musterExport() {
    const M = this.M, out = [];
    if (!M.musterEv) return out;
    M.musterEv.forEach((g, u) => {
      if (!g) return;
      const evs = g.d2.concat(g.d1, g.bi).filter(e => M.aktiv[e]);
      out.push({ id: M.U[u].id, bloecke: evs.map(e => M.E[e].dur), woche: evs.map(e => M.E[e].woche === 'A' || M.E[e].woche === 'B' ? M.E[e].woche : 'jede') });
    });
    return out;
  }
  exportiere() {
    const M = this.M, out = [];
    for (let e = 0; e < M.E.length; e++) {
      const s0 = this.start[e]; if (s0 < 0) continue;
      const ev = M.E[e], d = Math.floor(s0 / M.H), h = s0 % M.H;
      ev.parts.forEach((p, pi) => {
        const r = this.raum[this.rOff[e] + pi];
        const co = [];
        ev.co.forEach((z, j) => { if (z.p === pi && this.co[this.cOff[e] + j]) co.push(M.data.lehrer[z.t].id); });
        out.push({ unterricht: M.U[p.u].id, blockNr: this._blockNr(e, pi), tag: d, stunde: h + 1, dauer: ev.dur, raum: r >= 0 ? M.data.raeume[r].id : null, gesperrt: !!this.gesperrt[e], co });
      });
    }
    return out;
  }
  zustand() { return { start: this.start.slice(), raum: this.raum.slice(), co: this.co.slice(), lk: this.lk.slice(), aktiv: this.M.musterEv ? this.M.aktiv.slice() : null }; }
  setzeZustand(z) {
    const M = this.M;
    this.occ.fill(0); this.who.fill(-1); this.rocc.fill(0);
    if (z.aktiv) for (let e = 0; e < M.E.length; e++) if (M.aktiv[e] !== z.aktiv[e]) musterAktivSetzen(M, e, z.aktiv[e]);
    if (z.lk && M.PE && M.PE.length) { for (let p = 0; p < M.PE.length; p++) if (this.lk[p] !== z.lk[p]) { for (const u of M.PE[p].us) lkModellSetzen(M, u, z.lk[p]); this.lk[p] = z.lk[p]; } this._personalInit(); }
    this.start.set(z.start); this.raum.set(z.raum); this.co.set(z.co);
    for (let e = 0; e < this.M.E.length; e++) this._belege(e, 1);
    this.initKosten();
  }
}

