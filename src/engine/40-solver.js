/* =====================================================================================================================
   STUNDENPLAN-SOLVER: Fachunterricht und Fachlehrkräfte in EINER Suche
   Zeit, Raum und – für Unterricht mit „Fachlehrkraft automatisch“ – die Fachlehrkraft sind gemeinsam Variablen der Suche
   (Vorbild: hybride lokale Suche der Gewinner des International Timetabling Competition 2011 – Simulated Annealing mit
   Iterated Local Search, Zügen auf Ereignissen UND Ressourcen).
     1. Modell        kompiliere(…, { personal }) – automatische Fachlehrkräfte sind Personal-Einheiten (Variablen), keine Vorbedingung.
     2. Startpersonal gierig: die am stärksten eingeschränkte Einheit zuerst; Kapazität (Deputat, Arbeitszeit), freie Zeiten,
                      Engpassfächer (wer als Einzige(r) ein anderes gefragtes Fach unterrichten kann, wird geschont), Rangfolge.
     3. Konstruktion  Blöcke nach Schwierigkeit, jeweils der beste zulässige Platz, sonst Verdrängung (Ejection).
     4. Suche         Simulated Annealing; in der Verbesserung eine Abkühlung über die verbleibende Zeit, bei Stillstand Wiedererwärmung;
                      bleiben harte Verstöße hängen, Störung durch Ruin & Recreate (Iterated Local Search).
                      Züge Zeit/Raum: Verschieben, Tauschen, Kempe-Kette (zwei Startzeiten, alle verbundenen Blöcke wechseln mit),
                      Verdrängungskette (Ejection Chain), Lückenschluss, Doppel↔Einzel-Kette, Tagestausch, Raumwechsel,
                      Halbgruppen-Paar, Bester Platz.
                      Züge Personal: Lehrkraft wechseln, Lehrkräfte tauschen – konfliktgerichtet bei nicht platzierten Blöcken,
                      harten Verstößen und Unterricht ohne Lehrkraft. Die Zugauswahl passt sich dem Erfolg an.
        Phase „Reparatur“:   harte Verstöße (einschließlich Unterricht ohne Fachlehrkraft) auf 0; weiche Kosten nur als Gleichstandsbrecher.
        Phase „Verbesserung“: Kein Zug darf einen harten Verstoß erzeugen; optimiert werden weiche Regeln und Personalwünsche.
     Co-Abdeckung    Zusatzterm der Bewertung: Blöcke mit Co-Bedarf, für die zur geplanten Zeit keine passende Co-Person frei wäre,
                      kosten je Stunde – so bekommt die spätere blockweise Co-Einteilung einen Plan, in dem sie aufgeht.
     Ausgleich       Personalkosten enthalten die Streuung der Differenz Ist − Soll (Wochenarbeitszeit, quadratisch): Kurse wandern zu
                      Personen mit Minusstunden; gezielte Lehrkraftwechsel und Ringtausch über drei Personen.
     Blockaufteilung Je Kurs (ohne eigene Blöcke) ein Pool aus Doppel-, Einzel- und 14-tägigen Blöcken; aktiv ist genau ein zulässiges Muster
                      mit exakt den Wochenstunden. In der Verbesserung wechselt der Zug „Blockaufteilung“ zwischen den Mustern
                      (teilen, zusammenlegen, Einzel ↔ 14-tägige Doppelstunde, Woche A ↔ B). Klassen und Lehrkräfte mit 14-tägigen
                      Blöcken werden je Woche (A und B) bewertet.
     Strategien      Verbesserung mit Simulated Annealing oder Late Acceptance Hill Climbing (konf.strategie = 'lahc'); die Oberfläche
                      startet auf Rechnern mit mehreren Kernen parallele Suchläufe (verschiedene Seeds/Strategien) und übernimmt den besten.
   Bewertet wird immer lexikographisch: zuerst harte Verstöße, erst danach weiche Kosten. Invariante: Kein Zustand enthält eine
   Doppelbelegung im Raster – Platzieren verdrängt oder scheitert; ein Personalwechsel nimmt kollidierende Blöcke heraus und legt sie neu.
   ===================================================================================================================== */
async function loeseUnterricht(data, konf, cb) {
  cb = cb || {}; konf = konf || {};
  const t0 = jetzt();
  const H0 = data.schule.stunden.length;
  const refMap = new Map();
  data.plan.platzierungen.forEach(p => refMap.set(p.unterricht + '|' + p.blockNr, p.tag * H0 + p.stunde - 1));
  // Reparatur (nach einem erzwungenen Zug) und Teilneuplanung bewegen nur einen Ausschnitt – das Personal bleibt dort, wie es ist
  const rep = !!konf.reparatur, teilArt = !!(konf.teil && konf.teil.art);
  // Blockaufteilung als Variable nur bei vollständiger Neuberechnung – Reparatur, Teilneuplanung und „Änderungen minimal“ behalten die Aufteilung
  const musterAn = !rep && !teilArt && konf.startwert !== 'aktuell' && !konf.minimal && konf._muster !== false;
  // „Plan verbessern“ (Weiterrechnen vom aktuellen Plan) und „Änderungen minimal“: Was schon liegt, bleibt bewusst liegen. Jeder verschobene
  // Unterricht und jede gewechselte Fachlehrkraft kostet in der Suche STAB Punkte – bewegt wird nur, was eine Pflichtregel verletzt oder
  // deutlich bessert. Die Kosten sind keine Regel (W16 bleibt bei „Änderungen minimal“ zusätzlich als Wunsch gezählt).
  const stabil = !rep && !teilArt && (konf.startwert === 'aktuell' || !!konf.minimal);
  const M = kompiliere(data, { gelockert: konf.gelockert || [], minimal: !!konf.minimal || rep, referenz: konf.minimal || rep || stabil ? refMap : null, personal: !rep && !teilArt, muster: musterAn });
  const STAB = rep ? 60 : stabil ? Math.max(0, _num(konf._stab, 25)) : 0;
  const P = new Plan(M);
  const E = M.E.length, S = M.S, H = M.H, NP = M.PE.length, T = M.T;
  const rnd = mulberry32((konf.seed >>> 0) || 1);
  const ri = n => Math.floor(rnd() * n);
  const zeitlimit = Math.max(1, _num(konf.zeitlimit, 60)) * 1000;
  const iterLimit = Math.max(0, _int(konf.iterLimit, 0));
  const statistik = { iterationen: 0, zuege: {}, phase1Iter: 0, konstruiert: 0, verdraengt: 0, stoerungen: 0, personalWechsel: 0 };
  const aktuellMap = new Map();
  data.plan.platzierungen.forEach(p => aktuellMap.set(p.unterricht + '|' + p.blockNr, p));
  const slotAus = ev => { const p = aktuellMap.get(M.U[ev.parts[0].u].id + '|' + (ev.parts[0].b + 1)); return p && p.dauer === ev.dur && p.tag < M.D && p.stunde <= H ? p.tag * H + p.stunde - 1 : -1; };
  const raeumeAus = ev => ev.parts.map(pt => { const p = aktuellMap.get(M.U[pt.u].id + '|' + (pt.b + 1)); return p && p.raum && M.rI.has(p.raum) ? M.rI.get(p.raum) : -1; });

  // ---------- 1. feste Ereignisse und Teilneuplanung ----------
  const beweglich = new Uint8Array(Math.max(1, E));
  let teilSel = null;
  if (teilArt) {
    const a = konf.teil.art, id = konf.teil.id;
    if (a === 'klasse' && M.kI.has(id)) { const c = M.kI.get(id); teilSel = e => M.E[e].klassen.includes(c); }
    else if (a === 'lehrer' && M.lI.has(id)) { const t = M.lI.get(id); teilSel = e => M.E[e].lehrer.includes(t); }
    else if (a === 'tag') { const d = _int(id, 0); teilSel = e => { const s = slotAus(M.E[e]); return s >= 0 && Math.floor(s / H) === d; };
      for (let e = 0; e < E; e++) if (teilSel(e)) { const ev = M.E[e]; const l = []; for (const s of ev.erlaubt) { if (Math.floor(s / H) === d) l.push(s); else M.erlaubt[e * S + s] = 0; } ev.erlaubt = Int32Array.from(l); } }
  }
  for (let e = 0; e < E; e++) {
    const ev = M.E[e];
    if (ev.fixStart >= 0) { P.fest[e] = 1; P.setzeRoh(e, ev.fixStart, raeumeAus(ev), null); continue; }
    if (teilSel && !teilSel(e)) { P.fest[e] = 1; const s = slotAus(ev); if (s >= 0) P.setzeRoh(e, s, raeumeAus(ev), null); continue; }
    beweglich[e] = 1;
  }
  P.initKosten();
  // anteilige Co-Lehrkräfte (feste Vorgaben) auf die gesetzten Blöcke verteilen
  if (M.U.some(U => U.coZiel.length)) { P.begin(); M.U.forEach((U, u) => { if (U.coZiel.length) P.coNeu(u); }); P.commit(); }
  if (konf.startwert === 'aktuell' || teilSel) {
    for (let e = 0; e < E; e++) {
      if (!beweglich[e]) continue;
      const s = slotAus(M.E[e]); if (s < 0) continue;
      P.begin(); if (P.platziere(e, s, false, raeumeAus(M.E[e]))) P.commit(); else P.rollback();
    }
  }
  const bew = []; for (let e = 0; e < E; e++) if (beweglich[e]) bew.push(e);
  // Personal-Einheiten, deren Lehrkraft die Suche wählen darf (mindestens eine geeignete Person). Auch fest liegende (fixierte) Blöcke
  // bekommen ihre Lehrkraft von der Suche – nur die Zeit steht dort fest.
  const peFrei = new Uint8Array(Math.max(1, NP)), peBew = [];
  for (let p = 0; p < NP; p++) if (M.PE[p].cands.length) { peFrei[p] = 1; peBew.push(p); }
  const peWahl = peBew;

  let stabF = 1; // Reparatur: wird schrittweise gesenkt, wenn sich die harten Verstöße in der Nähe nicht auflösen lassen
  let peStart = null; // Fachlehrkräfte zu Beginn (Weiterrechnen): ein Wechsel kostet wie ein verschobener Unterricht
  if (stabil && NP) peStart = Int32Array.from(P.lk.subarray(0, NP));
  const personalAnders = () => { if (!peStart) return 0; let n = 0; for (let p = 0; p < NP; p++) if (peStart[p] >= 0 && P.lk[p] !== peStart[p]) n++; return n; };
  const stabK = () => STAB ? STAB * stabF * (P.tot[RI.W16] + (stabil ? personalAnders() : 0)) : 0; // Zusatzkosten je verschobenem Unterricht (Reparatur, Weiterrechnen)
  const hartJetzt = () => P.hartSumme() + P.pHart;
  const weichJetzt = () => P.weichSumme() + P.pWeich;
  // curC: geschätzte fehlende Co-Stunden des aktuellen Stands – Co-Lehrkräfte sind Pflicht und stehen in der Rangfolge direkt hinter den
  // harten Regeln: In der Verbesserung wird kein Zug angenommen, der sie erhöht, und der beste Stand wird zuerst nach ihnen verglichen.
  let iter = 0, cur = 0, curH = 0, curC = 0, coLetzt = 0, best = null, offen = [], phase = 1;
  const verlauf = [];
  const fortschritt = (ph, prozent) => ({ phase: ph, iterationen: iter, kostenHart: curH, besteHart: best ? best.hart : curH, besteWeich: best ? best.weich : 0, verstoesse: Array.from(P.tot), prozent, zeit: (jetzt() - t0) / 1000, unplatziert: offen.length, ohneLehrkraft: nnZahl() });
  const nnZahl = () => { let n = 0; for (let p = 0; p < NP; p++) if (P.lk[p] < 0) n += M.PE[p].us.length; return n; };

  // Halbgruppen-Paare: zwei Gruppen-Ereignisse derselben Klasse (verschiedene Gruppen), die zur selben Zeit liegen, werden gemeinsam bewegt
  const istTeil = new Uint8Array(Math.max(1, E));
  for (const e of bew) { const ev = M.E[e]; if (ev.aufgabe || ev.klassen.length !== 1 || !ev.kMaske) continue; const m = ev.kMaske.get(ev.klassen[0]); if (m !== undefined && !(m & 1)) istTeil[e] = 1; }
  const hatTeil = istTeil.some(x => x === 1);
  const partner = e => {
    if (!hatTeil || !istTeil[e]) return -1;
    const s = P.start[e]; if (s < 0) return -1;
    const ev = M.E[e], c = ev.klassen[0], m = ev.kMaske.get(c);
    for (const p of M.kEv[c]) if (p !== e && istTeil[p] && !P.fest[p] && P.start[p] === s && M.E[p].dur === ev.dur && M.E[p].woche === ev.woche && !(M.E[p].kMaske.get(c) & m)) return p;
    return -1;
  };

  // Nach einem Personalwechsel: Blöcke der Einheit, deren neue Lehrkraft zur selben Zeit schon eingeplant oder gesperrt ist,
  // herausnehmen und an einem freien Platz neu legen (ausw = notfalls mit Verdrängung, nur in der Reparaturphase).
  const neuLegen = (e, ausw) => {
    const L = M.E[e].erlaubt, n = L.length; if (!n) return;
    const off = ri(n); let ok = false;
    for (let i = 0; i < n && !ok; i++) ok = P.platziere(e, L[(off + i) % n], false);
    if (!ok && ausw) P.platziere(e, L[off], true);
  };
  const aufloesen = (p, ausw) => {
    for (const e of M.PE[p].evs) {
      if (P.start[e] < 0 || !P.lehrerKonflikt(e)) continue;
      if (!P.fest[e]) { P.entferne(e); neuLegen(e, ausw); continue; }
      // fest liegender Block: statt seiner weichen die beweglichen Blöcke, mit denen die neue Lehrkraft dort kollidiert
      const ev = M.E[e], s0 = P.start[e];
      for (const t of ev.immer) for (const x of M.lEv[t].slice()) {
        if (x === e || P.fest[x] || P.start[x] < 0 || !istAktiv(M, P, x, t)) continue;
        const sx = P.start[x], vx = M.E[x];
        if (sx + vx.dur <= s0 || s0 + ev.dur <= sx || !vx.wochen.some(w => ev.wochen.includes(w))) continue;
        P.entferne(x); neuLegen(x, false);
      }
    }
  };

  // ---------- Co-Abdeckung (nur Bewertung in der Suche) ----------
  // Co-Lehrkräfte werden erst nach dem fertigen Fachplan blockweise eingeteilt. Damit das gelingt, schätzt die Suche schon jetzt, wie viele
  // Co-Stunden zum geplanten Zeitpunkt niemand übernehmen könnte: Für jeden Block mit Co-Bedarf wird gierig eine passende Person gesucht, die
  // anwesend, nicht gesperrt und nicht anderweitig belegt ist (eigener Unterricht, feste Co-Einsätze, Aufgaben) und noch Deputat frei hat
  // (ausgebildete Lehrkräfte nur mit dem Anteil der Co-Wichtung). Reihenfolge der Kurse wie bei der späteren Einteilung.
  // Fehlende Co-Stunden kosten CO_GEWICHT je Stunde und je betroffenem Kurs (in der Reparatur nur ein Zehntel).
  const coK = [], coPers = new Set(), CO_GEWICHT = Math.max(0, _num(konf._coGew, 100));
  if (!rep && !teilArt) {
    const R = nCoRegeln(data.schule.coRegeln || {}), blA = bloeckeAlle(data), fMap = new Map(data.faecher.map(f => [f.id, f]));
    M.U.forEach((U, ui) => {
      const u = data.unterrichte[ui], f = u && fMap.get(u.fach);
      if (!f || u.aufgabe || !u.klassen.length || u.lehrkraefte.some(z => z.rolle === 'co')) return;
      const cb = coBedarfVon(data, u, blA.get(u.id), f); if (!(cb.std > 0)) return;
      const cand = [];
      data.lehrer.forEach((l, t) => { if (t < T && coAutoBefaehigt(l, u.fach) && !(l.ausgebildet !== false && R.lehrkraefte === 'nie')) cand.push(t); });
      if (!cand.length || !M.uEv[ui].length) return;
      cand.sort((a, b) => (data.lehrer[a].ausgebildet === false ? 0 : 1) - (data.lehrer[b].ausgebildet === false ? 0 : 1) || a - b); // Co-Kräfte zuerst
      cand.forEach(t => coPers.add(t));
      coK.push({ alle: cb.alle, std: cb.std, cand: Int32Array.from(cand), evs: M.uEv[ui] });
    });
  }
  const coListe = [...coPers];
  const coDep = new Float64Array(Math.max(1, T)).fill(Infinity), coFaktorL = new Float64Array(Math.max(1, T)).fill(1), coBasis = new Float64Array(Math.max(1, T));
  const coAzSoll = new Float64Array(Math.max(1, T)).fill(Infinity), coAzFix = new Float64Array(Math.max(1, T)); let coMinStd = 60;
  if (coK.length) {
    const am = data.schule.arbeitszeitModell || ARBEITSZEIT_STD, R = nCoRegeln(data.schule.coRegeln || {});
    coListe.forEach(t => { const l = data.lehrer[t]; if (am.stundenSoll && l.deputat !== null && l.deputat !== undefined) coDep[t] = l.deputat; if (l.ausgebildet !== false) coFaktorL[t] = R.wichtung / 10; });
    // Wochenarbeitszeit wie bei der späteren Co-Einteilung: Co nur, solange Soll-Arbeitszeit frei ist (Co-Stunde samt Vorbereitung).
    // Ohne diese Grenze hielt die Suche Co-Stunden für gedeckt, die später niemand übernehmen durfte.
    coMinStd = M.stdMin + am.vorbCo;
    coListe.forEach(t => { const l = data.lehrer[t]; coAzSoll[t] = l.arbeitszeit > 0 ? l.arbeitszeit * 60 : 0;
      if (!NP) { let m = M.lWocheFix[t]; for (const e of M.lEv[t]) { if (!M.aktiv[e]) continue; const ev = M.E[e]; m += ev.dur * M.stdMin * (ev.azF.get(t) || ev.wf) + (ev.azV.get(t) || 0); } coAzFix[t] = m; } });
    if (!NP) M.U.forEach((U, ui) => { const std = M.uEv[ui].reduce((a, e) => a + M.E[e].dur * M.E[e].wf, 0); U.lehrer.forEach(t => { const z = U.coZiel.find(x => x.t === t); coBasis[t] += z ? z.anteil : (U.aufgabe && data.unterrichte[ui].anrechnung === false ? 0 : std); }); });
  }
  const coStempel = new Int32Array(coK.length ? T * 2 * S : 1), coRest = new Float64Array(Math.max(1, T));
  let coStamp = 0, coFaktor = 1;
  const coFehlt = () => {
    if (!coK.length) return 0;
    coStamp++;
    for (const t of coListe) {
      const dep = Number.isFinite(coDep[t]) ? Math.max(0, coDep[t] - (NP ? P.pLast[t] : coBasis[t])) * coFaktorL[t] : Infinity;
      const az = Number.isFinite(coAzSoll[t]) ? Math.max(0, coAzSoll[t] - (NP && P.pAz ? P.pAz[t] : coAzFix[t]) - 3) / coMinStd : Infinity;
      coRest[t] = Math.min(dep, az);
    }
    let fehlt = 0;
    for (const k of coK) {
      let gepl = 0, ged = 0;
      for (const e of k.evs) {
        const s0 = P.start[e]; if (s0 < 0) continue;
        const ev = M.E[e], h = ev.dur * ev.wf; gepl += h;
        if (!k.alle && ged >= k.std - 1e-9) continue;
        for (const t of k.cand) {
          if (coRest[t] < h - 1e-9) continue;
          let ok = true;
          for (let j = 0; j < ev.dur && ok; j++) {
            if (M.lVerf[t * S + s0 + j] === 0) { ok = false; break; }
            for (const w of ev.wochen) { const i = (t * 2 + w) * S + s0 + j; if (P.occ[i] > 0 || coStempel[i] === coStamp) { ok = false; break; } }
          }
          if (!ok) continue;
          for (let j = 0; j < ev.dur; j++) for (const w of ev.wochen) coStempel[(t * 2 + w) * S + s0 + j] = coStamp;
          coRest[t] -= h; ged += h; break;
        }
      }
      const soll = k.alle ? gepl : Math.min(k.std, gepl);
      if (ged < soll - 1e-9) fehlt += soll - ged + 1; // je Kurs mit Lücke zusätzlich eine Stunde: lieber ganze Kurse vollständig besetzen
    }
    return fehlt;
  };
  const coKosten = () => { if (!coK.length) { coLetzt = 0; return 0; } coLetzt = coFehlt(); return coFaktor * CO_GEWICHT * coLetzt; };
  // Zusatzkosten der Suche, die nicht als Regel gezählt werden: Stabilität (Reparatur) und Co-Abdeckung
  // Abweichung von der Standard-Blockaufteilung: je abweichendem Kurs MUSTER_ABW + 25 je verändertem Block. Weit über allen weichen Wünschen,
  // aber unter einem harten Verstoß – eine andere Aufteilung lohnt sich nur, wenn sie einen harten Verstoß beseitigt.
  const MUSTER_ABW = 250, musterAlle = [];
  if (M.musterEv) M.musterEv.forEach((g, u) => { if (g) musterAlle.push(u); });
  const musterAbstand = u => { const g = M.musterEv[u], s = M.U[u].muster.std; let n2 = 0, n1 = 0, nb = 0; for (const e of g.d2) n2 += M.aktiv[e]; for (const e of g.d1) n1 += M.aktiv[e]; for (const e of g.bi) nb += M.aktiv[e]; return Math.abs(n2 - s.n2) + Math.abs(n1 - s.n1) + Math.abs(nb - s.nb); };
  let abwVer = -1, abwWert = 0, curAbw = 0;
  const abwK = () => { if (!musterAlle.length) return 0; if (M.musterVer !== abwVer) { abwVer = M.musterVer; abwWert = 0; for (const u of musterAlle) { const a = musterAbstand(u); if (a) abwWert += MUSTER_ABW + 25 * a; } } return abwWert; };
  const zusK = () => stabK() + coKosten() + abwK();

  // ---------- 2. Startpersonal: gierig, die am stärksten eingeschränkte Einheit zuerst ----------
  // Ausgleich in der Startzuteilung nur gedämpft: Die Reparatur braucht zuerst einen gut planbaren Stand (Klassenleitung, wenige Personen je
  // Klasse); den Ausgleich übernimmt danach die Suche mit vollem Gewicht.
  const startFair = _num(konf._startFair, 0.3);
  const personalStart = () => {
    const offenP = peBew.filter(p => P.lk[p] < 0);
    if (!offenP.length) return;
    const am = M.azm, stdMin = M.stdMin;
    // Arbeitszeit in Minuten (Unterricht samt Vorbereitung, feste Termine, Klassenleitung) – Stand ohne die offenen Einheiten
    const azNutz = new Float64Array(Math.max(1, T));
    for (let t = 0; t < T; t++) { let m = M.lWocheFix[t]; for (const e of M.lEv[t]) { const ev = M.E[e]; m += ev.dur * stdMin * (ev.azF.get(t) || ev.wf) + (ev.azV.get(t) || 0); } azNutz[t] = m; }
    const jeStd = stdMin + am.vorbLehrkraft; // Minuten je Unterrichtsstunde samt Vorbereitung
    // freie Rasterstunden je Person im Korridor der Klassen (grob): passt die Einheit überhaupt in die Zeiten der Person?
    const passtCache = new Map();
    const passt = (pe, t) => {
      const key = pe.i * T + t; if (passtCache.has(key)) return passtCache.get(key);
      let von = 1, bis = 99; pe.klassen.forEach(c => { von = Math.max(von, M.kFrueh[c]); bis = Math.min(bis, M.kSpaet[c]); });
      let tage = 0, stunden = 0;
      for (let d = 0; d < M.D; d++) { let n = 0; for (let h = 0; h < H; h++) { const s = d * H + h; if (M.slotOk[s] && M.lnr[h] >= von && M.lnr[h] <= bis && M.lVerf[t * S + s] !== 0) n++; } if (n) tage++; stunden += Math.min(n, M.lMax[t] || 99); }
      const ok = tage >= Math.min(pe.nBl, M.D) && stunden >= pe.std;
      passtCache.set(key, ok); return ok;
    };
    // W18 schon in der Startzuteilung: Kernfach der eigenen Klasse an die Klassenleitung (wie in der Suche je Wochenstunde gewichtet)
    const kernKL = (pe, t) => { if (pe.klassen.length !== 1 || !M.fSchwer[pe.f]) return 0; const c = pe.klassen[0], kl = M.kKL[c]; return kl >= 0 && kl !== t && pe.kann[kl] && (M.klKern[c] || []).some(k => k.f === pe.f) ? M.gew[RI.W18] * pe.std : 0; };
    const frei = t => Math.max(0, Math.min(M.pDep[t] - P.pLast[t], M.lWocheMax[t] ? (M.lWocheMax[t] - azNutz[t]) / jeStd : Infinity));
    // Engpassfächer: offene Stunden je Fach gegen die freie Kapazität aller, die das Fach unterrichten können
    const lehrerFach = new Map(); for (let p = 0; p < NP; p++) { const f = M.PE[p].f; if (!lehrerFach.has(f)) lehrerFach.set(f, new Set()); M.PE[p].cands.forEach(t => lehrerFach.get(f).add(t)); }
    const bedarf = new Map(); offenP.forEach(p => { const f = M.PE[p].f; bedarf.set(f, (bedarf.get(f) || 0) + M.PE[p].std); });
    const faecherVon = new Array(T).fill(null).map(() => []); lehrerFach.forEach((L, f) => L.forEach(t => faecherVon[t].push(f)));
    const engpass = (pe, t) => {
      let fehlt = 0;
      for (const g of faecherVon[t]) {
        if (g === pe.f || !(bedarf.get(g) > 1e-9)) continue;
        let ang = 0; for (const x of lehrerFach.get(g)) ang += Math.min(frei(x), 1e6);
        const nach = ang - Math.min(pe.std, frei(t));
        if (nach < bedarf.get(g) - 1e-9) fehlt = Math.max(fehlt, bedarf.get(g) - nach);
      }
      return fehlt;
    };
    const wert = (pe, t) => {
      const ueber = Math.max(0, P.pLast[t] + pe.std - M.pDep[t]);
      const azUeber = M.lWocheMax[t] ? Math.max(0, azNutz[t] + pe.std * jeStd - M.lWocheMax[t]) / stdMin : 0;
      // übrige Personalkosten genau wie in der Suche: Rangfolge, Paar Klasse–Lehrkraft und Ausgleich der Differenz Ist − Soll
      return (passt(pe, t) ? 0 : 1e6) + (ueber + azUeber) * 1e4 + engpass(pe, t) * 1e3 + P.personalDeltaWert(pe.i, t, startFair) + kernKL(pe, t) + rnd();
    };
    P.begin();
    // Vorrang der Klassenleitung (W18): Bevor die übrigen Einheiten gierig verteilt werden, bekommt jede Klassenleitung die Kernfächer ihrer
    // eigenen Klasse, sofern sie zeitlich passt, Deputat und Arbeitszeit reichen und dadurch kein Engpassfach unbesetzt bliebe. Sonst verbrauchte
    // die gierige Reihenfolge ihre Kapazität oft zuerst in fremden Klassen. (Alle Fächer vorab zu vergeben, machte den Plan zu eng.)
    if (!konf._ohneKlVorrang) {
      const vorab = [];
      for (const p of offenP) { const pe = M.PE[p]; if (pe.klassen.length !== 1) continue; const kl = M.kKL[pe.klassen[0]]; if (kl < 0 || !pe.kann[kl] || !M.fSchwer[pe.f] || !(M.klKern[pe.klassen[0]] || []).some(k => k.f === pe.f)) continue; vorab.push({ p, kl, kern: 1 }); }
      vorab.sort((a, b) => b.kern - a.kern || M.PE[b.p].std - M.PE[a.p].std || a.p - b.p);
      for (const x of vorab) {
        const pe = M.PE[x.p];
        if (P.lk[x.p] >= 0 || !passt(pe, x.kl) || frei(x.kl) < pe.std - 1e-9 || engpass(pe, x.kl) > 1e-9) continue;
        P.setzeLehrer(x.p, x.kl);
        for (const e of pe.evs) { const ev = M.E[e]; azNutz[x.kl] += ev.dur * stdMin * (ev.azF.get(x.kl) || ev.wf) + (ev.azV.get(x.kl) || 0); }
        bedarf.set(pe.f, bedarf.get(pe.f) - pe.std);
        aufloesen(x.p, false);
      }
    }
    const rest = new Set(offenP.filter(p => P.lk[p] < 0));
    while (rest.size) {
      // am stärksten eingeschränkte Einheit: wenigste Kandidaten ohne Überlast, bei Gleichstand die größte
      let wahl = -1, wn = Infinity;
      for (const p of rest) {
        const pe = M.PE[p]; let n = 0;
        for (const t of pe.cands) if (passt(pe, t) && frei(t) >= pe.std - 1e-9) n++;
        if (n < wn || (n === wn && pe.std > M.PE[wahl].std)) { wn = n; wahl = p; }
      }
      const pe = M.PE[wahl]; rest.delete(wahl);
      let bt = -1, bw = Infinity;
      for (const t of pe.cands) { const w = wert(pe, t); if (w < bw) { bw = w; bt = t; } }
      bedarf.set(pe.f, bedarf.get(pe.f) - pe.std);
      if (bt < 0) continue;
      P.setzeLehrer(wahl, bt);
      for (const e of pe.evs) { const ev = M.E[e]; azNutz[bt] += ev.dur * stdMin * (ev.azF.get(bt) || ev.wf) + (ev.azV.get(bt) || 0); }
      aufloesen(wahl, false);
    }
    P.commit();
  };
  personalStart();

  // ---------- 3. Konstruktion: Ereignisse nach Schwierigkeit, jeweils bester Slot, sonst Verdrängung ----------
  const obj0 = () => hartJetzt() * HART_GEWICHT + weichJetzt() + zusK();
  const schwer = e => { const ev = M.E[e]; const spez = ev.parts.some(p => p.cands && p.typ !== 'klassenraum') ? 1 : 0; return (ev.parts.length > 1 ? 1e6 : 0) + spez * 1e5 + (S - ev.erlaubt.length) * 100 + ev.units.length * 10 + ev.co.length * 10 + ev.dur; };
  let queue = bew.filter(e => P.start[e] < 0 && M.E[e].erlaubt.length);
  for (let i = queue.length - 1; i > 0; i--) { const j = ri(i + 1); const x = queue[i]; queue[i] = queue[j]; queue[j] = x; }
  queue.sort((a, b) => schwer(b) - schwer(a));
  const verdraengt = new Int16Array(Math.max(1, E));
  let guard = 0, letzteMeldung = jetzt();
  while (queue.length && guard++ < E * 30) {
    const e = queue.shift();
    if (P.start[e] >= 0) continue;
    const ev = M.E[e];
    let bestS = -1, bestC = Infinity;
    for (const s of ev.erlaubt) {
      P.begin();
      if (P.platziere(e, s, false)) { P.commit(); const c = obj0() + rnd() * 1e-3; if (c < bestC) { bestC = c; bestS = s; } }
      P.rollback();
    }
    if (bestS >= 0) { P.begin(); P.platziere(e, bestS, false); P.commit(); statistik.konstruiert++; continue; }
    bestC = Infinity; bestS = -1;
    for (const s of ev.erlaubt) {
      P.begin();
      if (P.platziere(e, s, true)) {
        P.commit();
        let strafe = 0;
        for (let i = 0; i < P.logE.length; i++) { const x = P.logE[i]; if (x !== e && P.logS[i] >= 0 && P.start[x] < 0) strafe += verdraengt[x] * 500; }
        const c = obj0() + strafe + rnd() * 1e-3;
        if (c < bestC) { bestC = c; bestS = s; }
      }
      P.rollback();
    }
    if (bestS >= 0) {
      P.begin(); P.platziere(e, bestS, true); P.commit();
      for (let i = 0; i < P.logE.length; i++) { const x = P.logE[i]; if (x !== e && P.logS[i] >= 0 && P.start[x] < 0) { verdraengt[x]++; statistik.verdraengt++; if (verdraengt[x] <= 8) queue.push(x); } }
    }
    if (jetzt() - letzteMeldung > 250) { letzteMeldung = jetzt(); if (cb.progress) cb.progress(fortschritt('Konstruktion', 0)); await pause0(); if (cb.stop && cb.stop()) break; }
  }
  P.initKosten();

  // ---------- 4. Suche ----------
  const ZUEGE = ['Verschieben', 'Tauschen', 'Kettentausch', 'Tagestausch', 'Raumwechsel', 'Lehrkraft wechseln', 'Lehrkräfte tauschen', 'Kempe-Kette', 'Lückenschluss', 'Verdrängungskette', 'Bester Slot', 'Halbgruppen-Paar', 'Zurücklegen', 'Blockaufteilung'];
  const NZ = 10; // adaptiv gewichtete Züge (0–9)
  const zugGew = [4, 4, 1, 0.5, 0.5, peWahl.length ? 1.5 : 0, peWahl.length > 1 ? 0.7 : 0, 2, 1, 1], zugVersuch = new Float64Array(NZ), zugErfolg = new Float64Array(NZ);
  if (Array.isArray(konf._zugGew)) konf._zugGew.forEach((w, i) => { if (i < NZ && zugGew[i] > 0) zugGew[i] = w; }); // nur für Vergleichsläufe
  ZUEGE.forEach(z => { statistik.zuege[z] = { versucht: 0, angenommen: 0 }; });
  const raumEv = bew.filter(e => M.E[e].parts.some(p => p.cands && p.cands.length > 1));
  const klassenMitEv = []; for (let c = 0; c < M.C; c++) if (M.kEv[c].some(e => beweglich[e])) klassenMitEv.push(c);
  const offenNeu = () => { offen = bew.filter(e => P.start[e] < 0 && M.E[e].erlaubt.length); };
  let problem = [], peProb = [];
  const problemNeu = () => {
    const set = new Set(), HI = M.hartIdx;
    for (let c = 0; c < M.C; c++) { let h = 0; for (const r of HI) h += P.vK[c * RN + r]; if (h > 0) for (const e of M.kEv[c]) if (beweglich[e]) set.add(e); }
    for (let t = 0; t < T; t++) { let h = 0; for (const r of HI) h += P.vL[t * RN + r]; if (h > 0) for (const e of M.lEv[t]) if (beweglich[e]) set.add(e); }
    for (let u = 0; u < M.U.length; u++) { let h = 0; for (const r of HI) if (r !== RI.H04) h += P.vU[u * RN + r]; if (h > 0) for (const e of M.uEv[u]) if (beweglich[e]) set.add(e); }
    for (let e = 0; e < E; e++) { if (!beweglich[e]) continue; let h = 0; for (const r of HI) h += P.vE[e * RN + r]; if (h > 0) set.add(e); }
    problem = [...set].filter(e => M.aktiv[e]);
    // Personal-Einheiten mit Problem: ohne Lehrkraft, mit nicht platziertem Block oder an einem harten Verstoß beteiligt
    const pset = new Set();
    for (const p of peWahl) if (P.lk[p] < 0) pset.add(p);
    const blick = e => { for (const pt of M.E[e].parts) { const p = M.uPE[pt.u]; if (p >= 0 && peFrei[p]) pset.add(p); } };
    problem.forEach(blick); bew.forEach(e => { if (P.start[e] < 0) blick(e); });
    // auch die Einheiten der Lehrkräfte, die an einem Problem beteiligt sind (Engpass: andere Kurse dieser Person abgeben)
    const lehrerProb = new Set(); problem.forEach(e => M.E[e].immer.forEach(t => lehrerProb.add(t))); bew.forEach(e => { if (P.start[e] < 0) M.E[e].immer.forEach(t => lehrerProb.add(t)); });
    for (const p of peWahl) if (P.lk[p] >= 0 && lehrerProb.has(P.lk[p])) pset.add(p);
    peProb = [...pset];
  };
  offenNeu(); problemNeu();
  phase = hartJetzt() > 0 ? 1 : 2;
  // ---------- Blockaufteilung als Entscheidung der Suche ----------
  const musterU = []; if (M.musterEv) M.musterEv.forEach((g, u) => { if (g && M.uEv[u].some(e => beweglich[e])) musterU.push(u); });
  // je Klasse die Kurse mit variabler Aufteilung – in der Reparatur wird bevorzugt dort umgestellt, wo Blöcke fehlen oder Konflikte liegen
  const musterJeKlasse = Array.from({ length: M.C }, () => []);
  musterU.forEach(u => { const ks = new Set(); M.uEv[u].forEach(e => M.E[e].klassen.forEach(c => ks.add(c))); ks.forEach(c => musterJeKlasse[c].push(u)); });
  const musterWahl = anker => {
    if (anker === undefined && phase === 1 && (offen.length || problem.length) && rnd() < 0.7) anker = offen.length && (!problem.length || rnd() < 0.5) ? offen[ri(offen.length)] : problem[ri(problem.length)];
    if (anker !== undefined) { const kand = [...new Set(M.E[anker].klassen.flatMap(c => musterJeKlasse[c]))]; if (kand.length) return kand[ri(kand.length)]; }
    return musterU[ri(musterU.length)];
  };
  // zufälliges bewegliches Ereignis, bevorzugt ein aktives (inaktive Pool-Blöcke können nicht platziert werden)
  const zufEv = () => { for (let i = 0; i < 8; i++) { const e = bew[ri(bew.length)]; if (M.aktiv[e]) return e; } return bew[ri(bew.length)]; };
  // Einen (neu aktivierten) Block legen: zuerst an den Wunschstellen (frei gewordener Platz), sonst am ersten freien zulässigen Slot ab einer
  // Zufallsposition; in der Reparatur notfalls mit Verdrängung
  const belegtK = new Uint8Array(S);
  const legeNeu = (e, wunsch) => {
    P.setzeAktiv(e, 1);
    for (const s of wunsch) if (s >= 0 && s < S && M.erlaubt[e * S + s] && P.platziere(e, s, false)) return true;
    const ev = M.E[e], L = ev.erlaubt, n = L.length; if (!n) return false;
    // zuerst Plätze direkt vor oder nach Unterricht der Klasse am selben Tag (keine neuen Lücken), dann alle übrigen
    const c = ev.klassen[0];
    if (c !== undefined) {
      belegtK.fill(0);
      for (const x of M.kEv[c]) { const sx = P.start[x]; if (sx >= 0) for (let k = 0; k < M.E[x].dur; k++) belegtK[sx + k] = 1; }
      const nah = [];
      for (const s0 of L) {
        const h = s0 % H; if (belegtK[s0] || (ev.dur > 1 && belegtK[s0 + 1])) continue;
        if ((h > 0 && belegtK[s0 - 1]) || (h + ev.dur < H && belegtK[s0 + ev.dur])) nah.push(s0);
      }
      for (let i = nah.length - 1; i > 0; i--) { const j = ri(i + 1); const t = nah[i]; nah[i] = nah[j]; nah[j] = t; }
      for (const s0 of nah) if (P.platziere(e, s0, false)) return true;
    }
    const off = ri(n);
    for (let i = 0; i < n; i++) if (P.platziere(e, L[(off + i) % n], false)) return true;
    return phase === 1 ? P.platziere(e, L[off], true) : false;
  };
  const um = (s, ...d) => s < 0 ? [] : d.map(x => s + x);
  // Notlage für die Blockaufteilung: Reparatur ohne Fortschritt (lange kein besserer Stand, mindestens zwei Störungen) – erst dann darf die Suche
  // Stunden anders aufteilen als nach Fachregel (Doppelstunde teilen, Einzelstunde 14-tägig …). In der Verbesserung nie.
  let seitBestH = 0;
  const notfall = () => phase === 1 && !rep && statistik.stoerungen >= 2 && seitBestH > 2000;
  // Zug „Blockaufteilung“: Doppelstunde teilen, zwei Einzelstunden zusammenlegen, Einzelstunde ↔ 14-tägige Doppelstunde, Woche A ↔ B,
  // Doppelstunde ↔ Einzelstunde + 14-tägige Doppelstunde – immer nur zwischen zulässigen Mustern (die Stundenzahl bleibt exakt)
  const zMuster = anker => {
    if (!musterU.length) return false;
    const u = musterWahl(anker), mu = M.U[u].muster, g = M.musterEv[u];
    const a2 = g.d2.filter(e => M.aktiv[e]), a1 = g.d1.filter(e => M.aktiv[e]), ab = g.bi.filter(e => M.aktiv[e]);
    const n2 = a2.length, n1 = a1.length, nb = ab.length;
    const gibt = (x2, x1, xb) => mu.liste.some(m => m.n2 === x2 && m.n1 === x1 && m.nb === xb);
    // Abstand zur Standardaufteilung vorher/nachher: Ohne Notlage nur Züge zurück zum Standard (und Woche A ↔ B), sonst alle
    const s = mu.std, ab0 = Math.abs(n2 - s.n2) + Math.abs(n1 - s.n1) + Math.abs(nb - s.nb), frei = notfall();
    const ops = [], op = (o, x2, x1, xb) => { if (frei || o === 4 || Math.abs(x2 - s.n2) + Math.abs(x1 - s.n1) + Math.abs(xb - s.nb) < ab0) ops.push(o); };
    if (n2 && gibt(n2 - 1, n1 + 2, nb)) op(0, n2 - 1, n1 + 2, nb);
    if (n1 >= 2 && gibt(n2 + 1, n1 - 2, nb)) op(1, n2 + 1, n1 - 2, nb);
    if (n1 && !nb && gibt(n2, n1 - 1, 1)) op(2, n2, n1 - 1, 1);
    if (nb && gibt(n2, n1 + 1, 0)) op(3, n2, n1 + 1, 0);
    if (nb) op(4, n2, n1, nb);
    if (n2 && !nb && gibt(n2 - 1, n1 + 1, 1)) op(5, n2 - 1, n1 + 1, 1);
    if (nb && n1 && gibt(n2 + 1, n1 - 1, 0)) op(6, n2 + 1, n1 - 1, 0);
    if (!ops.length) return false;
    const o = ops[ri(ops.length)];
    const frei2 = (liste, ohne) => liste.find(e => !M.aktiv[e] && e !== ohne);
    const biNeu = () => g.bi[ri(2)];
    P.begin();
    if (o === 0) { const d = a2[ri(n2)], s0 = P.start[d]; P.setzeAktiv(d, 0); const x = frei2(g.d1), y = frei2(g.d1, x); legeNeu(x, um(s0, 0, 1)); legeNeu(y, []); }
    else if (o === 1) { const i = ri(n1); let j = ri(n1 - 1); if (j >= i) j++; const x = a1[i], y = a1[j], sx = P.start[x], sy = P.start[y]; P.setzeAktiv(x, 0); P.setzeAktiv(y, 0); legeNeu(frei2(g.d2), um(sx, 0, -1).concat(um(sy, 0, -1))); }
    else if (o === 2) { const x = a1[ri(n1)], s0 = P.start[x]; P.setzeAktiv(x, 0); legeNeu(biNeu(), um(s0, 0, -1)); }
    else if (o === 3) { const b = ab[0], s0 = P.start[b]; P.setzeAktiv(b, 0); legeNeu(frei2(g.d1), um(s0, 0, 1)); }
    else if (o === 4) { const b = ab[0], s0 = P.start[b], b2 = g.bi[0] === b ? g.bi[1] : g.bi[0]; P.setzeAktiv(b, 0); legeNeu(b2, um(s0, 0)); }
    else if (o === 5) { const d = a2[ri(n2)], s0 = P.start[d]; P.setzeAktiv(d, 0); legeNeu(frei2(g.d1), um(s0, 0, 1)); legeNeu(biNeu(), []); }
    else { const b = ab[0], x = a1[ri(n1)], sb = P.start[b], sx = P.start[x]; P.setzeAktiv(b, 0); P.setzeAktiv(x, 0); legeNeu(frei2(g.d2), um(sb, 0).concat(um(sx, 0, -1))); }
    P.commit(); return true;
  };
  let wf = phase === 1 ? 0.02 : 1;
  coFaktor = phase === 1 ? 0.1 : 1;
  // W17 (Halbgruppen nebeneinander) und W18 (Klassenleitung in Kernfächern) zählen schon in Phase 1 mit vollem Gewicht – sonst reißt die
  // Reparatur die Halbgruppen-Paare auseinander bzw. vergibt die Kernfächer der Klassenleitung beim Beheben von Konflikten an andere
  const w17x = () => (1 - wf) * (M.gew[RI.W17] * P.tot[RI.W17] + M.gew[RI.W18] * P.tot[RI.W18]);
  const objA = () => { const v = hartJetzt() * HART_GEWICHT + wf * weichJetzt() + w17x() + zusK(); curC = coLetzt; curAbw = abwWert; return v; };
  cur = objA(); curH = hartJetzt();
  best = { hart: curH, weich: weichJetzt(), stab: zusK(), co: coLetzt, z: P.zustand() };
  const tabu = new Int32Array(Math.max(1, E) * S);

  const zVerschieben = () => {
    let e;
    if (phase === 1 && (offen.length || problem.length) && rnd() < (rep && stabF > 0.3 ? 0.9 : 0.35)) e = offen.length && (!problem.length || rnd() < 0.5) ? offen[ri(offen.length)] : problem[ri(problem.length)];
    else e = zufEv();
    if (e === undefined) return false;
    const ev = M.E[e]; if (!ev.erlaubt.length) return false;
    const s = ev.erlaubt[ri(ev.erlaubt.length)];
    if (s === P.start[e]) return false;
    const p = partner(e);
    P.begin();
    if (!P.platziere(e, s, phase === 1)) { P.rollback(); return false; }
    // das Paar zieht gemeinsam um; geht das nicht, bleibt der Zug nur in einem Teil der Fälle als Einzelzug erlaubt
    if (p >= 0 && P.start[e] === s && !(M.erlaubt[p * S + s] && P.platziere(p, s, false)) && rnd() < 0.7) { P.rollback(); return false; }
    P.commit(); return true;
  };
  const zTauschen = () => {
    const e1 = phase === 1 && problem.length && rnd() < (rep && stabF > 0.3 ? 0.9 : 0.3) ? problem[ri(problem.length)] : zufEv(); if (e1 === undefined || P.start[e1] < 0) return false;
    const ev1 = M.E[e1]; let liste;
    if (rnd() < 0.7 || !ev1.lehrer.length) liste = M.kEv[ev1.klassen[ri(ev1.klassen.length)]];
    else liste = M.lEv[ev1.lehrer[ri(ev1.lehrer.length)]];
    if (!liste || liste.length < 2) return false;
    const e2 = liste[ri(liste.length)];
    if (e2 === e1 || P.fest[e2] || P.start[e2] < 0 || M.E[e2].dur !== ev1.dur) return false;
    const s1 = P.start[e1], s2 = P.start[e2];
    if (s1 === s2 || !M.erlaubt[e1 * S + s2] || !M.erlaubt[e2 * S + s1]) return false;
    const p1 = partner(e1), p2 = partner(e2);
    if ((p1 >= 0 && !M.erlaubt[p1 * S + s2]) || (p2 >= 0 && !M.erlaubt[p2 * S + s1])) return false;
    P.begin(); P.entferne(e1); P.entferne(e2); if (p1 >= 0) P.entferne(p1); if (p2 >= 0) P.entferne(p2);
    if (!P.platziere(e1, s2, false) || !P.platziere(e2, s1, false) || (p1 >= 0 && !P.platziere(p1, s2, false)) || (p2 >= 0 && !P.platziere(p2, s1, false))) { P.rollback(); return false; }
    P.commit(); return true;
  };
  const zKette = () => {
    if (!klassenMitEv.length) return false;
    const c = klassenMitEv[ri(klassenMitEv.length)];
    const evs = M.kEv[c];
    const dbl = evs.filter(e => beweglich[e] && M.E[e].dur === 2 && P.start[e] >= 0 && !istTeil[e]);
    if (!dbl.length) return false;
    const e1 = dbl[ri(dbl.length)], s1 = P.start[e1];
    const an = new Map();
    for (const e of evs) { const s = P.start[e]; if (s >= 0 && M.E[e].dur === 1 && !istTeil[e]) an.set(s, e); }
    const kand = [];
    for (const s2 of M.E[e1].erlaubt) { if (s2 === s1) continue; const a = an.get(s2), b = an.get(s2 + 1); if (a !== undefined && b !== undefined && !P.fest[a] && !P.fest[b]) kand.push(s2); }
    if (!kand.length) return false;
    const s2 = kand[ri(kand.length)];
    const a = an.get(s2), b = an.get(s2 + 1);
    const x = rnd() < 0.5 ? b : a, y = x === a ? b : a;
    if (!M.erlaubt[x * S + s1] || !M.erlaubt[y * S + s1 + 1]) return false;
    P.begin(); P.entferne(e1); P.entferne(a); P.entferne(b);
    if (!P.platziere(e1, s2, false) || !P.platziere(x, s1, false) || !P.platziere(y, s1 + 1, false)) { P.rollback(); return false; }
    P.commit(); return true;
  };
  const zTag = () => {
    if (!klassenMitEv.length || M.D < 2) return false;
    const c = klassenMitEv[ri(klassenMitEv.length)];
    const d1 = ri(M.D); let d2 = ri(M.D - 1); if (d2 >= d1) d2++;
    const liste = [];
    for (const e of M.kEv[c]) { const s = P.start[e]; if (s < 0) continue; const d = Math.floor(s / H); if (d !== d1 && d !== d2) continue; if (P.fest[e]) return false; liste.push(e); }
    if (!liste.length) return false;
    const ziel = liste.map(e => { const s = P.start[e], d = Math.floor(s / H); return s + (d === d1 ? d2 - d1 : d1 - d2) * H; });
    for (let i = 0; i < liste.length; i++) if (!M.erlaubt[liste[i] * S + ziel[i]]) return false;
    P.begin();
    for (const e of liste) P.entferne(e);
    for (let i = 0; i < liste.length; i++) if (!P.platziere(liste[i], ziel[i], false)) { P.rollback(); return false; }
    P.commit(); return true;
  };
  const zRaum = () => {
    if (!raumEv.length) return false;
    const e = raumEv[ri(raumEv.length)]; const s = P.start[e]; if (s < 0) return false;
    const ev = M.E[e]; const p = ri(ev.parts.length); const part = ev.parts[p];
    if (!part.cands || part.cands.length < 2) return false;
    const r = part.cands[ri(part.cands.length)]; const alt = P.raum[P.rOff[e] + p];
    if (r === alt || !P.raumFrei(r, s, ev.dur, ev.wochen)) return false;
    P.begin(); P.touch(e); P._belegeRaum(e, p, -1);
    P.raum[P.rOff[e] + p] = r; P._belegeRaum(e, p, 1);
    P.commit(); return true;
  };
  // Lehrkraft wechseln: eine Personal-Einheit bekommt eine andere geeignete Person (in der Reparatur selten auch N. N. als Notlösung)
  const zLehrkraft = () => {
    if (!peWahl.length) return false;
    const p = phase === 1 && peProb.length && rnd() < 0.6 ? peProb[ri(peProb.length)] : peWahl[ri(peWahl.length)];
    const pe = M.PE[p], alt = P.lk[p], n = pe.cands.length;
    let t;
    if (phase === 1 && alt >= 0 && rnd() < 0.04) t = -1;
    else if (n > 1 && rnd() < (phase === 1 ? _num(konf._gezielt1, 0) : 0.5)) {
      // gezielt: die Person, bei der die Personalkosten (Ausgleich Soll/Ist, Rangfolge, Deputat) am stärksten sinken
      let bw = Infinity; t = -1;
      for (const x of pe.cands) { if (x === alt) continue; const w = P.personalDeltaWert(p, x) + rnd() * 1e-6; if (w < bw) { bw = w; t = x; } }
      if (t < 0) return false;
    }
    else { const i = ri(n); t = pe.cands[i]; if (t === alt) { if (n < 2) return false; t = pe.cands[(i + 1 + ri(n - 1)) % n]; } }
    P.begin(); P.setzeLehrer(p, t); aufloesen(p, phase === 1); P.commit(); return true;
  };
  // Einheiten, die die Person t gerade unterrichtet
  const peVon = t => { const L = []; for (const e of M.lEv[t]) for (const pt of M.E[e].parts) { const q = M.uPE[pt.u]; if (q >= 0 && peFrei[q] && P.lk[q] === t && !L.includes(q)) L.push(q); } return L; };
  // Ringtausch über drei Personen: Einheit 1 geht von a an b, eine Einheit von b an c, eine Einheit von c an a
  // (verschiebt Last, wo ein einfacher Tausch nicht passt – etwa vom Vielbeschäftigten über eine dritte Person zur Person mit Minusstunden)
  const zRing = () => {
    const p1 = peWahl[ri(peWahl.length)], a = P.lk[p1]; if (a < 0) return false;
    const pe1 = M.PE[p1], b = pe1.cands[ri(pe1.cands.length)]; if (b === a) return false;
    const L2 = peVon(b).filter(q => q !== p1); if (!L2.length) return false;
    const p2 = L2[ri(L2.length)], pe2 = M.PE[p2], c = pe2.cands[ri(pe2.cands.length)]; if (c === b || c === a) return false;
    const L3 = peVon(c).filter(q => q !== p1 && q !== p2 && M.PE[q].kann[a]); if (!L3.length) return false;
    const p3 = L3[ri(L3.length)];
    P.begin(); P.setzeLehrer(p1, b); P.setzeLehrer(p2, c); P.setzeLehrer(p3, a);
    aufloesen(p1, phase === 1); aufloesen(p2, phase === 1); aufloesen(p3, phase === 1); P.commit(); return true;
  };
  // Lehrkräfte tauschen: zwei Einheiten tauschen ihre Personen (beide müssen für das jeweils andere Fach geeignet sein)
  const zLehrkraftTausch = () => {
    if (peWahl.length < 2) return false;
    if (peWahl.length > 2 && rnd() < 0.35) return zRing();
    const p1 = phase === 1 && peProb.length && rnd() < 0.5 ? peProb[ri(peProb.length)] : peWahl[ri(peWahl.length)];
    const t1 = P.lk[p1], pe1 = M.PE[p1]; if (t1 < 0) return false;
    const t2 = pe1.cands[ri(pe1.cands.length)]; if (t2 === t1) return false;
    const L = []; for (const e of M.lEv[t2]) for (const pt of M.E[e].parts) { const q = M.uPE[pt.u]; if (q >= 0 && q !== p1 && peFrei[q] && P.lk[q] === t2 && M.PE[q].kann[t1] && !L.includes(q)) L.push(q); }
    if (!L.length) return false;
    const p2 = L[ri(L.length)];
    P.begin(); P.setzeLehrer(p1, t2); P.setzeLehrer(p2, t1); aufloesen(p1, phase === 1); aufloesen(p2, phase === 1); P.commit(); return true;
  };
  // Bester Slot für ein Ereignis (alle zulässigen Slots werten, Tabu gegen Zurückspringen)
  const besterSlot = (e, ausw) => {
    if (e === undefined || P.fest[e]) return false;
    const ev = M.E[e], L = ev.erlaubt; if (!L.length) return false;
    const alt = P.start[e], pp = partner(e);
    let bestS = -1, bestV = Infinity;
    const n = L.length, step = n > 48 ? Math.ceil(n / 48) : 1, off = ri(step);
    for (let i = off; i < n; i += step) {
      const s = L[i];
      if (s === alt || tabu[e * S + s] > iter) continue;
      P.begin();
      if (P.platziere(e, s, ausw) && (pp < 0 || (M.erlaubt[pp * S + s] && P.platziere(pp, s, false)))) { P.commit(); const v = objA() + rnd() * 1e-3; if (v < bestV) { bestV = v; bestS = s; } }
      P.rollback();
    }
    if (bestS < 0) return false;
    P.begin();
    if (!P.platziere(e, bestS, ausw) || (pp >= 0 && !P.platziere(pp, bestS, false))) { P.rollback(); return false; }
    P.commit();
    if (alt >= 0) tabu[e * S + alt] = iter + 5 + ri(10);
    return true;
  };
  // Halbgruppen paaren (W17): Ein Gruppen-Ereignis zieht in die Stunde, in der eine andere Gruppe derselben Klasse allein Unterricht hat;
  // die frei gewordene Stunde der Klasse wird – wenn dort sonst nichts mehr liegt – mit der letzten Stunde eines Tages gefüllt.
  const teilEv = bew.filter(e => istTeil[e]);
  const zPaar = () => {
    if (teilEv.length < 2) return false;
    const e1 = teilEv[ri(teilEv.length)], s1 = P.start[e1]; if (s1 < 0) return false;
    const ev1 = M.E[e1], c = ev1.klassen[0], m1 = ev1.kMaske.get(c);
    const kand = teilEv.filter(e => e !== e1 && M.E[e].klassen[0] === c && M.E[e].dur === ev1.dur && P.start[e] >= 0 && P.start[e] !== s1 && !(M.E[e].kMaske.get(c) & m1) && M.erlaubt[e * S + s1]);
    if (!kand.length) return false;
    const gleich = kand.filter(e => M.E[e].woche === ev1.woche), wahl = gleich.length ? gleich : kand;
    const e2 = wahl[ri(wahl.length)], s2 = P.start[e2];
    P.begin(); P.entferne(e2);
    if (!P.platziere(e2, s1, false)) { P.rollback(); return false; }
    const d2 = Math.floor(s2 / H), belegt = new Uint8Array(S);
    for (const e of M.kEv[c]) { const s = P.start[e]; if (s >= 0) for (let k = 0; k < M.E[e].dur; k++) belegt[s + k] = 1; }
    let leer = true; for (let k = 0; k < ev1.dur; k++) if (belegt[s2 + k]) leer = false;
    let davor = false, danach = false;
    for (let hh = 0; hh < H; hh++) { if (!belegt[d2 * H + hh]) continue; if (hh < s2 % H) davor = true; if (hh >= s2 % H + ev1.dur) danach = true; }
    if (leer && danach) {
      const letzte = [];
      for (let dd = 0; dd < M.D; dd++) { let b = -1, bs = -1; for (const e of M.kEv[c]) { const s = P.start[e]; if (s >= 0 && Math.floor(s / H) === dd && s > bs) { bs = s; b = e; } } if (b >= 0 && b !== e2 && beweglich[b] && !P.fest[b] && M.E[b].dur === ev1.dur && bs !== s2 && M.erlaubt[b * S + s2]) letzte.push({ e: b, eigen: dd === d2 ? 0 : 1, z: rnd() }); }
      letzte.sort((a, b) => a.eigen - b.eigen || a.z - b.z);
      let gefuellt = false;
      for (const k of letzte) { const alt = P.start[k.e]; P.entferne(k.e); if (P.platziere(k.e, s2, false)) { gefuellt = true; break; } if (!P.platziere(k.e, alt, false)) { P.rollback(); return false; } }
      if (!gefuellt && davor) { P.rollback(); return false; }
    }
    P.commit(); return true;
  };
  // Reparatur, Phase 2: verschobene Blöcke gezielt an ihren alten Platz zurücklegen, wenn das ohne Konflikt geht
  const refSlot = rep ? M.E.map(ev => slotAus(ev)) : null;
  const zZurueck = () => {
    const e = zufEv(); if (e === undefined) return false;
    const s = refSlot[e]; if (s < 0 || s === P.start[e] || !M.erlaubt[e * S + s]) return false;
    P.begin();
    if (!P.platziere(e, s, false)) { P.rollback(); return false; }
    P.commit(); return true;
  };
  // Kempe-Kette: Ein Block wechselt von Startslot s1 nach s2; alle Blöcke, die dort dieselbe Klasse/Gruppe oder Lehrkraft brauchen,
  // wechseln im Gegenzug nach s1 – fortgesetzt, bis die Kette geschlossen ist. Bewährter Zug der Stundenplanung: große, in sich
  // konfliktfreie Änderungen (die Kette endet nur, wenn alle beteiligten Blöcke gleich lang und an beiden Plätzen zulässig sind).
  const kempeWer = new Int32Array(Math.max(1, E)).fill(-1); let kempeZug = 0;
  const zKempe = () => {
    let e0 = phase === 1 && problem.length && rnd() < 0.5 ? problem[ri(problem.length)] : zufEv();
    if (e0 === undefined || P.start[e0] < 0 || P.fest[e0]) return false;
    const ev0 = M.E[e0], s1 = P.start[e0], dur = ev0.dur, L = ev0.erlaubt; if (L.length < 2) return false;
    const s2 = L[ri(L.length)]; if (s2 === s1) return false;
    kempeZug++;
    const kette = [e0], seite = [0]; kempeWer[e0] = kempeZug * 2;
    for (let i = 0; i < kette.length; i++) {
      const x = kette[i], ex = M.E[x], ziel = seite[i] === 0 ? s2 : s1, quelle = seite[i] === 0 ? s1 : s2;
      if (!M.erlaubt[x * S + ziel]) return false;
      // Belegung am Ziel: Einheiten (Klassen, Gruppen, Lehrkräfte) und aktive Co-Lehrkräfte von x
      const cb = P.cOff[x];
      const pruefe = (cell) => {
        for (let k = 0; k < dur; k++) for (const w of ex.wochen) {
          const j = (cell * 2 + w) * S + ziel + k; if (P.occ[j] <= 0) continue;
          const y = P.who[j]; if (y < 0) return false;
          if (kempeWer[y] === kempeZug * 2 || kempeWer[y] === kempeZug * 2 + 1) continue;
          if (P.fest[y] || P.start[y] !== ziel || M.E[y].dur !== dur || kette.length >= 14) return false;
          kempeWer[y] = kempeZug * 2 + (seite[i] === 0 ? 1 : 0); kette.push(y); seite.push(seite[i] === 0 ? 1 : 0);
        }
        return true;
      };
      for (const u of ex.units) if (!pruefe(u)) return false;
      for (let j = 0; j < ex.co.length; j++) if (P.co[cb + j] && !pruefe(ex.co[j].t)) return false;
      if (P.start[x] !== quelle) return false;
    }
    if (kette.length < 2 && rnd() < 0.5) return false; // Einzelzüge erledigt „Verschieben“
    P.begin();
    for (const x of kette) P.entferne(x);
    for (let i = 0; i < kette.length; i++) if (!P.platziere(kette[i], seite[i] === 0 ? s2 : s1, false)) { P.rollback(); return false; }
    P.commit(); return true;
  };
  // Lückenschluss (H15/W02): Eine Klasse mit Freistunde – ein Block vom Rand eines Tages (oder aus einem anderen Tag) zieht in die Lücke;
  // ist die Lehrkraft dort belegt, tauscht der Block über eine Kempe-Kette.
  const zLuecke = () => {
    const kl = []; for (let c = 0; c < M.C; c++) if (P.vK[c * RN + RI.H15] > 0 || P.vK[c * RN + RI.W02] > 0) kl.push(c);
    if (!kl.length) return false;
    const c = kl[ri(kl.length)]; bauK(M, P, c); const K = P.K;
    const luecken = [];
    for (let d = 0; d < M.D; d++) { if (!K.n[d]) continue; for (let h = K.a[d] + 1; h < K.z[d]; h++) if (!M.pause[h] && !K.belegt[d * H + h]) luecken.push(d * H + h); }
    if (!luecken.length) return false;
    const g = luecken[ri(luecken.length)];
    // Kandidaten: Einzelstunden der Klasse am Rand eines Tages
    const kand = [];
    for (const e of M.kEv[c]) {
      const s = P.start[e]; if (s < 0 || P.fest[e] || M.E[e].dur !== 1 || !M.erlaubt[e * S + g] || istTeil[e]) continue;
      const d = Math.floor(s / H), h = s % H;
      if (h === K.a[d] || h === K.z[d]) kand.push(e);
    }
    if (!kand.length) return false;
    const e = kand[ri(kand.length)];
    P.begin();
    if (P.platziere(e, g, false)) { P.commit(); return true; }
    P.rollback();
    return false;
  };
  // Verdrängungskette (Ejection Chain): Ein nicht platzierter Block nimmt einen Platz ein, an dem er möglichst wenige und leicht
  // verlegbare Blöcke verdrängt; der verdrängte Block sucht sich auf dieselbe Weise einen Platz – bis zu fünf Glieder. Bewertet wird die
  // ganze Kette auf einmal (Annahme nach den Regeln der Suche).
  const zEjektion = () => {
    if (!offen.length) return false;
    let x = offen[ri(offen.length)];
    if (P.start[x] >= 0 || !M.E[x].erlaubt.length) return false;
    const kette = new Set();
    P.begin();
    for (let tiefe = 0; tiefe < 5 && x >= 0; tiefe++) {
      kette.add(x);
      const L = M.E[x].erlaubt, n = L.length; if (!n) break;
      let bestS = -1, bestW = Infinity;
      const off = ri(n), step = n > 24 ? Math.ceil(n / 24) : 1;
      for (let i = 0; i < n; i += step) {
        const sl = L[(off + i) % n];
        P.konflikte(x, sl);
        let w = rnd(), ok = true;
        for (const y of P.R.ev) { if (P.fest[y] || kette.has(y)) { ok = false; break; } w += 10 + 100 / (1 + M.E[y].erlaubt.length); }
        if (!ok || w >= bestW) continue;
        bestW = w; bestS = sl;
        if (!P.R.ev.length) break;
      }
      if (bestS < 0 || !P.platziere(x, bestS, true)) break;
      const neu = []; for (let i = 0; i < P.logE.length; i++) { const y = P.logE[i]; if (P.logS[i] >= 0 && P.start[y] < 0 && !kette.has(y)) neu.push(y); }
      x = neu.length ? neu[ri(neu.length)] : -1;
    }
    P.commit(); return true;
  };
  const ZF = [zVerschieben, zTauschen, zKette, zTag, zRaum, zLehrkraft, zLehrkraftTausch, zKempe, zLuecke, zEjektion];
  // Zugauswahl proportional zum Gewicht; jeder verfügbare Zug behält einen Mindestanteil (adaptive Gewichte wie bei ALNS)
  const zugP = new Float64Array(NZ);
  const zugNorm = () => { let s = 0; for (let i = 0; i < NZ; i++) s += zugGew[i]; let q = 0; for (let i = 0; i < NZ; i++) { zugP[i] = zugGew[i] > 0 ? Math.max(zugGew[i] / s, 0.015) : 0; q += zugP[i]; } for (let i = 0; i < NZ; i++) zugP[i] /= q; };
  zugNorm();
  const waehle = () => { let x = rnd(); for (let i = 0; i < NZ; i++) { x -= zugP[i]; if (x <= 0) return i; } return 0; };

  // Störung (Ruin & Recreate): Um einen Problemblock herum werden die Blöcke seiner Klassen und Lehrkräfte an zwei Tagen herausgenommen,
  // das Personal der beteiligten Einheiten wird teils neu gewählt, danach legt die Suche alles schwierigste-zuerst an den jeweils besten Platz.
  const stoerung = () => {
    offenNeu(); problemNeu();
    const anker = offen.length && rnd() < 0.6 ? offen[ri(offen.length)] : problem.length ? problem[ri(problem.length)] : zufEv();
    if (anker === undefined) return;
    statistik.stoerungen++;
    const ev = M.E[anker], weg = new Set();
    const d1 = P.start[anker] >= 0 ? Math.floor(P.start[anker] / H) : ri(M.D), d2 = ri(M.D);
    const nimm = (e, d) => { if (weg.size < 16 && beweglich[e] && !P.fest[e] && P.start[e] >= 0 && Math.floor(P.start[e] / H) === d) weg.add(e); };
    ev.klassen.forEach(c => M.kEv[c].forEach(e => nimm(e, d1)));
    ev.immer.forEach(t => M.lEv[t].forEach(e => nimm(e, d1)));
    if (rnd() < 0.5) ev.klassen.forEach(c => M.kEv[c].forEach(e => nimm(e, d2)));
    weg.add(anker);
    P.begin();
    for (const e of weg) if (P.start[e] >= 0) P.entferne(e);
    for (const pt of ev.parts) { const p = M.uPE[pt.u]; if (p >= 0 && peFrei[p] && (M.PE[p].cands.length > 1 || P.lk[p] < 0) && rnd() < 0.5) { P.setzeLehrer(p, M.PE[p].cands[ri(M.PE[p].cands.length)]); aufloesen(p, false); M.PE[p].evs.forEach(e => { if (P.start[e] < 0) weg.add(e); }); } }
    P.commit();
    if (musterU.length && notfall() && rnd() < 0.35) { zMuster(anker); bew.forEach(e => { if (M.aktiv[e] && P.start[e] < 0) weg.add(e); }); }
    const liste = [...weg].filter(e => M.aktiv[e] && P.start[e] < 0 && M.E[e].erlaubt.length).sort((a, b) => M.E[a].erlaubt.length - M.E[b].erlaubt.length || a - b);
    for (const e of liste) { if (P.start[e] >= 0) continue; if (!besterSlot(e, false) && phase === 1 && rnd() < 0.5) besterSlot(e, true); }
    cur = objA(); curH = hartJetzt();
  };

  const kalibriere = () => {
    let sum = 0, n = 0;
    for (let i = 0; i < 300 && bew.length; i++) {
      const m = waehle(); if (!ZF[m]()) continue;
      const nh = hartJetzt(); const d = nh * HART_GEWICHT + wf * weichJetzt() + w17x() + zusK() - cur;
      if (!(phase === 2 && (nh > curH || coLetzt > curC + 1e-9)) && d > 0) { sum += d; n++; }
      P.rollback();
    }
    return Math.max(0.05, (n ? sum / n : 1) / -Math.log(phase === 1 ? _num(konf._akz1, 0.1) : 0.4)); // anfangs angenommene verschlechternde Züge: Reparatur ca. 10 %, Verbesserung ca. 40 %
  };
  const kalt = t => rep ? Math.min(t, STAB / 2) : t; // Reparatur: niedrige Temperatur, damit der Plan nicht durcheinandergerät
  const Tvoll = kalibriere();
  let T0 = kalt(Tvoll), Temp = T0;
  // Größe des Problems: Zahl der aktiven Blöcke (ohne die inaktiven Pool-Blöcke der variablen Blockaufteilung)
  let EA = 0; for (let e = 0; e < E; e++) if (M.aktiv[e]) EA++;
  const Lzyklus = _clamp(EA * 400, 60000, 2000000);
  const alpha = Math.pow(1e-4, 100 / Lzyklus);
  const stoerAb = _clamp(_num(konf._stoerAb, EA * 50), 10000, 400000); // Reparatur: so viele Züge ohne neuen Bestwert, dann Störung
  let seitBest = 0, stagn = 0, abbruchGrund = 'Zeitlimit', p2Start = jetzt(), p2Iter = 0, p2Faktor = 1;
  const zeitKuehlung = konf._kuehlung !== 'zyklus';
  // Suchstrategie der Verbesserung: Simulated Annealing (Standard) oder Late Acceptance Hill Climbing (für parallele Suchläufe)
  const lahcAn = konf.strategie === 'lahc' && !rep;
  let lahcHist = null;
  const lahcStart = () => { if (lahcAn) lahcHist = new Float64Array(_clamp(_int(konf._lahcLaenge, 100), 20, 200000)).fill(cur); };
  if (phase === 2) lahcStart();
  let letzteProg = jetzt(), letzterSnap = jetzt(), snapNoetig = false, gestoppt = false;
  const neuerBest = (nh, nw) => { best = { hart: nh, weich: nw, stab: zusK(), co: coLetzt, z: P.zustand() }; seitBest = 0; snapNoetig = true; stagn = 0; };
  if (cb.progress) cb.progress(fortschritt(phase === 1 ? 'Reparatur' : 'Verbesserung', 0));
  while (bew.length) {
    const el = jetzt() - t0;
    if (iterLimit ? iter >= iterLimit : el >= zeitlimit) { abbruchGrund = iterLimit ? 'Iterationslimit' : 'Zeitlimit'; break; }
    if (best.hart === 0 && best.weich + best.stab < 1e-9) { abbruchGrund = 'Kosten 0'; break; }
    if (cb.stop && cb.stop()) { abbruchGrund = 'Abgebrochen'; gestoppt = true; break; }
    if (!iterLimit && phase === 2 && stagn >= 15) { abbruchGrund = 'Keine Verbesserung mehr'; break; }
    if (rep && phase === 2 && seitBest > 12000) { abbruchGrund = 'Reparatur abgeschlossen'; break; }
    const chunk = iterLimit ? Math.min(2000, iterLimit - iter) : 2000;
    for (let n = 0; n < chunk; n++) {
      iter++; seitBest++; seitBestH++;
      let m, ok, erzwungen = false;
      const x = rnd();
      if (phase === 1 && x < (rep ? (stabF > 0.3 ? 0.25 : 0.12) : 0.03) && (offen.length || problem.length)) {
        m = 10; erzwungen = true;
        const e = (offen.length && (!problem.length || rnd() < 0.5)) ? offen[ri(offen.length)] : problem[ri(problem.length)];
        ok = besterSlot(e, true);
      } else if (phase === 2 && x < 0.004) { m = 10; ok = besterSlot(zufEv(), false); }
      // Blockaufteilung: In der Verbesserung darf kein Musterwechsel einen harten Verstoß erzeugen. In der Reparatur stellt die Suche gezielt
      // bei den Klassen mit fehlenden Blöcken oder Konflikten um (z. B. Einzelstunde → 14-tägige Doppelstunde, Doppel- → Einzelstunden),
      // wenn die Startaufteilung so nicht in den Plan passt
      else if (musterU.length && x >= 0.6 && x < (phase === 2 ? 0.62 : rep ? 0.61 : 0.63)) { m = 13; ok = zMuster(); }
      else if (teilEv.length > 1 && x >= 0.5 && x < 0.5 + (phase === 2 ? 0.012 : 0.03)) { m = 11; ok = zPaar(); }
      else if (rep && phase === 2 && x < 0.35) { m = 12; ok = zZurueck(); }
      else { m = waehle(); zugVersuch[m]++; ok = ZF[m](); }
      statistik.zuege[ZUEGE[m]].versucht++;
      if (ok) {
        const nh = hartJetzt(), nw = weichJetzt();
        const zk = zusK(), nc = coLetzt, nObj = nh * HART_GEWICHT + wf * nw + w17x() + zk;
        const d = nObj - cur;
        let acc;
        // Blockaufteilung: weiter weg vom Standard nur, wenn dadurch harte Verstöße verschwinden; zurück zum Standard nur ohne neue harte Verstöße
        const weiterWeg = m === 13 && abwWert > curAbw + 1e-9;
        if (weiterWeg && (phase === 2 || nh >= curH)) acc = false;
        else if (m === 13 && nh > curH) acc = false;
        else if (phase === 2 && (nh > curH || nc > curC + 1e-9)) acc = false;
        else if (phase === 2 && lahcHist) { const v = iter % lahcHist.length; acc = d <= 1e-9 || nObj <= lahcHist[v] + 1e-9; } // Late Acceptance
        else if (erzwungen) acc = nh <= curH || rnd() < Math.exp(-d / Temp);
        else acc = d <= 1e-9 || rnd() < Math.exp(-d / Temp);
        if (acc) {
          // Erfolg eines Zugs: in der Reparatur zählt vor allem, ob harte Verstöße verschwinden; in der Verbesserung die weichen Kosten
          if (m < NZ) zugErfolg[m] += phase === 1 ? (nh < curH ? 1 : d < -1e-9 ? 0.05 : 0.01) : (d < -1e-9 ? 1 : 0.02);
          if ((m === 5 || m === 6) && d !== 0) statistik.personalWechsel++;
          statistik.zuege[ZUEGE[m]].angenommen++;
          cur = nObj; curH = nh; curC = nc; curAbw = abwWert;
          if (nh < best.hart || (nh === best.hart && (nc < best.co - 1e-9 || (Math.abs(nc - best.co) < 1e-9 && nw + zk < best.weich + best.stab - 1e-9)))) { if (nh < best.hart) seitBestH = 0; neuerBest(nh, nw); }
          if (phase === 1 && curH === 0) { phase = 2; wf = 1; stabF = 1; coFaktor = 1; cur = objA(); neuerBest(0, nw); statistik.phase1Iter = iter; T0 = kalt(kalibriere()); Temp = T0; p2Start = jetzt(); p2Iter = iter; lahcStart(); }
        } else P.rollback();
        if (phase === 2 && lahcHist) lahcHist[iter % lahcHist.length] = cur;
      }
      if (iter % 100 === 0) {
        if (phase === 2 && zeitKuehlung && !rep) {
          // Verbesserung: eine Abkühlung über die verbleibende Zeit (bzw. Iterationen) – am Ende fast nur noch verbessernde Züge
          const frac = iterLimit ? (iter - p2Iter) / Math.max(1, iterLimit - p2Iter) : (jetzt() - p2Start) / Math.max(1, zeitlimit - (p2Start - t0));
          Temp = T0 * p2Faktor * Math.pow(5e-4, _clamp(frac, 0, 1));
        } else if (Temp > T0 * 1e-4) Temp *= alpha;
        if (rep && phase === 1 && seitBest > 4000) { // Reparatur kommt in der Nähe nicht weiter: Umkreis erweitern (wärmer, Verschiebungen billiger)
          stabF = Math.max(0.02, stabF * 0.4); T0 = Math.min(Tvoll, T0 * 3); Temp = T0; seitBest = 0;
          P.setzeZustand(best.z); curH = best.hart; cur = objA(); best.stab = zusK(); best.co = coLetzt; offenNeu(); problemNeu();
        }
        if (!rep && phase === 1 && seitBestH > stoerAb) {
          // Iterated Local Search: vom besten Stand aus (meist) eine Störung, dann wärmer weitersuchen
          if (rnd() < 0.7) { P.setzeZustand(best.z); curH = best.hart; cur = objA(); }
          stoerung(); Temp = Math.max(Temp, T0 * 0.3); seitBestH = 0; seitBest = 0; offenNeu(); problemNeu();
        } else if (seitBest > Lzyklus) { // Stillstand: Wiedererwärmung, in der Verbesserung vom besten Stand aus
          stagn++;
          if (phase === 2 || stagn % 3 === 0) { P.setzeZustand(best.z); curH = best.hart; cur = objA(); }
          Temp = T0 * 0.5; seitBest = 0; offenNeu(); problemNeu();
          if (phase === 2) { p2Start = jetzt(); p2Iter = iter; p2Faktor = 0.3; if (lahcHist) lahcHist.fill(cur); } // neue, kürzere Abkühlung über die restliche Zeit
        }
      }
      if (iter % 1000 === 0) {
        // Erfolgsquote je Zug im letzten Fenster (Verbesserung 1, sonst angenommen 0,02), relativ zum Mittel – geglättet
        let mq = 0, nq = 0; const q = new Float64Array(NZ);
        for (let i = 0; i < NZ; i++) if (zugGew[i]) { q[i] = (zugErfolg[i] + 0.05) / (zugVersuch[i] + 1); mq += q[i]; nq++; }
        mq = nq ? mq / nq : 1;
        for (let i = 0; i < NZ; i++) { if (zugGew[i]) zugGew[i] = 0.8 * zugGew[i] + 0.2 * (q[i] / mq); zugVersuch[i] = 0; zugErfolg[i] = 0; }
        zugNorm();
        offenNeu(); if (phase === 1) problemNeu();
      } else if (phase === 1 && iter % 200 === 0) { offenNeu(); problemNeu(); }
    }
    const tt = jetzt();
    if (tt - letzteProg > 250) {
      letzteProg = tt;
      const prozent = iterLimit ? iter / iterLimit : Math.min(1, (tt - t0) / zeitlimit);
      verlauf.push({ t: Math.round((tt - t0) / 100) / 10, k: best.hart * HART_GEWICHT + best.weich });
      if (cb.progress) cb.progress(fortschritt(phase === 1 ? 'Reparatur' : 'Verbesserung', prozent));
    }
    if (cb.snapshot && ((snapNoetig && tt - letzterSnap > 500) || tt - letzterSnap > 2000)) {
      letzterSnap = tt; snapNoetig = false;
      const aktuell = P.zustand(); P.setzeZustand(best.z);
      cb.snapshot({ platzierungen: P.exportiere(), lehrkraefte: lehrkraefteExport(), muster: P.musterExport(), hart: best.hart, weich: best.weich });
      P.setzeZustand(aktuell);
    }
    await pause0();
  }

  // ---------- 5. Ergebnis: bester Stand, Vollbewertung, Diagnose ----------
  P.setzeZustand(best.z);
  statistik.iterationen = iter;
  const diagnose = diagnoseErstellen(M, P, beweglich);
  const tot = bewerteAlles(M, P, null);
  const k = kostenVon(M, tot);
  let unplatziert = 0; for (let e = 0; e < E; e++) if (beweglich[e] && M.aktiv[e] && P.start[e] < 0) unplatziert++;
  const musterErg = P.musterExport();
  if (musterErg.length) {
    const g = new Map(data.unterrichte.map(u => [u.id, u])), fI = new Map(data.faecher.map(f => [f.id, f])), D0 = data.schule.tage.length;
    let anders = 0, wechsel = 0;
    musterErg.forEach(x => { const u = g.get(x.id); const vor = u ? bloeckeMitWoche(u, fachFuerBloecke(data, u, fI.get(u.fach)), D0, data.schule.wochenrhythmus === 'AB', 'A') : null; if (!vor || vor.dauer.join() + vor.woche.join() !== x.bloecke.join() + x.woche.join()) anders++; if (x.woche.some(w => w !== 'jede')) wechsel++; });
    statistik.muster = { kurse: musterErg.length, anders, wechsel };
  }
  const lk = lehrkraefteExport();
  const autoU = data.unterrichte.filter(u => !u.aufgabe && u.fachAuto && u.wochenstunden > 0);
  statistik.zuteilung = { auto: autoU.length, offen: nnZahl(), wechsel: statistik.personalWechsel };
  statistik.coOffen = coFehlt(); // geschätzte Co-Stunden, die zum geplanten Zeitpunkt niemand übernehmen kann
  verlauf.push({ t: Math.round((jetzt() - t0) / 100) / 10, k: best.hart * HART_GEWICHT + best.weich });
  return { platzierungen: P.exportiere(), lehrkraefte: lk, muster: musterErg, kosten: k.gesamt, hart: k.hart, weich: k.weich, verstoesse: Array.from(tot), statistik: Object.assign(statistik, { zeit: (jetzt() - t0) / 1000, abbruch: abbruchGrund, gestoppt, unplatziert }), diagnose, verlauf };

  // Fachlehrkräfte der automatisch besetzten Unterrichte (Ergebnis der Suche, als „auto“ gekennzeichnet – keine Vorgabe für spätere Berechnungen)
  function lehrkraefteExport() {
    const out = [];
    for (let p = 0; p < NP; p++) for (const ui of M.PE[p].us) {
      const x = data.unterrichte[ui], t = P.lk[p];
      const liste = x.lehrkraefte.filter(z => !(z.rolle === 'fach' && z.auto));
      if (t >= 0) liste.unshift(nLehrkraftZuordnung({ lehrer: data.lehrer[t].id, rolle: 'fach', modus: 'immer', deputatFaktor: 1, auto: true }));
      out.push({ id: x.id, lehrkraefte: JSON.parse(JSON.stringify(liste)) });
    }
    return out;
  }
}

