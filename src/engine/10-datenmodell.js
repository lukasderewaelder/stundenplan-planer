/* =====================================================================
   1. DATENMODELL
   ===================================================================== */
const SCHEMA_VERSION = 9;
const TAGE_ALLE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const TAGE_LANG = { Mo: 'Montag', Di: 'Dienstag', Mi: 'Mittwoch', Do: 'Donnerstag', Fr: 'Freitag', Sa: 'Samstag' };
const RAUMTYPEN = ['klassenraum', 'chemie', 'physik', 'biologie', 'informatik', 'sporthalle', 'kunst', 'musik'];
const DOPPEL = ['pflicht', 'bevorzugt', 'egal', 'vermeiden', 'verboten'];
const HART_GEWICHT = 1000; // Strafpunkte je hartem Verstoß während der Suche
// Weiche Personalkosten der automatischen Zuteilung (siehe Plan._personalInit): je Stunde über dem Deputat, je Stunde nach Rang
// (Index 1 Klassenleitung, 2 Klassenteam, 3 übrige) und je zusätzlichem Paar Klasse–Lehrkraft
// Personalkosten der automatischen Zuteilung: Deputat überschritten (je Stunde), Rangfolge (je Stunde), Paar Klasse–Lehrkraft, Ausgleich (je h²)
const PERSONAL_W = { deputat: 150, stufe: [0, 0, 6, 12], paar: 6, ausgleich: 2 };

// Regelkatalog: jede Regel hat eine feste Kennung, einen Namen und den Beschreibungstext
const REGELN = [
  { id: 'H01', hart: true, gruppe: 'Lehrkräfte', name: 'Lehrkraft nicht doppelt belegt', text: 'Gilt für Fach- und Co-Lehrkräfte. Zwei Unterrichte mit gleicher Kopplung dürfen dieselbe Lehrkraft nicht beide zeitgleich verlangen, außer sie sind derselbe Unterricht.' },
  { id: 'H02', hart: true, gruppe: 'Klassen', name: 'Klasse und Gruppe nicht doppelt belegt', text: 'Eine Gruppe kollidiert mit der ganzen Klasse und mit derselben Gruppe, nicht aber mit einer anderen Gruppe derselben Klasse. Klassen in einem gekoppelten Unterricht sind gemeinsam belegt.' },
  { id: 'H03', hart: true, gruppe: 'Räume', name: 'Raum nicht doppelt belegt', text: 'Ausnahme: Räume mit „teilbar = n“ (z. B. Sporthalle teilbar in 2 oder 3 Hallenteile) dürfen bis zu n Unterrichte gleichzeitig aufnehmen.' },
  { id: 'H04', hart: true, gruppe: 'Fächer', name: 'Sollstunden erfüllt', text: 'Jeder Unterricht wird in genau „wochenstunden“ Slots platziert, nicht mehr und nicht weniger. Gezählt wird je fehlender Stunde.' },
  { id: 'H05', hart: true, gruppe: 'Lehrkräfte', name: 'Sperrzeiten eingehalten', text: 'Kein Slot, in dem Lehrkraft oder Raum gesperrt ist (Wert 0 in der Verfügbarkeit), inklusive Teilzeit und Ausbildungstagen.' },
  { id: 'H06', hart: true, gruppe: 'Räume', name: 'Raum passend', text: 'Raumtyp entspricht dem Raumtyp des Fachs, Kapazität ist mindestens die Schülerzahl der Teilnehmer. Feste Räume des Unterrichts haben Vorrang.' },
  { id: 'H07', hart: true, gruppe: 'Fächer', name: 'Blockstruktur', text: 'Blöcke folgen „bloecke“ bzw. der Doppelstundenregel des Fachs. Ein Doppelblock beginnt nur an Stunden mit „Doppelstunde darf beginnen“ und liegt nie über einer Pause. „pflicht“ erzwingt, „verboten“ untersagt Doppelblöcke. Aufgaben dürfen beliebig lange Blöcke haben, auch über Pausen hinweg und mehrere am selben Tag. Mehrere Blöcke desselben Unterrichts liegen an verschiedenen Tagen.' },
  { id: 'H08', hart: true, gruppe: 'Fächer', name: 'Kopplung eingehalten', text: 'Unterrichte mit gleicher Kopplungs-ID liegen im selben Slot, mit gleicher Dauer.' },
  { id: 'H09', hart: true, gruppe: 'Fächer', name: 'Fixierungen bleiben', text: 'Fixierte Platzierungen werden weder vom Solver noch vom „Optimieren“-Knopf verschoben.' },
  { id: 'H10', hart: true, gruppe: 'Klassen', name: 'Keine Pausen, Unterrichtsschluss', text: 'In als Pause markierten Stunden und nach dem Unterrichtsschluss des Wochentags (z. B. freitags nur bis zur 4. Stunde) findet kein Unterricht statt.' },
  { id: 'H11', hart: true, umschaltbar: true, gruppe: 'Klassen', name: 'Klassenkorridor', text: 'Kein Unterricht vor „frühestens“ oder nach „spätestens“ der Klasse; nicht mehr als „max. UStd./Tag“ je Tag.' },
  { id: 'H12', hart: true, umschaltbar: true, gruppe: 'Lehrkräfte', name: 'Lehrkraft-Tagesgrenzen', text: 'Nicht mehr als „max. UStd./Tag“ und nicht weniger als „min. UStd./Tag“ an einem Arbeitstag der Lehrkraft (Arbeitstag = Tag mit mindestens einer Unterrichtsstunde). Aufgaben zählen hier nicht mit – für sie gilt die Arbeitszeit je Tag.' },
  { id: 'H13', hart: true, gruppe: 'Fächer', name: 'Fach je Tag begrenzt', text: 'Ein Fach kommt je Klasse und Tag höchstens „max. pro Tag“ mal vor (Doppelblock zählt als zwei); in der Stundentafel lässt sich je Klasse ein eigener Wert eintragen („Höchstens je Tag“). Aufgaben und Aufsichten fallen nicht unter diese Regel.' },
  { id: 'H14', hart: true, gruppe: 'Fächer', name: 'Wochenrhythmus', text: 'Unterrichte mit A oder B belegen ihren Slot nur in der jeweiligen Woche. Ein A- und ein B-Unterricht dürfen sich denselben Slot und dieselbe Ressource teilen. Ein A/B-Unterricht an einer Schule ohne A/B-Rhythmus ist ein Verstoß.' },
  { id: 'H15', hart: true, umschaltbar: true, gruppe: 'Klassen', name: 'Klassen ohne Freistunden', text: 'Der Tag einer Klasse ist ohne Lücke, beginnt also bei der „frühestens“-Stunde und ist lückenlos bis zur letzten Stunde. Über die Option „Späterer Tagesbeginn erlaubt“ zählen nur Lücken zwischen zwei Stunden. Auf „weich“ gestellt, zählen die Lücken über „Freistunden der Klassen vermeiden“.' },
  { id: 'H16', hart: true, umschaltbar: true, gruppe: 'Lehrkräfte', name: 'Arbeitszeitgrenzen', text: 'Die Wochenarbeitszeit und die Höchstarbeitszeit je Tag einer Person werden nicht überschritten. Harte Priorität: Fachunterricht → Co-Unterricht → Aufsichten. Aufsichten reservieren keine Unterrichtszeit und dürfen niemals dazu führen, dass Unterricht unbesetzt bleibt. Bei „Fachlehrkraft automatisch“ wählt die Berechnung Personen mit freier Arbeitszeit; anteilige Co-Einsätze entfallen, bevor eine Grenze überschritten würde. Aufsichten werden anschließend gegen den fertigen Unterricht geplant. Je Tag zählen Unterricht, Co-Einsätze, Aufgaben und Termine mit ihrer Dauer (ohne Vorbereitung).' },
  { id: 'W01', hart: false, std: 8, gruppe: 'Lehrkräfte', name: 'Freistunden der Lehrkräfte vermeiden', text: 'Je Lücke von einer Stunde zwischen zwei Unterrichten am selben Tag; Überschreiten von „max. Freistunden/Tag“ zählt zusätzlich doppelt.', beispiel: 'Mü unterrichtet Di in Stunde 1 und 4 → 2 Freistunden; bei max. 1 zusätzlich 2 Punkte.' },
  { id: 'W02', hart: false, std: 10, gruppe: 'Klassen', name: 'Freistunden der Klassen vermeiden', text: 'Je Lücke im Klassenplan (nur wirksam, wenn „Klassen ohne Freistunden“ auf weich gestellt ist).', beispiel: '7a hat Mi Stunde 1–2 und 4–6 → 1 Verstoß.' },
  { id: 'W03', hart: false, std: 5, gruppe: 'Lehrkräfte', name: 'Ungern-Slots der Lehrkräfte meiden', text: 'Je Unterrichtsstunde in einem Slot mit Wert „ungern“ (-1).', beispiel: 'Wa hat Mo 1. Stunde als ungern markiert und unterrichtet dort → 1 Verstoß.' },
  { id: 'W04', hart: false, std: 2, gruppe: 'Lehrkräfte', name: 'Gewünschte Slots nutzen', text: 'Je Unterrichtsstunde außerhalb eines gewünschten Slots, solange die Lehrkraft überhaupt gewünschte Slots hat.', beispiel: 'Mü wünscht sich Fr 1–3 und unterrichtet Mo 5 → 1 Verstoß.' },
  { id: 'W05', hart: false, std: 6, gruppe: 'Lehrkräfte', name: 'Freie Tage der Lehrkräfte', text: 'Je Unterrichtsstunde an einem Tag aus „freier Tag (Wunsch)“.', beispiel: 'Ri möchte freitags frei haben und hat dort 2 UStd. → 2 Verstöße.' },
  { id: 'W06', hart: false, std: 4, gruppe: 'Fächer', name: 'Fächer gleichmäßig über die Woche', text: 'Je Klasse und Fach, dessen Stunden nicht auf möglichst viele verschiedene Tage verteilt sind (gezählt je fehlendem Tag).', beispiel: 'Zwei Deutsch-Unterrichte der 6a liegen beide am Montag → 1 Verstoß.' },
  { id: 'W07', hart: false, std: 3, gruppe: 'Fächer', name: 'Kernfächer früh', text: 'Je Stunde eines Fachs mit „Kernfach“ nach der 4. Stunde (Grenze einstellbar).', beispiel: 'Mathe in der 6. Stunde → 1 Verstoß.' },
  { id: 'W08', hart: false, std: 4, gruppe: 'Fächer', name: 'Doppelstunden nach Fachregel', text: 'Je Unterricht eines Fachs mit „bevorzugt“ ohne Doppelblock, je Unterricht eines Fachs mit „vermeiden“ mit Doppelblock.', beispiel: 'Mathe (bevorzugt) mit Blöcken 1+1+1+1 → 1 Verstoß.' },
  { id: 'W09', hart: false, std: 2, gruppe: 'Fächer', name: 'Fächerfolge', text: 'Je Verstoß gegen eine Paarregel (frei definierbar, z. B. Sport nicht direkt vor der Mittagspause, zwei Kernfächer nicht direkt hintereinander).', beispiel: 'Deutsch direkt nach Mathe, beide Kernfach → 1 Verstoß.' },
  { id: 'W10', hart: false, std: 2, gruppe: 'Räume', name: 'Wenig Raumwechsel', text: 'Je Wechsel der Klasse in einen anderen Raum zwischen zwei aufeinanderfolgenden Stunden. (Gebäudeteile sind in dieser Version nicht erfasst.)', beispiel: '7a hat Stunde 2 in 101 und Stunde 3 im Chemieraum → 1 Verstoß.' },
  { id: 'W11', hart: false, std: 3, gruppe: 'Lehrkräfte', name: 'Gleichmäßige Tagesbelastung Lehrkräfte', text: 'Je Lehrkraft die Summe der Abweichungen der Tagesstundenzahl vom Wochendurchschnitt über die Tage mit Verfügbarkeit. Die Tagesbelastung von Klassen bzw. Schülern wird durch „Gleichmäßige Tagesbelastung Lehrkräfte“ nicht mehr bewertet.', beispiel: 'Lehrkraft mit 6/2/4/4/4 UStd., Schnitt 4 → 4 Punkte.' },
  { id: 'W12', hart: false, std: 2, gruppe: 'Lehrkräfte', name: 'Später Tag, später Beginn', text: 'Je Lehrkraft und Tag, an dem sie nach einem Tag mit Unterricht ab der 7. Stunde (Schwelle einstellbar) am Folgetag in der 1. Stunde beginnt.', beispiel: 'Mo bis zur 8., Di ab der 1. Stunde → 1 Verstoß.' },
  { id: 'W13', hart: false, std: 5, gruppe: 'Klassen', name: 'Wenig Nachmittagsunterricht in der Unterstufe', text: 'Je Stunde ab Stunde 7 bei Klassen der Jahrgänge bis einschließlich 6 (Grenzen einstellbar).', beispiel: '5a hat Do in der 7. Stunde Sport → 1 Verstoß.' },
  { id: 'W14', hart: false, std: 6, gruppe: 'Lehrkräfte', name: 'Co-Anteil einhalten', text: 'Je Block, in dem eine anteilig eingeplante Co-Lehrkraft fehlt („Co fehlt“). Weil Co-Stunden zu den Pflichtbedingungen des Plans gehören, zählt dieses Gewicht 8-fach.', beispiel: 'Sch soll in 2 von 4 Mathestunden dabei sein, ist aber nie frei → 1 Verstoß.' },
  { id: 'W15', hart: false, std: 1, gruppe: 'Klassen', name: 'Klassenleitung präsent', text: 'Je Klasse und Unterrichtstag, an dem die Klassenlehrkraft die Klasse nicht unterrichtet; zusätzlich 1, wenn sie die Klasse in der ganzen Woche nie in der 1. Stunde hat.', beispiel: 'Klassenleitung der 7a hat die Klasse nur Mo und Mi → 3 Tage ohne sie.' },
  { id: 'W16', hart: false, std: 3, gruppe: 'Allgemein', name: 'Stabilität bei Neuberechnung', text: 'Je Unterricht, dessen Platzierung sich gegenüber dem zuvor gespeicherten Plan geändert hat (nur aktiv bei „Änderungen minimal halten“).', beispiel: 'Nach einer Sperrzeit-Änderung werden 3 Unterrichte verschoben → 3 Verstöße.' },
  { id: 'W17', hart: false, std: 10, gruppe: 'Klassen', name: 'Halbgruppen nebeneinander', text: 'Je Stunde, in der nur ein Teil der Klasse Unterricht hat (z. B. nur Gruppe A), während der Rest frei ist. Geteilter Unterricht soll nebeneinander liegen: Gruppe A hat Werken, Gruppe B zur selben Zeit Kunst.', beispiel: '5a: Kunst der Gruppe A liegt Mo in der 3. Stunde, Gruppe B hat dort nichts → 1 Verstoß; liegt dort Werken der Gruppe B → 0.' },
  { id: 'W18', hart: false, std: 8, gruppe: 'Lehrkräfte', name: 'Klassenleitung unterrichtet die Kernfächer', text: 'Je Wochenstunde eines Kernfachs, das in der eigenen Klasse nicht die Klassenleitung unterrichtet, obwohl sie das Fach unterrichten kann. Gilt nur, wenn die Fachlehrkraft automatisch bestimmt wird – eine feste Personalvorgabe im Unterricht geht vor. Bei Halbgruppen genügt es, wenn die Klassenleitung eine der Gruppen unterrichtet.', beispiel: 'Mü leitet die 5a und kann Deutsch, Deutsch (5 UStd.) bekommt aber Wa → 5 Verstöße.' }
];
const RN = REGELN.length;
const RI = {};
REGELN.forEach((r, i) => { RI[r.id] = i; });
const PAARTYPEN = { schwerHintereinander: 'Zwei Kernfächer nicht direkt hintereinander', vorPause: 'Fach A nicht direkt vor der Mittagspause', nichtNach: 'Fach A nicht direkt nach Fach B' };
const PROFILE = {
  ausgewogen: { name: 'Ausgewogen', werte: null },
  lehrkraefte: { name: 'Lehrkräfte zuerst', werte: { W01: 9, W02: null, W03: 9, W04: 9, W05: 9, W12: 9 } },
  schueler: { name: 'Schülerwohl zuerst', werte: { W02: 9, W06: 9, W07: 9, W13: 9 } }
};

// ---------- kleine Hilfen ----------
const _str = (v, d = '') => (v === undefined || v === null) ? d : String(v);
const _num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const _int = (v, d = 0) => Math.round(_num(v, d));
const _arr = v => Array.isArray(v) ? v : [];
const _clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let _idZaehler = 0;
function neueId(prefix) {
  _idZaehler = (_idZaehler + 1) % 4096;
  const r = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return prefix + '_' + r + (Date.now() % 4096 + _idZaehler).toString(36);
}
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const jetzt = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
// "07:45" → 465 Minuten, sonst null
// "07:45" → 465 Minuten seit Mitternacht, "24:00" → 1440, Zahlen bleiben; sonst null
function minVon(x) { if (typeof x === 'number') return Number.isFinite(x) ? x : null; const m = /^(\d{1,2}):(\d{2})$/.exec(String(x || '').trim()); if (!m) return null; const v = Number(m[1]) * 60 + Number(m[2]); return v <= 1440 ? v : null; }
function zeitText(min) { min = ((Math.round(min) % 1440) + 1440) % 1440; return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'); }
const ARBEITSZEIT_STD = { standardStunden: 40, vorbLehrkraft: 35, vorbCo: 17, klassenleitungMin: 90, stundenSoll: false, maxTagStunden: 0 };
function nArbeitszeitModell(a) {
  a = a || {};
  return {
    standardStunden: _clamp(_num(a.standardStunden, 40), 0, 80), vorbLehrkraft: _clamp(_num(a.vorbLehrkraft, 35), 0, 240),
    // Vorbereitung in Minuten je gehaltener Unterrichtsstunde – unabhängig davon, wie lang die Stunde ist (45, 60 min, Zeitprofil …)
    vorbCo: _clamp(_num(a.vorbCo, 17), 0, 240),
    klassenleitungMin: _clamp(_num(a.klassenleitungMin, 90), 0, 1200),
    // Unterrichtsdeputat je Person begrenzen: Höchstzahl der Unterrichtsstunden je Woche (als Lehrkraft und als Co-Lehrkraft zusammen).
    // Aus: alle Prüfungen und die Co-Ergänzung stützen sich nur auf die Arbeitszeit.
    stundenSoll: !!a.stundenSoll,
    // Vorgabe „max. Arbeitszeit je Tag“ (Stunden) für neu angelegte Personen; 0 = keine Grenze
    maxTagStunden: _clamp(_num(a.maxTagStunden, 0), 0, 24)
  };
}
// Regeln für das automatische Ergänzen von Co-Lehrkräften
//   lehrkraefte: 'notfalls' = ausgebildete Lehrkräfte nur, wenn keine Co-Kraft passt (Standard) · 'nie' · 'gleich' = gleichberechtigt mit Co-Kräften
//   wichtung 0–10: 0 = Fachunterricht (auch in anderen Klassen) hat Vorrang … 10 = Co in der eigenen Klasse (Klassenleitung) hat Vorrang
const CO_LEHRKRAEFTE = { notfalls: 'nur wenn keine Co-Kraft passt', nie: 'nie', gleich: 'gleichberechtigt mit Co-Kräften (Klassenleitung zuerst)' };
function nCoRegeln(c) {
  c = c || {};
  return { lehrkraefte: CO_LEHRKRAEFTE[c.lehrkraefte] ? c.lehrkraefte : 'notfalls', wichtung: _clamp(_int(c.wichtung, 3), 0, 10) };
}

// ---------- Zeitraster-Vorlagen ----------
function vorlageRaster(art) {
  const mk = (b, e, pause, dbl, name, pauseName) => ({ beginn: b, ende: e, istPause: !!pause, doppelMitNaechster: !!dbl, name: pause ? 'Mittagspause' : (name || ''), pauseName: pauseName || '' });
  if (art === '60') return [mk('08:00', '09:00', 0, 1), mk('09:00', '10:00', 0, 0, '', 'Große Pause'), mk('10:20', '11:20', 0, 1), mk('11:20', '12:20', 0, 0), mk('12:20', '13:10', 1, 0), mk('13:10', '14:10', 0, 1), mk('14:10', '15:10', 0, 0)];
  if (art === '90') return [mk('08:00', '08:45', 0, 1), mk('08:45', '09:30', 0, 0, '', 'Große Pause'), mk('09:50', '10:35', 0, 1), mk('10:35', '11:20', 0, 0, '', 'Zweite Pause'), mk('11:40', '12:25', 0, 1), mk('12:25', '13:10', 0, 0), mk('13:10', '13:50', 1, 0), mk('13:50', '14:35', 0, 1), mk('14:35', '15:20', 0, 0)];
  return [mk('07:30', '08:15', 0, 1), mk('08:20', '09:05', 0, 0, '', 'Große Pause'), mk('09:25', '10:10', 0, 1), mk('10:15', '11:00', 0, 0, '', 'Zweite Pause'), mk('11:15', '12:00', 0, 1), mk('12:05', '12:50', 0, 0), mk('12:50', '13:30', 1, 0), mk('13:30', '14:15', 0, 1), mk('14:20', '15:05', 0, 0)];
}

function standardRegelwerk() {
  const g = {};
  REGELN.forEach(r => { if (!r.hart) g[r.id] = r.std; });
  return {
    hartUmschaltbar: { H11: 'hart', H12: 'hart', H15: 'hart', H16: 'hart' },
    gewichteHart: { H11: 8, H12: 8, H16: 8 },
    gewichte: g,
    optionen: { spaeterBeginnErlaubt: false, kernfachBis: 4, spaetAb: 7, unterstufeBis: 6, nachmittagAb: 7 },
    paarregeln: [{ typ: 'schwerHintereinander', a: '', b: '' }]
  };
}

// ---------- Normalisierung (idempotent, feste Schlüsselreihenfolge) ----------
function nMatrix(m, D, H) {
  const out = [];
  for (let d = 0; d < D; d++) {
    const row = [];
    for (let h = 0; h < H; h++) {
      const v = m && m[d] ? m[d][h] : undefined;
      row.push(v === 0 || v === 2 || v === -1 || v === 1 ? v : 1);
    }
    out.push(row);
  }
  return out;
}
function nFach(f) {
  f = f || {};
  return {
    id: _str(f.id) || neueId('f'), kuerzel: _str(f.kuerzel), name: _str(f.name),
    farbe: /^#[0-9a-fA-F]{6}$/.test(f.farbe || '') ? f.farbe.toLowerCase() : '#9aa9c2',
    raumTyp: _str(f.raumTyp, 'klassenraum'),
    doppelstunde: DOPPEL.includes(f.doppelstunde) ? f.doppelstunde : 'egal',
    maxProTag: _clamp(_int(f.maxProTag, 2), 1, 20), schwer: !!f.schwer,
    coBedarf: !!f.coBedarf, vorbereitung: f.vorbereitung === undefined ? true : !!f.vorbereitung
  };
}
function nRaum(r, D, H) {
  r = r || {};
  return {
    id: _str(r.id) || neueId('r'), name: _str(r.name), typ: _str(r.typ, 'klassenraum'),
    kapazitaet: _clamp(_int(r.kapazitaet, 30), 0, 9999), teilbar: _clamp(_int(r.teilbar, 1), 1, 9),
    heimatKlasse: r.heimatKlasse ? String(r.heimatKlasse) : null,
    verfuegbarkeit: nMatrix(r.verfuegbarkeit, D, H)
  };
}
function nKlasse(k, nL) {
  k = k || {};
  const tafel = {};
  const t = k.stundentafel && typeof k.stundentafel === 'object' ? k.stundentafel : {};
  Object.keys(t).sort().forEach(key => { const v = Math.round(_num(t[key], 0) * 2) / 2; if (v > 0) tafel[key] = Math.min(v, 40); }); // halbe Stunden: Unterricht nur in Woche A oder B
  const gruppen = _arr(k.gruppen).map(g => ({ id: _str(g && g.id) || neueId('g'), name: _str(g && g.name), schueler: _clamp(_int(g && g.schueler, 0), 0, 999) }));
  // die beiden Halbgruppen (✂): einmal festgelegt, bleiben sie es auch nach dem Umbenennen
  let halb = _arr(k.halb).map(String); halb = halb.length === 2 && halb[0] !== halb[1] && halb.every(id => gruppen.some(g => g.id === id)) ? halb : null;
  if (!halb) { const a = gruppen.find(g => halbName(g) === 0), b = gruppen.find(g => halbName(g) === 1); if (a && b) halb = [a.id, b.id]; }
  return {
    id: _str(k.id) || neueId('k'), name: _str(k.name), jahrgang: _int(k.jahrgang, 5),
    heimatraum: k.heimatraum ? String(k.heimatraum) : null, schueler: _clamp(_int(k.schueler, 25), 0, 999),
    fruehestens: _clamp(_int(k.fruehestens, 1), 1, 99), spaetestens: _clamp(_int(k.spaetestens, nL || 8), 1, 99),
    maxStundenTag: _clamp(_int(k.maxStundenTag, nL || 8), 1, 99),
    stundentafel: tafel,
    gruppen, halb,
    team: _arr(k.team).map(String).filter((x, i, a) => a.indexOf(x) === i),
    // Fächer, die in dieser Klasse in den Halbgruppen A und B unterrichtet werden (jede Gruppe mit der vollen Stundenzahl)
    teilung: (() => { const o = {}, q = k.teilung && typeof k.teilung === 'object' ? k.teilung : {}; Object.keys(q).sort().forEach(fid => { if (q[fid]) o[fid] = true; }); return o; })(),
    // Parallelpartner geteilter Fächer ({ Kunst: Werken, Werken: Kunst }): Gruppe 1 des einen Fachs liegt IMMER zeitgleich mit Gruppe 2 des anderen
    // (Parallelband, hart). Nur gegenseitige Einträge zweier geteilter Fächer bleiben stehen.
    parallel: (() => { const o = {}, q = k.parallel && typeof k.parallel === 'object' ? k.parallel : {}, t = k.teilung && typeof k.teilung === 'object' ? k.teilung : {}; Object.keys(q).sort().forEach(f => { const p = String(q[f] || ''); if (p && p !== f && String(q[p] || '') === f && t[f] && t[p]) o[f] = p; }); return o; })(),
    // Co-Bedarf je Fach dieser Klasse: 'alle' = alle Stunden mit Co-Lehrkraft, Zahl = so viele (durchschnittliche) Wochenstunden mit Co,
    // 'kein' = ausdrücklich ohne Co. Ohne Eintrag gilt die Vorgabe des Fachs („Co einplanen“).
    coBedarf: (() => { const o = {}, q = k.coBedarf && typeof k.coBedarf === 'object' ? k.coBedarf : {}; Object.keys(q).sort().forEach(f => { const v = q[f]; if (v === 'alle' || v === 'kein') o[f] = v; else { const n = Math.round(_num(v, 0) * 2) / 2; if (n > 0) o[f] = Math.min(n, 40); } }); return o; })(),
    // reale Unterrichtszeiten (Zeitprofil); fruehestens/spaetestens/maxStundenTag steuern weiter die Planung
    zeitprofil: k.zeitprofil ? String(k.zeitprofil) : null,
    // Höchstzahl je Tag je Fach in dieser Klasse (Doppelblock zählt als zwei). Ohne Eintrag gilt „max. pro Tag“ des Fachs.
    maxProTag: (() => { const o = {}, q = k.maxProTag && typeof k.maxProTag === 'object' ? k.maxProTag : {}; Object.keys(q).sort().forEach(f => { const n = _int(q[f], 0); if (n >= 1) o[f] = Math.min(n, 20); }); return o; })()
  };
}
function nLehrer(l, D, H, stdAz, stdTag, vorlagen) {
  l = l || {};
  const anw = ['vollzeit', 'teilzeit', 'ausbildungstag'].includes(l.anwesenheit) ? l.anwesenheit : 'vollzeit';
  const tage = arr => _arr(arr).map(x => _int(x, -1)).filter((x, i, a) => x >= 0 && x < D && a.indexOf(x) === i).sort((a, b) => a - b);
  return {
    id: _str(l.id) || neueId('t'), kuerzel: _str(l.kuerzel), name: _str(l.name),
    // Fächer als Lehrkraft (Lehrbefähigung) und Fächer als Co-Lehrkraft – zwei unabhängige Listen; ein Fach darf in beiden stehen.
    faecher: _arr(l.faecher).map(String).filter((x, i, a) => a.indexOf(x) === i),
    coFaecher: _arr(l.coFaecher).map(String).filter((x, i, a) => a.indexOf(x) === i),
    // Unterrichtsdeputat: Höchstzahl der Unterrichtsstunden je Woche, als Lehrkraft und als Co-Lehrkraft zusammen.
    // null (leeres Feld) = keine Angabe, also keine Grenze (nur Hinweis bei Überschreitung); 0 = wirklich keine Unterrichtsstunde (harter Ausschluss).
    deputat: l.deputat === null || l.deputat === undefined || l.deputat === '' || !isFinite(Number(l.deputat)) ? null : _clamp(_num(l.deputat, 0), 0, 99),
    // Höchstarbeitszeit je Tag in Stunden (Unterricht, Co-Einsätze, Aufgaben und Aufsichten – ohne Vorbereitung); 0 = keine Grenze
    maxArbeitTag: _clamp(_num(l.maxArbeitTag, stdTag === undefined ? 0 : stdTag), 0, 24),
    verfuegbarkeit: nMatrix(l.verfuegbarkeit, D, H),
    // gesperrte Pausen zwischen zwei Stunden (Lücken im Raster): 'Tag|n<Zeile davor>'. Pausenzeilen werden in der Verfügbarkeit gesperrt.
    pausenGesperrt: _arr(l.pausenGesperrt).map(String).filter((x, i, a) => /^\d+\|n\d+$/.test(x) && a.indexOf(x) === i && Number(x.split('|')[0]) < D).sort(),
    maxStundenTag: _clamp(_int(l.maxStundenTag, 8), 1, 99), minStundenTag: _clamp(_int(l.minStundenTag, 0), 0, 99),
    maxHohlstundenTag: _clamp(_int(l.maxHohlstundenTag, 2), 0, 99),
    freierTagWunsch: tage(l.freierTagWunsch), anwesenheit: anw, anwesenheitTage: tage(l.anwesenheitTage),
    klassenleitung: l.klassenleitung ? String(l.klassenleitung) : null,
    // Art der Person: 'lk' Lehrkraft (ausgebildet), 'co' Co-Kraft, 'personal' weiteres Personal (kein Unterricht, auch nicht als Co –
    // nur Aufsichten und Aufgaben). „ausgebildet“ bleibt als abgeleitetes Feld erhalten.
    art: l.art === 'personal' ? 'personal' : (l.ausgebildet === false || (l.ausgebildet === undefined && l.art === 'co') ? 'co' : 'lk'),
    ausgebildet: l.art === 'personal' ? false : (l.ausgebildet === undefined ? l.art !== 'co' : !!l.ausgebildet),
    arbeitszeit: _clamp(_num(l.arbeitszeit, stdAz === undefined ? 40 : stdAz), 0, 80),
    aufsicht: l.aufsicht === undefined ? true : !!l.aufsicht,
    // Aufsichten: Anwesenheitsfenster je Tag, Präferenzen, Qualifikationen (z. B. „ersthelfer“)
    dienstVerfuegbarkeit: nDienstVerfuegbarkeit(l.dienstVerfuegbarkeit, D),
    dienstPraeferenzen: nDienstPraeferenzen(l.dienstPraeferenzen),
    // Ausschlüsse für Aufsichten, für die die Person nicht eingeteilt wird (Art, Tag, Zeitfenster)
    dienstAusschluss: nDienstAusschluss(l.dienstAusschluss, D, vorlagen),
    qualifikationen: _arr(l.qualifikationen).map(x => _str(x).trim().toLowerCase()).filter((x, i, a) => x && a.indexOf(x) === i).slice(0, 20)
  };
}
// Darf die Person im Fach als Fachlehrkraft (Lehrbefähigung) bzw. als Co-Lehrkraft eingesetzt werden?
function fachBefaehigt(l, fach) { return !!(l && l.art !== 'personal' && l.faecher && l.faecher.includes(fach)); }
function coBefaehigt(l, fach) {
  if (!l || l.art === 'personal') return false; // weiteres Personal unterrichtet nicht, auch nicht als Co
  const f = l.faecher || [], c = l.coFaecher || [];
  if (c.includes(fach)) return true;
  return l.ausgebildet === false && !f.length && !c.length; // Co-Kraft ohne eingetragene Fächer: in allen Fächern
}
function nLehrkraftZuordnung(z) {
  z = z || {};
  const rolle = z.rolle === 'co' ? 'co' : 'fach';
  const modus = ['immer', 'anteilig', 'wechselnd', 'gruppe'].includes(z.modus) ? z.modus : 'immer';
  return {
    lehrer: z.lehrer ? String(z.lehrer) : '', rolle, modus,
    stundenAnteil: _clamp(_num(z.stundenAnteil, 0), 0, 99),
    deputatFaktor: _clamp(_num(z.deputatFaktor, rolle === 'co' ? 0.5 : 1), 0, 2),
    auto: !!z.auto,
    zwang: rolle === 'fach' && !!z.zwang
  };
}
function nUnterricht(u) {
  u = u || {};
  return {
    id: _str(u.id) || neueId('u'), fach: u.fach ? String(u.fach) : '',
    klassen: _arr(u.klassen).map(String), gruppen: _arr(u.gruppen).map(String),
    lehrkraefte: _arr(u.lehrkraefte).map(nLehrkraftZuordnung),
    wochenstunden: _clamp(_int(u.wochenstunden, 0), 0, 60),
    bloecke: _arr(u.bloecke).map(x => _int(x, 1)).filter(x => x > 0),
    bloeckeWoche: (() => { const b = _arr(u.bloecke).map(x => _int(x, 1)).filter(x => x > 0); const w = _arr(u.bloeckeWoche); return w.some(x => x === 'A' || x === 'B') ? b.map((_, i) => (w[i] === 'A' || w[i] === 'B') ? w[i] : 'jede') : []; })(),
    // von der Berechnung gewählte Blockaufteilung (nur ohne eigene Blöcke; wird bei jeder vollständigen Berechnung neu bestimmt)
    bloeckeAuto: _arr(u.bloeckeAuto).map(x => _int(x, 0)).filter(x => x === 1 || x === 2),
    bloeckeAutoWoche: (() => { const b = _arr(u.bloeckeAuto).map(x => _int(x, 0)).filter(x => x === 1 || x === 2), w = _arr(u.bloeckeAutoWoche); return b.map((_, i) => w[i] === 'A' || w[i] === 'B' ? w[i] : 'jede'); })(),
    vorbereitung: u.vorbereitung === undefined ? true : !!u.vorbereitung,
    raum: _str(u.raum), rhythmus: ['jede', 'A', 'B'].includes(u.rhythmus) ? u.rhythmus : 'jede',
    kopplung: u.kopplung ? String(u.kopplung) : null,
    // Fachlehrkraft „automatisch“: Die Berechnung trägt die Lehrkraft ein (Eintrag mit auto: true) und darf sie neu vergeben
    fachAuto: !u.aufgabe && !!u.fachAuto && !_arr(u.lehrkraefte).some(z => z && z.rolle !== 'co' && z.lehrer && !z.auto),
    // im Plan-Editor von Hand aus allen Stunden entfernt: Die automatische Planung (Fach- und Co-Lehrkräfte) setzt diese Personen hier nicht wieder ein.
    // Wer wieder fest eingetragen wird, fällt heraus.
    ohneAuto: [...new Set(_arr(u.ohneAuto).map(String).filter(id => id && !_arr(u.lehrkraefte).some(z => z && z.lehrer === id && !z.auto)))],
    fixiert: _arr(u.fixiert).map(x => ({ tag: _int(x && x.tag, 0), stunde: _int(x && x.stunde, 1) })),
    aufgabe: !!u.aufgabe,
    // nur Aufgaben: feste Termine mit Uhrzeit oder in einer Pause (außerhalb des Stundenrasters)
    termine: u.aufgabe ? _arr(u.termine).map(nTermin).filter(t => t.pause || (t.beginn && t.ende)) : [],
    name: _str(u.name), kuerzel: _str(u.kuerzel), farbe: /^#[0-9a-fA-F]{6}$/.test(_str(u.farbe)) ? u.farbe : '#8c96a8',
    anrechnung: u.anrechnung === undefined ? true : !!u.anrechnung,
    // nur Aufgaben: Umfang wie eingegeben – in Unterrichtsstunden ('ustd') oder Zeitstunden ('zstd', dann steht der Wert in zeitstunden);
    // geplant wird immer in Rasterstunden (wochenstunden). pausenZaehlen: Pausen, die ein Block überdeckt, zählen als Arbeitszeit.
    einheit: u.aufgabe && u.einheit === 'zstd' ? 'zstd' : 'ustd',
    zeitstunden: u.aufgabe && u.einheit === 'zstd' ? _clamp(_num(u.zeitstunden, 0), 0, 60) : 0,
    pausenZaehlen: u.aufgabe ? u.pausenZaehlen !== false : false
  };
}
function nPlatz(p) {
  p = p || {};
  return {
    unterricht: _str(p.unterricht), blockNr: _int(p.blockNr, 1), tag: _int(p.tag, 0), stunde: _int(p.stunde, 1),
    dauer: _int(p.dauer, 1), raum: p.raum ? String(p.raum) : null, gesperrt: !!p.gesperrt,
    co: _arr(p.co).map(String)
  };
}
function nRegeln(r) {
  const s = standardRegelwerk();
  r = r || {};
  const hu = r.hartUmschaltbar || {}, gh = r.gewichteHart || {}, g = r.gewichte || {}, o = r.optionen || {};
  const gew = {};
  Object.keys(s.gewichte).forEach(k => { gew[k] = _clamp(_num(g[k], s.gewichte[k]), 0, 10); });
  return {
    hartUmschaltbar: { H11: hu.H11 === 'weich' ? 'weich' : 'hart', H12: hu.H12 === 'weich' ? 'weich' : 'hart', H15: hu.H15 === 'weich' ? 'weich' : 'hart', H16: hu.H16 === 'weich' ? 'weich' : 'hart' },
    gewichteHart: { H11: _clamp(_num(gh.H11, 8), 0, 10), H12: _clamp(_num(gh.H12, 8), 0, 10), H16: _clamp(_num(gh.H16, 8), 0, 10) },
    gewichte: gew,
    optionen: {
      spaeterBeginnErlaubt: !!o.spaeterBeginnErlaubt, kernfachBis: _clamp(_int(o.kernfachBis, 4), 1, 20),
      spaetAb: _clamp(_int(o.spaetAb, 7), 1, 20), unterstufeBis: _clamp(_int(o.unterstufeBis, 6), 0, 20),
      nachmittagAb: _clamp(_int(o.nachmittagAb, 7), 1, 20)
    },
    paarregeln: (Array.isArray(r.paarregeln) ? r.paarregeln : s.paarregeln).map(p => ({
      typ: PAARTYPEN[p && p.typ] ? p.typ : 'schwerHintereinander', a: _str(p && p.a), b: _str(p && p.b)
    }))
  };
}
function normalisiere(d) {
  d = d || {};
  const sch = d.schule || {};
  const tage = (_arr(sch.tage).length ? sch.tage : ['Mo', 'Di', 'Mi', 'Do', 'Fr']).filter((t, i, a) => TAGE_ALLE.includes(t) && a.indexOf(t) === i)
    .sort((a, b) => TAGE_ALLE.indexOf(a) - TAGE_ALLE.indexOf(b));
  const rohSt = (_arr(sch.stunden).length ? sch.stunden : vorlageRaster('45'));
  const stunden = rohSt.map((s, i) => {
    s = s || {};
    const b = minVon(s.beginn), e = minVon(s.ende), nb = rohSt[i + 1] ? minVon(rohSt[i + 1].beginn) : null;
    // Die Uhrzeiten sind maßgeblich: Dauer und Abstand zur nächsten Zeile werden daraus abgeleitet (nur ohne gültige Zeiten gelten die gespeicherten Werte).
    const dauer = b !== null && e !== null && e > b ? e - b : (s.dauer !== undefined && s.dauer !== null ? _clamp(_int(s.dauer, 45), 0, 600) : (s.istPause ? 30 : 45));
    const pauseDanach = e !== null && nb !== null ? Math.max(0, nb - e) : (s.pauseDanach !== undefined && s.pauseDanach !== null ? _clamp(_int(s.pauseDanach, 0), 0, 600) : 0);
    return { nr: i + 1, beginn: _str(s.beginn), ende: _str(s.ende), istPause: !!s.istPause, doppelMitNaechster: !!s.doppelMitNaechster, dauer, pauseDanach, name: _str(s.name).slice(0, 40), pauseName: _str(s.pauseName).slice(0, 40) };
  });
  const azm = nArbeitszeitModell(sch.arbeitszeitModell);
  const D = tage.length, H = stunden.length;
  const nL = stunden.filter(s => !s.istPause).length;
  const tagSchluss = {};
  const tsq = sch.tagSchluss && typeof sch.tagSchluss === 'object' ? sch.tagSchluss : {};
  TAGE_ALLE.forEach(t => { const v = _int(tsq[t], 0); if (v >= 1 && v < nL) tagSchluss[t] = v; });
  const vorl = {};
  const v = d.stundentafelVorlagen && typeof d.stundentafelVorlagen === 'object' ? d.stundentafelVorlagen : {};
  Object.keys(v).sort((a, b) => a - b).forEach(jg => {
    const t = {}; const src = v[jg] || {};
    Object.keys(src).sort().forEach(k => { const n = Math.round(_num(src[k], 0) * 2) / 2; if (n > 0) t[k] = n; });
    vorl[jg] = t;
  });
  const stdMinN = standardMinuten({ stunden });
  return dienstVerweiseBereinigen({
    schemaVersion: SCHEMA_VERSION,
    schule: { name: _str(sch.name, 'Meine Schule'), schuljahr: _str(sch.schuljahr), tage, wochenrhythmus: sch.wochenrhythmus === 'AB' ? 'AB' : 'einfach', stunden, tagSchluss, arbeitszeitModell: azm, coRegeln: nCoRegeln(sch.coRegeln), zeitprofile: _arr(sch.zeitprofile).map(z => nZeitprofil(z, stunden)) },
    faecher: _arr(d.faecher).map(nFach),
    raeume: _arr(d.raeume).map(r => nRaum(r, D, H)),
    klassen: _arr(d.klassen).map(k => nKlasse(k, nL)),
    lehrer: _arr(d.lehrer).map(l => nLehrer(l, D, H, azm.standardStunden, azm.maxTagStunden, d.dienste && d.dienste.schichtvorlagen)),
    unterrichte: _arr(d.unterrichte).map(nUnterricht).map(u => {
      if (u.ohneAuto.length) { const ids = new Set(_arr(d.lehrer).map(l => l && String(l.id))); u.ohneAuto = u.ohneAuto.filter(id => ids.has(id)); } // gelöschte Personen fallen heraus
      // Aufgaben in Zeitstunden: die geplanten Rasterstunden folgen dem aktuellen Zeitraster (ändert sich die Stundenlänge, wird neu umgerechnet)
      if (u.aufgabe && u.einheit === 'zstd') {
        const ws = u.zeitstunden > 0 ? _clamp(Math.round(u.zeitstunden * 60 / stdMinN), 1, 60) : 0;
        if (ws !== u.wochenstunden) { u.wochenstunden = ws; if (u.bloecke.reduce((a, b) => a + b, 0) !== ws) { u.bloecke = []; u.bloeckeWoche = []; } }
      }
      return u;
    }),
    stundentafelVorlagen: vorl,
    regeln: nRegeln(d.regeln),
    plan: (() => { const pl = _arr(d.plan && d.plan.platzierungen).map(nPlatz), da = new Set(pl.map(p => p.unterricht + '|' + p.blockNr)); return { platzierungen: pl,
      frei: _arr(d.plan && d.plan.frei).map(x => ({ unterricht: _str(x && x.unterricht), blockNr: _int(x && x.blockNr, 1), lehrer: _str(x && x.lehrer), grund: _str(x && x.grund).slice(0, 200), sig: _str(x && x.sig), rolle: x && (x.rolle === 'co' || x.rolle === 'fach') ? x.rolle : '' })).filter(x => x.unterricht && x.lehrer && pl.length),
      coStand: _str(d.plan && d.plan.coStand),
      besetzung: (() => { const seen = new Set(), personal = new Set(_arr(d.lehrer).filter(l => l && l.art === 'personal').map(l => l.id)); /* weiteres Personal unterrichtet nicht – auch nicht in einzelnen Stunden */ return _arr(d.plan && d.plan.besetzung).map(x => ({ unterricht: _str(x && x.unterricht), blockNr: _int(x && x.blockNr, 1), lehrer: _str(x && x.lehrer), sig: _str(x && x.sig), rolle: x && x.rolle === 'co' ? 'co' : 'fach' })).filter(x => { const k = x.unterricht + '|' + x.blockNr + '|' + x.lehrer; if (!x.unterricht || !x.lehrer || !pl.length || seen.has(k) || personal.has(x.lehrer)) return false; seen.add(k); return true; }); })() }; })(),
    dienste: nDienste(d.dienste),
    akzeptiert: _arr(d.akzeptiert).map(nAkzeptiert).filter(x => x.schluessel).slice(0, 500),
    gta: (() => { const lid = new Set(_arr(d.lehrer).filter(Boolean).map(l => String(l.id))), rid = new Set(_arr(d.raeume).filter(Boolean).map(r => String(r.id))); return _arr(d.gta).slice(0, 300).map(g => nGta(g, D, H, lid, rid)); })(),
    staende: _arr(d.staende).slice(0, 20).map(s => ({
      name: _str(s && s.name, 'Stand'), zeit: _str(s && s.zeit),
      kosten: _num(s && s.kosten, 0), hart: _int(s && s.hart, 0),
      platzierungen: _arr(s && s.platzierungen).map(nPlatz),
      // zum Plan gehören auch die Handbesetzungen und die automatisch zugeteilten Lehrkräfte
      besetzung: _arr(s && s.besetzung), frei: _arr(s && s.frei), auto: _arr(s && s.auto)
    }))
  });
}
/* ---------- GTA (Ganztagsangebote) ----------
   Eine GTA gehört zu KEINER Klasse, nur zu einer oder mehreren Personen – oder zu einer externen Leitung („Extern“ + Name). Sie wird im
   GTA-Planer von Hand in den fertigen Plan gelegt: in Rasterstunden (von–bis) oder zu eigenen Uhrzeiten; ein Raum ist möglich, aber nicht nötig.
   GTAs zählen zur Arbeitszeit der internen Personen, werden bei der Verteilung des Unterrichts aber NICHT berücksichtigt („on top“). Die
   Aufsichtsplanung respektiert sie (die Person ist dann belegt). Externe GTAs zählen nirgends zur Arbeitszeit. */
const GTA_FARBE = '#2f8f6b';
function nGta(x, D, H, lehrerIds, raumIds) {
  x = x && typeof x === 'object' ? x : {};
  const von = _clamp(_int(x.von, 1), 1, Math.max(1, H)), bis = _clamp(_int(x.bis, von), von, Math.max(1, H));
  const tag = x.tag === null || x.tag === undefined || x.tag === '' ? -1 : _clamp(_int(x.tag, -1), -1, Math.max(0, D - 1));
  const raum = _str(x.raum).slice(0, 60);
  return { id: _str(x.id) || neueId('gta'), name: (_str(x.name).trim() || 'GTA').slice(0, 80), farbe: /^#[0-9a-fA-F]{6}$/.test(_str(x.farbe)) ? x.farbe : GTA_FARBE,
    personen: [...new Set(_arr(x.personen).map(v => _str(v)))].filter(id => id && (!lehrerIds || lehrerIds.has(id))).slice(0, 30),
    extern: _str(x.extern).trim().slice(0, 80), raum: raum && (!raumIds || raumIds.has(raum)) ? raum : '', tag, zeitArt: x.zeitArt === 'frei' ? 'frei' : 'raster', von, bis,
    beginn: zeitNorm(x.beginn), ende: zeitNorm(x.ende), dauer: _clamp(_int(x.dauer, 90), 15, 600), notiz: _str(x.notiz).slice(0, 300) };
}
// echte Uhrzeit einer platzierten GTA (Rasterstunden nach dem Zeitraster der Schule, eigene Zeiten wie eingetragen); null = nicht platziert
function gtaIntervall(d, g) {
  if (!g || g.tag < 0 || g.tag >= d.schule.tage.length) return null;
  if (g.zeitArt === 'frei') { const iv = intervall(g.beginn, g.ende); return iv && iv.end > iv.start ? iv : null; }
  const zg = stundenZeiten(d.schule, null), a = zg[g.von - 1], b = zg[g.bis - 1];
  return a && b && b.end > a.start ? { start: a.start, end: b.end } : null;
}
function gtaMinuten(d, g) { const iv = gtaIntervall(d, g); return iv ? iv.end - iv.start : 0; }
function gtaZeileName(d, i) { const s = d.schule.stunden[i]; if (!s) return '?'; return s.istPause ? (s.name || 'Pause') : stundenNummern(d.schule)[i] + '.'; }
function gtaZeitText(d, g, kurz) {
  const iv = gtaIntervall(d, g); if (!iv) return 'nicht platziert';
  const st = d.schule.stunden, nurStd = g.zeitArt === 'raster' && st[g.von - 1] && st[g.bis - 1] && !st[g.von - 1].istPause && !st[g.bis - 1].istPause;
  const r = nurStd && !kurz ? ' (' + (g.von === g.bis ? gtaZeileName(d, g.von - 1) : gtaZeileName(d, g.von - 1) + '–' + gtaZeileName(d, g.bis - 1)) + ' Std.)' : '';
  return (d.schule.tage[g.tag] || '?') + ' ' + zeitText(iv.start) + '–' + zeitText(iv.end) + r;
}
function gtaLeitung(d, g) {
  const n = g.personen.map(id => { const l = d.lehrer.find(x => x.id === id); return l ? (l.kuerzel || l.name || '?') : '?'; });
  if (g.extern) n.push('Extern: ' + g.extern);
  return n.join(', ') || 'ohne Leitung';
}
// Belegung der Räume an einem Tag in echten Uhrzeiten: Unterricht/Aufgaben mit Raum, Sperrzeiten des Raums, GTAs (ohneGta: true = keine,
// eine GTA-ID = alle außer dieser). Map Raum-ID → [{ start, end, text, sperre?, gta? }]
function raumBelegungTag(d, tag, ohneGta) {
  const out = new Map(), add = (rid, x) => { if (!rid) return; if (!out.has(rid)) out.set(rid, []); out.get(rid).push(x); };
  const zc = zeitCache(d), uMap = new Map(d.unterrichte.map(u => [u.id, u])), fMap = new Map(d.faecher.map(f => [f.id, f])), kMap = new Map(d.klassen.map(k => [k.id, k]));
  d.plan.platzierungen.forEach(p => {
    if (p.tag !== tag || !p.raum) return; const u = uMap.get(p.unterricht); if (!u) return;
    const iv = unterrichtsIntervall(d, p, zc, uMap); if (!iv) return;
    add(p.raum, { start: iv.start, end: iv.end, text: u.aufgabe ? (u.name || u.kuerzel || 'Aufgabe') : (((fMap.get(u.fach) || {}).kuerzel) || '?') + ' ' + u.klassen.map(k => (kMap.get(k) || {}).name || '?').join('/') });
  });
  const zg = zc('');
  d.raeume.forEach(r => (((r.verfuegbarkeit || [])[tag]) || []).forEach((v, h) => { if (v === 0 && zg[h] && !d.schule.stunden[h].istPause) add(r.id, { start: zg[h].start, end: zg[h].end, text: 'gesperrt laut Verfügbarkeit', sperre: true }); }));
  if (ohneGta !== true) (d.gta || []).forEach(g => { if (g.tag !== tag || !g.raum || g.id === ohneGta) return; const iv = gtaIntervall(d, g); if (iv) add(g.raum, { start: iv.start, end: iv.end, text: 'GTA „' + g.name + '“', gta: g.id }); });
  return out;
}
// Ist Raum r im Zeitraum iv frei? Teilbare Räume (z. B. Turnhalle mit 2 Teilen) fassen so viele Belegungen gleichzeitig.
function raumFreiFuer(d, belegung, r, iv) {
  const xs = (belegung.get(r.id) || []).filter(x => x.start < iv.end && iv.start < x.end);
  if (xs.some(x => x.sperre)) return { frei: false, grund: 'gesperrt laut Verfügbarkeit' };
  if (xs.length >= Math.max(1, r.teilbar || 1)) return { frei: false, grund: xs.map(x => zeitText(x.start) + '–' + zeitText(x.end) + ' ' + x.text).join(', ') };
  return { frei: true, grund: xs.length ? 'teilweise belegt (teilbar)' : '' };
}
// Konflikte geplanter GTAs nach einer Neuberechnung oder Änderung: Zeit (Unterricht, Co, Aufgaben, Aufsichten, Sperrzeiten, andere GTAs der
// Person), Raum und Arbeitszeit. Nur Warnungen (gelb) – die GTA ist dann so nicht mehr möglich und muss verlegt werden.
function gtaWarnungen(d) {
  const out = [], gl = (d.gta || []).filter(g => g.tag >= 0);
  if (!gl.length) return out;
  const idx = belegungsIndex(d, { ohneGta: true }), lI = new Map(d.lehrer.map(l => [l.id, l]));
  const kz = id => { const l = lI.get(id); return l ? (l.kuerzel || l.name || '?') : '?'; }, tn = t => d.schule.tage[t] || '?';
  const az = new Map(arbeitszeiten(d, { mitTagen: true }).liste.map(x => [x.lehrer, x])), rb = new Map(), ueber = new Set();
  gl.forEach(g => {
    const iv = gtaIntervall(d, g), name = 'GTA „' + g.name + '“ ' + gtaZeitText(d, g, true);
    if (!iv) { out.push({ gta: g.id, art: 'zeit', text: name + ': keine gültige Uhrzeit' }); return; }
    g.personen.forEach(lid => {
      const l = lI.get(lid); if (!l) return;
      // Sperrzeiten und Abwesenheit: für GTAs erlaubt
      ((idx.get(lid) || [])[g.tag] || []).filter(b => b.art !== 'gesperrt' && b.start < iv.end && iv.start < b.end).forEach(b => out.push({ gta: g.id, art: 'zeit', lehrer: lid, text: name + ' nicht mehr möglich – Zeitkonflikt: ' + belegungText(d, lid, b) }));
      gl.forEach(h2 => { if (h2 === g || h2.tag !== g.tag || !h2.personen.includes(lid) || String(h2.id) < String(g.id)) return; const i2 = gtaIntervall(d, h2); if (i2 && i2.start < iv.end && iv.start < i2.end) out.push({ gta: g.id, art: 'zeit', lehrer: lid, text: name + ' überschneidet sich bei ' + kz(lid) + ' mit GTA „' + h2.name + '“ ' + gtaZeitText(d, h2, true) }); });
      const x = az.get(lid);
      if (x && x.soll > 0 && x.summe > x.soll + 3 && !ueber.has(g.id + '|' + lid + '|w')) { ueber.add(g.id + '|' + lid + '|w'); out.push({ gta: g.id, art: 'arbeitszeit', lehrer: lid, text: name + ' nicht mehr möglich – Arbeitszeitüberschreitung! ' + kz(lid) + ': ' + zahlDe(x.summe / 60, 1) + ' h bei ' + zahlDe(x.soll / 60, 1) + ' h Wochenarbeitszeit' }); }
      if (x && x.tag && x.tagMax > 0 && x.tag[g.tag] > x.tagMax + 0.5) out.push({ gta: g.id, art: 'arbeitszeit', lehrer: lid, text: name + ' nicht mehr möglich – Arbeitszeitüberschreitung! ' + kz(lid) + ' am ' + tn(g.tag) + ': ' + zahlDe(x.tag[g.tag] / 60, 1) + ' h bei höchstens ' + zahlDe(x.tagMax / 60, 1) + ' h je Tag' });
    });
    if (g.raum) {
      const r = d.raeume.find(x => x.id === g.raum);
      if (r) { if (!rb.has(g.tag)) rb.set(g.tag, raumBelegungTag(d, g.tag, true)); const bel = new Map(rb.get(g.tag)); gl.forEach(h2 => { if (h2 !== g && h2.tag === g.tag && h2.raum === g.raum) { const i2 = gtaIntervall(d, h2); if (i2) { const a = (bel.get(g.raum) || []).slice(); a.push({ start: i2.start, end: i2.end, text: 'GTA „' + h2.name + '“' }); bel.set(g.raum, a); } } });
        const f = raumFreiFuer(d, bel, r, iv); if (!f.frei) out.push({ gta: g.id, art: 'raum', text: name + ': Raum ' + r.name + ' ist belegt – ' + f.grund }); }
    }
  });
  return out;
}
// Ein bewusst akzeptierter harter Fehler: Schlüssel (Art + Inhalt), Text zum Zeitpunkt des Akzeptierens und die betroffenen Stunden/Aufsichten
// (für das rote Ausrufezeichen im Editor)
function nAkzeptiert(x) {
  x = x && typeof x === 'object' ? x : {};
  const a = x.aufsicht && typeof x.aufsicht === 'object' ? { bedarf: _str(x.aufsicht.bedarf).slice(0, 60), tag: _int(x.aufsicht.tag, 0), beginn: _str(x.aufsicht.beginn).slice(0, 5), ende: _str(x.aufsicht.ende).slice(0, 5) } : null;
  return { schluessel: _str(x.schluessel).slice(0, 600), kat: _str(x.kat).slice(0, 30), text: _str(x.text).slice(0, 600), datum: _str(x.datum).slice(0, 40),
    bloecke: _arr(x.bloecke).map(v => _str(v).slice(0, 80)).slice(0, 60), dienste: _arr(x.dienste).map(v => _str(v).slice(0, 60)).slice(0, 60), aufsicht: a };
}
function leererDatenstand() {
  return normalisiere({ schule: { name: 'Meine Schule', schuljahr: '2026/27' } });
}

// ---------- Datenstand laden ----------
// Neuere Versionen werden abgelehnt. Ältere Stände werden ohne Umbau normalisiert: Fehlende Felder bekommen Standardwerte, nicht mehr
// verwendete Felder (z. B. die frühere Pausenaufsicht oder Stunden „ohne Lehrkraft“ früherer Berechnungen) fallen weg.
function datenstandLaden(d) {
  const v = d && d.schemaVersion !== undefined ? _int(d.schemaVersion, 0) : 0;
  if (v > SCHEMA_VERSION) throw new Error('Der Datenstand hat schemaVersion ' + v + ', diese App kennt nur bis ' + SCHEMA_VERSION + '. Bitte eine neuere App-Version verwenden.');
  return normalisiere(d);
}

