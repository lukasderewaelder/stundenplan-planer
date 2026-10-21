/* =====================================================================
   6. SELBSTTEST GESAMTBERECHNUNG – Reihenfolge Fach → Co → Aufsicht → Endvalidierung, Personalvariation und Engpassfächer,
      blockweiser Co-Bedarf, Aufsichten (Altbestand, Ausschlüsse, Rangfolge, minutengenaue Teilung), eine Zahl „harte Fehler“
   ===================================================================== */
// Kleiner Gesamtdatenstand: 2 Klassen, 3 Tage, Ethik mit einer einzigen Lehrkraft, Co-Bedarf in Deutsch der Klasse 1 (Co X fehlt Mi, Co Y nur Mi),
// sonstiges Personal P, Frühaufsicht (Lehr- und Co-Kräfte ausgeschlossen), Hofpause – dazu Altbestand im Aufsichtsplan und „automatisch nachplanen“ AUS.
function gesamtTestDaten(fn) {
  const st = [['08:00', '08:45'], ['08:45', '09:30'], ['10:00', '10:45'], ['10:45', '11:30']].map(([b, e], i) => ({ beginn: b, ende: e, doppelMitNaechster: i % 2 === 0 }));
  const F = (id, kz, name) => ({ id, kuerzel: kz, name, raumTyp: '', doppelstunde: 'verboten', maxProTag: 1 });
  const L = (id, faecher, extra) => Object.assign({ id, kuerzel: id, name: 'Person ' + id, faecher, coFaecher: [], arbeitszeit: 40 }, extra || {});
  const d = {
    schule: { name: 'Gesamttest', tage: ['Mo', 'Di', 'Mi'], stunden: st },
    faecher: [F('de', 'De', 'Deutsch'), F('ma', 'Ma', 'Mathematik'), F('et', 'Et', 'Ethik')], raeume: [],
    klassen: ['k1', 'k2'].map((id, i) => ({ id, name: String(i + 1), jahrgang: i + 1, schueler: 20, fruehestens: 1, spaetestens: 4, maxStundenTag: 4, stundentafel: { de: 3, ma: 3, et: 1 }, coBedarf: i === 0 ? { de: 'alle' } : {}, team: [] })),
    lehrer: [L('A', ['de', 'ma'], { klassenleitung: 'k1' }), L('B', ['de', 'ma'], { klassenleitung: 'k2' }), L('C', ['et', 'de']), L('D', ['ma']),
      L('X', [], { coFaecher: ['de'], ausgebildet: false, art: 'co', arbeitszeit: 20, anwesenheit: 'teilzeit', anwesenheitTage: [0, 1] }),
      L('Y', [], { coFaecher: ['de'], ausgebildet: false, art: 'co', arbeitszeit: 20, anwesenheit: 'teilzeit', anwesenheitTage: [2] }),
      L('P', [], { ausgebildet: false, art: 'personal', arbeitszeit: 20, aufsicht: true })],
    unterrichte: [], plan: { platzierungen: [] },
    dienste: { bereiche: [{ id: 'hof', name: 'Schulhof' }], bedarfe: [], plan: [], auto: false }
  };
  ['k1', 'k2'].forEach(k => ['de', 'ma', 'et'].forEach(f => d.unterrichte.push({ id: 'u_' + k + '_' + f, fach: f, klassen: [k], wochenstunden: f === 'et' ? 1 : 3, lehrkraefte: [], fachAuto: true })));
  for (let t = 0; t < 3; t++) {
    d.dienste.bedarfe.push({ id: 'frueh' + t, tag: t, typ: 'dt_frueh', name: 'Frühaufsicht', abschnitte: [{ beginn: '07:30', ende: '08:00', min: 1, soll: 1, ausschlussGruppen: ['rolle:lk', 'rolle:co'] }] });
    d.dienste.bedarfe.push({ id: 'hof' + t, tag: t, typ: 'dt_pause', bereich: 'hof', name: 'Hofpause', abschnitte: [{ beginn: '09:30', ende: '10:00', min: 1, soll: 1 }] });
    // Altbestand: alte automatische Einsätze mit Lehrkräften
    d.dienste.plan.push({ id: 'alt' + t, lehrer: 'B', tag: t, typ: 'dt_frueh', bedarf: 'frueh' + t, beginn: '07:30', ende: '08:00', quelle: 'auto' });
  }
  if (fn) fn(d);
  return normalisiere(d);
}
// Ergebnis einer Gesamtberechnung in einen Datenstand übernehmen (wie die Oberfläche)
function gesamtErgebnisUebernehmen(d, m) {
  musterUebernehmen(d, m.muster);
  d.plan.platzierungen = m.platzierungen;
  (m.statistik.lehrkraefte || []).forEach(x => { const u = d.unterrichte.find(q => q.id === x.id); if (u) u.lehrkraefte = x.lehrkraefte; });
  if (m.dienste) { d.dienste.plan = m.dienste.plan; d.dienste.offen = m.dienste.offen; d.dienste.stand = m.dienste.stand; d.dienste.verdraengt = m.dienste.verdraengt || []; }
  return d;
}
// Engpass-Datenstand: A ist die EINZIGE Ethik-Lehrkraft und bekommt nach Rangfolge (Klassenteam) auch Deutsch in Klasse 3, das fest in der
// 3. Stunde liegt. Ethik (Doppelstunde) geht in den Klassen 1 und 2 nur in der 3./4. Stunde (Mathe liegt fest in der 1.) – dort ist A belegt.
// Richtig ist: nicht Ethik ohne Lehrkraft lassen, sondern das ersetzbare Deutsch 3 an B oder C weitergeben.
function engpassTestDaten(fn) {
  const st = [['08:00', '08:45'], ['08:45', '09:30'], ['09:50', '10:35'], ['10:35', '11:20']].map(([b, e], i) => ({ beginn: b, ende: e, doppelMitNaechster: i % 2 === 0 }));
  const d = {
    schule: { name: 'Engpass', tage: ['Mo', 'Di'], stunden: st },
    faecher: [{ id: 'et', kuerzel: 'Et', name: 'Ethik', raumTyp: '', doppelstunde: 'pflicht', maxProTag: 2 }, { id: 'de', kuerzel: 'De', name: 'Deutsch', raumTyp: '', doppelstunde: 'verboten', maxProTag: 1 }, { id: 'ma', kuerzel: 'Ma', name: 'Mathematik', raumTyp: '', doppelstunde: 'verboten', maxProTag: 1 }],
    raeume: [],
    klassen: [{ id: 'k1', name: '1', jahrgang: 1, schueler: 20, fruehestens: 1, spaetestens: 4, maxStundenTag: 4, stundentafel: { et: 2, de: 2, ma: 2 }, team: [] }, { id: 'k2', name: '2', jahrgang: 2, schueler: 20, fruehestens: 1, spaetestens: 4, maxStundenTag: 4, stundentafel: { et: 2, de: 2, ma: 2 }, team: [] },
      { id: 'k3', name: '3', jahrgang: 3, schueler: 20, fruehestens: 3, spaetestens: 4, maxStundenTag: 2, stundentafel: { de: 2 }, team: ['A'] }],
    lehrer: [{ id: 'A', kuerzel: 'A', name: 'A', faecher: ['et', 'de'], arbeitszeit: 40, klassenleitung: 'k1' }, { id: 'B', kuerzel: 'B', name: 'B', faecher: ['de', 'ma'], arbeitszeit: 40 }, { id: 'C', kuerzel: 'C', name: 'C', faecher: ['ma', 'de'], arbeitszeit: 40 }],
    unterrichte: [], plan: { platzierungen: [] }, dienste: { bereiche: [], bedarfe: [], plan: [] }
  };
  ['k1', 'k2'].forEach(k => {
    d.unterrichte.push({ id: 'u_' + k + '_et', fach: 'et', klassen: [k], wochenstunden: 2, lehrkraefte: [], fachAuto: true });
    d.unterrichte.push({ id: 'u_' + k + '_de', fach: 'de', klassen: [k], wochenstunden: 2, lehrkraefte: [{ lehrer: k === 'k1' ? 'B' : 'C', rolle: 'fach' }] });
    d.unterrichte.push({ id: 'u_' + k + '_ma', fach: 'ma', klassen: [k], wochenstunden: 2, lehrkraefte: [{ lehrer: k === 'k1' ? 'B' : 'C', rolle: 'fach' }], bloecke: [1, 1], fixiert: [{ tag: 0, stunde: 1 }, { tag: 1, stunde: 1 }] });
  });
  d.unterrichte.push({ id: 'u_k3_de', fach: 'de', klassen: ['k3'], wochenstunden: 2, lehrkraefte: [], fachAuto: true, bloecke: [1, 1], fixiert: [{ tag: 0, stunde: 3 }, { tag: 1, stunde: 3 }] });
  if (fn) fn(d);
  return normalisiere(d);
}
async function selbsttestGesamt() {
  const erg = [];
  const T = async (id, name, beschr, f) => { let ok = false, info = ''; try { const r = await f(); ok = !!r[0]; info = r[1]; } catch (err) { info = 'Fehler: ' + err.message; } erg.push({ id: 'G-' + id, name, beschr, ok, info }); };
  const bed = (tag, typ, ab, extra) => Object.assign({ tag, typ, bereich: null, abschnitte: ab.map(([b, e, min, soll]) => ({ beginn: b, ende: e, min, soll: soll === undefined ? min : soll })) }, extra || {});
  const di = (lehrer, tag, typ, beginn, ende, extra) => Object.assign({ id: 'g_' + lehrer + tag + beginn.replace(':', '') + typ, lehrer, tag, typ, beginn, ende, quelle: 'manuell' }, extra || {});
  const zeiten = r => r.map(x => x.beginn + '–' + x.ende + ' ' + x.lehrer).join(', ');
  const art = (d, id) => { const l = d.lehrer.find(x => x.id === id); return l ? aufsichtRang(l) : '?'; };
  let gesamt = null; // Ergebnis des Gesamtlaufs für G-01 bis G-04
  const lauf = async () => { if (!gesamt) { const d = gesamtTestDaten(); const m = await loeseStundenplan(JSON.parse(JSON.stringify(d)), { seed: 11, iterLimit: 6000, zeitlimit: 10 }); gesamt = { d: gesamtErgebnisUebernehmen(d, m), m }; } return gesamt; };

  await T('01', 'Reihenfolge und eine Fehlerzahl', 'Die Gesamtberechnung liefert Unterricht, Co-Lehrkräfte, Aufsichten und die Endvalidierung in einem Lauf; die Zahl „harte Fehler“ entspricht genau der Prüfung des gespeicherten Plans', async () => {
    const { d, m } = await lauf(), st = planStatus(d);
    return [!!m.dienste && !!m.end && m.end.hart === st.hart && st.hart === 0 && m.statistik.unplatziert === 0, 'Endvalidierung der Berechnung: ' + (m.end ? m.end.hart : '–') + ' · Prüfung des gespeicherten Plans: ' + st.hart + ' (' + st.ampel + ')' + st.pflicht.filter(x => !x.ok).map(x => ' · ' + x.id + ': ' + x.liste[0]).join('')];
  });
  await T('02', 'Aufsichten immer neu', '„automatisch nachplanen“ ist AUS – die Berechnung rechnet die Aufsichten trotzdem neu; alte automatische Einsätze sind ersetzt', async () => {
    const { d, m } = await lauf();
    const alt = d.dienste.plan.filter(x => /^alt\d/.test(x.id)).length;
    const offen = d.dienste.bedarfe.reduce((n, b) => n + besetzungBedarf(d, b).filter(a => a.fehltMin > 0).length, 0);
    return [d.dienste.auto === false && alt === 0 && offen === 0 && m.statistik.aufsicht.autoEntfernt === 3, 'Schalter: ' + (d.dienste.auto ? 'an' : 'aus') + ' · alte Einträge im Plan: ' + alt + ' · ersetzt: ' + m.statistik.aufsicht.autoEntfernt + ' · Mindestbesetzung offen: ' + offen];
  });
  await T('03', 'Frühaufsicht nur mit sonstigem Personal', 'Für die Frühaufsicht sind Lehrkräfte und Co-Lehrkräfte ausgeschlossen: Eingeteilt ist ausschließlich sonstiges Personal. Die Hofpause geht nach dem Ausgleich an Personen, die danach immer noch mindestens so viele Minusstunden haben wie das Personal', async () => {
    const { d } = await lauf();
    const frueh = d.dienste.plan.filter(x => /^frueh/.test(x.bedarf || '')), hof = d.dienste.plan.filter(x => /^hof/.test(x.bedarf || ''));
    const diff = new Map(arbeitszeiten(d).liste.map(x => [x.lehrer, (x.summe - x.soll) / 60]));
    return [frueh.length === 3 && frueh.every(x => art(d, x.lehrer) === 'personal') && hof.length === 3 && hof.every(x => diff.get(x.lehrer) <= diff.get('P') + 0.5) && !einsatzKonflikte(d).length, 'Frühaufsicht: ' + frueh.map(x => x.lehrer).join(',') + ' · Hofpause: ' + hof.map(x => x.lehrer).join(',') + ' · Konflikte: ' + einsatzKonflikte(d).length];
  });
  await T('04', 'Co-Bedarf blockweise', 'Co X fehlt mittwochs, Co Y ist nur mittwochs da: Deutsch der Klasse 1 (Mo, Di, Mi) wird von beiden gemeinsam abgedeckt – der Co-Bedarf gilt als erfüllt', async () => {
    const { d, m } = await lauf(), u = d.unterrichte.find(x => x.id === 'u_k1_de'), co = u.lehrkraefte.filter(z => z.rolle === 'co' && z.auto);
    const pls = d.plan.platzierungen.filter(p => p.unterricht === u.id).sort((a, b) => a.tag - b.tag);
    const st = planStatus(d).pflicht.find(x => x.id === 'co');
    return [co.length === 2 && pls.length === 3 && pls.every(p => p.co.length === 1) && pls.filter(p => p.co[0] === 'X').every(p => p.tag < 2) && pls.filter(p => p.co[0] === 'Y').every(p => p.tag === 2) && st.ok && !coLuecken(d).summe && m.statistik.coNachlauf.geteilt === 1,
      pls.map(p => d.schule.tage[p.tag] + ': ' + (p.co.join('+') || 'ohne Co')).join(' · ') + ' · Pflichtbedingung Co: ' + (st.ok ? 'erfüllt' : 'verletzt')];
  });
  await T('05', 'Engpassfach bleibt besetzt', 'A ist die einzige Ethik-Lehrkraft und wäre nach Rangfolge (Klassenteam) erste Wahl für Deutsch in Klasse 3, das Ethik blockiert: Deutsch 3 bekommt eine andere Lehrkraft, Ethik bleibt vollständig bei A', async () => {
    const d = engpassTestDaten();
    const wer = (x, id) => ((x.unterrichte.find(u => u.id === id).lehrkraefte.find(z => z.rolle === 'fach') || {}).lehrer || '–');
    const m = await loeseStundenplan(JSON.parse(JSON.stringify(d)), { seed: 5, iterLimit: 6000, zeitlimit: 10 });
    gesamtErgebnisUebernehmen(d, m);
    return [wer(d, 'u_k3_de') !== 'A' && wer(d, 'u_k3_de') !== '–' && wer(d, 'u_k1_et') === 'A' && wer(d, 'u_k2_et') === 'A' && m.statistik.unplatziert === 0 && m.end.hart === 0,
      'nach der Berechnung: De 3 → ' + wer(d, 'u_k3_de') + ', Ethik → ' + wer(d, 'u_k1_et') + '/' + wer(d, 'u_k2_et') + ' · unplatziert: ' + m.statistik.unplatziert + ' · harte Fehler: ' + m.end.hart];
  });
  await T('06', 'Personal folgt nicht platzierbaren Blöcken', 'Weiterrechnen vom vorhandenen Plan: Deutsch 3 ist (aus der letzten Berechnung) A zugeteilt, beide Ethik-Blöcke liegen deshalb in der Ablage. Die Suche wechselt das Personal des ersetzbaren Kurses – nie den Engpasskurs – und plant Ethik ein', async () => {
    const d = engpassTestDaten(x => { x.unterrichte.find(u => u.id === 'u_k3_de').lehrkraefte = [{ lehrer: 'A', rolle: 'fach', modus: 'immer', auto: true }]; });
    const pl = (u, b, tag, stunde) => ({ unterricht: u, blockNr: b, tag, stunde, dauer: 1, raum: null, co: [] });
    d.plan.platzierungen = [pl('u_k1_ma', 1, 0, 1), pl('u_k1_ma', 2, 1, 1), pl('u_k2_ma', 1, 0, 1), pl('u_k2_ma', 2, 1, 1), pl('u_k1_de', 1, 0, 2), pl('u_k1_de', 2, 1, 2), pl('u_k2_de', 1, 0, 2), pl('u_k2_de', 2, 1, 2), pl('u_k3_de', 1, 0, 3), pl('u_k3_de', 2, 1, 3)];
    const wer = (x, id) => ((x.unterrichte.find(u => u.id === id).lehrkraefte.find(z => z.rolle === 'fach') || {}).lehrer || '–');
    const m = await loeseStundenplan(JSON.parse(JSON.stringify(d)), { seed: 3, iterLimit: 6000, zeitlimit: 10, startwert: 'aktuell' });
    gesamtErgebnisUebernehmen(d, m);
    const et = d.plan.platzierungen.filter(p => /_et$/.test(p.unterricht)).length;
    return [wer(d, 'u_k3_de') !== 'A' && wer(d, 'u_k1_et') === 'A' && wer(d, 'u_k2_et') === 'A' && et === 2 && m.statistik.unplatziert === 0 && m.end.hart === 0,
      'vorher: Ethik 0 von 2 Blöcken im Plan · danach: De 3 → ' + wer(d, 'u_k3_de') + ', Ethik → ' + wer(d, 'u_k1_et') + '/' + wer(d, 'u_k2_et') + ', ' + et + ' von 2 Ethik-Blöcken im Plan · harte Fehler: ' + m.end.hart];
  });
  await T('07', 'Harte Fehler vor weichen Kosten', 'Die einzige Musik-Lehrkraft unterrichtet überall nur „ungern“: Die Berechnung setzt sie trotzdem ein (weiche Kosten), statt den Unterricht ohne Lehrkraft zu lassen (harter Fehler)', async () => {
    const d = engpassTestDaten(x => { x.faecher.push({ id: 'mu', kuerzel: 'Mu', name: 'Musik', raumTyp: '', doppelstunde: 'verboten', maxProTag: 1 }); x.lehrer.push({ id: 'U', kuerzel: 'U', name: 'U', faecher: ['mu'], arbeitszeit: 40, verfuegbarkeit: [[-1, -1, -1, -1], [-1, -1, -1, -1]] });
      x.klassen.find(k => k.id === 'k3').stundentafel.mu = 1; x.unterrichte.push({ id: 'u_k3_mu', fach: 'mu', klassen: ['k3'], wochenstunden: 1, lehrkraefte: [], fachAuto: true }); });
    const m = await loeseStundenplan(JSON.parse(JSON.stringify(d)), { seed: 2, iterLimit: 4000, zeitlimit: 10 });
    gesamtErgebnisUebernehmen(d, m);
    const mu = ((d.unterrichte.find(u => u.id === 'u_k3_mu').lehrkraefte.find(z => z.rolle === 'fach')) || {}).lehrer || '–';
    return [mu === 'U' && m.end.hart === 0 && m.verstoesse[RI.W03] > 0, 'Musik K3 → ' + mu + ' · harte Fehler ' + m.end.hart + ' · Ungern-Stunden (weich) ' + m.verstoesse[RI.W03]];
  });
  await T('08', 'Nur von Hand gesetzte und fixierte Aufsichten bleiben', 'Automatische Neuplanung: der manuelle und der fixierte Einsatz bleiben, der alte automatische wird ersetzt', () => {
    const d = dienstTestDaten(x => { x.dienste.bedarfe = [bed(1, 'dt_frueh', [['07:00', '07:45', 4]])]; x.dienste.plan = [di('A', 1, 'dt_frueh', '07:00', '07:45', { id: 'm1' }), di('B', 1, 'dt_frueh', '07:00', '07:45', { id: 'f1', quelle: 'auto', fixiert: true }), di('C', 1, 'dt_frueh', '07:00', '07:45', { id: 'a1', quelle: 'auto' })]; });
    const r = dienstePlanen(d), ids = r.plan.map(x => x.id);
    return [ids.includes('m1') && ids.includes('f1') && !ids.includes('a1') && r.plan.length === 4 && r.statistik.behalten === 2, 'behalten: ' + r.plan.filter(x => x.quelle !== 'auto' || x.fixiert).map(x => x.id).join(', ') + ' · neu: ' + r.statistik.neu];
  });
  await T('10', 'Gruppenausschluss ist hart', 'Sind Lehrkräfte und Co-Lehrkräfte ausgeschlossen und sonstiges Personal ist nicht da, bleibt die Aufsicht offen – sie wird nicht mit einer ausgeschlossenen Person gefüllt', () => {
    const mk = mitPersonal => dienstTestDaten(x => {
      const e = x.lehrer.find(l => l.id === 'E'); if (mitPersonal) { e.art = 'personal'; e.ausgebildet = false; e.faecher = []; e.arbeitszeit = 10; } else e.aufsicht = false;
      x.lehrer.find(l => l.id === 'C').ausgebildet = false; x.lehrer.find(l => l.id === 'C').coFaecher = ['de'];
      x.dienste.bedarfe = [{ id: 'fb', tag: 1, typ: 'dt_frueh', name: 'Frühbetreuung', abschnitte: [{ beginn: '07:00', ende: '08:00', min: 1, soll: 1, ausschlussGruppen: ['rolle:lk', 'rolle:co'] }] }];
    });
    const ohne = dienstePlanen(mk(false), { zeitlimit: 200 }), mit = dienstePlanen(mk(true), { zeitlimit: 200 });
    return [ohne.plan.length === 0 && ohne.offen.length === 1 && ohne.offen[0].prio === 'min' && mit.plan.length === 1 && mit.plan[0].lehrer === 'E', 'ohne Personal: ' + (ohne.plan.length ? 'besetzt mit ' + ohne.plan[0].lehrer : 'offen') + ' · mit Personal: ' + zeiten(mit.plan)];
  });
  await T('11', 'Rangfolge Personal → Co → Lehrkraft', 'Bei gleicher Verfügbarkeit und gleicher Differenz Ist − Soll übernimmt zuerst sonstiges Personal, sonst eine Co-Lehrkraft, erst dann eine Lehrkraft', () => {
    const mk = stufe => dienstTestDaten(x => {
      x.lehrer.forEach(l => { l.aufsicht = ['A', 'C', 'E'].includes(l.id); l.arbeitszeit = 20; });
      const e = x.lehrer.find(l => l.id === 'E'), c = x.lehrer.find(l => l.id === 'C');
      e.art = 'personal'; e.ausgebildet = false; e.faecher = []; c.ausgebildet = false; c.art = 'co'; c.faecher = []; c.coFaecher = ['de'];
      if (stufe >= 1) e.aufsicht = false; if (stufe >= 2) c.aufsicht = false;
      x.dienste.bedarfe = [bed(1, 'dt_pause', [['12:00', '12:30', 1]]), bed(2, 'dt_springer', [['12:00', '12:30', 1]])];
    });
    const r = [0, 1, 2].map(s => dienstePlanen(mk(s), { zeitlimit: 200 }).plan.map(x => x.lehrer).join('+'));
    return [r[0] === 'E+E' && r[1] === 'C+C' && r[2] === 'A+A', 'alle da: ' + r[0] + ' · ohne Personal: ' + r[1] + ' · nur Lehrkraft: ' + r[2]];
  });
  await T('12', 'Teilung nur nach Staffelung', 'Aufsichten gelten für das Zeitraster: Pause 09:30–10:30 gestaffelt in 09:30–10:00 und 10:00–10:30. B unterrichtet nach Zeitprofil bis 09:45, C hat ab 10:00 einen Termin → C 09:30–10:00, B 10:00–10:30, keine 15-Minuten-Stücke an 09:45. Ohne Staffelung (ein Abschnitt 09:30–10:30) kann keiner von beiden die Pause übernehmen – sie bleibt offen statt zerstückelt', () => {
    const mk = ab => dienstTestDaten(x => {
      x.plan.platzierungen = [{ unterricht: 'u2', blockNr: 1, tag: 0, stunde: 1, dauer: 2 }];
      x.lehrer.forEach(l => { l.aufsicht = ['B', 'C'].includes(l.id); });
      x.unterrichte.push({ id: 'auf1', aufgabe: true, name: 'Besprechung', lehrkraefte: [{ lehrer: 'C', rolle: 'fach' }], wochenstunden: 0, termine: [{ tag: 0, beginn: '10:00', ende: '10:30' }] });
      x.dienste.bedarfe = [bed(0, 'dt_pause', ab, { id: 'hofT', name: 'Hofpause' })];
    });
    const d = mk([['09:30', '10:00', 1], ['10:00', '10:30', 1]]), r = dienstePlanen(d, { zeitlimit: 300 }), pl = r.plan.slice().sort((a, b) => minVon(a.beginn) - minVon(b.beginn));
    d.dienste.plan = r.plan;
    const bes = besetzungBedarf(d, d.dienste.bedarfe[0]), konf = einsatzKonflikte(d).length;
    const d2 = mk([['09:30', '10:30', 1]]), r2 = dienstePlanen(d2, { zeitlimit: 300 });
    const ok = r.offen.length === 0 && pl.length === 2 && pl[0].lehrer === 'C' && pl[0].beginn === '09:30' && pl[0].ende === '10:00' && pl[1].lehrer === 'B' && pl[1].beginn === '10:00' && pl[1].ende === '10:30' && bes.every(x => x.status === 'ok') && konf === 0
      && r2.plan.length === 0 && r2.offen.length === 1 && r2.offen[0].beginn === '09:30' && r2.offen[0].ende === '10:30';
    return [ok, 'gestaffelt: ' + zeiten(pl) + ' · offen: ' + r.offen.length + ' · Überschneidungen: ' + konf + ' | ein Abschnitt: ' + (zeiten(r2.plan) || 'niemand') + ', offen ' + r2.offen.map(o => o.beginn + '–' + o.ende).join(', ')];
  });
  await T('13', 'Teilung nur wo nötig', 'Kann eine Person die ganze Aufsicht übernehmen, bleibt es bei einem durchgehenden Einsatz, auch wenn andere Personen in dieser Zeit Unterrichtsgrenzen haben', () => {
    const d = dienstTestDaten(x => { x.plan.platzierungen = [{ unterricht: 'u2', blockNr: 1, tag: 0, stunde: 1, dauer: 2 }]; x.lehrer.forEach(l => { l.aufsicht = ['B', 'C'].includes(l.id); }); x.dienste.bedarfe = [bed(0, 'dt_pause', [['09:30', '10:30', 1]])]; });
    const r = dienstePlanen(d, { zeitlimit: 300 });
    return [r.plan.length === 1 && r.plan[0].lehrer === 'C' && r.plan[0].beginn === '09:30' && r.plan[0].ende === '10:30', zeiten(r.plan)];
  });
  await T('14', 'Persönliche Wünsche sind weich', 'Früh + spät am selben Tag und die Höchstzahl an Frühaufsichten sind Wünsche: Gibt es eine andere Person, bekommt sie den Einsatz – sonst wird trotzdem besetzt', () => {
    const mk = zwei => dienstTestDaten(x => {
      x.lehrer.forEach(l => { l.aufsicht = l.id === 'C' || (zwei && l.id === 'E'); });
      x.lehrer.find(l => l.id === 'C').dienstPraeferenzen = { fruehUndSpaetGleicherTag: false, maxFruehdiensteWoche: 1 };
      x.dienste.plan = [di('C', 4, 'dt_frueh', '07:00', '07:45')];
      x.dienste.bedarfe = [bed(4, 'dt_spaet', [['15:00', '16:00', 1]]), bed(3, 'dt_frueh', [['07:00', '07:45', 1]])];
    });
    const allein = dienstePlanen(mk(false), { zeitlimit: 200 }), zuZweit = dienstePlanen(mk(true), { zeitlimit: 200 });
    const neu = r => r.plan.filter(x => x.quelle === 'auto');
    return [allein.offen.length === 0 && neu(allein).length === 2 && neu(allein).every(x => x.lehrer === 'C') && zuZweit.offen.length === 0 && neu(zuZweit).every(x => x.lehrer === 'E'), 'allein: ' + zeiten(neu(allein)) + ' (offen ' + allein.offen.length + ') · mit zweiter Person: ' + zeiten(neu(zuZweit))];
  });
  await T('15', 'Arbeitszeitgrenze bleibt hart', 'Die Automatik besetzt keine Aufsicht über die Wochenarbeitszeit hinaus – die Aufsicht bleibt mit Begründung offen', () => {
    const d = dienstTestDaten(x => { x.lehrer.forEach(l => { l.aufsicht = l.id === 'C'; }); x.lehrer.find(l => l.id === 'C').arbeitszeit = 0.25; x.dienste.bedarfe = [bed(1, 'dt_pause', [['12:00', '12:30', 1]])]; });
    const r = dienstePlanen(d, { zeitlimit: 200 });
    return [r.plan.length === 0 && r.offen.length === 1 && /Arbeitszeit/.test(r.offen[0].grund), (r.plan.length ? 'besetzt: ' + zeiten(r.plan) : 'offen') + ' · ' + (r.offen[0] ? r.offen[0].grund : '')];
  });
  await T('16', 'Fester Einsatz gegen Unterricht', 'Ein fixierter Einsatz, der sich mit dem Unterricht der Person überschneidet, wird nicht übernommen: Die Aufsicht bekommt jemand anderes, die Endvalidierung meldet die verletzte Fixierung', () => {
    const d = dienstTestDaten(x => { x.dienste.bedarfe = [bed(0, 'dt_pause', [['11:00', '11:30', 1]], { id: 'bx' })]; x.dienste.plan = [di('A', 0, 'dt_pause', '11:00', '11:30', { id: 'fixA', fixiert: true, bedarf: 'bx' })]; });
    const r = aufsichtenNeuBerechnen(d, { zeitlimit: 200 }), st = planStatus(d), fx = st.pflicht.find(x => x.id === 'fix');
    return [r.verdraengt.length === 1 && r.plan.length === 1 && r.plan[0].lehrer !== 'A' && !einsatzKonflikte(d).length && fx && !fx.ok && st.hart >= 1, 'verdrängt: ' + r.verdraengt.map(x => x.lehrer + ' ' + x.beginn).join() + ' · neu: ' + zeiten(r.plan) + ' · Pflichtbedingung Fixierungen: ' + (fx && fx.ok ? 'erfüllt' : 'verletzt')];
  });
  await T('17', 'Sonstiges Personal mit Teil-Sperrzeit', 'Sonstiges Personal mit deutlich mehr Minusstunden (40 h Soll gegenüber 33 h) ist nur 10:30–11:15 gesperrt: Es übernimmt am selben Tag alle übrigen Aufsichten; nur der gesperrte Abschnitt der gestaffelten Pause (10:30–11:00) geht an andere', () => {
    const d = dienstTestDaten(x => {
      x.lehrer.forEach(l => { l.aufsicht = ['C', 'E'].includes(l.id); });
      x.lehrer.find(l => l.id === 'C').arbeitszeit = 33;
      const e = x.lehrer.find(l => l.id === 'E'); e.art = 'personal'; e.ausgebildet = false; e.faecher = []; e.arbeitszeit = 40; e.dienstPraeferenzen = { fruehUndSpaetGleicherTag: true };
      e.verfuegbarkeit = Array.from({ length: 5 }, () => Array(6).fill(1)); e.verfuegbarkeit[1][2] = 0;
      x.dienste.bedarfe = [bed(1, 'dt_frueh', [['07:00', '08:00', 1]]), bed(1, 'dt_pause', [['09:30', '10:30', 1], ['10:30', '11:00', 1]]), bed(1, 'dt_pause', [['12:00', '13:00', 1]]), bed(1, 'dt_spaet', [['14:45', '16:00', 1]])];
    });
    const r = dienstePlanen(d, { zeitlimit: 300 }), minE = r.plan.filter(x => x.lehrer === 'E').reduce((s, x) => s + minVon(x.ende) - minVon(x.beginn), 0), inSperre = r.plan.some(x => x.lehrer === 'E' && minVon(x.beginn) < 675 && minVon(x.ende) > 630);
    return [r.offen.length === 0 && minE === 60 + 60 + 60 + 75 && !inSperre && r.plan.some(x => x.lehrer === 'C' && x.beginn === '10:30' && x.ende === '11:00'), 'Personal: ' + minE + ' von 285 Minuten (gesperrt sind 30 davon) · ' + zeiten(r.plan.filter(x => minVon(x.beginn) >= 570 && minVon(x.ende) <= 660))];
  });
  await T('18', 'Endvalidierung zählt den Gesamtplan', 'Bleibt eine notwendige Aufsicht unbesetzt, steigt die Zahl der harten Fehler – obwohl sich an den Regelverstößen des Stundenplans nichts ändert. Die Zahl stammt aus der Prüfung des Gesamtplans', () => {
    const mk = mitBedarf => { const d = dienstTestDaten(x => { x.lehrer.forEach(l => { l.aufsicht = false; }); x.dienste.bedarfe = mitBedarf ? [bed(1, 'dt_pause', [['12:00', '12:30', 1]])] : []; }); aufsichtenNeuBerechnen(d, { zeitlimit: 100 }); return endValidierung(d); };
    const ohne = mk(false), mit = mk(true), a1 = mit.pflicht.find(x => x.id === 'aufsicht');
    return [mit.regelHart === ohne.regelHart && mit.hart === ohne.hart + 1 && a1 && a1.anzahl === 1 && /12:00–12:30/.test(a1.liste[0]), 'Regelverstöße im Stundenplan unverändert: ' + ohne.regelHart + ' → ' + mit.regelHart + ' · harte Fehler des Gesamtplans: ' + ohne.hart + ' → ' + mit.hart + (a1 && a1.liste[0] ? ' (' + a1.liste[0].slice(0, 70) + ')' : '')];
  });
  await T('19', 'Alte Pausenaufsicht wird nicht mehr gelesen', 'Ein Datenstand mit Feldern der früheren Pausenaufsicht: Die alten Felder fallen beim Laden weg, die Aufsicht zählt genau einmal zur Arbeitszeit', () => {
    const roh = JSON.parse(JSON.stringify(dienstTestDaten(x => { x.plan.platzierungen = []; x.dienste.plan = [di('A', 0, 'dt_pause', '09:30', '10:30', { id: 'm1' })]; })));
    roh.aufsicht = { ueberfuehrt: false, auto: false, bereiche: [{ id: 'hof', name: 'Hof' }], bedarf: { n1: { hof: { min: 1, max: 1 } } }, plan: [{ tag: 0, pause: 'n1', bereich: 'hof', lehrer: 'A', minuten: 60 }] };
    roh.plan.ausgeplant = [{ unterricht: 'x', blockNr: 1, lehrer: 'A', grund: 'alt' }];
    const d = datenstandLaden(roh);
    aufsichtenNeuBerechnen(d, { zeitlimit: 200 });
    const az = arbeitszeiten(d).liste.reduce((sum, x) => sum + x.dienst, 0), soll = d.dienste.plan.reduce((sum, x) => sum + (minVon(x.ende) - minVon(x.beginn)), 0);
    return [!('aufsicht' in d) && !('ausgeplant' in d.plan) && az === soll && soll === 60, 'alte Felder nach dem Laden: ' + ('aufsicht' in d || 'ausgeplant' in d.plan ? 'noch da' : 'entfernt') + ' · Arbeitszeit der Aufsichten ' + az + ' min = Einsätze ' + soll + ' min'];
  });
  await T('20', 'Co-Zuordnung wird geprüft', 'Eine automatische Co-Zuordnung, die eine harte Regel verletzen würde (hier: höchstens 1 Stunde je Tag bei einer Doppelstunde), wird zurückgenommen und anders vergeben', () => {
    const d = dienstTestDaten(x => {
      x.schule.stunden[2].doppelMitNaechster = true; x.unterrichte.forEach(u => { u.bloecke = [2]; });
      x.klassen.find(k => k.id === 'k1').coBedarf = { de: 'alle' };
      const c = x.lehrer.find(l => l.id === 'C'), e = x.lehrer.find(l => l.id === 'E');
      c.coFaecher = ['de']; c.ausgebildet = false; c.faecher = []; c.maxStundenTag = 1; c.arbeitszeit = 30;
      e.coFaecher = ['de']; e.ausgebildet = false; e.faecher = []; e.arbeitszeit = 20;
    });
    const vor = personalPlanBewertung(d).hart, r = coNachPlanErgaenzen(d, { ersetzen: true }), nach = personalPlanBewertung(d).hart;
    const co = d.unterrichte.find(u => u.id === 'u1').lehrkraefte.filter(z => z.rolle === 'co').map(z => z.lehrer);
    return [nach <= vor && co.length === 1 && co[0] === 'E' && r.zurueck === 1, 'Co: ' + (co.join('+') || 'keine') + ' · zurückgenommene Zuordnungen: ' + r.zurueck + ' · harte Regelverstöße vorher/nachher: ' + vor + '/' + nach];
  });
  await T('21', 'Engpass über fünf Klassen', 'A ist die einzige Ethik-Lehrkraft für 5 Klassen und wäre nach Rangfolge (Klassenteam) erste Wahl für fünf ersetzbare Deutsch-Kurse, die Ethik an jedem Tag blockieren. Die Suche gibt alle Deutsch-Kurse an andere – Ethik bleibt vollständig bei A', async () => {
    const st = [['08:00', '08:45'], ['08:45', '09:30'], ['09:50', '10:35'], ['10:35', '11:20']].map(([b, e], i) => ({ beginn: b, ende: e, doppelMitNaechster: i % 2 === 0 }));
    const x = { schule: { name: 'Kette', tage: ['Mo', 'Di', 'Mi', 'Do', 'Fr'], stunden: st },
      faecher: [{ id: 'et', kuerzel: 'Et', name: 'Ethik', raumTyp: '', doppelstunde: 'pflicht', maxProTag: 2 }, { id: 'de', kuerzel: 'De', name: 'Deutsch', raumTyp: '', doppelstunde: 'verboten', maxProTag: 1 }, { id: 'ma', kuerzel: 'Ma', name: 'Mathematik', raumTyp: '', doppelstunde: 'verboten', maxProTag: 1 }],
      raeume: [], klassen: [], lehrer: [{ id: 'A', kuerzel: 'A', name: 'A', faecher: ['et', 'de'], arbeitszeit: 40 }], unterrichte: [], plan: { platzierungen: [] },
      regeln: { hartUmschaltbar: { H15: 'weich' } }, dienste: { bereiche: [], bedarfe: [], plan: [] } };
    for (let i = 1; i <= 5; i++) {
      x.klassen.push({ id: 'k' + i, name: String(i), jahrgang: 1, schueler: 20, fruehestens: 1, spaetestens: 4, maxStundenTag: 4, stundentafel: { et: 2, ma: 5 }, team: [] });
      x.klassen.push({ id: 'x' + i, name: 'X' + i, jahrgang: 2, schueler: 20, fruehestens: 3, spaetestens: 4, maxStundenTag: 2, stundentafel: { de: 1 }, team: ['A'] });
      x.lehrer.push({ id: 'M' + i, kuerzel: 'M' + i, name: 'M' + i, faecher: ['ma', 'de'], arbeitszeit: 40 });
      x.unterrichte.push({ id: 'u_k' + i + '_et', fach: 'et', klassen: ['k' + i], wochenstunden: 2, lehrkraefte: [], fachAuto: true });
      x.unterrichte.push({ id: 'u_k' + i + '_ma', fach: 'ma', klassen: ['k' + i], wochenstunden: 5, lehrkraefte: [{ lehrer: 'M' + i, rolle: 'fach' }], bloecke: [1, 1, 1, 1, 1], fixiert: [0, 1, 2, 3, 4].map(t => ({ tag: t, stunde: 1 })) });
      x.unterrichte.push({ id: 'u_x' + i + '_de', fach: 'de', klassen: ['x' + i], wochenstunden: 1, lehrkraefte: [], fachAuto: true, fixiert: [{ tag: i - 1, stunde: 3 }] });
    }
    const d = normalisiere(x), m = await loeseStundenplan(JSON.parse(JSON.stringify(d)), { seed: 5, iterLimit: 8000, zeitlimit: 10 });
    gesamtErgebnisUebernehmen(d, m);
    const deA = d.unterrichte.filter(u => u.fach === 'de' && u.lehrkraefte.some(z => z.lehrer === 'A')).length, etA = d.unterrichte.filter(u => u.fach === 'et' && u.lehrkraefte.some(z => z.rolle === 'fach' && z.lehrer === 'A')).length, z = m.statistik.zuteilung;
    return [deA === 0 && etA === 5 && m.statistik.unplatziert === 0 && m.hart === 0 && m.end.hart === 0, 'Deutsch noch bei A: ' + deA + ' · Ethik bei A: ' + etA + ' von 5 · unplatziert: ' + m.statistik.unplatziert + ' · harte Fehler ' + m.end.hart + ' · Personalwechsel in der Suche: ' + z.wechsel];
  });
  await T('22', 'Co-Bedarf schon im Stundenplan', 'Die einzige Co-Kraft ist nur montags und dienstags da. Die Suche legt die Deutschstunden mit Co-Bedarf auf diese Tage – die Co-Einteilung danach ist vollständig', async () => {
    const st = [['08:00', '08:45'], ['08:45', '09:30'], ['09:50', '10:35'], ['10:35', '11:20']].map(([b, e]) => ({ beginn: b, ende: e }));
    const x = { schule: { name: 'Co', tage: ['Mo', 'Di', 'Mi', 'Do', 'Fr'], stunden: st },
      faecher: [{ id: 'de', kuerzel: 'De', name: 'Deutsch', raumTyp: '', doppelstunde: 'verboten', maxProTag: 1 }, { id: 'ma', kuerzel: 'Ma', name: 'Mathematik', raumTyp: '', doppelstunde: 'verboten', maxProTag: 1 }],
      raeume: [], klassen: [{ id: 'k1', name: '1', jahrgang: 1, schueler: 20, fruehestens: 1, spaetestens: 4, maxStundenTag: 4, stundentafel: { de: 2, ma: 3 }, team: [], coBedarf: { de: 'alle' } }],
      lehrer: [{ id: 'A', kuerzel: 'A', name: 'A', faecher: ['de', 'ma'], arbeitszeit: 40 }, { id: 'C', kuerzel: 'C', name: 'C', faecher: [], coFaecher: ['de'], ausgebildet: false, arbeitszeit: 20, anwesenheit: 'teilzeit', anwesenheitTage: [0, 1] }],
      unterrichte: [{ id: 'u_de', fach: 'de', klassen: ['k1'], wochenstunden: 2, lehrkraefte: [{ lehrer: 'A', rolle: 'fach' }] }, { id: 'u_ma', fach: 'ma', klassen: ['k1'], wochenstunden: 3, lehrkraefte: [{ lehrer: 'A', rolle: 'fach' }] }],
      plan: { platzierungen: [] }, regeln: { hartUmschaltbar: { H15: 'weich' } }, dienste: { bereiche: [], bedarfe: [], plan: [] } };
    // geprüft wird die Suche selbst (ohne das spätere Nachbessern der Co-Einteilung) und danach der Gesamtlauf
    const d = normalisiere(x), tage = []; let ok = 0;
    for (const seed of [1, 2, 3]) {
      const r = await loeseUnterricht(personalGrundlage(d, {}), { seed, iterLimit: 3000, zeitlimit: 5 });
      const de = r.platzierungen.filter(p => p.unterricht === 'u_de').map(p => p.tag);
      tage.push(de.map(t => d.schule.tage[t]).join('/'));
      if (r.statistik.coOffen === 0 && de.length === 2 && de.every(t => t <= 1)) ok++;
    }
    const dd = JSON.parse(JSON.stringify(d)), m = await loeseStundenplan(dd, { seed: 4, iterLimit: 3000, zeitlimit: 5 });
    return [ok === 3 && m.end.hart === 0, 'Deutsch je Suchlauf: ' + tage.join(' · ') + ' · Suchläufe ohne Co-Lücke: ' + ok + ' von 3 · Gesamtlauf: ' + m.end.hart + ' harte Fehler'];
  });
  // Kleine Schule für die Tests der Blockaufteilung: 5 Tage × 6 Stunden, Doppelstunden an 1/3/5
  const blockSchule = (faecher, tafel, extra) => {
    const st = [['08:00', '08:45'], ['08:45', '09:30'], ['09:50', '10:35'], ['10:35', '11:20'], ['11:30', '12:15'], ['12:15', '13:00']].map(([b, e], i) => ({ beginn: b, ende: e, doppelMitNaechster: i % 2 === 0 }));
    const x = { schule: { name: 'Blöcke', tage: ['Mo', 'Di', 'Mi', 'Do', 'Fr'], stunden: st }, faecher, raeume: [],
      klassen: [{ id: 'k1', name: '1', jahrgang: 5, schueler: 20, fruehestens: 1, spaetestens: 6, maxStundenTag: 6, stundentafel: tafel, team: [] }],
      lehrer: faecher.map(f => ({ id: 'L' + f.id, kuerzel: 'L' + f.id, name: 'L' + f.id, faecher: [f.id], arbeitszeit: 0 })),
      unterrichte: Object.entries(tafel).map(([f, ws]) => ({ id: 'u_' + f, fach: f, klassen: ['k1'], wochenstunden: ws, lehrkraefte: [{ lehrer: 'L' + f, rolle: 'fach' }] })),
      plan: { platzierungen: [] }, dienste: { bereiche: [], bedarfe: [], plan: [] } };
    if (extra) extra(x);
    return normalisiere(x);
  };
  await T('23', 'Zulässige Blockmuster', 'Muster ergeben genau die Wochenstunden und halten die Fachregel ein: 7 Std. „egal“ → u. a. 2+2+2+1, 2+2+1+1+1, 2+2+2+2(14-tägig); „Pflicht“ → nur 2+2+2+2(14-tägig); „verboten“ → nur Einzelstunden; max. 1× je Tag → keine Doppelblöcke', () => {
    const t = l => l.map(m => m.n2 + '/' + m.n1 + '/' + m.nb).sort().join(' ');
    const a = musterListe(7, 'egal', 2, 5, false), b = musterListe(7, 'pflicht', 2, 5, false), c = musterListe(4, 'verboten', 2, 5, false), e = musterListe(3, 'egal', 1, 5, false);
    const summeOk = [a, b, c, e].every(l => l.every(m => 2 * m.n2 + m.n1 + m.nb === (l === c ? 4 : l === e ? 3 : 7)));
    return [summeOk && t(a) === '2/2/1 2/3/0 3/0/1 3/1/0' && t(b) === '3/0/1' && t(c) === '0/4/0' && t(e) === '0/3/0', 'egal 7: ' + t(a) + ' · Pflicht 7: ' + t(b) + ' · verboten 4: ' + t(c) + ' · max. 1/Tag 3: ' + t(e) + ' (Doppel/Einzel/14-tägig)'];
  });
  await T('24', 'Gesamtlauf mit variabler Blockaufteilung', 'Die Berechnung wählt die Aufteilung selbst (7 Std. Deutsch mit Doppelstundenpflicht, 5 Std. Mathe „egal“, 3 Std. Englisch „bevorzugt“): Plan, gespeicherte Aufteilung und Stundentafel stimmen genau überein, keine harten Fehler', async () => {
    const F = (id, kz, dbl) => ({ id, kuerzel: kz, name: kz, raumTyp: '', doppelstunde: dbl, maxProTag: 2 });
    const d = blockSchule([F('de', 'De', 'pflicht'), F('ma', 'Ma', 'egal'), F('en', 'En', 'bevorzugt')], { de: 7, ma: 5, en: 3 });
    const m = await loeseStundenplan(JSON.parse(JSON.stringify(d)), { seed: 3, iterLimit: 20000, zeitlimit: 10 });
    gesamtErgebnisUebernehmen(d, m);
    const bl = bloeckeAlle(d), deB = blockText(bl.get('u_de')), konsistent = d.unterrichte.every(u => { const b = bl.get(u.id), ps = d.plan.platzierungen.filter(p => p.unterricht === u.id); return ps.length === b.dauer.length && ps.every(p => b.dauer[p.blockNr - 1] === p.dauer); });
    return [m.end.hart === 0 && !stundenAbgleich(d, { plan: true }).length && konsistent && /^2\+2\+2\+2[AB]$/.test(deB) && d.unterrichte.every(u => u.bloeckeAuto.length), 'Deutsch ' + deB + ' · Mathe ' + blockText(bl.get('u_ma')) + ' · Englisch ' + blockText(bl.get('u_en')) + ' · Plan passt zur Aufteilung: ' + (konsistent ? 'ja' : 'nein') + ' · harte Fehler ' + m.end.hart];
  });
  await T('25', 'Freistunde nur in Woche B wird erkannt', 'Eine 14-tägige Doppelstunde (Woche A) mitten im Tag: In Woche B entsteht dort eine Freistunde der Klasse – die Bewertung zählt Woche A und Woche B getrennt', () => {
    const F = (id, kz) => ({ id, kuerzel: kz, name: kz, raumTyp: '', doppelstunde: 'egal', maxProTag: 2 });
    const d = blockSchule([F('de', 'De'), F('ma', 'Ma')], { de: 1, ma: 2 }, x => { x.schule.wochenrhythmus = 'AB'; x.unterrichte[0].bloecke = [2]; x.unterrichte[0].bloeckeWoche = ['A']; x.unterrichte[1].bloecke = [1, 1]; });
    d.plan.platzierungen = [{ unterricht: 'u_ma', blockNr: 1, tag: 0, stunde: 1, dauer: 1 }, { unterricht: 'u_de', blockNr: 1, tag: 0, stunde: 2, dauer: 2 }, { unterricht: 'u_ma', blockNr: 2, tag: 1, stunde: 1, dauer: 1 }];
    // Doppelstunde (Woche A) direkt nach Mathe am Tagesende: In Woche B endet der Montag einfach nach der 1. Stunde – keine Freistunde
    const a = planAusDaten(d), ta = bewerteAlles(a.M, a.P, null), mitte = ta[RI.H15];
    // Doppelstunde (Woche A) zwischen zwei Mathestunden (1. und 5. Stunde): In Woche B fehlen die 3. und 4. Stunde mitten im Tag
    d.plan.platzierungen = [{ unterricht: 'u_ma', blockNr: 1, tag: 0, stunde: 1, dauer: 1 }, { unterricht: 'u_de', blockNr: 1, tag: 0, stunde: 3, dauer: 2 }, { unterricht: 'u_ma', blockNr: 2, tag: 0, stunde: 5, dauer: 1 }];
    const b = planAusDaten(d), tb = bewerteAlles(b.M, b.P, null);
    return [mitte === 0 && tb[RI.H15] >= 2, 'Doppelstunde (A) am Tagesende nach Mathe: Freistunden ' + mitte + ' · Doppelstunde (A) zwischen zwei Mathestunden: Freistunden in Woche B ' + tb[RI.H15]];
  });
  await T('26', 'Late Acceptance als zweite Strategie', 'Die zweite Suchstrategie der parallelen Läufe (Late Acceptance Hill Climbing) liefert ebenfalls einen gültigen Plan; der Vergleich der Ergebnisse bevorzugt weniger harte Fehler', async () => {
    const d = gesamtTestDaten();
    const a = await loeseStundenplan(JSON.parse(JSON.stringify(d)), { seed: 5, iterLimit: 6000, zeitlimit: 10, strategie: 'lahc' });
    const x = { end: { hart: 1 }, weich: 0, statistik: {} }, y = { end: { hart: 0 }, weich: 999, statistik: {} };
    return [a.end.hart === 0 && a.statistik.strategie === 'lahc' && ergebnisVergleich(y, x) < 0, 'Late Acceptance: ' + a.end.hart + ' harte Fehler · Vergleich (0 hart, 999 Pkt.) vor (1 hart, 0 Pkt.): ' + (ergebnisVergleich(y, x) < 0 ? 'ja' : 'nein')];
  });
  await T('27', 'Woche A und B ausgleichen – Aufteilen nur als letztes Mittel', 'Klasse mit 25 freien Rasterstunden und im Schnitt 25 UStd.: Kunst (1 UStd., Doppelstundenpflicht) liegt als 14-tägige Doppelstunde in Woche A – mit der Standardaufteilung hätte Woche A 26 UStd. Die Berechnung legt dafür bei GENAU EINEM anderen Fach eine 14-tägige Doppelstunde in Woche B: beide Wochen 25 UStd., die Prüfung blockiert nicht, der Plan ist vollständig. Alle übrigen Fächer behalten ihre Standardaufteilung', async () => {
    const F = (id, kz, dbl) => ({ id, kuerzel: kz, name: kz, raumTyp: '', doppelstunde: dbl, maxProTag: 2 });
    const d = blockSchule([F('ku', 'Ku', 'pflicht'), F('su', 'Su', 'bevorzugt'), F('de', 'De', 'bevorzugt'), F('ma', 'Ma', 'bevorzugt'), F('en', 'En', 'bevorzugt'), F('mu', 'Mu', 'egal'), F('sp', 'Sp', 'pflicht')],
      { ku: 1, su: 3, de: 5, ma: 5, en: 4, mu: 5, sp: 2 }, x => { x.schule.wochenrhythmus = 'AB'; x.klassen[0].maxStundenTag = 5; });
    const vorher = klassenLastJeWoche(kompiliere(d), 0), nachher = klassenLastJeWoche(kompiliere(d, { muster: true }), 0); // inaktive Muster-Blöcke stehen nicht in kEv
    const mb = machbarkeit(d), fehlerK = mb.filter(x => x.stufe === 'fehler'), hinweis = mb.some(x => x.stufe === 'hinweis' && /gleicht Woche A und B aus/.test(x.text));
    const std = bloeckeAlle(d);
    const m = await loeseStundenplan(JSON.parse(JSON.stringify(d)), { seed: 7, iterLimit: 30000, zeitlimit: 10 });
    gesamtErgebnisUebernehmen(d, m);
    const ist = bloeckeAlle(d), zahl = b => { const z = musterZaehlen(b.dauer, b.woche); return z.n2 + '/' + z.n1 + '/' + z.nb; };
    const anders = d.unterrichte.filter(u => zahl(ist.get(u.id)) !== zahl(std.get(u.id))).map(u => u.fach + ' ' + blockText(std.get(u.id)) + ' → ' + blockText(ist.get(u.id)));
    return [vorher.join('/') === '26/24' && nachher.join('/') === '25/25' && !fehlerK.length && hinweis && m.end.hart === 0 && m.statistik.unplatziert === 0 && anders.length === 1,
      'Standardaufteilung Woche A/B: ' + vorher.join('/') + ' UStd. · nach Ausgleich: ' + nachher.join('/') + ' UStd. (frei 25) · Prüfung: ' + (fehlerK.length ? fehlerK.length + ' Fehler' : 'kein Fehler') + (hinweis ? ', Hinweis auf den Ausgleich' : '') + ' · Berechnung: ' + m.end.hart + ' harte Fehler, ' + m.statistik.unplatziert + ' unplatziert · anders aufgeteilt: ' + (anders.join(', ') || 'nichts')];
  });
  await T('28', 'Mindestaufsicht gegen Co-Arbeitszeit: Reserve für die einzige Aufsichtsperson', 'Nur die Co-Kraft X darf die Aufsicht Mo 09:30–10:00 machen (Mindestbedarf 1). Die Co-Zuteilung gäbe ihr alle drei Co-Stunden und verbrauchte ihre Wochenarbeitszeit (3,5 h), sodass für die Aufsicht nur 24 min bleiben. Die Rückkopplung hält Arbeitszeit für die Aufsicht frei, die Co-Stunden gehen an Y.', async () => {
    const d = gesamtTestDaten(x => {
      x.lehrer.forEach(l => { l.aufsicht = l.id === 'X'; });
      const X = x.lehrer.find(l => l.id === 'X'), Y = x.lehrer.find(l => l.id === 'Y');
      X.arbeitszeit = 3.5; X.anwesenheitTage = [0, 1, 2]; Y.arbeitszeit = 3.5; Y.anwesenheitTage = [0, 1, 2];
      x.dienste = { bereiche: [{ id: 'hof', name: 'Hof' }], bedarfe: [{ tag: 0, typ: 'dt_pause', bereich: 'hof', name: 'Pause', abschnitte: [{ beginn: '09:30', ende: '10:00', min: 1, soll: 1 }] }], plan: [], auto: true };
    });
    const ohne = await loeseStundenplan(JSON.parse(JSON.stringify(d)), { seed: 3, iterLimit: 5000, zeitlimit: 10, _ohneRueckkopplung: true });
    const mit = await loeseStundenplan(JSON.parse(JSON.stringify(d)), { seed: 3, iterLimit: 5000, zeitlimit: 10 });
    const rk = mit.statistik.aufsichtRueckkopplung;
    return [ohne.end.hart > 0 && (ohne.statistik.aufsicht.offenMin || 0) === 1 && mit.end.hart === 0 && !!rk && rk.angenommen === 1 && (mit.statistik.aufsicht.offenMin || 0) === 0,
      'ohne Rückkopplung: ' + ohne.end.hart + ' harte Fehler, ' + ohne.statistik.aufsicht.offenMin + ' Mindestaufsicht offen · mit: ' + mit.end.hart + ' harte Fehler' + (rk ? ', Rückkopplung ' + rk.angenommen + ' von ' + rk.runden + ' Runde(n) angenommen, Reserve ' + rk.reserve.map(r => r.lehrer + ' ' + r.minuten + ' min').join(', ') : ', keine Rückkopplung')];
  });
  return erg;
}

/* ---------------- Selbsttest ---------------- */
