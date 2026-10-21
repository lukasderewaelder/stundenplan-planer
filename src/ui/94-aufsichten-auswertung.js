/* ---------------- Reiter „Mitarbeitende“ ---------------- */
// Früheste Frühaufsicht und späteste Spätaufsicht – für „davon ab 06:45“ / „davon bis 17:00“
function fruehSpaetGrenzen(d) {
  const DI = d.dienste, kat = x => dienstMeta(d, x).kat;
  const fr = DI.plan.filter(x => kat(x) === 'fruehdienst' && dienstIntervall(x)), sp = DI.plan.filter(x => kat(x) === 'spaetdienst' && dienstIntervall(x));
  const frStart = fr.length ? Math.min(...fr.map(x => dienstIntervall(x).start)) : null;
  const spEnde = sp.length ? Math.max(...sp.map(x => dienstIntervall(x).end)) : null;
  return {
    fLabel: frStart !== null ? 'ab ' + zeitText(frStart) : '', sLabel: spEnde !== null ? 'bis ' + zeitText(spEnde) : '',
    fruehTage: lid => new Set(fr.filter(x => x.lehrer === lid && dienstIntervall(x).start === frStart).map(x => x.tag)).size,
    spaetTage: lid => new Set(sp.filter(x => x.lehrer === lid && dienstIntervall(x).end === spEnde).map(x => x.tag)).size
  };
}
function mitarbeitendeDaten(d) {
  const az = new Map(arbeitszeiten(d).liste.map(x => [x.lehrer, x]));
  const dm = dienstMinutenJeLehrer(d), idx = belegungsIndex(d), D = d.schule.tage.length, g = fruehSpaetGrenzen(d);
  return lehrerAlphabetisch(d.lehrer).map(l => {
    const a = az.get(l.id), m = dm.get(l.id);
    let spMax = 0, spSum = 0, tage = 0, lu = 0;
    for (let t = 0; t < D; t++) { const x = tagesAnwesenheit(d, l.id, t, idx); if (x.spanne) { tage++; spSum += x.spanne; spMax = Math.max(spMax, x.spanne); lu += x.luecken; } }
    return { l, a, m, spMax, spSchnitt: tage ? spSum / tage : 0, luecken: lu, tage, fruehErst: g.fruehTage(l.id), spaetLetzt: g.spaetTage(l.id), g };
  });
}


/* ---------------- Reiter „Auswertung“ ---------------- */
function dienstSpringeZu(ziel) {
  if (ziel && ziel.tab === 'mitarbeitende') { gehe('mitarbeitende'); return; } // = Arbeitszeit & Deputat, Ansicht „Einsätze & Anwesenheit“
  const st = DS();
  // der frühere Reiter „Wochenplan“ ist jetzt die Seite „Gesamtansicht“ (auch für den Sprung zu einem einzelnen Einsatz)
  const zuGesamt = ziel.tab === 'wochenplan' || (!!ziel.dienst && !ziel.tab);
  if (ziel.tab && ziel.tab !== 'wochenplan') st.tab = ziel.tab;
  if (ziel.tag !== undefined && ziel.tag !== null) { st.tag = ziel.tag; st.bedarfTag = ziel.tab === 'bedarf' ? ziel.tag : st.bedarfTag; }
  if (ziel.tab === 'wochenplan' && ziel.lehrer && !ziel.dienst) { st.ansicht = 'person'; st.person = ziel.lehrer; }
  else if (ziel.tab === 'wochenplan') st.ansicht = 'tag';
  if (ziel.dienst) { st.sel = ziel.dienst; st.ansicht = 'tag'; const x = APP.daten.dienste.plan.find(y => y.id === ziel.dienst); if (x) { st.tag = x.tag; if (st.filter === 'mitDiensten' || st.suche) { st.suche = ''; st.filter = 'alle'; } } }
  if (ziel.tab === 'pausen') { gehe('pausen'); return; }
  const zielSeite = zuGesamt ? 'gesamtansicht' : 'aufsicht';
  if (APP.seite !== zielSeite) gehe(zielSeite); else render();
  if (ziel.dienst) requestAnimationFrame(() => { const el = document.querySelector('.tl-d[data-id="' + ziel.dienst + '"]'); if (el) { el.scrollIntoView({ block: 'center', inline: 'center' }); el.focus({ preventScroll: true }); el.classList.add('blitz'); setTimeout(() => el.classList.remove('blitz'), 1500); } });
  if (ziel.bedarf) { st.bedarfSel = ziel.bedarf; if (APP.seite === 'aufsicht') render(); requestAnimationFrame(() => { const el = document.getElementById('bedarfDetail'); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('blitz'); setTimeout(() => el.classList.remove('blitz'), 1500); } }); }
}
function meldungZiel(z) { if (z && z.seite && z.seite !== 'aufsicht') springeZu(z); else dienstSpringeZu(z || {}); }
function dienstKennzahlenKarte(pr, opt) {
  opt = opt || {};
  const k = pr.kennzahlen;
  const z = [['Mindestbedarfe offen', k.minOffen, k.minOffen ? 'err' : 'ok'], ['Sollbesetzungen offen', k.sollOffen, k.sollOffen ? 'warn' : 'ok'], ['Zeitkonflikte', k.konflikte, k.konflikte ? 'err' : 'ok'], ['Personen über Arbeitszeit', k.ueberArbeitszeit, k.ueberArbeitszeit ? 'warn' : 'ok'], ['extrem lange Anwesenheitstage', k.langeTage, k.langeTage ? 'warn' : 'ok'], ['Früh-/Spätaufsicht-Ungleichgewicht', k.ungleich ? 'Hinweis' : 'keins', k.ungleich ? 'warn' : 'ok']];
  return h('div', { class: 'kennzahlen' }, z.map(([n, v, kl]) => h('div', { class: 'kennzahl ' + kl }, h('div', { class: 'w' }, String(v)), h('div', { class: 'n' }, n))));
}
function dienstMeldungenListe(pr, max) {
  const m = pr.meldungen.slice().sort((a, b) => ({ fehler: 0, warnung: 1, hinweis: 2 }[a.stufe] - { fehler: 0, warnung: 1, hinweis: 2 }[b.stufe]));
  if (!m.length) return h('p', { class: 'muted' }, '✓ Keine Probleme bei den Aufsichten.');
  return h('ul', { class: 'vliste', style: { maxHeight: '420px' } }, m.slice(0, max || 300).map(x => h('li', { class: 'klickbar', tabindex: 0, role: 'button', title: 'Zur betroffenen Aufsicht springen', onclick: () => meldungZiel(x.ziel), onkeydown: ev => { if (ev.key === 'Enter') meldungZiel(x.ziel); } },
    h('span', { class: 'sym ' + (x.stufe === 'fehler' ? 'h' : 'w') }, x.stufe === 'fehler' ? '✕' : x.stufe === 'warnung' ? '!' : 'i'), h('span', { title: x.regel && REGEL_NAME[x.regel] ? 'Regel: ' + REGEL_NAME[x.regel] : null }, x.text))));
}
function dienstAuswertungTab() {
  const d = APP.daten, DI = d.dienste;
  const pr = dienstPruefung(d);
  const dm = dienstMinutenJeLehrer(d);
  const pers = lehrerAlphabetisch(d.lehrer).filter(l => l.aufsicht !== false || DI.plan.some(x => x.lehrer === l.id));
  const mx = Math.max(1, ...pers.map(l => Math.max(dm.get(l.id).anzahlFrueh, dm.get(l.id).anzahlSpaet)));
  const fair = h('div', { class: 'fairness' }, pers.map(l => { const m = dm.get(l.id); return h('div', { class: 'fz', title: (l.name || '') + ': ' + zahlDe(m.anzahlFrueh, 1) + ' Früh-, ' + zahlDe(m.anzahlSpaet, 1) + ' Spätaufsichten' },
    h('span', { class: 'n' }, l.kuerzel || '?'), h('span', { class: 'balken' }, h('span', { class: 'f', style: { width: (m.anzahlFrueh / mx * 50) + '%' } }), h('span', { class: 's', style: { width: (m.anzahlSpaet / mx * 50) + '%' } })), h('span', { class: 'x' }, zahlDe(m.anzahlFrueh, 1) + ' / ' + zahlDe(m.anzahlSpaet, 1))); }));
  // Besetzung Tage × frei benannte Aufsichtsphasen; Typen/Kategorien spielen hier keine Rolle mehr.
  const key = b => (b.name || 'Aufsicht') + '|' + (b.bereich || '') + '|' + (b.pauseKey || '');
  const phasenMap = new Map();
  DI.bedarfe.forEach(b => { const k = key(b); if (!phasenMap.has(k)) phasenMap.set(k, { key: k, name: b.name || 'Aufsicht', bereich: b.bereich || '', farbe: b.farbe || '#5f7597', pauseKey: b.pauseKey || '' }); });
  const phasen = [...phasenMap.values()].sort((a,b) => a.name.localeCompare(b.name, 'de'));
  const bes = h('table', { class: 'tab kompakt' }, h('thead', {}, h('tr', {}, h('th', {}, 'Aufsicht'), d.schule.tage.map(t => h('th', { class: 'mitte' }, t)))),
    h('tbody', {}, phasen.map(p => h('tr', {}, h('td', {}, h('span', { class: 'typpunkt', style: { background: p.farbe } }), p.name, p.bereich ? h('span', { class: 'muted klein' }, ' · ' + (((DI.bereiche || []).find(x => x.id === p.bereich) || {}).name || p.bereich)) : null), d.schule.tage.map((_, i) => {
      const bs = DI.bedarfe.filter(b => key(b) === p.key && b.tag === i);
      if (!bs.length) return h('td', { class: 'mitte muted' }, '–');
      const st = bs.flatMap(b => besetzungBedarf(d, b)).reduce((a, x) => x.status === 'err' ? 'err' : a === 'err' ? a : x.status === 'warn' ? 'warn' : a, 'ok');
      return h('td', { class: 'mitte klickbar', onclick: () => dienstSpringeZu({ tab: 'wochenplan', tag: i }) }, h('span', { class: 'badge ' + st }, st === 'ok' ? '✓' : st === 'warn' ? '~' : '✕'));
    })))));
  return [dienstKennzahlenKarte(pr),
    h('div', { class: 'karte' }, h('h2', { style: { marginTop: 0 } }, 'Meldungen'), dienstMeldungenListe(pr)),
    h('div', { class: 'karte' }, h('h2', { style: { marginTop: 0 } }, 'Besetzung je Tag'), phasen.length ? bes : leerZustand({ klein: true, icon: 'auge', titel: 'Noch kein Bedarf', text: 'Die Besetzung je Tag erscheint, sobald Aufsichtsbedarf eingetragen ist.', aktion: { text: 'Bedarf eintragen', tun: () => dienstSpringeZu({ tab: 'bedarf' }) } })),
    h('div', { class: 'karte' }, h('h2', { style: { marginTop: 0 } }, 'Früh- und Spätaufsichten je Person'), h('p', { class: 'muted klein' }, 'Früh-/Spätaufsicht wird aus der tatsächlichen Uhrzeit der benannten Phase erkannt. ', h('span', { class: 'leg f' }), ' Früh ', h('span', { class: 'leg s' }), ' Spät (Anzahl je Woche)'), fair)];
}

/* ---------------- Druckansichten Aufsichten ---------------- */
const DIENST_DRUCKARTEN = [['dienstWoche', 'Aufsichtsplan – gesamte Woche'], ['fruehSpaet', 'Früh-/Spätaufsichten'], ['besetzungBereich', 'Aufsichten nach Bereich'], ['arbeitszeitDienst', 'Arbeitszeitübersicht'], ['gta', 'GTA-Plan (Ganztagsangebote)']];
function dienstDruckListe(o) {
  const t = (DIENST_DRUCKARTEN.find(x => x[0] === o.art) || [])[1] || 'Aufsichtsplan';
  return [[o.art, '', t]];
}
function dienstDrucken(liste) { druckenListe(liste, druckOpt()); }
// Persönliche Pläne: immer der Lehrerplan mit allen Aufsichten und Diensten der Person – eine Fassung für Unterricht und Aufsichten
function persoenlichePlaeneDrucken(ids) {
  const liste = ids.map(lehrerVon).filter(Boolean).map(l => ['lehrer', l.id, lehrerName(l, true) + ' (' + (l.kuerzel || '') + ')']);
  druckenListe(liste, Object.assign(druckOpt(), { aufsichten: true }));
}
function dienstDruckMenue() {
  const st = DS(), d = APP.daten, r = document.querySelector('.tl-leiste .rechts');
  const b = r ? r.getBoundingClientRect() : { left: 400, bottom: 200 };
  menueZeigen(b.left + 200, b.bottom + 4, [{ titel: 'Gesamtplan – alle Personen, vollständig lesbar' },
    { icon: 'drucker', text: 'Gesamtplan ' + tagLang(st.tag) + ' (Drucken / PDF)', tun: () => dienstDrucken(gpDruckListe(Object.assign(druckOpt(), { auswahl: String(st.tag) }))) },
    { icon: 'drucker', text: 'Gesamtplan alle Tage (Drucken / PDF)', tun: () => dienstDrucken(gpDruckListe(Object.assign(druckOpt(), { auswahl: 'alle' }))) },
    '-', { titel: 'Persönliche Pläne (Lehrerplan mit allen Aufsichten)' },
    st.ansicht === 'person' && st.person ? { icon: 'person', text: 'Persönlicher Plan ' + lehrerName(lehrerVon(st.person)), tun: () => persoenlichePlaeneDrucken([st.person]) } : { icon: 'personen', text: 'Persönliche Pläne aller Personen mit Aufsicht', tun: () => persoenlichePlaeneDrucken(lehrerAlphabetisch(d.lehrer).filter(l => d.dienste.plan.some(x => x.lehrer === l.id)).map(l => l.id)) },
    '-', { titel: 'Aufsichtspläne' },
    { text: 'Aufsichtsplan gesamte Woche', tun: () => dienstDrucken([['dienstWoche', '', 'Aufsichtsplan gesamte Woche']]) },
    { text: 'Früh-/Spätaufsichten', tun: () => dienstDrucken([['fruehSpaet', '', 'Früh-/Spätaufsichten']]) },
    { text: 'Aufsichten nach Bereich', tun: () => dienstDrucken([['besetzungBereich', '', 'Aufsichten nach Bereich']]) },
    { text: 'Arbeitszeitübersicht', tun: () => dienstDrucken([['arbeitszeitDienst', '', 'Arbeitszeitübersicht']]) }]);
}
function druckKopf(titel) { const d = APP.daten; return h('div', { class: 'dk' }, h('span', { class: 't' }, titel), h('span', {}, d.schule.name + (d.schule.schuljahr ? ' · Schuljahr ' + d.schule.schuljahr : ''))); }
// Fußzeile aller Druckseiten: nur der Stand und die Seitenzahl – keine Erklärungen
function druckFuss(i, n) { return h('div', { class: 'df' }, h('span', {}, 'Stand: ' + datum()), n ? h('span', {}, 'Seite ' + (i + 1) + ' von ' + n) : null); }
function dienstKurzZeile(x) { const b = dBereich(x.bereich); return x.beginn + '–' + x.ende + ' ' + dienstTitel(x) + (b ? ' · ' + b.name : '') + (x.rhythmus.art !== 'woechentlich' ? ' (' + rhythmusText(x.rhythmus) + ')' : ''); }
function dienstDruckSeite(art, id, titel, i, n) {
  const d = APP.daten, DI = d.dienste;
  const sortiert = l => l.slice().sort((a, b) => (minVon(a.beginn) || 0) - (minVon(b.beginn) || 0));
  if (art === 'gta') return gtaPlanSeite(titel, i, n);
  if (art === 'dienstWoche') {
    const pers = lehrerAlphabetisch(d.lehrer).filter(l => DI.plan.some(x => x.lehrer === l.id));
    return h('div', { class: 'druckseite fliessend lang' }, druckKopf(titel),
      pers.length ? h('table', { class: 'druckliste woche' }, h('thead', {}, h('tr', {}, h('th', {}, 'Person'), d.schule.tage.map(t => h('th', {}, TAGE_LANG[t])))),
        h('tbody', {}, pers.map(l => h('tr', {}, h('td', {}, h('b', {}, l.kuerzel || '?'), ' ', l.name || ''), d.schule.tage.map((_, t) => h('td', {}, sortiert(DI.plan.filter(x => x.lehrer === l.id && x.tag === t)).map(x => { const m = dienstMeta(d, x); return h('div', { class: 'dz', style: { borderLeftColor: m.farbe || '#5f7597' } }, dienstKurzZeile(x)); }))))))) : h('p', {}, 'Keine Aufsichten geplant.'),
      druckFuss(i, n));
  }
  if (art === 'fruehSpaet') {
    const kat = k => sortiert(DI.plan.filter(x => dienstMeta(d, x).kat === k));
    const fr = kat('fruehdienst'), sp = kat('spaetdienst');
    const zelle = (l, t) => h('td', {}, l.filter(x => x.tag === t).map(x => h('div', { class: 'dz' }, x.beginn + '–' + x.ende + ' ', h('b', {}, lehrerName(lehrerVon(x.lehrer))))));
    return h('div', { class: 'druckseite fliessend lang' }, druckKopf(titel),
      h('table', { class: 'druckliste' }, h('thead', {}, h('tr', {}, h('th', {}, 'Tag'), h('th', {}, 'Frühaufsicht'), h('th', {}, 'Spätaufsicht'))),
        h('tbody', {}, d.schule.tage.map((t, i2) => h('tr', {}, h('td', {}, h('b', {}, TAGE_LANG[t])), zelle(fr, i2), zelle(sp, i2))))),
      druckFuss(i, n));
  }
  if (art === 'besetzungBereich') {
    const gruppen = DI.bereiche.map(b => ({ id: b.id, name: b.name })).concat([{ id: null, name: 'ohne Bereich' }]).filter(g => DI.plan.some(x => (x.bereich || null) === g.id));
    return h('div', { class: 'druckseite fliessend lang' }, druckKopf(titel),
      gruppen.length ? gruppen.map(g => h('div', { class: 'bereichblock' }, h('h3', {}, g.name),
        h('table', { class: 'druckliste' }, h('thead', {}, h('tr', {}, d.schule.tage.map(t => h('th', {}, TAGE_LANG[t])))),
          h('tbody', {}, h('tr', {}, d.schule.tage.map((_, t) => h('td', {}, sortiert(DI.plan.filter(x => (x.bereich || null) === g.id && x.tag === t)).map(x => { const m = dienstMeta(d, x); return h('div', { class: 'dz', style: { borderLeftColor: m.farbe || '#5f7597' } }, x.beginn + '–' + x.ende + ' ', h('b', {}, lehrerName(lehrerVon(x.lehrer))), ' · ' + dienstTitel(x)); })))))))) : h('p', {}, 'Keine Aufsichten geplant.'),
      druckFuss(i, n));
  }
  if (art === 'arbeitszeitDienst') return h('div', { class: 'druckseite fliessend lang' }, druckKopf(titel), arbeitszeitKarte({ druck: true }), druckFuss(i, n));
  return h('div', { class: 'druckseite' }, druckKopf(titel));
}

/* ---------------- Gesamtplan je Tag: alle Personen × Uhrzeit, vollständig lesbar ----------------
   Dieselbe Sicht wie der Aufsichten-Wochenplan „Tag × Personen“, aber für Papier/PDF: eine Spalte je Person, eine Zeile je Zeitgrenze des Tages
   (Beginn und Ende aller Einsätze dieser Seite). Jeder Einsatz ist eine Zelle über seine Zeilen (rowspan). Die Zeilenhöhe folgt der Dauer, soweit
   die Seite reicht, und wächst mit dem Text – es wird nichts abgeschnitten, jede Zelle nennt die genaue Uhrzeit. Was sich zeitlich überschneidet
   (A-/B-Woche, Gruppen, Rotation), steht NEBENEINANDER in eigenen Spuren der Person – jeder Block beginnt und endet auf seiner eigenen Zeitzeile.
   Je Seite höchstens gpSpalten() Personen (Druckoption), gleichmäßig verteilt. */
const GP_SPALTEN = [8, 10, 12, 14, 16], GP_SPALTEN_STD = 12;
function gpSpalten(o) { const n = Number((o || druckOpt()).gpSpalten); return GP_SPALTEN.includes(n) ? n : GP_SPALTEN_STD; }
// alle Personen mit mindestens einem Einsatz an diesem Tag (Unterricht, Co, Aufgaben, Termine, Aufsichten) – alphabetisch
function gpPersonen(d, tag, idx) { return lehrerAlphabetisch(d.lehrer).filter(l => ((idx.get(l.id) || [])[tag] || []).some(b => b.art !== 'gesperrt' && b.end > b.start)); }
// Externe GTA-Leitungen eines Tages (je Name eine Spalte, nach den Personen) und GTAs ganz ohne Leitung – sie haben keine Personenspalte,
// gehören aber in den Gesamtplan. Pseudo-Personen { id: 'ext:<Name>' | 'ext:', extern: true, kuerzel }.
function gpExterne(d, tag) {
  const m = new Map();
  (d.gta || []).forEach(g => {
    if (g.tag !== tag || !gtaIntervall(d, g)) return;
    const k = g.extern ? 'ext:' + g.extern : !g.personen.length ? 'ext:' : null;
    if (k && !m.has(k)) m.set(k, { id: k, extern: true, kuerzel: g.extern || 'GTA ohne Leitung', name: '' });
  });
  return [...m.values()].sort((a, b) => (a.id === 'ext:') - (b.id === 'ext:') || a.kuerzel.localeCompare(b.kuerzel, 'de'));
}
function gpExternGtas(d, x, tag) { return (d.gta || []).filter(g => g.tag === tag && gtaIntervall(d, g) && (x.id === 'ext:' ? !g.extern && !g.personen.length : !!g.extern && 'ext:' + g.extern === x.id)); }
// eine GTA als Eintrag des Gesamtplans; „mit …“ nennt die übrigen Leitungen (ohne die Spalte selbst)
function gpGtaEintrag(d, g, iv, o, C, spalte) {
  const mit = g.personen.filter(id => id !== spalte).map(id => { const l = C.l.get(id); return l ? (l.kuerzel || l.name || '?') : '?'; });
  if (g.extern && spalte !== 'ext:' + g.extern) mit.push(g.extern + ' (extern)');
  return { start: iv.start, end: iv.end, art: 'gta', farbe: g.farbe || GTA_FARBE, titel: 'GTA ' + g.name, zusatz: o.raeume !== false && g.raum ? C.r.get(g.raum) || '' : '', marke: mit.length ? 'mit ' + mit.join(', ') : '', co: false, wochen: ['A', 'B'], rotation: false };
}
function gpTeile(d, tag, o, idx) {
  const pers = gpPersonen(d, tag, idx).concat(gpExterne(d, tag)), n = Math.max(1, Math.ceil(pers.length / gpSpalten(o))), je = Math.max(1, Math.ceil(pers.length / n));
  return Array.from({ length: n }, (_, i) => pers.slice(i * je, (i + 1) * je));
}
function gpDruckListe(o) {
  const d = APP.daten, idx = belegungsIndex(d);
  return d.schule.tage.flatMap((t, tag) => {
    if (o.auswahl !== 'alle' && String(tag) !== String(o.auswahl)) return [];
    const n = gpTeile(d, tag, o, idx).length;
    return Array.from({ length: n }, (_, i) => ['gesamtplan', tag + '|' + i, 'Gesamtplan ' + TAGE_LANG[t] + (n > 1 ? ' (Teil ' + (i + 1) + ' von ' + n + ')' : '')]);
  });
}
// Einsätze einer Person an einem Tag als druckfertige Einträge (Titel, Zusatz, Uhrzeit, Hinweis auf Woche/Rhythmus)
function gpEintraege(d, l, tag, idx, o, C) {
  if (l.extern) return gpExternGtas(d, l, tag).map(g => gpGtaEintrag(d, g, gtaIntervall(d, g), o, C, l.id)).sort((a, b) => a.start - b.start || a.end - b.end);
  return ((idx.get(l.id) || [])[tag] || []).filter(b => b.art !== 'gesperrt' && b.end > b.start).map(b => {
    const e = { start: b.start, end: b.end, art: b.art, farbe: b.farbe || '#9aa9c2', titel: b.kurz || b.text || '?', zusatz: '', marke: '', co: b.art === 'co', wochen: b.wochen || ['A', 'B'], rotation: !!b.rotation };
    if (b.art === 'unterricht' || b.art === 'co') {
      const u = C.u.get(b.ref), gr = o.gruppen !== false && u ? gruppenText(d, u) : '';
      e.titel = (b.kurz || '?') + (gr ? ' · ' + gr : '');
      if (o.raeume !== false && b.raum) e.zusatz = C.r.get(b.raum) || '';
    } else if (b.art === 'aufgabe') e.titel = b.text || b.kurz || 'Aufgabe';
    else if (b.art === 'gta') { const g = C.g.get(b.ref); if (g) Object.assign(e, gpGtaEintrag(d, g, b, o, C, l.id)); else { e.titel = 'GTA ' + (b.kurz || ''); if (o.raeume !== false && b.raum) e.zusatz = C.r.get(b.raum) || ''; } }
    else if (b.art === 'dienst') {
      const x = C.x.get(b.ref);
      if (x) {
        const m = dienstMeta(d, x), be = dBereich(x.bereich || (m.bedarf && m.bedarf.bereich));
        // Pausennamen tragen ihre Zeit oft schon im Namen („Große Pause (09:05–09:25)“) – die genaue Zeit steht ohnehin in der Zelle
        e.titel = dienstTitel(x).replace(/\s*\(\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}\)\s*$/, '') || 'Aufsicht';
        e.zusatz = be ? be.name : '';
        e.farbe = m.farbe || e.farbe;
        if (x.rhythmus.art !== 'woechentlich' && x.rhythmus.art !== 'rotation') e.marke = rhythmusText(x.rhythmus);
      }
      if (b.rotation || (x && x.rhythmus.art === 'rotation')) e.marke = 'Rotation';
    }
    if (b.art !== 'dienst' && e.wochen.length === 1) e.marke = 'nur Woche ' + e.wochen[0];
    return e;
  }).sort((a, b) => a.start - b.start || a.end - b.end);
}
// Spuren einer Person: Einträge, die sich zeitlich überschneiden, bekommen nebeneinander eigene Spuren (Woche A links, dann B)
function gpSpuren(liste) {
  const wo = e => e.wochen.length === 1 ? (e.wochen[0] === 'A' ? 1 : 2) : 0;
  const sortiert = liste.slice().sort((a, b) => a.start - b.start || wo(a) - wo(b) || b.end - a.end);
  const enden = [];
  sortiert.forEach(e => { let i = 0; while (enden[i] !== undefined && enden[i] > e.start) i++; enden[i] = e.end; e.spur = i; });
  return { liste: sortiert, n: Math.max(1, enden.length) };
}
function gpTon(e, farbig) {
  if (e.art === 'dienst') return { background: farbig && /^#[0-9a-fA-F]{6}$/.test(e.farbe) ? e.farbe + '3d' : '#e4e4e4' };
  if (e.art === 'aufgabe') return { background: '#ededed' };
  if (e.art === 'gta') return { background: farbig ? '#e2f2e9' : '#f2f2f2' };
  return null;
}
function gpRand(e, farbig) { return farbig ? e.farbe : e.art === 'dienst' ? '#000' : '#777'; }
// Umbruch nach „/“ erlauben („Flur/Treppenhaus“, „Hort/Betreuung“), statt mitten im Wort zu trennen
const gpUmbruch = t => String(t || '').replace(/\//g, '/​');
function gpEintrag(e, farbig, einzeln) {
  // einzeln: die Zelle trägt Rand und Hintergrund selbst (über die ganze Höhe); sonst trägt jeder Eintrag seinen eigenen
  return h('div', { class: 'gp-e art-' + e.art + (e.rotation ? ' rot' : ''), style: einzeln ? null : Object.assign({ borderLeftColor: gpRand(e, farbig) }, gpTon(e, farbig) || {}) },
    e.co ? h('span', { class: 'gp-co' }, 'Co') : null, h('b', {}, gpUmbruch(e.titel)),
    e.zusatz ? (e.art === 'dienst' ? h('span', { class: 'gp-x blk' }, gpUmbruch(e.zusatz)) : h('span', { class: 'gp-x' }, ' · ' + gpUmbruch(e.zusatz.length <= 12 ? e.zusatz.replace(/ /g, ' ') : e.zusatz))) : null, ' ',
    h('span', { class: 'gp-t' }, zeitText(e.start) + '–' + zeitText(e.end)), e.marke ? h('span', { class: 'gp-m' }, e.marke) : null);
}
function gpTabelle(d, tag, pers, o, idx) {
  const C = { u: new Map(d.unterrichte.map(u => [u.id, u])), r: new Map(d.raeume.map(r => [r.id, r.name])), x: new Map(d.dienste.plan.map(x => [x.id, x])), l: new Map(d.lehrer.map(l => [l.id, l])), g: new Map((d.gta || []).map(g => [g.id, g])) };
  const farbig = o.farbe !== false;
  const spalten = pers.map(l => Object.assign({ l }, gpSpuren(gpEintraege(d, l, tag, idx, o, C))));
  const grenzen = [...new Set(spalten.flatMap(s => s.liste.flatMap(e => [e.start, e.end])))].sort((a, b) => a - b);
  const R = grenzen.length - 1, pos = new Map(grenzen.map((g, i) => [g, i]));
  if (R < 1) return null;
  const zeilen = [];
  for (let r = 0; r < R; r++) zeilen.push(h('tr', { 'data-dauer': grenzen[r + 1] - grenzen[r] }, h('th', { class: 'gp-z', scope: 'row' }, h('div', { class: 'gp-zl' }, h('span', {}, zeitText(grenzen[r]))))));
  spalten.forEach(s => {
    // Belegung je Zeile und Spur; ein Eintrag ohne Nachbarn in den Spuren rechts davon wird über diese verbreitert
    const L = s.n, belegt = Array.from({ length: R }, () => Array(L).fill(null));
    s.liste.forEach(e => { e.r0 = pos.get(e.start); e.r1 = pos.get(e.end); for (let r = e.r0; r < e.r1; r++) belegt[r][e.spur] = e; });
    s.liste.forEach(e => {
      e.breit = 1;
      for (let j = e.spur + 1; j < L; j++) { let frei = true; for (let r = e.r0; r < e.r1 && frei; r++) if (belegt[r][j] !== null) frei = false; if (!frei) break; for (let r = e.r0; r < e.r1; r++) belegt[r][j] = e; e.breit++; }
      // echte Überschneidung (gleiche Woche, keine Rotation) rot umranden – A/B-Paare und Gruppen anderer Wochen sind keine
      e.ueber = s.liste.some(y => y !== e && e.start < y.end && y.start < e.end && e.wochen.some(w => y.wochen.includes(w)) && !e.rotation && !y.rotation);
    });
    const leer = Array.from({ length: R }, () => Array(L).fill(false));
    for (let r = 0; r < R; r++) for (let j = 0; j < L; j++) {
      const e = belegt[r][j];
      if (e) {
        if (e.r0 === r && e.spur === j) zeilen[r].append(h('td', { class: 'gp-b eins art-' + e.art + (e.ueber ? ' ueber' : '') + (L > 1 ? ' spur' : ''), rowspan: e.r1 - e.r0, colspan: e.breit > 1 ? e.breit : null, style: Object.assign({ borderLeftColor: gpRand(e, farbig) }, gpTon(e, farbig) || {}) }, gpEintrag(e, farbig, true)));
        continue;
      }
      if (leer[r][j]) continue;
      let bis = r; while (bis < R && !belegt[bis][j]) { leer[bis][j] = true; bis++; }
      zeilen[r].append(h('td', { class: 'gp-leer' + (j > 0 ? ' spur' : '') + (j < L - 1 ? ' spur-r' : ''), rowspan: bis - r }));
    }
  });
  // Schlusszeile ohne Höhe: trägt nur die Uhrzeit des Tagesendes
  const nSpalten = spalten.reduce((a, s) => a + s.n, 0);
  zeilen.push(h('tr', { class: 'gp-schluss' }, h('th', { class: 'gp-z' }, h('div', { class: 'gp-zl' }, h('span', {}, zeitText(grenzen[R])))), h('td', { colspan: nSpalten })));
  const kopf = h('tr', {}, h('th', { class: 'gp-ecke', scope: 'col' }, 'Uhrzeit'), spalten.map(({ l, n, liste }) => {
    if (l.extern) return h('th', { class: 'gp-p gp-ext', scope: 'col', colspan: n > 1 ? n : null }, h('b', {}, gpUmbruch(l.kuerzel)), h('span', { class: 'gp-n' }, l.id === 'ext:' ? 'GTA' : 'extern · GTA'),
      liste.length ? h('span', { class: 'gp-a' }, zeitText(Math.min(...liste.map(e => e.start))) + '–' + zeitText(Math.max(...liste.map(e => e.end)))) : null);
    const a = tagesAnwesenheit(d, l.id, tag, idx);
    return h('th', { class: 'gp-p', scope: 'col', colspan: n > 1 ? n : null }, h('b', {}, l.kuerzel || l.name || '?'), l.name && l.name !== l.kuerzel ? h('span', { class: 'gp-n' }, l.name) : null,
      a.spanne ? h('span', { class: 'gp-a' }, zeitText(a.ersterBeginn) + '–' + zeitText(a.letztesEnde)) : null);
  }));
  // Breite: eine Person mit einer Spur = 1 Teil, jede weitere Spur +0,7 Teile – nebeneinanderstehende Blöcke bleiben lesbar (Uhrzeit-Spalte ≈ 10,5 mm von 277 mm)
  const gewicht = s => 1 + 0.7 * (s.n - 1), teile = spalten.reduce((a, s) => a + gewicht(s), 0) || 1;
  return h('table', { class: 'gp' + (farbig ? '' : ' sw') }, h('colgroup', {}, h('col', { class: 'gp-zc', style: { width: '3.8%' } }), spalten.flatMap(s => Array.from({ length: s.n }, () => h('col', { style: { width: ((100 - 3.8) * gewicht(s) / teile / s.n).toFixed(3) + '%' } })))), h('thead', {}, kopf), h('tbody', {}, zeilen));
}
function gpLegende(d, tag, alle, letzte, o) {
  const farbig = o.farbe !== false, mit = new Set(alle.map(l => l.id));
  const ohne = lehrerAlphabetisch(d.lehrer).filter(l => !mit.has(l.id)), abw = ohne.filter(l => dienstFenster(l, tag, d.schule).abwesend), frei = ohne.filter(l => !abw.includes(l));
  const name = l => (l.kuerzel || '?') + (l.name && l.name !== l.kuerzel ? ' (' + l.name + ')' : '');
  const probe = (art, text, st) => h('span', { class: 'gl' }, h('i', { class: 'art-' + art, style: st }), text);
  const aufsFarbe = farbig ? (DIENSTTYPEN.find(t => t.kategorie === 'aufsicht') || {}).farbe || '#5f9a6b' : '#000';
  return h('div', { class: 'gp-legende' },
    probe('unterricht', farbig ? 'Unterricht (Rand = Fachfarbe)' : 'Unterricht', { borderLeftColor: farbig ? '#4f7bd8' : '#777' }),
    probe('co', 'Co-Unterricht (gestrichelter Rand, „Co“)', { borderLeftColor: farbig ? '#4f7bd8' : '#777', borderLeftStyle: 'dashed' }),
    probe('aufgabe', 'Aufgabe / Termin', { background: '#ededed', borderLeftColor: '#8c96a8' }),
    probe('gta', 'GTA (Ganztagsangebot; „mit …“ = weitere Leitung)', { background: farbig ? '#e2f2e9' : '#f2f2f2', borderLeftColor: farbig ? GTA_FARBE : '#777' }),
    alle.some(x => x.extern) ? h('span', { class: 'gl' }, h('b', {}, 'extern · GTA: '), 'eigene Spalte je externer Leitung (zählt nicht zur Arbeitszeit)') : null,
    probe('dienst', farbig ? 'Aufsicht (Farbe der Aufsicht)' : 'Aufsicht (grau hinterlegt)', Object.assign({ borderLeftColor: aufsFarbe }, gpTon({ art: 'dienst', farbe: aufsFarbe }, farbig))),
    h('span', { class: 'gl' }, 'Jeder Block reicht genau von seinem Beginn bis zu seinem Ende an der Zeitleiste; Gleichzeitiges (A-/B-Woche, Gruppen) steht nebeneinander'),
    letzte && frei.length ? h('span', { class: 'gl notiz' }, h('b', {}, 'Ohne Einsatz: '), frei.map(name).join(', ')) : null,
    letzte && abw.length ? h('span', { class: 'gl notiz' }, h('b', {}, 'Abwesend: '), abw.map(l => name(l) + ' – ' + dienstFenster(l, tag, d.schule).grund).join('; ')) : null);
}
// Seite einpassen: Schrift nur so weit verkleinern wie nötig (höchstens auf 87 %), dann die Zeilenhöhe so nah wie möglich an die Dauer bringen.
// Jede Zeitzeile ist mindestens so hoch wie ihre Uhrzeit am Rand – so steht an JEDER Blockgrenze die Uhrzeit, kurze Abschnitte (Pausen,
// 8 Minuten Versatz) werden dafür etwas höher gezeichnet, als ihre Dauer es verlangt. Die Zeitleiste ist also nicht ganz maßstäblich,
// aber jeder Block beginnt und endet genau an seinen Uhrzeiten.
// Passt der Tag trotzdem nicht auf ein Blatt, läuft er auf die nächste Seite weiter (Kopfzeile der Tabelle wird wiederholt).
function gpEinpassen(seite, tab) {
  const zeilen = [...tab.tBodies[0].rows].filter(tr => tr.dataset.dauer);
  const mess = h('div', { class: 'druckmess', 'aria-hidden': 'true' }, seite);
  document.body.append(mess);
  try {
    const ZIEL = 186 * 96 / 25.4; // .druckseite ist im Druck 188 mm hoch
    const hoch = () => seite.getBoundingClientRect().height;
    let skal = 1;
    const setzeK = k => { const min = 2.9 * skal; zeilen.forEach(tr => { tr.style.height = Math.max(min, k * Number(tr.dataset.dauer)).toFixed(2) + 'mm'; }); };
    setzeK(0);
    while (hoch() > ZIEL && skal > 0.88) { skal = Math.round((skal - 0.04) * 100) / 100; tab.style.setProperty('--gps', String(skal)); setzeK(0); }
    if (hoch() > ZIEL) seite.classList.add('gp-lang');
    else { let lo = 0, hi = 0.8; for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2; setzeK(m); if (hoch() <= ZIEL) lo = m; else hi = m; } setzeK(lo); }
    // Uhrzeiten am Rand nur so dicht, wie sie lesbar bleiben (die genaue Zeit steht ohnehin in jeder Zelle)
    let zuletzt = -Infinity;
    tab.querySelectorAll('.gp-zl span').forEach(sp => { const r = sp.getBoundingClientRect(); if (r.top - zuletzt < r.height) sp.hidden = true; else zuletzt = r.top; });
  } finally { mess.remove(); }
}
// Die Regeln des Gesamtplans aus dem Stylesheet – für die eigenständige HTML-Datei (eine Quelle für Druck und Weitergabe)
function gpCssText() {
  const out = [];
  for (const s of document.styleSheets) { let regeln; try { regeln = s.cssRules; } catch (e) { continue; } for (const r of regeln) if (r.selectorText && /table\.gp\b|\.gp-/.test(r.selectorText) && !/druck/.test(r.selectorText)) out.push(r.cssText); }
  return out.join('');
}
function gesamtplanSeite(id, titel, i, n, o, mitLegende) {
  const d = APP.daten, [tagS, teilS] = String(id).split('|'), tag = Number(tagS) || 0, teil = Number(teilS) || 0;
  o = Object.assign({}, druckOpt(), o || {});
  const idx = belegungsIndex(d), teile = gpTeile(d, tag, o, idx), pers = teile[teil] || [];
  const tab = pers.length ? gpTabelle(d, tag, pers, o, idx) : null;
  const seite = h('div', { class: 'druckseite gp-seite' }, druckKopf(titel),
    tab ? h('div', { class: 'gp-rahmen' }, tab) : h('p', {}, 'Keine Einsätze an diesem Tag.'),
    mitLegende ? gpLegende(d, tag, teile.flat(), teil === teile.length - 1, o) : null, druckFuss(i, n));
  if (tab) gpEinpassen(seite, tab);
  return seite;
}

/* ---------------- Schule: Unterrichts-Zeitprofile ---------------- */
function zeitprofilAusRaster(S) {
  const st = S.stunden, bl = [];
  let n = 0;
  for (let i = 0; i < st.length; i++) {
    if (st[i].istPause) continue;
    n++;
    const j = i + 1;
    if (st[i].doppelMitNaechster && st[j] && !st[j].istPause) { bl.push({ name: 'Block ' + (bl.length + 1), von: n, bis: n + 1, beginn: st[i].beginn, ende: st[j].ende }); n++; i = j; }
    else bl.push({ name: 'Block ' + (bl.length + 1), von: n, bis: n, beginn: st[i].beginn, ende: st[i].ende });
  }
  return bl;
}
function profilAendern(beschr, pid, fn) { aendern(beschr, d => { const z = d.schule.zeitprofile.find(x => x.id === pid); if (z) fn(z, d); }); }
function zeitprofilPruefen(S, z) {
  const out = [], nL = S.stunden.filter(s => !s.istPause).length;
  const belegt = new Map();
  z.bloecke.forEach(b => {
    const iv = intervall(b.beginn, b.ende);
    if (!iv || iv.end <= iv.start) out.push(b.name + ': Beginn/Ende ungültig.');
    for (let n = b.von; n <= b.bis; n++) { if (n > nL) { out.push(b.name + ': Stunde ' + n + ' gibt es im Zeitraster nicht (nur ' + nL + ').'); break; } if (belegt.has(n)) out.push('Stunde ' + n + ' liegt in ' + belegt.get(n) + ' und ' + b.name + '.'); belegt.set(n, b.name); }
  });
  for (let i = 0; i < z.bloecke.length; i++) for (let j = i + 1; j < z.bloecke.length; j++) { const a = intervall(z.bloecke[i].beginn, z.bloecke[i].ende), c = intervall(z.bloecke[j].beginn, z.bloecke[j].ende); if (a && c && intervalleUeberschneiden(a, c)) out.push(z.bloecke[i].name + ' und ' + z.bloecke[j].name + ' überschneiden sich zeitlich.'); }
  const frei = []; for (let n = 1; n <= nL; n++) if (!belegt.has(n)) frei.push(n);
  return { fehler: out, frei };
}
// Für welche Klassen und Fächer gilt ein Zeitprofil? Klassen einzeln anhaken; Fächer gelten in allen Klassen und haben Vorrang.
async function profilGeltungDialog(pid) {
  const d = APP.daten, z = d.schule.zeitprofile.find(x => x.id === pid); if (!z) return;
  const pName = id => (d.schule.zeitprofile.find(x => x.id === id) || {}).name || '';
  const kl = new Set(d.klassen.filter(k => k.zeitprofil === z.id).map(k => k.id)), fa = new Set(z.faecher || []);
  const klassen = klassenAlphabetisch(d.klassen), faecher = d.faecher.slice().sort((a, b) => natVergleich(a.kuerzel || a.name, b.kuerzel || b.name));
  const jg = [...new Set(klassen.map(k => k.jahrgang))].sort((a, b) => a - b);
  const root = h('div', {});
  const zeichne = () => leeren(root).append(
    h('p', { class: 'muted klein', style: { marginTop: 0 } }, 'Ein Profil kann für einzelne Klassen gelten (ihr gesamter Unterricht) und für einzelne Fächer (dann in allen Klassen, z. B. Sport). Trifft beides zu, gilt das Profil des Fachs.'),
    h('h3', {}, 'Klassen', hilfe('Der gesamte Unterricht dieser Klassen läuft nach den Zeiten des Profils. Eine Klasse hat höchstens ein Profil.')),
    klassen.length ? h('div', {},
      jg.length > 1 ? h('div', { class: 'zeile eng', style: { marginBottom: '6px' } }, h('span', { class: 'klein muted' }, 'Schnellwahl:'), jg.map(j => { const ks = klassen.filter(k => k.jahrgang === j), alle = ks.every(k => kl.has(k.id)); return h('button', { class: 'btn klein' + (alle ? ' aktiv' : ''), title: (alle ? 'Alle Klassen des Jahrgangs abwählen' : 'Alle Klassen des Jahrgangs anhaken') + ' – danach lassen sich einzelne Klassen wieder ändern', onclick: () => { ks.forEach(k => { if (alle) kl.delete(k.id); else kl.add(k.id); }); zeichne(); } }, 'Jg. ' + j); }),
        h('button', { class: 'btn klein', onclick: () => { kl.clear(); zeichne(); } }, 'keine')) : null,
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '4px 10px' } }, klassen.map(k => h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: kl.has(k.id), 'aria-label': 'Klasse ' + k.name, onchange: ev => { if (ev.target.checked) kl.add(k.id); else kl.delete(k.id); zeichne(); } }), h('b', {}, k.name),
        k.zeitprofil && k.zeitprofil !== z.id ? h('span', { class: 'klein muted', title: 'Die Klasse wechselt beim Anhaken in dieses Profil.' }, ' (bisher ' + pName(k.zeitprofil) + ')') : null)))) : h('p', { class: 'muted' }, 'Noch keine Klassen angelegt.'),
    h('h3', {}, 'Fächer – in allen Klassen', hilfe('Unterricht dieser Fächer läuft immer nach diesem Profil, gleich in welcher Klasse – z. B. Sport als 90-Minuten-Block ohne Wechselpause. Ein Fach hat höchstens ein Profil.')),
    faecher.length ? h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '4px 10px' } }, faecher.map(x => { const anders = d.schule.zeitprofile.find(y => y.id !== z.id && (y.faecher || []).includes(x.id)); return h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: fa.has(x.id), 'aria-label': 'Fach ' + (x.kuerzel || x.name), onchange: ev => { if (ev.target.checked) fa.add(x.id); else fa.delete(x.id); } }), h('span', { class: 'fachpunkt', style: { background: x.farbe } }), h('b', {}, x.kuerzel || '?'), ' ' + (x.name || ''),
      anders ? h('span', { class: 'klein muted' }, ' (bisher ' + anders.name + ')') : null); })) : h('p', { class: 'muted' }, 'Noch keine Fächer angelegt.'));
  zeichne();
  const ok = await dialog({ titel: 'Zeitprofil „' + z.name + '“ gilt für …', breite: '720px', inhalt: root, knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'Übernehmen', wert: true, art: 'primaer' }] });
  if (!ok) return;
  aendern('Zeitprofil „' + z.name + '“: Klassen und Fächer', dd => {
    dd.klassen.forEach(k => { if (kl.has(k.id)) k.zeitprofil = z.id; else if (k.zeitprofil === z.id) k.zeitprofil = null; });
    dd.schule.zeitprofile.forEach(y => { y.faecher = y.id === z.id ? dd.faecher.map(x => x.id).filter(id => fa.has(id)) : (y.faecher || []).filter(id => !fa.has(id)); });
  });
}
function zeitprofileKarte() {
  const d = APP.daten, S = d.schule, nL = nlektionen();
  const stdOpts = Array.from({ length: nL }, (_, i) => [String(i + 1), (i + 1) + '.']);
  const profile = S.zeitprofile.map(z => {
    const kl = klassenAlphabetisch(d.klassen.filter(k => k.zeitprofil === z.id)).map(k => k.name);
    const fa = (z.faecher || []).map(id => fachVon(id)).filter(Boolean);
    const p = zeitprofilPruefen(S, z);
    return h('div', { class: 'profil', 'data-id': z.id },
      h('div', { class: 'zeile' },
        h('input', { type: 'text', value: z.name, style: { width: '200px', fontWeight: '600' }, 'aria-label': 'Name des Zeitprofils', onchange: ev => profilAendern('Zeitprofil umbenannt', z.id, x => { x.name = ev.target.value.trim().slice(0, 60) || x.name; }) }),
        h('div', { class: 'rechts' }),
        h('button', { class: 'btn klein', onclick: () => profilAendern('Block ergänzt', z.id, x => { const l = x.bloecke[x.bloecke.length - 1]; const bis = l ? Math.min(nL, l.bis + 1) : 1; const e = l ? minVon(l.ende) || 480 : 480; x.bloecke.push({ id: 'b' + (x.bloecke.length + 1) + '_' + Date.now() % 1000, name: 'Block ' + (x.bloecke.length + 1), von: bis, bis, beginn: zeitText(e), ende: zeitText(e + 45) }); }) }, '+ Block'),
        h('button', { class: 'btn klein', onclick: () => aendern('Zeitprofil dupliziert', dd => { const x = dd.schule.zeitprofile.find(y => y.id === z.id); dd.schule.zeitprofile.push(nZeitprofil(Object.assign(JSON.parse(JSON.stringify(x)), { id: null, name: x.name + ' (Kopie)' }))); }, { normalisieren: true }) }, 'Profil duplizieren'),
        h('button', { class: 'btn klein gefahr', onclick: async () => { if ((kl.length || fa.length) && !(await bestaetigen('Zeitprofil „' + z.name + '“ löschen? ' + [kl.length ? kl.length + ' Klasse(n)' : '', fa.length ? fa.length + ' Fach/Fächer' : ''].filter(Boolean).join(' und ') + ' nutzen danach wieder das Schulraster.', 'Löschen', 'gefahr'))) return; aendernMitUndo('Zeitprofil gelöscht', dd => { dd.schule.zeitprofile = dd.schule.zeitprofile.filter(y => y.id !== z.id); dd.klassen.forEach(k => { if (k.zeitprofil === z.id) k.zeitprofil = null; }); }, null, 'Zeitprofil „' + z.name + '“ gelöscht.'); } }, 'Profil löschen')),
      h('div', { class: 'zeile eng profilgilt', style: { margin: '6px 0 8px' } }, h('b', { class: 'klein' }, 'Gilt für:'),
        h('button', { class: 'btn klein kurzknopf', title: 'Klassen und Fächer wählen, für die dieses Profil gilt', 'aria-label': 'Geltung des Profils ' + z.name + ' bearbeiten', onclick: () => profilGeltungDialog(z.id) },
          h('span', {}, 'Klassen: ', kl.length ? h('b', {}, kl.join(', ')) : h('span', { class: 'muted' }, 'keine')),
          h('span', {}, 'Fächer (in allen Klassen): ', fa.length ? h('b', {}, fa.map(x => x.kuerzel || x.name).join(', ')) : h('span', { class: 'muted' }, 'keine')), h('span', { class: 'stift' }, icon('stift', 'k'))),
        !kl.length && !fa.length ? h('span', { class: 'badge warn' }, 'gilt noch für nichts') : null),
      h('table', { class: 'tab kompakt zeitprofil' },
        h('thead', {}, h('tr', {}, ['Block', 'Stunden', 'Beginn', 'Ende', 'Dauer', 'je Stunde', ''].map(t => h('th', {}, t)))),
        h('tbody', {}, z.bloecke.map((b, i) => {
          const iv = intervall(b.beginn, b.ende), n = b.bis - b.von + 1;
          const zf = f => h('input', { type: 'text', class: 'zeitfeld', value: b[f], style: { width: '64px' }, 'aria-label': (f === 'beginn' ? 'Beginn ' : 'Ende ') + b.name, onchange: ev => { const v = zeitNorm(ev.target.value); if (!v) { toast('Bitte eine Uhrzeit wie 08:00 eingeben.', 'err'); render(); return; } profilAendern(b.name + ' ' + (f === 'beginn' ? 'Beginn' : 'Ende'), z.id, x => { x.bloecke[i][f] = v; }); } });
          return h('tr', { 'data-id': z.id + ':' + i },
            h('td', {}, h('input', { type: 'text', value: b.name, style: { width: '100px' }, 'aria-label': 'Name des Blocks', onchange: ev => profilAendern('Block umbenannt', z.id, x => { x.bloecke[i].name = ev.target.value.trim().slice(0, 40) || x.bloecke[i].name; }) })),
            h('td', {}, h('span', { class: 'zeile eng nowrap' }, sel(stdOpts, String(b.von), v => profilAendern('Block Stunden', z.id, x => { x.bloecke[i].von = Number(v); if (x.bloecke[i].bis < x.bloecke[i].von) x.bloecke[i].bis = x.bloecke[i].von; }), { 'aria-label': 'von Stunde' }), '–', sel(stdOpts, String(b.bis), v => profilAendern('Block Stunden', z.id, x => { x.bloecke[i].bis = Number(v); if (x.bloecke[i].von > x.bloecke[i].bis) x.bloecke[i].von = x.bloecke[i].bis; }), { 'aria-label': 'bis Stunde' }))),
            h('td', {}, zf('beginn')), h('td', {}, zf('ende')),
            h('td', { class: 'zahl' }, iv && iv.end > iv.start ? (iv.end - iv.start) + ' min' : h('span', { class: 'badge err' }, 'ungültig')),
            h('td', { class: 'zahl muted' }, iv && iv.end > iv.start && n > 1 ? zahlDe((iv.end - iv.start) / n, 1) + ' min' : ''),
            h('td', { class: 'aktion' }, h('button', { class: 'btn icon klein gefahr', 'aria-label': 'Block löschen', title: 'Block löschen', onclick: () => undoToastNach(() => profilAendern('Block gelöscht', z.id, x => { x.bloecke.splice(i, 1); }), 'Block gelöscht.') }, icon('papierkorb'))));
        }))),
      p.fehler.length ? h('div', { class: 'hinweis err' }, p.fehler.join(' ')) : null,
      p.frei.length && z.bloecke.length ? h('div', { class: 'muted klein' }, 'Stunde ' + p.frei.join(', ') + ' ohne Block: dort gelten die Zeiten des Schulrasters.') : null);
  });
  return h('div', { class: 'karte' },
    h('div', { class: 'zeile' }, h('h3', { style: { margin: 0 } }, 'Zeitprofile'), h('span', { class: 'muted klein' }, S.zeitprofile.length ? S.zeitprofile.length + ' Profil(e)' : ''), h('div', { class: 'rechts' }),
      h('button', { class: 'btn primaer klein', onclick: () => aendern('Zeitprofil angelegt', dd => { dd.schule.zeitprofile.push(nZeitprofil({ name: 'Profil ' + (dd.schule.zeitprofile.length + 1), bloecke: zeitprofilAusRaster(dd.schule) })); }, { normalisieren: true }) }, '+ Zeitprofil')),
    h('p', { class: 'muted klein' }, 'Das Zeitraster oben bleibt die logische Stundenstruktur, nach der geplant wird. Ein Zeitprofil legt für einzelne Klassen (z. B. 1a und 2a: ihr gesamter Unterricht) oder für einzelne Fächer (z. B. Sport: in allen Klassen) die echten Uhrzeiten fest, etwa Block 1 = 1.–2. Stunde 08:00–09:30. Die Zeit eines Blocks verteilt sich gleichmäßig auf seine Stunden. Die echten Zeiten erscheinen in den Plänen und im Druck und gelten für Aufsichten und Anwesenheit: Die Pausen der Profil-Klassen stehen bei den Aufsichten als eigene Zeilen. Gekoppelte Klassen mit unterschiedlichen Zeiten meldet die Prüfung.'),
    profile.length ? profile : h('p', { class: 'muted' }, 'Kein Zeitprofil – alle Klassen nutzen die Zeiten des Schulrasters.'));
}

