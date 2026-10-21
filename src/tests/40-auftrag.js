async function selbsttestAuftrag() {
  const erg = [];
  const T = async (id, name, beschr, f) => { let ok = false, info = ''; try { const r = await f(); ok = !!r[0]; info = r[1]; } catch (err) { info = 'Fehler: ' + err.message; } erg.push({ id, name, beschr, ok, info }); };
  const basis = mod => { const d = testGrunddaten(); mod(d); return normalisiere(d); };
  const pl = (unterricht, tag, stunde, dauer, raum, blockNr) => ({ unterricht, blockNr: blockNr || 1, tag, stunde, dauer: dauer || 1, raum: raum || '', co: [] });
  const res = (d, uid, blockNr) => { const { M, P } = planAusDaten(d); const e = M.uEv[M.uI.get(uid)][(blockNr || 1) - 1]; return ressourcenFuerBlock(d, M, P, e); };
  const wer = (r, id, liste) => (r.teile[0][liste || 'lehrer'].find(x => x.id === id) || { st: '–', gruende: [], folgen: [] });
  const zeichen = x => ({ ok: '✓', warn: '⚠', nein: '✕', '–': '–' })[x.st] + (x.gruende[0] ? ' ' + x.gruende[0] : '');
  await T('A', 'Halbgruppen verdoppeln die Stunden nicht', 'Kunst 2 Std. in den Gruppen A und B (je 2 Std.) sind für einen Schüler 2 Wochenstunden, nicht 4', () => {
    const d = basis(x => { x.klassen[0].stundentafel = { sp: 2 }; x.klassen[0].teilung = { sp: true }; x.unterrichte = [uT('a', 'sp', ['k1'], ['B'], 2, { gruppen: ['g1'] }), uT('b', 'sp', ['k1'], ['B'], 2, { gruppen: ['g2'] })]; });
    const s = schuelerWochenstunden(d, 'k1', 'sp', 'verteilung'), ab = stundenAbgleich(d).length;
    return [s === 2 && ab === 0, 'Schülerstunden ' + s + ' (Stundentafel 2), Abweichungen ' + ab];
  });
  await T('B', 'Unterricht nur in Woche A zählt halb', '2 reale Stunden nur in Woche A sind 1 durchschnittliche Wochenstunde', () => {
    const d = basis(x => { x.schule.wochenrhythmus = 'AB'; x.unterrichte = [uT('a', 'sp', ['k2'], ['B'], 2, { rhythmus: 'A' })]; });
    const s = schuelerWochenstunden(d, 'k2', 'sp', 'verteilung');
    return [s === 1 && wochenAnteil('A') === 0.5 && wochenAnteil('jede') === 1, '2 Std. in Woche A → ' + s + ' Wochenstunde'];
  });
  await T('C', 'Fächer im Wechsel', 'Woche A 2 Std. Kunst, Woche B 2 Std. Werken: je 1 Wochenstunde, zusammen 2', () => {
    const d = basis(x => { x.schule.wochenrhythmus = 'AB'; x.lehrer[0].faecher = ['ma', 'de', 'ch']; x.unterrichte = [uT('a', 'sp', ['k2'], ['B'], 2, { rhythmus: 'A' }), uT('b', 'ch', ['k2'], ['A'], 2, { rhythmus: 'B' })]; });
    const a = schuelerWochenstunden(d, 'k2', 'sp', 'verteilung'), b = schuelerWochenstunden(d, 'k2', 'ch', 'verteilung'), s = schuelerWochenstunden(d, 'k2', null, 'verteilung');
    return [a === 1 && b === 1 && s === 2, 'Sport ' + a + ', Chemie ' + b + ', Summe ' + s];
  });
  await T('D', 'Halbgruppen + Wechsel + Blockzwang', 'Zwei Ein-Stunden-Fächer mit Doppelstundenpflicht als Parallelpartner: Woche A Gruppe 1 Fach X ∥ Gruppe 2 Fach Y, Woche B umgekehrt – je Schüler 2 Wochenstunden, die Bänder liegen zwingend zeitgleich', async () => {
    const d = basis(x => {
      x.faecher[2].doppelstunde = 'pflicht'; x.faecher[3].doppelstunde = 'pflicht'; x.lehrer[0].faecher = ['ma', 'de', 'ch'];
      x.klassen[0].stundentafel = { sp: 1, ch: 1 }; x.klassen[0].teilung = { sp: true, ch: true }; x.klassen[0].parallel = { sp: 'ch', ch: 'sp' };
      x.unterrichte = ['sp', 'ch'].flatMap(f => ['g1', 'g2'].map(g => uT(f + g, f, ['k1'], [f === 'sp' ? 'B' : 'A'], 1, { gruppen: [g] })));
    });
    const bl = bloeckeAlle(d), soll = schuelerWochenstunden(d, 'k1', null, 'tafel'), ist = schuelerWochenstunden(d, 'k1', null, 'verteilung');
    const fehler = machbarkeit(d).filter(m => m.stufe === 'fehler').length;
    const r = await loeseStundenplan(d, { seed: 1, iterLimit: 6000, zeitlimit: 5 });
    d.plan.platzierungen = r.platzierungen;
    const plan = schuelerWochenstunden(d, 'k1', null, 'plan'), wo = id => r.platzierungen.filter(p => p.unterricht === id).map(p => p.tag + ':' + p.stunde + 'x' + p.dauer).join(',');
    const gleich = wo('spg1') === wo('chg2') && wo('spg2') === wo('chg1') && wo('spg1') !== '' && wo('spg1') !== wo('spg2');
    return [soll === 2 && ist === 2 && plan === 2 && fehler === 0 && r.hart === 0 && gleich && blockText(bl.get('spg1')) === blockText(bl.get('chg2')) && bl.get('spg1').woche[0] !== bl.get('spg2').woche[0],
      'Blöcke: Sport Gr. 1 ' + blockText(bl.get('spg1')) + ' ∥ Chemie Gr. 2 ' + blockText(bl.get('chg2')) + '; Sport Gr. 2 ' + blockText(bl.get('spg2')) + ' ∥ Chemie Gr. 1 ' + blockText(bl.get('chg1')) + '; Stundentafel ' + soll + ', Verteilung ' + ist + ', Plan ' + plan + '; zeitgleich: ' + (gleich ? 'ja' : 'nein') + ', harte Verstöße ' + r.hart];
  });
  await T('E', 'Ein-Stunden-Fach mit Doppelblock', 'Kunst 1 Wochenstunde bei Doppelstundenpflicht wird als 2-Stunden-Block in Woche A oder B geplant: Soll = Ist = 1', () => {
    const d = basis(x => { x.faecher[3].doppelstunde = 'pflicht'; x.lehrer[0].faecher = ['ma', 'de', 'ch']; x.klassen[1].stundentafel = { ch: 1 }; x.unterrichte = [uT('a', 'ch', ['k2'], ['A'], 1)]; });
    const b = blockText(bloeckeAlle(d).get('a')), ist = schuelerWochenstunden(d, 'k2', 'ch', 'verteilung'), ab = stundenAbgleich(d).length;
    // nur in Woche A + ungerade + Doppelstundenpflicht ist nicht darstellbar → verständlicher Fehler
    const d2 = basis(x => { x.schule.wochenrhythmus = 'AB'; x.faecher[3].doppelstunde = 'pflicht'; x.lehrer[0].faecher = ['ma', 'de', 'ch']; x.unterrichte = [uT('a', 'ch', ['k2'], ['A'], 3, { rhythmus: 'A' })]; });
    const f = machbarkeit(d2).filter(m => m.stufe === 'fehler' && /nicht exakt abgebildet/.test(m.text)).length;
    return [(b === '2A' || b === '2B') && ist === 1 && ab === 0 && f === 1, 'Blöcke ' + b + ', Wochenstunden ' + ist + ', Abweichung zur Stundentafel ' + ab + '; 3 Std. nur in Woche A: ' + (f ? 'Fehler gemeldet' : 'kein Fehler')];
  });
  await T('H', 'Springer arbeitszeitneutral', 'Ein Springer-Einsatz (Pause und Aufsicht) erscheint gesondert, erhöht aber weder Wochen- noch Tagesarbeitszeit und löst keinen Arbeitszeitverstoß aus', () => {
    const mk = mit => basis(x => {
      x.lehrer[2].arbeitszeit = 1.5; x.lehrer[2].maxArbeitTag = 1; x.lehrer[2].faecher = ['sp']; // 45 min Unterricht + 35 min Vorbereitung = 80 von 90 min; am Tag 45 von 60 min
      x.unterrichte = [uT('a', 'sp', ['k2'], ['C'], 1)]; x.plan = { platzierungen: [pl('a', 0, 1, 1, 'halle')] };
      if (mit) { x.dienste = { bereiche: [], bedarfe: [], plan: [{ id: 's1', lehrer: 'C', tag: 0, typ: 'dt_springer', beginn: '10:00', ende: '11:40', quelle: 'manuell' }], regeln: { springerAnrechnen: true } }; }
    });
    const a = arbeitszeiten(mk(true), { mitTagen: true }).liste.find(x => x.lehrer === 'C'), o = arbeitszeiten(mk(false), { mitTagen: true }).liste.find(x => x.lehrer === 'C');
    const { M, P } = planAusDaten(mk(true)); const h16 = bewerteAlles(M, P, null)[RI.H16];
    return [a.summe === o.summe && a.tag[0] === o.tag[0] && a.springer === 100 && h16 === 0, 'Arbeitszeit mit Springer ' + zahlDe(a.summe, 1) + ' min, ohne ' + zahlDe(o.summe, 1) + ' min; Springer gesondert ' + a.springer + ' min; „Arbeitszeitgrenzen“ ' + h16];
  });
  await T('I', 'Springer blockiert die Zeit', 'Wer 10:00–10:30 Springer ist, kann zur selben Zeit nicht unterrichten: harter Zeitkonflikt', () => {
    const d = basis(x => {
      x.lehrer[2].faecher = ['sp']; x.unterrichte = [uT('a', 'sp', ['k2'], ['C'], 1)]; x.plan = { platzierungen: [pl('a', 0, 3, 1, 'halle')] }; // 3. Stunde 09:25–10:10
      x.dienste = { bereiche: [], bedarfe: [], plan: [{ id: 's1', lehrer: 'C', tag: 0, typ: 'dt_springer', beginn: '10:00', ende: '10:30', quelle: 'manuell' }] };
    });
    const sc = dienstKandidatScore(d, d.dienste.plan[0], 'C'), frei = personFreiImIntervall(d, 'C', 0, '10:00', '10:30', { ohne: 's1' });
    return [sc.stufe === 'hart' && !frei.frei, 'Springer 10:00–10:30 und Unterricht 09:25–10:10: ' + sc.stufe + (sc.hart && sc.hart[0] ? ' (' + sc.hart[0].code + ')' : '')];
  });
  await T('J', 'Individueller Ausschluss', 'Bistro verboten, Frühaufsicht erlaubt: nie Bistro, Frühaufsicht weiter möglich – auch nach Bereich, Uhrzeit (alte Schichtvorlage F2 wird zu 07:00–07:30) und mit Ausnahme', () => {
    const d = basis(x => {
      x.dienste = { bereiche: [{ id: 'bistro', name: 'Bistro' }, { id: 'hof', name: 'Hof' }], bedarfe: [], plan: [],
        schichtvorlagen: [{ id: 'f1', kuerzel: 'F1', name: 'Früh 1', typ: 'dt_frueh', beginn: '06:45', ende: '07:30' }, { id: 'f2', kuerzel: 'F2', name: 'Früh 2', typ: 'dt_frueh', beginn: '07:00', ende: '07:30' }] };
      x.lehrer[0].dienstAusschluss = [{ typ: 'dt_bistro', tag: -1 }];
      x.lehrer[1].dienstAusschluss = [{ typ: '', tag: -1, vorlage: 'f2' }, { typ: '#pause', tag: -1, bereich: 'hof' }];
      x.lehrer[2].dienstAusschluss = [{ typ: 'dt_frueh', tag: -1 }, { typ: 'dt_frueh', tag: 1, von: '07:15', bis: '07:30', art: 'erlaubt' }];
    });
    const A = d.lehrer[0], B = d.lehrer[1], C = d.lehrer[2], aus = (l, typ, tag, a, b, ber) => !!dienstAusgeschlossen(d, l, typ, tag, a, b, ber);
    const bistro = aus(A, 'dt_bistro', 0, 765, 810), frueh = aus(A, 'dt_frueh', 0, 405, 450);
    const f1 = aus(B, 'dt_frueh', 0, 405, 420), f2 = aus(B, 'dt_frueh', 0, 420, 450), hof = aus(B, '#pause', 0, 545, 565, 'hof'), flur = aus(B, '#pause', 0, 545, 565, 'flur');
    const cMo = aus(C, 'dt_frueh', 0, 435, 450), cDi = aus(C, 'dt_frueh', 1, 435, 450), cDiFrueh = aus(C, 'dt_frueh', 1, 405, 450);
    return [bistro && !frueh && !f1 && f2 && hof && !flur && cMo && !cDi && cDiFrueh,
      'A: Bistro ' + (bistro ? 'gesperrt' : 'möglich') + ', Frühaufsicht ' + (frueh ? 'gesperrt' : 'möglich') + ' · B: 06:45–07:00 ' + (f1 ? 'gesperrt' : 'möglich') + ', 07:00–07:30 ' + (f2 ? 'gesperrt' : 'möglich') + ', Hofaufsicht ' + (hof ? 'gesperrt' : 'möglich') + ', Flur ' + (flur ? 'gesperrt' : 'möglich') + ' · C: Frühaufsicht Mo ' + (cMo ? 'gesperrt' : 'möglich') + ', Di ab 07:15 ' + (cDi ? 'gesperrt' : 'erlaubt')];
  });
  await T('K', 'Verfügbare Fachlehrkraft', 'Person A hat das Fach, unterrichtet aber gleichzeitig (✕ mit Begründung); Person B hat das Fach und ist frei (✓)', () => {
    const d = basis(x => { x.lehrer[2].faecher = ['de']; x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1), uT('u2', 'de', ['k2'], ['C'], 1)]; x.plan = { platzierungen: [pl('u1', 0, 1, 1, 'r1'), pl('u2', 0, 1, 1, 'r2')] }; });
    const r = res(d, 'u2'), a = wer(r, 'A'), b = wer(r, 'B');
    return [a.st === 'nein' && /unterrichtet gleichzeitig/.test(a.gruende.join()) && b.st !== 'nein', 'A ' + zeichen(a) + ' · B ' + zeichen(b)];
  });
  await T('L', 'Verfügbare Räume', 'Raum 1 passt, ist aber belegt (✕); Raum 2 passt und ist frei (✓)', () => {
    const d = basis(x => { x.raeume.push({ id: 'r3', name: 'R3', typ: 'klassenraum', kapazitaet: 30 }); x.lehrer[2].faecher = ['de']; x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1), uT('u2', 'de', ['k2'], ['C'], 1)]; x.plan = { platzierungen: [pl('u1', 0, 1, 1, 'r1'), pl('u2', 0, 1, 1, 'r2')] }; });
    const r = res(d, 'u2'), r1 = wer(r, 'r1', 'raeume'), r2 = wer(r, 'r2', 'raeume'), r3 = wer(r, 'r3', 'raeume'), ch = wer(r, 'chem', 'raeume');
    return [r1.st === 'nein' && /belegt/.test(r1.gruende.join()) && r2.st === 'ok' && r3.st !== 'nein' && ch.st === 'nein', 'R1 ' + zeichen(r1) + ' · R2 ' + zeichen(r2) + ' · R3 ' + zeichen(r3) + ' · Chemieraum ' + zeichen(ch)];
  });
  await T('M', 'Echte Zeitüberschneidung', 'Zwei Klassen mit verschiedenen Zeitprofilen: verschiedene Rasterstunden, aber die Uhrzeiten überschneiden sich – die dort eingesetzte Person ist nicht verfügbar', () => {
    const st = [['08:00', '08:45'], ['08:45', '09:30'], ['10:30', '11:15'], ['11:15', '12:00']].map(([b, e]) => ({ beginn: b, ende: e }));
    const d = normalisiere({ schule: { name: 'T', tage: ['Mo', 'Di', 'Mi', 'Do', 'Fr'], stunden: st, zeitprofile: [{ id: 'zp', name: 'später', bloecke: [{ id: 'b2', name: 'Block 2', von: 3, bis: 4, beginn: '11:00', ende: '12:30' }] }] },
      faecher: [{ id: 'de', kuerzel: 'De', name: 'Deutsch', raumTyp: 'klassenraum' }], raeume: [{ id: 'r1', name: 'R1', typ: 'klassenraum', kapazitaet: 30 }, { id: 'r2', name: 'R2', typ: 'klassenraum', kapazitaet: 30 }],
      klassen: [{ id: 'k1', name: '1', jahrgang: 1, schueler: 20 }, { id: 'k4', name: '4', jahrgang: 4, schueler: 20, zeitprofil: 'zp' }],
      lehrer: ['A', 'B', 'C'].map(x => ({ id: x, kuerzel: x, name: x, faecher: ['de'] })),
      unterrichte: [uT('u1', 'de', ['k1'], ['A'], 1), uT('u4', 'de', ['k4'], ['C'], 1)], plan: { platzierungen: [pl('u1', 0, 4, 1, 'r1'), pl('u4', 0, 3, 1, 'r2')] } });
    const r = res(d, 'u4'), a = wer(r, 'A'), b = wer(r, 'B'), r1 = wer(r, 'r1', 'raeume');
    return [a.st === 'nein' && b.st !== 'nein' && r1.st === 'nein', 'Klasse 1: 4. Std. 11:15–12:00, Klasse 4: 3. Std. ' + r.zeit + ' → A ' + zeichen(a) + ' · B ' + zeichen(b) + ' · R1 ' + zeichen(r1)];
  });
  await T('N', 'Doppelblock: ganzer Block', 'Die Person ist in der 3. Stunde frei, in der 4. belegt – für einen Doppelblock ab der 3. Stunde ist sie nicht verfügbar', () => {
    const d = basis(x => { x.lehrer[2].faecher = ['de']; x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1), uT('u2', 'de', ['k2'], ['C'], 2, { bloecke: [2] })]; x.plan = { platzierungen: [pl('u1', 0, 4, 1, 'r1'), pl('u2', 0, 3, 2, 'r2')] }; });
    const r = res(d, 'u2'), a = wer(r, 'A'), b = wer(r, 'B');
    return [a.st === 'nein' && b.st !== 'nein', 'Block ' + r.zeit + ': A ' + zeichen(a) + ' · B ' + zeichen(b)];
  });
  await T('O', 'A-/B-Woche in der Ressourcenprüfung', 'Die Person ist in Woche A frei und in Woche B belegt: für A-Unterricht verfügbar, für B-Unterricht nicht', () => {
    const d = basis(x => {
      x.schule.wochenrhythmus = 'AB'; x.lehrer[2].faecher = ['de'];
      x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1, { rhythmus: 'B' }), uT('ua', 'de', ['k2'], ['C'], 1, { rhythmus: 'A' }), uT('ub', 'de', ['k2'], ['C'], 1, { rhythmus: 'B' })];
      x.plan = { platzierungen: [pl('u1', 0, 1, 1, 'r1'), pl('ua', 0, 1, 1, 'r2'), pl('ub', 0, 1, 1, 'r2')] };
    });
    const ra = res(d, 'ua'), rb = res(d, 'ub'), a = wer(ra, 'A'), b = wer(rb, 'A');
    return [a.st !== 'nein' && b.st === 'nein' && ra.wochenText === 'nur Woche A', ra.wochenText + ': A ' + zeichen(a) + ' · ' + rb.wochenText + ': A ' + zeichen(b)];
  });
  await T('P', 'Parallelband als Ganzes', 'Gruppe 1 hätte eine Lehrkraft, für das Partnerfach der Gruppe 2 gibt es niemanden: Das Parallelband ist insgesamt nicht vollständig planbar', () => {
    const mk = mitLk => basis(x => {
      x.klassen[0].stundentafel = { sp: 1, ch: 1 }; x.klassen[0].teilung = { sp: true, ch: true }; x.klassen[0].parallel = { sp: 'ch', ch: 'sp' }; if (mitLk) x.lehrer[0].faecher = ['ma', 'de', 'ch'];
      x.unterrichte = ['g1', 'g2'].map(g => uT('sp' + g, 'sp', ['k1'], ['B'], 1, { gruppen: [g] })).concat(['g1', 'g2'].map(g => uT('ch' + g, 'ch', ['k1'], mitLk ? ['A'] : [], 1, { gruppen: [g] })));
      x.plan = { platzierungen: [pl('spg1', 0, 1, 1, 'halle'), pl('chg2', 0, 1, 1, 'chem'), pl('spg2', 1, 1, 1, 'halle'), pl('chg1', 1, 1, 1, 'chem')] };
    });
    const a = res(mk(false), 'spg1'), b = res(mk(true), 'spg1');
    return [a.teile.length === 2 && a.band && !a.band.planbar && a.teile[0].lehrerOk && !a.teile[1].lehrerOk && b.band.planbar, 'ohne Chemie-Lehrkraft: ' + (a.band ? a.band.text : 'kein Band') + ' · mit: ' + (b.band ? b.band.text : 'kein Band')];
  });
  await T('Q', 'Springer im Ressourcenfenster', 'Wer zum Termin Springerdienst hat, ist ✕ zeitlich nicht verfügbar (Begründung „Springerdienst“) – obwohl Springer nicht zur Arbeitszeit zählen', () => {
    const d = basis(x => {
      x.lehrer[2].faecher = ['de']; x.unterrichte = [uT('u2', 'de', ['k2'], ['C'], 1)]; x.plan = { platzierungen: [pl('u2', 0, 3, 1, 'r2')] };
      x.dienste = { bereiche: [], bedarfe: [], plan: [{ id: 's1', lehrer: 'B', tag: 0, typ: 'dt_springer', beginn: '10:00', ende: '10:30', quelle: 'manuell' }] };
    });
    const r = res(d, 'u2'), b = wer(r, 'B'), a = wer(r, 'A'), az = arbeitszeiten(d).liste.find(x => x.lehrer === 'B');
    return [b.st === 'nein' && /Springerdienst/.test(b.gruende.join()) && a.st !== 'nein' && az.summe === 0 && az.springer === 30, 'B ' + zeichen(b) + ' · A ' + zeichen(a) + ' · Arbeitszeit B ' + az.summe + ' min, Springer ' + az.springer + ' min'];
  });
  await T('R', 'Automatische Lehrkraft bleibt Teil der Optimierung', 'Sport ∥ Chemie im Parallelband: Die Klassenleitung A wäre erste Wahl für Sport, findet aber mit der Chemie-Lehrkraft C keine gemeinsame Zeit → die Zuteilung bzw. die Berechnung wählt B, niemand bleibt ohne Lehrkraft', async () => {
    const D = 5, H = 9, verf = v => Array.from({ length: D }, () => Array(H).fill(v));
    const u0 = (id, fach, kl, lehrer, ws, extra) => Object.assign({ id, fach, klassen: [kl], gruppen: [], lehrkraefte: lehrer.map(l => ({ lehrer: l, rolle: 'fach', modus: 'immer' })), wochenstunden: ws, bloecke: [], raum: '', rhythmus: 'jede', kopplung: null, fixiert: [] }, extra || {});
    const nurMoDi = verf(0); [0, 1].forEach(t => { nurMoDi[t][0] = 1; nurMoDi[t][1] = 1; });
    const mk = dynamisch => { const ohneMoDi = verf(1); if (!dynamisch) [0, 1].forEach(t => { for (let h = 0; h < H; h++) ohneMoDi[t][h] = 0; }); return normalisiere({ schule: { name: 'T', tage: ['Mo', 'Di', 'Mi', 'Do', 'Fr'], stunden: vorlageRaster('45') },
      faecher: ['de', 'sp', 'ch'].map(f => ({ id: f, kuerzel: f, name: f, raumTyp: 'klassenraum', maxProTag: 2 })),
      raeume: [1, 2, 3].map(i => ({ id: 'r' + i, name: 'R' + i, typ: 'klassenraum', kapazitaet: 30, heimatKlasse: i < 3 ? 'k' + i : '' })),
      klassen: [{ id: 'k1', name: 'K1', jahrgang: 4, heimatraum: 'r1', schueler: 20, fruehestens: 1, spaetestens: 6, maxStundenTag: 6, gruppen: [{ id: 'g1', name: '1', schueler: 10 }, { id: 'g2', name: '2', schueler: 10 }], stundentafel: { de: 8, sp: 2, ch: 2 }, teilung: { sp: true, ch: true }, parallel: { sp: 'ch', ch: 'sp' } },
        { id: 'k2', name: 'K2', jahrgang: 4, heimatraum: 'r2', schueler: 20, fruehestens: 1, spaetestens: 6, maxStundenTag: 6, gruppen: [], stundentafel: dynamisch ? { de: 4 } : {} }],
      lehrer: [{ id: 'A', kuerzel: 'A', name: 'A', faecher: ['de', 'sp'], klassenleitung: 'k1', verfuegbarkeit: ohneMoDi }, { id: 'B', kuerzel: 'B', name: 'B', faecher: ['sp'], verfuegbarkeit: verf(1) }, { id: 'C', kuerzel: 'C', name: 'C', faecher: ['ch'], verfuegbarkeit: nurMoDi }, { id: 'X', kuerzel: 'X', name: 'X', faecher: ['de'], verfuegbarkeit: verf(1) }],
      unterrichte: [u0('de', 'de', 'k1', ['X'], 8), u0('spA', 'sp', 'k1', [], 2, { gruppen: ['g1'], fachAuto: true }), u0('spB', 'sp', 'k1', [], 2, { gruppen: ['g2'], fachAuto: true }), u0('chA', 'ch', 'k1', ['C'], 2, { gruppen: ['g1'] }), u0('chB', 'ch', 'k1', ['C'], 2, { gruppen: ['g2'] })]
        // dynamisch: A wäre anwesend, unterrichtet Mo/Di 1.–2. Std. aber fest in der Nachbarklasse – das zeigt sich erst in der Berechnung
        .concat(dynamisch ? [u0('deK2', 'de', 'k2', ['A'], 4, { bloecke: [2, 2], fixiert: [{ tag: 0, stunde: 1 }, { tag: 1, stunde: 1 }] })] : []) }); };
    const sport = us => us.filter(u => u.fach === 'sp').map(u => (u.lehrkraefte.find(z => z.rolle === 'fach') || {}).lehrer || '–').join('/');
    const lauf = async dyn => { const b = mk(dyn), r = await loeseStundenplan(b, { seed: 1, iterLimit: 6000, zeitlimit: 6 }); const neu = new Map((r.statistik.lehrkraefte || []).map(x => [x.id, x.lehrkraefte])); b.unterrichte.forEach(u => { if (neu.has(u.id)) u.lehrkraefte = neu.get(u.id); }); return { r, sp: sport(b.unterrichte) }; };
    const a = await lauf(false), b = await lauf(true);
    return [a.sp === 'B/B' && b.sp === 'B/B' && a.r.hart === 0 && b.r.hart === 0 && !a.r.statistik.unplatziert && !b.r.statistik.unplatziert && b.r.end.pflicht.find(x => x.id === 'lehrkraft').ok, 'A nie gleichzeitig mit C anwesend: Sport ' + a.sp + ' · A zu den Zeiten von C fest verplant: Sport ' + b.sp + ', harte Verstöße ' + b.r.hart + ', unplatziert ' + b.r.statistik.unplatziert];
  });
  await T('S', 'Halbe Wochenstunden in der Stundentafel', 'Sport 1 Stunde nur in Woche A ist für den Schüler 0,5 Wochenstunde: Die Stundentafel nimmt 0,5 an und stimmt dann mit der Unterrichtsverteilung überein', () => {
    const mk = t => basis(x => { x.schule.wochenrhythmus = 'AB'; x.klassen[1].stundentafel = { sp: t }; x.unterrichte = [uT('a', 'sp', ['k2'], ['B'], 1, { rhythmus: 'A' })]; });
    const a = mk(0.5), b = mk(1), ta = a.klassen[1].stundentafel.sp, ist = schuelerWochenstunden(a, 'k2', 'sp', 'verteilung');
    return [ta === 0.5 && ist === 0.5 && stundenAbgleich(a).length === 0 && stundenAbgleich(b).length === 1, 'Stundentafel ' + zahlDe(ta, 1) + ', Unterrichtsverteilung ' + zahlDe(ist, 1) + ', Abweichungen ' + stundenAbgleich(a).length + ' · mit Stundentafel 1: ' + stundenAbgleich(b).length + ' Abweichung'];
  });
  await T('T', 'Aufsichtsbedarf: Soll/Ist aus dem tatsächlichen Plan', 'Wird der Mindestbedarf nach der Verteilung erhöht (automatische Neuverteilung aus), fehlt sofort eine Person: Seite, offene Punkte und Ampel rechnen aus dem tatsächlichen Stand', () => {
    const mk = min => basis(x => {
      x.klassen[1].stundentafel = { de: 2, sp: 1 };
      x.unterrichte = [uT('u2', 'de', ['k2'], ['B'], 2, { bloecke: [2] }), uT('u3', 'sp', ['k2'], ['B'], 1)];
      x.plan = { platzierungen: [pl('u2', 0, 1, 2, 'r2'), pl('u3', 0, 3, 1, 'halle')] };
      const iv = pausenIntervall(normalisiere(JSON.parse(JSON.stringify(x))).schule, 'n1'), b = zeitText(iv.start), e = zeitText(iv.end);
      x.dienste = { bereiche: [{ id: 'hof', name: 'Hof' }], bedarfe: [{ id: 'b1', tag: 0, typ: 'dt_pause', bereich: 'hof', name: 'Große Pause', abschnitte: [{ beginn: b, ende: e, min, soll: 2 }] }], plan: [{ id: 'p1', lehrer: 'B', tag: 0, typ: 'dt_pause', bereich: 'hof', bedarf: 'b1', beginn: b, ende: e, quelle: 'manuell' }] };
    });
    const fehlt = d => besetzungBedarf(d, d.dienste.bedarfe[0]).reduce((s, x) => s + Math.max(0, x.fehltMin || 0), 0);
    const a = mk(1), b = mk(2), fa = fehlt(a), fb = fehlt(b);
    const sb = planStatus(b), pb = sb.pflicht.find(x => x.id === 'aufsicht'), pa = planStatus(a).pflicht.find(x => x.id === 'aufsicht');
    return [fa === 0 && fb === 1 && pa.ok && !pb.ok && sb.ampel === 'rot', 'Bedarf 1: fehlt ' + fa + ' · Bedarf 2 bei 1 eingeteilten Person: fehlt ' + fb + ', Ampel ' + sb.ampel + (pb.liste[0] ? ' (' + pb.liste[0] + ')' : '')];
  });
  await T('U', 'Unterricht hat Vorrang vor festem Springerdienst', 'Ein vorhandener Springerdienst sperrt die Person im Stundenplan-Solver nicht. Unterricht bleibt planbar; ein anschließend bestehender Aufsichtskonflikt wird in der Prüfung rot gemeldet.', () => {
    const d = basis(x => {
      x.lehrer[1].faecher = ['de', 'sp']; x.klassen[1].stundentafel = { de: 1 };
      x.unterrichte = [uT('u2', 'de', ['k2'], ['B'], 1)]; x.plan = { platzierungen: [pl('u2', 0, 3, 1, 'r2')] };
      x.dienste = { bereiche: [], bedarfe: [], plan: [{ id: 's1', lehrer: 'B', tag: 0, typ: 'dt_springer', beginn: '10:00', ende: '10:30', quelle: 'manuell' }] };
    });
    const { M, P } = planAusDaten(d), e = M.uEv[M.uI.get('u2')][0];
    const gesperrt = M.E[e].erlaubt.length < M.E.reduce(() => 0, 0) ? 1 : [0, 1, 2, 3, 4].map(t => t * M.H + 3).filter(s => !M.erlaubt[e * M.S + s]).length;
    const st = planStatus(d, { M, P }), rot = st.pflicht.filter(x => !x.ok).map(x => x.id);
    return [gesperrt === 0 && M.erlaubt[e * M.S + P.start[e]] && bewerteAlles(M, P, null)[RI.H05] === 0 && st.ampel === 'rot' && rot.includes('doppelt') && arbeitszeiten(d).liste.find(x => x.lehrer === 'B').springer === 30, 'für B im Solver gesperrt: ' + gesperrt + ' Stunde(n) · Unterricht zulässig: ' + (M.erlaubt[e * M.S + P.start[e]] ? 'ja' : 'nein') + ' · Ampel ' + st.ampel + ' (' + rot.join(', ') + ')'];
  });
  return erg;
}

