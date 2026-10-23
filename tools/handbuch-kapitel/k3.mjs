// Kapitel 3 „Einrichtung“: Aufnahmen der Stammdaten-Seiten und ihrer Dialoge
const klasse = n => `APP.daten.klassen.find(k => k.name === '${n}')`;
const fach = kz => `APP.daten.faecher.find(f => f.kuerzel === '${kz}')`;
const person = kz => `APP.daten.lehrer.find(l => l.kuerzel === '${kz}')`;
const sp = (c, y = 0) => c.js(`document.querySelector('#inhalt').scrollTop = ${y}`);

export default { bilder: async c => {
  const { A, INHALT } = c;
  const SEITE = (h, y = 56) => A(INHALT.x, y, INHALT.w, h);

  // 3.1 Schule & Zeitraster
  await c.gehe('schule');
  await c.marke2(1, { text: 'Zeitraster & Pausen', sel: '[role=tab], button', in: '#inhalt' }); await c.marke2(2, { text: 'Unterrichtstage', sel: '#inhalt *', hoch: false }, { rahmen: false, pos: 'links' });
  await c.marke2(3, { text: 'Wochenrhythmus', teil: true, sel: '#inhalt label', hoch: 'label' }, { pos: 'rechts' }); await c.marke2(4, { text: 'Unterrichtsschluss je Wochentag', teil: true, sel: '#inhalt *', hoch: false }, { rahmen: false, pos: 'links' });
  await c.bild('k03-schule', SEITE(480));
  await c.klicke2({ text: 'Zeitraster & Pausen', sel: '[role=tab], button', in: '#inhalt' }); await c.ruhe(600);
  await c.marke2(1, { text: '45-Minuten-Raster mit Pausen', sel: 'button' }); await c.marke2(2, { text: 'Folgende Zeiten mitverschieben', teil: true, sel: '#inhalt label', hoch: 'label' }, { pos: 'rechts' });
  await c.marke2(3, { text: 'Stundendauer für alle Unterrichtsstunden', teil: true, sel: '#inhalt *', hoch: false }, { rahmen: false, pos: 'links' }); await c.marke2(4, { text: 'Lücke zwischen zwei Stunden –', teil: true, sel: '#inhalt *', hoch: false }, { pos: 'links' });
  await c.bild('k03-zeitraster', SEITE(640));
  await c.klicke2({ text: 'Zeitprofile', teil: true, sel: '[role=tab], button', in: '#inhalt' }); await c.ruhe(600);
  await c.marke2(1, { text: '+ Zeitprofil', sel: 'button' }); await c.marke2(2, { text: 'Gilt für', teil: true, sel: '#inhalt *', hoch: false, nth: 0 }, { rahmen: false, pos: 'links' });
  await c.bild('k03-zeitprofile', SEITE(620));
  if (await c.klicke2({ text: 'Klassen:', teil: true, sel: '#inhalt button' })) { await c.ruhe(600); await c.bildDialog('k03-zeitprofil-gilt'); await c.schliesseDialog(); }

  // 3.2 Arbeitszeit: Rechenmodell
  await c.gehe('arbeitszeit');
  await c.klicke2({ text: 'Grenzen & Rechenmodell', teil: true, sel: '[role=tab], button', in: '#inhalt' }); await c.ruhe(600);
  await c.marke2(1, { text: 'Arbeitszeitgrenzen', teil: true, sel: '#inhalt label', hoch: 'label' }); await c.marke2(2, { text: 'Unterrichtsdeputat begrenzen', teil: true, sel: '#inhalt label', hoch: 'label' });
  await c.bild('k03-arbeitszeit-modell', SEITE(804));
  await sp(c, 760); await c.ruhe(400);
  await c.marke2(1, { text: 'Vorbereitung Lehrkraft', teil: true, sel: '#inhalt label', hoch: 'label' }); await c.marke2(2, { text: 'Klassenleitung (min/Woche)', teil: true, sel: '#inhalt label', hoch: 'label' });
  await c.marke2(3, { text: 'Wochenarbeitszeit (h)', teil: true, sel: '#inhalt label', hoch: 'label' }); await c.marke2(4, { text: 'für alle setzen', sel: '#inhalt button', nth: 0 });
  await c.bild('k03-arbeitszeit-modell2', SEITE(804));

  // 3.3 Tabellen bedienen (am Beispiel der Fächer)
  await c.gehe('faecher');
  await c.js("(() => { const k = [...document.querySelectorAll('#inhalt input[type=checkbox]')]; if (k[2]) k[2].click(); if (k[3]) k[3].click(); })()"); await c.ruhe(500);
  await c.marke2(1, { text: '+ Neue Zeile', sel: 'button' }); await c.marke2(2, { text: 'Aus Excel einfügen', sel: 'button' }); await c.marke2(3, { text: 'Standardfächer einfügen', sel: 'button' });
  await c.marke2(4, { sel: '#inhalt input[type=search], #inhalt input[placeholder^=Suchen]', hoch: false }); await c.marke2(5, { text: 'ausgewählt', teil: true, sel: '#inhalt *', hoch: false }, { pos: 'links' });
  await c.bild('k03-tabelle', SEITE(560));
  await c.klicke2({ text: 'Aus Excel einfügen', sel: 'button' }); await c.ruhe(600);
  await c.js("(() => { const t = document.querySelector('dialog[open] textarea'); if (t) t.focus(); })()");
  await c.p.sende('Input.insertText', { text: 'TC\tTechnik\tinformatik\tbevorzugt\t2' }); await c.warte(600);
  await c.bildDialog('k03-excel'); await c.schliesseDialog();

  // 3.4 Fächer
  await c.gehe('faecher');
  for (const [n, t] of [[1, 'Kürzel'], [2, 'Farbe'], [3, 'Raumtyp'], [4, 'Doppelstunde'], [5, 'Kernfach'], [6, 'Co einplanen'], [7, 'Vorbereitung']]) await c.marke2(n, { text: t, teil: true, sel: '#inhalt th', hoch: false });
  await c.bild('k03-faecher', SEITE(520));

  // 3.5 Räume
  await c.gehe('raeume');
  await c.marke2(1, { text: 'Massenanlage', teil: true, sel: '#inhalt *', hoch: '.karte' }); await c.marke2(2, { text: 'Typ', teil: true, sel: '#inhalt th', hoch: false }); await c.marke2(3, { text: 'Kapazität', teil: true, sel: '#inhalt th', hoch: false });
  await c.marke2(4, { text: 'teilbar', teil: true, sel: '#inhalt th', hoch: false }); await c.marke2(5, { text: 'Verfügbarkeit', teil: true, sel: '#inhalt th', hoch: false });
  await c.bild('k03-raeume', SEITE(560));

  // 3.6 Klassen & Gruppen
  await c.gehe('klassen');
  await c.marke2(1, { text: 'Massenanlage über Muster', sel: '#inhalt *', hoch: '.karte' }); await c.marke2(2, { text: 'Klasse 5a', teil: true, sel: '#inhalt [data-id]', hoch: false, nth: 0 });
  await c.marke2(3, { text: 'Klassenleitung', sel: '#inhalt *', hoch: false }, { rahmen: false, pos: 'links' }); await c.marke2(4, { text: 'Liste mit Details', sel: 'button' });
  await c.bild('k03-klassen', SEITE(700));
  await sp(c, 650); await c.ruhe(400);
  await c.marke2(1, { text: 'Gruppen & Klassenteam', teil: true, sel: '#inhalt *', hoch: false }, { rahmen: false, pos: 'links' }); await c.marke2(2, { text: 'Zeitprofil', sel: '#inhalt *', hoch: false });
  await c.bild('k03-klasse-details', SEITE(700));
  await c.js(`void gruppenDialog(${klasse('6a')})`); await c.ruhe(700); await c.bildDialog('k03-gruppen'); await c.schliesseDialog();
  await c.js(`void teamDialog(${klasse('5a')})`); await c.ruhe(700); await c.bildDialog('k03-klassenteam'); await c.schliesseDialog();

  // 3.7 Stundentafeln
  await c.gehe('klassen');
  await c.klicke2({ text: 'Stundentafeln', sel: '[role=tab], button', in: '#inhalt' }); await c.ruhe(800);
  await c.marke2(1, { sel: '#inhalt input[type=number]', nth: 0, hoch: false }); await c.marke2(2, { text: 'Co 2', sel: '#inhalt *', hoch: false });
  await c.marke2(3, { text: 'Σ je Schüler', teil: true, sel: '#inhalt th', hoch: false });
  await c.bild('k03-stundentafel', SEITE(560));
  await c.js(`void tafelZelleDialog(${klasse('6a')}, ${fach('Ku')}, () => {})`); await c.ruhe(700); await c.bildDialog('k03-tafelzelle'); await c.schliesseDialog();
  await c.js("(() => { const i = document.querySelector('#inhalt'); i.scrollTop = i.scrollHeight; })()"); await c.ruhe(400);
  await c.marke2(1, { text: 'Aus Unterrichtsverteilung übernehmen', teil: true, sel: '#inhalt button' }); await c.marke2(2, { text: 'Stundentafel kopieren von', teil: true, sel: '#inhalt *', hoch: false }, { rahmen: false, pos: 'links' });
  await c.bild('k03-stundentafel-unten', SEITE(420, 400));

  // 3.8 Mitarbeitende
  await c.gehe('lehrer');
  await c.marke2(1, { sel: '#inhalt [data-id]', nth: 0, hoch: false }); await c.marke2(2, { text: 'Art', sel: '#inhalt *', hoch: false }, { rahmen: false, pos: 'links' }); await c.marke2(3, { text: 'Wochenarbeitszeit (h)', sel: '#inhalt *', hoch: false }, { rahmen: false, pos: 'links' });
  await c.marke2(4, { text: 'Fächer', sel: '#inhalt h3, #inhalt h4, #inhalt strong, #inhalt div, #inhalt span', hoch: false }, { rahmen: false, pos: 'links' }); await c.marke2(5, { text: 'Liste mit Details', sel: 'button' });
  await c.bild('k03-mitarbeitende', SEITE(720));
  await sp(c, 700); await c.ruhe(400); await c.bild('k03-mitarbeitende-unten', SEITE(700));
  await c.js(`void faecherDialog(${person('Mü')})`); await c.ruhe(700); await c.bildDialog('k03-lehrer-faecher'); await c.schliesseDialog();
  for (const [r, n] of [['verf', 'k03-verfuegbarkeit'], ['grenzen', 'k03-grenzen'], ['dienste', 'k03-dienste-person']]) {
    await c.js(`void personDialog(${person('Mü')}, '${r}')`); await c.ruhe(900); await c.bildDialog(n); await c.schliesseDialog();
  }
  await c.klicke2({ text: 'Tabelle', sel: 'button' }); await c.ruhe(700);
  await c.bild('k03-mitarbeitende-tabelle', SEITE(560));
  await c.klicke2({ text: 'Liste mit Details', sel: 'button' });

  // 3.9 Arbeitszeit & Deputat: Übersicht
  await c.gehe('arbeitszeit');
  await c.klicke2({ text: 'Übersicht je Person', teil: true, sel: '[role=tab], button', in: '#inhalt' }); await c.ruhe(600);
  await c.marke2(1, { text: 'Kompakt', sel: 'button' }); await c.marke2(2, { text: 'Alle Bestandteile', sel: 'button' }); await c.marke2(3, { text: 'Einsätze & Anwesenheit', sel: 'button' });
  await c.bild('k03-arbeitszeit-uebersicht', SEITE(560));

  // 3.10 Aufgaben
  await c.gehe('aufgaben');
  await c.marke2(1, { text: '+ Neue Aufgabe', sel: 'button' });
  await c.bild('k03-aufgaben', SEITE(420));
  await c.js("void aufgabeDialog('a_sl')"); await c.ruhe(900); await c.bildDialog('k03-aufgabe-dialog'); await c.schliesseDialog();

  // 3.11 Unterrichtsversorgung (Expertenmodus)
  await c.expert(true);
  await c.gehe('unterricht');
  await c.marke2(1, { text: 'Mit Stundentafel abgleichen', sel: 'button' }); await c.marke2(2, { text: '+ Neuer Unterricht', sel: 'button' }); await c.marke2(3, { text: 'Leeren …', sel: 'button' });
  await c.bild('k03-unterricht-matrix', SEITE(700));
  await sp(c, 640); await c.ruhe(400);
  await c.marke2(1, { text: 'Alle Unterrichte', teil: true, sel: '#inhalt h2, #inhalt h3', hoch: false }, { rahmen: false, pos: 'links' });
  await c.bild('k03-unterricht-liste', SEITE(700));
  await c.js("void unterrichtDialog(APP.daten.unterrichte.find(u => !u.aufgabe && u.fach === 'f_ch').id)"); await c.ruhe(900); await c.bildDialog('k03-unterricht-dialog'); await c.schliesseDialog();
  await c.js('void verteilungLeerenDialog()'); await c.ruhe(700); await c.bildDialog('k03-leeren'); await c.schliesseDialog();
  await c.expert(false);

  // 3.12 Prüfung
  await c.gehe('pruefung');
  await c.marke2(1, { text: 'keine Fehler', teil: true, sel: '#inhalt *', hoch: false }); await c.marke2(2, { text: 'Plan berechnen', sel: '#inhalt button' });
  await c.bild('k03-pruefung', SEITE(420));
  // ein Beispiel mit Fehlern: zwei Personen mit demselben Kürzel
  await c.js("aendern('Fehlerbeispiel', d => { d.lehrer[1].kuerzel = d.lehrer[0].kuerzel; })"); await c.gehe('pruefung');
  await c.marke2(1, { text: 'Fehler', teil: true, sel: '#inhalt *', hoch: false });
  await c.bild('k03-pruefung-fehler', SEITE(560));
} };
