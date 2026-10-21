/* =====================================================================
   2c. PLANSTAND – zentrale Auskünfte, die Oberfläche, Druck und Prüfung gemeinsam benutzen
       · ausschlussVerstoesse(d)   Einsätze, die gegen einen persönlichen Ausschluss verstoßen
       · planStatus(d)             Ampel grün / gelb / rot mit den Pflichtbedingungen des fertigen Plans
       · ressourcenFuerBlock(…)    verfügbare Lehrkräfte, Co-Lehrkräfte und Räume für einen Termin im Plan-Editor
       · offeneFuerSlot(…)         was in einen leeren Slot passen würde
   Grundsatz: Jede fachliche Auskunft wird genau einmal berechnet; alle Ansichten zeigen denselben Stand.
   ===================================================================== */

// ---------- Einsätze, die gegen einen Ausschluss der Person verstoßen ----------
function ausschlussVerstoesse(d) {
  const out = [], lI = new Map(d.lehrer.map(l => [l.id, l])), tn = t => d.schule.tage[t] || '?';
  ((d.dienste && d.dienste.plan) || []).forEach(x => {
    const l = lI.get(x.lehrer); if (!l) return;
    const g = dienstAusgeschlossen(d, l, x.typ, x.tag, minVon(x.beginn), minVon(x.ende), x.bereich || '');
    if (g) out.push({ lehrer: l.id, text: (l.kuerzel || l.name) + ': Aufsicht ' + tn(x.tag) + ' ' + x.beginn + '–' + x.ende + ' – ' + g, ziel: { seite: 'aufsicht', tab: 'wochenplan', tag: x.tag } });
  });
  return out;
}

// ---------- Aufsichten, die so nicht stattfinden können ----------
// Liefert [{ art: 'zeit' | 'aufsicht' | 'arbeitszeit', text }]:
//   zeit        = die Person ist zur selben Zeit im Unterricht, in einer Aufgabe oder in einem anderen Dienst (Doppelbelegung)
//   aufsicht    = die Person darf oder kann den Dienst nicht übernehmen (ausgenommen, abwesend, gesperrt, Qualifikation …)
//   arbeitszeit = der Dienst überschreitet eine Arbeitszeitgrenze
// Ausschlüsse meldet ausschlussVerstoesse(). Geprüft wird der tatsächliche Stand, nicht das Ergebnis der letzten Verteilung.
function einsatzKonflikte(d) {
  const out = [], lI = new Map(d.lehrer.map(l => [l.id, l])), tn = t => d.schule.tage[t] || '?';
  if (!d.plan.platzierungen.length) return out;
  const DI = d.dienste;
  if (DI && (DI.plan || []).length) {
    const ctx = dienstKontext(d), typ = new Map(DIENSTTYPEN.map(t => [t.id, t]));
    DI.plan.forEach(x => {
      const selten = x.rhythmus && (x.rhythmus.art === 'monatlich' || x.rhythmus.art === 'einzel'), l = lI.get(x.lehrer);
      const was = (l ? (l.kuerzel || l.name) : '?') + ': ' + ((typ.get(x.typ) || {}).name || 'Aufsicht') + ' ' + tn(x.tag) + ' ' + x.beginn + '–' + x.ende;
      dienstPruefen(d, x, ctx).hart.forEach(h => {
        if (h.code === 'D05' && /Ausschluss/.test(h.text)) return; // steht unter „Persönliche Ausschlüsse“
        if (h.code === 'D01' && selten) return; // gelegentliche Dienste (monatlich, einzelner Termin) sind nur ein Hinweis
        out.push({ art: h.code === 'D01' || h.code === 'D06' ? 'zeit' : h.code === 'D11' ? 'arbeitszeit' : 'aufsicht', text: was + ' – ' + h.text, dienst: x.id });
      });
    });
  }
  return out;
}

// ---------- Ampel: Prüfung des fertigen Plans ----------
// grün  = alle Pflichtbedingungen erfüllt, keine nennenswerten Hinweise
// gelb  = alle Pflichtbedingungen erfüllt, aber weiche Qualitätskriterien lassen sich verbessern (wichtige weiche Regeln verletzt oder offene Hinweise)
// rot   = mindestens eine Pflichtbedingung verletzt
// Liefert { ampel: 'leer'|'gruen'|'gelb'|'rot', pflicht: [{ id, titel, ok, anzahl, liste }], hinweise: [{ titel, anzahl, liste }], weich }
function planStatus(d, opt) {
  opt = opt || {};
  if (!d.plan.platzierungen.length) return { ampel: 'leer', pflicht: [], hinweise: [], weich: 0, hart: 0, regelHart: 0, verstoesse: [] };
  const mp = opt.M && opt.P ? opt : planAusDaten(d), M = mp.M, P = mp.P;
  const det = []; const tot = bewerteAlles(M, P, det);
  const istHart = r => M.hart[RI[r]] === 1;
  // Bezug eines Eintrags auf Blöcke des Plans („Unterricht|Block“) – für das Akzeptieren und das rote Ausrufezeichen im Editor
  const evBloecke = es => { const out = []; (es || []).forEach(e => { if (e === undefined || e < 0 || !M.E[e]) return; M.E[e].parts.forEach((p, pi) => out.push(M.U[p.u].id + '|' + P._blockNr(e, pi))); }); return [...new Set(out)]; };
  // Verstöße ohne Ereignisbezug (Doppelbelegung einer Person, Klasse oder eines Raums in einer Rasterstunde): Blöcke, die dort liegen
  const detEv = x => { if (x.e && x.e.length) return x.e; if (x.s === undefined || x.s === null) return []; const out = [];
    for (let e = 0; e < M.E.length; e++) { const s0 = P.start[e], ev = M.E[e]; if (s0 < 0 || x.s < s0 || x.s >= s0 + ev.dur) continue;
      if ((x.l && x.l.some(t => ev.lehrer.includes(t))) || (x.k && x.k.some(c => ev.klassen.includes(c))) || (x.raum !== undefined && ev.parts.some((p, pi) => P.raum[P.rOff[e] + pi] === x.raum))) out.push(e); }
    return out; };
  const regel = ids => det.filter(x => ids.includes(x.r) && istHart(x.r)).map(x => ({ text: x.text, key: x.r + '|' + x.text, bloecke: evBloecke(detEv(x)) }));
  const plBloecke = (uid, tag, stunde) => d.plan.platzierungen.filter(p => p.unterricht === uid && (tag === null || tag === undefined || stunde === null || stunde === undefined || (p.tag === tag && p.stunde === stunde))).map(p => p.unterricht + '|' + p.blockNr);
  const mitBezug = x => x.unterricht ? { text: x.text, bloecke: plBloecke(x.unterricht, x.tag, x.stunde) } : x.text;
  const kN = new Map(d.klassen.map(k => [k.id, k.name])), fN = new Map(d.faecher.map(f => [f.id, f.kuerzel || f.name])), lI = new Map(d.lehrer.map(l => [l.id, l]));
  const G = new Map((opt.offen || offenePunkte(d)).map(g => [g.art, g.eintraege]));
  const g = art => (G.get(art) || []);
  // Akzeptierte harte Fehler (Button „Akzeptieren“ mit Warnung): Sie zählen nicht mehr als harter Fehler, bleiben aber sichtbar (gelb)
  const akzSet = new Set(_arr(d.akzeptiert).map(a => a.schluessel)), akzeptiert = [];
  const pflicht = [], P_ = (id, titel, liste) => {
    const items = liste.map(x => typeof x === 'string' ? { text: x, key: id + '|' + x } : Object.assign({}, x, { key: x.key || id + '|' + x.text }));
    const offen = items.filter(i => !akzSet.has(i.key)), akz = items.filter(i => akzSet.has(i.key));
    akz.forEach(i => akzeptiert.push(Object.assign({ kat: id, katTitel: titel }, i)));
    pflicht.push({ id, titel, ok: !offen.length, anzahl: offen.length, liste: offen.slice(0, 12).map(i => i.text), eintraege: offen.slice(0, 12), akzeptiert: akz });
  };
  // 1 Schüler-Wochenstunden
  const abglAlle = stundenAbgleich(d, { plan: true }), abgl = abglAlle.filter(x => x.art !== 'ohneTafel'), aufgabenIds = new Set(d.unterrichte.filter(u => u.aufgabe).map(u => u.id));
  const einsatz = einsatzKonflikte(d), E_ = art => einsatz.filter(x => x.art === art).map(x => x.dienst ? { text: x.text, dienste: [x.dienst] } : x.text);
  P_('stunden', 'Jeder Schüler erhält seine Wochenstunden (Stundentafel = Unterrichtsverteilung = Plan)', abglAlle.filter(x => x.art === 'ohneTafel').map(x => 'Klasse ' + (kN.get(x.klasse) || '?') + ' hat keine Stundentafel, aber ' + zahlDe(x.verteilung, 1) + ' UStd. je Woche in der Unterrichtsverteilung').concat(abgl.map(x => 'Klasse ' + (kN.get(x.klasse) || '?') + ', ' + (fN.get(x.fach) || '?') + ': Stundentafel ' + zahlDe(x.tafel, 1) + ', Unterrichtsverteilung ' + zahlDe(x.verteilung, 1) + (x.plan !== null ? ', Plan ' + zahlDe(x.plan, 1) : '') + (x.art === 'gruppen' ? ' – die Halbgruppen bekommen verschieden viele Stunden' : '')))
    // nicht platzierte Blöcke: Unterricht steht bei einer Abweichung schon im Abgleich oben (Plan ≠ Stundentafel); Aufgabenblöcke zählen immer
    .concat(g('ablage').filter(x => !abgl.length || aufgabenIds.has(x.unterricht)).map(x => ({ text: x.text, bloecke: x.unterricht && x.blockNr ? [x.unterricht + '|' + x.blockNr] : [] }))));
  // 2 Fachlehrkräfte: vorhanden und fachlich geeignet
  const ungeeignet = [];
  d.unterrichte.forEach(u => { if (u.aufgabe || !u.fach) return; u.lehrkraefte.forEach(z => { const l = lI.get(z.lehrer); if (z.rolle === 'fach' && l && !fachBefaehigt(l, u.fach)) ungeeignet.push((fN.get(u.fach) || '?') + ' ' + u.klassen.map(k => kN.get(k) || '?').join('/') + ': ' + (l.kuerzel || l.name) + ' unterrichtet ohne eingetragene Fachbefähigung'); }); });
  // … auch wer nur für eine einzelne Stunde von Hand eingesetzt ist („nur dieser Termin“), braucht als Fachlehrkraft die Fachbefähigung
  { const uM = new Map(d.unterrichte.map(u => [u.id, u]));
    (d.plan.besetzung || []).forEach(b => { if (b.rolle === 'co') return; const u = uM.get(b.unterricht), l = lI.get(b.lehrer); if (u && l && !u.aufgabe && u.fach && !fachBefaehigt(l, u.fach)) ungeeignet.push((fN.get(u.fach) || '?') + ' ' + u.klassen.map(k => kN.get(k) || '?').join('/') + ' (Block ' + b.blockNr + '): ' + (l.kuerzel || l.name) + ' ist für diese Stunde eingesetzt, hat aber keine Fachbefähigung'); }); }
  P_('lehrkraft', 'Jeder Unterricht hat eine fachlich geeignete Lehrkraft', g('lehrkraft').map(mitBezug).concat(ungeeignet));
  // 3 Parallelbänder
  // … und keine Lehrkraft unterrichtet beide Hälften eines Bandes (sie müsste zur selben Zeit in beiden Gruppen stehen)
  const bandDoppelt = [];
  { const uM = new Map(d.unterrichte.map(u => [u.id, u])), wer = u => u ? u.lehrkraefte.filter(z => z.lehrer && z.modus !== 'anteilig').map(z => z.lehrer) : [];
    M.baender.forEach(b => b.paare.forEach(p => { const a = wer(uM.get(p[0])), c = wer(uM.get(p[1])); a.filter(x => c.includes(x)).forEach(x => bandDoppelt.push('Klasse ' + (kN.get(b.klasse) || '?') + ' ' + b.faecher.map(f => fN.get(f) || '?').join('/') + ': ' + ((lI.get(x) || {}).kuerzel || '?') + ' ist in beiden Fächern des Bandes eingetragen – beide Gruppen haben zur selben Zeit Unterricht')); })); }
  P_('band', 'Parallelbänder sind vollständig und liegen zeitgleich', M.baender.filter(b => b.fehler).map(b => 'Klasse ' + (kN.get(b.klasse) || '?') + ' ' + b.faecher.map(f => fN.get(f) || '?').join('/') + ': ' + b.fehler).concat([...new Set(bandDoppelt)], regel(['H08'])));
  // 4 Blockzwang
  P_('block', 'Blockzwänge (Doppelstunden) sind eingehalten', regel(['H07']).concat(M.fehler.filter(x => /Doppelstunden|Blockaufteilung|2-Stunden-Blöcken/.test(x.text)).map(x => x.text)));
  // 5 Pflicht-Co
  P_('co', 'Alle Stunden mit Co-Bedarf haben eine Co-Lehrkraft', g('co').map(x => x.unterricht ? { text: x.text, bloecke: plBloecke(x.unterricht) } : x.text).concat(g('coTeil').map(mitBezug)));
  // 6 Doppelbelegungen
  P_('doppelt', 'Keine Doppelbelegung von Personen, Klassen und Räumen (Unterricht, Co-Unterricht, Aufgaben, Aufsichten, Springer – in echten Uhrzeiten)', regel(['H01', 'H02', 'H03']).concat(E_('zeit')));
  // 7 Mindestbesetzung der Aufsichten und Springer – gezählt aus dem tatsächlichen Aufsichtsplan (nicht aus einer gespeicherten Liste)
  const aufsichtOffen = [], springerOffen = [];
  if (d.dienste) {
    const DI = d.dienste, Dn = d.schule.tage.length, tnA = t => d.schule.tage[t] || '?';
    const grundVon = b => { const o = (DI.offen || []).find(x => x.bedarf === b.id && (x.prio === 'min' || x.prio === 'springer') && x.grund); return o ? ' – ' + o.grund : ''; };
    (DI.bedarfe || []).forEach(b => {
      if (b.tag >= Dn) return;
      const be = b.bereich ? (DI.bereiche || []).find(x => x.id === b.bereich) : null, was = (b.name || (DIENSTTYPEN.find(t => t.id === b.typ) || {}).name || 'Aufsicht') + (be ? ' – ' + be.name : '');
      // genaue Zeitfenster, in denen Personen fehlen (Mindestbedarf minus zulässige Einsätze) – z. B. nur 09:30–10:00 einer Pause 09:30–10:30.
      // Springer sind Reserve: Fehlen sie, ist das ein Hinweis (gelb) und kein harter Fehler.
      let kurve = null;
      const ziel = istSpringerBedarf(b) ? springerOffen : aufsichtOffen;
      besetzungBedarf(d, b).forEach(a => {
        if (a.ungueltig) { ziel.push(tnA(b.tag) + ' ' + was + ': Abschnitt ' + (a.beginn || '?') + '–' + (a.ende || '?') + ' hat keine gültige Zeit'); return; }
        if (!(a.fehltMin > 0)) return;
        const av = intervall(a.beginn, a.ende);
        kurve = kurve || bedarfsKurve(b.abschnitte.filter(q => { const iv = intervall(q.beginn, q.ende); return iv && iv.end > iv.start; }), 'min', dienstDeckung(d, b));
        const fenster = [];
        kurve.forEach((pkt, i) => { if (pkt.n > 0 && i + 1 < kurve.length) { const von = Math.max(pkt.t, av.start), bis = Math.min(kurve[i + 1].t, av.end); if (bis > von) fenster.push({ von, bis, n: pkt.n }); } });
        const schl = von => 'aufsicht|' + b.id + '|' + von;
        if (fenster.length) fenster.forEach(x => ziel.push({ text: tnA(b.tag) + ' ' + zeitText(x.von) + '–' + zeitText(x.bis) + ' ' + was + ': ' + (x.n === 1 ? '1 Person fehlt' : x.n + ' Personen fehlen') + ' (Mindestbedarf ' + a.min + ')' + grundVon(b), key: schl(zeitText(x.von) + '-' + zeitText(x.bis)), aufsicht: { bedarf: b.id, tag: b.tag, beginn: zeitText(x.von), ende: zeitText(x.bis) } }));
        else ziel.push({ text: tnA(b.tag) + ' ' + a.beginn + '–' + a.ende + ' ' + was + ': ' + a.ist + ' von mindestens ' + a.min + (a.min === 1 ? ' Person' : ' Personen') + grundVon(b), key: schl(a.beginn + '-' + a.ende), aufsicht: { bedarf: b.id, tag: b.tag, beginn: a.beginn, ende: a.ende } });
      });
    });
  }
  P_('aufsicht', 'Mindestbedarf an Aufsichten ist besetzt, alle Einsätze sind zulässig', aufsichtOffen.concat(E_('aufsicht')));
  // 8 persönliche Ausschlüsse
  P_('ausschluss', 'Persönliche Ausschlüsse sind eingehalten', ausschlussVerstoesse(d).map(x => x.text));
  // 9 Arbeitszeitgrenzen (Springer zählen nicht) – gerechnet ausschließlich aus dem endgültigen Fachunterricht, Co-Unterricht, den Aufgaben und Aufsichten
  P_('arbeitszeit', 'Arbeitszeitgrenzen sind eingehalten (Springer zählen nicht mit)', regel(['H16']).concat(g('arbeitszeit').filter(x => !/Deputat/.test(x.text)).map(x => x.text), E_('arbeitszeit')));
  // 10 manuelle Fixierungen: fixierte Unterrichtsstunden (H09) und von Hand gesetzte/fixierte Aufsichten, die die letzte Aufsichtsplanung
  //    nicht halten konnte, weil sie sich mit Unterricht oder Co-Unterricht überschneiden (Unterricht hat Vorrang)
  P_('fix', 'Manuelle Fixierungen sind eingehalten', regel(['H09']).concat(((d.dienste && d.dienste.verdraengt) || []).map(x => { const l = lI.get(x.lehrer); return 'Aufsicht ' + (d.schule.tage[x.tag] || '?') + ' ' + x.beginn + '–' + x.ende + (x.name ? ' ' + x.name : '') + ' (' + (l ? (l.kuerzel || l.name) : '?') + (x.fixiert ? ', fixiert' : ', von Hand') + ') wurde nicht übernommen: ' + (x.grund || 'Überschneidung mit Unterricht') + ' Die Aufsicht wurde neu besetzt.'; })));
  // 11 übrige harte Regeln
  P_('regeln', 'Alle übrigen harten Regeln sind erfüllt (Sperrzeiten, Räume, Korridor, Freistunden …)', regel(['H05', 'H06', 'H10', 'H11', 'H12', 'H13', 'H14', 'H15']).concat(g('aufgaben').map(x => x.text), M.fehler.filter(x => !/Doppelstunden|Blockaufteilung|2-Stunden-Blöcken/.test(x.text)).map(x => x.text)));
  // Hinweise (gelb)
  const hinweise = [], H_ = (titel, liste) => { if (liste.length) hinweise.push({ titel, anzahl: liste.length, liste: liste.slice(0, 8) }); };
  const wichtig = M.weichIdx.filter(r => M.gew[r] >= 8 && tot[r] > 1e-9);
  H_('Wichtige weiche Regeln (Gewicht 8–10) sind verletzt', wichtig.map(r => regelZitat(REGELN[r].id) + ': ' + zahlDe(Math.round(tot[r] * 10) / 10, 1) + '×'));
  H_('Halbgruppen ohne Parallelpartner liegen nicht nebeneinander', tot[RI.W17] > 1e-9 && M.gew[RI.W17] < 8 ? det.filter(x => x.r === 'W17').map(x => x.text) : []);
  H_('Springer (Reserve) nicht besetzt – kein harter Fehler', springerOffen.map(x => typeof x === 'string' ? x : x.text));
  H_('GTA nicht mehr möglich', g('gta').map(x => x.text));
  H_('Soll-Besetzung der Aufsichten nicht erreicht', g('dienste').filter(x => !x.hart && !/\(Springer\)/.test(x.text)).map(x => x.text));
  H_('Ohne Raum', g('raum').map(x => x.text));
  H_('Unterrichtsdeputat überschritten', g('arbeitszeit').filter(x => /Deputat/.test(x.text)).map(x => x.text));
  H_('Zeitprofile passen nicht zusammen', g('zeitprofil').map(x => x.text));
  let weich = 0; for (const r of M.weichIdx) weich += M.gew[r] * tot[r];
  const rot = pflicht.some(x => !x.ok);
  // hart: Zahl der verletzten Einzelpunkte über alle Pflichtbedingungen – die einzige Zahl „harte Fehler“ des Gesamtplans (Endvalidierung).
  // regelHart: Verstöße gegen die harten Stundenplan-Regeln H01–H16 (Teilmenge davon, für die Regelübersicht).
  return { ampel: rot ? 'rot' : hinweise.length || akzeptiert.length ? 'gelb' : 'gruen', pflicht, hinweise, weich, hart: pflicht.reduce((a, x) => a + x.anzahl, 0), akzeptiert, regelHart: kostenVon(M, tot).hart, verstoesse: Array.from(tot) };
}


/* ---------------------------------------------------------------------------------------------------------------------
   RESSOURCEN FÜR EINEN TERMIN (Plan-Editor): Welche Lehrkräfte, Co-Lehrkräfte und Räume stehen für genau diesen Block
   tatsächlich zur Verfügung – und warum die anderen nicht? Es gelten dieselben Bausteine wie bei Berechnung und Ziehen:
     · Fachbefähigung            fachBefaehigt / coBefaehigt
     · Sperrzeiten, Termine      M.lVerf (H05)
     · zeitliche Belegung        belegungsIndex – Unterricht, Co, Aufgaben, Termine, Aufsichten, Springer, Aufsichten, in ECHTEN
                                 Uhrzeiten (Zeitprofile), über den GANZEN Block und getrennt nach Woche A/B
     · Arbeitszeit               arbeitszeiten() mit der Formel von H16 (Blockminuten × Wochenanteil × Vorbereitung); Springer zählen nicht
     · Stunden je Tag            wie H12 · Deputat wie in der Prüfung
     · Räume                     Raumtyp, Kapazität, fester Raum (H06), Belegung und Sperrzeiten (H03/H05), auch in echter Uhrzeit
   Status je Eintrag: 'ok' (✓ verfügbar) · 'warn' (⚠ möglich, aber mit Nachteilen) · 'nein' (✕ nicht verfügbar, mit Begründung).
   opt: { slot (für nicht platzierte Blöcke: gedachter Startslot), belIdx, az }
   --------------------------------------------------------------------------------------------------------------------- */
function ressourcenFuerBlock(daten, M, P, e, opt) {
  opt = opt || {};
  const ev = M.E[e], S = M.S, H = M.H, T = daten.lehrer.length, R = daten.raeume.length;
  const s = opt.slot !== undefined && opt.slot !== null && opt.slot >= 0 ? opt.slot : P.start[e];
  const wochen = ev.wochen.map(w => 'AB'[w]);
  const out = { e, s, platziert: P.start[e] >= 0, name: evName(M, e), dauer: ev.dur, wochen, wochenText: ev.wochen.length === 2 ? 'jede Woche' : 'nur Woche ' + wochen[0], tag: -1, start: null, end: null, zeit: '', teile: [], band: null };
  if (s < 0 || ev.aufgabe) return out;
  const d = Math.floor(s / H), h = s % H, tab = M.zeitTab[ev.zg];
  const start = tab.s[h], end = h + ev.dur - 1 < H ? tab.e[h + ev.dur - 1] : -1;
  out.tag = d; out.start = start; out.end = end; out.zeit = start >= 0 && end >= 0 ? zeitText(start) + '–' + zeitText(end) : '';
  const idx = opt.belIdx || belegungsIndex(daten);
  const azM = new Map((opt.az || arbeitszeiten(daten, { mitTagen: true }).liste).map(x => [x.lehrer, x]));
  const am = daten.schule.arbeitszeitModell || ARBEITSZEIT_STD;
  const h16 = M.hart[RI.H16] === 1, h12 = M.hart[RI.H12] === 1;
  const min = ev.minAt ? ev.minAt[h] : ev.dur * M.stdMin;
  const eigene = new Set(ev.parts.map(pt => M.U[pt.u].id + '|' + (pt.b + 1))); // die Blöcke dieses Termins selbst
  const belegt = (lid, tag, a, b, wo, ohneEigene) => ((idx.get(lid) || [])[tag] || []).filter(x => x.art !== 'gesperrt' && x.start < b && a < x.end && x.wochen.some(w => wo.includes(w)) && !(ohneEigene && x.ref && eigene.has(x.ref + '|' + x.block)));
  const grundText = x => {
    const wo = x.wochen && x.wochen.length === 1 ? ' (Woche ' + x.wochen[0] + ')' : '', zeit = ' ' + zeitText(x.start) + '–' + zeitText(x.end);
    if (x.art === 'unterricht') return 'unterrichtet gleichzeitig ' + x.text + zeit + wo;
    if (x.art === 'co') return 'ist gleichzeitig Co-Lehrkraft in ' + x.text.replace(' (Co)', '') + zeit + wo;
    if (x.art === 'aufgabe') return (x.termin ? 'hat gleichzeitig einen Termin: ' : 'hat gleichzeitig die Aufgabe ') + '„' + x.text + '“' + zeit;
    if (x.art === 'dienst' && x.springer) return 'gleichzeitig Springerdienst' + zeit + ' (zeitlich nicht verfügbar)';
    return 'hat gleichzeitig ' + x.text + zeit + wo;
  };
  // Freistunden der Person an diesem Tag – heute und mit diesem Block
  const freistunden = (t, mit) => {
    let schlecht = 0;
    for (const w of ev.wochen) {
      let a = -1, z = -1, n = 0;
      for (let hh = 0; hh < H; hh++) { if (M.pause[hh]) continue; const bel = P.occ[(t * 2 + w) * S + d * H + hh] > 0 || (mit && hh >= h && hh < h + ev.dur); if (bel) { n++; if (a < 0) a = hh; z = hh; } }
      let pausen = 0; for (let hh = a + 1; hh < z; hh++) if (M.pause[hh]) pausen++;
      if (n) schlecht = Math.max(schlecht, z - a + 1 - pausen - n);
    }
    return schlecht;
  };
  // Stand der Person nach der Formel von H16 (Woche: Minuten × Wochenanteil + Vorbereitung je Stunde + feste Zeiten; Tag: Einsatzminuten)
  const h16Stand = t => {
    let woche = M.lWocheFix[t], a = 0, b = 0;
    for (const x of M.lEv[t]) { const s0 = P.start[x]; if (s0 < 0 || !istAktiv(M, P, x, t)) continue; const xv = M.E[x], m = xv.minAt[s0 % H]; woche += m * (xv.azF.get(t) || xv.wf) + (xv.azV.get(t) || 0); if (Math.floor(s0 / H) === d) { if (xv.wochen.includes(0)) a += m; if (xv.wochen.includes(1)) b += m; } }
    return { woche, tag: Math.max(a, b) + M.lTagFix[t * M.D + d] };
  };
  // Wer den Termin abgibt, darf dadurch nicht unter seine Mindeststundenzahl am Tag fallen (H12)
  const abgabeFolge = alt => {
    const out = [];
    alt.forEach(a => { if (!(M.lMin[a] > 0) || !ev.lehrer.includes(a)) return; bauL(M, P, a); const rest = P.L.nu[d] - ev.dur; if (rest > 0 && rest < M.lMin[a]) out.push(M.lKz[a] + ' hätte dann an diesem Tag nur noch ' + rest + ' UStd. (mindestens ' + M.lMin[a] + ' UStd. je Tag)'); });
    return out;
  };
  const pruefe = (t, part, rolle, aktuell, abgabe) => {
    const l = daten.lehrer[t], u = daten.unterrichte[part.u], gruende = [], folgen = [];
    if (rolle === 'fach' ? !fachBefaehigt(l, u.fach) : !coBefaehigt(l, u.fach)) gruende.push(rolle === 'fach' ? 'Fach nicht vorhanden' : 'Fach nicht als Co eingetragen');
    if (!aktuell && (ev.immer.includes(t) || ev.co.some((z, j) => z.t === t && P.co[P.cOff[e] + j]))) gruende.push('ist in diesem Termin bereits eingesetzt');
    let ungern = false, zu = false, termin = false;
    for (let k = 0; k < ev.dur && s + k < S; k++) { const v = M.lVerf[t * S + s + k]; if (v === 0) { zu = true; if (M.lTermin && M.lTermin[t * S + s + k]) termin = true; } else if (v === -1) ungern = true; }
    if (zu && !termin) gruende.push('zu diesem Zeitpunkt gesperrt (Verfügbarkeit)');
    if (start >= 0 && end >= 0) belegt(l.id, d, start, end, wochen, true).forEach(x => {
      if (x.selten) folgen.push(grundText(x) + ' – nur gelegentlich');
      else if (x.art === 'dienst' && x.fest === false) folgen.push(grundText(x).replace(' (zeitlich nicht verfügbar)', '') + ' – automatisch verteilt, wird nach der Änderung neu vergeben');
      else gruende.push(grundText(x));
    });
    else if (zu && termin) gruende.push('hat zu dieser Zeit einen festen Termin');
    if (!aktuell) {
      const az = azM.get(l.id), vorbMin = u.aufgabe || u.vorbereitung === false ? 0 : (rolle === 'co' ? am.vorbCo : am.vorbLehrkraft) * ev.dur;
      // Arbeitszeitgrenzen genau wie H16: Unterricht, Vorbereitung, Aufgaben und FEST eingetragene Dienste. Automatisch verteilte Aufsichten und
      // Aufsichten richten sich nach dem Stundenplan (sie werden neu vergeben) – reicht die Zeit nur ohne sie, ist das ein Nachteil (⚠), kein Hindernis.
      const stand = h16Stand(t), zus = ev.wf * (min + vorbMin), hh = m => zahlDe(Math.round(m / 6) / 10, 1);
      if (M.lWocheMax[t] && stand.woche + zus > M.lWocheMax[t] + 3) (h16 ? gruende : folgen).push('Wochenarbeitszeit ausgeschöpft (' + hh(stand.woche) + ' von ' + hh(M.lWocheMax[t]) + ' h)');
      else if (az && az.soll > 0 && az.summe + zus > az.soll + 3) folgen.push('mit den automatisch verteilten Aufsichten über der Wochenarbeitszeit (' + hh(az.summe) + ' von ' + hh(az.soll) + ' h) – diese werden neu verteilt');
      if (M.lTagMax[t] && stand.tag + min > M.lTagMax[t] + 0.5) (h16 ? gruende : folgen).push('maximale Tagesarbeitszeit erreicht (' + hh(stand.tag) + ' von ' + hh(M.lTagMax[t]) + ' h)');
      else if (az && az.tagMax > 0 && az.tag && az.tag[d] + min > az.tagMax + 0.5) folgen.push('mit Aufsichten über der Höchstarbeitszeit an diesem Tag');
      if (az && az.hatSollStd && az.istStd + ev.dur * ev.wf > az.sollStd + 0.49) gruende.push('Unterrichtsdeputat ausgeschöpft (' + zahlDe(az.istStd, 1) + ' von ' + zahlDe(az.sollStd, 1) + ' UStd.)');
      bauL(M, P, t);
      let neuStd = P.L.nu[d]; for (let k = 0; k < ev.dur && s + k < S; k++) if (!M.pause[(s + k) % H] && !(P.L.unt[s + k] > 0)) neuStd++;
      if (M.lMax[t] > 0 && neuStd > M.lMax[t]) (h12 ? gruende : folgen).push('höchstens ' + M.lMax[t] + ' Unterrichtsstunden am Tag');
      else if (M.lMin[t] > 0 && neuStd < M.lMin[t]) (h12 ? gruende : folgen).push('hätte an diesem Tag nur ' + neuStd + ' UStd. (mindestens ' + M.lMin[t] + ' UStd. je Tag)');
      const fs = freistunden(t, true) - freistunden(t, false);
      if (fs > 0) folgen.push(fs === 1 ? 'eine zusätzliche Freistunde' : fs + ' zusätzliche Freistunden');
      (abgabe || []).forEach(x => (h12 ? gruende : folgen).push(x));
    }
    if (ungern) folgen.push('ungern-Zeit laut Verfügbarkeit');
    const rang = M.stufeVon(t, e);
    if (rang === 3 && folgen.length && !aktuell) folgen.push('außerhalb des Klassenteams');
    // alle Blöcke des Unterrichts frei? (für „in allen Stunden einsetzen“)
    let alle = !gruende.length;
    if (alle) for (const e2 of M.uEv[part.u]) {
      if (e2 === e) continue; const s2 = P.start[e2]; if (s2 < 0) continue;
      const v2 = M.E[e2], d2 = Math.floor(s2 / H), h2 = s2 % H, t2 = M.zeitTab[v2.zg], a2 = t2.s[h2], b2 = t2.e[h2 + v2.dur - 1];
      const eig2 = new Set(v2.parts.map(pt => M.U[pt.u].id + '|' + (pt.b + 1)));
      for (let k = 0; k < v2.dur; k++) if (M.lVerf[t * S + s2 + k] === 0) alle = false;
      if (alle && a2 >= 0 && b2 >= 0 && ((idx.get(l.id) || [])[d2] || []).some(x => x.art !== 'gesperrt' && !x.selten && x.start < b2 && a2 < x.end && x.wochen.some(w => v2.wochen.map(q => 'AB'[q]).includes(w)) && !(x.ref && eig2.has(x.ref + '|' + x.block)))) alle = false;
      if (!alle) break;
    }
    return { t, id: l.id, kuerzel: l.kuerzel || l.name || '?', name: l.name || '', st: gruende.length ? 'nein' : folgen.length ? 'warn' : 'ok', gruende, folgen, rang, rangText: ['', 'Klassenleitung', 'Klassenteam', rolle === 'co' ? 'weitere Co-Lehrkraft' : 'weitere Fachlehrkraft'][rang], aktuell: !!aktuell, alle, coKraft: l.ausgebildet === false, ohneFach: gruende.length && /^Fach nicht/.test(gruende[0]) ? 1 : 0 };
  };
  const ordnung = { ok: 0, warn: 1, nein: 2 };
  // Reihenfolge: eingesetzt · verfügbar · mit Nachteilen · nicht verfügbar (dort zuerst, wer das Fach hat); jeweils Klassenleitung, Klassenteam, übrige
  const sortiere = liste => liste.sort((a, b) => (b.aktuell - a.aktuell) || (ordnung[a.st] - ordnung[b.st]) || (a.ohneFach - b.ohneFach) || (a.rang - b.rang) || String(a.kuerzel).localeCompare(String(b.kuerzel), 'de'));
  // Räume in echter Uhrzeit: Nutzer mit anderem Zeitprofil, deren Uhrzeit sich überschneidet
  const raumBeleger = r => {
    const wer = [];
    for (const x of M.rNutzer[r]) {
      if (x === e) continue; const sx = P.start[x]; if (sx < 0 || Math.floor(sx / H) !== d) continue;
      const vx = M.E[x]; let drin = false; for (let q = 0; q < vx.parts.length; q++) if (P.raum[P.rOff[x] + q] === r) drin = true;
      if (!drin || !vx.wochen.some(w => ev.wochen.includes(w))) continue;
      const raster = sx < s + ev.dur && s < sx + vx.dur;
      const tx = M.zeitTab[vx.zg], ax = tx.s[sx % H], bx = tx.e[sx % H + vx.dur - 1];
      const echt = start >= 0 && end >= 0 && ax >= 0 && bx >= 0 && ax < end && start < bx;
      if (raster || (echt && vx.zg !== ev.zg)) wer.push({ x, name: evName(M, x).replace(/ \(Block \d+\)/, ''), nurZeit: !raster });
    }
    return wer;
  };
  ev.parts.forEach((part, p) => {
    const U = M.U[part.u], u = daten.unterrichte[part.u];
    const teil = { p, unterricht: U.id, name: U.name + (u.gruppen.length ? ' (' + u.gruppen.map(g => { for (const k of daten.klassen) { const x = k.gruppen.find(y => y.id === g); if (x) return x.name; } return '?'; }).join(', ') + ')' : ''), fach: u.fach, lehrer: [], co: [], raeume: [], braucht: { co: false, raum: part.cands !== null } };
    const handF = (ev.hand || []).filter(x => x.p === p && !x.co).map(x => x.t), handC = (ev.hand || []).filter(x => x.p === p && x.co).map(x => x.t);
    const aktFach = new Set(U.immer.filter(t => U.rolle.get(t) === 'fach' && ev.immer.includes(t)).concat(handF));
    const aktCo = new Set(U.immer.filter(t => U.rolle.get(t) === 'co' && ev.immer.includes(t)).concat(handC));
    ev.co.forEach((z, j) => { if (z.p === p && P.co[P.cOff[e] + j]) aktCo.add(z.t); });
    const cb = coBedarfVon(daten, u);
    teil.ohne = (ev.ohne || []).filter(o => U.lehrer.includes(o.t)).map(o => ({ t: o.t, kuerzel: M.lKz[o.t], grund: o.grund || '' }));
    teil.braucht.co = cb.std > 0 || aktCo.size > 0 || u.lehrkraefte.some(z => z.rolle === 'co');
    const abF = abgabeFolge([...aktFach]), abC = abgabeFolge([...aktCo]);
    for (let t = 0; t < T; t++) {
      const l = daten.lehrer[t]; if (l.art === 'personal') continue;
      if (aktCo.has(t)) teil.co.push(pruefe(t, part, 'co', true));
      else if (aktFach.has(t)) teil.lehrer.push(pruefe(t, part, 'fach', true));
      else {
        if (l.ausgebildet !== false) teil.lehrer.push(pruefe(t, part, 'fach', false, abF));
        teil.co.push(pruefe(t, part, 'co', false, abC));
      }
    }
    sortiere(teil.lehrer); sortiere(teil.co);
    if (part.cands !== null) for (let r = 0; r < R; r++) {
      const akt = P.raum[P.rOff[e] + p] === r, gruende = [], folgen = [];
      if (part.raumFix >= 0 && r !== part.raumFix) gruende.push('fester Raum vorgegeben (' + M.rName[part.raumFix] + ')');
      else if (part.raumFix < 0 && M.rTyp[r] !== part.typ) gruende.push('Raumtyp passt nicht (' + (M.rTyp[r] || '–') + ' statt ' + (part.typ || '–') + ')');
      else if (M.rKap[r] < part.schueler) gruende.push('Kapazität zu klein (' + M.rKap[r] + ' Plätze, ' + part.schueler + ' Schüler)');
      let zu = false; for (let k = 0; k < ev.dur && s + k < S; k++) if (M.rVerf[r * S + s + k] === 0) zu = true;
      if (zu) gruende.push('Raum zu dieser Zeit gesperrt');
      const wer = raumBeleger(r);
      if (wer.length >= M.rTeil[r]) gruende.push('bereits belegt: ' + wer.slice(0, 3).map(x => x.name + (x.nurZeit ? ' (Uhrzeiten überschneiden sich)' : '')).join(', '));
      else if (wer.length) folgen.push('teilbarer Raum, zeitgleich genutzt von ' + wer.map(x => x.name).join(', '));
      if (!gruende.length && !(part.cands || []).includes(r)) folgen.push(M.rHeimK[r] >= 0 ? 'Klassenraum der ' + M.kName[M.rHeimK[r]] : 'nicht der Klassenraum der Klasse');
      teil.raeume.push({ r, id: daten.raeume[r].id, name: M.rName[r], st: gruende.length ? 'nein' : folgen.length ? 'warn' : 'ok', gruende, folgen, aktuell: akt, typ: M.rTyp[r], plaetze: M.rKap[r] });
    }
    teil.raeume.sort((a, b) => (b.aktuell - a.aktuell) || (ordnung[a.st] - ordnung[b.st]) || String(a.name).localeCompare(String(b.name), 'de', { numeric: true }));
    // Ist dieser Teil an dem Termin vollständig planbar? (besetzt und ohne Hinderungsgrund – oder es gibt jemanden bzw. einen Raum)
    const aktL = teil.lehrer.filter(x => x.aktuell), aktR = teil.raeume.filter(x => x.aktuell);
    teil.lehrerOk = aktL.length ? aktL.every(x => x.st !== 'nein') : teil.lehrer.some(x => x.st !== 'nein');
    teil.raumOk = part.cands === null || (aktR.length ? aktR.every(x => x.st !== 'nein') : teil.raeume.some(x => x.st !== 'nein'));
    teil.lehrerText = aktL.length ? aktL.map(x => x.kuerzel).join(', ') + (teil.lehrerOk ? '' : ' – ' + aktL.find(x => x.st === 'nein').gruende[0]) : (teil.lehrerOk ? 'noch niemand eingetragen – ' + teil.lehrer.filter(x => x.st !== 'nein').length + ' verfügbar' : 'keine geeignete Lehrkraft verfügbar');
    teil.raumText = part.cands === null ? 'kein Raum nötig' : aktR.length ? aktR[0].name + (teil.raumOk ? '' : ' – ' + aktR[0].gruende[0]) : (teil.raumOk ? 'noch kein Raum – ' + teil.raeume.filter(x => x.st !== 'nein').length + ' frei' : 'kein passender Raum frei');
    out.teile.push(teil);
  });
  // Parallelband / Kopplung: nur planbar, wenn JEDER Teil zur selben Zeit Lehrkraft und Raum hat
  if (ev.parts.length > 1) {
    const offen = out.teile.filter(t => !t.lehrerOk || !t.raumOk);
    out.band = { name: M.U[ev.parts[0].u].band ? 'Parallelband' : 'Kopplung', planbar: !offen.length, text: offen.length ? 'nicht vollständig planbar: ' + offen.map(t => t.name + ' – ' + (!t.lehrerOk ? t.lehrerText : t.raumText)).join('; ') : 'vollständig planbar' };
  }
  return out;
}



