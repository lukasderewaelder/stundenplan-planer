// ---------- Nachschlagen ----------
const findeId = (liste, id) => liste.find(x => x.id === id);
const fachVon = id => findeId(APP.daten.faecher, id);
const klasseVon = id => findeId(APP.daten.klassen, id);
const lehrerVon = id => findeId(APP.daten.lehrer, id);
const raumVon = id => findeId(APP.daten.raeume, id);
const lehrerName = (l, voll) => l ? (voll ? (l.name || l.kuerzel) : (l.kuerzel || l.name || '?')) : '?';
// Alphabetische (natürliche) Sortierung: „5a“ < „5b“ < „10a“, Groß-/Kleinschreibung egal
function natVergleich(a, b) { return String(a || '').localeCompare(String(b || ''), 'de', { numeric: true, sensitivity: 'base' }); }
function lehrerAlphabetisch(liste) { return liste.slice().sort((a, b) => natVergleich(a.kuerzel || a.name, b.kuerzel || b.name) || natVergleich(a.name, b.name)); }
function klassenAlphabetisch(liste) { return liste.slice().sort((a, b) => natVergleich(a.name, b.name)); }
function raeumeAlphabetisch(liste) { return liste.slice().sort((a, b) => natVergleich(a.name, b.name)); }
function fachOpts(leer) { return (leer ? [['', leer]] : []).concat(APP.daten.faecher.slice().sort((a, b) => natVergleich(a.kuerzel || a.name, b.kuerzel || b.name)).map(f => [f.id, (f.kuerzel || '?') + ' – ' + (f.name || '')])); }
function klassenOpts(leer) { return (leer ? [['', leer]] : []).concat(klassenAlphabetisch(APP.daten.klassen).map(k => [k.id, k.name || '?'])); }
// Klassenteam: gehört zur Klasse. Bei mehreren Klassen die Vereinigung.
// Hat eine Klasse ein Team, zählt ihre Klassenleitung immer dazu (auch wenn sie nicht eigens eingetragen ist).
function teamVon(klassenIds) {
  const s = new Set();
  (klassenIds || []).forEach(kid => {
    const k = klasseVon(kid); if (!k || !(k.team || []).length) return;
    k.team.forEach(t => s.add(t));
    APP.daten.lehrer.forEach(l => { if (l.klassenleitung === kid) s.add(l.id); });
  });
  return s;
}
function teamTitel(klassenIds) { return 'Klassenteam ' + (klassenIds || []).map(kid => (klasseVon(kid) || {}).name || '?').join('/'); }
// Unterrichtsstunden einer Person (Zeile aus arbeitszeiten().liste) als Marke: mit begrenztem Deputat „ist / max.“, sonst nur die Summe
function stdStatus(x) {
  const titel = 'Unterrichtsstunden: ' + zahlDe(x.stunden, 1) + ' UStd. als Fachlehrkraft + ' + zahlDe(x.coStunden, 1) + ' UStd. als Co-Lehrkraft' + (x.aufgStd ? ' + ' + zahlDe(x.aufgStd, 1) + ' UStd. angerechnete Aufgaben' : '');
  if (!x.hatSollStd) return { kl: 'neutral', text: zahlDe(x.istStd, 1), titel: titel + (APP.daten.schule.arbeitszeitModell.stundenSoll ? ' – kein Deputat eingetragen' : '') };
  const ueber = x.istStd > x.sollStd + 0.49, voll = !ueber && x.istStd > x.sollStd - 0.5;
  return { kl: ueber ? 'err' : voll ? 'ok' : 'neutral', text: zahlDe(x.istStd, 1) + ' / ' + zahlDe(x.sollStd, 1), titel: titel + ' – Deputat höchstens ' + zahlDe(x.sollStd, 1) + ' UStd.' + (ueber ? ' (überschritten)' : voll ? ' (ausgeschöpft)' : ', noch ' + zahlDe(x.sollStd - x.istStd, 1) + ' UStd. frei') };
}
// Passt eine Person fachlich? Rolle 'fach': Fach als Lehrkraft; Rolle 'co' (und Co-Kräfte mit Zwang): Fach als Co
// Art einer Person als Text: Lehrkraft, Co-Kraft oder weiteres Personal
function artText(l) { return !l ? '' : l.art === 'personal' ? 'weiteres Personal' : l.ausgebildet === false ? 'Co-Kraft' : 'Lehrkraft'; }
// Art setzen ('lk' | 'co' | 'personal'); weiteres Personal wird aus allen Unterrichten ausgetragen (Aufgaben bleiben)
function artSetzen(dd, l, v) {
  let n = 0;
  if (v !== 'lk' && l.ausgebildet !== false) l.coFaecher = (l.coFaecher || []).concat(l.faecher.filter(f => !(l.coFaecher || []).includes(f)));
  l.art = v; l.ausgebildet = v === 'lk';
  if (v === 'personal' && dd.plan.besetzung) dd.plan.besetzung = dd.plan.besetzung.filter(x => x.lehrer !== l.id); // auch von Hand besetzte einzelne Stunden
  if (v === 'personal') { dd.unterrichte.forEach(u => { if (u.aufgabe) return; const vor = u.lehrkraefte.length; u.lehrkraefte = u.lehrkraefte.filter(z => z.lehrer !== l.id); n += vor - u.lehrkraefte.length; }); dd.plan.platzierungen.forEach(p => { p.co = p.co.filter(x => x !== l.id); }); dd.klassen.forEach(k => { k.team = k.team.filter(x => x !== l.id); }); if (l.klassenleitung) l.klassenleitung = null; }
  return n;
}
function lehrerPasst(l, fachId, rolle) { return !fachId || (rolle === 'co' || l.ausgebildet === false ? coBefaehigt(l, fachId) : fachBefaehigt(l, fachId)); }
// art: undefined = alle, 'fach' = nur ausgebildete Lehrkräfte, 'zwang' = nur Co-Kräfte, 'co' = Rolle Co-Lehrkraft (Co-Kräfte zuerst)
// klassen (optional): Klassenteam dieser Klassen steht als eigene Gruppe vorn
function lehrerOpts(leer, fachId, kurz, art, klassen) {
  let L = APP.daten.lehrer.slice();
  if (art) L = L.filter(l => l.art !== 'personal'); // weiteres Personal unterrichtet nicht (auch nicht als Co)
  if (art === 'fach') L = L.filter(l => l.ausgebildet !== false);
  if (art === 'zwang') L = L.filter(l => l.ausgebildet === false);
  // immer alphabetisch nach Kürzel; nur für die Co-Rolle stehen Co-Kräfte als Gruppe vorn
  L.sort((a, b) => (art === 'co' ? ((a.ausgebildet === false ? 0 : 1) - (b.ausgebildet === false ? 0 : 1)) : 0) || natVergleich(a.kuerzel || a.name, b.kuerzel || b.name) || natVergleich(a.name, b.name));
  const rolle = art === 'co' ? 'co' : 'fach';
  const zusatz = l => (l.ausgebildet === false ? ' (Co-Kraft)' : '') + (lehrerPasst(l, fachId, rolle) ? '' : rolle === 'co' ? ' (ohne Co-Fach)' : ' (ohne Lehrbef.)');
  const opt = l => [l.id, kurz ? (l.kuerzel || '?') + (lehrerPasst(l, fachId, rolle) ? '' : '*') : (l.kuerzel || '?') + ' – ' + (l.name || '') + zusatz(l)];
  const kopf = leer ? [['', leer]] : [];
  const team = teamVon(klassen);
  if (!team.size || !L.some(l => team.has(l.id))) return kopf.concat(L.map(opt));
  return kopf.concat([{ gruppe: teamTitel(klassen), opts: L.filter(l => team.has(l.id)).map(opt) }, { gruppe: 'Weitere', opts: L.filter(l => !team.has(l.id)).map(opt) }]);
}
// Auswahl der Fachlehrkraft (Matrix). Mit Klassen-Kontext steht das Klassenteam vorn.
// auto = { aktiv, kurz }: zusätzliche erste Option „automatisch“ (Wert '__auto'); aktiv zeigt die automatisch zugeteilte Lehrkraft
function lehrerSelect(wert, fachId, onchange, attrs, klassen, auto) {
  const team = teamVon(klassen);
  const alle = lehrerOpts(null, fachId, true, 'fach');
  const zwang = lehrerOpts(null, fachId, true, 'zwang').map(([id, t]) => [id, t + ' ⚠']);
  const opt = ([id, t]) => h('option', { value: id }, t);
  const tL = alle.filter(([id]) => team.has(id)), tZ = zwang.filter(([id]) => team.has(id));
  const s = h('select', Object.assign({ onchange: ev => onchange(ev.target.value) }, attrs || {}),
    auto ? h('option', { value: '__auto' }, auto.aktiv && auto.kurz ? auto.kurz + ' (auto)' : 'automatisch') : null,
    h('option', { value: '' }, '–'),
    tL.length || tZ.length ? h('optgroup', { label: teamTitel(klassen) }, tL.map(opt), tZ.map(opt)) : null,
    h('optgroup', { label: tL.length || tZ.length ? 'Weitere Lehrkräfte' : 'Lehrkräfte' }, alle.filter(([id]) => !team.has(id)).map(opt)),
    zwang.some(([id]) => !team.has(id)) ? h('optgroup', { label: 'Co-Kräfte – nur mit Zwang' }, zwang.filter(([id]) => !team.has(id)).map(opt)) : null);
  s.value = auto && auto.aktiv ? '__auto' : (wert || '');
  return s;
}
function raumOpts(leer) { return (leer ? [['', leer]] : []).concat(raeumeAlphabetisch(APP.daten.raeume).map(r => [r.id, (r.name || '?') + ' (' + r.typ + ')'])); }
function raumTypen() { const s = new Set(RAUMTYPEN); APP.daten.faecher.forEach(f => f.raumTyp && s.add(f.raumTyp)); APP.daten.raeume.forEach(r => r.typ && s.add(r.typ)); return [...s]; }
function nlektionen() { return APP.daten.schule.stunden.filter(s => !s.istPause).length; }
function stundeLabel(nrIndex) { const st = APP.daten.schule.stunden[nrIndex]; return !st ? '?' : st.istPause ? 'Pause' : stundenNummern(APP.daten.schule)[nrIndex] + '.'; }

// Länge der Unterrichtsstunden im Zeitraster: häufigste Länge, Abweichungen und Durchschnitt (mit dem Durchschnitt rechnet das Programm um,
// z. B. Aufgaben in Zeitstunden oder die geschätzte Arbeitszeit noch nicht platzierter Stunden)
function stundenLaengen(sch) {
  sch = sch || APP.daten.schule;
  const L = sch.stunden.map((s, i) => ({ i, s })).filter(x => !x.s.istPause), zahl = new Map();
  L.forEach(x => zahl.set(x.s.dauer, (zahl.get(x.s.dauer) || 0) + 1));
  const top = [...zahl.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0], haeufig = top ? top[0] : 45;
  const abw = L.filter(x => x.s.dauer !== haeufig).map(x => ({ nr: stundeLabel(x.i), dauer: x.s.dauer, von: x.s.beginn, bis: x.s.ende }));
  return { mittel: standardMinuten(sch), haeufig, abw, text: abw.map(x => x.nr + ' Stunde ' + x.dauer + ' min' + (x.von && x.bis ? ' (' + x.von + '–' + x.bis + ')' : '')).join(', ') };
}
function stundeName(nrIndex) { const st = APP.daten.schule.stunden[nrIndex]; if (!st) return '?'; return st.name || (st.istPause ? 'Pause' : stundeLabel(nrIndex)); }
// ---------- Kopfleiste und Navigation ----------
// Alle Seiten mit einem Titel. Navigiert wird über die Bereiche (BEREICHE): Die Seitenleiste zeigt die Bereiche, die Seiten eines Bereichs stehen
// als Reiter über der Seite. Seiten mit „experte“ zeigt die Reiterleiste nur im Expertenmodus (oder wenn man von einer Meldung dorthin springt).
const SEITEN = [
  { id: 'start', titel: 'Übersicht', symbol: 'haus' },
  { id: 'schule', titel: 'Schule & Zeiten', symbol: 'schule' },
  { id: 'faecher', titel: 'Fächer', symbol: 'buch' },
  { id: 'raeume', titel: 'Räume', symbol: 'tuer' },
  { id: 'lehrer', titel: 'Mitarbeitende', symbol: 'personen' },
  { id: 'arbeitszeit', titel: 'Arbeitszeit & Deputat', symbol: 'uhr' },
  { id: 'aufgaben', titel: 'Aufgaben', symbol: 'aufgabe' },
  { id: 'klassen', titel: 'Klassen & Stundentafel', symbol: 'gruppe' },
  { id: 'unterricht', titel: 'Unterrichtsversorgung', symbol: 'tabelle' },
  { id: 'aufsicht', titel: 'Aufsichten', symbol: 'auge' },
  { id: 'pruefung', titel: 'Prüfung', symbol: 'pruefung' },
  { id: 'berechnung', titel: 'Plan berechnen', symbol: 'zahnrad' },
  { id: 'regeln', titel: 'Regeln & Gewichte', symbol: 'regler' },
  { id: 'editor', titel: 'Plan bearbeiten', symbol: 'kalender' },
  { id: 'auswertung', titel: 'Ergebnis & Auswertung', symbol: 'diagramm' },
  { id: 'ausgabe', titel: 'Druck & Export', symbol: 'drucker' },
  { id: 'staende', titel: 'Stände', symbol: 'stapel' },
  { id: 'gta', titel: 'GTA-Planer', symbol: 'stern' },
  { id: 'gesamtansicht', titel: 'Gesamtansicht', symbol: 'liste' }
];
const BEREICHE = [
  { id: 'start', titel: 'Übersicht', symbol: 'haus', seiten: ['start'], start: true },
  { id: 'schule', titel: 'Schule & Zeiten', symbol: 'schule', seiten: ['schule', 'faecher', 'raeume'] },
  { id: 'lehrer', titel: 'Mitarbeitende', symbol: 'personen', seiten: ['lehrer', 'arbeitszeit', 'aufgaben'] },
  { id: 'klassen', titel: 'Klassen & Stundentafel', symbol: 'gruppe', seiten: ['klassen', 'unterricht'], experte: ['unterricht'] },
  { id: 'pausen', titel: 'Aufsichten', symbol: 'auge', seiten: ['aufsicht'] },
  { id: 'pruefung', titel: 'Prüfung', symbol: 'pruefung', seiten: ['pruefung'] },
  { id: 'berechnung', titel: 'Plan berechnen', symbol: 'zahnrad', seiten: ['berechnung', 'regeln'], experte: ['regeln'] },
  { id: 'editor', titel: 'Plan bearbeiten & Ergebnis', symbol: 'kalender', seiten: ['editor', 'auswertung', 'ausgabe', 'staende'] },
  { id: 'gta', titel: 'GTA-Planer', symbol: 'stern', seiten: ['gta'] },
  { id: 'gesamtansicht', titel: 'Gesamtansicht', symbol: 'liste', seiten: ['gesamtansicht'] }
];
function expertenModus() { return !!APP.meta.experte; }
function bereichVon(seite) { return BEREICHE.find(x => x.seiten.includes(seite)) || BEREICHE[0]; }
// Zähler/Badge einer Seite für Seitenleiste und Bereichsleiste (null = nichts anzuzeigen)
function seitenBadge(id) {
  const d = APP.daten; if (!d) return null;
  if (id === 'pruefung') { const f = machFehler().length, w = APP.mach.filter(x => x.stufe === 'warnung').length; return f ? h('span', { class: 'badge err', title: f + ' Fehler' }, '✕ ' + f) : w ? h('span', { class: 'badge warn', title: w + ' Warnungen' }, '! ' + w) : h('span', { class: 'badge ok', title: 'keine Fehler' }, '✓'); }
  if (id === 'editor') { if (!(d.plan.platzierungen.length && APP.cache && APP.cache.bewertung)) return null; const n = hartEnd(); return n ? h('span', { class: 'badge err', title: hartText(n) + ' (Endvalidierung des Gesamtplans)' }, n) : null; }
  if (id === 'aufsicht') { const dn = d.dienste, akz = dn.offen.length ? akzeptiertBezug() : null, n = d.plan.platzierungen.length || dn.plan.some(x => x.quelle === 'auto') ? dn.offen.filter(o => o.prio === 'min' && !aufsichtAkzeptiert(akz, o)).length : 0; return n ? h('span', { class: 'badge err', title: n + ' Aufsichten unter dem Mindestbedarf unbesetzt' }, n) : null; }
  if (id === 'auswertung') { let n = 0; try { n = offenePunkteZahl(); } catch (err) { n = 0; } return n ? h('span', { class: 'badge warn', title: n + ' offene Punkte' }, n) : null; }
  return null;
}
// Reiterleiste über der Seite: die Seiten des aktuellen Bereichs (Seiten des Expertenmodus nur dort – oder wenn man gerade auf ihnen steht)
function bereichsLeiste() {
  const b = bereichVon(APP.seite), ex = expertenModus() ? [] : (b.experte || []);
  const seiten = b.seiten.filter(id => !ex.includes(id) || id === APP.seite);
  if (seiten.length < 2) return null;
  return h('div', { class: 'reiter bereichsleiste', role: 'tablist', 'aria-label': 'Seiten im Bereich ' + b.titel }, seiten.map(id => { const s = SEITEN.find(x => x.id === id); return h('button', { class: 'reiterknopf' + (APP.seite === id ? ' aktiv' : ''), role: 'tab', 'data-bseite': id, 'aria-selected': APP.seite === id ? 'true' : 'false', onclick: () => gehe(id) }, icon(s.symbol), s.titel, (b.experte || []).includes(id) && !expertenModus() ? h('span', { class: 'badge neutral', title: 'Seite des Expertenmodus' }, 'Experte') : null, seitenBadge(id)); }));
}
// Frühere Seiten, die jetzt Reiter einer anderen Seite sind: Name → [Seite, Reiter]
const SEITEN_ALIAS = { selbsttest: ['auswertung', 'selbsttest'], offen: ['auswertung', 'offen'], zeitprofile: ['schule', 'profile'], stundentafeln: ['klassen', 'tafeln'] };
// Reiter innerhalb einer Seite: merkt sich den gewählten Reiter je Seite (APP.reiter). tabs: [[key, titel, badge?], …]
function reiterAktiv(key, tabs) { const r = APP.reiter || (APP.reiter = {}); if (!tabs.some(t => t[0] === r[key])) r[key] = tabs[0][0]; return r[key]; }
function reiterLeiste(key, tabs) {
  const aktiv = reiterAktiv(key, tabs);
  return h('div', { class: 'reiter', role: 'tablist' }, tabs.map(([k, t, badge]) => h('button', { class: 'reiterknopf' + (aktiv === k ? ' aktiv' : ''), role: 'tab', 'data-reiter': k, 'aria-selected': aktiv === k ? 'true' : 'false', onclick: () => { APP.reiter[key] = k; render(); $('#inhalt').scrollTop = 0; } }, t, badge || null)));
}
// Offene Punkte des aktuellen Stands (je Datenstand einmal berechnet)
function offenGruppen() { const c = modell(); if (!c.bewertung.offen) c.bewertung.offen = offenePunkte(APP.daten); return c.bewertung.offen; }
function kopfBauen() {
  const k = $('#kopf');
  leeren(k).append(
    h('div', { class: 'klinks' },
      h('button', { class: 'btn icon', id: 'kNav', type: 'button', 'aria-label': 'Navigation öffnen', title: 'Navigation öffnen', 'aria-expanded': 'false', 'aria-controls': 'nav', onclick: () => navDrawer() }, icon('menue')),
      (() => { const l = h('span', { class: 'logo', title: 'Stundenplaner' }); l.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" role="img" aria-label="Stundenplaner"><rect x="2.5" y="4" width="19" height="17" rx="3.5" fill="#2a50c8"/><path d="M2.5 9V7.5a3.5 3.5 0 0 1 3.5-3.5h12a3.5 3.5 0 0 1 3.5 3.5V9z" fill="#1b3690"/><g fill="#fff"><rect x="5.5" y="11.5" width="3.6" height="2.8" rx=".8"/><rect x="10.2" y="11.5" width="3.6" height="2.8" rx=".8" opacity=".65"/><rect x="14.9" y="11.5" width="3.6" height="2.8" rx=".8"/><rect x="5.5" y="15.7" width="3.6" height="2.8" rx=".8" opacity=".65"/><rect x="10.2" y="15.7" width="3.6" height="2.8" rx=".8"/></g><rect x="7" y="2" width="2" height="4" rx="1" fill="#1b3690"/><rect x="15" y="2" width="2" height="4" rx="1" fill="#1b3690"/></svg>'; return l; })(),
      h('span', { class: 'projekt', id: 'kProjekt' }),
      h('span', { class: 'status', id: 'kStatus', role: 'img' })),
    h('div', { class: 'kmitte', role: 'group', 'aria-label': 'Rückgängig und Wiederholen' },
      h('button', { class: 'btn icon', title: 'Rückgängig (Strg+Z)', 'aria-label': 'Rückgängig', id: 'kUndo', onclick: rueckgaengig }, icon('rueckgaengig')),
      h('button', { class: 'btn icon', title: 'Wiederholen (Strg+Y)', 'aria-label': 'Wiederholen', id: 'kRedo', onclick: wiederholen }, icon('wiederholen'))),
    h('div', { class: 'krechts' },
      h('div', { id: 'kopfRechnung', hidden: true }),
      h('button', { class: 'btn icon', id: 'kSuche', type: 'button', title: 'Suchen und springen (Strg+K)', 'aria-label': 'Suchen und springen', 'aria-keyshortcuts': 'Control+K', onclick: paletteOeffnen }, icon('lupe')),
      h('button', { class: 'statuschip', id: 'kKosten', type: 'button' }),
      h('button', { class: 'btn primaer', id: 'kBerechnen', title: 'Berechnung mit den Einstellungen der Seite „Plan berechnen“ starten', onclick: () => { gehe('berechnung'); if (!APP.rechnung.laeuft) rechnungStart(); } }, 'Plan berechnen'),
      h('button', { class: 'btn menueknopf', id: 'kMenue', 'aria-haspopup': 'menu', title: 'Projektdatei, Einstellungen und Hilfe', onclick: ev => kopfMenue(ev.currentTarget) }, 'Menü', h('span', { class: 'punkt', id: 'kExportWarnung', hidden: true })))
  );
}
// Tage seit dem letzten Export (oder seit dem ersten gespeicherten Stand); 0 = kein Anlass zur Warnung
function exportTage() { const basis = APP.meta.letzterExport || APP.meta.ersterStand; return basis ? Math.floor((Date.now() - basis) / 864e5) : 0; }
// Menü der Kopfleiste: alles, was man selten braucht – Projektdatei, Beispieldaten, Einstellungen, Hilfe
function kopfMenue(knopf) {
  const r = knopf.getBoundingClientRect(), tage = exportTage();
  menueZeigen(r.right - 280, r.bottom + 6, [
    { titel: 'Projektdatei' },
    { icon: 'ordner', text: 'Projekt importieren …', tun: importDialog },
    { icon: 'herunterladen', text: 'Projekt exportieren', hinweis: !APP.meta.letzterExport ? 'noch nie' : tage > 7 ? 'seit ' + tage + ' Tagen nicht' : 'zuletzt ' + datum(APP.meta.letzterExport), tun: () => exportJson(false) },
    { icon: 'auge-aus', text: 'Anonymisiert exportieren', tun: () => exportJson(true) },
    '-',
    { icon: 'stern', text: 'Beispieldaten laden', tun: beispielLaden },
    { icon: 'plus', text: 'Neues leeres Projekt …', tun: neuesProjekt },
    '-',
    { icon: 'lupe', text: 'Suchen und springen …', taste: 'Strg+K', tun: paletteOeffnen },
    { icon: 'zahnrad', text: 'Einstellungen …', tun: einstellungenDialog },
    { icon: 'hilfe', text: 'Hilfe und Datenschutz', tun: infoDialog },
    { icon: 'buch', text: 'Anleitung (PDF)', hinweis: 'herunterladen', tun: anleitungOeffnen }
  ]);
}
// Einstellungen der Oberfläche (nur APP.meta, nicht Teil der Projektdatei): Farbschema und Expertenmodus
function einstellungenDialog() {
  const wahl = APP.meta.theme === 'hell' || APP.meta.theme === 'dunkel' ? APP.meta.theme : 'auto';
  const theme = (wert, text) => h('label', {}, h('input', { type: 'radio', name: 'theme', value: wert, checked: wahl === wert, onchange: () => { APP.meta.theme = wert; metaSpeichern(); themeAnwenden(); if (APP.seite === 'berechnung') render(); } }), text);
  return dialog({
    titel: 'Einstellungen', breite: '520px',
    inhalt: h('div', { class: 'einstellungen' },
      h('div', {}, h('h3', { id: 'einstTheme' }, 'Darstellung'),
        h('div', { class: 'segment', role: 'radiogroup', 'aria-labelledby': 'einstTheme' }, theme('auto', 'Wie das System'), theme('hell', 'Hell'), theme('dunkel', 'Dunkel')),
        h('p', { class: 'muted klein' }, 'Gedruckt wird immer hell – unabhängig von dieser Einstellung.')),
      h('div', {}, h('h3', { id: 'einstDichte' }, 'Plan-Editor: Größe der Kacheln'),
        h('div', { class: 'segment', role: 'radiogroup', 'aria-labelledby': 'einstDichte' }, [['kompakt', 'Kompakt'], ['normal', 'Normal'], ['gross', 'Groß']].map(([w, t]) => h('label', {}, h('input', { type: 'radio', name: 'dichte', value: w, checked: dichte() === w, onchange: () => dichteSetzen(w) }), t))),
        h('p', { class: 'muted klein' }, 'Kompakt zeigt mehr Stunden auf einmal; Raum und Lehrkraft stehen dann zum Teil nur im Tooltip.')),
      h('div', {}, h('h3', {}, 'Nach der Berechnung'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: APP.meta.offenNachRechnung === true, onchange: ev => { APP.meta.offenNachRechnung = ev.target.checked; metaSpeichern(); } }), 'Offene Punkte zusätzlich als Fenster öffnen'),
        h('p', { class: 'muted klein' }, 'Das Ergebnis steht immer unter „Ergebnis & Auswertung“ → „Offene Punkte“; die Zahl steht oben in der Kopfleiste.')),
      h('div', {}, h('h3', {}, 'Umfang'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'modusExperte', checked: expertenModus(), onchange: ev => { APP.meta.experte = ev.target.checked; metaSpeichern(); navBauen(); render(); } }), 'Expertenmodus'),
        h('p', { class: 'muted klein' }, 'Standard: die Schritte der Seitenleiste, das Programm erzeugt Unterrichtsverteilung und Plan aus den Grunddaten. Der Expertenmodus blendet zusätzliche Reiter ein – Unterrichtsversorgung, Regeln & Gewichte und den Selbsttest des Programms.'))),
    knoepfe: [{ text: 'Schließen', wert: true, art: 'primaer' }]
  });
}
function kopfAktualisieren() {
  if (!APP.daten || !$('#kProjekt')) return;
  $('#kProjekt').textContent = APP.daten.schule.name + (APP.daten.schule.schuljahr ? ' · ' + APP.daten.schule.schuljahr : '');
  // Speicherstatus als farbiger Punkt; der Wortlaut steht im Tooltip und für Screenreader im aria-label
  const ks = $('#kStatus'), st = APP.speicherStatus;
  ks.className = 'status ' + (/fehlgeschlagen|pausiert/.test(st) ? 'err' : /werden gespeichert/.test(st) ? 'laeuft' : /^(Gespeichert|Geladen)/.test(st) ? 'ok' : '');
  ks.title = st + ' – alle Daten bleiben lokal in diesem Browser'; ks.setAttribute('aria-label', 'Speicherstatus: ' + st);
  $('#kUndo').disabled = !APP.undo.length; $('#kRedo').disabled = !APP.redo.length;
  $('#kUndo').title = APP.undo.length ? 'Rückgängig: ' + APP.undo[APP.undo.length - 1].b + ' (Strg+Z)' : 'Rückgängig (Strg+Z)';
  $('#kRedo').title = APP.redo.length ? 'Wiederholen: ' + APP.redo[APP.redo.length - 1].b + ' (Strg+Y)' : 'Wiederholen (Strg+Y)';
  // Statuschip: Ampel plus Zahl der Probleme. Ohne Plan zeigt er, ob die Daten bereit für die Berechnung sind.
  const kk = $('#kKosten');
  const chip = (farbe, text, titel, ziel) => { leeren(kk).append(h('span', { class: 'ampel ' + farbe, 'aria-hidden': 'true' }), h('span', { class: 'ctext' }, text)); kk.title = titel; kk.setAttribute('aria-label', text + ' – ' + titel); kk.onclick = ziel; };
  if (APP.daten.plan.platzierungen.length) {
    const { k } = modell().bewertung;
    let farbe = 'leer', n = 0;
    try { farbe = planAmpel().ampel; n = offenePunkteZahl(); } catch (err) { farbe = 'leer'; }
    const nh = hartEnd();
    // Rot: Probleme · Gelb: vollständig, es bleiben offene Punkte oder Wünsche · Grün: in Ordnung
    const text = farbe === 'rot' ? (n || nh || 1) + ((n || nh || 1) === 1 ? ' Problem' : ' Probleme') : n ? n + (n === 1 ? ' offener Punkt' : ' offene Punkte') : farbe === 'gelb' ? 'Plan vollständig' : 'Plan in Ordnung';
    chip(farbe === 'leer' ? '' : farbe, text,
      (AMPEL_TEXT[farbe] || AMPEL_TEXT.leer)[1] + ' ' + (nh ? hartText(nh) + ' laut Endprüfung des Gesamtplans' : 'Keine harten Fehler') + ', ' + zahlDe(k.weich, 1) + ' Strafpunkte aus Wünschen. Klick: offene Punkte ansehen',
      () => gehe('auswertung', { reiter: 'offen' }));
  } else {
    const f = machFehler().length;
    if (f) chip('rot', f + ' Fehler in den Daten', 'Vor der Berechnung zu beheben. Klick: zur Prüfung', () => gehe('pruefung'));
    else chip('', 'Noch kein Plan', 'Es wurde noch kein Plan berechnet. Klick: zur Prüfung der Daten', () => gehe('pruefung'));
  }
  // Exportwarnung: dezenter Punkt am Menü; der Wortlaut steht im Menü und im Tooltip
  const tage = exportTage(), warn = tage > 7;
  $('#kExportWarnung').hidden = !warn;
  $('#kMenue').title = warn ? 'Seit ' + tage + ' Tagen kein Export – Browserdaten können beim Löschen des Verlaufs verloren gehen. Bitte im Menü „Projekt exportieren“ wählen.' : 'Projektdatei, Einstellungen und Hilfe';
  $('#kMenue').setAttribute('aria-label', warn ? 'Menü – seit ' + tage + ' Tagen kein Export' : 'Menü');
  const kr = $('#kopfRechnung');
  const R = APP.rechnung;
  kr.hidden = !R.laeuft;
  $('#kBerechnen').hidden = !!R.laeuft;
  if (R.laeuft) {
    const f = R.fortschritt || {};
    leeren(kr).append(h('span', {}, 'Berechnung läuft '), h('div', { class: 'mini', role: 'progressbar', 'aria-label': 'Fortschritt der Berechnung', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.min(99, Math.floor(rechnungGesamt(f) * 100)) }, h('div', { style: { width: Math.min(99, Math.floor(rechnungGesamt(f) * 100)) + '%' } })),
      h('button', { class: 'btn klein', onclick: rechnungStop }, 'Stopp'));
  }
}
// Seitenleiste: ab 1280 px Breite ausgeklappt (mit Beschriftung), darunter eine schmale Schiene mit Tooltips.
// Der Knopf oben schaltet um; die Wahl bleibt gespeichert (APP.meta.nav: 'auto' | 'auf' | 'zu'). Die Leiste überlagert den Inhalt nie.
const NAV_BREIT = window.matchMedia ? matchMedia('(min-width: 1280px)') : { matches: true };
function navOffen() { const w = APP.meta.nav; return w === 'auf' || (w !== 'zu' && NAV_BREIT.matches); }
function navUmschalten() {
  const ziel = !navOffen();
  APP.meta.nav = ziel === NAV_BREIT.matches ? 'auto' : ziel ? 'auf' : 'zu';
  delete APP.meta.navFest; // frühere Einstellung „dauerhaft ausklappen“
  metaSpeichern(); navBauen();
  const p = $('#nav .navpin'); if (p) p.focus();
}
function navTipp(el) {
  let t = $('#navtipp');
  if (!el || navOffen() || NAV_SCHMAL.matches) { if (t) t.remove(); return; }
  if (!t) { t = h('div', { class: 'tipp', id: 'navtipp', role: 'tooltip' }); document.body.append(t); }
  t.textContent = el.dataset.tipp || '';
  const r = el.getBoundingClientRect();
  t.style.left = (r.right + 8) + 'px'; t.style.top = (r.top + r.height / 2 - 14) + 'px';
}
function navBauen() {
  const n = leeren($('#nav'));
  n.setAttribute('aria-label', 'Hauptnavigation');
  const offen = navOffen();
  $('#app').classList.toggle('nav-fest', offen);
  navTipp(null);
  const pinText = offen ? 'Seitenleiste einklappen' : 'Seitenleiste ausklappen';
  n.append(h('button', { class: 'navpin', 'aria-label': pinText, 'aria-expanded': offen ? 'true' : 'false', 'data-tipp': pinText, onclick: navUmschalten }, h('span', { class: 'nsym' }, icon('seitenleiste')), h('span', { class: 'ntext' }, 'Einklappen')));
  const eintrag = (id, seiten, sym, titel, aktiv) => h('button', { class: aktiv ? 'aktiv' : '', onclick: () => { gehe(id); navZu(); }, 'data-seite': id, 'data-seiten': seiten, 'aria-current': aktiv ? 'page' : null, 'aria-label': titel, 'data-tipp': titel },
    h('span', { class: 'nsym' }, icon(sym)), h('span', { class: 'ntext' }, titel), h('span', { class: 'zahl', id: 'navz_' + id }));
  BEREICHE.filter(b => b.start).forEach(b => n.append(eintrag(b.id, b.seiten.join(' '), b.symbol, b.titel, b.seiten.includes(APP.seite))));
  n.append(h('div', { class: 'gruppe' }, h('span', { class: 'gtext' }, 'In neun Schritten')));
  BEREICHE.filter(b => !b.start).forEach((b, i) => n.append(eintrag(b.id, b.seiten.join(' '), b.symbol, (i + 1) + '. ' + b.titel, b.seiten.includes(APP.seite))));
  n.append(h('div', { class: 'nfuss' }, icon('schloss', 'k'), h('span', {}, 'Alle Daten bleiben lokal in diesem Browser.')));
  if (!n._tipps) {
    n._tipps = true;
    const ziel = ev => ev.target.closest && ev.target.closest('#nav button[data-tipp]');
    n.addEventListener('mouseover', ev => navTipp(ziel(ev)));
    n.addEventListener('mouseleave', () => navTipp(null));
    n.addEventListener('focusin', ev => { let sichtbar = true; try { sichtbar = ev.target.matches(':focus-visible'); } catch (e) { /* ältere Browser */ } navTipp(sichtbar ? ziel(ev) : null); });
    n.addEventListener('focusout', () => navTipp(null));
    n.addEventListener('scroll', () => navTipp(null));
    if (NAV_BREIT.addEventListener) NAV_BREIT.addEventListener('change', () => { if (!APP.meta.nav || APP.meta.nav === 'auto') navBauen(); });
  }
  navAktualisieren();
}
// Unter 900 px Breite ist die Navigation eine Schublade: Der Knopf ☰ in der Kopfleiste öffnet sie über dem Inhalt,
// ein Klick auf einen Eintrag, auf den Schleier oder Esc schließt sie wieder.
const NAV_SCHMAL = window.matchMedia ? matchMedia('(max-width: 899px)') : { matches: false };
function navDrawer(auf) {
  const app = $('#app'), offen = auf === undefined ? !app.classList.contains('nav-drawer') : !!auf;
  app.classList.toggle('nav-drawer', offen && NAV_SCHMAL.matches);
  const k = $('#kNav'); if (k) { k.setAttribute('aria-expanded', offen ? 'true' : 'false'); k.setAttribute('aria-label', offen ? 'Navigation schließen' : 'Navigation öffnen'); k.title = offen ? 'Navigation schließen' : 'Navigation öffnen'; }
  let sch = $('#navschleier');
  if (offen && NAV_SCHMAL.matches) { if (!sch) { sch = h('div', { id: 'navschleier', onclick: () => navDrawer(false) }); app.append(sch); } const erster = $('#nav button.aktiv') || $('#nav button[data-seite]'); if (erster) erster.focus(); }
  else if (sch) sch.remove();
}
if (NAV_SCHMAL.addEventListener) NAV_SCHMAL.addEventListener('change', () => navDrawer(false));
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && $('#app') && $('#app').classList.contains('nav-drawer') && !document.querySelector('dialog[open]') && !$('#kontextmenue')) { navDrawer(false); const k = $('#kNav'); if (k) k.focus(); } });
function navZu() { navTipp(null); if ($('#app').classList.contains('nav-drawer')) navDrawer(false); }
function navAktualisieren() {
  const setze = (id, node) => { const z = $('#navz_' + id); if (z) leeren(z).append(node || ''); };
  BEREICHE.forEach(b => {
    // je Bereich die wichtigste Meldung seiner Seiten (Fehler vor Warnung)
    const alle = b.seiten.map(seitenBadge).filter(Boolean);
    setze(b.id, alle.find(x => x.classList.contains('err')) || alle[0] || null);
  });
}
function gehe(seite, opt) {
  if (seite === 'pausen') { try { DS().tab = 'bedarf'; } catch (e) {} seite = 'aufsicht'; }
  if (seite === 'mitarbeitende') { APP.azAnsicht = 'einsatz'; seite = 'arbeitszeit'; } // frühere Seite „Einsatzübersicht“
  if (SEITEN_ALIAS[seite]) { (APP.reiter || (APP.reiter = {}))[SEITEN_ALIAS[seite][0]] = SEITEN_ALIAS[seite][1]; seite = SEITEN_ALIAS[seite][0]; }
  if (opt && opt.reiter) (APP.reiter || (APP.reiter = {}))[seite] = opt.reiter;
  APP.seite = seite;
  if (opt && opt.markiere) APP.markiere = opt.markiere;
  document.querySelectorAll('#nav button[data-seiten]').forEach(b => { const an = b.dataset.seiten.split(' ').includes(seite); b.classList.toggle('aktiv', an); b.setAttribute('aria-current', an ? 'page' : 'false'); });
  render();
  $('#inhalt').scrollTop = 0;
}
const SEITEN_RENDER = {};
// Fokus über einen Neuaufbau der Seite retten: Nach einer Änderung (z. B. Tab aus einem Feld) baut render() die Seite neu auf.
// Das Feld, in das der Fokus gerade gesprungen ist, wird danach wiedergefunden – über die Zeile (data-id), die Beschriftung und die Position.
const FOKUSSIERBAR = 'input:not([type=hidden]),select,textarea,button,[tabindex]:not([tabindex="-1"])';
function fokusMerken(main) {
  const a = document.activeElement;
  if (!a || a === main || !main.contains(a)) return null;
  const alle = [...main.querySelectorAll(FOKUSSIERBAR)];
  const zeile = a.closest('[data-id]');
  const inZeile = zeile ? [...zeile.querySelectorAll(FOKUSSIERBAR)] : [];
  let sel = null; try { if (typeof a.selectionStart === 'number') sel = [a.selectionStart, a.selectionEnd, (a.value || '').length]; } catch (e) { sel = null; }
  return { idx: alle.indexOf(a), zeile: zeile ? zeile.getAttribute('data-id') : null, zi: inZeile.indexOf(a), label: a.getAttribute('aria-label'), tag: a.tagName, typ: a.type || '', sel };
}
function fokusWiederherstellen(main, k) {
  if (!k) return;
  let el = null;
  const passt = x => x.tagName === k.tag && (x.type || '') === k.typ;
  if (k.zeile !== null) {
    const zeile = main.querySelector('[data-id="' + CSS.escape(k.zeile) + '"]');
    if (zeile) {
      const inZeile = [...zeile.querySelectorAll(FOKUSSIERBAR)];
      if (k.label) el = inZeile.find(x => x.getAttribute('aria-label') === k.label && passt(x)) || null;
      if (!el && inZeile[k.zi] && passt(inZeile[k.zi])) el = inZeile[k.zi];
    }
  }
  if (!el) { const alle = [...main.querySelectorAll(FOKUSSIERBAR)]; if (alle[k.idx] && passt(alle[k.idx])) el = alle[k.idx]; }
  if (!el || el.disabled) return;
  el.focus({ preventScroll: true });
  try {
    if (k.sel && typeof el.selectionStart === 'number') {
      const n = (el.value || '').length;
      if (k.sel[0] === 0 && k.sel[1] === k.sel[2]) el.select(); else el.setSelectionRange(Math.min(k.sel[0], n), Math.min(k.sel[1], n));
    } else if (el.type === 'number') el.select();
  } catch (e) { /* Felder ohne Auswahl */ }
}
// Tab in Eingabefeldern des Inhaltsbereichs: Die Änderung wird übernommen (das kann die Seite neu aufbauen),
// danach springt der Fokus zuverlässig zum nächsten bzw. vorigen Feld – auch wenn die Seite dabei neu gezeichnet wurde.
function fokusFinden(main, k) {
  if (!k) return null;
  const passt = x => x.tagName === k.tag && (x.type || '') === k.typ;
  if (k.zeile !== null) {
    const zeile = main.querySelector('[data-id="' + CSS.escape(k.zeile) + '"]');
    if (zeile) {
      const inZeile = [...zeile.querySelectorAll(FOKUSSIERBAR)];
      const el = (k.label && inZeile.find(x => x.getAttribute('aria-label') === k.label && passt(x))) || (inZeile[k.zi] && passt(inZeile[k.zi]) ? inZeile[k.zi] : null);
      if (el) return el;
    }
  }
  const alle = [...main.querySelectorAll(FOKUSSIERBAR)];
  return alle[k.idx] && passt(alle[k.idx]) ? alle[k.idx] : null;
}
function tabZiele(main) {
  return [...main.querySelectorAll(FOKUSSIERBAR)].filter(x => !x.disabled && x.tabIndex >= 0 && !x.classList.contains('hilfesym') && !(x.readOnly && x.tabIndex < 0) && x.getClientRects().length > 0 && getComputedStyle(x).visibility !== 'hidden');
}
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Tab' || ev.altKey || ev.ctrlKey || ev.metaKey || ev.defaultPrevented) return;
  const main = $('#inhalt'), el = ev.target;
  if (!main || !main.contains(el) || !el.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=color]), textarea')) return;
  ev.preventDefault();
  const k = fokusMerken(main);
  const vorher = tabZiele(main), pos = vorher.indexOf(el);
  el.blur(); // löst „change“ aus – dabei kann render() die Seite neu aufbauen
  const jetzt = $('#inhalt');
  const ziele = tabZiele(jetzt);
  const start = fokusFinden(jetzt, k);
  let i = start ? ziele.indexOf(start) : pos;
  if (i < 0) i = pos;
  const ziel = ziele[i + (ev.shiftKey ? -1 : 1)];
  if (!ziel) return;
  ziel.focus();
  try { if (typeof ziel.select === 'function' && ziel.matches('input:not([type=checkbox]):not([type=radio]), textarea')) ziel.select(); } catch (e) { /* ohne Auswahl */ }
}, true);
// Übersichten ohne eigene Tabellenwerkzeuge automatisch filter- und sortierbar machen.
function uebersichtenAktivieren(root) {
  if (!root) return;
  root.querySelectorAll('table.tab').forEach(tab => {
    if (tab.dataset.uebersichtAktiv === '1') return;
    // Stammdatentabellen haben bereits Suche und Sortierung aus tabelle().
    if (tab.querySelector('thead th.sort')) { tab.dataset.uebersichtAktiv = '1'; return; }
    const head = tab.tHead && tab.tHead.rows && tab.tHead.rows[0];
    if (!head || !head.cells.length || !tab.tBodies.length) return;
    tab.dataset.uebersichtAktiv = '1';
    const wrapper = tab.closest('.tabwrap') || tab.parentElement;
    // Kurze Tabellen (unter 8 Zeilen) und die Wochenübersicht des Aufsichtsbedarfs brauchen keinen Filter – er kostet dort nur Platz
    const kurz = [...tab.tBodies].reduce((n, b) => n + b.rows.length, 0) < 8 || tab.classList.contains('bedarfmatrix');
    if (wrapper && !kurz && !wrapper.querySelector(':scope > .uebersicht-filter')) {
      const input = h('input', { type: 'search', placeholder: 'Übersicht filtern …', 'aria-label': 'Tabelle filtern' });
      const clear = h('button', { class: 'btn icon klein', type: 'button', title: 'Filter löschen', 'aria-label': 'Filter löschen', onclick: () => { input.value = ''; anwendenFilter(); input.focus(); } }, icon('x'));
      const bar = h('div', { class: 'uebersicht-filter' }, input, clear);
      wrapper.insertBefore(bar, tab);
      const anwendenFilter = () => {
        const q = input.value.trim().toLocaleLowerCase('de');
        const bodies = [...tab.tBodies];
        if (bodies.length > 1) bodies.forEach(tb => { tb.hidden = !!q && !tb.textContent.toLocaleLowerCase('de').includes(q); });
        else [...bodies[0].rows].forEach(tr => { tr.hidden = !!q && !tr.textContent.toLocaleLowerCase('de').includes(q); });
      };
      input.addEventListener('input', anwendenFilter);
    }
    const sortWert = (tr, i) => {
      const c = tr && tr.cells ? tr.cells[i] : null;
      const raw = (c && (c.dataset.sort || c.textContent) || '').replace(/ /g, ' ').trim();
      const tm = raw.match(/^(\d{1,2}):(\d{2})/); if (tm) return { n: true, v: Number(tm[1]) * 60 + Number(tm[2]) };
      const dm = raw.match(/^([+\-]?\d+(?:[.,]\d+)?)\s*(?:h|min|%|×|$)/i); if (dm) return { n: true, v: Number(dm[1].replace(',', '.')) };
      return { n: false, v: raw.toLocaleLowerCase('de') };
    };
    [...head.cells].forEach((th, i) => {
      if (!th.textContent.trim() || th.querySelector('button,input,select,a') || th.classList.contains('aktion')) return;
      th.classList.add('auto-sort'); th.tabIndex = 0; th.setAttribute('role', 'button'); th.title = (th.title ? th.title + '\n' : '') + 'Klicken zum Sortieren';
      const sortiere = () => {
        const alt = Number(th.dataset.richtung || 0), dir = alt === 1 ? -1 : 1;
        [...head.cells].forEach(x => delete x.dataset.richtung); th.dataset.richtung = String(dir);
        const bodies = [...tab.tBodies];
        const cmp = (a, b) => { const x = sortWert(a, i), y = sortWert(b, i); if (x.n && y.n) return (x.v - y.v) * dir; return String(x.v).localeCompare(String(y.v), 'de', { numeric: true, sensitivity: 'base' }) * dir; };
        if (bodies.length > 1) {
          bodies.sort((a, b) => cmp(a.rows[0], b.rows[0])).forEach(tb => tab.appendChild(tb));
        } else {
          [...bodies[0].rows].sort(cmp).forEach(tr => bodies[0].appendChild(tr));
        }
      };
      th.addEventListener('click', sortiere);
      th.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); sortiere(); } });
    });
  });
}

function render() {
  menueSchliessen(); hilfeSchliessen();
  const gleicheSeite = APP._renderSeite === APP.seite;
  APP._renderSeite = APP.seite;
  const fokus = gleicheSeite ? fokusMerken($('#inhalt')) : null;
  const scroll = $('#inhalt').scrollTop;
  const main = leeren($('#inhalt'));
  main.classList.toggle('voll', APP.seite === 'editor');
  const s = SEITEN.find(x => x.id === APP.seite) || SEITEN[0];
  { const bn = bannerLeiste(); if (bn) main.append(bn); }
  { const bl = bereichsLeiste(); if (bl) main.append(bl); }
  const inhalt = (SEITEN_RENDER[s.id] || (() => h('p', {}, 'Unbekannte Seite')))();
  main.append(...[inhalt].flat(Infinity).filter(x => x !== null && x !== undefined && x !== false));
  uebersichtenAktivieren(main);
  iconKnoepfeBeschriften(main);
  if (APP.markiere) {
    const ziel = main.querySelector('[data-id="' + CSS.escape(APP.markiere) + '"]');
    if (ziel) { ziel.classList.add('markiert'); ziel.scrollIntoView({ block: 'center' }); const inp = ziel.querySelector('input,select,button'); if (inp) inp.focus(); }
    APP.markiere = null;
  } else if (gleicheSeite) {
    if (main.scrollTop !== scroll) main.scrollTop = scroll;
    fokusWiederherstellen(main, fokus);
  }
  kopfAktualisieren();
  navAktualisieren();
}

