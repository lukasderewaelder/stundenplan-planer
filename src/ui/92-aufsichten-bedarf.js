/* =====================================================================
   5e. OBERFLÄCHE – Aufsichten
   Reiter: Aufsichten (Bedarf) · Bereiche · Wochenplan (Timeline) · Auswertung
   ===================================================================== */
function DS() {
  const s = APP.tabellen.dienst || (APP.tabellen.dienst = {});
  const R = APP.daten.dienste.regeln;
  if (!s.tab || s.tab === 'wochenplan') s.tab = 'bedarf';
  if (s.tag === undefined) s.tag = 0;
  if (!s.ansicht) s.ansicht = 'tag';
  if (!s.filter) s.filter = 'dienstfaehig';
  if (s.suche === undefined) s.suche = '';
  if (!s.ppm) s.ppm = 1.2;
  if (s.bedarfTag === undefined) s.bedarfTag = -1;
  if (s.unterricht === undefined) s.unterricht = true;
  s.von = R.ansichtVon; s.bis = R.ansichtBis;
  if (s.tag >= APP.daten.schule.tage.length) s.tag = 0;
  return s;
}
const dTyp = id => DIENSTTYPEN.find(t => t.id === id);
const dBedarf = id => id ? APP.daten.dienste.bedarfe.find(b => b.id === id) : null;
const dBereich = id => id ? APP.daten.dienste.bereiche.find(b => b.id === id) : null;
const tagLang = t => TAGE_LANG[APP.daten.schule.tage[t]] || APP.daten.schule.tage[t] || '?';
const tagKurz = t => APP.daten.schule.tage[t] || '?';
function bereichOpts(leer) { return [['', leer || '– kein Bereich –']].concat(APP.daten.dienste.bereiche.map(b => [b.id, b.name + (b.exklusiv ? ' (exklusiv)' : '')])); }
function dienstTitel(x) { const b = dBedarf(x.bedarf), t = dTyp(x.typ); return (x.name || (b && b.name) || (t && t.name) || 'Aufsicht'); }
function dienstText(x) { const b = dBedarf(x.bedarf), r = dBereich(x.bereich || (b && b.bereich)); return dienstTitel(x) + (r ? ' – ' + r.name : '') + ' · ' + x.beginn + '–' + x.ende; }
// Änderung am Aufsichtsplan: automatische Nachplanung greift nicht, weil sich die Grundlagen nicht ändern
function dienstAendern(beschr, fn, opt) { return aendern(beschr, fn, Object.assign({}, opt || {})); }
// Priorität vor jeder automatischen/manuellen Aufsichtsplanung:
// 1. Fachunterricht ist bereits durch den Stundenplan festgelegt,
// 2. konfigurierten Co-Bedarf gegen diesen Fachunterricht aktualisieren,
// 3. erst danach Aufsichten mit den verbleibenden freien Personen planen.
// Schritt 2 läuft nur, wenn sich etwas für die Co-Besetzung Wichtiges geändert hat (Stundenplan, Personen, Unterrichte, Co-Bedarf) –
// eine Änderung nur an den Aufsichten lässt die Co-Lehrkräfte unverändert. Ändert sich die Co-Besetzung, erscheint ein Hinweis.
function coSignatur(d) {
  const t = JSON.stringify([d.schule, d.faecher, d.klassen,
    d.lehrer.map(l => Object.assign({}, l, { aufsicht: 0, dienstAusschluss: 0, dienstPraeferenzen: 0, dienstVerfuegbarkeit: 0, qualifikationen: 0 })),
    d.unterrichte.map(u => Object.assign({}, u, { lehrkraefte: u.lehrkraefte.filter(z => !(z.rolle === 'co' && z.auto)) })),
    d.plan.platzierungen.map(p => Object.assign({}, p, { co: 0 })), d.plan.frei, d.plan.besetzung]);
  return _hash(t) + ':' + t.length;
}
function coVorAufsichtAktualisieren(d) {
  if (!d || !d.plan || !d.plan.platzierungen || !d.plan.platzierungen.length) return null;
  if (d.plan.coStand === coSignatur(d)) return null;
  const hatCoBedarf = d.faecher.some(f => f.coBedarf) || d.klassen.some(k => Object.values(k.coBedarf || {}).some(v => v !== 'kein'));
  const coJe = () => new Map(d.plan.platzierungen.map(p => [p.unterricht + '|' + p.blockNr, (p.co || []).slice().sort().join(',')]));
  const vorher = coJe();
  d.plan.coNachlauf = hatCoBedarf ? coNachPlanErgaenzen(d, { ersetzen: true }) : null;
  d.plan.coStand = coSignatur(d);
  let n = 0; coJe().forEach((v, k) => { if (vorher.get(k) !== v) n++; });
  if (n) toast('Co-Lehrkräfte an den geänderten Stand angepasst: ' + (n === 1 ? 'ein Unterrichtsblock' : n + ' Unterrichtsblöcke') + ' mit neuer Co-Besetzung.', '', 6000);
  return d.plan.coNachlauf;
}
// Automatische Nachplanung innerhalb derselben Änderung (Rückgängig nimmt beides zurück)
function dienstAuto(d) {
  if (!d || !d.dienste) return;
  if (dienstAutoNoetig(d)) {
    coVorAufsichtAktualisieren(d);
    const r = dienstePlanen(d, { nurOffene: true, stabil: true, zeitlimit: 150 });
    d.dienste.plan = r.plan; d.dienste.offen = r.offen; d.dienste.stand = r.stand;
    // Meldungen über nicht übernommene feste Einsätze bleiben stehen, bis neu geplant oder der Hinweis bestätigt wird
    if (r.verdraengt.length) { const da = new Set((d.dienste.verdraengt || []).map(x => x.id)); d.dienste.verdraengt = (d.dienste.verdraengt || []).concat(r.verdraengt.filter(x => !da.has(x.id))); }
  }
  // offene Schichten immer aus dem aktuellen Stand (auch nach Handänderungen)
  d.dienste.offen = offeneSchichten(d);
}
function dienstePlanenStarten(nurOffene) {
  const d = APP.daten;
  if (!d.dienste.bedarfe.length) { toast('Zuerst im Reiter „Bedarf“ eintragen, wann wie viele Personen gebraucht werden.', 'err', 6000); DS().tab = 'bedarf'; render(); return; }
  const st = DS();
  let r = null;
  const t0 = performance.now();
  dienstAendern(nurOffene ? 'Offene Aufsichten geplant' : 'Aufsichten geplant', dd => {
    // Auch bei einer späteren manuellen Neuplanung gilt die globale Reihenfolge:
    // Fachlehrkräfte → Co-Lehrkräfte → Aufsichten.
    coVorAufsichtAktualisieren(dd);
    r = dienstePlanen(dd, { nurOffene: !!nurOffene, stabil: nurOffene || st.stabil !== false, zeitlimit: 900 });
    dd.dienste.plan = r.plan; dd.dienste.offen = r.offen; dd.dienste.stand = r.stand; dd.dienste.verdraengt = r.verdraengt;
  }, { ohneDienste: true });
  if (!r) return;
  const s = r.statistik;
  const offen = s.offenMin + s.offenSoll;
  toast((nurOffene ? 'Nachgeplant: ' : 'Aufsichten geplant: ') + s.neu + ' neu, ' + s.behalten + ' behalten' + (s.verdraengt ? ', ' + s.verdraengt + ' fester Einsatz überschneidet sich mit Unterricht und wurde neu besetzt' : '') + (offen ? ', ' + offen + ' Schicht(en) offen' + (s.offenMin ? ' (davon ' + s.offenMin + ' unter Minimum)' : '') : ', Bedarf gedeckt') + ' · ' + Math.round(performance.now() - t0) + ' ms.', s.offenMin || s.verdraengt ? 'err' : 'ok', 7000);
  if (APP.meta.offenNachRechnung === true && !document.querySelector('dialog[open]')) offenePunkteDialog(true);
}
async function dienstPlanLeeren() {
  const d = APP.daten, n = d.dienste.plan.filter(x => x.quelle === 'auto' && !x.fixiert).length;
  const alle = h('input', { type: 'checkbox' });
  const ok = await dialog({ titel: 'Aufsichten entfernen', inhalt: h('div', {}, h('p', {}, n + ' automatisch geplante Aufsichten entfernen? Manuelle und fixierte Einsätze bleiben.'), h('label', { class: 'check' }, alle, 'Auch manuelle Einsätze entfernen (fixierte bleiben immer)')), knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'Entfernen', wert: true, art: 'gefahr' }] });
  if (!ok) return;
  dienstAendern('Aufsichten entfernt', dd => { dd.dienste.plan = dd.dienste.plan.filter(x => x.fixiert || (!alle.checked && x.quelle !== 'auto')); dd.dienste.offen = []; dd.dienste.stand = ''; dd.dienste.auto = false; });
  toast('Automatische Nachplanung ist aus, damit der leere Plan erhalten bleibt.', '', 5000);
}

/* ---------------- Seite ---------------- */
const DIENST_TABS = [['bedarf', 'Aufsichten'], ['bereiche', 'Bereiche'], ['auswertung', 'Auswertung']];
// Hinweise über dem Aufsichtsplan (Seiten „Aufsichten“ und „Gesamtansicht“)
function dienstHinweise(d) {
  const DI = d.dienste, hinweise = [];
  const veraltet = DI.plan.length && DI.stand && DI.stand !== dienstGrundlagenSignatur(d);
  if (!d.plan.platzierungen.length) hinweise.push(h('div', { class: 'hinweis' }, 'Noch kein Stundenplan berechnet. Aufsichten lassen sich trotzdem vorbereiten – Unterricht, Co-Einsätze und Aufgaben werden aber erst mit dem Plan als Belegung berücksichtigt.'));
  if ((DI.verdraengt || []).length) hinweise.push(h('div', { class: 'hinweis err', id: 'aufsVerdraengt' }, h('b', {}, (DI.verdraengt.length === 1 ? 'Ein fest eingetragener Einsatz wurde' : DI.verdraengt.length + ' fest eingetragene Einsätze wurden') + ' nicht übernommen, weil Unterricht Vorrang hat: '),
    DI.verdraengt.slice(0, 6).map(x => (d.schule.tage[x.tag] || '?') + ' ' + x.beginn + '–' + x.ende + ' ' + (x.name || 'Aufsicht') + ' (' + lehrerNameKurz(lehrerVon(x.lehrer)) + ') – ' + x.grund).join(' · '),
    ' Die Aufsicht wurde neu besetzt. ', h('button', { class: 'btn klein', onclick: () => dienstAendern('Hinweis bestätigt', dd => { dd.dienste.verdraengt = []; }, { ohneDienste: true }) }, 'Zur Kenntnis genommen')));
  if (veraltet) hinweise.push(h('div', { class: 'hinweis warn zeile' }, h('b', {}, 'Aufsichtsplan ist nicht mehr aktuell.'), h('span', {}, 'Stundenplan, Zeitprofile, Verfügbarkeiten oder Bedarf haben sich seit der letzten Aufsichtsplanung geändert. „Nur offene besetzen“ oder „Aufsichten planen“ wählen.')));
  return hinweise;
}
SEITEN_RENDER.gesamtansicht = () => {
  const d = APP.daten;
  const kopf = seitenkopf('Gesamtansicht', 'Alle Personen eines Tages (oder eine Person über die Woche) auf einer Zeitleiste: Unterricht, Co-Unterricht, Aufgaben, GTAs und Aufsichten in echten Uhrzeiten. Aufsichten lassen sich hier ziehen, in der Länge ändern, tauschen und neu anlegen; offene Schichten stehen rechts zum Hineinziehen auf eine Person. Den Bedarf (wann wie viele Personen) legt die Seite „Aufsichten“ fest.',
    h('button', { class: 'btn', onclick: () => dienstePlanenStarten(true), title: 'Behält alle vorhandenen Aufsichtseinsätze (außer automatischen mit Konflikt) und besetzt nur, was fehlt.' }, 'Nur offene besetzen'),
    h('button', { class: 'btn primaer', onclick: () => dienstePlanenStarten(false), title: 'Plant alle automatischen Aufsichten neu gegen den aktuellen Fach- und Co-Unterricht. Nur von Hand gesetzte und fixierte Einsätze bleiben.' }, 'Aufsichten planen'));
  let inhalt;
  try { inhalt = dienstWochenplanTab(); } catch (err) { console.error(err); inhalt = h('div', { class: 'hinweis err' }, 'Fehler beim Anzeigen: ' + err.message); }
  return [kopf, dienstHinweise(d), inhalt];
};
SEITEN_RENDER.aufsicht = () => {
  const d = APP.daten, DI = d.dienste, st = DS();
  if (!DIENST_TABS.some(t => t[0] === st.tab)) st.tab = 'bedarf';
  const kopf = seitenkopf('Aufsichten', 'Eine gemeinsame Planung für alle Aufsichten: Pausen, Früh-/Spätaufsichten, Bistro, Springer und weitere benannte Aufsichtsphasen. Fachunterricht und Co-Unterricht werden immer zuerst geplant; „Plan berechnen“ berechnet die Aufsichten danach jedes Mal neu. Aufsichten gelten für die Pausen des Zeitrasters und werden nur an den Grenzen ihrer Staffelung (Abschnitte) geteilt – zwischen den Abschnitten darf das Personal wechseln. Verschobene Pausen der Zeitprofile teilen nichts: Wer deshalb länger Unterricht hat, übernimmt nur die Abschnitte, die danach beginnen. Aufsichten gehen zuerst an die Personen mit den meisten Minusstunden (Differenz Ist − Soll möglichst gleich); bei Gleichstand gilt: sonstiges Personal, dann Co-Lehrkräfte, dann Lehrkräfte.',
    h('label', { class: 'check', title: 'Gilt für Änderungen von Hand: Ändern sich Stundenplan, Zeitprofile, Verfügbarkeiten oder Bedarf, werden offene und nicht mehr passende automatische Aufsichtseinsätze sofort nachgeplant. Manuelle und fixierte Einsätze bleiben. Hat sich der Stundenplan oder die Co-Planung geändert, werden vorher auch die automatisch vergebenen Co-Lehrkräfte angepasst (mit Hinweis). „Plan berechnen“ berechnet die Aufsichten unabhängig von diesem Schalter immer vollständig neu.' }, h('input', { type: 'checkbox', checked: DI.auto, onchange: ev => dienstAendern(ev.target.checked ? 'Automatische Nachplanung an' : 'Automatische Nachplanung aus', dd => { dd.dienste.auto = ev.target.checked; }) }), 'automatisch nachplanen'),
    h('label', { class: 'check', title: 'Bei „Aufsichten planen“ bisherige Aufsichtszuordnungen bevorzugen.' }, h('input', { type: 'checkbox', checked: st.stabil !== false, onchange: ev => { st.stabil = ev.target.checked; } }), 'Änderungen gering halten'),
    h('button', { class: 'btn', onclick: () => dienstePlanenStarten(true), title: 'Behält alle vorhandenen Aufsichtseinsätze (außer automatischen mit Konflikt) und besetzt nur, was fehlt.' }, 'Nur offene besetzen'),
    h('button', { class: 'btn primaer', onclick: () => dienstePlanenStarten(false), title: 'Plant alle automatischen Aufsichten neu gegen den aktuellen Fach- und Co-Unterricht. Nur von Hand gesetzte und fixierte Einsätze bleiben; alte automatische Einträge werden ersetzt.' }, 'Aufsichten planen'));
  const hinweise = dienstHinweise(d);
  const tabs = h('div', { class: 'reiter', role: 'tablist' }, DIENST_TABS.map(([k, t]) => h('button', { class: 'reiterknopf' + (st.tab === k ? ' aktiv' : ''), role: 'tab', 'aria-selected': st.tab === k ? 'true' : 'false', onclick: () => { st.tab = k; render(); } }, t)),
    h('button', { class: 'reiterknopf', role: 'tab', 'aria-selected': 'false', title: 'Zeitleiste aller Personen mit Aufsichten (9. Punkt der Seitenleiste)', onclick: () => gehe('gesamtansicht') }, 'Gesamtansicht ', icon('pfeil-rechts', 'k'), DI.offen.length ? h('span', { class: 'badge ' + (DI.offen.some(o => o.prio === 'min') ? 'err' : 'warn') }, DI.offen.length) : null));
  let inhalt;
  try {
    inhalt = st.tab === 'bereiche' ? dienstBereicheTab() : st.tab === 'auswertung' ? dienstAuswertungTab() : dienstBedarfTab();
  } catch (err) { console.error(err); inhalt = h('div', { class: 'hinweis err' }, 'Fehler beim Anzeigen: ' + err.message); }
  return [kopf, hinweise, tabs, h('div', { class: 'reiterinhalt' }, inhalt)];
};

/* ---------------- Reiter „Bedarf“ ---------------- */
function bedarfFinden(d, id) { return d.dienste.bedarfe.find(b => b.id === id); }
function bedarfAendern(beschr, id, fn) { dienstAendern(beschr, d => { const b = bedarfFinden(d, id); if (b) fn(b, d); }); }
// Uhrzeit eines Abschnitts ändern: angrenzende Abschnitte werden mitgeführt, nie gelöscht
function abschnittZeit(bid, i, feld, roh) {
  const v = zeitNorm(roh);
  const b0 = bedarfFinden(APP.daten, bid); if (!b0) return;
  const a0 = b0.abschnitte[i];
  if (!v) { toast('Bitte eine Uhrzeit wie 07:15 eingeben.', 'err'); render(); return; }
  if (v === a0[feld]) return;
  const neuB = feld === 'beginn' ? minVon(v) : minVon(a0.beginn), neuE = feld === 'ende' ? minVon(v) : minVon(a0.ende);
  if (neuB !== null && neuE !== null && neuE <= neuB) { toast('Das Ende muss nach dem Beginn liegen (' + (feld === 'ende' ? a0.beginn : v) + ').', 'err', 5000); render(); return; }
  const nach = b0.abschnitte[i + 1], vor = b0.abschnitte[i - 1];
  // Überschneidung mit anderen (nicht direkt anschließenden) Abschnitten verhindern – sie würden doppelt zählen
  const nb = feld === 'beginn' ? minVon(v) : minVon(a0.beginn), ne = feld === 'ende' ? minVon(v) : minVon(a0.ende);
  const kollision = b0.abschnitte.find((a, j) => { if (j === i) return false; if (feld === 'ende' && j === i + 1 && a.beginn === a0.ende) return false; if (feld === 'beginn' && j === i - 1 && a.ende === a0.beginn) return false; const iv = intervall(a.beginn, a.ende); return iv && nb !== null && ne !== null && iv.start < ne && nb < iv.end; });
  if (kollision) { toast('Der Abschnitt würde sich mit ' + kollision.beginn + '–' + kollision.ende + ' überschneiden. Für mehr Personen bitte die Zahl erhöhen statt Abschnitte zu überlagern.', 'err', 7000); render(); return; }
  if (feld === 'ende' && nach && nach.beginn === a0.ende && minVon(v) >= minVon(nach.ende)) { toast('Der folgende Abschnitt (' + nach.beginn + '–' + nach.ende + ') würde dadurch leer. Bitte zuerst zusammenführen oder löschen.', 'err', 6000); render(); return; }
  if (feld === 'beginn' && vor && vor.ende === a0.beginn && minVon(v) <= minVon(vor.beginn)) { toast('Der vorige Abschnitt (' + vor.beginn + '–' + vor.ende + ') würde dadurch leer. Bitte zuerst zusammenführen oder löschen.', 'err', 6000); render(); return; }
  bedarfAendern('Bedarf ' + (feld === 'beginn' ? 'Beginn' : 'Ende') + ' ' + v, bid, b => {
    const a = b.abschnitte[i], alt = a[feld];
    a[feld] = v;
    if (feld === 'ende') { const n = b.abschnitte[i + 1]; if (n && n.beginn === alt) n.beginn = v; }
    if (feld === 'beginn') { const p = b.abschnitte[i - 1]; if (p && p.ende === alt) p.ende = v; }
  });
}
function abschnittZahl(bid, i, feld, roh) {
  const n = Math.max(0, Math.min(50, Math.round(Number(String(roh).replace(',', '.')) || 0)));
  bedarfAendern('Bedarf ' + (feld === 'min' ? 'Minimum' : 'Soll') + ' ' + n, bid, b => {
    const a = b.abschnitte[i]; a[feld] = n;
    if (feld === 'min' && a.soll < n) a.soll = n;
    if (feld === 'soll' && a.min > n) a.min = n;
  });
}
function abschnittTeilen(bid, i) {
  const b = bedarfFinden(APP.daten, bid), a = b && b.abschnitte[i]; if (!a) return;
  const s = minVon(a.beginn), e = minVon(a.ende);
  if (s === null || e === null || e - s < 10) { toast('Der Abschnitt ist zu kurz zum Teilen.', 'err'); return; }
  let m = Math.round((s + e) / 2 / 15) * 15; if (m <= s || m >= e) m = Math.round((s + e) / 2 / 5) * 5;
  bedarfAendern('Bedarfsabschnitt geteilt', bid, bb => { const x = bb.abschnitte[i]; bb.abschnitte.splice(i + 1, 0, { beginn: zeitText(m), ende: x.ende, min: x.min, soll: x.soll, ausschlussPersonen: (x.ausschlussPersonen || []).slice(), ausschlussGruppen: (x.ausschlussGruppen || []).slice() }); x.ende = zeitText(m); });
}
function abschnittZusammen(bid, i) {
  bedarfAendern('Bedarfsabschnitte zusammengeführt', bid, b => {
    const a = b.abschnitte[i], n = b.abschnitte[i + 1]; if (!a || !n) return;
    a.ende = n.ende; a.min = Math.max(a.min, n.min); a.soll = Math.max(a.soll, n.soll); a.ausschlussPersonen = [...new Set((a.ausschlussPersonen || []).concat(n.ausschlussPersonen || []))]; a.ausschlussGruppen = [...new Set((a.ausschlussGruppen || []).concat(n.ausschlussGruppen || []))];
    b.abschnitte.splice(i + 1, 1);
  });
}
function abschnittNeu(bid) {
  bedarfAendern('Bedarfsabschnitt ergänzt', bid, b => {
    const l = b.abschnitte[b.abschnitte.length - 1];
    const s = l ? minVon(l.ende) : 7 * 60 + 30;
    b.abschnitte.push({ beginn: zeitText(s), ende: zeitText(Math.min(s + 30, 1439)), min: l ? l.min : 1, soll: l ? l.soll : 1, ausschlussPersonen: l ? (l.ausschlussPersonen || []).slice() : [], ausschlussGruppen: l ? (l.ausschlussGruppen || []).slice() : [] });
  });
}
// Treppe: steigend (1,2,3 … n) oder fallend (n … 1) in gleich langen Stufen; die erste bzw. letzte Stufe nimmt den Rest
function treppenAbschnitte(von, bis, n, form, schritt) {
  const s = minVon(von), e = minVon(bis);
  if (s === null || e === null || e <= s) return [];
  n = Math.max(1, n); schritt = Math.max(5, schritt || 15);
  if (form === 'konstant' || n === 1 || (n - 1) * schritt >= e - s) return [{ beginn: zeitText(s), ende: zeitText(e), min: n, soll: n }];
  const out = [];
  if (form === 'steigend') {
    for (let k = 1; k < n; k++) out.push({ beginn: zeitText(s + (k - 1) * schritt), ende: zeitText(s + k * schritt), min: k, soll: k });
    out.push({ beginn: zeitText(s + (n - 1) * schritt), ende: zeitText(e), min: n, soll: n });
  } else {
    const erst = e - (n - 1) * schritt;
    out.push({ beginn: zeitText(s), ende: zeitText(erst), min: n, soll: n });
    for (let k = n - 1; k >= 1; k--) out.push({ beginn: zeitText(erst + (n - 1 - k) * schritt), ende: zeitText(erst + (n - k) * schritt), min: k, soll: k });
  }
  return out;
}
async function bedarfNeuDialog(vorlage) {
  const d = APP.daten, st = DS();
  const tage = new Set(vorlage && vorlage.tage ? vorlage.tage : [st.bedarfTag >= 0 ? st.bedarfTag : 0]);
  const name = h('input', { type: 'text', value: (vorlage && vorlage.name) || '', placeholder: 'z. B. Frühstückspause, Frühaufsicht, Bistro', 'aria-label': 'Bezeichnung', style: { width: '250px' } });
  const ber = sel(bereichOpts('– ohne Bereich –'), (vorlage && vorlage.bereich) || '', () => { }, { 'aria-label': 'Bereich' });
  const von = h('input', { type: 'text', class: 'zeitfeld', value: (vorlage && vorlage.von) || '09:30', 'aria-label': 'Von', style: { width: '70px' } });
  const bis = h('input', { type: 'text', class: 'zeitfeld', value: (vorlage && vorlage.bis) || '10:00', 'aria-label': 'Bis', style: { width: '70px' } });
  const anz = h('input', { type: 'number', min: 1, max: 50, value: (vorlage && vorlage.anz) || 1, 'aria-label': 'Personen (höchstens)', style: { width: '60px' } });
  const form = sel([['konstant', 'gleichbleibend'], ['steigend', 'gestaffelt steigend (1, 2, 3 …)'], ['fallend', 'gestaffelt fallend (… 3, 2, 1)']], (vorlage && vorlage.form) || 'konstant', () => vorschau(), { 'aria-label': 'Verlauf' });
  const schritt = sel([['15', '15 min'], ['30', '30 min'], ['60', '60 min']], '15', () => vorschau(), { 'aria-label': 'Stufenlänge' });
  const arbeitszeit = h('input', { type: 'checkbox', checked: vorlage && vorlage.arbeitszeit === false ? false : true });
  const quali = h('input', { type: 'text', value: (vorlage && vorlage.qualifikation) || '', placeholder: 'optional, z. B. ersthelfer', style: { width: '190px' } });
  const box = h('div', { class: 'muted klein' });
  const vorschau = () => { const ab = treppenAbschnitte(zeitNorm(von.value), zeitNorm(bis.value), Number(anz.value) || 1, form.value, Number(schritt.value)); leeren(box).append(ab.length ? ab.map(a => a.beginn + '–' + a.ende + ': ' + a.min).join(' · ') : 'Bitte gültige Zeiten eingeben.'); };
  [von, bis, anz].forEach(x => x.addEventListener('input', vorschau)); vorschau();
  const inhalt = h('div', {},
    h('div', { class: 'zeile', style: { gap: '14px', alignItems: 'flex-end' } }, h('label', { class: 'feld' }, 'Bezeichnung', name), h('label', { class: 'feld' }, 'Bereich', ber)),
    h('div', { style: { marginTop: '10px' } }, h('div', { class: 'klein muted' }, 'Tage'), h('div', { class: 'zeile eng' }, d.schule.tage.map((t, i) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: tage.has(i), onchange: ev => { if (ev.target.checked) tage.add(i); else tage.delete(i); } }), t)))),
    h('div', { class: 'zeile', style: { gap: '14px', alignItems: 'flex-end', marginTop: '10px' } }, h('label', { class: 'feld' }, 'Von', von), h('label', { class: 'feld' }, 'Bis', bis), h('label', { class: 'feld' }, 'Personen', anz), h('label', { class: 'feld' }, 'Verlauf', form), h('label', { class: 'feld' }, 'Stufen', schritt)),
    h('div', { style: { marginTop: '8px' } }, box),
    h('h3', {}, 'Eigenschaften'),
    h('div', { class: 'zeile', style: { gap: '18px' } }, h('label', { class: 'check' }, arbeitszeit, 'zählt zur Arbeitszeit'), h('label', { class: 'feld' }, 'erforderliche Qualifikation', quali)),
    h('p', { class: 'muted klein' }, 'Es gibt nur Aufsichten. Früh-/Spätregeln werden anhand der tatsächlichen Uhrzeit erkannt. Ausschlüsse für einzelne Personen oder Personengruppen werden anschließend direkt je Zeitabschnitt gesetzt. Springer werden separat und vereinfacht je Pause eingestellt.'));
  const ok = await dialog({ titel: 'Neue Aufsicht', breite: '700px', inhalt, knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'Anlegen', wert: true, art: 'primaer' }] });
  if (!ok) return;
  const ab = treppenAbschnitte(zeitNorm(von.value), zeitNorm(bis.value), Number(anz.value) || 1, form.value, Number(schritt.value)).map(a => Object.assign(a, { ausschlussPersonen: [], ausschlussGruppen: [] }));
  if (!ab.length) { toast('Ungültige Zeiten – nichts angelegt.', 'err'); return; }
  if (!tage.size) { toast('Kein Tag gewählt – nichts angelegt.', 'err'); return; }
  const nm = name.value.trim() || 'Aufsicht';
  dienstAendern('Aufsicht angelegt', dd => { [...tage].sort().forEach(t => dd.dienste.bedarfe.push(nBedarf({ tag: t, typ: 'dt_dienst', bereich: ber.value || null, name: nm, arbeitszeit: arbeitszeit.checked, springer: false, qualifikation: quali.value.trim().toLowerCase(), abschnitte: ab }))); });
}
async function bedarfEigenschaftenDialog(bid) {
  const b = bedarfFinden(APP.daten, bid); if (!b) return;
  const az = h('input', { type: 'checkbox', checked: b.arbeitszeit !== false });
  const q = h('input', { type: 'text', value: b.qualifikation || '', placeholder: 'optional', style: { width: '190px' } });
  const ok = await dialog({ titel: 'Eigenschaften – ' + b.name, inhalt: h('div', {},
    h('p', { class: 'muted klein' }, 'Diese Eigenschaften gehören direkt zu dieser Aufsicht. Springer werden separat je Pause eingestellt.'),
    h('label', { class: 'check' }, az, 'zählt zur Arbeitszeit'),
    h('div', { style: { marginTop: '10px' } }, h('label', { class: 'feld' }, 'erforderliche Qualifikation', q))), knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'Übernehmen', wert: true, art: 'primaer' }] });
  if (!ok) return;
  bedarfAendern('Eigenschaften geändert', bid, x => { x.springer = false; x.arbeitszeit = az.checked; x.qualifikation = q.value.trim().toLowerCase().slice(0,40); });
}
async function abschnittAusschlussDialog(bid, i) {
  const b = bedarfFinden(APP.daten, bid), a = b && b.abschnitte[i]; if (!a) return;
  const personen = new Set(a.ausschlussPersonen || []), gruppen = new Set(a.ausschlussGruppen || []);
  const gl = dienstGruppenOptionen(APP.daten), pl = lehrerAlphabetisch(APP.daten.lehrer);
  const inhalt = h('div', {},
    h('p', {}, h('b', {}, b.name), ' · ', a.beginn, '–', a.ende),
    h('p', { class: 'muted klein' }, 'Markierte Personen bzw. Gruppen werden für genau diesen Zeitabschnitt bei der automatischen Planung hart ausgeschlossen. Ausschlüsse anderer Abschnitte bleiben unabhängig.'),
    h('h3', {}, 'Personengruppen'), h('div', { class: 'zeile', style: { alignItems: 'flex-start' } }, gl.map(([id,n]) => h('label', { class: 'check', style: { minWidth: '180px' } }, h('input', { type: 'checkbox', checked: gruppen.has(id), onchange: ev => ev.target.checked ? gruppen.add(id) : gruppen.delete(id) }), n))),
    h('h3', {}, 'Einzelpersonen'), h('div', { style: { maxHeight: '280px', overflow: 'auto', border: '1px solid var(--line)', borderRadius: '6px', padding: '6px 8px' } }, pl.map(l => h('label', { class: 'check', style: { display: 'flex', margin: '3px 0' } }, h('input', { type: 'checkbox', checked: personen.has(l.id), onchange: ev => ev.target.checked ? personen.add(l.id) : personen.delete(l.id) }), h('b', {}, l.kuerzel || '?'), ' ' + (l.name || ''), h('span', { class: 'muted klein' }, ' · ' + (l.art === 'personal' ? 'weiteres Personal' : l.ausgebildet === false ? 'Co-Kraft' : 'Lehrkraft'))))));
  const ok = await dialog({ titel: 'Ausschlüsse für ' + a.beginn + '–' + a.ende, breite: '680px', inhalt, knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'Übernehmen', wert: true, art: 'primaer' }] });
  if (!ok) return;
  bedarfAendern('Ausschlüsse geändert', bid, x => { const z = x.abschnitte[i]; z.ausschlussPersonen = [...personen]; z.ausschlussGruppen = [...gruppen]; });
}
// Aufsichten und Springer gelten für die Pausen des Zeitrasters – die durch Zeitprofile verschobenen Pausen einzelner Klassen erzeugen keinen
// eigenen Aufsichtsbedarf (wer dort länger Unterricht hat, übernimmt nur die Abschnitte danach)
function pausenEinmalig(d) {
  const gesehen = new Set();
  return pausenListe(d.schule).filter(x => {
    if (x.start === null || x.end === null || x.end <= x.start || gesehen.has(x.key)) return false;
    gesehen.add(x.key); return true;
  });
}
function pausenBereiche(d) {
  // Eine übernommene Pause wird für JEDEN vorhandenen Bereich angelegt. Ohne Bereiche bleibt sie bereichslos.
  return d.dienste.bereiche.length ? d.dienste.bereiche.map(b => b.id) : [null];
}
function pauseBedarfVorhanden(d, pa, tag, bereich) {
  return d.dienste.bedarfe.some(b => !b.springer && b.pauseKey === pa.key && b.tag === tag && (b.bereich || null) === (bereich || null));
}
function pausenAusZeitrasterFehlend(d) {
  return pausenEinmalig(d).filter(pa => pausenBereiche(d).some(ber => d.schule.tage.some((_, tag) => !pauseBedarfVorhanden(d, pa, tag, ber))));
}
function pauseBedarfeErgaenzen(dd, pa) {
  if (dd.dienste.bereiche.length) dd.dienste.bedarfe = dd.dienste.bedarfe.filter(b => b.springer || b.pauseKey !== pa.key || !!b.bereich);
  pausenBereiche(dd).forEach(ber => dd.schule.tage.forEach((_, tag) => {
    if (pauseBedarfVorhanden(dd, pa, tag, ber)) return;
    dd.dienste.bedarfe.push(nBedarf({ tag, typ: 'dt_dienst', bereich: ber || null, name: pa.eigenName || pa.kurz || 'Pause', pauseKey: pa.key, herkunft: 'pause', arbeitszeit: true, springer: false, abschnitte: [{ beginn: zeitText(pa.start), ende: zeitText(pa.end), min: 1, soll: 1, ausschlussPersonen: [], ausschlussGruppen: [] }] }));
  }));
}
function pauseAusZeitrasterAnlegen(pa) {
  if (!pa || pa.start === null || pa.end === null) return;
  dienstAendern('Pause als Aufsicht übernommen', dd => pauseBedarfeErgaenzen(dd, pa));
}
function allePausenAusZeitrasterAnlegen(pausen) {
  const q = (pausen || []).slice(); if (!q.length) return;
  dienstAendern('Pausen als Aufsichten übernommen', dd => q.forEach(pa => pauseBedarfeErgaenzen(dd, pa)));
}
// Springer werden bewusst einfacher als normale Aufsichten gepflegt: eine Zahl je Pause, pauschal an allen Schultagen.
function springerPauseBedarf(b) { return !!b && !!b.springer && !!b.pauseKey; }
function springerAnzahlPause(d, pa) {
  const b = d.dienste.bedarfe.find(x => springerPauseBedarf(x) && x.pauseKey === pa.key);
  return b && b.abschnitte.length ? Math.max(0, ...b.abschnitte.map(a => a.soll || a.min || 0)) : 0;
}
function springerPauseSetzen(pauseKey, wert) {
  const n = Math.max(0, Math.min(20, Math.round(Number(wert) || 0)));
  dienstAendern('Springerzahl geändert', dd => {
    const pa = pausenEinmalig(dd).find(x => x.key === pauseKey); if (!pa) return;
    dd.dienste.bedarfe = dd.dienste.bedarfe.filter(b => !(springerPauseBedarf(b) && b.pauseKey === pauseKey));
    if (!n) return;
    dd.schule.tage.forEach((_, tag) => dd.dienste.bedarfe.push(nBedarf({ tag, typ: 'dt_springer', bereich: null, name: 'Springer – ' + (pa.eigenName || pa.kurz || 'Pause'), pauseKey, herkunft: 'springer-pause', arbeitszeit: false, springer: true, abschnitte: [{ beginn: zeitText(pa.start), ende: zeitText(pa.end), min: n, soll: n, ausschlussPersonen: [], ausschlussGruppen: [] }] })));
  });
}
// Bedarf auf andere Tage übertragen (gleichartige Bedarfe dort wahlweise ersetzen)
async function bedarfUebertragen(bids, titel) {
  const d = APP.daten, quelle = d.dienste.bedarfe.filter(b => bids.includes(b.id));
  if (!quelle.length) return;
  const qt = new Set(quelle.map(b => b.tag));
  const ziel = new Set(d.schule.tage.map((_, i) => i).filter(i => !qt.has(i)));
  const ers = h('input', { type: 'checkbox', checked: true });
  const ok = await dialog({ titel: titel || 'Auf andere Tage übertragen', inhalt: h('div', {},
    h('p', { class: 'muted klein' }, quelle.length + ' Bedarf(e) von ' + [...qt].map(tagKurz).join(', ') + ' übertragen auf:'),
    h('div', { class: 'zeile eng' }, d.schule.tage.map((t, i) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: ziel.has(i), disabled: qt.has(i), onchange: ev => { if (ev.target.checked) ziel.add(i); else ziel.delete(i); } }), t))),
    h('label', { class: 'check', style: { marginTop: '8px' } }, ers, 'Vorhandene gleich benannte Bedarfe im selben Bereich an den Zieltagen ersetzen')),
    knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'Übertragen', wert: true, art: 'primaer' }] });
  if (!ok || !ziel.size) return;
  dienstAendern('Bedarf übertragen', dd => {
    ziel.forEach(t => {
      if (ers.checked) dd.dienste.bedarfe = dd.dienste.bedarfe.filter(b => !(b.tag === t && quelle.some(q => (q.name || '') === (b.name || '') && (q.bereich || null) === (b.bereich || null) && (q.pauseKey || '') === (b.pauseKey || ''))));
      quelle.forEach(q => dd.dienste.bedarfe.push(nBedarf(Object.assign(JSON.parse(JSON.stringify(q)), { id: null, tag: t }))));
    });
  });
}
async function tagKopierenDialog() {
  const d = APP.daten;
  const von = sel(d.schule.tage.map((t, i) => [String(i), TAGE_LANG[t]]), String(Math.max(0, DS().bedarfTag)), () => { }, { 'aria-label': 'Von Tag' });
  const ok = await dialog({ titel: 'Ganzen Tag kopieren', inhalt: h('div', {}, h('label', { class: 'feld' }, 'Alle Bedarfe von', von)), knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'Weiter', wert: true, art: 'primaer' }] });
  if (!ok) return;
  const t = Number(von.value);
  const ids = d.dienste.bedarfe.filter(b => b.tag === t).map(b => b.id);
  if (!ids.length) { toast(TAGE_LANG[d.schule.tage[t]] + ' hat keinen Bedarf.', 'err'); return; }
  bedarfUebertragen(ids, 'Bedarfe von ' + TAGE_LANG[d.schule.tage[t]] + ' kopieren');
}
async function montagAufWoche() {
  const d = APP.daten, ids = d.dienste.bedarfe.filter(b => b.tag === 0).map(b => b.id);
  if (!ids.length) { toast('Montag hat noch keinen Bedarf.', 'err'); return; }
  if (!(await bestaetigen('Alle Bedarfe vom Montag auf ' + d.schule.tage.slice(1).join(', ') + ' übernehmen? Gleich benannte Bedarfe im selben Bereich werden an den Zieltagen ersetzt.', 'Übernehmen'))) return;
  const q = d.dienste.bedarfe.filter(b => b.tag === 0);
  dienstAendern('Montag auf die Woche übertragen', dd => {
    for (let t = 1; t < dd.schule.tage.length; t++) {
      dd.dienste.bedarfe = dd.dienste.bedarfe.filter(b => !(b.tag === t && q.some(x => (x.name || '') === (b.name || '') && (x.bereich || null) === (b.bereich || null) && (x.pauseKey || '') === (b.pauseKey || ''))));
      q.forEach(x => dd.dienste.bedarfe.push(nBedarf(Object.assign(JSON.parse(JSON.stringify(x)), { id: null, tag: t }))));
    }
  });
}
// Grafik: Bedarfskurve (Soll als Fläche, Minimum als Linie, Besetzung als Punkte; Unterdeckung rot)
function bedarfGrafik(b, bes) {
  const ivs = b.abschnitte.map(a => intervall(a.beginn, a.ende)).filter(iv => iv && iv.end > iv.start);
  if (!ivs.length) return h('div', { class: 'muted klein' }, 'Keine gültigen Abschnitte.');
  const s = Math.min(...ivs.map(x => x.start)), e = Math.max(...ivs.map(x => x.end)), span = Math.max(15, e - s);
  const mx = Math.max(1, ...b.abschnitte.map(a => Math.max(a.soll, a.min)), ...bes.map(x => x.ist));
  const W = 100 / span;
  return h('div', { class: 'bedarfgrafik', role: 'img', 'aria-label': 'Bedarfskurve ' + b.abschnitte.map(a => a.beginn + '–' + a.ende + ' ' + a.soll).join(', ') },
    b.abschnitte.map((a, i) => {
      const iv = intervall(a.beginn, a.ende); if (!iv || iv.end <= iv.start) return null;
      const x = bes[i] || {};
      return h('div', { class: 'bg-seg ' + (x.status || ''), style: { left: ((iv.start - s) * W) + '%', width: ((iv.end - iv.start) * W) + '%' }, title: a.beginn + '–' + a.ende + ': Soll ' + a.soll + ', Minimum ' + a.min + ', eingeteilt ' + (x.ist === undefined ? '?' : x.ist) },
        h('div', { class: 'bg-soll', style: { height: (a.soll / mx * 100) + '%' } }),
        h('div', { class: 'bg-min', style: { bottom: (a.min / mx * 100) + '%' } }),
        x.ist !== undefined ? h('div', { class: 'bg-ist', style: { height: (Math.min(x.ist, mx) / mx * 100) + '%' } }) : null,
        h('span', { class: 'bg-zahl' }, x.ist !== undefined && x.ist !== a.soll ? x.ist + '/' + a.soll : String(a.soll)));
    }),
    h('span', { class: 'bg-achse l' }, zeitText(s)), h('span', { class: 'bg-achse r' }, zeitText(e)));
}
function bedarfDetailKarte(d, b) {
    const bes = besetzungBedarf(d, b), eig = [b.pauseKey ? 'Pause' : null, b.arbeitszeit === false ? 'arbeitszeitneutral' : null, b.qualifikation ? 'Qualifikation: ' + b.qualifikation : null].filter(Boolean);
    const zeilen = b.abschnitte.map((a, i) => {
      const x = bes[i] || { ist: 0, status: 'err' };
      const zf = feld => h('input', { type: 'text', class: 'zeitfeld', value: a[feld], style: { width: '68px' }, onchange: ev => abschnittZeit(b.id, i, feld, ev.target.value) });
      const nf = feld => h('input', { type: 'number', min: 0, max: 50, value: a[feld], style: { width: '58px' }, onchange: ev => abschnittZahl(b.id, i, feld, ev.target.value) });
      const an = (a.ausschlussPersonen || []).length + (a.ausschlussGruppen || []).length;
      return h('tr', { 'data-id': b.id + ':' + i }, h('td', {}, zf('beginn')), h('td', {}, zf('ende')), h('td', { class: 'zahl' }, nf('min')), h('td', { class: 'zahl' }, nf('soll')),
        h('td', {}, h('button', { class: 'btn klein' + (an ? ' aktiv' : ''), title: an ? 'Ausschlüsse bearbeiten' : 'Personen oder Personengruppen für genau diesen Abschnitt ausschließen', onclick: () => abschnittAusschlussDialog(b.id, i) }, an ? an + ' Ausschluss' + (an === 1 ? '' : 'regeln') : '+ Ausschlüsse')),
        h('td', { class: 'zahl' }, h('span', { class: 'badge ' + (x.status === 'ok' ? 'ok' : x.status === 'warn' ? 'warn' : 'err') }, x.ist + ' / ' + a.soll + ' ' + (x.status === 'ok' ? '✓' : x.status === 'warn' ? '~' : '✕'))),
        h('td', { class: 'aktion' }, h('button', { class: 'btn icon klein', title: 'Zeitraum teilen', onclick: () => abschnittTeilen(b.id, i) }, icon('schere')), i < b.abschnitte.length - 1 ? h('button', { class: 'btn icon klein', title: 'Mit folgendem Abschnitt zusammenführen', onclick: () => abschnittZusammen(b.id, i) }, icon('zusammen')) : null, h('button', { class: 'btn icon klein gefahr', title: 'Abschnitt löschen', onclick: () => undoToastNach(() => bedarfAendern('Bedarfsabschnitt gelöscht', b.id, bb => bb.abschnitte.splice(i, 1)), 'Zeitabschnitt gelöscht.') }, icon('papierkorb'))));
    });
    return h('div', { class: 'karte bedarfdetail', 'data-id': b.id, id: 'bedarfDetail' },
      h('div', { class: 'bd-kopf' }, h('span', { class: 'eyebrow' }, 'Bearbeiten · ' + tagLang(b.tag)), h('div', { class: 'rechts' }), bedarfNachbarn(d, b)),
      h('div', { class: 'zeile', style: { alignItems: 'flex-end' } },
        h('label', { class: 'feld' }, 'Tag', sel(d.schule.tage.map((x, i) => [String(i), x]), String(b.tag), v => bedarfAendern('Aufsicht verschoben', b.id, bb => { bb.tag = Number(v); }), { 'aria-label': 'Tag' })),
        h('label', { class: 'feld', style: { flex: '1 1 220px' } }, 'Bezeichnung', h('input', { type: 'text', value: b.name || '', placeholder: 'Bezeichnung', style: { width: '100%' }, onchange: ev => bedarfAendern('Aufsicht umbenannt', b.id, bb => { bb.name = ev.target.value.trim() || 'Aufsicht'; }) })),
        h('label', { class: 'feld' }, 'Bereich', sel(bereichOpts('– ohne Bereich –'), b.bereich || '', v => bedarfAendern('Bereich geändert', b.id, bb => { bb.bereich = v || null; }))),
        h('button', { class: 'btn klein', onclick: () => bedarfEigenschaftenDialog(b.id) }, 'Eigenschaften'),
        h('button', { class: 'btn klein', onclick: () => abschnittNeu(b.id) }, '+ Zeitabschnitt'),
        h('button', { class: 'btn icon klein', title: 'Duplizieren', onclick: () => dienstAendern('Aufsicht dupliziert', dd => { const x = bedarfFinden(dd, b.id); dd.dienste.bedarfe.push(nBedarf(Object.assign(JSON.parse(JSON.stringify(x)), { id: null, pauseKey: '' }))); }) }, icon('kopieren')),
        h('button', { class: 'btn icon klein', title: 'Auf andere Tage übertragen', onclick: () => bedarfUebertragen([b.id]) }, icon('pfeil-rechts')),
        h('button', { class: 'btn icon klein gefahr', title: 'Löschen', onclick: () => undoToastNach(() => dienstAendern('Aufsicht gelöscht', dd => { dd.dienste.bedarfe = dd.dienste.bedarfe.filter(x => x.id !== b.id); dd.dienste.plan = dd.dienste.plan.filter(x => x.bedarf !== b.id); }), 'Aufsicht „' + (b.name || 'ohne Namen') + '“ gelöscht.') }, icon('papierkorb'))),
      eig.length ? h('div', { class: 'zeile', style: { marginTop: '7px' } }, eig.map(x => h('span', { class: 'badge neutral' }, x))) : null,
      b.abschnitte.length ? h('div', { class: 'tabwrap', style: { marginTop: '9px' } }, h('table', { class: 'tab' }, h('thead', {}, h('tr', {}, ['Von', 'Bis', 'Minimum', 'Soll', 'Ausschlüsse', 'Besetzt', ''].map((t,i) => h('th', { class: i === 2 || i === 3 || i === 5 ? 'zahl' : '' }, t)))), h('tbody', {}, zeilen))) : h('p', { class: 'muted' }, 'Noch kein Zeitabschnitt.'),
      b.abschnitte.length ? bedarfGrafik(b, bes) : null);
}

// Zeilen der Wochenübersicht: eine Zeile je Aufsicht (Bezeichnung + Pause) und Bereich, eine Spalte je Tag
function bedarfZeilen(d) {
  const normale = d.dienste.bedarfe.filter(b => !springerPauseBedarf(b));
  const beginnVon = b => { const v = minVon((b.abschnitte[0] || {}).beginn); return v === null ? 9999 : v; };
  const gruppen = new Map();
  normale.forEach(b => {
    const gk = (b.name || 'Aufsicht') + '|' + (b.pauseKey || '');
    if (!gruppen.has(gk)) gruppen.set(gk, { key: gk, name: b.name || 'Aufsicht', pause: !!b.pauseKey, zeilen: new Map(), beginn: 9999 });
    const g = gruppen.get(gk), zk = b.bereich || '';
    if (!g.zeilen.has(zk)) g.zeilen.set(zk, { bereich: b.bereich || null, tage: new Map(), alle: [] });
    const z = g.zeilen.get(zk);
    if (!z.tage.has(b.tag)) z.tage.set(b.tag, []);
    z.tage.get(b.tag).push(b); z.alle.push(b);
    g.beginn = Math.min(g.beginn, beginnVon(b));
  });
  const bName = id => { const r = dBereich(id); return r ? r.name : ''; };
  return [...gruppen.values()].sort((a, b) => a.beginn - b.beginn || a.name.localeCompare(b.name)).map(g => {
    const zeilen = [...g.zeilen.values()].sort((a, b) => bName(a.bereich).localeCompare(bName(b.bereich)));
    // Zeitraum der Gruppe: gleich an allen Tagen oder „unterschiedlich“
    const spannen = new Set(zeilen.flatMap(z => z.alle.map(b => (b.abschnitte[0] || {}).beginn + '–' + (b.abschnitte[b.abschnitte.length - 1] || {}).ende)));
    return Object.assign(g, { zeilen, zeit: spannen.size === 1 ? [...spannen][0] : 'unterschiedlich', zeiten: [...spannen] });
  });
}
// Vorige/nächste Aufsicht derselben Zeile (anderer Tag) – Blättern in der Detailansicht
function bedarfNachbarn(d, b) {
  const zeile = bedarfZeilen(d).flatMap(g => g.zeilen).find(z => z.alle.some(x => x.id === b.id)); if (!zeile) return null;
  const liste = zeile.alle.slice().sort((x, y) => x.tag - y.tag), i = liste.findIndex(x => x.id === b.id);
  const geh = x => { DS().bedarfSel = x.id; DS().bedarfTag = x.tag; render(); requestAnimationFrame(() => { const el = document.getElementById('bedarfDetail'); if (el) el.focus({ preventScroll: true }); }); };
  return h('span', { class: 'zeile eng' },
    h('button', { class: 'btn icon klein', type: 'button', title: 'Gleiche Aufsicht am Vortag', 'aria-label': 'Gleiche Aufsicht am Vortag', disabled: i <= 0, onclick: () => geh(liste[i - 1]) }, icon('links')),
    h('span', { class: 'muted klein' }, (i + 1) + ' von ' + liste.length + ' Tagen'),
    h('button', { class: 'btn icon klein', type: 'button', title: 'Gleiche Aufsicht am Folgetag', 'aria-label': 'Gleiche Aufsicht am Folgetag', disabled: i >= liste.length - 1, onclick: () => geh(liste[i + 1]) }, icon('rechts')));
}
// Kleine Treppe einer Aufsicht für die Übersicht: Breite = Dauer, Höhe = Soll, Farbe = Besetzung (ohne Aufsichtsplan neutral)
function bedarfMiniTreppe(b, bes, mitPlan, mx) {
  const ivs = b.abschnitte.map(a => intervall(a.beginn, a.ende)).filter(iv => iv && iv.end > iv.start);
  if (!ivs.length) return h('span', { class: 'mt leer' });
  const s = Math.min(...ivs.map(x => x.start)), e = Math.max(...ivs.map(x => x.end)), span = Math.max(1, e - s);
  return h('span', { class: 'mt', 'aria-hidden': 'true' }, b.abschnitte.map((a, i) => { const iv = intervall(a.beginn, a.ende); if (!iv || iv.end <= iv.start) return null; const x = bes[i] || {};
    return h('span', { class: 'mt-s ' + (mitPlan ? (x.status || 'err') : 'neutral'), style: { width: ((iv.end - iv.start) / span * 100) + '%', height: Math.max(18, a.soll / Math.max(1, mx) * 100) + '%' } }); }));
}
function dienstBedarfTab() {
  const d = APP.daten, DI = d.dienste, st = DS();
  const normale = DI.bedarfe.filter(b => !springerPauseBedarf(b));
  const T = d.schule.tage.length;
  const leiste = h('div', { class: 'zeile', style: { gap: '8px', marginBottom: '10px' } },
    h('span', { class: 'muted klein' }, 'Eine Zeile je Aufsicht und Bereich, eine Spalte je Tag. Ein Klick auf ein Feld öffnet die Aufsicht zum Bearbeiten.'),
    h('div', { class: 'rechts' }),
    h('button', { class: 'btn', onclick: montagAufWoche, disabled: !normale.some(b => b.tag === 0), title: 'Alle Aufsichten vom Montag auf die übrigen Tage übernehmen' }, 'Mo → Di–Fr'),
    h('button', { class: 'btn', onclick: tagKopierenDialog, disabled: !normale.length }, 'Ganzen Tag kopieren …'),
    h('button', { class: 'btn primaer', onclick: () => bedarfNeuDialog() }, '+ Aufsicht'));

  // Pausen aus dem Zeitraster und Springer: kompakt in einer Karte, aufklappbar
  const fehlP = pausenAusZeitrasterFehlend(d), pausen = pausenEinmalig(d);
  const berText = DI.bereiche.length ? DI.bereiche.map(b => b.name).join(', ') : 'ohne eigenen Bereich';
  const nSpringer = pausen.reduce((a, pa) => a + springerAnzahlPause(d, pa), 0);
  const vorbereitung = h('details', { class: 'karte bedarfvorbereitung', open: st.bedarfVorbOffen ? true : null, ontoggle: ev => { st.bedarfVorbOffen = ev.target.open; } },
    h('summary', {}, h('b', {}, 'Pausen aus dem Zeitraster und Springer'), ' ',
      fehlP.length ? h('span', { class: 'badge warn' }, fehlP.length === 1 ? '1 Pause noch nicht übernommen' : fehlP.length + ' Pausen noch nicht übernommen') : h('span', { class: 'badge ok' }, 'alle Pausen übernommen'),
      ' ', h('span', { class: 'badge neutral' }, nSpringer ? nSpringer + ' Springer je Tag' : 'keine Springer')),
    h('div', { class: 'bv-raster' },
      h('div', {},
        h('h3', {}, 'Pausen übernehmen', hilfe('Beim Übernehmen wird jede Pause für jeden vorhandenen Bereich angelegt (aktuell: ' + berText + '). Bei den Bereichen „Allgemein“ und „Bistro“ entstehen für die 1. Pause also zwei getrennte Aufsichten.')),
        fehlP.length ? h('div', { class: 'zeile' }, fehlP.map(pa => h('button', { class: 'btn klein', onclick: () => pauseAusZeitrasterAnlegen(pa), title: pa.zeit + ' für alle Bereiche und alle Schultage übernehmen' }, '+ ', pa.eigenName || pa.kurz || 'Pause', ' ', h('span', { class: 'muted' }, pa.zeit))),
          fehlP.length > 1 ? h('button', { class: 'btn klein primaer', onclick: () => allePausenAusZeitrasterAnlegen(fehlP) }, 'Alle übernehmen') : null) : h('p', { class: 'muted klein' }, 'Alle Pausen sind für alle Bereiche übernommen.')),
      h('div', {},
        h('h3', {}, 'Springer je Pause', hilfe('Springer werden pauschal für die gesamte Pause eingeplant und gelten an allen Schultagen. Springer sind arbeitszeitneutral, blockieren die Person aber zeitlich.')),
        pausen.length ? h('div', { class: 'zeile', style: { gap: '6px 14px' } }, pausen.map(pa => h('label', { class: 'zeile eng springerfeld' }, h('span', {}, pa.eigenName || pa.kurz || 'Pause', ' ', h('span', { class: 'muted klein' }, pa.zeit || (zeitText(pa.start) + '–' + zeitText(pa.end)))),
          h('input', { type: 'number', min: 0, max: 20, step: 1, value: springerAnzahlPause(d, pa), style: { width: '60px' }, 'aria-label': 'Springer ' + (pa.eigenName || pa.kurz || 'Pause'), onchange: ev => springerPauseSetzen(pa.key, ev.target.value) })))) : h('p', { class: 'muted' }, 'Im Zeitraster sind noch keine Pausen vorhanden.'))));

  if (!normale.length) return [leiste, vorbereitung, h('div', { class: 'karte' }, leerZustand({ icon: 'auge', titel: 'Noch keine Aufsicht angelegt', text: 'Die Pausen des Zeitrasters lassen sich oben mit einem Klick übernehmen. Freie Aufsichten – Frühaufsicht, Bistro, Betreuung – bekommen eine eigene Bezeichnung und Uhrzeit.', aktion: { text: '+ Erste Aufsicht anlegen', tun: () => bedarfNeuDialog() } }))];

  const gruppen = bedarfZeilen(d), mitPlan = DI.plan.length > 0;
  if (!st.bedarfSel || !normale.some(b => b.id === st.bedarfSel)) { const erst = gruppen[0] && gruppen[0].zeilen[0] && gruppen[0].zeilen[0].alle.slice().sort((x, y) => x.tag - y.tag)[0]; st.bedarfSel = erst ? erst.id : null; }
  const sel0 = normale.find(b => b.id === st.bedarfSel) || null;
  const waehle = (b, fokus) => { st.bedarfSel = b.id; st.bedarfTag = b.tag; render(); requestAnimationFrame(() => { const el = document.getElementById('bedarfDetail'); if (!el) return; if (el.getBoundingClientRect().top > innerHeight - 120 || el.getBoundingClientRect().bottom < 80) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); if (fokus) el.focus({ preventScroll: true }); }); };
  const neuAmTag = (zeile, tag) => { const vorlage = zeile.alle.slice().sort((x, y) => Math.abs(x.tag - tag) - Math.abs(y.tag - tag))[0]; let neuId = null;
    dienstAendern('Aufsicht für ' + tagLang(tag) + ' angelegt', dd => { const x = bedarfFinden(dd, vorlage.id); if (!x) return; const n = nBedarf(Object.assign(JSON.parse(JSON.stringify(x)), { id: null, tag })); neuId = n.id; dd.dienste.bedarfe.push(n); });
    if (neuId) { st.bedarfSel = neuId; st.bedarfTag = tag; render(); } };
  const zelle = (zeile, tag, mx) => {
    const bs = zeile.tage.get(tag) || [];
    if (!bs.length) return h('td', { class: 'bm-zelle leer' }, h('button', { class: 'bm-neu', type: 'button', title: 'Diese Aufsicht auch am ' + tagLang(tag) + ' anlegen (wie an einem anderen Tag)', 'aria-label': 'Aufsicht am ' + tagLang(tag) + ' anlegen', onclick: () => neuAmTag(zeile, tag) }, icon('plus', 'k')));
    return h('td', { class: 'bm-zelle' }, bs.map(b => {
      const bes = besetzungBedarf(d, b), schlecht = bes.some(x => x.status === 'err') ? 'err' : bes.some(x => x.status === 'warn') ? 'warn' : 'ok';
      // kurz: ein Abschnitt „2–3“ (Minimum–Soll), mehrere Abschnitte die Sollzahlen „1·2·3“ (bei mehr als drei: erster…letzter)
      const sollT = b.abschnitte.length === 1 ? (b.abschnitte[0].min === b.abschnitte[0].soll ? String(b.abschnitte[0].soll) : b.abschnitte[0].min + '–' + b.abschnitte[0].soll) : b.abschnitte.length <= 3 ? b.abschnitte.map(a => a.soll).join('·') : b.abschnitte[0].soll + '…' + b.abschnitte[b.abschnitte.length - 1].soll;
      const fehlt = bes.length ? Math.max(...bes.map(x => schlecht === 'err' ? x.fehltMin : x.fehltSoll)) : 0;
      const aus = b.abschnitte.reduce((n, a) => n + (a.ausschlussPersonen || []).length + (a.ausschlussGruppen || []).length, 0);
      const titel = tagLang(tag) + ' · ' + (b.name || 'Aufsicht') + (dBereich(b.bereich) ? ' · ' + dBereich(b.bereich).name : '') + '\n' + b.abschnitte.map((a, i) => a.beginn + '–' + a.ende + ': Minimum ' + a.min + ', Soll ' + a.soll + (mitPlan ? ', eingeteilt ' + ((bes[i] || {}).ist ?? 0) : '')).join('\n') + (aus ? '\n' + aus + ' Ausschlussregel(n)' : '') + (b.arbeitszeit === false ? '\narbeitszeitneutral' : '') + (b.qualifikation ? '\nQualifikation: ' + b.qualifikation : '');
      return h('button', { class: 'bm-feld' + (b.id === st.bedarfSel ? ' gewaehlt' : '') + (mitPlan ? ' ' + schlecht : ''), type: 'button', 'data-id': b.id, title: titel, 'aria-label': titel.replace(/\n/g, ', '), 'aria-pressed': b.id === st.bedarfSel ? 'true' : 'false', onclick: () => waehle(b, true) },
        bedarfMiniTreppe(b, bes, mitPlan, mx),
        h('span', { class: 'bm-text' }, h('span', { class: 'bm-soll' }, sollT), mitPlan ? h('span', { class: 'bm-ist' }, schlecht === 'ok' ? '✓' : '−' + fehlt) : null,
          aus ? h('span', { class: 'bm-marke', title: aus + ' Ausschlussregel(n)' }, '⊘') : null));
    }));
  };
  const kopf = h('tr', {}, h('th', { class: 'bm-name' }, 'Aufsicht'), h('th', { class: 'bm-bereich' }, 'Bereich'),
    d.schule.tage.map((t, i) => h('th', { class: 'bm-tag' + (st.bedarfTag === i ? ' aktiv' : '') }, h('button', { type: 'button', class: 'bm-tagknopf', title: TAGE_LANG[t] + ' als Tag für neue Aufsichten und zum Kopieren wählen', 'aria-pressed': st.bedarfTag === i ? 'true' : 'false', onclick: () => { st.bedarfTag = st.bedarfTag === i ? -1 : i; render(); } }, t))));
  const koerper = gruppen.map(g => {
    const mx = Math.max(1, ...g.zeilen.flatMap(z => z.alle.flatMap(b => b.abschnitte.map(a => a.soll))));
    return h('tbody', { class: 'bm-gruppe', 'data-gruppe': g.key }, g.zeilen.map((z, zi) => {
      const ber = dBereich(z.bereich);
      return h('tr', { class: zi === 0 ? 'erste' : '' },
        zi === 0 ? h('th', { class: 'bm-name', rowspan: g.zeilen.length > 1 ? g.zeilen.length : null, scope: 'rowgroup' }, h('b', {}, g.name), h('div', { class: 'muted klein' }, g.zeit === 'unterschiedlich' ? 'Zeiten je Tag verschieden' : g.zeit, g.pause ? ' · Pause' : '')) : null,
        h('td', { class: 'bm-bereich' }, ber ? h('span', { class: 'bm-ber' }, h('span', { class: 'bm-punkt', style: { background: bereichFarbe(ber.id) } }), ber.name) : h('span', { class: 'muted klein' }, 'ohne Bereich')),
        d.schule.tage.map((_, t) => zelle(z, t, mx)));
    }));
  });
  const matrix = h('div', { class: 'karte bedarfmatrix-karte' },
    h('div', { class: 'zeile', style: { marginBottom: '8px' } }, h('h2', { style: { margin: 0 } }, 'Wochenübersicht'), h('span', { class: 'muted klein' }, normale.length + ' Aufsichten in ' + gruppen.length + (gruppen.length === 1 ? ' Zeile' : ' Zeilengruppen')), h('div', { class: 'rechts' }),
      mitPlan ? h('span', { class: 'bm-legende klein' }, h('span', { class: 'bm-l ok' }), 'besetzt', h('span', { class: 'bm-l warn' }), 'unter Soll', h('span', { class: 'bm-l err' }), 'unter Minimum') : h('span', { class: 'muted klein' }, 'Noch kein Aufsichtsplan – die Felder zeigen nur den Bedarf.')),
    h('div', { class: 'tabwrap' }, h('table', { class: 'bedarfmatrix' }, h('thead', {}, kopf), koerper)),
    h('p', { class: 'muted klein', style: { margin: '8px 0 0' } }, 'Zahlen im Feld: Personen je Zeitabschnitt (Minimum–Soll bzw. die Sollzahlen der Abschnitte). Mit Aufsichtsplan: ✓ = besetzt, −1 = eine Person fehlt (bis Minimum rot, bis Soll gelb). ⊘ = Ausschlussregeln. „+“ legt die Aufsicht an einem weiteren Tag an. Details zeigt der Hinweis beim Darüberfahren.'));
  const detail = sel0 ? bedarfDetailKarte(d, sel0) : h('div', { class: 'karte' }, h('p', { class: 'muted' }, 'Ein Feld der Wochenübersicht wählen.'));
  detail.setAttribute('tabindex', '-1');
  return [leiste, vorbereitung, h('div', { class: 'bedarflayout' }, matrix, h('div', { class: 'bedarfseite' }, detail)),
    h('p', { class: 'muted klein' }, 'Grundmodell: eine benannte Aufsicht → beliebig viele minutengenaue Zeitabschnitte. Minimum ist hart, Soll ist das Planungsziel. Ausschlüsse gelten abschnittsgenau für einzelne Personen oder Personengruppen.')];
}
// Farbe eines Aufsichtsbereichs: fest aus einer kleinen Palette, damit gleiche Bereiche überall gleich aussehen
function bereichFarbe(id) { const p = ['#3b7dd8', '#d9822b', '#2f9e6e', '#8e5bd1', '#c94b6d', '#1f9bb5', '#b08a2e', '#6b7a8f']; const i = APP.daten.dienste.bereiche.findIndex(b => b.id === id); return i < 0 ? '#9aa9c2' : p[i % p.length]; }
/* ---------------- Reiter „Bereiche“ ---------------- */
function dienstBereicheTab() {
  const d = APP.daten, DI = d.dienste;
  const bereiche = h('div', { class: 'karte' },
    h('div', { class: 'zeile' }, h('h2', { style: { margin: 0 } }, 'Bereiche'), h('div', { class: 'rechts' }),
      h('button', { class: 'btn primaer', onclick: () => dienstAendern('Bereich angelegt', dd => { dd.dienste.bereiche.push({ id: neueId('a'), name: 'Bereich ' + (dd.dienste.bereiche.length + 1), exklusiv: false }); }) }, '+ Bereich')),
    h('p', { class: 'muted klein' }, 'Bereiche sind Orte oder Zuständigkeiten, z. B. Allgemein, Schulhof oder Bistro. Beim Übernehmen von Pausen wird jede Pause automatisch für jeden hier angelegten Bereich erzeugt. „Exklusiv“ bedeutet: Dort kann zur selben Zeit höchstens eine Person eingeplant werden.'),
    DI.bereiche.length ? h('div', { class: 'zeile', style: { gap: '10px' } }, DI.bereiche.map(b => h('span', { class: 'zeile eng bereichchip', 'data-id': b.id },
      h('input', { type: 'text', value: b.name, style: { width: '140px' }, 'aria-label': 'Name des Bereichs', onchange: ev => { const v = ev.target.value.trim(); if (v) dienstAendern('Bereich umbenannt', dd => { const x = dd.dienste.bereiche.find(y => y.id === b.id); if (x) x.name = v.slice(0, 60); }); } }),
      h('label', { class: 'check klein' }, h('input', { type: 'checkbox', checked: b.exklusiv, onchange: ev => dienstAendern('Bereich exklusiv', dd => { const x = dd.dienste.bereiche.find(y => y.id === b.id); if (x) x.exklusiv = ev.target.checked; }) }), 'exklusiv'),
      h('button', { class: 'btn icon klein gefahr', title: 'Löschen', onclick: async () => { const n = DI.plan.filter(x => x.bereich === b.id).length + DI.bedarfe.filter(x => x.bereich === b.id).length; if (n && !(await bestaetigen('Bereich „' + b.name + '“ wird in ' + n + ' Einsätzen/Bedarfen verwendet; dort wird der Bereich entfernt.', 'Löschen', 'gefahr'))) return; undoToastNach(() => dienstAendern('Bereich gelöscht', dd => { const D2 = dd.dienste; D2.bereiche = D2.bereiche.filter(x => x.id !== b.id); [D2.plan, D2.bedarfe, D2.offen].forEach(l => l.forEach(x => { if (x.bereich === b.id) x.bereich = null; })); }), 'Bereich „' + b.name + '“ gelöscht.'); } }, icon('papierkorb'))))) : h('p', { class: 'muted' }, 'Noch keine Bereiche.'));
  return [bereiche, h('div', { class: 'karte zeile' }, h('span', { class: 'muted' }, 'Früh-/Spätregeln werden aus den tatsächlichen Uhrzeiten abgeleitet. Weitere Planungsgewichte stehen bei den Regeln.'), h('div', { class: 'rechts' }), h('button', { class: 'btn', onclick: () => gehe('regeln', { reiter: 'dienste' }) }, 'Regeln & Gewichte'))];
}
// Einstellungen und Gewichte der Aufsichten (Seite „Regeln & Gewichte“, Reiter „Aufsichten“)
function dienstRegelnKarte() {
  const R = APP.daten.dienste.regeln;
  const zf = (k, t, hilfeText) => h('label', { class: 'feld' }, h('span', {}, t, hilfeText ? hilfe(hilfeText) : null), h('input', { type: 'text', class: 'zeitfeld', value: R[k], style: { width: '70px' }, 'aria-label': t, onchange: ev => { const z = zeitNorm(ev.target.value); if (!z) { toast('Bitte eine Uhrzeit wie 07:00 eingeben.', 'err'); render(); return; } dienstAendern(t + ' ' + z, dd => { dd.dienste.regeln[k] = z; }); } }));
  return h('div', { class: 'karte regelthema ohnezahl' }, h('h2', {}, icon('auge'), 'Aufsichten: Einstellungen und Regeln'),
    h('div', { class: 'zeile', style: { gap: '16px', alignItems: 'flex-end' } },
      zf('fruehGrenze', 'sehr früh vor', 'Frühaufsichten, die davor beginnen, zählen als „sehr früh“ und werden stärker gewichtet.'),
      zf('spaetGrenze', 'sehr spät nach', 'Aufsichten, die danach enden, zählen als „sehr spät“ und werden stärker gewichtet.'),
      h('label', { class: 'feld' }, h('span', {}, 'lange Anwesenheit ab', hilfe('Anwesenheitsspanne (erster bis letzter Einsatz), ab der ein Tag als „extrem lang“ gilt.')), h('span', { class: 'zeile eng nowrap' }, h('input', { type: 'number', min: 1, max: 24, step: 0.5, value: R.maxSpanne / 60, style: { width: '64px' }, 'aria-label': 'lange Anwesenheit ab h', onchange: ev => dienstAendern('Grenze Anwesenheit', dd => { dd.dienste.regeln.maxSpanne = Math.round(_clamp(Number(String(ev.target.value).replace(',', '.')) || 10, 1, 24) * 60); }) }), 'h')),
      h('label', { class: 'feld' }, h('span', {}, 'lange Lücke ab', hilfe('Wartezeit, ab der eine Lücke als „lang“ gilt.')), h('span', { class: 'zeile eng nowrap' }, h('input', { type: 'number', min: 15, max: 600, step: 15, value: R.langeLuecke, style: { width: '64px' }, 'aria-label': 'lange Lücke ab Minuten', onchange: ev => dienstAendern('Grenze Lücke', dd => { dd.dienste.regeln.langeLuecke = _clamp(Math.round(Number(ev.target.value) || 90), 15, 600); }) }), 'min')),
      zf('ansichtVon', 'Gesamtansicht von'), zf('ansichtBis', 'Gesamtansicht bis')),
    h('p', { class: 'muted klein', style: { marginTop: '10px' } }, h('b', {}, 'Springer '), 'wird pauschal je Pause über die vereinfachte Springer-Einstellung festgelegt. Springer belegen die Person zeitlich, zählen aber nicht zur Arbeitszeit und werden gesondert ausgewiesen.'),
    h('h3', {}, 'Pflicht'),
    h('p', { class: 'muted klein' }, 'Pflichtregeln gelten beim Planen, beim Ziehen in der Gesamtansicht und im Aufsichtsdialog. Die Arbeitszeitgrenzen folgen der gleichnamigen Regel des Stundenplans: Steht sie dort auf „Wunsch“, gilt sie auch hier nur als Wunsch.'),
    DIENST_REGELN.filter(r => r.hart).map(r => regelZeile(r, h('span', { class: 'pflichtmarke', title: 'Diese Regel gilt immer.' }, icon('schloss', 'k'), 'Pflicht'), null, null, true)),
    h('h3', {}, 'Wünsche'),
    DIENST_REGELN.filter(r => !r.hart).map(r => regelZeile(r, gewichtRegler(R.gewichte[r.id], r.name, v => dienstAendern('Wichtigkeit „' + r.name + '“', dd => { dd.dienste.regeln.gewichte[r.id] = _clamp(v, 0, 10); })), null, null, false)));
}

