// ---------- Selbsttest Aufsichtsplanung ----------
function dienstTestDaten(fn) {
  const st = [['08:00', '08:45'], ['08:45', '09:30'], ['10:30', '11:15'], ['11:15', '12:00'], ['13:15', '14:00'], ['14:00', '14:45']].map(([b, e]) => ({ beginn: b, ende: e }));
  const d = {
    schule: { name: 'Test', tage: ['Mo', 'Di', 'Mi', 'Do', 'Fr'], stunden: st, zeitprofile: [
      { id: 'zp_12', name: 'Klasse 1/2', bloecke: [{ id: 'b1', name: 'Block 1', von: 1, bis: 2, beginn: '08:00', ende: '09:30' }, { id: 'b2', name: 'Block 2', von: 3, bis: 4, beginn: '10:30', ende: '12:00' }, { id: 'b3', name: 'Block 3', von: 5, bis: 6, beginn: '13:15', ende: '14:45' }] },
      { id: 'zp_34', name: 'Klasse 3/4', bloecke: [{ id: 'b1', name: 'Block 1', von: 1, bis: 2, beginn: '08:00', ende: '09:45' }, { id: 'b2', name: 'Block 2', von: 3, bis: 4, beginn: '10:30', ende: '12:20' }, { id: 'b3', name: 'Block 3', von: 5, bis: 6, beginn: '13:15', ende: '14:45' }] }] },
    faecher: [{ id: 'de', kuerzel: 'De', name: 'Deutsch' }, { id: 'ma', kuerzel: 'Ma', name: 'Mathematik' }],
    raeume: [], klassen: [{ id: 'k1', name: '1', jahrgang: 1, zeitprofil: 'zp_12' }, { id: 'k3', name: '3', jahrgang: 3, zeitprofil: 'zp_34' }],
    lehrer: ['A', 'B', 'C', 'E'].map(x => ({ id: x, kuerzel: x, name: 'Person ' + x, faecher: ['de', 'ma'], arbeitszeit: 40 })),
    unterrichte: [{ id: 'u1', fach: 'de', klassen: ['k1'], lehrkraefte: [{ lehrer: 'A', rolle: 'fach' }], wochenstunden: 2 }, { id: 'u2', fach: 'ma', klassen: ['k3'], lehrkraefte: [{ lehrer: 'B', rolle: 'fach' }], wochenstunden: 2 }],
    plan: { platzierungen: [{ unterricht: 'u1', blockNr: 1, tag: 0, stunde: 3, dauer: 2 }, { unterricht: 'u2', blockNr: 1, tag: 0, stunde: 3, dauer: 2 }] },
    dienste: { bereiche: [{ id: 'hof', name: 'Schulhof' }], bedarfe: [], plan: [] }
  };
  if (fn) fn(d);
  return normalisiere(d);
}
function selbsttestDienste() {
  const erg = [];
  const T = (id, name, beschr, f) => { let ok = false, info = ''; try { const r = f(); ok = !!r[0]; info = r[1]; } catch (e) { info = 'Fehler: ' + e.message; } erg.push({ id, name, beschr, ok, info }); };
  const di = (lehrer, tag, typ, beginn, ende, extra) => Object.assign({ id: 'x_' + lehrer + tag + beginn.replace(':', '') + typ, lehrer, tag, typ, beginn, ende, quelle: 'manuell' }, extra || {});
  const bed = (tag, typ, ab, bereich) => ({ tag, typ, bereich: bereich || null, abschnitte: ab.map(([b, e, min, soll]) => ({ beginn: b, ende: e, min, soll: soll === undefined ? min : soll })) });
  const zeiten = r => r.map(x => x.beginn + '–' + x.ende + ' ' + x.lehrer).join(', ');
  T('DT01', 'Unterricht + Aufsicht', 'Überlappende Aufsicht wird verhindert, der Solver nimmt jemand anderen', () => {
    const d = dienstTestDaten(x => { x.dienste.bedarfe = [bed(0, 'dt_pause', [['11:00', '11:30', 1]])]; x.lehrer.forEach(l => { if (l.id !== 'A') l.arbeitszeit = 0; }); });
    const s = dienstKandidatScore(d, di('A', 0, 'dt_pause', '11:00', '11:30'), 'A');
    const r = dienstePlanen(d);
    return [s.stufe === 'hart' && s.hart[0].code === 'D01' && r.plan.length === 1 && r.plan[0].lehrer !== 'A', s.hart.map(h => h.text).join(' ') + ' | Solver: ' + zeiten(r.plan)];
  });
  T('DT02', 'Direkt angrenzend', 'Unterricht bis 12:00, Aufsicht 12:00–12:30 ist erlaubt', () => {
    const d = dienstTestDaten();
    const s = dienstKandidatScore(d, di('A', 0, 'dt_pause', '12:00', '12:30'), 'A');
    return [s.stufe !== 'hart', s.stufe + (s.hinweise.length ? ': ' + s.hinweise.join(' ') : '')];
  });
  T('DT03', '12:00-Ende, 12:15-Aufsicht', 'Unterricht (Klasse 1/2) endet 12:00, Aufsicht ab 12:15 geht', () => {
    const d = dienstTestDaten();
    const s = dienstKandidatScore(d, di('A', 0, 'dt_pause', '12:15', '12:45'), 'A');
    return [s.stufe !== 'hart', s.stufe];
  });
  T('DT04', 'Unterricht bis 12:20', 'Klasse 3/4 endet 12:20 – Aufsichtsbeginn 12:15 ist ein Konflikt', () => {
    const d = dienstTestDaten();
    const s = dienstKandidatScore(d, di('B', 0, 'dt_pause', '12:15', '12:45'), 'B');
    return [s.stufe === 'hart' && /12:20/.test(s.hart[0].text), s.hart.length ? s.hart[0].text : s.stufe];
  });
  T('DT05', 'Gestaffelter Frühaufsicht', 'Bedarf 1/2/3 ergibt F1 06:45–07:45, F2 07:00–07:45, F3 07:15–07:45', () => {
    const d = dienstTestDaten(x => { x.dienste.bedarfe = [bed(1, 'dt_frueh', [['06:45', '07:00', 1], ['07:00', '07:15', 2], ['07:15', '07:45', 3]])]; });
    const r = dienstePlanen(d);
    const z = r.plan.map(x => x.beginn + '–' + x.ende).sort().join(', ');
    d.dienste.plan = r.plan;
    const b = besetzungBedarf(d, d.dienste.bedarfe[0]);
    return [z === '06:45–07:45, 07:00–07:45, 07:15–07:45' && b.every(x => x.status === 'ok') && new Set(r.plan.map(x => x.lehrer)).size === 3, z + ' · Besetzung ' + b.map(x => x.ist + '/' + x.soll).join(' ')];
  });
  T('DT06', 'Sinkender Nachmittagsbedarf', 'Bedarf 3/2/1 ab 14:45 ergibt gestaffelte Enden 15:00, 15:30, 16:00', () => {
    const d = dienstTestDaten(x => { x.dienste.bedarfe = [bed(2, 'dt_spaet', [['14:45', '15:00', 3], ['15:00', '15:30', 2], ['15:30', '16:00', 1]])]; });
    const r = dienstePlanen(d);
    const z = r.plan.map(x => x.beginn + '–' + x.ende).sort().join(', ');
    d.dienste.plan = r.plan;
    const b = besetzungBedarf(d, d.dienste.bedarfe[0]);
    return [z === '14:45–15:00, 14:45–15:30, 14:45–16:00' && b.every(x => x.status === 'ok'), z];
  });
  T('DT07', 'Mindestbesetzung', 'Minimum 2, nur 1 Person eingeteilt → Fehler', () => {
    const d = dienstTestDaten(x => { x.dienste.bedarfe = [bed(0, 'dt_frueh', [['07:00', '07:45', 2]])]; x.dienste.plan = [di('C', 0, 'dt_frueh', '07:00', '07:45')]; });
    const b = besetzungBedarf(d, d.dienste.bedarfe[0]);
    const p = dienstPruefung(d);
    return [b[0].status === 'err' && p.meldungen.some(m => m.regel === 'D03' && m.stufe === 'fehler') && p.kennzahlen.minOffen === 1, 'Besetzung ' + b[0].ist + '/' + b[0].min + ', Mindestbedarfe offen: ' + p.kennzahlen.minOffen];
  });
  T('DT08', 'Sollbesetzung', 'Minimum 1 erfüllt, Soll 2 nicht → nur Warnung', () => {
    const d = dienstTestDaten(x => { x.dienste.bedarfe = [bed(0, 'dt_frueh', [['07:00', '07:45', 1, 2]])]; x.dienste.plan = [di('C', 0, 'dt_frueh', '07:00', '07:45')]; });
    const p = dienstPruefung(d);
    return [!p.meldungen.some(m => m.stufe === 'fehler') && p.meldungen.some(m => m.regel === 'DW01' && m.stufe === 'warnung') && p.kennzahlen.sollOffen === 1, 'Soll offen: ' + p.kennzahlen.sollOffen + ', Fehler: ' + p.meldungen.filter(m => m.stufe === 'fehler').length];
  });
  T('DT09', 'Fixierte Aufsicht bleibt', 'Neuberechnung verändert einen fixierte Aufsicht nicht', () => {
    const d = dienstTestDaten(x => { x.dienste.bedarfe = [bed(3, 'dt_frueh', [['06:45', '07:45', 2]])]; x.dienste.plan = [di('E', 3, 'dt_frueh', '06:45', '07:45', { quelle: 'auto', fixiert: true, id: 'fix1' })]; });
    const r = dienstePlanen(d);
    const f = r.plan.find(x => x.id === 'fix1');
    return [f && f.lehrer === 'E' && f.beginn === '06:45' && f.ende === '07:45' && r.plan.length === 2, zeiten(r.plan)];
  });
  T('DT10', 'Springer separat', 'Springer-Minuten erscheinen getrennt von Früh-/Spät-/Aufsichtszeit', () => {
    const d = dienstTestDaten(x => { x.dienste.plan = [di('C', 1, 'dt_springer', '09:30', '10:00'), di('C', 1, 'dt_frueh', '07:00', '07:45')]; });
    const a = arbeitszeiten(d).liste.find(x => x.lehrer === 'C');
    return [a.springer === 30 && a.fruehdienst === 45 && a.aufsicht === 0, 'Springer ' + a.springer + ' min, Frühaufsicht ' + a.fruehdienst + ' min'];
  });
  T('DT11', 'Springer zählen nicht zur Arbeitszeit', 'Ein Springer-Einsatz erscheint gesondert, erhöht die Arbeitszeit aber nie – auch nicht mit der früheren Einstellung „anrechnen“', () => {
    const d = dienstTestDaten(x => { x.dienste.plan = [di('C', 1, 'dt_springer', '09:30', '10:00')]; x.dienste.regeln = { springerAnrechnen: true }; });
    const ohne = dienstTestDaten(() => {});
    const mit = arbeitszeiten(d).liste.find(x => x.lehrer === 'C'), leer = arbeitszeiten(ohne).liste.find(x => x.lehrer === 'C');
    return [mit.summe === leer.summe && mit.springer === 30 && d.dienste.regeln.springerAnrechnen === false, 'Arbeitszeit mit Springer ' + mit.summe + ' min, ohne ' + leer.summe + ' min; Springer gesondert ' + mit.springer + ' min'];
  });
  T('DT12', 'Wunschfenster ist weich', 'Ein persönliches Wunschfenster ab 07:30 sperrt 06:45 nicht hart; bei Bedarf darf die Person eingesetzt werden', () => {
    const d = dienstTestDaten(x => { x.lehrer.forEach(l => { l.dienstVerfuegbarkeit = [{ tag: 0, fruehestens: '07:30', spaetestens: '16:00' }]; }); x.lehrer.slice(1).forEach(l => { l.aufsicht = false; }); x.dienste.bedarfe = [bed(0, 'dt_frueh', [['06:45', '07:45', 1]])]; });
    const sc = dienstKandidatScore(d, di('A', 0, 'dt_frueh', '06:45', '07:45'), 'A');
    const r = dienstePlanen(d);
    return [sc.stufe !== 'hart' && sc.hinweise.some(x => /möglichst erst ab/.test(x)) && r.plan.length === 1 && r.plan[0].lehrer === 'A', sc.stufe + ' · ' + sc.hinweise.join(' ') + ' | Solver: ' + zeiten(r.plan)];
  });
  T('DT13', 'Früh + spät ist ein Wunsch', 'Ohne Erlaubnis bekommt möglichst eine andere Person die Spätaufsicht; ist niemand sonst da, wird die notwendige Aufsicht trotzdem besetzt (weich, mit Hinweis)', () => {
    const mk = (erlaubt, zweite) => dienstTestDaten(x => { x.lehrer.forEach(l => { if (l.id !== 'C' && !(zweite && l.id === 'E')) l.aufsicht = false; }); x.lehrer[2].dienstPraeferenzen = { fruehUndSpaetGleicherTag: erlaubt }; x.dienste.plan = [di('C', 4, 'dt_frueh', '07:00', '07:45')]; x.dienste.bedarfe = [bed(4, 'dt_spaet', [['15:00', '16:00', 1]])]; });
    const r1 = dienstePlanen(mk(false, false)), r2 = dienstePlanen(mk(false, true)), d1 = mk(false, false);
    const sc = dienstKandidatScore(d1, di('C', 4, 'dt_spaet', '15:00', '16:00'), 'C');
    const spaet = r => (r.plan.find(x => x.typ === 'dt_spaet') || {}).lehrer || 'offen';
    return [r1.plan.length === 2 && r1.offen.length === 0 && spaet(r1) === 'C' && spaet(r2) === 'E' && sc.stufe === 'weich' && sc.hinweise.some(t => /früh und spät am selben Tag/.test(t)), 'allein: Spätaufsicht ' + spaet(r1) + ' (' + sc.stufe + ') · mit zweiter Person: ' + spaet(r2)];
  });
  T('DT14', 'Lange Lücke', 'Unterricht bis 12:00 und Aufsicht 16:00–17:00 ist ungünstiger als ein Anschlussdienst', () => {
    const d = dienstTestDaten();
    const weit = dienstKandidatScore(d, di('A', 0, 'dt_spaet', '16:00', '17:00'), 'A'), nah = dienstKandidatScore(d, di('A', 0, 'dt_spaet', '12:00', '13:00'), 'A');
    return [weit.stufe === 'weich' && weit.hinweise.some(t => /Lücke von 4 h/.test(t)) && weit.delta > nah.delta + 10, weit.hinweise.join(' ') + ' (Δ ' + Math.round(weit.delta) + ' gegen ' + Math.round(nah.delta) + ')'];
  });
  T('DT16', 'Export/Import', 'JSON-Export und -Import erhalten Zeitprofile, Aufsichten, Rhythmen und Präferenzen', () => {
    const d = dienstTestDaten(x => {
      x.lehrer[0].dienstVerfuegbarkeit = [{ tag: 1, fruehestens: '07:15', spaetestens: '17:00' }, { tag: 4, keinDienst: true }];
      x.lehrer[0].dienstPraeferenzen = { frueh: 'gern', spaet: 'nicht möglich', maxFruehdiensteWoche: 2, maxSpaetdiensteWoche: 0, fruehUndSpaetGleicherTag: true };
      x.lehrer[0].qualifikationen = ['ersthelfer'];
      x.dienste.bedarfe = [bed(0, 'dt_frueh', [['06:45', '07:00', 1], ['07:00', '07:45', 2, 3]], 'hof')];
      x.dienste.plan = [di('A', 4, 'dt_orga', '13:00', '14:00', { rhythmus: { art: 'monatlich', ordinal: 1 }, fixiert: true, notiz: 'Konferenz' }), di('B', 2, 'dt_frueh', '06:45', '07:45', { rhythmus: { art: 'rotation', personen: ['B', 'C', 'E'], offset: 1 } }), di('C', 3, 'dt_hort', '12:00', '13:00', { rhythmus: { art: 'A' } })];
      x.dienste.regeln = { springerAnrechnen: false, fruehGrenze: '06:50', gewichte: { DW05: 9 } };
    });
    const vor = normalisiere(JSON.parse(JSON.stringify(d)));
    const zurueck = datenstandLaden(JSON.parse(JSON.stringify(vor)));
    const teil = x => JSON.stringify([x.schule.zeitprofile, x.klassen.map(k => k.zeitprofil), x.dienste, x.lehrer.map(l => [l.dienstVerfuegbarkeit, l.dienstPraeferenzen, l.qualifikationen])]);
    return [teil(vor) === teil(zurueck) && zurueck.dienste.plan[1].rhythmus.personen.length === 3, 'identisch: ' + (teil(vor) === teil(zurueck)) + ', ' + teil(vor).length + ' Zeichen Aufsichtsdaten'];
  });
  T('DT17', 'Zeitprofile', 'Gleiche Stunde: Klasse 1/2 10:30–12:00, Klasse 3/4 10:30–12:20; Kopplung beider wird gemeldet', () => {
    const d = dienstTestDaten(x => { x.unterrichte.push({ id: 'u3', fach: 'de', klassen: ['k1', 'k3'], lehrkraefte: [{ lehrer: 'C', rolle: 'fach' }], wochenstunden: 1 }); x.plan.platzierungen.push({ unterricht: 'u3', blockNr: 1, tag: 1, stunde: 4, dauer: 1 }); });
    const a = unterrichtsIntervall(d, d.plan.platzierungen[0]), b = unterrichtsIntervall(d, d.plan.platzierungen[1]), c = unterrichtsIntervall(d, d.plan.platzierungen[2]);
    const k = zeitprofilKonflikte(d);
    return [a.beginn + '–' + a.endeText === '10:30–12:00' && b.beginn + '–' + b.endeText === '10:30–12:20' && c.kompatibel === false && k.length === 1, a.beginn + '–' + a.endeText + ' / ' + b.beginn + '–' + b.endeText + ' · gekoppelt: ' + c.beginn + '–' + c.endeText + ' (' + (k[0] ? 'gemeldet' : 'nicht gemeldet') + ')'];
  });
  T('DT18', 'Minuten und Anwesenheit', 'Aufsicht 06:45–07:45 zählt 60 min; Anwesenheit Mo 06:45–12:00 mit 2 h 45 min Lücke', () => {
    const d = dienstTestDaten(x => { x.dienste.plan = [di('A', 0, 'dt_frueh', '06:45', '07:45'), di('A', 2, 'dt_orga', '15:00', '16:00', { rhythmus: { art: 'monatlich', ordinal: 1 } })]; });
    const az = arbeitszeiten(d).liste.find(x => x.lehrer === 'A');
    const t = tagesAnwesenheit(d, 'A', 0);
    const ok = az.fruehdienst === 60 && Math.abs(az.spaetdienst - 60 * 12 / 52) < 1e-9 && t.ersterBeginn === 405 && t.letztesEnde === 720 && t.spanne === 315 && t.aktiv === 150 && t.luecken === 165;
    return [ok, 'Frühaufsicht ' + az.fruehdienst + ' min, monatlicher später Einsatz ' + zahlDe(az.spaetdienst, 1) + ' min/Woche, Mo ' + zeitText(t.ersterBeginn) + '–' + zeitText(t.letztesEnde) + ', aktiv ' + dauerText(t.aktiv) + ', Lücken ' + dauerText(t.luecken)];
  });
  T('DT19', 'Ziehen ohne harten Konflikt', 'Verschieben auf eine Person mit Unterricht wird als Konflikt erkannt, angrenzend nicht', () => {
    const d = dienstTestDaten(x => { x.dienste.plan = [di('C', 0, 'dt_pause', '11:00', '11:30', { id: 'z1' })]; });
    const x = d.dienste.plan[0];
    const auf = dienstAenderungPruefen(d, x, { lehrer: 'A' }), neben = dienstAenderungPruefen(d, x, { lehrer: 'A', beginn: '12:00', ende: '12:30' }), selbst = dienstAenderungPruefen(d, x, { beginn: '11:15', ende: '11:45' });
    return [auf.stufe === 'hart' && neben.stufe !== 'hart' && selbst.stufe !== 'hart', 'auf A 11:00: ' + auf.stufe + ', auf A 12:00: ' + neben.stufe + ', eigene Zeit verschieben: ' + selbst.stufe];
  });
  T('DT20', 'Manueller Plan bleibt', 'Beim Optimieren bleiben manuelle und fixierte Aufsichten, automatische werden neu geplant', () => {
    const d = dienstTestDaten(x => { x.dienste.bedarfe = [bed(1, 'dt_frueh', [['07:00', '07:45', 3]])]; x.dienste.plan = [di('A', 1, 'dt_frueh', '07:00', '07:45', { id: 'm1' }), di('B', 1, 'dt_frueh', '07:00', '07:45', { id: 'f1', quelle: 'auto', fixiert: true }), di('C', 1, 'dt_frueh', '07:00', '07:45', { id: 'a1', quelle: 'auto' })]; });
    const r = dienstePlanen(d);
    const m = r.plan.find(x => x.id === 'm1'), f = r.plan.find(x => x.id === 'f1');
    return [m && f && m.lehrer === 'A' && f.lehrer === 'B' && r.plan.length === 3 && !r.plan.some(x => x.id === 'a1'), zeiten(r.plan)];
  });
  T('DT21', 'Springer mehrfach am Tag', 'Dieselbe Person darf mehrere nicht überlappende Springerdienste am selben Tag übernehmen', () => {
    const d = dienstTestDaten(x => { x.lehrer.slice(1).forEach(l => { l.aufsicht = false; }); x.dienste.bedarfe = [bed(0, 'dt_springer', [['07:00', '07:20', 1]]), bed(0, 'dt_springer', [['12:20', '12:40', 1]])]; });
    const r = dienstePlanen(d, { zeitlimit: 200 });
    const a = r.plan.filter(x => x.lehrer === 'A' && x.typ === 'dt_springer');
    return [a.length === 2 && r.offen.filter(x => x.prio === 'min').length === 0, a.map(x => x.beginn + '–' + x.ende).join(' · ') || 'kein Springerdienst'];
  });
  T('DT22', 'Aufsicht verdrängt keinen Unterricht', 'Auch eine fixierte Aufsicht wird im Stundenplan-Solver nicht als Sperrzeit behandelt; ein späterer Konflikt wird in der Aufsichtsplanung gelöst bzw. gemeldet', () => {
    const d = dienstTestDaten(x => { x.dienste.plan = [di('A', 0, 'dt_pause', '10:30', '12:00', { id: 'fix', fixiert: true })]; });
    const M = kompiliere(d), M0 = kompiliere(dienstTestDaten()), t = M.lI.get('A');
    const frei = M.lEv[t].length === M0.lEv[t].length && M.lEv[t].every(e => M.E[e].erlaubt.join() === M0.E[e].erlaubt.join() && !(M.E[e].ohne || []).length);
    const konflikt = einsatzKonflikte(d).some(x => /Aufsicht/.test(x.text || '') || x.art === 'zeit');
    return [frei && konflikt, 'Unterricht von A ohne Einschränkung planbar: ' + (frei ? 'ja' : 'nein') + '; Aufsichtskonflikt sichtbar: ' + (konflikt ? 'ja' : 'nein')];
  });
  T('DT23', 'Person abschnittsgenau ausgeschlossen', 'Eine explizit ausgeschlossene Person darf den betroffenen Staffelungsabschnitt nicht übernehmen', () => {
    const d = dienstTestDaten(x => { x.dienste.bedarfe = [{ id: 'ex_p', tag: 1, typ: 'dt_dienst', name: 'Mittagspause', abschnitte: [{ beginn: '12:00', ende: '12:30', min: 1, soll: 1, ausschlussPersonen: ['A'] }] }]; });
    const b = d.dienste.bedarfe[0];
    const sc = dienstKandidatScore(d, nDienst({ lehrer: 'A', tag: 1, bedarf: b.id, name: b.name, beginn: '12:00', ende: '12:30' }), 'A');
    const r = dienstePlanen(d, { zeitlimit: 200 });
    return [sc.stufe === 'hart' && sc.hart.some(h => h.code === 'D05') && r.plan.length === 1 && r.plan[0].lehrer !== 'A', 'A: ' + sc.stufe + ' · geplant: ' + (r.plan[0] ? r.plan[0].lehrer : 'offen')];
  });
  T('DT24', 'Personengruppe ausgeschlossen', 'Eine ausgeschlossene Personengruppe gilt als harte Regel für genau diesen Bedarf', () => {
    const d = dienstTestDaten(x => { x.lehrer.find(l => l.id === 'E').ausgebildet = false; x.dienste.bedarfe = [{ id: 'ex_g', tag: 1, typ: 'dt_dienst', name: 'Hofpause', abschnitte: [{ beginn: '12:00', ende: '12:30', min: 1, soll: 1, ausschlussGruppen: ['rolle:lk'] }] }]; });
    const r = dienstePlanen(d, { zeitlimit: 200 });
    return [r.plan.length === 1 && r.plan[0].lehrer === 'E' && !r.offen.some(o => o.prio === 'min'), r.plan.length ? 'geplant: ' + r.plan[0].lehrer : 'offen'];
  });
  T('DT25', 'Ausschluss nur in einer Staffelungszeit', 'Ein Ausschluss in 07:00–07:30 sperrt dieselbe Person nicht auch im anschließenden Abschnitt 07:30–08:00', () => {
    const d = dienstTestDaten(x => {
      x.lehrer.find(l => l.id === 'B').dienstAusschluss = [{ typ: '', tag: 1, von: '07:30', bis: '08:00', bereich: '', art: 'verboten' }];
      x.lehrer.filter(l => !['A','B'].includes(l.id)).forEach(l => { l.aufsicht = false; });
      x.dienste.bedarfe = [{ id: 'ex_split', tag: 1, typ: 'dt_dienst', name: 'Frühaufsicht', abschnitte: [
        { beginn: '07:00', ende: '07:30', min: 1, soll: 1, ausschlussPersonen: ['A'] },
        { beginn: '07:30', ende: '08:00', min: 1, soll: 1 }
      ] }];
    });
    const r = dienstePlanen(d, { zeitlimit: 300 });
    const z = r.plan.slice().sort((a,b) => minVon(a.beginn)-minVon(b.beginn));
    return [z.length === 2 && z[0].lehrer === 'B' && z[0].beginn === '07:00' && z[0].ende === '07:30' && z[1].lehrer === 'A' && z[1].beginn === '07:30' && z[1].ende === '08:00' && !r.offen.some(o => o.prio === 'min'), zeiten(z) + (r.offen.length ? ' · offen ' + r.offen.length : '')];
  });
  T('DT26', 'Springer gegen verschobenen Unterricht', 'Springer ist minutengenau gesperrt, wenn Unterricht eines Zeitprofils noch läuft', () => {
    const d = dienstTestDaten(x => { x.dienste.bedarfe = [bed(0, 'dt_springer', [['12:00', '12:15', 1]])]; });
    const sc = dienstKandidatScore(d, di('B', 0, 'dt_springer', '12:00', '12:15'), 'B');
    const r = dienstePlanen(d, { zeitlimit: 200 });
    return [sc.stufe === 'hart' && sc.hart.some(h => h.code === 'D01' && /12:20/.test(h.text)) && r.plan.length === 1 && r.plan[0].lehrer !== 'B', (sc.hart[0] ? sc.hart[0].text : sc.stufe) + ' | ' + zeiten(r.plan)];
  });
  T('DT27', 'Freie Soll-Arbeitszeit zuerst', 'Bei gleicher Verfügbarkeit erhält die Person mit deutlich mehr offener Soll-Arbeitszeit die Aufsicht', () => {
    const d = dienstTestDaten(x => { x.lehrer.forEach(l => { l.aufsicht = ['C','E'].includes(l.id); }); x.lehrer.find(l => l.id === 'C').arbeitszeit = 10; x.lehrer.find(l => l.id === 'E').arbeitszeit = 1; x.dienste.bedarfe = [bed(1, 'dt_pause', [['12:00', '12:30', 1]])]; });
    const r = dienstePlanen(d, { zeitlimit: 200 });
    return [r.plan.length === 1 && r.plan[0].lehrer === 'C', zeiten(r.plan)];
  });
  T('DT28', 'Co vor Aufsicht', 'Ein alter Aufsichtseinsatz blockiert die Co-Planung nicht; anschließend wird die Aufsicht gegen Fach- und Co-Unterricht neu verteilt', () => {
    const d = dienstTestDaten(x => {
      x.klassen.find(k => k.id === 'k1').coBedarf = { de: 'alle' };
      x.lehrer.find(l => l.id === 'C').coFaecher = ['de']; x.lehrer.find(l => l.id === 'E').coFaecher = [];
      x.dienste.plan = [di('C', 0, 'dt_pause', '10:30', '12:00', { id: 'c_alt', quelle: 'auto' })];
      x.dienste.bedarfe = [bed(0, 'dt_pause', [['10:30', '11:00', 1]])];
    });
    const r = coNachPlanErgaenzen(d, { ersetzen: true });
    const u = d.unterrichte.find(x => x.id === 'u1'), co = u.lehrkraefte.find(z => z.rolle === 'co' && z.auto);
    const a = dienstePlanen(d, { zeitlimit: 200 });
    return [r.ergaenzt.length === 1 && co && co.lehrer === 'C' && !a.plan.some(x => x.lehrer === 'C' && x.beginn === '10:30'), (co ? co.lehrer : 'keine Co-Kraft') + ' · Aufsicht: ' + zeiten(a.plan)];
  });
  T('DT29', 'Weiteres Personal trotz Sperrzeit', 'Eine einzelne blockierte Zeit sperrt weiteres Personal nur dort. Bei gleicher Differenz Ist − Soll (beide 40 h ohne Einsatz) entscheidet die Rangfolge: Die freie Aufsicht bekommt das sonstige Personal', () => {
    const d = dienstTestDaten(x => {
      x.lehrer.forEach(l => { l.aufsicht = ['E','C'].includes(l.id); });
      const pp = x.lehrer.find(l => l.id === 'E'); pp.art = 'personal'; pp.ausgebildet = false; pp.faecher = []; pp.coFaecher = []; pp.arbeitszeit = 40;
      pp.verfuegbarkeit = Array.from({ length: 5 }, () => Array(6).fill(1));
      pp.verfuegbarkeit[1][0] = 0; // nur 08:00–08:45 gesperrt; 12:00 bleibt nutzbar
      x.dienste.bedarfe = [bed(1, 'dt_pause', [['12:00', '12:30', 1]])];
    });
    const r = dienstePlanen(d, { zeitlimit: 200 });
    return [r.plan.some(x => x.lehrer === 'E'), zeiten(r.plan)];
  });
  T('DT30', 'Weiche Wünsche lassen Aufsicht nicht offen', 'Sobald mindestens eine Person hart geeignet ist, wird die Aufsicht trotz ungünstiger persönlicher Wünsche besetzt', () => {
    const d = dienstTestDaten(x => {
      x.lehrer.forEach(l => { l.aufsicht = l.id === 'C'; });
      const c = x.lehrer.find(l => l.id === 'C'); c.dienstVerfuegbarkeit = [{ tag: 1, keinDienst: true, fruehestens: '16:00', spaetestens: '16:15' }];
      x.dienste.bedarfe = [bed(1, 'dt_pause', [['12:00', '12:30', 1]])];
    });
    const r = dienstePlanen(d, { zeitlimit: 200 });
    return [r.plan.length === 1 && r.offen.filter(o => o.prio === 'min').length === 0, zeiten(r.plan) + ' · offen ' + r.offen.length];
  });
  T('DT31', 'Minusstunden zuerst', 'Die Aufsicht geht an die Person mit den meisten Minusstunden (sonstiges Personal, 40 h Soll ohne Einsatz, gegenüber einer Lehrkraft mit 20 h Soll) – auch gegen einen weichen persönlichen Wunsch', () => {
    const d = dienstTestDaten(x => {
      x.lehrer.forEach(l => { l.aufsicht = ['C','E'].includes(l.id); });
      x.lehrer.find(l => l.id === 'C').arbeitszeit = 20;
      const e = x.lehrer.find(l => l.id === 'E'); e.art = 'personal'; e.ausgebildet = false; e.faecher = []; e.coFaecher = []; e.arbeitszeit = 40;
      e.dienstVerfuegbarkeit = [{ tag: 1, keinDienst: true }]; // nur weich – darf die Personalpriorität nicht aushebeln
      const c = x.lehrer.find(l => l.id === 'C'); c.dienstVerfuegbarkeit = [];
      x.dienste.bedarfe = [bed(1, 'dt_pause', [['12:00', '12:30', 1]])];
    });
    const r = dienstePlanen(d, { zeitlimit: 200 });
    return [r.plan.length === 1 && r.plan[0].lehrer === 'E', zeiten(r.plan)];
  });
  T('DT33', 'Springer ist eine andere Person', 'Mittagspause 12:00–12:45 und 12:45–13:15 (je 1 Person) und ein Springer für die ganze Pause: Wer dort eine feste Aufsicht hat, ist nicht zugleich Springer – auch nicht im anderen Abschnitt. In einer anderen Pause (Frühstück) darf dieselbe Person Springer sein', () => {
    const d = dienstTestDaten(x => {
      x.lehrer.forEach(l => { l.aufsicht = ['A', 'C', 'E'].includes(l.id); });
      x.dienste.bedarfe = [bed(1, 'dt_pause', [['12:00', '12:45', 1], ['12:45', '13:15', 1]]), Object.assign(bed(1, 'dt_springer', [['12:00', '13:15', 1]]), { springer: true, name: 'Springer – Mittag' })];
    });
    const r = dienstePlanen(d, { zeitlimit: 300 }), fest = new Set(r.plan.filter(x => x.typ !== 'dt_springer').map(x => x.lehrer)), spr = r.plan.filter(x => x.typ === 'dt_springer').map(x => x.lehrer);
    // nur C: Die feste Aufsicht hat Vorrang, der Springer derselben Pause bleibt offen (gelb)
    const d2 = dienstTestDaten(x => { x.lehrer.forEach(l => { l.aufsicht = l.id === 'C'; }); x.dienste.bedarfe = [bed(1, 'dt_pause', [['12:00', '12:45', 1]]), Object.assign(bed(1, 'dt_springer', [['12:00', '13:15', 1]]), { springer: true })]; });
    const r2 = dienstePlanen(d2, { zeitlimit: 300 });
    // nur E mit fester Frühstücksaufsicht 09:30–10:00: Springer 10:00–10:30 (gleiche Pause) nicht möglich, Springer Mittag (andere Pause) schon
    const d3 = dienstTestDaten(x => { x.lehrer.forEach(l => { l.aufsicht = l.id === 'E'; }); x.dienste.plan = [di('E', 1, 'dt_pause', '09:30', '10:00', { id: 'fE' })];
      x.dienste.bedarfe = [Object.assign(bed(1, 'dt_springer', [['10:00', '10:30', 1]]), { springer: true, name: 'Springer – Frühstück' }), Object.assign(bed(1, 'dt_springer', [['12:00', '13:15', 1]]), { springer: true, name: 'Springer – Mittag' })]; });
    const r3 = dienstePlanen(d3, { zeitlimit: 300 }), e3 = r3.plan.filter(x => x.lehrer === 'E' && x.typ === 'dt_springer');
    const ok = spr.length >= 1 && spr.every(id => !fest.has(id)) && !r.offen.some(o => o.prio === 'min') && r2.plan.length === 1 && r2.plan[0].typ === 'dt_pause' && r2.offen.length === 1 && r2.offen[0].prio === 'springer'
      && e3.length === 1 && e3[0].beginn === '12:00' && r3.offen.length === 1 && r3.offen[0].beginn === '10:00';
    return [ok, 'Mittag fest: ' + [...fest].join(', ') + ' · Springer: ' + spr.join(', ') + ' | nur C: ' + zeiten(r2.plan) + ', offen ' + r2.offen.map(o => o.prio).join(', ') + ' | E mit Frühstücksaufsicht: Springer ' + zeiten(e3) + ', offen ' + r3.offen.map(o => o.beginn + '–' + o.ende).join(', ')];
  });
  T('DT32', 'Springer trotz Arbeitszeitgrenzen', 'Springer sind Reserve für den Notfall: Eine Person, deren Wochen- und Tagesarbeitszeit schon ausgeschöpft ist, wird trotzdem als Springer eingeplant – eine angerechnete Hofaufsicht bekommt sie dagegen nicht', () => {
    const d = dienstTestDaten(x => {
      x.lehrer.forEach(l => { l.aufsicht = l.id === 'A'; });
      const a = x.lehrer.find(l => l.id === 'A'); a.arbeitszeit = 1; a.maxArbeitTag = 1; // Unterricht am Montag 10:30–12:00 – beide Grenzen schon überschritten
      x.dienste.bedarfe = [bed(0, 'dt_springer', [['12:00', '12:30', 1]]), bed(1, 'dt_pause', [['12:00', '12:30', 1]])];
    });
    const r = dienstePlanen(d, { zeitlimit: 200 });
    const spr = r.plan.filter(x => x.lehrer === 'A' && x.typ === 'dt_springer'), hof = r.plan.filter(x => x.typ === 'dt_pause');
    return [spr.length === 1 && !hof.length, 'Springer Mo 12:00–12:30: ' + (spr.length ? 'A eingeplant' : 'offen') + ' · Hofaufsicht Di (zählt zur Arbeitszeit): ' + (hof.length ? 'besetzt' : 'offen')];
  });
  return erg;
}

/* ---------------------------------------------------------------------------------------------------------------------
   SELBSTTESTS zum Grundsatz „Die Stundentafel nennt die Wochenstunden eines Schülers“ (A–E), zu Springern und Ausschlüssen (H–J)
   und zur Ressourcenprüfung im Plan-Editor (K–Q). Die Tests F und G (Aufsichtsplan: Seite = Druck) prüft die Oberfläche.
   --------------------------------------------------------------------------------------------------------------------- */
