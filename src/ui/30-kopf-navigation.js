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
  if (art) L = L.filter(l => !unterrichtetNicht(l)); // weiteres Personal und Stammkräfte der Vorschule unterrichten nicht (auch nicht als Co)
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
// ---------- Kopfleiste, Modi und Navigation ----------
// Aufbau wie ein Desktop-Programm: Kopfleiste mit den vier Modi (Start, Einrichten, Planen, Ausgeben), links der Explorer
// (Bereiche des Modus, darunter die Objekte des Bereichs), in der Mitte die Seite, rechts der Inspektor (Details, Probleme, Hilfe).
// Jede Seite hat eine #-Adresse: Die Zurück-Taste des Browsers funktioniert, Ansichten lassen sich als Lesezeichen speichern.
// kurz = Name im Ansichtsschalter, wenn ein Bereich mehrere Seiten hat
const SEITEN = [
  { id: 'start', titel: 'Start', symbol: 'haus', pfad: 'start' },
  { id: 'schule', titel: 'Schule & Zeiten', symbol: 'schule', pfad: 'einrichten/schule' },
  { id: 'faecher', titel: 'Fächer', symbol: 'buch', pfad: 'einrichten/faecher' },
  { id: 'raeume', titel: 'Räume', symbol: 'tuer', pfad: 'einrichten/raeume' },
  { id: 'lehrer', titel: 'Personen', kurz: 'Stammdaten', symbol: 'personen', pfad: 'einrichten/personen' },
  { id: 'arbeitszeit', titel: 'Arbeitszeit & Deputat', symbol: 'uhr', pfad: 'einrichten/personen/arbeitszeit' },
  { id: 'aufgaben', titel: 'Aufgaben', symbol: 'aufgabe', pfad: 'einrichten/personen/aufgaben' },
  { id: 'klassen', titel: 'Klassen & Stundentafel', symbol: 'gruppe', pfad: 'einrichten/klassen' },
  { id: 'unterricht', titel: 'Unterrichtsversorgung', symbol: 'tabelle', pfad: 'einrichten/unterricht' },
  { id: 'aufsicht', titel: 'Aufsichten: Bedarf & Bereiche', symbol: 'auge', pfad: 'einrichten/aufsichten' },
  { id: 'vorschule', titel: 'Vorschule & Betreuung', symbol: 'gruppe', pfad: 'einrichten/vorschule' },
  { id: 'regeln', titel: 'Regeln & Gewichte', symbol: 'regler', pfad: 'einrichten/regeln' },
  { id: 'editor', titel: 'Stundenplan', symbol: 'kalender', pfad: 'planen/stundenplan' },
  { id: 'gesamtansicht', titel: 'Aufsichten: Zeitleiste', kurz: 'Zeitleiste', symbol: 'liste', pfad: 'planen/aufsichten' },
  { id: 'aufsichtauswertung', titel: 'Aufsichten: Auswertung', kurz: 'Auswertung', symbol: 'diagramm', pfad: 'planen/aufsichten/auswertung' },
  { id: 'gta', titel: 'GTA-Planer', symbol: 'stern', pfad: 'planen/gta' },
  { id: 'auswertung', titel: 'Auswertung', kurz: 'Ergebnis', symbol: 'diagramm', pfad: 'planen/auswertung' },
  { id: 'pruefung', titel: 'Prüfung der Daten', kurz: 'Prüfung der Daten', symbol: 'pruefung', pfad: 'planen/auswertung/pruefung' },
  { id: 'berechnung', titel: 'Berechnung', symbol: 'zahnrad', pfad: 'planen/berechnung' },
  { id: 'ausgabe', titel: 'Drucken & Export', symbol: 'drucker', pfad: 'ausgeben/drucken' },
  { id: 'staende', titel: 'Stände', symbol: 'stapel', pfad: 'ausgeben/staende' },
  { id: 'projektdatei', titel: 'Projektdatei', symbol: 'ordner', pfad: 'ausgeben/projektdatei' }
];
// Modi mit ihren Bereichen. Ein Bereich mit mehreren Seiten zeigt über der Seite einen Ansichtsschalter.
// experte: Der Bereich steht nur im Expertenmodus im Explorer (oder wenn man gerade auf ihm steht). anzahl: Zahl im Explorer.
const MODI = [
  { id: 'start', titel: 'Start', bereiche: [{ id: 'start', titel: 'Start', symbol: 'haus', seiten: ['start'] }] },
  { id: 'einrichten', titel: 'Einrichten', bereiche: [
    { id: 'schule', titel: 'Schule & Zeiten', symbol: 'schule', seiten: ['schule'] },
    { id: 'faecher', titel: 'Fächer', symbol: 'buch', seiten: ['faecher'], anzahl: d => d.faecher.length },
    { id: 'raeume', titel: 'Räume', symbol: 'tuer', seiten: ['raeume'], anzahl: d => d.raeume.length },
    { id: 'personen', titel: 'Personen', symbol: 'personen', seiten: ['lehrer', 'arbeitszeit', 'aufgaben'], anzahl: d => d.lehrer.length },
    { id: 'klassen', titel: 'Klassen', symbol: 'gruppe', seiten: ['klassen'], anzahl: d => d.klassen.length },
    { id: 'unterricht', titel: 'Unterricht', symbol: 'tabelle', seiten: ['unterricht'], experte: true },
    { id: 'aufsicht', titel: 'Aufsichten', symbol: 'auge', seiten: ['aufsicht'] },
    { id: 'vorschule', titel: 'Vorschule & Betreuung', symbol: 'gruppe', seiten: ['vorschule'] },
    { id: 'regeln', titel: 'Regeln', symbol: 'regler', seiten: ['regeln'], experte: true }] },
  { id: 'planen', titel: 'Planen', bereiche: [
    { id: 'stundenplan', titel: 'Stundenplan', symbol: 'kalender', seiten: ['editor'] },
    { id: 'aufsichtplan', titel: 'Aufsichten', symbol: 'liste', seiten: ['gesamtansicht', 'aufsichtauswertung'] },
    { id: 'gta', titel: 'GTA', symbol: 'stern', seiten: ['gta'] },
    { id: 'auswertung', titel: 'Auswertung', symbol: 'diagramm', seiten: ['auswertung', 'pruefung'] },
    { id: 'berechnung', titel: 'Berechnung', symbol: 'zahnrad', seiten: ['berechnung'] }] },
  { id: 'ausgeben', titel: 'Ausgeben', bereiche: [
    { id: 'ausgabe', titel: 'Drucken & Export', symbol: 'drucker', seiten: ['ausgabe'] },
    { id: 'staende', titel: 'Stände', symbol: 'stapel', seiten: ['staende'] },
    { id: 'projektdatei', titel: 'Projektdatei', symbol: 'ordner', seiten: ['projektdatei'] }] }
];
const BEREICHE = MODI.flatMap(m => m.bereiche.map(b => Object.assign(b, { modus: m.id })));
function expertenModus() { return !!APP.meta.experte; }
function bereichVon(seite) { return BEREICHE.find(x => x.seiten.includes(seite)) || BEREICHE[0]; }
function modusVon(seite) { const b = bereichVon(seite); return MODI.find(m => m.id === b.modus) || MODI[0]; }
function bereichSichtbar(b) { return !b.experte || expertenModus() || b.seiten.includes(APP.seite); }
// #-Adresse einer Seite (für echte Links in Kopfleiste und Explorer: Mittelklick öffnet einen neuen Tab)
function adresseFuer(seite) { const s = SEITEN.find(x => x.id === seite) || SEITEN[0]; return '#/' + s.pfad; }
function linkKlick(tun) { return ev => { if (ev.button || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return; ev.preventDefault(); tun(); }; }
function modusZiel(id) {
  const m = MODI.find(x => x.id === id); if (!m) return 'start';
  const z = (APP.meta.letzteSeite || {})[id];
  const erste = (m.bereiche.find(bereichSichtbar) || m.bereiche[0]).seiten[0];
  return z && SEITEN.some(s => s.id === z) && bereichVon(z).modus === id && bereichSichtbar(bereichVon(z)) ? z : erste;
}
// „Einrichten › Personen“: Ort einer Seite in Worten (Start-Checkliste, Palette)
function ortVon(seite) { const b = bereichVon(seite), m = modusVon(seite); return m.id === 'start' ? 'Start' : m.titel + ' › ' + b.titel; }
// Zähler/Badge einer Seite für Explorer und Ansichtsschalter (null = nichts anzuzeigen)
function seitenBadge(id) {
  const d = APP.daten; if (!d) return null;
  if (id === 'pruefung') { const f = machFehler().length, w = APP.mach.filter(x => x.stufe === 'warnung').length; return f ? h('span', { class: 'badge err', title: f + ' Fehler' }, '✕ ' + f) : w ? h('span', { class: 'badge warn', title: w + ' Warnungen' }, '! ' + w) : null; }
  if (id === 'editor') { if (!(d.plan.platzierungen.length && APP.cache && APP.cache.bewertung)) return null; const n = hartEnd(); return n ? h('span', { class: 'badge err', title: hartText(n) + ' (Endvalidierung des Gesamtplans)' }, n) : null; }
  if (id === 'gesamtansicht') { const dn = d.dienste, akz = dn.offen.length ? akzeptiertBezug() : null, n = d.plan.platzierungen.length || dn.plan.some(x => x.quelle === 'auto') ? dn.offen.filter(o => o.prio === 'min' && !aufsichtAkzeptiert(akz, o)).length : 0; return n ? h('span', { class: 'badge err', title: n + ' Aufsichten unter dem Mindestbedarf unbesetzt' }, n) : null; }
  if (id === 'auswertung') { let n = 0; try { n = d.plan.platzierungen.length ? offenePunkteZahl() : 0; } catch (err) { n = 0; } return n ? h('span', { class: 'badge warn', title: n + ' offene Punkte' }, n) : null; }
  return null;
}
// Ansichtsschalter: die Seiten des aktuellen Bereichs als Segment (steht im Seitenkopf neben dem Titel)
function ansichtWahl() {
  const b = bereichVon(APP.seite);
  if (b.seiten.length < 2) return null;
  return h('div', { class: 'segment ansichtwahl', role: 'tablist', 'aria-label': 'Ansicht im Bereich ' + b.titel }, b.seiten.map(id => {
    const s = SEITEN.find(x => x.id === id), an = APP.seite === id;
    return h('button', { type: 'button', class: an ? 'aktiv' : '', role: 'tab', 'data-bseite': id, 'aria-selected': an ? 'true' : 'false', onclick: () => gehe(id) }, s.kurz || s.titel, seitenBadge(id));
  }));
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
// Marke: ein Raster aus Tagen und Stunden, eine Zelle farbig – das Zeichen des Mini-Wochenrasters im Explorer
function logoMarke() { const l = h('span', { class: 'logo', 'aria-hidden': 'true' }); l.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><rect x="2.5" y="3.5" width="19" height="17" rx="3.5" class="lg-f"/><g class="lg-z"><rect x="5.5" y="7" width="3.6" height="2.8" rx=".7"/><rect x="10.2" y="7" width="3.6" height="2.8" rx=".7" opacity=".55"/><rect x="14.9" y="7" width="3.6" height="2.8" rx=".7"/><rect x="5.5" y="11.2" width="3.6" height="2.8" rx=".7" opacity=".55"/><rect x="10.2" y="11.2" width="3.6" height="2.8" rx=".7"/><rect x="14.9" y="11.2" width="3.6" height="2.8" rx=".7" opacity=".55"/><rect x="5.5" y="15.4" width="3.6" height="2.8" rx=".7"/><rect x="10.2" y="15.4" width="3.6" height="2.8" rx=".7" opacity=".55"/></g><rect x="14.9" y="15.4" width="3.6" height="2.8" rx=".7" class="lg-a"/></svg>'; return l; }
function kopfBauen() {
  const k = $('#kopf');
  leeren(k).append(
    h('div', { class: 'klinks' },
      h('button', { class: 'btn icon flach', id: 'kNav', type: 'button', 'aria-controls': 'nav', 'aria-label': 'Explorer ausblenden', title: 'Explorer ausblenden', 'aria-expanded': 'true', onclick: () => NAV_SCHMAL.matches ? navDrawer() : explorerUmschalten() }, icon('seitenleiste')),
      h('button', { class: 'projektknopf', id: 'kProjektKnopf', type: 'button', 'aria-haspopup': 'menu', onclick: ev => projektMenue(ev.currentTarget) },
        logoMarke(), h('span', { class: 'projekt', id: 'kProjekt' }), h('span', { class: 'jahr', id: 'kJahr' }), h('span', { class: 'status', id: 'kStatus', role: 'img' }), h('span', { class: 'punkt', id: 'kExportWarnung', hidden: true }))),
    h('nav', { class: 'modi', id: 'kModi', 'aria-label': 'Modus' }, MODI.map((m, i) => h('a', { class: 'modus', href: adresseFuer(m.bereiche[0].seiten[0]), id: 'modus_' + m.id, 'data-modus': m.id, 'aria-keyshortcuts': 'Alt+' + (i + 1), title: m.titel + ' (Alt+' + (i + 1) + ')', onclick: linkKlick(() => modusWechseln(m.id)) }, m.titel))),
    h('div', { class: 'krechts' },
      h('button', { class: 'btn flach suchknopf', id: 'kSuche', type: 'button', title: 'Suchen und springen (Strg+K)', 'aria-label': 'Suchen und springen', 'aria-keyshortcuts': 'Control+K', onclick: paletteOeffnen }, icon('lupe'), h('span', { class: 'ktext' }, 'Suchen'), h('kbd', {}, 'Strg K')),
      h('span', { class: 'kgruppe', role: 'group', 'aria-label': 'Rückgängig und Wiederholen' },
        h('button', { class: 'btn icon flach', title: 'Rückgängig (Strg+Z)', 'aria-label': 'Rückgängig', id: 'kUndo', onclick: rueckgaengig }, icon('rueckgaengig')),
        h('button', { class: 'btn icon flach', title: 'Wiederholen (Strg+Y)', 'aria-label': 'Wiederholen', id: 'kRedo', onclick: wiederholen }, icon('wiederholen'))),
      h('button', { class: 'statuschip', id: 'kKosten', type: 'button' }),
      h('div', { id: 'kopfRechnung', hidden: true }),
      h('span', { class: 'geteilt', id: 'kBerechnenGruppe' },
        h('button', { class: 'btn primaer', id: 'kBerechnen', type: 'button', title: 'Berechnung starten – die Einstellungen stehen hinter dem Pfeil daneben', onclick: () => { gehe('berechnung'); if (!APP.rechnung.laeuft) rechnungStart(); } }, 'Plan berechnen'),
        h('button', { class: 'btn primaer pfeil', id: 'kRechenWahl', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': 'Einstellungen der Berechnung', title: 'Einstellungen der Berechnung: Rechenzeit, Ausgangspunkt, Teilneuplanung', onclick: ev => rechenPopover(ev.currentTarget) }, icon('unten'))),
      h('button', { class: 'btn flach menueknopf', id: 'kMenue', type: 'button', 'aria-haspopup': 'menu', title: 'Einstellungen und Hilfe', onclick: ev => kopfMenue(ev.currentTarget) }, 'Menü'),
      h('button', { class: 'btn icon flach', id: 'kInspektor', type: 'button', 'aria-controls': 'inspektor', 'aria-label': 'Inspektor ausblenden', title: 'Inspektor ausblenden', 'aria-expanded': 'true', onclick: () => inspektorUmschalten() }, icon('seitenleiste', 'gespiegelt')))
  );
}
// Wechsel des Modus: zurück zur Seite, die in diesem Modus zuletzt offen war (sonst die erste)
function modusWechseln(id) {
  if (!MODI.some(x => x.id === id)) return;
  gehe(modusZiel(id));
  const kn = $('#modus_' + id); if (kn && document.activeElement && document.activeElement.classList.contains('modus')) kn.focus();
}
// Alt+1 … Alt+4 wechseln den Modus; Pfeiltasten wandern in der Modusleiste
document.addEventListener('keydown', ev => {
  if (ev.altKey && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey && /^[1-4]$/.test(ev.key) && APP.daten && !document.querySelector('dialog[open]')) { ev.preventDefault(); modusWechseln(MODI[Number(ev.key) - 1].id); return; }
  if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && ev.target && ev.target.classList && ev.target.classList.contains('modus')) {
    const i = MODI.findIndex(m => m.id === ev.target.dataset.modus), n = MODI[(i + (ev.key === 'ArrowRight' ? 1 : MODI.length - 1)) % MODI.length];
    ev.preventDefault(); modusWechseln(n.id); const b = $('#modus_' + n.id); if (b) b.focus();
  }
});
// Tage seit dem letzten Export (oder seit dem ersten gespeicherten Stand); 0 = kein Anlass zur Warnung
function exportTage() { const basis = APP.meta.letzterExport || APP.meta.ersterStand; return basis ? Math.floor((Date.now() - basis) / 864e5) : 0; }
// Projektmenü (Klick auf den Schulnamen): Projektdatei, Beispieldaten, neues Projekt
function projektMenue(knopf) {
  const r = knopf.getBoundingClientRect(), tage = exportTage();
  menueZeigen(r.left, r.bottom + 6, [
    { titel: 'Projektdatei' },
    { icon: 'ordner', text: 'Projekt importieren …', tun: importDialog },
    { icon: 'herunterladen', text: 'Projekt exportieren', hinweis: !APP.meta.letzterExport ? 'noch nie' : tage > 7 ? 'seit ' + tage + ' Tagen nicht' : 'zuletzt ' + datum(APP.meta.letzterExport), tun: () => exportJson(false) },
    { icon: 'auge-aus', text: 'Anonymisiert exportieren', tun: () => exportJson(true) },
    '-',
    { icon: 'stern', text: 'Beispieldaten laden', tun: beispielLaden },
    { icon: 'plus', text: 'Neues leeres Projekt …', tun: neuesProjekt },
    '-',
    { icon: 'stapel', text: 'Stände …', tun: () => gehe('staende') }
  ]);
}
// Menü rechts: Einstellungen und Hilfe
function kopfMenue(knopf) {
  const r = knopf.getBoundingClientRect();
  menueZeigen(r.right - 280, r.bottom + 6, [
    { icon: 'lupe', text: 'Suchen und springen …', taste: 'Strg+K', tun: paletteOeffnen },
    { icon: 'zahnrad', text: 'Einstellungen …', tun: einstellungenDialog },
    '-',
    { icon: 'hilfe', text: 'Hilfe und Datenschutz', tun: infoDialog },
    { icon: 'buch', text: 'Handbuch (PDF)', hinweis: 'herunterladen', tun: handbuchOeffnen },
    expertenModus() ? { icon: 'pruefung', text: 'Selbsttest des Programms', tun: () => gehe('selbsttest') } : null
  ]);
}
// Popover am Pfeil neben „Plan berechnen“: dieselben Einstellungen wie unter Planen › Berechnung
function rechenPopZu() { const p = $('#rechenpop'); if (p) p.remove(); const k = $('#kRechenWahl'); if (k) k.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', rechenPopAussen, true); }
function rechenPopAussen(ev) { const p = $('#rechenpop'), t = ev.target; if (!p) return; if (p.contains(t) || (t && t.closest && t.closest('#kRechenWahl, #hilfepop, #kontextmenue'))) return; rechenPopZu(); }
function rechenPopover(knopf) {
  if ($('#rechenpop')) { rechenPopZu(); return; }
  menueSchliessen();
  const pop = h('div', { class: 'popover rechenpop', id: 'rechenpop', role: 'dialog', 'aria-label': 'Einstellungen der Berechnung',
    onkeydown: ev => { if (ev.key === 'Escape' && !hilfeOffen) { ev.preventDefault(); rechenPopZu(); knopf.focus(); } } });
  const zeichne = () => {
    leeren(pop).append(h('h2', {}, 'Berechnung'), berechnungEinstellungen(zeichne, true),
      h('div', { class: 'zeile' }, h('button', { class: 'btn primaer', type: 'button', disabled: APP.rechnung.laeuft, onclick: () => { rechenPopZu(); gehe('berechnung'); rechnungStart(); } }, 'Plan berechnen'),
        h('button', { class: 'btn flach', type: 'button', onclick: () => { rechenPopZu(); gehe('berechnung'); } }, 'Verlauf und Diagnose')));
    iconKnoepfeBeschriften(pop);
  };
  zeichne();
  document.body.append(pop);
  const r = knopf.getBoundingClientRect(), pr = pop.getBoundingClientRect();
  pop.style.top = Math.round(r.bottom + 6) + 'px';
  pop.style.left = Math.round(Math.max(8, Math.min(innerWidth - pr.width - 8, r.right - pr.width))) + 'px';
  knopf.setAttribute('aria-expanded', 'true');
  const f = pop.querySelector('select, input'); if (f) f.focus();
  setTimeout(() => document.addEventListener('mousedown', rechenPopAussen, true), 0);
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
        h('p', { class: 'muted klein' }, 'Gedruckt wird immer hell, unabhängig von dieser Einstellung.')),
      h('div', {}, h('h3', { id: 'einstDichte' }, 'Stundenplan: Größe der Kacheln'),
        h('div', { class: 'segment', role: 'radiogroup', 'aria-labelledby': 'einstDichte' }, [['kompakt', 'Kompakt'], ['normal', 'Normal'], ['gross', 'Groß']].map(([w, t]) => h('label', {}, h('input', { type: 'radio', name: 'dichte', value: w, checked: dichte() === w, onchange: () => dichteSetzen(w) }), t))),
        h('p', { class: 'muted klein' }, 'Kompakt zeigt mehr Stunden auf einmal; Raum und Lehrkraft stehen dann zum Teil nur im Tooltip.')),
      h('div', {}, h('h3', {}, 'Nach der Berechnung'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: APP.meta.offenNachRechnung === true, onchange: ev => { APP.meta.offenNachRechnung = ev.target.checked; metaSpeichern(); } }), 'Offene Punkte zusätzlich als Fenster öffnen'),
        h('p', { class: 'muted klein' }, 'Die offenen Punkte stehen immer rechts im Inspektor unter „Probleme“ und unter Planen › Auswertung; die Zahl steht oben in der Kopfleiste.')),
      h('div', {}, h('h3', {}, 'Umfang'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'modusExperte', checked: expertenModus(), onchange: ev => { APP.meta.experte = ev.target.checked; metaSpeichern(); navBauen(); render(); } }), 'Expertenmodus'),
        h('p', { class: 'muted klein' }, 'Standard: Das Programm erzeugt Unterrichtsverteilung und Plan aus den Grunddaten. Der Expertenmodus blendet zusätzliche Bereiche ein: Einrichten › Unterricht, Einrichten › Regeln und den Selbsttest des Programms.'))),
    knoepfe: [{ text: 'Schließen', wert: true, art: 'primaer' }]
  });
}
function kopfAktualisieren() {
  if (!APP.daten || !$('#kProjekt')) return;
  $('#kProjekt').textContent = APP.daten.schule.name || 'Ohne Namen';
  $('#kJahr').textContent = APP.daten.schule.schuljahr || '';
  // Speicherstatus als farbiger Punkt; der Wortlaut steht im Tooltip und für Screenreader im aria-label
  const ks = $('#kStatus'), st = APP.speicherStatus;
  ks.className = 'status ' + (/fehlgeschlagen|pausiert/.test(st) ? 'err' : /werden gespeichert/.test(st) ? 'laeuft' : /^(Gespeichert|Geladen)/.test(st) ? 'ok' : '');
  ks.title = st + ' – alle Daten bleiben lokal in diesem Browser'; ks.setAttribute('aria-label', 'Speicherstatus: ' + st);
  $('#kUndo').disabled = !APP.undo.length; $('#kRedo').disabled = !APP.redo.length;
  $('#kUndo').title = APP.undo.length ? 'Rückgängig: ' + APP.undo[APP.undo.length - 1].b + ' (Strg+Z)' : 'Rückgängig (Strg+Z)';
  $('#kRedo').title = APP.redo.length ? 'Wiederholen: ' + APP.redo[APP.redo.length - 1].b + ' (Strg+Y)' : 'Wiederholen (Strg+Y)';
  // Modus in der Kopfleiste
  const mo = modusVon(APP.seite);
  document.querySelectorAll('#kModi .modus').forEach(b => { const an = b.dataset.modus === mo.id; if (an) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); b.setAttribute('href', adresseFuer(an ? APP.seite : modusZiel(b.dataset.modus))); });
  // Statuschip: Ampel plus Zahl der Probleme. Ohne Plan zeigt er, ob die Daten bereit für die Berechnung sind. Ein Klick zeigt die Probleme im Inspektor.
  const kk = $('#kKosten');
  const chip = (farbe, text, titel) => { leeren(kk).append(h('span', { class: 'ampel ' + farbe, 'aria-hidden': 'true' }), h('span', { class: 'ctext' }, text)); kk.title = titel; kk.setAttribute('aria-label', text + ' – ' + titel); kk.onclick = () => inspektorZeigen('probleme'); };
  if (APP.daten.plan.platzierungen.length) {
    const { k } = modell().bewertung;
    let farbe = 'leer', n = 0;
    try { farbe = planAmpel().ampel; n = offenePunkteZahl(); } catch (err) { farbe = 'leer'; }
    const nh = hartEnd();
    // Rot: Probleme · Gelb: vollständig, es bleiben offene Punkte oder Wünsche · Grün: in Ordnung
    const text = farbe === 'rot' ? (n || nh || 1) + ((n || nh || 1) === 1 ? ' Problem' : ' Probleme') : n ? n + (n === 1 ? ' offener Punkt' : ' offene Punkte') : farbe === 'gelb' ? 'Plan vollständig' : 'Plan in Ordnung';
    chip(farbe === 'leer' ? '' : farbe, text,
      (AMPEL_TEXT[farbe] || AMPEL_TEXT.leer)[1] + ' ' + (nh ? hartText(nh) + ' laut Endprüfung des Gesamtplans' : 'Keine harten Fehler') + ', ' + zahlDe(k.weich, 1) + ' Strafpunkte aus Wünschen. Klick: Probleme rechts im Inspektor zeigen');
  } else {
    const f = machFehler().length;
    if (f) chip('rot', f + ' Fehler in den Daten', 'Vor der Berechnung zu beheben. Klick: Probleme rechts im Inspektor zeigen');
    else chip('', 'Noch kein Plan', 'Es wurde noch kein Plan berechnet. Klick: Prüfung der Daten rechts im Inspektor zeigen');
  }
  // Exportwarnung: dezenter Punkt am Projektnamen; der Wortlaut steht im Projektmenü und im Tooltip
  const tage = exportTage(), warn = tage > 7, pk = $('#kProjektKnopf');
  $('#kExportWarnung').hidden = !warn;
  pk.title = (warn ? 'Seit ' + tage + ' Tagen kein Export – Browserdaten können beim Löschen des Verlaufs verloren gehen. ' : '') + 'Projekt: importieren, exportieren, Beispieldaten, neues Projekt';
  pk.setAttribute('aria-label', 'Projekt ' + (APP.daten.schule.name || '') + (warn ? ', seit ' + tage + ' Tagen kein Export' : '') + ' – Projektmenü');
  const kr = $('#kopfRechnung');
  const R = APP.rechnung;
  kr.hidden = !R.laeuft;
  $('#kBerechnenGruppe').hidden = !!R.laeuft;
  if (R.laeuft) {
    const f = R.fortschritt || {};
    leeren(kr).append(h('span', {}, 'Berechnung läuft '), h('div', { class: 'mini', role: 'progressbar', 'aria-label': 'Fortschritt der Berechnung', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.min(99, Math.floor(rechnungGesamt(f) * 100)) }, h('div', { style: { width: Math.min(99, Math.floor(rechnungGesamt(f) * 100)) + '%' } })),
      h('button', { class: 'btn klein', onclick: rechnungStop }, 'Stopp'));
  }
}
// Explorer (links) und Inspektor (rechts) lassen sich ausblenden; die Wahl bleibt gespeichert (APP.meta.explorerZu, APP.meta.inspektor).
// Unter 1280 px Breite ist der Inspektor anfangs zu und legt sich beim Öffnen über die Seite; unter 900 px ist der Explorer eine Schublade.
const NAV_SCHMAL = window.matchMedia ? matchMedia('(max-width: 899px)') : { matches: false };
const INSP_BREIT = window.matchMedia ? matchMedia('(min-width: 1280px)') : { matches: true };
function explorerOffen() { return !APP.meta.explorerZu; }
function explorerUmschalten() { APP.meta.explorerZu = explorerOffen(); metaSpeichern(); layoutAnwenden(); const k = $('#kNav'); if (k) k.focus(); }
function inspektorOffen() { const w = APP.meta.inspektor; return w === 'auf' || (w !== 'zu' && INSP_BREIT.matches); }
function inspektorUmschalten(auf) {
  const ziel = auf === undefined ? !inspektorOffen() : !!auf;
  APP.meta.inspektor = ziel === INSP_BREIT.matches ? 'auto' : ziel ? 'auf' : 'zu';
  metaSpeichern(); layoutAnwenden();
}
// Inspektor öffnen und einen Reiter zeigen (Statuschip, „Probleme ansehen“)
function inspektorZeigen(tab) {
  if (!inspektorOffen()) inspektorUmschalten(true);
  if (APP.seite === 'editor' && document.querySelector('#inspektor [data-sltab="' + tab + '"]')) editorLeiste(tab);
  else inspektorReiter(tab);
  const b = document.querySelector('#inspektor [data-sltab="' + tab + '"]'); if (b) b.focus();
}
function layoutAnwenden() {
  const app = $('#app'); if (!app) return;
  const ex = explorerOffen(), ins = inspektorOffen();
  app.classList.toggle('ohne-explorer', !ex);
  app.classList.toggle('ohne-inspektor', !ins);
  app.classList.toggle('inspektor-ueber', ins && !INSP_BREIT.matches);
  const kn = $('#kNav');
  if (kn && !NAV_SCHMAL.matches) { const t = ex ? 'Explorer ausblenden' : 'Explorer einblenden'; kn.setAttribute('aria-label', t); kn.title = t; kn.setAttribute('aria-expanded', ex ? 'true' : 'false'); }
  const ki = $('#kInspektor');
  if (ki) { const t = ins ? 'Inspektor ausblenden' : 'Inspektor einblenden (Details, Probleme, Hilfe)'; ki.setAttribute('aria-label', t); ki.title = t; ki.setAttribute('aria-expanded', ins ? 'true' : 'false'); }
}
if (INSP_BREIT.addEventListener) INSP_BREIT.addEventListener('change', () => layoutAnwenden());
// Explorer: oben die Bereiche des Modus, darunter (#explorerObjekte) die Objekte der Seite – im Stundenplan Klassen, Personen und Räume,
// auf den Seiten mit „Liste mit Details“ die Liste der Einträge.
function navBauen() {
  const n = leeren($('#nav'));
  n.setAttribute('aria-label', 'Explorer');
  const mo = modusVon(APP.seite);
  n.append(h('div', { class: 'bereiche', role: 'group', 'aria-label': 'Bereiche: ' + mo.titel }, mo.bereiche.filter(bereichSichtbar).map(b => {
    const an = b.seiten.includes(APP.seite);
    return h('a', { class: 'bereich' + (an ? ' aktiv' : ''), href: adresseFuer(b.seiten[0]), 'data-bereich': b.id, 'data-seite': b.seiten[0], 'data-seiten': b.seiten.join(' '), 'aria-current': an ? 'page' : null, onclick: linkKlick(() => { if (!an) gehe(b.seiten[0]); navZu(); }) },
      h('span', { class: 'nsym' }, icon(b.symbol)), h('span', { class: 'ntext' }, b.titel), b.experte ? h('span', { class: 'nexperte', title: 'Bereich des Expertenmodus' }, 'Experte') : null, h('span', { class: 'zahl', id: 'navz_' + b.id }));
  })),
  h('div', { class: 'objekte', id: 'explorerObjekte', hidden: true }),
  h('div', { class: 'nfuss' }, icon('schloss', 'k'), h('span', {}, 'Alle Daten bleiben lokal in diesem Browser.')));
  layoutAnwenden();
  navAktualisieren();
}
// Unter 900 px Breite ist der Explorer eine Schublade: Der Knopf links in der Kopfleiste öffnet sie über dem Inhalt,
// ein Klick auf einen Eintrag, auf den Schleier oder Esc schließt sie wieder.
function navDrawer(auf) {
  const app = $('#app'), offen = auf === undefined ? !app.classList.contains('nav-drawer') : !!auf;
  app.classList.toggle('nav-drawer', offen && NAV_SCHMAL.matches);
  const k = $('#kNav'); if (k) { k.setAttribute('aria-expanded', offen ? 'true' : 'false'); k.setAttribute('aria-label', offen ? 'Explorer schließen' : 'Explorer öffnen'); k.title = offen ? 'Explorer schließen' : 'Explorer öffnen'; }
  let sch = $('#navschleier');
  if (offen && NAV_SCHMAL.matches) { if (!sch) { sch = h('div', { id: 'navschleier', onclick: () => navDrawer(false) }); app.append(sch); } const erster = $('#nav .bereich.aktiv') || $('#nav [data-seite]'); if (erster) erster.focus(); }
  else if (sch) sch.remove();
}
if (NAV_SCHMAL.addEventListener) NAV_SCHMAL.addEventListener('change', () => { navDrawer(false); layoutAnwenden(); });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && $('#app') && $('#app').classList.contains('nav-drawer') && !document.querySelector('dialog[open]') && !$('#kontextmenue')) { navDrawer(false); const k = $('#kNav'); if (k) k.focus(); } });
function navZu() { if ($('#app').classList.contains('nav-drawer')) navDrawer(false); }
function navAktualisieren() {
  const d = APP.daten;
  BEREICHE.forEach(b => {
    const z = $('#navz_' + b.id); if (!z) return;
    // je Bereich die wichtigste Meldung seiner Seiten (Fehler vor Warnung), sonst die Zahl der Einträge
    const alle = b.seiten.map(seitenBadge).filter(Boolean);
    const m = alle.find(x => x.classList.contains('err')) || alle[0] || null;
    leeren(z).append(m || (b.anzahl && d ? h('span', { class: 'anz' }, String(b.anzahl(d))) : ''));
  });
}
// ---------- #-Adressen ----------
// #/einrichten/personen, #/planen/stundenplan/klasse/k_5a … Ein Seitenwechsel legt einen Eintrag in den Verlauf (Zurück-Taste),
// ein Neuaufbau derselben Ansicht nicht. Unbekannte Adressen werden ignoriert.
const ART_ADRESSE = { klasse: 'klasse', lehrer: 'person', raum: 'raum' };
function adresseVon() {
  const s = SEITEN.find(x => x.id === APP.seite) || SEITEN[0];
  let a = '#/' + s.pfad;
  if (APP.seite === 'editor' && APP.editor.id && ART_ADRESSE[APP.editor.art]) a += '/' + ART_ADRESSE[APP.editor.art] + '/' + encodeURIComponent(APP.editor.id);
  return a;
}
function adresseLesen(hash) {
  let t = String(hash || '').replace(/^#\/?/, '');
  try { t = decodeURIComponent(t); } catch (e) { /* ungültige Kodierung: wie geschrieben */ }
  t = t.replace(/\/+$/, '');
  if (!t) return null;
  const s = SEITEN.filter(x => t === x.pfad || t.startsWith(x.pfad + '/')).sort((a, b) => b.pfad.length - a.pfad.length)[0];
  if (!s) return null;
  return { seite: s.id, rest: t.slice(s.pfad.length).split('/').filter(Boolean) };
}
function adresseSetzen() {
  if (APP._ausAdresse || typeof history === 'undefined') return;
  const a = adresseVon();
  if (location.hash === a) { APP._adresseErsetzen = false; return; }
  try { if (APP._adresseErsetzen || !adresseLesen(location.hash)) history.replaceState(null, '', a); else history.pushState(null, '', a); } catch (e) { /* z. B. in einer eingebetteten Vorschau ohne Verlauf */ }
  APP._adresseErsetzen = false;
}
// Adresse in die Ansicht übernehmen (beim Start, bei Zurück/Vor und bei einer von Hand eingegebenen Adresse). Rückgabe: true, wenn sie passte.
function adresseAnwenden() {
  const z = adresseLesen(location.hash);
  if (!z) return false;
  if (location.hash === adresseVon() && APP._renderSeite === APP.seite) return true;
  if (z.seite === 'editor' && z.rest.length >= 2) {
    const art = { klasse: 'klasse', person: 'lehrer', raum: 'raum' }[z.rest[0]];
    if (art) { APP.editor.art = art; APP.editor.id = z.rest[1]; APP.editor.sel = -1; }
  }
  APP._ausAdresse = true;
  try { gehe(z.seite); } finally { APP._ausAdresse = false; APP._adresseErsetzen = false; }
  return true;
}
window.addEventListener('popstate', () => { if (APP.daten && $('#inhalt')) adresseAnwenden(); });
window.addEventListener('hashchange', () => { if (APP.daten && $('#inhalt')) adresseAnwenden(); });
function gehe(seite, opt) {
  if (seite === 'pausen') { try { DS().tab = 'bedarf'; } catch (e) {} seite = 'aufsicht'; }
  if (seite === 'mitarbeitende') { APP.azAnsicht = 'einsatz'; seite = 'arbeitszeit'; } // frühere Seite „Einsatzübersicht“
  if (SEITEN_ALIAS[seite]) { (APP.reiter || (APP.reiter = {}))[SEITEN_ALIAS[seite][0]] = SEITEN_ALIAS[seite][1]; seite = SEITEN_ALIAS[seite][0]; }
  if (seite === 'aufsicht' && opt && opt.reiter === 'auswertung') seite = 'aufsichtauswertung';
  if (!SEITEN.some(s => s.id === seite)) seite = 'start';
  if (opt && opt.reiter) (APP.reiter || (APP.reiter = {}))[seite] = opt.reiter;
  APP.seite = seite;
  const mo = modusVon(seite).id;
  if ((APP.meta.letzteSeite || {})[mo] !== seite) { APP.meta.letzteSeite = Object.assign({}, APP.meta.letzteSeite, { [mo]: seite }); metaSpeichern(); }
  if (opt && opt.markiere) APP.markiere = opt.markiere;
  if ($('#nav')) navBauen();
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
  menueSchliessen(); hilfeSchliessen(); rechenPopZu();
  const gleicheSeite = APP._renderSeite === APP.seite;
  APP._renderSeite = APP.seite;
  const fokus = gleicheSeite ? fokusMerken($('#inhalt')) : null;
  const scroll = $('#inhalt').scrollTop;
  const main = leeren($('#inhalt'));
  main.classList.toggle('voll', APP.seite === 'editor');
  main.dataset.seite = APP.seite;
  const s = SEITEN.find(x => x.id === APP.seite) || SEITEN[0];
  // Was die Seite beim Zeichnen für Explorer und Inspektor ablegt: Liste der Einträge, Hilfetext des Seitenkopfs
  APP._explorerTeil = null; APP._seitenHilfe = null; APP._inspektorDetails = null;
  { const bn = bannerLeiste(); if (bn) main.append(bn); }
  const inhalt = (SEITEN_RENDER[s.id] || (() => h('p', {}, 'Unbekannte Seite')))();
  main.append(...[inhalt].flat(Infinity).filter(x => x !== null && x !== undefined && x !== false));
  // Ansichtsschalter des Bereichs: im Seitenkopf neben dem Titel (ohne Seitenkopf über der Seite)
  { const aw = ansichtWahl(); if (aw) { const sk = main.querySelector('.seitenkopf'); if (sk) sk.querySelector('.text').after(aw); else main.prepend(aw); } }
  uebersichtenAktivieren(main);
  iconKnoepfeBeschriften(main);
  explorerObjekteFuellen();
  inspektorBauen(gleicheSeite);
  if (APP.markiere) {
    const ziel = main.querySelector('[data-id="' + CSS.escape(APP.markiere) + '"]') || $('#nav').querySelector('[data-id="' + CSS.escape(APP.markiere) + '"]');
    if (ziel) { ziel.classList.add('markiert'); ziel.scrollIntoView({ block: 'center' }); const inp = main.contains(ziel) ? ziel.querySelector('input,select,button') : null; if (inp) inp.focus(); }
    APP.markiere = null;
  } else if (gleicheSeite) {
    if (main.scrollTop !== scroll) main.scrollTop = scroll;
    fokusWiederherstellen(main, fokus);
  }
  kopfAktualisieren();
  navAktualisieren();
  adresseSetzen();
  document.title = s.titel + ' – ' + (APP.daten.schule.name ? APP.daten.schule.name + ' – ' : '') + 'Stundenplaner';
}
