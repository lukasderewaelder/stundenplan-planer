/* =====================================================================
   5. DIENSTE – Zeitprofile, Zeitintervalle, Aufsichtsplanung
   Unterricht bleibt slotbasiert. Aufsichten (Früh-/Spätaufsicht, Aufsicht, Bistro,
   Springer, Betreuung …) werden in echten Uhrzeiten (Minuten seit Mitternacht)
   geplant. Unterrichtsplatzierungen werden bei Bedarf in reale Intervalle übersetzt.
   ===================================================================== */

// ---------- Konstanten ----------
const PRAEF_WERTE = ['gern', 'neutral', 'ungern', 'nicht möglich'];
const RHYTHMUS_ARTEN = { woechentlich: 'wöchentlich', wochentage: 'bestimmte Wochentage', A: 'nur A-Woche', B: 'nur B-Woche', zweiwoechentlich: 'alle zwei Wochen', monatlich: 'einmal im Monat', rotation: 'Rotation', einzel: 'Einzeltermin' };
const DIENST_QUELLEN = ['auto', 'manuell'];
// Interne Aufsichtstypen: fest im Programm, nicht sichtbar und nicht gespeichert (Kategorie steuert Früh-/Spätaufsicht, Springer …)
const DIENSTTYPEN = [
  { id: 'dt_dienst', name: 'Aufsicht', kuerzel: 'A', farbe: '#5f7597', kategorie: 'sonstige' },
  { id: 'dt_frueh', name: 'Frühaufsicht', kuerzel: 'F', farbe: '#f2b134', kategorie: 'fruehdienst' },
  { id: 'dt_spaet', name: 'Spätaufsicht', kuerzel: 'S', farbe: '#8c7ae6', kategorie: 'spaetdienst' },
  { id: 'dt_pause', name: 'Aufsicht', kuerzel: 'P', farbe: '#4f9d69', kategorie: 'aufsicht' },
  { id: 'dt_bistro', name: 'Bistro', kuerzel: 'Bi', farbe: '#e07b39', kategorie: 'aufsicht' },
  { id: 'dt_springer', name: 'Springer', kuerzel: 'Sp', farbe: '#d9534f', kategorie: 'springer', springer: true },
  { id: 'dt_hort', name: 'Hort/Betreuung', kuerzel: 'H', farbe: '#3a9fbf', kategorie: 'betreuung' },
  { id: 'dt_gta', name: 'GTA', kuerzel: 'G', farbe: '#56b3a0', kategorie: 'betreuung' },
  { id: 'dt_orga', name: 'Organisation', kuerzel: 'O', farbe: '#8a8f99', kategorie: 'organisation' },
  { id: 'dt_foerder', name: 'Förderung', kuerzel: 'Fö', farbe: '#c05fa8', kategorie: 'foerderung' },
  { id: 'dt_reserve', name: 'Vertretungsreserve', kuerzel: 'V', farbe: '#b0706a', kategorie: 'springer', springer: true },
  { id: 'dt_sonst', name: 'sonstige Aufgabe', kuerzel: 'X', farbe: '#9aa9c2', kategorie: 'sonstige' }
].map(t => ({ id: t.id, name: t.name, kuerzel: t.kuerzel, farbe: t.farbe, kategorie: t.kategorie, arbeitszeit: true, springer: !!t.springer, qualifikation: '' }));
// Harte (D) und weiche (DW) Regeln der Aufsichtsplanung – getrennt von H01–H15 / W01–W16 des Unterrichts
const DIENST_REGELN = [
  { id: 'D01', hart: true, name: 'Keine Zeitüberschneidung', text: 'Eine Person hat nie gleichzeitig Unterricht, Co-Unterricht, eine Aufgabe oder eine Aufsicht. Direkt aneinander grenzende Zeiten (Ende 09:30, Beginn 09:30) sind erlaubt.' },
  { id: 'D02', hart: true, name: 'Tatsächliche Anwesenheit', text: 'Teilzeit-freie Tage, Ausbildungstage, vollständig gesperrte Tage sowie echte Zeitüberschneidungen schließen eine Aufsicht aus. Persönliche Wunschzeiten für Aufsichten sind dagegen weich und dürfen eine notwendige Besetzung nicht verhindern.' },
  { id: 'D03', hart: true, name: 'Mindestbesetzung', text: 'Jeder Bedarfsabschnitt hat mindestens die eingetragene Mindestzahl an Personen.' },
  { id: 'D04', hart: true, name: 'Fixierte Einsätze bleiben', text: 'Fixierte Aufsichtseinsätze werden von keiner Berechnung verändert.' },
  { id: 'D05', hart: true, name: 'Ausschluss', text: 'Personen ohne Haken „Aufsichten“ sowie Personen, die im jeweiligen Staffelungsabschnitt einzeln oder über eine Personengruppe (z. B. alle Lehrkräfte, alle Co-Kräfte) ausgeschlossen sind, werden dort nicht eingeplant – auch nicht, um eine sonst offene Aufsicht zu füllen. Ausdrückliche Ausschlüsse bleiben hart; persönliche Früh-/Spätwünsche sind nur noch weich.' },
  { id: 'D06', hart: true, name: 'Exklusiver Bereich', text: 'In einem als exklusiv markierten Bereich ist zur selben Zeit höchstens eine Person eingeteilt.' },
  { id: 'D07', hart: true, name: 'Pflichtqualifikation', text: 'Verlangt eine Aufsichtsphase eine Qualifikation (z. B. „ersthelfer“), muss die Person sie besitzen.' },
  { id: 'D10', hart: true, name: 'Gültige Zeiten', text: 'Beginn liegt vor dem Ende, der Tag gehört zur Schulwoche und die zugeordnete Person existiert.' },
  { id: 'D11', hart: true, name: 'Arbeitszeitgrenzen', text: 'Die Wochenarbeitszeit und die Höchstarbeitszeit je Tag werden nicht überschritten (wie „Arbeitszeitgrenzen“ im Stundenplan) – die Automatik besetzt keine Aufsicht über diese Grenzen hinaus. Gezählt wird ausschließlich der endgültige Plan (Unterricht, Co-Unterricht, Aufgaben, Aufsichten). Ist „Arbeitszeitgrenzen“ auf „weich“ gestellt, zählt nur noch die weiche Regel „Arbeitszeit ausgleichen“.' },
  { id: 'D12', hart: true, name: 'Springer ist eine andere Person', text: 'Wer in einer Pause (einem Zeitraum: z. B. Frühstück, Mittag, Spätaufsicht – jeweils getrennt) eine feste Aufsicht hat, ist in derselben Pause nie Springer – auch nicht vorher oder nachher. In einer anderen Pause desselben Tages ist beides möglich. Fehlt dafür Personal, hat die feste Aufsicht Vorrang; der Springer bleibt offen (gelb).' },
  { id: 'DW01', hart: false, std: 8, name: 'Sollbesetzung erreichen', text: 'Je Person, die zur Sollbesetzung fehlt (Minimum ist gedeckt).' },
  { id: 'DW02', hart: false, std: 9, name: 'Arbeitszeit ausgleichen', text: 'Aufsichten gehen zuerst an die Personen mit den meisten Minusstunden: Die Differenz Ist − Soll der Wochenarbeitszeit soll bei allen möglichst gleich sein (quadratisch gewichtet). Erst bei Gleichstand gilt die Rangfolge sonstiges Personal → Co-Lehrkräfte → Lehrkräfte; danach zählen Lücken, freie Zeiten und persönliche Wünsche.' },
  { id: 'DW03', hart: false, std: 3, name: 'Anwesenheit verlängern', text: 'Eine Aufsicht schließt nach Möglichkeit direkt an Unterricht oder andere Einsätze an. Dieses Komfortziel ist der vollständigen Besetzung und dem Auffüllen freier Soll-Arbeitszeit nachgeordnet.' },
  { id: 'DW04', hart: false, std: 3, name: 'Lücken vermeiden', text: 'Zusätzliche Wartezeit durch Aufsichten wird möglichst vermieden, darf aber notwendige Aufsichten oder das Auffüllen freier Soll-Arbeitszeit nicht verhindern.' },
  { id: 'DW05', hart: false, std: 4, name: 'Frühaufsichten fair verteilen', text: 'Zahl und Minuten der Frühaufsichten gleichmäßig verteilen.' },
  { id: 'DW06', hart: false, std: 4, name: 'Spätaufsichten fair verteilen', text: 'Zahl und Minuten der Spätaufsichten gleichmäßig verteilen.' },
  { id: 'DW07', hart: false, std: 3, name: 'Sehr frühe/späte Einsätze', text: 'Aufsichten vor der Frühgrenze bzw. nach der Spätgrenze zählen stärker und werden reihum vergeben.' },
  { id: 'DW08', hart: false, std: 5, name: 'Früh + spät vermeiden', text: 'Auch wo erlaubt: möglichst nicht Früh- und Spätaufsicht am selben Tag.' },
  { id: 'DW09', hart: false, std: 4, name: 'Kontinuität', text: 'Direkt anschließende Aufsichtsabschnitte möglichst bei derselben Person statt eines Wechsels alle 15 Minuten.' },
  { id: 'DW10', hart: false, std: 3, name: 'Persönliche Wünsche', text: 'Wunschzeiten sowie „gern/ungern/nicht möglich“ beeinflussen die Verteilung erst nach Unterricht, Mindestbesetzung und Soll-Arbeitszeit. Sie sind keine harte Sperre.' },
  { id: 'DW11', hart: false, std: 3, name: 'Stabilität', text: 'Bei „Änderungen gering halten“: bisherige Zuordnungen bevorzugen.' },
  // Persönliche Wünsche sind bei Aufsichten nur weich: Sie entscheiden zwischen mehreren möglichen Personen, verhindern aber keine notwendige Aufsicht.
  { id: 'D08', hart: false, std: 9, name: 'Höchstzahl Früh-/Spätaufsichten (Wunsch)', text: 'Die persönliche Höchstzahl an Früh- bzw. Spätaufsichten je Woche wird möglichst nicht überschritten. Der Wunsch entscheidet zwischen mehreren möglichen Personen; eine notwendige Aufsicht bleibt deswegen nie offen.' },
  { id: 'D09', hart: false, std: 9, name: 'Früh und spät am selben Tag (Wunsch)', text: 'Ist „Früh + spät am selben Tag erlaubt“ nicht gesetzt, bekommt die Person an einem Tag möglichst nicht beides. Der Wunsch entscheidet zwischen mehreren möglichen Personen; eine notwendige Aufsicht bleibt deswegen nie offen.' }
];
// Springer und Vertretungsreserve: Reserve für den Notfall – unbesetzt ist das eine Warnung (gelb), kein harter Fehler
function istSpringerBedarf(b) { if (!b) return false; if (b.springer) return true; const t = DIENSTTYPEN.find(x => x.id === b.typ); return !!(t && t.springer); }
// Die Kennungen (H01, W17, D05, DW02 …) sind interne Schlüssel für Daten, Gewichte und Tests; sichtbare Texte nennen die Regel beim Namen.
const REGEL_NAME = (() => { const m = Object.create(null); REGELN.concat(DIENST_REGELN).forEach(r => { m[r.id] = r.name; }); return m; })();
function regelName(id) { return REGEL_NAME[id] || 'Regel'; }
function regelZitat(id) { return REGEL_NAME[id] ? '„' + REGEL_NAME[id] + '“' : 'Regel'; }
// Rangfolge der Aufsichtsplanung bei Gleichstand im Ausgleich (DW02): 1. sonstiges Personal · 2. Co-Lehrkräfte · 3. Lehrkräfte.
// Kleiner Bonus je 15 Minuten – er entscheidet nur zwischen Personen mit etwa gleicher Differenz Ist − Soll.
const AUFSICHT_RANG = { personal: 8, co: 3, lk: 0 };
function aufsichtRang(l) { return !l ? 'lk' : l.art === 'personal' ? 'personal' : (l.ausgebildet === false ? 'co' : 'lk'); }

// ---------- Zeit-Hilfen ----------
// Uhrzeit aus freier Eingabe: "7:5", "0745", "7.45", "7,45", "7 Uhr 45", "7" → "07:45" bzw. "07:00"; sonst ''
function zeitNorm(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'number' && Number.isFinite(v)) return zeitText(v);
  const s = String(v).trim().toLowerCase().replace(/\s*uhr\s*/g, ':').replace(/[.,h ]/g, ':').replace(/:+/g, ':').replace(/:$/, '');
  let m = /^(\d{1,2}):(\d{1,2})$/.exec(s);
  if (!m) { const n = /^(\d{3,4})$/.exec(s); if (n) m = [0, n[1].slice(0, -2), n[1].slice(-2)]; }
  if (!m) { const n = /^(\d{1,2})$/.exec(s); if (n) m = [0, n[1], '0']; }
  if (!m) return '';
  const hh = Number(m[1]), mm = Number(m[2]);
  if (hh > 24 || mm > 59 || (hh === 24 && mm > 0)) return '';
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}
function dauerText(min) { min = Math.round(Math.abs(min)); const h = Math.floor(min / 60), m = min % 60; return h ? h + ' h' + (m ? ' ' + String(m).padStart(2, '0') + ' min' : '') : m + ' min'; }
function zeitspanneText(a) { return zeitText(a.start) + '–' + (a.end >= 1440 ? '24:00' : zeitText(a.end)); }

// ---------- Allgemeine Zeitintervall-Engine ----------
function intervall(beginn, ende) { const s = minVon(beginn), e = minVon(ende); return s === null || e === null ? null : { start: s, end: e }; }
function intervalleUeberschneiden(a, b) { return a.start < b.end && b.start < a.end; }
function intervallDauer(a) { return Math.max(0, a.end - a.start); }
// Vereinigung sortierter oder unsortierter Intervalle → [{start,end}] ohne Überlappung
function intervalleVereinigen(liste) {
  const s = liste.filter(x => x && x.end > x.start).map(x => ({ start: x.start, end: x.end })).sort((a, b) => a.start - b.start);
  const out = [];
  s.forEach(x => { const l = out[out.length - 1]; if (l && x.start <= l.end) l.end = Math.max(l.end, x.end); else out.push(x); });
  return out;
}
const wochenSchnitt = (a, b) => a.some(w => b.includes(w));

// ---------- Normalisierung der Dienstdaten ----------
// stunden (optional): globales Raster – Blöcke ohne Stundenangabe bekommen die Stunden, die in ihrer Zeit beginnen
function nZeitprofil(z, stunden) {
  z = z || {};
  const ids = new Set();
  const lz = [];
  let n = 0; _arr(stunden).forEach(s => { if (s && !s.istPause) { n++; lz.push({ n, b: minVon(s.beginn) }); } });
  const ausZeit = b => { const s = minVon(zeitNorm(b.beginn)), e = minVon(zeitNorm(b.ende)); if (s === null || e === null) return null; const t = lz.filter(x => x.b !== null && x.b >= s && x.b < e).map(x => x.n); return t.length ? { von: Math.min(...t), bis: Math.max(...t) } : null; };
  const bloecke = _arr(z.bloecke).map((b, i) => {
    b = b || {};
    let id = _str(b.id) || 'b' + (i + 1); while (ids.has(id)) id += '_'; ids.add(id);
    const auto = b.von === undefined && b.bis === undefined ? ausZeit(b) : null;
    const von = _clamp(_int(auto ? auto.von : b.von, i + 1), 1, 99), bis = Math.max(von, _clamp(_int(auto ? auto.bis : b.bis, von), 1, 99));
    return { id, name: _str(b.name, 'Block ' + (i + 1)).slice(0, 40), von, bis, beginn: zeitNorm(b.beginn), ende: zeitNorm(b.ende) };
  });
  // faecher: Fächer, deren Unterricht in allen Klassen nach diesem Profil läuft (Vorrang vor dem Profil der Klasse)
  // pausen: Namen der eigenen Pausen des Profils, Schlüssel = Nummer der Unterrichtsstunde davor
  const pausen = {};
  const pq = z.pausen && typeof z.pausen === 'object' ? z.pausen : {};
  Object.keys(pq).sort().forEach(k => { const t = _str(pq[k]).trim().slice(0, 40); if (t && /^\d+$/.test(k)) pausen[k] = t; });
  return { id: _str(z.id) || neueId('zp'), name: _str(z.name, 'Zeitprofil').slice(0, 60), bloecke, faecher: _arr(z.faecher).map(String).filter((x, i, a) => x && a.indexOf(x) === i), pausen };
}
function nDienstVerfuegbarkeit(a, D) {
  const out = [];
  _arr(a).forEach(x => {
    if (!x) return;
    const tag = _int(x.tag, -1);
    if (tag < 0 || tag >= Math.max(D, 1) || out.some(y => y.tag === tag)) return;
    const f = zeitNorm(x.fruehestens), s = zeitNorm(x.spaetestens), kein = !!x.keinDienst;
    if (!f && !s && !kein) return;
    out.push({ tag, fruehestens: f, spaetestens: s, keinDienst: kein });
  });
  return out.sort((a, b) => a.tag - b.tag);
}
// Ausschlüsse einer Person (einzige Quelle für „darf die Person diesen Einsatz übernehmen?“): [{ typ, tag, von, bis, bereich, art }]
//   typ      '' = alle Aufsichten, '#pause' = Aufsichten (auch interne Aufsichtstypen der Kategorie Aufsicht), sonst ID eines internen Aufsichtstyps
//   tag      -1 = alle Tage · von/bis leer = ganztägig
//   bereich  '' = alle Bereiche, sonst nur dieser Bereich (Hof, Bistro …)
//   art      'verboten' (Standard) oder 'erlaubt' = Ausnahme, die ein Verbot aufhebt (z. B. „keine Frühaufsicht“, aber „07:15–07:30 erlaubt“)
// Die Regeln sind hart: für die automatische Verteilung und für das Eintragen von Hand.
function nDienstAusschluss(a, D, vorlagen) {
  const out = [];
  _arr(a).forEach(x => {
    if (!x || typeof x !== 'object') return;
    // ältere Stände: Ausschluss einer Schichtvorlage (F2 …) gilt als Zeitfenster dieser Vorlage
    if (x.vorlage) { const v = _arr(vorlagen).find(s => s && s.id === x.vorlage); if (!v) return; x = Object.assign({}, x, { typ: _str(v.typ), von: v.beginn, bis: v.ende, bereich: x.bereich || _str(v.bereich) }); }
    const tag = _int(x.tag, -1), von = zeitNorm(x.von), bis = zeitNorm(x.bis);
    if (tag >= Math.max(D, 1)) return;
    out.push({ typ: _str(x.typ), tag: tag < 0 ? -1 : tag, von, bis, bereich: _str(x.bereich), art: x.art === 'erlaubt' ? 'erlaubt' : 'verboten' });
  });
  return out.slice(0, 60);
}
// Ist die Person für diesen Einsatz ausgeschlossen? Liefert den Text der Regel oder ''.
// typ: ID eines internen Aufsichtstyps oder '#pause' (Aufsicht der Seite „Aufsichten“); start/end in Minuten; bereich: ID des Bereichs (falls bekannt).
function dienstAusgeschlossen(d, l, typ, tag, start, end, bereich) {
  const liste = (l && l.dienstAusschluss) || []; if (!liste.length) return '';
  const DI = d.dienste || {}, ty = DIENSTTYPEN.find(t => t.id === typ);
  // „Aufsichten“ sind die Aufsichten der Seite Aufsichten samt Springern – nach der Übernahme die interne Aufsichtstypen Aufsicht und Springer
  const istAufsicht = typ === '#pause' || typ === 'dt_pause' || typ === 'dt_springer' || !!(ty && (ty.springer || ty.kategorie === 'springer'));
  const passt = r => {
    if (r.tag >= 0 && r.tag !== tag) return 0;
    if (r.bereich && r.bereich !== (bereich || '')) return 0;
    if (r.typ && !(r.typ === typ || ((r.typ === '#pause' || r.typ === 'dt_pause') && istAufsicht))) return 0;
    const a = r.von ? minVon(r.von) : 0, b = r.bis ? minVon(r.bis) : 1440;
    return a <= start && end <= b ? 2 : (start < b && a < end ? 1 : 0); // 2 = liegt ganz im Fenster, 1 = überschneidet es
  };
  if (liste.some(r => r.art === 'erlaubt' && passt(r) === 2)) return ''; // ausdrücklich erlaubt
  for (const r of liste) {
    if (r.art === 'erlaubt' || !passt(r)) continue;
    const was = !r.typ || r.typ === '#pause' ? 'Aufsichten' : ((DIENSTTYPEN.find(t => t.id === r.typ) || {}).name || 'diese Aufsicht');
    const ber = r.bereich ? ' im Bereich ' + ((DI.bereiche || []).find(x => x.id === r.bereich) || { name: '?' }).name : '';
    return 'kein Einsatz für ' + was + ber + (r.tag >= 0 ? ' am ' + (d.schule.tage[r.tag] || '?') : '') + (r.von || r.bis ? ' ' + (r.von && r.bis ? 'von ' + r.von + ' bis ' + r.bis : r.bis ? 'vor ' + r.bis : 'ab ' + r.von) + ' Uhr' : '') + ' (Ausschluss)';
  }
  return '';
}
function nDienstPraeferenzen(p) {
  p = p || {};
  const w = v => v === 'nicht' || v === 'nicht_moeglich' ? 'nicht möglich' : PRAEF_WERTE.includes(v) ? v : 'neutral';
  const mx = v => v === null || v === undefined || v === '' ? null : _clamp(_int(v, 0), 0, 20);
  return { frueh: w(p.frueh), spaet: w(p.spaet), maxFruehdiensteWoche: mx(p.maxFruehdiensteWoche), maxSpaetdiensteWoche: mx(p.maxSpaetdiensteWoche), fruehUndSpaetGleicherTag: !!p.fruehUndSpaetGleicherTag };
}
function nRhythmus(r) {
  r = r || {};
  const art = RHYTHMUS_ARTEN[r.art] ? r.art : r.art === 'A-Woche' ? 'A' : r.art === 'B-Woche' ? 'B' : 'woechentlich';
  const o = { art };
  if (art === 'zweiwoechentlich') o.startWoche = r.startWoche === 'B' ? 'B' : 'A';
  if (art === 'monatlich') { const n = _int(r.ordinal, 1); o.ordinal = [1, 2, 3, 4, -1].includes(n) ? n : 1; }
  if (art === 'rotation') { o.personen = _arr(r.personen).map(String).filter((x, i, a) => x && a.indexOf(x) === i); o.offset = _clamp(_int(r.offset, 0), 0, 99); }
  if (art === 'einzel') o.datum = /^\d{4}-\d{2}-\d{2}$/.test(_str(r.datum)) ? r.datum : '';
  // bestimmte Wochentage: je Tag ein eigener Eintrag derselben Serie; tage = alle Tage der Serie
  if (art === 'wochentage') o.tage = _arr(r.tage).map(x => _int(x, -1)).filter((x, i, a) => x >= 0 && x < 7 && a.indexOf(x) === i).sort((a, b) => a - b);
  return o;
}
function nDienst(x) {
  x = x || {};
  const rh = x.rotation && x.rotation.aktiv ? Object.assign({ art: 'rotation' }, x.rotation) : x.rhythmus;
  return {
    id: _str(x.id) || neueId('di'), lehrer: _str(x.lehrer), tag: _int(x.tag, 0), typ: _str(x.typ) || 'dt_dienst', bereich: x.bereich ? String(x.bereich) : null,
    bedarf: x.bedarf ? String(x.bedarf) : null, name: _str(x.name).slice(0, 80),
    beginn: zeitNorm(x.beginn), ende: zeitNorm(x.ende),
    quelle: DIENST_QUELLEN.includes(x.quelle) ? x.quelle : 'manuell', fixiert: !!x.fixiert, springer: !!x.springer,
    arbeitszeit: x.arbeitszeit === undefined || x.arbeitszeit === null ? null : !!x.arbeitszeit, // null = wie Bedarf bzw. Typ (bleibt auch nach Speichern/Laden)
    qualifikation: _str(x.qualifikation).trim().toLowerCase().slice(0, 40), farbe: /^#[0-9a-fA-F]{6}$/.test(x.farbe || '') ? x.farbe.toLowerCase() : '',
    rhythmus: nRhythmus(rh), serie: x.serie ? String(x.serie) : null,
    notiz: _str(x.notiz).slice(0, 200)
  };
}
function nBedarf(b, typInfo) {
  b = b || {}; typInfo = typInfo || null;
  const ab = _arr(b.abschnitte).map(a => {
    a = a || {};
    const min = _clamp(_int(a.min, 1), 0, 50);
    return { beginn: zeitNorm(a.beginn), ende: zeitNorm(a.ende), min, soll: Math.max(min, _clamp(_int(a.soll, min), 0, 50)),
      ausschlussPersonen: _arr(a.ausschlussPersonen).map(String).filter((x, i, z) => x && z.indexOf(x) === i),
      ausschlussGruppen: _arr(a.ausschlussGruppen).map(String).filter((x, i, z) => x && z.indexOf(x) === i) };
  }).sort((x, y) => (minVon(x.beginn) === null ? 9999 : minVon(x.beginn)) - (minVon(y.beginn) === null ? 9999 : minVon(y.beginn)));
  const springerAlt = !!(typInfo && (typInfo.springer || typInfo.kategorie === 'springer'));
  return { id: _str(b.id) || neueId('db'), tag: Math.max(0, _int(b.tag, 0)), typ: _str(b.typ) || 'dt_dienst', bereich: b.bereich ? String(b.bereich) : null,
    name: _str(b.name, typInfo && typInfo.name ? typInfo.name : 'Aufsicht').slice(0, 80), pauseKey: _str(b.pauseKey),
    arbeitszeit: b.arbeitszeit === undefined ? !(typInfo && typInfo.arbeitszeit === false) : !!b.arbeitszeit,
    springer: b.springer === undefined ? springerAlt : !!b.springer,
    qualifikation: _str(b.qualifikation || (typInfo && typInfo.qualifikation) || '').trim().toLowerCase().slice(0, 40),
    farbe: /^#[0-9a-fA-F]{6}$/.test(b.farbe || '') ? String(b.farbe).toLowerCase() : (typInfo && typInfo.farbe ? typInfo.farbe : '#5f7597'),
    abschnitte: ab, notiz: _str(b.notiz).slice(0, 200), herkunft: _str(b.herkunft) };
}
function nDienstRegeln(r) {
  r = r || {};
  const g = {}, rg = r.gewichte || {};
  DIENST_REGELN.filter(x => !x.hart).forEach(x => { g[x.id] = _clamp(_num(rg[x.id], x.std), 0, 10); });
  const z = (v, d) => zeitNorm(v) || d;
  return {
    springerAnrechnen: false, // Springer zählen nie zur Arbeitszeit (zeitlich blockierend, aber arbeitszeitneutral)
    fruehGrenze: z(r.fruehGrenze, '07:00'), spaetGrenze: z(r.spaetGrenze, '16:00'),
    maxSpanne: _clamp(_int(r.maxSpanne, 600), 60, 1440), langeLuecke: _clamp(_int(r.langeLuecke, 90), 15, 600),
    ansichtVon: z(r.ansichtVon, '06:30'), ansichtBis: z(r.ansichtBis, '17:00'),
    gewichte: g
  };
}
function nDienste(x) {
  const neu = !x || typeof x !== 'object';
  x = neu ? {} : x;
  const bereiche = _arr(x.bereiche).map(b => ({ id: _str(b && b.id) || neueId('a'), name: _str(b && b.name, 'Bereich').slice(0, 60), exklusiv: !!(b && b.exklusiv) }));
  // Ältere Stände speicherten die Typen mit: Name und Farbe eines dort eigenen Typs gehen an den Eintrag, der Typ wird zur allgemeinen Aufsicht
  const alt = new Map(_arr(x.typen).filter(t => t && !DIENSTTYPEN.some(s => s.id === t.id)).map(t => [_str(t.id), t]));
  const typ = y => { const t = alt.get(_str(y && y.typ)); return t ? Object.assign({}, y, { typ: 'dt_dienst', name: y.name || t.name, farbe: y.farbe || t.farbe }) : y; };
  return {
    bereiche,
    bedarfe: _arr(x.bedarfe).map(typ).map(b => nBedarf(b, DIENSTTYPEN.find(t => t.id === _str(b && b.typ)))),
    plan: _arr(x.plan).map(y => nDienst(typ(y))),
    offen: _arr(x.offen).map(typ).map(o => ({ id: _str(o && o.id) || neueId('do'), tag: _int(o && o.tag, 0), typ: _str(o && o.typ) || 'dt_dienst', bereich: o && o.bereich ? String(o.bereich) : null, bedarf: o && o.bedarf ? String(o.bedarf) : null, name: _str(o && o.name).slice(0,80), beginn: zeitNorm(o && o.beginn), ende: zeitNorm(o && o.ende), prio: o && (o.prio === 'soll' || o.prio === 'springer') ? o.prio : 'min', grund: _str(o && o.grund).slice(0, 400) })),
    regeln: nDienstRegeln(x.regeln),
    auto: x.auto === undefined ? true : !!x.auto,
    stand: _str(x.stand),
    // von Hand gesetzte/fixierte Einsätze, die die letzte automatische Planung nicht halten konnte (Überschneidung mit Unterricht) – Meldung der Endvalidierung
    verdraengt: _arr(x.verdraengt).slice(0, 60).map(v => ({ id: _str(v && v.id), lehrer: _str(v && v.lehrer), tag: _int(v && v.tag, 0), typ: _str(v && v.typ) || 'dt_dienst', bereich: v && v.bereich ? String(v.bereich) : null, bedarf: v && v.bedarf ? String(v.bedarf) : null, name: _str(v && v.name).slice(0, 80), beginn: zeitNorm(v && v.beginn), ende: zeitNorm(v && v.ende), fixiert: !!(v && v.fixiert), grund: _str(v && v.grund).slice(0, 300) }))
  };
}
// Nach der Normalisierung: Verweise bereinigen (unbekannte Zeitprofile)
function dienstVerweiseBereinigen(d) {
  const zp = new Set(d.schule.zeitprofile.map(z => z.id));
  d.klassen.forEach(k => { if (k.zeitprofil && !zp.has(k.zeitprofil)) k.zeitprofil = null; });
  // Fächer eines Profils: nur vorhandene Fächer, jedes Fach in höchstens einem Profil
  const fa = new Set(d.faecher.map(x => x.id)), vergeben = new Set();
  d.schule.zeitprofile.forEach(z => { z.faecher = (z.faecher || []).filter(x => fa.has(x) && !vergeben.has(x)); z.faecher.forEach(x => vergeben.add(x)); });
  return d;
}

// ---------- Zeitprofile: reale Zeiten der Unterrichtsstunden ----------
// Liefert je Rasterzeile (0-basiert) {start,end} oder null. Ohne Profil gelten die Zeiten des globalen Rasters.
// Ein Block eines Profils umfasst die Unterrichtsstunden von–bis (gezählt ohne Pausenzeilen); seine Zeit wird gleichmäßig aufgeteilt.
function stundenZeiten(sch, profil) {
  const st = sch.stunden, out = new Array(st.length).fill(null);
  const lnr = stundenNummern(sch);
  st.forEach((s, i) => {
    const b = minVon(s.beginn), e = minVon(s.ende);
    if (b !== null && e !== null && e > b) out[i] = { start: b, end: e };
    if (s.istPause || !profil) return;
    const bl = profil.bloecke.find(x => lnr[i] >= x.von && lnr[i] <= x.bis);
    if (!bl) return;
    const bs = minVon(bl.beginn), be = minVon(bl.ende);
    if (bs === null || be === null || be <= bs) return;
    const anz = bl.bis - bl.von + 1, j = lnr[i] - bl.von;
    out[i] = { start: Math.round(bs + (be - bs) * j / anz), end: Math.round(bs + (be - bs) * (j + 1) / anz) };
  });
  return out;
}
// Zeitcache je Datenstand: Profil-ID ('' = globales Raster) → Zeiten je Zeile
// zc.pids(u): Profile, nach denen ein Unterricht läuft – das Profil seines Fachs hat Vorrang, sonst gelten die Profile seiner Klassen.
function zeitCache(d) {
  const c = new Map();
  const zc = pid => { if (!c.has(pid)) c.set(pid, stundenZeiten(d.schule, pid ? d.schule.zeitprofile.find(z => z.id === pid) || null : null)); return c.get(pid); };
  const ids = new Set(d.schule.zeitprofile.map(z => z.id));
  zc.kp = new Map(d.klassen.map(k => [k.id, k.zeitprofil && ids.has(k.zeitprofil) ? k.zeitprofil : '']));
  zc.fp = new Map();
  d.schule.zeitprofile.forEach(z => (z.faecher || []).forEach(fid => { if (!zc.fp.has(fid)) zc.fp.set(fid, z.id); }));
  zc.pidK = (u, kid) => (u && !u.aufgabe && u.fach && zc.fp.get(u.fach)) || zc.kp.get(kid) || '';
  zc.pids = u => { if (!u) return ['']; const fpid = !u.aufgabe && u.fach ? zc.fp.get(u.fach) : null; if (fpid) return [fpid]; return u.klassen.length ? [...new Set(u.klassen.map(k => zc.kp.get(k) || ''))] : ['']; };
  return zc;
}
// Reales Zeitintervall einer Platzierung. kompatibel=false, wenn gekoppelte Klassen verschiedene Zeiten haben (dann die Vereinigung).
function unterrichtsIntervall(d, p, zc, uMap) {
  zc = zc || zeitCache(d);
  const u = uMap ? uMap.get(p.unterricht) : d.unterrichte.find(x => x.id === p.unterricht);
  const H = d.schule.stunden.length;
  const pids = zc.pids(u);
  const je = pids.map(pid => {
    const z = zc(pid); let s = null, e = null;
    for (let k = 0; k < p.dauer; k++) { const r = p.stunde - 1 + k; if (r < 0 || r >= H || !z[r]) continue; s = s === null ? z[r].start : Math.min(s, z[r].start); e = e === null ? z[r].end : Math.max(e, z[r].end); }
    return s === null ? null : { pid, start: s, end: e };
  }).filter(Boolean);
  if (!je.length) return null;
  const start = Math.min(...je.map(x => x.start)), end = Math.max(...je.map(x => x.end));
  const kompatibel = je.every(x => x.start === je[0].start && x.end === je[0].end);
  return { start, end, ende: end, beginn: zeitText(start), endeText: zeitText(end), kompatibel, je };
}
// Minuten einer Platzierung: Unterricht = Summe der Stunden (nach Zeitprofil); Aufgaben mit „Pausen zählen“ = ganze Spanne vom Beginn bis zum Ende
function platzMinuten(d, u, p, zc) {
  zc = zc || zeitCache(d);
  const st = d.schule.stunden, H = st.length;
  if (u && u.aufgabe && u.pausenZaehlen !== false && p.dauer > 1) { const iv = unterrichtsIntervall(d, p, zc); if (iv && iv.end > iv.start) return iv.end - iv.start; }
  const z = zc(zc.pids(u)[0] || '');
  let m = 0;
  for (let k = 0; k < p.dauer; k++) { const r = p.stunde - 1 + k; if (r < 0 || r >= H || st[r].istPause) continue; m += z[r] ? z[r].end - z[r].start : (st[r].dauer || 45); }
  return m;
}
// Einsatzzeit je Person und Tag in Minuten (größere der beiden Wochen A/B): Unterricht, Co-Einsätze, Aufgaben, Termine, Aufsichten –
// ohne Vorbereitung. Grundlage der Höchstarbeitszeit je Tag (H16, D11). Seltene Aufsichten (monatlich, einzeln) zählen nicht.
function tagesEinsatz(d, idx) {
  idx = idx || belegungsIndex(d);
  const D = d.schule.tage.length, out = new Map();
  idx.forEach((tage, lid) => {
    const a = new Float64Array(D);
    for (let t = 0; t < D; t++) {
      let wa = 0, wb = 0;
      (tage[t] || []).forEach(b => {
        if (!PRAESENZ_ARTEN.has(b.art) || b.selten) return; // Rotationen zählen am Tag voll (wenn die Person an der Reihe ist)
        if (b.springer) return; // Springer: zeitlich blockierend, aber arbeitszeitneutral
        const m = b.min !== undefined ? b.min : b.end - b.start;
        if (!b.wochen || b.wochen.includes('A')) wa += m;
        if (!b.wochen || b.wochen.includes('B')) wb += m;
      });
      a[t] = Math.max(wa, wb);
    }
    out.set(lid, a);
  });
  return out;
}
// ---------- Aufgaben mit festen Terminen (Uhrzeit oder Pause) ----------
// Solche Termine liegen außerhalb des Stundenrasters, z. B. eine Besprechung in der Frühstückspause.
function nTermin(t) { t = t || {}; return { tag: _int(t.tag, 0), pause: _str(t.pause), beginn: zeitNorm(t.beginn) || '', ende: zeitNorm(t.ende) || '' }; }
// Aufgelöste Termine einer Aufgabe: [{i, tag, start, end, minuten, pause (Eintrag der Pausenliste oder null), ungueltig}]
function aufgabeTermine(d, u, pausen, mitUngueltigen) {
  if (!u || !u.aufgabe || !u.termine || !u.termine.length) return [];
  const D = d.schule.tage.length, out = [];
  u.termine.forEach((t, i) => {
    let iv = null, pa = null;
    if (t.pause) { iv = pausenIntervall(d.schule, t.pause); pa = (pausen || (pausen = pausenListe(d.schule, d.klassen))).find(p => p.key === t.pause) || null; if (!pa) iv = null; }
    else iv = intervall(t.beginn, t.ende);
    const ok = !!iv && iv.end > iv.start && t.tag >= 0 && t.tag < D;
    if (!ok && !mitUngueltigen) return;
    out.push({ i, tag: t.tag, start: ok ? iv.start : 0, end: ok ? iv.end : 0, minuten: ok ? iv.end - iv.start : 0, pause: pa, ungueltig: !ok });
  });
  return out;
}
function terminText(d, t) { return (d.schule.tage[t.tag] || '?') + ' ' + (t.pause ? t.pause.kurz + ' ' : '') + zeitText(t.start) + '–' + zeitText(t.end); }
// Wochen, in denen eine Platzierung stattfindet (A/B-Rhythmus)
function platzWochen(u, p, bl) {
  if (u.rhythmus === 'A' || u.rhythmus === 'B') return [u.rhythmus];
  const b = bl && bl.get(u.id), w = b && b.woche ? b.woche[p.blockNr - 1] : null;
  return w === 'A' || w === 'B' ? [w] : ['A', 'B'];
}
// Wochen und durchschnittlicher Wochenanteil eines Dienstes
function dienstWochen(r) { return r.art === 'A' ? ['A'] : r.art === 'B' ? ['B'] : r.art === 'zweiwoechentlich' ? [r.startWoche === 'B' ? 'B' : 'A'] : ['A', 'B']; }
function dienstFaktor(r, lid) {
  switch (r.art) {
    case 'A': case 'B': case 'zweiwoechentlich': return 0.5;
    case 'monatlich': return 12 / 52;
    case 'einzel': return 0;
    case 'rotation': { const n = (r.personen || []).length; return n > 1 ? 1 / n : 1; }
    default: return 1;
  }
}
// regelmäßig = trägt verlässlich zur wöchentlichen Besetzung bei
function dienstRegelmaessig(r) { return r.art === 'woechentlich' || r.art === 'rotation' || r.art === 'wochentage'; }
function rhythmusText(r) {
  if (!r) return '';
  if (r.art === 'monatlich') return (r.ordinal === -1 ? 'letzter' : r.ordinal + '.') + ' im Monat';
  if (r.art === 'zweiwoechentlich') return 'alle 2 Wochen (ab Woche ' + (r.startWoche || 'A') + ')';
  if (r.art === 'rotation') return 'Rotation (' + (r.personen || []).length + ' Pers.' + ((r.personen || []).length > 1 ? ', diese Woche Nr. ' + (((r.offset || 0) % r.personen.length) + 1) : '') + ')';
  if (r.art === 'wochentage') return 'an ' + (r.tage || []).length + ' Wochentagen';
  if (r.art === 'einzel') return 'Einzeltermin' + (r.datum ? ' ' + r.datum.split('-').reverse().join('.') : '');
  return RHYTHMUS_ARTEN[r.art] || '';
}
// Pausenzeit einer (alten) Aufsicht als Intervall
function pausenIntervall(sch, key) {
  key = String(key);
  if (key[0] === 'z') {
    // eigene Pause eines Zeitprofils: z<Profil-ID>:<Nummer der Unterrichtsstunde davor>
    const j = key.lastIndexOf(':'), z = (sch.zeitprofile || []).find(x => x.id === key.slice(1, j)), nr = Number(key.slice(j + 1));
    if (!z) return null;
    const zt = stundenZeiten(sch, z);
    let n = 0, vor = -1, nach = -1;
    sch.stunden.forEach((s, r) => { if (s.istPause) return; n++; if (n === nr) vor = r; else if (n === nr + 1) nach = r; });
    return vor >= 0 && nach >= 0 && zt[vor] && zt[nach] && zt[nach].start > zt[vor].end ? { start: zt[vor].end, end: zt[nach].start } : null;
  }
  const i = Number(key.slice(1)), st = sch.stunden;
  if (!st[i]) return null;
  if (key[0] === 'p') return intervall(st[i].beginn, st[i].ende);
  if (key[0] === 'n' && st[i + 1]) return intervall(st[i].ende, st[i + 1].beginn);
  return null;
}
function dienstIntervall(x) { const iv = intervall(x.beginn, x.ende); return iv && iv.end > iv.start ? iv : null; }
function lehrerNameKurz(l) { return l ? (l.kuerzel || l.name || '?') : '?'; }

// ---------- Gesperrte Zeilen der Verfügbarkeit ----------
// Zeilen mit Wert 0 sind gesperrt; eine Pausenzeile gilt außerdem als gesperrt, wenn die Stunden davor und danach gesperrt sind.
function sperrZeilen(row, st) {
  const H = st ? st.length : row.length, out = new Array(H).fill(false);
  const pause = r => !!(st && st[r] && st[r].istPause);
  for (let r = 0; r < H; r++) if (!pause(r)) out[r] = row[r] === 0;
  for (let r = 0; r < H; r++) if (pause(r)) {
    let v = r - 1; while (v >= 0 && pause(v)) v--;
    let n = r + 1; while (n < H && pause(n)) n++;
    out[r] = row[r] === 0 || (v >= 0 && n < H && out[v] && out[n]);
  }
  return out;
}
function ganzerTagGesperrt(row, st) {
  if (!row || !row.length) return false;
  const H = st ? st.length : row.length;
  let lektionen = 0;
  for (let r = 0; r < H; r++) { if (st && st[r] && st[r].istPause) continue; lektionen++; if (row[r] !== 0) return false; }
  return lektionen > 0;
}
// ---------- Anwesenheitsfenster (D02) ----------
function dienstFenster(l, tag, sch) {
  if (!l) return { abwesend: true, grund: 'unbekannte Person', start: 0, end: 1440 };
  if (l.anwesenheit === 'teilzeit' && l.anwesenheitTage.length && !l.anwesenheitTage.includes(tag)) return { abwesend: true, grund: 'Teilzeit – an diesem Tag nicht anwesend', start: 0, end: 1440 };
  if (l.anwesenheit === 'ausbildungstag' && l.anwesenheitTage.includes(tag)) return { abwesend: true, grund: 'Ausbildungstag', start: 0, end: 1440 };
  const row = l.verfuegbarkeit && l.verfuegbarkeit[tag];
  if (ganzerTagGesperrt(row, sch ? sch.stunden : null)) return { abwesend: true, grund: 'ganzer Tag gesperrt (Verfügbarkeit)', start: 0, end: 1440 };
  // Die aufsichtsspezifischen Angaben sind Wünsche, keine harte Abwesenheit. Mindestbesetzung und das Auffüllen der Soll-Arbeitszeit gehen vor.
  const v = (l.dienstVerfuegbarkeit || []).find(x => x.tag === tag);
  return { abwesend: false, start: 0, end: 1440, eigen: !!v,
    wunschStart: v && v.fruehestens ? minVon(v.fruehestens) : null,
    wunschEnd: v && v.spaetestens ? minVon(v.spaetestens) : null,
    wunschFrei: !!(v && v.keinDienst) };
}

// ---------- Belegungen aller Personen (Unterricht, Co, Aufgaben, Sperrzeiten, Aufsichten) ----------
// Ergebnis: Map lehrerId → Array(D) mit Listen {start,end,art,text,wochen,ref,…}
// opt: { ohneDienste: bool | Set(ids), nurDienste: Set(ids), ohneAufsicht: bool }
function belegungsIndex(d, opt) {
  opt = opt || {};
  const D = d.schule.tage.length, zc = zeitCache(d), H = d.schule.stunden.length;
  const uMap = new Map(d.unterrichte.map(u => [u.id, u]));
  const fMap = new Map(d.faecher.map(f => [f.id, f])), kMap = new Map(d.klassen.map(k => [k.id, k]));
  const bl = bloeckeAlle(d);
  const idx = new Map(d.lehrer.map(l => [l.id, Array.from({ length: D }, () => [])]));
  const freiM = freiMap(d), handB = besetzungMap(d);
  const add = (lid, tag, x) => { const a = idx.get(lid); if (a && tag >= 0 && tag < D) a[tag].push(x); };
  d.plan.platzierungen.forEach(p => {
    const u = uMap.get(p.unterricht); if (!u || p.tag >= D) return;
    const iv = unterrichtsIntervall(d, p, zc, uMap); if (!iv) return;
    const kl = u.klassen.map(k => (kMap.get(k) || {}).name || '?').join('/');
    const f = fMap.get(u.fach);
    const wochen = platzWochen(u, p, bl), minP = platzMinuten(d, u, p, zc);
    const oL = freiM.get(p.unterricht + '|' + p.blockNr), hd = handB.get(p.unterricht + '|' + p.blockNr) || [];
    hd.map(lid => ({ lehrer: lid, rolle: handB.co.has(p.unterricht + '|' + p.blockNr + '|' + lid) ? 'co' : 'fach', modus: 'immer' })).concat(u.lehrkraefte.filter(z => !hd.includes(z.lehrer))).forEach(z => {
      if (!z.lehrer) return;
      if (z.modus === 'anteilig' && !p.co.includes(z.lehrer)) return;
      if (oL && oL.has(z.lehrer)) return; // für diesen Termin ersetzt
      const art = u.aufgabe ? 'aufgabe' : z.rolle === 'co' ? 'co' : 'unterricht';
      const text = u.aufgabe ? (u.name || u.kuerzel || 'Aufgabe') : (kl ? 'Kl. ' + kl + ' · ' : '') + ((f && (f.name || f.kuerzel)) || 'Unterricht') + (art === 'co' ? ' (Co)' : '');
      add(z.lehrer, p.tag, { start: iv.start, end: iv.end, min: minP, art, text, kurz: u.aufgabe ? (u.kuerzel || u.name || 'Aufg.') : kl + ' ' + ((f && f.kuerzel) || ''), farbe: u.aufgabe ? u.farbe : f ? f.farbe : '#9aa9c2', wochen, ref: u.id, block: p.blockNr, je: iv.je, kompatibel: iv.kompatibel, raum: p.raum || null });
    });
  });
  // Aufgaben mit festen Terminen (auch in Pausen) – unabhängig vom Stundenplan
  let pausenL = null;
  d.unterrichte.forEach(u => {
    if (!u.aufgabe || !u.termine || !u.termine.length) return;
    aufgabeTermine(d, u, pausenL || (pausenL = pausenListe(d.schule, d.klassen))).forEach(t => u.lehrkraefte.forEach(z => {
      if (z.lehrer) add(z.lehrer, t.tag, { start: t.start, end: t.end, art: 'aufgabe', text: (u.name || u.kuerzel || 'Aufgabe') + (t.pause ? ' (' + t.pause.kurz + ')' : ''), kurz: u.kuerzel || u.name || 'Aufg.', farbe: u.farbe, wochen: ['A', 'B'], ref: u.id, termin: true });
    }));
  });
  // Sperrzeiten aus der Verfügbarkeit (Wert 0) in globaler Rasterzeit
  const zg = zc('');
  d.lehrer.forEach(l => {
    for (let t = 0; t < D; t++) {
      const row = l.verfuegbarkeit[t] || []; if (ganzerTagGesperrt(row, d.schule.stunden)) continue;
      const gesperrt = sperrZeilen(row, d.schule.stunden);
      let s = -1;
      for (let r = 0; r <= H; r++) {
        const zu = r < H && gesperrt[r] && zg[r];
        if (zu && s < 0) s = r;
        if (!zu && s >= 0) { add(l.id, t, { start: zg[s].start, end: zg[r - 1].end, art: 'gesperrt', text: 'gesperrt laut Verfügbarkeit', kurz: 'gesperrt', wochen: ['A', 'B'], ref: null }); s = -1; }
      }
    }
    // gesperrte Pausen zwischen zwei Stunden
    (l.pausenGesperrt || []).forEach(k => { const [tt, key] = k.split('|'); const iv = pausenIntervall(d.schule, key); if (iv && iv.end > iv.start) add(l.id, Number(tt), { start: iv.start, end: iv.end, art: 'gesperrt', text: 'Pause gesperrt laut Verfügbarkeit', kurz: 'gesperrt', wochen: ['A', 'B'], ref: null, pause: true }); });
  });
  // GTAs (von Hand gelegt) belegen ihre internen Personen; opt.ohneGta: nicht berücksichtigen (Verteilung des Unterrichts, Pflichtprüfungen)
  if (!opt.ohneGta) (d.gta || []).forEach(g => {
    const iv = gtaIntervall(d, g); if (!iv) return;
    const rn = g.raum ? ((d.raeume.find(r => r.id === g.raum) || {}).name || '') : '';
    g.personen.forEach(lid => add(lid, g.tag, { start: iv.start, end: iv.end, art: 'gta', text: 'GTA „' + g.name + '“' + (rn ? ' · ' + rn : ''), kurz: g.name, farbe: g.farbe, wochen: ['A', 'B'], ref: g.id, raum: g.raum || null }));
  });
  // Aufsichten
  const tMap = new Map(DIENSTTYPEN.map(t => [t.id, t]));
  d.dienste.plan.forEach(x => {
    if (opt.ohneDienste === true) return;
    if (opt.ohneDienste instanceof Set && opt.ohneDienste.has(x.id)) return;
    const iv = dienstIntervall(x); if (!iv) return;
    const t = tMap.get(x.typ);
    const e = { start: iv.start, end: iv.end, art: 'dienst', text: (t ? t.name : 'Aufsicht') + (x.bereich ? ' – ' + ((d.dienste.bereiche.find(b => b.id === x.bereich) || {}).name || '') : ''), kurz: t ? t.kuerzel || t.name : 'D', farbe: t ? t.farbe : '#9aa9c2', wochen: dienstWochen(x.rhythmus), ref: x.id, selten: x.rhythmus.art === 'monatlich' || x.rhythmus.art === 'einzel', kategorie: t ? t.kategorie : 'sonstige', springer: !!(x.springer || (t && (t.springer || t.kategorie === 'springer'))), fest: !!x.fixiert || x.quelle !== 'auto' }; // automatische Aufsichten werden bei jeder Berechnung neu vergeben
    add(x.lehrer, x.tag, e);
    if (x.rhythmus.art === 'rotation') x.rhythmus.personen.forEach(pid => { if (pid !== x.lehrer) add(pid, x.tag, Object.assign({}, e, { rotation: true, text: e.text + ' (Rotation)' })); });
  });
  idx.forEach(a => a.forEach(l => l.sort((x, y) => x.start - y.start || x.end - y.end)));
  return idx;
}
function belegungenLehrkraft(d, lid, tag, idx) {
  idx = idx || belegungsIndex(d);
  const a = idx.get(lid);
  return a && a[tag] ? a[tag].slice() : [];
}
const PRAESENZ_ARTEN = new Set(['unterricht', 'co', 'aufgabe', 'dienst', 'gta']);
// Konflikte eines Zeitraums mit vorhandenen Belegungen; opt.ohne = Aufsichts-ID, opt.wochen, opt.nurHart
function personFreiImIntervall(d, lid, tag, beginn, ende, opt) {
  opt = opt || {};
  const iv = intervall(beginn, ende);
  if (!iv) return { frei: false, konflikte: [], gruende: ['ungültige Zeit'] };
  const wochen = opt.wochen || ['A', 'B'];
  const liste = belegungenLehrkraft(d, lid, tag, opt.idx).filter(b => b.ref !== opt.ohne && intervalleUeberschneiden(b, iv) && wochenSchnitt(b.wochen, wochen));
  return { frei: !liste.length, konflikte: liste, gruende: liste.map(b => belegungText(d, lid, b)) };
}
function belegungText(d, lid, b) {
  const l = d.lehrer.find(x => x.id === lid);
  const wer = lehrerNameKurz(l);
  const zeit = ' von ' + zeitText(b.start) + ' bis ' + zeitText(b.end);
  const wo = b.wochen && b.wochen.length === 1 ? ' (Woche ' + b.wochen[0] + ')' : '';
  if (b.art === 'unterricht') return wer + ' unterrichtet ' + b.text + zeit + wo + '.';
  if (b.art === 'co') return wer + ' ist Co-Lehrkraft in ' + b.text.replace(' (Co)', '') + zeit + wo + '.';
  if (b.art === 'aufgabe') return wer + ' hat die Aufgabe „' + b.text + '“' + zeit + wo + '.';
  if (b.art === 'gesperrt') return wer + ' ist' + zeit + ' gesperrt (Verfügbarkeit).';
  return wer + ' hat bereits ' + b.text + zeit + wo + (b.rotation ? ' (Rotation)' : '') + '.';
}
// Anwesenheit eines Tages: erster Beginn, letztes Ende, Spanne, aktive Zeit, Lücken (in Minuten)
// extra: zusätzliche Intervalle (z. B. ein geplanter Dienst). Seltene Aufsichten (monatlich, einzeln) zählen nicht.
function tagesAnwesenheit(d, lid, tag, idx, extra) {
  const alle = belegungenLehrkraft(d, lid, tag, idx).filter(b => PRAESENZ_ARTEN.has(b.art) && !b.selten && !b.rotation).concat(extra || []);
  let best = null;
  ['A', 'B'].forEach(w => {
    const u = intervalleVereinigen(alle.filter(b => !b.wochen || b.wochen.includes(w)));
    if (!u.length) return;
    const ersterBeginn = u[0].start, letztesEnde = u[u.length - 1].end, spanne = letztesEnde - ersterBeginn;
    const aktiv = u.reduce((s, x) => s + x.end - x.start, 0);
    const r = { ersterBeginn, letztesEnde, spanne, aktiv, luecken: spanne - aktiv, intervalle: u };
    if (!best || r.spanne > best.spanne) best = r;
  });
  return best || { ersterBeginn: null, letztesEnde: null, spanne: 0, aktiv: 0, luecken: 0, intervalle: [] };
}

// ---------- Signatur der Aufsichtsgrundlagen („Aufsichtsplan nicht mehr aktuell“) ----------
function _hash(t) { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return (h >>> 0).toString(16); }
function dienstGrundlagenSignatur(d) {
  const t = JSON.stringify([
    d.plan.platzierungen.map(p => [p.unterricht, p.blockNr, p.tag, p.stunde, p.dauer, p.co]),
    d.schule.stunden.map(s => [s.beginn, s.ende, s.istPause]), d.schule.tage, d.schule.zeitprofile, d.klassen.map(k => [k.id, k.zeitprofil]),
    d.unterrichte.map(u => [u.id, u.fach, u.klassen, u.rhythmus, u.lehrkraefte.map(z => [z.lehrer, z.rolle, z.modus]), u.termine || []]),
    d.lehrer.map(l => [l.id, l.aufsicht, l.anwesenheit, l.anwesenheitTage, l.verfuegbarkeit, l.dienstVerfuegbarkeit, l.dienstPraeferenzen, l.qualifikationen, l.arbeitszeit]),
    d.dienste.bedarfe.map(b => [b.tag, b.typ, b.bereich, b.abschnitte]), DIENSTTYPEN, d.dienste.bereiche,
    d.dienste.plan.filter(x => x.fixiert).map(x => [x.id, x.lehrer, x.tag, x.typ, x.bereich, x.beginn, x.ende, x.rhythmus])
  ].concat((d.plan.besetzung || []).length || (d.plan.frei || []).length ? [(d.plan.besetzung || []).map(b => [b.unterricht, b.blockNr, b.lehrer, b.rolle]), (d.plan.frei || []).map(a => [a.unterricht, a.blockNr, a.lehrer])] : [])); // Besetzung einzelner Stunden von Hand
  return _hash(t) + ':' + t.length;
}
function schichtenAusKurve(punkte) {
  const offen = [], out = [];
  let cur = 0;
  punkte.forEach(({ t, n }) => {
    while (cur < n) { offen.push(t); cur++; }
    while (cur > n) { const s = offen.shift(); if (t > s) out.push({ start: s, end: t }); cur--; }
  });
  return out.sort((a, b) => a.start - b.start || b.end - a.end);
}
// Bedarfskurve (Minimum oder Soll) aus Abschnitten, abzüglich einer bereits vorhandenen Besetzung
function bedarfsKurve(abschnitte, feld, abzug) {
  const tp = new Set();
  abschnitte.forEach(a => { const iv = intervall(a.beginn, a.ende); if (iv && iv.end > iv.start) { tp.add(iv.start); tp.add(iv.end); } });
  (abzug || []).forEach(x => { tp.add(x.start); tp.add(x.end); });
  const ts = [...tp].sort((a, b) => a - b);
  const wert = t => {
    let n = 0;
    abschnitte.forEach(a => { const iv = intervall(a.beginn, a.ende); if (iv && t >= iv.start && t < iv.end) n += a[feld]; });
    let c = 0; (abzug || []).forEach(x => { if (t >= x.start && t < x.end) c++; });
    return Math.max(0, n - c);
  };
  const out = [];
  ts.forEach(t => { const n = wert(t); if (!out.length || out[out.length - 1].n !== n) out.push({ t, n }); });
  if (out.length && out[out.length - 1].n !== 0) out.push({ t: ts[ts.length - 1], n: 0 });
  return out;
}
// Eine lange Bedarfsschicht wird an Grenzen mit wechselnden Ausschlüssen geteilt.
// Dadurch kann z. B. 14:45–15:30 Person A ausgeschlossen sein, ohne A automatisch auch 15:30–17:00 zu sperren.
function schichtenNachAusschlussTeilen(b, liste) {
  if (!b || !liste || !liste.length) return liste || [];
  const gr = new Set();
  (b.abschnitte || []).forEach(a => {
    if (!(a.ausschlussPersonen || []).length && !(a.ausschlussGruppen || []).length) return;
    const iv = intervall(a.beginn, a.ende); if (!iv) return; gr.add(iv.start); gr.add(iv.end);
  });
  if (!gr.size) return liste;
  const grenzen = [...gr].sort((a, c) => a - c), out = [];
  liste.forEach(q => {
    const pts = [q.start].concat(grenzen.filter(t => t > q.start && t < q.end), [q.end]);
    for (let i = 0; i + 1 < pts.length; i++) {
      const z = Object.assign({}, q, { start: pts[i], end: pts[i + 1] });
      const ax = bedarfAusschlussFuerIntervall(b, z.start, z.end); z.personen = ax.personen; z.gruppen = ax.gruppen; out.push(z);
    }
  });
  return out;
}

// ---------- Eigenschaften eines Aufsichtsbedarfs ----------
function bedarfVonDienst(d, x) { return x && x.bedarf ? (d.dienste.bedarfe.find(b => b.id === x.bedarf) || null) : null; }
function bedarfAusschlussFuerIntervall(b, start, end) {
  const personen = new Set(), gruppen = new Set();
  if (!b) return { personen: [], gruppen: [] };
  (b.abschnitte || []).forEach(a => { const iv = intervall(a.beginn, a.ende); if (!iv || !(iv.start < end && start < iv.end)) return; (a.ausschlussPersonen || []).forEach(x => personen.add(x)); (a.ausschlussGruppen || []).forEach(x => gruppen.add(x)); });
  return { personen: [...personen], gruppen: [...gruppen] };
}
function personInDienstGruppe(d, l, gid) {
  if (!l || !gid) return false;
  if (gid === 'rolle:lk') return l.art !== 'personal' && l.ausgebildet !== false;
  if (gid === 'rolle:co') return l.art !== 'personal' && l.ausgebildet === false;
  if (gid === 'rolle:personal') return l.art === 'personal';
  if (gid.startsWith('team:')) { const k = d.klassen.find(x => x.id === gid.slice(5)); return !!(k && (k.team || []).includes(l.id)); }
  return false;
}
function dienstMeta(d, x, iv) {
  iv = iv || dienstIntervall(x) || { start: 0, end: 0 };
  const b = bedarfVonDienst(d, x), t = DIENSTTYPEN.find(y => y.id === x.typ);
  const R = d.dienste.regeln || {}, fg = minVon(R.fruehGrenze), sg = minVon(R.spaetGrenze);
  const biv = b ? (b.abschnitte || []).map(a => intervall(a.beginn, a.ende)).filter(v => v && v.end > v.start) : [];
  const bs = biv.length ? Math.min(...biv.map(v => v.start)) : iv.start, be = biv.length ? Math.max(...biv.map(v => v.end)) : iv.end;
  const springer = x.springer || !!(b && b.springer) || !!(t && (t.springer || t.kategorie === 'springer'));
  let kat = 'sonstige';
  if (springer) kat = 'springer';
  else if (fg !== null && bs <= fg && be <= 12 * 60) kat = 'fruehdienst';
  else if (sg !== null && be >= sg && bs >= 12 * 60) kat = 'spaetdienst';
  else if (b && b.pauseKey) kat = 'aufsicht';
  else if (!b && t && ['fruehdienst','spaetdienst','aufsicht'].includes(t.kategorie)) kat = t.kategorie;
  const ax = bedarfAusschlussFuerIntervall(b, iv.start, iv.end);
  return {
    bedarf: b, name: (x.name || (b && b.name) || (t && t.name) || 'Aufsicht'),
    arbeitszeit: x.arbeitszeit === null || x.arbeitszeit === undefined ? (b ? b.arbeitszeit !== false : !(t && t.arbeitszeit === false)) : x.arbeitszeit !== false,
    springer, qualifikation: x.qualifikation || (b && b.qualifikation) || (t && t.qualifikation) || '',
    farbe: x.farbe || (b && b.farbe) || (t && t.farbe) || '#5f7597', kat,
    ausschlussPersonen: x.ausschlussPersonen || ax.personen, ausschlussGruppen: x.ausschlussGruppen || ax.gruppen
  };
}
function dienstGruppenOptionen(d) {
  return [['rolle:lk','alle Lehrkräfte'], ['rolle:co','alle Co-Kräfte'], ['rolle:personal','weiteres Personal']].concat(d.klassen.filter(k => (k.team || []).length).map(k => ['team:' + k.id, 'Klassenteam ' + k.name]));
}

// ---------- Besetzung ----------
// Neue Einsätze sind genau einem Bedarf zugeordnet. Für alte Daten bleibt Typ/Bereich als Rückfall erhalten.
function dienstPasstZuBedarf(x, b) { if (x.bedarf) return x.bedarf === b.id; return x.tag === b.tag && x.typ === b.typ && (!b.bereich || x.bereich === b.bereich); }
// Besetzung je Abschnitt: kleinste Zahl gleichzeitig eingeteilter Personen im Abschnitt (bei A/B-Wochen die schwächere Woche).
// Seltene Aufsichten (monatlich, Einzeltermin) zählen nicht zur regelmäßigen Besetzung.
function besetzungBedarf(d, b, plan) {
  plan = plan || d.dienste.plan;
  const passende = plan.filter(x => dienstPasstZuBedarf(x, b) && dienstIntervall(x) && x.rhythmus.art !== 'monatlich' && x.rhythmus.art !== 'einzel');
  const spr = istSpringerBedarf(b); // Springer sind Reserve: unbesetzt nur gelb
  return b.abschnitte.map(a => {
    const iv = intervall(a.beginn, a.ende);
    if (!iv || iv.end <= iv.start) return { beginn: a.beginn, ende: a.ende, min: a.min, soll: a.soll, ist: 0, status: 'err', ungueltig: true, fehltMin: a.min, fehltSoll: a.soll };
    let ist = Infinity;
    ['A', 'B'].forEach(w => {
      const xs = passende.filter(x => {
        if (!dienstWochen(x.rhythmus).includes(w)) return false;
        const l = d.lehrer.find(q => q.id === x.lehrer);
        if ((a.ausschlussPersonen || []).includes(x.lehrer)) return false;
        if (l && (a.ausschlussGruppen || []).some(g => personInDienstGruppe(d, l, g))) return false;
        return true;
      }).map(dienstIntervall).filter(v => intervalleUeberschneiden(v, iv));
      const pts = new Set([iv.start]);
      xs.forEach(v => { if (v.start > iv.start && v.start < iv.end) pts.add(v.start); if (v.end > iv.start && v.end < iv.end) pts.add(v.end); });
      pts.forEach(t => { const n = xs.filter(v => t >= v.start && t < v.end).length; if (n < ist) ist = n; });
    });
    if (ist === Infinity) ist = 0;
    return { beginn: a.beginn, ende: a.ende, min: a.min, soll: a.soll, ist, springer: spr, status: ist < a.min ? (spr ? 'warn' : 'err') : ist < a.soll ? 'warn' : 'ok', fehltMin: Math.max(0, a.min - ist), fehltSoll: Math.max(0, a.soll - Math.max(ist, a.min)) };
  });
}

// ---------- Aufsichtsminuten je Person (für Arbeitszeit, Fairness, Übersichten) ----------
// prot (optional): Liste, in die jeder Einsatz je Person mit angerechneten Minuten und Grund geschrieben wird (Arbeitszeitnachweis)
function dienstMinutenJeLehrer(d, prot) {
  const R = d.dienste.regeln;
  const out = new Map(d.lehrer.map(l => [l.id, { fruehdienst: 0, spaetdienst: 0, aufsicht: 0, springer: 0, springerGezaehlt: 0, sonstige: 0, dienst: 0, anzahl: 0, anzahlFrueh: 0, anzahlSpaet: 0, sehrFrueh: 0, sehrSpaet: 0, seltene: 0 }]));
  d.dienste.plan.forEach(x => {
    const iv = dienstIntervall(x); if (!iv) return;
    const m = dienstMeta(d, x, iv);
    const personen = x.rhythmus.art === 'rotation' && x.rhythmus.personen.length ? x.rhythmus.personen : [x.lehrer];
    personen.forEach(pid => {
      const o = out.get(pid); if (!o) return;
      const f = dienstFaktor(x.rhythmus, pid), min = (iv.end - iv.start) * f;
      const P = (angerechnet, grund) => { if (prot) prot.push({ lehrer: pid, art: 'dienst', dienst: x.id, dauer: iv.end - iv.start, f, min: angerechnet, grund, name: m.name }); };
      if (!f) { o.seltene++; P(0, 'selten'); return; }
      o.anzahl += f;
      const zaehle = (feld, sehr, istSehr) => { const k = feld + '|' + x.tag; o._t = o._t || {}; const alt = o._t[k] || { f: 0, s: 0 }; const neuF = Math.max(alt.f, f), neuS = istSehr ? Math.max(alt.s, f) : alt.s; o[feld] += neuF - alt.f; o[sehr] += neuS - alt.s; o._t[k] = { f: neuF, s: neuS }; };
      if (m.kat === 'fruehdienst') zaehle('anzahlFrueh', 'sehrFrueh', iv.start < minVon(R.fruehGrenze));
      if (m.kat === 'spaetdienst') zaehle('anzahlSpaet', 'sehrSpaet', iv.end > minVon(R.spaetGrenze));
      if (!m.arbeitszeit) { P(0, 'neutral'); return; }
      if (m.springer) { o.springer += min; if (!R.springerAnrechnen) { P(0, 'springer'); return; } o.springerGezaehlt += min; }
      else if (m.kat === 'fruehdienst') o.fruehdienst += min;
      else if (m.kat === 'spaetdienst') o.spaetdienst += min;
      else if (m.kat === 'aufsicht') o.aufsicht += min;
      else o.sonstige += min;
      o.dienst += min; P(min, '');
    });
  });
  out.forEach(o => { delete o._t; });
  return out;
}

