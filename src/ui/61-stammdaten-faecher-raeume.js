/* ---------------- Fächer ---------------- */
function standardFaecher() {
  let n = 0;
  aendern('Standardfächer eingefügt', d => {
    STANDARDFAECHER.forEach(([kz, name, farbe, typ, dbl, max, schwer]) => {
      if (d.faecher.some(f => f.kuerzel.toLowerCase() === kz.toLowerCase())) return;
      d.faecher.push(nFach({ id: 'f_' + kz.toLowerCase(), kuerzel: kz, name, farbe, raumTyp: typ, doppelstunde: dbl, maxProTag: max, schwer }));
      n++;
    });
  });
  toast(n ? n + ' Standardfächer eingefügt.' : 'Alle Standardfächer sind schon vorhanden.', n ? 'ok' : '');
}
SEITEN_RENDER.faecher = () => [
  seitenkopf('Fächer', 'Kürzel, Name, Farbe, benötigter Raumtyp und Doppelstundenregel. Die Farbe erscheint in allen Plänen.'),
  h('datalist', { id: 'dl_raumtypen' }, raumTypen().map(t => h('option', { value: t }))),
  tabelle({
    key: 'faecher', titel: 'Fächer', zeilen: d => d.faecher,
    leer: { icon: 'buch', titel: 'Noch keine Fächer', text: 'Jedes Fach bekommt Kürzel, Farbe und – wenn nötig – einen Raumtyp. Die üblichen Fächer lassen sich mit einem Klick übernehmen.', neu: '+ Erstes Fach anlegen', zweit: [{ text: 'Standardfächer übernehmen', tun: () => standardFaecher() }] },
    spalten: [
      { k: 'kuerzel', titel: 'Kürzel', typ: 'text', breite: '90px' },
      { k: 'name', titel: 'Name', typ: 'text' },
      { k: 'farbe', titel: 'Farbe', typ: 'farbe', breite: '60px', sortierbar: false },
      { k: 'raumTyp', titel: 'Raumtyp', typ: 'text', liste: 'dl_raumtypen', hilfe: 'Muss zum Typ eines Raums passen (z. B. klassenraum, chemie, sporthalle). Leer = kein Raum nötig.' },
      { k: 'doppelstunde', titel: 'Doppelstunde', typ: 'select', opts: DOPPEL.map(x => [x, x]), hilfe: 'pflicht: Das Fach wird nur in Doppelstunden geplant – bei ungerader Stundenzahl liegt die übrige Doppelstunde im Wechsel A-/B-Woche (z. B. 3 UStd. = eine Doppelstunde jede Woche + eine nur in Woche A). verboten untersagt Doppelblöcke; bevorzugt/vermeiden sind Wünsche mit einstellbarer Wichtigkeit; egal: nur so viele Doppelblöcke wie nötig.' },
      { k: 'maxProTag', titel: 'max./Tag', typ: 'zahl', min: 1, max: 20, hilfe: 'Wie oft das Fach je Klasse und Tag vorkommen darf (Doppelblock zählt als zwei). Für einzelne Klassen lässt sich ein eigener Wert in der Stundentafel eintragen (Knopf mit den drei Punkten in der Zelle).' },
      { k: 'schwer', titel: 'Kernfach', typ: 'bool', hilfe: 'Kernfächer liegen bevorzugt in frühen Stunden; zwei Kernfächer folgen möglichst nicht direkt aufeinander. Die Klassenleitung unterrichtet die Kernfächer ihrer Klasse bevorzugt selbst, wenn sie das Fach unterrichten kann.' },
      { k: 'coBedarf', titel: 'Co einplanen', typ: 'bool', hilfe: 'Kurse dieses Fachs bekommen automatisch eine Co-Lehrkraft – aus dem Klassenteam der Klasse und mit dem Fach „als Co“: zuerst Co-Kräfte, ausgebildete Lehrkräfte nur, wenn keine Co-Kraft passt (dann zuerst die Klassenleitung).' },
      { k: 'vorbereitung', titel: 'Vorbereitung', typ: 'bool', hilfe: 'Standard für neue Kurse: Unterricht mit Vorbereitungszeit (Lehrkraft 35 min, Co 17 min je Unterrichtsstunde). Je Kurs im Unterrichtsdialog änderbar.' }
    ],
    neu: () => nFach({ farbe: zufallsFarbe() }),
    loeschen: (d, f) => {
      const n = d.unterrichte.filter(u => u.fach === f.id).length;
      return { text: n ? 'Fach ' + (f.kuerzel || f.name) + ' wird in ' + n + ' Unterrichten verwendet; dort wird das Fach leer gesetzt.' : '', tun: (d2, id) => { d2.unterrichte.forEach(u => { if (u.fach === id) u.fach = ''; }); d2.klassen.forEach(k => { delete k.stundentafel[id]; if (k.teilung) delete k.teilung[id]; if (k.parallel) { const p = k.parallel[id]; delete k.parallel[id]; if (p) delete k.parallel[p]; } if (k.coBedarf) delete k.coBedarf[id]; if (k.maxProTag) delete k.maxProTag[id]; }); d2.lehrer.forEach(l => { l.faecher = l.faecher.filter(x => x !== id); l.coFaecher = (l.coFaecher || []).filter(x => x !== id); }); Object.values(d2.stundentafelVorlagen).forEach(t => { delete t[id]; }); d2.regeln.paarregeln.forEach(p => { if (p.a === id) p.a = ''; if (p.b === id) p.b = ''; }); } };
    },
    suchtext: f => f.kuerzel + ' ' + f.name + ' ' + f.raumTyp,
    excel: { spalten: ['kuerzel', 'name', 'raumTyp', 'doppelstunde', 'maxProTag'], neu: (d, r) => nFach({ kuerzel: r[0], name: r[1], raumTyp: r[2] || 'klassenraum', doppelstunde: r[3], maxProTag: r[4], farbe: zufallsFarbe() }) },
    extraKnoepfe: [h('button', { class: 'btn', onclick: standardFaecher }, 'Standardfächer einfügen')]
  })
];

/* ---------------- Räume ---------------- */
function raeumeMasse() {
  const praefix = h('input', { type: 'text', value: 'Raum ', style: { width: '90px' }, 'aria-label': 'Präfix' });
  const von = h('input', { type: 'number', value: 101, min: 0, max: 9999, 'aria-label': 'von' });
  const bis = h('input', { type: 'number', value: 110, min: 0, max: 9999, 'aria-label': 'bis' });
  const typ = h('input', { type: 'text', value: 'klassenraum', list: 'dl_raumtypen', style: { width: '130px' }, 'aria-label': 'Typ' });
  const kap = h('input', { type: 'number', value: 30, min: 0, max: 999, 'aria-label': 'Kapazität' });
  return h('div', { class: 'karte' }, h('h3', { style: { marginTop: 0 } }, 'Massenanlage'),
    h('div', { class: 'zeile' }, 'Präfix', praefix, 'Nummer von', von, 'bis', bis, 'Typ', typ, 'Kapazität', kap,
      h('button', { class: 'btn', onclick: () => {
        const a = Number(von.value), b = Number(bis.value);
        if (!(b >= a) || b - a > 200) { toast('Bitte einen Bereich mit höchstens 200 Räumen angeben.', 'err'); return; }
        let n = 0;
        aendern('Räume ' + a + '–' + b + ' angelegt', d => { for (let i = a; i <= b; i++) { const name = (praefix.value + i).trim(); if (d.raeume.some(r => r.name === name)) continue; d.raeume.push(nRaum({ name, typ: typ.value || 'klassenraum', kapazitaet: Number(kap.value) || 30 }, d.schule.tage.length, d.schule.stunden.length)); n++; } });
        toast(n + ' Räume angelegt.', 'ok');
      } }, 'Anlegen')));
}
SEITEN_RENDER.raeume = () => [
  seitenkopf('Räume', 'Name, Typ, Kapazität, teilbare Hallen und Verfügbarkeit. Der Raumtyp muss zum Raumtyp des Fachs passen.'),
  h('datalist', { id: 'dl_raumtypen' }, raumTypen().map(t => h('option', { value: t }))),
  raeumeMasse(),
  h('div', { class: 'abstand' }),
  tabelle({
    key: 'raeume', titel: 'Räume', zeilen: d => d.raeume,
    leer: { icon: 'tuer', titel: 'Noch keine Räume', text: 'Klassenräume, Fachräume und Hallen mit Typ und Platzzahl. Mehrere gleichartige Räume lassen sich oben auf einmal anlegen.', neu: '+ Ersten Raum anlegen' },
    spalten: [
      { k: 'name', titel: 'Name', typ: 'text' },
      { k: 'typ', titel: 'Typ', typ: 'text', liste: 'dl_raumtypen' },
      { k: 'kapazitaet', titel: 'Kapazität', typ: 'zahl', min: 0, max: 999 },
      { k: 'teilbar', titel: 'teilbar', typ: 'zahl', min: 1, max: 9, hilfe: 'Räume mit teilbar = n (z. B. Sporthalle mit 2 Hallenteilen) nehmen bis zu n Unterrichte gleichzeitig auf.' },
      { k: 'heimat', titel: 'Klassenraum von', typ: 'custom', sortierbar: false, render: r => { const k = APP.daten.klassen.filter(x => x.heimatraum === r.id).map(x => x.name); return h('span', { class: 'muted' }, k.join(', ') || '–'); } },
      { k: 'verf', titel: 'Verfügbarkeit', typ: 'custom', sortierbar: false, render: r => miniVerf(r.verfuegbarkeit, async () => { const m = await verfuegbarkeitDialog('Raum ' + r.name, r.verfuegbarkeit); if (m) aendern('Verfügbarkeit Raum ' + r.name, d => { findeId(d.raeume, r.id).verfuegbarkeit = m; }); }, 'Verfügbarkeit von Raum ' + r.name + ' bearbeiten') }
    ],
    neu: d => nRaum({ name: '', typ: 'klassenraum' }, d.schule.tage.length, d.schule.stunden.length),
    loeschen: (d, r) => {
      const nk = d.klassen.filter(k => k.heimatraum === r.id).length, nu = d.unterrichte.filter(u => u.raum === r.id).length;
      const txt = (nk ? 'Raum ist Klassenraum von ' + nk + ' Klasse(n). ' : '') + (nu ? 'Raum ist in ' + nu + ' Unterrichten fest eingetragen. ' : '') + ((nk || nu) ? 'Die Zuordnungen werden leer gesetzt.' : '');
      return { text: txt, tun: (d2, id) => { d2.klassen.forEach(k => { if (k.heimatraum === id) k.heimatraum = null; }); d2.unterrichte.forEach(u => { if (u.raum === id) u.raum = ''; }); d2.plan.platzierungen.forEach(p => { if (p.raum === id) p.raum = null; }); (d2.gta || []).forEach(g => { if (g.raum === id) g.raum = ''; }); } };
    },
    suchtext: r => r.name + ' ' + r.typ,
    excel: { spalten: ['name', 'typ', 'kapazitaet', 'teilbar'], neu: (d, r) => nRaum({ name: r[0], typ: r[1] || 'klassenraum', kapazitaet: r[2], teilbar: r[3] }, d.schule.tage.length, d.schule.stunden.length) }
  })
];

