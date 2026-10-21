/* =====================================================================
   4. SELBSTTEST – jede Regel H01–H15 und W01–W16 mit kleinen Beispielplänen
   ===================================================================== */
function testGrunddaten() {
  const D = 5, H = 9;
  const verf = () => Array.from({ length: D }, () => Array(H).fill(1));
  return normalisiere({
    schule: { name: 'Test', schuljahr: 'T', tage: ['Mo', 'Di', 'Mi', 'Do', 'Fr'], stunden: vorlageRaster('45') },
    faecher: [
      { id: 'ma', kuerzel: 'Ma', name: 'Mathe', raumTyp: 'klassenraum', doppelstunde: 'egal', maxProTag: 2, schwer: true },
      { id: 'de', kuerzel: 'De', name: 'Deutsch', raumTyp: 'klassenraum', doppelstunde: 'egal', maxProTag: 1, schwer: true },
      { id: 'sp', kuerzel: 'Sp', name: 'Sport', raumTyp: 'sporthalle', doppelstunde: 'egal', maxProTag: 2, schwer: false },
      { id: 'ch', kuerzel: 'Ch', name: 'Chemie', raumTyp: 'chemie', doppelstunde: 'egal', maxProTag: 2, schwer: false }
    ],
    raeume: [
      { id: 'r1', name: 'R1', typ: 'klassenraum', kapazitaet: 30, heimatKlasse: 'k1' },
      { id: 'r2', name: 'R2', typ: 'klassenraum', kapazitaet: 30, heimatKlasse: 'k2' },
      { id: 'halle', name: 'Halle', typ: 'sporthalle', kapazitaet: 60, teilbar: 2 },
      { id: 'chem', name: 'Chem', typ: 'chemie', kapazitaet: 30 }
    ],
    klassen: [
      { id: 'k1', name: 'K1', jahrgang: 5, heimatraum: 'r1', schueler: 20, fruehestens: 1, spaetestens: 8, maxStundenTag: 8, gruppen: [{ id: 'g1', name: 'G1', schueler: 10 }, { id: 'g2', name: 'G2', schueler: 10 }] },
      { id: 'k2', name: 'K2', jahrgang: 8, heimatraum: 'r2', schueler: 20, fruehestens: 1, spaetestens: 8, maxStundenTag: 8 }
    ],
    lehrer: [
      { id: 'A', kuerzel: 'A', name: 'A', faecher: ['ma', 'de'], verfuegbarkeit: verf(), maxStundenTag: 8, maxHohlstundenTag: 1 },
      { id: 'B', kuerzel: 'B', name: 'B', faecher: ['de', 'sp'], verfuegbarkeit: verf(), maxStundenTag: 8, maxHohlstundenTag: 1 },
      { id: 'C', kuerzel: 'C', name: 'C', faecher: [], verfuegbarkeit: verf(), maxStundenTag: 8, maxHohlstundenTag: 1 }
    ],
    unterrichte: []
  });
}
function uT(id, fach, klassen, lehrer, ws, extra) {
  return Object.assign({ id, fach, klassen, gruppen: [], lehrkraefte: lehrer.map(l => typeof l === 'string' ? { lehrer: l, rolle: 'fach', modus: 'immer' } : l), wochenstunden: ws, bloecke: [], raum: '', rhythmus: 'jede', kopplung: null, fixiert: [] }, extra || {});
}
function testSzenario(mod, platz) {
  const d = testGrunddaten();
  mod(d);
  d.plan.platzierungen = (platz || []).map(p => ({ unterricht: p[0], blockNr: p[1], tag: p[2], stunde: p[3], dauer: p[4] || 1, raum: p[5] || null, gesperrt: false, co: p[6] || [] }));
  const dn = normalisiere(d);
  const opt = d._opt || {};
  const M = kompiliere(dn, opt);
  const P = new Plan(M);
  P.lade(dn.plan.platzierungen, true);
  P.initKosten();
  return { M, P };
}
function selbsttestFaelle() {
  const f = [];
  const T = (id, beschr, mod, platz, erwartet, gegen) => f.push({ id, beschr, mod, platz, erwartet, gegen });
  // gegen = zweites Szenario (regelkonform, erwartet 0)
  T('H01', 'Lehrkraft A in K1 und K2 gleichzeitig', d => { d.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1), uT('u2', 'de', ['k2'], ['A'], 1)]; }, [['u1', 1, 0, 1], ['u2', 1, 0, 1]], 1,
    [['u1', 1, 0, 1], ['u2', 1, 0, 2]]);
  T('H02', 'Klasse K1 doppelt, Gruppen G1/G2 parallel erlaubt', d => { d.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1), uT('u2', 'de', ['k1'], ['B'], 1), uT('u3', 'ma', ['k1'], ['A'], 1, { gruppen: ['g1'] }), uT('u4', 'de', ['k1'], ['B'], 1, { gruppen: ['g2'] })]; }, [['u1', 1, 0, 1], ['u2', 1, 0, 1]], 1,
    [['u3', 1, 1, 1], ['u4', 1, 1, 1]]);
  T('H03', 'Zwei Unterrichte im selben Chemieraum', d => { d.unterrichte = [uT('u1', 'ch', ['k1'], ['A'], 1), uT('u2', 'ch', ['k2'], ['B'], 1)]; }, [['u1', 1, 0, 1, 1, 'chem'], ['u2', 1, 0, 1, 1, 'chem']], 1,
    [['u1', 1, 0, 1, 1, 'chem'], ['u2', 1, 0, 2, 1, 'chem']]);
  T('H04', 'Unterricht mit 2 Std., nur ein Block platziert', d => { d.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 2)]; }, [['u1', 1, 0, 1]], 1, [['u1', 1, 0, 1], ['u1', 2, 1, 1]]);
  T('H05', 'Lehrkraft A ist Mo 1. Std. gesperrt', d => { d.lehrer[0].verfuegbarkeit[0][0] = 0; d.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1)]; }, [['u1', 1, 0, 1]], 1, [['u1', 1, 0, 2]]);
  T('H06', 'Chemie im Klassenraum', d => { d.unterrichte = [uT('u1', 'ch', ['k1'], ['A'], 1)]; }, [['u1', 1, 0, 1, 1, 'r1']], 1, [['u1', 1, 0, 1, 1, 'chem']]);
  T('H07', 'Doppelblock beginnt in der 2. Stunde', d => { d.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 2, { bloecke: [2] })]; }, [['u1', 1, 0, 2, 2]], 1, [['u1', 1, 0, 1, 2]]);
  T('H08', 'Kopplung ungleich lang → nicht zeitgleich', d => { d.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1, { gruppen: ['g1'], kopplung: 'x' }), uT('u2', 'de', ['k1'], ['B'], 2, { gruppen: ['g2'], kopplung: 'x' })]; }, [['u1', 1, 0, 1], ['u2', 1, 1, 1], ['u2', 2, 2, 1]], 1, null);
  T('H09', 'Fixiert auf Mo 1., liegt aber Di 1.', d => { d.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1, { fixiert: [{ tag: 0, stunde: 1 }] })]; }, [['u1', 1, 1, 1]], 1, [['u1', 1, 0, 1]]);
  T('H10', 'Unterricht in der Mittagspause', d => { d.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1)]; }, [['u1', 1, 0, 7]], 1, [['u1', 1, 0, 6]]);
  T('H11', 'Klasse bis 4. Std., Unterricht in der 5.', d => { d.klassen[0].spaetestens = 4; d.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1)]; }, [['u1', 1, 0, 5]], 1, [['u1', 1, 0, 4]]);
  T('H12', 'Lehrkraft max. 2 Std./Tag, hat 3', d => { d.lehrer[0].maxStundenTag = 2; d.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 2, { bloecke: [2] }), uT('u2', 'de', ['k2'], ['A'], 1)]; }, [['u1', 1, 0, 1, 2], ['u2', 1, 0, 3]], 1, [['u1', 1, 0, 1, 2], ['u2', 1, 1, 3]]);
  T('H13', 'Klasse K1: Mathe höchstens 1× je Tag (eigener Wert der Klasse), zweimal am Montag', d => { d.klassen[0].maxProTag = { ma: 1 }; d.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1), uT('u2', 'ma', ['k1'], ['A'], 1)]; }, [['u1', 1, 0, 1], ['u2', 1, 0, 2]], 1, [['u1', 1, 0, 1], ['u2', 1, 1, 1]]);
  T('H13', 'Deutsch (max. 1/Tag) zweimal am Montag', d => { d.unterrichte = [uT('u1', 'de', ['k1'], ['A'], 1), uT('u2', 'de', ['k1'], ['B'], 1)]; }, [['u1', 1, 0, 1], ['u2', 1, 0, 2]], 1, [['u1', 1, 0, 1], ['u2', 1, 1, 1]]);
  T('H14', 'Woche-A-Unterricht an Schule ohne A/B', d => { d.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1, { rhythmus: 'A' })]; }, [['u1', 1, 0, 1]], 1, null);
  T('H15', 'Klasse hat Mo 1. und 3. Stunde (Lücke)', d => { d.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1), uT('u2', 'de', ['k1'], ['B'], 1)]; }, [['u1', 1, 0, 1], ['u2', 1, 0, 3]], 1, [['u1', 1, 0, 1], ['u2', 1, 0, 2]]);
  T('H16', 'Höchstens 1,5 h Arbeitszeit je Tag, Mo drei Stunden', d => { d.lehrer[0].maxArbeitTag = 1.5; d.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1), uT('u2', 'de', ['k1'], ['A'], 1), uT('u3', 'ma', ['k2'], ['A'], 1)]; }, [['u1', 1, 0, 1], ['u2', 1, 0, 2], ['u3', 1, 0, 3]], 1, [['u1', 1, 0, 1], ['u2', 1, 0, 2], ['u3', 1, 1, 1]]);
  T('W01', 'Lehrkraft A: Stunde 1 und 4 (2 Lücken, max. 1)', d => { d.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1), uT('u2', 'ma', ['k2'], ['A'], 1)]; }, [['u1', 1, 0, 1], ['u2', 1, 0, 4]], 4, [['u1', 1, 0, 1], ['u2', 1, 0, 2]]);
  T('W02', '„Klassen ohne Freistunden“ weich: Lücke zählt als „Freistunden der Klassen vermeiden“', d => { d.regeln.hartUmschaltbar.H15 = 'weich'; d.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1), uT('u2', 'de', ['k1'], ['B'], 1)]; }, [['u1', 1, 0, 1], ['u2', 1, 0, 3]], 1, [['u1', 1, 0, 1], ['u2', 1, 0, 2]]);
  T('W03', 'Unterricht im Ungern-Slot', d => { d.lehrer[0].verfuegbarkeit[0][0] = -1; d.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1)]; }, [['u1', 1, 0, 1]], 1, [['u1', 1, 0, 2]]);
  T('W04', 'Wunsch-Slot Mo 1., Unterricht Mo 2.', d => { d.lehrer[0].verfuegbarkeit[0][0] = 2; d.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1)]; }, [['u1', 1, 0, 2]], 1, [['u1', 1, 0, 1]]);
  T('W05', 'Unterricht am Wunsch-freien Freitag', d => { d.lehrer[0].freierTagWunsch = [4]; d.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1)]; }, [['u1', 1, 4, 1]], 1, [['u1', 1, 0, 1]]);
  T('W06', 'Zwei Deutsch-Unterrichte am selben Tag', d => { d.faecher[1].maxProTag = 2; d.unterrichte = [uT('u1', 'de', ['k1'], ['A'], 1), uT('u2', 'de', ['k1'], ['B'], 1)]; }, [['u1', 1, 0, 1], ['u2', 1, 0, 2]], 1, [['u1', 1, 0, 1], ['u2', 1, 1, 1]]);
  T('W07', 'Mathe (Kernfach) in der 5. Stunde', d => { d.unterrichte = [uT('u1', 'ma', ['k2'], ['A'], 1)]; }, [['u1', 1, 0, 5]], 1, [['u1', 1, 0, 4]]);
  T('W08', 'Fach „bevorzugt“ mit Einzelstunden 1+1', d => { d.faecher[0].doppelstunde = 'bevorzugt'; d.unterrichte = [uT('u1', 'ma', ['k2'], ['A'], 2, { bloecke: [1, 1] })]; }, [['u1', 1, 0, 1], ['u1', 2, 1, 1]], 1, null);
  T('W09', 'Mathe und Deutsch (Kernfächer) direkt hintereinander', d => { d.unterrichte = [uT('u1', 'ma', ['k2'], ['A'], 1), uT('u2', 'de', ['k2'], ['B'], 1)]; }, [['u1', 1, 0, 1], ['u2', 1, 0, 2]], 1, [['u1', 1, 0, 1], ['u2', 1, 0, 3]]);
  T('W10', 'Raumwechsel R2 → Chemie', d => { d.unterrichte = [uT('u1', 'ma', ['k2'], ['A'], 1), uT('u2', 'ch', ['k2'], ['B'], 1)]; }, [['u1', 1, 0, 1, 1, 'r2'], ['u2', 1, 0, 2, 1, 'chem']], 1, [['u1', 1, 0, 1, 1, 'r2'], ['u2', 1, 0, 3, 1, 'chem']]);
  T('W11', 'Lehrkraft: 2 Std. am Mo, sonst nichts', d => { d.unterrichte = [uT('u1', 'ma', ['k2'], ['A'], 2, { bloecke: [2] })]; }, [['u1', 1, 0, 1, 2]], 3.2, null);
  T('W12', 'Mo bis zur 7., Di ab der 1. Stunde', d => { d.unterrichte = [uT('u1', 'ma', ['k2'], ['A'], 1), uT('u2', 'de', ['k1'], ['A'], 1)]; }, [['u1', 1, 0, 8], ['u2', 1, 1, 1]], 1, [['u1', 1, 0, 8], ['u2', 1, 1, 2]]);
  T('W13', 'Klasse 5 in der 7. Stunde', d => { d.unterrichte = [uT('u1', 'sp', ['k1'], ['B'], 1)]; }, [['u1', 1, 0, 8, 1, 'halle']], 1, [['u1', 1, 0, 1, 1, 'halle']]);
  T('W14', 'Co anteilig 1 Std., aber nicht eingeteilt', d => { d.unterrichte = [uT('u1', 'ma', ['k2'], ['A', { lehrer: 'C', rolle: 'co', modus: 'anteilig', stundenAnteil: 1 }], 2, { bloecke: [1, 1] })]; }, [['u1', 1, 0, 1], ['u1', 2, 1, 1]], 1,
    [['u1', 1, 0, 1, 1, null, ['C']], ['u1', 2, 1, 1]]);
  T('W15', 'Klassenleitung A: nur Di (2.), Mo nicht', d => { d.lehrer[0].klassenleitung = 'k2'; d.unterrichte = [uT('u1', 'ma', ['k2'], ['A'], 1), uT('u2', 'de', ['k2'], ['B'], 1)]; }, [['u2', 1, 0, 1], ['u1', 1, 1, 2]], 2, null);
  T('W18', 'Klassenleitung A kann Deutsch (Kernfach), Deutsch der K2 (2 Std.) hat aber B', d => { d.lehrer[0].klassenleitung = 'k2'; d.unterrichte = [uT('u1', 'de', ['k2'], [{ lehrer: 'B', rolle: 'fach', modus: 'immer', auto: true }], 2, { fachAuto: true })]; }, [['u1', 1, 0, 1], ['u1', 2, 1, 1]], 2, null);
  T('W16', 'Änderungen minimal: Unterricht verschoben', d => { d.unterrichte = [uT('u1', 'ma', ['k2'], ['A'], 1)]; d._opt = { minimal: true, referenz: new Map([['u1|1', 0]]) }; }, [['u1', 1, 1, 1]], 1, [['u1', 1, 0, 1]]);
  return f;
}
function selbsttest() {
  const erg = [];
  for (const fall of selbsttestFaelle()) {
    let ok = false, info = '';
    try {
      const a = testSzenario(fall.mod, fall.platz);
      const v = pruefeRegel(fall.id, a.M, a.P);
      ok = Math.abs(v - fall.erwartet) < 1e-6;
      info = 'erwartet ' + fall.erwartet + ', gezählt ' + Math.round(v * 100) / 100;
      if (fall.gegen) {
        const b = testSzenario(fall.mod, fall.gegen);
        const v2 = pruefeRegel(fall.id, b.M, b.P);
        if (Math.abs(v2) > 1e-6) ok = false;
        info += '; regelkonformer Plan: ' + Math.round(v2 * 100) / 100 + ' (erwartet 0)';
      }
    } catch (err) { ok = false; info = 'Fehler: ' + err.message; }
    erg.push({ id: fall.id, name: REGELN[RI[fall.id]].name, beschr: fall.beschr, ok, info });
  }
  return erg;
}
// Tests für Arbeitszeit, Co-Kräfte, A/B-Blöcke und Aufsichten
function selbsttestZusatz() {
  const erg = [];
  const T = (id, name, beschr, fn) => { let ok = false, info = ''; try { const r = fn(); ok = r[0]; info = r[1]; } catch (err) { info = 'Fehler: ' + err.message; } erg.push({ id, name, beschr, ok, info }); };
  const basis = mod => { const d = testGrunddaten(); mod(d); return normalisiere(d); };
  const az = (d, kz) => arbeitszeiten(d).liste.find(x => x.lehrer === kz);
  const pl = (u, b, tag, st, dauer) => ({ unterricht: u, blockNr: b, tag, stunde: st, dauer: dauer || 1 });
  T('Z1', 'Arbeitszeit Fachlehrkraft', '1 Stunde (45 min) mit Vorbereitung = 45 + 35 min', () => {
    const d = basis(x => { x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1)]; x.plan = { platzierungen: [{ unterricht: 'u1', blockNr: 1, tag: 0, stunde: 1, dauer: 1 }] }; });
    const a = az(d, 'A'); const v = a.unterricht + a.vorb; return [Math.abs(v - 80) < 1e-6, 'gezählt ' + v + ' min, erwartet 80'];
  });
  T('Z2', 'Arbeitszeit Co-Lehrkraft', '1 Stunde als Co = 45 + 17 min', () => {
    const d = basis(x => { x.unterrichte = [uT('u1', 'ma', ['k1'], ['A', { lehrer: 'C', rolle: 'co', modus: 'immer' }], 1)]; x.plan = { platzierungen: [{ unterricht: 'u1', blockNr: 1, tag: 0, stunde: 1, dauer: 1 }] }; });
    const c = az(d, 'C'); const v = c.co + c.coVorb; return [Math.abs(v - 62) < 1e-6, 'gezählt ' + v + ' min, erwartet 62'];
  });
  T('Z3', 'Klassenleitung', 'Klassenleitung zählt 90 min Vorbereitung', () => {
    const d = basis(x => { x.lehrer[0].klassenleitung = 'k1'; }); const a = az(d, 'A'); return [a.kl === 90, 'gezählt ' + a.kl + ' min'];
  });
  T('Z4', 'Stunde ohne Vorbereitung', 'Häkchen „Vorbereitung“ aus → nur 45 min', () => {
    const d = basis(x => { x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1, { vorbereitung: false })]; x.plan = { platzierungen: [{ unterricht: 'u1', blockNr: 1, tag: 0, stunde: 1, dauer: 1 }] }; });
    const a = az(d, 'A'); return [a.vorb === 0 && a.unterricht === 45, 'Unterricht ' + a.unterricht + ', Vorbereitung ' + a.vorb];
  });
  T('Z5', 'Doppelstundenpflicht bei ungerader Stundenzahl', 'Chemie (pflicht), 3 Std. → eine Doppelstunde jede Woche + eine im Wechsel (2 + 2A) – auch ohne eingeschalteten A/B-Rhythmus; nie eine Einzelstunde', () => {
    const mk = ab => basis(x => { if (ab) x.schule.wochenrhythmus = 'AB'; x.faecher[3].doppelstunde = 'pflicht'; x.unterrichte = [uT('u1', 'ch', ['k1'], ['A'], 3)]; x.plan = { platzierungen: [{ unterricht: 'u1', blockNr: 1, tag: 0, stunde: 1, dauer: 2 }, { unterricht: 'u1', blockNr: 2, tag: 1, stunde: 1, dauer: 2 }] }; });
    const M = kompiliere(mk(true)), U = M.U[0], M2 = kompiliere(mk(false)), U2 = M2.U[0];
    const x = planAusDaten(mk(false)), tot = bewerteAlles(x.M, x.P, null); let hart = 0; for (const r of x.M.hartIdx) hart += tot[r];
    const w = machbarkeit(mk(false)).some(m => m.stufe === 'hinweis' && m.text.includes('nur in Woche'));
    return [U.bloecke.join(',') === '2,2' && U.blockWoche.join(',') === 'jede,A' && U2.bloecke.join(',') === '2,2' && U2.blockWoche.join(',') === 'jede,A' && !M.fehler.length && !M2.fehler.length && hart === 0 && w, 'Blöcke ' + U2.bloecke.join('+') + ' / ' + U2.blockWoche.join('+') + ' (ohne A/B-Rhythmus der Schule), harte Verstöße im Plan ' + hart + ', Hinweis in der Prüfung: ' + (w ? 'ja' : 'nein')];
  });
  T('Z6', 'Co-Lehrkräfte ergänzen (nach dem Plan)', 'Fach mit Co-Häkchen: Die Berechnung ergänzt die Co-Lehrkraft blockweise auf dem fertigen Plan – eine Co-Kraft aus dem Klassenteam vor einer Co-Kraft außerhalb; Fächer ohne Häkchen bekommen keine', () => {
    const d = basis(x => {
      x.faecher[0].coBedarf = true;
      x.lehrer.push({ id: 'P', kuerzel: 'P', name: 'P', ausgebildet: false, coFaecher: ['ma'], arbeitszeit: 30 }, { id: 'Q', kuerzel: 'Q', name: 'Q', ausgebildet: false, coFaecher: ['ma'], arbeitszeit: 30 });
      x.klassen[1].team = ['P'];
      x.unterrichte = [uT('u1', 'ma', ['k2'], ['A'], 2, { bloecke: [1, 1] }), uT('u2', 'de', ['k2'], ['B'], 2, { bloecke: [1, 1] })];
      x.plan = { platzierungen: [pl('u1', 1, 0, 1), pl('u1', 2, 1, 1), pl('u2', 1, 0, 2), pl('u2', 2, 1, 2)] };
    });
    const r = coNachPlanErgaenzen(d);
    const co = d.unterrichte[0].lehrkraefte.find(z => z.rolle === 'co');
    return [co && co.lehrer === 'P' && co.auto && !d.unterrichte[1].lehrkraefte.some(z => z.rolle === 'co') && !r.fehlend.length, 'Co für Ma: ' + (co ? co.lehrer : '–') + ', De ohne Häkchen: ' + (d.unterrichte[1].lehrkraefte.some(z => z.rolle === 'co') ? 'mit Co' : 'ohne Co') + ' (' + r.ergaenzt.join('; ') + ')'];
  });
  T('Z7', 'Co-Kraft nicht als Lehrkraft', 'Nicht ausgebildete Kraft als Fachlehrkraft → Fehler', () => {
    const d = basis(x => { x.lehrer[2].ausgebildet = false; x.unterrichte = [uT('u1', 'ma', ['k1'], ['C'], 1)]; });
    const f = kompiliere(d).fehler.some(x => x.text.includes('keine ausgebildete Lehrkraft'));
    return [f, f ? 'Fehler gemeldet' : 'kein Fehler'];
  });
  T('Z9', 'Co-Kraft mit Zwang', 'Nicht ausgebildete Kraft als Fachlehrkraft mit „Zwang“ → kein Fehler, nur Warnung', () => {
    const d = basis(x => { x.lehrer[2].ausgebildet = false; x.unterrichte = [uT('u1', 'ma', ['k1'], [{ lehrer: 'C', rolle: 'fach', modus: 'immer', zwang: true }], 1)]; });
    const f = kompiliere(d).fehler.length, w = machbarkeit(d).some(x => x.stufe === 'warnung' && x.text.includes('Zwang'));
    return [f === 0 && w, 'Fehler: ' + f + ', Warnung „Zwang“: ' + (w ? 'ja' : 'nein')];
  });
  T('Z10', 'Unterrichtsschluss je Tag', 'Montag nur bis zur 2. Stunde: 3. Stunde am Montag unzulässig', () => {
    const d = basis(x => { x.schule.tagSchluss = { Mo: 2 }; x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1)]; x.plan = { platzierungen: [{ unterricht: 'u1', blockNr: 1, tag: 0, stunde: 3, dauer: 1 }] }; });
    const M = kompiliere(d); const P = planAusDaten(d).P; const tot = bewerteAlles(M, P, null);
    const erlaubt = M.E[0].erlaubt.filter(s => s < M.H).map(s => M.lnr[s]);
    return [tot[RI.H10] === 1 && erlaubt.every(n => n <= 2), 'Verstöße gegen „Keine Pausen, Unterrichtsschluss“: ' + tot[RI.H10] + ', erlaubte Stunden am Montag: ' + erlaubt.join(', ')];
  });
  T('Z11', 'Unterrichtsdeputat (optional)', 'Option an: Das Deputat ist eine Höchstzahl – darüber Warnung, darunter nicht; es begrenzt das Ergänzen von Co-Lehrkräften. Option aus: nur die Arbeitszeit zählt', () => {
    const mk = (an, ws) => basis(x => { x.schule.arbeitszeitModell = { stundenSoll: an }; x.lehrer[0].deputat = 3; x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], ws, { bloecke: Array(ws).fill(1) })]; });
    const warnt = d => machbarkeit(d).some(x => x.stufe === 'warnung' && x.text.startsWith('Unterrichtsdeputat A'));
    const wUeber = warnt(mk(true, 4)), wUnter = warnt(mk(true, 1)), wAus = warnt(mk(false, 4));
    const mk2 = an => basis(x => { x.schule.arbeitszeitModell = { stundenSoll: an }; x.faecher[0].coBedarf = true; x.lehrer.push({ id: 'P', kuerzel: 'P', name: 'P', ausgebildet: false, coFaecher: ['ma'], arbeitszeit: 30, deputat: 1 }); x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 2, { bloecke: [1, 1] })]; x.plan = { platzierungen: [pl('u1', 1, 0, 1), pl('u1', 2, 1, 1)] }; });
    const bloecke = d => { coNachPlanErgaenzen(d); return d.plan.platzierungen.filter(p => p.co.includes('P')).length + (d.unterrichte[0].lehrkraefte.some(z => z.lehrer === 'P' && z.modus === 'immer') ? 2 : 0); };
    const nAn = bloecke(mk2(true)), nAus = bloecke(mk2(false));
    return [wUeber && !wUnter && !wAus && nAn === 1 && nAus === 2, 'Warnung über dem Deputat: ' + (wUeber ? 'ja' : 'nein') + ', darunter: ' + (wUnter ? 'ja' : 'nein') + ', ohne Option: ' + (wAus ? 'ja' : 'nein') + '; Co-Kraft mit Deputat 1 für 2 Einzelstunden: mit Option ' + nAn + ' Block, ohne Option ' + nAus + ' Blöcke'];
  });
  T('Z12', 'Aufgabe ohne Klasse', 'Aufgabe (1 Std., Person A) ist gültig, belegt A und zählt zur Arbeitszeit', () => {
    const d = basis(x => { x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1), { id: 'a1', aufgabe: true, name: 'Medien', lehrkraefte: [{ lehrer: 'A', rolle: 'fach' }], wochenstunden: 1, klassen: [], fach: '' }];
      x.plan = { platzierungen: [{ unterricht: 'u1', blockNr: 1, tag: 0, stunde: 1, dauer: 1 }, { unterricht: 'a1', blockNr: 1, tag: 0, stunde: 1, dauer: 1 }] }; });
    const M = kompiliere(d); const P = planAusDaten(d).P; const tot = bewerteAlles(M, P, null);
    const a = arbeitszeiten(d).liste.find(x => x.lehrer === 'A');
    return [!M.fehler.length && tot[RI.H01] > 0 && a.aufgaben === 45 && a.istStd === 2, 'Fehler: ' + M.fehler.length + ', „Lehrkraft nicht doppelt belegt“: ' + tot[RI.H01] + ', Aufgabenzeit ' + a.aufgaben + ' min, Ist-Stunden ' + a.istStd];
  });
  T('Z14', 'Pausen benennen', 'Pausenzeile „Mittagspause“ und Lücke „Große Pause“ erscheinen mit Namen', () => {
    const d = basis(x => { x.schule.stunden[6].name = 'Mittagspause'; x.schule.stunden[1].pauseName = 'Große Pause'; });
    const p = pausenListe(d.schule);
    const ok = p.some(x => x.key === 'p6' && x.kurz === 'Mittagspause') && p.some(x => x.key === 'n1' && x.kurz === 'Große Pause');
    return [ok, p.map(x => x.key + ': ' + x.kurz).join(', ')];
  });
  T('Z15', 'Co-Fächer und Klassenteam', 'Co-Fach erlaubt nur die Co-Rolle; das Klassenteam geht vor – hat es keine Zeit, kommt eine andere Person mit dem Co-Fach; ohne Co-Fach nie', () => {
    const d = basis(x => {
      x.faecher[0].coBedarf = true;
      // P: Co-Kraft im Team von k1, aber ohne freie Arbeitszeit; Q: Lehrkraft mit Ma nur als Co-Fach, nicht im Team; B ohne Co-Fach
      x.lehrer.push({ id: 'P', kuerzel: 'P', name: 'P', ausgebildet: false, faecher: [], coFaecher: ['ma'], arbeitszeit: 0 }, { id: 'Q', kuerzel: 'Q', name: 'Q', ausgebildet: true, faecher: ['de'], coFaecher: ['ma'], arbeitszeit: 30 });
      x.klassen[0].team = ['P', 'B'];
      x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 2, { bloecke: [1, 1] })];
      x.plan = { platzierungen: [pl('u1', 1, 0, 1), pl('u1', 2, 1, 1)] };
    });
    const q = d.lehrer.find(l => l.id === 'Q');
    const rollen = fachBefaehigt(q, 'ma') === false && coBefaehigt(q, 'ma') === true && coBefaehigt(q, 'sp') === false;
    coNachPlanErgaenzen(d);
    const co = d.unterrichte[0].lehrkraefte.filter(z => z.rolle === 'co').map(z => z.lehrer);
    return [rollen && co.length === 1 && co[0] === 'Q', 'Rollen ' + (rollen ? 'ok' : 'falsch') + ', Co: ' + (co.join('+') || '–') + ' (Team-Co-Kraft P ohne Arbeitszeit, B ohne Co-Fach)'];
  });
  T('Z16', 'Lehrkraft und Co im selben Fach', 'Ein Fach kann als Lehrkraft und als Co angehakt sein; ohne Co-Haken keine Co-Rolle', () => {
    const d = basis(x => { x.lehrer.push({ id: 'Q', kuerzel: 'Q', name: 'Q', faecher: ['ma'], coFaecher: ['ma', 'de'] }); });
    const q = d.lehrer.find(l => l.id === 'Q'), a = d.lehrer.find(l => l.id === 'A');
    const beides = fachBefaehigt(q, 'ma') && coBefaehigt(q, 'ma') && !fachBefaehigt(q, 'de') && coBefaehigt(q, 'de') && fachBefaehigt(a, 'ma') && !coBefaehigt(a, 'ma');
    return [beides, 'Lehrkraft + Co getrennt: ' + (beides ? 'ok' : 'falsch')];
  });
  T('Z17', 'Lehrkräfte nur notfalls als Co', 'Co-Kraft vor Lehrkraft; fällt sie aus, eine Lehrkraft mit Co-Fach (bei Wichtung 10 die Klassenleitung zuerst, sonst entscheidet der Ausgleich Soll/Ist); Regel „nie“ und Wichtung 0 bei begrenztem Deputat wirken', () => {
    const mk = (mod) => basis(x => {
      x.faecher[0].coBedarf = true;
      x.lehrer[0].coFaecher = ['ma']; x.lehrer[1].coFaecher = ['ma']; x.lehrer[1].klassenleitung = 'k1';
      x.lehrer.push({ id: 'P', kuerzel: 'P', name: 'P', ausgebildet: false, coFaecher: ['ma'], arbeitszeit: 30 });
      x.lehrer[2].faecher = ['ma'];
      x.klassen[0].team = ['P', 'A', 'B'];
      x.unterrichte = [uT('u1', 'ma', ['k1'], ['C'], 2, { bloecke: [1, 1] })];
      x.plan = { platzierungen: [pl('u1', 1, 0, 1), pl('u1', 2, 1, 1)] };
      if (mod) mod(x);
    });
    const wer = d => { coNachPlanErgaenzen(d); return d.unterrichte[0].lehrkraefte.filter(q => q.rolle === 'co').map(q => q.lehrer).join('+') || '–'; };
    const ohneP = x => { x.lehrer.find(l => l.id === 'P').arbeitszeit = 0; };
    const a = wer(mk()), b = wer(mk(x => { ohneP(x); x.schule.coRegeln = { wichtung: 10 }; })), c = wer(mk(x => { ohneP(x); x.schule.coRegeln = { lehrkraefte: 'nie' }; }));
    const w0 = wer(mk(x => { ohneP(x); x.schule.arbeitszeitModell = { stundenSoll: true }; x.lehrer[0].deputat = 10; x.lehrer[1].deputat = 10; x.schule.coRegeln = { wichtung: 0 }; }));
    return [a === 'P' && b === 'B' && c === '–' && w0 === '–', 'mit Co-Kraft: ' + a + ', ohne: ' + b + ' (Klassenleitung), Regel „nie“: ' + c + ', Wichtung 0 mit Deputat: ' + w0];
  });
  // Aufsichtsbedarf in der Pause nach der 2. Stunde (n1) an den angegebenen Tagen
  const pauseDienst = (x, tage, min) => { const iv = pausenIntervall(normalisiere(JSON.parse(JSON.stringify(x))).schule, 'n1'); return { bereiche: [{ id: 'hof', name: 'Hof' }], bedarfe: tage.map(tag => ({ tag, typ: 'dt_pause', bereich: 'hof', name: 'Große Pause', abschnitte: [{ beginn: zeitText(iv.start), ende: zeitText(iv.end), min, soll: min }] })), plan: [] }; };
  const profilK1 = { id: 'zp1', name: 'Block', bloecke: [{ von: 1, bis: 2, beginn: '08:00', ende: '09:30' }, { von: 3, bis: 4, beginn: '09:50', ende: '11:20' }] };
  T('Z18', 'Zeitprofil für Klasse und Fach', 'Das Profil einer Klasse gilt für ihren Unterricht, das Profil eines Fachs in allen Klassen und mit Vorrang', () => {
    const d = basis(x => {
      x.schule.zeitprofile = [profilK1, { id: 'zpS', name: 'Sport', faecher: ['sp'], bloecke: [{ von: 1, bis: 2, beginn: '07:00', ende: '08:30' }] }];
      x.klassen[0].zeitprofil = 'zp1';
      x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1), uT('u2', 'sp', ['k1'], ['B'], 1), uT('u3', 'ma', ['k2'], ['A'], 1)];
      x.plan = { platzierungen: [pl('u1', 1, 0, 1), pl('u2', 1, 1, 1), pl('u3', 1, 2, 1)] };
    });
    const iv = i => unterrichtsIntervall(d, d.plan.platzierungen[i]).beginn;
    return [iv(0) === '08:00' && iv(1) === '07:00' && iv(2) === '07:30', 'Ma K1 (Profil der Klasse): ' + iv(0) + ', Sp K1 (Profil des Fachs): ' + iv(1) + ', Ma K2 (Schulraster): ' + iv(2)];
  });
  T('Z20', 'Aufgabe mit Termin in der Pause', 'Termine zählen zur Arbeitszeit, sperren überlappende Stunden und schließen die Aufsicht aus', () => {
    const d = basis(x => {
      x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 2, { bloecke: [1, 1] }), uT('u2', 'de', ['k2'], ['B'], 2, { bloecke: [1, 1] }),
        { id: 'a1', aufgabe: true, name: 'Besprechung', fach: '', klassen: [], lehrkraefte: [{ lehrer: 'A', rolle: 'fach' }], wochenstunden: 0, termine: [{ tag: 0, pause: 'n1' }, { tag: 1, beginn: '14:00', ende: '15:00' }] }];
      x.plan = { platzierungen: [pl('u1', 1, 0, 2), pl('u1', 2, 0, 3), pl('u2', 1, 0, 2), pl('u2', 2, 0, 3)] };
      x.lehrer[2].aufsicht = false;
      x.dienste = pauseDienst(x, [0], 1);
    });
    const a = az(d, 'A'), M = kompiliere(d, {}), r = dienstePlanen(d, { zeitlimit: 200 });
    const gesperrt = [7, 8].every(h => M.lVerf[0 * M.S + 1 * M.H + h] === 0) && M.lVerf[0 * M.S + 1 * M.H + 5] !== 0 && M.lVerf[0 * M.S + 0 * M.H + 1] !== 0;
    const wer = r.plan.map(x => x.lehrer).join();
    return [!M.fehler.length && a.aufgaben === 80 && gesperrt && wer === 'B', 'Aufgabenzeit ' + a.aufgaben + ' min (20 + 60), Di 7.–8. Std. belegt: ' + gesperrt + ', Aufsicht in der Pause: ' + wer + ' (nicht A)'];
  });
  T('Z21', 'Offene Punkte', 'Nicht platziert, ohne Fachlehrkraft, ohne Raum und Co-Bedarf ohne Co-Lehrkraft werden gefunden', () => {
    const d = basis(x => {
      x.faecher[0].coBedarf = true;
      x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 2, { bloecke: [1, 1] }), uT('u2', 'ch', ['k2'], ['B'], 1), uT('u3', 'de', ['k2'], [], 1)];
      x.plan = { platzierungen: [Object.assign(pl('u1', 1, 0, 1), { raum: 'r1' }), pl('u2', 1, 0, 2)] };
    });
    const g = offenePunkte(d), n = art => (g.find(x => x.art === art) || { eintraege: [] }).eintraege.length;
    return [n('ablage') === 2 && n('lehrkraft') === 1 && n('raum') === 1 && n('co') === 1, 'Ablage ' + n('ablage') + ', ohne Lehrkraft ' + n('lehrkraft') + ', ohne Raum ' + n('raum') + ', ohne Co ' + n('co')];
  });
  T('Z22', 'Wochenarbeitszeit als harte Grenze', 'Übersteigen die fest eingetragenen Stunden die Wochenarbeitszeit, meldet die Prüfung das vorab – auf „weich“ gestellt nicht als Verstoß', () => {
    const mk = weich => basis(x => { x.lehrer[0].arbeitszeit = 2; if (weich) x.regeln.hartUmschaltbar.H16 = 'weich'; x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 2, { bloecke: [1, 1] })]; });
    const warnH = machbarkeit(mk(false)).some(x => x.stufe === 'warnung' && x.text.startsWith('Arbeitszeit A') && x.text.includes('Die Grenze lässt sich so nicht einhalten'));
    const warnW = machbarkeit(mk(true)).some(x => x.stufe === 'warnung' && x.text.startsWith('Arbeitszeit A') && x.text.includes('Die Grenze lässt sich so nicht einhalten'));
    const d = mk(false); d.plan.platzierungen = [pl('u1', 1, 0, 1), pl('u1', 2, 1, 1)];
    const x = planAusDaten(d), h16 = bewerteAlles(x.M, x.P, null)[RI.H16];
    return [warnH && !warnW && h16 > 0, '2 Stunden zu je 80 min bei 2 h Wochenarbeitszeit: Warnung mit „Arbeitszeitgrenzen“ hart ' + (warnH ? 'ja' : 'nein') + ', weich ' + (warnW ? 'ja' : 'nein') + '; im Plan „Arbeitszeitgrenzen“ = ' + h16];
  });
  T('Z23', 'Zeitprofile überschneiden sich', 'Zwei verschiedene Rasterstunden können sich durch Zeitprofile real überschneiden – das zählt als Doppelbelegung der Lehrkraft', () => {
    const mk = st2 => basis(x => {
      x.schule.zeitprofile = [profilK1]; x.klassen[0].zeitprofil = 'zp1';
      x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1), uT('u2', 'ma', ['k2'], ['A'], 1)];
      x.plan = { platzierungen: [pl('u1', 1, 0, 2), pl('u2', 1, 0, st2)] };
    });
    const h01 = d => { const x = planAusDaten(d); return bewerteAlles(x.M, x.P, null)[RI.H01]; };
    const a = h01(mk(3)), b = h01(mk(4));
    return [a === 1 && b === 0, 'K1 2. Std. nach Profil 08:45–09:30, K2 3. Std. 09:25–10:10 → ' + a + ' Verstoß; K2 4. Std. 10:15–11:00 → ' + b];
  });
  T('Z24', 'Pause für eine Person gesperrt', 'Wer eine Pause gesperrt hat, bekommt dort keine Aufsicht', () => {
    const mk = sperre => basis(x => {
      if (sperre) x.lehrer[0].pausenGesperrt = ['0|n1'];
      x.lehrer[2].aufsicht = false;
      x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 2, { bloecke: [1, 1] }), uT('u2', 'de', ['k2'], ['B'], 2, { bloecke: [1, 1] })];
      x.plan = { platzierungen: [pl('u1', 1, 0, 2), pl('u1', 2, 0, 3), pl('u2', 1, 0, 2), pl('u2', 2, 0, 3)] };
      x.dienste = pauseDienst(x, [0], 2);
    });
    const wer = d => [...new Set(dienstePlanen(d, { zeitlimit: 200 }).plan.map(a => a.lehrer))].sort().join('+');
    const ohne = wer(mk(false)), mit = wer(mk(true));
    return [ohne === 'A+B' && mit === 'B', 'ohne Sperre: ' + ohne + ', A sperrt Mo die Pause 09:05–09:25: ' + mit];
  });
  T('Z25', 'Aufgabe als langer Block über Pausen', 'Aufgabenblöcke dürfen beliebig lang sein, Pausen überdecken und am selben Tag liegen; sie zählen nicht zu „max. Stunden/Tag“', () => {
    const mk = zaehlen => basis(x => {
      x.lehrer[0].maxStundenTag = 2;
      x.unterrichte = [{ id: 'a1', aufgabe: true, name: 'Schulleitung', fach: '', klassen: [], lehrkraefte: [{ lehrer: 'A', rolle: 'fach' }], wochenstunden: 8, bloecke: [4, 4], einheit: 'zstd', zeitstunden: 6, pausenZaehlen: zaehlen }];
      x.plan = { platzierungen: [pl('a1', 1, 0, 5, 4), pl('a1', 2, 0, 1, 4)] };
    });
    const d = mk(true), x = planAusDaten(d), tot = bewerteAlles(x.M, x.P, null);
    const hart = tot[RI.H07] + tot[RI.H10] + tot[RI.H12] + tot[RI.H04];
    const auto = bloeckeAlle(basis(y => { y.unterrichte = [{ id: 'a2', aufgabe: true, name: 'X', lehrkraefte: [{ lehrer: 'A', rolle: 'fach' }], wochenstunden: 8 }]; })).get('a2').dauer.join('+');
    return [!x.M.fehler.length && hart === 0 && az(d, 'A').aufgaben === 390 && az(mk(false), 'A').aufgaben === 315 && auto === '2+2+2+1+1', 'Mo 1.–4. und 5.–7. Std. (über die Mittagspause): Verstöße ' + hart + ', Arbeitszeit ' + az(d, 'A').aufgaben + ' min mit Pausen, ' + az(mk(false), 'A').aufgaben + ' min ohne; 8 Std. ohne Angabe → ' + auto];
  });
  T('Z27', 'Anteilige Co-Lehrkraft und Arbeitszeitgrenze', 'Eine anteilige Co-Lehrkraft kommt nur in so viele Stunden, wie ihre Arbeitszeit zulässt – die übrigen Stunden bleiben ohne Co, der Unterricht findet statt', () => {
    const zaehle = weich => {
      const d = basis(x => {
        x.lehrer[2].arbeitszeit = 1.1; if (weich) x.regeln.hartUmschaltbar.H16 = 'weich';
        x.unterrichte = [uT('u1', 'ma', ['k1'], ['A', { lehrer: 'C', rolle: 'co', modus: 'anteilig', stundenAnteil: 2 }], 4, { bloecke: [1, 1, 1, 1] })];
        x.plan = { platzierungen: [pl('u1', 1, 0, 1), pl('u1', 2, 1, 1), pl('u1', 3, 2, 1), pl('u1', 4, 3, 1)] };
      });
      const x = planAusDaten(d); x.P.begin(); x.P.coNeu(0); x.P.commit();
      return x.P.exportiere().filter(p => p.co.includes('C')).length;
    };
    const hart = zaehle(false), weich = zaehle(true);
    return [hart === 1 && weich === 2, 'C hat 1,1 h Wochenarbeitszeit (eine Co-Stunde = 62 min): dabei in ' + hart + ' von 2 gewünschten Stunden; mit „Arbeitszeitgrenzen“ „weich“ in ' + weich];
  });
  T('Z28', 'Termin von Hand ersetzt', 'Wird die Lehrkraft für einen einzelnen Termin herausgenommen (plan.frei), hält sie diese Stunde nicht: Sie zählt nicht zu ihrer Arbeitszeit, „Arbeitszeitgrenzen“ entfällt, und ohne Ersatz meldet die Prüfung die Stunde ohne Lehrkraft; „wieder einsetzen“ stellt alles her', () => {
    const d = basis(x => { x.lehrer[0].maxArbeitTag = 0.75; x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1), uT('u2', 'ma', ['k2'], ['A'], 1)]; x.plan = { platzierungen: [pl('u1', 1, 0, 1), pl('u2', 1, 0, 2)] }; });
    const h16 = dd => { const x = planAusDaten(dd); return bewerteAlles(x.M, x.P, null)[RI.H16]; };
    const vorher = h16(d);
    d.plan.frei = [{ unterricht: 'u2', blockNr: 1, grund: 'Test', lehrer: 'A', sig: besetzungSig(bloeckeAlle(d).get('u2')) }];
    const mit = h16(d), minMit = az(d, 'A').unterricht, ohneLk = offenePunkte(d).some(g => g.art === 'lehrkraft' && g.eintraege.some(x => /herausgenommen/.test(x.text)));
    const d3 = normalisiere(JSON.parse(JSON.stringify(d))); d3.plan.frei = []; // „wieder einsetzen“
    const zurueck = az(d3, 'A').unterricht;
    return [vorher === 1 && mit === 0 && minMit === 45 && ohneLk && zurueck === 90, 'zwei Stunden am Montag bei höchstens 45 min je Tag: „Arbeitszeitgrenzen“ ' + vorher + '; zweite Stunde ohne A: „Arbeitszeitgrenzen“ ' + mit + ', A zählt ' + minMit + ' min, offener Punkt „ohne Fachlehrkraft“: ' + (ohneLk ? 'ja' : 'nein') + '; wieder eingesetzt: ' + zurueck + ' min'];
  });
  T('Z30', 'Unterricht ohne Lehrkraft', 'Unterricht ohne Fachlehrkraft ist kein Fehler: Die Stunden werden für die Klasse eingeplant und als offener Punkt geführt', () => {
    const d = basis(x => { x.klassen[0].stundentafel = { ma: 2 }; x.unterrichte = [uT('u1', 'ma', ['k1'], [], 2, { bloecke: [1, 1] })]; x.plan = { platzierungen: [pl('u1', 1, 0, 1), pl('u1', 2, 1, 1)] }; });
    const M = kompiliere(d), mb = machbarkeit(d), x = planAusDaten(d), tot = bewerteAlles(x.M, x.P, null);
    let hart = 0; for (const r of x.M.hartIdx) hart += tot[r];
    const offen = (offenePunkte(d).find(g => g.art === 'lehrkraft') || { eintraege: [] }).eintraege.length;
    return [M.fehler.length === 0 && M.warnungen.length === 1 && !mb.some(m => m.stufe === 'fehler') && hart === 0 && offen === 1, 'Fehler ' + M.fehler.length + ', Hinweise ' + M.warnungen.length + ', harte Verstöße im Plan ' + hart + ', offener Punkt „ohne Fachlehrkraft“: ' + offen];
  });
  T('Z31', 'Einzelne Stunde von Hand besetzen', 'Eine nur für einen Block eingesetzte Lehrkraft ist in dieser Stunde belegt und bekommt sie auf die Arbeitszeit angerechnet', () => {
    const mk = st => { const d = basis(x => { x.unterrichte = [uT('u1', 'ma', ['k1'], [], 2, { bloecke: [1, 1] }), uT('u2', 'de', ['k2'], ['B'], 1)]; x.plan = { platzierungen: [pl('u1', 1, 0, 1), pl('u1', 2, 1, 1), pl('u2', 1, 0, st)] }; });
      d.plan.besetzung = [{ unterricht: 'u1', blockNr: 1, lehrer: 'B', sig: besetzungSig(bloeckeAlle(d).get('u1')) }]; return d; };
    const h01 = d => { const x = planAusDaten(d); return bewerteAlles(x.M, x.P, null)[RI.H01]; };
    const a = h01(mk(1)), b = h01(mk(2)), min = az(mk(2), 'B').unterricht, d3 = mk(2);
    d3.unterrichte[0].bloecke = [2]; const d4 = normalisiere(d3);
    return [a === 1 && b === 0 && min === 90 && besetzungMap(mk(2)).size === 1 && besetzungMap(d4).size === 0, 'B hält Mo 1. von Hand und hat Mo 1. eigenen Unterricht: „Lehrkraft nicht doppelt belegt“ ' + a + '; eigener Unterricht in der 2. Std.: „Lehrkraft nicht doppelt belegt“ ' + b + ', B zählt ' + min + ' min Unterricht; nach geänderter Blockaufteilung gilt der Eintrag nicht mehr'];
  });
  T('Z32', 'Geteilte Gruppen: Vorbereitung nur einmal', 'Unterrichtet eine Lehrkraft ein in Gruppen geteiltes Fach (✂) in beiden Halbgruppen einer Klasse, zählt die Vorbereitung nur für eine Gruppe', () => {
    const mk = teil => basis(x => { if (teil) x.klassen[0].teilung = { sp: true }; x.unterrichte = [uT('u1', 'sp', ['k1'], ['B'], 2, { gruppen: ['g1'] }), uT('u2', 'sp', ['k1'], ['B'], 2, { gruppen: ['g2'] })]; });
    const d = mk(true), b = arbeitszeiten(d, { geplant: true }).liste.find(x => x.lehrer === 'B'), b0 = arbeitszeiten(mk(false), { geplant: true }).liste.find(x => x.lehrer === 'B');
    const d2 = basis(x => { x.unterrichte = [uT('u1', 'sp', ['k1'], ['B'], 2, { gruppen: ['g1'] }), uT('u2', 'sp', ['k2'], ['B'], 2)]; });
    const b2 = arbeitszeiten(d2, { geplant: true }).liste.find(x => x.lehrer === 'B');
    return [b.unterricht === 180 && b.vorb === 70 && b0.vorb === 140 && b2.vorb === 140, '2 + 2 Stunden Sport in den Gruppen eines geteilten Fachs: Unterricht ' + b.unterricht + ' min, Vorbereitung ' + b.vorb + ' min (statt 140); Gruppen ohne Kennzeichen „geteilt“: ' + b0.vorb + ' min; zwei verschiedene Klassen: ' + b2.vorb + ' min'];
  });
  T('Z33', 'Halbgruppen füllen sich auf', 'Hat nur eine Halbgruppe Unterricht und der Rest der Klasse frei, zählt das als Strafpunkt – liegen beide Gruppen nebeneinander, nicht', () => {
    const mk = st => basis(x => { x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1, { gruppen: ['g1'], raum: 'r1' }), uT('u2', 'de', ['k1'], ['B'], 1, { gruppen: ['g2'], raum: 'r2' })]; x.plan = { platzierungen: [pl('u1', 1, 0, 1), pl('u2', 1, 0, st)] }; });
    const w = d => { const x = planAusDaten(d); return bewerteAlles(x.M, x.P, null)[RI.W17]; };
    const a = w(mk(2)), b = w(mk(1));
    return [a === 2 && b === 0, 'G1 in der 1., G2 in der 2. Stunde: ' + a + ' Stunden mit halber Klasse; beide in der 1. Stunde: ' + b];
  });
  T('Z36', 'Fach in Gruppen teilen', 'Ein geteiltes Fach wird zu zwei Unterrichten (Gruppe A und B) mit voller Stundenzahl; beim Zusammenlegen wieder zu einem', () => {
    const d = basis(x => { x.unterrichte = [uT('u1', 'sp', ['k2'], ['B'], 2)]; });
    const kl = d.klassen[1], fa = d.faecher.find(f => f.id === 'sp');
    kl.teilung = { sp: true };
    const a = teilungAbgleichen(d, kl, fa, 2), us = d.unterrichte.filter(u => u.fach === 'sp'), paar = teilungsPaar(kl, us);
    const ok1 = a === 'geteilt' && us.length === 2 && !!paar && us.every(u => u.wochenstunden === 2 && u.lehrkraefte[0].lehrer === 'B');
    const b = teilungAbgleichen(d, kl, fa, 3); const ok2 = b === 'geaendert' && d.unterrichte.every(u => u.wochenstunden === 3);
    delete kl.teilung.sp;
    const c = teilungAbgleichen(d, kl, fa, 3, { zusammen: true }); const ok3 = c === 'zusammen' && d.unterrichte.length === 1 && !d.unterrichte[0].gruppen.length;
    return [ok1 && ok2 && ok3, 'teilen: ' + a + ' (' + us.length + ' Unterrichte, Gruppen ' + kl.gruppen.map(g => g.name).join('/') + '), Stunden ändern: ' + b + ', zusammenlegen: ' + c];
  });
  T('Z38', 'Unterricht vor Aufsicht', 'Aufsichten sind für den Stundenplan weder Sperrzeit noch Arbeitszeitreserve – eine fest eingetragene Aufsicht macht keinen Platz unzulässig', () => {
    const d = basis(x => {
      x.lehrer.forEach(l => { l.arbeitszeit = 3; });
      x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 2, { bloecke: [1, 1] })];
      x.dienste = { bereiche: [], bedarfe: [], plan: [{ id: 'f1', lehrer: 'A', tag: 0, typ: 'dt_pause', beginn: '07:30', ende: '09:05', quelle: 'manuell', fixiert: true }] };
    });
    const M = kompiliere(d), e = M.uEv[0][0];
    return [M.erlaubt[e * M.S + 0] === 1 && M.erlaubt[e * M.S + 1] === 1 && M.lWocheFix[0] === 0, 'Mo 1./2. Stunde für A zulässig: ' + (M.erlaubt[e * M.S + 0] && M.erlaubt[e * M.S + 1] ? 'ja' : 'nein') + ', feste Arbeitszeit im Solver ' + M.lWocheFix[0] + ' min'];
  });
  T('Z39', 'Deputat: leer = keine Angabe, 0 = keine Stunde', 'Ein leeres Deputat begrenzt nichts; eine eingetragene 0 heißt wirklich 0 Unterrichtsstunden – die Berechnung wählt die Person dann nicht automatisch', () => {
    const mk = dep => basis(x => { x.schule.arbeitszeitModell = { stundenSoll: true }; x.lehrer[0].deputat = dep; x.lehrer[1].faecher = []; x.unterrichte = [uT('u1', 'ma', ['k1'], [], 4, { fachAuto: true })]; });
    const kand = dep => { const M = kompiliere(mk(dep), { personal: true }); return [mk(dep).lehrer[0].deputat, M.PE[0].cands.map(t => M.lKz[t]).join('+') || '–', arbeitszeiten(mk(dep), { geplant: true }).liste[0].hatSollStd]; };
    const leer = kand(null), nul = kand(0), vier = kand(4), text = kand('');
    return [leer[0] === null && leer[1] === 'A' && !leer[2] && nul[0] === 0 && nul[1] === '–' && nul[2] && vier[1] === 'A' && text[0] === null,
      'leer: Kandidaten für Ma ' + leer[1] + ' (keine Grenze); 0: ' + nul[1] + '; 4: ' + vier[1] + '; Text „“ → ' + (text[0] === null ? 'leer' : text[0])];
  });
  T('Z42', 'Aufgaben sind nicht an Unterrichtsblöcke gebunden', 'Aufgaben dürfen nach Unterrichtsschluss liegen und mehrere Blöcke am selben Tag haben; für Unterricht gilt beides weiterhin nicht', () => {
    const mk = aufg => basis(x => {
      x.schule.tagSchluss = { Fr: 6 };
      x.unterrichte = [aufg ? uT('a1', '', [], ['A'], 2, { aufgabe: true, name: 'SL', bloecke: [1, 1] }) : uT('a1', 'ma', ['k1'], ['A'], 2, { bloecke: [1, 1] })];
      x.plan = { platzierungen: [pl('a1', 1, 4, 8), pl('a1', 2, 4, 9)] };
    });
    const v = d => { const x = planAusDaten(d), tot = bewerteAlles(x.M, x.P, null); return [tot[RI.H10], tot[RI.H07]]; };
    const a = v(mk(true)), u = v(mk(false));
    const erlaubt = kompiliere(mk(true)).E[0].erlaubt.length, erlaubtU = kompiliere(mk(false)).E[0].erlaubt.length;
    return [a[0] === 0 && a[1] === 0 && u[0] === 2 && u[1] === 1 && erlaubt > erlaubtU, 'Freitag nach Unterrichtsschluss, zwei Blöcke hintereinander – Aufgabe: „Keine Pausen, Unterrichtsschluss“ ' + a[0] + ', „Blockstruktur“ ' + a[1] + '; Unterricht: „Keine Pausen, Unterrichtsschluss“ ' + u[0] + ', „Blockstruktur“ ' + u[1]];
  });
  T('Z43', 'Halbgruppen heißen A/B oder 1/2', 'Die Teilung erkennt die beiden Halbgruppen auch als „Gr. 1“ und „Gr. 2“', () => {
    const d = basis(x => { x.klassen[1].gruppen = [{ id: 'h1', name: 'Gr. 1', schueler: 10 }, { id: 'h2', name: 'Gr. 2', schueler: 10 }]; x.klassen[1].teilung = { sp: true }; x.unterrichte = [uT('u1', 'sp', ['k2'], ['B'], 2, { gruppen: ['h1'] }), uT('u2', 'sp', ['k2'], ['B'], 2, { gruppen: ['h2'] })]; });
    const paar = teilungsPaar(d.klassen[1], d.unterrichte), vorb = arbeitszeiten(d, { geplant: true }).liste.find(x => x.lehrer === 'B').vorb;
    const k = { gruppen: [{ id: 'x', name: '1', schueler: 5 }], schueler: 20 }; const hg = halbgruppen(k);
    return [!!paar && vorb === 70 && hg[1].name === '2', 'Paar erkannt: ' + (paar ? 'ja' : 'nein') + ', Vorbereitung einmal (' + vorb + ' min); neue zweite Gruppe neben „1“ heißt „' + hg[1].name + '“'];
  });
  T('Z45', 'Wechsel-Doppelstunden: Kopplung und Halbgruppen', 'Doppelstundenpflicht mit ungerader Stundenzahl: gekoppelte Unterrichte bekommen dieselbe Woche, Halbgruppen liegen gekreuzt (Gr. 1 des einen neben Gr. 2 des anderen Fachs)', () => {
    const d = basis(x => {
      x.faecher[2].doppelstunde = 'pflicht'; x.faecher[3].doppelstunde = 'pflicht'; x.klassen[0].teilung = { sp: true, ch: true };
      x.klassen[0].stundentafel = { sp: 3, ch: 3, ma: 3 }; x.klassen[1].stundentafel = { sp: 3 };
      x.unterrichte = ['sp', 'ch'].flatMap(f => ['g1', 'g2'].map(g => uT(f + g, f, ['k1'], [f === 'sp' ? 'B' : 'A'], 3, { gruppen: [g] })))
        .concat([uT('w1', 'sp', ['k2'], ['B'], 3, { kopplung: 'wp' }), uT('w2', 'ma', ['k1'], ['C'], 3, { kopplung: 'wp' })]);
      x.faecher[0].doppelstunde = 'pflicht'; x.lehrer[2].faecher = ['ma']; x.lehrer[2].ausgebildet = true;
    });
    const bl = bloeckeAlle(d), w = id => bl.get(id).woche[bl.get(id).woche.length - 1];
    const fehler = machbarkeit(d).filter(m => m.stufe === 'fehler').length;
    return [w('spg1') !== w('spg2') && w('spg1') === w('chg2') && w('spg2') === w('chg1') && w('w1') === w('w2') && blockText(bl.get('w1')) === blockText(bl.get('w2')) && fehler === 0,
      'Sport Gr. 1 ' + blockText(bl.get('spg1')) + ', Gr. 2 ' + blockText(bl.get('spg2')) + '; Chemie Gr. 1 ' + blockText(bl.get('chg1')) + ', Gr. 2 ' + blockText(bl.get('chg2')) + '; Kopplung ' + blockText(bl.get('w1')) + ' / ' + blockText(bl.get('w2')) + '; Fehler in der Prüfung: ' + fehler];
  });
  T('Z46', 'Aufgaben in der Prüfung und in Pausen', 'Sechs Aufgabenblöcke bei fünf Tagen und Aufgaben nach Unterrichtsschluss sind kein Fehler; ein Block aus einer einzigen Zeile liegt nie nur in einer Pause; Aufgaben machen keine Pause aufsichtspflichtig', () => {
    const d = basis(x => {
      x.schule.tagSchluss = { Fr: 2 };
      x.lehrer[2].verfuegbarkeit = x.lehrer[2].verfuegbarkeit.map((t, dd) => t.map((v, hh) => dd === 4 ? 1 : (hh < 2 ? 1 : 0)));
      x.unterrichte = [{ id: 'a1', aufgabe: true, name: 'Büro', fach: '', klassen: [], lehrkraefte: [{ lehrer: 'C', rolle: 'fach' }], wochenstunden: 12, bloecke: [1, 1, 1, 1, 1, 1, 2, 2, 2], pausenZaehlen: true }];
    });
    const fehler = machbarkeit(d).filter(m => m.stufe === 'fehler').map(m => m.text);
    const M = kompiliere(d);
    const einzelPause = M.E.some(ev => ev.dur === 1 && ev.pauseRand), mehrPause = M.E.some(ev => ev.dur > 1 && ev.pauseRand);
    return [fehler.length === 0 && !einzelPause && mehrPause, 'Fehler in der Prüfung: ' + (fehler.length ? fehler[0].slice(0, 90) : 'keine') + '; Einzelblock darf in einer Pause beginnen: ' + (einzelPause ? 'ja' : 'nein') + ', Block über mehrere Zeilen: ' + (mehrPause ? 'ja' : 'nein')];
  });
  T('Z47', 'Höchstens je Tag je Klasse', 'Ein eigener Wert der Klasse überschreibt „max./Tag“ des Fachs: Mathe (Fach 2×, Doppelstunden bevorzugt) in K1 höchstens 1× – dort keine Doppelstunden, zwei Mathestunden am Montag sind ein Verstoß; die Prüfung meldet 6 Stunden bei höchstens 1× je Tag an 5 Tagen', () => {
    const d = basis(x => { x.faecher[0].doppelstunde = 'bevorzugt'; x.klassen[0].maxProTag = { ma: 1, xx: 0 }; x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 4), uT('u2', 'ma', ['k2'], ['A'], 4)]; });
    const bl = bloeckeAlle(d), b1 = bl.get('u1').dauer.join('+'), b2 = bl.get('u2').dauer.join('+');
    const d2 = basis(x => { x.klassen[0].maxProTag = { ma: 1 }; x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1), uT('u3', 'ma', ['k1'], ['A'], 1)]; x.plan = { platzierungen: [pl('u1', 1, 0, 1), pl('u3', 1, 0, 2)] }; });
    const p2 = planAusDaten(d2), h13 = pruefeRegel('H13', p2.M, p2.P);
    const d3 = basis(x => { x.klassen[0].maxProTag = { ma: 1 }; x.klassen[0].stundentafel = { ma: 6 }; x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 6)]; });
    const mb = machbarkeit(d3).some(f => f.stufe === 'fehler' && /höchstens 1× je Tag/.test(f.text));
    return [JSON.stringify(d.klassen[0].maxProTag) === '{"ma":1}' && fachMaxTag(d.klassen[0], d.faecher[0]) === 1 && fachMaxTag(d.klassen[1], d.faecher[0]) === 2 && b1 === '1+1+1+1' && b2 === '2+2' && h13 === 1 && mb,
      'gespeichert ' + JSON.stringify(d.klassen[0].maxProTag) + ' · Blöcke K1 ' + b1 + ', K2 ' + b2 + ' · zwei Mathestunden am Montag: ' + h13 + ' Verstoß · Prüfung meldet ' + (mb ? 'den Widerspruch' : 'nichts')];
  });
  T('Z48', 'Klassenleitung in Kernfächern: Ausnahmen', '„Klassenleitung unterrichtet die Kernfächer“ zählt die Stunden, wenn eine andere Lehrkraft das Kernfach der Klasse bekommt – nicht, wenn die Klassenleitung es selbst hat, wenn die Fachlehrkraft fest eingetragen ist, wenn die Klassenleitung das Fach nicht unterrichten kann oder bei Nicht-Kernfächern; bei Halbgruppen genügt eine Gruppe', () => {
    const w18 = mod => { const d = basis(x => { x.lehrer[0].klassenleitung = 'k2'; mod(x); }); const p = planAusDaten(d); return pruefeRegel('W18', p.M, p.P); };
    const auto = l => ({ lehrer: l, rolle: 'fach', modus: 'immer', auto: true });
    const a = w18(x => { x.unterrichte = [uT('u1', 'de', ['k2'], [auto('B')], 2, { fachAuto: true })]; });
    const b = w18(x => { x.unterrichte = [uT('u1', 'de', ['k2'], [auto('A')], 2, { fachAuto: true })]; });
    const c = w18(x => { x.unterrichte = [uT('u1', 'de', ['k2'], ['B'], 2)]; });
    const e = w18(x => { x.lehrer[0].faecher = ['ma']; x.unterrichte = [uT('u1', 'de', ['k2'], [auto('B')], 2, { fachAuto: true })]; });
    const f = w18(x => { x.lehrer[0].faecher = ['ma', 'sp']; x.unterrichte = [uT('u1', 'sp', ['k2'], [auto('B')], 2, { fachAuto: true })]; });
    const g = w18(x => { x.lehrer[0].klassenleitung = 'k1'; x.unterrichte = [uT('u1', 'de', ['k1'], [auto('A')], 2, { fachAuto: true, gruppen: ['g1'] }), uT('u2', 'de', ['k1'], [auto('B')], 2, { fachAuto: true, gruppen: ['g2'] })]; });
    return [a === 2 && b === 0 && c === 0 && e === 0 && f === 0 && g === 0, 'andere Lehrkraft: ' + a + ' (erwartet 2) · Klassenleitung selbst: ' + b + ' · fest eingetragen: ' + c + ' · kann das Fach nicht: ' + e + ' · Sport (kein Kernfach): ' + f + ' · Halbgruppen, eine bei der Klassenleitung: ' + g];
  });
  T('Z49', 'Interne Aufsichtstypen', 'Die internen Aufsichtstypen sind fest und werden nicht gespeichert: Ein alter Stand mit gespeicherten Typen (allgemeine Aufsicht noch „D“), eigenem Typ und Schichtvorlagen lädt ohne diese Listen; der eigene Typ wird zur allgemeinen Aufsicht „A“ mit seinem Namen', () => {
    const d = normalisiere({ dienste: { typen: [{ id: 'dt_dienst', name: 'Aufsicht', kuerzel: 'D' }, { id: 'dt_eigen', name: 'Eigene', kuerzel: 'E', farbe: '#123456' }], schichtvorlagen: [{ id: 's1', kuerzel: 'D1', name: 'Hof' }],
      bedarfe: [{ tag: 0, typ: 'dt_eigen', abschnitte: [{ beginn: '07:00', ende: '07:30', min: 1 }] }, { tag: 0, typ: 'dt_frueh', abschnitte: [{ beginn: '07:00', ende: '07:30', min: 1 }] }] } });
    const b = d.dienste.bedarfe, kz = DIENSTTYPEN.find(t => t.id === 'dt_dienst').kuerzel, gespeichert = Object.keys(d.dienste).filter(k => k === 'typen' || k === 'schichtvorlagen');
    return [!gespeichert.length && kz === 'A' && b[0].typ === 'dt_dienst' && b[0].name === 'Eigene' && b[0].farbe === '#123456' && b[1].name === 'Frühaufsicht', 'gespeichert: ' + (gespeichert.join(', ') || 'keine Typen/Vorlagen') + ' · allgemeine Aufsicht „' + kz + '“ · eigener Typ → ' + b[0].typ + ' „' + b[0].name + '“ · Frühaufsicht „' + b[1].name + '“'];
  });
  T('Z50', 'Aufgabe nach Unterrichtsschluss', 'Freitags Unterricht nur bis zur 5. Stunde: Eine Aufgabe darf trotzdem fest in der 6.–8. Stunde liegen – kein Verstoß; Unterricht dort bleibt ein Verstoß', () => {
    const d = basis(x => { x.schule.tagSchluss = { Fr: 5 }; x.unterrichte = [{ id: 'a1', aufgabe: true, name: 'Team', kuerzel: 'Team', klassen: [], gruppen: [], lehrkraefte: [{ lehrer: 'A', rolle: 'fach', modus: 'immer' }], wochenstunden: 3, bloecke: [3], fixiert: [{ tag: 4, stunde: 7 }] }, uT('u1', 'ma', ['k1'], ['B'], 1)];
      x.plan = { platzierungen: [pl('a1', 1, 4, 7, 3), pl('u1', 1, 4, 7)] }; });
    const p = planAusDaten(d), det = []; pruefeRegel('H10', p.M, p.P, det);
    const aufg = det.filter(v => /Team/.test(v.text)).length, unt = det.filter(v => !/Team/.test(v.text)).length;
    return [aufg === 0 && unt >= 1 && pruefeRegel('H09', p.M, p.P) === 0, 'Aufgabe: ' + aufg + ' Verstöße (erwartet 0) · Unterricht nach Schluss: ' + unt + ' (erwartet mindestens 1)'];
  });
  T('Z51', 'Vorbereitung je Unterrichtsstunde', '60-Minuten-Stunden: 15 Stunden als Lehrkraft bringen genau 15 × 35 min = 8,75 h Vorbereitung, als Co 15 × 17 min = 4,25 h – nicht mehr, weil die Stunde länger als 45 min ist. Übersicht und Rechenkern (Arbeitszeitgrenze) rechnen gleich', () => {
    const st = Array.from({ length: 7 }, (_, i) => ({ beginn: zeitText(480 + i * 65), ende: zeitText(540 + i * 65) }));
    const d = normalisiere({ schule: { name: 'T', tage: ['Mo', 'Di', 'Mi', 'Do', 'Fr'], stunden: st }, faecher: [{ id: 'ma', kuerzel: 'Ma', name: 'Mathe' }], klassen: [{ id: 'k1', name: '5a', jahrgang: 5, stundentafel: { ma: 15 } }],
      lehrer: [{ id: 'A', kuerzel: 'A', name: 'A', faecher: ['ma'], arbeitszeit: 40 }, { id: 'C', kuerzel: 'C', name: 'C', coFaecher: ['ma'], ausgebildet: false, art: 'co', arbeitszeit: 40 }],
      unterrichte: [{ id: 'u1', fach: 'ma', klassen: ['k1'], wochenstunden: 15, bloecke: Array(15).fill(1), lehrkraefte: [{ lehrer: 'A', rolle: 'fach' }, { lehrer: 'C', rolle: 'co' }] }],
      plan: { platzierungen: Array.from({ length: 15 }, (_, i) => ({ unterricht: 'u1', blockNr: i + 1, tag: Math.floor(i / 3), stunde: i % 3 + 1, dauer: 1 })) } });
    const az = arbeitszeiten(d).liste, a = az.find(x => x.lehrer === 'A'), c = az.find(x => x.lehrer === 'C');
    const { M, P } = planAusDaten(d), t = M.lI.get('A'); let kern = M.lWocheFix[t];
    for (const e of M.lEv[t]) { const s0 = P.start[e]; if (s0 >= 0) kern += M.E[e].minAt[s0 % M.H] * (M.E[e].azF.get(t) || M.E[e].wf) + (M.E[e].azV.get(t) || 0); }
    return [a.vorb === 525 && c.coVorb === 255 && a.unterricht === 900 && Math.abs(kern - a.summe) < 0.01, 'Vorbereitung Lehrkraft ' + zahlDe(a.vorb / 60, 2) + ' h, Co ' + zahlDe(c.coVorb / 60, 2) + ' h · Arbeitszeit A: Übersicht ' + zahlDe(a.summe / 60, 2) + ' h, Rechenkern ' + zahlDe(kern / 60, 2) + ' h'];
  });
  T('Z52', 'Arbeitszeitnachweis je Person', 'Doppelstunde = 2 UStd. → 2 × 35 min = 70 min Vorbereitung; die Einzelbuchungen des Nachweises (Unterricht, Vorbereitung, Co, Klassenleitung, Aufgaben, Aufsichten) ergeben für jede Person genau die Summe der Übersicht', () => {
    const d = basis(x => {
      x.lehrer[0].klassenleitung = 'k1';
      x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 3, { bloecke: [2, 1] }), uT('u2', 'de', ['k2'], ['B'], 2, { bloecke: [1, 1] }),
        { id: 'a1', aufgabe: true, name: 'Team', kuerzel: 'Team', klassen: [], gruppen: [], lehrkraefte: [{ lehrer: 'A', rolle: 'fach' }], wochenstunden: 1, bloecke: [1], vorbereitung: false }];
      x.unterrichte[1].lehrkraefte.push({ lehrer: 'C', rolle: 'co' });
      x.plan = { platzierungen: [pl('u1', 1, 0, 1, 2), pl('u1', 2, 1, 1), pl('u2', 1, 2, 1), pl('u2', 2, 3, 1), pl('a1', 1, 4, 5)] };
      x.dienste = { bereiche: [], bedarfe: [], plan: [{ id: 'p1', lehrer: 'A', tag: 2, typ: 'dt_pause', beginn: '09:30', ende: '09:50', quelle: 'manuell' }, { id: 'p2', lehrer: 'C', tag: 1, typ: 'dt_springer', beginn: '09:30', ende: '09:50', quelle: 'manuell' }] };
    });
    const az = arbeitszeiten(d, { protokoll: true }), dbl = az.protokoll.find(p => p.u === 'u1' && p.ustd === 2);
    const abw = az.liste.filter(x => Math.abs(az.protokoll.filter(p => p.lehrer === x.lehrer).reduce((s, p) => s + p.min + (p.vorbMin || 0), 0) - x.summe) > 0.01).map(x => x.kuerzel);
    const a = az.liste.find(x => x.lehrer === 'A'), text = arbeitszeitNachweis(d, 'A').textContent;
    return [!!dbl && dbl.vorbMin === 70 && !abw.length && text.includes(zStd(a.summe)) && text.includes('3 UStd. × 35 min = 105 min'), 'Doppelstunde: ' + (dbl ? dbl.ustd + ' UStd., ' + dbl.vorbMin + ' min Vorbereitung' : 'nicht gefunden') + ' · Abweichungen Nachweis/Übersicht: ' + (abw.join(', ') || 'keine') + ' · Summe A ' + zStd(a.summe)];
  });
  T('Z53', 'Aufsichtsbedarf gegen Verfügbarkeit', 'Ein fester Termin (Aufgabe) bindet eine Person in der Pause: Bei Mindestbedarf 3 und nur 2 verfügbaren Personen warnt der Machbarkeitscheck, ohne den Termin nicht.', () => {
    const mk = mitTermin => {
      const x = testGrunddaten();
      x.dienste = { bereiche: [{ id: 'hof', name: 'Hof' }], bedarfe: [{ tag: 0, typ: 'dt_pause', bereich: 'hof', name: 'Pause', abschnitte: [{ beginn: '09:30', ende: '10:00', min: 3, soll: 3 }] }], plan: [], auto: false };
      if (mitTermin) x.unterrichte.push({ id: 'a_sitz', aufgabe: true, name: 'Sitzung', kuerzel: 'Sz', fach: '', klassen: [], gruppen: [], lehrkraefte: [{ lehrer: 'A', rolle: 'fach', modus: 'immer' }], wochenstunden: 0, bloecke: [], termine: [{ tag: 0, pause: '', beginn: '09:30', ende: '10:00' }] });
      return normalisiere(x);
    };
    const filtere = d => machbarkeit(d).filter(m => /überhaupt verfügbar/.test(m.text));
    const ohne = filtere(mk(false)), mit = filtere(mk(true));
    return [ohne.length === 0 && mit.length === 1 && /Mindestbedarf 3/.test(mit[0].text) && /Sitzung/.test(mit[0].text), 'ohne Termin ' + ohne.length + ' Meldung(en), mit Termin ' + mit.length + (mit[0] ? ': ' + mit[0].text.slice(0, 160) : '')];
  });
  return erg;
}
