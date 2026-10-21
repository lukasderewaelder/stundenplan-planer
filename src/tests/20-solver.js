// Solver-Kurztests: kleines Beispiel lösbar, gleicher Seed → gleicher Plan
async function selbsttestSolver() {
  const erg = [];
  const mitTafel = dn => { dn.klassen.forEach(k => { k.stundentafel = {}; schuelerStunden(dn, k.id, 'verteilung').forEach((v, f) => { if (v.wert > 0) k.stundentafel[f] = v.wert; }); }); return dn; };
  const d = testGrunddaten();
  d.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 4), uT('u2', 'de', ['k1'], ['B'], 3), uT('u3', 'ma', ['k2'], ['A', { lehrer: 'C', rolle: 'co', modus: 'anteilig', stundenAnteil: 2 }], 4, { bloecke: [2, 2] }), uT('u4', 'sp', ['k2'], ['B'], 2, { bloecke: [2] }), uT('u5', 'de', ['k2'], ['B'], 3)];
  const dn = normalisiere(d);
  const a = await loeseStundenplan(dn, { seed: 42, iterLimit: 20000, zeitlimit: 10 });
  erg.push({ id: 'S1', name: 'Solver löst Kleinbeispiel', ok: a.hart === 0 && a.statistik.unplatziert === 0, info: 'harte Verstöße ' + a.hart + ', unplatziert ' + a.statistik.unplatziert });
  const b = await loeseStundenplan(dn, { seed: 42, iterLimit: 20000, zeitlimit: 10 });
  erg.push({ id: 'S2', name: 'Gleicher Seed → gleicher Plan', ok: JSON.stringify(a.platzierungen) === JSON.stringify(b.platzierungen), info: 'Seed 42, 20 000 Iterationen' });
  const co = a.platzierungen.filter(p => p.unterricht === 'u3' && p.co.includes('C')).length;
  erg.push({ id: 'S3', name: 'Co-Lehrkraft anteilig eingeteilt', ok: co >= 1, info: 'Co in ' + co + ' von 2 Blöcken' });
  // Erzwungener Zug: eine Einzelstunde von u1 wird auf den Platz einer Stunde von u2 gesetzt (gleiche Klasse) und fixiert;
  // die verdrängte Stunde fehlt im Plan – die Reparatur muss sie wieder unterbringen, ohne die fixierte Stunde zu bewegen.
  // (Ausgangsplan mit fester Blockaufteilung, damit u1 Einzelstunden hat)
  const a4 = await loeseStundenplan(dn, { seed: 42, iterLimit: 20000, zeitlimit: 10, _muster: false });
  const dr = JSON.parse(JSON.stringify(dn));
  dr.plan.platzierungen = JSON.parse(JSON.stringify(a4.platzierungen));
  const zug = dr.plan.platzierungen.find(p => p.unterricht === 'u1' && p.dauer === 1);
  const opfer = dr.plan.platzierungen.find(p => p.unterricht === 'u2' && p.dauer === 1 && (p.tag !== (zug || {}).tag) && !dr.plan.platzierungen.some(q => q.unterricht === 'u1' && q.tag === p.tag));
  if (zug && opfer) {
    dr.plan.platzierungen = dr.plan.platzierungen.filter(p => p !== opfer);
    zug.tag = opfer.tag; zug.stunde = opfer.stunde; zug.gesperrt = true;
    const c = await loeseStundenplan(dr, { seed: 7, zeitlimit: 10, startwert: 'aktuell', minimal: true, reparatur: true });
    const fest = c.platzierungen.find(p => p.unterricht === 'u1' && p.blockNr === zug.blockNr);
    erg.push({ id: 'S4', name: 'Neulösen nach erzwungenem Zug', ok: c.hart === 0 && c.statistik.unplatziert === 0 && !!fest && fest.tag === zug.tag && fest.stunde === zug.stunde, info: 'harte Verstöße ' + c.hart + ', unplatziert ' + c.statistik.unplatziert + ', fixierte Stunde ' + (fest && fest.tag === zug.tag && fest.stunde === zug.stunde ? 'unverändert' : 'bewegt') });
  } else erg.push({ id: 'S4', name: 'Neulösen nach erzwungenem Zug', ok: false, info: 'kein passender Zug im Kleinbeispiel' });
  // Höchstarbeitszeit je Tag: A darf höchstens 45 min je Tag arbeiten. Mathe K1 (3 Std.) ist A fest zugeordnet, Mathe K2 (3 Std.) „automatisch“ –
  // A und C können Mathe. Zusammen wären es 6 Stunden bei 5 Tagen: Die Berechnung gibt Mathe K2 an C, niemand arbeitet über der Grenze.
  const dg = testGrunddaten();
  dg.lehrer[0].maxArbeitTag = 0.75; dg.lehrer[2].faecher = ['ma']; dg.regeln.optionen.spaeterBeginnErlaubt = true;
  dg.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 3, { bloecke: [1, 1, 1] }), uT('u2', 'ma', ['k2'], [], 3, { bloecke: [1, 1, 1], fachAuto: true })];
  const g = await loeseStundenplan(mitTafel(normalisiere(dg)), { seed: 3, iterLimit: 6000, zeitlimit: 10 });
  const gWer = ((g.statistik.lehrkraefte.find(x => x.id === 'u2') || { lehrkraefte: [] }).lehrkraefte.find(z => z.rolle === 'fach') || {}).lehrer || '–';
  erg.push({ id: 'S5', name: 'Arbeitszeitgrenze: Personal wird passend gewählt', ok: g.hart === 0 && g.end.hart === 0 && g.platzierungen.length === 6 && gWer === 'C', info: 'A höchstens 45 min je Tag mit 3 festen Stunden: Mathe K2 → ' + gWer + ', eingeplant ' + g.platzierungen.length + ' von 6, harte Fehler (Endvalidierung) ' + g.end.hart });
  // Was passt, wird eingeplant: 10 Einzelstunden bei höchstens zwei je Tag (1,5 h) gehen genau auf
  const dh = testGrunddaten();
  dh.lehrer[0].maxArbeitTag = 1.5; dh.regeln.optionen.spaeterBeginnErlaubt = true;
  dh.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 5, { bloecke: [1, 1, 1, 1, 1] }), uT('u2', 'ma', ['k2'], ['A'], 5, { bloecke: [1, 1, 1, 1, 1] })];
  const hh = await loeseStundenplan(normalisiere(dh), { seed: 5, iterLimit: 8000, zeitlimit: 10 });
  erg.push({ id: 'S6', name: 'Arbeitszeitgrenze: was passt, wird eingeplant', ok: hh.hart === 0 && hh.platzierungen.length === 10 && hh.statistik.unplatziert === 0, info: '10 Stunden bei höchstens zwei je Tag: ' + hh.platzierungen.length + ' eingeplant, harte Verstöße ' + hh.hart });
  // Unterricht ohne Lehrkraft wird trotzdem für die Klasse eingeplant
  const di = testGrunddaten();
  di.unterrichte = [uT('u1', 'ma', ['k1'], [], 4, { bloecke: [1, 1, 1, 1] }), uT('u2', 'de', ['k1'], ['B'], 4, { bloecke: [1, 1, 1, 1] })];
  const ii = await loeseStundenplan(normalisiere(di), { seed: 2, iterLimit: 4000, zeitlimit: 10 });
  erg.push({ id: 'S7', name: 'Unterricht ohne Lehrkraft wird eingeplant', ok: ii.hart === 0 && ii.platzierungen.length === 8 && ii.statistik.unplatziert === 0, info: '4 Stunden Mathe ohne Lehrkraft und 4 Stunden Deutsch: ' + ii.platzierungen.length + ' von 8 eingeplant, harte Verstöße ' + ii.hart });
  // Automatische Zuteilung als Teil der Berechnung: A (Klassenleitung K1, Team K2) bekäme alle 24 Stunden – beide Klassen haben aber nur die
  // 1.–4. Stunde (20 Stunden je Woche). Die Suche gibt deshalb Unterricht an C – Zeit und Personal werden gemeinsam entschieden.
  // (Die Zuteilung ist eine Variable der Suche: Wer welchen Unterricht hält, entscheidet sich zusammen mit den Zeiten.)
  const dj = testGrunddaten();
  dj.klassen.forEach(k => { k.spaetestens = 4; k.maxStundenTag = 4; }); dj.klassen[1].team = ['A'];
  dj.faecher.forEach(f => { f.raumTyp = 'klassenraum'; f.maxProTag = 2; });
  dj.lehrer[0].faecher = ['ma', 'de', 'sp']; dj.lehrer[0].klassenleitung = 'k1'; dj.lehrer[1].faecher = []; dj.lehrer[2].faecher = ['ma', 'de', 'sp']; dj.lehrer[2].ausgebildet = true;
  dj.unterrichte = ['k1', 'k2'].flatMap(k => ['ma', 'de', 'sp'].map(f => uT(f + k, f, [k], [], 4, { fachAuto: true })));
  const jn = mitTafel(normalisiere(dj)), jj = await loeseStundenplan(jn, { seed: 4, iterLimit: 40000, zeitlimit: 10 });
  const wer = new Map(jj.statistik.lehrkraefte.map(x => [x.id, (x.lehrkraefte.find(z => z.rolle === 'fach') || {}).lehrer || '–']));
  const stdA = [...wer.values()].filter(v => v === 'A').length * 4, stdC = [...wer.values()].filter(v => v === 'C').length * 4;
  erg.push({ id: 'S8', name: 'Lehrkräfte automatisch zuteilen (Teil der Suche)', ok: jj.hart === 0 && jj.end.hart === 0 && jj.statistik.unplatziert === 0 && wer.size === 6 && stdA <= 20 && stdC >= 4 && jn.unterrichte.every(u => !u.lehrkraefte.length),
    info: '6 Unterrichte „automatisch“, je 4 Stunden, A hätte als Klassenleitung/Team Vorrang, die Klassen haben aber nur 20 Stunden: A ' + stdA + ' Std., C ' + stdC + ' Std., harte Fehler ' + jj.end.hart });
  // Halbgruppen nebeneinander: K1 hat Mathe und Deutsch in zwei Gruppen (je 2 Doppelstunden-fähige Stunden bei A bzw. B) – die Berechnung legt
  // Gruppe 1 Mathe neben Gruppe 2 Deutsch und umgekehrt, sodass nie nur die halbe Klasse Unterricht hat.
  const dk = testGrunddaten();
  dk.raeume.push({ id: 'r3', name: 'R3', typ: 'klassenraum', kapazitaet: 30 }); // die zweite Halbgruppe braucht einen eigenen Raum
  dk.klassen[0].teilung = { ma: true, de: true }; dk.faecher[0].doppelstunde = 'bevorzugt'; dk.lehrer[2].faecher = ['sp']; dk.lehrer[2].ausgebildet = true;
  dk.lehrer.push(Object.assign({}, dk.lehrer[0], { id: 'D', kuerzel: 'D', name: 'D', faecher: ['ma', 'de'] })); // K2 hat eine eigene Lehrkraft
  dk.unterrichte = [uT('m1', 'ma', ['k1'], ['A'], 2, { gruppen: ['g1'] }), uT('m2', 'ma', ['k1'], ['A'], 2, { gruppen: ['g2'] }), uT('d1', 'de', ['k1'], ['B'], 2, { gruppen: ['g1'] }), uT('d2', 'de', ['k1'], ['B'], 2, { gruppen: ['g2'] }),
    uT('s1', 'sp', ['k1'], ['C'], 3, { bloecke: [1, 1, 1] }), uT('x2', 'de', ['k2'], ['D'], 4, { bloecke: [1, 1, 1, 1] }), uT('y2', 'ma', ['k2'], ['D'], 4, { bloecke: [1, 1, 1, 1] })];
  const kn = normalisiere(dk), kk = await loeseStundenplan(kn, { seed: 6, iterLimit: 12000, zeitlimit: 10 });
  kn.plan.platzierungen = kk.platzierungen;
  const kx = planAusDaten(kn), kt = bewerteAlles(kx.M, kx.P, null), blk = bloeckeAlle(kn);
  const wo = id => kk.platzierungen.filter(p => p.unterricht === id).map(p => p.tag + ':' + p.stunde).sort().join(',');
  erg.push({ id: 'S9', name: 'Halbgruppen liegen nebeneinander', ok: kk.hart === 0 && kt[RI.W17] === 0 && wo('m1') === wo('d2') && wo('m2') === wo('d1') && blockText(blk.get('d1')) === blockText(blk.get('m1')),
    info: 'Mathe/Deutsch in zwei Gruppen: gleiche Blockaufteilung für beide Fächer (' + blockText(blk.get('m1')) + '), Gruppe 1 Mathe liegt ' + (wo('m1') === wo('d2') ? 'neben' : 'NICHT neben') + ' Gruppe 2 Deutsch, Stunden mit halber Klasse: ' + kt[RI.W17] + ', harte Verstöße ' + kk.hart });
  // Der zurückgegebene harte Wert muss dem tatsächlich rekonstruierbaren Enddatenstand entsprechen – besonders nach Personalvariationen/Co-Nachlauf.
  const dz = JSON.parse(JSON.stringify(jn)); dz.plan.platzierungen = JSON.parse(JSON.stringify(jj.platzierungen)); musterUebernehmen(dz, jj.muster);
  (jj.statistik.lehrkraefte || []).forEach(x => { const u = dz.unterrichte.find(q => q.id === x.id); if (u) u.lehrkraefte = JSON.parse(JSON.stringify(x.lehrkraefte || [])); });
  const zr = personalPlanBewertung(dz);
  erg.push({ id: 'S10', name: 'Ergebnis = gespeicherter Endplan', ok: jj.hart === zr.hart, info: 'Solver-Endwert ' + jj.hart + ', rekonstruierter Endplan ' + zr.hart + ' harte Verstöße' });
  // ---------- Personal als Variable der Suche ----------
  const lauf = async (mod, konf) => { const x = testGrunddaten(); mod(x); const dn2 = mitTafel(normalisiere(x)); const r = await loeseStundenplan(dn2, Object.assign({ seed: 11, iterLimit: 15000, zeitlimit: 10 }, konf || {})); r.wer = id => (((r.statistik.lehrkraefte.find(y => y.id === id) || dn2.unterrichte.find(u => u.id === id)).lehrkraefte || []).find(z => z.rolle === 'fach') || {}).lehrer || '–'; return r; };
  // Vollständige Besetzung vor Klassenleitung: A (Klassenleitung K1) kann Mathe und Deutsch, B nur Mathe; beide haben ein Deputat von 4 Stunden.
  const p1 = await lauf(x => {
    x.schule.arbeitszeitModell = { stundenSoll: true };
    x.lehrer[0].klassenleitung = 'k1'; x.lehrer[0].faecher = ['ma', 'de']; x.lehrer[0].deputat = 4; x.lehrer[1].faecher = ['ma']; x.lehrer[1].deputat = 4; x.lehrer[2].faecher = [];
    x.unterrichte = [uT('m1', 'ma', ['k1'], [], 4, { fachAuto: true }), uT('d2', 'de', ['k2'], [], 4, { fachAuto: true })];
  });
  erg.push({ id: 'S11', name: 'Vollständige Besetzung vor Klassenleitung', ok: p1.wer('m1') === 'B' && p1.wer('d2') === 'A' && p1.end.hart === 0, info: 'K1 Mathe → ' + p1.wer('m1') + ', K2 Deutsch → ' + p1.wer('d2') + ' (A ist Klassenleitung in K1, aber nur A kann Deutsch), harte Fehler ' + p1.end.hart });
  // Rangfolge, wenn alles besetzt werden kann: Klassenleitung in der eigenen Klasse → Klassenteam → übrige; feste Vorgaben bleiben
  // (ohne Soll-Arbeitszeit, damit der Ausgleich Soll/Ist nicht mitentscheidet – den prüft S12a)
  const p2 = await lauf(x => {
    x.lehrer.forEach(l => { l.arbeitszeit = 0; });
    x.lehrer[0].klassenleitung = 'k1'; x.lehrer[0].faecher = ['ma', 'de', 'sp']; x.lehrer[1].faecher = ['ma', 'de', 'sp']; x.lehrer[2].faecher = ['sp', 'ch'];
    x.klassen[1].team = ['B'];
    x.unterrichte = [uT('u1', 'ma', ['k1'], [], 4, { fachAuto: true }), uT('u2', 'sp', ['k1'], [], 2, { fachAuto: true }), uT('u3', 'ma', ['k2'], [], 4, { fachAuto: true }), uT('u4', 'de', ['k2'], ['A'], 4), uT('u5', 'ch', ['k2'], [], 2, { fachAuto: true })];
  });
  erg.push({ id: 'S12', name: 'Rangfolge Klassenleitung → Klassenteam', ok: p2.wer('u1') === 'A' && p2.wer('u2') === 'A' && p2.wer('u3') === 'B' && p2.wer('u4') === 'A' && p2.wer('u5') === 'C' && p2.end.hart === 0, info: 'K1 Ma/Sp → ' + p2.wer('u1') + '/' + p2.wer('u2') + ' (Klassenleitung A), K2 Ma → ' + p2.wer('u3') + ' (Team B), De fest → ' + p2.wer('u4') + ', Ch → ' + p2.wer('u5') });
  // Ausgleich Soll/Ist: A hat schon 8 Stunden fest (Deutsch), B nichts. Beide Mathe-Kurse gehen an B, obwohl A Klassenleitung in K1 ist –
  // die Differenz Ist − Soll soll möglichst gleich verteilt sein.
  const p2a = await lauf(x => {
    x.lehrer[0].klassenleitung = 'k1'; x.lehrer[0].arbeitszeit = 30; x.lehrer[1].arbeitszeit = 30; x.lehrer[1].faecher = ['ma', 'de']; x.lehrer[2].arbeitszeit = 0;
    x.unterrichte = [uT('d1', 'de', ['k1'], ['A'], 4), uT('d2', 'de', ['k2'], ['A'], 4), uT('m1', 'ma', ['k1'], [], 4, { fachAuto: true }), uT('m2', 'ma', ['k2'], [], 4, { fachAuto: true })];
  });
  const az2a = p2a.statistik.ausgleich || {};
  erg.push({ id: 'S12a', name: 'Ausgleich der Differenz Ist − Soll', ok: p2a.wer('m1') === 'B' && p2a.wer('m2') === 'B' && p2a.end.hart === 0 && az2a.spanne !== undefined && az2a.spanne < 2, info: 'Mathe K1 → ' + p2a.wer('m1') + ', Mathe K2 → ' + p2a.wer('m2') + ' (A hat 8 Std. Deutsch fest) · Spanne der Differenz Ist − Soll ' + (az2a.spanne === undefined ? '–' : zahlDe(az2a.spanne, 1)) + ' h' });
  // Deputat: Lieber über dem Deputat (Hinweis) als Unterricht ohne Lehrkraft (harter Fehler) – aber so wenig wie möglich
  const p3 = await lauf(x => {
    x.schule.arbeitszeitModell = { stundenSoll: true }; x.lehrer[0].klassenleitung = 'k1'; x.lehrer[0].deputat = 4; x.lehrer[1].faecher = ['ma']; x.lehrer[1].deputat = 4;
    x.unterrichte = [uT('u1', 'ma', ['k1'], [], 4, { fachAuto: true }), uT('u2', 'de', ['k1'], [], 4, { fachAuto: true }), uT('u3', 'ma', ['k2'], [], 4, { fachAuto: true })];
  });
  const std3 = l => ['u1', 'u2', 'u3'].filter(id => p3.wer(id) === l).length * 4;
  erg.push({ id: 'S13', name: 'Deputat: Besetzung vor Deputat, Überschreitung minimal', ok: ['u1', 'u2', 'u3'].every(id => p3.wer(id) !== '–') && std3('A') + std3('B') === 12 && Math.max(std3('A'), std3('B')) === 8 && p3.end.hart === 0 && p3.end.hinweise.some(h => /deputat/i.test(h.titel)), info: '12 Stunden Bedarf bei je 4 Stunden Deputat (A Ma/De, B Ma): A ' + std3('A') + ', B ' + std3('B') + ' Std., harte Fehler ' + p3.end.hart + ', Hinweis „Deputat überschritten“: ' + (p3.end.hinweise.some(h => /deputat/i.test(h.titel)) ? 'ja' : 'nein') });
  // Weiteres Personal unterrichtet nicht – auch nicht als Co
  const p4 = await lauf(x => {
    x.lehrer[2].art = 'personal'; x.lehrer[2].faecher = ['ma']; x.lehrer[2].coFaecher = ['ma']; x.lehrer[0].faecher = ['de']; x.lehrer[1].faecher = ['de'];
    x.faecher[0].coBedarf = true; x.klassen[0].team = ['C'];
    x.unterrichte = [uT('u1', 'ma', ['k1'], [], 2, { fachAuto: true, bloecke: [1, 1] }), uT('u2', 'de', ['k1'], ['A'], 2, { bloecke: [1, 1] })];
  });
  erg.push({ id: 'S14', name: 'Weiteres Personal unterrichtet nicht', ok: p4.wer('u1') === '–' && !(p4.statistik.coNachlauf.ergaenzt || []).length && p4.end.pflicht.find(x => x.id === 'lehrkraft').anzahl === 1, info: 'C ist weiteres Personal mit „Mathe“: Mathe → ' + p4.wer('u1') + ', Co ergänzt: ' + (p4.statistik.coNachlauf.ergaenzt || []).length + ', gemeldet als Unterricht ohne Fachlehrkraft' });
  // Geteilte Fächer einer Klasse: verschiedene Lehrkräfte, damit Gruppe 1 Mathe neben Gruppe 2 Deutsch liegen kann
  const p5 = await lauf(x => {
    x.raeume.push({ id: 'r3', name: 'R3', typ: 'klassenraum', kapazitaet: 30 });
    x.klassen[0].teilung = { ma: true, de: true }; x.lehrer[0].klassenleitung = 'k1'; x.lehrer[0].faecher = ['ma', 'de']; x.lehrer[1].faecher = ['de']; x.lehrer[2].faecher = [];
    x.unterrichte = ['ma', 'de'].flatMap(f => ['g1', 'g2'].map(g => uT(f + g, f, ['k1'], [], 2, { gruppen: [g], fachAuto: true })));
  });
  erg.push({ id: 'S15', name: 'Geteilte Fächer: verschiedene Lehrkräfte', ok: p5.wer('mag1') === 'A' && p5.wer('mag2') === 'A' && p5.wer('deg1') === 'B' && p5.wer('deg2') === 'B' && p5.end.hart === 0, info: 'Klassenleitung A kann Mathe und Deutsch, B nur Deutsch: Mathe → ' + p5.wer('mag1') + '/' + p5.wer('mag2') + ', Deutsch → ' + p5.wer('deg1') + '/' + p5.wer('deg2') });
  // Personal reagiert auf nicht platzierbare Blöcke: A ist nur Mo/Di da, B immer. Mathe K1 (4 Einzelstunden, „automatisch“) passt nicht in A's zwei Tage.
  const p6 = await lauf(x => {
    x.lehrer[0].anwesenheit = 'teilzeit'; x.lehrer[0].anwesenheitTage = [0, 1]; x.lehrer[0].klassenleitung = 'k1'; x.lehrer[1].faecher = ['ma', 'de'];
    x.unterrichte = [uT('u1', 'ma', ['k1'], [], 4, { fachAuto: true, bloecke: [1, 1, 1, 1] })];
  });
  erg.push({ id: 'S16', name: 'Personal folgt den Zeiten', ok: p6.wer('u1') === 'B' && p6.statistik.unplatziert === 0 && p6.end.hart === 0, info: 'Klassenleitung A nur Mo/Di, Mathe K1 hat 4 Blöcke an verschiedenen Tagen: → ' + p6.wer('u1') + ', unplatziert ' + p6.statistik.unplatziert });
  // W18: A leitet K1 und kann Mathe (Kernfach) und Chemie, hat aber nur 4 Stunden Deputat; B kann beides. Mathe gehört zur Klassenleitung.
  const p7 = await lauf(x => {
    x.schule.arbeitszeitModell = { stundenSoll: true };
    x.lehrer[0].klassenleitung = 'k1'; x.lehrer[0].faecher = ['ma', 'ch']; x.lehrer[0].deputat = 4; x.lehrer[1].faecher = ['ma', 'ch']; x.lehrer[1].deputat = 8; x.lehrer[2].faecher = [];
    x.unterrichte = [uT('m1', 'ma', ['k1'], [], 4, { fachAuto: true }), uT('c1', 'ch', ['k1'], [], 4, { fachAuto: true })];
  });
  erg.push({ id: 'S17', name: 'Klassenleitung bekommt das Kernfach', ok: p7.wer('m1') === 'A' && p7.wer('c1') === 'B' && p7.end.hart === 0, info: 'K1 Mathe (Kernfach) → ' + p7.wer('m1') + ', K1 Chemie → ' + p7.wer('c1') + ' (A leitet K1, hat 4 Stunden Deputat) · harte Fehler ' + p7.end.hart });
  // „Plan verbessern“ nach einer neuen Aufgabe für eine Person ohne Unterricht und ohne Co: Unterricht, Fach- und Co-Lehrkräfte bleiben, die Aufgabe wird gelegt
  {
    const x0 = testGrunddaten();
    x0.faecher[0].coBedarf = true; x0.lehrer[2].ausgebildet = false; x0.lehrer[2].coFaecher = ['ma']; x0.lehrer[2].arbeitszeit = 30;
    x0.lehrer.push({ id: 'D', kuerzel: 'D', name: 'D', art: 'personal', faecher: [], verfuegbarkeit: Array.from({ length: 5 }, () => Array(9).fill(1)), arbeitszeit: 20 });
    x0.unterrichte = [uT('m1', 'ma', ['k1'], ['A'], 4), uT('m2', 'ma', ['k2'], ['A'], 4), uT('d1', 'de', ['k1'], ['B'], 3), uT('d2', 'de', ['k2'], ['B'], 3)];
    const d0 = mitTafel(normalisiere(x0));
    const r0 = await loeseStundenplan(JSON.parse(JSON.stringify(d0)), { seed: 5, iterLimit: 15000, zeitlimit: 10 });
    const d1 = gesamtErgebnisUebernehmen(JSON.parse(JSON.stringify(d0)), r0);
    d1.unterrichte.push({ id: 'aufg', aufgabe: true, name: 'Neue Aufgabe', kuerzel: 'Neu', klassen: [], gruppen: [], lehrkraefte: [{ lehrer: 'D', rolle: 'fach', modus: 'immer' }], wochenstunden: 2, bloecke: [], fixiert: [] });
    const d1n = normalisiere(d1);
    const r1 = await loeseStundenplan(JSON.parse(JSON.stringify(d1n)), { seed: 9, iterLimit: 15000, zeitlimit: 10, startwert: 'aktuell' });
    const d2 = gesamtErgebnisUebernehmen(JSON.parse(JSON.stringify(d1n)), r1);
    const sig = pl => pl.filter(p => p.unterricht !== 'aufg').map(p => p.unterricht + '|' + p.blockNr + '|' + p.tag + '|' + p.stunde + '|' + (p.co || []).slice().sort().join(',')).sort().join(';');
    const lk = d => d.unterrichte.filter(u => !u.aufgabe).map(u => u.id + ':' + u.lehrkraefte.map(z => z.lehrer + z.rolle + z.modus).join(',')).join(';');
    const gleich = sig(r0.platzierungen) === sig(r1.platzierungen), lkGleich = lk(d1n) === lk(d2), auf = r1.platzierungen.filter(p => p.unterricht === 'aufg').length;
    const coDa = d2.unterrichte.filter(u => /^m/.test(u.id)).every(u => u.lehrkraefte.some(z => z.rolle === 'co'));
    erg.push({ id: 'S18', name: 'Plan verbessern hält den Rest', ok: r0.end.hart === 0 && r1.end.hart === 0 && gleich && lkGleich && coDa && auf === 2, info: 'Ausgangsplan ' + r0.end.hart + ' harte Fehler · nach „verbessern“ ' + r1.end.hart + ' · Unterricht ' + (gleich ? 'unverändert' : 'verschoben') + ', Fach- und Co-Lehrkräfte ' + (lkGleich ? 'unverändert' : 'geändert') + (coDa ? '' : ', Co fehlt') + ' · neue Aufgabe: ' + auf + ' von 2 Blöcken gelegt' });
  }
  return erg;
}

