/* ---------------- Plan-Editor ---------------- */
const ZEILE_H = 58, PAUSE_H = 16, LUECKE_H = 13, KOPF_H = 28;
// Dichte des Plan-Editors (APP.meta.dichte): Zeilenhöhe und Zeilenhöhen der Kachel-Schrift (px) – die Schriftgrößen stehen im CSS (.dichte-…)
const DICHTE = { kompakt: { zeile: 44, f: 15, l: 14, r: 13 }, normal: { zeile: ZEILE_H, f: 16.5, l: 15, r: 14 }, gross: { zeile: 78, f: 19, l: 17, r: 15.5 } };
function dichte() { return DICHTE[APP.meta.dichte] ? APP.meta.dichte : 'normal'; }
function dichteSetzen(v) { APP.meta.dichte = v; metaSpeichern(); render(); }
function ansichtListe(art) {
  const d = APP.daten;
  if (art === 'klasse') return klassenAlphabetisch(d.klassen).map(k => [k.id, k.name]);
  if (art === 'lehrer') return lehrerAlphabetisch(d.lehrer).map(l => [l.id, (l.kuerzel || '?') + ' – ' + (l.name || '')]);
  return raeumeAlphabetisch(d.raeume).map(r => [r.id, r.name]);
}
function ansichtIndex(M, art, id) { return art === 'klasse' ? (M.kI.has(id) ? M.kI.get(id) : -1) : art === 'lehrer' ? (M.lI.has(id) ? M.lI.get(id) : -1) : (M.rI.has(id) ? M.rI.get(id) : -1); }
// Kacheln einer Ansicht: [{e, p (Teil), start, dur, rolle}]
function kachelnFuer(M, P, art, x, woche) {
  const out = [];
  if (x < 0) return out;
  if (woche === 'A' || woche === 'B') { const w = woche === 'A' ? 0 : 1; return kachelnFuer(M, P, art, x).filter(k => M.E[k.e].wochen.includes(w)); }
  if (art === 'klasse') {
    for (const e of M.kEv[x]) { const s = P.start[e]; if (s < 0) continue; const ps = M.E[e].kp.get(x); const seen = new Set(); ps.forEach(p => { const f = M.E[e].parts[p].f; if (seen.has(f)) return; seen.add(f); out.push({ e, p, start: s, dur: M.E[e].dur }); }); }
  } else if (art === 'lehrer') {
    for (const e of M.lEv[x]) { const s = P.start[e]; if (s < 0 || !istAktiv(M, P, e, x)) continue; const ev = M.E[e]; const hd = ev.hand ? ev.hand.find(q => q.t === x) : null; let p = hd ? hd.p : ev.parts.findIndex(pt => M.U[pt.u].lehrer.includes(x)); if (p < 0) p = 0; out.push({ e, p, start: s, dur: ev.dur, rolle: hd ? (hd.co ? 'co' : 'fach') : M.U[ev.parts[p].u].rolle.get(x), hand: !!hd }); }
  } else {
    for (const e of M.rNutzer[x]) { const s = P.start[e]; if (s < 0) continue; M.E[e].parts.forEach((pt, p) => { if (P.raum[P.rOff[e] + p] === x) out.push({ e, p, start: s, dur: M.E[e].dur }); }); }
  }
  return out;
}
function kachelInhalt(M, P, k, art) {
  const ev = M.E[k.e], part = ev.parts[k.p], U = M.U[part.u];
  const data = APP.daten.unterrichte[part.u];
  if (U.aufgabe) { const r0 = P.raum[P.rOff[k.e] + k.p]; const pers = U.fachL.map(t => M.lKz[t]).join('/'); return { f: U.kurz, l: art === 'lehrer' ? (U.fachL.length > 1 ? pers : 'Aufgabe') : pers, r: r0 >= 0 ? M.rName[r0] : '' }; }
  const fz = part.f >= 0 ? M.fKz[part.f] : '?';
  // tatsächlich in diesem Block: eingetragene Fachlehrkräfte ohne die (wegen der Arbeitszeit) herausgenommenen, plus von Hand eingesetzte (✋)
  const ohneT = new Set((ev.ohne || []).map(o => o.t)), handT = (ev.hand || []).filter(q => q.p === k.p && !q.co).map(q => q.t), handCo = (ev.hand || []).filter(q => q.p === k.p && q.co).map(q => q.t);
  const fachT = U.fachL.filter(t => !ohneT.has(t));
  const nn = !fachT.length && !handT.length;
  const fachL = fachT.map(t => M.lKz[t]).concat(handT.map(t => '✋' + M.lKz[t])).join('/') || 'N. N.';
  const co = []; ev.co.forEach((z, j) => { if (z.p === k.p && P.co[P.cOff[k.e] + j]) co.push(M.lKz[z.t]); });
  U.immer.forEach(t => { if (U.rolle.get(t) === 'co' && !ohneT.has(t)) co.push(M.lKz[t]); });
  handCo.forEach(t => co.push('✋' + M.lKz[t]));
  const r = P.raum[P.rOff[k.e] + k.p];
  const raum = r >= 0 ? M.rName[r] : '';
  const kl = U.klassen.map(c => M.kName[c]).join('/') + (data && data.gruppen.length ? ' ' + data.gruppen.map(g => M.gName.get(g) || '').join(',') : '');
  const rh = U.rhythmus !== 'jede' ? ' [' + U.rhythmus + ']' : (ev.woche && ev.woche !== 'jede' ? ' [' + ev.woche + ']' : '');
  if (art === 'klasse') return { f: fz + rh, l: fachL + (co.length ? ' (+' + co.join(', +') + ')' : ''), r: raum, nn };
  if (art === 'lehrer') return { f: fz + rh + (k.rolle === 'co' ? ' · Co' : '') + (k.hand ? ' ✋' : ''), l: kl, r: raum, nn: false };
  return { f: fz + rh, l: kl + ' · ' + fachL, r: '', nn };
}
// Zusatzzeilen für den Kachel-Tooltip: Stunde ohne Lehrkraft, herausgenommene und von Hand eingesetzte Personen
function blockHinweis(M, ev) {
  if (ev.aufgabe) return '';
  let t = '';
  (ev.ohne || []).forEach(o => { t += '\nOhne ' + M.lKz[o.t] + ': ' + o.grund; });
  (ev.hand || []).forEach(q => { t += '\n' + M.lKz[q.t] + ' nur für diese Stunde von Hand eingesetzt'; });
  if (teilOhneLk(M, ev) >= 0) t += '\n⚠ Ohne Lehrkraft (N. N.) – Rechtsklick → „Lehrkraft ändern“ → „Nur diese Stunde besetzen“';
  return t;
}
// Index des ersten Teils (bei Kopplungen) ohne Fachlehrkraft in diesem Block, sonst -1
function teilOhneLk(M, ev) {
  if (ev.aufgabe) return -1;
  const ohneT = new Set((ev.ohne || []).map(o => o.t));
  return ev.parts.findIndex((pt, p) => !M.U[pt.u].fachL.some(t => !ohneT.has(t)) && !(ev.hand || []).some(q => q.p === p));
}
function farbeVon(M, f) { return f >= 0 ? M.fFarbe[f] : '#9aa9c2'; }
function kachelFarbe(M, ev, p) { const U = M.U[(ev.parts[p] || ev.parts[0]).u]; return U.aufgabe ? U.farbe : farbeVon(M, (ev.parts[p] || ev.parts[0]).f); }
function planRaster(art, id, rolle) {
  const { M, P } = modell();
  const woche = abWochenAktiv() ? (rolle === 'b' ? APP.editor.woche2 : APP.editor.woche) : 'alle';
  const x = ansichtIndex(M, art, id);
  const D = M.D, H = M.H, S = M.S;
  const DI = DICHTE[dichte()], ZH = DI.zeile;
  const hoehe = hh => M.pause[hh] ? PAUSE_H : ZH;
  const zc = zeitCache(M.data), basis = zeitBasis(zc, art, id);
  // Pausen zwischen zwei Stunden (ab 10 Minuten) bekommen eine eigene schmale Zeile
  const luecken = planLuecken(M.data, basis);
  const oben = [], zeile = [], hoehen = []; let y = 0;
  for (let hh = 0; hh < H; hh++) { oben.push(y); zeile.push(hoehen.length + 2); hoehen.push(hoehe(hh)); y += hoehe(hh); if (luecken[hh]) { hoehen.push(LUECKE_H); y += LUECKE_H; } }
  const grid = h('div', { class: 'plangrid', role: 'region', 'aria-label': 'Wochenplan', dataset: { rolle }, style: { '--tage': D, gridTemplateColumns: '70px repeat(' + D + ', minmax(84px, 1fr))', gridTemplateRows: KOPF_H + 'px ' + hoehen.map(x => x + 'px').join(' ') } });
  const belIdx = art === 'lehrer' && x >= 0 ? belegungAktuell() : null;
  // Blöcke, die an einem Verstoß gegen eine Pflichtregel beteiligt sind: werden an der Kachel mit Symbol und Muster markiert
  const konflikt = new Map(), akzB = akzeptiertBezug();
  modell().bewertung.det.forEach(v => { if (!M.hart[RI[v.r]] || !v.e || akzB.texte.has(v.text)) return; v.e.forEach(e => { if (!konflikt.has(e)) konflikt.set(e, []); if (konflikt.get(e).length < 4) konflikt.get(e).push(v.text); }); });
  // akzeptierte harte Fehler je Ereignis (rotes Ausrufezeichen)
  const akzE = e => { const out = []; M.E[e].parts.forEach((p, pi) => (akzB.bl.get(M.U[p.u].id + '|' + P._blockNr(e, pi)) || []).forEach(t => { if (!out.includes(t)) out.push(t); })); return out; };
  const pmarken = (dd, iv) => pausenInhalt(belIdx, id, dd, iv).map(m => h('span', { class: 'pmarke' + (m.sperre ? ' sperre' : ''), title: m.titel }, m.text));
  grid.append(h('div', { class: 'kz', style: { gridRow: 1, gridColumn: 1 } }, ''));
  M.data.schule.tage.forEach((t, d) => grid.append(h('div', { class: 'kz', style: { gridRow: 1, gridColumn: d + 2 } }, TAGE_LANG[t])));
  // Belegung für Freistunden und Sperrzeiten
  const kacheln = kachelnFuer(M, P, art, x, woche);
  const profilName = basis.pid ? ((M.data.schule.zeitprofile.find(z => z.id === basis.pid) || {}).name || '') : '';
  const belegt = new Uint8Array(S);
  kacheln.forEach(k => { for (let i = 0; i < k.dur; i++) belegt[k.start + i] = 1; });
  const hohl = new Uint8Array(S);
  if (art !== 'raum' && x >= 0) for (let d = 0; d < D; d++) { let a = -1, z = -1; for (let hh = 0; hh < H; hh++) if (belegt[d * H + hh] && !M.pause[hh]) { if (a < 0) a = hh; z = hh; } for (let hh = a + 1; hh < z; hh++) if (!M.pause[hh] && !belegt[d * H + hh]) hohl[d * H + hh] = 1; }
  for (let hh = 0; hh < H; hh++) {
    const st = M.data.schule.stunden[hh];
    grid.append(h('div', { class: 'zeitzelle' + (M.pause[hh] ? ' pause' : ''), style: { gridRow: zeile[hh], gridColumn: 1 }, title: M.pause[hh] && pausenZeit(M.data, basis, hh) ? (st.name || 'Pause') + ' ' + zeitText(pausenZeit(M.data, basis, hh).start) + '–' + zeitText(pausenZeit(M.data, basis, hh).end) : null }, M.pause[hh] ? h('span', { class: 'pname' }, st.name || 'Pause') : h('b', { title: st.name || null }, st.name || (M.lnr[hh] + '.')), M.pause[hh] ? null : h('span', { title: profilName ? 'Zeiten des Zeitprofils „' + profilName + '“' : null }, basis.z[hh] ? zeitText(basis.z[hh].start) : st.beginn)));
    for (let d = 0; d < D; d++) {
      const s = d * H + hh;
      let kl = 'zelle' + (M.pause[hh] ? ' pause' : '');
      if (hohl[s]) kl += ' hohl';
      if (!M.pause[hh] && !M.slotOk[s]) kl += ' schluss' + (art === 'lehrer' ? ' nuraufgabe' : '');
      if (x >= 0 && ((art === 'lehrer' && M.lVerf[x * S + s] === 0) || (art === 'raum' && !M.pause[hh] && M.rVerf[x * S + s] === 0))) kl += ' gesperrt';
      if (APP.editor.slot === s && APP.editor.slotRolle === rolle) kl += ' gewaehlt';
      grid.append(h('div', { class: kl, style: { gridRow: zeile[hh], gridColumn: d + 2 }, dataset: { slot: s }, onclick: M.pause[hh] ? null : ev => { if (APP.zugKlickSperre || ev.target.closest('.kachel')) return; slotWaehlen(s, rolle); }, title: hohl[s] ? 'Freistunde' : kl.includes('schluss') ? 'nach Unterrichtsschluss (' + TAGE_LANG[M.data.schule.tage[d]] + ' bis zur ' + M.schluss[d] + '. Stunde)' + (art === 'lehrer' ? ' – kein Unterricht, Aufgaben sind hier möglich' : '') : (kl.includes('gesperrt') ? 'gesperrt' : null) }, M.pause[hh] && belIdx ? pmarken(d, pausenZeit(M.data, basis, hh)) : null));
    }
    if (luecken[hh]) {
      const lu = luecken[hh];
      grid.append(h('div', { class: 'zeitzelle pause luecke', style: { gridRow: zeile[hh] + 1, gridColumn: 1 }, title: lu.name + ' ' + zeitText(lu.start) + '–' + zeitText(lu.end) }, h('span', { class: 'pname' }, lu.name === 'Pause' ? 'Pause ' + zeitText(lu.start) : lu.name)));
      for (let d = 0; d < D; d++) grid.append(h('div', { class: 'zelle pause luecke' + (art === 'lehrer' && x >= 0 && M.lGap[x * S + d * H + hh] ? ' gesperrt' : ''), style: { gridRow: zeile[hh] + 1, gridColumn: d + 2 } }, belIdx ? pmarken(d, lu) : null));
    }
  }
  // Uhrzeit → Position im Raster (Pixel bzw. Rasterzeile mit Bruchteil) – für GTAs, die nicht an Rasterzeilen gebunden sind
  const zr = hh => M.pause[hh] ? pausenZeit(M.data, basis, hh) : basis.z[hh];
  const minY = t => { for (let hh = 0; hh < H; hh++) { const z = zr(hh); if (!z) continue; if (t <= z.start) return oben[hh]; if (t < z.end) return oben[hh] + (t - z.start) / Math.max(1, z.end - z.start) * hoehe(hh); const lu = luecken[hh]; if (lu && t < lu.end) return oben[hh] + hoehe(hh) + Math.max(0, Math.min(1, (t - lu.start) / Math.max(1, lu.end - lu.start))) * LUECKE_H; } return y; };
  const zeileVon = t => { for (let hh = 0; hh < H; hh++) { const z = zr(hh); if (!z) continue; if (t <= z.start) return hh; if (t < z.end) return hh + (t - z.start) / Math.max(1, z.end - z.start); } return H; };
  let gtaFuer = [];
  if (art === 'lehrer' && x >= 0 && (M.data.gta || []).length) {
    const lid = id, c = modell();
    if (!c.bewertung.gtaW) { try { c.bewertung.gtaW = gtaWarnungen(M.data); } catch (err) { c.bewertung.gtaW = []; } }
    gtaFuer = (M.data.gta || []).filter(g => g.tag >= 0 && g.personen.includes(lid)).map(g => ({ g, iv: gtaIntervall(M.data, g), warn: c.bewertung.gtaW.filter(w => w.gta === g.id && (!w.lehrer || w.lehrer === lid)).map(w => w.text) })).filter(z => z.iv);
  }
  // Kacheln je Tag mit Spuren (bei Gruppen oder Konflikten nebeneinander)
  for (let d = 0; d < D; d++) {
    const spalte = h('div', { class: 'tagspalte', style: { gridRow: '2 / span ' + hoehen.length, gridColumn: d + 2 } });
    // GTAs der Lehrkraft (nur Lehreransicht): in Bruchteilen von Rasterzeilen, damit sie mit den Kacheln Spuren teilen
    const gtaKs = gtaFuer.filter(x => x.g.tag === d).map((x, i) => ({ gta: x.g, iv: x.iv, warn: x.warn, start: d * H + zeileVon(x.iv.start), dur: Math.max(0.3, zeileVon(x.iv.end) - zeileVon(x.iv.start)), e: 1e9 + i }));
    const ks = kacheln.filter(k => Math.floor(k.start / H) === d).concat(gtaKs).sort((a, b) => a.start - b.start || b.dur - a.dur || a.e - b.e);
    const spur = []; let cluster = [], clusterEnde = -1;
    const fertig = () => { const n = Math.max(1, ...cluster.map(k => k.spur + 1)); cluster.forEach(k => { k.spuren = n; }); cluster = []; };
    ks.forEach(k => {
      if (k.start >= clusterEnde && cluster.length) { fertig(); spur.length = 0; }
      let i = 0; while (spur[i] !== undefined && spur[i] > k.start) i++;
      spur[i] = k.start + k.dur; k.spur = i; cluster.push(k); clusterEnde = Math.max(clusterEnde, k.start + k.dur);
    });
    if (cluster.length) fertig();
    ks.forEach(k => {
      if (k.gta) {
        const g = k.gta, bot = minY(k.iv.end), top = Math.max(0, Math.min(minY(k.iv.start), y - 17)), w = 100 / k.spuren, rn = g.raum ? ((M.data.raeume.find(r => r.id === g.raum) || {}).name || '') : '';
        const el = h('div', { class: 'gtak' + (k.warn.length ? ' konflikt' : ''), tabindex: 0, role: 'button', 'aria-label': 'GTA ' + g.name + ', ' + gtaZeitText(M.data, g),
          title: 'GTA „' + g.name + '“\n' + gtaZeitText(M.data, g) + '\nLeitung: ' + gtaLeitung(M.data, g) + (rn ? '\nRaum: ' + rn : '') + (k.warn.length ? '\n⚠ ' + k.warn.join('\n⚠ ') : '') + '\nKlick: GTA bearbeiten (GTA-Planer)',
          style: { top: (top + 1) + 'px', height: Math.max(14, bot - top - 3) + 'px', left: 'calc(' + (k.spur * w) + '% + 2px)', width: 'calc(' + w + '% - 4px)', '--gta': g.farbe },
          onclick: ev => { ev.stopPropagation(); gtaDialog(g.id); }, onkeydown: ev => { if (ev.key === 'Enter') { ev.preventDefault(); gtaDialog(g.id); } } },
          h('div', { class: 'f' }, k.warn.length ? h('span', { class: 'akzmarke' }, '!') : null, 'GTA ' + g.name), h('div', { class: 'l' }, zeitText(k.iv.start) + '–' + zeitText(k.iv.end) + (rn ? ' · ' + rn : '')));
        spalte.append(el);
        return;
      }
      const hh = k.start % H;
      let hgt = 0; for (let i = 0; i < k.dur && hh + i < H; i++) hgt += hoehe(hh + i) + (i < k.dur - 1 && luecken[hh + i] ? LUECKE_H : 0);
      const inh = kachelInhalt(M, P, k, art);
      const ev = M.E[k.e];
      const zt = abweichendeZeit(zc, basis, M.data.unterrichte[ev.parts[k.p].u], art === 'klasse' ? id : null, hh, k.dur);
      const fest = ev.fixStart >= 0;
      const farbe = kachelFarbe(M, ev, k.p);
      const w = 100 / k.spuren;
      // Zusatzzeilen nur, wenn die Kachel hoch genug ist: Fach immer, dann Lehrkraft/Klasse, dann Raum (sonst stehen sie im Tooltip)
      const innen = hgt - 3 - 8;
      const zeigL = innen >= DI.f + DI.l - 2, zeigR = !!inh.r && innen >= DI.f + DI.l + DI.r - 2;
      const kf = konflikt.get(k.e) || null, akz = akzE(k.e);
      const el = h('div', {
        class: 'kachel' + (k.rolle === 'co' ? ' co' : '') + (APP.editor.sel === k.e ? ' ausgewaehlt' : '') + (fest ? ' fest' : '') + (inh.nn ? ' ohnelk' : '') + (kf ? ' konflikt' : '') + (akz.length ? ' akzeptiert' : ''), tabindex: 0, role: 'button',
        dataset: { e: k.e, p: k.p }, 'aria-label': handText(inh.f) + ', ' + handText(inh.l) + (inh.r ? ', Raum ' + inh.r : '') + ', ' + slotText(M, k.start) + ' Stunde' + (fest ? ', fixiert' : '') + (inh.nn ? ', ohne Lehrkraft' : '') + (kf ? ', Konflikt: ' + kf[0] : ''),
        title: evName(M, k.e) + (zeigL ? '' : '\n' + handText(inh.l)) + blockHinweis(M, ev) + (kf ? '\n⚠ Konflikt: ' + kf.join('\n⚠ Konflikt: ') : '') + (akz.length ? '\n❗ Akzeptierter harter Fehler: ' + akz.join('\n❗ Akzeptierter harter Fehler: ') : '') + '\n' + slotStd(M, k.start) + (zt ? ' · ' + zt + ' Uhr (Zeitprofil)' : '') + (inh.r ? ' · Raum ' + inh.r : '') + (fest ? '\nFixiert' + (ev.gesperrt ? ' (L zum Lösen)' : ' im Unterrichtsdialog') : '') + '\nRechtsklick: Menü',
        style: { top: (oben[hh] + 1) + 'px', height: (hgt - 3) + 'px', left: 'calc(' + (k.spur * w) + '% + 2px)', width: 'calc(' + w + '% - 4px)', '--fach': farbe }
      }, h('div', { class: 'f' }, mitHand(inh.f), zt ? h('span', { class: 'kzeit' }, zt) : null),
        zeigL ? h('div', { class: 'l' }, mitHand(inh.l), inh.r && !zeigR ? h('span', { class: 'rk' }, ' · ' + inh.r) : null) : null,
        zeigR ? h('div', { class: 'r' }, inh.r) : null,
        kf || inh.nn || fest || akz.length ? h('span', { class: 'kmarken', 'aria-hidden': 'true' }, akz.length ? h('span', { class: 'kakz' }, '!') : null, kf ? h('span', { class: 'kwarn' }, icon('warnung')) : null, inh.nn ? h('span', { class: 'knn' }, icon('person')) : null, fest ? h('span', { class: 'schloss' }, icon(ev.gesperrt ? 'schloss' : 'pin')) : null) : null);
      kachelEvents(el, k.e, { art, id, rolle });
      spalte.append(el);
    });
    grid.append(spalte);
  }
  grid._x = x;
  return grid;
}
function zugHinweis(x, y, text) { const el = $('#zughinweis'); if (!text) { el.style.display = 'none'; return; } el.textContent = text; el.style.display = 'block'; el.style.left = Math.min(x + 14, innerWidth - 360) + 'px'; const hh = el.offsetHeight || 40; el.style.top = (y + 16 + hh > innerHeight - 6 ? Math.max(4, y - hh - 40) : y + 16) + 'px'; }
function kachelEvents(el, e, view) {
  ziehbar(el, { typ: 'kachel', e });
  el.addEventListener('click', () => {
    if (APP.zugKlickSperre) return; APP.editor.sel = e; APP.editor.selP = Number(el.dataset.p || 0); APP.editor.slot = -1; document.querySelectorAll('.kachel.ausgewaehlt').forEach(n => n.classList.remove('ausgewaehlt')); document.querySelectorAll('.kachel[data-e="' + e + '"]').forEach(n => n.classList.add('ausgewaehlt')); document.querySelectorAll('.zelle.gewaehlt').forEach(n => n.classList.remove('gewaehlt')); editorLeiste('details'); ressourcenAuffrischen(); });
  el.addEventListener('dblclick', () => { const { M } = modell(); unterrichtDialog(M.U[M.E[e].parts[0].u].id); });
  el.addEventListener('contextmenu', ev => { ev.preventDefault(); APP.editor.sel = e; APP.editor.selP = Number(el.dataset.p || 0); APP.editor.slot = -1; ressourcenAuffrischen(); kachelMenue(e, ev.clientX, ev.clientY, view); });
  el.addEventListener('focus', () => { if (APP.editor.sel !== e) APP.editor.selP = Number(el.dataset.p || 0); APP.editor.sel = e; APP.editor.slot = -1; ressourcenAuffrischen(); });
}
// Status aller Zielslots für ein gezogenes Ereignis berechnen
function ziehenStart(e) {
  const hints = {};
  document.querySelectorAll('.plangrid[data-rolle]').forEach(g => {
    const rolle = g.dataset.rolle;
    const view = rolle === 'b' ? { art: APP.editor.art2, id: APP.editor.id2, woche: APP.editor.woche2 } : { art: APP.editor.art, id: APP.editor.id, woche: APP.editor.woche };
    const hs = {};
    g.querySelectorAll('.zelle[data-slot]').forEach(z => { const s = Number(z.dataset.slot); const st = zielStatus(e, s, view); hs[s] = st; z.classList.add('ziel-' + st.st); });
    hints[rolle] = hs;
    g.classList.add('ziehen');
  });
  APP.ziehen = { e, hints };
}
function ziehenEnde() {
  APP.ziehen = null; zugHinweis(0, 0, null);
  document.querySelectorAll('.plangrid').forEach(g => g.classList.remove('ziehen'));
  document.querySelectorAll('.zelle').forEach(z => z.classList.remove('ziel-ok', 'ziel-weich', 'ziel-hart', 'drueber'));
  document.querySelectorAll('.kachel.gezogen').forEach(n => n.classList.remove('gezogen'));
  document.querySelectorAll('.ablage.drueber').forEach(n => n.classList.remove('drueber'));
  document.querySelectorAll('.kachel.ziel-ok, .kachel.ziel-weich, .kachel.ziel-hart, .kachel.drueber').forEach(n => n.classList.remove('ziel-ok', 'ziel-weich', 'ziel-hart', 'drueber'));
  document.body.classList.remove('am-ziehen');
}

/* ---------- Ziehen und Ablegen mit Maus, Stift oder Finger (Pointer Events) ----------
   quelle: { typ: 'kachel', e } | { typ: 'lehrer', id } | { typ: 'raum', id } */
function ziehbar(el, quelle) {
  el.addEventListener('pointerdown', ev => {
    if (ev.button !== 0 || APP.rechnung.laeuft && quelle.typ === 'kachel') return;
    if (quelle.typ === 'kachel') { const { M } = modell(); if (!M.E[quelle.e] || M.E[quelle.e].fixStart >= 0) return; }
    const start = { x: ev.clientX, y: ev.clientY, id: ev.pointerId };
    let aktiv = false;
    const bewegen = mv => {
      if (mv.pointerId !== start.id) return;
      if (!aktiv) { if (Math.hypot(mv.clientX - start.x, mv.clientY - start.y) < 6) return; aktiv = true; zugBeginn(el, quelle); }
      mv.preventDefault();
      zugBewegen(mv.clientX, mv.clientY);
    };
    const ende = up => {
      if (up.pointerId !== start.id) return;
      document.removeEventListener('pointermove', bewegen); document.removeEventListener('pointerup', ende); document.removeEventListener('pointercancel', ende);
      if (!aktiv) return;
      APP.zugKlickSperre = true; setTimeout(() => { APP.zugKlickSperre = false; }, 60);
      zugAbschluss(up.clientX, up.clientY, up.type === 'pointercancel');
    };
    document.addEventListener('pointermove', bewegen, { passive: false });
    document.addEventListener('pointerup', ende); document.addEventListener('pointercancel', ende);
  });
}
function zugBeginn(el, quelle) {
  const r = el.getBoundingClientRect();
  const geist = el.cloneNode(true);
  geist.classList.add('zuggeist'); geist.classList.remove('ausgewaehlt', 'gezogen');
  Object.assign(geist.style, { width: Math.min(r.width, 220) + 'px', height: Math.min(r.height, 120) + 'px', left: '0px', top: '0px' });
  document.body.append(geist);
  document.body.classList.add('am-ziehen');
  if (quelle.typ === 'kachel') {
    APP.editor.sel = quelle.e;
    ziehenStart(quelle.e);
    el.classList.add('gezogen');
    APP.ziehen.quelle = quelle;
  } else {
    const hints = new Map();
    document.querySelectorAll('.plangrid .kachel[data-e]').forEach(k => {
      const e = Number(k.dataset.e), p = Number(k.dataset.p || 0);
      const st = quelle.typ === 'lehrer' ? lehrerZielStatus(e, p, quelle.id) : raumZielStatus(e, p, quelle.id);
      hints.set(k, st); k.classList.add('ziel-' + st.st);
    });
    APP.ziehen = { quelle, hints };
  }
  APP.ziehen.geist = geist;
}
function zugZiel(x, y) {
  const Z = APP.ziehen; if (!Z) return null;
  const t = document.elementFromPoint(x, y); if (!t) return null;
  if (Z.quelle.typ === 'kachel') {
    const zelle = t.closest('.plangrid[data-rolle] .zelle[data-slot]');
    if (zelle) { const rolle = zelle.closest('.plangrid').dataset.rolle; const s = Number(zelle.dataset.slot); return { art: 'zelle', el: zelle, rolle, s, hint: Z.hints[rolle] && Z.hints[rolle][s] }; }
    const ab = t.closest('.ablage');
    if (ab) return { art: 'ablage', el: ab, hint: { st: 'ok', text: 'In die Ablage legen (aus dem Plan nehmen)' } };
    return null;
  }
  const k = t.closest('.plangrid .kachel[data-e]');
  if (k && Z.hints.has(k)) return { art: 'kachel', el: k, e: Number(k.dataset.e), p: Number(k.dataset.p || 0), hint: Z.hints.get(k) };
  return null;
}
function zugBewegen(x, y) {
  const Z = APP.ziehen; if (!Z) return;
  Z.geist.style.transform = 'translate(' + (x + 12) + 'px,' + (y + 10) + 'px)';
  const ziel = zugZiel(x, y);
  document.querySelectorAll('.drueber').forEach(n => { if (!ziel || n !== ziel.el) n.classList.remove('drueber'); });
  if (!ziel || !ziel.hint) { zugHinweis(0, 0, null); return; }
  ziel.el.classList.add('drueber');
  zugHinweis(x, y + 24, (ziel.hint.st === 'hart' ? '✕ ' : ziel.hint.st === 'weich' ? '~ ' : '✓ ') + ziel.hint.text + (ziel.hint.st === 'hart' && Z.quelle.typ === 'kachel' && ziel.art === 'zelle' && !APP.rechnung.laeuft && !/^(Pause|Block ist fixiert)$/.test(ziel.hint.text) ? ' · loslassen: trotzdem verschieben …' : ''));
}
function zugAbschluss(x, y, abbruch) {
  const Z = APP.ziehen; if (!Z) return;
  const ziel = abbruch ? null : zugZiel(x, y);
  if (Z.geist) Z.geist.remove();
  const q = Z.quelle;
  ziehenEnde();
  if (!ziel || !ziel.hint) return;
  if (q.typ === 'kachel') {
    if (ziel.art === 'ablage') { if (modell().P.start[q.e] >= 0) inAblage(q.e); return; }
    const E = APP.editor, view = ziel.rolle === 'b' ? { art: E.art2, id: E.id2, woche: E.woche2 } : { art: E.art, id: E.id, woche: E.woche };
    if (ziel.hint.st === 'hart') { erzwingenDialog(q.e, ziel.s, view, ziel.hint.text); return; }
    zugAusfuehren(q.e, ziel.s, view);
  } else if (q.typ === 'lehrer') lehrerAbgelegt(ziel.e, ziel.p, q.id, x, y);
  else if (q.typ === 'raum') {
    if (ziel.hint.st === 'hart') { toast('Nicht möglich: ' + ziel.hint.text, 'err', 6000); return; }
    raumSetzen(ziel.e, ziel.p, q.id);
  }
}
// Ist Lehrkraft t in allen platzierten Blöcken des Unterrichts ui frei?
function lehrerFreiIn(M, P, ui, t) {
  const belegt = [];
  M.uEv[ui].forEach(ee => { const s0 = P.start[ee]; if (s0 < 0) return; for (let k = 0; k < M.E[ee].dur; k++) { if (M.lVerf[t * M.S + s0 + k] === 0) { belegt.push(slotText(M, s0 + k) + ' gesperrt'); return; } for (const w of M.E[ee].wochen) { const i = (t * 2 + w) * M.S + s0 + k; if (P.occ[i] > 0 && P.who[i] !== ee) { belegt.push(slotText(M, s0 + k) + ' (' + evName(M, P.who[i]) + ')'); return; } } } });
  return belegt;
}
function lehrerZielStatus(e, p, lid) {
  const { M, P } = modell();
  const t = M.lI.get(lid), l = APP.daten.lehrer[t], part = M.E[e].parts[p] || M.E[e].parts[0];
  const u = APP.daten.unterrichte[part.u];
  const name = (l.kuerzel || l.name) + ' → ' + M.U[part.u].name;
  // schon eingesetzt: Loslassen bietet das Herausnehmen an (dasselbe Ziehen wie beim Hinzufügen – auch für automatisch geplante Lehrkräfte)
  const info = lkImTermin(e, lid);
  if (info) return { st: 'ok', text: name + (info.aktiv ? ': ist hier ' + (info.rolle === 'co' ? 'Co-Lehrkraft' : 'Fachlehrkraft') + (info.auto ? ' (automatisch geplant)' : '') + ' – loslassen: herausnehmen …' : info.raus ? ': für diesen Termin herausgenommen – loslassen: wieder einsetzen …' : ': anteilige Co-Lehrkraft des Kurses – loslassen: hier einsetzen oder entfernen …') };
  if (u.lehrkraefte.some(z => z.lehrer === lid)) return { st: 'hart', text: name + ': ist dort schon eingetragen' };
  const belegt = lehrerFreiIn(M, P, part.u, t);
  if (belegt.length) return { st: 'weich', text: name + ': möglich, aber nicht überall frei – ' + belegt[0] + (belegt.length > 1 ? ' u. a.' : '') };
  if (u.aufgabe) return { st: 'ok', text: name + ': frei – loslassen und wählen' };
  // Fachlich passend: ausgebildet → Fach als Lehrkraft (oder zumindest als Co), Co-Kraft → Fach als Co
  const bef = l.ausgebildet === false ? coBefaehigt(l, u.fach) : fachBefaehigt(l, u.fach);
  const nurCo = l.ausgebildet !== false && !bef && coBefaehigt(l, u.fach);
  const auchCo = l.ausgebildet !== false && bef && coBefaehigt(l, u.fach);
  const team = teamVon(u.klassen), imTeam = team.has(lid);
  return { st: bef || nurCo ? 'ok' : 'weich', text: name + ': frei' + (auchCo ? ' (als Lehrkraft oder Co)' : bef ? '' : nurCo ? ', nur als Co-Lehrkraft (Co-Fach)' : l.ausgebildet === false ? ', aber ohne Co-Fach' : ', aber ohne Lehrbefähigung') + (l.ausgebildet === false ? ' (Co-Kraft)' : '') + (team.size ? (imTeam ? ' · Klassenteam' : ' · nicht im Klassenteam') : '') + ' – loslassen und Rolle wählen' };
}
function raumZielStatus(e, p, rid) {
  const { M, P } = modell();
  const r = M.rI.get(rid), ev = M.E[e], part = ev.parts[p] || ev.parts[0], s = P.start[e];
  const name = M.rName[r] + ' → ' + evName(M, e);
  if (s < 0) return { st: 'hart', text: name + ': Block ist nicht platziert' };
  if (P.raum[P.rOff[e] + p] === r) return { st: 'hart', text: name + ': ist bereits der Raum' };
  if (!part.cands) return { st: 'hart', text: name + ': Dieser Unterricht braucht keinen Raum' };
  // einzige Quelle: ressourcenFuerBlock (Raumtyp, Kapazität, fester Raum, Belegung auch in echter Uhrzeit, Sperrzeiten)
  const res = ressourcen(e), x = res.teile[p] ? res.teile[p].raeume.find(q => q.r === r) : null;
  if (!x) return { st: 'hart', text: name + ': passt nicht' };
  if (x.st === 'nein') return { st: 'hart', text: name + ': ' + x.gruende.join('; ') };
  return x.st === 'warn' ? { st: 'weich', text: name + ': frei – ' + x.folgen.join('; ') + ' (nur dieser Block)' } : { st: 'ok', text: name + ': frei und passend (nur dieser Block)' };
}
function raumSetzen(e, p, rid) {
  const { M, P } = modell();
  const r = M.rI.get(rid);
  P.begin(); P.touch(e); P._belegeRaum(e, p, -1); P.raum[P.rOff[e] + p] = r; P._belegeRaum(e, p, 1); P.commit();
  planUebernehmen('Raum geändert: ' + evName(M, e) + ' → ' + M.rName[r]);
  requestAnimationFrame(() => blitzKachel(e));
}
// Lehrkraft auf eine Kachel gezogen: Rolle wählen
function lehrerAbgelegt(e, p, lid, x, y) {
  const { M } = modell();
  const part = M.E[e].parts[p] || M.E[e].parts[0];
  const u = APP.daten.unterrichte[part.u], l = lehrerVon(lid), U = M.U[part.u];
  if (!u.aufgabe && l.art === 'personal') { toast((l.kuerzel || l.name) + ' ist weiteres Personal und unterrichtet nicht – einsetzbar für Aufsichten und Aufgaben.', 'err', 6000); return; }
  // die Person steht schon in diesem Termin (auch automatisch geplant oder für diese Stunde herausgenommen): herausnehmen bzw. wieder einsetzen anbieten
  if (lkEntfernenMenue(e, lid, x, y)) return;
  const st = lehrerZielStatus(e, p, lid);
  if (st.st === 'hart') { toast(st.text, 'err', 5000); return; }
  const fz = u.lehrkraefte.find(z => z.rolle === 'fach');
  const warn = st.st === 'weich' && st.text.includes('nicht überall frei');
  // rolle gesetzt (Unterricht): erst die gemeinsame Schranke – ✕ nur nach „Trotzdem erzwingen“
  const anwenden = async (beschr, fn, rolle) => {
    const tun = d => { const uu = findeId(d.unterrichte, u.id); if (uu) fn(uu); };
    let erzw = false;
    if (rolle && !u.aufgabe) { const x = ressourceEintrag(e, p, lid, rolle); if (x) { const r = await zuweisungBestaetigen(e, p, x, rolle, 'alle', tun, (l.kuerzel || l.name) + ' → ' + U.name); if (!r) return; erzw = r.erzwungen; } }
    aendern(beschr + (erzw ? ' (erzwungen)' : ''), tun, { normalisieren: true });
    if (warn && !erzw) toast((l.kuerzel || l.name) + ' ist in mindestens einem Block belegt – bitte die Verstöße prüfen.', 'err', 6000);
  };
  const alsFach = zwang => anwenden('Fachlehrkraft ' + U.name + ' → ' + l.kuerzel + (zwang ? ' (Zwang)' : ''), uu => { const i = uu.lehrkraefte.findIndex(z => z.rolle === 'fach'); if (i >= 0) Object.assign(uu.lehrkraefte[i], { lehrer: lid, zwang: !!zwang, auto: false }); else uu.lehrkraefte.unshift(nLehrkraftZuordnung({ lehrer: lid, rolle: 'fach', modus: 'immer', zwang })); }, 'fach');
  const eintraege = [{ titel: (l.kuerzel || l.name) + ' → ' + U.name + (u.aufgabe ? ' (alle Blöcke)' : '') }];
  if (u.aufgabe) {
    eintraege.push({ icon: 'pin', text: 'Aufgabe übernehmen' + (fz ? ' (statt ' + lehrerName(lehrerVon(fz.lehrer)) + ')' : ''), tun: () => alsFach(false) });
    eintraege.push({ icon: 'plus', text: 'Zusätzlich eintragen (gemeinsamer Termin)', tun: () => anwenden('Aufgabe ' + U.name + ' + ' + l.kuerzel, uu => { uu.lehrkraefte.push(nLehrkraftZuordnung({ lehrer: lid, rolle: 'fach', modus: 'immer' })); }) });
    menueZeigen(x, y, eintraege); return;
  }
  const team = teamVon(u.klassen), ausserTeam = team.size && !team.has(lid) ? ' – nicht im Klassenteam' : '';
  { const mp = modell(), tI = mp.M.lI.get(lid), belegtHier = blockFreiText(mp.M, mp.P, e, tI);
    const xr = ressourceEintrag(e, p, lid, 'fach'), SY = { ok: '✓', warn: '⚠', nein: '✕' };
    if (!mp.M.E[e].immer.includes(tI)) eintraege.push({ icon: 'hand', text: 'Nur diese Stunde übernehmen' + (xr ? ' – ' + SY[xr.st] + (xr.gruende.concat(xr.folgen)[0] ? ' ' + xr.gruende.concat(xr.folgen)[0] : ' verfügbar') : (belegtHier ? ' – ' + belegtHier : '')), aus: !xr && !!belegtHier, tun: () => { if (xr) ressourceZuweisen(e, p, xr, 'fach', 'block'); else blockBesetzen(e, p, lid); } }, '-', { titel: 'Alle Blöcke des Kurses' }); }
  if (l.ausgebildet !== false) eintraege.push({ icon: 'personen', text: 'Als Fachlehrkraft einsetzen' + (fz ? ' (statt ' + lehrerName(lehrerVon(fz.lehrer)) + ')' : '') + (fachBefaehigt(l, u.fach) ? '' : ' – ohne Lehrbefähigung'), tun: () => alsFach(false) });
  eintraege.push({ icon: 'plus', text: 'Als Co-Lehrkraft hinzufügen' + (coBefaehigt(l, u.fach) ? '' : ' – ohne Co-Fach') + ausserTeam, tun: () => anwenden('Co-Lehrkraft ' + U.name + ' + ' + l.kuerzel, uu => { uu.lehrkraefte.push(nLehrkraftZuordnung({ lehrer: lid, rolle: 'co', modus: 'immer', stundenAnteil: uu.wochenstunden, deputatFaktor: 0.5 })); }, 'co') });
  if (l.ausgebildet === false) eintraege.push('-', { text: '⚠ Als Fachlehrkraft mit Zwang (Co-Kraft)' + (fz ? ' statt ' + lehrerName(lehrerVon(fz.lehrer)) : ''), tun: () => alsFach(true) });
  menueZeigen(x, y, eintraege);
}
// Seitenleiste: Lehrkräfte und Räume zum Ziehen
/* ---------------- Ressourcen für den gewählten Termin ---------------- */
// Ergebnis von ressourcenFuerBlock je Datenstand und Block zwischengespeichert (liegt am Bewertungs-Cache)
function ressourcen(e) {
  const c = modell(), b = c.bewertung;
  if (!b.res) b.res = new Map();
  if (!b.res.has(e)) {
    if (!b.az) b.az = arbeitszeiten(APP.daten, { mitTagen: true }).liste;
    b.res.set(e, ressourcenFuerBlock(APP.daten, c.M, c.P, e, { belIdx: belegungAktuell(), az: b.az }));
  }
  return b.res.get(e);
}
function ressourcenAuffrischen() {
  if (APP._resTimer) return;
  APP._resTimer = requestAnimationFrame(() => { APP._resTimer = 0; const alt = document.getElementById('ressourcenBox'); if (alt && APP.seite === 'editor') alt.replaceWith(ressourcenBox()); });
}
function slotWaehlen(s, rolle) {
  APP.editor.sel = -1; APP.editor.slot = s; APP.editor.slotRolle = rolle;
  document.querySelectorAll('.kachel.ausgewaehlt').forEach(n => n.classList.remove('ausgewaehlt'));
  document.querySelectorAll('.zelle.gewaehlt').forEach(n => n.classList.remove('gewaehlt'));
  document.querySelectorAll('.plangrid[data-rolle="' + rolle + '"] .zelle[data-slot="' + s + '"]').forEach(n => n.classList.add('gewaehlt'));
  editorLeiste('details');
  ressourcenAuffrischen();
}
function ersatzSuchen(e, was) {
  APP.editor.sel = e; APP.editor.slot = -1; APP.editor.resFokus = was;
  document.querySelectorAll('.kachel.ausgewaehlt').forEach(n => n.classList.remove('ausgewaehlt')); document.querySelectorAll('.kachel[data-e="' + e + '"]').forEach(n => n.classList.add('ausgewaehlt'));
  editorLeiste('details');
  ressourcenAuffrischen();
  requestAnimationFrame(() => requestAnimationFrame(() => { const box = document.getElementById('ressourcenBox'); if (box) { box.scrollIntoView({ block: 'nearest' }); const z = box.querySelector('[data-res="' + was + '"]'); if (z) { z.classList.remove('blitz'); void z.offsetWidth; z.classList.add('blitz'); const k = z.querySelector('button'); if (k) k.focus(); } } }));
}
// Prüft eine geplante Änderung mit denselben Regeln wie die Berechnung: liefert die harten Verstöße, die durch sie NEU entstünden
function neueHarteVerstoesse(fn) {
  const c = modell(), vorher = new Set();
  c.bewertung.det.forEach(x => { if (c.M.hart[RI[x.r]] && x.r !== 'H04') vorher.add(x.r + '|' + x.text); });
  let kopie = JSON.parse(JSON.stringify(APP.daten)); fn(kopie); kopie = normalisiere(kopie);
  const mp = planAusDaten(kopie), det = []; bewerteAlles(mp.M, mp.P, det);
  return det.filter(x => mp.M.hart[RI[x.r]] && x.r !== 'H04' && !vorher.has(x.r + '|' + x.text));
}
// Änderung „nur dieser Termin“: Person lid übernimmt den Block als Fach- oder Co-Lehrkraft; wer dort bisher in dieser Rolle stand, wird für
// diesen Block herausgenommen (er behält seine übrigen Stunden). Liefert die Änderungsfunktion für aendern().
function blockErsatzFn(e, p, lid, rolle) {
  const { M } = modell(); const ev = M.E[e], part = ev.parts[p] || ev.parts[0], U = M.U[part.u], uid = U.id, blockNr = part.b + 1;
  const res = ressourcen(e), teil = res.teile[p] || res.teile[0];
  const alt = (rolle === 'co' ? teil.co : teil.lehrer).filter(x => x.aktuell).map(x => x.id);
  return dd => {
    const u = dd.unterrichte.find(x => x.id === uid); if (!u) return;
    const bl = bloeckeAlle(dd).get(uid), istBlock = x => x.unterricht === uid && x.blockNr === blockNr, neu = dd.lehrer.find(x => x.id === lid);
    dd.plan.frei = dd.plan.frei || []; dd.plan.besetzung = dd.plan.besetzung || [];
    alt.forEach(aid => {
      if (aid === lid) return;
      if (dd.plan.besetzung.some(b => istBlock(b) && b.lehrer === aid)) { dd.plan.besetzung = dd.plan.besetzung.filter(b => !(istBlock(b) && b.lehrer === aid)); return; }
      const z = u.lehrkraefte.find(q => q.lehrer === aid); if (!z) return;
      if (z.modus === 'anteilig') { dd.plan.platzierungen.forEach(pl => { if (istBlock(pl) && pl.co) pl.co = pl.co.filter(c => c !== aid); }); return; } // anteilige Co: nur aus diesem Block nehmen
      dd.plan.frei = dd.plan.frei.filter(a => !(istBlock(a) && a.lehrer === aid));
      dd.plan.frei.push({ unterricht: uid, blockNr, lehrer: aid, grund: 'für diesen Termin ersetzt durch ' + ((neu && (neu.kuerzel || neu.name)) || '?'), sig: besetzungSig(bl), rolle: rolle === 'co' ? 'co' : 'fach' });
    });
    dd.plan.frei = dd.plan.frei.filter(a => !(istBlock(a) && a.lehrer === lid)); // war herausgenommen: kehrt zurück
    if (!u.lehrkraefte.some(z => z.lehrer === lid && z.modus !== 'anteilig')) { dd.plan.besetzung = dd.plan.besetzung.filter(b => !(istBlock(b) && b.lehrer === lid)); dd.plan.besetzung.push({ unterricht: uid, blockNr, lehrer: lid, sig: besetzungSig(bl), rolle: rolle === 'co' ? 'co' : 'fach' }); }
  };
}
// Änderung „alle Stunden des Unterrichts“
function unterrichtErsatzFn(e, p, lid, rolle) {
  const { M } = modell(); const part = M.E[e].parts[p] || M.E[e].parts[0], uid = M.U[part.u].id;
  return dd => {
    const u = dd.unterrichte.find(x => x.id === uid); if (!u) return;
    u.lehrkraefte = u.lehrkraefte.filter(z => z.lehrer !== lid);
    if (rolle === 'co') { const i = u.lehrkraefte.findIndex(z => z.rolle === 'co'); const neu = nLehrkraftZuordnung({ lehrer: lid, rolle: 'co', modus: i >= 0 ? u.lehrkraefte[i].modus : 'immer', stundenAnteil: i >= 0 ? u.lehrkraefte[i].stundenAnteil : u.wochenstunden, deputatFaktor: 0.5 }); if (i >= 0) u.lehrkraefte[i] = neu; else u.lehrkraefte.push(neu); }
    else { const i = u.lehrkraefte.findIndex(z => z.rolle === 'fach'); const neu = nLehrkraftZuordnung({ lehrer: lid, rolle: 'fach', modus: 'immer', deputatFaktor: 1 }); if (i >= 0) u.lehrkraefte[i] = neu; else u.lehrkraefte.unshift(neu); u.fachAuto = false; }
    // Einträge „nur diese Stunde“ dieser Rolle entfallen: Die Person hält jetzt alle Blöcke
    if (dd.plan.besetzung) dd.plan.besetzung = dd.plan.besetzung.filter(b => !(b.unterricht === uid && (b.rolle === 'co') === (rolle === 'co')));
    if (dd.plan.frei) dd.plan.frei = dd.plan.frei.filter(a => !(a.unterricht === uid && !u.lehrkraefte.some(z => z.lehrer === a.lehrer)));
  };
}
// Zuweisung aus der Ressourcenleiste: prüft wie die Berechnung und führt aus (oder fragt bei hartem Konflikt nach)
// Eintrag der Ressourcenprüfung für eine Person in einem Termin (dieselbe Auskunft wie in der Leiste). null, wenn der Block nicht platziert ist.
function ressourceEintrag(e, p, lid, rolle) {
  const { M, P } = modell(); if (P.start[e] < 0 || M.E[e].aufgabe) return null;
  let res; try { res = ressourcen(e); } catch (err) { console.error(err); return null; }
  const teil = res.teile[p] || res.teile[0]; if (!teil) return null;
  const x = (rolle === 'co' ? teil.co : teil.lehrer).find(q => q.id === lid);
  if (x) return x;
  const l = lehrerVon(lid) || {};
  return { id: lid, kuerzel: l.kuerzel || l.name || '?', name: l.name || '', st: 'nein', gruende: [l.art === 'personal' ? 'weiteres Personal – unterrichtet nicht' : rolle === 'co' ? 'als Co-Lehrkraft hier nicht einsetzbar' : 'Co-Kraft ohne Lehrbefähigung – als Fachlehrkraft nicht vorgesehen'], folgen: [], alle: false, aktuell: false };
}
// Gemeinsame Schranke: ✕ „nicht verfügbar“ und neue harte Verstöße werden nie stillschweigend übernommen – weder aus der Ressourcenleiste
// noch aus dem Menü der Stunde noch beim Ziehen einer Lehrkraft. Liefert null (abgebrochen) oder { erzwungen }.
async function zuweisungBestaetigen(e, p, x, rolle, umfang, fn, name) {
  const { M } = modell();
  let neu = [];
  try { neu = neueHarteVerstoesse(fn); } catch (err) { console.error(err); }
  const gruende = x && x.st === 'nein' ? x.gruende.slice() : [];
  if (x && umfang === 'alle') try {
    const c = modell(), part = M.E[e].parts[p] || M.E[e].parts[0], uu = APP.daten.unterrichte[part.u], az = (c.bewertung.az || (c.bewertung.az = arbeitszeiten(APP.daten, { mitTagen: true }).liste)).find(q => q.lehrer === x.id);
    const std = uu ? stundenSchnitt(uu, bloeckeAlle(APP.daten).get(uu.id)) : 0;
    if (!x.alle && !gruende.length) gruende.push('nicht in allen Stunden dieses Unterrichts frei');
    if (az && az.hatSollStd && az.istStd + std > az.sollStd + 0.49 && !gruende.some(g => /Unterrichtsdeputat/.test(g))) gruende.push('Unterrichtsdeputat würde überschritten (' + zahlDe(az.istStd, 1) + ' + ' + zahlDe(std, 1) + ' von ' + zahlDe(az.sollStd, 1) + ' UStd.)');
  } catch (err) { console.error(err); }
  if (!neu.length && !gruende.length) return { erzwungen: false };
  const ok = await dialog({ titel: 'Trotzdem erzwingen?', breite: '620px', inhalt: h('div', { id: 'erzwingenRes' },
    gruende.length ? [h('p', {}, h('b', {}, name), ' ist ' + (umfang === 'alle' ? 'für diesen Unterricht ' : 'für diesen Termin '), h('b', {}, 'nicht verfügbar'), ' (✕):'), h('ul', {}, gruende.slice(0, 6).map(g => h('li', {}, g)))] : null,
    neu.length ? [h('p', {}, gruende.length ? 'Außerdem würden harte Regeln verletzt:' : [h('b', {}, name), ' verletzt harte Regeln:']), h('ul', {}, neu.slice(0, 6).map(v => h('li', {}, v.text, ' ', regelMarke(v.r))))] : null,
    h('p', { class: 'muted klein' }, 'Eine normale Zuweisung ist damit nicht möglich. „Trotzdem erzwingen“ trägt die Person dennoch ein – der Konflikt bleibt sichtbar: im Plan, unter „Offene Punkte“ und in der Ampel (rot).')),
    knoepfe: [{ text: 'Abbrechen', wert: false, art: 'primaer' }, { text: 'Trotzdem erzwingen', wert: true, art: 'gefahr' }] });
  return ok ? { erzwungen: true } : null;
}
// Zuweisung aus der Ressourcenleiste (und aus den Menüs): prüft wie die Berechnung und führt aus (oder fragt bei ✕ bzw. hartem Konflikt nach)
async function ressourceZuweisen(e, p, x, rolle, umfang) {
  const { M } = modell(), l = lehrerVon(x.id), name = (l.kuerzel || l.name) + ' → ' + evName(M, e);
  const fn = umfang === 'alle' ? unterrichtErsatzFn(e, p, x.id, rolle) : blockErsatzFn(e, p, x.id, rolle);
  const r = await zuweisungBestaetigen(e, p, x, rolle, umfang, fn, name);
  if (!r) return;
  const neu = r.erzwungen ? [1] : [];
  aendern((rolle === 'co' ? 'Co-Lehrkraft' : 'Lehrkraft') + (umfang === 'alle' ? ' für alle Stunden: ' : ' für diesen Termin: ') + name + (neu.length ? ' (erzwungen)' : ''), fn, { normalisieren: true });
  APP.editor.sel = -1; // die Nummern der Blöcke können sich geändert haben
  requestAnimationFrame(() => { const c = modell(); const uid = M.U[(M.E[e].parts[p] || M.E[e].parts[0]).u].id, ui = c.M.uI.get(uid); if (ui === undefined) return; const b = (M.E[e].parts[p] || M.E[e].parts[0]).b; const e2 = c.M.uEv[ui][b]; if (e2 !== undefined) { APP.editor.sel = e2; APP.editor.selP = c.M.E[e2].parts.findIndex(pt => pt.u === ui); document.querySelectorAll('.kachel[data-e="' + e2 + '"]').forEach(n => n.classList.add('ausgewaehlt')); blitzKachel(e2); ressourcenAuffrischen(); } });
}
function ressourcenBox() {
  const E = APP.editor, d = APP.daten;
  const box = h('div', { class: 'karte ressourcen', id: 'ressourcenBox' });
  const kopf = h('h3', {}, 'Ressourcen für diesen Termin');
  if (!d.plan.platzierungen.length) { box.append(kopf, h('p', { class: 'muted klein', style: { margin: 0 } }, 'Noch kein Plan – zuerst „Plan berechnen“.')); return box; }
  const { M, P } = modell();
  // ---- leerer Slot: Was könnte hier liegen? ----
  if ((E.sel === undefined || E.sel < 0 || E.sel >= M.E.length) && E.slot >= 0 && E.slot < M.S) {
    const rolle = E.slotRolle || 'a', view = rolle === 'b' ? { art: E.art2, id: E.id2, woche: E.woche2 } : { art: E.art, id: E.id, woche: E.woche };
    const x = ansichtIndex(M, view.art, view.id);
    const offen = [];
    for (let e = 0; e < M.E.length; e++) {
      if (P.start[e] >= 0) continue; const ev = M.E[e];
      if (view.art === 'klasse' ? !ev.klassen.includes(x) : view.art === 'lehrer' ? !ev.lehrer.includes(x) : !ev.parts.some(pt => (pt.cands || []).includes(x))) continue;
      offen.push({ e, st: zielStatus(e, E.slot, view) });
    }
    const rang = { ok: 0, weich: 1, hart: 2 };
    offen.sort((a, b) => rang[a.st.st] - rang[b.st.st] || a.e - b.e);
    box.append(h('h3', {}, (TAGE_LANG[d.schule.tage[Math.floor(E.slot / M.H)]] || '') + ' · ' + (M.pause[E.slot % M.H] ? 'Pause' : M.lnr[E.slot % M.H] + '. Stunde')),
      h('p', { class: 'muted klein', style: { margin: '0 0 6px' } }, 'Mögliche noch offene Unterrichte für ' + (view.art === 'klasse' ? 'Klasse ' : view.art === 'lehrer' ? '' : 'Raum ') + ((ansichtListe(view.art).find(o => o[0] === view.id) || [])[1] || '') + ' – Klick setzt die Stunde hierher.'),
      offen.length ? h('ul', { class: 'resliste', 'data-res': 'slot' }, offen.map(o => h('li', { class: 'res ' + ({ ok: 'ok', weich: 'warn', hart: 'nein' })[o.st.st] },
        h('button', { class: 'resknopf', disabled: o.st.st === 'hart', title: o.st.text, onclick: () => zugAusfuehren(o.e, E.slot, view) }, h('span', { class: 'rsym' }, o.st.st === 'ok' ? '✓' : o.st.st === 'weich' ? '⚠' : '✕'), h('span', { class: 'rname' }, evName(M, o.e).replace(/ \(Block \d+\)/, '')), h('span', { class: 'rgrund' }, o.st.st === 'ok' ? '' : o.st.text.replace(/^möglich, /, ''))))))
        : h('p', { class: 'klein', style: { margin: 0 } }, 'In der Ablage liegt für diese Ansicht nichts. Eine platzierte Stunde lässt sich hierher ziehen (oder Taste V).'));
    return box;
  }
  if (E.sel === undefined || E.sel < 0 || E.sel >= M.E.length) { box.append(kopf, h('p', { class: 'muted klein', style: { margin: 0 } }, 'Eine Stunde im Plan anklicken: Die Leiste zeigt, welche Lehrkräfte, Co-Lehrkräfte und Räume für genau diesen Termin verfügbar sind – und warum die anderen nicht. Ein leeres Feld anklicken: was dort liegen könnte.')); return box; }
  const e = E.sel, ev = M.E[e];
  if (ev.aufgabe) { box.append(kopf, h('p', { class: 'klein', style: { margin: 0 } }, h('b', {}, evName(M, e)), ' – Aufgaben haben eine feste Person; Ändern über „Aufgaben“ oder das Menü der Kachel.')); return box; }
  if (P.start[e] < 0) { box.append(kopf, h('p', { class: 'klein', style: { margin: 0 } }, h('b', {}, evName(M, e)), ' liegt in der Ablage. Ein leeres Feld im Plan anklicken zeigt, ob die Stunde dort liegen kann.')); return box; }
  let res;
  try { res = ressourcen(e); } catch (err) { console.error(err); box.append(kopf, h('p', { class: 'fehlertext klein' }, 'Die Ressourcen konnten nicht ermittelt werden: ' + err.message)); return box; }
  const SYM = { ok: '✓', warn: '⚠', nein: '✕' };
  const pAkt = Math.min(Math.max(0, E.selP || 0), res.teile.length - 1), teil = res.teile[pAkt];
  box.append(...[kopf,
    h('div', { class: 'reskopf' }, h('b', {}, res.name.replace(/ \(Block \d+\)/, '')), h('div', { class: 'klein muted' }, slotText(M, res.s) + (M.pause[res.s % M.H] ? '' : ' Std.') + (res.zeit ? ' · ' + res.zeit + ' Uhr' : '') + (res.dauer > 1 ? ' · ' + res.dauer + ' UStd. am Stück' : '')),
      h('div', { class: 'klein' }, h('span', { class: 'badge ' + (res.wochen.length === 2 ? 'neutral' : 'warn'), title: 'Geprüft wird genau für diese Woche(n)' }, 'geprüft: ' + res.wochenText))),
    res.band ? h('div', { class: 'hinweis ' + (res.band.planbar ? 'ok' : 'err') + ' klein resband', 'data-res': 'band' }, h('b', {}, res.band.name + ': '), res.band.text,
      h('div', { style: { marginTop: '4px' } }, res.teile.map((t, i) => h('div', {}, h('button', { class: 'btn klein' + (i === pAkt ? ' aktiv' : ''), style: { margin: '2px 4px 2px 0' }, onclick: () => { E.selP = i; ressourcenAuffrischen(); } }, t.name), h('span', { class: t.lehrerOk ? '' : 'fehlertext' }, (t.lehrerOk ? '✓ ' : '✕ ') + t.lehrerText), ' · ', h('span', { class: t.raumOk ? '' : 'fehlertext' }, (t.raumOk ? '✓ ' : '✕ ') + t.raumText))))) : null].filter(Boolean));
  const zeile = (x, rolle) => {
    const aktionen = x.aktuell ? [] : [
      { text: 'Nur diesen Termin übernehmen', tun: () => ressourceZuweisen(e, pAkt, x, rolle, 'block') },
      { text: (rolle === 'co' ? 'Als Co-Lehrkraft' : 'Als Fachlehrkraft') + ' für alle Stunden einsetzen' + (x.alle ? '' : ' (nicht in allen Stunden frei)'), aus: !x.alle && x.st !== 'nein', tun: () => ressourceZuweisen(e, pAkt, x, rolle, 'alle') }];
    const text = x.gruende.concat(x.folgen).join(' · ');
    const info = x.aktuell ? lkImTermin(e, x.id) : null; // eingesetzt: Klick bietet das Herausnehmen an (auch automatisch geplante)
    return h('li', { class: 'res ' + x.st + (x.aktuell ? ' aktuell' : '') },
      h('button', { class: 'resknopf', disabled: x.aktuell && !info, title: x.name + (text ? ' – ' + text : '') + (x.aktuell ? ' (eingesetzt' + (info && info.auto ? ', automatisch geplant' : '') + ')' + (info ? ' – Klick: herausnehmen …' : '') : x.st === 'nein' ? ' – Klick: trotzdem erzwingen …' : ' – Klick: zuweisen'),
        onclick: ev2 => { const r = ev2.currentTarget.getBoundingClientRect(); if (x.aktuell) lkEntfernenMenue(e, x.id, r.left, r.bottom); else if (x.st === 'nein') ressourceZuweisen(e, pAkt, x, rolle, 'block'); else menueZeigen(r.left, r.bottom, [{ titel: x.kuerzel + ' – ' + x.name }].concat(aktionen)); } },
        h('span', { class: 'rsym' }, x.aktuell ? '●' : SYM[x.st]), h('span', { class: 'rname' }, x.kuerzel + (x.name && x.name !== x.kuerzel ? ' – ' + x.name : '')),
        h('span', { class: 'rrang' }, x.aktuell ? 'eingesetzt' + (info && info.auto ? ' · automatisch' : '') : x.rangText + (x.coKraft ? ' · Co-Kraft' : '')),
        text ? h('span', { class: 'rgrund' }, text) : null));
  };
  const abschnitt = (was, titel, liste, rolle, leer) => {
    const da = liste.filter(x => x.aktuell || x.st !== 'nein'), weg = liste.filter(x => !x.aktuell && x.st === 'nein');
    return h('div', { class: 'resabschnitt', 'data-res': was }, h('h4', {}, titel, h('span', { class: 'muted klein' }, ' ' + da.filter(x => !x.aktuell).length + ' verfügbar')),
      da.length ? h('ul', { class: 'resliste' }, da.map(x => zeile(x, rolle))) : h('p', { class: 'klein fehlertext', style: { margin: '0 0 4px' } }, leer),
      weg.length ? h('details', { open: E.resFokus === was && !da.some(x => !x.aktuell) ? true : null }, h('summary', { class: 'klein' }, 'Derzeit nicht verfügbar (' + weg.length + ')'), h('ul', { class: 'resliste' }, weg.map(x => zeile(x, rolle)))) : null);
  };
  box.append(abschnitt('lehrer', 'Fachlehrkräfte', teil.lehrer, 'fach', 'Für diesen Termin ist keine Fachlehrkraft verfügbar.'));
  if (teil.ohne && teil.ohne.length) box.append(h('p', { class: 'klein muted', style: { margin: '0 0 6px' } }, 'Für diesen Termin herausgenommen: ' + teil.ohne.map(o => o.kuerzel).join(', ') + ' – als ✓/⚠ gelistet, wenn sie wieder eingesetzt werden können.'));
  if (teil.braucht.co || E.resCo) box.append(abschnitt('co', 'Co-Lehrkräfte', teil.co, 'co', 'Für diesen Termin ist keine Co-Lehrkraft verfügbar.'));
  else box.append(h('div', { class: 'resabschnitt', 'data-res': 'co' }, h('button', { class: 'btn klein', onclick: () => { E.resCo = true; ressourcenAuffrischen(); } }, '+ Co-Lehrkräfte anzeigen'), h('span', { class: 'muted klein' }, ' kein Co-Bedarf')));
  if (teil.braucht.raum) {
    const da = teil.raeume.filter(x => x.aktuell || x.st !== 'nein'), weg = teil.raeume.filter(x => !x.aktuell && x.st === 'nein');
    const rz = x => h('li', { class: 'res ' + x.st + (x.aktuell ? ' aktuell' : '') }, h('button', { class: 'resknopf', disabled: x.aktuell || x.st === 'nein', title: x.name + ' (' + x.typ + ', ' + x.plaetze + ' Plätze)' + (x.gruende.concat(x.folgen).length ? ' – ' + x.gruende.concat(x.folgen).join(' · ') : '') + (x.aktuell ? ' (aktueller Raum)' : x.st === 'nein' ? '' : ' – Klick: Raum für diesen Termin zuweisen'), onclick: () => raumSetzen(e, pAkt, x.id) },
      h('span', { class: 'rsym' }, x.aktuell ? '●' : SYM[x.st]), h('span', { class: 'rname' }, x.name), h('span', { class: 'rrang' }, x.aktuell ? 'aktueller Raum' : x.st === 'ok' ? 'passend' : ''), x.gruende.concat(x.folgen).length ? h('span', { class: 'rgrund' }, x.gruende.concat(x.folgen).join(' · ')) : null));
    box.append(h('div', { class: 'resabschnitt', 'data-res': 'raum' }, h('h4', {}, 'Räume', h('span', { class: 'muted klein' }, ' ' + da.filter(x => !x.aktuell).length + ' verfügbar')),
      da.length ? h('ul', { class: 'resliste' }, da.map(rz)) : h('p', { class: 'klein fehlertext', style: { margin: '0 0 4px' } }, 'Kein passender Raum frei.'),
      weg.length ? h('details', { open: E.resFokus === 'raum' && !da.some(x => !x.aktuell) ? true : null }, h('summary', { class: 'klein' }, 'Nicht verfügbar (' + weg.length + ')'), h('ul', { class: 'resliste' }, weg.map(rz))) : null));
  }
  box.append(h('p', { class: 'muted klein', style: { margin: '6px 0 0' } }, '✓ verfügbar · ⚠ möglich, mit Nachteilen · ✕ nicht verfügbar. Geprüft wird der ganze Block in echten Uhrzeiten – mit denselben Regeln wie bei der Berechnung.'));
  return box;
}
function zuordnenBox() {
  const E = APP.editor, d = APP.daten;
  const tab = E.palette || 'lehrer';
  const q = (E.paletteFilter || '').trim().toLowerCase();
  const liste = h('div', { class: 'palette' });
  if (tab === 'lehrer') {
    // Im Klassenplan steht das Klassenteam der angezeigten Klasse vorn
    const kl = E.art === 'klasse' && E.id ? [E.id] : [];
    const team = teamVon(kl);
    const chip = l => {
      const c = h('span', { class: 'pchip' + (l.ausgebildet === false ? ' co' : '') + (team.has(l.id) ? ' team' : ''), title: (l.name || '') + (l.ausgebildet === false ? ' (' + artText(l) + ')' : '') + (team.has(l.id) ? ' – ' + teamTitel(kl) : '') + ' – auf eine Stunde ziehen' }, l.kuerzel || l.name || '?');
      ziehbar(c, { typ: 'lehrer', id: l.id }); return c;
    };
    const L = lehrerAlphabetisch(d.lehrer).filter(l => !q || ((l.kuerzel || '') + ' ' + (l.name || '')).toLowerCase().includes(q));
    const tL = L.filter(l => team.has(l.id));
    if (tL.length) {
      liste.append(h('div', { class: 'pgruppe' }, teamTitel(kl)));
      tL.forEach(l => liste.append(chip(l)));
      liste.append(h('div', { class: 'pgruppe' }, 'Weitere'));
    }
    L.filter(l => !team.has(l.id)).forEach(l => liste.append(chip(l)));
  }
  else raeumeAlphabetisch(d.raeume).filter(r => !q || ((r.name || '') + ' ' + r.typ).toLowerCase().includes(q)).forEach(r => {
    const c = h('span', { class: 'pchip raum', title: r.name + ' (' + r.typ + ', ' + r.kapazitaet + ' Plätze) – auf eine Stunde ziehen' }, r.name || '?');
    ziehbar(c, { typ: 'raum', id: r.id }); liste.append(c);
  });
  const filter = h('input', { type: 'search', placeholder: 'Filtern …', value: E.paletteFilter || '', 'aria-label': 'Liste filtern', style: { width: '100%', marginBottom: '6px' }, oninput: ev => { E.paletteFilter = ev.target.value; const neu = zuordnenBox(); box.replaceWith(neu); neu.querySelector('input[type=search]').focus(); } });
  const box = h('div', { class: 'karte' }, h('h3', {}, 'Ziehen & zuordnen'),
    h('div', { class: 'zeile eng', style: { marginBottom: '6px' } }, [['lehrer', 'Lehrkräfte'], ['raum', 'Räume']].map(([k, t]) => h('button', { class: 'btn klein' + (tab === k ? ' aktiv' : ''), 'aria-pressed': tab === k ? 'true' : 'false', onclick: () => { E.palette = k; E.paletteFilter = ''; render(); } }, t))),
    h('p', { class: 'muted klein', style: { margin: '0 0 6px' } }, tab === 'lehrer' ? 'Auf eine Stunde ziehen: nur diese Stunde übernehmen oder als Fach- bzw. Co-Lehrkraft für alle Blöcke des Kurses einsetzen. Auf eine Stunde, in der die Person schon steht (auch automatisch geplant): herausnehmen.' : 'Auf eine Stunde ziehen: Raum für diesen Block ändern.'),
    filter, liste);
  return box;
}
function tauschPartner(M, P, e, s, view) {
  if (!view) return -1;
  const x = ansichtIndex(M, view.art, view.id);
  const ks = kachelnFuer(M, P, view.art, x, view.woche);
  const k = ks.find(k2 => k2.e !== e && k2.start === s && M.E[k2.e].dur === M.E[e].dur);
  return k ? k.e : -1;
}
function konfliktText(M, ev, x) {
  const ex = M.E[x];
  const tt = ev.units.find(u => u < M.T && ex.lehrer.includes(u));
  const was = ex.parts.map(p => p.f >= 0 ? M.fKz[p.f] : '?').join('/');
  if (tt !== undefined) return 'Lehrkraft ' + M.lKz[tt] + ' unterrichtet dort ' + ex.klassen.map(c => M.kName[c]).join('/') + ' (' + was + ')';
  const cc = ev.klassen.find(c => ex.klassen.includes(c));
  if (cc !== undefined) return 'Klasse ' + M.kName[cc] + ' hat dort ' + was + (ex.immer.length ? ' bei ' + ex.immer.map(t => M.lKz[t]).join('/') : '');
  return 'Konflikt mit ' + evName(M, x);
}
const slotStd = (M, s) => slotText(M, s) + (M.pause[s % M.H] ? '' : ' Std.');
function statischText(M, ev, s) {
  const S = M.S, g = statischerGrund(M, ev, s, M.hart[RI.H11] === 1);
  if (g === 'H05') { for (const t of ev.immer) for (let k = 0; k < ev.dur; k++) if (M.lVerf[t * S + s + k] === 0) return 'Lehrkraft ' + M.lKz[t] + (M.lTermin && M.lTermin[t * S + s + k] ? ' hat dort einen festen Termin' : ' ist dort gesperrt'); if (ev.aufgabe) for (const t of ev.immer) for (let k = 0; k < ev.dur - 1; k++) if (M.lGap[t * S + s + k]) return 'Lehrkraft ' + M.lKz[t] + ' hat in diesem Block eine gesperrte Pause'; return 'Raum dort gesperrt'; }
  if (g === 'H11') return 'außerhalb des Stundenkorridors der Klasse';
  if (g === 'H10') { for (let k = 0; k < ev.dur; k++) { const hh = (s + k) % M.H; if (!M.pause[hh] && !M.slotOk[s + k]) return 'nach Unterrichtsschluss (' + tagName(M, Math.floor(s / M.H)) + ' bis zur ' + M.schluss[Math.floor(s / M.H)] + '. Stunde)'; } return 'Pause'; }
  if (g === 'H07') return ev.aufgabe ? 'Block reicht über das Tagesende hinaus' : ev.dur === 2 ? 'Doppelstunde darf hier nicht beginnen' : 'Blockstruktur';
  if (g === 'H06') return 'kein passender Raum';
  return REGELN[RI[g]] ? regelZitat(g) : 'nicht zulässig';
}
const weichVon = (M, tot) => { let w = 0; for (const r of M.weichIdx) w += M.gew[r] * tot[r]; return w; };
// Prüft einen Zug (Verschieben oder Tauschen) und liefert {st: 'ok'|'weich'|'hart', text}
function zielStatus(e, s, view, anwenden) {
  const { M, P } = modell();
  const ev = M.E[e], S = M.S;
  if (M.pause[s % M.H] && !ev.pauseRand) return { st: 'hart', text: 'Pause' }; // mehrstündige Aufgaben, die die Pausen mitzählen, dürfen in einer Pause beginnen
  if (ev.fixStart >= 0) return { st: 'hart', text: 'Block ist fixiert' };
  const s0 = P.start[e];
  if (s === s0) return { st: 'ok', text: 'aktuelle Position' };
  let x = tauschPartner(M, P, e, s, view);
  if (x >= 0 && s0 < 0) x = -1;
  if (x >= 0 && M.E[x].fixStart >= 0) return { st: 'hart', text: 'Tauschpartner ' + evName(M, x) + ' ist fixiert' };
  if (!M.erlaubt[e * S + s]) return { st: 'hart', text: statischText(M, ev, s) };
  if (x >= 0 && !M.erlaubt[x * S + s0]) return { st: 'hart', text: 'Tausch unmöglich: ' + evName(M, x) + ' – ' + statischText(M, M.E[x], s0) };
  const vorher = P.tot.slice();
  P.begin();
  if (x >= 0) P.entferne(x);
  P.entferne(e);
  P.konflikte(e, s);
  if (P.R.ev.length) { const t = konfliktText(M, ev, P.R.ev[0]); P.rollback(); return { st: 'hart', text: t }; }
  if (!P.platziere(e, s, false)) { P.rollback(); return { st: 'hart', text: 'kein passender Raum frei' }; }
  if (x >= 0) {
    P.konflikte(x, s0);
    if (P.R.ev.length) { const t = 'Tausch: ' + konfliktText(M, M.E[x], P.R.ev[0]); P.rollback(); return { st: 'hart', text: t }; }
    if (!P.platziere(x, s0, false)) { P.rollback(); return { st: 'hart', text: 'Tausch: kein passender Raum frei' }; }
  }
  P.commit();
  for (const r of M.hartIdx) if (r !== RI.H04 && P.tot[r] > vorher[r] + 1e-9) { const t = regelZitat(REGELN[r].id) + ' würde verletzt'; P.rollback(); return { st: 'hart', text: t }; }
  const dw = weichVon(M, P.tot) - weichVon(M, vorher);
  const schlechter = M.weichIdx.filter(r => M.gew[r] > 0 && P.tot[r] > vorher[r] + 1e-9).map(r => REGELN[r].name);
  const pre = x >= 0 ? 'Tausch mit ' + evName(M, x) + ': ' : '';
  if (anwenden) return { st: 'angewendet', tausch: x, dw };
  P.rollback();
  if (dw > 1e-9) return { st: 'weich', text: pre + 'möglich, +' + zahlDe(dw, 1) + ' Strafpunkte (' + schlechter.join(', ') + ')' };
  return { st: 'ok', text: pre + 'frei und regelkonform' + (dw < -1e-9 ? ', ' + zahlDe(dw, 1) + ' Strafpunkte' : '') };
}
function planUebernehmen(beschr) {
  const { P } = APP.cache;
  const vorher = JSON.stringify(APP.daten);
  APP.daten.plan.platzierungen = P.exportiere();
  try { dienstAuto(APP.daten); } catch (err) { console.error(err); }
  APP.undo.push({ d: vorher, b: beschr }); if (APP.undo.length > 60) APP.undo.shift();
  APP.redo.length = 0;
  nachAenderung({ nurPlan: true });
}
function zugAusfuehren(e, s, view) {
  const { M } = modell();
  const r = zielStatus(e, s, view, true);
  if (r.st === 'hart') { toast('Nicht möglich: ' + r.text, 'err', 6000); return; }
  const name = evName(M, e);
  planUebernehmen((r.tausch >= 0 ? 'Getauscht: ' : 'Verschoben: ') + name + ' → ' + slotText(M, s));
  APP.editor.sel = e;
  requestAnimationFrame(() => blitzKachel(e));
}
/* ---------------- Zug trotz hartem Verstoß (erzwingen) ---------------- */
// Untersucht einen Zug, den zielStatus als „hart“ ablehnt. Arbeitet auf einem eigenen Modell, damit nichts am angezeigten Plan hängt.
function erzwingenAnalyse(e, s, view) {
  const { M, P } = planAusDaten(APP.daten);
  const ev = M.E[e], S = M.S, H = M.H, hh = s % H, s0 = P.start[e];
  const a = { M, P, e, s, s0, x: -1, unmoeglich: '', statisch: '', statischX: '', opfer: [], opferX: [], fix: [], fixX: [] };
  if ((M.pause[hh] && !ev.pauseRand) || hh + ev.dur > H || (!ev.aufgabe && ev.dur === 2 && M.pause[hh + 1]) || (ev.aufgabe && !ev.pauseRand && M.pause[hh + ev.dur - 1])) { a.unmoeglich = ev.aufgabe ? (hh + ev.dur > H ? 'Der Aufgabenblock würde über das Tagesende hinausreichen.' : 'Dieser Aufgabenblock kann nicht in einer Pausenzeile beginnen oder enden: Das geht nur für Blöcke über mehrere Zeilen, deren Aufgabe die Pausen als Arbeitszeit mitzählt.') : 'In einer Pausenzeile oder über das Tagesende hinaus kann kein Block liegen.'; return a; }
  if (ev.fixStart >= 0) { a.unmoeglich = 'Der Block ist fixiert – zuerst lösen (Taste L bzw. im Unterrichtsdialog).'; return a; }
  let x = tauschPartner(M, P, e, s, view); if (x >= 0 && s0 < 0) x = -1;
  if (x >= 0 && M.E[x].fixStart >= 0) { a.unmoeglich = 'Der Tauschpartner ' + evName(M, x) + ' ist fixiert – zuerst lösen.'; return a; }
  a.x = x;
  if (!M.erlaubt[e * S + s]) a.statisch = statischText(M, ev, s);
  if (x >= 0 && !M.erlaubt[x * S + s0]) a.statischX = statischText(M, M.E[x], s0);
  // Wer liegt im Weg? (Lehrkraft, Klasse oder Gruppe zur selben Zeit; ohne den Tauschpartner)
  const weg = (ee, ss, ohne) => {
    const merk = [ee].concat(ohne).filter(q => q >= 0 && P.start[q] >= 0).map(q => ({ q, s: P.start[q], r: Array.from(P.raum.subarray(P.rOff[q], P.rOff[q + 1])), c: Array.from(P.co.subarray(P.cOff[q], P.cOff[q + 1])) }));
    merk.forEach(m => { P._belege(m.q, -1); P.start[m.q] = -1; });
    P.konflikte(ee, ss);
    const out = P.R.ev.slice();
    merk.forEach(m => { P.start[m.q] = m.s; P._belege(m.q, 1); });
    return out;
  };
  const alle = weg(e, s, [x]);
  a.opfer = alle.filter(q => M.E[q].fixStart < 0); a.fix = alle.filter(q => M.E[q].fixStart >= 0);
  if (x >= 0) { const ax = weg(x, s0, [e]).filter(q => q !== e); a.opferX = ax.filter(q => M.E[q].fixStart < 0); a.fixX = ax.filter(q => M.E[q].fixStart >= 0); }
  return a;
}
// Führt den erzwungenen Zug auf dem Arbeitsmodell aus und liefert die neuen Platzierungen.
// modus 'loesen': Blöcke im Weg wandern in die Ablage, die verschobenen Blöcke werden fixiert (🔒) – die Berechnung repariert danach.
// modus 'nur': der Zug wird ausgeführt, Überschneidungen bleiben als harte Verstöße stehen.
function erzwingenPlatzierungen(a, modus) {
  const { M, P, e, s, s0, x } = a;
  const raus = q => { if (q < 0 || P.start[q] < 0) return; P._belege(q, -1); P.start[q] = -1; for (let i = P.rOff[q]; i < P.rOff[q + 1]; i++) P.raum[i] = -1; for (let i = P.cOff[q]; i < P.cOff[q + 1]; i++) P.co[i] = 0; };
  const alt = q => Array.from(P.raum.subarray(P.rOff[q], P.rOff[q + 1]));
  const raeumeFuer = (q, ss, wunsch) => M.E[q].parts.map((part, p) => {
    if (!part.cands) return -1;
    const ev = M.E[q], frei = c => P.raumFrei(c, ss, ev.dur, ev.wochen);
    if (wunsch[p] >= 0 && part.cands.includes(wunsch[p]) && frei(wunsch[p])) return wunsch[p];
    const f = part.cands.find(frei); if (f !== undefined) return f;
    if (modus !== 'loesen') return wunsch[p] >= 0 ? wunsch[p] : -1;
    // kein Raum frei: den Raum mit den wenigsten (nicht fixierten) Belegern frei räumen
    let best = -1, bo = null;
    for (const c of part.cands) { const o = P._raumBelegerFuer(c, ss, q); if (o.some(y => M.E[y].fixStart >= 0)) continue; if (!bo || o.length < bo.length) { best = c; bo = o; } }
    if (best >= 0) bo.forEach(raus);
    return best;
  });
  const rE = alt(e), rX = x >= 0 ? alt(x) : [];
  raus(e); raus(x);
  if (modus === 'loesen') a.opfer.forEach(raus);
  P.setzeRoh(e, s, raeumeFuer(e, s, rE), null);
  let xGesetzt = false;
  if (x >= 0 && (modus !== 'loesen' || !a.fixX.length)) { if (modus === 'loesen') a.opferX.forEach(raus); P.setzeRoh(x, s0, raeumeFuer(x, s0, rX), null); xGesetzt = true; }
  if (modus === 'loesen') { P.gesperrt[e] = 1; if (xGesetzt) P.gesperrt[x] = 1; }
  // anteilige Co-Lehrkräfte der betroffenen Kurse neu einteilen
  P.initKosten();
  const us = new Set(); [e, x].forEach(q => { if (q >= 0) M.E[q].parts.forEach(pt => { if (M.U[pt.u].coZiel.length) us.add(pt.u); }); });
  if (us.size) { P.begin(); us.forEach(u => P.coNeu(u)); P.commit(); }
  return { platzierungen: P.exportiere(), xGesetzt };
}
async function erzwingenDialog(e, s, view, grund) {
  if (APP.rechnung.laeuft) { toast('Nicht möglich: ' + grund + ' (während der Berechnung lässt sich kein Zug erzwingen)', 'err', 6000); return; }
  const a = erzwingenAnalyse(e, s, view), M = a.M;
  if (a.unmoeglich) { toast('Nicht möglich: ' + grund + ' – ' + a.unmoeglich, 'err', 7000); return; }
  const name = evName(M, e), tausch = a.x >= 0;
  const namen = l => l.slice(0, 6).map(q => evName(M, q)).join(', ') + (l.length > 6 ? ' und ' + (l.length - 6) + ' weitere' : '');
  const kannLoesen = !a.fix.length;
  // Arbeitszeitgrenze (H16): kein Platzkonflikt – üblich ist, die Stunde bewusst von Hand zu setzen und den Verstoß stehen zu lassen
  const nurGrenze = grund === regelZitat('H16') + ' würde verletzt' && !a.opfer.length && !a.opferX.length && !a.statisch && !a.statischX;
  let modus = kannLoesen && !nurGrenze ? 'loesen' : 'nur';
  const wahl = (wert, titel, text, aus) => h('label', { class: 'check erzwingwahl' + (aus ? ' muted' : ''), style: { alignItems: 'flex-start', marginBottom: '8px' } },
    h('input', { type: 'radio', name: 'erzwingen', value: wert, checked: modus === wert, disabled: !!aus, onchange: () => { modus = wert; } }), h('span', {}, h('b', {}, titel), h('br'), h('span', { class: 'klein' }, text)));
  const opferAlle = a.opfer.concat(a.opferX.filter(q => !a.opfer.includes(q)));
  const inhalt = h('div', {},
    h('p', {}, h('b', {}, name), tausch ? [' soll mit ', h('b', {}, evName(M, a.x)), ' tauschen (', slotText(M, s) + ' Std. ↔ ' + slotText(M, a.s0) + ' Std.).'] : [' soll auf ', h('b', {}, slotText(M, s) + ' Std.'), ' liegen.']),
    h('div', { class: 'hinweis err' }, 'Das verletzt eine harte Regel: ' + grund),
    nurGrenze ? h('div', { class: 'hinweis', style: { marginTop: '6px' } }, 'Die Stunde überschreitet eine Arbeitszeitgrenze der Lehrkraft (Wochenarbeitszeit oder Höchstarbeitszeit je Tag). Von Hand ist das erlaubt – der Verstoß bleibt sichtbar. Beim Neulösen würde die Berechnung dafür andere Stunden der Person aus dem Plan nehmen, bis die Grenze wieder eingehalten ist.') : null,
    h('div', { style: { marginTop: '12px' } },
      wahl('loesen', (tausch ? 'Tauschen' : 'Verschieben') + ' und neu lösen',
        (tausch ? 'Beide Stunden werden getauscht und an ihrem neuen Platz fixiert.' : 'Die Stunde wird an die gewünschte Stelle gesetzt und dort fixiert.') + ' ' + (opferAlle.length ? 'Im Weg ' + (opferAlle.length === 1 ? 'liegt' : 'liegen') + ': ' + namen(opferAlle) + ' – dafür sucht die Berechnung neue Plätze' : 'Die Berechnung löst die Folgen auf') + ' und ändert am übrigen Plan möglichst wenig.' + (a.fix.length ? ' Nicht möglich: Am Ziel liegt ein fixierter Block (' + namen(a.fix) + ') – zuerst lösen.' : '') + (tausch && a.fixX.length ? ' ' + evName(M, a.x) + ' kann nicht auf den alten Platz (dort liegt fixiert: ' + namen(a.fixX) + ') und bekommt einen neuen.' : ''), !kannLoesen),
      wahl('nur', (tausch ? 'Nur tauschen' : 'Nur verschieben') + ' – der Verstoß bleibt stehen', 'Der Zug wird ausgeführt, sonst ändert sich nichts. Der harte Verstoß erscheint rot im Plan und in der Auswertung, z. B. um von Hand weiterzutauschen.')),
    a.statisch || a.statischX ? h('div', { class: 'hinweis warn', style: { marginTop: '6px' } }, 'Achtung: Dieser Verstoß hängt an der Stunde selbst (' + [a.statisch, a.statischX].filter(Boolean).join('; ') + '). Er bleibt auch nach dem Neulösen bestehen, solange die Stunde dort liegt.') : null,
    h('p', { class: 'muted klein', style: { marginTop: '10px' } }, 'Beides lässt sich mit Strg+Z zurücknehmen (nach dem Neulösen zweimal: erst die Berechnung, dann der Zug). Fixierte Stunden (Schloss an der Kachel) löst die Taste L.'));
  const ok = await dialog({ titel: tausch ? 'Trotzdem tauschen?' : 'Trotzdem verschieben?', breite: '640px', inhalt, knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'Ausführen', wert: true, art: 'primaer' }] });
  if (!ok) return;
  const r = erzwingenPlatzierungen(a, modus);
  const beschr = (tausch ? 'Erzwungen getauscht: ' : 'Erzwungen verschoben: ') + name + ' → ' + slotText(M, s);
  APP.erzwungenMarke = APP.undo.length; // Stand vor dem erzwungenen Zug (für „Zurücknehmen“ nach dem Neulösen)
  aendern(beschr, d => { d.plan.platzierungen = r.platzierungen; });
  APP.editor.sel = e;
  if (modus === 'loesen') {
    toast('Zug ausgeführt – die Berechnung sucht jetzt eine neue Lösung …', '', 5000);
    rechnungStart({ startwert: 'aktuell', minimal: true, reparatur: true, teilArt: '', teilId: '', iterLimit: 0, zeitlimit: Math.min(Math.max(Number(rechnungKonf().zeitlimit) || 20, 10), 20) });
  } else toast(beschr + ' – der harte Verstoß bleibt bestehen.', 'err', 7000);
}

// Das schonende Neulösen hat nicht alles aufgelöst: Wie weiter?
async function reparaturOffenDialog(m) {
  const w = await dialog({ titel: 'Keine vollständige Lösung gefunden', breite: '620px', inhalt: h('div', {},
    h('p', {}, 'Das Neulösen in der Umgebung des Zuges hat ' + m.hart + ' harte' + (m.hart === 1 ? 'n Verstoß' : ' Verstöße') + ' nicht auflösen können. Der verschobene Block liegt fixiert an der gewünschten Stelle.'),
    h('ul', { class: 'klein' },
      h('li', {}, h('b', {}, 'Ganzen Plan neu berechnen: '), 'Die normale Berechnung darf alles umstellen (außer fixierten Stunden) und findet meist eine Lösung – der Plan kann sich dabei stark ändern.'),
      h('li', {}, h('b', {}, 'So lassen: '), 'Die Verstöße stehen rot im Plan und unter „Offene Punkte“; von Hand weiterarbeiten.'),
      h('li', {}, h('b', {}, 'Zurücknehmen: '), 'Zug und Neulösen werden rückgängig gemacht.'))),
    knoepfe: [{ text: 'Zurücknehmen', wert: 'zurueck' }, { text: 'So lassen', wert: 'lassen' }, { text: 'Ganzen Plan neu berechnen', wert: 'neu', art: 'primaer' }] });
  if (w === 'zurueck') { const marke = APP.erzwungenMarke; if (typeof marke === 'number' && marke < APP.undo.length) { let n = 0; while (APP.undo.length > marke && n++ < 10) rueckgaengig(); } else rueckgaengig(); toast('Zug und Neulösen zurückgenommen.', 'ok'); }
  else if (w === 'neu') rechnungStart({ startwert: 'aktuell', minimal: true, teilArt: '', teilId: '' });
  else if (APP.meta.offenNachRechnung === true) offenePunkteDialog(true);
}
function hartText(n) { return n === 1 ? '1 harter Fehler' : n + ' harte Fehler'; }
// Zahl der harten Fehler des aktuellen Gesamtplans – ausschließlich aus der zentralen Endvalidierung (planStatus: Unterricht, Personal, Co,
// Aufsichten, Springer, Ausschlüsse, Arbeitszeit, Fixierungen). Die Regelverstöße des Stundenplans (H01–H16) sind eine Teilmenge davon.
function hartEnd() { if (!APP.daten.plan.platzierungen.length) return 0; try { const st = planAmpel(); if (st && st.ampel !== 'leer' && st.hart !== undefined) return st.hart; } catch (err) { console.error(err); } return modell().bewertung.k.hart; }
