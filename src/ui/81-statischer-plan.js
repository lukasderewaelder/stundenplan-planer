/* ---------------- Statischer Plan (Vorschau, Druck, HTML-Export) ---------------- */
// ---------- Echte Uhrzeiten (Zeitprofile) in den Plänen ----------
// Zeitbasis einer Ansicht: Der Klassenplan einer Klasse mit Zeitprofil zeigt deren Zeiten, alle anderen Pläne das Schulraster.
function zeitBasis(zc, art, id) { const pid = art === 'klasse' ? (zc.kp.get(id) || '') : ''; return { pid, z: zc(pid) }; }
// Uhrzeit eines Blocks, wenn sie von der Zeitbasis der Ansicht abweicht (z. B. Sport nach eigenem Profil), sonst ''
function abweichendeZeit(zc, basis, u, kid, hh, dur) {
  if (!u || u.aufgabe) return '';
  const pid = kid ? zc.pidK(u, kid) : zc.pids(u)[0];
  if (pid === basis.pid) return '';
  const z = zc(pid); let s = null, e = null, bs = null, be = null;
  for (let k = 0; k < dur; k++) {
    const a = z[hh + k], b = basis.z[hh + k];
    if (a) { s = s === null ? a.start : Math.min(s, a.start); e = e === null ? a.end : Math.max(e, a.end); }
    if (b) { bs = bs === null ? b.start : Math.min(bs, b.start); be = be === null ? b.end : Math.max(be, b.end); }
  }
  return s !== null && (s !== bs || e !== be) ? zeitText(s) + '–' + zeitText(e) : '';
}
// Pausen zwischen zwei Stunden (ab 10 Minuten) nach der Zeitbasis der Ansicht: luecken[hh] = { start, end, name } für die Pause nach Zeile hh
function planLuecken(d, basis) {
  const st = d.schule.stunden, out = new Array(st.length).fill(null);
  let pl = null;
  for (let hh = 0; hh + 1 < st.length; hh++) {
    if (st[hh].istPause || st[hh + 1].istPause) continue;
    const a = basis.z[hh], b = basis.z[hh + 1];
    if (!a || !b || b.start - a.end < 10) continue;
    pl = pl || pausenListe(d.schule, d.klassen);
    const pa = pl.find(p => p.start === a.end && p.end === b.start);
    out[hh] = { start: a.end, end: b.start, name: (pa && pa.eigenName) || 'Pause' };
  }
  return out;
}
// Zeit einer Pausenzeile in der Zeitbasis der Ansicht: vom Ende der Stunde davor bis zum Beginn der Stunde danach
// (bei Klassen mit Zeitprofil weicht das von den Uhrzeiten des Schulrasters ab)
function pausenZeit(d, basis, hh) {
  const st = d.schule.stunden; let v = hh - 1, n = hh + 1;
  while (v >= 0 && st[v].istPause) v--;
  while (n < st.length && st[n].istPause) n++;
  const a = v >= 0 ? basis.z[v] : null, b = n < st.length ? basis.z[n] : null;
  if (a && b && b.start > a.end && !(hh - v > 1 || n - hh > 1)) return { start: a.end, end: b.start };
  return basis.z[hh] || null;
}
// Was eine Person in einer Pause hat: Aufsicht, Aufsicht, Termin oder eine Sperre
function pausenInhalt(idx, lid, tag, iv) {
  if (!idx || !iv) return [];
  return ((idx.get(lid) || [])[tag] || []).filter(b => b.start < iv.end && iv.start < b.end && (b.art === 'dienst' || (b.art === 'aufgabe' && b.termin) || (b.art === 'gesperrt' && b.pause)))
    .map(b => ({ b, text: b.art === 'gesperrt' ? 'gesperrt' : b.kurz, titel: b.text + ' · ' + zeitText(b.start) + '–' + zeitText(b.end), sperre: b.art === 'gesperrt' }));
}
function belegungAktuell() { const c = modell(); if (!c.bewertung.belIdx) c.bewertung.belIdx = belegungsIndex(APP.daten); return c.bewertung.belIdx; }
function eintraegeFuer(d, platz, art, id) {
  const uMap = new Map(d.unterrichte.map(u => [u.id, u]));
  const bl = bloeckeAlle(d), ohneL = freiMap(d), handB = besetzungMap(d);
  const out = [];
  platz.forEach(p => {
    const u = uMap.get(p.unterricht); if (!u) return;
    let rolle = null;
    const key = u.id + '|' + p.blockNr, oL = ohneL.get(key) || null, hd = handB.get(key) || [];
    if (art === 'klasse') { if (!u.klassen.includes(id)) return; }
    else if (art === 'lehrer') {
      if (hd.includes(id)) rolle = handB.co.has(key + '|' + id) ? 'co' : 'fach'; // nur für diese Stunde von Hand eingesetzt
      else { const z = u.lehrkraefte.find(x => x.lehrer === id); if (!z) return; if (z.modus === 'anteilig' && !p.co.includes(id)) return; if (oL && oL.has(id)) return; rolle = z.rolle; }
    }
    else if (art === 'raum') { if (p.raum !== id) return; }
    const b = bl.get(u.id);
    const woche = u.rhythmus !== 'jede' ? u.rhythmus : (b && b.woche[p.blockNr - 1]) || 'jede';
    out.push({ p, u, rolle, woche, fachIds: u.aufgabe ? null : blockFachLehrer(u, p.blockNr, ohneL, handB), ohne: oL, coHand: hd.filter(l => handB.co.has(key + '|' + l)) });
  });
  return out;
}
// Bezeichnung der Teilgruppen eines Unterrichts für Druck und Export: „Gr. A“, bei mehreren „Gr. A, B“.
// Heißt eine Gruppe schon „Gr. …“ oder „Gruppe …“, bleibt ihr Name unverändert. Ohne Teilgruppen: ''.
function gruppenText(d, u) {
  if (!u || !u.gruppen || !u.gruppen.length) return '';
  const namen = u.gruppen.map(g => { for (const k of d.klassen) { const x = (k.gruppen || []).find(y => y.id === g); if (x) return String(x.name || '?'); } return '?'; });
  const fertig = namen.filter(n => /^(gr\.|gruppe)/i.test(n.trim())), rest = namen.filter(n => !/^(gr\.|gruppe)/i.test(n.trim()));
  return (rest.length ? ['Gr. ' + rest.join(', ')] : []).concat(fertig).join(', ');
}
function eintragText(d, e, art, opt) {
  const f = e.u.aufgabe ? { kuerzel: e.u.kuerzel || e.u.name, farbe: e.u.farbe, name: e.u.name } : (fachVon(e.u.fach) || { kuerzel: '?', farbe: '#999', name: '?' });
  const lk = z => lehrerName(lehrerVon(z.lehrer), opt.vollnamen);
  // „N. N.“ = Stunde ohne Lehrkraft (noch von Hand zu besetzen)
  const fachL = (e.fachIds ? e.fachIds.map(id => lk({ lehrer: id })) : e.u.lehrkraefte.filter(z => z.rolle === 'fach').map(lk)).join('/') || (e.u.aufgabe ? '' : 'N. N.');
  if (e.u.aufgabe) { const raum0 = e.p.raum ? (raumVon(e.p.raum) || {}).name || '' : ''; return { f, titel: opt.vollnamen ? f.name : f.kuerzel, zeile: art === 'lehrer' ? (e.u.lehrkraefte.length > 1 ? fachL : 'Aufgabe') : fachL, raum: raum0 }; }
  const co = e.u.lehrkraefte.filter(z => z.rolle === 'co' && (z.modus !== 'anteilig' || e.p.co.includes(z.lehrer)) && !(e.ohne && e.ohne.has(z.lehrer)) && !(e.fachIds && e.fachIds.includes(z.lehrer))).map(lk).concat((e.coHand || []).map(id => lk({ lehrer: id })));
  // Gruppenbezeichnung bei Halbgruppen (Druckoption „gruppen“): im Klassenplan hinter dem Fach, im Lehrer- und Raumplan hinter der Klasse
  const gruppe = opt.gruppen === false ? '' : gruppenText(d, e.u);
  const klassen = e.u.klassen.map(k => (klasseVon(k) || {}).name || '?').join('/') + (gruppe ? ' · ' + gruppe : '');
  const raum = e.p.raum ? (raumVon(e.p.raum) || {}).name || '' : '';
  const rhythmus = e.woche && e.woche !== 'jede' ? ' [' + e.woche + ']' : '';
  if (art === 'klasse') return { f, titel: (opt.vollnamen ? f.name : f.kuerzel) + rhythmus, gruppe, zeile: fachL + (co.length ? ' (+' + co.join(', +') + ')' : ''), raum };
  if (art === 'lehrer') return { f, titel: (opt.vollnamen ? f.name : f.kuerzel) + rhythmus + (e.rolle === 'co' ? ' · Co' : ''), zeile: klassen, raum, co: e.rolle === 'co' };
  return { f, titel: (opt.vollnamen ? f.name : f.kuerzel) + rhythmus, zeile: klassen + ' · ' + fachL, raum: '' };
}
// Reihenfolge nebeneinander liegender Einträge: jede Woche, dann Woche A, dann Woche B
const NEBEN_WOCHE = { jede: 0, A: 1, B: 2 };
function statischerPlan(d, platz, art, id, opt) {
  opt = Object.assign({ zeiten: true, raeume: true, vollnamen: false, pausen: true, farbe: true, klein: false, gruppen: true }, opt || {});
  const S = d.schule, D = S.tage.length, H = S.stunden.length;
  const eintr = eintraegeFuer(d, platz, art, id).filter(e => !opt.woche || opt.woche === 'beide' || opt.woche === 'getrennt' || e.woche === 'jede' || e.woche === opt.woche);
  const zc = zeitCache(d), basis = zeitBasis(zc, art, id);
  const zelle = Array.from({ length: D * H }, () => []);
  eintr.forEach(e => { for (let k = 0; k < e.p.dauer; k++) { const hh = e.p.stunde - 1 + k; if (hh < H && e.p.tag < D) zelle[e.p.tag * H + hh].push(e); } });
  const muster = ['', 'repeating-linear-gradient(45deg,#fff,#fff 3px,#ddd 3px,#ddd 5px)', 'repeating-linear-gradient(-45deg,#fff,#fff 3px,#ddd 3px,#ddd 5px)', 'repeating-linear-gradient(0deg,#fff,#fff 3px,#ddd 3px,#ddd 5px)', 'repeating-linear-gradient(90deg,#fff,#fff 3px,#ddd 3px,#ddd 5px)', 'radial-gradient(#bbb 1px, #fff 1.2px) 0 0/5px 5px'];
  const tab = h('table', { class: 'druckplan' }, h('thead', {}, h('tr', {}, h('th', { style: { width: opt.klein ? '42px' : '22mm' } }, ''), S.tage.map(t => h('th', {}, opt.klein ? t : TAGE_LANG[t])))));
  const tb = h('tbody');
  // Zeilen der Tabelle: Stunden, Pausenzeilen und Pausen zwischen zwei Stunden (ab 10 Minuten) – jede Pause ist eine eigene Zeile
  const luecken = opt.pausen && !opt.klein ? planLuecken(d, basis) : [];
  const idx = art === 'lehrer' && opt.pausen && !opt.klein ? belegungsIndex(d) : null;
  const zeilen = [];
  for (let hh = 0; hh < H; hh++) {
    if (S.stunden[hh].istPause) { if (opt.pausen) zeilen.push({ typ: 'pause', hh }); } else zeilen.push({ typ: 'std', hh });
    if (luecken[hh]) zeilen.push({ typ: 'luecke', hh });
  }
  const stil = t => { const fi = d.faecher.indexOf(t.f); return { background: opt.farbe ? t.f.farbe + '33' : (muster[fi % muster.length] || ''), borderLeft: '3px solid ' + (opt.farbe ? t.f.farbe : '#000') }; };
  const uebersprungen = new Set();
  zeilen.forEach((z, zi) => {
    const hh = z.hh, st = S.stunden[hh], zb = basis.z[hh];
    const iv = z.typ === 'luecke' ? luecken[hh] : z.typ === 'pause' ? pausenZeit(d, basis, hh) : zb;
    const tr = z.typ === 'std'
      ? h('tr', {}, h('td', { class: 'zeit' }, h('b', {}, st.name || stundeLabel(hh)), opt.zeiten && !opt.klein ? h('div', {}, zb ? zeitText(zb.start) + '–' + zeitText(zb.end) : st.beginn + '–' + st.ende) : null))
      : h('tr', { class: 'pz' }, h('td', { class: 'pause pname' }, z.typ === 'pause' ? (st.name || 'Pause') : luecken[hh].name, opt.zeiten && !opt.klein && iv ? h('span', { class: 'pzt' }, ' ' + zeitText(iv.start) + '–' + zeitText(iv.end)) : null));
    for (let dd = 0; dd < D; dd++) {
      if (uebersprungen.has(zi + '|' + dd)) continue;
      const i = dd * H + hh;
      // Pause zwischen zwei Stunden: nur Blöcke, die über die Pause hinweg weiterlaufen
      const liste = z.typ === 'luecke' ? zelle[i].filter(e => e.p.stunde - 1 + e.p.dauer - 1 > hh) : zelle[i];
      if (z.typ !== 'std') {
        const marken = art === 'lehrer' ? pausenInhalt(idx, id, dd, iv) : [];
        const teile = liste.map(e => eintragText(d, e, art, opt).titel).concat(marken.filter(m => !m.sperre || !liste.length).map(m => m.text));
        tr.append(h('td', { class: 'pause' + (teile.length && !(marken.length === teile.length && marken.every(m => m.sperre)) ? ' hat' : ''), title: marken.map(m => m.titel).join('\n') || null }, teile.join(' · ')));
        continue;
      }
      // Ein Block (oder parallele Gruppen-Blöcke gleicher Länge), der hier beginnt und seine Zeilen allein belegt, wird über alle Zeilen verbunden – auch über Pausen hinweg
      let rowspan = 1;
      if (liste.length && liste[0].p.dauer > 1 && liste.every(e => e.p.dauer === liste[0].p.dauer && e.p.stunde - 1 === hh)) {
        const ende = hh + liste[0].p.dauer - 1;
        let ok = ende < H;
        for (let r = hh + 1; ok && r <= ende; r++) { const zr = zelle[dd * H + r]; if (zr.length !== liste.length || !zr.every(e => liste.includes(e))) ok = false; }
        // Aufsicht oder Termin in einer überdeckten Pause: dann nicht verbinden, damit die Pause sichtbar bleibt
        if (ok && idx) for (let q = zi + 1; q < zeilen.length && ok; q++) { const y = zeilen[q]; if (y.hh > ende || (y.hh === ende && y.typ === 'luecke')) break; if (y.typ !== 'std' && pausenInhalt(idx, id, dd, y.typ === 'luecke' ? luecken[y.hh] : pausenZeit(d, basis, y.hh)).some(m => !m.sperre)) ok = false; }
        if (ok) { let zEnde = zi; for (let q = zi + 1; q < zeilen.length; q++) { const y = zeilen[q]; if (y.hh < ende || (y.hh === ende && y.typ !== 'luecke')) zEnde = q; else break; } rowspan = zEnde - zi + 1; for (let q = zi + 1; q <= zEnde; q++) uebersprungen.add(q + '|' + dd); }
      }
      const einzeln = liste.length === 1 ? eintragText(d, liste[0], art, opt) : null;
      // Mehrere Einträge in einer Zelle (A-/B-Woche, Gruppen, gekoppelte Kurse) stehen NEBENEINANDER – jeder über die volle Höhe seiner Stunden.
      // Untereinander sähen sie aus wie zwei aufeinanderfolgende Stunden.
      const reihe = liste.length > 1 ? liste.slice().sort((a, b) => (NEBEN_WOCHE[a.woche] || 0) - (NEBEN_WOCHE[b.woche] || 0) || gruppenText(d, a.u).localeCompare(gruppenText(d, b.u), 'de', { numeric: true })) : liste;
      const kinder = reihe.map(e => {
        const t = einzeln || eintragText(d, e, art, opt);
        const zt = opt.zeiten ? abweichendeZeit(zc, basis, e.u, art === 'klasse' ? id : null, e.p.stunde - 1, e.p.dauer) : '';
        return h('div', { class: 'de', 'data-u': e.u.id, style: Object.assign(einzeln ? {} : stil(t), { fontStyle: t.co ? 'italic' : '' }) }, h('b', {}, t.titel), t.gruppe ? ' ' : null, t.gruppe ? h('span', { class: 'gr' }, '· ' + t.gruppe) : null, h('div', { class: 'x' }, t.zeile), opt.raeume && t.raum ? h('div', { class: 'x' }, t.raum) : null, zt ? h('div', { class: 'x zt' }, zt) : null);
      });
      tr.append(h('td', { rowspan: rowspan > 1 ? rowspan : null, class: einzeln ? 'voll' : liste.length > 3 ? 'mehr n3 n4' : liste.length > 2 ? 'mehr n3' : liste.length > 1 ? 'mehr' : '', style: einzeln ? stil(einzeln) : null }, liste.length > 1 ? h('div', { class: 'neben' }, kinder) : kinder));
    }
    tb.append(tr);
  });
  tab.append(tb);
  return tab;
}

