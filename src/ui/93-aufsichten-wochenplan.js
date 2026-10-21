/* ---------------- Reiter „Wochenplan“ (Timeline) ---------------- */
const TL_ACHSE = 52;
function tlPersonen(d, st) {
  const q = (st.suche || '').trim().toLowerCase();
  const mitDienst = new Set(d.dienste.plan.map(x => x.lehrer));
  return lehrerAlphabetisch(d.lehrer).filter(l => {
    if (q && !((l.kuerzel || '') + ' ' + (l.name || '')).toLowerCase().includes(q)) return false;
    if (st.filter === 'dienstfaehig') return l.aufsicht !== false || mitDienst.has(l.id);
    if (st.filter === 'mitDiensten') return mitDienst.has(l.id);
    if (st.filter === 'lehrkraefte') return l.ausgebildet !== false;
    if (st.filter === 'cokraefte') return l.ausgebildet === false;
    return true;
  });
}
// Gesamtansicht „Tag × Personen“: externe GTA-Leitungen (und GTAs ohne Leitung) als eigene Spalten am Ende – nur bei „einplanbare“ und „alle Personen“
function tlExterne(d, st) {
  if (st.filter !== 'dienstfaehig' && st.filter !== 'alle') return [];
  const q = (st.suche || '').trim().toLowerCase();
  return gpExterne(d, st.tag).filter(x => !q || x.kuerzel.toLowerCase().includes(q) || 'extern gta'.includes(q));
}
function tlExternSpalte(d, sp, g) {
  const gs = gpExternGtas(d, sp.ext, sp.tag).map(x => ({ x, iv: gtaIntervall(d, x) })).sort((a, b) => a.iv.start - b.iv.start || a.iv.end - b.iv.end);
  const ohne = sp.ext.id === 'ext:';
  g.kopf.append(h('div', { class: 'tl-kopf extern', style: { width: g.breite + 'px' }, title: ohne ? 'GTAs ohne eingetragene Leitung' : sp.ext.kuerzel + ' – externe GTA-Leitung: zählt nicht zur Arbeitszeit, übernimmt keine Aufsichten' },
    h('div', { class: 'n' }, h('span', {}, h('b', {}, sp.titel))), h('div', { class: 'x' }, sp.unter + (gs.length ? ' · ' + zeitText(gs[0].iv.start) + '–' + zeitText(Math.max(...gs.map(o => o.iv.end))) : ''))));
  const spalte = h('div', { class: 'tl-spalte extern', style: Object.assign({ width: g.breite + 'px', height: g.H + 'px' }, g.raster) });
  const enden = [];
  gs.forEach(o => { let k = enden.findIndex(e => e <= o.iv.start); if (k < 0) { k = enden.length; enden.push(0); } enden[k] = o.iv.end; o.k = k; });
  const n = Math.max(1, enden.length);
  gs.forEach(o => {
    const rn = o.x.raum ? ((d.raeume.find(r => r.id === o.x.raum) || {}).name || '') : '';
    spalte.append(h('div', { class: 'tl-b art-gta klickbar', 'data-gta': o.x.id, role: 'button', tabindex: 0, style: Object.assign(g.pos(o.iv.start, o.iv.end), { borderLeftColor: o.x.farbe || GTA_FARBE, left: 'calc(' + (o.k * 100 / n) + '% + 2px)', right: 'auto', width: 'calc(' + (100 / n) + '% - 4px)' }),
      title: 'GTA „' + o.x.name + '“' + (rn ? ' · ' + rn : '') + '\n' + zeitText(o.iv.start) + '–' + zeitText(o.iv.end) + '\nLeitung: ' + gtaLeitung(d, o.x) + '\nKlick: GTA bearbeiten',
      onclick: () => gtaDialog(o.x.id), onkeydown: ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); gtaDialog(o.x.id); } } },
      h('span', { class: 'k' }, o.x.name), (o.iv.end - o.iv.start) * DS().ppm >= 26 ? h('span', { class: 'z' }, zeitText(o.iv.start) + '–' + zeitText(o.iv.end) + (rn ? ' · ' + rn : '')) : null));
  });
  g.rumpf.append(spalte);
}
function tlSnap(m, ev) { const st = DS(); const s = ev && ev.altKey ? 1 : st.fein ? 5 : 15; return Math.round(m / s) * s; }
function dienstStatusText(r) { return r.stufe === 'hart' ? '✕ Nicht möglich: ' + r.hart[0].text : r.stufe === 'weich' ? '~ Möglich, aber: ' + r.hinweise.join(' ') : '✓ Möglich' + (r.delta <= 2 ? ' – sehr gut' : ''); }
function dienstWochenplanTab() {
  const d = APP.daten, DI = d.dienste, st = DS(), D = d.schule.tage.length;
  if (st.ansicht === 'person' && (!st.person || !d.lehrer.some(l => l.id === st.person))) st.person = (lehrerAlphabetisch(d.lehrer)[0] || {}).id || null;
  // Zeitbereich: Einstellung, bei Bedarf erweitert um alle Aufsichten und Bedarfe der gezeigten Tage
  const tage = st.ansicht === 'person' ? d.schule.tage.map((_, i) => i) : [st.tag];
  let von = minVon(st.von) || 390, bis = minVon(st.bis) || 1020;
  DI.plan.concat(DI.offen).forEach(x => { if (!tage.includes(x.tag)) return; const iv = dienstIntervall(x); if (iv) { von = Math.min(von, iv.start); bis = Math.max(bis, iv.end); } });
  DI.bedarfe.forEach(b => { if (!tage.includes(b.tag)) return; b.abschnitte.forEach(a => { const iv = intervall(a.beginn, a.ende); if (iv && iv.end > iv.start) { von = Math.min(von, iv.start); bis = Math.max(bis, iv.end); } }); });
  (d.gta || []).forEach(g => { if (!tage.includes(g.tag)) return; const iv = gtaIntervall(d, g); if (iv) { von = Math.min(von, iv.start); bis = Math.max(bis, iv.end); } });
  von = Math.floor(von / 15) * 15; bis = Math.ceil(bis / 15) * 15;
  const ppm = st.ppm, H = (bis - von) * ppm;
  const idx = belegungsIndex(d, { ohneDienste: true });
  const idxAlle = belegungsIndex(d);
  const ctx = dienstKontext(d);
  const pruef = new Map(DI.plan.map(x => [x.id, dienstPruefen(d, x, ctx)])), akzD = akzeptiertBezug();
  // Spalten
  const spalten = st.ansicht === 'person'
    ? d.schule.tage.map((t, i) => ({ l: d.lehrer.find(x => x.id === st.person), tag: i, titel: TAGE_LANG[t], unter: '' }))
    : tlPersonen(d, st).map(l => ({ l, tag: st.tag, titel: l.kuerzel || '?', unter: l.name || '' })).concat(tlExterne(d, st).map(x => ({ ext: x, tag: st.tag, titel: x.kuerzel, unter: x.id === 'ext:' ? 'GTA' : 'extern · GTA' })));
  const breite = st.ansicht === 'person' ? 190 : (st.breite || 104);
  // Werkzeugleiste
  const leiste = h('div', { class: 'zeile tl-leiste' },
    h('div', { class: 'zeile eng', role: 'group', 'aria-label': 'Ansicht' },
      h('button', { class: 'btn klein' + (st.ansicht === 'tag' ? ' aktiv' : ''), 'aria-pressed': st.ansicht === 'tag' ? 'true' : 'false', onclick: () => { st.ansicht = 'tag'; render(); } }, 'Tag × Personen'),
      h('button', { class: 'btn klein' + (st.ansicht === 'person' ? ' aktiv' : ''), 'aria-pressed': st.ansicht === 'person' ? 'true' : 'false', onclick: () => { st.ansicht = 'person'; render(); } }, 'Person × Woche')),
    st.ansicht === 'tag' ? h('div', { class: 'zeile eng', role: 'group', 'aria-label': 'Tag' },
      h('button', { class: 'btn icon klein', 'aria-label': 'Vorheriger Tag', onclick: () => { st.tag = (st.tag + D - 1) % D; render(); } }, icon('links')),
      d.schule.tage.map((t, i) => h('button', { class: 'btn klein tl-tagknopf' + (st.tag === i ? ' aktiv' : ''), 'data-tl-tag': i, 'aria-pressed': st.tag === i ? 'true' : 'false', title: 'Ziehen Sie eine Aufsicht hierher, um ihn auf ' + TAGE_LANG[t] + ' zu verschieben', onclick: () => { st.tag = i; render(); } }, t,
        DI.offen.some(o => o.tag === i) ? h('span', { class: 'punkt ' + (DI.offen.some(o => o.tag === i && o.prio === 'min') ? 'err' : 'warn') }) : null)),
      h('button', { class: 'btn icon klein', 'aria-label': 'Nächster Tag', onclick: () => { st.tag = (st.tag + 1) % D; render(); } }, icon('rechts')))
      : h('div', { class: 'zeile eng' }, sel(lehrerAlphabetisch(d.lehrer).map(l => [l.id, (l.kuerzel || '?') + ' – ' + (l.name || '')]), st.person || '', v => { st.person = v; render(); }, { 'aria-label': 'Person' })),
    st.ansicht === 'tag' ? sel([['dienstfaehig', 'einplanbare Personen'], ['alle', 'alle Personen'], ['mitDiensten', 'nur mit Aufsichten'], ['lehrkraefte', 'nur Lehrkräfte'], ['cokraefte', 'nur Co-Kräfte']], st.filter, v => { st.filter = v; render(); }, { 'aria-label': 'Personen filtern' }) : null,
    st.ansicht === 'tag' ? h('input', { type: 'search', placeholder: 'Person suchen …', value: st.suche, style: { width: '140px' }, 'aria-label': 'Person suchen', oninput: ev => { st.suche = ev.target.value; clearTimeout(st.t); st.t = setTimeout(render, 250); } }) : null,
    h('label', { class: 'check klein', title: 'Ziehen und Größe ändern in 5-Minuten-Schritten statt 15 Minuten. Mit gedrückter Alt-Taste minutengenau.' }, h('input', { type: 'checkbox', checked: !!st.fein, onchange: ev => { st.fein = ev.target.checked; } }), 'Fein verschieben'),
    h('label', { class: 'check klein' }, h('input', { type: 'checkbox', checked: st.unterricht, onchange: ev => { st.unterricht = ev.target.checked; render(); } }), 'Unterricht zeigen'),
    h('div', { class: 'zeile eng', role: 'group', 'aria-label': 'Zoom' },
      h('button', { class: 'btn icon klein', 'aria-label': 'Verkleinern', title: 'Verkleinern', onclick: () => { st.ppm = Math.max(0.6, Math.round((st.ppm - 0.2) * 10) / 10); render(); } }, '−'),
      h('button', { class: 'btn icon klein', 'aria-label': 'Vergrößern', title: 'Vergrößern', onclick: () => { st.ppm = Math.min(3, Math.round((st.ppm + 0.2) * 10) / 10); render(); } }, '+')),
    h('div', { class: 'rechts' }),
    h('button', { class: 'btn klein', onclick: () => dienstDialog(null, { tag: st.ansicht === 'person' ? 0 : st.tag, lehrer: st.ansicht === 'person' ? st.person : '' }) }, '+ Aufsicht'),
    h('button', { class: 'btn klein', disabled: !DI.plan.length, onclick: dienstPlanLeeren }, 'Leeren'),
    h('button', { class: 'btn klein', title: 'Gesamtplan (alle Personen, vollständig lesbar) und Aufsichtspläne drucken oder als PDF speichern', onclick: () => dienstDruckMenue() }, icon('drucker'), 'Drucken / PDF'));
  // Zeitachse
  const achse = h('div', { class: 'tl-achse', style: { height: H + 'px', width: TL_ACHSE + 'px' } });
  for (let m = Math.ceil(von / 15) * 15; m <= bis; m += 15) achse.append(h('div', { class: 'tl-marke' + (m % 60 === 0 ? ' voll' : ''), style: { top: ((m - von) * ppm) + 'px' } }, (m % 60 === 0 || ppm >= 1) && (m > von || m % 60 === 0) ? zeitText(m) : ''));
  const raster = { backgroundImage: 'linear-gradient(to bottom, var(--tl-stunde) 1px, transparent 1px), linear-gradient(to bottom, var(--tl-viertel) 1px, transparent 1px)', backgroundSize: '100% ' + (60 * ppm) + 'px, 100% ' + (15 * ppm) + 'px', backgroundPosition: '0 ' + (-((von % 60) * ppm)) + 'px, 0 0' };
  const kopf = h('div', { class: 'tl-kopfzeile' }, h('div', { class: 'tl-ecke', style: { width: TL_ACHSE + 'px' } }, st.ansicht === 'tag' ? tagKurz(st.tag) : ''));
  const rumpf = h('div', { class: 'tl-rumpf' }, achse);
  const pos = (s, e) => ({ top: ((Math.max(s, von) - von) * ppm) + 'px', height: Math.max(4, (Math.min(e, bis) - Math.max(s, von)) * ppm - 1) + 'px' });
  spalten.forEach(sp => {
    if (sp.ext) { tlExternSpalte(d, sp, { kopf, rumpf, breite, raster, H, pos }); return; }
    if (!sp.l) return;
    const l = sp.l, t = sp.tag;
    const anw = tagesAnwesenheit(d, l.id, t, idxAlle);
    const f = dienstFenster(l, t, d.schule);
    const eigene = DI.plan.filter(x => x.lehrer === l.id && x.tag === t);
    const rot = DI.plan.filter(x => x.tag === t && x.lehrer !== l.id && x.rhythmus.art === 'rotation' && x.rhythmus.personen.includes(l.id));
    const nF = eigene.filter(x => dienstMeta(d, x).kat === 'fruehdienst').length, nS = eigene.filter(x => dienstMeta(d, x).kat === 'spaetdienst').length;
    kopf.append(h('div', { class: 'tl-kopf' + (l.aufsicht === false ? ' ausgenommen' : '') + (l.ausgebildet === false ? ' co' : ''), style: { width: breite + 'px' }, title: (l.name || '') + (l.aufsicht === false ? ' – übernimmt keine Aufsichten' : '') + (anw.spanne ? '\nAnwesend ' + zeitText(anw.ersterBeginn) + '–' + zeitText(anw.letztesEnde) + ' (' + dauerText(anw.spanne) + ', Lücken ' + dauerText(anw.luecken) + ')' : '') },
      h('div', { class: 'n' }, st.ansicht === 'person' ? sp.titel : h('span', {}, h('b', {}, sp.titel), ' ', h('span', { class: 'muted' }, sp.unter))),
      h('div', { class: 'x' }, anw.spanne ? zeitText(anw.ersterBeginn) + '–' + zeitText(anw.letztesEnde) + (anw.luecken >= DI.regeln.langeLuecke ? ' · Lücke ' + dauerText(anw.luecken) : '') : f.abwesend ? 'abwesend' : '–',
        nF ? h('span', { class: 'fs f' }, 'F' + (nF > 1 ? nF : '')) : null, nS ? h('span', { class: 'fs s' }, 'S' + (nS > 1 ? nS : '')) : null)));
    const spalte = h('div', { class: 'tl-spalte', 'data-l': l.id, 'data-t': t, style: Object.assign({ width: breite + 'px', height: H + 'px' }, raster), ondblclick: ev => { if (ev.target !== spalte && !ev.target.classList.contains('tl-sperre')) return; const r = spalte.getBoundingClientRect(); const m = tlSnap(von + (ev.clientY - r.top) / ppm); dienstDialog(null, { lehrer: l.id, tag: t, beginn: zeitText(m), ende: zeitText(m + 30) }); } });
    // Anwesenheitsfenster und Abwesenheit
    if (f.abwesend) spalte.append(h('div', { class: 'tl-sperre ganz', style: { top: '0', height: H + 'px' } }, h('span', {}, f.grund)));
    else {
      if (f.start > von) spalte.append(h('div', { class: 'tl-sperre', style: pos(von, f.start), title: 'vor ' + zeitText(f.start) + ' nicht anwesend' }));
      if (f.end < bis) spalte.append(h('div', { class: 'tl-sperre', style: pos(f.end, bis), title: 'nach ' + zeitText(f.end) + ' nicht anwesend' }));
    }
    // feste Belegungen: Unterricht, Co, Aufgaben, Sperrzeiten, bisherige Aufsichten
    (idx.get(l.id) || [])[t] && idx.get(l.id)[t].forEach(b => {
      if (!st.unterricht && (b.art === 'unterricht' || b.art === 'co')) return;
      if (b.end <= von || b.start >= bis) return;
      const gta = b.art === 'gta' ? (d.gta || []).find(g => g.id === b.ref) : null;
      spalte.append(h('div', { class: 'tl-b art-' + b.art + (gta ? ' klickbar' : ''), 'data-gta': gta ? gta.id : null, style: Object.assign(pos(b.start, b.end), b.farbe && b.art !== 'gesperrt' ? { borderLeftColor: b.farbe } : {}), title: b.text + '\n' + zeitText(b.start) + '–' + zeitText(b.end) + (b.wochen.length === 1 ? ' (nur Woche ' + b.wochen[0] + ')' : '') + (b.kompatibel === false ? '\n⚠ gekoppelte Klassen mit unterschiedlichen Zeitprofilen' : '') + (gta ? '\nLeitung: ' + gtaLeitung(d, gta) + '\nKlick: GTA bearbeiten' : ''), onclick: gta ? () => gtaDialog(gta.id) : null },
        h('span', { class: 'k' }, b.kurz || b.text), (b.end - b.start) * ppm >= 26 ? h('span', { class: 'z' }, zeitText(b.start) + '–' + zeitText(b.end)) : null, b.wochen.length === 1 ? h('span', { class: 'ab' }, b.wochen[0]) : null));
    });
    // Aufsichten (mit Spuren bei Überschneidung)
    const liste = eigene.concat(rot).map(x => ({ x, iv: dienstIntervall(x) })).filter(o => o.iv).sort((a, b) => a.iv.start - b.iv.start);
    const spuren = [];
    liste.forEach(o => { let k = spuren.findIndex(e => e <= o.iv.start); if (k < 0) { k = spuren.length; spuren.push(0); } spuren[k] = o.iv.end; o.k = k; });
    const nSp = Math.max(1, spuren.length);
    liste.forEach(o => {
      const x = o.x, meta = dienstMeta(d, x, o.iv), pr = pruef.get(x.id) || { hart: [], hinweise: [] }, akz = akzD.di.get(x.id) || null;
      const nurRot = x.lehrer !== l.id;
      const farbe = meta.farbe || '#9aa9c2';
      const el = h('div', {
        class: 'tl-d' + (x.fixiert ? ' fix' : '') + (pr.hart.length ? ' konflikt' : pr.hinweise.length ? ' weich' : '') + (st.sel === x.id ? ' ausgewaehlt' : '') + (nurRot ? ' rotation' : '') + (x.quelle === 'auto' ? ' auto' : ''),
        tabindex: 0, role: 'button', 'data-id': x.id,
        'aria-label': dienstText(x) + ', ' + lehrerName(l, true) + (x.fixiert ? ', fixiert' : '') + (pr.hart.length ? ', Konflikt: ' + pr.hart[0].text : ''),
        title: dienstText(x) + '\n' + (rhythmusText(x.rhythmus)) + (x.quelle === 'auto' ? ' · automatisch' : ' · von Hand') + (x.fixiert ? ' · fixiert' : '') + (x.notiz ? '\n' + x.notiz : '') + (pr.hart.length ? '\n✕ ' + pr.hart.map(g => g.text).join('\n✕ ') : '') + (pr.hinweise.length ? '\n~ ' + pr.hinweise.join('\n~ ') : '') + (nurRot ? '' : '\nZiehen: verschieben · Kanten: Zeit ändern · Rechtsklick: Menü'),
        style: Object.assign(pos(o.iv.start, o.iv.end), { left: 'calc(' + (o.k * 100 / nSp) + '% + 3px)', width: 'calc(' + (100 / nSp) + '% - 6px)', borderLeftColor: farbe, background: farbe + (nurRot ? '18' : '30'), '--fach': farbe })
      },
        h('div', { class: 'k' }, akz ? h('span', { class: 'akzmarke', title: 'Akzeptierter harter Fehler: ' + akz.join(' · ') }, '!') : null, dienstTitel(x), x.bereich && dBereich(x.bereich) ? h('span', { class: 'b' }, ' · ' + dBereich(x.bereich).name) : null),
        (o.iv.end - o.iv.start) * ppm >= 24 ? h('div', { class: 'z' }, x.beginn + '–' + x.ende) : null,
        x.rhythmus.art !== 'woechentlich' ? h('span', { class: 'rh', title: rhythmusText(x.rhythmus) }, { A: 'A', B: 'B', zweiwoechentlich: '2W', monatlich: 'M', rotation: 'R', einzel: '1×' }[x.rhythmus.art] || '') : null,
        x.fixiert ? h('span', { class: 'fx', 'aria-hidden': 'true' }, icon('pin')) : null,
        !x.fixiert && !nurRot ? [h('div', { class: 'griff o', 'aria-hidden': 'true' }), h('div', { class: 'griff u', 'aria-hidden': 'true' })] : null);
      if (!nurRot) tlDienstEvents(el, x, { von, ppm });
      spalte.append(el);
    });
    rumpf.append(spalte);
  });
  const innen = h('div', { class: 'tl-innen', style: { width: (TL_ACHSE + spalten.length * breite) + 'px' } }, kopf, rumpf);
  const tl = h('div', { class: 'tl', style: { '--ppm': ppm }, onscroll: ev => { st.sx = ev.target.scrollLeft; st.sy = ev.target.scrollTop; } }, innen);
  tl._von = von; tl._ppm = ppm;
  requestAnimationFrame(() => { if (st.sx) tl.scrollLeft = st.sx; if (st.sy) tl.scrollTop = st.sy; });
  // Seitenleiste
  const seite = h('div', { class: 'tl-seite' }, dienstSeitenleiste(d, st, tage, ctx));
  return [leiste, h('div', { class: 'tl-rahmen' }, spalten.length ? tl : h('div', { class: 'karte' }, !APP.daten.lehrer.length ? leerZustand({ icon: 'personen', titel: 'Noch keine Mitarbeitenden', text: 'Der Wochenplan zeigt je Person eine Spalte. Zuerst Lehrkräfte, Co-Kräfte oder weiteres Personal anlegen.', aktion: { text: 'Mitarbeitende anlegen', tun: () => gehe('lehrer') } }) : !APP.daten.dienste.bedarfe.length && !APP.daten.dienste.plan.length ? leerZustand({ icon: 'auge', titel: 'Noch keine Aufsichten zu sehen', text: 'Sobald im ersten Reiter eingetragen ist, wann wie viele Personen gebraucht werden, plant das Programm die Aufsichten – hier erscheinen sie als Kacheln.', aktion: { text: 'Bedarf eintragen', tun: () => dienstSpringeZu({ tab: 'bedarf' }) } }) : leerZustand({ klein: true, icon: 'lupe', titel: 'Keine Personen für diese Auswahl', text: 'Der Filter oder die Suche blendet alle Personen aus.' })), seite),
    h('p', { class: 'muted klein' }, 'Kacheln ziehen: Person, Uhrzeit oder – auf einen Tagesknopf – den Tag wechseln. Ober- und Unterkante ziehen: Beginn bzw. Ende ändern (Raster 15 min, „Fein verschieben“ 5 min, mit Alt minutengenau). Während des Ziehens: ✓ möglich, ~ ungünstig, ✕ Konflikt – Konflikte werden nicht übernommen. Doppelklick auf eine freie Stelle legt eine Aufsicht an. Schraffiert: außerhalb der persönlichen Anwesenheit. Rechtsklick auf eine Aufsicht: Menü (tauschen, fixieren, duplizieren …).')];
}
// Besetzung und offene Schichten zum Ziehen
function dienstSeitenleiste(d, st, tage, ctx) {
  const DI = d.dienste;
  const out = [];
  if (st.ansicht === 'tag') {
    const bs = DI.bedarfe.filter(b => b.tag === st.tag).sort((a, b) => (minVon((a.abschnitte[0] || {}).beginn) || 0) - (minVon((b.abschnitte[0] || {}).beginn) || 0));
    out.push(h('div', { class: 'karte besetzung' }, h('h3', {}, 'Besetzung ' + tagLang(st.tag)),
      bs.length ? bs.map(b => {
        const be = besetzungBedarf(d, b);
        return h('div', { class: 'bes-block' }, h('div', { class: 'bes-titel' }, h('span', { class: 'typpunkt', style: { background: b.farbe || '#5f7597' } }), (b.name || 'Aufsicht') + (b.bereich && dBereich(b.bereich) ? ' – ' + dBereich(b.bereich).name : '')),
          be.map(a => h('div', { class: 'bes-zeile ' + a.status, title: a.status === 'ok' ? 'Bedarf gedeckt' : a.springer && a.fehltMin > 0 ? 'Springer (Reserve) nicht besetzt – nur ein Hinweis' : a.status === 'warn' ? 'Minimum gedeckt, Soll (' + a.soll + ') nicht erreicht' : 'Mindestbedarf (' + a.min + ') unterschritten' },
            h('span', {}, a.beginn + '–' + a.ende), h('b', {}, a.ist + ' / ' + a.soll), h('span', { class: 'sym' }, a.status === 'ok' ? '✓' : a.status === 'warn' ? '~' : '✕'))));
      }) : h('p', { class: 'muted klein' }, 'Kein Bedarf an diesem Tag.')));
  } else {
    const l = d.lehrer.find(x => x.id === st.person);
    if (l) {
      const dm = dienstMinutenJeLehrer(d).get(l.id), az = arbeitszeiten(d).liste.find(x => x.lehrer === l.id);
      const idx = belegungsIndex(d);
      out.push(h('div', { class: 'karte besetzung' }, h('h3', {}, lehrerName(l, true)),
        h('div', { class: 'klein' }, 'Frühaufsichten: ', h('b', {}, zahlDe(dm.anzahlFrueh, 1)), dm.sehrFrueh ? ' (sehr früh ' + zahlDe(dm.sehrFrueh, 1) + ')' : '', ' · Spätaufsichten: ', h('b', {}, zahlDe(dm.anzahlSpaet, 1)), dm.sehrSpaet ? ' (sehr spät ' + zahlDe(dm.sehrSpaet, 1) + ')' : ''),
        az ? h('div', { class: 'klein' }, 'Arbeitszeit ', h('b', {}, zahlDe(az.summe / 60, 1) + ' h'), ' von ' + zahlDe(az.soll / 60, 1) + ' h') : null,
        h('table', { class: 'tab kompakt', style: { marginTop: '6px' } }, h('tbody', {}, d.schule.tage.map((t, i) => { const a = tagesAnwesenheit(d, l.id, i, idx); return h('tr', {}, h('td', {}, t), h('td', {}, a.spanne ? zeitText(a.ersterBeginn) + '–' + zeitText(a.letztesEnde) : '–'), h('td', { class: 'zahl' }, a.luecken ? dauerText(a.luecken) : '')); }))),
        h('button', { class: 'btn klein', style: { marginTop: '6px' }, onclick: () => personDialog(l, 'dienste') }, 'Zeiten & Verfügbarkeit')));
    }
  }
  const offen = DI.offen.filter(o => tage.includes(o.tag)), akzO = akzeptiertBezug();
  out.push(h('div', { class: 'karte' }, h('h3', {}, 'Offene Schichten', offen.length ? h('span', { class: 'badge ' + (offen.some(o => o.prio === 'min' && !aufsichtAkzeptiert(akzO, o)) ? 'err' : 'warn') }, offen.length) : null),
    offen.length ? h('div', { class: 'palette' }, offen.map(o => { const b = dBedarf(o.bedarf), farbe = (b && b.farbe) || o.farbe || '#5f7597', akz = o.prio === 'min' && aufsichtAkzeptiert(akzO, o); const grund = o.grund || (ctx ? offenGrund(ctx, schichtAusDienst(ctx, Object.assign({ rhythmus: { art: 'woechentlich' } }, o, { id: null }))) : ''); const c = h('span', { class: 'pchip offen ' + (akz ? 'akz' : o.prio), title: (akz ? 'Als harter Fehler akzeptiert (rotes Ausrufezeichen) – ' : '') + (o.prio === 'min' ? 'Mindestbedarf' : o.prio === 'springer' ? 'Springer (Reserve) – unbesetzt nur eine Warnung' : 'Soll') + ' – ' + grund + '\nAuf eine Person ziehen', style: { borderLeftColor: farbe } }, akz ? h('span', { class: 'akzmarke' }, '!') : null, (st.ansicht === 'person' ? tagKurz(o.tag) + ' ' : '') + (o.name || (b && b.name) || 'Aufsicht') + ' ' + o.beginn + '–' + o.ende); tlQuelleEvents(c, { art: 'offen', o }); return c; }))
      : h('p', { class: 'muted klein' }, DI.offen.length ? 'An diesem Tag ist alles besetzt.' : 'Keine offenen Schichten.'),
    offen.length ? h('p', { class: 'muted klein', style: { margin: '6px 0 0' } }, 'Rot: Mindestbedarf, gelb: Soll. Auf eine Person ziehen, um die Schicht zu besetzen.') : null));
  return out;
}

/* ---------- Ziehen, Größe ändern, Ablegen ---------- */
function tlDienstEvents(el, x, geo) {
  el.addEventListener('pointerdown', ev => {
    if (ev.button !== 0 || x.fixiert) return;
    const art = ev.target.classList.contains('griff') ? (ev.target.classList.contains('o') ? 'oben' : 'unten') : 'move';
    tlZug(ev, art, { x, el });
  });
  el.addEventListener('click', () => { if (APP.zugKlickSperre) return; DS().sel = x.id; document.querySelectorAll('.tl-d.ausgewaehlt').forEach(n => n.classList.remove('ausgewaehlt')); document.querySelectorAll('.tl-d[data-id="' + x.id + '"]').forEach(n => n.classList.add('ausgewaehlt')); });
  el.addEventListener('dblclick', ev => { ev.stopPropagation(); dienstDialog(x.id); });
  el.addEventListener('contextmenu', ev => { ev.preventDefault(); DS().sel = x.id; dienstMenue(x.id, ev.clientX, ev.clientY); });
  el.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); dienstDialog(x.id); }
    else if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); if (x.fixiert) { toast('Fixierte Aufsichtseinsätze zuerst lösen (Rechtsklick → Fixierung lösen).', 'err'); return; } dienstLoeschen(x.id); }
    else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
      ev.preventDefault(); if (x.fixiert) return;
      const s = ev.altKey ? 1 : DS().fein ? 5 : 15, dv = ev.key === 'ArrowUp' ? -s : s;
      const iv = dienstIntervall(x); if (!iv) return;
      dienstZielUebernehmen(x, { beginn: zeitText(iv.start + dv), ende: zeitText(iv.end + dv) }, 'Aufsicht verschoben');
    }
    else if (ev.key === 'f' || ev.key === 'F') { ev.preventDefault(); dienstFixieren(x.id); }
  });
}
function tlQuelleEvents(el, quelle) {
  el.addEventListener('pointerdown', ev => { if (ev.button !== 0) return; tlZug(ev, quelle.art, quelle); });
}
// Einen Dienst ändern – nur ohne harten Konflikt; automatisch geplante werden dabei zu „von Hand“
function dienstZielUebernehmen(x, neu, beschr) {
  const d = APP.daten;
  const r = dienstAenderungPruefen(d, x, neu);
  if (r.stufe === 'hart') { toast('Nicht möglich: ' + r.hart[0].text, 'err', 7000); return false; }
  dienstAendern(beschr + ': ' + dienstTitel(x) + ' ' + (neu.beginn || x.beginn) + '–' + (neu.ende || x.ende), dd => {
    const y = dd.dienste.plan.find(z => z.id === x.id); if (!y) return;
    const alt = y.lehrer, altTag = y.tag;
    Object.assign(y, neu); if (y.quelle === 'auto') y.quelle = 'manuell';
    if (y.rhythmus.art === 'rotation' && neu.lehrer && neu.lehrer !== alt) { y.rhythmus.personen = y.rhythmus.personen.map(p => p === alt ? neu.lehrer : p).filter((p, i, a) => a.indexOf(p) === i); if (!y.rhythmus.personen.includes(neu.lehrer)) y.rhythmus.personen.unshift(neu.lehrer); }
    if (y.serie && y.tag !== altTag && y.rhythmus.art === 'wochentage') { const se = y.serie; y.serie = null; y.rhythmus = nRhythmus({ art: 'woechentlich' }); dd.dienste.plan.forEach(z => { if (z.serie === se) z.rhythmus.tage = (z.rhythmus.tage || []).filter(t => t !== altTag); }); }
  });
  if (r.stufe === 'weich') toast('Übernommen. Hinweis: ' + r.hinweise.join(' '), '', 7000);
  return true;
}
function tlZug(ev, art, info) {
  const d = APP.daten, st = DS();
  const start = { x: ev.clientX, y: ev.clientY, id: ev.pointerId };
  let Z = null;
  const beginnen = () => {
    const tl = document.querySelector('.tl'); if (!tl) return false;
    let basis, grab = 0;
    if (art === 'offen') basis = { id: null, typ: info.o.typ, bereich: info.o.bereich, tag: info.o.tag, beginn: info.o.beginn, ende: info.o.ende, rhythmus: { art: 'woechentlich' }, quelle: 'manuell' };
    else {
      basis = info.x;
      const iv = dienstIntervall(basis);
      const sp = info.el.closest('.tl-spalte'); const r = sp.getBoundingClientRect();
      grab = iv ? (start.y - r.top) / tl._ppm + tl._von - iv.start : 0;
    }
    const iv = dienstIntervall(basis);
    if (!iv) return false;
    Z = { basis, iv, grab, von: tl._von, ppm: tl._ppm, ctx: dienstKontext(d, { ohne: basis.id || undefined }), cache: new Map(), geist: h('div', { class: 'tl-geist' }), ziel: null };
    document.body.classList.add('am-ziehen');
    if (info.el) info.el.classList.add('gezogen');
    return true;
  };
  const zielBei = (x, y, e) => {
    const el = document.elementFromPoint(x, y); if (!el) return null;
    const tk = art === 'move' && st.ansicht === 'tag' ? el.closest('[data-tl-tag]') : null;
    if (tk) { const t = Number(tk.dataset.tlTag); return { knopf: tk, neu: { lehrer: Z.basis.lehrer, tag: t, beginn: Z.basis.beginn, ende: Z.basis.ende } }; }
    // Größe ändern: immer in der eigenen Spalte, auch wenn der Zeiger sie verlässt
    const sp = art === 'oben' || art === 'unten' ? (info.el && info.el.isConnected ? info.el.closest('.tl-spalte') : null) : el.closest('.tl-spalte[data-l]'); if (!sp) return null;
    const r = sp.getBoundingClientRect();
    const m = Z.von + (y - r.top) / Z.ppm;
    const dauer = Z.iv.end - Z.iv.start;
    let s = Z.iv.start, en = Z.iv.end, lehrer = sp.dataset.l, tag = Number(sp.dataset.t);
    if (art === 'move') { s = tlSnap(m - Z.grab, e); en = s + dauer; }
    else if (art === 'oben') { s = Math.min(tlSnap(m, e), Z.iv.end - 5); lehrer = Z.basis.lehrer; tag = Z.basis.tag; }
    else if (art === 'unten') { en = Math.max(tlSnap(m, e), Z.iv.start + 5); lehrer = Z.basis.lehrer; tag = Z.basis.tag; }
    else if (art === 'offen' && tag !== Z.basis.tag) return { sp, neu: { lehrer, tag, beginn: zeitText(s), ende: zeitText(en) }, fest: { stufe: 'hart', hart: [{ text: 'Die offene Schicht gehört zum ' + tagLang(Z.basis.tag) + '.' }], hinweise: [] } };
    s = Math.max(0, s); en = Math.min(1440, en);
    return { sp, neu: { lehrer, tag, beginn: zeitText(s), ende: en >= 1440 ? '24:00' : zeitText(en) }, s, en };
  };
  const bewerten = z => {
    if (z.fest) return z.fest;
    const k = z.neu.lehrer + '|' + z.neu.tag + '|' + z.neu.beginn + '|' + z.neu.ende;
    if (!Z.cache.has(k)) Z.cache.set(k, dienstAenderungPruefen(d, Z.basis, z.neu, Z.ctx));
    return Z.cache.get(k);
  };
  const bewegen = mv => {
    if (mv.pointerId !== start.id) return;
    if (!Z) { if (Math.hypot(mv.clientX - start.x, mv.clientY - start.y) < 4) return; if (!beginnen()) { aufraeumen(); return; } }
    mv.preventDefault();
    // am Rand der Timeline automatisch weiterrollen
    const tl = document.querySelector('.tl');
    if (tl) { const r = tl.getBoundingClientRect(); if (mv.clientY > r.bottom - 28) tl.scrollTop += 14; else if (mv.clientY < r.top + 52 && mv.clientY > r.top - 40) tl.scrollTop -= 14; if (mv.clientX > r.right - 28 && mv.clientX < r.right + 10) tl.scrollLeft += 14; else if (mv.clientX < r.left + TL_ACHSE + 20 && mv.clientX > r.left) tl.scrollLeft -= 14; }
    const z = zielBei(mv.clientX, mv.clientY, mv);
    document.querySelectorAll('.tl-tagknopf.drueber').forEach(n => n.classList.remove('drueber'));
    Z.ziel = z;
    if (!z) { Z.geist.remove(); zugHinweis(0, 0, null); return; }
    const r = bewerten(z);
    z.r = r;
    Z.geist.className = 'tl-geist ' + r.stufe;
    if (z.knopf) { Z.geist.remove(); z.knopf.classList.add('drueber'); }
    else {
      if (Z.geist.parentNode !== z.sp) z.sp.append(Z.geist);
      const iv = intervall(z.neu.beginn, z.neu.ende);
      Object.assign(Z.geist.style, { top: ((iv.start - Z.von) * Z.ppm) + 'px', height: Math.max(4, (iv.end - iv.start) * Z.ppm) + 'px' });
      Z.geist.textContent = z.neu.beginn + '–' + z.neu.ende;
    }
    const wer = lehrerVon(z.neu.lehrer);
    zugHinweis(mv.clientX, mv.clientY + 18, (wer ? (wer.kuerzel || wer.name) + ' · ' : '') + tagKurz(z.neu.tag) + ' ' + z.neu.beginn + '–' + z.neu.ende + '\n' + dienstStatusText(r));
  };
  const aufraeumen = () => {
    document.removeEventListener('pointermove', bewegen); document.removeEventListener('pointerup', ende); document.removeEventListener('pointercancel', ende);
    document.removeEventListener('keydown', taste, true);
    if (Z) { Z.geist.remove(); if (info.el) info.el.classList.remove('gezogen'); }
    document.querySelectorAll('.tl-tagknopf.drueber').forEach(n => n.classList.remove('drueber'));
    document.body.classList.remove('am-ziehen');
    zugHinweis(0, 0, null);
  };
  const taste = kv => { if (kv.key === 'Escape') { kv.preventDefault(); kv.stopPropagation(); Z = null; aufraeumen(); } };
  const ende = up => {
    if (up.pointerId !== start.id) return;
    const Zs = Z;
    aufraeumen();
    if (!Zs) return;
    APP.zugKlickSperre = true; setTimeout(() => { APP.zugKlickSperre = false; }, 60);
    const z = up.type === 'pointercancel' ? null : Zs.ziel;
    if (!z || !z.r) return;
    if (z.r.stufe === 'hart') { toast('Nicht möglich: ' + z.r.hart[0].text, 'err', 7000); return; }
    if (art === 'move' || art === 'oben' || art === 'unten') {
      const n = z.neu, x = Zs.basis;
      if (n.lehrer === x.lehrer && n.tag === x.tag && n.beginn === x.beginn && n.ende === x.ende) return;
      dienstZielUebernehmen(x, n, art === 'move' ? (n.tag !== x.tag ? 'Aufsicht auf ' + tagKurz(n.tag) + ' verschoben' : n.lehrer !== x.lehrer ? 'Aufsicht an ' + (lehrerVon(n.lehrer) || {}).kuerzel + ' übergeben' : 'Aufsicht verschoben') : 'Aufsichtszeit geändert');
      return;
    }
    const neu = nDienst(Object.assign({}, Zs.basis, z.neu, { id: null }));
    dienstAendern('Offene Schicht besetzt', dd => {
      dd.dienste.plan.push(neu);
      if (art === 'offen') dd.dienste.offen = dd.dienste.offen.filter(o => o.id !== info.o.id);
    });
    DS().sel = neu.id;
    if (z.r.stufe === 'weich') toast('Übernommen. Hinweis: ' + z.r.hinweise.join(' '), '', 7000);
  };
  document.addEventListener('pointermove', bewegen, { passive: false });
  document.addEventListener('pointerup', ende); document.addEventListener('pointercancel', ende);
  document.addEventListener('keydown', taste, true);
}

/* ---------- Menü und Dialoge ---------- */
function dienstLoeschen(id) { const x = APP.daten.dienste.plan.find(y => y.id === id); if (!x) return; undoToastNach(() => dienstAendern('Aufsicht gelöscht: ' + dienstTitel(x) + ' ' + x.beginn, dd => { dd.dienste.plan = dd.dienste.plan.filter(y => y.id !== id); }), 'Aufsicht gelöscht: ' + dienstTitel(x) + ', ' + tagKurz(x.tag) + ' ' + x.beginn + ' Uhr.'); }
function dienstFixieren(id) { const x = APP.daten.dienste.plan.find(y => y.id === id); if (!x) return; dienstAendern(x.fixiert ? 'Fixierung gelöst' : 'Aufsicht fixiert', dd => { const y = dd.dienste.plan.find(z => z.id === id); if (y) y.fixiert = !y.fixiert; }); }
function dienstMenue(id, cx, cy) {
  const d = APP.daten, x = d.dienste.plan.find(y => y.id === id); if (!x) return;
  const l = lehrerVon(x.lehrer);
  menueZeigen(cx, cy, [
    { titel: dienstTitel(x) + ' · ' + tagKurz(x.tag) + ' ' + x.beginn + '–' + x.ende + ' · ' + lehrerName(l) },
    { icon: 'stift', text: 'Bearbeiten / verschieben …', taste: 'Enter', tun: () => dienstDialog(id) },
    { icon: 'personen', text: 'Person tauschen …', aus: x.fixiert, tun: () => personTauschenDialog(id) },
    { icon: 'uhr', text: 'Zeit ändern …', aus: x.fixiert, tun: () => dienstDialog(id, null, 'beginn') },
    { icon: 'tauschen', text: 'Mit anderer Aufsicht tauschen …', aus: x.fixiert, tun: () => dienstTauschenDialog(id) },
    { icon: 'pin', text: x.fixiert ? 'Fixierung lösen' : 'Fixieren', taste: 'F', tun: () => dienstFixieren(id) },
    { icon: 'kopieren', text: 'Duplizieren (andere Person) …', tun: () => personTauschenDialog(id, true) },
    { icon: 'pfeil-rechts', text: 'Auf weitere Tage übertragen …', tun: () => weitereTageDialog(id) },
    '-',
    { icon: 'papierkorb', text: 'Löschen', taste: 'Entf', aus: x.fixiert, tun: () => dienstLoeschen(id) }
  ]);
}
// Personen nach Eignung für einen Dienst: sehr gut → möglich → ungünstig → Konflikt
function personenNachEignung(d, x) {
  const ctx = dienstKontext(d, { ohne: x.id });
  return d.lehrer.map(l => ({ l, r: dienstKandidatScore(d, Object.assign({}, x, { lehrer: l.id }), l.id, ctx) }))
    .sort((a, b) => ({ ok: 0, weich: 1, hart: 2 }[a.r.stufe] - { ok: 0, weich: 1, hart: 2 }[b.r.stufe]) || a.r.delta - b.r.delta || natVergleich(a.l.kuerzel, b.l.kuerzel));
}
async function personTauschenDialog(id, duplizieren) {
  const d = APP.daten, x = d.dienste.plan.find(y => y.id === id); if (!x) return;
  const liste = personenNachEignung(d, duplizieren ? Object.assign({}, x, { id: null }) : x);
  let gewaehlt = null;
  const zeilen = h('div', { class: 'vliste eignung', style: { maxHeight: '60vh' } }, liste.map(({ l, r }) => h('button', {
    class: 'eignungzeile ' + r.stufe + (l.id === x.lehrer ? ' aktuell' : ''), disabled: r.stufe === 'hart' || (!duplizieren && l.id === x.lehrer),
    onclick: () => { gewaehlt = l.id; const dl = document.querySelector('dialog[open] .dfuss button[data-wert="true"]'); if (dl) dl.click(); }
  }, h('b', {}, l.kuerzel || '?'), h('span', { class: 'n' }, l.name || ''), h('span', { class: 'q' }, l.id === x.lehrer ? '● bisher' : r.qualitaet))));
  const ok = await dialog({ titel: (duplizieren ? 'Duplizieren für …: ' : 'Person tauschen: ') + dienstText(x) + ' (' + tagLang(x.tag) + ')', breite: '640px', inhalt: h('div', {}, h('p', { class: 'muted klein' }, 'Sortiert nach Eignung: ✓ sehr gut, ✓ möglich, ~ ungünstig (mit Grund), ✕ nicht möglich. Klick wählt die Person.'), zeilen), knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'OK', wert: true, verborgen: true }] });
  if (!ok || !gewaehlt) return;
  if (duplizieren) {
    const neu = nDienst(Object.assign({}, x, { id: null, lehrer: gewaehlt, fixiert: false, quelle: 'manuell' }));
    dienstAendern('Aufsicht dupliziert für ' + (lehrerVon(gewaehlt) || {}).kuerzel, dd => { dd.dienste.plan.push(neu); });
  } else dienstZielUebernehmen(x, { lehrer: gewaehlt }, 'Person getauscht');
}
async function dienstTauschenDialog(id) {
  const d = APP.daten, x = d.dienste.plan.find(y => y.id === id); if (!x) return;
  const andere = d.dienste.plan.filter(y => y.id !== x.id && y.lehrer !== x.lehrer && !y.fixiert && y.tag === x.tag);
  if (!andere.length) { toast('Keine anderen (nicht fixierten) Aufsichtseinsätze an diesem Tag.', 'err'); return; }
  // beide Richtungen prüfen: ohne die beiden Aufsichten, dann jeweils die andere Person
  const pruef = y => {
    const ctx = dienstKontext(d, { ohne: new Set([x.id, y.id]) });
    const a = dienstKandidatScore(d, Object.assign({}, x, { lehrer: y.lehrer }), y.lehrer, ctx);
    dienstEintragen(ctx, schichtAusDienst(ctx, Object.assign({}, x, { lehrer: y.lehrer })), y.lehrer);
    const b = dienstKandidatScore(d, Object.assign({}, y, { lehrer: x.lehrer }), x.lehrer, ctx);
    const stufe = a.stufe === 'hart' || b.stufe === 'hart' ? 'hart' : a.stufe === 'weich' || b.stufe === 'weich' ? 'weich' : 'ok';
    return { stufe, text: stufe === 'hart' ? '✕ ' + (a.stufe === 'hart' ? a.hart[0].text : b.hart[0].text) : stufe === 'weich' ? '~ ' + a.hinweise.concat(b.hinweise)[0] : '✓ möglich', delta: a.delta + b.delta };
  };
  const liste = andere.map(y => ({ y, p: pruef(y) })).sort((a, b) => ({ ok: 0, weich: 1, hart: 2 }[a.p.stufe] - { ok: 0, weich: 1, hart: 2 }[b.p.stufe]) || a.p.delta - b.p.delta);
  let wahl = null;
  const ok = await dialog({ titel: 'Tauschen: ' + dienstText(x) + ' (' + lehrerName(lehrerVon(x.lehrer)) + ')', breite: '680px', inhalt: h('div', {},
    h('p', { class: 'muted klein' }, 'Die beiden Personen tauschen ihre Aufsichtseinsätze. Geprüft wird in beide Richtungen.'),
    h('div', { class: 'vliste eignung', style: { maxHeight: '60vh' } }, liste.map(({ y, p }) => h('button', { class: 'eignungzeile ' + p.stufe, disabled: p.stufe === 'hart', onclick: () => { wahl = y.id; const dl = document.querySelector('dialog[open] .dfuss button[data-wert="true"]'); if (dl) dl.click(); } },
      h('b', {}, lehrerName(lehrerVon(y.lehrer))), h('span', { class: 'n' }, dienstText(y)), h('span', { class: 'q' }, p.text))))),
    knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'OK', wert: true, verborgen: true }] });
  if (!ok || !wahl) return;
  const y = d.dienste.plan.find(z => z.id === wahl);
  dienstAendern('Aufsichtseinsätze getauscht: ' + lehrerName(lehrerVon(x.lehrer)) + ' ↔ ' + lehrerName(lehrerVon(y.lehrer)), dd => {
    const a = dd.dienste.plan.find(z => z.id === x.id), b = dd.dienste.plan.find(z => z.id === y.id);
    const t = a.lehrer; a.lehrer = b.lehrer; b.lehrer = t;
    [[a, t, a.lehrer], [b, a.lehrer, t]].forEach(([z, alt, neu]) => { if (z.rhythmus.art === 'rotation') z.rhythmus.personen = z.rhythmus.personen.map(p => p === alt ? neu : p).filter((p, i, l) => l.indexOf(p) === i); });
    [a, b].forEach(z => { if (z.quelle === 'auto') z.quelle = 'manuell'; });
  });
}
async function weitereTageDialog(id) {
  const d = APP.daten, x = d.dienste.plan.find(y => y.id === id); if (!x) return;
  const wahl = new Set();
  const ok = await dialog({ titel: 'Auf weitere Tage übertragen', inhalt: h('div', {}, h('p', { class: 'muted klein' }, dienstText(x) + ' (' + lehrerName(lehrerVon(x.lehrer)) + ') zusätzlich an:'),
    h('div', { class: 'zeile eng' }, d.schule.tage.map((t, i) => i === x.tag ? null : h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: ev => { if (ev.target.checked) wahl.add(i); else wahl.delete(i); } }), t)))),
    knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'Übertragen', wert: true, art: 'primaer' }] });
  if (!ok || !wahl.size) return;
  const ctx = dienstKontext(d);
  const serie = x.serie || neueId('se');
  const neu = [], abgelehnt = [];
  [...wahl].sort().forEach(t => {
    const y = nDienst(Object.assign({}, x, { id: null, tag: t, fixiert: false, quelle: 'manuell', serie }));
    const r = dienstKandidatScore(d, y, y.lehrer, ctx);
    if (r.stufe === 'hart') abgelehnt.push(tagKurz(t) + ': ' + r.hart[0].text); else { neu.push(y); dienstEintragen(ctx, schichtAusDienst(ctx, y), y.lehrer); }
  });
  if (neu.length) dienstAendern('Aufsicht auf ' + neu.length + ' weitere Tage übertragen', dd => { const z = dd.dienste.plan.find(q => q.id === x.id); if (z) z.serie = serie; neu.forEach(y => dd.dienste.plan.push(y)); });
  if (abgelehnt.length) toast('Nicht übertragen – ' + abgelehnt.join(' · '), 'err', 9000);
}
// Dienst anlegen oder bearbeiten
async function dienstDialog(id, vorgabe, fokusFeld) {
  const d = APP.daten, DI = d.dienste;
  const orig = id ? DI.plan.find(y => y.id === id) : null;
  if (id && !orig) return;
  const x = orig ? JSON.parse(JSON.stringify(orig)) : nDienst(Object.assign({ typ: 'dt_dienst', name: 'Aufsicht', beginn: '07:00', ende: '07:45', quelle: 'manuell', tag: 0, arbeitszeit: true }, vorgabe || {}));
  if (!orig && !x.lehrer) x.lehrer = '';
  const root = h('div', {});
  let status = null;
  const zeichne = () => {
    const kandidaten = personenNachEignung(d, x);
    const personSel = h('select', { 'aria-label': 'Person', onchange: ev => { x.lehrer = ev.target.value; zeichne(); } },
      h('option', { value: '' }, '– Person wählen –'),
      kandidaten.map(({ l, r }) => h('option', { value: l.id, selected: l.id === x.lehrer }, (r.stufe === 'hart' ? '✕ ' : r.stufe === 'weich' ? '~ ' : '✓ ') + (l.kuerzel || '?') + ' – ' + (l.name || ''))));
    personSel.value = x.lehrer || '';
    const zf = (feld, t) => h('label', { class: 'feld' }, t, h('input', { type: 'text', class: 'zeitfeld', value: x[feld], style: { width: '70px' }, 'data-feld': feld, 'aria-label': t, onchange: ev => { const z = zeitNorm(ev.target.value); if (z) x[feld] = z; zeichne(); } }));
    const rh = x.rhythmus;
    const rhFelder = rh.art === 'zweiwoechentlich' ? h('label', { class: 'feld' }, 'beginnend', sel([['A', 'Woche A / 1'], ['B', 'Woche B / 2']], rh.startWoche || 'A', v => { rh.startWoche = v; zeichne(); }))
      : rh.art === 'monatlich' ? h('label', { class: 'feld' }, 'Welcher ' + tagLang(x.tag), sel([['1', '1.'], ['2', '2.'], ['3', '3.'], ['4', '4.'], ['-1', 'letzter']], String(rh.ordinal || 1), v => { rh.ordinal = Number(v); zeichne(); }))
      : rh.art === 'einzel' ? h('label', { class: 'feld' }, 'Datum', h('input', { type: 'date', value: rh.datum || '', onchange: ev => { rh.datum = ev.target.value; } }))
      : rh.art === 'rotation' ? h('div', { class: 'feld' }, h('span', {}, 'Personen der Rotation (wöchentlich reihum, in dieser Reihenfolge)'), h('div', { class: 'zeile eng', style: { maxWidth: '520px' } }, lehrerAlphabetisch(d.lehrer).map(l => h('label', { class: 'check klein' }, h('input', { type: 'checkbox', checked: (rh.personen || []).includes(l.id), onchange: ev => { rh.personen = (rh.personen || []).filter(p => p !== l.id); if (ev.target.checked) rh.personen.push(l.id); zeichne(); } }), l.kuerzel || '?'))),
          (rh.personen || []).length > 1 ? h('label', { class: 'zeile eng klein', style: { marginTop: '4px' } }, 'Diese Woche ist dran:', sel(rh.personen.map((p, i) => [String(i), (i + 1) + '. ' + lehrerName(lehrerVon(p))]), String(Math.max(0, rh.personen.indexOf(x.lehrer))), v => { rh.offset = Number(v); x.lehrer = rh.personen[rh.offset]; zeichne(); }, { 'aria-label': 'Diese Woche ist dran' })) : null)
      : rh.art === 'wochentage' ? h('div', { class: 'feld' }, h('span', {}, 'An diesen Tagen (je Tag eine eigene Aufsicht, gemeinsam bearbeitet)'), h('div', { class: 'zeile eng' }, d.schule.tage.map((t, i) => h('label', { class: 'check klein' }, h('input', { type: 'checkbox', checked: i === x.tag || (rh.tage || []).includes(i), disabled: i === x.tag, onchange: ev => { rh.tage = (rh.tage || []).filter(q => q !== i); if (ev.target.checked) rh.tage.push(i); rh.tage.sort((a, b) => a - b); } }), t))))
      : null;
    status = x.lehrer ? dienstAenderungPruefen(d, orig || x, x) : null;
    leeren(root).append(
      h('div', { class: 'zeile', style: { gap: '14px', alignItems: 'flex-end' } },
        h('label', { class: 'feld' }, 'Person', personSel),
        h('label', { class: 'feld' }, 'Tag', sel(d.schule.tage.map((t, i) => [String(i), TAGE_LANG[t]]), String(x.tag), v => { x.tag = Number(v); zeichne(); })),
        h('label', { class: 'feld', style: { flex: '1 1 180px' } }, 'Bezeichnung', h('input', { type: 'text', value: x.name || (dBedarf(x.bedarf) || {}).name || '', placeholder: 'z. B. Hofaufsicht', style: { width: '100%' }, onchange: ev => { x.name = ev.target.value.trim().slice(0, 80) || 'Aufsicht'; zeichne(); } })),
        h('label', { class: 'feld' }, 'Bereich', sel(bereichOpts(), x.bereich || '', v => { x.bereich = v || null; zeichne(); }))),
      h('div', { class: 'zeile', style: { gap: '14px', alignItems: 'flex-end', marginTop: '10px' } },
        zf('beginn', 'Beginn'), zf('ende', 'Ende'),
        (() => { const iv = dienstIntervall(x); return h('span', { class: 'muted klein', style: { paddingBottom: '8px' } }, iv ? dauerText(iv.end - iv.start) : 'ungültige Zeit'); })()),
      h('div', { class: 'zeile', style: { gap: '14px', alignItems: 'flex-end', marginTop: '10px' } },
        h('label', { class: 'feld' }, 'Rhythmus', sel(Object.entries(RHYTHMUS_ARTEN), rh.art, v => { x.rhythmus = nRhythmus({ art: v, personen: v === 'rotation' ? [x.lehrer].filter(Boolean) : [] }); zeichne(); })),
        rhFelder),
      h('div', { class: 'zeile', style: { gap: '14px', marginTop: '10px', alignItems: 'flex-end' } },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!x.springer, onchange: ev => { x.springer = ev.target.checked; if (x.springer) x.arbeitszeit = false; zeichne(); } }), 'Springer/Reserve'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: x.arbeitszeit !== false && !x.springer, disabled: !!x.springer, onchange: ev => { x.arbeitszeit = ev.target.checked; } }), 'zählt zur Arbeitszeit'),
        h('label', { class: 'feld' }, 'Qualifikation', h('input', { type: 'text', value: x.qualifikation || '', placeholder: 'optional', style: { width: '130px' }, onchange: ev => { x.qualifikation = ev.target.value.trim().toLowerCase().slice(0, 40); } })),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: x.fixiert, onchange: ev => { x.fixiert = ev.target.checked; } }), 'fixiert'),
        h('label', { class: 'feld', style: { flex: '1 1 220px' } }, 'Notiz', h('input', { type: 'text', value: x.notiz, maxlength: 200, onchange: ev => { x.notiz = ev.target.value; } }))),
      status ? h('div', { class: 'hinweis ' + (status.stufe === 'hart' ? 'err' : status.stufe === 'weich' ? 'warn' : 'ok') }, status.stufe === 'hart' ? ['✕ Nicht möglich: ', status.hart.map(g => g.text).join(' ')] : status.stufe === 'weich' ? ['~ Möglich, aber: ', status.hinweise.join(' ')] : '✓ Möglich – keine Konflikte.') : h('div', { class: 'hinweis' }, 'Bitte eine Person wählen.'));
    if (fokusFeld) { const f = root.querySelector('[data-feld="' + fokusFeld + '"]'); if (f) setTimeout(() => f.focus(), 0); fokusFeld = null; }
  };
  zeichne();
  const ok = await dialog({ titel: orig ? 'Aufsicht bearbeiten' : 'Neue Aufsicht', breite: '760px', inhalt: root, knoepfe: [{ text: 'Abbrechen', wert: false }].concat(orig ? [{ text: 'Löschen', wert: 'loeschen', art: 'gefahr' }] : []).concat([{ text: 'Speichern', wert: true, art: 'primaer', vorher: () => {
    if (!x.lehrer) { toast('Bitte eine Person wählen.', 'err'); return false; }
    const iv = dienstIntervall(x); if (!iv) { toast('Das Ende muss nach dem Beginn liegen.', 'err'); return false; }
    return true;
  } }]) });
  if (ok === 'loeschen') { dienstLoeschen(id); return; }
  if (!ok) return;
  const r = dienstAenderungPruefen(d, orig || x, x);
  if (r.stufe === 'hart' && !(await bestaetigen('Nicht möglich: ' + r.hart.map(g => g.text).join(' ') + ' Trotzdem speichern? Der Konflikt erscheint dann in der Prüfung.', 'Trotzdem speichern', 'gefahr'))) return;
  if (x.rhythmus.art === 'rotation' && x.lehrer && !x.rhythmus.personen.includes(x.lehrer)) x.rhythmus.personen.unshift(x.lehrer);
  if (x.rhythmus.art === 'rotation') x.rhythmus.offset = Math.max(0, x.rhythmus.personen.indexOf(x.lehrer));
  const abgelehnt = [];
  dienstAendern(orig ? 'Aufsicht geändert: ' + dienstTitel(x) : 'Aufsicht angelegt: ' + dienstTitel(x), dd => {
    const quelle = orig && orig.quelle !== 'auto' ? orig.quelle : 'manuell';
    const neu = nDienst(Object.assign({}, x, { quelle }));
    const altSerie = orig && orig.rhythmus.art === 'wochentage' ? orig.serie : null;
    if (neu.rhythmus.art === 'wochentage') {
      // Serie abgleichen: je gewähltem Tag ein Eintrag mit denselben Angaben
      const tage = [...new Set((neu.rhythmus.tage || []).concat([neu.tag]))].sort((a, b) => a - b);
      neu.rhythmus.tage = tage; neu.serie = neu.serie || neueId('se');
      const ctx = dienstKontext(dd, { ohne: new Set(dd.dienste.plan.filter(y => y.serie && y.serie === neu.serie).map(y => y.id).concat([neu.id])) });
      dd.dienste.plan = dd.dienste.plan.filter(y => !(y.serie && y.serie === neu.serie && y.id !== neu.id && !tage.includes(y.tag)));
      tage.forEach(t => {
        if (t === neu.tag) return;
        const vorhanden = dd.dienste.plan.find(y => y.serie === neu.serie && y.tag === t);
        const kopie = nDienst(Object.assign({}, neu, { id: vorhanden ? vorhanden.id : null, tag: t, quelle }));
        if (dienstKandidatScore(dd, kopie, kopie.lehrer, ctx).stufe === 'hart') { abgelehnt.push(dd.schule.tage[t]); if (vorhanden) vorhanden.rhythmus = nRhythmus(neu.rhythmus); return; }
        if (vorhanden) Object.assign(vorhanden, kopie); else dd.dienste.plan.push(kopie);
      });
      dd.dienste.plan.filter(y => y.serie === neu.serie).forEach(y => { y.rhythmus = nRhythmus(neu.rhythmus); });
    } else if (altSerie) {
      // aus der Serie gelöst: übrige Einträge kennen diesen Tag nicht mehr
      neu.serie = null;
      dd.dienste.plan.forEach(y => { if (y.serie === altSerie && y.id !== neu.id) y.rhythmus.tage = (y.rhythmus.tage || []).filter(t => t !== orig.tag); });
    }
    if (orig) { const i = dd.dienste.plan.findIndex(y => y.id === id); if (i >= 0) dd.dienste.plan[i] = neu; } else dd.dienste.plan.push(neu);
  });
  if (abgelehnt.length) toast('An ' + abgelehnt.join(', ') + ' nicht angelegt – dort gibt es einen Konflikt.', 'err', 7000);
  if (r.stufe === 'weich') toast('Gespeichert. Hinweis: ' + r.hinweise.join(' '), '', 7000);
}
// Lehrkräfte: Aufsichtszeiten & Präferenzen
// Abschnitt „Aufsichten“ im Dialog „Zeiten & Verfügbarkeit“. l = Arbeitskopie der Person. Rückgabe: { el, fehler() → Text|'' , anwenden(x, dd) }
function dienstzeitenAbschnitt(l) {
  const d = APP.daten;
  const p = l.dienstPraeferenzen;
  const fenster = d.schule.tage.map((t, i) => Object.assign({ tag: i, fruehestens: '', spaetestens: '', keinDienst: false }, (l.dienstVerfuegbarkeit || []).find(x => x.tag === i) || {}));
  const praef = (k, t) => h('label', { class: 'feld' }, t, sel(PRAEF_WERTE.map(v => [v, v]), p[k], v => { p[k] = v; }, { 'aria-label': t }));
  const maxF = (k, t) => h('label', { class: 'feld' }, t, h('input', { type: 'number', min: 0, max: 20, value: p[k] === null ? '' : p[k], placeholder: 'unbegrenzt', style: { width: '90px' }, 'aria-label': t, onchange: ev => { p[k] = ev.target.value === '' ? null : Math.max(0, Math.min(20, Math.round(Number(ev.target.value) || 0))); } }));
  const zeilen = fenster.map(f => h('tr', {},
    h('td', {}, TAGE_LANG[d.schule.tage[f.tag]]),
    h('td', {}, h('input', { type: 'text', class: 'zeitfeld', value: f.fruehestens, placeholder: '–', style: { width: '70px' }, 'aria-label': 'frühestens ' + d.schule.tage[f.tag], onchange: ev => { f.fruehestens = zeitNorm(ev.target.value); ev.target.value = f.fruehestens; } })),
    h('td', {}, h('input', { type: 'text', class: 'zeitfeld', value: f.spaetestens, placeholder: '–', style: { width: '70px' }, 'aria-label': 'spätestens ' + d.schule.tage[f.tag], onchange: ev => { f.spaetestens = zeitNorm(ev.target.value); ev.target.value = f.spaetestens; } })),
    h('td', { class: 'mitte' }, h('input', { type: 'checkbox', checked: f.keinDienst, 'aria-label': 'keine Aufsicht ' + d.schule.tage[f.tag], onchange: ev => { f.keinDienst = ev.target.checked; } }))));
  const tb = h('tbody', {}, zeilen);
  const aufAlle = () => { const q = fenster[0]; fenster.forEach((f, i) => { if (i) { f.fruehestens = q.fruehestens; f.spaetestens = q.spaetestens; } }); tb.querySelectorAll('tr').forEach((tr, i) => { if (!i) return; const inp = tr.querySelectorAll('input[type=text]'); inp[0].value = fenster[i].fruehestens; inp[1].value = fenster[i].spaetestens; }); };
  const quali = h('input', { type: 'text', value: (l.qualifikationen || []).join(', '), placeholder: 'z. B. ersthelfer', style: { width: '260px' }, 'aria-label': 'Qualifikationen' });
  const abw = l.anwesenheit === 'teilzeit' ? 'Teilzeit: nur an ' + l.anwesenheitTage.map(t => d.schule.tage[t]).join(', ') + ' anwesend.' : l.anwesenheit === 'ausbildungstag' ? 'Ausbildungstag: ' + l.anwesenheitTage.map(t => d.schule.tage[t]).join(', ') + '.' : '';
  const aufsicht = h('input', { type: 'checkbox', checked: l.aufsicht !== false });
  // Globale persönliche Ausschlüsse: Bereich, Tag und Zeitfenster. Konkrete Phasen-Ausschlüsse werden direkt am Staffelungsabschnitt gepflegt.
  const aus = (l.dienstAusschluss || []).map(x => Object.assign({}, x));
  const ausBox = h('div', { id: 'ausschlussListe' });
  const tagOptsA = [['-1', 'jeden Tag']].concat(d.schule.tage.map((t, i) => [String(i), TAGE_LANG[t]]));
  const berOpts = [['', 'alle Bereiche']].concat(d.dienste.bereiche.map(b => [b.id, b.name]));
  const ausZeichne = () => {
    leeren(ausBox).append(...aus.map((x, i) => h('div', { class: 'zeile ausschlusszeile', style: { marginBottom: '4px', gap: '4px 6px' } },
      sel([['verboten', 'kein Einsatz für'], ['erlaubt', 'Ausnahme – erlaubt:']], x.art === 'erlaubt' ? 'erlaubt' : 'verboten', v => { x.art = v; }, { 'aria-label': 'Verbot oder Ausnahme', title: '„kein Einsatz“ = Verbot. „Ausnahme – erlaubt“ hebt ein Verbot für genau diesen Fall auf (z. B. keine Frühaufsicht, aber 07:15–07:30 erlaubt).' }),
      x.typ ? h('span', { class: 'badge neutral', title: 'Aus älteren Projektdaten übernommen. Neue Ausschlüsse werden nicht mehr nach Typ oder Kategorie angelegt.' }, 'Altregel: ' + ((DIENSTTYPEN.find(t => t.id === x.typ) || {}).name || 'Aufsicht')) : h('span', { class: 'badge neutral' }, 'alle Aufsichten'),
      berOpts.length > 1 ? sel(berOpts, berOpts.some(o => o[0] === x.bereich) ? x.bereich : '', v => { x.bereich = v; }, { 'aria-label': 'Bereich', title: 'Nur in diesem Bereich (z. B. keine Hofaufsicht, kein Bistro)' }) : null,
      sel(tagOptsA, String(x.tag), v => { x.tag = Number(v); }, { 'aria-label': 'Tag' }),
      'von', h('input', { type: 'text', class: 'zeitfeld', value: x.von, placeholder: 'Beginn', style: { width: '64px' }, 'aria-label': 'Ausschluss von', title: 'leer = ab Tagesbeginn', onchange: ev => { x.von = zeitNorm(ev.target.value); ev.target.value = x.von; } }),
        'bis', h('input', { type: 'text', class: 'zeitfeld', value: x.bis, placeholder: 'Ende', style: { width: '64px' }, 'aria-label': 'Ausschluss bis', title: 'leer = bis Tagesende', onchange: ev => { x.bis = zeitNorm(ev.target.value); ev.target.value = x.bis; } }),
      h('button', { class: 'btn icon klein gefahr', 'aria-label': 'Ausschluss entfernen', onclick: () => { aus.splice(i, 1); ausZeichne(); } }, icon('papierkorb')))),
      h('button', { class: 'btn klein', id: 'ausschlussNeu', onclick: () => { aus.push({ typ: '', tag: -1, von: '', bis: '', bereich: '', art: 'verboten' }); ausZeichne(); } }, '+ Ausschluss'));
  };
  ausZeichne();
  const inhalt = h('div', {},
    h('label', { class: 'check' }, aufsicht, h('b', {}, 'Für Aufsichten einplanbar'), ' – kann nach dem Unterricht für Aufsichten eingesetzt werden'),
    h('div', { class: 'zeile', style: { gap: '14px', alignItems: 'flex-end', marginTop: '10px' } }, praef('frueh', 'Frühaufsicht'), maxF('maxFruehdiensteWoche', 'max. Frühaufsichten/Woche'), praef('spaet', 'Spätaufsicht'), maxF('maxSpaetdiensteWoche', 'max. Spätaufsichten/Woche')),
    h('label', { class: 'check', style: { marginTop: '8px' } }, h('input', { type: 'checkbox', checked: p.fruehUndSpaetGleicherTag, onchange: ev => { p.fruehUndSpaetGleicherTag = ev.target.checked; } }), 'Früh- und Spätaufsicht am selben Tag erlaubt'),
    h('h3', {}, 'Anwesenheit je Tag'),
    h('p', { class: 'muted klein' }, 'Persönliche Wunschzeiten für Aufsichten (leer = kein Wunsch). Diese Angaben werden nach Unterricht, Mindestbesetzung und Soll-Arbeitszeit berücksichtigt; sie sperren eine notwendige Aufsicht nicht hart. Echte Abwesenheit wird über Teilzeit/Ausbildungstag bzw. die allgemeine Verfügbarkeit festgelegt. ' + abw),
    h('table', { class: 'tab kompakt' }, h('thead', {}, h('tr', {}, h('th', {}, 'Tag'), h('th', {}, 'frühestens'), h('th', {}, 'spätestens'), h('th', {}, 'keine Aufsicht'))), tb),
    h('button', { class: 'btn klein', style: { marginTop: '6px' }, onclick: aufAlle }, 'Zeiten vom ' + TAGE_LANG[d.schule.tage[0]] + ' auf alle Tage übertragen'),
    h('h3', {}, 'Allgemeine persönliche Ausschlüsse', hilfe('Globale Einschränkungen dieser Person nach Bereich, Tag und Uhrzeit. Beispiele: keine Einsätze im Bistro · montags keine Aufsicht · dienstags erst ab 07:15 · nicht von 07:00 bis 07:30. Konkrete Ausschlüsse für eine bestimmte Pause oder Aufsichtsphase werden direkt unter „Aufsichten“ am jeweiligen Staffelungsabschnitt gesetzt. Eine „Ausnahme – erlaubt“ hebt ein allgemeines Verbot für genau diesen Fall auf. Leere Uhrzeiten = ganztägig.')),
    h('p', { class: 'muted klein', style: { margin: '0 0 6px' } }, 'Ausdrückliche Ausschlüsse sind hart. Persönliche Wunschzeiten sowie Früh-/Spätpräferenzen sind weich: Sie werden berücksichtigt, dürfen aber eine notwendige Aufsicht nicht verhindern. Der Haken „Für Aufsichten einplanbar“ schaltet die Person insgesamt an oder aus.'),
    ausBox,
    h('h3', {}, 'Qualifikationen'), quali, h('div', { class: 'muted klein' }, 'Kommagetrennt; eine benannte Aufsichtsphase kann eine Qualifikation verlangen.'));
  return {
    el: inhalt,
    fehler: () => { const fe = fenster.find(f => f.fruehestens && f.spaetestens && minVon(f.spaetestens) <= minVon(f.fruehestens)); if (fe) return TAGE_LANG[d.schule.tage[fe.tag]] + ': „spätestens“ muss nach „frühestens“ liegen'; const fa = aus.find(x => x.von && x.bis && minVon(x.bis) <= minVon(x.von)); return fa ? 'Ausschluss: „bis“ muss nach „von“ liegen' : ''; },
    anwenden: (x, dd) => {
      x.aufsicht = aufsicht.checked;
      x.dienstPraeferenzen = nDienstPraeferenzen(p);
      x.dienstVerfuegbarkeit = nDienstVerfuegbarkeit(fenster, dd.schule.tage.length);
      x.dienstAusschluss = nDienstAusschluss(aus, dd.schule.tage.length);
      x.qualifikationen = quali.value.split(/[,;]+/).map(s => s.trim().toLowerCase()).filter((s, i, a) => s && a.indexOf(s) === i).slice(0, 20);
    }
  };
}
function dienstzeitenKurz(l) {
  const p = l.dienstPraeferenzen || {}, v = l.dienstVerfuegbarkeit || [];
  const t = [];
  if (l.aufsicht === false) return 'keine';
  if (p.frueh !== 'neutral') t.push('F ' + (p.frueh === 'nicht möglich' ? '✕' : p.frueh));
  if (p.spaet !== 'neutral') t.push('S ' + (p.spaet === 'nicht möglich' ? '✕' : p.spaet));
  if (p.maxFruehdiensteWoche !== null) t.push('≤' + p.maxFruehdiensteWoche + ' F');
  if (p.maxSpaetdiensteWoche !== null) t.push('≤' + p.maxSpaetdiensteWoche + ' S');
  if (v.length) t.push(v.length === 1 ? '1 Tag begrenzt' : v.length + ' Tage begrenzt');
  if ((l.dienstAusschluss || []).length) t.push(l.dienstAusschluss.length === 1 ? '1 Ausschluss' : l.dienstAusschluss.length + ' Ausschlüsse');
  if ((l.qualifikationen || []).length) t.push(l.qualifikationen.join(', '));
  return t.join(' · ') || 'Standard';
}

