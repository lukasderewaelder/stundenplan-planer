/* =====================================================================
   5f. OBERFLÄCHE – GTA-Planer (Reiter „GTA-Planer“ unter „Arbeitszeit & Deputat“)
   Links: Personen mit freier Kapazität (mindestens 60 min) und die GTAs – noch nicht platzierte liegen in der Ablage.
   Rechts: das Wochenraster des fertigen Plans. GTAs werden hineingezogen: auf Rasterstunden (rastet an den Zeilen des Zeitrasters ein) oder –
   bei „eigener Zeit“ – in 5-Minuten-Schritten. Während des Ziehens zeigt das Raster die Belegung der beteiligten Personen (Unterricht, Co,
   Aufgaben, Aufsichten, andere GTAs, Sperrzeiten) und des Raums; ✓ frei · ✕ Konflikt (auf Nachfrage trotzdem möglich).
   Eine Person aus der Kapazitätsliste ins Raster ziehen = neue GTA mit dieser Person zu dieser Zeit; auf eine GTA ziehen = Person hinzufügen.
   ===================================================================== */
const GTA_PPM = 1.1; // Pixel je Minute
function gtaZustand() { return APP.tabellen.gta || (APP.tabellen.gta = { person: '', sel: '' }); }
function gtaAendern(beschr, fn) { return aendern(beschr, d => { if (!Array.isArray(d.gta)) d.gta = []; fn(d); }); }
// Freie Kapazität je Person (Wochenarbeitszeit minus Ist-Arbeitszeit inkl. GTAs); ohne eingetragene Wochenarbeitszeit keine Kapazität
function gtaKapazitaet(d) {
  return arbeitszeiten(d).liste.filter(x => x.soll > 0).map(x => ({ x, l: d.lehrer.find(l => l.id === x.lehrer), frei: x.soll - x.summe })).filter(k => k.l).sort((a, b) => b.frei - a.frei || natVergleich(a.x.kuerzel, b.x.kuerzel));
}
function gtaBereich(d) {
  const zg = stundenZeiten(d.schule, null).filter(Boolean);
  let a = zg.length ? Math.min(...zg.map(z => z.start)) : 420, e = zg.length ? Math.max(...zg.map(z => z.end)) : 1020;
  (d.gta || []).forEach(g => { const iv = gtaIntervall(d, g); if (iv) { a = Math.min(a, iv.start); e = Math.max(e, iv.end); } });
  return { a: Math.floor(a / 15) * 15, e: Math.ceil(e / 15) * 15 };
}
// Belegung der Personen einer GTA an einem Tag (ohne diese GTA selbst)
function gtaPersonenBelegung(d, personen, tag, ohneId, idx) {
  idx = idx || belegungsIndex(d);
  const out = [];
  personen.forEach(lid => ((idx.get(lid) || [])[tag] || []).forEach(b => { if (b.art === 'gta' && b.ref === ohneId) return; out.push(Object.assign({ lehrer: lid }, b)); }));
  return out;
}
// Prüfung einer GTA an einer Stelle: Zeitkonflikte der Personen, Abwesenheit, Raum, Kapazität. → { ok, gruende: [], hinweise: [] }
function gtaPruefen(d, g, opt) {
  opt = opt || {};
  const iv = gtaIntervall(d, g), gr = [], hw = [];
  if (g.tag < 0) return { ok: true, gruende: gr, hinweise: hw, iv: null };
  if (!iv) return { ok: false, gruende: ['keine gültige Uhrzeit'], hinweise: hw, iv };
  const lI = new Map(d.lehrer.map(l => [l.id, l])), kz = id => { const l = lI.get(id); return l ? (l.kuerzel || l.name || '?') : '?'; };
  const alt = (d.gta || []).find(x => x.id === g.id), altMin = alt ? gtaMinuten(d, alt) : 0, neuMin = iv.end - iv.start;
  // Sperrzeiten und Abwesenheitstage der Person gelten für Unterricht und Aufsichten, nicht für GTAs: dort nur ein Hinweis
  gtaPersonenBelegung(d, g.personen, g.tag, g.id, opt.idx).filter(b => b.start < iv.end && iv.start < b.end).forEach(b => { if (b.art === 'gesperrt') { const t = kz(b.lehrer) + ': liegt in einer Sperrzeit (für GTAs erlaubt)'; if (!hw.includes(t)) hw.push(t); } else gr.push(belegungText(d, b.lehrer, b)); });
  g.personen.forEach(lid => { const l = lI.get(lid); const fe = l ? dienstFenster(l, g.tag, d.schule) : null; if (fe && fe.abwesend) hw.push(kz(lid) + ' ist ' + TAGE_LANG[d.schule.tage[g.tag]] + ' sonst nicht da (' + (fe.grund || 'abwesend') + ') – für GTAs erlaubt'); });
  const kap = new Map((opt.kap || gtaKapazitaet(d)).map(k => [k.x.lehrer, k]));
  g.personen.forEach(lid => {
    const k = kap.get(lid); if (!k) return;
    const vorher = alt && alt.personen.includes(lid) ? altMin : 0, rest = k.frei + vorher - neuMin;
    if (rest < -3) gr.push(kz(lid) + ': Arbeitszeit reicht nicht (frei ' + zahlDe((k.frei + vorher) / 60, 1) + ' h, GTA ' + zahlDe(neuMin / 60, 1) + ' h)');
    const tm = k.x.tagMax; if (tm > 0 && k.x.tag) { const tagNeu = k.x.tag[g.tag] - (alt && alt.tag === g.tag && alt.personen.includes(lid) ? altMin : 0) + neuMin; if (tagNeu > tm + 0.5) gr.push(kz(lid) + ': am ' + TAGE_LANG[d.schule.tage[g.tag]] + ' über der Höchstarbeitszeit (' + zahlDe(tagNeu / 60, 1) + ' h bei höchstens ' + zahlDe(tm / 60, 1) + ' h)'); }
  });
  if (g.raum) { const r = d.raeume.find(x => x.id === g.raum); if (r) { const f = raumFreiFuer(d, raumBelegungTag(d, g.tag, g.id), r, iv); if (!f.frei) gr.push('Raum ' + r.name + ' belegt: ' + f.grund); else if (f.grund) hw.push('Raum ' + r.name + ': ' + f.grund); } }
  if (!g.personen.length && !g.extern) hw.push('noch ohne Leitung');
  return { ok: !gr.length, gruende: gr, hinweise: hw, iv };
}
function gtaNeuVorlage(d, extra) {
  const lnr = stundenNummern(d.schule), erste = lnr.findIndex(n => n > 0);
  return nGta(Object.assign({ name: '', tag: -1, zeitArt: 'raster', von: erste + 1, bis: erste + 1, dauer: 90 }, extra || {}), d.schule.tage.length, d.schule.stunden.length);
}
// Rasterzeilen, die ein Zeitraum (in Minuten) überdeckt – zum Einrasten
function gtaZeilenFuer(d, start, n) {
  const zg = stundenZeiten(d.schule, null);
  let i = zg.findIndex(z => z && start >= z.start && start < z.end);
  if (i < 0) i = zg.findIndex(z => z && z.start >= start);
  if (i < 0) return null;
  const bis = Math.min(zg.length - 1, i + Math.max(0, n - 1));
  return { von: i + 1, bis: bis + 1 };
}

function gtaPlanerInhalt() {
  const d = APP.daten, st = gtaZustand(), D = d.schule.tage.length, gl = d.gta || [];
  const idx = belegungsIndex(d), kap = gtaKapazitaet(d), mitFrei = kap.filter(k => k.frei >= 60), wenig = kap.length - mitFrei.length;
  const warn = gtaWarnungen(d), warnJe = new Map(); warn.forEach(w => { if (!warnJe.has(w.gta)) warnJe.set(w.gta, []); warnJe.get(w.gta).push(w.text); });
  const lI = new Map(d.lehrer.map(l => [l.id, l]));
  if (st.person && !lI.has(st.person)) st.person = '';
  if (st.sel && !gl.some(g => g.id === st.sel)) st.sel = '';
  const { a: A, e: E } = gtaBereich(d), hoehe = Math.max(200, (E - A) * GTA_PPM), y = m => (m - A) * GTA_PPM;
  const zg = stundenZeiten(d.schule, null);
  // ----- linke Spalte: Kapazität und GTA-Liste -----
  const personChip = k => {
    const l = k.l, an = st.person === l.id, anteil = Math.max(0, Math.min(1, k.frei / k.x.soll));
    const el = h('div', { class: 'gta-person' + (an ? ' an' : ''), tabindex: 0, role: 'button', 'aria-pressed': an ? 'true' : 'false', 'data-person': l.id,
      title: lehrerName(l, true) + '\nfrei: ' + zahlDe(k.frei / 60, 1) + ' h von ' + zahlDe(k.x.soll / 60, 1) + ' h Wochenarbeitszeit\nKlick: Belegung im Raster zeigen · ins Raster ziehen: neue GTA · auf eine GTA ziehen: Person hinzufügen',
      onkeydown: ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); st.person = an ? '' : l.id; render(); } } },
      h('b', {}, l.kuerzel || l.name || '?'), h('span', { class: 'gta-pname' }, l.name && l.name !== l.kuerzel ? l.name : ''),
      h('span', { class: 'gta-frei' }, zahlDe(k.frei / 60, 1) + ' h frei'), h('span', { class: 'gta-balken', 'aria-hidden': 'true' }, h('i', { style: { width: Math.round(anteil * 100) + '%' } })));
    gtaZiehbar(el, { art: 'person', id: l.id }, () => { st.person = an ? '' : l.id; render(); });
    return el;
  };
  const gtaKarte = g => {
    const w = warnJe.get(g.id) || [], rn = g.raum ? (d.raeume.find(r => r.id === g.raum) || {}).name : '';
    const el = h('div', { class: 'gta-karte' + (g.tag < 0 ? ' offen' : '') + (w.length ? ' konflikt' : '') + (st.sel === g.id ? ' gewaehlt' : ''), tabindex: 0, role: 'button', 'data-gta': g.id, style: { '--gta': g.farbe },
      title: g.name + '\n' + gtaZeitText(d, g) + '\nLeitung: ' + gtaLeitung(d, g) + (rn ? '\nRaum: ' + rn : '') + (w.length ? '\n⚠ ' + w.join('\n⚠ ') : '') + '\nKlick: bearbeiten · ziehen: ins Raster legen oder verschieben',
      onkeydown: ev => { if (ev.key === 'Enter') gtaDialog(g.id); if (ev.key === 'Delete') gtaLoeschen(g.id); } },
      h('div', { class: 'gta-k1' }, w.length ? h('span', { class: 'akzmarke', title: w.join('\n') }, '!') : null, h('b', {}, g.name)),
      h('div', { class: 'gta-k2' }, gtaZeitText(d, g)), h('div', { class: 'gta-k2' }, gtaLeitung(d, g) + (rn ? ' · ' + rn : '')));
    gtaZiehbar(el, { art: 'gta', id: g.id }, () => { st.sel = g.id; gtaDialog(g.id); });
    return el;
  };
  const offen = gl.filter(g => g.tag < 0), platziert = gl.filter(g => g.tag >= 0).sort((p, q) => p.tag - q.tag || (gtaIntervall(d, p) || { start: 0 }).start - (gtaIntervall(d, q) || { start: 0 }).start);
  const links = h('div', { class: 'gta-links' },
    h('div', { class: 'karte' }, h('h3', { style: { marginTop: 0 } }, 'Freie Kapazität', h('span', { class: 'badge neutral' }, String(mitFrei.length))),
      h('p', { class: 'muted klein' }, 'Personen mit mindestens 60 min freier Wochenarbeitszeit (Wochenarbeitszeit minus Unterricht, Vorbereitung, Co, Aufgaben, Aufsichten und GTAs).'),
      mitFrei.length ? h('div', { class: 'gta-personen' }, mitFrei.map(personChip)) : h('p', { class: 'muted' }, 'Niemand hat noch 60 min frei.'),
      wenig ? h('p', { class: 'muted klein', style: { marginBottom: 0 } }, wenig + (wenig === 1 ? ' weitere Person hat' : ' weitere Personen haben') + ' weniger als 60 min frei.') : null),
    h('div', { class: 'karte gta-ablage', 'data-ablage': '1' }, h('div', { class: 'zeile' }, h('h3', { style: { margin: 0 } }, 'GTAs', h('span', { class: 'badge neutral' }, String(gl.length))), h('button', { class: 'btn klein rechts', type: 'button', onclick: () => gtaDialog(null) }, icon('plus', 'k'), ' Neue GTA')),
      h('div', { class: 'muted klein', style: { margin: '6px 0' } }, 'Noch nicht platziert (Ablage)' + (offen.length ? '' : ': –')),
      offen.length ? h('div', { class: 'gta-liste' }, offen.map(gtaKarte)) : null,
      platziert.length ? [h('div', { class: 'muted klein', style: { margin: '10px 0 6px' } }, 'Im Plan'), h('div', { class: 'gta-liste' }, platziert.map(gtaKarte))] : null,
      !gl.length ? h('p', { class: 'muted klein' }, 'Noch keine GTA. „Neue GTA“ anlegen oder eine Person aus „Freie Kapazität“ ins Raster ziehen.') : null,
      h('p', { class: 'muted klein', style: { marginBottom: 0 } }, 'Eine GTA hierher ziehen = aus dem Plan nehmen.')));
  // ----- Wochenraster -----
  const zeigPers = st.person ? [st.person] : st.sel ? ((gl.find(g => g.id === st.sel) || {}).personen || []) : [];
  const achse = h('div', { class: 'gta-achse', style: { height: hoehe + 'px' } });
  zg.forEach((z, i) => { if (!z) return; const s = d.schule.stunden[i]; achse.append(h('div', { class: 'gta-zl' + (s.istPause ? ' pause' : ''), style: { top: y(z.start) + 'px', height: (z.end - z.start) * GTA_PPM + 'px' } }, h('b', {}, gtaZeileName(d, i)), h('span', {}, zeitText(z.start)))); });
  const spalten = d.schule.tage.map((t, tag) => {
    const sp = h('div', { class: 'gta-tag', 'data-tag': tag, style: { height: hoehe + 'px' } });
    zg.forEach((z, i) => { if (z) sp.append(h('div', { class: 'gta-band' + (d.schule.stunden[i].istPause ? ' pause' : ''), style: { top: y(z.start) + 'px', height: (z.end - z.start) * GTA_PPM + 'px' } })); });
    if (zeigPers.length) gtaBelegungZeichnen(d, sp, gtaPersonenBelegung(d, zeigPers, tag, st.person ? null : st.sel, idx), A, false);
    // GTAs des Tages in Spuren nebeneinander
    const tg = gl.filter(g => g.tag === tag).map(g => ({ g, iv: gtaIntervall(d, g) })).filter(x => x.iv).sort((p, q) => p.iv.start - q.iv.start || q.iv.end - p.iv.end);
    const enden = []; tg.forEach(x => { let i = 0; while (enden[i] !== undefined && enden[i] > x.iv.start) i++; enden[i] = x.iv.end; x.spur = i; });
    const n = Math.max(1, enden.length);
    tg.forEach(x => {
      const g = x.g, w = warnJe.get(g.id) || [], rn = g.raum ? (d.raeume.find(r => r.id === g.raum) || {}).name : '', hpx = (x.iv.end - x.iv.start) * GTA_PPM;
      const el = h('div', { class: 'gta-block' + (w.length ? ' konflikt' : '') + (st.sel === g.id ? ' gewaehlt' : ''), tabindex: 0, role: 'button', 'data-gta': g.id,
        style: { top: y(x.iv.start) + 'px', height: Math.max(14, hpx - 2) + 'px', left: 'calc(' + (x.spur * 100 / n) + '% + 2px)', width: 'calc(' + (100 / n) + '% - 4px)', '--gta': g.farbe },
        title: g.name + '\n' + gtaZeitText(d, g) + '\nLeitung: ' + gtaLeitung(d, g) + (rn ? '\nRaum: ' + rn : '') + (w.length ? '\n⚠ ' + w.join('\n⚠ ') : '') + '\nZiehen: verschieben (in die Ablage = aus dem Plan) · Klick: bearbeiten',
        onkeydown: ev => { if (ev.key === 'Enter') gtaDialog(g.id); if (ev.key === 'Delete') gtaLoeschen(g.id); } },
        h('div', { class: 'gta-b1' }, w.length ? h('span', { class: 'akzmarke' }, '!') : null, h('b', {}, g.name)),
        hpx > 30 ? h('div', { class: 'gta-b2' }, zeitText(x.iv.start) + '–' + zeitText(x.iv.end)) : null,
        hpx > 46 ? h('div', { class: 'gta-b2' }, gtaLeitung(d, g)) : null, hpx > 60 && rn ? h('div', { class: 'gta-b2' }, rn) : null);
      gtaZiehbar(el, { art: 'gta', id: g.id }, () => { st.sel = g.id; gtaDialog(g.id); });
      sp.append(el);
    });
    return sp;
  });
  const raster = h('div', { class: 'karte gta-rasterkarte' },
    h('div', { class: 'zeile', style: { marginBottom: '8px' } }, h('h3', { style: { margin: 0 } }, 'Wochenraster'),
      zeigPers.length ? h('span', { class: 'badge neutral' }, 'Belegung: ' + zeigPers.map(id => (lI.get(id) || {}).kuerzel || '?').join(', ')) : h('span', { class: 'muted klein' }, 'Person anklicken: ihre Belegung erscheint schraffiert'),
      st.person || st.sel ? h('button', { class: 'btn klein rechts', type: 'button', onclick: () => { st.person = ''; st.sel = ''; render(); } }, 'Auswahl aufheben') : null),
    h('div', { class: 'gta-raster', style: { '--tage': D } }, h('div', { class: 'gta-ecke' }), d.schule.tage.map(t => h('div', { class: 'gta-kopf' }, TAGE_LANG[t] || t)), achse, spalten),
    h('p', { class: 'muted klein', style: { marginBottom: 0 } }, 'GTAs rasten an den Zeilen des Zeitrasters ein; GTAs mit eigener Zeit lassen sich in 5-Minuten-Schritten legen. Schraffiert: belegt (Unterricht, Co, Aufgaben, Aufsichten, Sperrzeiten). GTAs zählen zur Arbeitszeit, werden bei der Verteilung des Unterrichts aber nicht berücksichtigt – nach einer Neuberechnung meldet der Planer Konflikte („GTA nicht mehr möglich“).'));
  return [
    warn.length ? h('div', { class: 'hinweis warn' }, h('b', {}, 'GTA nicht mehr möglich: '), h('ul', { class: 'klein', style: { margin: '4px 0 0' } }, warn.slice(0, 12).map(w => h('li', {}, w.text)), warn.length > 12 ? h('li', {}, '… und ' + (warn.length - 12) + ' weitere') : null)) : null,
    h('div', { class: 'gta-layout' }, links, raster)];
}
// Belegung von Personen in einer Tagesspalte des GTA-Rasters (schraffiert, Gleichzeitiges in Spuren nebeneinander); temp: nur während des Ziehens
function gtaBelegungZeichnen(d, sp, liste, A, temp) {
  const lI = new Map(d.lehrer.map(l => [l.id, l])), xs = liste.filter(b => b.art !== 'gta' || temp).sort((p, q) => p.start - q.start || q.end - p.end);
  const enden = []; xs.forEach(b => { let i = 0; while (enden[i] !== undefined && enden[i] > b.start) i++; enden[i] = b.end; b.spurG = i; });
  const n = Math.max(1, enden.length);
  xs.forEach(b => { const kz = (lI.get(b.lehrer) || {}).kuerzel || ''; sp.append(h('div', { class: 'gta-belegt' + (b.art === 'gesperrt' ? ' sperre' : '') + (temp ? ' temp' : ''), style: { top: ((b.start - A) * GTA_PPM) + 'px', height: Math.max(3, (b.end - b.start) * GTA_PPM) + 'px', left: 'calc(' + (b.spurG * 100 / n) + '% + 2px)', width: 'calc(' + (100 / n) + '% - 4px)' }, title: kz + ': ' + belegungText(d, b.lehrer, b) }, h('span', {}, kz + ' ' + (b.kurz || b.text || '')))); });
}
// Ziehen im GTA-Planer (Maus, Stift, Finger). quelle: { art: 'gta' | 'person', id }. Ohne Bewegung = Klick (klick()).
function gtaZiehbar(el, quelle, klick) {
  el.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    const x0 = ev.clientX, y0 = ev.clientY; let Z = null;
    const d = APP.daten, g0 = quelle.art === 'gta' ? (d.gta || []).find(g => g.id === quelle.id) : null;
    const dauer = g0 ? (gtaMinuten(d, g0) || g0.dauer) : 90, zeilen = g0 && g0.zeitArt === 'raster' ? g0.bis - g0.von + 1 : 2;
    const ziel = (cx, cy) => {
      const t = document.elementFromPoint(cx, cy); if (!t) return null;
      if (t.closest('.gta-ablage')) return { art: 'ablage' };
      const blk = quelle.art === 'person' ? t.closest('[data-gta]') : null;
      if (blk) return { art: 'gta', id: blk.dataset.gta };
      const sp = t.closest('.gta-tag'); if (!sp) return null;
      const { a: A } = gtaBereich(d), r = sp.getBoundingClientRect(), m = A + (cy - r.top - (Z && Z.dy || 0)) / GTA_PPM, tag = Number(sp.dataset.tag);
      const vorl = g0 ? JSON.parse(JSON.stringify(g0)) : gtaNeuVorlage(d, { personen: [quelle.id] });
      vorl.tag = tag;
      if (vorl.zeitArt === 'frei') { const s = Math.round(m / 5) * 5; vorl.beginn = zeitText(s); vorl.ende = zeitText(s + dauer); }
      else { const z = gtaZeilenFuer(d, m, g0 ? zeilen : 1); if (!z) return null; vorl.von = z.von; vorl.bis = z.bis;
        if (!g0) { const st = d.schule.stunden; if (st[z.von - 1] && !st[z.von - 1].istPause && st[z.von] && !st[z.von].istPause) vorl.bis = z.von + 1; } }
      return { art: 'zeit', sp, g: vorl, pr: gtaPruefen(d, vorl) };
    };
    const vorschau = h('div', { class: 'gta-vorschau' });
    const bewegen = e => {
      if (!Z) { if (Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) < 6) return; Z = { geist: h('div', { class: 'gta-geist' }, g0 ? g0.name : ((d.lehrer.find(l => l.id === quelle.id) || {}).kuerzel || '?') + ' → neue GTA') }; const r = el.getBoundingClientRect(); Z.dy = el.closest('.gta-tag') ? e.clientY - r.top : 0; document.body.append(Z.geist); el.classList.add('zieht'); try { el.setPointerCapture(e.pointerId); } catch (err) { /* */ }
        // während des Ziehens: Belegung der beteiligten Personen in allen Tagesspalten zeigen (die schon angezeigte bleibt)
        const pers = g0 ? g0.personen : [quelle.id], st = gtaZustand();
        if (pers.length && !st.person && st.sel !== (g0 && g0.id)) { const idx = belegungsIndex(d), { a: A } = gtaBereich(d); document.querySelectorAll('.gta-tag').forEach(sp => gtaBelegungZeichnen(d, sp, gtaPersonenBelegung(d, pers, Number(sp.dataset.tag), g0 ? g0.id : null, idx), A, true)); } }
      e.preventDefault();
      Z.geist.style.left = (e.clientX + 12) + 'px'; Z.geist.style.top = Math.max(4, e.clientY - 34) + 'px';
      const zz = ziel(e.clientX, e.clientY); Z.ziel = zz;
      document.querySelectorAll('.gta-ablage.drop, [data-gta].drop').forEach(n => n.classList.remove('drop'));
      if (!zz) { vorschau.remove(); zugHinweis(0, 0, ''); return; }
      if (zz.art === 'ablage') { vorschau.remove(); if (quelle.art === 'gta') { document.querySelector('.gta-ablage').classList.add('drop'); zugHinweis(e.clientX, e.clientY, 'loslassen: aus dem Plan nehmen (Ablage)'); } else zugHinweis(0, 0, ''); return; }
      if (zz.art === 'gta') { vorschau.remove(); const g = (d.gta || []).find(x => x.id === zz.id); document.querySelectorAll('[data-gta="' + zz.id + '"]').forEach(n => n.classList.add('drop')); const pr = g ? gtaPruefen(d, Object.assign({}, g, { personen: [...new Set(g.personen.concat([quelle.id]))] })) : { ok: true, gruende: [] }; zugHinweis(e.clientX, e.clientY, (pr.ok ? '✓ ' : '✕ ') + 'Person zu „' + (g ? g.name : '?') + '“ hinzufügen' + (pr.ok ? '' : ' – ' + pr.gruende[0])); return; }
      const iv = zz.pr.iv || gtaIntervall(d, zz.g), { a: A } = gtaBereich(d);
      if (!iv) { vorschau.remove(); return; }
      vorschau.className = 'gta-vorschau ' + (zz.pr.ok ? 'ok' : 'hart');
      vorschau.style.top = ((iv.start - A) * GTA_PPM) + 'px'; vorschau.style.height = Math.max(10, (iv.end - iv.start) * GTA_PPM - 2) + 'px';
      if (vorschau.parentNode !== zz.sp) zz.sp.append(vorschau);
      zugHinweis(e.clientX, e.clientY, (zz.pr.ok ? '✓ ' : '✕ ') + gtaZeitText(d, zz.g) + (zz.pr.ok ? (zz.pr.hinweise.length ? ' · ' + zz.pr.hinweise[0] : ' – frei') : ' – ' + zz.pr.gruende[0] + (zz.pr.gruende.length > 1 ? ' (+' + (zz.pr.gruende.length - 1) + ')' : '') + ' · loslassen: trotzdem …'));
    };
    const ende = async e => {
      window.removeEventListener('pointermove', bewegen); window.removeEventListener('pointerup', ende); window.removeEventListener('pointercancel', abbruch);
      if (!Z) { if (klick) klick(); return; }
      Z.geist.remove(); vorschau.remove(); zugHinweis(0, 0, ''); el.classList.remove('zieht'); document.querySelectorAll('.gta-belegt.temp').forEach(n => n.remove());
      document.querySelectorAll('.drop').forEach(n => n.classList.remove('drop'));
      APP.zugKlickSperre = true; setTimeout(() => { APP.zugKlickSperre = false; }, 50);
      const zz = Z.ziel; if (!zz) return;
      if (zz.art === 'ablage') { if (g0 && g0.tag >= 0) gtaAendern('GTA „' + g0.name + '“ aus dem Plan genommen', dd => { const g = dd.gta.find(x => x.id === g0.id); if (g) g.tag = -1; }); return; }
      if (zz.art === 'gta') {
        const g = (d.gta || []).find(x => x.id === zz.id); if (!g || g.personen.includes(quelle.id)) return;
        const pr = gtaPruefen(d, Object.assign({}, g, { personen: g.personen.concat([quelle.id]) }));
        if (!pr.ok && !(await bestaetigen('Konflikt: ' + pr.gruende.join(' · ') + ' – Person trotzdem zur GTA „' + g.name + '“ hinzufügen?', 'Trotzdem hinzufügen', 'gefahr'))) return;
        gtaAendern('Person zur GTA „' + g.name + '“ hinzugefügt', dd => { const x = dd.gta.find(y => y.id === g.id); if (x && !x.personen.includes(quelle.id)) x.personen.push(quelle.id); });
        return;
      }
      if (quelle.art === 'person') { gtaDialog(null, zz.g); return; }
      if (!zz.pr.ok && !(await bestaetigen('Die GTA „' + g0.name + '“ hat dort Konflikte: ' + zz.pr.gruende.join(' · ') + '. Trotzdem dorthin legen? Die Konflikte erscheinen danach als Warnung.', 'Trotzdem legen', 'gefahr'))) return;
      gtaAendern('GTA „' + g0.name + '“ gelegt: ' + gtaZeitText(d, zz.g, true), dd => { const g = dd.gta.find(x => x.id === g0.id); if (g) Object.assign(g, { tag: zz.g.tag, von: zz.g.von, bis: zz.g.bis, beginn: zz.g.beginn, ende: zz.g.ende }); });
    };
    const abbruch = () => { window.removeEventListener('pointermove', bewegen); window.removeEventListener('pointerup', ende); window.removeEventListener('pointercancel', abbruch); if (Z) { Z.geist.remove(); el.classList.remove('zieht'); } vorschau.remove(); zugHinweis(0, 0, ''); document.querySelectorAll('.gta-belegt.temp').forEach(n => n.remove()); };
    window.addEventListener('pointermove', bewegen); window.addEventListener('pointerup', ende); window.addEventListener('pointercancel', abbruch);
  });
}
async function gtaLoeschen(id) {
  const g = (APP.daten.gta || []).find(x => x.id === id); if (!g) return;
  if (!(await bestaetigen('GTA „' + g.name + '“ löschen?', 'Löschen', 'gefahr'))) return;
  gtaAendern('GTA „' + g.name + '“ gelöscht', dd => { dd.gta = dd.gta.filter(x => x.id !== id); });
}
// Dialog: GTA anlegen oder bearbeiten – Name, Leitung (Personen und/oder extern), Zeit (Rasterstunden oder eigene Zeit), Raum, Notiz.
// Freie Personen und Räume stehen oben und sind wählbar; belegte zeigen den Grund.
async function gtaDialog(id, vorgabe) {
  const d = APP.daten, D = d.schule.tage.length, H = d.schule.stunden.length;
  const orig = id ? (d.gta || []).find(g => g.id === id) : null;
  const g = orig ? JSON.parse(JSON.stringify(orig)) : gtaNeuVorlage(d, vorgabe);
  if (!orig && vorgabe) Object.assign(g, { tag: vorgabe.tag, von: vorgabe.von, bis: vorgabe.bis, beginn: vorgabe.beginn, ende: vorgabe.ende, zeitArt: vorgabe.zeitArt || g.zeitArt, personen: (vorgabe.personen || []).slice() });
  if (g.zeitArt === 'frei' && !(intervall(g.beginn, g.ende))) { const iv = gtaIntervall(d, Object.assign({}, g, { zeitArt: 'raster' })); if (iv) { g.beginn = zeitText(iv.start); g.ende = zeitText(iv.end); } }
  const zg = stundenZeiten(d.schule, null), kap = gtaKapazitaet(d), kapM = new Map(kap.map(k => [k.x.lehrer, k])), idx = belegungsIndex(d);
  const zeilenOpts = zg.map((z, i) => [String(i + 1), gtaZeileName(d, i) + (z ? ' ' + zeitText(z.start) + '–' + zeitText(z.end) : '')]);
  const root = h('div', { class: 'gta-dialog' }), status = h('div', { class: 'gta-status' }), persBox = h('div', { class: 'gta-perswahl' }), raumBox = h('span', {}), zeitBox = h('div', { class: 'zeile', style: { gap: '10px', flexWrap: 'wrap' } });
  let filter = '';
  const zeichneZeit = () => {
    leeren(zeitBox).append(...[
      h('label', { class: 'feld' }, 'Tag', sel([['-1', '– nicht platziert (Ablage) –']].concat(d.schule.tage.map((t, i) => [String(i), TAGE_LANG[t] || t])), String(g.tag), v => { g.tag = Number(v); alles(); }, { 'aria-label': 'Tag' })),
      h('label', { class: 'feld' }, 'Zeit', sel([['raster', 'Rasterstunden'], ['frei', 'eigene Zeit']], g.zeitArt, v => { const iv = gtaIntervall(d, Object.assign({}, g, { tag: Math.max(0, g.tag) })); if (v === 'frei' && iv) { g.beginn = zeitText(iv.start); g.ende = zeitText(iv.end); } if (v === 'raster' && intervall(g.beginn, g.ende)) { const z = gtaZeilenFuer(d, intervall(g.beginn, g.ende).start, 1); if (z) { g.von = z.von; const z2 = gtaZeilenFuer(d, intervall(g.beginn, g.ende).end - 1, 1); g.bis = z2 ? Math.max(z.von, z2.von) : z.von; } } g.zeitArt = v; alles(); }, { 'aria-label': 'Zeitart' })),
      g.zeitArt === 'raster'
        ? [h('label', { class: 'feld' }, 'von', sel(zeilenOpts, String(g.von), v => { g.von = Number(v); if (g.bis < g.von) g.bis = g.von; alles(); }, { 'aria-label': 'von Rasterzeile' })), h('label', { class: 'feld' }, 'bis', sel(zeilenOpts.filter(o => Number(o[0]) >= g.von), String(g.bis), v => { g.bis = Number(v); alles(); }, { 'aria-label': 'bis Rasterzeile' }))]
        : [h('label', { class: 'feld' }, 'Beginn', h('input', { type: 'time', value: g.beginn || '', step: 300, 'aria-label': 'Beginn', onchange: ev => { g.beginn = zeitNorm(ev.target.value); alles(); } })), h('label', { class: 'feld' }, 'Ende', h('input', { type: 'time', value: g.ende || '', step: 300, 'aria-label': 'Ende', onchange: ev => { g.ende = zeitNorm(ev.target.value); alles(); } }))],
      g.tag < 0 ? h('label', { class: 'feld' }, 'Dauer (min)', h('input', { type: 'number', min: 15, max: 600, step: 5, value: g.dauer, style: { width: '80px' }, 'aria-label': 'Dauer in Minuten', onchange: ev => { g.dauer = Math.max(15, Math.min(600, Number(ev.target.value) || 90)); } })) : null].flat().filter(Boolean));
  };
  const zeichnePersonen = () => {
    const iv = gtaIntervall(d, g), altMin = orig ? gtaMinuten(d, orig) : 0, neuMin = iv ? iv.end - iv.start : g.dauer;
    const zeilen = d.lehrer.map(l => {
      const k = kapM.get(l.id), frei = k ? k.frei + (orig && orig.personen.includes(l.id) ? altMin : 0) : null;
      const belAlle = iv ? gtaPersonenBelegung(d, [l.id], g.tag, g.id, idx).filter(b => b.start < iv.end && iv.start < b.end) : [], bel = belAlle.filter(b => b.art !== 'gesperrt');
      const fe = iv ? dienstFenster(l, g.tag, d.schule) : null;
      const grund = bel.length ? belegungText(d, l.id, bel[0]) : k && frei < neuMin - 3 ? 'Arbeitszeit reicht nicht (' + zahlDe(Math.max(0, frei) / 60, 1) + ' h frei)' : '';
      const sperre = !grund && (belAlle.length || (fe && fe.abwesend)) ? ' · Sperrzeit (erlaubt)' : '';
      return { l, k, frei, grund, sperre, an: g.personen.includes(l.id) };
    }).filter(z => !filter || ((z.l.kuerzel || '') + ' ' + (z.l.name || '')).toLowerCase().includes(filter))
      .sort((a, b) => (b.an - a.an) || (!a.grund - !b.grund) * -1 || ((b.frei ?? -1e9) - (a.frei ?? -1e9)) || natVergleich(a.l.kuerzel, b.l.kuerzel));
    leeren(persBox).append(...zeilen.map(z => h('label', { class: 'gta-pzeile' + (z.grund ? ' belegt' : ' frei'), title: z.grund || 'frei' },
      h('input', { type: 'checkbox', checked: z.an, onchange: ev => { if (ev.target.checked) { if (!g.personen.includes(z.l.id)) g.personen.push(z.l.id); } else g.personen = g.personen.filter(x => x !== z.l.id); alles(); } }),
      h('b', {}, z.l.kuerzel || z.l.name || '?'), h('span', { class: 'gta-pname' }, z.l.name && z.l.name !== z.l.kuerzel ? z.l.name : ''),
      h('span', { class: 'gta-pst' }, z.grund ? '✕ ' + z.grund : '✓ frei' + z.sperre + (z.frei !== null && z.frei !== undefined ? ' · ' + zahlDe(z.frei / 60, 1) + ' h Kapazität' : ' · ohne Wochenarbeitszeit')))));
  };
  const zeichneRaum = () => {
    const iv = gtaIntervall(d, g), bel = iv ? raumBelegungTag(d, g.tag, g.id) : null;
    const r2 = d.raeume.slice().sort((a, b) => natVergleich(a.name, b.name)).map(r => ({ r, f: iv ? raumFreiFuer(d, bel, r, iv) : { frei: true, grund: '' } }));
    const s = h('select', { 'aria-label': 'Raum', onchange: ev => { g.raum = ev.target.value; alles(); } },
      h('option', { value: '' }, '– kein Raum –'),
      h('optgroup', { label: iv ? 'frei zu dieser Zeit' : 'Räume' }, r2.filter(x => x.f.frei).map(x => h('option', { value: x.r.id }, x.r.name + (x.r.typ ? ' (' + x.r.typ + ')' : '') + (x.f.grund ? ' – ' + x.f.grund : '')))),
      r2.some(x => !x.f.frei) ? h('optgroup', { label: 'belegt' }, r2.filter(x => !x.f.frei).map(x => h('option', { value: x.r.id, disabled: x.r.id !== g.raum }, x.r.name + ' – ' + x.f.grund.slice(0, 60)))) : null);
    s.value = g.raum || '';
    leeren(raumBox).append(s);
  };
  const zeichneStatus = () => {
    const pr = gtaPruefen(d, g, { idx, kap });
    leeren(status).append(g.tag < 0 ? h('div', { class: 'hinweis' }, 'Noch nicht platziert – nach dem Speichern im Wochenraster an die gewünschte Stelle ziehen oder hier einen Tag wählen.')
      : pr.ok ? h('div', { class: 'hinweis ok' }, '✓ ' + gtaZeitText(d, g) + ' – passt' + (pr.hinweise.length ? ' · ' + pr.hinweise.join(' · ') : '') + '.')
        : h('div', { class: 'hinweis err' }, h('b', {}, '✕ Konflikt: '), pr.gruende.join(' · ')));
  };
  const alles = () => { zeichneZeit(); zeichnePersonen(); zeichneRaum(); zeichneStatus(); };
  root.append(
    h('div', { class: 'zeile', style: { gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' } },
      h('label', { class: 'feld', style: { flex: '1 1 260px' } }, 'Name der GTA', h('input', { type: 'text', value: g.name, maxlength: 80, placeholder: 'z. B. Schach-AG, Theater, Fußball', 'aria-label': 'Name der GTA', oninput: ev => { g.name = ev.target.value; } })),
      h('label', { class: 'feld' }, 'Farbe', h('input', { type: 'color', value: g.farbe, 'aria-label': 'Farbe', onchange: ev => { g.farbe = ev.target.value; } }))),
    h('h3', {}, 'Zeit'), zeitBox,
    h('h3', {}, 'Leitung'), h('p', { class: 'muted klein', style: { margin: '0 0 4px' } }, 'Eine oder mehrere Personen (zählt zu ihrer Arbeitszeit) und/oder eine externe Leitung (zählt nirgends). Die GTA gehört zu keiner Klasse.'),
    h('input', { type: 'search', placeholder: 'Person suchen …', 'aria-label': 'Person suchen', style: { width: '220px', marginBottom: '4px' }, oninput: ev => { filter = ev.target.value.trim().toLowerCase(); zeichnePersonen(); } }),
    persBox,
    h('label', { class: 'feld', style: { marginTop: '6px' } }, 'Extern (Name)', h('input', { type: 'text', value: g.extern, maxlength: 80, placeholder: 'z. B. Musikschule Frau Lange – leer = keine externe Leitung', 'aria-label': 'Externe Leitung', style: { width: '100%' }, oninput: ev => { g.extern = ev.target.value; } })),
    h('h3', {}, 'Raum (optional)'), raumBox,
    h('label', { class: 'feld', style: { marginTop: '8px' } }, 'Notiz', h('input', { type: 'text', value: g.notiz, maxlength: 300, 'aria-label': 'Notiz', style: { width: '100%' }, oninput: ev => { g.notiz = ev.target.value; } })),
    status);
  alles();
  const knoepfe = (orig ? [{ text: 'Löschen', wert: 'loeschen', art: 'gefahr' }, { text: 'Duplizieren', wert: 'kopie' }] : []).concat([{ text: 'Abbrechen', wert: false }, { text: 'Speichern', wert: true, art: 'primaer', vorher: () => { if (!String(g.name).trim()) { toast('Bitte einen Namen für die GTA eingeben.', 'err'); return false; } if (!g.personen.length && !String(g.extern).trim()) { toast('Bitte eine Person oder eine externe Leitung eintragen.', 'err'); return false; } if (g.tag >= 0 && !gtaIntervall(d, g)) { toast('Bitte eine gültige Zeit eintragen.', 'err'); return false; } return true; } }]);
  const w = await dialog({ titel: orig ? 'GTA bearbeiten: ' + orig.name : 'Neue GTA', breite: '720px', inhalt: root, knoepfe, fokus: 'input[type=text]' });
  if (w === 'loeschen') { gtaLoeschen(orig.id); return; }
  if (w === 'kopie') { const k = nGta(Object.assign(JSON.parse(JSON.stringify(orig)), { id: null, name: orig.name + ' (Kopie)', tag: -1 }), D, H); gtaAendern('GTA „' + orig.name + '“ dupliziert', dd => dd.gta.push(k)); toast('Kopie liegt in der Ablage – ins Raster ziehen.', 'ok'); return; }
  if (w !== true) return;
  const neu = nGta(Object.assign({}, g, { name: String(g.name).trim(), extern: String(g.extern).trim() }), D, H);
  const prS = gtaPruefen(d, neu);
  if (!prS.ok && !(await bestaetigen('Die GTA „' + neu.name + '“ hat Konflikte: ' + prS.gruende.join(' · ') + '. Trotzdem so speichern? Die Konflikte erscheinen danach als Warnung „GTA nicht mehr möglich“.', 'Trotzdem speichern', 'gefahr'))) return;
  gtaAendern(orig ? 'GTA „' + neu.name + '“ geändert' : 'GTA „' + neu.name + '“ angelegt', dd => { const i = dd.gta.findIndex(x => x.id === neu.id); if (i >= 0) dd.gta[i] = neu; else dd.gta.push(neu); });
  gtaZustand().sel = neu.id;
}
// Druck/Export: GTA-Plan (Wochenübersicht und Liste)
function gtaPlanInhalt(d, druck) {
  const gl = (d.gta || []).slice(), raumN = id => id ? ((d.raeume.find(r => r.id === id) || {}).name || '') : '';
  const iv = g => gtaIntervall(d, g) || { start: 0, end: 0 };
  const platziert = gl.filter(g => g.tag >= 0).sort((p, q) => p.tag - q.tag || iv(p).start - iv(q).start || natVergleich(p.name, q.name));
  const woche = h('table', { class: (druck ? 'druckliste' : 'tab') + ' woche gtaplan' }, h('thead', {}, h('tr', {}, d.schule.tage.map(t => h('th', {}, TAGE_LANG[t] || t)))),
    h('tbody', {}, h('tr', {}, d.schule.tage.map((_, tag) => h('td', {}, platziert.filter(g => g.tag === tag).map(g => h('div', { class: 'dz gta-dz', style: { borderLeftColor: g.farbe } }, h('div', {}, h('b', {}, zeitText(iv(g).start) + '–' + zeitText(iv(g).end) + ' ' + g.name)), h('div', { class: 'klein' }, gtaLeitung(d, g) + (raumN(g.raum) ? ' · ' + raumN(g.raum) : '')))))))));
  const liste = h('table', { class: (druck ? 'druckliste' : 'tab') + ' gtaliste' }, h('thead', {}, h('tr', {}, ['GTA', 'Zeit', 'Leitung', 'Raum', 'Notiz'].map(t => h('th', {}, t)))),
    h('tbody', {}, platziert.concat(gl.filter(g => g.tag < 0)).map(g => h('tr', {}, h('td', {}, h('b', {}, g.name)), h('td', {}, gtaZeitText(d, g)), h('td', {}, gtaLeitung(d, g)), h('td', {}, raumN(g.raum) || '–'), h('td', {}, g.notiz || '')))));
  return [gl.length ? woche : h('p', {}, 'Noch keine GTA angelegt.'), gl.length ? h('h3', {}, 'Alle GTAs') : null, gl.length ? liste : null];
}
function gtaPlanSeite(titel, i, n) { const d = APP.daten; return h('div', { class: 'druckseite fliessend lang' }, druckKopf(titel), gtaPlanInhalt(d, true), druckFuss(i, n)); }
// GTAs einer Person bzw. eines Raums als Zeile unter dem Lehrer- bzw. Raumplan
function gtaZeile(d, art, id) {
  const gl = (d.gta || []).filter(g => g.tag >= 0 && (art === 'raum' ? g.raum === id : g.personen.includes(id))).sort((p, q) => p.tag - q.tag || (gtaIntervall(d, p) || { start: 0 }).start - (gtaIntervall(d, q) || { start: 0 }).start);
  if (!gl.length) return null;
  const min = gl.reduce((s, g) => s + gtaMinuten(d, g), 0);
  return h('div', { class: 'aufsichtzeile terminzeile gtazeile' }, h('b', {}, 'GTA' + (art === 'raum' ? '' : ' (' + zahlDe(min / 60, 2) + ' h)') + ': '), gl.map((g, i) => [i ? ' · ' : '', gtaZeitText(d, g, true) + ' ' + g.name + (art === 'raum' ? ' (' + gtaLeitung(d, g) + ')' : (g.raum ? ' · ' + ((d.raeume.find(r => r.id === g.raum) || {}).name || '') : ''))]));
}

SEITEN_RENDER.gta = () => [
  seitenkopf('GTA-Planer', 'Ganztagsangebote (GTAs) von Hand in den fertigen Plan legen: Personen mit freier Kapazität (mindestens 60 min) stehen links, GTAs werden in das Wochenraster gezogen – auf Rasterstunden oder zu eigenen Zeiten, auch in Sperrzeiten der Personen. Eine GTA gehört zu keiner Klasse, nur zu einer oder mehreren Personen oder einer externen Leitung („Extern“ + Name). Sie zählt zur Arbeitszeit, wird bei der Verteilung des Unterrichts aber nicht berücksichtigt; passt sie nach einer Neuberechnung nicht mehr, erscheint „GTA nicht mehr möglich“. Externe GTAs zählen nirgends. Der GTA-Plan steht unter „Druck & Export“.',
    h('button', { class: 'btn primaer', type: 'button', onclick: () => gtaDialog(null) }, icon('plus', 'k'), ' Neue GTA')),
  APP.daten.lehrer.length ? gtaPlanerInhalt() : h('div', { class: 'karte' }, leerZustand({ icon: 'personen', titel: 'Noch keine Mitarbeitenden', text: 'Der GTA-Planer zeigt freie Kapazitäten, sobald Personen mit Wochenarbeitszeit angelegt sind.' }))
];
SEITEN_RENDER.arbeitszeit = () => {
  const tabs = [['uebersicht', 'Übersicht je Person'], ['regeln', 'Grenzen & Rechenmodell']];
  const aktiv = reiterAktiv('arbeitszeit', tabs);
  return [
    seitenkopf('Arbeitszeit & Deputat', 'Wochenarbeitszeit, Höchstarbeitszeit je Tag, Unterrichtsdeputat und Einsätze an einem Ort: die Grenzen jeder Person, das Rechenmodell und der aktuelle Stand. Die Ansicht „Einsätze & Anwesenheit“ zeigt zusätzlich Früh- und Spätaufsichten, Springer, Anwesenheit und Lücken je Person. GTAs (Ganztagsangebote) aus dem GTA-Planer zählen zur Arbeitszeit, aber nicht zur Verteilung des Unterrichts.'),
    reiterLeiste('arbeitszeit', tabs),
    h('div', { class: 'reiterinhalt' }, aktiv === 'regeln' ? arbeitszeitRegelnKarten() : !APP.daten.lehrer.length ? h('div', { class: 'karte' }, leerZustand({ icon: 'uhr', titel: 'Noch keine Mitarbeitenden', text: 'Hier stehen Wochenarbeitszeit, Deputat und der aktuelle Stand je Person, sobald Lehrkräfte angelegt sind.', aktion: { text: 'Mitarbeitende anlegen', tun: () => gehe('lehrer') } })) : arbeitszeitKarte({ bearbeiten: true, titel: 'Arbeitszeit je Person' }))
  ];
};

