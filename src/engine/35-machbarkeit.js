// Plan (Platzierungen) für einen Datenstand vollständig laden und bewerten
function planAusDaten(data, opt) {
  const M = kompiliere(data, opt);
  const P = new Plan(M);
  P.lade(data.plan.platzierungen, true);
  P.initKosten();
  return { M, P };
}

// Gründe je Slot, warum ein (unplatziertes) Ereignis dort nicht liegen kann
function slotGrund(M, P, e, s) {
  const ev = M.E[e], S = M.S;
  if (ev.fixStart >= 0 && s !== ev.fixStart) return { r: 'H09', text: 'fixiert' };
  const st = statischerGrund(M, ev, s, M.hart[RI.H11] === 1);
  if (st === 'H05') {
    for (const t of ev.immer) for (let k = 0; k < ev.dur; k++) if (M.lVerf[t * S + s + k] === 0) return { r: 'H05', text: 'Lehrkraft ' + M.lKz[t] + ' gesperrt', t };
    if (ev.aufgabe) for (const t of ev.immer) for (let k = 0; k < ev.dur - 1; k++) if (M.lGap[t * S + s + k]) return { r: 'H05', text: 'Pause für ' + M.lKz[t] + ' gesperrt', t };
    return { r: 'H05', text: 'Raum gesperrt' };
  }
  if (st) return { r: st, text: REGELN[RI[st]].name };
  const war = P.start[e];
  P.begin();
  if (war >= 0) P.entferne(e);
  P.konflikte(e, s);
  if (P.R.ev.length) {
    const x = P.R.ev[0], ex = M.E[x];
    const tt = ev.units.find(u => u < M.T && ex.units.includes(u));
    P.rollback();
    if (tt !== undefined) return { r: 'H01', text: 'Lehrkraft ' + M.lKz[tt] + ' unterrichtet dort ' + ex.klassen.map(c => M.kName[c]).join('/') + ' (' + ex.parts.map(p => p.f >= 0 ? M.fKz[p.f] : '?').join('/') + ')', t: tt };
    const cc = ev.klassen.find(c => ex.klassen.includes(c));
    return { r: 'H02', text: 'Klasse ' + (cc !== undefined ? M.kName[cc] : '?') + ' hat dort ' + ex.parts.map(p => p.f >= 0 ? M.fKz[p.f] : '?').join('/') + (ex.immer.length ? ' bei ' + ex.immer.map(t => M.lKz[t]).join('/') : '') };
  }
  const vorher = P.tot.slice();
  const ok = P.platziere(e, s, false);
  if (!ok) { P.rollback(); return { r: 'H03', text: 'kein passender Raum frei' }; }
  P.commit();
  let schlecht = null;
  for (const r of M.hartIdx) if (r !== RI.H04 && P.tot[r] > vorher[r] + 1e-9) { schlecht = r; break; }
  P.rollback();
  if (schlecht !== null) return { r: REGELN[schlecht].id, text: REGELN[schlecht].name };
  return { r: '', text: 'frei' };
}

// ---------- Machbarkeitscheck ----------
// Freie Rasterstunden einer Klasse je Woche: je Tag die Unterrichtsstunden im Korridor, höchstens „max. UStd./Tag“
function klassenSlots(M, c) {
  const k = M.data.klassen[c], jeTag = [];
  let slots = 0;
  for (let d = 0; d < M.D; d++) { let n = 0; for (let h = 0; h < M.H; h++) if (M.slotOk[d * M.H + h] && M.lnr[h] >= k.fruehestens && M.lnr[h] <= k.spaetestens) n++; const m = Math.min(n, k.maxStundenTag); jeTag.push(m); slots += m; }
  return { slots, jeTag };
}
// Belegte Rasterstunden einer Klasse in Woche A und B: ganze Klasse plus die vollste Gruppe (Gruppen derselben Klasse können parallel liegen).
// Blöcke im A/B-Wechsel belegen in ihrer Woche die volle Länge. aktiv (optional): nur diese Ereignisse zählen.
function klassenLastJeWoche(M, c, aktiv) {
  const out = [0, 0];
  for (const w of [0, 1]) {
    let ganz = 0; const grp = new Map();
    for (const e of M.kEv[c]) {
      if (aktiv && !aktiv(e)) continue;
      const ev = M.E[e];
      if (!ev.wochen.includes(w)) continue;
      if (ev.units.includes(M.kGanz[c])) ganz += ev.dur;
      else ev.units.forEach(u => { if (M.unitK[u] === c) grp.set(u, (grp.get(u) || 0) + ev.dur); });
    }
    out[w] = ganz + Math.max(0, ...grp.values());
  }
  return out;
}
function machbarkeit(data) {
  // Geprüft werden die Vorgaben, mit denen „Plan berechnen“ startet: Automatisch gewählte Fach- und Co-Lehrkräfte früherer Berechnungen sind
  // keine Vorgabe (die Berechnung wählt sie neu) – Unterricht mit „Fachlehrkraft automatisch“ hat hier noch keine Person.
  if (data && Array.isArray(data.unterrichte) && Array.isArray(data.klassen) && Array.isArray(data.faecher)) {
    try { data = Object.assign({}, data, { unterrichte: data.unterrichte.map(u => u.aufgabe || !u.lehrkraefte.some(z => z.auto) ? u : Object.assign({}, u, { lehrkraefte: u.lehrkraefte.filter(z => !z.auto) })) }); } catch (err) { /* dann wie gespeichert prüfen */ }
  }
  const out = [];
  let M;
  try { M = kompiliere(data); } catch (err) { return [{ stufe: 'fehler', text: 'Datenstand kann nicht ausgewertet werden: ' + err.message, ziel: null }]; }
  M.fehler.forEach(x => out.push({ stufe: 'fehler', text: x.text, ziel: x.ziel }));
  M.warnungen.forEach(x => out.push({ stufe: 'warnung', text: x.text, ziel: x.ziel }));
  const F = (text, ziel) => out.push({ stufe: 'fehler', text, ziel });
  const W = (text, ziel) => out.push({ stufe: 'warnung', text, ziel });
  const D = M.D, H = M.H, S = M.S;
  const autoLk = ui => { const u = data.unterrichte[ui]; return !!u && !u.aufgabe && !!u.fachAuto; };
  const AUTO_TEXT = ' Die Fachlehrkraft wählt die Berechnung – sie berücksichtigt dabei die Zeiten der Personen.';
  // Unterricht nur in Woche A oder B ohne A/B-Rhythmus der Schule
  if (data.schule.wochenrhythmus !== 'AB') M.U.forEach(U => { if (!U.aufgabe && !U.abAuto && (U.rhythmus !== 'jede' || U.blockWoche.some(w => w !== 'jede'))) F('Unterricht „' + U.name + '“ ist nur für Woche ' + (U.rhythmus !== 'jede' ? U.rhythmus : 'A oder B') + ' eingetragen, die Schule hat aber keinen A/B-Rhythmus. Unter „Schule“ den Wochenrhythmus A/B einschalten oder den Unterricht auf „jede Woche“ stellen.', { seite: 'unterricht', id: U.id }); });
  // Klassen: Stunden vs. verfügbare Slots
  const abgl = stundenAbgleich(M.data);
  // Die Berechnung wählt die Blockaufteilung selbst (Einzel-, Doppel- oder 14-tägige Doppelstunde) und gleicht dabei Woche A und B aus.
  // Maßgeblich ist deshalb die vollste Woche NACH diesem Ausgleich – mit der Standardaufteilung allein wäre eine Woche oft eine UStd. zu voll.
  let MA = null;
  const mitAusgleich = () => { if (MA === null) { try { MA = kompiliere(data, { muster: true }); } catch (err) { MA = false; } } return MA; };
  M.data.klassen.forEach((k, c) => {
    const { slots, jeTag } = klassenSlots(M, c);
    const last = klassenLastJeWoche(M, c);
    let summe = Math.max(last[0], last[1]);
    if (summe > slots && mitAusgleich()) {
      const la = klassenLastJeWoche(MA, c), ausg = Math.max(la[0], la[1]);
      if (ausg <= slots) {
        const wechsel = MA.U.filter(U => U.muster && U.klassen.includes(c) && U.muster.liste[U.muster.start].nb).map(U => U.name + ' (14-tägige Doppelstunde in Woche ' + (U.muster.w ? 'B' : 'A') + ')');
        out.push({ stufe: 'hinweis', text: 'Klasse ' + k.name + ': Mit der Standard-Blockaufteilung läge die vollere Woche bei ' + summe + ' UStd. (frei: ' + slots + '). Die Berechnung gleicht Woche A und B aus' + (wechsel.length ? ': ' + wechsel.join(', ') : '') + ' – dann sind es ' + la[0] + ' UStd. in Woche A und ' + la[1] + ' UStd. in Woche B.', ziel: { seite: 'klassen', id: k.id, reiter: 'tafeln' } });
        summe = ausg;
      }
    }
    if (summe > slots) {
      const schnitt = schuelerWochenstunden(M.data, k.id, null, 'verteilung');
      const tage = jeTag.map((n, d) => (M.data.schule.tage[d] || '?') + ' ' + n).join(' · ');
      F('Klasse ' + k.name + ': Der Unterricht belegt in der vollsten Woche ' + summe + ' UStd. im Raster' + (Math.abs(schnitt - summe) > 1e-9 ? ' (je Schüler sind es im Durchschnitt ' + zahlDe(schnitt, 1) + ' UStd. je Woche – Blöcke im A/B-Wechsel belegen in ihrer Woche die volle Länge)' : '') + ', es gibt aber nur ' + slots + ' freie UStd. (' + tage + '; Korridor ' + k.fruehestens + '.–' + k.spaetestens + '. Stunde, höchstens ' + k.maxStundenTag + ' je Tag, Unterrichtsschluss). Abhilfe: die Stundentafel der Klasse kürzen – oder Korridor, Höchstzahl je Tag bzw. Unterrichtsschluss erweitern.', { seite: 'klassen', id: k.id, reiter: 'tafeln' });
    }
    if (!k.heimatraum) W('Klasse ' + k.name + ' hat keinen Klassenraum.', { seite: 'klassen', id: k.id });
    // geteilte Fächer: Parallelbänder (hart) müssen vollständig sein; geteilte Fächer ohne Partner lassen die halbe Klasse frei
    { const kz = fid => M.fKz[M.fI.get(fid)];
      const geteilt = Object.keys(k.teilung || {}).filter(fid => k.teilung[fid] && M.fI.has(fid) && M.data.unterrichte.some(u => !u.aufgabe && u.fach === fid && u.klassen.includes(k.id) && u.gruppen.length && u.wochenstunden > 0));
      M.baender.filter(b => b.klasse === k.id).forEach(b => {
        const nm = b.faecher.map(kz).join(' und ');
        if (b.fehler) { F('Klasse ' + k.name + ': Das Parallelband ' + nm + ' ist unvollständig. ' + b.fehler + ' In der Stundentafel beide Fächer als Halbgruppe (✂) mit derselben Stundenzahl führen – oder den Parallelpartner entfernen.', { seite: 'klassen', id: k.id }); return; }
        b.paare.forEach(p => {
          const us = p.map(uid => M.data.unterrichte.find(u => u.id === uid)), lk = us.map(u => u.lehrkraefte.filter(z => z.rolle === 'fach' && z.lehrer && !z.auto).map(z => z.lehrer));
          const doppelt = lk[0].find(x => lk[1].includes(x));
          if (doppelt) F('Klasse ' + k.name + ': Im Parallelband ' + nm + ' ist ' + (M.lKz[M.lI.get(doppelt)] || '?') + ' für beide Fächer fest eingetragen. Beide Gruppen haben zur selben Zeit Unterricht – eines der Fächer braucht eine andere Lehrkraft (oder „⚙ automatisch“).', { seite: 'unterricht', klasse: k.id });
        });
      });
      const ohne = geteilt.filter(fid => !(k.parallel || {})[fid]);
      if (ohne.length === 1) W('Klasse ' + k.name + ': ' + kz(ohne[0]) + ' ist in Halbgruppen geteilt, hat aber keinen Parallelpartner. Während die eine Gruppe ' + kz(ohne[0]) + ' hat, ist die andere frei. Soll sie zeitgleich ein anderes Fach haben, in der Stundentafel ein zweites Fach teilen (✂) und als Parallelpartner wählen.', { seite: 'klassen', id: k.id });
      else if (ohne.length > 1) W('Klasse ' + k.name + ': ' + ohne.map(kz).join(', ') + ' sind in Halbgruppen geteilt, aber keine Parallelpartner. Die Berechnung legt sie nur möglichst nebeneinander. Für zwingende Gleichzeitigkeit in der Stundentafel je zwei Fächer als Parallelpartner wählen.', { seite: 'klassen', id: k.id });
    }
    // als „in Gruppen geteilt“ gekennzeichnete Fächer brauchen genau je einen Unterricht für Gruppe A und B
    Object.keys(k.teilung || {}).forEach(fid => { if (!k.teilung[fid] || !M.fI.has(fid)) return; const us = M.data.unterrichte.filter(u => !u.aufgabe && u.fach === fid && u.klassen.includes(k.id)); if (us.length && !teilungsPaar(k, us)) W('Klasse ' + k.name + ': ' + M.fKz[M.fI.get(fid)] + ' ist als „in Gruppen A und B geteilt“ gekennzeichnet (✂), es gibt aber nicht genau je einen Unterricht für Gruppe A und Gruppe B – womöglich hat nur ein Teil der Klasse das Fach. In der Stundentafel ✂ aus- und wieder einschalten oder die Unterrichte von Hand anpassen.', { seite: 'unterricht', klasse: k.id }); });
    // Fächer ohne ✂, die es nur für einzelne Gruppen gibt (Wahlgruppen, Förderunterricht): nicht jeder Schüler hat sie
    { const ist = schuelerStunden(M.data, k.id, 'verteilung'), gN = new Map(k.gruppen.map(g => [g.id, g.name]));
      ist.forEach((x, fid) => { const gs = Object.keys(x.gruppen); if (!gs.length || (k.teilung || {})[fid] || x.ganz > 0 || !M.fI.has(fid) || gs.length >= k.gruppen.length) return;
        out.push({ stufe: 'hinweis', text: 'Klasse ' + k.name + ', ' + M.fKz[M.fI.get(fid)] + ': Das Fach gibt es nur für ' + (gs.length === 1 ? 'die Gruppe ' : 'die Gruppen ') + gs.map(g => gN.get(g) || '?').join(', ') + ' (nicht als ✂ Halbgruppen geteilt). Die Stundentafel nennt die Stunden der Schüler dieser Gruppe' + (gs.length === 1 ? '' : 'n') + '; die übrigen Schüler der Klasse haben das Fach nicht.', ziel: { seite: 'unterricht', klasse: k.id } }); }); }
    // Höchstens je Tag (Vorgabe des Fachs oder eigener Wert der Klasse): passen die Wochenstunden auf die Unterrichtstage der Klasse?
    { const tageMit = jeTag.filter(n => n > 0).length;
      schuelerStunden(M.data, k.id, 'verteilung').forEach((x, fid) => {
        if (!M.fI.has(fid) || !(x.wert > 0)) return;
        const f = M.data.faecher[M.fI.get(fid)], max = fachMaxTag(k, f), eigen = !!(k.maxProTag && k.maxProTag[fid]);
        const quelle = eigen ? ' (eigener Wert der Klasse)' : ' (Vorgabe des Fachs)';
        if (x.wert > max * tageMit + 1e-9) F('Klasse ' + k.name + ', ' + M.fKz[M.fI.get(fid)] + ': ' + zahlDe(x.wert, 1) + ' UStd. je Woche passen nicht auf ' + tageMit + ' Unterrichtstage, wenn das Fach höchstens ' + max + '× je Tag vorkommen darf' + quelle + '. „Höchstens je Tag“ in der Stundentafel erhöhen.', { seite: 'klassen', id: k.id });
        else if (max < 2 && f.doppelstunde === 'pflicht') F('Klasse ' + k.name + ', ' + M.fKz[M.fI.get(fid)] + ': Das Fach verlangt Doppelstunden, darf aber höchstens einmal je Tag vorkommen' + quelle + '. Eines von beiden ändern.', { seite: 'klassen', id: k.id });
      }); }
    // Stundentafel = Unterrichtsverteilung, gerechnet je Schüler (schuelerStunden): Abweichungen sind Fehler
    abgl.filter(x => x.klasse === k.id).forEach(x => {
      const kzF = x.fach && M.fI.has(x.fach) ? M.fKz[M.fI.get(x.fach)] : '?';
      if (x.art === 'ohneTafel') F('Klasse ' + k.name + ' hat keine Stundentafel, aber ' + zahlDe(x.verteilung, 1) + ' UStd. je Woche in der Unterrichtsverteilung. Die Stundentafel ist die führende Eingabe – auf der Seite „Klassen & Stundentafel“ mit „Aus Unterrichtsverteilung übernehmen“ anlegen.', { seite: 'klassen', id: k.id, reiter: 'tafeln' });
      else if (x.art === 'verteilung') F('Klasse ' + k.name + ', ' + kzF + ': Die Stundentafel sieht ' + zahlDe(x.tafel, 1) + ' UStd. je Woche und Schüler vor, die Unterrichtsverteilung ergibt ' + zahlDe(x.verteilung, 1) + ' UStd.' + (Object.keys(x.gruppen || {}).length ? ' (Halbgruppen zählen je Schüler einmal, A-/B-Wochen halb)' : '') + '. Mit „Mit Stundentafel abgleichen“ angleichen oder die Stundentafel ändern.', { seite: 'unterricht', klasse: k.id });
      else if (x.art === 'gruppen') F('Klasse ' + k.name + ', ' + kzF + ': Die Halbgruppen bekommen verschieden viele Stunden (' + Object.values(x.gruppen).map(v => zahlDe(v, 1)).join(' und ') + ') – nicht jeder Schüler erhält die ' + zahlDe(x.tafel, 1) + ' UStd. der Stundentafel.', { seite: 'unterricht', klasse: k.id });
    });
  });
  // Lehrkräfte
  const kzSeen = new Map();
  M.data.lehrer.forEach((l, t) => {
    if (!l.kuerzel) W('Lehrkraft ' + (l.name || '(ohne Name)') + ' hat kein Kürzel.', { seite: 'lehrer', id: l.id });
    else if (kzSeen.has(l.kuerzel)) W('Kürzel „' + l.kuerzel + '“ ist mehrfach vergeben.', { seite: 'lehrer', id: l.id });
    kzSeen.set(l.kuerzel, true);
    // Unterricht ist je Tag durch „max. Stunden/Tag“ begrenzt, Aufgaben nicht – sie brauchen aber freie Stunden
    let std = 0, stdA = 0;
    M.U.forEach(U => { if (U.immer.includes(t)) { if (U.aufgabe) stdA += U.ws; else std += U.ws; } U.coZiel.forEach(z => { if (z.t === t) std += z.anteil; }); });
    let slots = 0, frei = 0; // frei: Aufgaben dürfen auch nach Unterrichtsschluss liegen
    for (let d = 0; d < D; d++) { let n = 0; for (let h = 0; h < H; h++) { if (M.lVerf[t * S + d * H + h] === 0) continue; if (M.slotOk[d * H + h]) n++; if (!M.pause[h]) frei++; } slots += Math.min(n, l.maxStundenTag); }
    if (std > slots) F('Lehrkraft ' + (l.kuerzel || l.name) + ': ' + zahlDe(std, 1) + ' UStd. fest eingetragener Unterricht, aber nur ' + slots + ' freie UStd. in der Woche (Sperrzeiten, Anwesenheit, höchstens ' + l.maxStundenTag + ' UStd. je Tag). Unterricht an andere Personen geben (oder „automatisch“) bzw. die Zeiten der Person erweitern.', { seite: 'lehrer', id: l.id });
    else if (std + stdA > frei) F((l.kuerzel || l.name) + ': ' + std + ' UStd. Unterricht und ' + stdA + ' UStd. Aufgaben, aber nur ' + frei + ' freie UStd. in der Woche (Sperrzeiten, Anwesenheit).', { seite: 'lehrer', id: l.id });
  });
  // Unterrichte: Lehrbefähigung und Co-Kräfte mit Zwang
  M.data.unterrichte.forEach((u, i) => {
    const U = M.U[i];
    u.lehrkraefte.forEach(z => { const l = M.data.lehrer.find(x => x.id === z.lehrer); if (l && z.rolle === 'fach' && z.zwang && l.ausgebildet === false) W('Co-Kraft ' + (l.kuerzel || l.name) + ' ist per Zwang als Fachlehrkraft in „' + U.name + '“ eingeteilt.', { seite: 'unterricht', id: u.id }); });
    if (u.aufgabe) return;
    U.fachL.forEach(t => { if (M.data.lehrer[t].ausgebildet === false) return; if (!M.data.lehrer[t].faecher.includes(u.fach)) W('Lehrkraft ' + M.lKz[t] + ' hat keine Lehrbefähigung für ' + (U.f >= 0 ? M.fKz[U.f] : '?') + ' (' + U.name + ').', { seite: 'unterricht', id: u.id }); });
    // Co-Lehrkräfte: Co-Fach und Klassenteam
    const team = new Set(); let teamDa = false;
    u.klassen.forEach(kid => { const k = M.data.klassen.find(x => x.id === kid); if (k && k.team.length) { teamDa = true; k.team.forEach(t => team.add(t)); } });
    u.lehrkraefte.forEach(z => {
      if (z.rolle !== 'co') return;
      const l = M.data.lehrer.find(x => x.id === z.lehrer); if (!l) return;
      if (!coBefaehigt(l, u.fach)) W((l.kuerzel || l.name) + ' ist in „' + U.name + '“ Co-Lehrkraft, hat ' + (U.f >= 0 ? M.fKz[U.f] : 'das Fach') + ' aber nicht als Co-Fach.', { seite: 'unterricht', id: u.id });
      if (teamDa && !team.has(l.id) && !(l.klassenleitung && u.klassen.includes(l.klassenleitung))) W('Co-Lehrkraft ' + (l.kuerzel || l.name) + ' in „' + U.name + '“ gehört nicht zum Klassenteam.', { seite: 'unterricht', id: u.id });
    });
  });
  // Arbeitszeit (geplant, ohne Aufsichten) gegen maximale Wochenarbeitszeit
  const azGeplant = arbeitszeiten(data, { geplant: true, ohneAufsicht: true, ohneDienste: true }).liste;
  azGeplant.forEach(x => {
    // Unterrichtsdeputat: Höchstzahl der Unterrichtsstunden je Woche (als Lehrkraft und als Co zusammen) – nur wenn die Option an ist
    if (x.hatSollStd && x.istStd > x.sollStd + 0.49) W('Unterrichtsdeputat ' + x.kuerzel + ': geplant ' + zahlDe(x.istStd, 1) + ' UStd.' + (x.coStunden || x.aufgStd ? ' (davon ' + [x.coStunden ? zahlDe(x.coStunden, 1) + ' als Co' : '', x.aufgStd ? zahlDe(x.aufgStd, 1) + ' angerechnete Aufgaben' : ''].filter(Boolean).join(', ') + ')' : '') + ', höchstens ' + zahlDe(x.sollStd, 1) + ' – ' + zahlDe(x.istStd - x.sollStd, 1) + ' über dem Deputat.', { seite: 'lehrer', id: x.lehrer });
    if (x.soll > 0 && x.summe > x.soll + 3) W('Arbeitszeit ' + x.kuerzel + ': fest eingetragen sind ' + zahlDe(x.summe / 60, 1) + ' h, höchstens ' + zahlDe(x.soll / 60, 1) + ' h (Unterricht, Vorbereitung, Co-Einsätze, Aufgaben und Klassenleitung).' + (M.hart[RI.H16] ? ' Die Grenze lässt sich so nicht einhalten.' : ''), { seite: 'lehrer', id: x.lehrer });
  });
  // Weniger Arbeitszeit als vertraglich vereinbart (mit Plan inklusive Aufsichten, sonst laut Unterrichtsverteilung)
  const azVoll = arbeitszeiten(data);
  const aufsichtGeplant = !!(data.dienste && data.dienste.bedarfe.length);
  if (azVoll.quelle === 'plan' || !aufsichtGeplant) azVoll.liste.forEach(x => {
    if (x.soll > 0 && x.summe < x.soll - 120) W('Arbeitszeit ' + x.kuerzel + ': ' + zahlDe(x.summe / 60, 1) + ' h ' + (azVoll.quelle === 'plan' ? 'laut Plan (inkl. Aufsichten)' : 'laut Unterrichtsverteilung (ohne Aufsichten)') + ', vertraglich ' + zahlDe(x.soll / 60, 1) + ' h – ' + zahlDe((x.soll - x.summe) / 60, 1) + ' h der Wochenarbeitszeit sind noch frei.', { seite: 'lehrer', id: x.lehrer });
  });
  // Doppelstundenpflicht bei ungerader Stundenzahl: Hinweis, wie der Unterricht erzeugt wird (Blockzwang und Stundentafel bleiben beide erfüllt)
  {
    const betr = M.U.filter(U => U.abAuto && U.regel === 'pflicht'), kN = k => (M.kName[k] || '?');
    const text = U => U.name + ' hat ' + U.ws + ' UStd. je Woche' + ' bei verpflichtender Doppelstunde. Der Unterricht wird deshalb ' + (U.ws === 1 ? 'als Doppelstunde im A/B-Rhythmus erzeugt (nur Woche ' + U.blockWoche[U.blockWoche.length - 1] + ')' : 'in Doppelstunden erzeugt; die übrige Doppelstunde liegt nur in Woche ' + U.blockWoche[U.blockWoche.length - 1]) + ' – im Durchschnitt ' + U.ws + ' UStd. je Woche.';
    betr.slice(0, 12).forEach(U => out.push({ stufe: 'hinweis', text: text(U), ziel: { seite: 'unterricht', id: U.id } }));
    if (betr.length > 12) out.push({ stufe: 'hinweis', text: 'Weitere ' + (betr.length - 12) + ' Unterrichte mit Doppelstundenpflicht und ungerader Stundenzahl liegen ebenfalls im A/B-Wechsel.', ziel: { seite: 'unterricht', id: null } });
  }
  // Personal: Reicht die Kapazität der fachlich geeigneten Lehrkräfte für den Unterricht mit „Fachlehrkraft automatisch“? (Deputat bzw.
  // Wochenarbeitszeit abzüglich der fest eingetragenen Einsätze; eine Person zählt für jedes ihrer Fächer – Engpässe zwischen Fächern
  // klärt erst die Berechnung)
  {
    const amK = data.schule.arbeitszeitModell || ARBEITSZEIT_STD, stdK = standardMinuten(data.schule), jeStd = stdK + amK.vorbLehrkraft; // Minuten je Unterrichtsstunde samt Vorbereitung
    const azK = new Map(azGeplant.map(x => [x.lehrer, x]));
    const frei = l => { const x = azK.get(l.id); if (!x) return 0; const a = x.soll > 0 ? Math.max(0, x.soll - x.summe) / jeStd : Infinity, b = x.hatSollStd ? Math.max(0, x.sollStd - x.istStd) : Infinity; return Math.min(a, b); };
    const bedarfF = new Map(), bl = bloeckeAlle(data);
    data.unterrichte.forEach(u => { if (u.aufgabe || !u.fachAuto || !(u.wochenstunden > 0) || !M.fI.has(u.fach)) return; bedarfF.set(u.fach, (bedarfF.get(u.fach) || 0) + stundenSchnitt(u, bl.get(u.id))); });
    let summeB = 0, summeK = 0; const alle = new Set();
    bedarfF.forEach((std, fid) => {
      const L = data.lehrer.filter(l => l.ausgebildet !== false && fachBefaehigt(l, fid)); if (!L.length) return;
      L.forEach(l => alle.add(l)); summeB += std;
      const kap = L.reduce((a, l) => a + Math.min(frei(l), 1e6), 0);
      if (std > kap + 0.5) W('Personal für ' + M.fKz[M.fI.get(fid)] + ': ' + zahlDe(std, 1) + ' UStd. je Woche mit „Fachlehrkraft automatisch“, die ' + L.length + ' Lehrkräfte mit diesem Fach haben zusammen aber nur noch etwa ' + zahlDe(Math.floor(kap), 1) + ' UStd. frei (Deputat bzw. Arbeitszeit). Ein Teil bliebe ohne Fachlehrkraft.', { seite: 'lehrer', id: null });
    });
    alle.forEach(l => { summeK += Math.min(frei(l), 1e6); });
    if (summeB > summeK + 0.5) W('Personal insgesamt: ' + zahlDe(summeB, 1) + ' UStd. je Woche mit „Fachlehrkraft automatisch“, die geeigneten Lehrkräfte haben zusammen aber nur noch etwa ' + zahlDe(Math.floor(summeK), 1) + ' UStd. frei.', { seite: 'lehrer', id: null });
  }
  // Personal: Für jeden Unterricht gibt es grundsätzlich mindestens eine fachlich geeignete Lehrkraft (Fachbefähigung ist Voraussetzung)
  {
    const ohne = new Map();
    data.unterrichte.forEach(u => {
      if (u.aufgabe || !u.fach || !(u.wochenstunden > 0) || !M.fI.has(u.fach)) return;
      if (u.lehrkraefte.some(z => z.rolle === 'fach' && z.lehrer && !z.auto)) return; // fest eingetragen (ggf. mit Zwang – eigene Warnung)
      if (data.lehrer.some(l => l.ausgebildet !== false && fachBefaehigt(l, u.fach))) return;
      if (!ohne.has(u.fach)) ohne.set(u.fach, []); ohne.get(u.fach).push(u);
    });
    ohne.forEach((us, fid) => W('Für ' + (M.fKz[M.fI.get(fid)] || '?') + ' ist bei keiner Lehrkraft das Fach eingetragen (' + us.length + (us.length === 1 ? ' Unterricht: ' : ' Unterrichte: ') + us.slice(0, 5).map(u => u.klassen.map(k => (M.kI.has(k) ? M.kName[M.kI.get(k)] : '?')).join('/')).join(', ') + (us.length > 5 ? ' …' : '') + '). Ohne Fachbefähigung teilt die Automatik niemanden zu – die Stunden blieben ohne Lehrkraft. Auf der Seite „Lehrkräfte“ das Fach eintragen.', { seite: 'lehrer', id: null }));
  }
  // Co-Bedarf (je Klasse und Fach): Die Berechnung besetzt ihn blockweise nach dem fertigen Unterrichtsplan – auch mit mehreren Co-Lehrkräften je Kurs.
  // Gemeldet wird vorab nur, was sich grundsätzlich nicht besetzen lässt: niemand mit dem Fach „als Co“ oder insgesamt zu wenig freie Arbeitszeit.
  const ohneCo = data.unterrichte.filter(u => !u.aufgabe && u.klassen.length > 0 && !u.lehrkraefte.some(z => z.rolle === 'co') && coBedarfVon(data, u).std > 0);
  if (ohneCo.length) {
    const coR = nCoRegeln(data.schule.coRegeln || {}), darf = (l, u) => coAutoBefaehigt(l, u.fach) && !(l.ausgebildet !== false && coR.lehrkraefte === 'nie') && !u.lehrkraefte.some(z => z.lehrer === l.id);
    const nie = [...new Set(ohneCo.filter(u => !data.lehrer.some(l => darf(l, u))).map(u => u.fach))].filter(f => M.fI.has(f));
    if (nie.length) W('Co-Bedarf in ' + nie.map(f => M.fKz[M.fI.get(f)]).join(', ') + ': Niemand hat dieses Fach „als Co“ eingetragen – die Co-Stunden lassen sich nicht besetzen. Auf der Seite „Lehrkräfte“ bei den Fächern „Co“ ankreuzen oder den Co-Bedarf in der Stundentafel herausnehmen.', { seite: 'lehrer', id: null });
    const rest = ohneCo.filter(u => !nie.includes(u.fach));
    if (rest.length) {
      try {
        const amC = data.schule.arbeitszeitModell || ARBEITSZEIT_STD, stdC = standardMinuten(data.schule), jeStd = stdC + amC.vorbCo;
        const azC = arbeitszeiten(data, { geplant: true, ohneAufsicht: true, ohneDienste: true }), frei = new Map(azC.liste.map(x => [x.lehrer, x.soll > 0 ? Math.max(0, x.soll - x.summe) / jeStd : 0]));
        const personen = new Set(); let bedarf = 0;
        rest.forEach(u => { bedarf += coBedarfVon(data, u).std; data.lehrer.forEach(l => { if (darf(l, u)) personen.add(l.id); }); });
        let kap = 0; personen.forEach(id => { kap += frei.get(id) || 0; });
        if (bedarf > kap + 0.5) W('Co-Bedarf: ' + zahlDe(bedarf, 1) + ' UStd. je Woche sollen mit Co-Lehrkraft stattfinden, die dafür geeigneten Personen haben zusammen aber nur etwa ' + zahlDe(Math.floor(kap), 1) + ' UStd. freie Arbeitszeit – ein Teil bleibt voraussichtlich ohne Co-Lehrkraft. Abhilfe: weitere Personen mit dem Fach „als Co“, mehr Arbeitszeit oder weniger Co-Bedarf in der Stundentafel.', { seite: 'lehrer', id: null });
      } catch (err) { /* Schätzung nicht möglich */ }
    }
  }
  // Fachraumbedarf je Raumtyp
  const bedarf = new Map();
  M.E.forEach(ev => ev.parts.forEach(p => { if (p.cands && p.raumFix < 0 && p.typ !== 'klassenraum') bedarf.set(p.typ, (bedarf.get(p.typ) || 0) + ev.dur); }));
  bedarf.forEach((std, typ) => {
    let cap = 0;
    for (let r = 0; r < M.R; r++) if (M.rTyp[r] === typ) { let n = 0; for (let s = 0; s < S; s++) if (M.slotOk[s] && M.rVerf[r * S + s] !== 0) n++; cap += n * M.rTeil[r]; }
    if (std > cap) F('Raumtyp „' + typ + '“: Bedarf ' + std + ' UStd., Kapazität ' + cap + ' UStd. (Räume × Zeitfenster).', { seite: 'raeume', id: null });
  });
  // Fixierte Unterrichte kollidieren
  const fix = M.E.map((ev, e) => e).filter(e => M.E[e].fixStart >= 0);
  for (let i = 0; i < fix.length; i++) for (let j = i + 1; j < fix.length; j++) {
    const a = M.E[fix[i]], b = M.E[fix[j]];
    if (a.fixStart + a.dur <= b.fixStart || b.fixStart + b.dur <= a.fixStart) continue;
    if (!a.wochen.some(w => b.wochen.includes(w))) continue;
    const shared = a.units.find(u => b.units.includes(u));
    if (shared !== undefined) F('Fixierte Unterrichte kollidieren: ' + evName(M, fix[i]) + ' und ' + evName(M, fix[j]) + ' (' + slotText(M, a.fixStart) + ' Std.).', { seite: 'unterricht', id: M.U[a.parts[0].u].id });
  }
  // Blöcke eines Unterrichts brauchen verschiedene Tage (H07)
  if (M.hart[RI.H07]) M.U.forEach(U => {
    const evs = M.uEv[U.i]; if (evs.length < 2 || U.aufgabe) return; // Aufgaben dürfen mehrere Blöcke am selben Tag haben
    const tage = new Set();
    evs.forEach(e => { for (const s of M.E[e].erlaubt) tage.add(Math.floor(s / H)); });
    if (tage.size < evs.length) { const au = evs.some(e => M.E[e].parts.some(p => autoLk(p.u))); (au ? W : F)('Unterricht „' + U.name + '“: ' + evs.length + ' Blöcke müssen an verschiedenen Tagen liegen, möglich sind nur ' + tage.size + ' Tag(e) (Sperrzeiten, Teilzeit oder Korridor).' + (au ? AUTO_TEXT : ''), { seite: 'unterricht', id: U.id }); }
  });
  // Zeitprofile: gekoppelte Klassen mit unterschiedlichen realen Unterrichtszeiten
  zeitprofilKonflikte(data).forEach(k => W(k.text, k.ziel));
  // Aufgaben mit festen Terminen (Uhrzeit oder Pause)
  {
    const pl = pausenListe(data.schule, data.klassen);
    let idxB = null;
    data.unterrichte.forEach(u => {
      if (!u.aufgabe) return;
      const name = u.name || u.kuerzel || 'Aufgabe', ziel = { seite: 'aufgaben', id: u.id };
      if (!u.wochenstunden && !(u.termine || []).length) W('Aufgabe „' + name + '“ hat weder Stunden noch einen Termin.', ziel);
      aufgabeTermine(data, u, pl, true).forEach(t => {
        if (t.ungueltig) { W('Aufgabe „' + name + '“: Der ' + (t.i + 1) + '. Termin ist ungültig (die Pause gibt es nicht mehr oder die Uhrzeit fehlt).', ziel); return; }
        idxB = idxB || belegungsIndex(data, { ohneAufsicht: true, ohneDienste: true, ohneGta: true });
        u.lehrkraefte.forEach(z => {
          const x = ((idxB.get(z.lehrer) || [])[t.tag] || []).find(b => b.art !== 'gesperrt' && !(b.termin && b.ref === u.id) && b.start < t.end && t.start < b.end);
          if (x) W('Termin „' + name + '“ (' + terminText(data, t) + '): ' + belegungText(data, z.lehrer, x), ziel);
        });
      });
    });
  }
  // Ereignisse ohne zulässigen Slot (nicht doppelt melden, wenn der Unterricht schon einen Fehler hat)
  const mitFehler = new Set(M.fehler.map(x => x.ziel && x.ziel.id).filter(Boolean));
  M.E.forEach((ev, e) => {
    if (ev.fixStart >= 0 || ev.erlaubt.length) return;
    if (ev.parts.some(p => mitFehler.has(M.U[p.u].id))) return;
    const zaehl = {};
    for (let s = 0; s < S; s++) { const g = statischerGrund(M, ev, s, M.hart[RI.H11] === 1); if (g) zaehl[g] = (zaehl[g] || 0) + 1; }
    const top = Object.entries(zaehl).sort((a, b) => b[1] - a[1]).map(([r, n]) => regelZitat(r) + ' (' + n + '×)').join(', ');
    const au = ev.parts.some(p => autoLk(p.u)) && !!zaehl.H05;
    (au ? W : F)(evName(M, e) + ' hat keinen einzigen zulässigen Slot. Häufigste Gründe: ' + top + '.' + (au ? AUTO_TEXT : ''), { seite: 'unterricht', id: M.U[ev.parts[0].u].id });
  });
  try { aufsichtKapazitaet(data).forEach(x => out.push(x)); } catch (err) { /* die Kapazitätsprüfung ist ein Zusatz – ohne sie weiterprüfen */ }
  return out;
}
// Aufsichtsbedarf gegen die Personen, die zu der Zeit überhaupt verfügbar sein können. Unterricht ist hier noch nicht gelegt und zählt nicht;
// feste Termine, Aufgaben mit Termin, Sperrzeiten, Abwesenheit und Ausschlüsse gelten. Die Prüfung ist eine untere Schranke (jede Person
// zählt für jeden überdeckenden Bedarf als frei, der Bedarf an anderen Bereichen derselben Zeit wird aber addiert) und liefert nur Warnungen.
function aufsichtKapazitaet(data) {
  const DI = data.dienste, out = [];
  if (!DI || !(DI.bedarfe || []).length) return out;
  const d0 = Object.assign({}, data, { plan: { platzierungen: [] }, dienste: Object.assign({}, DI, { plan: [] }) });
  const ctx = dienstKontext(d0, { plan: [] }), D = d0.schule.tage.length;
  const schicht = (b, a, von, bis) => {
    const ax = bedarfAusschlussFuerIntervall(b, von, bis);
    const s = schichtAusDienst(ctx, { id: 'kap', tag: b.tag, typ: b.typ || 'dt_dienst', bereich: b.bereich || null, bedarf: b.id, name: b.name, arbeitszeit: b.arbeitszeit, springer: b.springer, qualifikation: b.qualifikation, farbe: b.farbe,
      beginn: zeitText(von), ende: bis >= 1440 ? '24:00' : zeitText(bis), rhythmus: { art: 'woechentlich' }, quelle: 'auto', ausschlussPersonen: ax.personen, ausschlussGruppen: ax.gruppen });
    s.start = von; s.end = bis; s.neu = true; s.lehrer = null;
    return s;
  };
  for (let tag = 0; tag < D; tag++) {
    const teile = [];
    DI.bedarfe.filter(b => b.tag === tag).forEach(b => (b.abschnitte || []).forEach(a => { const iv = intervall(a.beginn, a.ende); if (iv && iv.end > iv.start && (a.min || 0) > 0) teile.push({ b, a, iv, springer: istSpringerBedarf(b) }); }));
    if (!teile.length) continue;
    const punkte = [...new Set(teile.flatMap(t => [t.iv.start, t.iv.end]))].sort((x, y) => x - y);
    const meldungen = [];
    for (let i = 0; i + 1 < punkte.length; i++) {
      const von = punkte[i], bis = punkte[i + 1];
      const deckt = teile.filter(t => t.iv.start <= von && t.iv.end >= bis);
      if (!deckt.length) continue;
      const fest = deckt.filter(t => !t.springer).reduce((n, t) => n + t.a.min, 0), mitSpringer = deckt.reduce((n, t) => n + t.a.min, 0);
      const schichten = deckt.map(t => schicht(t.b, t.a, von, bis));
      const frei = ctx.personen.filter(p => schichten.some(s => !dienstHartGruende(ctx, p, s, false).length));
      if (mitSpringer <= frei.length) continue;
      // Wer fehlt und warum: die häufigsten Gründe (Aufgabe/Termin, Sperrzeit, Ausschluss) der nicht verfügbaren Personen
      const gruende = new Map();
      ctx.personen.filter(p => !frei.includes(p)).forEach(p => {
        const g = dienstHartGruende(ctx, p, schichten[0], true)[0]; if (!g) return;
        const b = (p.basis[tag] || []).find(x => intervalleUeberschneiden(x, { start: von, end: bis }));
        const name = b ? (b.art === 'aufgabe' ? 'Aufgabe „' + b.text + '“' : b.art === 'gesperrt' ? 'Sperrzeit (Verfügbarkeit)' : g.code === 'D05' ? 'Ausschluss von Aufsichten' : g.code === 'D02' ? 'Abwesenheit' : g.text) : (g.code === 'D05' ? 'Ausschluss von Aufsichten' : g.code === 'D02' ? 'Abwesenheit' : g.text);
        gruende.set(name, (gruende.get(name) || 0) + 1);
      });
      const warum = [...gruende].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([n, c]) => c + '× ' + n).join(', ');
      meldungen.push({ von, bis, fest, mitSpringer, frei: frei.length, harte: fest > frei.length, warum });
    }
    // aufeinanderfolgende Abschnitte mit gleichem Befund zu einer Meldung zusammenfassen
    const reihe = [];
    meldungen.forEach(m => { const l = reihe[reihe.length - 1]; if (l && l.bis === m.von && l.fest === m.fest && l.mitSpringer === m.mitSpringer && l.frei === m.frei && l.warum === m.warum) l.bis = m.bis; else reihe.push(Object.assign({}, m)); });
    reihe.forEach(m => out.push({ stufe: 'warnung', ziel: { seite: 'aufsicht' }, text: (aufsichtTagName(d0, tag)) + ' ' + zeitText(m.von) + '–' + zeitText(m.bis) + ': ' + (m.harte
      ? 'Mindestbedarf ' + m.fest + ' Person' + (m.fest === 1 ? '' : 'en') + ' an Aufsichten, aber höchstens ' + m.frei + ' sind zu dieser Zeit überhaupt verfügbar'
      : 'Mit Springer werden ' + m.mitSpringer + ' Personen gebraucht, aber höchstens ' + m.frei + ' sind zu dieser Zeit überhaupt verfügbar – der Springer kann nicht besetzt werden')
      + (m.warum ? ' (nicht verfügbar: ' + m.warum + ')' : '') + '. Aufgaben/Termine zu dieser Zeit verschieben oder den Bedarf senken.' }));
  }
  return out;
}
const aufsichtTagName = (d, t) => d.schule.tage[t] || ('Tag ' + (t + 1));
// Zahl deutsch formatiert, st Nachkommastellen (höchstens), vorzeichen: „+“ vor positiven Werten (Differenzen)
function zahlDe(x, st, vorzeichen) { const f = Math.pow(10, st || 0), r = Math.round(x * f) / f; return (vorzeichen && r > 0 ? '+' : '') + r.toLocaleString('de-DE'); }

// ---------- Offene Punkte eines Plans ----------
// Was nach der Berechnung noch fehlt: nicht platzierte Blöcke, Stunden ohne Raum, ohne Fachlehrkraft, ohne Co-Lehrkraft.
// Ergebnis: Gruppen [{art, titel, hinweis, eintraege: [{text, unterricht, klasse, lehrer, tag, stunde}]}] – nur Gruppen mit Einträgen.
function offenePunkte(d) {
  const sch = d.schule, D = sch.tage.length;
  const fMap = new Map(d.faecher.map(f => [f.id, f])), kMap = new Map(d.klassen.map(k => [k.id, k])), lMap = new Map(d.lehrer.map(l => [l.id, l]));
  const bl = bloeckeAlle(d);
  const lnr = stundenNummern(sch);
  const name = u => u.aufgabe ? 'Aufgabe „' + (u.name || u.kuerzel || '?') + '“' : ((fMap.get(u.fach) || {}).kuerzel || '?') + ' ' + (u.klassen.map(k => (kMap.get(k) || {}).name || '?').join('/') || '–') + (u.gruppen && u.gruppen.length ? ' (' + u.gruppen.map(g => { for (const k of d.klassen) { const x = (k.gruppen || []).find(y => y.id === g); if (x) return x.name; } return '?'; }).join(', ') + ')' : '');
  const wann = p => (sch.tage[p.tag] || '?') + ' ' + lnr[p.stunde - 1] + '.' + (p.dauer > 1 ? '–' + lnr[p.stunde - 1 + p.dauer - 1] + '.' : '') + ' Std.';
  const kz = id => { const l = lMap.get(id); return l ? (l.kuerzel || l.name || '?') : '?'; };
  const ziel = (u, p) => ({ unterricht: u.id, klasse: u.klassen[0] || null, lehrer: (u.lehrkraefte.find(z => z.rolle === 'fach') || u.lehrkraefte[0] || {}).lehrer || null, tag: p ? p.tag : null, stunde: p ? p.stunde : null });
  const G = { ablage: [], raum: [], lehrkraft: [], co: [], coTeil: [], aufgaben: [], dienste: [], zeitprofil: [], arbeitszeit: [] };
  const handB = besetzungMap(d), freiM = freiMap(d), coHandB = coHandBloecke(d);
  const plaetze = new Map();
  d.plan.platzierungen.forEach(p => { if (p.tag < D) { if (!plaetze.has(p.unterricht)) plaetze.set(p.unterricht, []); plaetze.get(p.unterricht).push(p); } });
  // Block, in dem die Co-Lehrkraft von Hand herausgenommen wurde (ohne Ersatz): bewusst ohne Co – keine offene Co-Stunde
  const bewusstOhneCo = (u, p) => { const k = u.id + '|' + p.blockNr; return coHandB.has(k) && !(handB.get(k) || []).some(l => handB.co.has(k + '|' + l)); };
  const hatPlan = d.plan.platzierungen.length > 0, hatPlan0 = hatPlan;
  d.unterrichte.forEach(u => {
    const f = fMap.get(u.fach), b = bl.get(u.id), ps = (plaetze.get(u.id) || []).slice().sort((x, y) => x.tag - y.tag || x.stunde - y.stunde);
    const fachL = u.lehrkraefte.filter(z => z.rolle === 'fach' && lMap.has(z.lehrer)), co = u.lehrkraefte.filter(z => z.rolle === 'co' && lMap.has(z.lehrer));
    const alleVonHand = !u.aufgabe && !fachL.length && hatPlan0 && b && b.dauer.every((_, i) => (handB.get(u.id + '|' + (i + 1)) || []).some(l => !handB.co.has(u.id + '|' + (i + 1) + '|' + l)));
    if (!fachL.length && !alleVonHand && !(u.fachAuto && !u.aufgabe && !hatPlan0)) (u.aufgabe ? G.aufgaben : G.lehrkraft).push(Object.assign({ text: name(u) + (u.aufgabe ? ' – keiner Person zugeordnet' : u.fachAuto ? ' – ohne Fachlehrkraft: Die Berechnung hat niemanden mit dem Fach und freier Kapazität gefunden' : ' – ohne Fachlehrkraft') + (u.wochenstunden ? ' (' + (u.aufgabe || !b || !hatPlan0 ? u.wochenstunden : b.dauer.reduce((s, dd, i) => s + ((handB.get(u.id + '|' + (i + 1)) || []).length ? 0 : dd), 0)) + ' UStd.' + (!u.aufgabe && b && hatPlan0 && b.dauer.some((_, i) => (handB.get(u.id + '|' + (i + 1)) || []).length) ? ' noch unbesetzt' : '') + ')' : ''), ziel: { seite: u.aufgabe ? 'aufgaben' : 'unterricht', id: u.id } }, ziel(u)));
    if (u.aufgabe && !u.wochenstunden && !(u.termine || []).length) G.aufgaben.push(Object.assign({ text: name(u) + ' – hat weder Stunden noch einen Termin', ziel: { seite: 'aufgaben', id: u.id } }, ziel(u)));
    if (!u.aufgabe && f && u.klassen.length && !co.length && !(ps.length && ps.every(p => bewusstOhneCo(u, p)))) { const cb = coBedarfVon(d, u, b, f); if (cb.std > 0) G.co.push(Object.assign({ text: name(u) + ' – ' + (cb.alle ? 'alle Stunden' : zahlDe(cb.std, 1) + ' von ' + zahlDe(cb.schnitt, 1) + ' UStd.') + ' sollen mit Co-Lehrkraft stattfinden, eingetragen ist keine' }, ziel(u, ps[0]))); }
    if (!hatPlan) return;
    // nicht platzierte Blöcke
    if (b) b.dauer.forEach((dauer, i) => {
      if (ps.some(p => p.blockNr === i + 1)) return;
      const was = name(u) + ' – ' + (dauer === 1 ? 'Einzelstunde' : dauer === 2 ? 'Doppelstunde' : 'Block mit ' + dauer + ' UStd.') + (b.dauer.length > 1 ? ' (Block ' + (i + 1) + ' von ' + b.dauer.length + ')' : '') + (b.woche[i] && b.woche[i] !== 'jede' ? ' [' + b.woche[i] + ']' : '');
      G.ablage.push(Object.assign({ text: was + ' liegt in der Ablage', blockNr: i + 1 }, ziel(u)));
    });
    // einzelne Termine, deren Fachlehrkraft von Hand ersetzt wurde, ohne dass jemand anderes sie hält
    if (fachL.length) ps.forEach(p => { if (freiM.has(u.id + '|' + p.blockNr) && !blockFachLehrer(u, p.blockNr, freiM, handB).length) G.lehrkraft.push(Object.assign({ text: name(u) + ', ' + wann(p) + ' – ohne Fachlehrkraft (für diesen Termin herausgenommen, niemand eingesetzt)' }, ziel(u, p))); });
    // Raum nötig, aber keiner zugeteilt
    const raumNoetig = !!(u.raum || (!u.aufgabe && f && f.raumTyp));
    if (raumNoetig) ps.forEach(p => { if (!p.raum) G.raum.push(Object.assign({ text: name(u) + ', ' + wann(p) + ' – kein Raum' + (u.raum ? '' : ' (Typ „' + f.raumTyp + '“)') }, ziel(u, p))); });
    // anteilige Co-Lehrkräfte: in weniger Stunden dabei als vorgesehen
    const handCo = p => (handB.get(u.id + '|' + p.blockNr) || []).some(l => handB.co.has(u.id + '|' + p.blockNr + '|' + l)); // für diesen Termin von Hand als Co eingesetzt
    const wfP = p => (((u.rhythmus !== 'jede' ? u.rhythmus : (b && b.woche[p.blockNr - 1]) || 'jede') === 'jede') ? 1 : 0.5);
    let coTeilGemeldet = false;
    co.filter(z => z.modus === 'anteilig').forEach(z => {
      const soll = Math.min(z.stundenAnteil, stundenSchnitt(u, b));
      let ist = 0; ps.forEach(p => { if (p.co.includes(z.lehrer) || handCo(p)) ist += p.dauer * wfP(p); });
      if (ist < soll - 1e-9) {
        const ohne = ps.filter(p => !p.co.includes(z.lehrer) && !handCo(p) && !co.some(y => y.modus !== 'anteilig' || p.co.includes(y.lehrer)));
        G.coTeil.push(Object.assign({ text: name(u) + ' – Co-Lehrkraft ' + kz(z.lehrer) + ' nur in ' + zahlDe(ist, 1) + ' von ' + zahlDe(soll, 1) + ' UStd.' + (ohne.length ? '; ohne Co: ' + ohne.map(wann).join(', ') : '') }, ziel(u, ohne[0] || ps[0])));
        coTeilGemeldet = true;
      }
    });
    // Co-Bedarf des Kurses insgesamt: Mehrere Co-Lehrkräfte dürfen sich einen Kurs blockweise teilen (Mo/Di Co A, Do Co B).
    // Erfüllt ist der Bedarf, wenn jede geforderte Stunde EINE Co-Lehrkraft hat – nicht erst, wenn eine einzige Person alle Stunden übernimmt.
    if (!u.aufgabe && f && u.klassen.length && co.length && !coTeilGemeldet && !co.some(z => z.modus !== 'anteilig') && ps.length) {
      const cb = coBedarfVon(d, u, b, f);
      if (cb.std > 0) {
        const mitCo = p => co.some(z => p.co.includes(z.lehrer)) || handCo(p), psC = ps.filter(p => !bewusstOhneCo(u, p));
        const geplant = psC.reduce((a, p) => a + p.dauer * wfP(p), 0), soll = cb.alle ? geplant : Math.min(cb.std, geplant);
        const ist = psC.reduce((a, p) => a + (mitCo(p) ? p.dauer * wfP(p) : 0), 0);
        if (ist < soll - 1e-9) { const ohne = psC.filter(p => !mitCo(p)); G.coTeil.push(Object.assign({ text: name(u) + ' – nur ' + zahlDe(ist, 1) + ' von ' + zahlDe(soll, 1) + ' UStd. mit Co-Lehrkraft' + (ohne.length ? '; ohne Co: ' + ohne.map(wann).join(', ') : '') }, ziel(u, ohne[0] || ps[0]))); }
      }
    }
  });
  // Aufgaben: ungültige Termine und Termine, die mit anderen Einsätzen der Person zusammenfallen
  const pl = pausenListe(sch, d.klassen), tn = t => sch.tage[t] || '?';
  let idxB = null;
  d.unterrichte.forEach(u => {
    if (!u.aufgabe || !(u.termine || []).length) return;
    aufgabeTermine(d, u, pl, true).forEach(t => {
      const z = { seite: 'aufgaben', id: u.id };
      if (t.ungueltig) { G.aufgaben.push({ text: name(u) + ' – der ' + (t.i + 1) + '. Termin ist ungültig (die Pause gibt es nicht mehr oder die Uhrzeit fehlt)', ziel: z }); return; }
      idxB = idxB || belegungsIndex(d, { ohneAufsicht: true, ohneDienste: true, ohneGta: true });
      u.lehrkraefte.forEach(zz => {
        const x = ((idxB.get(zz.lehrer) || [])[t.tag] || []).find(b => b.art !== 'gesperrt' && !(b.termin && b.ref === u.id) && b.start < t.end && t.start < b.end);
        if (x) G.aufgaben.push({ text: name(u) + ', Termin ' + terminText(d, t) + ' – ' + belegungText(d, zz.lehrer, x), ziel: z });
      });
    });
  });
  // Aufsichten erst, wenn überhaupt geplant wurde (vor der ersten Berechnung wäre jeder Bedarf „offen“)
  if (d.dienste && (hatPlan || (d.dienste.plan || []).some(x => x.quelle === 'auto'))) (d.dienste.offen || []).forEach(o => {
    const be = o.bereich ? d.dienste.bereiche.find(b => b.id === o.bereich) : null;
    G.dienste.push({ text: tn(o.tag) + ' ' + o.beginn + '–' + o.ende + ' ' + (o.name || ((d.dienste.bedarfe.find(b => b.id === o.bedarf) || {}).name) || 'Aufsicht') + (be ? ' – ' + be.name : '') + (o.prio === 'min' ? ' (Mindestbedarf)' : o.prio === 'springer' ? ' (Springer)' : ' (Soll)') + (o.grund ? ': ' + o.grund : ''), hart: o.prio === 'min', ziel: { seite: 'aufsicht', tab: 'wochenplan', tag: o.tag } });
  });
  // Zeitprofile: Unterricht, der Klassen mit verschiedenen echten Zeiten verbindet
  if (sch.zeitprofile && sch.zeitprofile.length) zeitprofilKonflikte(d).forEach(k => G.zeitprofil.push({ text: k.text, ziel: k.ziel }));
  // Arbeitszeit: Wochenarbeitszeit, Höchstarbeitszeit je Tag, Unterrichtsdeputat
  // Pflichtgrenzen ohne GTAs: Eine GTA kommt „on top“ – passt sie nicht mehr, meldet das die GTA-Warnung (gelb), nicht der Plan
  arbeitszeiten(d, { mitTagen: hatPlan, ohneGta: true }).liste.forEach(x => {
    const z = { seite: 'arbeitszeit', id: x.lehrer };
    if (x.soll > 0 && x.diff > 3) G.arbeitszeit.push({ text: x.kuerzel + ': ' + zahlDe(x.summe / 60, 1) + ' h Arbeitszeit bei ' + zahlDe(x.soll / 60, 1) + ' h Wochenarbeitszeit (' + zahlDe(x.diff / 60, 1) + ' h darüber)', lehrer: x.lehrer, ziel: z });
    if (x.tag && x.tagMax > 0) x.tag.forEach((m, t) => { if (m > x.tagMax + 0.5) G.arbeitszeit.push({ text: x.kuerzel + ': ' + tn(t) + ' ' + zahlDe(m / 60, 1) + ' h Einsatz (höchstens ' + zahlDe(x.tagMax / 60, 1) + ' h je Tag)', lehrer: x.lehrer, tag: t, ziel: z }); });
    if (x.hatSollStd && x.istStd > x.sollStd + 0.49) G.arbeitszeit.push({ text: x.kuerzel + ': ' + zahlDe(x.istStd, 1) + ' Unterrichtsstunden bei einem Deputat von höchstens ' + zahlDe(x.sollStd, 1), lehrer: x.lehrer, ziel: z });
  });
  return [
    { art: 'ablage', titel: 'Nicht platziert (Ablage)', hinweis: 'Diese Blöcke haben keinen Platz im Plan gefunden. Im Editor aus der Ablage in den Plan ziehen oder neu berechnen.', eintraege: G.ablage },
    { art: 'lehrkraft', titel: 'Unterricht ohne Fachlehrkraft', hinweis: 'Diese Unterrichte haben keine Fachlehrkraft. Ihre Stunden werden für die Klasse eingeplant; die fachlichen Voraussetzungen, Deputate, Arbeitszeiten und Verfügbarkeiten prüfen oder – nur wenn zwingend – in der Unterrichtsversorgung eine feste Personalvorgabe setzen; einzelne Stunden lassen sich außerdem im Plan-Editor von Hand besetzen (Rechtsklick → „Lehrkraft ändern“ → „Nur diese Stunde besetzen“).', eintraege: G.lehrkraft },
    { art: 'raum', titel: 'Ohne Raum', hinweis: 'Für diese Stunden war kein passender Raum frei. Im Editor per Rechtsklick „Raum ändern …“ oder weitere Räume des Typs anlegen.', eintraege: G.raum },
    { art: 'co', titel: 'Co-Bedarf ohne Co-Lehrkraft', hinweis: 'Co-Fachzugehörigkeit, Klassenteam, Arbeitszeit und Verfügbarkeit prüfen. Automatische Co-Lehrkräfte werden ausschließlich während der Berechnung ergänzt; eine feste Co-Person nur als zwingende Vorgabe im Unterrichtsdialog eintragen.', eintraege: G.co },
    { art: 'coTeil', titel: 'Co-Lehrkraft fehlt in einzelnen Stunden', hinweis: 'Anteilige Co-Lehrkräfte waren nicht in allen vorgesehenen Stunden frei.', eintraege: G.coTeil },
    { art: 'aufgaben', titel: 'Aufgaben nicht erfüllt', hinweis: 'Aufgaben ohne Person, ohne Umfang oder mit einem Termin, der nicht passt. Nicht platzierte Aufgabenblöcke stehen oben unter „Nicht platziert“.', eintraege: G.aufgaben },
    { art: 'dienste', titel: 'Offene Aufsichten', hinweis: 'Staffelungsabschnitte ohne ausreichende Besetzung. In der Gesamtansicht eine Person zuordnen, abschnittsbezogene Ausschlüsse prüfen oder den Bedarf anpassen.', eintraege: G.dienste },
    { art: 'zeitprofil', titel: 'Zeitprofile passen nicht zusammen', hinweis: 'Gekoppelter oder klassenübergreifender Unterricht, dessen Klassen verschiedene echte Unterrichtszeiten haben.', eintraege: G.zeitprofil },
    { art: 'arbeitszeit', titel: 'Arbeitszeit und Deputat überschritten', hinweis: 'Personen über ihrer Wochenarbeitszeit, ihrer Höchstarbeitszeit je Tag oder ihrem Unterrichtsdeputat (z. B. durch von Hand eingetragene Stunden).', eintraege: G.arbeitszeit },
    { art: 'gta', titel: 'GTA nicht mehr möglich', hinweis: 'Eine geplante GTA passt nach einer Neuberechnung oder Änderung nicht mehr: Zeitkonflikt, Raum belegt oder Arbeitszeitüberschreitung. Im GTA-Planer verlegen.', eintraege: gtaWarnungen(d).map(w => ({ text: w.text, ziel: { seite: 'gta' } })) }
  ].filter(g => g.eintraege.length);
}

