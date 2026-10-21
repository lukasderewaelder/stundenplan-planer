// ---------- Beispieldaten: 12 Klassen, 19 Lehrkräfte und 3 Co-Kräfte, rund 30 Wochenstunden ----------
function beispieldaten() {
  const F = (id, kz, name, farbe, raumTyp, dbl, max, schwer) => ({ id, kuerzel: kz, name, farbe, raumTyp, doppelstunde: dbl, maxProTag: max, schwer });
  const faecher = [
    F('f_de', 'De', 'Deutsch', '#e8795a', 'klassenraum', 'egal', 2, true),
    F('f_ma', 'Ma', 'Mathematik', '#4f8ef7', 'klassenraum', 'bevorzugt', 2, true),
    F('f_en', 'En', 'Englisch', '#d85fa0', 'klassenraum', 'egal', 2, true),
    F('f_fr', 'Fr', 'Französisch', '#a77be0', 'klassenraum', 'egal', 2, false),
    F('f_bio', 'Bio', 'Biologie', '#5cb85c', 'klassenraum', 'egal', 2, false),
    F('f_ch', 'Ch', 'Chemie', '#3fb27f', 'chemie', 'pflicht', 2, false),
    F('f_ph', 'Ph', 'Physik', '#2bb0c9', 'physik', 'bevorzugt', 2, false),
    F('f_geo', 'Geo', 'Geografie', '#c5a24a', 'klassenraum', 'egal', 2, false),
    F('f_ge', 'Ge', 'Geschichte', '#b0835a', 'klassenraum', 'egal', 2, false),
    F('f_gk', 'GK', 'Gemeinschaftskunde', '#8f9b5a', 'klassenraum', 'egal', 2, false),
    F('f_ku', 'Ku', 'Kunst', '#f0a830', 'kunst', 'bevorzugt', 2, false),
    F('f_mu', 'Mu', 'Musik', '#e5c43b', 'musik', 'egal', 2, false),
    F('f_sp', 'Sp', 'Sport', '#7c8a99', 'sporthalle', 'bevorzugt', 2, false),
    F('f_inf', 'Inf', 'Informatik', '#5a6fd0', 'informatik', 'bevorzugt', 2, false),
    F('f_eth', 'Eth', 'Ethik', '#c07ab8', 'klassenraum', 'egal', 2, false)
  ];
  const kz2f = {}; faecher.forEach(f => { kz2f[f.kuerzel] = f.id; });
  const klassenNamen = ['5a', '5b', '6a', '6b', '7a', '7b', '8a', '8b', '9a', '9b', '10a', '10b'];
  const tafeln = {
    5: { De: 5, Ma: 4, En: 5, Bio: 2, Geo: 2, Ge: 1, Ku: 2, Mu: 2, Sp: 3, Eth: 2 },
    6: { De: 4, Ma: 4, En: 4, Fr: 3, Bio: 2, Ph: 2, Geo: 1, Ge: 2, Ku: 1, Mu: 1, Sp: 3, Eth: 1 },
    7: { De: 4, Ma: 4, En: 3, Fr: 3, Bio: 2, Ch: 2, Ph: 2, Geo: 2, Ge: 2, Ku: 1, Mu: 1, Sp: 2, Inf: 1, Eth: 1 },
    8: { De: 4, Ma: 4, En: 3, Fr: 3, Bio: 2, Ch: 2, Ph: 2, Geo: 1, Ge: 2, Ku: 1, Mu: 1, Sp: 2, Inf: 2, Eth: 1 },
    9: { De: 4, Ma: 4, En: 3, Fr: 3, Bio: 2, Ch: 2, Ph: 2, Geo: 1, Ge: 2, GK: 1, Ku: 1, Mu: 1, Sp: 2, Inf: 1, Eth: 1 },
    10: { De: 4, Ma: 4, En: 3, Fr: 3, Bio: 2, Ch: 2, Ph: 2, Geo: 1, Ge: 2, GK: 2, Ku: 1, Mu: 1, Sp: 2, Eth: 1 }
  };
  const zuteilung = {
    '5a': { De: 'Wa', Ma: 'Mü', En: 'Be', Bio: 'Zi', Geo: 'Ri', Ge: 'Wa', Ku: 'Wo', Mu: 'Kl', Sp: 'Ri', Eth: 'Hf' },
    '5b': { De: 'Be', Ma: 'Ho', En: 'Br', Bio: 'Ko', Geo: 'Ha', Ge: 'Ha', Ku: 'We', Mu: 'Kl', Sp: 'Zi', Eth: 'Wo' },
    '6a': { De: 'Kl', Ma: 'Ne', En: 'Sä', Fr: 'Sw', Bio: 'Zi', Ph: 'Kr', Geo: 'Ri', Ge: 'Sw', Ku: 'Wo', Mu: 'We', Sp: 'Ri', Eth: 'Hf' },
    '6b': { De: 'Hf', Ma: 'Sm', En: 'La', Fr: 'Sä', Bio: 'Ko', Ph: 'Ho', Geo: 'Ha', Ge: 'Wa', Ku: 'We', Mu: 'Kl', Sp: 'Zi', Eth: 'Wo' },
    '7a': { De: 'Wa', Ma: 'Mü', En: 'La', Fr: 'Sä', Bio: 'Zi', Ch: 'Mü', Ph: 'Kr', Geo: 'Ri', Ge: 'Sw', Ku: 'Wo', Mu: 'Kl', Sp: 'Ri', Inf: 'Ne', Eth: 'Hf' },
    '7b': { De: 'Be', Ma: 'Sm', En: 'Br', Fr: 'Sw', Bio: 'Ko', Ch: 'Ko', Ph: 'Ho', Geo: 'Ha', Ge: 'Ha', Ku: 'We', Mu: 'We', Sp: 'Zi', Inf: 'Sm', Eth: 'Wo' },
    '8a': { De: 'Kl', Ma: 'Ho', En: 'Be', Fr: 'Sä', Bio: 'Zi', Ch: 'Mü', Ph: 'Ho', Geo: 'Ri', Ge: 'Wa', Ku: 'Wo', Mu: 'Kl', Sp: 'Ri', Inf: 'Ne', Eth: 'Hf' },
    '8b': { De: 'Hf', Ma: 'Kr', En: 'La', Fr: 'Sw', Bio: 'Ko', Ch: 'Ko', Ph: 'Kr', Geo: 'Ha', Ge: 'Sw', Ku: 'We', Mu: 'We', Sp: 'Zi', Inf: 'Sm', Eth: 'Wo' },
    '9a': { De: 'Wa', Ma: 'Mü', En: 'Br', Fr: 'Sä', Bio: 'Zi', Ch: 'Ko', Ph: 'Kr', Geo: 'Ri', Ge: 'Ha', GK: 'Br', Ku: 'Wo', Mu: 'Kl', Sp: 'Ri', Inf: 'Ne', Eth: 'Hf' },
    '9b': { De: 'Be', Ma: 'Ne', En: 'La', Fr: 'Sw', Bio: 'Ko', Ch: 'Mü', Ph: 'Ho', Geo: 'Ha', Ge: 'Wa', GK: 'Br', Ku: 'We', Mu: 'We', Sp: 'Zi', Inf: 'Sm', Eth: 'Wo' },
    '10a': { De: 'Kl', Ma: 'Kr', En: 'Sä', Fr: 'Sw', Bio: 'Zi', Ch: 'Mü', Ph: 'Kr', Geo: 'Ri', Ge: 'Sw', GK: 'Br', Ku: 'Wo', Mu: 'Kl', Sp: 'Ri', Eth: 'Hf' },
    '10b': { De: 'Hf', Ma: 'Sm', En: 'Be', Fr: 'Sä', Bio: 'Ko', Ch: 'Ko', Ph: 'Ho', Geo: 'Ha', Ge: 'Ha', GK: 'Br', Ku: 'We', Mu: 'We', Sp: 'Zi', Eth: 'Wo' }
  };
  const lehrerDef = [
    ['Mü', 'Müller'], ['Sch', 'Schulz'], ['Wa', 'Wagner'], ['Be', 'Becker'], ['Ho', 'Hoffmann'],
    ['Sä', 'Schäfer'], ['Ko', 'Koch'], ['Ri', 'Richter'], ['Kl', 'Klein'], ['Wo', 'Wolf'],
    ['Ne', 'Neumann'], ['Sw', 'Schwarz'], ['Zi', 'Zimmermann'], ['Br', 'Braun'], ['Kr', 'Krüger'],
    ['Hf', 'Hofmann'], ['Ha', 'Hartmann'], ['La', 'Lange'], ['Sm', 'Schmitt'], ['We', 'Werner'],
    ['Pe', 'Peters'], ['Vo', 'Vogel']
  ];
  const kz2t = {};
  const D = 5, H = 9;
  const voll = () => Array.from({ length: D }, () => Array(H).fill(1));
  const lehrer = lehrerDef.map(([kz, name]) => {
    const id = 't_' + kz.toLowerCase().replace('ü', 'ue').replace('ä', 'ae');
    kz2t[kz] = id;
    return { id, kuerzel: kz, name, faecher: [], deputat: null, verfuegbarkeit: voll(), maxStundenTag: 7, minStundenTag: 0, maxHohlstundenTag: 2, freierTagWunsch: [], anwesenheit: 'vollzeit', anwesenheitTage: [], klassenleitung: null };
  });
  const L = kz => lehrer.find(l => l.kuerzel === kz);
  // individuelle Verfügbarkeiten
  const mue = L('Mü'); for (let h = 4; h < H; h++) mue.verfuegbarkeit[4][h] = 0; mue.verfuegbarkeit[4][0] = 2; mue.verfuegbarkeit[4][1] = 2; mue.verfuegbarkeit[4][2] = 2; mue.maxHohlstundenTag = 1;
  const sch = L('Sch'); sch.anwesenheit = 'teilzeit'; sch.anwesenheitTage = [0, 1, 3, 4]; sch.freierTagWunsch = []; sch.maxStundenTag = 6;
  L('Ko').anwesenheit = 'ausbildungstag'; L('Ko').anwesenheitTage = [3];
  L('Ri').freierTagWunsch = [4];
  L('Wa').verfuegbarkeit[0][0] = -1;
  const we = L('We'); for (let h = 6; h < H; h++) for (let d = 0; d < D; d++) we.verfuegbarkeit[d][h] = -1;
  L('La').anwesenheit = 'teilzeit'; L('La').anwesenheitTage = [0, 1, 2, 3];
  L('Ne').minStundenTag = 2;
  // Co-Kräfte (keine ausgebildeten Lehrkräfte): Schulz (Schulbegleitung, alle Fächer – nur von Hand), Peters (Ma, De), Vogel (De, Ma, En).
  // Der Co-Bedarf in Mathematik (alle Klassen, 48 Std.) ist mit Peters und Vogel rechnerisch abdeckbar.
  sch.ausgebildet = false; sch.arbeitszeit = 20;
  const pe = L('Pe'); pe.ausgebildet = false; pe.arbeitszeit = 30; pe.faecher = []; pe.coFaecher = ['f_ma', 'f_de'];
  const vo = L('Vo'); vo.ausgebildet = false; vo.arbeitszeit = 35; vo.faecher = []; vo.coFaecher = ['f_de', 'f_ma', 'f_en'];
  L('La').arbeitszeit = 30;
  faecher.find(f => f.id === 'f_ma').coBedarf = true;
  const stunden = vorlageRaster('45');
  const raeume = [];
  const klassen = klassenNamen.map((name, i) => {
    const jg = parseInt(name, 10);
    const rid = 'r_' + (101 + i);
    raeume.push({ id: rid, name: String(101 + i), typ: 'klassenraum', kapazitaet: 30, teilbar: 1, heimatKlasse: 'k_' + name });
    const tafel = {};
    Object.entries(tafeln[jg]).forEach(([kz, n]) => { tafel[kz2f[kz]] = n; });
    const teams = { '5a': ['Wa', 'Sch'], '5b': ['Be', 'Pe'], '6a': ['Sä', 'Vo'], '6b': ['Ri', 'Pe', 'Sch'], '7a': ['Mü', 'Vo'], '7b': ['Sw', 'Pe'], '8a': ['Ho', 'Vo'], '8b': ['Zi', 'Pe'], '9a': ['Ko', 'Vo'], '9b': ['Br', 'Pe'], '10a': ['Ne', 'Vo'], '10b': ['Kr', 'Pe'] };
    // 5a: in Mathematik nur 2 Stunden mit Co-Bedarf – die übernimmt Schulz anteilig (fest eingetragen)
    return { id: 'k_' + name, name, jahrgang: jg, heimatraum: rid, schueler: 24 + (i % 4), fruehestens: 1, spaetestens: jg <= 6 ? 6 : 8, maxStundenTag: jg <= 6 ? 6 : 7, stundentafel: tafel, gruppen: [], team: teams[name].map(kz => L(kz).id), coBedarf: name === '5a' ? { f_ma: 2 } : {} };
  });
  raeume.push({ id: 'r_ch1', name: 'Chemie 1', typ: 'chemie', kapazitaet: 28, teilbar: 1 });
  raeume.push({ id: 'r_ph1', name: 'Physik 1', typ: 'physik', kapazitaet: 28, teilbar: 1 });
  raeume.push({ id: 'r_inf', name: 'PC-Kabinett', typ: 'informatik', kapazitaet: 28, teilbar: 1 });
  raeume.push({ id: 'r_ku', name: 'Kunstraum', typ: 'kunst', kapazitaet: 30, teilbar: 1 });
  raeume.push({ id: 'r_mu', name: 'Musikraum', typ: 'musik', kapazitaet: 30, teilbar: 1 });
  raeume.push({ id: 'r_halle', name: 'Sporthalle', typ: 'sporthalle', kapazitaet: 60, teilbar: 2 });
  const kl = { '5a': 'Wa', '5b': 'Be', '6a': 'Sä', '6b': 'Ri', '7a': 'Mü', '7b': 'Sw', '8a': 'Ho', '8b': 'Zi', '9a': 'Ko', '9b': 'Br', '10a': 'Ne', '10b': 'Kr' };
  Object.entries(kl).forEach(([k, t]) => { L(t).klassenleitung = 'k_' + k; });
  const unterrichte = [];
  let n = 0;
  klassen.forEach(k => {
    Object.entries(tafeln[k.jahrgang]).forEach(([fkz, ws]) => {
      const tkz = zuteilung[k.name][fkz];
      const l = L(tkz);
      if (!l.faecher.includes(kz2f[fkz])) l.faecher.push(kz2f[fkz]);
      const lk = [{ lehrer: l.id, rolle: 'fach', modus: 'immer', stundenAnteil: ws, deputatFaktor: 1 }];
      if (k.name === '5a' && fkz === 'Ma') lk.push({ lehrer: kz2t.Sch, rolle: 'co', modus: 'anteilig', stundenAnteil: 2, deputatFaktor: 0.5 });
      if (k.name === '6b' && fkz === 'De') lk.push({ lehrer: kz2t.Sch, rolle: 'co', modus: 'immer', stundenAnteil: ws, deputatFaktor: 1 });
      unterrichte.push({ id: 'u_' + (++n), fach: kz2f[fkz], klassen: [k.id], gruppen: [], lehrkraefte: lk, wochenstunden: ws, bloecke: [], raum: '', rhythmus: 'jede', kopplung: null, fixiert: [] });
    });
  });
  // Klassenleitungen dürfen in ihren Fächern auch als Co-Lehrkraft einspringen (Fach als Lehrkraft und als Co)
  lehrer.forEach(l => { if (l.klassenleitung && l.ausgebildet !== false) l.coFaecher = l.faecher.slice(); });
  // Aufgaben (personengebunden, ohne Klasse)
  unterrichte.push({ id: 'a_medien', aufgabe: true, name: 'Medienverantwortliche', kuerzel: 'Medien', farbe: '#7d6bd6', fach: '', klassen: [], gruppen: [], lehrkraefte: [{ lehrer: kz2t.Ne, rolle: 'fach', modus: 'immer' }], wochenstunden: 2, bloecke: [1, 1], anrechnung: true, vorbereitung: false });
  unterrichte.push({ id: 'a_sv', aufgabe: true, name: 'Schülervertretung (SV-Beratung)', kuerzel: 'SV', farbe: '#d6866b', fach: '', klassen: [], gruppen: [], lehrkraefte: [{ lehrer: kz2t.We, rolle: 'fach', modus: 'immer' }], wochenstunden: 1, bloecke: [], anrechnung: true, vorbereitung: false });
  // Schulleitung: 6 Zeitstunden je Woche als zwei lange Blöcke (über Pausen hinweg), zählt zur Arbeitszeit, nicht zum Unterrichtsdeputat
  unterrichte.push({ id: 'a_sl', aufgabe: true, name: 'Schulleitung', kuerzel: 'SL', farbe: '#4f8a8b', fach: '', klassen: [], gruppen: [], lehrkraefte: [{ lehrer: kz2t.Wo, rolle: 'fach', modus: 'immer' }], einheit: 'zstd', zeitstunden: 6, wochenstunden: 8, bloecke: [4, 4], pausenZaehlen: true, anrechnung: false, vorbereitung: false });
  // Unterrichtsstunden (Soll) = geplante Stunden, Wochenarbeitszeit mit etwas Luft für Aufsichten (siehe unten)
  const d0 = normalisiere({ schule: { name: 'Beispielschule', schuljahr: '2026/27', tage: ['Mo', 'Di', 'Mi', 'Do', 'Fr'], wochenrhythmus: 'einfach', stunden, tagSchluss: { Fr: 6 } }, faecher, raeume, klassen, lehrer, unterrichte });
  d0.lehrer.forEach(l => { l.deputat = null; });
  // Beispiel für geteilte Fächer: Die 6a hat Kunst und Musik in den Halbgruppen A/B – jede Gruppe mit voller Stundenzahl, dieselbe Lehrkraft
  // für beide Gruppen (Vorbereitung zählt einmal). Kunst und Musik sind Parallelpartner: Gruppe A Kunst liegt immer zeitgleich mit Gruppe B Musik.
  { const k6 = d0.klassen.find(k => k.name === '6a');
    if (k6) {
      k6.gruppen = [{ id: 'g_6a_a', name: 'A', schueler: Math.ceil(k6.schueler / 2) }, { id: 'g_6a_b', name: 'B', schueler: Math.floor(k6.schueler / 2) }];
      ['f_ku', 'f_mu'].forEach(fid => {
        const i = d0.unterrichte.findIndex(u => !u.aufgabe && u.fach === fid && u.klassen.length === 1 && u.klassen[0] === k6.id); if (i < 0) return;
        const u = d0.unterrichte[i]; k6.teilung[fid] = true; u.gruppen = ['g_6a_a'];
        const b = JSON.parse(JSON.stringify(u)); b.id = u.id + '_b'; b.gruppen = ['g_6a_b']; d0.unterrichte.splice(i + 1, 0, b);
      });
      k6.parallel = { f_ku: 'f_mu', f_mu: 'f_ku' }; // Parallelband: Gruppe A Kunst liegt immer zeitgleich mit Gruppe B Musik (und umgekehrt)
    } }
  // Wochenarbeitszeit: geplante Arbeitszeit + etwa 3 Stunden Luft für Aufsichten (auf halbe Stunden); Co-Kräfte bekommen ihre Co-Stunden
  // erst in der Berechnung – sie erhalten eine volle Co-Stelle
  const azPlan = arbeitszeiten(d0, { geplant: true, ohneAufsicht: true, ohneDienste: true });
  d0.lehrer.forEach(l => { const x = azPlan.liste.find(y => y.lehrer === l.id); if (!x) return; if (l.ausgebildet === false) { l.arbeitszeit = 30; l.deputat = 28; return; } l.arbeitszeit = Math.ceil((x.summe / 60 + 3) * 2) / 2; l.deputat = Math.ceil(x.istStd - 1e-9) + 2; }); // zwei Stunden Luft: So zeigt der Plan-Editor im Beispiel auch verfügbare Vertretungen
  // Beispiel mit begrenztem Unterrichtsdeputat (Höchstzahl je Person); in neuen Projekten ist die Option aus
  d0.schule.arbeitszeitModell.stundenSoll = true;
  // Zeitprofil: Unterstufe (5/6) in 90-Minuten-Blöcken ohne 5-Minuten-Wechsel
  d0.schule.zeitprofile = [{ id: 'zp_us', name: 'Unterstufe 5/6 (Blöcke)', bloecke: [
    { id: 'b1', name: 'Block 1', von: 1, bis: 2, beginn: '07:30', ende: '09:00' },
    { id: 'b2', name: 'Block 2', von: 3, bis: 4, beginn: '09:25', ende: '10:55' },
    { id: 'b3', name: 'Block 3', von: 5, bis: 6, beginn: '11:15', ende: '12:45' }] }];
  d0.klassen.forEach(k => { if (k.jahrgang <= 6) k.zeitprofil = 'zp_us'; });
  // Zeitprofil für ein Fach: Sport läuft in allen Klassen als Block ohne Wechselpause (hat Vorrang vor dem Profil der Klasse)
  const fSp = d0.faecher.find(x => x.kuerzel === 'Sp');
  if (fSp) d0.schule.zeitprofile.push({ id: 'zp_sp', name: 'Sport (Block ohne Wechselpause)', faecher: [fSp.id], bloecke: [
    { id: 's1', name: 'Block 1', von: 1, bis: 2, beginn: '07:30', ende: '09:00' },
    { id: 's2', name: 'Block 2', von: 3, bis: 4, beginn: '09:25', ende: '10:55' },
    { id: 's3', name: 'Block 3', von: 5, bis: 6, beginn: '11:15', ende: '12:45' }] });
  // Höchstarbeitszeit je Tag (Beispiel: Co-Kraft in Teilzeit höchstens 4 Stunden am Tag)
  const lSch = d0.lehrer.find(x => x.kuerzel === 'Sch'); if (lSch) lSch.maxArbeitTag = 4;
  // Weiteres Personal: unterrichtet nicht (auch nicht als Co), übernimmt aber Aufsichten (z. B. GTA) und Aufgaben
  d0.lehrer.push(nLehrer({ id: 't_li', kuerzel: 'Li', name: 'Lindner', art: 'personal', faecher: [], arbeitszeit: 20, deputat: null,
    dienstAusschluss: [{ typ: 'dt_frueh', tag: -1, von: '', bis: '07:00' }] }, D, H));
  // Aufsichten: gestaffelter Früh- und Spätaufsicht, Bistro, Betreuung der Unterstufe (Aufsichten laufen wie bisher daneben)
  const kzId = kz => (d0.lehrer.find(l => l.kuerzel === kz) || {}).id;
  const ab = (...z) => z.map(([b, e, min, soll]) => ({ beginn: b, ende: e, min, soll: soll === undefined ? min : soll }));
  const bedarfe = [];
  // Pausenaufsichten: große Pause (nach der 2.), zweite Pause (nach der 4.), Mittagspause – je Tag und Bereich Mindest- und Sollbesetzung, dazu Springer
  const pausenBedarf = { n1: { a_hof: [2, 3], a_flur: [1, 1] }, n3: { a_hof: [1, 2], a_flur: [1, 1] }, p6: { a_mensa: [2, 2], a_hof: [1, 2] } }, springerJe = { n1: 1, p6: 1 };
  const pausenN = new Map(pausenListe(d0.schule, d0.klassen).map(p => [p.key, p]));
  d0.schule.tage.forEach((_, t) => Object.entries(pausenBedarf).forEach(([pk, z]) => {
    const iv = pausenIntervall(d0.schule, pk), pa = pausenN.get(pk); if (!iv) return;
    const zeit = { beginn: zeitText(iv.start), ende: zeitText(iv.end) }, name = pa ? pa.name || pa.kurz : '';
    Object.entries(z).forEach(([bid, [min, soll]]) => bedarfe.push({ tag: t, typ: 'dt_pause', bereich: bid, name, abschnitte: [Object.assign({ min, soll }, zeit)] }));
    if (springerJe[pk]) bedarfe.push({ tag: t, typ: 'dt_springer', name, abschnitte: [Object.assign({ min: springerJe[pk], soll: springerJe[pk] }, zeit)] });
  }));
  d0.schule.tage.forEach((_, t) => {
    bedarfe.push({ tag: t, typ: 'dt_frueh', abschnitte: ab(['06:45', '07:00', 1], ['07:00', '07:15', 2], ['07:15', '07:30', 3]) });
    if (t < 4) bedarfe.push({ tag: t, typ: 'dt_spaet', abschnitte: ab(['15:05', '15:30', 3], ['15:30', '16:00', 2], ['16:00', '16:30', 1]) });
    else bedarfe.push({ tag: t, typ: 'dt_spaet', abschnitte: ab(['12:50', '13:30', 2], ['13:30', '14:00', 1]) });
    bedarfe.push({ tag: t, typ: 'dt_bistro', bereich: 'a_bistro', abschnitte: ab(['12:45', '13:30', 1, 2]) });
    if (t < 4) bedarfe.push({ tag: t, typ: 'dt_hort', bereich: 'a_betreuung', abschnitte: ab(['12:45', '13:30', 2], ['13:30', '14:15', 1]) });
    // Ganztagsangebote (GTA) am Nachmittag: Mo/Mi Sport, Di/Do Kreativ – geplant wie die Aufsichten, auch zeitgleich mit ihnen
    if (t < 4) bedarfe.push({ tag: t, typ: 'dt_gta', bereich: t % 2 ? 'a_gta_kreativ' : 'a_gta_sport', abschnitte: ab(['14:20', '15:05', 1]) });
  });
  d0.dienste = {
    bereiche: [{ id: 'a_hof', name: 'Schulhof' }, { id: 'a_flur', name: 'Flur/Treppenhaus' }, { id: 'a_mensa', name: 'Mensa' }].concat([{ id: 'a_bistro', name: 'Bistro' }, { id: 'a_betreuung', name: 'Betreuungsraum (5/6)' }, { id: 'a_gta_sport', name: 'GTA Sport' }, { id: 'a_gta_kreativ', name: 'GTA Kreativ' }]),
    bedarfe,
    plan: [{ id: 'di_konferenz', lehrer: kzId('We'), tag: 4, typ: 'dt_orga', beginn: '13:00', ende: '14:00', quelle: 'manuell', fixiert: true, rhythmus: { art: 'monatlich', ordinal: 1 }, notiz: 'Vorbereitung Gesamtkonferenz' }],
    auto: true
  };
  const lp = (kz, p, v) => { const l = d0.lehrer.find(x => x.kuerzel === kz); if (!l) return; Object.assign(l.dienstPraeferenzen, p || {}); if (v) l.dienstVerfuegbarkeit = v; };
  lp('Mü', { frueh: 'nicht möglich' });
  lp('Ri', { spaet: 'ungern' });
  lp('Sch', { frueh: 'gern' });
  lp('La', { maxFruehdiensteWoche: 1 });
  lp('Ko', null, [{ tag: 0, spaetestens: '15:30' }]);
  const ne = d0.lehrer.find(x => x.kuerzel === 'Ne'); if (ne) ne.qualifikationen = ['ersthelfer'];
  const vorl = {};
  Object.entries(tafeln).forEach(([jg, t]) => { vorl[jg] = {}; Object.entries(t).forEach(([kz, n2]) => { vorl[jg][kz2f[kz]] = n2; }); });
  d0.stundentafelVorlagen = vorl;
  d0.regeln.paarregeln = [{ typ: 'schwerHintereinander', a: '', b: '' }, { typ: 'vorPause', a: 'f_sp', b: '' }];
  return normalisiere(d0);
}

