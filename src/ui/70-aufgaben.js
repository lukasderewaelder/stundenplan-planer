/* =====================================================================
   5b2. OBERFLÄCHE – Aufgaben (personengebunden, ohne Klasse und ohne Fach)
   z. B. Medienverantwortliche, SV-Beratung, Fachschaftsleitung, Teamsitzung
   Gespeichert als Unterricht mit aufgabe: true, damit Solver und Editor sie wie Blöcke behandeln.
   ===================================================================== */
const aufgabenListe = d => d.unterrichte.filter(u => u.aufgabe);
function aufgabeZeiten(d, u) {
  return d.plan.platzierungen.filter(p => p.unterricht === u.id).sort((a, b) => a.tag - b.tag || a.stunde - b.stunde)
    .map(p => (d.schule.tage[p.tag] || '?') + ' ' + (d.schule.stunden[p.stunde - 1] ? (d.schule.stunden[p.stunde - 1].name || stundeLabel(p.stunde - 1)) : '?') + (p.dauer > 1 ? ' (' + p.dauer + ' UStd.)' : ''));
}
// Feste Termine (Uhrzeit oder Pause) einer Person als Zeile unter dem Lehrerplan
function termineVon(d, lid) {
  const pl = pausenListe(d.schule, d.klassen), out = [];
  d.unterrichte.forEach(u => { if (!u.aufgabe || !u.termine.length || !u.lehrkraefte.some(z => z.lehrer === lid)) return; aufgabeTermine(d, u, pl).forEach(t => out.push({ u, t })); });
  return out.sort((a, b) => a.t.tag - b.t.tag || a.t.start - b.t.start);
}
function terminZeile(d, lid) {
  const l = termineVon(d, lid), gz = gtaZeile(d, 'lehrer', lid);
  if (!l.length) return gz;
  const tz = h('div', { class: 'aufsichtzeile terminzeile' }, h('b', {}, 'Termine (' + l.reduce((s, x) => s + x.t.minuten, 0) + ' min): '),
    l.map((x, i) => [i ? ' · ' : '', terminText(d, x.t) + ' – ' + (x.u.name || x.u.kuerzel || 'Aufgabe')]));
  return gz ? h('div', {}, tz, gz) : tz;
}
async function aufgabeDialog(uid) {
  const d = APP.daten;
  const orig = uid ? findeId(d.unterrichte, uid) : null;
  const u = orig ? JSON.parse(JSON.stringify(orig)) : nUnterricht({ aufgabe: true, name: '', kuerzel: '', farbe: '#7d6bd6', wochenstunden: 1, vorbereitung: false, anrechnung: false, lehrkraefte: [] });
  const personen = new Set(u.lehrkraefte.map(z => z.lehrer));
  const root = h('div', { style: { minWidth: '640px' } });
  const D = d.schule.tage.length, H = d.schule.stunden.length, ST = d.schule.stunden;
  const stdMin = standardMinuten(d.schule), sl = stundenLaengen(d.schule);
  const summe = a => a.reduce((x, y) => x + y, 0);
  const umfang = () => u.einheit === 'zstd' ? u.zeitstunden : u.wochenstunden;
  // ---- Zustand des Dialogs ----
  // modus: 'eingabe' (Umfang je Woche, Verteilung durch die Berechnung) oder 'termine' (Umfang ergibt sich aus festen Terminen)
  // verteilung: 'auto' (gleichmäßig auf die Tage), 'gleich' (gleich lange Blöcke), 'eigen' (einzelne Blocklängen)
  let modus = (!u.wochenstunden && u.termine.length) || (u.bloecke.length && u.fixiert.length === u.bloecke.length && summe(u.bloecke) === u.wochenstunden) ? 'termine' : 'eingabe';
  let rTermine = modus === 'termine' ? u.bloecke.map((b, i) => ({ tag: u.fixiert[i].tag, von: Math.max(0, u.fixiert[i].stunde - 1), bis: Math.min(H - 1, u.fixiert[i].stunde - 1 + b - 1) })) : [];
  let verteilung = !u.bloecke.length ? 'auto' : (u.bloecke.slice(0, -1).every(b => b === u.bloecke[0]) && u.bloecke[u.bloecke.length - 1] <= u.bloecke[0] ? 'gleich' : 'eigen');
  let blockLaenge = u.bloecke.length ? u.bloecke[0] : Math.min(4, Math.max(1, u.wochenstunden || 1));
  const gleichBloecke = (ws, L) => { L = Math.max(1, Math.min(H, L)); if (!(ws > 0)) return []; if (L >= ws) return [ws]; const b = Array(Math.floor(ws / L)).fill(L); if (ws % L) b.push(ws % L); return b; };
  const verteilen = () => { if (verteilung === 'auto') { u.bloecke = []; u.bloeckeWoche = []; } else if (verteilung === 'gleich') { u.bloecke = gleichBloecke(u.wochenstunden, blockLaenge); u.bloeckeWoche = []; } };
  const umfangSetzen = v => {
    v = Math.max(0, Number(String(v).replace(',', '.')) || 0);
    if (u.einheit === 'zstd') { u.zeitstunden = Math.min(60, Math.round(v * 4) / 4); u.wochenstunden = u.zeitstunden > 0 ? Math.min(60, Math.max(1, Math.round(u.zeitstunden * 60 / stdMin))) : 0; }
    else { u.wochenstunden = Math.min(60, Math.round(v)); u.zeitstunden = 0; }
    verteilen();
  };
  const umrechnung = () => {
    if (u.einheit === 'zstd') { const echt = u.wochenstunden * stdMin / 60, rund = Math.abs(echt - u.zeitstunden) > 0.01; return '= ' + u.wochenstunden + ' UStd. im Raster (je ' + zahlDe(stdMin, 1).replace(/,0$/, '') + ' min' + (sl.abw.length ? ' – Durchschnitt Ihres Zeitrasters' : '') + ')' + (rund ? ' – auf ganze UStd. gerundet, das sind ' + zahlDe(echt, 2) + ' h' : ''); }
    return '= ' + zahlDe(u.wochenstunden * stdMin / 60, 2).replace(/,00$/, '').replace(/(,\d)0$/, '$1') + ' h (Zeitstunden zu 60 min)';
  };
  const laengenHilfe = () => sl.abw.length ? hilfe('Die Unterrichtsstunden Ihres Zeitrasters sind nicht gleich lang (meist ' + sl.haeufig + ' min, aber ' + sl.text + '). Umgerechnet wird deshalb mit dem Durchschnitt ' + zahlDe(sl.mittel, 1) + ' min. Ist eine Stunde versehentlich zu lang eingetragen, auf der Seite „Schule & Zeiten“ das Ende korrigieren.') : null;
  const pausen = pausenListe(d.schule, d.klassen);
  const tagOpts = d.schule.tage.map((t, j) => [String(j), TAGE_LANG[t]]);
  const zeilenOpts = (ab, ende) => ST.map((s, j) => j < (ab || 0) || s.istPause ? null : [String(j), (s.name || stundeLabel(j) + ' Std.') + (ende ? (s.ende ? ' bis ' + s.ende : '') : (s.beginn ? ' ab ' + s.beginn : ''))]).filter(Boolean);
  // Dauer eines Termins im Zeitraster in Minuten (von Beginn der ersten bis Ende der letzten Zeile; Pausen dazwischen nur mit „Pausen zählen“)
  const rasterMinuten = r => { let m = 0; for (let j = r.von; j <= r.bis; j++) { const s = ST[j]; if (!s) continue; if (!s.istPause || u.pausenZaehlen) m += s.dauer || 0; if (j < r.bis && u.pausenZaehlen) m += s.pauseDanach || 0; } return m; };
  const uhrMinuten = x => { if (x.pause) { const pa = pausen.find(p => p.key === x.pause); return pa ? Math.max(0, pa.end - pa.start) : 0; } const iv = intervall(x.beginn, x.ende); return iv && iv.end > iv.start ? iv.end - iv.start : 0; };
  const hText = m => zahlDe(m / 60, 2).replace(/,00$/, '').replace(/(,\d)0$/, '$1') + ' h';
  const terminZeileDlg = (x, i) => {
    const zf = (feld, text) => h('input', { type: 'text', class: 'zeitfeld', value: x[feld], placeholder: feld === 'beginn' ? 'von' : 'bis', style: { width: '64px' }, 'aria-label': text, onchange: ev => { const v = zeitNorm(ev.target.value); if (!v) { toast('Bitte eine Uhrzeit wie 14:00 eingeben.', 'err'); ev.target.value = x[feld]; return; } x[feld] = v; ev.target.value = v; zeichne(); } });
    return h('div', { class: 'zeile terminwahl', style: { marginBottom: '4px' } }, h('span', { class: 'terminart' }, icon('uhr', 'k'), ' mit Uhrzeit'),
      sel(tagOpts, String(x.tag), v => { x.tag = Number(v); }, { 'aria-label': 'Tag des Termins' }),
      sel(pausen.map(pa => [pa.key, 'Pause: ' + pa.kurz + ' (' + pa.zeit + ')']).concat([['', 'eigene Uhrzeit …']]), pausen.some(pa => pa.key === x.pause) ? x.pause : '', v => { x.pause = v; zeichne(); }, { 'aria-label': 'Pause oder eigene Uhrzeit', style: { maxWidth: '300px' } }),
      x.pause && pausen.some(pa => pa.key === x.pause) ? null : [zf('beginn', 'Beginn des Termins'), '–', zf('ende', 'Ende des Termins')],
      uhrMinuten(x) ? h('span', { class: 'muted klein' }, hText(uhrMinuten(x))) : null,
      h('button', { class: 'btn icon klein gefahr', 'aria-label': 'Termin entfernen', title: 'Termin entfernen', onclick: () => { u.termine.splice(i, 1); zeichne(); } }, icon('papierkorb')));
  };
  const rasterZeile = (r, i) => h('div', { class: 'zeile terminwahl', style: { marginBottom: '4px' } }, h('span', { class: 'terminart' }, icon('tabelle', 'k'), ' im Zeitraster'),
    sel(tagOpts, String(r.tag), v => { r.tag = Number(v); }, { 'aria-label': 'Tag des Termins im Zeitraster' }),
    'von', sel(zeilenOpts(0), String(r.von), v => { r.von = Number(v); if (r.bis < r.von) r.bis = r.von; zeichne(); }, { 'aria-label': 'Von Stunde' }),
    'bis', sel(zeilenOpts(r.von, true), String(r.bis), v => { r.bis = Number(v); zeichne(); }, { 'aria-label': 'Bis Stunde' }),
    h('span', { class: 'muted klein' }, hText(rasterMinuten(r))),
    h('button', { class: 'btn icon klein gefahr', 'aria-label': 'Termin entfernen', title: 'Termin entfernen', onclick: () => { rTermine.splice(i, 1); zeichne(); } }, icon('papierkorb')));
  const ersteZeile = () => { const j = ST.findIndex(s => !s.istPause); return j < 0 ? 0 : j; };
  const modusKnopf = (k, text) => h('button', { type: 'button', class: modus === k ? 'aktiv' : '', 'aria-pressed': modus === k ? 'true' : 'false', id: 'aufg_modus_' + k, onclick: () => {
    if (modus === k) return;
    if (k === 'termine') { rTermine = u.bloecke.length && u.fixiert.length === u.bloecke.length ? u.bloecke.map((b, i) => ({ tag: u.fixiert[i].tag, von: u.fixiert[i].stunde - 1, bis: Math.min(H - 1, u.fixiert[i].stunde - 1 + b - 1) })) : []; if (!rTermine.length && !u.termine.length) { const j = ersteZeile(); rTermine.push({ tag: 0, von: j, bis: j }); } }
    else { if (rTermine.length) { u.bloecke = rTermine.map(r => r.bis - r.von + 1); u.fixiert = rTermine.map(r => ({ tag: r.tag, stunde: r.von + 1 })); u.wochenstunden = summe(u.bloecke); u.einheit = 'ustd'; u.zeitstunden = 0; verteilung = 'eigen'; } }
    modus = k; zeichne(); } }, text);
  const verteilungsBereich = () => {
    const auto = bloeckeMitWoche(Object.assign({}, u, { bloecke: [] }), null, D, false, 'A');
    const vorschau = b => b.length ? b.length + (b.length === 1 ? ' Block: ' : ' Blöcke: ') + b.join(' · ') : '–';
    const teile = [h('label', { class: 'feld' }, h('span', {}, 'Aufteilung', hilfe('Automatisch: Die Berechnung verteilt den Umfang gleichmäßig auf die Tage. Gleich lange Blöcke: z. B. 20 UStd. Schulleitung in Blöcken zu 4 UStd. Eigene Blöcke: jede Blocklänge einzeln. Ein Block darf beliebig lang sein und über Pausen hinweg reichen (eine Pausenzeile zählt als eine Zeile); mehrere Blöcke dürfen am selben Tag liegen.')),
      sel([['auto', 'automatisch (gleichmäßig auf die Tage)'], ['gleich', 'gleich lange Blöcke'], ['eigen', 'eigene Blocklängen']], verteilung, v => { verteilung = v; if (v === 'eigen' && !u.bloecke.length) u.bloecke = auto.dauer.slice(); verteilen(); zeichne(); }, { id: 'aufg_verteilung', 'aria-label': 'Aufteilung' }))];
    if (verteilung === 'auto') teile.push(h('span', { class: 'klein muted', style: { paddingBottom: '8px' } }, vorschau(auto.dauer)));
    if (verteilung === 'gleich') teile.push(h('label', { class: 'feld' }, 'Blocklänge', h('span', { class: 'zeile eng' }, h('input', { type: 'number', min: 1, max: H, value: blockLaenge, id: 'aufg_blocklaenge', style: { width: '64px' }, 'aria-label': 'Blocklänge in UStd.', onchange: ev => { blockLaenge = Math.max(1, Math.min(H, Math.round(Number(ev.target.value) || 1))); verteilen(); zeichne(); } }), 'UStd.')),
      h('span', { class: 'klein muted', style: { paddingBottom: '8px' } }, '→ ' + vorschau(u.bloecke)));
    const zeilen = [h('div', { class: 'zeile', style: { gap: '14px', alignItems: 'flex-end', marginTop: '10px' } }, teile)];
    if (verteilung === 'eigen') {
      const s = summe(u.bloecke);
      zeilen.push(h('div', { class: 'zeile blockliste', style: { marginTop: '8px', gap: '6px' } },
        u.bloecke.map((b, i) => h('span', { class: 'blockchip' }, h('span', { class: 'muted klein' }, 'Block ' + (i + 1)),
          h('input', { type: 'number', min: 1, max: H, value: b, style: { width: '56px' }, 'aria-label': 'Länge von Block ' + (i + 1), onchange: ev => { u.bloecke[i] = Math.max(1, Math.min(H, Math.round(Number(ev.target.value) || 1))); u.bloeckeWoche = []; zeichne(); } }),
          h('button', { class: 'btn icon klein', type: 'button', 'aria-label': 'Block ' + (i + 1) + ' entfernen', title: 'Block entfernen', onclick: () => { u.bloecke.splice(i, 1); u.bloeckeWoche = []; zeichne(); } }, icon('x')))),
        h('button', { class: 'btn klein', type: 'button', id: 'aufg_block_neu', onclick: () => { u.bloecke.push(Math.max(1, Math.min(H, u.wochenstunden - summe(u.bloecke) || 1))); u.bloeckeWoche = []; zeichne(); } }, '+ Block'),
        h('span', { class: 'badge ' + (s === u.wochenstunden ? 'ok' : 'warn') }, 'Summe ' + s + ' von ' + u.wochenstunden + ' UStd.')));
      if (u.bloecke.length && s !== u.wochenstunden) zeilen.push(h('div', { class: 'hinweis warn', style: { marginTop: '6px' } }, 'Die Blöcke ergeben ' + s + ' UStd., der Umfang beträgt ' + u.wochenstunden + '. ', h('button', { class: 'btn klein', type: 'button', onclick: () => { u.wochenstunden = s; u.einheit = 'ustd'; u.zeitstunden = 0; zeichne(); } }, 'Umfang auf ' + s + ' setzen')));
    }
    return zeilen;
  };
  const zeichne = () => {
    const L = lehrerAlphabetisch(d.lehrer);
    const terminSumme = summe(rTermine.map(rasterMinuten)) + summe(u.termine.map(uhrMinuten));
    leeren(root).append(...[
      h('div', { class: 'zeile', style: { gap: '14px', alignItems: 'flex-end' } },
        h('label', { class: 'feld' }, 'Bezeichnung', h('input', { type: 'text', value: u.name, placeholder: 'z. B. Medienverantwortliche', style: { width: '240px' }, oninput: ev => { u.name = ev.target.value; } })),
        h('label', { class: 'feld' }, h('span', {}, 'Kürzel im Plan', hilfe('Kurzer Text auf der Kachel im Lehrerplan, z. B. „Medien“.')), h('input', { type: 'text', value: u.kuerzel, maxlength: 12, placeholder: 'z. B. Medien', style: { width: '110px' }, oninput: ev => { u.kuerzel = ev.target.value; } })),
        h('label', { class: 'feld' }, 'Farbe', h('input', { type: 'color', value: u.farbe, oninput: ev => { u.farbe = ev.target.value; } })),
        h('label', { class: 'feld' }, 'Raum (optional)', sel([['', 'kein Raum nötig']].concat(raumOpts()), u.raum, v => { u.raum = v; }))),
      h('h3', {}, 'Person(en)', hilfe('Bei mehreren Personen liegt die Aufgabe für alle zur selben Zeit (z. B. Teamsitzung). Für getrennte Termine je Person eine eigene Aufgabe anlegen.')),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '4px 10px' } },
        L.map(l => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: personen.has(l.id), onchange: ev => { if (ev.target.checked) personen.add(l.id); else personen.delete(l.id); } }), h('b', {}, l.kuerzel || '?'), ' ' + (l.name || '') + (l.ausgebildet === false ? ' (' + artText(l) + ')' : '')))),
      h('h3', {}, 'Umfang und Zeiten'),
      h('div', { class: 'segment', role: 'group', 'aria-label': 'Wie wird der Umfang bestimmt?' }, modusKnopf('eingabe', 'Umfang eingeben'), modusKnopf('termine', 'Aus festen Terminen')),
      modus === 'eingabe' ? [
        h('div', { class: 'zeile', style: { gap: '14px', alignItems: 'flex-end', marginTop: '10px' } },
          h('label', { class: 'feld' }, h('span', {}, 'Umfang je Woche', hilfe('Wahlweise in Unterrichtsstunden (UStd., Zeilen des Zeitrasters) oder in Zeitstunden (h, zu 60 Minuten). Das Programm rechnet in die andere Einheit um; geplant wird in Zeilen des Zeitrasters.')),
            h('span', { class: 'zeile eng' },
              h('input', { type: 'number', min: 0, max: 60, step: u.einheit === 'zstd' ? 0.25 : 1, value: umfang(), id: 'aufg_umfang', style: { width: '80px' }, 'aria-label': 'Umfang je Woche', onchange: ev => { umfangSetzen(ev.target.value); zeichne(); } }),
              sel([['ustd', 'Unterrichtsstunden (UStd.)'], ['zstd', 'Zeitstunden (h)']], u.einheit, v => {
                if (v === u.einheit) return;
                if (v === 'zstd') { u.einheit = 'zstd'; u.zeitstunden = Math.round(u.wochenstunden * stdMin / 60 * 4) / 4; u.wochenstunden = u.zeitstunden > 0 ? Math.min(60, Math.max(1, Math.round(u.zeitstunden * 60 / stdMin))) : 0; }
                else { u.einheit = 'ustd'; u.zeitstunden = 0; }
                verteilen(); zeichne();
              }, { id: 'aufg_einheit', 'aria-label': 'Einheit des Umfangs' }))),
          h('span', { class: 'klein muted', id: 'aufg_umrechnung', style: { paddingBottom: '8px' } }, umrechnung(), laengenHilfe())),
        verteilungsBereich(),
        h('details', { class: 'aufg_mehr', open: u.fixiert.length || u.termine.length ? true : null, style: { marginTop: '10px' } },
          h('summary', {}, 'Feste Zeiten und Termine (optional)'),
          h('h4', {}, 'Feste Zeiten für einzelne Blöcke', hilfe('Vorgegebene Lage im Zeitraster, z. B. „Dienstag, 7. Stunde“. Die erste Angabe gilt für den ersten Block usw. Ohne Angabe sucht die Berechnung passende Zeiten. Aufgaben dürfen auch nach dem Unterrichtsschluss liegen.')),
          h('div', {}, u.fixiert.map((x, i) => h('div', { class: 'zeile', style: { marginBottom: '4px' } }, 'Block ' + (i + 1) + ':',
            sel(tagOpts, String(x.tag), v => { x.tag = Number(v); }),
            sel(ST.map((s, j) => s.istPause ? null : [String(j + 1), s.name || stundeLabel(j) + ' Stunde']).filter(Boolean), String(x.stunde), v => { x.stunde = Number(v); }),
            h('button', { class: 'btn icon klein gefahr', 'aria-label': 'Feste Zeit entfernen', onclick: () => { u.fixiert.splice(i, 1); zeichne(); } }, icon('papierkorb')))),
            h('button', { class: 'btn klein', onclick: () => { u.fixiert.push({ tag: 0, stunde: ersteZeile() + 1 }); zeichne(); } }, '+ Feste Zeit')),
          h('h4', {}, 'Zusätzliche Termine mit Uhrzeit – auch in Pausen', hilfe('Feste Termine außerhalb des Stundenrasters, z. B. eine Besprechung in der Frühstückspause oder nach dem Unterricht. Die Berechnung verschiebt sie nicht. Die Personen bekommen in dieser Zeit keine Aufsicht; Unterrichtsstunden, die sich mit dem Termin überschneiden, bleiben für sie frei. Die Zeit zählt zur Wochenarbeitszeit.')),
          h('div', {}, u.termine.map(terminZeileDlg),
            h('button', { class: 'btn klein', onclick: () => { u.termine.push({ tag: 0, pause: pausen.length ? pausen[0].key : '', beginn: '', ende: '' }); zeichne(); } }, '+ Termin')))
      ] : [
        h('p', { class: 'muted klein', style: { margin: '8px 0' } }, 'Der Umfang ergibt sich aus den Terminen – nichts weiter einzugeben. Termine im Zeitraster belegen ganze Stunden (auch nach dem Unterrichtsschluss); Termine mit Uhrzeit liegen auch außerhalb des Rasters oder in einer Pause.'),
        h('div', { id: 'aufg_termine' }, rTermine.map(rasterZeile), u.termine.map(terminZeileDlg)),
        h('div', { class: 'zeile', style: { marginTop: '6px' } },
          h('button', { class: 'btn klein', type: 'button', id: 'aufg_termin_raster', onclick: () => { const j = ersteZeile(); rTermine.push({ tag: 0, von: j, bis: j }); zeichne(); } }, '+ Termin im Zeitraster'),
          h('button', { class: 'btn klein', type: 'button', id: 'aufg_termin_uhr', onclick: () => { u.termine.push({ tag: 0, pause: '', beginn: '14:00', ende: '15:00' }); zeichne(); } }, '+ Termin mit Uhrzeit oder in einer Pause'),
          h('div', { class: 'rechts' }),
          h('span', { class: 'badge ' + (terminSumme ? 'ok' : 'warn'), id: 'aufg_terminsumme' }, terminSumme ? 'Umfang: ' + hText(terminSumme) + ' je Woche' : 'Noch kein Termin'))
      ],
      h('div', { class: 'zeile', style: { gap: '18px', marginTop: '12px' } },
        h('label', { class: 'check', title: 'Reicht ein Block über eine Pause, zählt auch die Pause zur Arbeitszeit (durchgehende Tätigkeit, z. B. Schulleitung). Ohne Haken zählen nur die Stunden selbst.' }, h('input', { type: 'checkbox', checked: u.pausenZaehlen, id: 'aufg_pausen', onchange: ev => { u.pausenZaehlen = ev.target.checked; zeichne(); } }), 'Pausen im Block zählen als Arbeitszeit'),
        h('label', { class: 'check', title: 'Mit Haken zählen die Stunden zusätzlich zu den Unterrichtsstunden der Person (Unterrichtsdeputat), z. B. als Anrechnungsstunden. Ohne Haken zählt die Aufgabe nur zur Arbeitszeit – das Deputat bleibt frei für Unterricht.' }, h('input', { type: 'checkbox', checked: u.anrechnung, id: 'aufg_anrechnung', onchange: ev => { u.anrechnung = ev.target.checked; } }), 'auf das Unterrichtsdeputat anrechnen')),
      h('p', { class: 'muted klein', style: { marginTop: '10px' } }, 'Aufgaben belegen Zeit im Lehrerplan (keine Klasse, kein Fach). Einen eingegebenen Umfang plant die Berechnung in freie Zeiten der Person ein – auch über Pausen hinweg, nach dem Unterrichtsschluss und mit mehreren Blöcken am selben Tag. Feste Termine liegen genau dort, wo sie eingetragen sind. Beides zählt mit seiner Dauer zur Wochenarbeitszeit (ohne Vorbereitung); zum Unterrichtsdeputat zählt eine Aufgabe nur mit Haken.')
    ].flat(Infinity).filter(x => x !== null && x !== undefined && x !== false));
  };
  zeichne();
  // Eingaben des gewählten Modus in die Aufgabe übernehmen
  const uebernehmen = () => {
    if (modus === 'termine') {
      u.bloecke = rTermine.map(r => r.bis - r.von + 1); u.bloeckeWoche = [];
      u.fixiert = rTermine.map(r => ({ tag: r.tag, stunde: r.von + 1 }));
      u.wochenstunden = summe(u.bloecke); u.einheit = 'ustd'; u.zeitstunden = 0;
    } else verteilen();
  };
  const pruefen = () => {
    uebernehmen();
    if (!u.name.trim()) { toast('Bitte eine Bezeichnung eingeben.', 'err'); return false; }
    if (!personen.size) { toast('Bitte mindestens eine Person wählen.', 'err'); return false; }
    if (modus === 'termine' && !rTermine.length && !u.termine.length) { toast('Bitte mindestens einen Termin eintragen.', 'err'); return false; }
    if (!u.wochenstunden && !u.termine.length) { toast('Bitte einen Umfang je Woche oder mindestens einen Termin angeben.', 'err'); return false; }
    if (u.bloecke.length && summe(u.bloecke) !== u.wochenstunden) { toast('Die Blöcke ergeben ' + summe(u.bloecke) + ' UStd., der Umfang ' + u.wochenstunden + '. Bitte angleichen.', 'err'); return false; }
    if (u.bloecke.some(b => b > H)) { toast('Ein Block ist länger als der Tag (' + H + ' Zeilen im Zeitraster).', 'err'); return false; }
    for (const [i, x] of u.termine.entries()) {
      if (x.pause && pausen.some(pa => pa.key === x.pause)) continue;
      const iv = intervall(x.beginn, x.ende);
      if (!iv || iv.end <= iv.start) { toast('Termin mit Uhrzeit ' + (i + 1) + ': bitte Beginn und Ende eintragen (Ende nach dem Beginn).', 'err'); return false; }
      x.pause = '';
    }
    return true;
  };
  const knoepfe = [{ text: 'Abbrechen', wert: false }];
  if (orig) knoepfe.push({ text: 'Löschen', wert: 'loeschen', art: 'gefahr' });
  knoepfe.push({ text: 'Speichern', wert: true, art: 'primaer', vorher: pruefen });
  const w = await dialog({ titel: orig ? 'Aufgabe bearbeiten' : 'Neue Aufgabe', inhalt: root, knoepfe, breite: '760px' });
  if (w === 'loeschen') { aendernMitUndo('Aufgabe gelöscht', dd => { dd.unterrichte = dd.unterrichte.filter(x => x.id !== uid); dd.plan.platzierungen = dd.plan.platzierungen.filter(p => p.unterricht !== uid); }, null, 'Aufgabe gelöscht.'); return; }
  if (!w) return;
  u.name = u.name.trim(); u.kuerzel = u.kuerzel.trim();
  const alt = new Map(u.lehrkraefte.map(z => [z.lehrer, z]));
  u.lehrkraefte = [...personen].map(id => alt.get(id) || nLehrkraftZuordnung({ lehrer: id, rolle: 'fach', modus: 'immer' })).map(z => Object.assign(z, { rolle: 'fach', modus: 'immer', zwang: false }));
  const bSig = x => { const bb = bloeckeAlle(x).get(u.id); return bb ? blockText(bb) : ''; };
  aendern(orig ? 'Aufgabe bearbeitet: ' + u.name : 'Aufgabe angelegt: ' + u.name, dd => {
    const i = dd.unterrichte.findIndex(x => x.id === u.id);
    if (i >= 0) { const vor = bSig(dd); dd.unterrichte[i] = u; if (vor !== bSig(dd)) dd.plan.platzierungen = dd.plan.platzierungen.filter(p => p.unterricht !== u.id); }
    else dd.unterrichte.push(u);
  }, { normalisieren: true });
  if (!orig && APP.daten.plan.platzierungen.length) toast('Aufgabe angelegt. Sie steht im Plan-Editor in der Ablage des Lehrerplans – dort einplanen oder neu berechnen.', 'ok', 7000);
}
SEITEN_RENDER.aufgaben = () => {
  const d = APP.daten;
  const liste = aufgabenListe(d);
  const bl = bloeckeAlle(d);
  const plan = d.plan.platzierungen.length > 0;
  const pl = pausenListe(d.schule, d.klassen);
  const stdMin = standardMinuten(d.schule);
  return [
    seitenkopf('Aufgaben', 'Personengebundene Tätigkeiten ohne Klasse und ohne Fach, z. B. Schulleitung, Medienverantwortliche, SV-Beratung oder Teamsitzungen. Der Umfang wird in Unterrichtsstunden (UStd.) oder Zeitstunden (h) angegeben und von der Berechnung frei in den Lehrerplan gelegt – auch als langer Block über Pausen hinweg. Feste Termine liegen zu einer Uhrzeit oder in einer Pause (z. B. Besprechung in der Frühstückspause).',
      h('button', { class: 'btn primaer', onclick: () => aufgabeDialog(null) }, '+ Neue Aufgabe')),
    liste.length ? h('div', { class: 'tabwrap' }, h('table', { class: 'tab' },
      h('thead', {}, h('tr', {}, ['', 'Bezeichnung', 'Kürzel', 'Person(en)', 'Umfang/Woche', 'Blöcke', 'Raum', 'Deputat', plan ? 'Im Plan / Termine' : 'Feste Zeiten / Termine', ''].map(t => h('th', {}, t)))),
      h('tbody', {}, liste.map(u => {
        const b = bl.get(u.id);
        const termine = aufgabeTermine(d, u, pl).map(t => terminText(d, t));
        const zeiten = (plan ? aufgabeZeiten(d, u) : u.fixiert.map(x => (d.schule.tage[x.tag] || '?') + ' ' + stundeName(x.stunde - 1))).concat(termine);
        return h('tr', { 'data-id': u.id },
          h('td', {}, h('span', { class: 'fachpunkt', style: { background: u.farbe, width: '12px', height: '12px' } })),
          h('td', {}, h('b', {}, u.name)),
          h('td', {}, u.kuerzel || h('span', { class: 'muted' }, '–')),
          h('td', {}, u.lehrkraefte.length ? u.lehrkraefte.map(z => { const l = lehrerVon(z.lehrer); return h('span', { class: 'chip', title: l ? l.name : '' }, l ? l.kuerzel : '?'); }) : h('span', { class: 'badge err' }, 'keine Person')),
          h('td', { class: 'zahl', title: u.wochenstunden + ' UStd. = ' + zahlDe(u.wochenstunden * stdMin / 60, 1) + ' h' }, u.einheit === 'zstd' ? [zahlDe(u.zeitstunden, 2).replace(/,00$/, '').replace(/(,\d)0$/, '$1') + ' h', h('span', { class: 'muted klein' }, ' = ' + u.wochenstunden + ' UStd.')] : [u.wochenstunden + ' UStd.', h('span', { class: 'muted klein' }, ' = ' + zahlDe(u.wochenstunden * stdMin / 60, 1) + ' h')]),
          h('td', {}, b ? blockText(b) + (u.bloecke.length ? '' : ' (auto)') : ''),
          h('td', {}, u.raum ? ((raumVon(u.raum) || {}).name || u.raum) : h('span', { class: 'muted' }, '–')),
          h('td', { title: u.anrechnung ? 'zählt zum Unterrichtsdeputat' : 'zählt nur zur Arbeitszeit' }, u.anrechnung ? '✓ zählt' : h('span', { class: 'muted' }, 'nein')),
          h('td', { class: 'klein' }, zeiten.length ? zeiten.join(', ') : h('span', { class: 'muted' }, plan && u.wochenstunden ? 'nicht platziert' : '–'), plan && u.wochenstunden && zeiten.length === termine.length && termine.length ? h('span', { class: 'muted' }, ' · Stunden nicht platziert') : null),
          h('td', { class: 'aktion' },
            h('button', { class: 'btn klein', onclick: () => aufgabeDialog(u.id) }, 'Bearbeiten'),
            h('button', { class: 'btn icon klein', title: 'Duplizieren', 'aria-label': 'Duplizieren', onclick: () => aendern('Aufgabe dupliziert', dd => { const x = JSON.parse(JSON.stringify(findeId(dd.unterrichte, u.id))); x.id = neueId('a'); x.fixiert = []; x.name = x.name + ' (Kopie)'; dd.unterrichte.push(x); }) }, icon('kopieren')),
            h('button', { class: 'btn icon klein gefahr', title: 'Löschen', 'aria-label': 'Löschen', onclick: () => aendernMitUndo('Aufgabe gelöscht', dd => { dd.unterrichte = dd.unterrichte.filter(x => x.id !== u.id); dd.plan.platzierungen = dd.plan.platzierungen.filter(p => p.unterricht !== u.id); }, null, 'Aufgabe „' + u.name + '“ gelöscht.') }, icon('papierkorb'))));
      })))) : h('div', { class: 'karte' }, leerZustand({ icon: 'aufgabe', titel: 'Noch keine Aufgaben', text: 'Aufgaben sind Tätigkeiten ohne Klasse und ohne Fach – zum Beispiel „Medienverantwortliche, 2 UStd., Neumann“ oder eine wöchentliche Teamsitzung.', aktion: { text: '+ Erste Aufgabe anlegen', tun: () => aufgabeDialog(null) } })),
    h('div', { class: 'hinweis', style: { marginTop: '14px' } }, 'Aufgaben erscheinen nur im Lehrer- und ggf. Raumplan, nicht in Klassenplänen. Sie zählen zur Wochenarbeitszeit und zur Höchstarbeitszeit je Tag, aber nicht zu „max. Std./Tag“ und nicht zu den Blockregeln des Unterrichts. Im Plan-Editor lassen sie sich wie Unterricht verschieben, fixieren und per „Ziehen & zuordnen“ einer anderen Person geben.')
  ];
};

