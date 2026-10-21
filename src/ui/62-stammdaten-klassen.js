/* ---------------- Klassen und Gruppen, Stundentafel ---------------- */
function klassenMuster(txt) {
  const out = [];
  txt.split(/[,;]+/).map(s => s.trim()).filter(Boolean).forEach(tok => {
    let m = tok.match(/^(\d+)\s*([a-zA-Z])\s*[–\-]\s*(?:(\d+)\s*)?([a-zA-Z])$/);
    if (m) { const a = m[2].toLowerCase().charCodeAt(0), b = m[4].toLowerCase().charCodeAt(0); for (let c = a; c <= b; c++) out.push({ name: m[1] + String.fromCharCode(c), jahrgang: Number(m[1]) }); return; }
    m = tok.match(/^(\d+)\s*([a-zA-Z]*)$/);
    if (m) out.push({ name: m[1] + (m[2] || '').toLowerCase(), jahrgang: Number(m[1]) });
    else out.push({ name: tok, jahrgang: parseInt(tok, 10) || 5 });
  });
  return out;
}
async function gruppenDialog(k) {
  const gr = k.gruppen.map(g => Object.assign({}, g));
  const box = h('div');
  const zeichne = () => {
    leeren(box).append(h('table', { class: 'tab' }, h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Schüler'), h('th', {}, ''))), h('tbody', {}, gr.map((g, i) => h('tr', {},
      h('td', {}, h('input', { type: 'text', value: g.name, oninput: ev => { g.name = ev.target.value; } })),
      h('td', {}, h('input', { type: 'number', value: g.schueler, min: 0, max: 999, oninput: ev => { g.schueler = Number(ev.target.value) || 0; } })),
      h('td', { class: 'aktion' }, h('button', { class: 'btn icon klein gefahr', 'aria-label': 'Gruppe entfernen', onclick: () => { gr.splice(i, 1); zeichne(); } }, icon('papierkorb'))))))),
    h('div', { class: 'zeile', style: { marginTop: '8px' } },
      h('button', { class: 'btn klein', onclick: () => { gr.push({ id: neueId('g'), name: 'Gruppe ' + (gr.length + 1), schueler: Math.ceil(k.schueler / 2) }); zeichne(); } }, '+ Gruppe'),
      h('button', { class: 'btn klein', onclick: () => { gr.push({ id: neueId('g'), name: 'Gruppe 1', schueler: Math.ceil(k.schueler / 2) }, { id: neueId('g'), name: 'Gruppe 2', schueler: Math.floor(k.schueler / 2) }); zeichne(); } }, '+ Halbgruppen 1/2')));
  };
  zeichne();
  const ok = await dialog({ titel: 'Gruppen der Klasse ' + k.name, inhalt: h('div', {}, h('p', { class: 'muted klein' }, 'Teilgruppen, z. B. Halbgruppen für Teilungsunterricht oder Religion/Ethik. Eine Gruppe kollidiert mit der ganzen Klasse, nicht aber mit einer anderen Gruppe.'), box), knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'Übernehmen', wert: true, art: 'primaer' }] });
  if (ok) aendern('Gruppen der Klasse ' + k.name, d => { const kk = findeId(d.klassen, k.id); const alt = kk.gruppen.map(g => g.id); kk.gruppen = gr; const weg = alt.filter(id => !gr.some(g => g.id === id)); d.unterrichte.forEach(u => { u.gruppen = u.gruppen.filter(g => !weg.includes(g)); }); });
}
function stundentafelBereich() {
  const d = APP.daten;
  const st = APP.tabellen.tafel || (APP.tabellen.tafel = {});
  if (!(st.markiert instanceof Set)) st.markiert = new Set();
  const K = klassenAlphabetisch(d.klassen), F = d.faecher;
  [...st.markiert].forEach(id => { if (!K.some(k => k.id === id)) st.markiert.delete(id); });
  // Eingabe in einer markierten Zeile gilt für alle markierten Klassen. wert/teil = null: unverändert lassen.
  // extra.partner: Parallelpartner ('' = keiner) · extra.co: Co-Bedarf ('' = Vorgabe des Fachs, 'kein', 'alle' oder Stundenzahl)
  const setze = (k, f, wert, teil, extra) => {
    const ziele = st.markiert.has(k.id) ? K.filter(x => st.markiert.has(x.id)).map(x => x.id) : [k.id];
    let r = null; const autoP = [];
    aendern('Stundentafel ' + f.kuerzel + ' ' + (ziele.length > 1 ? '(' + ziele.length + ' Klassen)' : k.name), dd => {
      const paare = [], kz = fid => (dd.faecher.find(x => x.id === fid) || {}).kuerzel || '?';
      const loese = (kk, fid) => { const p = kk.parallel[fid]; if (p) { delete kk.parallel[p]; delete kk.parallel[fid]; } };
      ziele.forEach(id => {
        const kk = findeId(dd.klassen, id); if (!kk) return;
        if (wert !== null) { if (wert > 0) kk.stundentafel[f.id] = wert; else delete kk.stundentafel[f.id]; }
        if (teil !== null) { if (teil) kk.teilung[f.id] = true; else { delete kk.teilung[f.id]; loese(kk, f.id); } }
        if (extra && extra.partner !== undefined) {
          loese(kk, f.id);
          const p = extra.partner;
          if (p && kk.teilung[f.id] && p !== f.id) { loese(kk, p); if (!kk.teilung[p]) { kk.teilung[p] = true; paare.push({ k: id, f: p }); } kk.parallel[f.id] = p; kk.parallel[p] = f.id; }
        } else if (teil === true && !kk.parallel[f.id]) {
          // genau ein weiteres geteiltes Fach ohne Partner und mit gleicher Stundenzahl: automatisch Parallelpartner
          const kand = Object.keys(kk.teilung).filter(x => x !== f.id && kk.teilung[x] && !kk.parallel[x] && (kk.stundentafel[x] || 0) > 0 && (kk.stundentafel[x] || 0) === (kk.stundentafel[f.id] || 0));
          if (kand.length === 1) { kk.parallel[f.id] = kand[0]; kk.parallel[kand[0]] = f.id; autoP.push(kk.name + ': ' + f.kuerzel + ' ∥ ' + kz(kand[0])); }
        }
        if (extra && extra.co !== undefined) { if (extra.co === '') delete kk.coBedarf[f.id]; else kk.coBedarf[f.id] = extra.co; }
        if (extra && extra.max !== undefined) { kk.maxProTag = kk.maxProTag || {}; if (extra.max === '' || !(extra.max >= 1)) delete kk.maxProTag[f.id]; else kk.maxProTag[f.id] = extra.max; }
        paare.push({ k: id, f: f.id });
      });
      r = tafelAbgleichen(dd, paare, { entfernen: true, zusammen: teil === false });
      // ließ sich die Teilung nicht umsetzen (Kopplung, A/B-Wochen, mehrere Kurse), wird das Kennzeichen wieder entfernt
      paare.forEach(({ k: id, f: fid }) => { const kk = findeId(dd.klassen, id); if (!kk || !kk.teilung[fid]) return; const us = dd.unterrichte.filter(x => !x.aufgabe && x.fach === fid && x.klassen.includes(id)); if (us.length && !teilungsPaar(kk, us)) { delete kk.teilung[fid]; loese(kk, fid); } });
      // geänderter Co-Bedarf: automatisch eingetragene Co-Lehrkräfte dieser Unterrichte neu bestimmen
      if (extra && extra.co !== undefined) { dd.unterrichte.forEach(x => { if (!x.aufgabe && x.fach === f.id && x.klassen.some(c => ziele.includes(c))) { x.lehrkraefte = x.lehrkraefte.filter(z => !(z.rolle === 'co' && z.auto)); if (extra.co === 'kein') x.lehrkraefte = x.lehrkraefte.filter(z => z.rolle !== 'co'); } }); }
    }, { normalisieren: true });
    if (r) tafelMeldung(r);
    if (autoP.length) toast('Parallelpartner gesetzt: ' + autoP.join(' · ') + ' – Gruppe 1 hat das eine Fach, Gruppe 2 zeitgleich das andere (in der Zelle über den Knopf mit den drei Punkten änderbar).', 'ok', 8000);
    const fehlerB = parallelBaender(APP.daten).filter(b => ziele.includes(b.klasse) && b.fehler && b.faecher.includes(f.id));
    if (fehlerB.length) toast('Parallelband noch unvollständig: ' + fehlerB[0].fehler, 'err', 9000);
  };
  // Stundentafel aus der Unterrichtsverteilung übernehmen (für Klassen ohne oder mit abweichender Stundentafel)
  const ausVerteilung = async () => {
    const ziele = (st.markiert.size ? K.filter(k => st.markiert.has(k.id)) : K);
    const bl = bloeckeAlle(d), neu = [];
    ziele.forEach(k => { const ist = schuelerStunden(d, k.id, 'verteilung', { bl }), t = {}; let halb = 0; ist.forEach((x, fid) => { if (!F.some(f => f.id === fid) || !(x.wert > 0)) return; if (Number.isInteger(x.wert * 2)) t[fid] = x.wert; else halb++; }); const gleich = Object.keys(t).length === Object.keys(k.stundentafel).length && Object.keys(t).every(fid => t[fid] === k.stundentafel[fid]); if (!gleich) neu.push({ k, t, halb }); });
    if (!neu.length) { toast('Die Stundentafeln stimmen schon mit der Unterrichtsverteilung überein.', 'ok'); return; }
    if (!(await bestaetigen('Stundentafel von ' + neu.length + (neu.length === 1 ? ' Klasse' : ' Klassen') + ' (' + neu.map(x => x.k.name).join(', ') + ') aus der Unterrichtsverteilung übernehmen? Eingetragen werden die Wochenstunden je Schüler: Halbgruppen zählen einmal, A-/B-Wochen halb. Die Unterrichte bleiben unverändert.', 'Übernehmen'))) return;
    aendern('Stundentafel aus der Unterrichtsverteilung', dd => { neu.forEach(x => { const kk = findeId(dd.klassen, x.k.id); if (kk) kk.stundentafel = x.t; }); }, { normalisieren: true });
    const halb = neu.reduce((a, x) => a + x.halb, 0);
    toast('Stundentafel für ' + neu.length + (neu.length === 1 ? ' Klasse' : ' Klassen') + ' übernommen.' + (halb ? ' ' + halb + ' Fächer mit Bruchteilen unter einer halben Wochenstunde lassen sich in der Stundentafel nicht eintragen.' : ''), halb ? '' : 'ok', 7000);
  };
  const blT = bloeckeAlle(d);
  const alle = h('input', { type: 'checkbox', 'aria-label': 'Alle Klassen markieren', checked: K.length > 0 && K.every(k => st.markiert.has(k.id)), onchange: ev => { K.forEach(k => { if (ev.target.checked) st.markiert.add(k.id); else st.markiert.delete(k.id); }); render(); } });
  const quelle = K.find(k => k.id === st.quelle) ? st.quelle : '';
  const tabelle = K.length && F.length ? h('div', { style: { overflowX: 'auto' } }, h('table', { class: 'matrix tafel' },
    h('thead', {}, h('tr', {}, h('th', { class: 'zeilenkopf' }, h('label', { class: 'check', style: { margin: 0 } }, alle, 'Klasse')), F.map(f => h('th', { title: f.name }, h('span', { class: 'fachpunkt', style: { background: f.farbe } }), f.kuerzel)), h('th', { title: 'Wochenstunden eines Schülers der Klasse: Halbgruppen zählen einmal, A-/B-Wochen halb' }, 'Σ je Schüler'))),
    h('tbody', {}, K.map(k => {
      const mark = st.markiert.has(k.id);
      return h('tr', { class: mark ? 'gewaehlt' : '', 'data-id': k.id },
        h('th', { class: 'zeilenkopf' }, h('label', { class: 'check', style: { margin: 0 } }, h('input', { type: 'checkbox', checked: mark, 'aria-label': 'Klasse ' + k.name + ' markieren', onchange: ev => { if (ev.target.checked) st.markiert.add(k.id); else st.markiert.delete(k.id); render(); } }), k.name)),
        F.map(f => {
          const std = k.stundentafel[f.id] || 0, get = !!k.teilung[f.id], pid = (k.parallel || {})[f.id], pf = pid ? F.find(x => x.id === pid) : null;
          const cb = k.coBedarf[f.id], coEff = cb === undefined ? (f.coBedarf ? 'alle' : 'kein') : cb;
          const coText = coEff === 'kein' ? '' : coEff === 'alle' ? 'Co' : 'Co ' + zahlDe(coEff, 1);
          const mxK = (k.maxProTag || {})[f.id];
          const info = std > 0 ? [pf ? h('span', { class: 'tp', title: 'Parallelpartner: Gruppe 1 hat ' + f.kuerzel + ', Gruppe 2 zeitgleich ' + pf.kuerzel + ' (und umgekehrt) – immer gleichzeitig' }, '∥' + pf.kuerzel) : (get ? h('span', { class: 'tp ohne', title: 'In Halbgruppen geteilt, aber ohne Parallelpartner: Die andere Gruppe ist währenddessen frei.' }, '∥ –') : null),
            coText ? h('span', { class: 'tc', title: (coEff === 'alle' ? 'Alle Stunden' : zahlDe(coEff, 1) + ' von ' + std + ' UStd.') + ' mit Co-Lehrkraft' + (cb === undefined ? ' (Vorgabe des Fachs)' : '') }, coText) : null,
            mxK ? h('span', { class: 'tm', title: 'Höchstens ' + mxK + '× je Tag in ' + k.name + ' (Vorgabe des Fachs: ' + f.maxProTag + '×)' }, '≤' + mxK + '/Tag') : null].filter(Boolean) : [];
          return h('td', { class: get ? 'geteilt' : '', style: mark && !get ? { background: 'var(--accent-weak)' } : null },
            h('span', { class: 'tafelzelle' },
              h('input', { type: 'number', min: 0, max: 40, step: 0.5, value: std, 'aria-label': k.name + ' ' + f.kuerzel + ' UStd. je Woche', title: 'Wochenstunden eines Schülers in ' + f.kuerzel + ' (0,5 = eine Stunde nur in Woche A oder B)', onchange: ev => setze(k, f, Math.min(40, Math.max(0, Math.round((Number(String(ev.target.value).replace(',', '.')) || 0) * 2) / 2)), null) }),
              h('button', { class: 'teilknopf' + (get ? ' aktiv' : ''), tabindex: -1, 'aria-pressed': get ? 'true' : 'false', 'aria-label': k.name + ' ' + f.kuerzel + ' in Gruppen A und B teilen',
                title: get ? f.kuerzel + ' wird in ' + k.name + ' in Halbgruppen unterrichtet (jede Gruppe ' + std + ' UStd. – für jeden Schüler bleiben es ' + std + '). Klick: wieder die ganze Klasse.' : 'Halbgruppe: ' + f.kuerzel + ' in ' + k.name + ' in zwei Gruppen teilen. Für jeden Schüler bleibt es bei ' + std + ' UStd. je Woche.',
                onclick: () => setze(k, f, null, !get) }, icon('schere')),
              h('button', { class: 'teilknopf mehr', tabindex: -1, 'aria-label': k.name + ' ' + f.kuerzel + ': Parallelpartner, Co-Bedarf und Höchstzahl je Tag', title: 'Parallelpartner, Co-Bedarf und „höchstens je Tag“ für ' + f.kuerzel + ' in ' + k.name, onclick: () => tafelZelleDialog(k, f, setze) }, icon('mehr'))),
            info.length ? h('div', { class: 'tafelinfo' }, info) : null);
        }),
        (() => { const soll = schuelerWochenstunden(d, k.id, null, 'tafel'), ist = schuelerWochenstunden(d, k.id, null, 'verteilung', { bl: blT }), ab = Math.abs(soll - ist) > 1e-9;
          return h('td', { class: ab ? 'fehlt' : '', title: ab ? 'Stundentafel ' + zahlDe(soll, 1) + ' – die Unterrichtsverteilung ergibt je Schüler ' + zahlDe(ist, 1) + ' UStd. je Woche. „Mit Stundentafel abgleichen“ (Unterrichtsverteilung) oder „Aus Unterrichtsverteilung übernehmen“.' : 'Wochenstunden eines Schülers – Stundentafel und Unterrichtsverteilung stimmen überein' }, h('b', {}, zahlDe(soll, 1)), ab ? h('div', { class: 'klein fehlertext' }, '≠ ' + zahlDe(ist, 1)) : null); })());
    })))) : h('p', { class: 'muted' }, 'Zuerst Klassen und Fächer anlegen.');
  const karte = h('div', { class: 'karte' },
    h('h3', { style: { marginTop: 0 } }, 'Stundentafel: Wochenstunden je Klasse und Fach'),
    h('p', { class: 'muted klein' }, h('b', {}, 'Die Stundentafel nennt die Wochenstunden eines einzelnen Schülers'), ' – sie ist die führende Eingabe: Aus ihr erzeugt das Programm den Unterricht, die Halbgruppen, die Blöcke und die Parallelbänder; die Lehrkräfte teilt „Plan berechnen“ zu. ',
      h('b', {}, icon('schere', 'k'), ' Halbgruppe: '), 'Das Fach wird in zwei Gruppen unterrichtet. Für den Schüler bleibt die Stundenzahl gleich (Kunst 2 UStd. in zwei Gruppen sind 2 UStd., nicht 4). ',
      h('b', {}, icon('mehr', 'k'), ' Parallelpartner: '), 'Zwei geteilte Fächer füllen sich auf – Gruppe 1 hat Kunst, Gruppe 2 zeitgleich Werken, danach umgekehrt. Parallelpartner liegen immer gleichzeitig (∥). Hat ein Fach mit Doppelstundenpflicht nur 1 Wochenstunde, liegt der 2-Stunden-Block im A/B-Wechsel. ',
      h('b', {}, icon('mehr', 'k'), ' Co-Bedarf: '), 'je Klasse und Fach kein Co, ein Teil der Stunden oder alle Stunden mit Co-Lehrkraft. ',
      h('b', {}, icon('mehr', 'k'), ' Höchstens je Tag: '), 'wie oft das Fach in dieser Klasse an einem Tag vorkommen darf (sonst gilt der Wert des Fachs). ',
      'Mehrere Klassen anhaken: Eine Eingabe gilt dann für alle markierten Klassen.'),
    tabelle,
    K.length ? h('div', { class: 'zeile', style: { marginTop: '10px' } }, h('button', { class: 'btn klein', id: 'tafelAusUV', title: 'Trägt für die markierten Klassen (ohne Markierung: für alle) die Wochenstunden je Schüler ein, die die Unterrichtsverteilung ergibt', onclick: ausVerteilung }, 'Aus Unterrichtsverteilung übernehmen')) : null,
    K.length > 1 ? h('div', { class: 'zeile', style: { marginTop: '10px' } },
      h('span', { class: 'klein muted' }, 'Stundentafel kopieren von'),
      sel([['', '– Klasse wählen –']].concat(K.map(k => [k.id, k.name])), quelle, v => { st.quelle = v; render(); }, { 'aria-label': 'Stundentafel kopieren von Klasse' }),
      h('button', { class: 'btn klein', disabled: !quelle || ![...st.markiert].some(id => id !== quelle), onclick: async () => {
        const q = findeId(d.klassen, quelle), ziele = K.filter(k => st.markiert.has(k.id) && k.id !== quelle);
        if (!q || !ziele.length) return;
        if (!(await bestaetigen('Stundentafel der Klasse ' + q.name + ' (mit Halbgruppen, Parallelpartnern und Co-Bedarf) auf ' + ziele.map(k => k.name).join(', ') + ' übertragen? Deren bisherige Stundentafeln werden ersetzt; die Unterrichte folgen der neuen Stundentafel.', 'Übertragen'))) return;
        let r = null;
        aendern('Stundentafel von ' + q.name + ' übertragen', dd => {
          const qq = findeId(dd.klassen, quelle), paare = [];
          ziele.forEach(z => { const kk = findeId(dd.klassen, z.id); const faecher = new Set([...Object.keys(kk.stundentafel), ...Object.keys(qq.stundentafel), ...Object.keys(kk.teilung), ...Object.keys(qq.teilung)]); kk.stundentafel = Object.assign({}, qq.stundentafel); const alt = kk.teilung; kk.teilung = Object.assign({}, qq.teilung); kk.parallel = Object.assign({}, qq.parallel); kk.coBedarf = Object.assign({}, qq.coBedarf); kk.maxProTag = Object.assign({}, qq.maxProTag || {}); faecher.forEach(fid => paare.push({ k: kk.id, f: fid, zusammen: !!alt[fid] && !kk.teilung[fid] })); });
          r = tafelAbgleichen(dd, paare, { entfernen: true });
        }, { normalisieren: true });
        if (r) tafelMeldung(r);
      } }, 'auf die markierten Klassen übertragen')) : null);
  return [karte];
}
// Klassen in Halbgruppen A und B teilen
function klassenTeilen(ids) {
  let n = 0;
  aendern('Klassen in Gruppen A/B geteilt', d => {
    ids.forEach(id => {
      const k = findeId(d.klassen, id); if (!k) return;
      if (k.gruppen.some(g => g.name === 'A') && k.gruppen.some(g => g.name === 'B')) return;
      k.gruppen.push({ id: neueId('g'), name: 'A', schueler: Math.ceil(k.schueler / 2) }, { id: neueId('g'), name: 'B', schueler: Math.floor(k.schueler / 2) });
      n++;
    });
  });
  toast(n ? (n === 1 ? '1 Klasse' : n + ' Klassen') + ' in die Gruppen A und B geteilt. Welche Fächer geteilt unterrichtet werden, legt der Scheren-Knopf in der Stundentafel fest.' : 'Die gewählten Klassen haben die Gruppen A und B bereits.', n ? 'ok' : '', 7000);
}
async function teamDialog(k) {
  const gew = new Set(k.team);
  const L = lehrerAlphabetisch(APP.daten.lehrer);
  const kl = APP.daten.lehrer.find(l => l.klassenleitung === k.id);
  // Wer unterrichtet die Klasse laut Unterrichtsverteilung?
  const inKlasse = new Set();
  APP.daten.unterrichte.forEach(u => { if (!u.aufgabe && u.klassen.includes(k.id)) u.lehrkraefte.forEach(z => z.lehrer && inKlasse.add(z.lehrer)); });
  const boxen = new Map();
  const gruppe = (titel, liste) => liste.length ? h('div', {}, h('h3', {}, titel), h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '6px' } },
    liste.map(l => { const cb = h('input', { type: 'checkbox', checked: gew.has(l.id), onchange: ev => { if (ev.target.checked) gew.add(l.id); else gew.delete(l.id); } }); boxen.set(l.id, cb);
      return h('label', { class: 'check', title: inKlasse.has(l.id) ? 'unterrichtet in ' + k.name : '' }, cb, (l.kuerzel || '?') + ' – ' + (l.name || '') + (inKlasse.has(l.id) ? ' ·' : '')); }))) : null;
  const uebernehmen = () => { inKlasse.forEach(id => { gew.add(id); const cb = boxen.get(id); if (cb) cb.checked = true; }); };
  const ok = await dialog({ titel: 'Klassenteam ' + k.name, breite: '680px', inhalt: h('div', {},
    h('p', { class: 'muted klein', style: { marginTop: 0 } }, 'Das Klassenteam gehört zur Klasse ' + k.name + ' – nicht zur Klassenleitung' + (kl ? ' (' + (kl.kuerzel || kl.name) + ')' : '') + '. Wechselt die Klassenleitung, bleibt das Team unverändert. Team-Mitglieder stehen in allen Auswahllisten für diese Klasse oben; automatisch ergänzte Co-Lehrkräfte kommen nur aus dem Team (die Klassenleitung der Klasse zählt dazu). Co-Lehrkräfte außerhalb des Teams meldet die Prüfung.'),
    inKlasse.size ? h('div', { class: 'zeile eng', style: { marginBottom: '6px' } }, h('button', { class: 'btn klein', onclick: uebernehmen }, 'Alle aus der Unterrichtsverteilung übernehmen'), h('span', { class: 'muted klein' }, '· = unterrichtet bereits in ' + k.name)) : null,
    gruppe('Co-Kräfte', L.filter(l => l.ausgebildet === false)), gruppe('Lehrkräfte', L.filter(l => l.ausgebildet !== false))), knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'Übernehmen', wert: true, art: 'primaer' }] });
  if (ok) aendern('Klassenteam ' + k.name, d => { findeId(d.klassen, k.id).team = APP.daten.lehrer.map(l => l.id).filter(id => gew.has(id)); });
}
function klassenraeumeZuordnen() {
  let n = 0;
  aendern('Klassenräume zugeordnet', d => {
    const frei = d.raeume.filter(r => r.typ === 'klassenraum' && !d.klassen.some(k => k.heimatraum === r.id));
    d.klassen.forEach(k => { if (k.heimatraum || !frei.length) return; const r = frei.shift(); k.heimatraum = r.id; r.heimatKlasse = k.id; n++; });
  });
  toast(n ? n + ' Klassen haben einen Klassenraum bekommen.' : 'Keine freien Klassenräume oder alle Klassen haben schon einen.', n ? 'ok' : '');
}
// Stundentafel für eine neue Klasse: die einer vorhandenen Klasse desselben Jahrgangs, sonst (alte Stände) die Jahrgangs-Vorlage
function tafelFuerJahrgang(d, jg) {
  const k = d.klassen.find(x => Number(x.jahrgang) === Number(jg) && Object.keys(x.stundentafel || {}).length);
  return Object.assign({}, k ? k.stundentafel : (d.stundentafelVorlagen || {})[jg] || {});
}
function teilungFuerJahrgang(d, jg) {
  const k = d.klassen.find(x => Number(x.jahrgang) === Number(jg) && Object.keys(x.stundentafel || {}).length);
  return Object.assign({}, k ? k.teilung : {});
}
// Parallelpartner und Co-Bedarf einer vorhandenen Klasse desselben Jahrgangs
function tafelExtrasFuerJahrgang(d, jg) {
  const k = d.klassen.find(x => Number(x.jahrgang) === Number(jg) && Object.keys(x.stundentafel || {}).length);
  return { parallel: Object.assign({}, k ? k.parallel : {}), coBedarf: Object.assign({}, k ? k.coBedarf : {}), maxProTag: Object.assign({}, k ? k.maxProTag : {}) };
}
// Dialog einer Stundentafel-Zelle: Halbgruppe, Parallelpartner, Co-Bedarf
async function tafelZelleDialog(k, f, setze) {
  const d = APP.daten, std = k.stundentafel[f.id] || 0;
  const war = !!k.teilung[f.id];
  let teil = war, partner = (k.parallel || {})[f.id] || '';
  const cb = k.coBedarf[f.id];
  let co = cb === undefined ? '' : (cb === 'alle' || cb === 'kein') ? cb : 'teil', coStd = typeof cb === 'number' ? cb : Math.max(1, Math.ceil(std / 2));
  const mxW = (k.maxProTag || {})[f.id];
  let mx = mxW ? String(mxW) : '';
  const root = h('div');
  const zeichne = () => {
    const andere = d.faecher.filter(x => x.id !== f.id && (k.stundentafel[x.id] || 0) > 0);
    leeren(root).append(...[
      h('h3', { style: { marginTop: 0 } }, 'Halbgruppe'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'tzTeil', checked: teil, onchange: ev => { teil = ev.target.checked; if (!teil) partner = ''; zeichne(); } }), f.kuerzel + ' in zwei Halbgruppen unterrichten'),
      h('p', { class: 'muted klein', style: { margin: '2px 0 8px 24px' } }, 'Jede Gruppe hat ' + std + ' UStd. ' + f.kuerzel + ' – für jeden Schüler bleiben es ' + std + ' UStd. je Woche.'),
      teil ? h('label', { class: 'feld' }, h('span', {}, 'Parallelpartner', hilfe('Gruppe 1 hat ' + f.kuerzel + ', Gruppe 2 zur selben Zeit das Partnerfach – im zweiten Termin umgekehrt. Parallelpartner liegen IMMER gleichzeitig (am selben Tag, zur selben Zeit, gleich lang). Das Partnerfach braucht dieselbe Stundenzahl und wird ebenfalls geteilt.')),
        sel([['', '– kein Parallelpartner (die andere Gruppe ist währenddessen frei) –']].concat(andere.map(x => [x.id, x.kuerzel + ' – ' + x.name + ' (' + k.stundentafel[x.id] + ' UStd.)' + (k.stundentafel[x.id] !== std ? ' ⚠ andere Stundenzahl' : '') + (k.parallel[x.id] && k.parallel[x.id] !== f.id ? ' – bisher Partner von ' + ((d.faecher.find(y => y.id === k.parallel[x.id]) || {}).kuerzel || '?') : '')])), partner, v => { partner = v; zeichne(); }, { 'aria-label': 'Parallelpartner' })) : null,
      teil && partner && k.stundentafel[partner] !== std ? h('div', { class: 'hinweis warn' }, 'Die beiden Fächer haben verschiedene Stundenzahlen – ein Parallelband braucht dieselbe Stundenzahl.') : null,
      teil && partner ? h('div', { class: 'hinweis ok' }, 'Parallelband: Gruppe 1 ' + f.kuerzel + ' ∥ Gruppe 2 ' + ((d.faecher.find(x => x.id === partner) || {}).kuerzel || '?') + ' – und umgekehrt. Die technische Kopplung erzeugt das Programm.') : null,
      h('h3', {}, 'Co-Lehrkraft'),
      h('div', { class: 'zeile' },
        sel([['', 'Vorgabe des Fachs (' + (f.coBedarf ? 'alle Stunden mit Co' : 'kein Co') + ')'], ['kein', 'kein Co'], ['teil', 'ein Teil der Stunden mit Co'], ['alle', 'alle Stunden mit Co']], co, v => { co = v; zeichne(); }, { 'aria-label': 'Co-Bedarf' }),
        co === 'teil' ? h('label', { class: 'zeile eng' }, h('input', { type: 'number', min: 0.5, max: Math.max(std, 0.5), step: 0.5, value: coStd, style: { width: '70px' }, 'aria-label': 'UStd. mit Co', onchange: ev => { coStd = Math.max(0.5, Math.min(std || 40, Math.round((Number(ev.target.value) || 0) * 2) / 2)); } }), 'von ' + std + ' UStd. mit Co') : null),
      h('p', { class: 'muted klein' }, 'Gezählt in UStd. je Woche eines Schülers (Durchschnitt, A-/B-Wochen zählen halb). Die Co-Lehrkraft wählt die Berechnung aus dem Klassenteam.'),
      h('h3', {}, 'Höchstens je Tag'),
      h('div', { class: 'zeile' },
        sel([['', 'Vorgabe des Fachs (' + f.maxProTag + '× je Tag)']].concat([1, 2, 3, 4, 5, 6].map(n => [String(n), n + '× je Tag'])), mx, v => { mx = v; zeichne(); }, { 'aria-label': 'Höchstens je Tag', id: 'tzMax' })),
      h('p', { class: 'muted klein' }, 'Wie oft ' + f.kuerzel + ' in ' + k.name + ' an einem Tag vorkommen darf – eine Doppelstunde zählt als zwei. Bei 1 gibt es keine Doppelstunden. Pflichtregel für die Berechnung; ohne eigenen Wert gilt „max./Tag“ des Fachs.'),
      mx && std > Number(mx) * d.schule.tage.length ? h('div', { class: 'hinweis warn' }, std + ' UStd. je Woche passen bei höchstens ' + mx + ' UStd. je Tag nicht in ' + d.schule.tage.length + ' Tage.') : null,
      mx === '1' && f.doppelstunde === 'pflicht' ? h('div', { class: 'hinweis warn' }, 'Das Fach verlangt Doppelstunden – bei höchstens 1× je Tag ist das nicht möglich.') : null].filter(x => x !== null && x !== undefined && x !== false));
  };
  zeichne();
  const ok = await dialog({ titel: 'Stundentafel ' + k.name + ' – ' + f.name + ' (' + std + ' UStd.)', inhalt: root, breite: '560px', knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'Übernehmen', wert: true, art: 'primaer' }] });
  if (!ok) return;
  setze(k, f, null, teil !== war ? teil : null, { partner: teil ? partner : '', co: co === 'teil' ? coStd : co, max: mx === '' ? '' : Number(mx) });
}
SEITEN_RENDER.klassen = () => {
  const muster = h('input', { type: 'text', placeholder: 'z. B. 5a–5d, 6a–6c', style: { width: '260px' }, 'aria-label': 'Muster für Klassen' });
  const nL = nlektionen();
  const kTabs = [['klassen', 'Klassen'], ['tafeln', 'Stundentafeln']];
  if (reiterAktiv('klassen', kTabs) === 'tafeln') return [
    seitenkopf('Klassen & Gruppen', 'Stundentafel: die Wochenstunden je Fach für jede Klasse in einer Tabelle – mit dem Scheren-Knopf lässt sich ein Fach in die Gruppen A und B teilen. Änderungen wirken sofort auf die Unterrichtsverteilung.'),
    reiterLeiste('klassen', kTabs),
    h('div', { class: 'reiterinhalt' }, stundentafelBereich())
  ];
  return [
    seitenkopf('Klassen & Gruppen', 'Klassen mit Klassenraum, Schülerzahl, Stundenkorridor, Zeitprofil, Teilgruppen, Klassenteam und Klassenleitung. Die Stundentafel (Wochenstunden je Fach, mit Teilung in Gruppen) steht im zweiten Reiter.'),
    reiterLeiste('klassen', kTabs),
    h('div', { class: 'karte' }, h('h3', { style: { marginTop: 0 } }, 'Massenanlage über Muster'),
      h('div', { class: 'zeile' }, muster, h('button', { class: 'btn', onclick: () => {
        const liste = klassenMuster(muster.value);
        if (!liste.length) { toast('Bitte ein Muster eingeben, z. B. 5a–5d, 6a–6c.', 'err'); return; }
        let n = 0;
        aendern(liste.length === 1 ? 'Klasse angelegt' : liste.length + ' Klassen angelegt', d => { const neu = []; liste.forEach(x => { if (d.klassen.some(k => k.name === x.name)) return; const kk = nKlasse(Object.assign({ name: x.name, jahrgang: x.jahrgang, stundentafel: tafelFuerJahrgang(d, x.jahrgang), teilung: teilungFuerJahrgang(d, x.jahrgang) }, tafelExtrasFuerJahrgang(d, x.jahrgang)), nL); d.klassen.push(kk); neu.push(kk.id); n++; }); if (neu.length) tafelAbgleichen(d, tafelPaare(d, neu), {}); }, { normalisieren: true });
        toast((n === 1 ? '1 Klasse angelegt' : n + ' Klassen angelegt') + (n < liste.length ? ' (' + (liste.length - n) + ' gab es schon)' : '') + (n ? ' – mit Stundentafel und Unterrichten (Lehrkräfte „automatisch“).' : '.'), n ? 'ok' : '');
      } }, 'Anlegen'), h('span', { class: 'muted klein' }, 'Bereiche mit Bindestrich, Aufzählung mit Komma. Gibt es schon eine Klasse desselben Jahrgangs, werden ihre Stundentafel und ihre Teilungen übernommen und die Unterrichte gleich angelegt.')),
      h('div', { class: 'zeile', style: { marginTop: '8px' } }, h('button', { class: 'btn', onclick: klassenraeumeZuordnen }, 'Freie Klassenräume zuordnen'), h('span', { class: 'muted klein' }, 'Gibt jeder Klasse ohne Klassenraum einen noch nicht vergebenen Raum vom Typ „klassenraum“.'))),
    h('div', { class: 'abstand' }),
    tabelle({
      key: 'klassen', titel: 'Klassen', zeilen: d => d.klassen,
      leer: { icon: 'gruppe', titel: 'Noch keine Klassen', text: 'Klassen einzeln anlegen, als Liste aus Excel einfügen oder oben über ein Muster wie „5a–5d“ auf einmal erzeugen.', neu: '+ Erste Klasse anlegen' },
      detail: {
        titel: k => k.name ? 'Klasse ' + k.name : '', ohneName: '(neue Klasse)',
        unter: k => ['Jahrgang ' + k.jahrgang, k.schueler ? k.schueler + ' Schüler' : '', (raumVon(k.heimatraum) || {}).name ? 'Raum ' + raumVon(k.heimatraum).name : ''].filter(Boolean).join(' · '),
        badges: k => { const kl = APP.daten.lehrer.find(l => l.klassenleitung === k.id), nU = APP.daten.unterrichte.filter(u => u.klassen.includes(k.id)).length;
          return [nU ? h('span', { class: 'badge neutral', title: nU + ' Unterrichte aus der Stundentafel' }, nU + ' Unterr.') : h('span', { class: 'badge warn', title: 'Für diese Klasse gibt es noch keinen Unterricht – Stundentafel ausfüllen' }, 'ohne Unterricht'), kl ? h('span', { class: 'badge neutral', title: 'Klassenleitung ' + (kl.name || kl.kuerzel) }, kl.kuerzel || kl.name) : h('span', { class: 'badge warn', title: 'Keine Klassenleitung zugeordnet' }, 'ohne Leitung')]; },
        abschnitte: [
          { titel: 'Stammdaten', spalten: ['name', 'jahrgang', 'schueler', 'heimatraum', 'kl'] },
          { titel: 'Unterrichtszeiten', spalten: ['fruehestens', 'spaetestens', 'maxStundenTag', 'zeitprofil'] },
          { titel: 'Gruppen & Klassenteam', spalten: ['gruppen', 'team'] }
        ]
      },
      spalten: [
        { k: 'name', titel: 'Name', typ: 'text', breite: '80px' },
        { k: 'jahrgang', titel: 'Jahrgang', typ: 'zahl', min: 1, max: 13 },
        { k: 'heimatraum', titel: 'Klassenraum', typ: 'select', leerNull: true, opts: () => raumOpts('– kein –'), set: (k, v, d) => { k.heimatraum = v; d.raeume.forEach(r => { if (r.heimatKlasse === k.id) r.heimatKlasse = null; if (r.id === v) r.heimatKlasse = k.id; }); }, sortWert: k => (raumVon(k.heimatraum) || {}).name || '' },
        { k: 'schueler', titel: 'Schüler', typ: 'zahl', min: 0, max: 999, hilfe: 'Für die Raumkapazität: Der Raum muss mindestens so viele Plätze haben.' },
        { k: 'fruehestens', titel: 'frühestens', lang: 'Unterricht frühestens ab Stunde', typ: 'zahl', min: 1, max: nL, hilfe: 'Kein Unterricht vor dieser Stunde.' },
        { k: 'spaetestens', titel: 'spätestens', lang: 'Unterricht spätestens bis Stunde', typ: 'zahl', min: 1, max: nL, hilfe: 'Kein Unterricht nach dieser Stunde (z. B. Klasse 5 nie nach der 6.).' },
        { k: 'maxStundenTag', titel: 'max. UStd./Tag', lang: 'max. UStd. je Tag', typ: 'zahl', min: 1, max: 20, hilfe: 'Obergrenze der Unterrichtsstunden je Tag.' },
        { k: 'zeitprofil', titel: 'Zeitprofil', typ: 'select', leerNull: true, hilfe: 'Reale Unterrichtszeiten der Klasse (Schule & Zeiten → Zeitprofile). Ohne Profil gelten die Zeiten des Schulrasters.', opts: () => [['', '– Schulraster –']].concat(APP.daten.schule.zeitprofile.map(z => [z.id, z.name])), sortWert: k => ((APP.daten.schule.zeitprofile.find(z => z.id === k.zeitprofil) || {}).name || '') },
        { k: 'gruppen', titel: 'Gruppen', typ: 'custom', sortierbar: false, render: k => h('span', { class: 'zeile eng' }, k.gruppen.map(g => h('span', { class: 'chip' }, g.name + ' (' + g.schueler + ')')), k.gruppen.length ? h('button', { class: 'btn icon klein', title: 'Gruppen der Klasse bearbeiten', 'aria-label': 'Gruppen der Klasse ' + k.name + ' bearbeiten', onclick: () => gruppenDialog(k) }, icon('stift')) : h('button', { class: 'btn klein', onclick: () => gruppenDialog(k) }, '+ Gruppen'), k.gruppen.length ? null : h('button', { class: 'btn klein', title: 'In Halbgruppen A und B teilen', onclick: () => klassenTeilen([k.id]) }, 'A/B teilen')) },
        { k: 'team', titel: 'Klassenteam', typ: 'custom', sortierbar: false, hilfe: 'Lehrkräfte und Co-Kräfte, die fest zur Klasse gehören (unabhängig von der Klassenleitung). Sie stehen in den Auswahllisten dieser Klasse oben; automatisch ergänzte Co-Lehrkräfte kommen nur aus dem Team (die Klassenleitung der Klasse zählt dazu).', render: k => h('span', { class: 'zeile eng' }, k.team.map(id => { const l = lehrerVon(id); return l ? h('span', { class: 'chip', title: l.name + (l.ausgebildet === false ? ' (Co-Kraft)' : ''), style: l.ausgebildet === false ? { fontStyle: 'italic' } : null }, l.kuerzel) : null; }), k.team.length ? h('button', { class: 'btn icon klein', title: 'Klassenteam bearbeiten', 'aria-label': 'Klassenteam der Klasse ' + k.name + ' bearbeiten', onclick: () => teamDialog(k) }, icon('stift')) : h('button', { class: 'btn klein', onclick: () => teamDialog(k) }, '+ Team')) },
        { k: 'kl', titel: 'Klassenleitung', typ: 'custom', schmal: true, sortierbar: false, render: k => { const t = APP.daten.lehrer.find(l => l.klassenleitung === k.id); return sel(lehrerOpts('– keine –'), t ? t.id : '', v => aendern('Klassenleitung ' + k.name, d => { d.lehrer.forEach(l => { if (l.klassenleitung === k.id) l.klassenleitung = null; }); const l = findeId(d.lehrer, v); if (l) l.klassenleitung = k.id; }, { render: ((APP.meta.tabModus || {}).klassen || 'detail') === 'detail' }), { 'aria-label': 'Klassenleitung' }); } }
      ],
      neu: () => nKlasse({ name: '', jahrgang: 5 }, nL),
      duplizieren: (d, k) => { const neuG = k.gruppen.map(g => Object.assign({}, g, { id: neueId('g') })), ids = new Map(k.gruppen.map((g, i) => [g.id, neuG[i].id])); return Object.assign(JSON.parse(JSON.stringify(k)), { id: neueId('k'), name: k.name + '′', heimatraum: null, gruppen: neuG, halb: k.halb && k.halb.every(x => ids.has(x)) ? k.halb.map(x => ids.get(x)) : null }); },
      loeschen: (d, k) => {
        const n = d.unterrichte.filter(u => u.klassen.includes(k.id)).length;
        return { text: n ? 'Klasse ' + k.name + ' wird in ' + n + ' Unterrichten verwendet; sie wird dort entfernt.' : '', tun: (d2, id) => { const gs = (k.gruppen || []).map(g => g.id); d2.unterrichte.forEach(u => { u.klassen = u.klassen.filter(x => x !== id); u.gruppen = u.gruppen.filter(g => !gs.includes(g)); }); d2.lehrer.forEach(l => { if (l.klassenleitung === id) l.klassenleitung = null; }); d2.raeume.forEach(r => { if (r.heimatKlasse === id) r.heimatKlasse = null; }); } };
      },
      auswahlAktionen: [{ text: 'In Gruppen A/B teilen', tun: ids => klassenTeilen(ids) }],
      suchtext: k => k.name + ' ' + k.jahrgang,
      excel: { spalten: ['name', 'jahrgang', 'schueler', 'fruehestens', 'spaetestens', 'maxStundenTag'], neu: (d, r) => nKlasse({ name: r[0], jahrgang: r[1], schueler: r[2], fruehestens: r[3], spaetestens: r[4], maxStundenTag: r[5], stundentafel: tafelFuerJahrgang(d, Number(r[1])) }, nL) }
    })
  ];
};

