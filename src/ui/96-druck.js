/* ---------------- Druck ---------------- */
function druckOpt() { return Object.assign({}, DRUCK_STD, APP.meta.druck || {}); }
function druckOptSetzen(k, v) { APP.meta.druck = Object.assign(druckOpt(), { [k]: v }); metaSpeichern(); render(); }
function druckListe(o) {
  const d = APP.daten;
  if (o.art === 'gesamtplan') return gpDruckListe(o);
  if (istDienstDruck(o.art)) return dienstDruckListe(o);
  if (o.art === 'arbeitszeitNachweis') return lehrerAlphabetisch(d.lehrer).filter(l => o.auswahl === 'alle' || l.id === o.auswahl).map(l => ['arbeitszeitNachweis', l.id, 'Arbeitszeitnachweis ' + lehrerName(l, true) + (l.kuerzel ? ' (' + l.kuerzel + ')' : '')]);
  const nat = (x, y) => String(x[3]).localeCompare(String(y[3]), 'de', { numeric: true, sensitivity: 'base' });
  const liste = (o.art === 'klassen' ? d.klassen.map(k => ['klasse', k.id, 'Klasse ' + k.name, k.name]).sort(nat) : o.art === 'lehrer' ? lehrerAlphabetisch(d.lehrer).map(l => ['lehrer', l.id, lehrerName(l, true) + ' (' + (l.kuerzel || '') + ')']) : d.raeume.map(r => ['raum', r.id, 'Raum ' + r.name, r.name]).sort(nat)).map(x => x.slice(0, 3));
  const gew = o.auswahl === 'alle' ? liste : liste.filter(x => x[1] === o.auswahl);
  if (!abWochenAktiv() || !o.woche || o.woche === 'beide') return gew;
  if (o.woche === 'getrennt') return gew.flatMap(([a, i, t]) => [[a, i, t + ' – Woche A', 'A'], [a, i, t + ' – Woche B', 'B']]);
  return gew.map(([a, i, t]) => [a, i, t + ' – Woche ' + o.woche, o.woche]);
}
const istDienstDruck = art => DIENST_DRUCKARTEN.some(x => x[0] === art);
function druckSeite(art, id, titel, i, n, o, woche) {
  const d = APP.daten;
  if (art === 'gesamtplan') return gesamtplanSeite(id, titel, i, n, o);
  if (istDienstDruck(art)) return dienstDruckSeite(art, id, titel, i, n);
  if (art === 'arbeitszeitNachweis') return h('div', { class: 'druckseite fliessend lang' + (i > 0 ? ' neueseite' : '') }, druckKopf(titel), arbeitszeitNachweis(d, id, { druck: true }), druckFuss(i, n));
  o = Object.assign({}, o, { woche: woche || 'beide' });
  const kopfText = d.schule.name + (d.schule.schuljahr ? ' · Schuljahr ' + d.schule.schuljahr : '');
  if (art === 'lehrer') {
    // Lehrerplan: Wochenplan, Termine und – mit der Druckoption „Aufsichten“ – alle Aufsichten und Dienste der Person auf derselben Seite
    const tab = statischerPlan(d, d.plan.platzierungen, art, id, o), termine = terminZeile(d, id);
    const seite = h('div', { class: 'druckseite' },
      h('div', { class: 'dk' }, h('span', { class: 't' }, titel), h('span', {}, kopfText)),
      tab, termine,
      h('div', { class: 'df' }, h('span', {}, 'Stand: ' + datum()), h('span', {}, 'Seite ' + (i + 1) + ' von ' + n)));
    const rest = o.aufsichten !== false ? lehrerSeiteEinpassen(d, id, seite, tab, o.farbe !== false) : null;
    if (!rest) return seite;
    // Mehr Aufsichten, als auf die Seite passen: Fortsetzung auf einer zweiten Seite – nichts wird abgeschnitten
    const f = document.createDocumentFragment();
    f.append(seite, h('div', { class: 'druckseite fortsetzung' }, h('div', { class: 'dk' }, h('span', { class: 't' }, titel + ' – Aufsichten (Fortsetzung)'), h('span', {}, kopfText)), rest,
      h('div', { class: 'df' }, h('span', {}, 'Stand: ' + datum()), h('span', {}, 'Fortsetzung zu Seite ' + (i + 1) + ' von ' + n))));
    return f;
  }
  return h('div', { class: 'druckseite' },
    h('div', { class: 'dk' }, h('span', { class: 't' }, titel), h('span', {}, kopfText)),
    statischerPlan(d, d.plan.platzierungen, art, id, o),
    art === 'raum' ? gtaZeile(d, 'raum', id) : null,
    h('div', { class: 'df' }, h('span', {}, 'Stand: ' + datum()), h('span', {}, 'Seite ' + (i + 1) + ' von ' + n)));
}
function drucken() { const o = druckOpt(); druckenListe(druckListe(o), o); }
function druckenListe(liste, o) {
  if (!liste.length) { toast('Nichts zu drucken.', 'err'); return; }
  const bereich = leeren($('#druck'));
  liste.forEach(([art, id, titel, woche], i) => bereich.append(druckSeite(art, id, titel, i, liste.length, o, woche)));
  setTimeout(() => window.print(), 50);
}
// Druckoptionen je Planart: nur, was dort auch wirkt
const DRUCK_OPTIONEN = {
  klassen: ['zeiten', 'raeume', 'vollnamen', 'pausen', 'gruppen', 'farbe'],
  lehrer: ['zeiten', 'raeume', 'vollnamen', 'pausen', 'gruppen', 'aufsichten', 'farbe'],
  raeume: ['zeiten', 'vollnamen', 'pausen', 'gruppen', 'farbe'],
  gesamtplan: ['raeume', 'gruppen', 'farbe'],
  arbeitszeitNachweis: []
};
SEITEN_RENDER.ausgabe = () => {
  const d = APP.daten, o = druckOpt();
  // frühere Druckarten (gespeicherte Auswahl): auf die heutigen umstellen
  const ALT = { aufsicht: 'dienstWoche', aufsichtLehrer: 'lehrer', dienstPerson: 'lehrer', dienstTag: 'gesamtplan' };
  if (ALT[o.art]) { o.art = ALT[o.art]; o.auswahl = 'alle'; APP.meta.druck = Object.assign(druckOpt(), { art: o.art, auswahl: 'alle' }); }
  const nat = (x, y) => String(x[1]).localeCompare(String(y[1]), 'de', { numeric: true, sensitivity: 'base' });
  const gesamt = o.art === 'gesamtplan', dienstArt = istDienstDruck(o.art) || gesamt || o.art === 'arbeitszeitNachweis';
  const liste = gesamt ? d.schule.tage.map((t, i) => [String(i), TAGE_LANG[t]]) : istDienstDruck(o.art) ? [] : o.art === 'klassen' ? d.klassen.map(k => [k.id, 'Klasse ' + k.name]).sort(nat) : o.art === 'lehrer' || o.art === 'arbeitszeitNachweis' ? lehrerAlphabetisch(d.lehrer).map(l => [l.id, (l.kuerzel || '') + ' – ' + (l.name || '')]) : d.raeume.map(r => [r.id, r.name]).sort(nat);
  if (o.auswahl !== 'alle' && !liste.some(([i]) => i === o.auswahl)) o.auswahl = 'alle';
  const erste = druckListe(o)[0];
  const vorschau = erste && (d.plan.platzierungen.length || dienstArt) ? h('div', { class: 'karte', style: { overflow: 'auto' } }, h('h3', { style: { marginTop: 0 } }, 'Vorschau (erste Seite)'), h('div', { style: { transform: 'scale(.9)', transformOrigin: 'top left' } }, druckSeite(erste[0], erste[1], erste[2], 0, druckListe(o).length, o, erste[3]))) : null;
  const opts = DRUCK_OPTIONEN[o.art] || [];
  const chk = (k, t, erkl) => opts.includes(k) ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: o[k] !== false, 'data-druckopt': k, onchange: ev => druckOptSetzen(k, ev.target.checked) }), t, erkl ? hilfe(erkl) : null) : null;
  const farbe = opts.includes('farbe') ? [h('label', { class: 'check' }, h('input', { type: 'radio', name: 'farbe', checked: o.farbe, onchange: () => druckOptSetzen('farbe', true) }), 'Farbe'),
    h('label', { class: 'check' }, h('input', { type: 'radio', name: 'farbe', checked: !o.farbe, onchange: () => druckOptSetzen('farbe', false) }), gesamt ? 'Schwarzweiß' : 'Schwarzweiß (Muster je Fach)')] : null;
  const tsvArt = APP.editor.art, tsvId = APP.editor.id || (d.klassen[0] || {}).id;
  return [
    seitenkopf('Druck & Export', 'Druckansichten A4 quer (über die Druckfunktion des Browsers auch als PDF), CSV, Zwischenablage und HTML-Weitergabe. Die Projektdatei (Export, Import) steht im Menü oben rechts.'),
    h('div', { class: 'karte' }, h('h2', { style: { marginTop: 0 } }, 'Drucken'),
      h('div', { class: 'zeile', style: { gap: '14px', alignItems: 'flex-end' } },
        h('label', { class: 'feld' }, 'Pläne', sel([{ gruppe: 'Stundenpläne', opts: [['klassen', 'Klassenpläne'], ['lehrer', 'Lehrerpläne (mit Aufsichten = persönlicher Plan)'], ['raeume', 'Raumpläne']] }, { gruppe: 'Gesamtplan', opts: [['gesamtplan', 'Gesamtplan je Tag – alle Personen (Unterricht, Co, Aufgaben, Aufsichten)']] }, { gruppe: 'Aufsichten', opts: DIENST_DRUCKARTEN.filter(x => x[0] !== 'arbeitszeitDienst' && x[0] !== 'gta') }, { gruppe: 'GTA', opts: [['gta', 'GTA-Plan (Ganztagsangebote)']] }, { gruppe: 'Arbeitszeit', opts: [['arbeitszeitDienst', 'Arbeitszeitübersicht (alle Personen)'], ['arbeitszeitNachweis', 'Arbeitszeitnachweis je Person (mit Berechnung)']] }], o.art, v => { APP.meta.druck = Object.assign(druckOpt(), { art: v, auswahl: 'alle' }); metaSpeichern(); render(); })),
        istDienstDruck(o.art) ? null : h('label', { class: 'feld' }, 'Auswahl', sel([['alle', gesamt ? 'Alle Tage (je Tag eigene Seiten)' : o.art === 'klassen' ? 'Alle Klassen drucken' : o.art === 'lehrer' || o.art === 'arbeitszeitNachweis' ? 'Alle Personen drucken' : 'Alle Räume drucken']].concat(liste), o.auswahl, v => druckOptSetzen('auswahl', v))),
        abWochenAktiv() && !dienstArt ? h('label', { class: 'feld' }, 'A/B-Wochen', sel([['beide', 'beide Wochen in einem Plan'], ['A', 'nur Woche A'], ['B', 'nur Woche B'], ['getrennt', 'Woche A und B je eine Seite']], o.woche || 'beide', v => druckOptSetzen('woche', v))) : null,
        gesamt ? h('label', { class: 'feld' }, h('span', {}, 'Personen je Seite', hilfe('Weniger Personen je Seite = breitere Spalten und größere Schrift. Die Personen eines Tages werden gleichmäßig auf die Seiten verteilt (z. B. 23 Personen bei höchstens 12 je Seite: 12 + 11).')), sel(GP_SPALTEN.map(x => [String(x), 'höchstens ' + x]), String(gpSpalten(o)), v => druckOptSetzen('gpSpalten', Number(v)))) : null,
        h('button', { class: 'btn primaer', disabled: !d.plan.platzierungen.length && !dienstArt, onclick: drucken }, 'Drucken / als PDF')),
      opts.length ? h('div', { class: 'zeile', style: { gap: '16px', marginTop: '10px' } }, chk('zeiten', 'Uhrzeiten anzeigen'), chk('raeume', 'Räume anzeigen'), chk('vollnamen', 'Vollnamen statt Kürzel'), chk('pausen', 'Pausen anzeigen'),
        chk('gruppen', 'Gruppenbezeichnung bei Halbgruppen anzeigen', 'Bei geteiltem Unterricht steht die Gruppe am Fach („Ku · Gr. A“) bzw. an der Klasse („6a · Gr. A“). Gilt für Druck, Vorschau, HTML-Weitergabe und die Zwischenablage.'),
        chk('aufsichten', 'Aufsichten mitdrucken', 'Jeder Lehrerplan zeigt unter dem Wochenplan alle Aufsichten und Dienste der Person – das ist der persönliche Plan. Gilt für Druck, Vorschau, HTML-Weitergabe, CSV und die Anzeige unter dem Lehrerplan im Editor.'),
        farbe, gesamt ? h('span', { class: 'muted klein' }, 'Eine Spalte je Person, alle Einsätze mit genauer Uhrzeit; lange Texte brechen um statt abgeschnitten zu werden.') : null) : null,
      !d.plan.platzierungen.length && !dienstArt ? leerZustand({ klein: true, icon: 'drucker', titel: 'Noch kein Plan zum Drucken', text: 'Klassen-, Lehrer- und Raumpläne gibt es, sobald ein Plan berechnet ist.', aktion: { text: 'Plan berechnen', tun: () => { gehe('berechnung'); if (!APP.rechnung.laeuft) rechnungStart(); } } }) : null),
    h('div', { class: 'abstand' }), vorschau, vorschau ? h('div', { class: 'abstand' }) : null,
    h('div', { class: 'karte' }, h('h2', { style: { marginTop: 0 } }, 'Weitere Formate'),
      h('div', { class: 'zeile' },
        h('button', { class: 'btn', disabled: !d.plan.platzierungen.length, onclick: () => herunterladen(planCsv(), 'stundenplan_' + slug(d.schule.name) + '_' + isoDatum() + '.csv', 'text/csv'), title: 'Eine Zeile je Stunde: Klasse, Gruppe, Tag, Stunde, Beginn, Ende, Fach, Fachlehrkraft, Co-Lehrkraft, Raum (Semikolon, UTF-8 mit BOM).' }, 'Plan als CSV'),
        h('button', { class: 'btn', disabled: !d.plan.platzierungen.length || !tsvId, onclick: async () => { const ok = await inZwischenablage(planTsv(tsvArt, tsvId)); toast(ok ? 'Plan (' + (tsvArt === 'klasse' ? 'Klasse' : tsvArt === 'lehrer' ? 'Lehrkraft' : 'Raum') + ' aus dem Editor) als Tabelle kopiert – in Excel oder Word einfügen.' : 'Kopieren nicht möglich.', ok ? 'ok' : 'err'); }, title: 'Kopiert den im Editor gewählten Plan als Tab-getrennten Text.' }, 'Aktuellen Editor-Plan kopieren'),
        h('button', { class: 'btn', disabled: !d.plan.platzierungen.length, onclick: htmlExport, title: 'Eine eigenständige HTML-Datei mit allen Klassen- und Lehrerplänen, dem Aufsichtsplan und dem Gesamtplan je Tag – mit einer Auswahlliste.' }, 'HTML-Datei mit allen Plänen')))
  ];
};

