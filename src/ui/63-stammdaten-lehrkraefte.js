/* ---------------- Lehrkräfte ---------------- */
function kuerzelVorschlag(name, andere) {
  const n = (name || '').trim().split(/\s+/).pop() || 'L';
  const basis = n.charAt(0).toUpperCase() + (n.charAt(1) || '').toLowerCase();
  if (!andere.includes(basis)) return basis;
  for (let i = 2; i < n.length; i++) { const k = basis + n.charAt(i).toLowerCase(); if (!andere.includes(k)) return k; }
  for (let i = 2; i < 99; i++) if (!andere.includes(basis + i)) return basis + i;
  return basis + Date.now() % 100;
}
// Fächer einer Person: als Lehrkraft (Lehrbefähigung) und als Co-Lehrkraft – zwei unabhängige Haken je Fach.
async function faecherDialog(l) {
  const alsL = new Set(l.faecher), alsCo = new Set(l.coFaecher || []);
  const F = APP.daten.faecher.slice().sort((a, b) => natVergleich(a.kuerzel || a.name, b.kuerzel || b.name));
  const boxen = [];
  const zeile = f => {
    const cb = (menge, text, titel) => { const el = h('input', { type: 'checkbox', checked: menge.has(f.id), 'aria-label': f.kuerzel + ' ' + text, onchange: ev => { if (ev.target.checked) menge.add(f.id); else menge.delete(f.id); } }); boxen.push({ el, menge, id: f.id }); return h('label', { class: 'check klein', title: titel }, el, text); };
    return h('tr', {}, h('td', {}, h('span', { class: 'fachpunkt', style: { background: f.farbe } }), f.kuerzel + ' – ' + f.name),
      h('td', {}, cb(alsL, 'als Lehrkraft', 'Darf das Fach als Fachlehrkraft unterrichten.')),
      h('td', {}, cb(alsCo, 'als Co', 'Darf in diesem Fach als Co-Lehrkraft eingesetzt werden.')));
  };
  const setze = (menge, an, nur) => { boxen.forEach(x => { if (x.menge !== menge || (nur && !nur.has(x.id))) return; x.el.checked = an; if (an) menge.add(x.id); else menge.delete(x.id); }); };
  const box = h('div', {},
    h('p', { class: 'muted klein', style: { marginTop: 0 } }, l.ausgebildet === false
      ? 'Co-Kraft: eingesetzt wird sie in den Fächern mit Haken „als Co“ – ganz ohne Fächer in allen. „als Lehrkraft“ gilt bei Co-Kräften nur mit „Zwang“.'
      : 'Beide Haken sind unabhängig: Eine Person kann ein Fach als Lehrkraft unterrichten und dort zusätzlich als Co-Lehrkraft eingesetzt werden. Ausgebildete Lehrkräfte arbeiten grundsätzlich als Lehrkraft; als Co werden sie automatisch nur ergänzt, wenn keine Co-Kraft passt.'),
    h('div', { class: 'zeile eng', style: { marginBottom: '6px' } }, h('span', { class: 'klein muted' }, 'Alle Fächer:'),
      h('button', { class: 'btn klein', onclick: () => setze(alsL, true) }, 'als Lehrkraft'), h('button', { class: 'btn klein', onclick: () => setze(alsCo, true) }, 'als Co'),
      h('button', { class: 'btn klein', title: 'Setzt „als Co“ bei allen Fächern, die als Lehrkraft angehakt sind', onclick: () => setze(alsCo, true, new Set(alsL)) }, 'Lehrkraft-Fächer auch als Co'),
      h('button', { class: 'btn klein', onclick: () => { setze(alsL, false); setze(alsCo, false); } }, 'alle abwählen')),
    h('div', { style: { maxHeight: '55vh', overflow: 'auto' } }, h('table', { class: 'tab kompakt' }, h('thead', {}, h('tr', {}, h('th', {}, 'Fach'), h('th', {}, 'Lehrkraft'), h('th', {}, 'Co-Lehrkraft'))), h('tbody', {}, F.map(zeile)))));
  const ok = await dialog({ titel: 'Fächer: ' + lehrerName(l, true), breite: '620px', inhalt: APP.daten.faecher.length ? box : h('p', {}, 'Zuerst Fächer anlegen.'), knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'Übernehmen', wert: true, art: 'primaer' }] });
  if (!ok) return;
  aendern('Fächer von ' + lehrerName(l), d => {
    const x = findeId(d.lehrer, l.id);
    x.faecher = d.faecher.map(f => f.id).filter(id => alsL.has(id));
    x.coFaecher = d.faecher.map(f => f.id).filter(id => alsCo.has(id));
  });
}
// Fächer einer Person als Kärtchen: L = als Lehrkraft, Co = als Co-Lehrkraft, L+Co = beides
function fachChips(l) {
  const co = l.coFaecher || [];
  const chips = APP.daten.faecher.filter(f => l.faecher.includes(f.id) || co.includes(f.id)).sort((a, b) => natVergleich(a.kuerzel || a.name, b.kuerzel || b.name)).map(f => {
    const L = l.faecher.includes(f.id), C = co.includes(f.id);
    return h('span', { class: 'chip fachrolle' + (L ? '' : ' cofach'), title: f.name + ' – ' + (L && C ? 'als Lehrkraft und als Co-Lehrkraft' : L ? 'als Lehrkraft' : 'als Co-Lehrkraft'), style: { borderLeft: '3px solid ' + f.farbe } }, f.kuerzel, h('span', { class: 'rolle' }, L && C ? 'L+Co' : L ? 'L' : 'Co'));
  });
  if (!chips.length && l.ausgebildet === false) chips.push(h('span', { class: 'muted klein', title: 'Co-Kraft ohne Fächer: als Co-Lehrkraft in allen Fächern einsetzbar' }, 'alle (Co)'));
  return chips;
}
// Tagesgrenzen, Wünsche und Anwesenheit einer Person in Kurzform
function grenzenKurz(l) {
  const S = APP.daten.schule, tg = a => a.map(i => S.tage[i]).join(', ');
  const t = ['max. ' + l.maxStundenTag + (l.minStundenTag ? ', min. ' + l.minStundenTag : '') + ' UStd./Tag', (l.maxArbeitTag > 0 ? '≤ ' + zahlDe(l.maxArbeitTag, 1) + ' h/Tag · ' : '') + 'Freistd. ≤ ' + l.maxHohlstundenTag];
  if (l.freierTagWunsch.length) t.push('frei: ' + tg(l.freierTagWunsch));
  if (l.anwesenheit === 'teilzeit') t.push('Teilzeit: ' + (tg(l.anwesenheitTage) || '–'));
  if (l.anwesenheit === 'ausbildungstag') t.push('Ausbildung: ' + (tg(l.anwesenheitTage) || '–'));
  const gesperrt = (l.pausenGesperrt || []).length + l.verfuegbarkeit.reduce((n, row) => n + row.filter((v, hh) => v === 0 && S.stunden[hh] && S.stunden[hh].istPause).length, 0);
  if (gesperrt) t.push(gesperrt + ' Pause(n) gesperrt');
  return t;
}
// Alles zu den Zeiten einer Person in EINEM Dialog: Verfügbarkeit (mit Pausen), Grenzen & Anwesenheit, Aufsichten
async function personDialog(l0, reiter) {
  const d = APP.daten, l = JSON.parse(JSON.stringify(findeId(d.lehrer, l0.id) || l0));
  const V = verfuegbarkeitInhalt(l.verfuegbarkeit, { pausen: l.pausenGesperrt || [] });
  // --- Grenzen & Anwesenheit ---
  const gRoot = h('div', {});
  const zahl = (k, text, min, max, hilfeText, step) => h('label', { class: 'feld' }, h('span', {}, text, hilfeText ? hilfe(hilfeText) : null), h('input', { type: 'number', min, max, step: step || 1, value: l[k], style: { width: '90px' }, 'aria-label': text, onchange: ev => { const v = Number(String(ev.target.value).replace(',', '.')) || 0; l[k] = _clamp(step ? Math.round(v / step) * step : Math.round(v), min, max); ev.target.value = l[k]; } }));
  const gZeichne = () => leeren(gRoot).append(
    h('h3', { style: { marginTop: 0 } }, 'Unterricht je Tag'),
    h('div', { class: 'zeile', style: { gap: '16px', alignItems: 'flex-end' } },
      zahl('maxStundenTag', 'max. UStd./Tag', 1, 20, 'Höchstens so viele Unterrichtsstunden an einem Tag. Aufgaben zählen hier nicht mit.'),
      zahl('minStundenTag', 'min. UStd./Tag', 0, 20, 'Gilt an Tagen, an denen die Person unterrichtet.'),
      zahl('maxHohlstundenTag', 'max. Freistunden/Tag', 0, 10, 'Jede Freistunde über dieser Grenze zählt zusätzlich doppelt.')),
    h('h3', {}, 'Arbeitszeit'),
    h('div', { class: 'zeile', style: { gap: '16px', alignItems: 'flex-end' } },
      zahl('arbeitszeit', 'Wochenarbeitszeit (h)', 0, 80, 'Vertragliche Wochenarbeitszeit in Zeitstunden (h). Harte Grenze: Die Automatik plant niemanden darüber hinaus ein.', 0.5),
      zahl('maxArbeitTag', 'max. Arbeitszeit/Tag (h)', 0, 24, 'Höchstarbeitszeit je Tag: Unterricht, Co-Einsätze, Aufgaben, Aufsichten eines Tages zusammen (ohne Vorbereitung). 0 = keine Grenze. Harte Grenze.', 0.5),
      d.schule.arbeitszeitModell.stundenSoll ? h('label', { class: 'feld' }, h('span', {}, 'Unterrichtsdeputat (max. UStd./Woche)', hilfe('Höchstzahl der Unterrichtsstunden je Woche – als Lehrkraft und als Co-Lehrkraft zusammen. Leer = keine Angabe (keine Grenze); 0 = keine Unterrichtsstunde.')), h('input', { type: 'number', min: 0, max: 40, step: 0.5, value: l.deputat === null || l.deputat === undefined ? '' : l.deputat, placeholder: '–', style: { width: '90px' }, 'aria-label': 'Unterrichtsdeputat (max. UStd./Woche)', onchange: ev => { const roh = String(ev.target.value).trim(); l.deputat = roh === '' ? null : _clamp(Math.round((Number(roh.replace(',', '.')) || 0) * 2) / 2, 0, 40); ev.target.value = l.deputat === null ? '' : l.deputat; } })) : null),
    h('h3', {}, 'Wunsch: frei', hilfe('Tage, die möglichst frei bleiben.')),
    tageKnoepfe(l.freierTagWunsch, v => { l.freierTagWunsch = v; gZeichne(); }, 'Wunsch-freie Tage'),
    h('h3', {}, 'Anwesenheit', hilfe('Teilzeit: nur an den markierten Tagen anwesend. Ausbildungstag: markierte Tage sind fest gesperrt.')),
    h('div', { class: 'zeile', style: { gap: '12px' } }, sel([['vollzeit', 'Vollzeit'], ['teilzeit', 'Teilzeit an …'], ['ausbildungstag', 'Ausbildungstag am …']], l.anwesenheit, v => { l.anwesenheit = v; gZeichne(); }, { 'aria-label': 'Anwesenheit' }),
      l.anwesenheit !== 'vollzeit' ? tageKnoepfe(l.anwesenheitTage, v => { l.anwesenheitTage = v; gZeichne(); }, l.anwesenheit === 'teilzeit' ? 'Anwesenheitstage' : 'Ausbildungstage') : null));
  gZeichne();
  // --- Aufsichten ---
  const Z = dienstzeitenAbschnitt(l);
  const teile = { verf: V.el, grenzen: gRoot, dienste: Z.el };
  let aktiv = teile[reiter] ? reiter : 'verf';
  const leiste = h('div', { class: 'reiter', role: 'tablist' });
  const zeige = () => {
    Object.entries(teile).forEach(([k, el]) => { el.style.display = k === aktiv ? '' : 'none'; });
    leeren(leiste).append(...[['verf', 'Verfügbarkeit & Pausen'], ['grenzen', 'Grenzen & Anwesenheit'], ['dienste', 'Aufsichten']].map(([k, t]) => h('button', { class: 'reiterknopf' + (aktiv === k ? ' aktiv' : ''), role: 'tab', 'aria-selected': aktiv === k ? 'true' : 'false', onclick: () => { aktiv = k; zeige(); } }, t)));
  };
  zeige();
  const ok = await dialog({ titel: 'Zeiten & Verfügbarkeit: ' + lehrerName(l, true) + (l.kuerzel ? ' (' + l.kuerzel + ')' : ''), breite: '760px', inhalt: h('div', { class: 'persondialog' }, leiste, V.el, gRoot, Z.el), knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'Übernehmen', wert: true, art: 'primaer', vorher: () => { const fe = Z.fehler(); if (fe) { aktiv = 'dienste'; zeige(); toast('Reiter „Aufsichten“: ' + fe + ' – bitte korrigieren.', 'err', 7000); return false; } return true; } }] });
  V.ende();
  if (!ok) return;
  aendern('Zeiten & Verfügbarkeit ' + lehrerName(l), dd => {
    const x = findeId(dd.lehrer, l.id); if (!x) return;
    x.verfuegbarkeit = V.wert(); x.pausenGesperrt = V.pausen();
    ['maxStundenTag', 'minStundenTag', 'maxHohlstundenTag', 'arbeitszeit', 'maxArbeitTag', 'deputat', 'freierTagWunsch', 'anwesenheit', 'anwesenheitTage'].forEach(k => { x[k] = l[k]; });
    Z.anwenden(x, dd);
  }, { normalisieren: true });
}
SEITEN_RENDER.lehrer = () => {
  const d = APP.daten;
  const kzAnz = {}; d.lehrer.forEach(l => { kzAnz[l.kuerzel] = (kzAnz[l.kuerzel] || 0) + 1; });
  const azL = arbeitszeiten(d);
  const dep = new Map(azL.liste.map(x => [x.lehrer, x]));
  const stdAn = !!d.schule.arbeitszeitModell.stundenSoll;
  const quelle = azL.quelle === 'plan' ? 'laut Plan' : 'laut Unterrichtsverteilung';
  // Deputat-Feld (Höchstzahl der Unterrichtsstunden je Woche) mit Ist-Marke
  const depFeld = l => {
    const x = dep.get(l.id), m = x ? stdStatus(x) : null;
    return h('span', { class: 'zeile eng nowrap stdfeld' }, h('input', { type: 'number', min: 0, max: 40, step: 0.5, value: l.deputat === null || l.deputat === undefined ? '' : l.deputat, placeholder: '–', 'aria-label': 'Unterrichtsdeputat (Höchstzahl)', title: 'Höchstzahl der Unterrichtsstunden je Woche. Leer = keine Angabe (keine Grenze); 0 = keine Unterrichtsstunde.', onchange: ev => { const roh = String(ev.target.value).trim(), v = roh === '' ? null : Math.min(40, Math.max(0, Number(roh.replace(',', '.')) || 0)); aendern('Lehrkräfte: Unterrichtsdeputat', dd => { const y = findeId(dd.lehrer, l.id); if (y) y.deputat = v; }); } }),
      x ? h('span', { class: 'badge ' + m.kl, title: m.titel + ' (' + quelle + ')' }, (m.kl === 'err' ? '✕ ' : m.kl === 'ok' ? '✓ ' : '') + zahlDe(x.istStd, 1)) : null);
  };
  const kopfKarte = h('div', { class: 'karte' },
    h('div', { class: 'zeile', style: { gap: '10px' } },
      h('span', { class: 'klein' }, h('b', {}, 'Arbeitszeit: '), 'Die Wochenarbeitszeit ist eine harte Grenze' + (stdAn ? ', das Unterrichtsdeputat begrenzt zusätzlich die Unterrichtsstunden.' : '; ein Unterrichtsdeputat wird nicht geführt.')),
      h('button', { class: 'btn klein', onclick: () => gehe('arbeitszeit') }, 'Arbeitszeit & Deputat →')),
    h('div', { style: { marginTop: '8px' } }, verfLegende()));
  const verfSp = { k: 'verf', titel: 'Verfügbarkeit', typ: 'custom', sortierbar: false, hilfe: 'Stunden und Pausen sperren, wünschen oder als „ungern“ markieren – Klick öffnet „Zeiten & Verfügbarkeit“.', render: l => miniVerf(l.verfuegbarkeit, () => personDialog(l, 'verf'), 'Verfügbarkeit von ' + lehrerName(l) + ' bearbeiten') };
  return [
    seitenkopf('Lehrkräfte', 'Lehrkräfte, Co-Kräfte und weiteres Personal (z. B. für Aufsichten) mit Kürzel, Fächern als Lehrkraft und als Co, Wochenarbeitszeit, Klassenleitung, Zeiten & Verfügbarkeit und Aufsichten. Die Klassenleitung wird hier oder bei den Klassen zugeordnet.'),
    kopfKarte,
    h('div', { class: 'abstand' }),
    tabelle({
      key: 'lehrer', titel: 'Lehrkräfte', klasse: 'lehrertab', zeilen: dd => dd.lehrer,
      leer: { icon: 'personen', titel: 'Noch keine Mitarbeitenden', text: 'Lehrkräfte, Co-Kräfte und weiteres Personal mit Fächern und Wochenarbeitszeit anlegen – einzeln oder als Liste aus Excel.', neu: '+ Erste Lehrkraft anlegen' },
      detail: {
        titel: l => l.name || l.kuerzel || '', ohneName: '(neue Person)',
        unter: l => [l.kuerzel, artText(l), l.klassenleitung && klasseVon(l.klassenleitung) ? 'Klassenleitung ' + klasseVon(l.klassenleitung).name : ''].filter(Boolean).join(' · '),
        // zwei Marken je Person: Arbeitszeit (Ist gegen Soll) und der wichtigste Hinweis zu den Stammdaten
        badges: (l, ort) => {
          const x = dep.get(l.id), diff = x ? x.diff / 60 : 0, k = ort === 'detail';
          const az = x ? h('span', { class: 'badge ' + (k ? 'klickbar ' : '') + (diff > 0.05 ? 'err' : diff < -1 ? 'warn' : 'ok'), role: k ? 'button' : null, tabindex: k ? 0 : null, onclick: k ? ev => { ev.stopPropagation(); arbeitszeitDetailDialog(l.id); } : null, onkeydown: k ? ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); arbeitszeitDetailDialog(l.id); } } : null, title: 'Arbeitszeit ' + quelle + ': ' + zahlDe(x.summe / 60, 1) + ' h von ' + zahlDe(x.soll / 60, 1) + ' h' + (k ? ' – Klick: Berechnung im Detail' : '') }, (diff > 0.05 ? '✕ ' : diff < -1 ? '↓ ' : '✓ ') + zahlDe(x.summe / 60, 1) + ' h') : null;
          const hin = !l.kuerzel ? ['err', 'Kürzel fehlt'] : kzAnz[l.kuerzel] > 1 ? ['err', 'Kürzel doppelt'] : l.art !== 'personal' && l.ausgebildet !== false && !l.faecher.length ? ['warn', 'ohne Fächer'] : l.aufsicht === false ? ['neutral', 'keine Aufsichten'] : null;
          return [az, hin ? h('span', { class: 'badge ' + hin[0] }, hin[1]) : null];
        },
        abschnitte: [
          { titel: 'Stammdaten', spalten: ['name', 'kuerzel', 'ausgebildet', 'klassenleitung', 'arbeitszeit', 'deputat'] },
          { titel: 'Fächer', spalten: ['faecher'] },
          { titel: 'Zeiten & Verfügbarkeit', spalten: ['grenzen', 'maxStundenTag', 'minStundenTag', 'maxHohlstundenTag', 'maxArbeitTag', 'freierTagWunsch', 'anwesenheit'] },
          { titel: 'Aufsichten', spalten: ['aufsicht'] }
        ]
      },
      ansichten: [
        { k: 'kompakt', titel: 'Kompakt', hilfe: 'Das Wichtigste je Person; Zeiten, Grenzen und Aufsichten als Kurzfassung mit Dialog', spalten: ['name', 'kuerzel', 'ausgebildet', 'faecher', 'arbeitszeit', 'deputat', 'klassenleitung', 'grenzen', 'aufsicht'] },
        { k: 'zeiten', titel: 'Zeiten & Grenzen', hilfe: 'Tagesgrenzen, Arbeitszeit je Tag, Wünsche, Anwesenheit und Aufsichten direkt in der Tabelle', spalten: ['name', 'kuerzel', 'maxStundenTag', 'minStundenTag', 'maxHohlstundenTag', 'maxArbeitTag', 'freierTagWunsch', 'anwesenheit', 'grenzen', 'aufsicht'] },
        { k: 'alle', titel: 'Alle Spalten', hilfe: 'Alle Angaben nebeneinander (breit)', spalten: ['name', 'kuerzel', 'ausgebildet', 'faecher', 'arbeitszeit', 'deputat', 'maxArbeitTag', 'klassenleitung', 'maxStundenTag', 'minStundenTag', 'maxHohlstundenTag', 'freierTagWunsch', 'anwesenheit', 'grenzen', 'aufsicht'] }
      ],
      spalten: [
        { k: 'name', titel: 'Name', typ: 'text', breite: '140px', set: (l, v, dd) => { l.name = v; if (!l.kuerzel && v) l.kuerzel = kuerzelVorschlag(v, dd.lehrer.map(x => x.kuerzel)); }, renderNach: true },
        { k: 'kuerzel', titel: 'Kürzel', typ: 'custom', schmal: true, breite: '64px', sortWert: l => l.kuerzel, render: (l, setze) => h('input', { type: 'text', value: l.kuerzel, class: (!l.kuerzel || kzAnz[l.kuerzel] > 1) ? 'fehler' : '', title: !l.kuerzel ? 'Kürzel fehlt' : kzAnz[l.kuerzel] > 1 ? 'Kürzel ist mehrfach vergeben' : '', 'aria-label': 'Kürzel', onchange: ev => setze(ev.target.value.trim(), { render: true }) }) },
        { k: 'ausgebildet', titel: 'Art', typ: 'custom', schmal: true, sortWert: l => ({ lk: 0, co: 1, personal: 2 })[l.art] || 0, hilfe: 'Lehrkraft: unterrichtet als Fachlehrkraft; als Co-Lehrkraft wird sie automatisch nur ergänzt, wenn keine Co-Kraft passt. Co-Kraft (z. B. Schulbegleitung, pädagogische Fachkraft): nur als Co-Lehrkraft einsetzbar. Weiteres Personal: unterrichtet nicht – weder als Lehrkraft noch als Co –, übernimmt aber Aufsichten (z. B. GTA) und Aufgaben und wird für Aufsichten zuerst eingeteilt.',
          render: l => sel([['lk', 'Lehrkraft'], ['co', 'Co-Kraft'], ['personal', 'weiteres Personal']], l.art || (l.ausgebildet === false ? 'co' : 'lk'), v => { let n = 0; aendern('Lehrkräfte: Art von ' + lehrerName(l), dd => { const x = findeId(dd.lehrer, l.id); if (x) n = artSetzen(dd, x, v); }, { normalisieren: true }); if (n) toast(lehrerName(l) + ' wurde als weiteres Personal aus ' + (n === 1 ? 'einem Unterricht' : n + ' Unterrichten') + ' ausgetragen (rückgängig mit Strg+Z).', '', 7000); }, { 'aria-label': 'Art der Person' }) },
        { k: 'faecher', titel: 'Fächer', typ: 'custom', sortierbar: false, hilfe: 'L = darf das Fach als Lehrkraft unterrichten, Co = darf dort als Co-Lehrkraft eingesetzt werden, L+Co = beides. Co-Kräfte ohne jedes Fach sind in allen Fächern als Co einsetzbar.', render: l => l.art === 'personal' ? h('span', { class: 'muted klein', title: 'Weiteres Personal unterrichtet nicht – es übernimmt Aufsichten und Aufgaben.' }, 'kein Unterricht') : h('button', { class: 'fachknopf', 'aria-label': 'Fächer von ' + lehrerName(l) + ' bearbeiten', title: 'Fächer als Lehrkraft und als Co-Lehrkraft bearbeiten', onclick: () => faecherDialog(l) }, fachChips(l), h('span', { class: 'stift' }, l.faecher.length || (l.coFaecher || []).length ? icon('stift', 'k') : '+ Fächer')) },
        { k: 'arbeitszeit', titel: 'Arbeitszeit (h)', lang: 'Wochenarbeitszeit (h)', typ: 'custom', schmal: true, sortWert: l => l.arbeitszeit, masse: { typ: 'zahl' }, min: 0, max: 80, step: 0.5, hilfe: 'Vertragliche Wochenarbeitszeit in Zeitstunden (h, z. B. 40) – eine harte Grenze: Die Automatik plant niemanden darüber hinaus ein. Ist = Unterricht + Vorbereitung + Co-Einsätze + Klassenleitung + Aufgaben + Aufsichten (aus dem Plan, sonst aus der Unterrichtsverteilung).', render: (l, setze) => { const x = dep.get(l.id); const diff = x ? x.diff / 60 : 0; return h('span', { class: 'zeile eng nowrap' }, h('input', { type: 'number', min: 0, max: 80, step: 0.5, value: l.arbeitszeit, 'aria-label': 'Wochenarbeitszeit in h', onchange: ev => setze(Number(ev.target.value) || 0, { render: true }) }), x ? h('span', { class: 'badge klickbar ' + (diff > 0.05 ? 'err' : diff < -1 ? 'warn' : 'ok'), role: 'button', tabindex: 0, onclick: ev => { ev.stopPropagation(); arbeitszeitDetailDialog(l.id); }, onkeydown: ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); arbeitszeitDetailDialog(l.id); } }, title: 'Ist-Arbeitszeit ' + quelle + ': ' + zahlDe(x.summe / 60, 1) + ' h (' + (diff > 0.05 ? 'über der' : diff < -1 ? 'unter der' : 'innerhalb der') + ' Wochenarbeitszeit) – Klick: Berechnung im Detail' }, (diff > 0.05 ? '✕ ' : diff < -1 ? '↓ ' : '✓ ') + zahlDe(x.summe / 60, 1) + ' h') : null); } },
        { k: 'deputat', titel: 'Deputat (max. UStd.)', lang: 'Unterrichtsdeputat (max. UStd. je Woche)', typ: 'custom', schmal: true, versteckt: !stdAn, sortWert: l => l.deputat === null ? -1 : l.deputat, masse: { typ: 'zahl', leerNull: true }, min: 0, max: 40, step: 0.5, hilfe: 'Unterrichtsdeputat: Höchstzahl der Unterrichtsstunden je Woche, als Lehrkraft und als Co-Lehrkraft zusammen. Leeres Feld = keine Angabe (keine Grenze); 0 = wirklich keine Unterrichtsstunde. Daneben die geplanten Stunden: ✓ ausgeschöpft, ✕ überschritten. A/B-Stunden zählen halb; Aufgaben nur mit Haken „auf das Deputat anrechnen“.', render: l => depFeld(l) },
        { k: 'klassenleitung', titel: 'Klassenleitung', typ: 'select', leerNull: true, opts: () => klassenOpts('–'), set: (l, v, dd) => { dd.lehrer.forEach(x => { if (v && x.klassenleitung === v) x.klassenleitung = null; }); l.klassenleitung = v; }, renderNach: true, sortWert: l => (klasseVon(l.klassenleitung) || {}).name || '' },
        { k: 'grenzen', titel: 'Zeiten & Verfügbarkeit', lang: 'Verfügbarkeit, Grenzen und Aufsichtswünsche (Klick öffnet den Dialog)', typ: 'custom', sortierbar: false, hilfe: 'Links die Verfügbarkeit je Stunde und Pause. Rechts in Kurzform: Stunden je Tag, Arbeitszeit je Tag, Freistunden, Wunsch-freie Tage, Teilzeit oder Ausbildungstag, gesperrte Pausen – und die Zeiten und Wünsche für Aufsichten. Ein Klick öffnet den Dialog „Zeiten & Verfügbarkeit“ (Reiter: Verfügbarkeit & Pausen, Grenzen & Anwesenheit, Aufsichten).', render: l => h('span', { class: 'zeile eng nowrap' }, verfSp.render(l), h('button', { class: 'btn klein kurzknopf', title: 'Grenzen und Anwesenheit bearbeiten', onclick: () => personDialog(l, 'grenzen') }, grenzenKurz(l).map((t, i) => h('span', { class: i > 1 ? 'betont' : '' }, t))), l.aufsicht !== false ? h('button', { class: 'btn klein kurzknopf dienstzeitknopf', title: 'Zeiten und Wünsche für Aufsichten bearbeiten', onclick: () => personDialog(l, 'dienste') }, 'Aufsichten: ' + dienstzeitenKurz(l)) : null) },
        { k: 'maxStundenTag', titel: 'max. UStd./Tag', lang: 'max. UStd. je Tag', typ: 'zahl', min: 1, max: 20, hilfe: 'Höchstens so viele Unterrichtsstunden an einem Tag (Aufgaben zählen nicht).' },
        { k: 'minStundenTag', titel: 'min. UStd./Tag', lang: 'min. UStd. je Tag', typ: 'zahl', min: 0, max: 20, hilfe: 'Gilt an Tagen, an denen die Lehrkraft unterrichtet.' },
        { k: 'maxHohlstundenTag', titel: 'max. Freistd./Tag', lang: 'max. Freistunden je Tag', typ: 'zahl', min: 0, max: 10, hilfe: 'Jede Freistunde über dieser Grenze zählt zusätzlich doppelt.' },
        { k: 'maxArbeitTag', titel: 'max. h/Tag', lang: 'max. Arbeitszeit je Tag (h)', typ: 'zahl', min: 0, max: 24, step: 0.5, hilfe: 'Höchstarbeitszeit je Tag in h – Unterricht, Co-Einsätze, Aufgaben, Aufsichten zusammen (ohne Vorbereitung). 0 = keine Grenze.' },
        { k: 'freierTagWunsch', titel: 'Wunsch: frei', typ: 'custom', schmal: true, sortierbar: false, hilfe: 'Tage, die möglichst frei bleiben.', render: (l, setze) => tageKnoepfe(l.freierTagWunsch, v => setze(v, { render: true }), 'Wunsch-freie Tage') },
        { k: 'anwesenheit', titel: 'Anwesenheit', typ: 'custom', schmal: true, sortWert: l => l.anwesenheit, hilfe: 'Teilzeit: nur an den markierten Tagen anwesend. Ausbildungstag: markierte Tage sind fest gesperrt.', render: (l, setze) => h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' } }, sel([['vollzeit', 'Vollzeit'], ['teilzeit', 'Teilzeit an …'], ['ausbildungstag', 'Ausbildungstag am …']], l.anwesenheit, v => aendern('Anwesenheit ' + lehrerName(l), dd => { findeId(dd.lehrer, l.id).anwesenheit = v; }), { 'aria-label': 'Anwesenheit' }), l.anwesenheit !== 'vollzeit' ? tageKnoepfe(l.anwesenheitTage, v => aendern('Anwesenheitstage ' + lehrerName(l), dd => { findeId(dd.lehrer, l.id).anwesenheitTage = v; }), l.anwesenheit === 'teilzeit' ? 'Anwesenheitstage' : 'Ausbildungstage') : null) },
        { k: 'aufsicht', titel: 'Aufsichten', typ: 'bool', hilfe: 'Die Person übernimmt Aufsichten (Früh-/Spätaufsicht, Bistro, Springer …) und Aufsichten. Ohne Haken wird sie dafür nie eingeplant.' },
      ],
      neu: dd => nLehrer({}, dd.schule.tage.length, dd.schule.stunden.length, dd.schule.arbeitszeitModell.standardStunden, dd.schule.arbeitszeitModell.maxTagStunden),
      duplizieren: (dd, l) => Object.assign(JSON.parse(JSON.stringify(l)), { id: neueId('t'), kuerzel: kuerzelVorschlag(l.name || l.kuerzel, dd.lehrer.map(x => x.kuerzel)), klassenleitung: null }),
      loeschen: (dd, l) => {
        const n = dd.unterrichte.filter(u => u.lehrkraefte.some(z => z.lehrer === l.id)).length;
        return { text: n ? 'Lehrkraft ' + lehrerName(l) + ' wird in ' + n + ' Unterrichten verwendet; die Zuordnungen werden entfernt.' : '', tun: (d2, id) => { (d2.gta || []).forEach(g => { g.personen = g.personen.filter(x => x !== id); }); d2.unterrichte.forEach(u => { u.lehrkraefte = u.lehrkraefte.filter(z => z.lehrer !== id); }); d2.plan.platzierungen.forEach(p => { p.co = p.co.filter(x => x !== id); }); d2.klassen.forEach(k => { k.team = k.team.filter(x => x !== id); }); d2.dienste.plan = d2.dienste.plan.filter(x => x.lehrer !== id); d2.dienste.plan.forEach(x => { if (x.rhythmus.personen) x.rhythmus.personen = x.rhythmus.personen.filter(p => p !== id); }); } };
      },
      suchtext: l => l.name + ' ' + l.kuerzel + ' ' + l.faecher.concat(l.coFaecher || []).map(id => (fachVon(id) || {}).kuerzel).join(' '),
      excel: { spalten: ['name', 'kuerzel', 'arbeitszeit', 'faecher', 'ausgebildet', 'deputat', 'coFaecher'],
        titel: { faecher: 'Fächer als Lehrkraft', ausgebildet: 'Ausgebildet', deputat: 'Deputat (max. UStd.)', coFaecher: 'Fächer als Co' },
        neu: (dd, r) => {
          const fl = s => String(s || '').split(/[ ,;\/]+/).map(kz => (dd.faecher.find(f => f.kuerzel.toLowerCase() === kz.toLowerCase()) || {}).id).filter(Boolean);
          const zahl = v => v === undefined || v === '' ? 0 : Number(String(v).replace(',', '.')) || 0;
          // ein eingefügtes Deputat schaltet die Option „Unterrichtsdeputat begrenzen“ ein
          const dep2 = r[5] === undefined || String(r[5]).trim() === '' ? null : Math.min(40, zahl(r[5]));
          if (dep2 !== null) dd.schule.arbeitszeitModell.stundenSoll = true;
          const artRoh = String(r[4] || '').trim(), pers = /^(personal|weiteres personal|p)$/i.test(artRoh);
          const ausgeb = !pers && !/^(nein|n|0|co|co-kraft|false)$/i.test(artRoh);
          return nLehrer({ name: r[0], kuerzel: r[1] || kuerzelVorschlag(r[0], dd.lehrer.map(x => x.kuerzel)), arbeitszeit: r[2] === undefined || r[2] === '' ? undefined : Number(String(r[2]).replace(',', '.')), deputat: dep2, ausgebildet: ausgeb, art: pers ? 'personal' : undefined, faecher: fl(r[3]), coFaecher: r[6] === undefined || r[6] === '' ? undefined : fl(r[6]) }, dd.schule.tage.length, dd.schule.stunden.length, dd.schule.arbeitszeitModell.standardStunden, dd.schule.arbeitszeitModell.maxTagStunden);
        } }
    })
  ];
};

// Fachlehrkraft eines Unterrichts setzen: '__auto' = automatisch, '' = keine, sonst die gewählte Person (fest)
function fachSetzen(dd, uid, v) {
  const uu = findeId(dd.unterrichte, uid); if (!uu) return false;
  const l = v && v !== '__auto' ? findeId(dd.lehrer, v) : null, zw = !!(l && l.ausgebildet === false);
  if (v === '__auto') { uu.fachAuto = true; uu.lehrkraefte = uu.lehrkraefte.filter(z => z.rolle !== 'fach'); return false; }
  uu.fachAuto = false;
  const i = uu.lehrkraefte.findIndex(z => z.rolle === 'fach');
  if (!v) { if (i >= 0) uu.lehrkraefte.splice(i, 1); }
  else if (i >= 0) Object.assign(uu.lehrkraefte[i], { lehrer: v, zwang: zw, auto: false });
  else uu.lehrkraefte.unshift(nLehrkraftZuordnung({ lehrer: v, rolle: 'fach', modus: 'immer', deputatFaktor: 1, zwang: zw }));
  return zw;
}
// Unterrichtsverteilung leeren: alles | nur die Lehrkräfte | nur die Stunden. Aufgaben bleiben unberührt; rückgängig mit Strg+Z.
async function verteilungLeerenDialog() {
  const d = APP.daten, us = d.unterrichte.filter(u => !u.aufgabe);
  if (!us.length) { toast('Die Unterrichtsverteilung ist schon leer.', ''); return; }
  let modus = 'lehrer';
  const nLk = us.filter(u => (u.lehrkraefte || []).some(z => z.lehrer && !z.auto)).length;
  const wahl = (wert, titel, text) => h('label', { class: 'check erzwingwahl', style: { alignItems: 'flex-start', marginBottom: '8px' } },
    h('input', { type: 'radio', name: 'leeren', value: wert, checked: modus === wert, onchange: () => { modus = wert; } }), h('span', {}, h('b', {}, titel), h('br'), h('span', { class: 'klein' }, text)));
  const ok = await dialog({ titel: 'Unterrichtsversorgung leeren', breite: '640px', inhalt: h('div', {},
    h('p', {}, 'Was soll geleert werden?'),
    wahl('lehrer', 'Nur feste Personalvorgaben', 'Alle zwingend eingetragenen Fach- und Co-Personen werden entfernt (' + nLk + ' Unterrichte). Die automatische Personalzuteilung erfolgt bei der nächsten Berechnung. Stunden, Blöcke, Räume und Kopplungen bleiben.'),
    wahl('stunden', 'Nur die Stunden', 'Die Stundenzahlen aller Unterrichte und die Stundentafel werden auf 0 gesetzt (' + us.length + ' Unterrichte). Wer welches Fach in welcher Klasse unterrichtet, bleibt eingetragen – neue Stunden in der Stundentafel übernehmen diese Zuordnung.'),
    wahl('alles', 'Alles', 'Alle ' + us.length + ' Unterrichte werden gelöscht, die Stundentafel samt Halbgruppen, Parallelpartnern und Co-Bedarf geleert.'),
    h('p', { class: 'muted klein' }, 'Aufgaben (z. B. Schulleitung) bleiben in jedem Fall erhalten. ' + (d.plan.platzierungen.length ? 'Der vorhandene Stundenplan passt danach nicht mehr und wird mit geleert (Aufgaben bleiben eingeplant). ' : '') + 'Rückgängig mit Strg+Z.')),
    knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'Leeren', wert: true, art: 'gefahr' }] });
  if (!ok) return;
  aendern('Unterrichtsverteilung geleert (' + (modus === 'lehrer' ? 'Lehrkräfte' : modus === 'stunden' ? 'Stunden' : 'alles') + ')', dd => {
    const ids = new Set(dd.unterrichte.filter(u => !u.aufgabe).map(u => u.id));
    if (modus === 'lehrer') dd.unterrichte.forEach(u => { if (!u.aufgabe) { u.lehrkraefte = (u.lehrkraefte || []).filter(z => z.auto); u.fachAuto = true; } });
    else if (modus === 'stunden') {
      dd.unterrichte.forEach(u => { if (!u.aufgabe) { u.wochenstunden = 0; u.bloecke = []; u.bloeckeWoche = []; u.fixiert = []; } });
      dd.klassen.forEach(k => { k.stundentafel = {}; });
    } else {
      dd.unterrichte = dd.unterrichte.filter(u => u.aufgabe);
      dd.klassen.forEach(k => { k.stundentafel = {}; k.teilung = {}; k.parallel = {}; k.coBedarf = {}; k.maxProTag = {}; });
    }
    // der Stundenplan der Unterrichte passt nicht mehr (Aufgaben bleiben, wo sie sind)
    dd.plan.platzierungen = dd.plan.platzierungen.filter(p => !ids.has(p.unterricht));
    dd.plan.platzierungen.forEach(p => { p.co = []; });
    dd.plan.frei = [];
    dd.plan.besetzung = [];
  }, { normalisieren: true });
  toast(modus === 'lehrer' ? 'Alle festen Personalvorgaben entfernt – die Personalzuteilung erfolgt bei der nächsten Berechnung.' : modus === 'stunden' ? 'Stunden und Stundentafel geleert – die Zuordnung der Lehrkräfte ist geblieben.' : 'Unterrichtsverteilung und Stundentafel geleert.', 'ok', 6000);
}
