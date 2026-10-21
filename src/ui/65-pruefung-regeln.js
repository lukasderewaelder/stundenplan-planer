/* ---------------- Prüfung & Start ---------------- */
SEITEN_RENDER.pruefung = () => {
  const d = APP.daten;
  APP.mach = machbarkeit(d);
  const f = machFehler(), w = APP.mach.filter(x => x.stufe === 'warnung'), hw = APP.mach.filter(x => x.stufe === 'hinweis');
  const M = modell().M;
  // Wochenstunden: Summe über die Klassen, je Schüler gezählt (Halbgruppen einmal, A-/B-Wochen halb)
  const blP = bloeckeAlle(d);
  const std = d.klassen.reduce((a, k) => a + schuelerWochenstunden(d, k.id, null, 'verteilung', { bl: blP }), 0);
  const SYM = { fehler: ['h', '✕ Fehler'], warnung: ['w', '! Warnung'], hinweis: ['i', 'ℹ Hinweis'] };
  const eintrag = x => h('li', { onclick: () => springeZu(x.ziel), title: x.ziel ? 'Zur betroffenen Stelle springen' : '' }, h('span', { class: 'sym ' + SYM[x.stufe][0] }, SYM[x.stufe][1]), h('span', {}, x.text), x.ziel ? h('span', { class: 'rechts muted' }, icon('pfeil-rechts')) : null);
  return [
    seitenkopf('Prüfung & Start', 'Vorprüfung vor der Berechnung: Stimmen Stundentafel und Unterricht je Schüler überein? Sind Halbgruppen, Parallelbänder und Blockzwänge darstellbar? Gibt es für jeden Unterricht eine geeignete Lehrkraft? Fehler blockieren die Berechnung, Warnungen und Hinweise nicht. Ein Klick springt zur betroffenen Stelle.'),
    h('div', { class: 'kennzahlen' },
      [['Klassen', d.klassen.length], ['Lehrkräfte', d.lehrer.length], ['Räume', d.raeume.length], ['Unterrichte', d.unterrichte.length], ['Blöcke', M.E.length], ['UStd. je Woche (Schüler)', zahlDe(std, 1)]].map(([n, v]) => h('div', { class: 'kennzahl', title: n === 'UStd. je Woche (Schüler)' ? 'Summe über alle Klassen, je Schüler gezählt: Halbgruppen einmal, A-/B-Wochen halb' : null }, h('div', { class: 'w' }, v), h('div', { class: 'n' }, n)))),
    h('div', { class: 'karte' },
      h('div', { class: 'zeile' }, f.length ? h('span', { class: 'badge err' }, '✕ ' + f.length + ' Fehler') : h('span', { class: 'badge ok' }, '✓ keine Fehler'), w.length ? h('span', { class: 'badge warn' }, '! ' + w.length + ' Warnungen') : null, hw.length ? h('span', { class: 'badge neutral' }, 'ℹ ' + hw.length + (hw.length === 1 ? ' Hinweis' : ' Hinweise')) : null,
        h('div', { class: 'rechts' }), h('button', { class: 'btn primaer', disabled: !!f.length || !d.unterrichte.length, title: f.length ? 'Erst die Fehler beheben' : '', onclick: () => { gehe('berechnung'); rechnungStart(); } }, 'Plan berechnen')),
      APP.mach.length ? h('ul', { class: 'vliste', style: { maxHeight: 'none', marginTop: '10px' } }, f.concat(w, hw).map(eintrag)) : d.unterrichte.length ? h('p', { class: 'muted' }, 'Alles bereit.') : leerZustand({ klein: true, icon: 'pruefung', titel: 'Noch nichts zu prüfen', text: 'Die Vorprüfung meldet Lücken und Widersprüche, sobald Klassen und Unterricht angelegt sind.', aktion: { text: 'Zur Übersicht', tun: () => gehe('start') } })),
    d.plan.platzierungen.length ? (() => { const st = planAmpel(), n = offenePunkteZahl(); return h('div', { class: 'hinweis zeile' }, ampelPunkt(st), h('span', {}, 'Berechneter Plan: ' + (st.ampel === 'rot' ? hartText(hartEnd()) : n ? n + (n === 1 ? ' offener Punkt' : ' offene Punkte') : 'keine offenen Punkte') + '.'), h('div', { class: 'rechts' }), h('button', { class: 'btn klein', onclick: () => gehe('auswertung', { reiter: 'offen' }) }, 'Ergebnis ansehen →')); })() : null,
    d.dienste.bedarfe.length || d.dienste.plan.length ? (() => { const pr = dienstPruefung(d), f = pr.meldungen.filter(m => m.stufe === 'fehler').length, w = pr.meldungen.filter(m => m.stufe === 'warnung').length; return h('div', { class: 'hinweis zeile' + (f ? ' err' : w ? ' warn' : ' ok') }, h('b', {}, 'Aufsichten: '), h('span', {}, f || w ? [f ? f + ' Fehler' : null, w ? w + (w === 1 ? ' Warnung' : ' Warnungen') : null].filter(Boolean).join(', ') + (pr.kennzahlen.veraltet ? ' · Plan nicht mehr aktuell' : '') + ' – blockieren die Stundenplanberechnung nicht.' : 'keine Meldungen' + (pr.kennzahlen.veraltet ? ' · Plan nicht mehr aktuell' : '') + '.'), h('div', { class: 'rechts' }), h('button', { class: 'btn klein', onclick: () => dienstSpringeZu({ tab: 'auswertung' }) }, 'Zur Auswertung der Aufsichten →')); })() : null
  ];
};

/* ---------------- Regeln ---------------- */
function profilAnwenden(id) {
  aendern('Gewichtsprofil ' + PROFILE[id].name, d => {
    REGELN.forEach(r => { if (!r.hart) d.regeln.gewichte[r.id] = r.std; });
    if (id === 'lehrkraefte') ['W01', 'W02', 'W03', 'W04', 'W05', 'W12'].forEach(k => { d.regeln.gewichte[k] = 9; });
    if (id === 'schueler') ['W02', 'W06', 'W07', 'W13'].forEach(k => { d.regeln.gewichte[k] = 9; });
  });
}
// Klartext-Name einer Regel (Stundenplan oder Aufsichten) – in der Oberfläche steht nie die Kennung.
// Kleine Marke mit dem Regelnamen, z. B. vor einem Verstoß in einer Liste
function regelMarke(id) { return h('span', { class: 'regelmarke' }, regelName(id)); }
// Erklärung einer Regel als Popover: Beschreibung, Beispiel und – nur hier – die technische Kennung (für Rückfragen).
function regelHilfe(r) {
  return hilfe(() => [h('p', {}, r.text), r.beispiel ? h('p', {}, h('i', {}, 'Beispiel: ' + r.beispiel)) : null,
    h('div', { class: 'technik' }, 'Technische Kennung: ', h('code', {}, r.id))], { text: r.name + ' – ' + r.text });
}
// Wichtigkeit eines Wunsches: 0 = aus … 10 = fast Pflicht
function gewichtWort(v) { v = Number(v) || 0; return v <= 0 ? 'aus' : v <= 3 ? 'weniger wichtig' : v <= 6 ? 'wichtig' : v <= 9 ? 'sehr wichtig' : 'fast Pflicht'; }
// Beschrifteter Regler „unwichtig … sehr wichtig“. setzen(v) wird beim Loslassen aufgerufen.
function gewichtRegler(wert, name, setzen) {
  const zahl = h('b', {}, wert), wort = h('span', {}, gewichtWort(wert));
  const inp = h('input', { type: 'range', min: 0, max: 10, step: 1, value: wert, 'aria-label': 'Wichtigkeit: ' + name, 'aria-valuetext': wert + ' von 10 – ' + gewichtWort(wert),
    oninput: ev => { const v = Number(ev.target.value); zahl.textContent = v; wort.textContent = gewichtWort(v); ev.target.setAttribute('aria-valuetext', v + ' von 10 – ' + gewichtWort(v)); },
    onchange: ev => setzen(Number(ev.target.value)) });
  return h('div', { class: 'gregler' }, h('div', { class: 'gskala' }, inp, h('div', { class: 'genden', 'aria-hidden': 'true' }, h('span', {}, 'unwichtig'), h('span', {}, 'sehr wichtig'))), h('div', { class: 'gwert' }, zahl, wort));
}
// Eine Zeile der Regelseite: Name mit Erklärung · Einstellung (Pflicht/Wunsch, Regler) · Verstöße im aktuellen Plan
function regelZeile(r, steuer, anzahl, zusatz, istPflicht) {
  return h('div', { class: 'regel' + (istPflicht ? ' pflicht' : ' wunsch'), 'data-regel': r.id },
    h('div', { class: 'rtext' }, h('div', { class: 'rname' }, h('b', {}, r.name), regelHilfe(r)), h('div', { class: 'txt' }, r.text), zusatz || null),
    h('div', { class: 'rsteuer' }, steuer),
    anzahl === null ? h('span', { class: 'rzahl leer', title: 'Noch kein Plan berechnet' }, '–') : h('span', { class: 'rzahl' + (anzahl > 0 ? (istPflicht ? ' err' : ' warn') : ''), title: 'Verstöße im aktuellen Plan' }, zahlDe(anzahl, 1), h('span', {}, anzahl === 1 ? 'Verstoß' : 'Verstöße')));
}
SEITEN_RENDER.regeln = () => {
  const d = APP.daten, rw = d.regeln, o = rw.optionen;
  const hatPlan = d.plan.platzierungen.length > 0;
  const tot = hatPlan ? modell().bewertung.tot : null;
  const anzahl = id => tot ? tot[RI[id]] : null;
  const schwelle = (k, text, min, max) => h('label', { class: 'rfeld' }, text, h('input', { type: 'number', min, max, value: o[k], 'aria-label': text, onchange: ev => aendern('Schwelle „' + text + '“', dd => { dd.regeln.optionen[k] = Number(ev.target.value) || min; }, { render: false }) }));
  const paar = () => h('div', { class: 'rzusatz' }, h('div', { class: 'klein muted' }, 'Paarregeln – welche Fächerfolgen vermieden werden:'), rw.paarregeln.map((p, i) => h('div', { class: 'zeile', style: { marginBottom: '4px' } },
    sel(Object.entries(PAARTYPEN), p.typ, v => aendern('Paarregel', dd => { dd.regeln.paarregeln[i].typ = v; }), { 'aria-label': 'Art der Paarregel' }),
    p.typ !== 'schwerHintereinander' ? h('span', { class: 'zeile eng' }, 'A:', sel(fachOpts('–'), p.a, v => aendern('Paarregel', dd => { dd.regeln.paarregeln[i].a = v; }), { 'aria-label': 'Fach A' })) : null,
    p.typ === 'nichtNach' ? h('span', { class: 'zeile eng' }, 'B:', sel(fachOpts('–'), p.b, v => aendern('Paarregel', dd => { dd.regeln.paarregeln[i].b = v; }), { 'aria-label': 'Fach B' })) : null,
    h('button', { class: 'btn icon klein gefahr', 'aria-label': 'Paarregel entfernen', onclick: () => undoToastNach(() => aendern('Paarregel entfernt', dd => { dd.regeln.paarregeln.splice(i, 1); }), 'Paarregel entfernt.') }, icon('papierkorb')))),
    h('button', { class: 'btn klein', onclick: () => aendern('Paarregel hinzugefügt', dd => { dd.regeln.paarregeln.push({ typ: 'vorPause', a: '', b: '' }); }) }, '+ Paarregel'));
  // Einstellungen, die zu einer bestimmten Regel gehören, stehen direkt bei ihr
  const zusatzVon = r => {
    if (r.id === 'H15') return h('div', { class: 'rzusatz' }, h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: o.spaeterBeginnErlaubt, onchange: ev => aendern('Option späterer Tagesbeginn', dd => { dd.regeln.optionen.spaeterBeginnErlaubt = ev.target.checked; }) }), 'Späterer Tagesbeginn erlaubt (nur Lücken zwischen zwei Stunden zählen)'));
    if (r.id === 'W07') return h('div', { class: 'rzusatz' }, schwelle('kernfachBis', 'Kernfach bis Stunde', 1, 12));
    if (r.id === 'W12') return h('div', { class: 'rzusatz' }, schwelle('spaetAb', 'Später Tag ab Stunde', 1, 12));
    if (r.id === 'W13') return h('div', { class: 'rzusatz' }, schwelle('unterstufeBis', 'Unterstufe bis Jahrgang', 0, 13), schwelle('nachmittagAb', 'Nachmittag ab Stunde', 1, 12));
    if (r.id === 'W09') return paar();
    if (r.id === 'W02' && rw.hartUmschaltbar.H15 === 'hart') return h('div', { class: 'rzusatz klein muted' }, '⚠ Wirkt nur, wenn „' + regelName('H15') + '“ auf „Wunsch“ steht.');
    if (r.id === 'W16') return h('div', { class: 'rzusatz klein muted' }, 'Wirkt nur bei „Änderungen minimal halten“ in der Berechnung.');
    if (r.id === 'W18') return h('div', { class: 'rzusatz klein muted' }, 'Kernfächer werden auf der Seite „Fächer“ markiert. Eine fest eingetragene Fachlehrkraft geht immer vor.');
    return null;
  };
  const zeile = r => {
    if (!r.hart) return regelZeile(r, gewichtRegler(rw.gewichte[r.id], r.name, v => aendern('Wichtigkeit „' + r.name + '“', dd => { dd.regeln.gewichte[r.id] = v; }, { render: false })), anzahl(r.id), zusatzVon(r), false);
    if (!r.umschaltbar) return regelZeile(r, h('span', { class: 'pflichtmarke', title: 'Diese Regel gilt immer und lässt sich nicht abschwächen.' }, icon('schloss', 'k'), 'Pflicht'), anzahl(r.id), zusatzVon(r), true);
    const weichGestellt = rw.hartUmschaltbar[r.id] === 'weich';
    return regelZeile(r, [
      h('div', { class: 'segment klein', role: 'radiogroup', 'aria-label': r.name + ': Pflicht oder Wunsch' }, [['hart', 'Pflicht'], ['weich', 'Wunsch']].map(([w, t]) =>
        h('label', {}, h('input', { type: 'radio', name: 'art_' + r.id, value: w, checked: (rw.hartUmschaltbar[r.id] || 'hart') === w, onchange: () => aendern('„' + r.name + '“ als ' + t, dd => { dd.regeln.hartUmschaltbar[r.id] = w; }) }), t))),
      weichGestellt && r.id !== 'H15' ? gewichtRegler(rw.gewichteHart[r.id], r.name, v => aendern('Wichtigkeit „' + r.name + '“', dd => { dd.regeln.gewichteHart[r.id] = v; }, { render: false })) : null,
      weichGestellt && r.id === 'H15' ? h('span', { class: 'muted klein' }, 'zählt über den Wunsch „' + regelName('W02') + '“') : null
    ], anzahl(r.id), zusatzVon(r), !weichGestellt);
  };
  const THEMEN = [['Lehrkräfte', 'personen'], ['Klassen', 'gruppe'], ['Räume', 'tuer'], ['Fächer', 'buch'], ['Allgemein', 'regler']];
  const themen = THEMEN.map(([g, sym]) => {
    const rs = REGELN.filter(r => (r.gruppe || 'Allgemein') === g);
    if (!rs.length) return null;
    const pflicht = rs.filter(r => r.hart), wunsch = rs.filter(r => !r.hart);
    return h('div', { class: 'karte regelthema' }, h('h2', {}, icon(sym), g, h('span', { class: 'muted klein' }, pflicht.length + (pflicht.length === 1 ? ' Pflichtregel' : ' Pflichtregeln') + ' · ' + wunsch.length + (wunsch.length === 1 ? ' Wunsch' : ' Wünsche'))),
      pflicht.length ? [h('h3', {}, 'Pflicht'), pflicht.map(zeile)] : null,
      wunsch.length ? [h('h3', {}, 'Wünsche'), wunsch.map(zeile)] : null);
  });
  const rTabs = [['plan', 'Stundenplan'], ['dienste', 'Aufsichten'], ['co', 'Co-Lehrkräfte']];
  const rAktiv = reiterAktiv('regeln', rTabs);
  const rKopf = seitenkopf('Regeln & Gewichte', 'Alle Regeln der Berechnung an einem Ort, nach Themen geordnet: Stundenplan, Aufsichten und das Ergänzen von Co-Lehrkräften. Pflichtregeln dürfen nie verletzt sein. Wünsche fließen mit ihrer Wichtigkeit in die Bewertung ein: Je wichtiger ein Wunsch, desto mehr Strafpunkte kostet jeder Verstoß (Strafpunkte = Wichtigkeit × Zahl der Verstöße). Das Info-Symbol neben jeder Regel erklärt sie mit einem Beispiel.');
  if (rAktiv === 'dienste') return [rKopf, reiterLeiste('regeln', rTabs), h('div', { class: 'reiterinhalt' }, dienstRegelnKarte())];
  if (rAktiv === 'co') {
    const R = Object.assign({}, d.schule.coRegeln);
    return [rKopf, reiterLeiste('regeln', rTabs), h('div', { class: 'reiterinhalt' }, h('div', { class: 'karte' },
      h('h2', { style: { marginTop: 0 } }, 'Co-Lehrkräfte in der Berechnung'),
      h('p', { class: 'muted klein' }, 'Diese Regeln werden ausschließlich während „Plan berechnen“ angewendet. Erst wenn Fachunterricht und Fachlehrkräfte stehen, sucht die Berechnung für den Co-Bedarf passende Personen anhand des Co-Fachs, der tatsächlich berechneten Unterrichtszeiten, des Klassenteams sowie der noch freien Arbeitszeit.'),
      coReihenfolgeText(),
      coRegelnFelder(R, () => aendern('Regeln für Co-Lehrkräfte', dd => { dd.schule.coRegeln = nCoRegeln(R); }, { render: false }))))];
  }
  const PROFIL_TEXT = { ausgewogen: 'Alle Wünsche auf ihre Standard-Wichtigkeit zurücksetzen', lehrkraefte: 'Wünsche der Lehrkräfte auf „sehr wichtig“: wenig Freistunden, ungeliebte und gewünschte Zeiten, freie Tage, kein früher Beginn nach spätem Tag', schueler: 'Wünsche für die Klassen auf „sehr wichtig“: keine Freistunden, Fächer gleichmäßig verteilt, Kernfächer früh, wenig Nachmittag in der Unterstufe' };
  return [
    rKopf, reiterLeiste('regeln', rTabs),
    h('div', { class: 'reiterinhalt' },
      h('div', { class: 'karte regelkopf' },
        h('div', { class: 'legende' }, h('span', {}, h('span', { class: 'pflichtmarke' }, icon('schloss', 'k'), 'Pflicht'), 'darf nie verletzt sein'), h('span', {}, h('span', { class: 'wunschmarke' }, 'Wunsch'), 'kostet Strafpunkte – je wichtiger, desto mehr')),
        h('div', { class: 'zeile' }, h('span', { class: 'muted klein' }, 'Profil für alle Wünsche:'),
          Object.entries(PROFILE).map(([id, p]) => h('button', { class: 'btn klein', onclick: () => profilAnwenden(id), title: PROFIL_TEXT[id] || '' }, p.name)),
          hilfe('Ein Profil stellt die Wichtigkeit aller Wünsche auf einmal ein. Danach lässt sich jeder Regler einzeln nachjustieren.\n0 = aus, 10 = fast Pflicht.'))),
      themen)
  ];
};

