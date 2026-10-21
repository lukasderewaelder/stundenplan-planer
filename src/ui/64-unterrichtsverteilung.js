/* ---------------- Unterrichtsverteilung ---------------- */
function lehrkraefteText(u, mitCo) {
  const f = (u.lehrkraefte || []).filter(z => z.rolle === 'fach' && z.lehrer && !z.auto).map(z => lehrerName(lehrerVon(z.lehrer)));
  const c = (u.lehrkraefte || []).filter(z => z.rolle === 'co' && z.lehrer && !z.auto).map(z => lehrerName(lehrerVon(z.lehrer)) + (z.modus === 'anteilig' && z.stundenAnteil < u.wochenstunden ? ' ' + z.stundenAnteil + '/' + u.wochenstunden : ''));
  const fach = f.length ? 'fest: ' + f.join('/') : 'automatisch bei Berechnung';
  return fach + (mitCo !== false && c.length ? ' · Co fest: ' + c.join(', ') : '');
}
// Regeln für ausgebildete Lehrkräfte als Co-Lehrkraft (Auswahl + Regler „Wichtung“) – unter „Regeln & Gewichte“
function coRegelnFelder(R, geaendert) {
  const stdAn = !!APP.daten.schule.arbeitszeitModell.stundenSoll;
  const wText = h('span', { class: 'klein muted', style: { minWidth: '250px' } });
  const wErkl = () => { leeren(wText).append(R.lehrkraefte === 'nie' ? 'Ohne Wirkung: Ausgebildete Lehrkräfte werden nicht als Co-Lehrkraft ergänzt.'
    : R.wichtung === 0 ? '0 – Fachunterricht hat Vorrang: Die Klassenleitung wird nicht bevorzugt' + (stdAn ? '; Lehrkräfte mit begrenztem Deputat werden nicht als Co ergänzt – ihr offenes Deputat bleibt für Fachunterricht frei.' : '.')
    : R.wichtung === 10 ? '10 – die Klassenleitung zuerst in ihrer eigenen Klasse' + (stdAn ? '; Lehrkräfte dürfen ihr ganzes noch offenes Deputat für Co-Einsätze nutzen.' : '.')
    : R.wichtung + ' – die Klassenleitung zuerst in ihrer eigenen Klasse' + (stdAn ? '; Lehrkräfte dürfen bis zu ' + R.wichtung * 10 + ' % ihres noch offenen Deputats für Co-Einsätze nutzen.' : '.')); };
  const regler = h('input', { type: 'range', min: 0, max: 10, step: 1, value: R.wichtung, style: { width: '180px' }, 'aria-label': 'Wichtung: Fachlehrkraft in anderen Klassen oder Co-Lehrkraft in der eigenen Klasse', oninput: ev => { R.wichtung = Number(ev.target.value); wErkl(); }, onchange: () => { if (geaendert) geaendert(); } });
  const modus = sel(Object.entries(CO_LEHRKRAEFTE), R.lehrkraefte, v => { R.lehrkraefte = v; regler.disabled = v === 'nie'; wErkl(); if (geaendert) geaendert(); }, { 'aria-label': 'Ausgebildete Lehrkräfte als Co-Lehrkraft' });
  regler.disabled = R.lehrkraefte === 'nie';
  wErkl();
  return h('div', {},
    h('div', { class: 'zeile', style: { gap: '12px', alignItems: 'flex-end' } }, h('label', { class: 'feld' }, 'Ausgebildete Lehrkräfte als Co-Lehrkraft', modus)),
    h('div', { class: 'feld', style: { marginTop: '8px' } }, h('span', {}, 'Wichtung', hilfe('Wofür die Zeit einer ausgebildeten Lehrkraft zählt: links Fachunterricht (auch in anderen Klassen), rechts Co-Lehrkraft in der eigenen Klasse (Klassenleitung). Die Einstellung wird mit dem Projekt gespeichert.')),
      h('div', { class: 'zeile eng', style: { gap: '8px' } }, h('span', { class: 'klein' }, 'Fachlehrkraft in anderen Klassen'), regler, h('span', { class: 'klein' }, 'Co in eigener Klasse')), wText));
}
function coReihenfolgeText() {
  return h('ol', { class: 'klein', style: { margin: '0 0 8px 18px', padding: 0 } },
    h('li', {}, h('b', {}, 'Co-Kräfte zuerst. '), 'Ausgebildete Lehrkräfte arbeiten grundsätzlich als Lehrkraft.'),
    h('li', {}, h('b', {}, 'Ausgebildete Lehrkräfte nur, wenn keine Co-Kraft passt'), ' – dann bevorzugt die Klassenleitung in ihrer eigenen Klasse (je nach Wichtung).'),
    h('li', {}, h('b', {}, 'Klassenteam vor anderen'), ' – reicht das Team nicht, kommen weitere Personen mit passendem Co-Fach in Frage. Mehrere Co-Personen dürfen sich einen Kurs blockweise teilen.'));
}
// Unterrichtsverteilung → Stundentafel: Nach einer Änderung im Unterrichtsdialog folgt die Stundentafel (Wochenstunden je Schüler),
// damit beide übereinstimmen. Eingetragen werden ganze und halbe Stunden (halb = nur Woche A oder B); alles andere meldet die Prüfung.
function tafelFolgt(dd, unterrichte, meldungen) {
  const paare = new Map();
  unterrichte.forEach(x => { if (x && !x.aufgabe && x.fach) x.klassen.forEach(k => paare.set(k + '\u0001' + x.fach, [k, x.fach])); });
  if (!paare.size) return;
  const bl = bloeckeAlle(dd);
  paare.forEach(([kid, fid]) => {
    const kk = findeId(dd.klassen, kid), f = findeId(dd.faecher, fid); if (!kk || !f) return;
    const v = schuelerWochenstunden(dd, kid, fid, 'verteilung', { bl }), alt = kk.stundentafel[fid] || 0;
    if (v === alt || !Number.isInteger(v * 2)) return;
    if (v > 0) kk.stundentafel[fid] = v; else delete kk.stundentafel[fid];
    meldungen.push(kk.name + ' ' + (f.kuerzel || f.name) + ': ' + zahlDe(alt, 1) + ' → ' + zahlDe(v, 1));
  });
}
// Stundentafel → Unterrichtsverteilung. Angepasst werden nur „einfache“ Unterrichte: ein Fach, genau eine Klasse, ohne Gruppen und ohne Kopplung.
// Alles andere (Gruppen, Kopplungen, mehrere Kurse) wird nur gemeldet.
function tafelAbgleichen(d, paare, opt) {
  opt = opt || {};
  const r = { geaendert: [], neu: [], entfernt: [], ueberzaehlig: [], offen: [] };
  const gesehen = new Set();
  paare.forEach(({ k, f, zusammen }) => {
    if (gesehen.has(k + '|' + f)) return; gesehen.add(k + '|' + f);
    const kl = d.klassen.find(x => x.id === k), fa = d.faecher.find(x => x.id === f);
    if (!kl || !fa) return;
    const soll = kl.stundentafel[f] || 0;
    const alle = d.unterrichte.filter(u => !u.aufgabe && u.fach === f && u.klassen.includes(k));
    const name = (fa.kuerzel || fa.name) + ' ' + kl.name;
    // in Gruppen A/B geteilte Fächer (Stundentafel ✂): zwei Gruppen-Unterrichte anlegen, umwandeln, anpassen oder wieder zusammenführen
    const tr = teilungAbgleichen(d, kl, fa, soll, Object.assign({}, opt, { zusammen: opt.zusammen || zusammen }));
    if (tr) {
      if (tr === 'neu') r.neu.push(name + ' (Gruppen A und B, je ' + soll + ' UStd.)');
      else if (tr === 'geteilt') r.geaendert.push(name + ': in die Gruppen A und B geteilt (je ' + soll + ' UStd.)');
      else if (tr === 'geaendert') r.geaendert.push(name + ' (Gruppen A und B): je ' + soll + ' UStd.');
      else if (tr === 'zusammen') r.geaendert.push(name + ': Gruppen A und B wieder zur ganzen Klasse zusammengeführt');
      else if (tr === 'entfernt') r.entfernt.push(name + ' (Gruppen A und B)');
      else if (tr === 'offen') r.offen.push(name + (Number.isInteger(soll) ? ' (Teilung in Gruppen: Kopplung, A/B-Wochen oder mehrere Kurse – bitte von Hand anpassen)' : ' (halbe Wochenstunden in Halbgruppen: die beiden Gruppen-Unterrichte in der Unterrichtsverteilung von Hand auf „nur Woche A“ bzw. „nur Woche B“ stellen)'));
      return;
    }
    // Halbe Wochenstunden: eine zusätzliche Stunde, die nur in Woche A stattfindet (zählt je Schüler 0,5). Dafür braucht die Schule A/B-Wochen.
    const halb = !Number.isInteger(soll), ganz = Math.floor(soll), ab = d.schule.wochenrhythmus === 'AB';
    const weg = ids => { d.unterrichte = d.unterrichte.filter(x => !ids.includes(x.id)); d.plan.platzierungen = d.plan.platzierungen.filter(p => !ids.includes(p.unterricht)); };
    const stundenSetzen = (x, ws) => { if (x.wochenstunden === ws) return; x.wochenstunden = ws; x.bloecke = []; x.bloeckeWoche = []; x.lehrkraefte.forEach(z => { if (z.stundenAnteil > ws) z.stundenAnteil = ws; }); d.plan.platzierungen = d.plan.platzierungen.filter(p => p.unterricht !== x.id); };
    const einfach = x => x.klassen.length === 1 && !x.gruppen.length && !x.kopplung;
    const voll = alle.filter(x => x.rhythmus === 'jede'), wechsel = alle.filter(x => x.rhythmus !== 'jede');
    if (halb && !ab) { r.offen.push(name + ' (' + zahlDe(soll, 1) + ' UStd.: halbe UStd. je Woche gibt es nur mit A/B-Wochen – unter „Schule“ den Wochenrhythmus A/B einschalten)'); return; }
    if (!alle.length) {
      if (soll > 0 && opt.anlegen !== false) {
        if (ganz > 0) d.unterrichte.push(nUnterricht({ fach: f, klassen: [k], wochenstunden: ganz, lehrkraefte: [], vorbereitung: fa.vorbereitung, fachAuto: true }));
        if (halb) d.unterrichte.push(nUnterricht({ fach: f, klassen: [k], wochenstunden: 1, rhythmus: 'A', lehrkraefte: [], vorbereitung: fa.vorbereitung, fachAuto: true }));
        r.neu.push(name + ' (' + zahlDe(soll, 1) + ' UStd.' + (halb ? (ganz ? ', davon' : ':') + ' 1 Stunde nur in Woche A' : '') + ')');
      }
      return;
    }
    // ein Unterricht „jede Woche“ und/oder einer im A-/B-Wechsel (beide einfach): ganze Stunden im einen, die halbe im anderen
    if (alle.every(einfach) && voll.length <= 1 && wechsel.length <= 1 && (alle.length === 2 || (halb && voll.length === 1) || (wechsel.length === 1 && wechsel[0].wochenstunden === 1))) {
      const v = voll[0], w = wechsel[0], vorher = schuelerWochenstunden(d, kl.id, f, 'verteilung');
      if (Math.abs(vorher - soll) < 1e-9) return;
      if (v) { if (ganz > 0) stundenSetzen(v, ganz); else if (halb && !w) { v.rhythmus = 'A'; stundenSetzen(v, 0); stundenSetzen(v, 1); } else if (opt.entfernen || soll > 0) weg([v.id]); else { r.ueberzaehlig.push(name + ' (' + v.wochenstunden + ' UStd.)'); return; } }
      else if (ganz > 0) d.unterrichte.push(nUnterricht({ fach: f, klassen: [k], wochenstunden: ganz, lehrkraefte: w ? JSON.parse(JSON.stringify((w.lehrkraefte || []).filter(z => !z.auto))) : [], vorbereitung: fa.vorbereitung, fachAuto: w ? !(w.lehrkraefte || []).some(z => z.rolle === 'fach' && z.lehrer && !z.auto) : true }));
      if (w) { if (halb) stundenSetzen(w, 1); else if (opt.entfernen || soll > 0) weg([w.id]); else { r.ueberzaehlig.push(name + ' (' + w.wochenstunden + ' UStd. in Woche ' + w.rhythmus + ')'); return; } }
      else if (halb && !(v && ganz === 0)) d.unterrichte.push(nUnterricht({ fach: f, klassen: [k], wochenstunden: 1, rhythmus: 'A', lehrkraefte: v ? JSON.parse(JSON.stringify((v.lehrkraefte || []).filter(z => !z.auto))) : [], vorbereitung: fa.vorbereitung, fachAuto: v ? !(v.lehrkraefte || []).some(z => z.rolle === 'fach' && z.lehrer && !z.auto) : true }));
      (soll > 0 ? r.geaendert : r.entfernt).push(name + ': ' + zahlDe(vorher, 1) + ' → ' + zahlDe(soll, 1) + ' UStd.' + (halb ? ' (' + (ganz ? ganz + ' jede Woche + ' : '') + '1 Stunde nur in Woche A)' : ''));
      return;
    }
    const u = alle[0];
    if (alle.length !== 1 || u.klassen.length !== 1 || u.gruppen.length || u.kopplung) {
      const ist = schuelerWochenstunden(d, kl.id, f, 'verteilung'); // je Schüler
      if (Math.abs(ist - soll) > 1e-9) r.offen.push(name + ' (Stundentafel ' + zahlDe(soll, 1) + ', geplant ' + zahlDe(ist, 1) + ' – Gruppen, Kopplung oder mehrere Kurse)');
      return;
    }
    // Stundentafel = Wochenstunden je Schüler: Unterricht nur in Woche A oder B braucht dafür doppelt so viele reale Stunden
    const ziel = soll / wochenAnteil(u.rhythmus);
    if (u.wochenstunden === ziel) return;
    if (soll === 0) {
      if (opt.entfernen) { d.unterrichte = d.unterrichte.filter(x => x.id !== u.id); d.plan.platzierungen = d.plan.platzierungen.filter(p => p.unterricht !== u.id); r.entfernt.push(name + ' (' + u.wochenstunden + ' UStd.)'); }
      else r.ueberzaehlig.push(name + ' (' + u.wochenstunden + ' UStd.)');
      return;
    }
    const alt = u.wochenstunden;
    u.wochenstunden = ziel;
    if (u.bloecke.length && Math.abs(u.bloecke.reduce((a, b, i) => a + b * (u.rhythmus !== 'jede' ? 1 : wochenAnteil((u.bloeckeWoche || [])[i])), 0) - ziel) > 1e-9) { u.bloecke = []; u.bloeckeWoche = []; }
    u.lehrkraefte.forEach(z => { if (z.stundenAnteil > soll) z.stundenAnteil = soll; });
    d.plan.platzierungen = d.plan.platzierungen.filter(p => p.unterricht !== u.id);
    r.geaendert.push(name + ': ' + alt + ' → ' + ziel + ' UStd.' + (u.rhythmus !== 'jede' ? ' in Woche ' + u.rhythmus + ' (= ' + soll + ' je Woche)' : ''));
  });
  return r;
}
// alle Klasse-Fach-Paare aus Stundentafeln und Unterrichten
function tafelPaare(d, klassenIds) {
  const out = [];
  d.klassen.forEach(k => {
    if (klassenIds && !klassenIds.includes(k.id)) return;
    const f = new Set(Object.keys(k.stundentafel));
    d.unterrichte.forEach(u => { if (!u.aufgabe && u.fach && u.klassen.includes(k.id)) f.add(u.fach); });
    f.forEach(fid => out.push({ k: k.id, f: fid }));
  });
  return out;
}
function tafelMeldung(r) {
  const teile = [];
  if (r.geaendert.length) teile.push(r.geaendert.length === 1 ? 'Unterricht angepasst: ' + r.geaendert[0] : r.geaendert.length + ' Unterrichte angepasst');
  if (r.neu.length) teile.push(r.neu.length === 1 ? 'neu angelegt: ' + r.neu[0] : r.neu.length + ' Unterrichte neu angelegt');
  if (r.entfernt.length) teile.push(r.entfernt.length === 1 ? 'entfernt: ' + r.entfernt[0] : r.entfernt.length + ' Unterrichte entfernt');
  if (teile.length) toast('Unterrichtsverteilung folgt der Stundentafel – ' + teile.join(', ').replace(/\.$/, '') + '. Rückgängig mit Strg+Z.', 'ok', 7000);
  if (r.offen.length) toast('Bitte in der Unterrichtsverteilung von Hand anpassen: ' + r.offen.slice(0, 3).join('; ') + (r.offen.length > 3 ? ' …' : ''), 'err', 9000);
}
async function ausStundentafelErzeugen() {
  const probe = JSON.parse(JSON.stringify(APP.daten));
  const rp = tafelAbgleichen(probe, tafelPaare(probe), {});
  const loeschen = h('input', { type: 'checkbox' });
  const liste = (titel, l, hinweis) => l.length ? h('div', {}, h('h3', {}, titel + ' (' + l.length + ')'), hinweis ? h('p', { class: 'muted klein' }, hinweis) : null, h('ul', { class: 'klein' }, l.slice(0, 14).map(x => h('li', {}, x)), l.length > 14 ? h('li', { class: 'muted' }, '… und ' + (l.length - 14) + ' weitere') : null)) : null;
  if (!rp.geaendert.length && !rp.neu.length && !rp.ueberzaehlig.length && !rp.offen.length) { toast('Unterrichtsverteilung und Stundentafeln stimmen überein.', 'ok'); return; }
  const ok = await dialog({ titel: 'Mit Stundentafel abgleichen', breite: '640px', inhalt: h('div', {},
    h('p', {}, 'Die Stundentafeln der Klassen sind die Vorgabe. Einfache Unterrichte (eine Klasse, ohne Gruppen und Kopplung) werden angepasst, fehlende angelegt. Zwingende Personalvorgaben bleiben erhalten; automatische Personalzuteilungen werden bei der nächsten Berechnung neu bestimmt. Platzierungen geänderter Unterrichte werden verworfen.'),
    liste('Stundenzahl anpassen', rp.geaendert),
    liste('Neu anlegen', rp.neu),
    rp.ueberzaehlig.length ? h('div', {}, liste('Nicht (mehr) in der Stundentafel', rp.ueberzaehlig), h('label', { class: 'check' }, loeschen, 'diese Unterrichte löschen')) : null,
    liste('Von Hand prüfen', rp.offen, 'Hier gibt es Gruppen, Kopplungen oder mehrere Kurse – das Programm ändert sie nicht selbst.')),
    knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'Abgleichen', wert: true, art: 'primaer' }] });
  if (!ok) return;
  let r = null, co = null;
  aendern('Unterrichtsversorgung mit Stundentafel abgeglichen', d => { r = tafelAbgleichen(d, tafelPaare(d), { entfernen: loeschen.checked }); }, { normalisieren: true });
  tafelMeldung(Object.assign({}, r, { offen: [] }));
  if (co && co.ergaenzt && co.ergaenzt.length) toast(co.ergaenzt.length + ' neue Kurs(e) haben eine Co-Lehrkraft bekommen.', 'ok', 6000);
}
// Teilen eines Unterrichts in die Gruppen A und B: parallel (zwei Lehrkräfte, gekoppelt) oder im Wechsel (Woche A/B)
function unterrichtTeilen(uid, art) {
  let neuId = null;
  aendern(art === 'parallel' ? 'Unterricht in Gruppen A/B geteilt (parallel)' : 'Unterricht in Gruppen A/B geteilt (im Wechsel)', d => {
    const u = findeId(d.unterrichte, uid); if (!u || u.klassen.length !== 1) return;
    const k = findeId(d.klassen, u.klassen[0]); if (!k) return;
    const [gA, gB] = halbgruppen(k); // die beiden Halbgruppen der Klasse (auch umbenannte); fehlen sie, werden A und B angelegt
    const b = JSON.parse(JSON.stringify(u));
    b.id = neueId('u'); neuId = b.id; b.fixiert = [];
    u.gruppen = [gA.id]; b.gruppen = [gB.id];
    if (art === 'parallel') {
      u.kopplung = u.kopplung || ('teil_' + u.id); b.kopplung = u.kopplung;
      // zweite Lehrkraft: ausgebildetes Teammitglied mit dem Fach, sonst leer lassen
      const fl = u.lehrkraefte.filter(z => z.rolle === 'fach').map(z => z.lehrer);
      const kand = k.team.map(id => findeId(d.lehrer, id)).find(l => l && l.ausgebildet !== false && l.faecher.includes(u.fach) && !fl.includes(l.id));
      b.lehrkraefte = kand ? [nLehrkraftZuordnung({ lehrer: kand.id, rolle: 'fach', modus: 'immer', deputatFaktor: 1 })] : [];
      u.lehrkraefte = u.lehrkraefte.filter(z => z.rolle === 'fach');
    } else {
      d.schule.wochenrhythmus = 'AB';
      u.rhythmus = 'A'; b.rhythmus = 'B'; u.bloeckeWoche = []; b.bloeckeWoche = [];
    }
    const i = d.unterrichte.indexOf(u);
    d.unterrichte.splice(i + 1, 0, b);
    d.plan.platzierungen = d.plan.platzierungen.filter(p => p.unterricht !== u.id);
    tafelFolgt(d, [u, b], []);
  }, { normalisieren: true });
  if (art === 'parallel' && neuId) { toast('Gruppe A bleibt bei der bisherigen Lehrkraft. Bitte die Lehrkraft für Gruppe B prüfen.', 'ok', 7000); unterrichtDialog(neuId); }
  else if (neuId) toast('Gruppe A hat den Unterricht in Woche A, Gruppe B in Woche B (A/B-Rhythmus ist aktiv).', 'ok', 7000);
}
SEITEN_RENDER.unterricht = () => {
  const d = APP.daten;
  const F = d.faecher.filter(f => d.klassen.some(k => k.stundentafel[f.id]) || d.unterrichte.some(u => u.fach === f.id));
  const st = APP.tabellen.uliste || (APP.tabellen.uliste = { filter: '' });
  if (!(st.auswahl instanceof Set)) st.auswahl = new Set();
  const bl = bloeckeAlle(d);
  const Km = d.klassen.filter(k => !st.mJg || String(k.jahrgang) === st.mJg).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de', { numeric: true }));
  const zeigeF = F.map(f => !st.mFach || f.id === st.mFach);
  const jahrgaenge = [...new Set(d.klassen.map(k => k.jahrgang))].sort((a, b) => a - b);
  const matrixFilter = h('div', { class: 'zeile', style: { marginBottom: '8px', gap: '12px' } },
    h('span', { class: 'klein muted' }, 'Anzeigen:'),
    h('label', { class: 'zeile eng klein' }, 'Jahrgang', sel([['', 'alle']].concat(jahrgaenge.map(j => [String(j), String(j)])), st.mJg || '', v => { st.mJg = v; render(); }, { 'aria-label': 'Matrix nach Jahrgang filtern' })),
    h('label', { class: 'zeile eng klein' }, 'Fach', sel([['', 'alle Fächer']].concat(F.slice().sort((a, b) => (a.kuerzel || '').localeCompare(b.kuerzel || '', 'de')).map(f => [f.id, f.kuerzel + ' – ' + f.name])), st.mFach || '', v => { st.mFach = v; render(); }, { 'aria-label': 'Matrix nach Fach filtern' })),
    st.mJg || st.mFach ? h('button', { class: 'btn klein', onclick: () => { st.mJg = ''; st.mFach = ''; render(); } }, 'Filter zurücksetzen') : null);
  const matrix = d.klassen.length && F.length ? h('div', { style: { overflowX: 'auto' } }, h('table', { class: 'matrix' },
    h('thead', {}, h('tr', {}, h('th', { class: 'zeilenkopf' }, 'Klasse'), F.filter((f, i) => zeigeF[i]).map(f => h('th', { title: f.name + (f.coBedarf ? ' – Co einplanen' : '') }, h('span', { class: 'fachpunkt', style: { background: f.farbe } }), f.kuerzel, f.coBedarf ? h('sup', {}, ' +Co') : null)), h('th', { title: 'Wochenstunden je Schüler: Stundentafel / Unterrichtsverteilung' }, 'Σ je Schüler'))),
    h('tbody', {}, Km.map(k => {
      let ist = 0;
      const soll = schuelerWochenstunden(d, k.id, null, 'tafel'), istM = schuelerStunden(d, k.id, 'verteilung', { bl });
      const zellen = F.map(f => {
        const us = d.unterrichte.filter(u => u.fach === f.id && u.klassen.includes(k.id));
        const sollF = k.stundentafel[f.id] || 0;
        const istX = istM.get(f.id) || { wert: 0, gleich: true }, istF = istX.wert, ab = Math.abs(sollF - istF) > 1e-9 || !istX.gleich; // Wochenstunden je Schüler
        ist += istF;
        const abText = ab ? 'Stundentafel ' + sollF + ' UStd., Unterrichtsverteilung ' + zahlDe(istF, 1) + ' UStd. je Schüler' + (istX.gleich ? '' : ' (die Gruppen bekommen verschieden viele Stunden)') + '. ' : '';
        if (!us.length) {
          return h('td', { class: 'zelle ' + (sollF ? 'fehlt' : 'leer'), title: sollF ? 'Laut Stundentafel ' + sollF + ' UStd. – Klick legt den Unterricht an' : 'Neuen Unterricht anlegen', tabindex: 0,
            onclick: () => unterrichtDialog(null, { fach: f.id, klassen: [k.id], wochenstunden: sollF || 1, vorbereitung: f.vorbereitung }),
            onkeydown: ev => { if (ev.key === 'Enter') unterrichtDialog(null, { fach: f.id, klassen: [k.id], wochenstunden: sollF || 1, vorbereitung: f.vorbereitung }); } }, sollF ? '+ ' + sollF : '·');
        }
        const kz = id => { const l = lehrerVon(id); return l ? (l.kuerzel || l.name || '?') : ''; };
        const waehle = (ids, text) => v => {
          let zw = false;
          aendern(text + (v === '__auto' ? ' automatisch' : ''), dd => { ids.forEach(id => { if (fachSetzen(dd, id, v)) zw = true; }); });
          if (zw) toast(kz(v) + ' ist Co-Kraft und wurde mit Zwang als Fachlehrkraft eingeteilt.', '', 6000);
        };
        const attrs = (fz, auto) => ({ 'aria-label': 'Fachlehrkraft ' + k.name + ' ' + f.kuerzel, class: (auto ? 'autofach ' : '') + (fz && fz.zwang ? 'zwang' : '') + (fz && k.team.length && !teamVon([k.id]).has(fz.lehrer) ? ' ausserteam' : ''),
          title: auto ? (fz ? 'Automatisch zugeteilt: ' + lehrerName(lehrerVon(fz.lehrer), true) + ' – „Plan berechnen“ teilt automatische Lehrkräfte bei jeder vollen Berechnung neu zu. Eine Lehrkraft aus der Liste wählen legt sie fest.' : (d.plan.platzierungen.length ? 'Automatisch – im aktuellen Plan ohne Lehrkraft (N. N.): Die Berechnung hat niemanden gefunden, oder der Unterricht wurde erst danach auf „automatisch“ gestellt. „Plan berechnen“ teilt neu zu.' : 'Automatisch: „Plan berechnen“ teilt die Lehrkraft zu (nur mit Fachbefähigung: Klassenleitung zuerst, dann Klassenteam, dann übrige).'))
            : fz ? lehrerName(lehrerVon(fz.lehrer), true) + (fz.zwang ? ' – Co-Kraft mit Zwang' : '') + (k.team.length && !teamVon([k.id]).has(fz.lehrer) ? ' – nicht im Klassenteam ' + k.name : '') + ' (* = ohne Lehrbefähigung; Klassenteam steht oben)' : 'Fachlehrkraft wählen: „automatisch“ oder eine Person (Klassenteam oben; Co-Kräfte nur mit Zwang)' });
        if (us.length === 1) {
          const u = us[0];
          const fz = u.lehrkraefte.find(z => z.rolle === 'fach');
          const co = u.lehrkraefte.filter(z => z.rolle === 'co' && !z.auto);
          const auto = !u.lehrkraefte.some(z => z.rolle === 'fach' && z.lehrer && !z.auto);
          return h('td', { 'data-id': u.id, class: (ab ? 'fehlt' : '') + (auto && !fz && d.plan.platzierungen.length ? ' autooffen' : ''), title: abText + (co.length ? 'Co: ' + co.map(z => lehrerName(lehrerVon(z.lehrer))).join(', ') : '') },
            h('div', { class: 'zeile eng', style: { justifyContent: 'center', flexWrap: 'nowrap' } },
              u.gruppen.length ? h('span', { class: 'badge warn', title: 'Nur ' + (u.gruppen.length === 1 ? 'die Gruppe ' : 'die Gruppen ') + u.gruppen.map(g => (k.gruppen.find(x => x.id === g) || {}).name || '?').join(', ') + ' hat ' + f.kuerzel + ' – der Rest der Klasse nicht. Für geteilte Fächer in der Stundentafel den Scheren-Knopf verwenden.' }, 'nur ' + u.gruppen.map(g => (k.gruppen.find(x => x.id === g) || {}).name || '?').join(',')) : null,
              lehrerSelect(fz ? fz.lehrer : '', f.id, waehle([u.id], 'Fachlehrkraft ' + k.name + ' ' + f.kuerzel), attrs(fz, auto), [k.id], { aktiv: auto, kurz: '' }),
              h('button', { class: 'btn icon klein', title: 'Unterricht bearbeiten (Co-Lehrkräfte, Blöcke, Raum, Teilung, Kopplung …)', 'aria-label': 'Unterricht bearbeiten', onclick: () => unterrichtDialog(u.id) }, u.wochenstunden + (co.length ? '+' : ''))));
        }
        // in Gruppen A und B geteilt (✂): ein Auswahlfeld für beide Gruppen
        const paar = teilungsPaar(k, us);
        if (paar) {
          const fzA = paar[0].lehrkraefte.find(z => z.rolle === 'fach'), fzB = paar[1].lehrkraefte.find(z => z.rolle === 'fach');
          const auto = paar[0].fachAuto && paar[1].fachAuto, gleich = (fzA ? fzA.lehrer : '') === (fzB ? fzB.lehrer : '');
          const std = paar[0].wochenstunden;
          const pfk = (k.parallel || {})[f.id] ? ((F.find(x => x.id === k.parallel[f.id]) || {}).kuerzel || '?') : '';
          return h('td', { 'data-id': paar[0].id, class: 'geteilt' + (ab ? ' fehlt' : '') + (auto && !fzA && d.plan.platzierungen.length ? ' autooffen' : ''), title: abText + 'In Halbgruppen geteilt: jede Gruppe ' + std + ' UStd. ' + f.kuerzel + ' – je Schüler ' + zahlDe(istF, 1) + ' UStd. je Woche. Die Vorbereitung zählt bei derselben Lehrkraft nur einmal.' + (pfk ? ' Parallelpartner: ' + pfk + ' (liegt immer zeitgleich).' : ' Kein Parallelpartner – die andere Gruppe ist währenddessen frei.') },
            h('div', { class: 'zeile eng', style: { justifyContent: 'center', flexWrap: 'nowrap' } },
              h('span', { class: 'teilmarke', 'aria-hidden': 'true' }, pfk ? '∥' + pfk : icon('schere', 'k')),
              gleich || auto ? lehrerSelect(fzA ? fzA.lehrer : '', f.id, waehle([paar[0].id, paar[1].id], 'Fachlehrkraft ' + k.name + ' ' + f.kuerzel + ' (Gruppen A und B)'), attrs(fzA, auto), [k.id], { aktiv: auto, kurz: fzA ? kz(fzA.lehrer) + (gleich ? '' : '/' + (fzB ? kz(fzB.lehrer) : '–')) : '' })
                : h('span', { class: 'klein nowrap', title: 'Die Gruppen haben verschiedene Lehrkräfte – zum Ändern die Knöpfe A und B' }, 'A: ' + (fzA ? kz(fzA.lehrer) : '–') + ' · B: ' + (fzB ? kz(fzB.lehrer) : '–')),
              h('button', { class: 'btn icon klein', title: 'Unterricht der Gruppe A bearbeiten (' + std + ' UStd.)', 'aria-label': 'Gruppe A bearbeiten', onclick: () => unterrichtDialog(paar[0].id) }, 'A'),
              h('button', { class: 'btn icon klein', title: 'Unterricht der Gruppe B bearbeiten (' + paar[1].wochenstunden + ' UStd.)', 'aria-label': 'Gruppe B bearbeiten', onclick: () => unterrichtDialog(paar[1].id) }, 'B')));
        }
        return h('td', { class: 'zelle' + (ab ? ' fehlt' : ''), title: abText + 'Mehrere Kurse (z. B. Gruppen A/B) – Klick filtert die Liste', onclick: () => { st.filter = k.name + ' ' + f.kuerzel; render(); } }, us.map(u => (u.gruppen.length ? u.gruppen.map(g => (k.gruppen.find(x => x.id === g) || {}).name).join('') + ':' : '') + lehrkraefteText(u, false) + (u.rhythmus !== 'jede' ? '[' + u.rhythmus + ']' : '')).join(' · '));
      });
      return h('tr', {}, h('th', { class: 'zeilenkopf' }, k.name), zellen.filter((_, i) => zeigeF[i]), h('td', {}, h('span', { class: 'badge ' + (Math.abs(soll - ist) < 1e-9 ? 'ok' : 'err'), title: 'Wochenstunden je Schüler: Stundentafel / Unterrichtsverteilung (Halbgruppen zählen einmal, A-/B-Wochen halb)' }, zahlDe(soll, 1) + '/' + zahlDe(ist, 1))));
    })))) : leerZustand({ klein: true, icon: 'gruppe', titel: 'Noch keine Klassen oder Fächer', text: 'Die Übersicht zeigt je Klasse und Fach, wer unterrichtet – sobald Klassen, Fächer und die Stundentafel angelegt sind.', aktion: { text: 'Klassen anlegen', tun: () => gehe('klassen') }, zweit: [{ text: 'Fächer anlegen', tun: () => gehe('faecher') }] });
  // Liste aller Unterrichte mit Mehrfachauswahl
  const q = st.filter.trim().toLowerCase();
  const statusTest = {
    '': () => true,
    ohneFach: u => !(u.lehrkraefte || []).some(z => z.rolle === 'fach' && z.lehrer && !z.auto),
    mitCo: u => (u.lehrkraefte || []).some(z => z.rolle === 'co' && z.lehrer && !z.auto),
    coFehlt: u => { const f = fachVon(u.fach); return !!(f && (f.coBedarf || ((u.klassen || []).some(kid => { const k = klasseVon(kid); return k && k.coBedarf && k.coBedarf[u.fach] && k.coBedarf[u.fach] !== 'kein'; })))); },
    ohneVorb: u => !u.vorbereitung,
    zwang: u => (u.lehrkraefte || []).some(z => !z.auto && z.zwang),
    auto: u => !(u.lehrkraefte || []).some(z => z.rolle === 'fach' && z.lehrer && !z.auto),
    geteilt: u => u.gruppen.length > 0 && !u.kopplung,
    gekoppelt: u => !!u.kopplung || u.gruppen.length > 0,
    ab: u => u.rhythmus !== 'jede' || (bl.get(u.id) || { woche: [] }).woche.some(w => w !== 'jede'),
    fixiert: u => u.fixiert.length > 0
  };
  const alle = d.unterrichte.filter(u => !u.aufgabe).map(u => {
    const f = fachVon(u.fach);
    const kl = u.klassen.map(id => (klasseVon(id) || {}).name || '?').join('/');
    const gr = u.gruppen.map(g => { for (const k of d.klassen) { const x = k.gruppen.find(y => y.id === g); if (x) return k.name + ':' + x.name; } return '?'; }).join(', ');
    return { u, f, kl, gr, lk: lehrkraefteText(u), text: [(f || {}).kuerzel, kl, gr, lehrkraefteText(u), u.kopplung || ''].join(' ').toLowerCase() };
  }).filter(x => (!q || q.split(/\s+/).every(w => x.text.includes(w)))
    && (!st.fFach || x.u.fach === st.fFach) && (!st.fKlasse || x.u.klassen.includes(st.fKlasse))
    && (!st.fLehrer || x.u.lehrkraefte.some(z => !z.auto && z.lehrer === st.fLehrer)) && (statusTest[st.fStatus || ''] || statusTest[''])(x.u));
  const sortWert = { fach: x => (x.f || {}).kuerzel || '', klasse: x => x.kl + ' ' + x.gr, lehrer: x => x.lk, std: x => x.u.wochenstunden, bloecke: x => { const b = bl.get(x.u.id); return b ? blockText(b) : ''; }, vorb: x => x.u.vorbereitung ? 1 : 0, raum: x => x.u.raum ? ((raumVon(x.u.raum) || {}).name || '') : '~' + ((x.f || {}).raumTyp || ''), kopplung: x => x.u.kopplung || '', rhythmus: x => x.u.rhythmus, fix: x => x.u.fixiert.length };
  if (st.sort && sortWert[st.sort]) { const w = sortWert[st.sort], dir = st.dir || 1; alle.sort((a, b) => { const x = w(a), y = w(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'de', { numeric: true })) * dir; }); }
  const sortKopf = (k, t) => h('th', { class: 'sort', title: 'Sortieren', onclick: () => { if (st.sort === k) st.dir = -(st.dir || 1); else { st.sort = k; st.dir = 1; } render(); } }, t, st.sort === k ? ((st.dir || 1) > 0 ? ' ▲' : ' ▼') : '');
  const lehrerSortiert = lehrerAlphabetisch(d.lehrer);
  const ohneV = ohneVorbSet(d);
  const listenFilter = h('div', { class: 'zeile', style: { gap: '10px', margin: '0 0 8px' } },
    sel([['', 'alle Fächer']].concat(F.slice().sort((a, b) => (a.kuerzel || '').localeCompare(b.kuerzel || '', 'de')).map(f => [f.id, f.kuerzel + ' – ' + f.name])), st.fFach || '', v => { st.fFach = v; render(); }, { 'aria-label': 'Nach Fach filtern' }),
    sel([['', 'alle Klassen']].concat(klassenOpts()), st.fKlasse || '', v => { st.fKlasse = v; render(); }, { 'aria-label': 'Nach Klasse filtern' }),
    sel([['', 'alle Lehrkräfte']].concat(lehrerSortiert.map(l => [l.id, (l.kuerzel || '?') + ' – ' + (l.name || '')])), st.fLehrer || '', v => { st.fLehrer = v; render(); }, { 'aria-label': 'Nach Lehrkraft filtern' }),
    sel([['', 'alle Unterrichte'], ['ohneFach', 'ohne feste Fachlehrkraft-Vorgabe'], ['mitCo', 'mit fester Co-Vorgabe'], ['coFehlt', 'mit konfiguriertem Co-Bedarf'], ['ohneVorb', 'ohne Vorbereitung'], ['zwang', 'Co-Kraft mit Zwang'], ['auto', 'Personal automatisch bei Berechnung'], ['geteilt', 'in Gruppen geteilt'], ['gekoppelt', 'gekoppelt oder geteilt'], ['ab', 'mit A/B-Woche'], ['fixiert', 'mit festen Zeiten']], st.fStatus || '', v => { st.fStatus = v; render(); }, { 'aria-label': 'Nach Eigenschaft filtern' }),
    (st.fFach || st.fKlasse || st.fLehrer || st.fStatus || st.filter || st.sort) ? h('button', { class: 'btn klein', onclick: () => { Object.assign(st, { fFach: '', fKlasse: '', fLehrer: '', fStatus: '', filter: '', sort: null, dir: 1 }); render(); } }, 'Filter und Sortierung zurücksetzen') : null);
  const ids = new Set(d.unterrichte.map(u => u.id));
  [...st.auswahl].forEach(id => { if (!ids.has(id)) st.auswahl.delete(id); });
  const gewaehlt = [...st.auswahl];
  const leiste = gewaehlt.length ? h('div', { class: 'auswahlleiste' }, h('strong', {}, gewaehlt.length + ' ausgewählt'),
    h('button', { class: 'btn klein gefahr', onclick: async () => { if (gewaehlt.length > 5 && !(await bestaetigen(gewaehlt.length + ' Unterrichte löschen? Ihre Platzierungen werden entfernt (rückgängig mit Strg+Z).', gewaehlt.length + ' löschen', 'gefahr'))) return; const nWeg = gewaehlt.length; undoToastNach(() => aendern(nWeg + (nWeg === 1 ? ' Unterricht gelöscht' : ' Unterrichte gelöscht'), dd => { const weg = dd.unterrichte.filter(x => st.auswahl.has(x.id)); dd.unterrichte = dd.unterrichte.filter(x => !st.auswahl.has(x.id)); dd.plan.platzierungen = dd.plan.platzierungen.filter(p => !st.auswahl.has(p.unterricht)); tafelFolgt(dd, weg, []); }, { normalisieren: true }), nWeg + (nWeg === 1 ? ' Unterricht' : ' Unterrichte') + ' samt Platzierungen gelöscht.'); st.auswahl.clear(); render(); } }, 'Löschen'),
    h('button', { class: 'btn klein', onclick: () => aendern('Vorbereitung an', dd => { dd.unterrichte.forEach(x => { if (st.auswahl.has(x.id)) x.vorbereitung = true; }); }) }, 'Mit Vorbereitung'),
    h('button', { class: 'btn klein', onclick: () => aendern('Vorbereitung aus', dd => { dd.unterrichte.forEach(x => { if (st.auswahl.has(x.id)) x.vorbereitung = false; }); }) }, 'Ohne Vorbereitung'),
    h('button', { class: 'btn klein', onclick: () => aendern('Co-Lehrkräfte entfernt', dd => { dd.unterrichte.forEach(x => { if (st.auswahl.has(x.id)) x.lehrkraefte = x.lehrkraefte.filter(z => z.rolle !== 'co'); }); }) }, 'Co-Lehrkräfte entfernen'),
    h('button', { class: 'btn klein rechts', onclick: () => { st.auswahl.clear(); render(); } }, 'Auswahl aufheben')) : null;
  const alleBox = h('input', { type: 'checkbox', 'aria-label': 'Alle angezeigten auswählen', checked: alle.length > 0 && alle.every(x => st.auswahl.has(x.u.id)), onchange: ev => { alle.forEach(x => { if (ev.target.checked) st.auswahl.add(x.u.id); else st.auswahl.delete(x.u.id); }); render(); } });
  const liste = h('div', { class: 'tabwrap' }, h('table', { class: 'tab' },
    h('thead', {}, h('tr', {}, h('th', {}, alleBox), sortKopf('fach', 'Fach'), sortKopf('klasse', 'Klassen / Gruppen'), sortKopf('lehrer', 'Lehrkräfte'), sortKopf('std', 'UStd.'), sortKopf('bloecke', 'Blöcke'), sortKopf('vorb', 'Vorb.'), sortKopf('raum', 'Raum'), sortKopf('kopplung', 'Kopplung'), sortKopf('rhythmus', 'Rhythmus'), sortKopf('fix', 'Fix'), h('th', {}, ''))),
    h('tbody', {}, alle.slice(0, 400).map(({ u, f, kl, gr }) => {
      const b = bl.get(u.id);
      return h('tr', { 'data-id': u.id, class: st.auswahl.has(u.id) ? 'gewaehlt' : '' },
        h('td', {}, h('input', { type: 'checkbox', checked: st.auswahl.has(u.id), 'aria-label': 'Auswählen', onchange: ev => { if (ev.target.checked) st.auswahl.add(u.id); else st.auswahl.delete(u.id); render(); } })),
        h('td', {}, f ? h('span', {}, h('span', { class: 'fachpunkt', style: { background: f.farbe } }), f.kuerzel) : h('span', { class: 'badge err' }, 'kein Fach')),
        h('td', {}, kl || h('span', { class: 'badge err' }, 'keine Klasse'), gr ? h('span', { class: 'muted klein' }, ' · ' + gr) : null),
        h('td', {}, lehrkraefteText(u)),
        h('td', { class: 'zahl' }, u.wochenstunden),
        h('td', { title: b.auto ? 'Von der Berechnung gewählte Aufteilung' + (b.abAuto ? ' – eine Doppelstunde liegt 14-tägig (Woche A oder B)' : '') : b.abAuto ? 'Doppelstundenpflicht bei ungerader Stundenzahl: die übrige Doppelstunde liegt im Wechsel (A/B)' : '' }, blockText(b) + (u.bloecke.length ? '' : ' (auto)')),
        h('td', {}, u.vorbereitung ? (u.lehrkraefte.some(z => ohneV.has(u.id + '|' + z.lehrer)) ? h('span', { class: 'muted', title: 'Geteilte Gruppen: Die Vorbereitung zählt für dieselbe Lehrkraft nur einmal (bei der ersten Gruppe).' }, '1× (Gruppe)') : '✓') : h('span', { class: 'muted' }, 'ohne')),
        h('td', {}, u.raum ? ((raumVon(u.raum) || {}).name || u.raum) : h('span', { class: 'muted' }, (f || {}).raumTyp || '–')),
        h('td', {}, u.kopplung || ''), h('td', {}, u.rhythmus === 'jede' ? '' : 'Woche ' + u.rhythmus),
        h('td', {}, u.fixiert.length ? h('span', { class: 'nowrap', title: u.fixiert.length + (u.fixiert.length === 1 ? ' fixierte Stunde' : ' fixierte Stunden') }, icon('pin', 'k'), ' ' + u.fixiert.length) : ''),
        h('td', { class: 'aktion' },
          h('button', { class: 'btn klein', onclick: () => unterrichtDialog(u.id) }, 'Bearbeiten'),
          h('button', { class: 'btn icon klein', title: 'Duplizieren', 'aria-label': 'Duplizieren', onclick: () => aendern('Unterricht dupliziert', dd => { const x = JSON.parse(JSON.stringify(findeId(dd.unterrichte, u.id))); x.id = neueId('u'); x.fixiert = []; dd.unterrichte.push(x); tafelFolgt(dd, [x], []); }, { normalisieren: true }) }, icon('kopieren')),
          h('button', { class: 'btn icon klein gefahr', title: 'Löschen', 'aria-label': 'Löschen', onclick: () => { const np = APP.daten.plan.platzierungen.filter(p => p.unterricht === u.id).length; aendernMitUndo('Unterricht gelöscht', dd => { const weg = dd.unterrichte.filter(x => x.id === u.id); dd.unterrichte = dd.unterrichte.filter(x => x.id !== u.id); dd.plan.platzierungen = dd.plan.platzierungen.filter(p => p.unterricht !== u.id); tafelFolgt(dd, weg, []); }, { normalisieren: true }, 'Unterricht ' + ((f || {}).kuerzel || '') + ' ' + kl + ' gelöscht' + (np ? ' – ' + np + (np === 1 ? ' Platzierung entfernt.' : ' Platzierungen entfernt.') : '.')); } }, icon('papierkorb'))));
    }))));
  return [
    seitenkopf('Unterrichtsversorgung', 'Hier werden nur notwendige Unterrichtsbedingungen festgelegt: Fach, Klasse, Umfang, Blöcke, Räume, Kopplungen, Fixierungen und – nur wenn zwingend – feste Personalvorgaben. Die automatische Zuteilung von Fach- und Co-Lehrkräften erfolgt ausschließlich während „Plan berechnen“ und kann sich zusammen mit den Unterrichtszeiten ändern.'),
    h('div', { class: 'zeile', style: { marginBottom: '10px', justifyContent: 'flex-end' } },
      h('button', { class: 'btn', onclick: ausStundentafelErzeugen, title: 'Legt fehlende Unterrichte laut Stundentafel an und passt die Stundenzahl einfacher Unterrichte an' }, 'Mit Stundentafel abgleichen'),
      h('button', { class: 'btn', id: 'uvLeeren', onclick: verteilungLeerenDialog, title: 'Unterrichtsversorgung leeren: alles, nur feste Personalvorgaben oder nur die Stunden' }, 'Leeren …'),
      h('button', { class: 'btn primaer', onclick: () => unterrichtDialog(null, {}) }, '+ Neuer Unterricht')),
    h('div', { class: 'karte' }, matrixFilter, matrix,
      h('p', { class: 'muted klein', style: { margin: '8px 0 0' } }, 'Der Knopf mit der Stundenzahl öffnet den Unterrichtsdialog (Co-Lehrkräfte, Blöcke, Raum, Kopplung, Fixierungen). Schere = in die Gruppen A/B geteilt (eine Lehrkraft für beide Gruppen, Vorbereitung zählt einmal). „automatisch“ = die Berechnung teilt zu; „Kürzel (auto)“ = von der letzten Berechnung zugeteilt. Findet die Berechnung niemanden, werden die Stunden trotzdem für die Klasse eingeplant und bleiben ohne Lehrkraft (N. N.), bis Sie eine Person wählen. Rangfolge der Automatik unter den Lehrkräften mit dem Fach: 1. Klassenleitung, 2. Klassenteam, 3. alle anderen – nie über Deputat, Arbeitszeit oder freie Stunden hinaus. Geht ein Unterricht im Plan nicht auf, verteilt die Berechnung ihn in weiteren Durchgängen um.')),
    (() => {
      const azU = arbeitszeiten(d, { geplant: true, ohneAufsicht: true, ohneDienste: true }).liste;
      const stdAnU = !!d.schule.arbeitszeitModell.stundenSoll;
      if (!azU.length) return null;
      return h('div', { class: 'karte', style: { marginTop: '12px' } },
        h('div', { class: 'zeile' }, h('h3', { style: { margin: 0 } }, 'Stunden und Arbeitszeit je Lehrkraft'), h('span', { class: 'muted klein' },
          (stdAnU ? 'Unterrichtsstunden geplant / Deputat (Höchstzahl), dahinter ' : 'Unterrichtsstunden, dahinter ') + 'die Arbeitszeit laut Unterrichtsverteilung gegen die Wochenarbeitszeit – ohne Aufsichten. Rot = über dem Deputat oder über der Wochenarbeitszeit. Ein Klick filtert die Liste unten.')),
        h('div', { class: 'zeile', style: { gap: '6px', marginTop: '8px' } }, azU.slice().sort((a, b) => natVergleich(a.kuerzel, b.kuerzel)).map(x => {
          const m = stdStatus(x), azUeber = x.soll > 0 && x.summe > x.soll + 3;
          const kl = azUeber || m.kl === 'err' ? 'err' : m.kl === 'ok' ? 'ok' : 'neutral';
          return h('button', { class: 'stdchip ' + kl, title: x.name + ': ' + m.titel + ' · Arbeitszeit ' + zahlDe(x.summe / 60, 1) + ' von ' + zahlDe(x.soll / 60, 1) + ' h' + (azUeber ? ' (überschritten – bei der Berechnung finden Stunden ohne diese Person statt: N. N.)' : '') + (x.ausgebildet ? '' : ' (Co-Kraft)'), onclick: () => { st.fLehrer = x.lehrer; render(); } },
            h('b', {}, x.kuerzel), ' ' + m.text + ' UStd. · ' + zahlDe(x.summe / 60, 1) + '/' + zahlDe(x.soll / 60, 1) + ' h');
        })));
    })(),
    h('h2', {}, 'Alle Unterrichte (' + d.unterrichte.filter(u => !u.aufgabe).length + ')'),
    ...(!d.unterrichte.some(u => !u.aufgabe) ? [h('div', { class: 'karte' }, leerZustand({ klein: true, icon: 'tabelle', titel: 'Noch kein Unterricht', text: 'Am schnellsten entsteht der Unterricht aus der Stundentafel der Klassen; einzelne Unterrichte lassen sich auch von Hand anlegen.', aktion: { text: 'Mit Stundentafel abgleichen', tun: ausStundentafelErzeugen }, zweit: [{ text: '+ Neuer Unterricht', tun: () => unterrichtDialog(null, {}) }] }))] : [
    listenFilter,
    h('div', { class: 'tabelle-werkzeuge' }, h('input', { type: 'search', placeholder: 'Filtern, z. B. „7a Ma“ oder „Mü“', value: st.filter, style: { width: '280px' }, 'aria-label': 'Unterrichte filtern', oninput: ev => { st.filter = ev.target.value; clearTimeout(st.t); st.t = setTimeout(render, 250); } }),
      h('span', { class: 'muted klein' }, alle.length + ' angezeigt' + (alle.length > 400 ? ' (erste 400)' : '') + '. * = automatisch ergänzte Co-Lehrkraft. Gekoppelte Unterrichte (gleiche Kopplungs-ID) laufen zeitgleich.')),
    leiste, liste])
  ];
};

/* ---------------- Unterrichtsdialog ---------------- */
function bloeckeParsen(txt) {
  const bloecke = [], woche = [];
  String(txt || '').split(/[,+ ]+/).filter(Boolean).forEach(t => { const m = /^(\d+)\s*([AaBb])?$/.exec(t.trim()); if (!m) return; bloecke.push(Number(m[1])); woche.push(m[2] ? m[2].toUpperCase() : 'jede'); });
  return { bloecke, woche: woche.some(w => w !== 'jede') ? woche : [] };
}
async function unterrichtDialog(uid, vorlage) {
  const d = APP.daten;
  const orig = uid ? findeId(d.unterrichte, uid) : null;
  if (uid && !orig) return;
  if (orig && orig.aufgabe) return aufgabeDialog(uid);
  const u = orig ? JSON.parse(JSON.stringify(orig)) : nUnterricht(Object.assign({ fachAuto: true }, vorlage || {}));
  // Automatische Ergebnisse der letzten Berechnung sind keine Bedingungen und werden im Eingabedialog nicht bearbeitet.
  u.lehrkraefte = (u.lehrkraefte || []).filter(z => !z.auto);
  u.fachAuto = !u.lehrkraefte.some(z => z.rolle === 'fach' && z.lehrer);
  const root = h('div', { style: { minWidth: '720px' } });
  const D = d.schule.tage.length;
  const ab = d.schule.wochenrhythmus === 'AB';
  let abAktivieren = false;
  const zeichne = () => {
    const f = fachVon(u.fach);
    const extra = abZusatzWochen(d).get(u.id) || 'A';
    const trR = teilungsRegeln(d).get(u.id); // geteilte Fächer einer Klasse teilen sich die Doppelstunden-Regel
    const auto = bloeckeMitWoche(Object.assign({}, u, { bloecke: [] }), trR ? { doppelstunde: trR } : fachFuerBloecke(APP.daten, u, f), D, ab || abAktivieren, extra);
    const ungeradePflicht = f && f.doppelstunde === 'pflicht' && u.wochenstunden % 2 === 1 && u.rhythmus === 'jede' && !u.bloecke.length;
    const gruppen = []; u.klassen.forEach(kid => { const k = klasseVon(kid); if (k) k.gruppen.forEach(g => gruppen.push({ g, k })); });
    const raumOptsListe = [['', '(Raumtyp des Fachs' + (f ? ': ' + (f.raumTyp || 'kein Raum') : '') + ')']].concat(raumTypen().map(t => [t, 'Typ: ' + t])).concat(d.raeume.map(r => [r.id, 'Raum: ' + r.name]));
    const lkZeilen = u.lehrkraefte.map((z, i) => {
      const lz = lehrerVon(z.lehrer);
      const falsch = z.rolle === 'fach' && lz && lz.ausgebildet === false && !z.zwang;
      const zwangCo = z.rolle === 'fach' && lz && lz.ausgebildet === false && z.zwang;
      return h('tr', {},
        h('td', {}, sel(lehrerOpts('– wählen –', u.fach, false, z.rolle === 'fach' ? (z.zwang ? undefined : 'fach') : 'co', u.klassen), z.lehrer, v => { z.lehrer = v; z.auto = false; if (z.rolle === 'fach') u.fachAuto = false; zeichne(); }, { 'aria-label': 'Lehrkraft', class: falsch ? 'fehler' : zwangCo ? 'zwang' : '' }), falsch ? h('div', { class: 'klein', style: { color: 'var(--err)' } }, 'Co-Kraft – nur als Co-Lehrkraft oder mit „Zwang“') : null,
          lz && !falsch && u.fach && !lehrerPasst(lz, u.fach, z.rolle) ? h('div', { class: 'klein', style: { color: 'var(--warn)' } }, z.rolle === 'co' ? '⚠ hat ' + ((fachVon(u.fach) || {}).kuerzel || 'das Fach') + ' nicht als Co-Fach' : '⚠ ohne Lehrbefähigung für ' + ((fachVon(u.fach) || {}).kuerzel || 'das Fach')) : null,
          lz && teamVon(u.klassen).size && !teamVon(u.klassen).has(lz.id) ? h('div', { class: 'klein muted' }, '○ nicht im ' + teamTitel(u.klassen)) : null,
          z.rolle === 'fach' ? h('label', { class: 'check klein', title: 'Erlaubt ausnahmsweise eine Co-Kraft (ohne Haken „Ausgebildet“) als Fachlehrkraft. Der Machbarkeitscheck weist darauf hin.' }, h('input', { type: 'checkbox', checked: !!z.zwang, onchange: ev => { z.zwang = ev.target.checked; if (!z.zwang) { const l = lehrerVon(z.lehrer); if (l && l.ausgebildet === false) z.lehrer = ''; } zeichne(); } }), 'Zwang: Co-Kraft zulassen') : null,
          zwangCo ? h('div', { class: 'klein', style: { color: 'var(--warn)' } }, '⚠ Co-Kraft per Zwang als Fachlehrkraft') : null, z.auto ? h('div', { class: 'klein muted' }, z.rolle === 'fach' ? 'automatisch zugeteilt' : '* automatisch ergänzt') : null),
        h('td', {}, sel([['fach', 'Fachlehrkraft'], ['co', 'Co-Lehrkraft']], z.rolle, v => { if (z.rolle === 'fach' || v === 'fach') u.fachAuto = false; z.rolle = v; z.auto = false; if (v === 'co' && z.deputatFaktor === 1) z.deputatFaktor = 0.5; if (v === 'fach') { z.modus = 'immer'; z.deputatFaktor = 1; const l = lehrerVon(z.lehrer); if (l && l.ausgebildet === false && !z.zwang) z.lehrer = ''; } else z.zwang = false; zeichne(); }, { 'aria-label': 'Rolle' })),
        h('td', {}, sel([['immer', 'immer'], ['anteilig', 'anteilig']], z.modus === 'anteilig' ? 'anteilig' : 'immer', v => { z.modus = v; if (v === 'anteilig' && !z.stundenAnteil) z.stundenAnteil = Math.ceil(u.wochenstunden / 2); zeichne(); }, { 'aria-label': 'Modus', disabled: z.rolle === 'fach' && u.lehrkraefte.filter(x => x.rolle === 'fach').length === 1 })),
        h('td', {}, z.modus === 'anteilig' ? h('span', { class: 'zeile eng nowrap' }, h('input', { type: 'number', min: 0, max: u.wochenstunden, value: z.stundenAnteil, 'aria-label': 'Anteil in UStd.', onchange: ev => { z.stundenAnteil = Number(ev.target.value) || 0; } }), ' von ' + u.wochenstunden) : h('span', { class: 'muted' }, 'alle')),
        h('td', { class: 'aktion' }, h('button', { class: 'btn icon klein gefahr', 'aria-label': 'Zeile entfernen', onclick: () => { u.lehrkraefte.splice(i, 1); zeichne(); } }, icon('papierkorb'))));
    });
    const kannTeilen = orig && u.klassen.length === 1 && !u.gruppen.length;
    const fachDa = u.lehrkraefte.some(z => z.rolle === 'fach');
    leeren(root).append(h('div', {},
      h('div', { class: 'zeile', style: { gap: '14px', alignItems: 'flex-end' } },
        h('label', { class: 'feld' }, 'Fach', sel(fachOpts('– wählen –'), u.fach, v => { u.fach = v; const ff = fachVon(v); if (ff && !orig) u.vorbereitung = ff.vorbereitung; zeichne(); })),
        h('label', { class: 'feld' }, 'UStd. je Woche', h('input', { type: 'number', min: 0, max: 40, value: u.wochenstunden, onchange: ev => { u.wochenstunden = Number(ev.target.value) || 0; zeichne(); } })),
        h('label', { class: 'feld' }, h('span', {}, 'Blöcke', hilfe('Leer = automatisch: „Plan berechnen“ wählt die Aufteilung selbst – Einzel- und Doppelstunden nach der Doppelstundenregel des Fachs, bei ungerader Stundenzahl auch eine 14-tägige Doppelstunde (z. B. 7 UStd. = 2,2,2,2A). Die Wochenstunden stimmen immer genau. Eigene Aufteilung: z. B. 2,2 · 2,1 · 1,1,1 · mit A/B-Wechsel 2,2A (zweite Doppelstunde nur in Woche A; zählt halb).')), h('input', { type: 'text', value: u.bloecke.map((b, j) => b + (u.bloeckeWoche[j] && u.bloeckeWoche[j] !== 'jede' ? u.bloeckeWoche[j] : '')).join(','), placeholder: 'auto: ' + blockText(auto), style: { width: '120px' }, onchange: ev => { const p = bloeckeParsen(ev.target.value); u.bloecke = p.bloecke; u.bloeckeWoche = p.woche; zeichne(); } })),
        h('label', { class: 'feld' }, 'Raum', sel(raumOptsListe, u.raum, v => { u.raum = v; })),
        h('label', { class: 'feld' }, 'Rhythmus', sel([['jede', 'jede Woche'], ['A', 'nur Woche A'], ['B', 'nur Woche B']], u.rhythmus, v => { u.rhythmus = v; zeichne(); })),
        h('label', { class: 'feld' }, h('span', {}, 'Kopplung', hilfe('Unterrichte mit gleicher Kopplungs-ID laufen zeitgleich (Band, Wahlpflicht, Religion/Ethik, Teilung A/B parallel). Sie brauchen dieselbe Stundenzahl.')), h('input', { type: 'text', value: u.kopplung || '', placeholder: 'z. B. rel7', style: { width: '110px' }, onchange: ev => { u.kopplung = ev.target.value.trim() || null; } }))),
      h('div', { class: 'zeile', style: { marginTop: '10px', gap: '16px' } },
        h('label', { class: 'check', title: 'Mit Vorbereitungszeit: Lehrkraft 35 min, Co 17 min je Unterrichtsstunde (Arbeitszeitmodell)' }, h('input', { type: 'checkbox', checked: u.vorbereitung, onchange: ev => { u.vorbereitung = ev.target.checked; } }), 'Stunde mit Vorbereitungszeit'),
        h('span', { class: 'muted klein' }, 'Blöcke: ' + (u.bloecke.length ? blockText({ dauer: u.bloecke, woche: u.bloecke.map((_, j) => u.bloeckeWoche[j] || 'jede') }) : blockText(auto) + ' (automatisch)'))),
      ungeradePflicht ? h('div', { class: 'hinweis ok' }, h('b', {}, 'Doppelstunden sind Pflicht: '), (f.kuerzel || f.name) + ' hat ' + u.wochenstunden + ' UStd. je Woche – es bleibt bei Doppelstunden. Die übrige Doppelstunde liegt im Wechsel nur in Woche ' + extra + ' (' + blockText(auto) + ', im Mittel ' + u.wochenstunden + ' UStd. je Woche). Soll stattdessen eine Einzelstunde liegen, bei „Blöcke“ z. B. ' + Array(Math.floor(u.wochenstunden / 2)).fill(2).concat([1]).join(',') + ' eintragen.') : null,
      f && f.doppelstunde === 'pflicht' && !u.aufgabe && u.bloecke.some(b => b === 1) ? h('div', { class: 'hinweis warn' }, 'Die eingetragenen Blöcke enthalten eine Einzelstunde, obwohl ' + (f.kuerzel || f.name) + ' Doppelstunden verlangt. Die Blöcke hier gehen vor – Feld leeren, damit nur Doppelstunden geplant werden.') : null,
      h('h3', {}, 'Klassen'),
      h('div', { class: 'zeile', style: { gap: '4px 12px' } }, d.klassen.map(k => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: u.klassen.includes(k.id), onchange: ev => { u.klassen = ev.target.checked ? u.klassen.concat([k.id]) : u.klassen.filter(x => x !== k.id); zeichne(); } }), k.name))),
      gruppen.length ? h('div', {}, h('h3', {}, 'Nur Teilgruppen', hilfe('Ohne Auswahl nimmt die ganze Klasse teil.')),
        h('div', { class: 'zeile', style: { gap: '4px 12px' } }, gruppen.map(({ g, k }) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: u.gruppen.includes(g.id), onchange: ev => { u.gruppen = ev.target.checked ? u.gruppen.concat([g.id]) : u.gruppen.filter(x => x !== g.id); } }), k.name + ': ' + g.name)))) : null,
      kannTeilen ? h('div', {}, h('h3', {}, 'Teilung in Gruppen A und B', hilfe('Legt die Gruppen A und B der Klasse an (falls nötig) und teilt diesen Kurs.')),
        h('div', { class: 'zeile' },
          h('button', { class: 'btn klein', title: 'Jede Gruppe bekommt die volle Stundenzahl bei derselben Lehrkraft, die Vorbereitung zählt einmal. Entspricht dem Scheren-Knopf in der Stundentafel.', onclick: () => document.querySelector('dialog[open] [data-wert="teilen-gruppen"]').click() }, 'In Gruppen teilen (eine Lehrkraft, nacheinander)'),
          h('button', { class: 'btn klein', onclick: () => document.querySelector('dialog[open] [data-wert="teilen-parallel"]').click() }, 'Parallel teilen (zwei Lehrkräfte, zeitgleich)'),
          h('button', { class: 'btn klein', onclick: () => document.querySelector('dialog[open] [data-wert="teilen-wechsel"]').click() }, 'Im Wechsel teilen (Gruppe A in Woche A, B in Woche B)'))) : null,
      h('h3', {}, 'Zwingende Personalvorgaben (optional)', hilfe('Standard: keine Person vorgeben. Fach- und Co-Lehrkräfte werden während der Berechnung gemeinsam mit den Unterrichtszeiten gewählt. Nur wenn eine bestimmte Person zwingend diesen Kurs übernehmen muss, hier eintragen. Solche Einträge sind harte Bedingungen und können die Lösbarkeit einschränken.')),
      !u.lehrkraefte.length ? h('div', { class: 'hinweis ok' }, h('b', {}, 'Keine feste Personalvorgabe. '), 'Fach- und ggf. Co-Lehrkraft werden automatisch während der Berechnung gewählt.') : null,
      u.lehrkraefte.length ? h('table', { class: 'tab' }, h('thead', {}, h('tr', {}, ['Person (zwingend)', 'Rolle', 'Modus', 'Anteil', ''].map(t => h('th', {}, t)))), h('tbody', {}, lkZeilen)) : null,
      h('div', { class: 'zeile', style: { marginTop: '6px' } }, h('button', { class: 'btn klein', onclick: () => { u.lehrkraefte.push(nLehrkraftZuordnung({ lehrer: '', rolle: u.lehrkraefte.some(z => z.rolle === 'fach') ? 'co' : 'fach', modus: 'immer', deputatFaktor: u.lehrkraefte.some(z => z.rolle === 'fach') ? 0.5 : 1, auto: false })); zeichne(); } }, '+ Zwingende Person vorgeben')),
      (u.ohneAuto || []).length ? h('div', { class: 'zeile', style: { marginTop: '8px', gap: '6px' } }, h('span', { class: 'klein' }, 'Nicht automatisch einplanen (im Plan-Editor von Hand entfernt):'),
        u.ohneAuto.map(id => { const lz = lehrerVon(id); return h('span', { class: 'chip' }, (lz && (lz.kuerzel || lz.name)) || '?', h('button', { class: 'btn icon klein', type: 'button', 'aria-label': 'Wieder automatisch einplanen lassen', title: 'Wieder automatisch einplanen lassen', onclick: () => { u.ohneAuto = u.ohneAuto.filter(x => x !== id); zeichne(); } }, icon('x'))); })) : null,
      h('h3', {}, 'Fixierungen', hilfe('Vorgegebene Slots, die die Berechnung nicht verschieben darf. Die n-te Fixierung gilt für den n-ten Block.')),
      h('div', {}, u.fixiert.map((x, i) => h('div', { class: 'zeile', style: { marginBottom: '4px' } }, 'Block ' + (i + 1) + ':',
        sel(d.schule.tage.map((t, j) => [String(j), TAGE_LANG[t]]), String(x.tag), v => { x.tag = Number(v); }),
        sel(d.schule.stunden.map((s, j) => [String(j + 1), s.istPause ? 'Pause' : stundeLabel(j) + ' Stunde']), String(x.stunde), v => { x.stunde = Number(v); }),
        h('button', { class: 'btn icon klein gefahr', 'aria-label': 'Fixierung entfernen', onclick: () => { u.fixiert.splice(i, 1); zeichne(); } }, icon('papierkorb')))),
        h('button', { class: 'btn klein', onclick: () => { u.fixiert.push({ tag: 0, stunde: 1 }); zeichne(); } }, '+ Fixierung'))
    ));
  };
  zeichne();
  const pruefen = () => {
    if (!u.fach) { toast('Bitte ein Fach wählen.', 'err'); return false; }
    u.lehrkraefte = u.lehrkraefte.filter(z => z.lehrer).map(z => Object.assign(z, { auto: false }));
    u.fachAuto = !u.lehrkraefte.some(z => z.rolle === 'fach' && z.lehrer);
    const falsch = u.lehrkraefte.find(z => z.rolle === 'fach' && !z.zwang && (lehrerVon(z.lehrer) || {}).ausgebildet === false);
    if (falsch) { toast(lehrerName(lehrerVon(falsch.lehrer)) + ' ist keine ausgebildete Lehrkraft und kann nur Co-Lehrkraft sein.', 'err', 6000); return false; }
    return true;
  };
  const knoepfe = [{ text: 'Abbrechen', wert: false }];
  if (orig) knoepfe.push({ text: 'Löschen', wert: 'loeschen', art: 'gefahr' });
  knoepfe.push({ text: 'Speichern', wert: true, art: 'primaer', vorher: pruefen });
  if (orig) knoepfe.push({ text: 'teilen-gruppen', wert: 'teilen-gruppen', verborgen: true, vorher: pruefen }, { text: 'teilen-parallel', wert: 'teilen-parallel', verborgen: true, vorher: pruefen }, { text: 'teilen-wechsel', wert: 'teilen-wechsel', verborgen: true, vorher: pruefen });
  const w = await dialog({ titel: orig ? 'Unterricht bearbeiten' : 'Neuer Unterricht', inhalt: root, knoepfe, breite: '860px' });
  if (w === 'loeschen') {
    const paarK = orig.gruppen.length && orig.klassen.length === 1 ? findeId(APP.daten.klassen, orig.klassen[0]) : null, geteilt = !!(paarK && paarK.teilung[orig.fach]);
    // Rückfrage nur bei geteilten Fächern (das Löschen hat dort eine Folge für die andere Gruppe); sonst genügt „Rückgängig“ im Toast
    if (geteilt && !(await bestaetigen('Diesen Unterricht löschen? Seine Platzierungen werden entfernt. Achtung: Das Fach ist in dieser Klasse in die Gruppen A und B geteilt – nach dem Löschen hat nur noch eine Gruppe dieses Fach. Um die Teilung aufzuheben, in der Stundentafel den Scheren-Knopf ausschalten.', 'Löschen', 'gefahr'))) return;
    aendernMitUndo('Unterricht gelöscht', dd => { dd.unterrichte = dd.unterrichte.filter(x => x.id !== uid); dd.plan.platzierungen = dd.plan.platzierungen.filter(p => p.unterricht !== uid); tafelFolgt(dd, [orig], []); }, { normalisieren: true }, 'Unterricht samt Platzierungen gelöscht.'); return; }
  if (!w) return;
  const bSig = x => { const bb = bloeckeAlle(x).get(u.id); return bb ? blockText(bb) : ''; };
  const tafelNeu = [];
  aendern(orig ? 'Unterricht bearbeitet' : 'Unterricht angelegt', dd => {
    if (abAktivieren) dd.schule.wochenrhythmus = 'AB';
    const i = dd.unterrichte.findIndex(x => x.id === u.id);
    if (i >= 0) {
      const alt = bSig(dd);
      dd.unterrichte[i] = u;
      if (alt !== bSig(dd)) dd.plan.platzierungen = dd.plan.platzierungen.filter(p => p.unterricht !== u.id);
    } else dd.unterrichte.push(u);
    tafelFolgt(dd, [orig, u], tafelNeu);
  }, { normalisieren: true });
  if (tafelNeu.length) toast('Stundentafel angepasst (UStd. je Schüler): ' + tafelNeu.join(' · '), '', 7000);
  if (w === 'teilen-gruppen') {
    let r = null;
    aendern('Unterricht in Gruppen A/B geteilt', dd => { const kk = findeId(dd.klassen, u.klassen[0]); if (!kk) return; kk.teilung[u.fach] = true; if (!kk.stundentafel[u.fach]) kk.stundentafel[u.fach] = u.wochenstunden; r = tafelAbgleichen(dd, [{ k: kk.id, f: u.fach }], {}); }, { normalisieren: true });
    if (r) tafelMeldung(r);
  }
  if (w === 'teilen-parallel') unterrichtTeilen(u.id, 'parallel');
  if (w === 'teilen-wechsel') unterrichtTeilen(u.id, 'wechsel');
}

