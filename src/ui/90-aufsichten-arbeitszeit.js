/* =====================================================================
   5d. OBERFLÄCHE – Aufsichten und Arbeitszeit
   ===================================================================== */
// ---------- Aufsichten & Dienste einer Person: eine Quelle für Druck/PDF, HTML-Weitergabe, CSV und Editor ----------
// Alle Einsätze der Person aus d.dienste.plan – ohne Filter nach Art (Pause, Früh, Spät, Bistro, Springer, Betreuung/GTA, Organisation, Sonstige) –
// sowie Einsätze, an denen sie über eine Rotation beteiligt ist. Sortiert nach Tag, dann Beginn.
function aufsichtenLehrerZeilen(d, lid) {
  const DI = d.dienste || {};
  return (DI.plan || []).filter(x => x.lehrer === lid || (x.rhythmus && x.rhythmus.art === 'rotation' && (x.rhythmus.personen || []).includes(lid))).map(x => {
    const iv = dienstIntervall(x) || { start: 0, end: 0 };
    const m = dienstMeta(d, x, iv), titel = dienstTitel(x), b = dBereich(x.bereich || (m.bedarf && m.bedarf.bereich)), t = DIENSTTYPEN.find(y => y.id === x.typ);
    const hin = [], inhalt = [];
    // im Druck bleibt nur die Kennzeichnung „Springer“ (falls der Name sie nicht schon trägt), ohne Erklärung zur Arbeitszeit
    if (m.springer && !/springer/i.test(titel)) inhalt.push('Springer');
    if (m.springer) hin.push(DI.regeln && DI.regeln.springerAnrechnen ? 'Springer' : 'Springer – nicht auf Arbeitszeit angerechnet');
    else if (!m.arbeitszeit) hin.push('nicht auf Arbeitszeit angerechnet');
    if (x.rhythmus && x.rhythmus.art !== 'woechentlich') inhalt.push(rhythmusText(x.rhythmus));
    if (x.notiz) inhalt.push(x.notiz);
    hin.push(...inhalt.filter(t => t !== 'Springer'));
    // Anzeige ohne angehängte Uhrzeit („Große Pause (09:05–09:25)“ → „Große Pause“) – die Zeit steht in ihrer eigenen Spalte
    return { x, iv, m, titel, kurz: titel.replace(/\s*\(\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}\)\s*$/, '') || titel, bereich: b ? b.name : '', hinweis: hin.filter(Boolean).join(' · '), hinweisDruck: inhalt.filter(Boolean).join(' · '), sym: (t && t.kuerzel) || titel.slice(0, 1).toUpperCase(), schluessel: x.tag + '|' + x.beginn + '|' + titel + '|' + lid };
  }).sort((a, b) => a.x.tag - b.x.tag || a.iv.start - b.iv.start || a.iv.end - b.iv.end);
}
// Summenzeile: Aufsichten (Minuten/Stunden), davon Früh-/Spätaufsichten, Springer gesondert – Werte aus dienstMinutenJeLehrer
function aufsichtenLehrerSumme(d, lid) {
  const dm = dienstMinutenJeLehrer(d).get(lid); if (!dm) return '';
  const an = !!(d.dienste.regeln && d.dienste.regeln.springerAnrechnen), auf = dm.dienst - (an ? dm.springerGezaehlt : 0);
  const teile = ['Aufsichten ' + zahlDe(auf, 0) + ' min (' + zahlDe(auf / 60, 1) + ' h) je Woche'];
  const davon = [];
  if (dm.anzahlFrueh) davon.push('Frühaufsichten ' + zahlDe(dm.anzahlFrueh, 1) + '× (' + zahlDe(dm.fruehdienst, 0) + ' min)');
  if (dm.anzahlSpaet) davon.push('Spätaufsichten ' + zahlDe(dm.anzahlSpaet, 1) + '× (' + zahlDe(dm.spaetdienst, 0) + ' min)');
  if (davon.length) teile.push('davon ' + davon.join(', '));
  if (dm.springer) teile.push('Springer ' + zahlDe(dm.springer, 0) + ' min (' + (an ? 'angerechnet' : 'arbeitszeitneutral') + ')');
  return teile.join(' · ');
}
// Tabelle „Aufsichten & Dienste“: Tag · Zeit · Aufsicht · Bereich · Hinweis.
// opt: farbe (Farbbalken der Aufsichtsart; ohne Farbe ein Symbolbuchstabe) · spalten (1–3 nebeneinander) · ab/max (Ausschnitt für Seite und Fortsetzung)
//      leerNotiz (einzeilige Notiz „Keine Aufsichten“, wenn die Person für Aufsichten vorgesehen ist) · fortsetzung
function aufsichtenBlockLehrer(d, lid, opt) {
  opt = Object.assign({ farbe: true, spalten: 0, ab: 0, max: Infinity }, opt || {});
  const alle = aufsichtenLehrerZeilen(d, lid);
  if (!alle.length) {
    const l = d.lehrer.find(y => y.id === lid);
    return opt.leerNotiz && l && l.aufsicht !== false && ((d.dienste || {}).plan || []).length ? h('div', { class: 'aufsblock leer', 'data-person': lid }, h('b', {}, 'Aufsichten & Dienste: '), 'Keine Aufsichten') : null;
  }
  const zeilen = alle.slice(opt.ab, opt.ab + opt.max).map(z => opt.druck ? Object.assign({}, z, { hinweis: z.hinweisDruck }) : z);
  if (!zeilen.length) return null;
  const sp = Math.max(1, Math.min(3, opt.spalten || (zeilen.length > 8 ? 2 : 1))), je = Math.ceil(zeilen.length / sp);
  const tag = t => sp > 1 ? (d.schule.tage[t] || '?') : (TAGE_LANG[d.schule.tage[t]] || d.schule.tage[t] || '?');
  const hatHin = zeilen.some(z => z.hinweis), ohneHin = opt.druck && !hatHin; // im Druck ohne Hinweise: keine leere Spalte
  const tab = teil => h('table', { class: 'aufstab' },
    h('colgroup', {}, (ohneHin ? (sp === 1 ? [13, 14, 40, 33] : [8, 26, 38, 28]) : sp === 1 ? [11, 12, 25, 20, 32] : hatHin ? [7, 24, 26, 19, 24] : [7, 24, 33, 28, 8]).map(w => h('col', { style: { width: w + '%' } }))),
    h('thead', {}, h('tr', {}, ['Tag', 'Zeit', 'Aufsicht', 'Bereich'].concat(ohneHin ? [] : ['Hinweis']).map(t => h('th', {}, t)))),
    h('tbody', {}, teil.map(z => h('tr', { 'data-aufsb': z.schluessel, class: z.m.springer ? 'springer' : null },
      h('td', {}, tag(z.x.tag)), h('td', {}, z.x.beginn + '–' + z.x.ende),
      h('td', { title: z.titel }, opt.farbe ? h('span', { class: 'afp', style: { background: z.m.farbe || '#5f7597' } }) : h('span', { class: 'afs' }, z.sym), h('b', {}, z.kurz)),
      h('td', { title: z.bereich || null }, z.bereich || '–'), ohneHin ? null : h('td', { class: 'hin', title: z.hinweis || null }, z.hinweis)))));
  return h('div', { class: 'aufsblock', 'data-person': lid, style: { '--sp': sp } },
    h('div', { class: 'ab-kopf' }, h('b', {}, opt.fortsetzung ? 'Aufsichten & Dienste (Fortsetzung)' : 'Aufsichten & Dienste'),
      opt.fortsetzung ? null : h('span', { class: 'ab-summe' }, aufsichtenLehrerSumme(d, lid)),
      !opt.fortsetzung && alle.length > opt.ab + zeilen.length ? h('span', { class: 'ab-summe' }, '· weitere ' + (alle.length - opt.ab - zeilen.length) + ' auf der Folgeseite') : null),
    h('div', { class: 'ab-spalten' }, Array.from({ length: sp }, (_, i) => zeilen.slice(i * je, (i + 1) * je)).filter(t => t.length).map(tab)));
}
// Lehrer-Seite mit Aufsichten: eine A4-Seite je Person (188 mm nutzbare Höhe). Die Seite wird unsichtbar in Druckbreite aufgebaut und
// ausgemessen: Der Aufsichtenblock steht unter dem Wochenplan, zuerst ein-, dann zwei- und dreispaltig; reicht der Platz nicht,
// schrumpft die Schrift des Wochenplans (bis 72 %), erst danach läuft der Rest auf eine Fortsetzungsseite – nichts wird abgeschnitten.
// Rückgabe: Block für die Fortsetzungsseite oder null.
function lehrerSeiteEinpassen(d, id, seite, tab, farbe) {
  const n = aufsichtenLehrerZeilen(d, id).length, fuss = seite.lastChild;
  const setze = b => { const alt = seite.querySelector(':scope > .aufsblock'); if (alt) alt.remove(); if (b) seite.insertBefore(b, fuss); };
  if (!n) { const notiz = aufsichtenBlockLehrer(d, id, { farbe, leerNotiz: true, druck: true }); setze(notiz); return null; }
  seite.classList.add('mitaufsicht');
  let sp = n <= 6 ? 1 : n <= 16 ? 2 : 3, skal = 1, auf = n;
  const bau = () => setze(aufsichtenBlockLehrer(d, id, { farbe, spalten: sp, max: auf, druck: true }));
  const mess = h('div', { class: 'druckmess', 'aria-hidden': 'true' }, seite);
  document.body.append(mess);
  try {
    const passt = () => seite.getBoundingClientRect().height * 25.4 / 96 <= 187.2;
    bau();
    while (!passt() && sp < 3) { sp++; bau(); }
    while (!passt() && skal > 0.72) { skal = Math.round((skal - 0.04) * 100) / 100; tab.classList.add('skal'); tab.style.setProperty('--ds', String(skal)); }
    while (!passt() && auf > Math.min(n, 3)) { auf = Math.max(Math.min(n, 3), auf - sp); bau(); }
  } finally { mess.remove(); }
  return auf < n ? aufsichtenBlockLehrer(d, id, { farbe, spalten: 3, ab: auf, fortsetzung: true, druck: true }) : null;
}
// ---------- Arbeitszeitnachweis einer Person: jede Zahl der Übersicht mit ihrer Rechnung ----------
// Einzige Quelle sind die Buchungen von arbeitszeiten(…, { protokoll: true }) – dieselben Zahlen wie in der Übersicht.
// Einheiten: h = Zeitstunden (60 min), UStd. = Unterrichtsstunden (Zeilen des Zeitrasters), min = Minuten.
const zStd = m => zahlDe(m / 60, 2) + ' h';
const uStd = n => zahlDe(n, 2) + ' UStd.';
const minText = m => zahlDe(m, 1) + ' min';
function kursName(d, u) {
  if (!u) return '?';
  if (u.aufgabe) return u.name || u.kuerzel || 'Aufgabe';
  const f = d.faecher.find(x => x.id === u.fach), kl = u.klassen.map(k => (d.klassen.find(x => x.id === k) || {}).name || '?').join('/');
  const gr = (u.gruppen || []).map(g => { for (const k of d.klassen) { const x = (k.gruppen || []).find(y => y.id === g); if (x) return x.name; } return '?'; });
  return ((f && (f.kuerzel || f.name)) || '?') + ' ' + (kl || '–') + (gr.length ? ' (' + gr.join(', ') + ')' : '');
}
function arbeitszeitNachweis(d, lid, opt) {
  opt = opt || {};
  const l = d.lehrer.find(x => x.id === lid), hatPlan = d.plan.platzierungen.length > 0;
  const az = arbeitszeiten(d, { mitTagen: hatPlan, protokoll: true }), x = az.liste.find(y => y.lehrer === lid);
  if (!l || !x) return h('p', {}, 'Person nicht gefunden.');
  const am = d.schule.arbeitszeitModell || ARBEITSZEIT_STD, P = az.protokoll.filter(p => p.lehrer === lid);
  const uMap = new Map(d.unterrichte.map(u => [u.id, u]));
  const tab = (kopf, zeilen, fuss) => h('table', { class: (opt.druck ? 'druckliste' : 'tab kompakt') + ' aznachweis' },
    h('thead', {}, h('tr', {}, kopf.map((t, i) => h('th', { class: i && i === kopf.length - 1 ? 'zahl' : null }, t)))),
    h('tbody', {}, zeilen.map(z => h('tr', {}, z.map((c, i) => h('td', { class: i && i === z.length - 1 ? 'zahl' : null }, c))))),
    fuss ? h('tfoot', {}, h('tr', {}, fuss.map((c, i) => h('td', { class: i && i === fuss.length - 1 ? 'zahl' : null }, h('b', {}, c))))) : null);
  const abschnitt = (titel, ...inhalt) => h('div', { class: 'azabschnitt' }, h('h3', {}, titel), ...inhalt);
  const notiz = t => h('p', { class: 'muted klein' }, t);
  // Unterricht und Co-Einsatz je Kurs
  const kurse = new Map();
  P.filter(p => p.art === 'fach' || p.art === 'co').forEach(p => {
    const k = p.u + '|' + p.art; let z = kurse.get(k);
    if (!z) kurse.set(k, z = { u: uMap.get(p.u), art: p.art, ustd: 0, min: 0, vorbMin: 0, ustdV: 0, ohne: new Set(), hand: false, halb: false, anteilig: false, laengen: new Set() });
    z.ustd += p.ustd; z.min += p.min; z.vorbMin += p.vorbMin; if (p.vorbMin) z.ustdV += p.ustd; else if (p.ohne) z.ohne.add(p.ohne);
    if (p.hand) z.hand = true; if (p.f && p.f < 1) z.halb = true; if (p.anteilig) z.anteilig = true;
    if (p.ustd > 0) z.laengen.add(Math.round(p.min / p.ustd * 10) / 10);
  });
  const kListe = [...kurse.values()].sort((a, b) => (a.art === b.art ? 0 : a.art === 'fach' ? -1 : 1) || kursName(d, a.u).localeCompare(kursName(d, b.u), 'de', { numeric: true }));
  const satz = z => z.art === 'fach' ? am.vorbLehrkraft : am.vorbCo;
  const zeitText = z => z.laengen.size === 1 ? uStd(z.ustd) + ' × ' + minText([...z.laengen][0]) + ' = ' + minText(z.min) : uStd(z.ustd) + ' mit unterschiedlich langen Stunden (Zeitprofil) = ' + minText(z.min);
  const vorbText = z => {
    if (!z.vorbMin) return z.ohne.has('kurs') ? 'keine – Kurs ohne Vorbereitung' : z.ohne.has('geteilt') ? 'keine – geteilte Gruppe, zählt in der anderen Gruppe' : 'keine';
    return uStd(z.ustdV) + ' × ' + minText(satz(z)) + ' = ' + minText(z.vorbMin) + (z.ustdV < z.ustd - 1e-9 ? ' (übrige Stunden ohne Vorbereitung)' : '');
  };
  const merk = z => [z.halb ? 'A/B-Woche: zählt halb' : '', z.anteilig ? 'anteilig' : '', z.hand ? 'einzelne Stunden von Hand' : ''].filter(Boolean).join(' · ');
  const kursZeilen = kListe.map(z => [h('span', {}, kursName(d, z.u), merk(z) ? h('span', { class: 'muted klein' }, ' · ' + merk(z)) : null), z.art === 'fach' ? 'Lehrkraft' : 'Co-Lehrkraft', zeitText(z), vorbText(z), zStd(z.min + z.vorbMin)]);
  // Aufgaben (im Plan und feste Termine)
  const aufg = new Map();
  P.filter(p => p.art === 'aufgabe' || p.art === 'termin').forEach(p => { let z = aufg.get(p.u); if (!z) aufg.set(p.u, z = { u: uMap.get(p.u), ustd: 0, min: 0, termin: 0 }); if (p.art === 'termin') z.termin += p.min; else { z.ustd += p.ustd; z.min += p.min; } });
  const umfang = u => !u ? '' : (u.termine || []).length && !u.wochenstunden && !u.zeitstunden ? 'nur Termine' : u.einheit === 'zstd' ? zahlDe(u.zeitstunden, 2) + ' h (' + uStd(u.wochenstunden) + ' im Raster)' : uStd(u.wochenstunden);
  const aufgZeilen = [...aufg.values()].map(z => [kursName(d, z.u), umfang(z.u), [z.ustd ? uStd(z.ustd) + ' = ' + minText(z.min) + (z.u && z.u.pausenZaehlen !== false && z.min > 0 ? ' (Blöcke über Pausen zählen ganz)' : '') : '', z.termin ? 'feste Termine ' + minText(z.termin) : ''].filter(Boolean).join(' · ') || '–', z.u && z.u.anrechnung !== false ? 'ja' : 'nein', zStd(z.min + z.termin)]);
  // Aufsichten
  const dMap = new Map((d.dienste ? d.dienste.plan : []).map(y => [y.id, y]));
  const GRUND = { springer: 'Springer – zählt nicht zur Arbeitszeit', neutral: 'zählt nicht (arbeitszeitneutral)', selten: 'gelegentlich (einzelner Termin) – zählt nicht' };
  const dZeilen = P.filter(p => p.art === 'dienst').map(p => ({ p, y: dMap.get(p.dienst) })).sort((a, b) => ((a.y && a.y.tag) - (b.y && b.y.tag)) || String(a.y && a.y.beginn).localeCompare(String(b.y && b.y.beginn)))
    .map(({ p, y }) => [y ? (d.schule.tage[y.tag] || '?') + ' ' + y.beginn + '–' + y.ende : '?', p.name || 'Aufsicht', minText(p.dauer) + (p.f !== 1 && p.f ? ' × ' + zahlDe(p.f, 2) + ' (' + rhythmusText(y ? y.rhythmus : { art: 'woechentlich' }) + ')' : ''), p.grund ? GRUND[p.grund] || '–' : 'angerechnet', zStd(p.min)]);
  // GTAs (Ganztagsangebote): Dauer zählt 1:1, ohne Vorbereitung
  const gMap = new Map((d.gta || []).map(g => [g.id, g]));
  const gZeilen = P.filter(p => p.art === 'gta').map(p => { const g = gMap.get(p.gta); return [g ? g.name : '?', g ? gtaZeitText(d, g) : '?', g && g.raum ? ((d.raeume.find(r => r.id === g.raum) || {}).name || '–') : '–', zStd(p.min)]; });
  // 1. Übersicht mit Rechnung
  const kl = x.kl ? (d.klassen.find(k => k.id === l.klassenleitung) || {}).name : '';
  const nA = aufg.size, nD = dZeilen.length;
  const ustdVF = kListe.filter(z => z.art === 'fach').reduce((s, z) => s + z.ustdV, 0), ustdVC = kListe.filter(z => z.art === 'co').reduce((s, z) => s + z.ustdV, 0);
  // gleich lange Stunden: „20 UStd. × 45 min = 900 min“, sonst nur die Summe der Minuten
  const laenge = art => { const s = new Set(kListe.filter(z => z.art === art).flatMap(z => [...z.laengen])); return s.size === 1 ? ' × ' + minText([...s][0]) : ''; };
  const diff = x.summe - x.soll;
  const uebersicht = tab(['Bestandteil', 'Rechnung', 'Arbeitszeit'], [
    ['Unterricht als Lehrkraft', uStd(x.stunden) + laenge('fach') + ' = ' + minText(x.unterricht), zStd(x.unterricht)],
    ['Vorbereitung Lehrkraft', uStd(ustdVF) + ' × ' + minText(am.vorbLehrkraft) + ' = ' + minText(x.vorb), zStd(x.vorb)],
    ['Co-Einsatz', uStd(x.coStunden) + laenge('co') + ' = ' + minText(x.co), zStd(x.co)],
    ['Vorbereitung Co', uStd(ustdVC) + ' × ' + minText(am.vorbCo) + ' = ' + minText(x.coVorb), zStd(x.coVorb)],
    ['Klassenleitung', kl ? 'Klasse ' + kl + ': pauschal ' + minText(am.klassenleitungMin) + ' je Woche' : 'keine', zStd(x.kl)],
    ['Aufgaben', nA ? nA + (nA === 1 ? ' Aufgabe' : ' Aufgaben') + ' = ' + minText(x.aufgaben) : 'keine', zStd(x.aufgaben)],
    ['Aufsichten', nD ? nD + (nD === 1 ? ' Einsatz' : ' Einsätze') + ', angerechnet ' + minText(x.dienst) + (x.springer ? ' (Springer ' + minText(x.springer) + ' zählen nicht)' : '') : 'keine', zStd(x.dienst)],
    ['GTA', gZeilen.length ? gZeilen.length + (gZeilen.length === 1 ? ' GTA' : ' GTAs') + ' = ' + minText(x.gta) : 'keine', zStd(x.gta || 0)]
  ], ['Summe', 'Ist-Arbeitszeit je Woche', zStd(x.summe)]);
  const soll = h('p', {}, 'Wochenarbeitszeit (Soll): ', h('b', {}, x.soll > 0 ? zStd(x.soll) : 'nicht eingetragen'),
    x.soll > 0 ? [' · Differenz Ist − Soll: ', h('b', { class: diff > 3 ? 'fehlertext' : null }, (diff > 0 ? '+' : '') + zStd(diff)), diff > 3 ? ' (über der Wochenarbeitszeit)' : diff < -60 ? ' (noch frei)' : ''] : null);
  // Deputat und Einsatz je Tag
  const deputat = h('p', {}, 'Unterrichtsstunden: ' + uStd(x.stunden) + ' als Lehrkraft + ' + uStd(x.coStunden) + ' als Co' + (x.aufgStd ? ' + ' + uStd(x.aufgStd) + ' angerechnete Aufgaben' : '') + ' = ', h('b', {}, uStd(x.istStd)),
    x.hatSollStd ? ' von höchstens ' + uStd(x.sollStd) + ' (Unterrichtsdeputat)' : az.stundenSoll ? ' – kein Deputat eingetragen' : ' – das Unterrichtsdeputat wird nicht begrenzt');
  const tage = x.tag ? tab(d.schule.tage.map(t => TAGE_LANG[t] || t).concat(['höchstens je Tag']), [x.tag.map(m => zStd(m)).concat([x.tagMax > 0 ? zStd(x.tagMax) : 'keine Grenze'])]) : null;
  return h('div', { class: 'aznachweis-wrap' },
    opt.druck ? null : notiz('Grundlage: ' + (az.quelle === 'plan' ? 'aktueller Plan' : 'Unterrichtsverteilung (noch kein Plan – Unterrichtszeit mit der durchschnittlichen Stundenlänge von ' + minText(standardMinuten(d.schule)) + ')') + '. h = Zeitstunden (60 min), UStd. = Unterrichtsstunden. Vorbereitung: feste Minuten je gehaltener UStd., unabhängig von ihrer Länge; A/B-Stunden zählen halb.'),
    abschnitt('Wochenarbeitszeit', uebersicht, soll),
    abschnitt('Unterricht und Co-Einsatz', kursZeilen.length ? tab(['Unterricht', 'Rolle', 'Unterrichtszeit', 'Vorbereitung', 'Arbeitszeit'], kursZeilen, ['Summe', '', uStd(x.stunden + x.coStunden) + ' = ' + minText(x.unterricht + x.co), minText(x.vorb + x.coVorb), zStd(x.unterricht + x.co + x.vorb + x.coVorb)]) : notiz('Kein Unterricht.')),
    nA ? abschnitt('Aufgaben', tab(['Aufgabe', 'Umfang', 'im Plan', 'Deputat', 'Arbeitszeit'], aufgZeilen, ['Summe', '', '', '', zStd(x.aufgaben)])) : null,
    nD ? abschnitt('Aufsichten', tab(['Wann', 'Aufsicht', 'Dauer × Anteil je Woche', 'Anrechnung', 'Arbeitszeit'], dZeilen, ['Summe', '', '', '', zStd(x.dienst)])) : null,
    gZeilen.length ? abschnitt('GTA (Ganztagsangebote)', tab(['GTA', 'Zeit', 'Raum', 'Arbeitszeit'], gZeilen, ['Summe', '', '', zStd(x.gta)]), opt.druck ? null : notiz('GTAs zählen mit ihrer Dauer zur Arbeitszeit (ohne Vorbereitung), werden bei der Verteilung des Unterrichts aber nicht berücksichtigt.')) : null,
    abschnitt('Unterrichtsdeputat', deputat),
    tage ? abschnitt('Einsatz je Tag (ohne Vorbereitung)', tage) : null);
}
async function arbeitszeitDetailDialog(lid) {
  const l = lehrerVon(lid); if (!l) return;
  const w = await dialog({ titel: 'Arbeitszeit im Detail: ' + lehrerName(l, true) + (l.kuerzel ? ' (' + l.kuerzel + ')' : ''), breite: '1000px', inhalt: arbeitszeitNachweis(APP.daten, lid),
    knoepfe: [{ text: 'Drucken', wert: 'druck' }, { text: 'Lehrerplan öffnen', wert: 'plan' }, { text: 'Schließen', wert: true, art: 'primaer' }] });
  if (w === 'druck') druckenListe([['arbeitszeitNachweis', lid, 'Arbeitszeitnachweis ' + lehrerName(l, true) + (l.kuerzel ? ' (' + l.kuerzel + ')' : '')]], druckOpt());
  if (w === 'plan') editorZeigen('lehrer', lid);
}
// Arbeitszeit je Lehrkraft (Soll/Ist) – genutzt in Auswertung und Aufsichten
// Übersicht der Arbeitszeit je Person. opt.bearbeiten: Wochenarbeitszeit, Höchstarbeitszeit je Tag und Deputat lassen sich direkt eintragen.
// Eine Tabelle für Arbeitszeit, Deputat und Einsätze je Person – auf der Seite „Arbeitszeit & Deputat“ und als Druck „Arbeitszeitübersicht“.
// Ansichten: 'kompakt' (Summe, Grenzen, Stand) · 'alle' (+ Bestandteile der Arbeitszeit) · 'einsatz' (+ Früh-/Spätaufsichten, Springer, Anwesenheit, Lücken).
// opt.bearbeiten: Grenzen direkt in der Tabelle ändern · opt.druck: alle Spalten, ohne Eingabefelder und Knöpfe (liefert nur die Tabelle)
function arbeitszeitKarte(opt) {
  opt = opt || {};
  const d = APP.daten, am = d.schule.arbeitszeitModell, druck = !!opt.druck, edit = !!opt.bearbeiten && !druck;
  const hatPlan = d.plan.platzierungen.length > 0;
  const az = arbeitszeiten(d, { mitTagen: hatPlan });
  const ansicht = druck ? 'druck' : ['alle', 'einsatz'].includes(APP.azAnsicht) ? APP.azAnsicht : 'kompakt';
  const lMap = new Map(d.lehrer.map(l => [l.id, l]));
  const ein = ansicht === 'einsatz' || druck ? new Map(mitarbeitendeDaten(d).map(z => [z.l.id, z])) : null, R = d.dienste.regeln;
  const s = x => zahlDe(x / 60, 1);
  // Alle Aufsichtsformen (Pause, Früh/Spät, Bistro usw.) erscheinen gemeinsam in einer Spalte.
  const dienstRest = x => Math.max(0, x.summe - (x.unterricht + x.vorb + x.co + x.coVorb + x.kl + x.aufgaben + x.aufsicht + (x.gta || 0)));
  const aufsichtGesamt = x => x.aufsicht + dienstRest(x);
  const mitTag = edit || druck || az.liste.some(x => x.tagMax > 0);
  const summe = az.liste.reduce((a, x) => { ['unterricht', 'vorb', 'co', 'coVorb', 'kl', 'aufgaben', 'gta', 'summe', 'soll'].forEach(k => { a[k] = (a[k] || 0) + x[k]; }); a.aufsicht = (a.aufsicht || 0) + aufsichtGesamt(x); return a; }, {});
  const badge = (diff, soll) => { if (!(soll > 0)) return h('span', { class: 'badge neutral', title: 'keine Wochenarbeitszeit eingetragen' }, '–'); const hDiff = diff / 60; const kl = hDiff > 0.05 ? 'err' : hDiff < -1 ? 'warn' : 'ok'; return h('span', { class: 'badge ' + kl, title: kl === 'err' ? 'über der Wochenarbeitszeit' : kl === 'warn' ? 'deutlich unter der Wochenarbeitszeit' : 'passt' }, (kl === 'err' ? '✕ ' : kl === 'warn' ? '↓ ' : '✓ ') + zahlDe(hDiff, 1, true) + ' h'); };
  // das Deputat darf leer sein (keine Angabe); 0 heißt dort wirklich 0
  const setze = (lid, k, max, text) => ev => { const roh = String(ev.target.value).trim(), v = k === 'deputat' && roh === '' ? null : Math.min(max, Math.max(0, Number(roh.replace(',', '.')) || 0)); aendern(text, dd => { const y = findeId(dd.lehrer, lid); if (y) y[k] = v; }); };
  const feld = (x, k, max, text) => h('input', { type: 'number', min: 0, max, step: 0.5, value: k === 'deputat' ? ((lMap.get(x.lehrer) || {})[k] === null || (lMap.get(x.lehrer) || {})[k] === undefined ? '' : (lMap.get(x.lehrer) || {})[k]) : (lMap.get(x.lehrer) || {})[k] || 0, placeholder: k === 'deputat' ? '–' : null, style: { width: '64px' }, 'aria-label': text, title: text, onclick: ev => ev.stopPropagation(), onchange: setze(x.lehrer, k, max, text) });
  // höchster Tag der Woche gegen die Höchstarbeitszeit je Tag
  const tagZelle = x => {
    if (!x.tag) return h('span', { class: 'muted', title: 'Erst mit Plan' }, '–');
    const mx = Math.max(0, ...x.tag), ueber = x.tagMax > 0 && mx > x.tagMax + 0.5;
    const text = d.schule.tage.map((t, i) => t + ' ' + s(x.tag[i]) + ' h').join(' · ');
    return h('span', { class: 'badge ' + (ueber ? 'err' : x.tagMax > 0 ? 'ok' : 'neutral'), title: 'Einsatz je Tag (ohne Vorbereitung): ' + text + (x.tagMax > 0 ? ' – höchstens ' + s(x.tagMax) + ' h' : ' – keine Grenze') }, (ueber ? '✕ ' : '') + s(mx) + ' h');
  };
  // Spalten: [Titel, Erklärung, Gruppe] – Gruppe 'det' = Bestandteile, 'ein' = Einsätze (je nach Ansicht ausgeblendet)
  const spalten = [['Person', ''], [az.stundenSoll ? 'UStd. / Deputat' : 'UStd.', 'Gehaltene Unterrichtsstunden (UStd.) als Lehrkraft und als Co (A/B-Stunden halb)' + (az.stundenSoll ? ' gegen das Unterrichtsdeputat (Höchstzahl)' : '')]]
    .concat(edit && az.stundenSoll ? [['Deputat (max. UStd.)', 'Höchstzahl der Unterrichtsstunden (UStd.) je Woche; leer = keine Angabe (keine Grenze), 0 = keine Unterrichtsstunde']] : [])
    .concat([['Unterricht (h)', '', 'det'], ['Vorbereitung (h)', '', 'det'], ['Co-Einsatz (h)', '', 'det'], ['Co-Vorb. (h)', '', 'det'], ['Klassenleitung (h)', '', 'det'], ['Aufgaben (h)', 'Aufgaben im Plan und feste Termine', 'det'], ['GTA (h)', 'Ganztagsangebote (GTA-Planer) – zählen zur Arbeitszeit, nicht zur Verteilung des Unterrichts', 'det'], ['Aufsicht (h)', 'Alle Aufsichtsformen einschließlich Früh-/Spätaufsichten und Bistro; Springer separat ausgewiesen und arbeitszeitneutral', 'det']])
    .concat([['Summe (h)', 'Arbeitszeit der Woche in Zeitstunden (h)'], ['Wochenarbeitszeit (h)', 'Vertragliche Wochenarbeitszeit – harte Grenze'], ['Differenz', '']])
    .concat(mitTag ? [['höchster Tag', 'Längster Einsatz an einem Tag (Unterricht, Co, Aufgaben und Aufsichten – ohne Vorbereitung)']] : [])
    .concat(edit ? [['max. h/Tag', 'Höchstarbeitszeit je Tag in h; 0 = keine Grenze']] : [])
    .concat(ein ? [['Früh', 'Frühaufsichten je Woche (Aufsichten mit Rhythmus anteilig)', 'ein'], ['Spät', 'Spätaufsichten je Woche', 'ein'], ['Springer', 'Springer-Minuten je Woche – nicht auf die Arbeitszeit angerechnet', 'ein'], ['Anwesenheit Ø / max', 'Erster bis letzter Einsatz eines Tages', 'ein'], ['Lücken/Woche', 'Wartezeit zwischen Einsätzen (auch Freistunden im Unterricht)', 'ein']] : [])
    .concat(ein && !druck ? [['', '', 'ein']] : []);
  const einZellen = x => {
    const z = ein.get(x.lehrer); if (!z) return [];
    const m = z.m, td = (inhalt, titel) => h('td', { class: 'zahl ein', title: titel || null }, inhalt);
    return [td(m.anzahlFrueh ? zahlDe(m.anzahlFrueh, 1) + (z.g.fLabel && z.fruehErst && !druck ? ' · ' + z.fruehErst + '× ' + z.g.fLabel : '') : '–', zahlDe(m.fruehdienst, 0) + ' min'),
      td(m.anzahlSpaet ? zahlDe(m.anzahlSpaet, 1) + (z.g.sLabel && z.spaetLetzt && !druck ? ' · ' + z.spaetLetzt + '× ' + z.g.sLabel : '') : '–', zahlDe(m.spaetdienst, 0) + ' min'),
      td(x.springer ? zahlDe(x.springer, 0) + ' min' : '–'),
      h('td', { class: 'zahl ein' + (z.spMax > R.maxSpanne ? ' fehlertext' : '') }, z.spMax ? dauerText(Math.round(z.spSchnitt)) + ' / ' + dauerText(z.spMax) : '–'),
      td(z.luecken ? dauerText(z.luecken) : '–'),
      druck ? null : h('td', { class: 'aktion ein' },
        h('button', { class: 'btn icon klein', title: 'In der Gesamtansicht zeigen', 'aria-label': 'In der Gesamtansicht zeigen', onclick: () => dienstSpringeZu({ tab: 'wochenplan', lehrer: x.lehrer }) }, icon('kalender')),
        h('button', { class: 'btn icon klein', title: 'Zeiten, Verfügbarkeit und Wünsche', 'aria-label': 'Zeiten, Verfügbarkeit und Wünsche', onclick: () => personDialog(lMap.get(x.lehrer), 'dienste') }, icon('zahnrad')),
        h('button', { class: 'btn icon klein', title: 'Persönlichen Plan drucken (Lehrerplan mit Aufsichten)', 'aria-label': 'Persönlichen Plan drucken', onclick: () => persoenlichePlaeneDrucken([x.lehrer]) }, icon('drucker')))];
  };
  const tab = h('table', { class: (druck ? 'druckliste zahlen' : 'tab') + ' aztab' + (ansicht === 'kompakt' || ansicht === 'einsatz' ? ' ohnedet' : '') },
    h('thead', {}, h('tr', {}, spalten.map(([t, tip, gr], i) => h('th', { class: (i ? 'zahl' : '') + (gr ? ' ' + gr : ''), title: tip || null }, t)))),
    h('tbody', {}, az.liste.map(x => h('tr', { 'data-id': x.lehrer, class: lMap.get(x.lehrer) && lMap.get(x.lehrer).aufsicht === false && ein ? 'gedimmt' : null },
      h('td', druck ? {} : { class: 'azperson', title: 'Arbeitszeit im Detail mit Berechnung', onclick: () => arbeitszeitDetailDialog(x.lehrer) }, druck ? x.kuerzel + ' – ' + (x.name || '') : h('button', { class: 'linkknopf' }, x.kuerzel + ' – ' + (x.name || '')), x.ausgebildet ? null : h('span', { class: 'badge neutral', style: { marginLeft: '6px' } }, x.art === 'personal' ? 'weiteres Personal' : 'Co-Kraft')),
      h('td', { class: 'zahl' }, (() => { const m = stdStatus(x); return h('span', { class: 'badge ' + m.kl, title: m.titel }, m.text); })()),
      edit && az.stundenSoll ? h('td', { class: 'zahl' }, feld(x, 'deputat', 40, 'Unterrichtsdeputat (Höchstzahl)')) : null,
      h('td', { class: 'zahl det' }, s(x.unterricht)), h('td', { class: 'zahl det' }, s(x.vorb)), h('td', { class: 'zahl det' }, s(x.co)), h('td', { class: 'zahl det' }, s(x.coVorb)),
      h('td', { class: 'zahl det' }, x.kl ? s(x.kl) : '–'), h('td', { class: 'zahl det', title: x.termine ? 'davon feste Termine: ' + zahlDe(x.termine / 60, 1) + ' h' : null }, x.aufgaben ? s(x.aufgaben) : '–'), h('td', { class: 'zahl det' }, x.gta ? s(x.gta) : '–'), h('td', { class: 'zahl det', title: 'davon Frühaufsichten ' + zahlDe(x.fruehdienst, 0) + ' min · Spätaufsichten ' + zahlDe(x.spaetdienst, 0) + ' min' + (x.springer ? ' · Springer ' + zahlDe(x.springer, 0) + ' min (arbeitszeitneutral)' : '') }, aufsichtGesamt(x) ? s(aufsichtGesamt(x)) : '–', x.springer && !ein ? h('div', { class: 'klein muted nowrap springerinfo' }, 'Springer ' + zahlDe(x.springer / 60, 1) + ' h') : null),
      h('td', { class: 'zahl' }, h('b', {}, s(x.summe))), h('td', { class: 'zahl' }, edit ? feld(x, 'arbeitszeit', 80, 'Wochenarbeitszeit in h') : s(x.soll)), h('td', { class: 'zahl' }, badge(x.diff, x.soll)),
      mitTag ? h('td', { class: 'zahl' }, tagZelle(x)) : null,
      edit ? h('td', { class: 'zahl' }, feld(x, 'maxArbeitTag', 24, 'Höchstarbeitszeit je Tag in h')) : null,
      ein ? einZellen(x) : null))),
    h('tfoot', {}, h('tr', {}, h('td', {}, h('b', {}, 'Summe')), h('td', {}), edit && az.stundenSoll ? h('td', {}) : null,
      ['unterricht', 'vorb', 'co', 'coVorb', 'kl', 'aufgaben', 'gta', 'aufsicht', 'summe', 'soll'].map(k => h('td', { class: 'zahl' + (k === 'summe' || k === 'soll' ? '' : ' det') }, h('b', {}, s(summe[k] || 0)))), h('td', { class: 'zahl' }, h('span', { class: 'badge neutral' }, zahlDe(((summe.summe || 0) - (summe.soll || 0)) / 60, 1, true) + ' h')), mitTag ? h('td', {}) : null, edit ? h('td', {}) : null,
      ein ? spalten.filter(x => x[2] === 'ein').map(() => h('td', { class: 'ein' })) : null)));
  const erklaerung = 'Zeiten in Zeitstunden (h), Unterrichtsstunden in UStd. (Zeilen des Zeitrasters). Ein Klick auf eine Person zeigt die ganze Rechnung. Je gehaltener Unterrichtsstunde als Lehrkraft + ' + am.vorbLehrkraft + ' min Vorbereitung, als Co-Lehrkraft + ' + am.vorbCo + ' min – unabhängig von der Länge der Stunde; UStd. ohne Vorbereitungshäkchen zählen nur mit ihrer Dauer. Klassenleitung ' + am.klassenleitungMin + ' min pauschal, Aufgaben, Aufsichten mit ihrer Dauer (Aufsichten mit Rhythmus anteilig). A/B-Stunden zählen halb. Springer werden nicht angerechnet.';
  if (druck) return h('div', {}, tab);
  // Kennzahlen der Einsätze (Ansicht „Einsätze & Anwesenheit“)
  let kennzahlen = null;
  if (ein) {
    const zl = [...ein.values()], dm = zl.filter(z => z.l.aufsicht !== false), spanne = arr => arr.length ? zahlDe(Math.min(...arr), 1) + ' – ' + zahlDe(Math.max(...arr), 1) : '–', lang = zl.filter(z => z.spMax > R.maxSpanne).length;
    kennzahlen = h('div', { class: 'kennzahlen' }, [['Frühaufsichten je Person', spanne(dm.map(z => z.m.anzahlFrueh))], ['Spätaufsichten je Person', spanne(dm.map(z => z.m.anzahlSpaet))], ['über Soll', zl.filter(z => z.a.diff > 15).length], ['Tage länger als ' + dauerText(R.maxSpanne), lang ? lang + ' Pers.' : '0']].map(([n, w]) => h('div', { class: 'kennzahl' }, h('div', { class: 'w' }, String(w)), h('div', { class: 'n' }, n))));
  }
  return h('div', { class: 'karte' },
    h('h2', { style: { marginTop: 0 } }, opt.titel || 'Wochenarbeitszeit'),
    h('p', { class: 'muted klein' }, erklaerung + ' ', h('b', {}, az.quelle === 'plan' ? 'Grundlage: aktueller Plan.' : 'Grundlage: Unterrichtsverteilung (noch kein Plan).')),
    h('div', { class: 'zeile', style: { marginBottom: '8px' } }, h('span', { class: 'muted klein' }, 'Ansicht:'),
      [['kompakt', 'Kompakt', 'Nur Summe, Grenzen und Stand'], ['alle', 'Alle Bestandteile', 'Zusätzlich: Unterricht, Vorbereitung, Co-Einsatz, Klassenleitung, Aufgaben und Aufsicht'], ['einsatz', 'Einsätze & Anwesenheit', 'Zusätzlich: Früh- und Spätaufsichten, Springer, Anwesenheit und Lücken je Person']].map(([k, t, tip]) => h('button', { class: 'btn klein' + (ansicht === k ? ' aktiv' : ''), 'aria-pressed': ansicht === k ? 'true' : 'false', title: tip, onclick: () => { APP.azAnsicht = k; render(); } }, t)),
      h('div', { class: 'rechts' }), h('button', { class: 'btn klein', title: 'Diese Tabelle mit allen Spalten drucken oder als PDF speichern', onclick: () => dienstDrucken([['arbeitszeitDienst', '', 'Arbeitszeitübersicht']]) }, icon('drucker'), 'Drucken')),
    kennzahlen,
    h('div', { class: 'tabwrap' }, tab));
}
// Grenzen und Rechenmodell der Arbeitszeit (Seite „Arbeitszeit & Deputat“)
function arbeitszeitRegelnKarten() {
  const d = APP.daten, am = d.schule.arbeitszeitModell, rw = d.regeln;
  const azFeld = (k, text, min, max, step, tip) => h('label', { class: 'feld' }, h('span', {}, text, tip ? hilfe(tip) : null), h('input', { type: 'number', min, max, step: step || 1, value: am[k], 'aria-label': text, onchange: ev => aendern('Arbeitszeitmodell: ' + text, dd => { dd.schule.arbeitszeitModell[k] = Number(String(ev.target.value).replace(',', '.')) || 0; }, { normalisieren: true }) }));
  const hart = rw.hartUmschaltbar.H16 !== 'weich';
  const allen = (k, text, wertFn) => async () => { if (!(await bestaetigen(text, 'Für alle setzen'))) return; aendern(text, dd => { dd.lehrer.forEach(l => { l[k] = wertFn(dd); }); }); };
  return [
    h('div', { class: 'karte' },
      h('h2', { style: { marginTop: 0 } }, 'Drei Grenzen je Person'),
      h('table', { class: 'tab kompakt grenzentab' }, h('tbody', {},
        h('tr', {}, h('td', {}, h('b', {}, 'Wochenarbeitszeit')), h('td', {}, 'Vertragliche Arbeitszeit in Zeitstunden (h). Dagegen zählt alles: Unterricht, Vorbereitung, Co-Einsätze, Klassenleitung, Aufgaben und Aufsichten.'), h('td', { class: 'nowrap' }, h('span', { class: 'badge err' }, 'harte Grenze'))),
        h('tr', {}, h('td', {}, h('b', {}, 'Höchstarbeitszeit je Tag')), h('td', {}, 'Einsatz an einem Tag: Unterricht, Co-Einsätze, Aufgaben und Aufsichten – ohne Vorbereitung. 0 = keine Grenze.'), h('td', { class: 'nowrap' }, h('span', { class: 'badge err' }, 'harte Grenze'))),
        h('tr', {}, h('td', {}, h('b', {}, 'Unterrichtsdeputat')), h('td', {}, 'Höchstzahl der Unterrichtsstunden je Woche, als Lehrkraft und als Co-Lehrkraft zusammen. Es ist von der Arbeitszeit getrennt: Wer sein Deputat ausgeschöpft hat, kann trotzdem noch Arbeitszeit für Aufgaben, Aufsichten oder Schulleitungstätigkeiten frei haben.'), h('td', { class: 'nowrap' }, h('span', { class: 'badge warn' }, am.stundenSoll ? 'Warnung bei Überschreitung' : 'nicht geführt'))))),
      h('div', { class: 'hinweis' + (hart ? '' : ' warn'), style: { marginTop: '10px' } }, hart
        ? 'Die Grenzen sind harte Regeln: Die Berechnung wählt automatische Fachlehrkräfte so, dass niemand darüber hinaus eingeplant wird. Lässt sich das mit den fest eingetragenen Personen nicht einhalten, meldet die Prüfung den Verstoß unter „Offene Punkte“ – dann Unterricht anders verteilen oder die Grenze anpassen.'
        : 'Die Arbeitszeitgrenzen sind auf „weich“ gestellt: Überschreitungen kosten nur Strafpunkte, die Automatik darf darüber hinaus einplanen.'),
      h('div', { class: 'zeile', style: { gap: '18px', marginTop: '10px', alignItems: 'flex-end' } },
        h('label', { class: 'feld' }, h('span', {}, 'Arbeitszeitgrenzen', hilfe('hart: Wochenarbeitszeit und Höchstarbeitszeit je Tag werden von der Berechnung und den Aufsichten nicht überschritten (Ausnahme: Aufsichten mit „Aufsichten immer besetzen“ – gekennzeichnet mit ⚠). weich: nur Strafpunkte nach Gewicht.')),
          sel([['hart', 'hart – nie überschreiten'], ['weich', 'weich – nur Strafpunkte']], rw.hartUmschaltbar.H16, v => aendern('Arbeitszeitgrenzen auf ' + v, dd => { dd.regeln.hartUmschaltbar.H16 = v; }), { 'aria-label': 'Arbeitszeitgrenzen: hart oder weich' })),
        h('label', { class: 'check', title: 'Aus: Es gibt keine Höchstzahl an Unterrichtsstunden – alle Prüfungen und das Ergänzen der Co-Lehrkräfte stützen sich nur auf die Arbeitszeit.' }, h('input', { type: 'checkbox', checked: !!am.stundenSoll, onchange: ev => aendern(ev.target.checked ? 'Unterrichtsdeputat wird begrenzt' : 'Unterrichtsdeputat ohne Grenze', dd => { dd.schule.arbeitszeitModell.stundenSoll = ev.target.checked; }) }), h('b', {}, 'Unterrichtsdeputat begrenzen')),
        h('span', { class: 'muted klein' }, am.stundenSoll ? 'Je Person eine Höchstzahl (Spalte „Deputat“); leer = keine Angabe (keine Grenze), 0 = keine Unterrichtsstunde.' : 'Aus: Maßgeblich ist allein die Arbeitszeit.'))),
    h('div', { class: 'karte' },
      h('h2', { style: { marginTop: 0 } }, 'Rechenmodell und Vorgaben'),
      h('p', { class: 'muted klein' }, 'Gehaltene Unterrichtsstunde als Lehrkraft = Unterrichtszeit + Vorbereitung; als Co-Lehrkraft = Unterrichtszeit + kürzere Vorbereitung. Die Vorbereitung zählt mit festen Minuten je Unterrichtsstunde – gleich, ob die Stunde 45 oder 60 Minuten dauert. Stunden ohne Vorbereitung werden im Unterrichtsdialog per Häkchen markiert. Klassenleitungen bekommen zusätzlich Vorbereitungszeit.'),
      h('div', { class: 'zeile', style: { gap: '16px', alignItems: 'flex-end' } },
        azFeld('vorbLehrkraft', 'Vorbereitung Lehrkraft (min je Stunde)', 0, 240),
        azFeld('vorbCo', 'Vorbereitung Co-Lehrkraft (min je Stunde)', 0, 240),
        azFeld('klassenleitungMin', 'Klassenleitung (min/Woche)', 0, 1200)),
      h('h3', {}, 'Vorgaben für neu angelegte Personen'),
      h('div', { class: 'zeile', style: { gap: '16px', alignItems: 'flex-end' } },
        azFeld('standardStunden', 'Wochenarbeitszeit (h)', 0, 80, 0.5),
        h('button', { class: 'btn klein', onclick: allen('arbeitszeit', 'Wochenarbeitszeit ' + zahlDe(am.standardStunden, 1) + ' h für alle Personen setzen?', dd => dd.schule.arbeitszeitModell.standardStunden) }, 'für alle setzen'),
        azFeld('maxTagStunden', 'max. Arbeitszeit je Tag (h)', 0, 24, 0.5, '0 = keine Grenze'),
        h('button', { class: 'btn klein', onclick: allen('maxArbeitTag', 'Höchstarbeitszeit je Tag ' + (am.maxTagStunden > 0 ? zahlDe(am.maxTagStunden, 1) + ' h' : '„keine Grenze“') + ' für alle Personen setzen?', dd => dd.schule.arbeitszeitModell.maxTagStunden) }, 'für alle setzen')),
      h('p', { class: 'muted klein', style: { marginTop: '10px' } }, h('b', {}, 'Springer '), 'zählen nicht zur Arbeitszeit: Ein Springer-Einsatz belegt die Zeit der Person – sie kann währenddessen nichts anderes übernehmen –, erhöht aber weder die Wochen- noch die Tagesarbeitszeit. Die Springerzeit wird gesondert ausgewiesen.'))
  ];
}
