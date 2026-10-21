// ---------- Kontext für Bewertung und Planung ----------
// opt: { ohne: Set(Aufsichts-IDs, die nicht mitzählen), plan: abweichende Aufsichtsliste }
function dienstKontext(d, opt) {
  opt = opt || {};
  const D = d.schule.tage.length, DI = d.dienste, R = DI.regeln;
  const ohne = opt.ohne instanceof Set ? opt.ohne : new Set(opt.ohne ? [opt.ohne] : []);
  const idx = belegungsIndex(d, { ohneDienste: true });
  const az = arbeitszeiten(d, { ohneDienste: true });
  const azMap = new Map(az.liste.map(x => [x.lehrer, x]));
  const tagE = tagesEinsatz(d, idx); // Einsatzzeit je Tag ohne Aufsichten
  const typen = new Map(DIENSTTYPEN.map(t => [t.id, t])), bereiche = new Map(DI.bereiche.map(b => [b.id, b]));
  const ctx = { d, D, R, G: R.gewichte, typen, bereiche, fg: minVon(R.fruehGrenze), sg: minVon(R.spaetGrenze), personen: [], pI: new Map(), alle: [], stabil: null, grenzen: !(d.regeln && d.regeln.hartUmschaltbar && d.regeln.hartUmschaltbar.H16 === 'weich') };
  d.lehrer.forEach((l, i) => {
    const a = idx.get(l.id);
    const x = azMap.get(l.id);
    const p = { l, i, id: l.id, basis: [], praesenz: [], fenster: [], dienste: [], rest: x ? x.soll - x.summe : 0, soll: x ? x.soll : 0, tagMax: Math.round((l.maxArbeitTag || 0) * 60), tagBasis: tagE.get(l.id) || new Float64Array(D) };
    for (let t = 0; t < D; t++) {
      const liste = a ? a[t] : [];
      p.basis.push(liste.filter(b => !b.alt));
      p.praesenz.push(intervalleVereinigen(liste.filter(b => PRAESENZ_ARTEN.has(b.art))));
      p.fenster.push(dienstFenster(l, t, d.schule));
    }
    ctx.personen.push(p); ctx.pI.set(l.id, p);
  });
  (opt.plan || DI.plan).forEach(x => { if (!ohne.has(x.id)) dienstEintragen(ctx, schichtAusDienst(ctx, x), x.lehrer); });
  return ctx;
}
// Interne Form eines Dienstes/einer Schicht
function schichtAusDienst(ctx, x) {
  const iv = dienstIntervall(x) || { start: 0, end: 0 };
  const m = dienstMeta(ctx.d, x, iv);
  const rh = x.rhythmus || { art: 'woechentlich' };
  return { id: x.id, tag: x.tag, start: iv.start, end: iv.end, typ: x.typ || 'dt_dienst', bereich: x.bereich || null, bedarf: x.bedarf || null, name: m.name,
    kat: m.kat, qualifikation: m.qualifikation, ausschlussPersonen: m.ausschlussPersonen || [], ausschlussGruppen: m.ausschlussGruppen || [],
    wochen: dienstWochen(rh), faktor: dienstFaktor(rh), selten: rh.art === 'monatlich' || rh.art === 'einzel', rotation: rh.art === 'rotation' ? rh.personen : null,
    springer: m.springer, zaehlt: m.arbeitszeit && (!m.springer || ctx.R.springerAnrechnen), fixiert: !!x.fixiert, quelle: x.quelle || 'manuell', neu: false };
}
function dienstEintragen(ctx, s, lid) {
  const p = ctx.pI.get(lid);
  s.lehrer = lid;
  if (p) p.dienste.push(s);
  ctx.alle.push(s);
  if (s.rotation) s.rotation.forEach(pid => { if (pid === lid) return; const q = ctx.pI.get(pid); if (q) q.dienste.push(Object.assign({}, s, { lehrer: pid, nurBlock: true })); });
}
function dienstAustragen(ctx, s) {
  const p = ctx.pI.get(s.lehrer);
  if (p) { const i = p.dienste.indexOf(s); if (i >= 0) p.dienste.splice(i, 1); }
  const j = ctx.alle.indexOf(s); if (j >= 0) ctx.alle.splice(j, 1);
}
const KAT_TEXT = { fruehdienst: 'Frühaufsicht', spaetdienst: 'Spätaufsicht' };
// Früh-/Spätaufsichten zählen je Tag (zwei aneinandergrenzende Stücke am selben Tag sind ein Dienst); Rotationen anteilig
function katTage(liste) {
  const je = new Map();
  liste.forEach(x => { const f = x.nurBlock ? (x.rotation && x.rotation.length ? 1 / x.rotation.length : 1) : x.faktor; je.set(x.tag, Math.max(je.get(x.tag) || 0, f)); });
  let n = 0; je.forEach(v => { n += v; });
  return { n, tage: je };
}
// Harte Gründe gegen eine Person für eine Schicht s. alle=false: nur der erste Grund (schneller).
// Zeitraum eines Springers: die Pause des Zeitrasters, in der er liegt, zusammen mit allen Abschnitten seines Bedarfs
function springerZeitraum(ctx, s) {
  const c = ctx._szr || (ctx._szr = new Map()), k = (s.bedarf || '') + '|' + s.tag + '|' + s.start + '|' + s.end;
  if (c.has(k)) return c.get(k);
  let iv = null;
  const b = s.bedarf ? (ctx.d.dienste.bedarfe || []).find(x => x.id === s.bedarf) : null;
  if (b) (b.abschnitte || []).forEach(a => { const v = intervall(a.beginn, a.ende); if (v && v.end > v.start) iv = iv ? { start: Math.min(iv.start, v.start), end: Math.max(iv.end, v.end) } : { start: v.start, end: v.end }; });
  if (!iv) iv = { start: s.start, end: s.end };
  const pl = ctx._pl || (ctx._pl = pausenListe(ctx.d.schule)), pa = pl.find(x => x.start !== null && x.end !== null && x.start < iv.end && iv.start < x.end);
  if (pa) iv = { start: Math.min(pa.start, iv.start), end: Math.max(pa.end, iv.end) };
  c.set(k, iv); return iv;
}
function dienstHartGruende(ctx, p, s, alle) {
  const out = [], l = p.l, t = ctx.typen.get(s.typ), wer = lehrerNameKurz(l);
  const add = (code, text) => { out.push({ code, text }); return !alle; };
  if (!(s.end > s.start)) { if (add('D10', 'Ende liegt nicht nach dem Beginn.')) return out; }
  if (s.tag < 0 || s.tag >= ctx.D) { if (add('D10', 'Der Tag gehört nicht zur Schulwoche.')) return out; }
  if (l.aufsicht === false) { if (add('D05', wer + ' ist von Aufsichten ausgenommen.')) return out; }
  if ((s.ausschlussPersonen || []).includes(l.id)) { if (add('D05', wer + ': für diesen Zeitabschnitt ausdrücklich ausgeschlossen.')) return out; }
  { const g = (s.ausschlussGruppen || []).find(id => personInDienstGruppe(ctx.d, l, id)); if (g) { const n = (dienstGruppenOptionen(ctx.d).find(x => x[0] === g) || [null, g])[1]; if (add('D05', wer + ': Personengruppe „' + n + '“ ist für diesen Zeitabschnitt ausgeschlossen.')) return out; } }
  { const aus = dienstAusgeschlossen(ctx.d, l, s.typ, s.tag, s.start, s.end, s.bereich); if (aus) { if (add('D05', wer + ': ' + aus + '.')) return out; } }
  const f = p.fenster[s.tag];
  if (f && f.abwesend) { if (add('D02', wer + ': ' + f.grund + '.')) return out; }
  // Früh-/Spätwünsche und aufsichtsspezifische Wunschfenster sind bewusst weich: Unterricht und echte Abwesenheit bleiben hart,
  // notwendige Aufsichten dürfen aber nicht wegen persönlicher Komfortwünsche offen bleiben.

  if (s.qualifikation && !(l.qualifikationen || []).includes(s.qualifikation)) { if (add('D07', wer + ' hat die Qualifikation „' + s.qualifikation + '“ nicht.')) return out; }
  for (const b of p.basis[s.tag] || []) if (intervalleUeberschneiden(b, s) && wochenSchnitt(b.wochen, s.wochen)) { if (add('D01', belegungText(ctx.d, p.id, b))) return out; }
  for (const x of p.dienste) {
    if (x === s || (s.id && x.id === s.id) || x.tag !== s.tag || !intervalleUeberschneiden(x, s) || !wochenSchnitt(x.wochen, s.wochen)) continue;
    if (add('D01', wer + ' hat bereits ' + (x.name || 'eine andere Aufsicht') + (x.nurBlock ? ' (Rotation)' : '') + ' von ' + zeitText(x.start) + ' bis ' + zeitText(x.end) + '.')) return out;
  }
  // D12: Springer und feste Aufsicht derselben Pause sind immer verschiedene Personen (je Zeitraum getrennt – Frühstück, Mittag, Spätaufsicht)
  for (const x of p.dienste) {
    if (x === s || (s.id && x.id === s.id) || x.tag !== s.tag || !!x.springer === !!s.springer || !wochenSchnitt(x.wochen, s.wochen)) continue;
    const spr = s.springer ? s : x, auf = s.springer ? x : s, zr = springerZeitraum(ctx, spr);
    if (!(auf.start < zr.end && zr.start < auf.end)) continue;
    if (add('D12', s.springer ? wer + ' hat in dieser Pause schon eine feste Aufsicht (' + (x.name || 'Aufsicht') + ' ' + zeitText(x.start) + '–' + zeitText(x.end) + ') – der Springer muss eine andere Person sein.'
      : wer + ' ist in dieser Pause schon Springer (' + zeitText(x.start) + '–' + zeitText(x.end) + ') – Springer und feste Aufsicht müssen verschiedene Personen sein.')) return out;
  }
  const b = s.bereich && ctx.bereiche.get(s.bereich);
  if (b && b.exklusiv) {
    const x = ctx.alle.find(y => y !== s && (!s.id || y.id !== s.id) && y.bereich === s.bereich && y.tag === s.tag && intervalleUeberschneiden(y, s) && wochenSchnitt(y.wochen, s.wochen));
    if (x) { if (add('D06', 'Bereich „' + b.name + '“ ist exklusiv und von ' + zeitText(x.start) + ' bis ' + zeitText(x.end) + ' schon mit ' + lehrerNameKurz(ctx.d.lehrer.find(q => q.id === x.lehrer)) + ' besetzt.')) return out; }
  }
  // Höchstzahl an Früh-/Spätaufsichten und „früh + spät am selben Tag“ sind persönliche Wünsche (D08/D09, weich): siehe personKosten.
  // D11 Arbeitszeitgrenzen (wie H16): Wochenarbeitszeit und Höchstarbeitszeit je Tag
  if (ctx.grenzen && s.zaehlt !== false) {
    // auch Rotationen, in denen die Person nur Mitglied ist (nurBlock), zählen: in der Woche anteilig, am Tag voll
    const dauer = s.end - s.start, eigene = p.dienste.filter(x => x !== s && (!s.id || x.id !== s.id));
    if (p.soll > 0) {
      let schon = 0; eigene.forEach(x => { if (x.zaehlt) schon += (x.end - x.start) * x.faktor; });
      const frei = p.rest - schon;
      if (dauer * (s.faktor === undefined ? 1 : s.faktor) > frei + 3) { if (add('D11', wer + ': Wochenarbeitszeit (' + zahlDe(p.soll / 60, 1) + ' h) wäre überschritten – frei sind noch ' + zahlDe(Math.max(0, frei) / 60, 1) + ' h.')) return out; }
    }
    if (p.tagMax > 0 && !s.selten) {
      // Springer und andere nicht angerechnete Einsätze sind zeitlich blockierend, aber arbeitszeitneutral (wie tagesEinsatz) – sie zählen hier nicht mit
      let tag = p.tagBasis[s.tag] || 0; eigene.forEach(x => { if (x.tag === s.tag && !x.selten && x.zaehlt !== false) tag += x.end - x.start; });
      if (tag + dauer > p.tagMax + 0.5) { if (add('D11', wer + ': Höchstarbeitszeit je Tag (' + zahlDe(p.tagMax / 60, 1) + ' h) wäre überschritten – ' + zahlDe(tag / 60, 1) + ' h sind schon belegt.')) return out; }
    }
  }
  return out;
}
// Weiche Kosten einer Person (Summe über die Woche) – Grundlage der Kandidatenbewertung
function personKosten(ctx, p) {
  const G = ctx.G, R = ctx.R, W = id => G[id] || 0;
  let k = 0;
  const eigene = p.dienste.filter(x => !x.nurBlock);
  let dmin = 0; eigene.forEach(x => { if (x.zaehlt) dmin += (x.end - x.start) * x.faktor; });
  // DW02 Ausgleich: Die Differenz Ist − Soll der Wochenarbeitszeit (Stunden, mit allen Aufsichten) zählt quadratisch. So gehen Aufsichten
  // zuerst an die Personen mit den meisten Minusstunden, und am Ende ist die Differenz bei allen möglichst gleich. Personen ohne
  // eingetragene Soll-Arbeitszeit sind neutral; weiteres Personal ohne Soll wird leicht bevorzugt.
  if (p.soll > 0) { const dev = (dmin - p.rest) / 60; k += W('DW02') * 2 * dev * dev; }
  else if (p.l.art === 'personal') k -= W('DW02') * 0.9 * dmin / 15;
  // Rangfolge sonstiges Personal → Co → Lehrkraft nur noch bei (fast) gleicher Differenz: kleiner Bonus je 15 Minuten
  { let dAlle = 0; eigene.forEach(x => { dAlle += (x.end - x.start) * (x.faktor === undefined ? 1 : x.faktor); }); // auch Springer und nicht angerechnete Einsätze
    const rang = AUFSICHT_RANG[aufsichtRang(p.l)] || 0; if (rang && dAlle > 0) k -= rang * dAlle / 15; }
  for (let t = 0; t < ctx.D; t++) {
    const ds = eigene.filter(x => x.tag === t && !x.selten);
    if (!ds.length) continue;
    const basis = p.praesenz[t];
    const nach = intervalleVereinigen(basis.concat(ds));
    if (!basis.length) {
      if (p.l.art !== 'personal') k += W('DW03') * 4; // weiteres Personal hat keinen unterrichtsbasierten Anwesenheitstag – freie Zeitfenster dürfen trotzdem für Aufsichten genutzt werden
    } else {
      const vS = basis[basis.length - 1].end - basis[0].start, vA = basis.reduce((s, x) => s + x.end - x.start, 0);
      const nS = nach[nach.length - 1].end - nach[0].start, nA = nach.reduce((s, x) => s + x.end - x.start, 0);
      const zusatz = Math.max(0, (nS - nA) - (vS - vA));
      k += W('DW04') * zusatz / 30;
      if (zusatz >= R.langeLuecke) k += W('DW04') * 2;
      if (nS > R.maxSpanne) k += W('DW04') * (nS - Math.max(R.maxSpanne, vS)) / 30;
    }
    ds.forEach(x => {
      // DW03: direkter Anschluss an Unterricht oder andere Einsätze
      if (basis.some(b => b.end === x.start || b.start === x.end)) k -= W('DW03');
      // DW09: Kontinuität – Anschluss an eine eigene Aufsicht
      if (ds.some(y => y !== x && (y.end === x.start || y.start === x.end))) k -= W('DW09') * 0.75;
      // Persönliche Wunschfenster sind weich. Sie werden berücksichtigt, aber erst nach vollständiger Besetzung und Soll-Auffüllung.
      const fw = (p.l.dienstVerfuegbarkeit || []).find(v => v.tag === t);
      if (fw) {
        const ws = fw.fruehestens ? minVon(fw.fruehestens) : null, we = fw.spaetestens ? minVon(fw.spaetestens) : null;
        if (fw.keinDienst) k += W('DW10') * 8;
        if (ws !== null && x.start < ws) k += W('DW10') * Math.max(1, (ws - x.start) / 15);
        if (we !== null && x.end > we) k += W('DW10') * Math.max(1, (x.end - we) / 15);
      }
      // bisherige Aufsicht zur selben Zeit (wird bei der Aufsichtsverteilung neu vergeben)
    });
    if (ds.some(x => x.kat === 'fruehdienst') && ds.some(x => x.kat === 'spaetdienst')) { k += W('DW08') * 4; if (!(p.l.dienstPraeferenzen || {}).fruehUndSpaetGleicherTag) k += W('D09') * 30; }
  }
  const fr = eigene.filter(x => x.kat === 'fruehdienst' && !x.selten), sp = eigene.filter(x => x.kat === 'spaetdienst' && !x.selten);
  const summe = (l, f) => l.reduce((s, x) => s + f(x), 0);
  const nF = katTage(fr).n, nS = katTage(sp).n;
  const hF = summe(fr, x => (x.end - x.start) * x.faktor) / 60, hS = summe(sp, x => (x.end - x.start) * x.faktor) / 60;
  k += W('DW05') * (nF * nF + 0.5 * hF * hF);
  k += W('DW06') * (nS * nS + 0.5 * hS * hS);
  const sf = summe(fr, x => Math.max(0, ctx.fg - x.start) / 15 * x.faktor), ss = summe(sp, x => Math.max(0, x.end - ctx.sg) / 30 * x.faktor);
  k += W('DW07') * (sf * sf + ss * ss) * 0.5;
  const pr = p.l.dienstPraeferenzen || {};
  const pw = v => v === 'gern' ? -2 : v === 'ungern' ? 3 : v === 'nicht möglich' ? 8 : 0;
  k += W('DW10') * (nF * pw(pr.frueh) + nS * pw(pr.spaet));
  // D08 (Wunsch): persönliche Höchstzahl an Früh-/Spätaufsichten je Woche
  if (pr.maxFruehdiensteWoche !== null && pr.maxFruehdiensteWoche !== undefined && nF > pr.maxFruehdiensteWoche + 1e-9) k += W('D08') * 30 * (nF - pr.maxFruehdiensteWoche);
  if (pr.maxSpaetdiensteWoche !== null && pr.maxSpaetdiensteWoche !== undefined && nS > pr.maxSpaetdiensteWoche + 1e-9) k += W('D08') * 30 * (nS - pr.maxSpaetdiensteWoche);
  if (ctx.stabil) eigene.forEach(x => { if (!x.neu) return; const v = ctx.stabil.get(x.tag + '|' + (x.bedarf || x.typ) + '|' + (x.bereich || '') + '|' + p.id); if (v) k -= W('DW11') * (v.some(q => intervalleUeberschneiden(q, x)) ? 3 : 1); });
  return k;
}
// Weiche Hinweise in Klartext (für die Oberfläche)
function dienstWeicheHinweise(ctx, p, s) {
  const out = [], R = ctx.R, wer = lehrerNameKurz(p.l);
  const basis = p.praesenz[s.tag] || [];
  const andere = p.dienste.filter(x => x !== s && (!s.id || x.id !== s.id) && x.tag === s.tag && !x.nurBlock && !x.selten);
  const ohne = intervalleVereinigen(basis.concat(andere)), mit = intervalleVereinigen(basis.concat(andere, [s]));
  const luecke = l => l.length ? (l[l.length - 1].end - l[0].start) - l.reduce((a, x) => a + x.end - x.start, 0) : 0;
  const zus = luecke(mit) - luecke(ohne);
  if (!ohne.length) out.push('Eigener Anfahrtstag: ' + wer + ' ist an diesem Tag sonst nicht im Haus.');
  else if (zus >= 15) out.push('Dadurch entsteht eine Lücke von ' + dauerText(zus) + '.');
  const sp = mit.length ? mit[mit.length - 1].end - mit[0].start : 0;
  if (sp > R.maxSpanne) out.push('Anwesenheit ' + zeitText(mit[0].start) + '–' + zeitText(mit[mit.length - 1].end) + ' (' + dauerText(sp) + ') ist länger als ' + dauerText(R.maxSpanne) + '.');
  const gegen = s.kat === 'fruehdienst' ? 'spaetdienst' : s.kat === 'spaetdienst' ? 'fruehdienst' : null;
  if (gegen && andere.some(x => x.kat === gegen)) out.push('Früh- und Spätaufsicht am selben Tag.');
  const pr = p.l.dienstPraeferenzen || {};
  if (s.kat === 'fruehdienst' && (pr.frueh === 'ungern' || pr.frueh === 'nicht möglich')) out.push('Persönlicher Wunsch: Frühaufsicht ' + pr.frueh + ' – kann für die Besetzung dennoch verwendet werden.');
  if (s.kat === 'spaetdienst' && (pr.spaet === 'ungern' || pr.spaet === 'nicht möglich')) out.push('Persönlicher Wunsch: Spätaufsicht ' + pr.spaet + ' – kann für die Besetzung dennoch verwendet werden.');
  const fw = (p.l.dienstVerfuegbarkeit || []).find(v => v.tag === s.tag);
  if (fw) {
    const ws = fw.fruehestens ? minVon(fw.fruehestens) : null, we = fw.spaetestens ? minVon(fw.spaetestens) : null;
    if (fw.keinDienst) out.push('Persönlicher Wunsch: an diesem Tag möglichst keine Aufsicht.');
    if (ws !== null && s.start < ws) out.push('Persönlicher Wunsch: Aufsicht möglichst erst ab ' + zeitText(ws) + ' Uhr.');
    if (we !== null && s.end > we) out.push('Persönlicher Wunsch: Aufsicht möglichst nur bis ' + zeitText(we) + ' Uhr.');
  }
  if (s.kat === 'fruehdienst' || s.kat === 'spaetdienst') {
    const k = katTage(p.dienste.filter(x => x !== s && (!s.id || x.id !== s.id) && x.kat === s.kat && !x.nurBlock && !x.selten && x.tag !== s.tag));
    const mx = s.kat === 'fruehdienst' ? pr.maxFruehdiensteWoche : pr.maxSpaetdiensteWoche;
    if (mx !== null && mx !== undefined && k.n + (s.faktor === undefined ? 1 : s.faktor) > mx + 1e-9) out.push('Persönlicher Wunsch: höchstens ' + mx + ' ' + KAT_TEXT[s.kat] + (mx === 1 ? '' : 'en') + ' je Woche – ' + wer + ' hat mit diesem Einsatz ' + zahlDe(k.n + (s.faktor === undefined ? 1 : s.faktor), 1) + '.');
    else if (k.n >= 2) out.push('Hat schon ' + zahlDe(k.n, 1) + ' ' + KAT_TEXT[s.kat] + 'en in der Woche.');
    if (gegen && !pr.fruehUndSpaetGleicherTag && andere.some(x => x.kat === gegen)) out.push('Persönlicher Wunsch: früh und spät am selben Tag ist nicht gewünscht.');
  }
  let dmin = 0; p.dienste.forEach(x => { if (!x.nurBlock && x.zaehlt && x !== s && (!s.id || x.id !== s.id)) dmin += (x.end - x.start) * x.faktor; });
  const rest = p.rest - dmin - (s.zaehlt ? (s.end - s.start) * s.faktor : 0);
  if (rest < -15) out.push('Überschreitet die Wochenarbeitszeit um ' + dauerText(-rest) + '.');
  return out;
}
// Rotation: Die übrigen Personen der Rotation müssen den Dienst ebenfalls übernehmen können
function rotationHart(ctx, s, ausser) {
  const out = [];
  (s.rotation || []).forEach(pid => {
    if ((ausser || []).includes(pid)) return;
    const q = ctx.pI.get(pid); if (!q) return;
    const g = dienstHartGruende(ctx, q, Object.assign({}, s, { lehrer: pid }), false);
    if (g.length) out.push({ code: g[0].code, text: 'Rotation – ' + g[0].text });
  });
  return out;
}
// Bewertung einer Person für einen Dienst: {stufe:'ok'|'weich'|'hart', delta, hart:[…], hinweise:[…], text}
function dienstKandidatScore(d, dienst, lehrer, ctx) {
  const lid = typeof lehrer === 'string' ? lehrer : lehrer && lehrer.id;
  ctx = ctx || dienstKontext(d, { ohne: dienst.id });
  const p = ctx.pI.get(lid);
  if (!p) return { stufe: 'hart', delta: Infinity, hart: [{ code: 'D10', text: 'Unbekannte Person.' }], hinweise: [], text: 'unbekannte Person' };
  const s = schichtAusDienst(ctx, Object.assign({}, dienst, { lehrer: lid }));
  const hart = dienstHartGruende(ctx, p, s, true);
  if (s.rotation) hart.push(...rotationHart(ctx, s, [lid, dienst.lehrer]));
  const vorher = personKosten(ctx, p);
  s.lehrer = lid; p.dienste.push(s);
  const nachher = personKosten(ctx, p);
  p.dienste.pop();
  const hinweise = hart.length ? [] : dienstWeicheHinweise(ctx, p, s);
  const delta = nachher - vorher;
  const stufe = hart.length ? 'hart' : hinweise.length ? 'weich' : 'ok';
  const qualitaet = hart.length ? '✕ ' + hart[0].text : hinweise.length ? '~ ' + hinweise[0] : delta <= 2 ? '✓ sehr gut' : '✓ möglich';
  return { stufe, delta, hart, hinweise, qualitaet, score: -delta };
}

// ---------- Aufsichts-Solver (Stufe 3: nach Fach- und Co-Unterricht) ----------
// Deckung eines Bedarfs durch vorhandene Einsätze: nur die Zeiten, in denen die Person im jeweiligen Staffelungsabschnitt NICHT
// ausgeschlossen ist (dieselbe Zählung wie besetzungBedarf). Ein Einsatz einer ausgeschlossenen Person deckt den Bedarf nicht.
function dienstDeckung(d, b, plan) {
  const out = [], lI = new Map(d.lehrer.map(l => [l.id, l]));
  (plan || d.dienste.plan).forEach(x => {
    if (!dienstRegelmaessig(x.rhythmus) || !dienstPasstZuBedarf(x, b)) return;
    const iv = dienstIntervall(x); if (!iv) return;
    const l = lI.get(x.lehrer), sperr = [];
    (b.abschnitte || []).forEach(q => {
      const av = intervall(q.beginn, q.ende); if (!av || !(av.start < iv.end && iv.start < av.end)) return;
      if ((q.ausschlussPersonen || []).includes(x.lehrer) || (l && (q.ausschlussGruppen || []).some(g => personInDienstGruppe(d, l, g)))) sperr.push(av);
    });
    let rest = [{ start: iv.start, end: iv.end }];
    sperr.forEach(sp => { rest = rest.flatMap(r => { const o = []; if (r.start < sp.start) o.push({ start: r.start, end: Math.min(r.end, sp.start) }); if (r.end > sp.end) o.push({ start: Math.max(r.start, sp.end), end: r.end }); return o; }); });
    rest.forEach(r => { if (r.end > r.start) out.push(r); });
  });
  return out;
}
// Teilungsgrenzen je Tag (Minuten): Aufsichten gelten für die Pausen des ZEITRASTERS und werden nur an den Grenzen ihrer Staffelung
// (Abschnitte des Bedarfs) geteilt – nicht an Unterrichtsgrenzen verschobener Zeitprofile, Aufgaben oder Ausschlussfenstern. So entstehen keine
// 15-Minuten-Stücke: Wer wegen eines Zeitprofils länger Unterricht hat, übernimmt nur die Abschnitte, die danach beginnen (z. B. 10:00–10:30
// einer Pause 09:30–10:00 · 10:00–10:30) – oder gar keinen, wenn die Pause nur einen Abschnitt hat.
function dienstTeilungsgrenzen(ctx) {
  const D = ctx.D, out = Array.from({ length: D }, () => new Set());
  const add = (t, m) => { if (t >= 0 && t < D && m !== null && m !== undefined && m >= 0 && m <= 1440) out[t].add(m); };
  ctx.d.dienste.bedarfe.forEach(b => (b.abschnitte || []).forEach(q => { const iv = intervall(q.beginn, q.ende); if (iv && iv.end > iv.start) { add(b.tag, iv.start); add(b.tag, iv.end); } }));
  return out.map(x => [...x].sort((p, q) => p - q));
}
// opt: { nurOffene: bestehende Aufsichten behalten und nur Lücken füllen, stabil: bisherige Zuordnungen bevorzugen, zeitlimit: ms }
// Grundsätze der Neuplanung:
//   · Gerechnet wird immer gegen den Fach- und Co-Unterricht, der JETZT im Datenstand steht (keine alten Stände, kein Schalter).
//   · Erhalten bleiben ausschließlich von Hand gesetzte und fixierte Einsätze (D04). Alte automatisch erzeugte Einsätze werden ersetzt.
//   · Unterricht und Co-Unterricht haben Vorrang: Kollidiert ein bleibender Einsatz damit, entfällt er (gemeldet in „verdraengt“).
//   · Jede notwendige Aufsicht wird besetzt, sobald eine zulässige Person verfügbar ist. Weiche Kosten entscheiden nur, WER sie übernimmt.
// Ergebnis: { plan, offen, stand, statistik, verdraengt }
function dienstePlanen(d, opt) {
  opt = opt || {};
  const t0 = jetzt(), DI = d.dienste, D = d.schule.tage.length;
  const zeitlimit = opt.zeitlimit || 400;
  const istManuell = x => x.quelle === 'manuell';
  const iv0 = { start: 0, end: 0 };
  // 1. Was bleibt?
  const stabil = new Map();
  DI.plan.forEach(x => { if (x.fixiert || istManuell(x)) return; const iv = dienstIntervall(x); if (!iv) return; const k = x.tag + '|' + (x.bedarf || x.typ) + '|' + (x.bereich || '') + '|' + x.lehrer; if (!stabil.has(k)) stabil.set(k, []); stabil.get(k).push(iv); });
  const stat = { schichten: 0, verbessert: 0, runden: 0, ketten: 0, ueberGrenze: 0,
    autoEntfernt: opt.nurOffene ? 0 : DI.plan.filter(x => x.quelle === 'auto' && !x.fixiert).length };
  let behalten = DI.plan.filter(x => x.fixiert || istManuell(x) || (opt.nurOffene && x.quelle === 'auto'));
  const bedarfe = DI.bedarfe.filter(b => b.tag < D).map(b => ({ b, tag: b.tag, typ: b.typ || 'dt_dienst', bereich: b.bereich || null, bedarf: b.id, name: b.name, arbeitszeit: b.arbeitszeit, springer: b.springer, qualifikation: b.qualifikation, farbe: b.farbe,
    abschnitte: b.abschnitte.filter(q => { const iv = intervall(q.beginn, q.ende); return iv && iv.end > iv.start; }) }));
  // Nur offene: überzählige automatische Aufsichten entfernen (Bedarf gesunken oder gelöscht)
  if (opt.nurOffene) {
    const auto = behalten.filter(x => x.quelle === 'auto' && !x.fixiert).sort((p, q) => intervallDauer(dienstIntervall(p) || iv0) - intervallDauer(dienstIntervall(q) || iv0));
    auto.forEach(x => {
      const iv = dienstIntervall(x);
      const gs = bedarfe.filter(g => dienstPasstZuBedarf(x, g.b));
      const rest = behalten.filter(y => y !== x);
      const entbehrlich = !iv || !gs.length || gs.every(g => {
        const kurve = bedarfsKurve(g.abschnitte, 'soll', dienstDeckung(d, g.b, rest));
        return !kurve.some((pkt, i) => pkt.n > 0 && i + 1 < kurve.length && pkt.t < iv.end && kurve[i + 1].t > iv.start);
      });
      if (entbehrlich) behalten = rest;
    });
  }
  const ctx = dienstKontext(d, { plan: [] });
  ctx.stabil = opt.stabil || opt.nurOffene ? stabil : null;
  // Bleibende Einsätze prüfen. Unterricht und Co-Unterricht haben absolute Priorität: Auch ein von Hand gesetzter oder fixierter Einsatz bleibt
  // nicht stehen, wenn er sich mit einer höher priorisierten Belegung überschneidet – er wird als „verdrängt“ gemeldet und neu besetzt.
  const bleibend = [], verdraengt = [];
  behalten.forEach(x => {
    const sx = schichtAusDienst(ctx, x);
    const p = ctx.pI.get(x.lehrer);
    const hart = p ? dienstHartGruende(ctx, p, sx, true) : [{ code: 'D10', text: 'Die eingeteilte Person gibt es nicht mehr.' }];
    const zeit = hart.find(g => g.code === 'D01' || g.code === 'D10');
    if (!p || zeit) { if (x.fixiert || istManuell(x)) verdraengt.push({ id: x.id, lehrer: x.lehrer, tag: x.tag, typ: x.typ, bereich: x.bereich || null, bedarf: x.bedarf || null, name: sx.name || x.name || '', beginn: x.beginn, ende: x.ende, fixiert: !!x.fixiert, grund: (zeit || hart[0] || { text: '' }).text }); return; }
    if (!x.fixiert && x.quelle === 'auto' && hart.length) return;
    bleibend.push(x); dienstEintragen(ctx, sx, x.lehrer);
  });
  behalten = bleibend;
  // 2. Bedarf in Schichten zerlegen (Minimum zuerst, dann Soll), abzüglich der bleibenden Aufsichten – und an allen Teilungsgrenzen des Tages teilen
  const grenzen = dienstTeilungsgrenzen(ctx);
  const teilen = (tag, liste) => liste.flatMap(q => {
    const pts = [q.start].concat((grenzen[tag] || []).filter(t => t > q.start && t < q.end), [q.end]);
    return pts.slice(0, -1).map((von, i) => Object.assign({}, q, { start: von, end: pts[i + 1] }));
  });
  const schichten = [];
  bedarfe.forEach(g => {
    const deckung = dienstDeckung(d, g.b, behalten);
    const minBasis = schichtenAusKurve(bedarfsKurve(g.abschnitte, 'min', deckung));
    const sollBasis = schichtenAusKurve(bedarfsKurve(g.abschnitte, 'soll', deckung.concat(minBasis)));
    // ohne eigene Ausschlüsse liefert schichtenNachAusschlussTeilen die Liste unverändert – die Ausschlüsse des Abschnitts werden dann hier gelesen
    const mitAusschluss = liste => teilen(g.tag, schichtenNachAusschlussTeilen(g.b, liste)).map(z => { const ax = bedarfAusschlussFuerIntervall(g.b, z.start, z.end); return Object.assign(z, { personen: ax.personen, gruppen: ax.gruppen }); });
    mitAusschluss(minBasis).forEach(z => schichten.push(Object.assign(z, g, { start: z.start, end: z.end, prio: 'min' })));
    mitAusschluss(sollBasis).forEach(z => schichten.push(Object.assign(z, g, { start: z.start, end: z.end, prio: 'soll' })));
  });
  const neu = schichten.map((sc, i) => {
    const x = schichtAusDienst(ctx, { id: 'neu' + i, tag: sc.tag, typ: sc.typ || 'dt_dienst', bereich: sc.bereich, bedarf: sc.bedarf, name: sc.name, arbeitszeit: sc.arbeitszeit, springer: sc.springer, qualifikation: sc.qualifikation, farbe: sc.farbe, beginn: zeitText(sc.start), ende: sc.end >= 1440 ? '24:00' : zeitText(sc.end), rhythmus: { art: 'woechentlich' }, quelle: 'auto', ausschlussPersonen: sc.personen, ausschlussGruppen: sc.gruppen });
    x.start = sc.start; x.end = sc.end; x.prio = sc.prio; x.neu = true; x.lehrer = null;
    return x;
  });
  stat.schichten = neu.length;
  // Kosten einer offenen Soll-Schicht (nach Gewicht DW01). Eine Mindest-Schicht bleibt nie wegen weicher Kosten offen.
  const offenKosten = sc => sc.prio === 'min' ? Infinity : (ctx.G.DW01 || 0) * 8 + (sc.end - sc.start) / 15;
  const kostenCache = new Map();
  const pk = p => { let v = kostenCache.get(p.id); if (v === undefined) { v = personKosten(ctx, p); kostenCache.set(p.id, v); } return v; };
  const aendere = p => kostenCache.delete(p.id);
  const zuteilen = (sc, p) => { sc.lehrer = p.id; p.dienste.push(sc); ctx.alle.push(sc); aendere(p); };
  const entziehen = sc => { const p = ctx.pI.get(sc.lehrer); dienstAustragen(ctx, sc); if (p) aendere(p); sc.lehrer = null; };
  const deltaMit = (p, sc) => { const v = pk(p); sc.lehrer = p.id; p.dienste.push(sc); const n = personKosten(ctx, p); p.dienste.pop(); sc.lehrer = null; return n - v; };
  const frei = (p, sc) => !dienstHartGruende(ctx, p, sc, false).length;
  const kandidaten = sc => ctx.personen.filter(p => frei(p, sc));
  const beste = sc => { let best = null, bestD = Infinity; for (const p of ctx.personen) { if (!frei(p, sc)) continue; const dl = deltaMit(p, sc); if (dl < bestD - 1e-9 || (Math.abs(dl - bestD) < 1e-9 && best && p.i < best.i)) { bestD = dl; best = p; } } return best ? { p: best, d: bestD } : null; };
  const zeitUm = () => jetzt() - t0 > zeitlimit;
  // 3. Greedy: Minimum vor Soll, dann Schichten mit wenigen Kandidaten zuerst
  neu.forEach(sc => { sc.nKand = kandidaten(sc).length; });
  const rang = sc => sc.prio === 'min' ? (sc.springer ? 1 : 0) : 2; // feste Aufsichten vor Springern (D12: eine Person je Pause)
  const ordnung = neu.slice().sort((p, q) => rang(p) - rang(q) || p.nKand - q.nKand || (q.end - q.start) - (p.end - p.start) || p.tag - q.tag || p.start - q.start);
  ordnung.forEach(sc => {
    // Jede planbare Aufsicht wird besetzt. Weiche Kosten entscheiden nur WER sie übernimmt, nie OB sie besetzt wird.
    const x = beste(sc); if (x) zuteilen(sc, x.p);
  });
  // 4b. Mindestbesetzung herstellen (Punkt 26): Ist für eine offene Mindest-Schicht eine zulässige Person erreichbar – direkt oder indem
  //     andere NEUE Schichten in einer Kette (bis zu drei Wechsel) an weitere zulässige Personen wandern –, wird sie besetzt.
  //     Harte Regeln (Unterricht, Abwesenheit, Ausschlüsse, Qualifikation, Arbeitszeitgrenzen) werden dabei nie überschritten.
  let schritte = 0;
  const stand = () => neu.map(x => x.lehrer);
  const zurueck = snap => { neu.forEach((x, i) => { if (x.lehrer && x.lehrer !== snap[i]) entziehen(x); }); neu.forEach((x, i) => { if (!x.lehrer && snap[i]) zuteilen(x, ctx.pI.get(snap[i])); }); };
  const besetze = (sc, tiefe) => {
    const x = beste(sc); if (x) { zuteilen(sc, x.p); return true; }
    if (tiefe <= 0) return false;
    for (const q of ctx.personen) {
      if (++schritte > 1500 || jetzt() - t0 > zeitlimit * 3 + 500) return false;
      const hg = dienstHartGruende(ctx, q, sc, true);
      if (!hg.length || hg.some(g => g.code !== 'D01' && g.code !== 'D11' && !(g.code === 'D12' && !sc.springer))) continue;
      const snap = stand(), weg = [], wegSpr = [];
      // Hindernisse, die sich auflösen lassen: eigene NEUE Schichten, die sich überschneiden (D01) oder die Arbeitszeit belegen (D11)
      q.dienste.filter(y => y.neu && !y.nurBlock && y.tag === sc.tag && intervalleUeberschneiden(y, sc)).forEach(y => { entziehen(y); weg.push(y); });
      // … und neue Springer derselben Pause (D12): Die feste Aufsicht hat Vorrang, der Springer sucht sich danach eine andere Person
      if (!sc.springer) q.dienste.filter(y => y.neu && !y.nurBlock && y.springer && y.tag === sc.tag && (() => { const zr = springerZeitraum(ctx, y); return sc.start < zr.end && zr.start < sc.end; })()).forEach(y => { entziehen(y); wegSpr.push(y); });
      for (let n = 0; n < 4 && !frei(q, sc); n++) {
        const hg2 = dienstHartGruende(ctx, q, sc, true);
        if (hg2.some(g => g.code !== 'D11')) break;
        const kand = q.dienste.filter(y => y.neu && !y.nurBlock && y.zaehlt).sort((p1, p2) => (p1.tag === sc.tag ? 0 : 1) - (p2.tag === sc.tag ? 0 : 1) || Math.abs((p1.end - p1.start) - (sc.end - sc.start)) - Math.abs((p2.end - p2.start) - (sc.end - sc.start)));
        if (!kand.length) break;
        entziehen(kand[0]); weg.push(kand[0]);
      }
      if (!frei(q, sc)) { zurueck(snap); continue; }
      zuteilen(sc, q);
      let ok = true;
      for (const y of weg) { if (!y.springer && !besetze(y, tiefe - 1)) { ok = false; break; } }
      if (ok) { weg.concat(wegSpr).forEach(y => { if (!y.lehrer) besetze(y, tiefe - 1); }); return true; }
      zurueck(snap);
    }
    return false;
  };
  // Schichten, die sich zweimal nicht besetzen ließen, werden erst in der Schlusskontrolle noch einmal versucht (spart Zeit bei echtem Personalmangel)
  const fuelleMin = alle => { let n = 0; for (const sc of neu) { if (sc.lehrer || sc.prio !== 'min' || (!alle && sc.fehl >= 2)) continue; schritte = 0; if (besetze(sc, 3)) { n++; stat.ketten++; sc.fehl = 0; } else sc.fehl = (sc.fehl || 0) + 1; } return n; };
  fuelleMin(false);
  // 4. Lokale Verbesserung: Schicht umhängen, zwei Schichten tauschen, offene Soll-Schicht per Verdrängung besetzen
  let besser = true;
  while (besser && !zeitUm() && stat.runden < 30) {
    besser = false; stat.runden++;
    for (const sc of neu) {
      if (!sc.lehrer) continue;
      const p = ctx.pI.get(sc.lehrer);
      const vorP = pk(p);
      entziehen(sc); const ohneP = pk(p);
      let best = null, bestD = -1e-6;
      for (const q of ctx.personen) {
        if (q === p || !frei(q, sc)) continue;
        const dl = (ohneP - vorP) + deltaMit(q, sc);
        if (dl < bestD) { bestD = dl; best = q; }
      }
      zuteilen(sc, best || p);
      if (best) { besser = true; stat.verbessert++; }
      if (zeitUm()) break;
    }
    // Tausch zweier Schichten zwischen zwei Personen
    for (let i = 0; i < neu.length && !zeitUm(); i++) {
      const a1 = neu[i]; if (!a1.lehrer) continue;
      for (let j = i + 1; j < neu.length; j++) {
        const b1 = neu[j]; if (!b1.lehrer || b1.lehrer === a1.lehrer) continue;
        const pa = ctx.pI.get(a1.lehrer), pb = ctx.pI.get(b1.lehrer);
        const vor = pk(pa) + pk(pb);
        entziehen(a1); entziehen(b1);
        let ok = frei(pb, a1);
        if (ok) { zuteilen(a1, pb); ok = frei(pa, b1); if (ok) { zuteilen(b1, pa); if (pk(pa) + pk(pb) < vor - 1e-6) { besser = true; stat.verbessert++; continue; } entziehen(b1); } entziehen(a1); }
        zuteilen(a1, pa); zuteilen(b1, pb);
      }
    }
    // Offene Soll-Schichten: direkt oder durch Verdrängung einer anderen neuen Schicht besetzen (Mindest-Schichten: siehe 4b)
    for (const sc of neu) {
      if (sc.lehrer || sc.prio === 'min' || zeitUm()) continue;
      let best = null, bestD = offenKosten(sc);
      for (const q of ctx.personen) {
        const hg = dienstHartGruende(ctx, q, sc, true);
        if (!hg.length) { const dl = deltaMit(q, sc); if (dl < bestD) { bestD = dl; best = { q }; } continue; }
        // genau ein Hindernis: eine eigene neue Schicht, die jemand anderes übernehmen kann
        if (hg.length !== 1 || hg[0].code !== 'D01') continue;
        const blocker = q.dienste.find(x => x.neu && x.tag === sc.tag && intervalleUeberschneiden(x, sc));
        if (!blocker) continue;
        const vorQ = pk(q);
        entziehen(blocker);
        if (frei(q, sc)) {
          const dlS = deltaMit(q, sc) + (pk(q) - vorQ);
          zuteilen(sc, q);
          for (const r of ctx.personen) {
            if (r === q || !frei(r, blocker)) continue;
            const dl = dlS + deltaMit(r, blocker);
            if (dl < bestD) { bestD = dl; best = { q, blocker, r }; }
          }
          entziehen(sc);
        }
        zuteilen(blocker, q);
      }
      if (!best) continue;
      if (best.blocker) { entziehen(best.blocker); zuteilen(sc, best.q); zuteilen(best.blocker, best.r); } else zuteilen(sc, best.q);
      besser = true; stat.verbessert++;
    }
    if (fuelleMin(false)) { besser = true; stat.verbessert++; }
  }
  // Schlusskontrolle unabhängig vom Zeitlimit: Keine Mindest-Schicht bleibt offen, solange eine zulässige Person erreichbar ist.
  fuelleMin(true);
  // 5. Ergebnis: aneinandergrenzende neue Abschnitte derselben Person und desselben Bedarfs zusammenfassen
  const zugeteilt = neu.filter(sc => sc.lehrer).sort((p, q) => p.lehrer.localeCompare(q.lehrer) || p.tag - q.tag || String(p.bedarf).localeCompare(String(q.bedarf)) || p.typ.localeCompare(q.typ) || String(p.bereich).localeCompare(String(q.bereich)) || p.start - q.start);
  const zusammen = [];
  zugeteilt.forEach(sc => {
    const l = zusammen[zusammen.length - 1];
    if (l && l.lehrer === sc.lehrer && l.tag === sc.tag && l.bedarf === sc.bedarf && l.bereich === sc.bereich && l.end === sc.start) l.end = sc.end;
    else zusammen.push({ lehrer: sc.lehrer, tag: sc.tag, typ: sc.typ, bereich: sc.bereich, bedarf: sc.bedarf, name: sc.name, arbeitszeit: sc.zaehlt || false, springer: sc.springer, qualifikation: sc.qualifikation, start: sc.start, end: sc.end });
  });
  const neuePlan = zusammen.map(sc => {
    const beginn = zeitText(sc.start), ende = sc.end >= 1440 ? '24:00' : zeitText(sc.end);
    return nDienst({ lehrer: sc.lehrer, tag: sc.tag, typ: sc.typ || 'dt_dienst', bereich: sc.bereich, bedarf: sc.bedarf, name: sc.name, arbeitszeit: sc.arbeitszeit, springer: !!sc.springer, qualifikation: sc.qualifikation, beginn, ende, quelle: 'auto', rhythmus: { art: 'woechentlich' } });
  });
  // Offene Schichten mit Begründung; aneinandergrenzende offene Abschnitte desselben Bedarfs erscheinen als eine Zeile
  const offenRoh = neu.filter(sc => !sc.lehrer).sort((p, q) => p.tag - q.tag || String(p.bedarf).localeCompare(String(q.bedarf)) || (p.prio === q.prio ? 0 : p.prio === 'min' ? -1 : 1) || p.start - q.start);
  const bahnen = [];
  offenRoh.forEach(sc => {
    const l = bahnen.find(x => x.tag === sc.tag && x.bedarf === sc.bedarf && x.prio === sc.prio && x.end === sc.start);
    if (l) l.end = sc.end; else bahnen.push({ tag: sc.tag, typ: sc.typ, bereich: sc.bereich, bedarf: sc.bedarf, name: sc.name, prio: sc.prio, springer: istSpringerBedarf(sc), start: sc.start, end: sc.end, erste: sc });
  });
  // Unbesetzte Springer: eigene Stufe „springer“ (gelb) – sie zählen nie als fehlender Mindestbedarf
  const offen = bahnen.map(o => ({ id: neueId('do'), tag: o.tag, typ: o.typ || 'dt_dienst', bereich: o.bereich, bedarf: o.bedarf, name: o.name, beginn: zeitText(o.start), ende: o.end >= 1440 ? '24:00' : zeitText(o.end), prio: o.springer && o.prio === 'min' ? 'springer' : o.prio, grund: offenGrund(ctx, o.erste) }));
  stat.offenMin = offen.filter(o => o.prio === 'min').length;
  stat.offenSpringer = offen.filter(o => o.prio === 'springer').length;
  stat.offenSoll = offen.filter(o => o.prio === 'soll').length;
  stat.neu = neuePlan.length; stat.behalten = behalten.length; stat.verdraengt = verdraengt.length; stat.zeit = Math.round(jetzt() - t0);
  const plan = behalten.concat(neuePlan).sort((p, q) => p.tag - q.tag || (minVon(p.beginn) || 0) - (minVon(q.beginn) || 0) || p.lehrer.localeCompare(q.lehrer));
  return { plan, offen, stand: dienstGrundlagenSignatur(d), statistik: stat, verdraengt };
}
// Vollständige Neuberechnung der Aufsichten gegen den fertigen Fach- und Co-Plan im Datenstand d (wird verändert).
// Läuft bei jeder Stundenplanberechnung – unabhängig vom Schalter „automatisch nachplanen“, der nur noch das Nachplanen nach Handänderungen steuert.
function aufsichtenNeuBerechnen(d, opt) {
  if (!d || !d.dienste) return null;
  const r = dienstePlanen(d, Object.assign({ stabil: true, zeitlimit: 1500 }, opt || {}));
  d.dienste.plan = r.plan; d.dienste.offen = r.offen; d.dienste.stand = r.stand; d.dienste.verdraengt = r.verdraengt;
  return r;
}
// Warum ist eine Schicht offen? Zählt die harten Gründe über alle Personen.
function offenGrund(ctx, s) {
  const zaehl = {};
  let billig = 0;
  ctx.personen.forEach(p => { const g = dienstHartGruende(ctx, p, s, false); if (g.length) { const c = g[0].code, t = g[0].text; const key = c === 'D01' ? (/unterrichtet|Co-Lehrkraft|Aufgabe|gesperrt/.test(t) ? 'Unterricht/Aufgabe' : /Aufsicht|Springer \(Pause\)/.test(t) ? 'Aufsicht' : 'andere Aufsicht') : { D02: 'Anwesenheit', D05: 'ausgeschlossen/ausgenommen', D06: 'Bereich exklusiv', D07: 'Qualifikation', D10: 'ungültig', D11: 'Arbeitszeitgrenze erreicht' }[c] || c; zaehl[key] = (zaehl[key] || 0) + 1; } else billig++; });
  const teile = Object.entries(zaehl).sort((a, b) => b[1] - a[1]).map(([k, n]) => n + '× ' + k);
  return (billig ? billig + ' Person(en) wären möglich' + (s.prio === 'soll' ? ', für die Sollbesetzung aber zu ungünstig (Arbeitszeit, Lücken, Fairness)' : '') + ' – bitte „Aufsichten planen“ ausführen. ' : 'Niemand zulässig und frei. ') + (teile.length ? teile.join(', ') + '.' : '');
}
// Offene Schichten aus dem aktuellen Stand: Bedarf minus regelmäßige Aufsichten, zerlegt wie beim Planen (Minimum, dann Soll).
// Gründe werden aus der bisherigen Liste übernommen; mit ctx werden fehlende berechnet.
function offeneSchichten(d, ctx) {
  const DI = d.dienste, D = d.schule.tage.length;
  const gruppen = new Map();
  DI.bedarfe.forEach(b => { if (b.tag >= D) return; gruppen.set(b.id, { tag: b.tag, typ: b.typ || 'dt_dienst', bereich: b.bereich || null, bedarf: b.id, name: b.name, arbeitszeit: b.arbeitszeit, springer: b.springer, qualifikation: b.qualifikation, abschnitte: b.abschnitte.filter(a => { const iv = intervall(a.beginn, a.ende); return iv && iv.end > iv.start; }) }); });
  const alt = new Map((DI.offen || []).map(o => [(o.bedarf || o.typ) + '|' + o.tag + '|' + o.beginn + '|' + o.ende + '|' + o.prio, o.grund]));
  const out = [];
  gruppen.forEach(g => {
    const bb = DI.bedarfe.find(b => b.id === g.bedarf);
    const deckung = dienstDeckung(d, bb);
    const minBasis = schichtenAusKurve(bedarfsKurve(g.abschnitte, 'min', deckung));
    const sollBasis = schichtenAusKurve(bedarfsKurve(g.abschnitte, 'soll', deckung.concat(minBasis)));
    const minS = schichtenNachAusschlussTeilen(bb, minBasis), sollS = schichtenNachAusschlussTeilen(bb, sollBasis);
    [[minS, 'min'], [sollS, 'soll']].forEach(([l, prio]) => l.forEach(s => {
      const o = { id: 'do_' + g.bedarf + '_' + s.start + '_' + s.end + '_' + prio, tag: g.tag, typ: g.typ, bereich: g.bereich, bedarf: g.bedarf, name: g.name, beginn: zeitText(s.start), ende: s.end >= 1440 ? '24:00' : zeitText(s.end), prio, grund: '' };
      o.grund = alt.get((o.bedarf || o.typ) + '|' + o.tag + '|' + o.beginn + '|' + o.ende + '|' + prio) || '';
      if (!o.grund && ctx) { const ax = bedarfAusschlussFuerIntervall(DI.bedarfe.find(b => b.id === g.bedarf), s.start, s.end); const x = schichtAusDienst(ctx, Object.assign({ rhythmus: { art: 'woechentlich' }, arbeitszeit: g.arbeitszeit, springer: g.springer, qualifikation: g.qualifikation, ausschlussPersonen: ax.personen, ausschlussGruppen: ax.gruppen }, o, { id: null })); o.grund = offenGrund(ctx, x); }
      out.push(o);
    }));
  });
  return out.sort((a, b) => a.tag - b.tag || (minVon(a.beginn) || 0) - (minVon(b.beginn) || 0));
}
// Einen Dienst prüfen (für Prüfung, Wochenplan-Markierungen)
function dienstPruefen(d, x, ctx) {
  ctx = ctx || dienstKontext(d);
  const p = ctx.pI.get(x.lehrer);
  const s = ctx.alle.find(y => y.id === x.id) || schichtAusDienst(ctx, x);
  const hart = [];
  if (!p) hart.push({ code: 'D10', text: 'Aufsicht ohne (gültige) Person.' });
  else hart.push(...dienstHartGruende(ctx, p, s, true));
  if (s.rotation) hart.push(...rotationHart(ctx, s, [x.lehrer]));
  if (x.bereich && !ctx.bereiche.has(x.bereich)) hart.push({ code: 'D10', text: 'Unbekannter Bereich.' });
  return { hart, hinweise: p && !hart.length ? dienstWeicheHinweise(ctx, p, s) : [] };
}

// ---------- Prüfung: Kennzahlen und Meldungen der Aufsichtsplanung ----------
function dienstPruefung(d) {
  const DI = d.dienste, D = d.schule.tage.length, R = DI.regeln;
  const meldungen = [];
  const M = (stufe, regel, text, ziel) => meldungen.push({ stufe, regel, text, ziel: Object.assign({ seite: 'aufsicht', tab: 'wochenplan' }, ziel || {}) });
  const tn = t => TAGE_LANG[d.schule.tage[t]] || d.schule.tage[t] || 'Tag ' + (t + 1);
  const typName = id => ((DIENSTTYPEN.find(t => t.id === id) || {}).name || 'Aufsicht');
  const bedarfName = b => (b && b.name) || typName(b && b.typ);
  const einsatzName = x => (dienstMeta(d, x).name || x.name || typName(x.typ));
  const ber = id => id ? ' – ' + ((DI.bereiche.find(b => b.id === id) || {}).name || '?') : '';
  const ctx = dienstKontext(d);
  let konflikte = 0;
  DI.plan.forEach(x => {
    const r = dienstPruefen(d, x, ctx);
    const l = d.lehrer.find(q => q.id === x.lehrer);
    r.hart.forEach(h => { konflikte++; M('fehler', h.code, tn(x.tag) + ' ' + x.beginn + '–' + x.ende + ' ' + einsatzName(x) + ' (' + lehrerNameKurz(l) + '): ' + h.text, { tag: x.tag, dienst: x.id }); });
  });
  let minOffen = 0, sollOffen = 0;
  DI.bedarfe.forEach(b => {
    if (b.tag >= D) { M('warnung', 'D10', 'Bedarf „' + bedarfName(b) + '“ liegt auf einem Tag außerhalb der Schulwoche.', { tab: 'bedarf' }); return; }
    besetzungBedarf(d, b).forEach(a => {
      if (a.ungueltig) { M('fehler', 'D10', tn(b.tag) + ' ' + bedarfName(b) + ber(b.bereich) + ': Abschnitt ' + (a.beginn || '?') + '–' + (a.ende || '?') + ' hat keine gültige Zeit.', { tab: 'bedarf', tag: b.tag, bedarf: b.id }); minOffen++; return; }
      if (a.status === 'err') { minOffen++; M('fehler', 'D03', tn(b.tag) + ' ' + a.beginn + '–' + a.ende + ' ' + bedarfName(b) + ber(b.bereich) + ': ' + a.ist + ' von mindestens ' + a.min + ' Personen.', { tag: b.tag, bedarf: b.id }); }
      else if (a.springer && a.fehltMin > 0) { sollOffen++; M('warnung', 'DW01', tn(b.tag) + ' ' + a.beginn + '–' + a.ende + ' ' + bedarfName(b) + ber(b.bereich) + ': Springer (Reserve) nicht besetzt – ' + a.ist + ' von ' + a.min + ' Personen.', { tag: b.tag, bedarf: b.id }); }
      else if (a.status === 'warn') { sollOffen++; M('warnung', 'DW01', tn(b.tag) + ' ' + a.beginn + '–' + a.ende + ' ' + bedarfName(b) + ber(b.bereich) + ': ' + a.ist + ' von ' + a.soll + ' Personen (Soll).', { tag: b.tag, bedarf: b.id }); }
    });
  });
  // Durch Zeitprofile können sich Unterrichte einer Person real überschneiden (z. B. 5a bis 10:55, 7a ab 10:15)
  const idxU = belegungsIndex(d, { ohneDienste: true, ohneAufsicht: true });
  idxU.forEach((tage, lid) => tage.forEach((liste, t) => {
    const u = liste.filter(b => b.art === 'unterricht' || b.art === 'co' || b.art === 'aufgabe');
    for (let i = 0; i < u.length; i++) for (let j = i + 1; j < u.length; j++) {
      if (u[i].ref === u[j].ref || !intervalleUeberschneiden(u[i], u[j]) || !wochenSchnitt(u[i].wochen, u[j].wochen)) continue;
      konflikte++;
      M('fehler', 'D01', lehrerNameKurz(d.lehrer.find(l => l.id === lid)) + ' ' + tn(t) + ': ' + u[i].text + ' (' + zeitText(u[i].start) + '–' + zeitText(u[i].end) + ') und ' + u[j].text + ' (' + zeitText(u[j].start) + '–' + zeitText(u[j].end) + ') überschneiden sich wegen unterschiedlicher Zeitprofile.', { tag: t, lehrer: lid });
    }
  }));
  // Abschnitte eines Bedarfs dürfen sich nicht überschneiden (sonst zählen sie doppelt)
  DI.bedarfe.forEach(b => {
    const ivs = b.abschnitte.map(a => intervall(a.beginn, a.ende)).filter(iv => iv && iv.end > iv.start).sort((x, y) => x.start - y.start);
    for (let i = 1; i < ivs.length; i++) if (ivs[i].start < ivs[i - 1].end) { M('warnung', 'D03', tn(b.tag) + ' ' + bedarfName(b) + ber(b.bereich) + ': Abschnitte ' + zeitspanneText(ivs[i - 1]) + ' und ' + zeitspanneText(ivs[i]) + ' überschneiden sich – der Bedarf addiert sich dort.', { tab: 'bedarf', tag: b.tag, bedarf: b.id }); break; }
  });
  // Gekoppelte Klassen mit unterschiedlichen Zeitprofilen im Plan (§8: Konflikt)
  if (d.plan.platzierungen.length) zeitprofilKonflikte(d).forEach(k => { konflikte++; M('fehler', 'D01', k.text, { seite: 'unterricht', id: k.ziel.id, tab: null }); });
  // Verschiedene benannte Bedarfe dürfen sich zeitlich überlappen. Sie werden unabhängig besetzt;
  // derselbe Einsatz kann nur den Bedarf decken, mit dem er über seine Bedarf-ID verknüpft ist.
  // Arbeitszeit und Anwesenheit
  const az = arbeitszeiten(d);
  const ueber = az.liste.filter(x => x.soll > 0 && x.summe > x.soll + 15);
  ueber.forEach(x => M('warnung', 'DW02', 'Arbeitszeit ' + x.kuerzel + ': ' + zahlDe(x.summe / 60, 1) + ' h bei ' + zahlDe(x.soll / 60, 1) + ' h Soll (inkl. Aufsichten).', { tab: 'mitarbeitende', lehrer: x.lehrer }));
  const idx = belegungsIndex(d);
  let langeTage = 0;
  d.lehrer.forEach(l => { for (let t = 0; t < D; t++) { const a = tagesAnwesenheit(d, l.id, t, idx); if (a.spanne > R.maxSpanne) { langeTage++; M('warnung', 'DW04', lehrerNameKurz(l) + ' ' + tn(t) + ': anwesend ' + zeitText(a.ersterBeginn) + '–' + zeitText(a.letztesEnde) + ' (' + dauerText(a.spanne) + ', davon ' + dauerText(a.luecken) + ' Lücken).', { tag: t, lehrer: l.id }); } } });
  // Fairness Früh/Spät unter den dafür einsetzbaren Personen
  const dm = dienstMinutenJeLehrer(d);
  let ungleich = [];
  [['fruehdienst', 'anzahlFrueh', 'frueh', 'Frühaufsichten'], ['spaetdienst', 'anzahlSpaet', 'spaet', 'Spätaufsichten']].forEach(([kat, feld, pf, name]) => {
    if (!DI.plan.some(x => dienstMeta(d, x).kat === kat)) return;
    const pers = d.lehrer.filter(l => l.aufsicht !== false && l.dienstPraeferenzen[pf] !== 'nicht möglich');
    if (pers.length < 2) return;
    const w = pers.map(l => ({ l, n: dm.get(l.id)[feld] }));
    const mx = Math.max(...w.map(x => x.n)), mn = Math.min(...w.map(x => x.n));
    if (mx - mn > 2) { ungleich.push(name); M('hinweis', kat === 'fruehdienst' ? 'DW05' : 'DW06', name + ' ungleich verteilt: ' + w.filter(x => x.n === mx).map(x => lehrerNameKurz(x.l)).slice(0, 4).join(', ') + ' ' + zahlDe(mx, 1) + '×, ' + w.filter(x => x.n === mn).length + ' Person(en) ' + zahlDe(mn, 1) + '×.', { tab: 'mitarbeitende' }); }
  });
  const veraltet = !!(DI.plan.length && DI.stand && DI.stand !== dienstGrundlagenSignatur(d));
  return { kennzahlen: { minOffen, sollOffen, konflikte, ueberArbeitszeit: ueber.length, langeTage, ungleich: ungleich.length ? ungleich.join(', ') : '', dienste: DI.plan.length, offen: DI.offen.length, veraltet }, meldungen };
}
// Unterrichte, die Klassen mit unterschiedlichen realen Zeiten verbinden (Mehrklassen-Unterricht oder Kopplung)
function zeitprofilKonflikte(d) {
  const out = [];
  if (!d.schule.zeitprofile.length) return out;
  const zc = zeitCache(d);
  const kName = kid => (d.klassen.find(x => x.id === kid) || {}).name || '?';
  const gruppen = new Map();
  d.unterrichte.forEach(u => { if (u.aufgabe || !u.klassen.length) return; const g = u.kopplung ? 'k:' + u.kopplung : 'u:' + u.id; if (!gruppen.has(g)) gruppen.set(g, []); gruppen.get(g).push(u); });
  const H = d.schule.stunden.length;
  gruppen.forEach((us, g) => {
    const kl = [...new Set(us.flatMap(u => u.klassen))];
    // Profil je (Unterricht, Klasse): das Profil des Fachs hat Vorrang vor dem der Klasse
    const paare = us.flatMap(u => u.klassen.map(k => ({ k, pid: zc.pidK(u, k) })));
    const pids = [...new Set(paare.map(x => x.pid))];
    if (pids.length < 2) return;
    // Zeilen, in denen der Unterricht liegt (laut Plan) – sonst alle Unterrichtszeilen
    const pl = d.plan.platzierungen.filter(p => us.some(u => u.id === p.unterricht));
    const zeilen = new Set();
    if (pl.length) pl.forEach(p => { for (let k = 0; k < p.dauer; k++) zeilen.add(p.stunde - 1 + k); });
    else d.schule.stunden.forEach((s, i) => { if (!s.istPause) zeilen.add(i); });
    const abw = [...zeilen].filter(r => r < H).find(r => { const z0 = zc(pids[0])[r]; return pids.some(pid => { const z = zc(pid)[r]; return !z0 !== !z || (z && (z.start !== z0.start || z.end !== z0.end)); }); });
    if (abw === undefined) return;
    const beschr = pids.map(pid => { const z = zc(pid)[abw]; const ks = [...new Set(paare.filter(x => x.pid === pid).map(x => x.k))].map(kName).join('/'); return ks + ' ' + (z ? zeitspanneText(z) : '–'); }).join(' · ');
    const name = g.startsWith('k:') ? 'Kopplung „' + g.slice(2) + '“' : 'Unterricht ' + ((d.faecher.find(f => f.id === us[0].fach) || {}).kuerzel || '') + ' ' + kl.map(kName).join('/');
    out.push({ text: name + ' verbindet Klassen mit unterschiedlichen Unterrichtszeiten (Zeitprofile): ' + beschr + ' in der ' + (d.schule.stunden[abw] ? stundenNummern(d.schule)[abw] + '.' : '?') + ' Stunde.', ziel: { seite: 'unterricht', id: us[0].id } });
  });
  return out;
}
// Nummer der Unterrichtsstunde je Rasterzeile, Pausenzeilen 0: z. B. [1, 2, 0, 3, 4]
function stundenNummern(sch) { let n = 0; return sch.stunden.map(s => s.istPause ? 0 : ++n); }

// Prüft eine geplante Änderung eines Dienstes (Ziehen, Größe ändern, Person tauschen) – harte Konflikte werden nie übernommen
function dienstAenderungPruefen(d, dienst, aenderung, ctx) {
  const x = Object.assign({}, dienst, aenderung || {});
  ctx = ctx || dienstKontext(d, { ohne: dienst.id });
  return dienstKandidatScore(d, x, x.lehrer, ctx);
}
// Automatische Nachplanung nötig? (Grundlagen geändert, Bedarf vorhanden, Stundenplan vorhanden)
function dienstAutoNoetig(d) {
  const DI = d.dienste;
  return !!(DI && DI.auto && DI.bedarfe.length && d.plan.platzierungen.length && DI.stand !== dienstGrundlagenSignatur(d));
}

