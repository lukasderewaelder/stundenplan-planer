function selbsttestInhalt() {
  const erg = APP.selbsttest;
  const tab = erg ? h('table', { class: 'tab' }, h('thead', {}, h('tr', {}, ['Test', 'Beispiel', 'Ergebnis', 'Details'].map(t => h('th', {}, t)))),
    h('tbody', {}, erg.map(x => h('tr', { title: REGELN[RI[x.id]] ? REGELN[RI[x.id]].text : ((DIENST_REGELN.find(r => r.id === x.id) || {}).text || '') }, h('td', {}, REGEL_NAME[x.id] ? null : h('span', { class: 'mono muted klein' }, x.id + ' '), h('b', {}, x.name)), h('td', {}, x.beschr || ''), h('td', {}, x.ok ? h('span', { class: 'badge ok' }, '✓ bestanden') : h('span', { class: 'badge err' }, '✕ fehlgeschlagen')), h('td', { class: 'muted klein' }, x.info))))) : null;
  const ok = erg ? erg.filter(x => x.ok).length : 0;
  return h('div', { class: 'karte' }, h('div', { class: 'zeile' }, h('h2', { style: { margin: 0 } }, 'Selbsttest'),
      h('button', { class: 'btn primaer rechts', onclick: async ev => { ev.target.disabled = true; ev.target.textContent = 'Läuft …'; await new Promise(r => setTimeout(r, 30)); const a = selbsttest().concat(selbsttestZusatz()); const b = await selbsttestSolver(); const c = await selbsttestAuftrag(); const g = await selbsttestGesamt(); APP.selbsttest = a.concat(b, selbsttestDienste(), c, g, selbsttestOberflaeche()); render(); } }, 'Selbsttest ausführen')),
    h('p', { class: 'muted klein' }, 'Prüft alle Pflichtregeln und die Bewertung aller Wünsche mit kleinen Beispielplänen (je ein Plan mit Verstoß und einer ohne), dazu Arbeitszeit und Deputat, Co-Lehrkräfte, Aufsichten (immer besetzen, Pausen ohne Aufsicht, Reserve), Zeitprofile für Klassen und Fächer, gesperrte Pausen, lange Aufgabenblöcke über Pausen, Aufgaben mit Terminen, Stunden ohne Lehrkraft und von Hand besetzte Stunden, geteilte Gruppen, das automatische Verteilen der Lehrkräfte, weiteres Personal, Ausschlüsse für Aufsichten, Deputat und die offenen Punkte, Höchstens je Tag je Klasse, die Klassenleitung in Kernfächern, das Aufsichtskürzel, Aufgaben nach Unterrichtsschluss, Vorbereitung je Unterrichtsstunde, Arbeitszeitnachweis (Z1–Z52), den Solver auf Lösbarkeit, Reproduzierbarkeit, das Neulösen nach einem erzwungenen Zug, das Einhalten der Arbeitszeitgrenzen, Unterricht ohne Lehrkraft das Zuteilen der Lehrkräfte in der Berechnung und Halbgruppen nebeneinander (S1–S9) sowie die Aufsichtsplanung (DT01–DT22). Neu: A–E Wochenstunden je Schüler (Halbgruppen, A-/B-Wochen, Blockzwang, Parallelbänder), F–G Aufsichtsplan (Seite = Druck = Planstruktur), H–J Springer und Ausschlüsse, K–Q Ressourcenprüfung im Plan-Editor, V Aufsichten im Lehrer-PDF, W Gruppenbezeichnung im Export, GP Gesamtplan je Tag im Druck, NB A/B-Woche und Gruppen nebeneinander, LK/LF Herausnehmen automatisch geplanter Co- und Fachlehrkräfte, DT32 Springer trotz Arbeitszeitgrenzen, 27 Ausgleich von Woche A und B (Aufteilen nur als letztes Mittel), GT1–GT6 GTA-Planer, AK harte Fehler akzeptieren, SP unbesetzte Springer gelb.'),
    erg ? h('div', { class: 'hinweis ' + (ok === erg.length ? 'ok' : 'err') }, ok + ' von ' + erg.length + ' Tests bestanden.') : h('p', { class: 'muted' }, 'Noch nicht ausgeführt.'), tab);
}

// Selbsttests F und G: Der Aufsichtsplan der Seite „Aufsichten“, der Druck/PDF und der persönliche Plan zeigen denselben Stand wie die
// interne Planstruktur – auch nach einer Änderung und auch, wenn die Aufsichten als Aufsichten geführt werden.
function selbsttestOberflaeche() {
  const erg = [];
  const T = (id, name, beschr, f) => { let ok = false, info = ''; try { const r = f(); ok = !!r[0]; info = r[1]; } catch (err) { info = 'Fehler: ' + err.message; } erg.push({ id, name, beschr, ok, info }); };
  const daten = () => {
    const x = testGrunddaten();
    x.lehrer[2].faecher = ['sp'];
    x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 2, { bloecke: [1, 1] }), uT('u2', 'de', ['k2'], ['B'], 2, { bloecke: [1, 1] }), uT('u3', 'sp', ['k2'], ['C'], 2, { bloecke: [1, 1] })];
    const p = (u, b, tag, stunde, raum) => ({ unterricht: u, blockNr: b, tag, stunde, dauer: 1, raum, co: [] });
    x.plan = { platzierungen: [p('u1', 1, 0, 2, 'r1'), p('u1', 2, 0, 3, 'r1'), p('u2', 1, 0, 2, 'r2'), p('u2', 2, 0, 3, 'r2'), p('u3', 1, 1, 2, 'halle'), p('u3', 2, 1, 3, 'halle')] };
    const d0 = normalisiere(x), iv = pausenIntervall(d0.schule, 'n1'), zeit = { beginn: zeitText(iv.start), ende: zeitText(iv.end), min: 1, soll: 1 };
    x.dienste = { bereiche: [{ id: 'hof', name: 'Hof' }, { id: 'flur', name: 'Flur' }], bedarfe: [0, 1].flatMap(tag => ['hof', 'flur'].map(b => ({ tag, typ: 'dt_pause', bereich: b, name: 'Große Pause', abschnitte: [zeit] }))), plan: [] };
    const d = normalisiere(x);
    aufsichtenNeuBerechnen(d, { zeitlimit: 300 });
    return d;
  };
  const gleich = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
  // Die folgenden Tests zeichnen Seiten und Druckseiten; dafür steht der Testdatenstand kurz an der Stelle der Projektdaten (danach wird alles zurückgestellt).
  const mitDaten = (d, f) => { const alt = APP.daten, altC = APP.cache; APP.daten = d; APP.cache = null; try { return f(); } finally { APP.daten = alt; APP.cache = altC; } };
  // eine Aufsicht = Tag|Beginn|Ende|Person – einmal aus der Planstruktur, aus dem Aufsichten-Wochenplan (Seite) und aus dem Aufsichtsplan (Druck)
  const schl = (tag, beginn, ende, lid) => tag + '|' + beginn + '|' + ende + '|' + lid;
  const vergleich = d => mitDaten(d, () => {
    const soll = new Set(d.dienste.plan.map(x => schl(x.tag, x.beginn, x.ende, x.lehrer))), seite = new Set(), druck = new Set();
    const st = DS(), alt = { tag: st.tag, ansicht: st.ansicht, filter: st.filter, suche: st.suche };
    try {
      d.schule.tage.forEach((_, t) => { Object.assign(st, { tag: t, ansicht: 'tag', filter: 'alle', suche: '' });
        h('div', {}, dienstWochenplanTab()).querySelectorAll('.tl-spalte').forEach(sp => sp.querySelectorAll('.tl-d:not(.rotation)').forEach(el => { const x = d.dienste.plan.find(y => y.id === el.dataset.id); if (x) seite.add(schl(Number(sp.dataset.t), x.beginn, x.ende, sp.dataset.l)); })); });
    } finally { Object.assign(st, alt); }
    const kz = new Map(d.lehrer.map(l => [l.kuerzel, l.id]));
    dienstDruckSeite('dienstWoche', '', 'Test', 0, 1).querySelectorAll('tbody tr').forEach(tr => { const lid = kz.get(tr.cells[0].querySelector('b').textContent); [...tr.cells].slice(1).forEach((td, t) => td.querySelectorAll('.dz').forEach(z => { const m = z.textContent.match(/^(\d\d:\d\d)–(\d\d:\d\d)/); if (m) druck.add(schl(t, m[1], m[2], lid)); })); });
    return { soll, seite, druck, ok: soll.size > 0 && gleich(soll, seite) && gleich(soll, druck) };
  });
  T('F', 'Aufsichtsplan: Seite = Druck = Planstruktur', 'Jede Aufsicht erscheint mit derselben Person in der Planstruktur, im Aufsichten-Wochenplan (Seite), im Aufsichtsplan (Druck/PDF) und im persönlichen Plan (Lehrerplan mit Aufsichten)', () => {
    const d = daten(), v = vergleich(d), lid = d.dienste.plan[0].lehrer;
    const pers = aufsichtenLehrerZeilen(d, lid).length, eigene = d.dienste.plan.filter(x => x.lehrer === lid).length;
    return [v.ok && pers === eigene, v.soll.size + ' Aufsichten in der Planstruktur, Seite ' + v.seite.size + ', Druck ' + v.druck.size + ', persönlicher Plan von ' + lid + ': ' + pers + ' von ' + eigene];
  });
  T('G', 'Aufsichtsplan folgt jeder Änderung', 'Wird eine Aufsicht von Person A auf Person B geändert, zeigen Seite und Druck sofort B und nicht mehr A', () => {
    const d = daten(), x = d.dienste.plan[0], alt = x.lehrer, neu = d.lehrer.map(l => l.id).find(id => id !== alt && !d.dienste.plan.some(y => y.tag === x.tag && y.beginn === x.beginn && y.lehrer === id));
    const kAlt = schl(x.tag, x.beginn, x.ende, alt), kNeu = schl(x.tag, x.beginn, x.ende, neu);
    x.lehrer = neu;
    const v = vergleich(d);
    return [v.ok && v.seite.has(kNeu) && !v.seite.has(kAlt) && v.druck.has(kNeu) && !v.druck.has(kAlt), alt + ' → ' + neu + ': Seite zeigt ' + (v.seite.has(kNeu) ? neu : '?') + (v.seite.has(kAlt) ? ' und noch ' + alt : '') + ', Druck zeigt ' + (v.druck.has(kNeu) ? neu : '?') + (v.druck.has(kAlt) ? ' und noch ' + alt : '')];
  });
  // Im Auftrag „H“ – der Buchstabe H ist in dieser Liste schon vergeben (Springer arbeitszeitneutral), deshalb V.
  T('V', 'Lehrer-PDF enthält alle Aufsichten', 'Frühaufsicht, Hofpause, Bistro, GTA und Springer einer Person stehen vollständig auf ihrer Lehrerplan-Seite (Druck/PDF); der Springer ist gekennzeichnet; eine Änderung steht sofort im Druck; ohne die Druckoption entfällt der Block', () => {
    const d = daten();
    const mk = (id, typ, tag, beginn, ende, name, bereich, extra) => Object.assign({ id, lehrer: 'A', tag, typ, bereich: bereich || null, bedarf: null, name, beginn, ende, quelle: 'hand', fixiert: false, springer: false, arbeitszeit: true, qualifikation: '', farbe: '', rhythmus: { art: 'woechentlich' }, serie: null, notiz: '' }, extra || {});
    d.dienste.plan = d.dienste.plan.filter(x => x.lehrer !== 'A').concat([mk('t1', 'dt_frueh', 0, '07:00', '07:30', 'Frühaufsicht'), mk('t2', 'dt_pause', 1, '13:00', '13:20', 'Hofpause', 'hof'), mk('t3', 'dt_bistro', 2, '13:00', '13:30', 'Bistro', 'flur'), mk('t4', 'dt_gta', 3, '14:00', '15:30', 'GTA Schach'), mk('t5', 'dt_springer', 4, '13:00', '13:20', 'Springer', null, { springer: true })]);
    return mitDaten(d, () => {
      const o = Object.assign({}, DRUCK_STD, { art: 'lehrer', auswahl: 'A' });
      const seite = () => { const w = h('div'); w.append(druckSeite('lehrer', 'A', 'Person A', 0, 1, o)); return w; };
      const inhalt = el => new Set([...el.querySelectorAll('tr[data-aufsb]')].map(tr => tr.getAttribute('data-aufsb')));
      const soll = () => new Set(d.dienste.plan.filter(x => x.lehrer === 'A').map(x => x.tag + '|' + x.beginn + '|' + dienstTitel(x) + '|A'));
      const s1 = seite(), i1 = inhalt(s1), alle = soll().size === 5 && gleich(soll(), i1);
      const spr = [...s1.querySelectorAll('tr[data-aufsb]')].find(tr => tr.getAttribute('data-aufsb').startsWith('4|13:00|Springer|'));
      const sprOk = !!spr && spr.classList.contains('springer') && /Springer/.test(spr.textContent) && !/Arbeitszeit/.test(s1.querySelector('.aufsblock').textContent);
      const summe = (s1.querySelector('.ab-summe') || {}).textContent || '';
      d.dienste.plan.find(x => x.id === 't3').beginn = '13:10';
      const i2 = inhalt(seite()), folgt = gleich(soll(), i2) && i2.has('2|13:10|Bistro|A') && !i2.has('2|13:00|Bistro|A');
      o.aufsichten = false;
      const aus = !seite().querySelector('.aufsblock');
      return [alle && sprOk && folgt && aus && /Springer/.test(summe), i1.size + ' von ' + soll().size + ' Einsätzen auf der Seite' + (sprOk ? ', Springer gekennzeichnet' : ', Springer NICHT gekennzeichnet') + (folgt ? ', Änderung steht im Druck' : ', Änderung FEHLT im Druck') + (aus ? ', Option aus: kein Block' : ', Option aus: Block noch da') + ' · ' + summe];
    });
  });
  // Im Auftrag „I“ – der Buchstabe I ist schon vergeben (Springer blockiert die Zeit), deshalb W.
  T('W', 'Gruppenbezeichnung im Export', 'Kunst (Gruppe A) und Werken (Gruppe B) liegen im Klassenplan parallel: Mit der Druckoption trägt jede Teilkachel ihre Gruppe („Gr. A“, „Gr. B“), ohne die Option bleiben beide Kacheln, aber ohne Gruppennamen', () => {
    const x = testGrunddaten();
    x.faecher.push({ id: 'ku', kuerzel: 'Ku', name: 'Kunst', raumTyp: 'klassenraum', doppelstunde: 'egal', maxProTag: 2, schwer: false }, { id: 'we', kuerzel: 'We', name: 'Werken', raumTyp: 'klassenraum', doppelstunde: 'egal', maxProTag: 2, schwer: false });
    x.klassen[0].gruppen = [{ id: 'g1', name: 'A', schueler: 10 }, { id: 'g2', name: 'B', schueler: 10 }];
    x.lehrer[0].faecher = x.lehrer[0].faecher.concat(['ku']); x.lehrer[1].faecher = x.lehrer[1].faecher.concat(['we']);
    x.unterrichte = [uT('u1', 'ku', ['k1'], ['A'], 1, { gruppen: ['g1'] }), uT('u2', 'we', ['k1'], ['B'], 1, { gruppen: ['g2'] })];
    x.plan = { platzierungen: [{ unterricht: 'u1', blockNr: 1, tag: 0, stunde: 2, dauer: 1, raum: 'r1', co: [] }, { unterricht: 'u2', blockNr: 1, tag: 0, stunde: 2, dauer: 1, raum: 'r2', co: [] }] };
    const d = normalisiere(x);
    return mitDaten(d, () => {
      const plan = (art, id, gruppen) => statischerPlan(d, d.plan.platzierungen, art, id, { gruppen });
      const kacheln = t => [...t.querySelectorAll('.de')].map(k => k.textContent);
      const mit = kacheln(plan('klasse', 'k1', true)), ohne = kacheln(plan('klasse', 'k1', false));
      const klasseOk = mit.length === 2 && mit.some(t => /^Ku · Gr\. A/.test(t)) && mit.some(t => /^We · Gr\. B/.test(t));
      const ohneOk = ohne.length === 2 && !ohne.some(t => /Gr\./.test(t)) && ohne.some(t => /^Ku/.test(t)) && ohne.some(t => /^We/.test(t));
      const lMit = plan('lehrer', 'A', true).textContent, lOhne = plan('lehrer', 'A', false).textContent;
      const lehrerOk = /K1 · Gr\. A/.test(lMit) && !/Gr\./.test(lOhne) && /K1/.test(lOhne);
      const namen = gruppenText(d, { gruppen: ['g1', 'g2'] }) === 'Gr. A, B';
      return [klasseOk && ohneOk && lehrerOk && namen, 'mit Option: ' + mit.map(t => t.slice(0, 11)).join(' | ') + ' · ohne: ' + ohne.map(t => t.slice(0, 4)).join(' | ') + ' · Lehrerplan ' + (lehrerOk ? 'zeigt „K1 · Gr. A“' : 'FEHLER')];
    });
  });
  T('X', 'Verfügbarkeitsraster mit Pausen', 'Im Fenster „Zeiten & Verfügbarkeit“ stehen die schmalen Pausenzeilen als eigene Tabellenzeilen unter den Wochentagen – nichts rutscht in die Beschriftungsspalte', () => {
    const d = normalisiere(testGrunddaten());
    return mitDaten(d, () => {
      const S = d.schule, m = S.tage.map(() => S.stunden.map(() => 1));
      const v = verfuegbarkeitInhalt(m, { pausen: [] });
      const box = h('div', { style: { position: 'absolute', left: '-3000px', top: '0', width: '900px' } }, v.el); document.body.append(box);
      try {
        const tab = box.querySelector('table.verf'), kopf = [...tab.rows[0].cells].map(c => Math.round(c.getBoundingClientRect().left));
        const zeilen = [...tab.querySelectorAll('tr.pzeile')];
        const schief = zeilen.filter(tr => getComputedStyle(tr).display !== 'table-row' || [...tr.cells].some((c, i) => Math.abs(Math.round(c.getBoundingClientRect().left) - kopf[i]) > 2)).length;
        return [zeilen.length > 0 && schief === 0, zeilen.length + ' Pausenzeilen, davon verschoben: ' + schief];
      } finally { box.remove(); if (v.ende) v.ende(); }
    });
  });
  T('Y', 'Höchstens je Tag im Export', 'Ein eigener Wert der Klasse (Mathe höchstens 1× je Tag) bleibt beim Export erhalten; einen ungültigen Wert meldet die Importprüfung', () => {
    const x = testGrunddaten(); x.klassen[0].maxProTag = { ma: 1 }; const d = normalisiere(x);
    return mitDaten(d, () => {
      const t = JSON.parse(exportText(false)), wert = t.klassen[0].maxProTag;
      const roh = JSON.parse(JSON.stringify(t)); roh.klassen[0].maxProTag = { ma: 99 };
      const bef = importPruefen(roh).filter(f => /maxProTag/.test(f.ort)).length;
      return [JSON.stringify(wert) === '{"ma":1}' && bef === 1, 'exportiert ' + JSON.stringify(wert) + ' · Importprüfung meldet ' + bef + ' ungültigen Wert'];
    });
  });
  T('Z', 'Wochenübersicht der Aufsichten', 'Im Reiter „Aufsichten“ hat jede Aufsicht ein Feld in der Übersicht (Zeile = Aufsicht und Bereich, Spalte = Tag); fehlt sie an einem Tag, steht dort „+“', () => {
    const x = testGrunddaten(); x.dienste = { bereiche: [{ id: 'b1', name: 'Hof' }, { id: 'b2', name: 'Flur' }], bedarfe: [0, 1, 2].map(t => ({ tag: t, typ: 'dt_dienst', bereich: 'b1', name: 'Große Pause', abschnitte: [{ beginn: '09:30', ende: '09:50', min: 1, soll: 2 }] })).concat([{ tag: 0, typ: 'dt_dienst', bereich: 'b2', name: 'Große Pause', abschnitte: [{ beginn: '09:30', ende: '09:50', min: 1, soll: 1 }] }]) };
    const d = normalisiere(x);
    return mitDaten(d, () => {
      const box = h('div', {}, dienstBedarfTab()); const felder = box.querySelectorAll('.bm-feld').length, plus = box.querySelectorAll('.bm-neu').length, zeilen = box.querySelectorAll('tbody.bm-gruppe tr').length;
      return [felder === 4 && zeilen === 2 && plus === 2 * d.schule.tage.length - 4 && !!box.querySelector('#bedarfDetail'), felder + ' Felder für 4 Aufsichten, ' + zeilen + ' Zeilen (Hof, Flur), ' + plus + ' Felder mit „+“'];
    });
  });
  T('NB', 'A/B-Woche und Gruppen nebeneinander', 'Klassenplan (Druck/PDF/HTML) und Gesamtplan: Blöcke zur selben Zeit – Woche A und Woche B, Gruppe 1 und Gruppe 2 – stehen NEBENEINANDER, jeder über die volle Höhe seiner Stunden, Woche A bzw. Gruppe 1 links. Untereinander sähen sie aus wie zwei aufeinanderfolgende Stunden', () => {
    const x = testGrunddaten();
    x.schule.wochenrhythmus = 'AB'; x.lehrer[2].faecher = ['ma'];
    x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1, { bloecke: [2], bloeckeWoche: ['B'] }), uT('u2', 'de', ['k1'], ['A'], 1, { bloecke: [2], bloeckeWoche: ['A'] }),
      uT('u3', 'de', ['k1'], ['B'], 2, { gruppen: ['g2'], bloecke: [2] }), uT('u4', 'ma', ['k1'], ['C'], 2, { gruppen: ['g1'], bloecke: [2] })];
    const p = (u, tag) => ({ unterricht: u, blockNr: 1, tag, stunde: 1, dauer: 2, raum: 'r1', co: [] });
    x.plan = { platzierungen: [p('u1', 0), p('u2', 0), p('u3', 1), p('u4', 1)] };
    const d = normalisiere(x);
    return mitDaten(d, () => {
      const tab = statischerPlan(d, d.plan.platzierungen, 'klasse', 'k1', {});
      const zellen = [...tab.querySelectorAll('td.mehr')].map(td => ({ rs: td.rowSpan, u: [...td.querySelectorAll(':scope > .neben > .de')].map(e => e.dataset.u).join('+') }));
      const gestapelt = [...tab.querySelectorAll('td')].filter(td => td.querySelectorAll('.de').length > 1 && !td.querySelector(':scope > .neben')).length;
      const gp = gpTabelle(d, 0, [d.lehrer.find(l => l.id === 'A')], Object.assign({}, druckOpt()), belegungsIndex(d));
      const th = gp.querySelector('th.gp-p'), bl = [...gp.querySelectorAll('td.gp-b')];
      const gpOk = th && th.colSpan === 2 && bl.length === 2 && bl[0].rowSpan === bl[1].rowSpan && bl[0].parentNode === bl[1].parentNode && /Woche A/.test(bl[0].textContent);
      const ok = zellen.length === 2 && zellen[0].u === 'u2+u1' && zellen[1].u === 'u4+u3' && zellen.every(z => z.rs >= 2) && !gestapelt && gpOk;
      return [ok, 'Klassenplan: ' + zellen.map(z => z.u + ' (über ' + z.rs + ' Zeilen)').join(', ') + (gestapelt ? ' · ' + gestapelt + ' Zellen untereinander' : '') + ' · Gesamtplan A: ' + (th ? th.colSpan : 0) + ' Spuren, ' + bl.length + ' Blöcke' + (gpOk ? ' auf gleicher Höhe, Woche A links' : '')];
    });
  });
  // ---------- GTA-Planer ----------
  const gtaBasis = (extra) => { const x = testGrunddaten(); x.lehrer[0].arbeitszeit = 30;
    x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 2, { bloecke: [1, 1] })];
    x.plan = { platzierungen: [{ unterricht: 'u1', blockNr: 1, tag: 0, stunde: 1, dauer: 1, raum: 'r1' }, { unterricht: 'u1', blockNr: 2, tag: 1, stunde: 1, dauer: 1, raum: 'r1' }] };
    if (extra) extra(x); return normalisiere(x); };
  T('GT1', 'GTA zählt zur Arbeitszeit – on top', 'Eine GTA von 60 min (Person A) zählt zur Arbeitszeit von A und belegt A im Plan, wird bei der Planung des Unterrichts (geplante Arbeitszeit) aber nicht berücksichtigt; eine externe GTA zählt bei niemandem', () => {
    const d = gtaBasis(x => { x.gta = [{ id: 'g1', name: 'Schach', personen: ['A'], tag: 2, zeitArt: 'frei', beginn: '14:00', ende: '15:00' }, { id: 'g2', name: 'Trommeln', extern: 'Musikschule', tag: 3, zeitArt: 'frei', beginn: '14:00', ende: '15:30' }]; });
    const a = arbeitszeiten(d).liste.find(z => z.lehrer === 'A'), plan = arbeitszeiten(d, { geplant: true }).liste.find(z => z.lehrer === 'A'), ohne = arbeitszeiten(d, { ohneGta: true }).liste.find(z => z.lehrer === 'A');
    const alle = arbeitszeiten(d).liste.reduce((s, z) => s + z.gta, 0), bel = ((belegungsIndex(d).get('A') || [])[2] || []).some(b => b.art === 'gta');
    return [a.gta === 60 && Math.abs(a.summe - ohne.summe - 60) < 1e-9 && plan.gta === 0 && alle === 60 && bel, 'A: GTA ' + a.gta + ' min, Summe ' + zahlDe(a.summe / 60, 2) + ' h (ohne GTA ' + zahlDe(ohne.summe / 60, 2) + ' h) · in der Unterrichtsplanung: ' + plan.gta + ' min · alle GTAs zusammen: ' + alle + ' min (extern zählt nicht)'];
  });
  T('GT2', 'GTA nicht mehr möglich – gelb, nicht rot', 'Liegt (z. B. nach einer Neuberechnung) Unterricht der Person zur GTA-Zeit, meldet die Prüfung „GTA nicht mehr möglich – Zeitkonflikt“ als Hinweis (gelb); die Zahl der harten Fehler ändert sich nicht', () => {
    const mk = mit => gtaBasis(x => { x.gta = mit ? [{ id: 'g1', name: 'Schach', personen: ['A'], tag: 0, zeitArt: 'raster', von: 1, bis: 1 }] : []; });
    const d = mk(true), w = gtaWarnungen(d), st = planStatus(d), st0 = planStatus(mk(false));
    return [w.some(v => v.art === 'zeit' && /nicht mehr möglich – Zeitkonflikt/.test(v.text)) && st.hart === st0.hart && st.hinweise.some(x => /GTA nicht mehr möglich/.test(x.titel)), (w[0] ? w[0].text : 'keine Warnung') + ' · harte Fehler ' + st.hart + ' (ohne GTA ' + st0.hart + ')'];
  });
  T('GT3', 'GTA: Arbeitszeitüberschreitung', 'Ohne GTA hält A die Wochenarbeitszeit ein (2 UStd. + Vorbereitung = 160 min bei 3 h); mit einer GTA von 60 min wäre sie hart überschritten → Warnung „GTA nicht mehr möglich – Arbeitszeitüberschreitung!“, die Pflichtprüfung der Arbeitszeit bleibt grün', () => {
    const d = gtaBasis(x => { x.lehrer[0].arbeitszeit = 3; x.gta = [{ id: 'g1', name: 'Schach', personen: ['A'], tag: 2, zeitArt: 'frei', beginn: '14:00', ende: '15:00' }]; });
    const w = gtaWarnungen(d), st = planStatus(d), az = st.pflicht.find(x => x.id === 'arbeitszeit');
    return [w.some(v => v.art === 'arbeitszeit' && /Arbeitszeitüberschreitung!/.test(v.text)) && az.ok, (w.find(v => v.art === 'arbeitszeit') || { text: 'keine Warnung' }).text + ' · Pflichtprüfung Arbeitszeit: ' + (az.ok ? 'erfüllt' : 'verletzt')];
  });
  T('GT4', 'GTA: Raum belegt', 'Eine GTA im Raum R1 zur Zeit des Unterrichts in R1 meldet „Raum belegt“; der GTA-Dialog bietet R1 dann nicht als freien Raum an', () => {
    const d = gtaBasis(x => { x.gta = [{ id: 'g1', name: 'Theater', extern: 'Frau Lange', raum: 'r1', tag: 0, zeitArt: 'raster', von: 1, bis: 1 }]; });
    const w = gtaWarnungen(d), g = d.gta[0], f = raumFreiFuer(d, raumBelegungTag(d, 0, g.id), d.raeume.find(r => r.id === 'r1'), gtaIntervall(d, g)), f2 = raumFreiFuer(d, raumBelegungTag(d, 0, g.id), d.raeume.find(r => r.id === 'r2'), gtaIntervall(d, g));
    return [w.some(v => v.art === 'raum') && !f.frei && f2.frei, (w.find(v => v.art === 'raum') || { text: 'keine Warnung' }).text + ' · R2 frei: ' + (f2.frei ? 'ja' : 'nein')];
  });
  T('GT5', 'Aufsichten respektieren GTAs', 'C hätte als Person mit mehr freier Soll-Arbeitszeit Vorrang für die Hofpause (Di 12:00–12:30), leitet aber zu dieser Zeit eine GTA – die Aufsicht bekommt E', () => {
    const mk = mit => dienstTestDaten(x => { x.lehrer.forEach(l => { l.aufsicht = ['C', 'E'].includes(l.id); }); x.lehrer.find(l => l.id === 'C').arbeitszeit = 10; x.lehrer.find(l => l.id === 'E').arbeitszeit = 1;
      x.dienste.bedarfe = [{ tag: 1, typ: 'dt_pause', bereich: null, abschnitte: [{ beginn: '12:00', ende: '12:30', min: 1, soll: 1 }] }];
      x.gta = mit ? [{ id: 'g1', name: 'Garten', personen: ['C'], tag: 1, zeitArt: 'frei', beginn: '12:00', ende: '13:00' }] : []; });
    const ohne = dienstePlanen(mk(false), { zeitlimit: 200 }), mit = dienstePlanen(mk(true), { zeitlimit: 200 });
    return [ohne.plan.length === 1 && ohne.plan[0].lehrer === 'C' && mit.plan.length === 1 && mit.plan[0].lehrer === 'E', 'ohne GTA: ' + (ohne.plan[0] || {}).lehrer + ' · mit GTA von C: ' + (mit.plan[0] || {}).lehrer];
  });
  T('GT6', 'GTA in einer Sperrzeit erlaubt', 'A ist mittwochs in der 6. Stunde laut Verfügbarkeit gesperrt (für Unterricht und Aufsichten). Eine GTA von A genau dort ist trotzdem möglich: kein Konflikt, nur ein Hinweis, keine Warnung „GTA nicht mehr möglich“', () => {
    const d = gtaBasis(x => { x.lehrer[0].verfuegbarkeit = Array.from({ length: 5 }, () => Array(x.schule.stunden.length).fill(1)); x.lehrer[0].verfuegbarkeit[2][6] = 0; x.gta = [{ id: 'g1', name: 'Garten', personen: ['A'], tag: 2, zeitArt: 'raster', von: 7, bis: 7 }]; });
    const gesperrt = ((belegungsIndex(d, { ohneGta: true }).get('A') || [])[2] || []).some(b => b.art === 'gesperrt'), pr = gtaPruefen(d, d.gta[0]), w = gtaWarnungen(d);
    return [gesperrt && pr.ok && pr.hinweise.some(t => /Sperrzeit/.test(t)) && !w.length, 'Sperrzeit vorhanden: ' + (gesperrt ? 'ja' : 'nein') + ' · Prüfung: ' + (pr.ok ? 'möglich' : 'Konflikt: ' + pr.gruende.join(', ')) + ' · Hinweis: ' + (pr.hinweise[0] || '–') + ' · Warnungen: ' + w.length];
  });
  T('AK', 'Harten Fehler akzeptieren', 'Zwei Stunden von A zur selben Zeit (Doppelbelegung): Nach dem Akzeptieren zählt der Fehler nicht mehr als hart, steht in der Liste der akzeptierten Fehler und verweist auf die betroffenen Stunden (rotes Ausrufezeichen); „Zurücknehmen“ macht ihn wieder hart', () => {
    const x = testGrunddaten(); x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 1), uT('u2', 'ma', ['k2'], ['A'], 1)];
    x.plan = { platzierungen: [{ unterricht: 'u1', blockNr: 1, tag: 0, stunde: 1, dauer: 1 }, { unterricht: 'u2', blockNr: 1, tag: 0, stunde: 1, dauer: 1 }] };
    const d = normalisiere(x), st0 = planStatus(d), it = st0.pflicht.flatMap(p => (p.eintraege || []).map(i => Object.assign({ kat: p.id }, i))).find(i => (i.bloecke || []).length);
    if (!it) return [false, 'kein harter Fehler mit Bezug gefunden'];
    d.akzeptiert = [nAkzeptiert({ schluessel: it.key, kat: it.kat, text: it.text, bloecke: it.bloecke })];
    const st1 = planStatus(d); d.akzeptiert = []; const st2 = planStatus(d);
    return [st1.hart === st0.hart - 1 && st1.akzeptiert.length === 1 && st1.akzeptiert[0].bloecke.length > 0 && st2.hart === st0.hart, 'harte Fehler: ' + st0.hart + ' → akzeptiert ' + st1.hart + ' → zurückgenommen ' + st2.hart + ' · Bezug: ' + (st1.akzeptiert[0] ? st1.akzeptiert[0].bloecke.join(', ') : '–')];
  });
  T('SP', 'Unbesetzte Springer sind gelb', 'Ein Springer, den niemand übernehmen kann, bleibt als „springer“ offen: Die Pflichtprüfung „Mindestbedarf an Aufsichten“ bleibt erfüllt, der Hinweis „Springer (Reserve) nicht besetzt“ erscheint', () => {
    const d = dienstTestDaten(x => { x.lehrer.forEach(l => { l.aufsicht = false; }); x.dienste.bedarfe = [{ tag: 1, typ: 'dt_springer', springer: true, bereich: null, name: 'Springer – Pause', abschnitte: [{ beginn: '12:00', ende: '12:30', min: 1, soll: 1 }] }]; });
    const r = dienstePlanen(d, { zeitlimit: 200 }); d.dienste.plan = r.plan; d.dienste.offen = r.offen;
    const st = planStatus(d), auf = st.pflicht.find(x => x.id === 'aufsicht'), bes = besetzungBedarf(d, d.dienste.bedarfe[0]);
    return [r.offen.length === 1 && r.offen[0].prio === 'springer' && auf.ok && st.hinweise.some(x => /Springer/.test(x.titel)) && bes[0].status === 'warn', 'offen: ' + r.offen.map(o => o.prio).join(', ') + ' · Pflicht Aufsicht: ' + (auf.ok ? 'erfüllt' : 'verletzt') + ' · Besetzung: ' + bes[0].status];
  });
  T('GP', 'Gesamtplan: alles lesbar im Druck', 'Druck/PDF „Gesamtplan je Tag“: jede Person mit einem Einsatz hat an diesem Tag eine Spalte, jeder Einsatz (Unterricht, Aufsicht) steht mit seiner genauen Uhrzeit in der Tabelle; ohne Plan entsteht trotzdem je Tag eine Seite', () => {
    const d = daten();
    return mitDaten(d, () => {
      const o = Object.assign({}, druckOpt(), { art: 'gesamtplan', auswahl: 'alle' }), liste = druckListe(o), idx = belegungsIndex(d), fehlt = [];
      let spalten = 0, soll = 0, eintraege = 0;
      d.schule.tage.forEach((t, tag) => {
        const seiten = liste.filter(x => String(x[1]).startsWith(tag + '|')).map(([a, id, ti], i) => druckSeite(a, id, ti, i, liste.length, o));
        const text = seiten.map(s => s.textContent).join(' ').replace(/[​]/g, '').replace(/ /g, ' ');
        gpPersonen(d, tag, idx).forEach(l => {
          soll++;
          if (seiten.some(s => [...s.querySelectorAll('th.gp-p b')].some(b => b.textContent === (l.kuerzel || l.name)))) spalten++; else fehlt.push(l.kuerzel + ' ' + t);
          ((idx.get(l.id) || [])[tag] || []).filter(b => b.art !== 'gesperrt').forEach(b => { eintraege++; const z = zeitText(b.start) + '–' + zeitText(b.end); if (!text.includes(z)) fehlt.push(l.kuerzel + ' ' + t + ' ' + z); });
        });
      });
      return [!fehlt.length && soll > 0 && spalten === soll && liste.length >= d.schule.tage.length, spalten + ' von ' + soll + ' Personenspalten, ' + eintraege + ' Einsätze geprüft, ' + liste.length + ' Seiten' + (fehlt.length ? ' – fehlt: ' + fehlt.slice(0, 4).join('; ') : '')];
    });
  });
  T('GT7', 'GTAs im Gesamtplan', 'Druck/PDF „Gesamtplan je Tag“: Die GTA von A steht in der Spalte von A („mit Musikschule (extern)“), die externe Leitung „Musikschule“ hat eine eigene Spalte „extern · GTA“ mit beiden GTAs, eine GTA ganz ohne Leitung steht in der Spalte „GTA ohne Leitung“', () => {
    const d = gtaBasis(x => { x.gta = [{ id: 'g1', name: 'Schach', personen: ['A'], extern: 'Musikschule', tag: 2, zeitArt: 'frei', beginn: '14:00', ende: '15:00' }, { id: 'g2', name: 'Trommeln', extern: 'Musikschule', tag: 2, zeitArt: 'frei', beginn: '15:15', ende: '16:00' }, { id: 'g3', name: 'Garten', tag: 2, zeitArt: 'frei', beginn: '14:30', ende: '15:30' }]; });
    return mitDaten(d, () => {
      const o = Object.assign({}, druckOpt(), { art: 'gesamtplan', auswahl: '2' }), liste = druckListe(o);
      const seiten = liste.map(([a, id, ti], i) => druckSeite(a, id, ti, i, liste.length, o));
      const kopf = seiten.flatMap(s => [...s.querySelectorAll('th.gp-p')].map(th => th.querySelector('b').textContent.replace(/​/g, '') + (th.classList.contains('gp-ext') ? '*' : '')));
      const text = seiten.map(s => s.textContent).join(' ').replace(/​/g, '').replace(/ /g, ' ');
      const ext = seiten.flatMap(s => { const th = [...s.querySelectorAll('th.gp-p')]; const i = th.findIndex(t => /Musikschule/.test(t.textContent)); return i < 0 ? [] : [i]; });
      const ok = kopf.includes('A') && kopf.includes('Musikschule*') && kopf.includes('GTA ohne Leitung*') && /GTA Schach.*mit Musikschule \(extern\)/.test(text) && /mit A/.test(text) && /GTA Trommeln/.test(text) && /GTA Garten/.test(text) && text.includes('15:15–16:00') && ext.length === 1;
      return [ok, 'Spalten: ' + kopf.join(', ') + ' (* = extern/ohne Leitung) · ' + (/(GTA Schach[^G]*)/.exec(text) || ['–'])[0].trim().slice(0, 70)];
    });
  });
  T('PL', 'PDF ohne Legenden und Erklärungen', 'Alle Druckarten (Klassen, Lehrkräfte, Räume, Gesamtplan, Aufsichtspläne, Arbeitszeitübersicht, GTA-Plan, Arbeitszeitnachweis): keine Legende, keine erklärenden Absätze; die Fußzeile nennt nur „Stand: …“ und die Seitenzahl', () => {
    const d = daten();
    d.gta = [{ id: 'g1', name: 'Schach', personen: ['A'], extern: 'Musikschule', tag: 2, zeitArt: 'frei', beginn: '14:00', ende: '15:00' }];
    return mitDaten(normalisiere(d), () => {
      const arten = ['klassen', 'lehrer', 'raeume', 'gesamtplan', 'arbeitszeitNachweis'].concat(DIENST_DRUCKARTEN.map(x => x[0])), fehler = [];
      let seiten = 0;
      arten.forEach(art => {
        const o = Object.assign({}, druckOpt(), { art, auswahl: 'alle' }), liste = druckListe(o);
        liste.slice(0, 3).forEach(([a, id, ti, wo], i) => {
          const w = h('div'); w.append(druckSeite(a, id, ti, i, liste.length, o, wo));
          w.querySelectorAll('.druckseite').forEach(s => {
            seiten++;
            const fuss = s.querySelector('.df'), st = fuss ? fuss.firstChild.textContent : '';
            if (!/^Stand: [\d.]+$/.test(st)) fehler.push(art + ': Fußzeile „' + st + '“');
            if (s.querySelector('.gp-legende, .legende')) fehler.push(art + ': Legende');
            if (/Grundlage:|Zeiten in Zeitstunden|zählt nicht zur Arbeitszeit|nicht auf Arbeitszeit angerechnet/.test(s.textContent)) fehler.push(art + ': Erklärung im Text');
          });
        });
      });
      return [!fehler.length && seiten >= arten.length, seiten + ' Seiten aus ' + arten.length + ' Druckarten geprüft' + (fehler.length ? ' – ' + fehler.slice(0, 4).join('; ') : '')];
    });
  });
  T('LK', 'Automatisch geplante Co-Lehrkraft herausnehmen', 'Nur für einen Termin herausgenommen: Die automatische Co-Planung lässt diesen Block ohne Co, setzt die Person dort nicht wieder ein und meldet keine Co-Lücke. Aus allen Stunden entfernt: Die Person wird für den Kurs nicht wieder automatisch gewählt – eine andere passende Person springt ein', () => {
    const x = testGrunddaten();
    x.faecher[0].coBedarf = true;
    x.lehrer.push({ id: 'P', kuerzel: 'P', name: 'P', ausgebildet: false, faecher: [], coFaecher: ['ma'], arbeitszeit: 30 }, { id: 'Q', kuerzel: 'Q', name: 'Q', ausgebildet: false, faecher: [], coFaecher: ['ma'], arbeitszeit: 30 });
    x.klassen[0].team = ['P'];
    x.unterrichte = [uT('u1', 'ma', ['k1'], ['A'], 2, { bloecke: [1, 1] })];
    x.plan = { platzierungen: [{ unterricht: 'u1', blockNr: 1, tag: 0, stunde: 1, dauer: 1, raum: 'r1', co: [] }, { unterricht: 'u1', blockNr: 2, tag: 1, stunde: 1, dauer: 1, raum: 'r1', co: [] }] };
    const d0 = normalisiere(x); coNachPlanErgaenzen(d0, { ersetzen: true });
    const halter = (dd, nr) => dd.lehrer.filter(l => (belegungsIndex(dd).get(l.id) || []).some(t => t.some(b => b.art === 'co' && b.ref === 'u1' && b.block === nr))).map(l => l.id).join('+') || '–';
    const vorher = halter(d0, 1) + '/' + halter(d0, 2);
    const fn = umfang => mitDaten(d0, () => { const { M } = modell(), e1 = M.uEv[M.uI.get('u1')][0]; return lkEntfernenFn(lkImTermin(e1, 'P'), 'P', umfang); });
    const nach = umfang => { let dd = JSON.parse(JSON.stringify(d0)); fn(umfang)(dd); dd = normalisiere(dd); coNachPlanErgaenzen(dd, { ersetzen: true }); return dd; };
    const b = nach('block'), a = nach('alle');
    const coLuecke = offenePunkte(b).filter(g => g.art === 'co' || g.art === 'coTeil').length;
    const ok = vorher === 'P/P' && halter(b, 1) === '–' && halter(b, 2) === 'P' && !coLuecke && halter(a, 1) === 'Q' && halter(a, 2) === 'Q' && a.unterrichte[0].ohneAuto.includes('P');
    return [ok, 'vorher ' + vorher + ' · nur Block 1 herausgenommen: ' + halter(b, 1) + '/' + halter(b, 2) + (coLuecke ? ' (Co-Lücke gemeldet)' : '') + ' · aus allen Stunden: ' + halter(a, 1) + '/' + halter(a, 2) + ', nicht automatisch: ' + (a.unterrichte[0].ohneAuto.join(',') || '–')];
  });
  T('LF', 'Automatisch gewählte Fachlehrkraft entfernen', 'Aus allen Stunden entfernt: Die Fachlehrkraft bleibt „automatisch“, die Berechnung zieht die entfernte Person für diesen Kurs aber nicht mehr in Betracht', () => {
    const x = testGrunddaten(); x.lehrer[1].faecher = ['de', 'ma'];
    x.unterrichte = [uT('u1', 'ma', ['k1'], [{ lehrer: 'A', rolle: 'fach', modus: 'immer', auto: true }], 2, { fachAuto: true, bloecke: [1, 1] })];
    x.plan = { platzierungen: [{ unterricht: 'u1', blockNr: 1, tag: 0, stunde: 1, dauer: 1, raum: 'r1', co: [] }, { unterricht: 'u1', blockNr: 2, tag: 1, stunde: 1, dauer: 1, raum: 'r1', co: [] }] };
    const d0 = normalisiere(x);
    const kand = dd => { const M = kompiliere(dd, { personal: true }); return M.PE.length ? M.PE[0].cands.map(t => M.lKz[t]).join('+') : '–'; };
    const vorher = kand(d0);
    const f = mitDaten(d0, () => { const { M } = modell(), e1 = M.uEv[M.uI.get('u1')][0]; return lkEntfernenFn(lkImTermin(e1, 'A'), 'A', 'alle'); });
    let d1 = JSON.parse(JSON.stringify(d0)); f(d1); d1 = normalisiere(d1);
    const u = d1.unterrichte[0], nachher = kand(d1);
    return [vorher === 'A+B' && nachher === 'B' && u.fachAuto && !u.lehrkraefte.some(z => z.rolle === 'fach'), 'Kandidaten vorher ' + vorher + ', nachher ' + nachher + ' · Fachlehrkraft automatisch: ' + (u.fachAuto ? 'ja' : 'nein')];
  });
  return erg;
}
