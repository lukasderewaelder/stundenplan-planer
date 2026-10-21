// ---------- Bearbeitbare Tabelle (Stammdaten) ----------
/* cfg: { key, titel, zeilen(d) → Array, spalten: [{k, titel, typ, breite, opts, hilfe, get, set, render, sortWert}],
          neu(d) → Objekt, loeschen(d, zeile) → {text, tun(d)} , suchtext(zeile), excel: {spalten:[k…], neu(werte) → Objekt} } */
function tabelle(cfg) {
  const st = APP.tabellen[cfg.key] || (APP.tabellen[cfg.key] = { suche: '', sort: null, dir: 1 });
  if (!st.auswahl) st.auswahl = new Set();
  // Ansichten: benannte Spaltenauswahlen (z. B. „Kompakt“, „Alle Spalten“). Massenänderungen kennen immer alle Spalten.
  const ansichten = cfg.ansichten || null;
  if (ansichten) { const gemerkt = (APP.meta.tabAnsicht || {})[cfg.key]; if (!st.ansicht) st.ansicht = gemerkt; if (!ansichten.some(a => a.k === st.ansicht)) st.ansicht = ansichten[0].k; }
  const ansicht = ansichten ? ansichten.find(a => a.k === st.ansicht) : null;
  // Master-Detail (cfg.detail): links eine schlanke Liste, rechts alle Angaben des gewählten Eintrags in Abschnitten.
  // Die breite Tabelle bleibt als „Tabelle“ umschaltbar; Suche, Sortierung, Massenaktionen und Excel-Einfügen gelten für beide.
  const D = cfg.detail || null;
  const md = !!D && ((APP.meta.tabModus || {})[cfg.key] || 'detail') === 'detail';
  const modusSetzen = m => { APP.meta.tabModus = Object.assign({}, APP.meta.tabModus, { [cfg.key]: m }); metaSpeichern(); render(); };
  const spAlle = cfg.spalten.filter(sp => !sp.versteckt);
  const spSicht = spAlle.filter(sp => !ansicht || ansicht.spalten.includes(sp.k));
  const zeilenAlle = cfg.zeilen(APP.daten);
  const alleIds = new Set(zeilenAlle.map(z => z.id));
  [...st.auswahl].forEach(id => { if (!alleIds.has(id)) st.auswahl.delete(id); });
  if (md && APP.markiere && alleIds.has(APP.markiere)) st.detail = APP.markiere; // Sprung von einer Meldung oder neue Zeile: gleich die Details zeigen
  let sichtbar = [];
  const wrap = h('div', {});
  const suche = h('input', { type: 'search', placeholder: 'Suchen …', value: st.suche, 'aria-label': 'Tabelle durchsuchen', oninput: ev => { st.suche = ev.target.value; zeichneKoerper(); } });
  const neueZeile = () => { let neuId; aendern(cfg.titel + ': neue Zeile', d => { const o = cfg.neu(d); neuId = o.id; cfg.zeilen(d).push(o); }); APP.markiere = neuId; render(); if (md) { const f = $('#inhalt .md-detail input[type=text]'); if (f) { f.focus(); f.select(); } } };
  const dupliziere = z => { let neuId; aendern(cfg.titel + ': Zeile dupliziert', d => { const quelle = findeId(cfg.zeilen(d), z.id); const kopie = cfg.duplizieren ? cfg.duplizieren(d, quelle) : Object.assign(JSON.parse(JSON.stringify(quelle)), { id: neueId(z.id.split('_')[0] || 'x') }); neuId = kopie.id; const liste = cfg.zeilen(d); liste.splice(liste.indexOf(quelle) + 1, 0, kopie); }); APP.markiere = neuId; render(); };
  const werkzeuge = h('div', { class: 'tabelle-werkzeuge' },
    h('button', { class: 'btn', onclick: neueZeile }, '+ Neue Zeile'),
    cfg.excel ? h('button', { class: 'btn', onclick: () => excelEinfuegen(cfg) }, 'Aus Excel einfügen') : null,
    ...(cfg.extraKnoepfe || []),
    D ? h('span', { class: 'segment klein moduswahl', role: 'group', 'aria-label': 'Darstellung' },
      [['detail', 'Liste mit Details', 'Links die Liste, rechts alle Angaben des gewählten Eintrags'], ['tabelle', 'Tabelle', 'Alle Einträge als breite Tabelle – zum Vergleichen und für viele Änderungen auf einmal']].map(([m, t, tip]) => h('button', { type: 'button', class: (md ? 'detail' : 'tabelle') === m ? 'aktiv' : '', 'aria-pressed': (md ? 'detail' : 'tabelle') === m ? 'true' : 'false', title: tip, onclick: () => modusSetzen(m) }, t))) : null,
    ansichten && !md ? h('span', { class: 'zeile eng ansichtwahl', role: 'group', 'aria-label': 'Ansicht der Tabelle' }, h('span', { class: 'klein muted' }, 'Spalten:'),
      ansichten.map(a => h('button', { class: 'btn klein' + (a.k === st.ansicht ? ' aktiv' : ''), 'aria-pressed': a.k === st.ansicht ? 'true' : 'false', title: a.hilfe || null, onclick: () => { st.ansicht = a.k; APP.meta.tabAnsicht = Object.assign({}, APP.meta.tabAnsicht, { [cfg.key]: a.k }); metaSpeichern(); render(); } }, a.titel))) : null,
    h('div', { class: 'rechts' }), suche,
    h('span', { class: 'muted klein' }, zeilenAlle.length + (zeilenAlle.length === 1 ? ' Eintrag' : ' Einträge')));
  const leiste = h('div', { class: 'auswahlleiste', role: 'region', 'aria-label': 'Aktionen für die Auswahl' });
  const alleBox = h('input', { type: 'checkbox', 'aria-label': 'Alle sichtbaren Zeilen auswählen', title: 'Alle sichtbaren Zeilen auswählen', onchange: ev => { sichtbar.forEach(id => { if (ev.target.checked) st.auswahl.add(id); else st.auswahl.delete(id); }); zeichneKoerper(); } });
  const tbody = h('tbody');
  const mdListe = h('ul', { class: 'md-liste' }), mdDetail = h('div', { class: 'md-detail' });
  const kopf = h('tr', {}, h('th', { style: { width: '28px' } }, md ? null : alleBox), spSicht.map(sp => h('th', {
    class: (sp.sortierbar === false ? '' : 'sort') + (sp.typ === 'zahl' ? ' zahl' : ''), style: sp.breite ? { width: sp.breite } : null, title: sp.hilfe || null,
    onclick: sp.sortierbar === false ? null : () => { if (st.sort === sp.k) st.dir = -st.dir; else { st.sort = sp.k; st.dir = 1; } render(); }
  }, sp.titel, st.sort === sp.k ? (st.dir > 0 ? ' ▲' : ' ▼') : '', sp.hilfe ? hilfe(sp.hilfe) : null)), h('th', {}, ''));
  function zeichneLeiste() {
    const n = st.auswahl.size;
    leiste.hidden = !n;
    if (!n) return leeren(leiste);
    const ids = [...st.auswahl];
    const felder = spAlle.filter(sp => (['text', 'zahl', 'bool', 'select', 'farbe'].includes(sp.typ) && sp.masse !== false) || sp.masse);
    let feldK = felder.length ? felder[0].k : null;
    const wertBox = h('span', {});
    let wertEl = null;
    const zeichneWert = () => {
      const sp = felder.find(x => x.k === feldK); leeren(wertBox); if (!sp) return;
      const typ = sp.masse && sp.masse.typ ? sp.masse.typ : sp.typ;
      const opts = sp.masse && sp.masse.opts ? sp.masse.opts : (typeof sp.opts === 'function' ? sp.opts(findeId(zeilenAlle, ids[0]) || {}) : sp.opts);
      if (typ === 'zahl') wertEl = h('input', { type: 'number', min: sp.min ?? 0, max: sp.max ?? 999, step: sp.step || 1, value: sp.masse && sp.masse.leerNull ? '' : 0, placeholder: sp.masse && sp.masse.leerNull ? 'leer = keine Angabe' : null, title: sp.masse && sp.masse.leerNull ? 'Leer lassen = keine Angabe (keine Grenze); 0 = wirklich 0' : null, 'aria-label': 'Neuer Wert' });
      else if (typ === 'bool') wertEl = sel([['1', 'ja / an'], ['0', 'nein / aus']], '1', () => {}, { 'aria-label': 'Neuer Wert' });
      else if (typ === 'select') wertEl = sel(opts || [], (opts && opts[0] ? opts[0][0] : ''), () => {}, { 'aria-label': 'Neuer Wert' });
      else if (typ === 'farbe') wertEl = h('input', { type: 'color', value: '#9aa9c2', 'aria-label': 'Neuer Wert' });
      else wertEl = h('input', { type: 'text', list: sp.liste || null, 'aria-label': 'Neuer Wert', style: { width: '150px' } });
      wertBox.append(wertEl);
    };
    const uebernehmen = () => {
      const sp = felder.find(x => x.k === feldK); if (!sp || !wertEl) return;
      const typ = sp.masse && sp.masse.typ ? sp.masse.typ : sp.typ;
      let v = wertEl.value;
      if (typ === 'zahl') { if (String(v).trim() === '' && sp.masse && sp.masse.leerNull) v = null; else { v = Number(v); if (!Number.isFinite(v)) return; } }
      if (typ === 'bool') v = v === '1';
      if (typ === 'select' && sp.leerNull && v === '') v = null;
      if (typ === 'text') v = v.trim();
      aendern(cfg.titel + ': ' + sp.titel + ' für ' + ids.length + ' Zeilen', d => { ids.forEach(id => { const zz = findeId(cfg.zeilen(d), id); if (!zz) return; if (sp.masse && sp.masse.set) sp.masse.set(zz, v, d); else if (sp.set) sp.set(zz, v, d); else zz[sp.k] = v; }); }, { normalisieren: true });
      toast(sp.titel + ' für ' + ids.length + ' Einträge gesetzt.', 'ok');
    };
    zeichneWert();
    leeren(leiste).append(
      h('strong', {}, n + ' ausgewählt'),
      h('button', { class: 'btn klein gefahr', onclick: () => massenLoeschen(cfg, ids) }, 'Löschen'),
      felder.length ? h('span', { class: 'zeile eng' }, h('span', { class: 'klein' }, 'Feld setzen:'), sel(felder.map(sp => [sp.k, sp.titel]), feldK, v => { feldK = v; zeichneWert(); }, { 'aria-label': 'Feld' }), wertBox, h('button', { class: 'btn klein', onclick: uebernehmen }, 'Übernehmen')) : null,
      ...(cfg.auswahlAktionen || []).map(a => h('button', { class: 'btn klein', onclick: () => a.tun(ids) }, a.text)),
      h('button', { class: 'btn klein rechts', onclick: () => { st.auswahl.clear(); zeichneKoerper(); } }, 'Auswahl aufheben'));
  }
  // gefilterte und sortierte Zeilen (für Tabelle und Liste gleich)
  function zeilenSicht() {
    let zeilen = cfg.zeilen(APP.daten).slice();
    const q = st.suche.trim().toLowerCase();
    if (q) zeilen = zeilen.filter(z => (cfg.suchtext ? cfg.suchtext(z) : JSON.stringify(z)).toLowerCase().includes(q));
    if (st.sort) {
      const sp = cfg.spalten.find(x => x.k === st.sort);
      const w = z => sp && sp.sortWert ? sp.sortWert(z) : (sp && sp.get ? sp.get(z) : z[st.sort]);
      zeilen.sort((a, b) => { const x = w(a), y = w(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'de', { numeric: true })) * st.dir; });
    }
    return { zeilen, q };
  }
  const leer = () => { const L = cfg.leer || {}; return leerZustand({ icon: L.icon || 'liste', titel: L.titel || 'Noch keine Einträge', text: L.text || 'Mit „+ Neue Zeile“ entsteht der erste Eintrag.', aktion: { text: L.neu || '+ Erste Zeile anlegen', tun: neueZeile }, zweit: [cfg.excel ? { text: 'Aus Excel einfügen', tun: () => excelEinfuegen(cfg) } : null].concat(L.zweit || []) }); };
  function zeichneKoerper() {
    if (md) return zeichneMD();
    leeren(tbody);
    const { zeilen, q } = zeilenSicht();
    sichtbar = zeilen.map(z => z.id);
    zeilen.forEach(z => {
      const gew = st.auswahl.has(z.id);
      const tr = h('tr', { 'data-id': z.id, class: gew ? 'gewaehlt' : '' });
      tr.append(h('td', {}, h('input', { type: 'checkbox', checked: gew, 'aria-label': 'Zeile auswählen', onchange: ev => { if (ev.target.checked) st.auswahl.add(z.id); else st.auswahl.delete(z.id); tr.classList.toggle('gewaehlt', ev.target.checked); zeichneLeiste(); alleStatus(); } })));
      spSicht.forEach(sp => tr.append(h('td', { class: sp.typ === 'zahl' ? 'zahl' : '' }, zelle(cfg, sp, z))));
      tr.append(h('td', { class: 'aktion' },
        h('button', { class: 'btn icon klein', title: 'Zeile duplizieren', 'aria-label': 'Zeile duplizieren', onclick: () => dupliziere(z) }, icon('kopieren')),
        h('button', { class: 'btn icon klein gefahr', title: 'Zeile löschen', 'aria-label': 'Zeile löschen', onclick: () => zeileLoeschen(cfg, z.id) }, icon('papierkorb'))));
      tbody.append(tr);
    });
    if (!zeilen.length) tbody.append(h('tr', { class: 'leerzeile' }, h('td', { colspan: spSicht.length + 2 }, q ? h('div', { class: 'muted', style: { padding: '14px' } }, 'Keine Treffer für „' + st.suche.trim() + '“.') : leer())));
    zeichneLeiste(); alleStatus();
  }
  // Master-Detail: Liste links, Details rechts
  function zeichneMD() {
    const { zeilen, q } = zeilenSicht();
    sichtbar = zeilen.map(z => z.id);
    if (!zeilen.some(z => z.id === st.detail)) st.detail = zeilen.length ? zeilen[0].id : null;
    const waehle = (id, fokus) => { st.detail = id; zeichneMD(); if (fokus) { const b = mdListe.querySelector('li[data-id="' + CSS.escape(id) + '"] .md-wahl'); if (b) b.focus(); } };
    leeren(mdListe);
    zeilen.forEach((z, i) => {
      const gew = st.auswahl.has(z.id), aktiv = st.detail === z.id;
      const li = h('li', { 'data-id': z.id, class: 'md-zeile' + (aktiv ? ' aktiv' : '') + (gew ? ' gewaehlt' : '') },
        h('button', { class: 'md-wahl', type: 'button', 'aria-current': aktiv ? 'true' : null, onclick: () => waehle(z.id, true),
          onkeydown: ev => { if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return; const n = zeilen[i + (ev.key === 'ArrowDown' ? 1 : -1)]; if (n) { ev.preventDefault(); waehle(n.id, true); } } },
          h('span', { class: 'md-name' }, D.titel(z) || h('span', { class: 'muted' }, D.ohneName || '(ohne Namen)')), h('span', { class: 'md-unter' }, D.unter ? D.unter(z) : ''), h('span', { class: 'md-badges' }, D.badges ? D.badges(z) : null)),
        h('input', { type: 'checkbox', checked: gew, 'aria-label': 'Zeile auswählen', onchange: ev => { if (ev.target.checked) st.auswahl.add(z.id); else st.auswahl.delete(z.id); li.classList.toggle('gewaehlt', ev.target.checked); zeichneLeiste(); alleStatus(); } }),
        h('span', { class: 'md-aktionen' },
          h('button', { class: 'btn icon klein', title: 'Duplizieren', 'aria-label': 'Zeile duplizieren', onclick: () => dupliziere(z) }, icon('kopieren')),
          h('button', { class: 'btn icon klein gefahr', title: 'Löschen', 'aria-label': 'Zeile löschen', onclick: () => zeileLoeschen(cfg, z.id) }, icon('papierkorb'))));
      mdListe.append(li);
    });
    if (!zeilen.length && q) mdListe.append(h('li', { class: 'muted md-leer' }, 'Keine Treffer für „' + st.suche.trim() + '“.'));
    // Details des gewählten Eintrags: Abschnitte mit denselben Feldern wie in der Tabelle
    leeren(mdDetail);
    const z = zeilen.find(x => x.id === st.detail);
    if (z) {
      const feld = k => { const sp = cfg.spalten.find(x => x.k === k); if (!sp || sp.versteckt) return null;
        return h('div', { class: 'md-feld' + (sp.typ === 'custom' && !sp.schmal ? ' breit' : '') + (sp.typ === 'bool' ? ' bool' : '') }, h('div', { class: 'md-label' }, sp.lang || sp.titel, sp.hilfe ? hilfe(sp.hilfe) : null), zelle(cfg, sp, z, { render: true })); };
      mdDetail.append(
        h('div', { class: 'md-kopf' }, h('div', {}, h('h2', {}, D.titel(z) || D.ohneName || '(ohne Namen)'), D.unter ? h('div', { class: 'muted' }, D.unter(z)) : null), h('span', { class: 'md-badges' }, D.badges ? D.badges(z, 'detail') : null), h('div', { class: 'rechts zeile eng' },
          h('button', { class: 'btn klein', onclick: () => dupliziere(z) }, 'Duplizieren'), h('button', { class: 'btn klein gefahr', onclick: () => zeileLoeschen(cfg, z.id) }, 'Löschen'))),
        ...D.abschnitte.map(ab => { const felder = ab.spalten.map(feld).filter(Boolean); return felder.length ? h('section', { class: 'md-abschnitt' }, h('h3', {}, ab.titel, ab.hilfe ? hilfe(ab.hilfe) : null), h('div', { class: 'md-felder' }, felder)) : null; }).filter(Boolean));
    } else if (!q && !zeilen.length) mdDetail.append(leer());
    else mdDetail.append(h('p', { class: 'muted', style: { padding: '14px' } }, 'Kein Eintrag gewählt.'));
    iconKnoepfeBeschriften(mdListe); iconKnoepfeBeschriften(mdDetail);
    zeichneLeiste(); alleStatus();
  }
  function alleStatus() { const n = sichtbar.filter(id => st.auswahl.has(id)).length; alleBox.checked = n > 0 && n === sichtbar.length; alleBox.indeterminate = n > 0 && n < sichtbar.length; }
  zeichneKoerper();
  if (md) {
    const sortierbar = spAlle.filter(sp => sp.sortierbar !== false);
    wrap.append(werkzeuge, leiste, h('div', { class: 'md' + (zeilenAlle.length ? '' : ' leer') },
      zeilenAlle.length ? h('div', { class: 'md-links' },
        h('div', { class: 'md-listenkopf' }, alleBox,
          sel([['', 'wie angelegt']].concat(sortierbar.map(sp => [sp.k, sp.titel])), st.sort || '', v => { st.sort = v || null; st.dir = 1; render(); }, { 'aria-label': 'Sortieren nach', title: 'Sortieren nach' }),
          h('button', { class: 'btn icon klein', disabled: !st.sort, 'aria-label': st.dir > 0 ? 'Aufsteigend sortiert – umkehren' : 'Absteigend sortiert – umkehren', title: st.dir > 0 ? 'Aufsteigend sortiert – umkehren' : 'Absteigend sortiert – umkehren', onclick: () => { st.dir = -st.dir; render(); } }, icon(st.dir > 0 ? 'unten' : 'oben'))),
        mdListe) : null,
      mdDetail));
  } else wrap.append(werkzeuge, leiste, h('div', { class: 'tabwrap' }, h('table', { class: 'tab' + (cfg.klasse ? ' ' + cfg.klasse : '') + (ansicht ? ' ansicht-' + ansicht.k : '') }, h('thead', {}, kopf), tbody)));
  return wrap;
}
async function massenLoeschen(cfg, ids) {
  const zeilen = ids.map(id => findeId(cfg.zeilen(APP.daten), id)).filter(Boolean);
  if (!zeilen.length) return;
  const infos = zeilen.map(z => ({ z, info: cfg.loeschen ? cfg.loeschen(APP.daten, z) : null }));
  const texte = infos.map(x => x.info && x.info.text).filter(Boolean);
  const ok = zeilen.length <= 5 ? true : await dialog({
    titel: zeilen.length === 1 ? '1 Eintrag löschen?' : zeilen.length + ' Einträge löschen?',
    inhalt: h('div', {}, texte.length ? h('div', {}, h('p', {}, 'Abhängigkeiten:'), h('ul', { class: 'klein' }, texte.slice(0, 8).map(t => h('li', {}, t)), texte.length > 8 ? h('li', {}, '… und ' + (texte.length - 8) + ' weitere') : null)) : null,
      h('p', {}, 'Die abhängigen Zuordnungen werden leer gesetzt. Rückgängig mit Strg+Z.')),
    knoepfe: [{ text: 'Abbrechen', wert: false }, { text: zeilen.length + ' löschen', wert: true, art: 'gefahr' }]
  });
  if (!ok) return;
  (APP.tabellen[cfg.key].auswahl || new Set()).clear();
  aendernMitUndo(cfg.titel + ': ' + zeilen.length + (zeilen.length === 1 ? ' Zeile gelöscht' : ' Zeilen gelöscht'), d => {
    infos.forEach(({ z, info }) => { const liste = cfg.zeilen(d); const i = liste.findIndex(x => x.id === z.id); if (i >= 0) liste.splice(i, 1); if (info && info.tun) info.tun(d, z.id); });
  }, null, cfg.titel + ': ' + (zeilen.length === 1 ? '1 Eintrag' : zeilen.length + ' Einträge') + ' gelöscht.' + (texte.length ? ' ' + texte.slice(0, 2).join(' ') + (texte.length > 2 ? ' … und ' + (texte.length - 2) + ' weitere Abhängigkeiten.' : '') : ''));
}
function zelle(cfg, sp, z, stdOpt) {
  const wert = sp.get ? sp.get(z) : z[sp.k];
  const setze = (v, opt) => aendern(cfg.titel + ': ' + sp.titel, d => { const zz = findeId(cfg.zeilen(d), z.id); if (!zz) return; if (sp.set) sp.set(zz, v, d); else zz[sp.k] = v; }, Object.assign({ render: false }, stdOpt || {}, opt || {}));
  const label = sp.titel;
  switch (sp.typ) {
    case 'text': return h('input', { type: 'text', value: wert ?? '', 'aria-label': label, list: sp.liste || null, onchange: ev => { setze(ev.target.value.trim(), sp.renderNach ? { render: true } : null); } });
    case 'zahl': return h('input', { type: 'number', value: wert ?? 0, min: sp.min ?? 0, max: sp.max ?? 999, step: sp.step || 1, 'aria-label': label, onchange: ev => { const v = Number(ev.target.value); if (!Number.isFinite(v)) return; setze(v, sp.renderNach ? { render: true } : null); } });
    case 'bool': return h('input', { type: 'checkbox', checked: !!wert, 'aria-label': label, onchange: ev => setze(ev.target.checked) });
    case 'farbe': return h('input', { type: 'color', value: wert || '#9aa9c2', 'aria-label': label, onchange: ev => setze(ev.target.value) });
    case 'select': return sel(typeof sp.opts === 'function' ? sp.opts(z) : sp.opts, wert, v => setze(sp.leerNull && v === '' ? null : v, sp.renderNach ? { render: true } : null), { 'aria-label': label });
    case 'custom': return sp.render(z, setze);
    default: return String(wert ?? '');
  }
}
// Einzelne Zeile: ein Klick, keine Rückfrage – der Toast nennt die Abhängigkeiten und bietet „Rückgängig“ an.
function zeileLoeschen(cfg, id) {
  const z = findeId(cfg.zeilen(APP.daten), id); if (!z) return;
  const info = cfg.loeschen ? cfg.loeschen(APP.daten, z) : null;
  const name = z.kuerzel || z.name || '';
  aendernMitUndo(cfg.titel + ': Zeile gelöscht', d => {
    const liste = cfg.zeilen(d); const i = liste.findIndex(x => x.id === id);
    if (i >= 0) liste.splice(i, 1);
    if (info && info.tun) info.tun(d, id);
  }, null, cfg.titel + ': ' + (name ? '„' + name + '“' : 'Zeile') + ' gelöscht.' + (info && info.text ? ' ' + info.text : ''));
}
async function excelEinfuegen(cfg) {
  const ta = h('textarea', { placeholder: 'Zellen in Excel oder Calc markieren, kopieren (Strg+C) und hier einfügen (Strg+V).', 'aria-label': 'Eingefügte Tabellenzeilen' });
  const vorschau = h('div', { class: 'klein', style: { marginTop: '8px', maxHeight: '260px', overflow: 'auto' } });
  const spTitel = cfg.excel.spalten.map(k => { const sp = cfg.spalten.find(s => s.k === k); return (cfg.excel.titel && cfg.excel.titel[k]) || (sp ? sp.titel : k); });
  const parse = () => ta.value.split(/\r?\n/).filter(l => l.trim()).map(l => l.split('\t').map(x => x.trim()));
  ta.addEventListener('input', () => {
    const rows = parse();
    leeren(vorschau).append(rows.length ? h('table', { class: 'tab' }, h('thead', {}, h('tr', {}, spTitel.map(t => h('th', {}, t)))), h('tbody', {}, rows.slice(0, 50).map(r => h('tr', {}, spTitel.map((t, i) => h('td', {}, r[i] ?? '')))))) : h('span', { class: 'muted' }, 'Noch keine Zeilen.'));
  });
  const ok = await dialog({
    titel: cfg.titel + ': aus Excel einfügen', breite: '760px',
    inhalt: h('div', {}, h('p', {}, 'Erwartete Spaltenreihenfolge: ', h('b', {}, spTitel.join(' · ')), '. Eine Zeile je Eintrag, Spalten durch Tabulator getrennt (so kopieren Excel und Calc). Eine Kopfzeile wird erkannt und übersprungen.'), ta, h('h3', {}, 'Vorschau'), vorschau),
    knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'Übernehmen', wert: true, art: 'primaer' }], fokus: 'textarea'
  });
  if (!ok) return;
  let rows = parse();
  if (rows.length && rows[0].some((x, i) => x.toLowerCase() === String(spTitel[i]).toLowerCase())) rows = rows.slice(1);
  if (!rows.length) return;
  aendern(cfg.titel + ': ' + rows.length + ' Zeilen aus Excel', d => { rows.forEach(r => cfg.zeilen(d).push(cfg.excel.neu(d, r))); }, { normalisieren: true });
  toast(rows.length + ' Zeilen übernommen.', 'ok');
}

// ---------- Verfügbarkeitsmatrix (Lehrkräfte und Räume) ----------
const VERF_FOLGE = { 1: 0, 0: 2, 2: -1, '-1': 1 };
const VERF_SYM = { 1: '', 0: '✕', 2: '✓', '-1': '~' };
const VERF_KL = { 1: 'v1', 0: 'v0', 2: 'v2', '-1': 'vm' };
function miniVerf(matrix, onclick, titel) {
  const S = APP.daten.schule;
  const g = h('button', { class: 'miniverf', title: titel || 'Verfügbarkeit bearbeiten', 'aria-label': titel || 'Verfügbarkeit bearbeiten', onclick, style: { gridTemplateColumns: 'repeat(' + S.tage.length + ', 5px)' } });
  for (let hh = 0; hh < S.stunden.length; hh++) for (let d = 0; d < S.tage.length; d++) {
    const v = matrix[d] ? matrix[d][hh] : 1;
    g.append(h('i', { class: S.stunden[hh].istPause ? (v === 0 ? 'p v0' : 'p') : VERF_KL[v] }));
  }
  return g;
}
function verfLegende() {
  return h('div', { class: 'legende' },
    h('span', {}, h('span', { class: 'k', style: { background: 'var(--ok-bg2)', color: 'var(--ok-text)' } }, '✓'), 'gewünscht (2)'),
    h('span', {}, h('span', { class: 'k', style: { background: 'var(--panel)' } }, ''), 'möglich (1)'),
    h('span', {}, h('span', { class: 'k', style: { background: 'var(--warn-bg2)', color: 'var(--warn-text)' } }, '~'), 'ungern (-1)'),
    h('span', {}, h('span', { class: 'k', style: { background: 'var(--err-bg2)', color: 'var(--err-text)' } }, '✕'), 'gesperrt (0)'),
    h('span', { class: 'muted' }, 'Klick wechselt möglich → gesperrt → gewünscht → ungern; Ziehen füllt einen Bereich; Klick auf Tag oder Stunde setzt die ganze Spalte/Zeile.'));
}
// Verfügbarkeits-Matrix zum Bearbeiten. opt.pausen (Liste 'Tag|n<Zeile>'): Pausen lassen sich sperren – Pausenzeilen direkt in der Matrix,
// Pausen zwischen zwei Stunden als schmale Zeile. Rückgabe: { el, wert() → Matrix, pausen() → Liste, ende() }
function verfuegbarkeitInhalt(matrix, opt) {
  opt = opt || {};
  const S = APP.daten.schule, D = S.tage.length, H = S.stunden.length;
  const m = matrix.map(r => r.slice());
  const mitPausen = !!opt.pausen, gesp = new Set(opt.pausen || []);
  let malWert = null, maus = false;
  const tab = h('table', { class: 'verf', role: 'grid' });
  const zellen = [], pzellen = [];
  const zeichne = () => {
    zellen.forEach(({ td, d, hh }) => { const v = m[d][hh]; td.className = VERF_KL[v] + (S.stunden[hh].istPause ? ' pz' : ''); td.textContent = VERF_SYM[v]; td.setAttribute('aria-label', S.tage[d] + ' ' + (S.stunden[hh].istPause ? stundeName(hh) : stundeLabel(hh)) + ': ' + ({ 1: 'möglich', 0: 'gesperrt', 2: 'gewünscht', '-1': 'ungern' })[v]); });
    pzellen.forEach(({ td, k, name }) => { const zu = gesp.has(k); td.className = 'pz ' + (zu ? 'v0' : 'v1'); td.textContent = zu ? '✕' : ''; td.setAttribute('aria-label', name + ': ' + (zu ? 'gesperrt' : 'möglich')); });
  };
  const kopf = h('tr', {}, h('th', {}, ''));
  const tasteKlick = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.target.click(); } };
  S.tage.forEach((t, d) => kopf.append(h('th', { title: 'Ganzen Tag umschalten', tabindex: 0, onkeydown: tasteKlick, onclick: () => { const v = VERF_FOLGE[m[d][S.stunden.findIndex(x => !x.istPause)] ?? 1]; for (let hh = 0; hh < H; hh++) if (!S.stunden[hh].istPause) m[d][hh] = v; else if (mitPausen) m[d][hh] = v === 0 ? 0 : 1; if (mitPausen) pausenLuecken.forEach(i => { if (v === 0) gesp.add(d + '|n' + i); else gesp.delete(d + '|n' + i); }); zeichne(); } }, t)));
  tab.append(kopf);
  // Pausen zwischen zwei Stunden (ab 10 Minuten)
  const pausenLuecken = [];
  if (mitPausen) pausenListe(S).forEach(pa => { if (pa.key[0] === 'n') pausenLuecken.push(Number(pa.key.slice(1))); });
  const pName = new Map(mitPausen ? pausenListe(S).map(pa => [pa.key, pa]) : []);
  for (let hh = 0; hh < H; hh++) {
    const st = S.stunden[hh];
    const pauseFest = st.istPause && !mitPausen;
    const tr = h('tr', { class: st.istPause ? 'pzeile' : '' }, h('th', { title: pauseFest ? '' : st.istPause ? 'Pause an allen Tagen umschalten' : 'Ganze Stunde umschalten', tabindex: pauseFest ? null : 0, onkeydown: tasteKlick, onclick: pauseFest ? null : () => { const v = st.istPause ? (m[0][hh] === 0 ? 1 : 0) : VERF_FOLGE[m[0][hh]]; for (let d = 0; d < D; d++) m[d][hh] = v; zeichne(); } }, st.istPause ? (st.name || 'Pause') + (mitPausen && st.beginn ? ' ' + st.beginn + (st.ende ? '–' + st.ende : '') : '') : stundeLabel(hh) + ' ' + (st.beginn || '')));
    for (let d = 0; d < D; d++) {
      if (pauseFest) { tr.append(h('td', { class: 'pause' })); continue; }
      const td = h('td', { tabindex: 0 });
      const naechster = v => st.istPause ? (v === 0 ? 1 : 0) : VERF_FOLGE[v];
      td.addEventListener('mousedown', ev => { ev.preventDefault(); maus = true; malWert = naechster(m[d][hh]); m[d][hh] = malWert; zeichne(); });
      td.addEventListener('mouseenter', () => { if (maus && malWert !== null) { m[d][hh] = st.istPause ? (malWert === 0 ? 0 : 1) : malWert; zeichne(); } });
      td.addEventListener('keydown', ev => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); m[d][hh] = naechster(m[d][hh]); zeichne(); } });
      zellen.push({ td, d, hh });
      tr.append(td);
    }
    tab.append(tr);
    if (mitPausen && pausenLuecken.includes(hh)) {
      const pa = pName.get('n' + hh), name = (pa && pa.eigenName) || 'Pause';
      const ptr = h('tr', { class: 'pzeile luecke' }, h('th', { title: 'Pause an allen Tagen umschalten', tabindex: 0, onkeydown: tasteKlick, onclick: () => { const zu = !gesp.has('0|n' + hh); for (let d = 0; d < D; d++) { if (zu) gesp.add(d + '|n' + hh); else gesp.delete(d + '|n' + hh); } zeichne(); } }, name + (pa && pa.zeit ? ' ' + pa.zeit : '')));
      for (let d = 0; d < D; d++) {
        const k = d + '|n' + hh, td = h('td', { tabindex: 0 });
        const um = () => { if (gesp.has(k)) gesp.delete(k); else gesp.add(k); zeichne(); };
        td.addEventListener('mousedown', ev => { ev.preventDefault(); um(); });
        td.addEventListener('keydown', ev => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); um(); } });
        pzellen.push({ td, k, name: S.tage[d] + ' ' + name });
        ptr.append(td);
      }
      tab.append(ptr);
    }
  }
  const auf = () => { maus = false; malWert = null; };
  document.addEventListener('mouseup', auf);
  zeichne();
  const alle = v => h('button', { class: 'btn klein', onclick: () => { for (let d = 0; d < D; d++) for (let hh = 0; hh < H; hh++) m[d][hh] = v; if (mitPausen) { gesp.clear(); if (v === 0) for (let d = 0; d < D; d++) pausenLuecken.forEach(i => gesp.add(d + '|n' + i)); } zeichne(); } }, ({ 1: 'Alle möglich', 0: 'Alle gesperrt' })[v]);
  const el = h('div', {}, verfLegende(), mitPausen ? h('p', { class: 'muted klein', style: { margin: '6px 0 0' } }, 'Pausen (schmale Zeilen) lassen sich je Tag sperren: Dort bekommt die Person keine Aufsicht und keinen Aufgabenblock.') : null, h('div', { class: 'abstand' }), tab, h('div', { class: 'zeile', style: { marginTop: '8px' } }, alle(1), alle(0)));
  return { el, wert: () => m, pausen: () => [...gesp].sort(), ende: () => document.removeEventListener('mouseup', auf) };
}
async function verfuegbarkeitDialog(titel, matrix) {
  const v = verfuegbarkeitInhalt(matrix);
  const ok = await dialog({ titel: 'Verfügbarkeit: ' + titel, breite: '720px', inhalt: v.el, knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'Übernehmen', wert: true, art: 'primaer' }] });
  v.ende();
  return ok ? v.wert() : null;
}
function tageKnoepfe(liste, onchange, titel) {
  const S = APP.daten.schule;
  return h('span', { class: 'zeile eng', role: 'group', 'aria-label': titel || 'Tage' }, S.tage.map((t, d) => h('button', {
    class: 'tagknopf' + (liste.includes(d) ? ' an' : ''), 'aria-pressed': liste.includes(d) ? 'true' : 'false', title: TAGE_LANG[t],
    onclick: () => { const n = liste.includes(d) ? liste.filter(x => x !== d) : liste.concat([d]).sort((a, b) => a - b); onchange(n); }
  }, t)));
}

