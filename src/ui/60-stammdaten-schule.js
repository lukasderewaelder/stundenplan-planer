/* =====================================================================
   5b. OBERFLÄCHE – Stammdaten, Unterrichtsverteilung, Prüfung, Regeln
   ===================================================================== */

const STANDARDFAECHER = [
  ['De', 'Deutsch', '#e8795a', 'klassenraum', 'egal', 2, true], ['Ma', 'Mathematik', '#4f8ef7', 'klassenraum', 'bevorzugt', 2, true],
  ['En', 'Englisch', '#d85fa0', 'klassenraum', 'egal', 2, true], ['Fr', 'Französisch', '#a77be0', 'klassenraum', 'egal', 2, false],
  ['La', 'Latein', '#8e6bbf', 'klassenraum', 'egal', 2, false], ['Bio', 'Biologie', '#5cb85c', 'klassenraum', 'egal', 2, false],
  ['Ch', 'Chemie', '#3fb27f', 'chemie', 'pflicht', 2, false], ['Ph', 'Physik', '#2bb0c9', 'physik', 'bevorzugt', 2, false],
  ['Geo', 'Geografie', '#c5a24a', 'klassenraum', 'egal', 2, false], ['Ge', 'Geschichte', '#b0835a', 'klassenraum', 'egal', 2, false],
  ['GK', 'Gemeinschaftskunde', '#8f9b5a', 'klassenraum', 'egal', 2, false], ['Eth', 'Ethik', '#c07ab8', 'klassenraum', 'egal', 2, false],
  ['Re', 'Religion', '#9b7ad0', 'klassenraum', 'egal', 2, false], ['Ku', 'Kunst', '#f0a830', 'kunst', 'bevorzugt', 2, false],
  ['Mu', 'Musik', '#e5c43b', 'musik', 'egal', 2, false], ['Sp', 'Sport', '#7c8a99', 'sporthalle', 'bevorzugt', 2, false],
  ['Inf', 'Informatik', '#5a6fd0', 'informatik', 'bevorzugt', 2, false], ['TC', 'Technik/Computer', '#6f7fa8', 'informatik', 'bevorzugt', 2, false]
];
let _farbIdx = 0, _farbZuletzt = [];
// Farben für neue Fächer: Palette mit geprüftem Kontrast (jede Farbe mindestens 4,5:1 gegen Weiß – als Farbbalken und als Schrift lesbar).
// Vergeben wird die Farbe, die im Projekt bisher am seltensten vorkommt.
const FACHPALETTE = ['#2563c9', '#c2410c', '#15803d', '#7c3aed', '#a8590a', '#0e7490', '#be185d', '#4d7c0f', '#b91c1c', '#0f766e', '#6d28d9', '#8f6400', '#1d4ed8', '#9d174d', '#047857', '#475569'];
function zufallsFarbe() {
  const zahl = new Map(FACHPALETTE.map(f => [f, 0]));
  try { APP.daten.faecher.forEach(f => { const k = String(f.farbe || '').toLowerCase(); if (zahl.has(k)) zahl.set(k, zahl.get(k) + 1); }); } catch (e) { /* ohne Daten */ }
  _farbZuletzt.forEach(f => zahl.set(f, (zahl.get(f) || 0) + 1)); // im selben Durchgang schon vergeben (z. B. mehrere Fächer aus Excel)
  let best = FACHPALETTE[(_farbIdx++) % FACHPALETTE.length];
  FACHPALETTE.forEach(f => { if (zahl.get(f) < zahl.get(best)) best = f; });
  if (!_farbZuletzt.length) Promise.resolve().then(() => { _farbZuletzt = []; });
  _farbZuletzt.push(best);
  return best;
}
function springeZu(ziel) {
  if (!ziel) return;
  if (ziel.seite === 'aufsicht' && (ziel.tab || ziel.dienst)) { dienstSpringeZu(ziel); return; }
  if (ziel.seite === 'unterricht' && ziel.klasse) {
    const st = APP.tabellen.uliste || (APP.tabellen.uliste = { filter: '' });
    Object.assign(st, { fKlasse: ziel.klasse, fFach: '', fLehrer: '', fStatus: '', filter: '' });
    gehe('unterricht');
    setTimeout(() => { const h2 = [...document.querySelectorAll('#inhalt h2')].find(x => x.textContent.startsWith('Alle Unterrichte')); if (h2) h2.scrollIntoView({ block: 'start' }); }, 0);
    return;
  }
  if (ziel.seite === 'unterricht' && ziel.id) { gehe('unterricht', { markiere: ziel.id }); unterrichtDialog(ziel.id); return; }
  // Seiten mit Reitern: Der Sprung öffnet den Reiter, in dem die gemeinte Zeile steht
  const stdReiter = { klassen: 'klassen', arbeitszeit: 'uebersicht', schule: 'allgemein', regeln: 'plan' };
  gehe(ziel.seite, { markiere: ziel.id, reiter: ziel.reiter || stdReiter[ziel.seite] });
}

/* ---------------- Schule und Zeitraster ---------------- */
function tageSetzen(neuRoh) {
  const alt = APP.daten.schule.tage.slice();
  const neu = TAGE_ALLE.filter(t => neuRoh.includes(t));
  const map = alt.map(t => neu.indexOf(t));
  aendern('Unterrichtstage geändert', d => {
    d.schule.tage = neu;
    const remap = m => neu.map(t => { const i = alt.indexOf(t); return i >= 0 && m[i] ? m[i].slice() : null; });
    const tl = arr => arr.map(x => map[x]).filter(x => x !== undefined && x >= 0);
    d.lehrer.forEach(l => { l.verfuegbarkeit = remap(l.verfuegbarkeit); l.freierTagWunsch = tl(l.freierTagWunsch); l.anwesenheitTage = tl(l.anwesenheitTage); });
    d.raeume.forEach(r => { r.verfuegbarkeit = remap(r.verfuegbarkeit); });
    d.plan.platzierungen = d.plan.platzierungen.filter(p => map[p.tag] >= 0).map(p => Object.assign(p, { tag: map[p.tag] }));
    (d.gta || []).forEach(g => { if (g.tag >= 0) g.tag = map[g.tag] >= 0 ? map[g.tag] : -1; });
    d.unterrichte.forEach(u => { u.fixiert = u.fixiert.filter(f => map[f.tag] >= 0).map(f => ({ tag: map[f.tag], stunde: f.stunde })); });
    // Aufsichten, Bedarfe und Aufsichtszeiten wandern mit ihrem Wochentag; entfallene Tage werden entfernt
    const DI = d.dienste;
    DI.plan = DI.plan.filter(x => map[x.tag] >= 0).map(x => Object.assign(x, { tag: map[x.tag] }));
    DI.bedarfe = DI.bedarfe.filter(x => map[x.tag] >= 0).map(x => Object.assign(x, { tag: map[x.tag] }));
    DI.offen = DI.offen.filter(x => map[x.tag] >= 0).map(x => Object.assign(x, { tag: map[x.tag] }));
    d.lehrer.forEach(l => { l.dienstVerfuegbarkeit = (l.dienstVerfuegbarkeit || []).filter(v => map[v.tag] >= 0).map(v => Object.assign(v, { tag: map[v.tag] })); });
  }, { normalisieren: true });
}
// map[alterIndex] = neuer Index oder -1
function rasterAendern(beschr, fnStunden, map) {
  aendern(beschr, d => {
    const lnr = st => stundenNummern({ stunden: st });
    const altL = lnr(d.schule.stunden);
    // Termine von Aufgaben, die an einer Pause hängen: bisherige Uhrzeit merken (falls die Pause wegfällt)
    const terminAlt = new Map();
    d.unterrichte.forEach(u => (u.termine || []).forEach(t => { if (t.pause && !terminAlt.has(t.pause)) terminAlt.set(t.pause, pausenIntervall(d.schule, t.pause)); }));
    const gtaAlt = new Map((d.gta || []).map(g => [g.id, gtaIntervall(d, g)]));
    fnStunden(d.schule.stunden);
    // Zeitprofile verweisen auf Unterrichtsstunden: Nummern an das neue Raster anpassen
    const neuL = lnr(d.schule.stunden), lm = new Map();
    altL.forEach((ln, o) => { const n = map[o]; if (ln && n >= 0 && neuL[n]) lm.set(ln, neuL[n]); });
    (d.schule.zeitprofile || []).forEach(z => {
      z.bloecke.forEach(b => { if (lm.has(b.von)) b.von = lm.get(b.von); if (lm.has(b.bis)) b.bis = lm.get(b.bis); if (b.bis < b.von) b.bis = b.von; });
      const pn = {}; Object.keys(z.pausen || {}).forEach(k => { if (lm.has(Number(k))) pn[lm.get(Number(k))] = z.pausen[k]; }); z.pausen = pn;
    });
    const neuH = d.schule.stunden.length;
    const inv = new Array(neuH).fill(-1); map.forEach((n, o) => { if (n >= 0 && n < neuH) inv[n] = o; });
    const remap = m => m.map(row => inv.map(o => o >= 0 ? row[o] : 1));
    d.lehrer.forEach(l => { l.verfuegbarkeit = remap(l.verfuegbarkeit); l.pausenGesperrt = (l.pausenGesperrt || []).map(k => { const [tt, key] = String(k).split('|'); const n = map[Number(key.slice(1))]; return n >= 0 ? tt + '|n' + n : null; }).filter(Boolean); });
    d.raeume.forEach(r => { r.verfuegbarkeit = remap(r.verfuegbarkeit); });
    const ok = (st, dauer) => { const a = map[st - 1]; if (a === undefined || a < 0) return -1; for (let k = 1; k < dauer; k++) if (map[st - 1 + k] !== a + k) return -1; return a + 1; };
    d.plan.platzierungen = d.plan.platzierungen.filter(p => ok(p.stunde, p.dauer) > 0).map(p => Object.assign(p, { stunde: ok(p.stunde, p.dauer) }));
    d.unterrichte.forEach(u => { u.fixiert = u.fixiert.filter(f => ok(f.stunde, 1) > 0).map(f => ({ tag: f.tag, stunde: ok(f.stunde, 1) })); });
    // GTAs in Rasterstunden wandern mit ihren Zeilen; gibt es eine Zeile nicht mehr, behält die GTA ihre bisherige Uhrzeit (eigene Zeit)
    (d.gta || []).forEach(g => { if (g.zeitArt !== 'raster') return; const a = map[g.von - 1], b = map[g.bis - 1]; if (a >= 0 && b >= a) { g.von = a + 1; g.bis = b + 1; return; } const iv = gtaAlt.get(g.id); if (iv) { g.zeitArt = 'frei'; g.beginn = zeitText(iv.start); g.ende = zeitText(iv.end); } else { g.tag = -1; g.von = 1; g.bis = 1; } });
    // Pausenschlüssel der Aufsichten mitführen: p<i> = Pausenzeile i, n<i> = Lücke nach Zeile i (= vor der Zeile, die auf i folgte)
    const schluessel = k => {
      // eigene Pause eines Zeitprofils: z<Profil>:<Nummer der Unterrichtsstunde davor>
      if (k && k[0] === 'z') { const j = k.lastIndexOf(':'), nr = Number(k.slice(j + 1)); return j > 0 && lm.has(nr) ? k.slice(0, j + 1) + lm.get(nr) : null; }
      const m = /^([pn])(\d+)$/.exec(k || ''); if (!m) return null;
      const o = Number(m[2]);
      if (m[1] === 'p') { const n = map[o]; return n >= 0 ? 'p' + n : null; }
      const n = map[o + 1]; return n !== undefined && n >= 1 ? 'n' + (n - 1) : null;
    };
    // Termine von Aufgaben wandern mit ihrer Pause; fällt die Pause weg, behält der Termin seine bisherige Uhrzeit
    d.unterrichte.forEach(u => (u.termine || []).forEach(t => {
      if (!t.pause) return;
      const n = schluessel(t.pause);
      if (n) { t.pause = n; return; }
      const iv = terminAlt.get(t.pause); t.pause = '';
      if (iv) { t.beginn = zeitText(iv.start); t.ende = zeitText(iv.end); }
    }));
  }, { normalisieren: true });
}
async function rasterVorlage(art) {
  const d = APP.daten;
  if (d.plan.platzierungen.length && !(await bestaetigen('Das Zeitraster wird ersetzt. Platzierungen, deren Stunde es danach nicht mehr gibt, werden verworfen.', 'Ersetzen'))) return;
  const neu = vorlageRaster(art);
  const altH = d.schule.stunden.length;
  const map = []; for (let i = 0; i < altH; i++) map.push(i < neu.length ? i : -1);
  rasterAendern('Zeitraster-Vorlage ' + art + ' Minuten', st => { st.splice(0, st.length, ...neu); }, map);
}
// Zeiten aus Startzeit, Dauer und Abstand zur nächsten Zeile neu berechnen (für „Stundendauer für alle“)
function zeitenFortlaufend(st) {
  let t = minVon(st[0] && st[0].beginn);
  if (t === null) t = 7 * 60 + 30;
  return st.map(s => { const b = t, e = t + (s.dauer || 0); t = e + (s.pauseDanach || 0); return { beginn: zeitText(b), ende: zeitText(e) }; });
}
function mitschieben() { return APP.meta.zeitenMitschieben !== false; }
function zeitenVerschieben(st, ab, delta) {
  if (!delta) return;
  for (let j = ab; j < st.length; j++) ['beginn', 'ende'].forEach(f => { const v = minVon(st[j][f]); if (v !== null) st[j][f] = zeitText(Math.max(0, Math.min(23 * 60 + 59, v + delta))); });
}
// Dauer und Abstand zur nächsten Zeile folgen immer aus den Uhrzeiten
function rasterAbleiten(st) {
  st.forEach((s, i) => {
    const b = minVon(s.beginn), e = minVon(s.ende);
    if (b !== null && e !== null && e > b) s.dauer = e - b;
    const nb = st[i + 1] ? minVon(st[i + 1].beginn) : null;
    s.pauseDanach = e !== null && nb !== null ? Math.max(0, nb - e) : 0;
  });
}
// Eingabe von Beginn oder Ende. Mit „Folgende Zeiten mitverschieben“ rücken alle späteren Zeilen um dieselbe Differenz nach.
function zeitEingabe(i, feld, roh) {
  const t = String(roh || '').trim();
  const z = t ? zeitNorm(t) : '', wert = t ? (z && z !== '24:00' ? z : null) : '';
  if (wert === null) { toast('„' + t + '“ ist keine gültige Uhrzeit. Möglich sind z. B. 7:30, 0730 oder 7.30.', 'err', 5000); render(); return; }
  const x = APP.daten.schule.stunden[i];
  if (!x) return;
  if ((x[feld] || '') === wert) { render(); return; }
  aendern((feld === 'beginn' ? 'Beginn ' : 'Ende ') + stundeName(i) + (wert ? ': ' + wert : ' gelöscht'), d => {
    const st = d.schule.stunden, s = st[i];
    const alt = minVon(s[feld]), neu = minVon(wert);
    const b = minVon(s.beginn), e = minVon(s.ende);
    s[feld] = wert;
    if (feld === 'beginn') {
      if (neu !== null && alt !== null && mitschieben()) {
        // Zeile behält ihre Dauer, alles danach rückt mit
        if (e !== null) s.ende = zeitText(e + (neu - alt));
        zeitenVerschieben(st, i + 1, neu - alt);
      } else if (neu !== null && e === null) s.ende = zeitText(neu + (s.dauer || 45));
    } else {
      if (neu !== null && alt !== null && mitschieben()) zeitenVerschieben(st, i + 1, neu - alt);
      const n = st[i + 1];
      // Die nächste Zeile beginnt, wo diese endet, falls dort noch nichts steht
      if (n && neu !== null && minVon(n.beginn) === null) { n.beginn = wert; if (minVon(n.ende) === null) n.ende = zeitText(neu + (n.dauer || 45)); }
      if (neu !== null && b === null && i > 0) { const ve = minVon(st[i - 1].ende); if (ve !== null && ve < neu) s.beginn = zeitText(ve); }
    }
    rasterAbleiten(st);
  });
}
function dauerEingabe(i, roh) {
  const v = Math.round(Number(String(roh).replace(',', '.')));
  if (!(v >= 5 && v <= 600)) { toast('Bitte eine Dauer zwischen 5 und 600 Minuten eintragen.', 'err'); render(); return; }
  aendern('Dauer ' + stundeName(i) + ': ' + v + ' min', d => {
    const st = d.schule.stunden, s = st[i];
    const b = minVon(s.beginn), e = minVon(s.ende);
    s.dauer = v;
    if (b !== null) {
      s.ende = zeitText(b + v);
      if (e !== null && mitschieben()) zeitenVerschieben(st, i + 1, b + v - e);
    }
    rasterAbleiten(st);
  });
}
function rasterText(i, feld, v, beschr) { aendern(beschr, d => { d.schule.stunden[i][feld] = v; }); }
function zeileEinfuegen(i, fokus) {
  const st = APP.daten.schule.stunden, x = st[i];
  const e = minVon(x.ende);
  const vorbild = [...st.slice(0, i + 1)].reverse().find(y => !y.istPause);
  const dauer = (vorbild && vorbild.dauer) || 45;
  const map = st.map((_, j) => j <= i ? j : j + 1);
  rasterAendern('Zeile eingefügt', ss => {
    const neu = { beginn: e !== null ? x.ende : '', ende: e !== null ? zeitText(e + dauer) : '', istPause: false, doppelMitNaechster: false, dauer, pauseDanach: 0, name: '', pauseName: ss[i].pauseName || '' };
    ss[i].pauseName = '';
    ss.splice(i + 1, 0, neu);
    if (e !== null && mitschieben()) zeitenVerschieben(ss, i + 2, dauer);
    rasterAbleiten(ss);
  }, map);
  if (fokus) setTimeout(() => { const el = document.querySelector('[data-zr="' + (i + 1) + ':ende"]'); if (el) { el.focus(); el.select(); } }, 0);
}
async function rasterZeileLoeschen(i) {
  const st = APP.daten.schule.stunden, x = st[i];
  if (st.length <= 1) return;
  const belegt = APP.daten.plan.platzierungen.filter(p => i >= p.stunde - 1 && i < p.stunde - 1 + p.dauer).length;
  if (belegt && !(await bestaetigen('Zeile ' + (x.name || stundeLabel(i)) + ' löschen? ' + belegt + (belegt === 1 ? ' Platzierung in dieser Stunde wird' : ' Platzierungen in dieser Stunde werden') + ' verworfen.' + (mitschieben() && i < st.length - 1 ? ' Die folgenden Zeilen rücken nach.' : ''), 'Löschen', 'gefahr'))) return;
  const zname = x.name || stundeLabel(i);
  const map = st.map((_, j) => j < i ? j : j === i ? -1 : j - 1);
  undoToastNach(() => rasterAendern('Zeile gelöscht', ss => {
    const b = minVon(ss[i].beginn), nb = ss[i + 1] ? minVon(ss[i + 1].beginn) : null;
    if (i > 0 && ss[i].pauseName) ss[i - 1].pauseName = ss[i].pauseName;
    ss.splice(i, 1);
    if (mitschieben() && b !== null && nb !== null) zeitenVerschieben(ss, i, b - nb);
    rasterAbleiten(ss);
  }, map), 'Zeitraster: Zeile „' + zname + '“ gelöscht.');
}
// Tastatur im Zeitraster: Enter = gleiche Spalte eine Zeile tiefer (Umschalt+Enter = höher), Strg+Enter = neue Zeile darunter
function zrTaste(ev) {
  if (ev.key !== 'Enter') return;
  const [iTxt, feld] = (ev.target.dataset.zr || '').split(':');
  const i = Number(iTxt);
  ev.preventDefault();
  if (ev.ctrlKey || ev.metaKey) { ev.target.blur(); zeileEinfuegen(i, true); return; }
  const richtung = ev.shiftKey ? -1 : 1;
  ev.target.blur();
  setTimeout(() => {
    const alle = [...document.querySelectorAll('[data-zr$=":' + feld + '"]')].map(el => ({ el, i: Number(el.dataset.zr.split(':')[0]) }))
      .filter(x => richtung > 0 ? x.i > i : x.i < i).sort((a, b) => richtung * (a.i - b.i));
    if (alle[0]) { alle[0].el.focus(); try { alle[0].el.select(); } catch (e) { /* ohne Auswahl */ } }
  }, 0);
}
function schlussSetzen(t, v) {
  aendern('Unterrichtsschluss ' + TAGE_LANG[t] + (v ? ': bis zur ' + v + '. Stunde' : ': alle Stunden'), dd => { if (v) dd.schule.tagSchluss[t] = Number(v); else delete dd.schule.tagSchluss[t]; }, { normalisieren: true });
  const d = APP.daten, dIdx = d.schule.tage.indexOf(t), grenze = d.schule.tagSchluss[t];
  if (grenze && d.plan.platzierungen.length) {
    const n = d.plan.platzierungen.filter(p => p.tag === dIdx && [...Array(p.dauer).keys()].some(k => { const st = d.schule.stunden[p.stunde - 1 + k]; return st && !st.istPause && Number(stundeLabel(p.stunde - 1 + k).replace('.', '')) > grenze; })).length;
    if (n) banner({ id: 'schluss', art: 'warn', text: (n === 1 ? '1 Block liegt' : n + ' Blöcke liegen') + ' nach dem neuen Unterrichtsschluss. Bitte neu berechnen oder im Plan-Editor verschieben.', aktion: { text: 'Im Editor ansehen', tun: () => gehe('editor') }, gueltig: () => APP.daten.plan.platzierungen.length > 0 });
  }
}
SEITEN_RENDER.schule = () => {
  const d = APP.daten, s = d.schule;
  const st = s.stunden;
  const zeitFeld = (i, feld, wert, fehler, titel) => h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', class: 'zeitfeld' + (fehler ? ' fehler' : ''), style: { width: '78px' }, value: wert, placeholder: 'hh:mm', 'aria-label': feld === 'beginn' ? 'Beginn' : 'Ende', title: titel || 'z. B. 7:30, 0730 oder 7.30 – Enter springt eine Zeile tiefer', 'data-zr': i + ':' + feld, onchange: ev => zeitEingabe(i, feld, ev.target.value), onkeydown: zrTaste });
  const zeilen = [];
  st.forEach((x, i) => {
    const b = minVon(x.beginn), e = minVon(x.ende);
    const vorEnde = i > 0 ? minVon(st[i - 1].ende) : null;
    const ueberlappt = b !== null && vorEnde !== null && b < vorEnde;
    const verkehrt = b !== null && e !== null && e <= b;
    zeilen.push(h('tr', { 'data-id': 'st' + i, class: x.istPause ? 'pausenzeile' : '' },
      h('td', {}, h('b', {}, x.istPause ? 'Pause' : stundeLabel(i) + ' Stunde')),
      h('td', {}, zeitFeld(i, 'beginn', x.beginn, ueberlappt || verkehrt, ueberlappt ? 'Beginnt vor dem Ende der vorigen Zeile (' + st[i - 1].ende + ')' : verkehrt ? 'Das Ende liegt nicht nach dem Beginn' : '')),
      h('td', {}, zeitFeld(i, 'ende', x.ende, verkehrt, verkehrt ? 'Das Ende liegt nicht nach dem Beginn' : '')),
      h('td', {}, h('span', { class: 'zeile eng nowrap' }, h('input', { type: 'number', min: 5, max: 600, value: x.dauer, 'aria-label': 'Dauer in Minuten', title: 'Dauer ändern setzt das Ende neu', 'data-zr': i + ':dauer', style: { width: '64px' }, onchange: ev => dauerEingabe(i, ev.target.value), onkeydown: zrTaste }), ' min')),
      h('td', {}, h('input', { type: 'text', value: x.name, maxlength: 40, placeholder: x.istPause ? 'z. B. Mittagspause' : 'optional', 'aria-label': 'Bezeichnung', 'data-zr': i + ':name', style: { width: '150px' }, onchange: ev => rasterText(i, 'name', ev.target.value.trim(), 'Bezeichnung geändert'), onkeydown: zrTaste })),
      h('td', {}, h('label', { class: 'check', title: 'Die Zeile ist eine Pause (z. B. Mittagspause) – dort findet kein Unterricht statt.' }, h('input', { type: 'checkbox', checked: x.istPause, onchange: ev => aendern(ev.target.checked ? 'Zeile ist Pause' : 'Zeile ist Unterrichtsstunde', dd => { dd.schule.stunden[i].istPause = ev.target.checked; if (ev.target.checked) dd.schule.stunden[i].doppelMitNaechster = false; }) }), 'Pause')),
      h('td', {}, h('label', { class: 'check', title: 'Ein Doppelblock darf in dieser Stunde beginnen (nicht vor einer großen Pause).' }, h('input', { type: 'checkbox', checked: x.doppelMitNaechster, disabled: x.istPause || i === st.length - 1, onchange: ev => aendern('Doppelstundenstelle geändert', dd => { dd.schule.stunden[i].doppelMitNaechster = ev.target.checked; }) }), 'Doppelstunde darf beginnen')),
      h('td', { class: 'aktion' },
        h('button', { class: 'btn klein', tabindex: -1, title: 'Neue Zeile darunter einfügen (Tastatur: Strg+Enter)', onclick: () => zeileEinfuegen(i, true) }, '+ darunter'),
        h('button', { class: 'btn icon klein gefahr', tabindex: -1, title: 'Zeile löschen', 'aria-label': 'Zeile löschen', disabled: st.length <= 1, onclick: () => rasterZeileLoeschen(i) }, icon('papierkorb')))));
    // Lücke zur nächsten Stunde: ab 10 Minuten eine Pause (z. B. große Pause) – nur Anzeige und Name
    const n = st[i + 1];
    if (n && !x.istPause && !n.istPause && x.pauseDanach >= 10) zeilen.push(h('tr', { class: 'luecke', 'data-id': 'lu' + i },
      h('td', {}, h('span', { class: 'lueckemarke' }, '⋯ Pause')),
      h('td', { colspan: 3, class: 'klein muted' }, x.ende + ' – ' + n.beginn + ' · ' + x.pauseDanach + ' min'),
      h('td', {}, h('input', { type: 'text', value: x.pauseName, maxlength: 40, placeholder: 'z. B. Große Pause', 'aria-label': 'Name der Pause', 'data-zr': i + ':pauseName', style: { width: '150px' }, title: 'Name dieser Pause – erscheint bei den Aufsichten', onchange: ev => rasterText(i, 'pauseName', ev.target.value.trim(), 'Pause benannt'), onkeydown: zrTaste })),
      h('td', { colspan: 3, class: 'klein muted' }, 'Lücke zwischen zwei Stunden – zählt als Pause für die Aufsichten.')));
  });
  const haeufig = (() => { const z = new Map(); st.filter(x => !x.istPause).forEach(x => z.set(x.dauer, (z.get(x.dauer) || 0) + 1)); let best = 45, n = 0; z.forEach((c, v) => { if (c > n) { n = c; best = v; } }); return best; })();
  const einheitlich = h('input', { type: 'number', min: 10, max: 180, value: haeufig, 'aria-label': 'Einheitliche Stundendauer' });
  const teile = [
    seitenkopf('Schule & Zeiten', 'Kopfdaten für Druck und Export, Unterrichtstage und Unterrichtsschluss, das Zeitraster mit Stunden und Pausen sowie Zeitprofile mit eigenen Uhrzeiten für einzelne Klassen oder Fächer.', h('button', { class: 'btn', onclick: beispielLaden }, 'Beispieldaten laden')),
    h('div', { class: 'karte' },
      h('div', { class: 'zeile', style: { gap: '16px' } },
        h('label', { class: 'feld' }, 'Schulname', h('input', { type: 'text', value: s.name, style: { width: '280px' }, onchange: ev => aendern('Schulname', dd => { dd.schule.name = ev.target.value; }, { render: false }) })),
        h('label', { class: 'feld' }, 'Schuljahr', h('input', { type: 'text', value: s.schuljahr, style: { width: '110px' }, onchange: ev => aendern('Schuljahr', dd => { dd.schule.schuljahr = ev.target.value; }, { render: false }) })),
        h('label', { class: 'feld' }, h('span', {}, 'Wochenrhythmus', hilfe('A/B: Unterrichte oder einzelne Blöcke können in Woche A oder B liegen. Bei Doppelstundenpflicht und ungerader Stundenzahl liegt die übrige Doppelstunde immer im Wechsel (Woche A bzw. B) – auch ohne diese Einstellung.')), sel([['einfach', 'einfach (jede Woche gleich)'], ['AB', 'A/B (14-tägig wechselnd)']], s.wochenrhythmus, v => aendern('Wochenrhythmus', dd => { dd.schule.wochenrhythmus = v; })))),
      h('h3', {}, 'Unterrichtstage'),
      h('div', { class: 'zeile', style: { gap: '14px' } }, TAGE_ALLE.map(t => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.tage.includes(t), onchange: ev => { const neu = ev.target.checked ? s.tage.concat([t]) : s.tage.filter(x => x !== t); if (!neu.length) { toast('Mindestens ein Unterrichtstag ist nötig.', 'err'); render(); return; } tageSetzen(neu); } }), TAGE_LANG[t]))),
      h('h3', {}, 'Unterrichtsschluss je Wochentag', hilfe('Letzte Stunde, in der an diesem Tag Unterricht stattfinden darf – für alle Klassen, z. B. freitags nur bis zur 4. Stunde. Gilt als Pflichtregel für Unterricht; im Plan-Editor sind die Stunden danach für Unterricht gesperrt. Aufgaben dürfen auch danach liegen.')),
      h('div', { class: 'zeile', style: { gap: '14px', alignItems: 'flex-end' } }, s.tage.map(t => h('label', { class: 'feld' }, TAGE_LANG[t],
        sel([['', 'alle Stunden (bis ' + nlektionen() + '.)']].concat(Array.from({ length: Math.max(0, nlektionen() - 1) }, (_, i) => [String(i + 1), 'bis zur ' + (i + 1) + '. Stunde'])), String(s.tagSchluss[t] || ''), v => schlussSetzen(t, v), { 'aria-label': 'Unterrichtsschluss ' + TAGE_LANG[t] }))))),
    h('div', { class: 'karte' },
      h('div', { class: 'zeile' }, h('h3', { style: { margin: 0 } }, 'Zeitraster'), h('span', { class: 'muted klein' }, nlektionen() + ' UStd. je Tag'), h('div', { class: 'rechts' }),
        h('span', { class: 'muted klein' }, 'Vorlage:'),
        h('button', { class: 'btn klein', onclick: () => rasterVorlage('45') }, '45-Minuten-Raster mit Pausen'),
        h('button', { class: 'btn klein', onclick: () => rasterVorlage('60') }, '60-Minuten-Raster'),
        h('button', { class: 'btn klein', onclick: () => rasterVorlage('90') }, 'Doppelstunden-Raster (90 Minuten)')),
      h('p', { class: 'muted klein' }, 'Uhrzeiten einfach tippen: 7:30, 0730 oder 7.30. Tab springt zum nächsten Feld, Enter in dieselbe Spalte der nächsten Zeile, Strg+Enter fügt eine Zeile darunter ein. Die Dauer ergibt sich aus Beginn und Ende; ein leerer Beginn wird mit dem Ende der vorigen Zeile gefüllt. Pausen entstehen aus der Lücke zwischen zwei Stunden (ab 10 Minuten, z. B. große Pause) oder als eigene Zeile mit Haken „Pause“ (z. B. Mittagspause).'),
      h('div', { class: 'zeile', style: { margin: '6px 0 10px' } },
        h('label', { class: 'check', title: 'Ändert sich Beginn, Ende oder Dauer einer Zeile, rücken alle späteren Zeilen um dieselbe Differenz – Stundenlängen und Pausen bleiben erhalten.' }, h('input', { type: 'checkbox', checked: mitschieben(), onchange: ev => { APP.meta.zeitenMitschieben = ev.target.checked; metaSpeichern(); render(); } }), h('b', {}, 'Folgende Zeiten mitverschieben')),
        h('div', { class: 'rechts' }),
        h('span', { class: 'klein' }, 'Stundendauer für alle Unterrichtsstunden:'), einheitlich, h('span', { class: 'klein' }, 'min'),
        h('button', { class: 'btn klein', onclick: () => { const v = Number(einheitlich.value) || 45; aendern('Stundendauer ' + v + ' min', dd => { const ss = dd.schule.stunden; rasterAbleiten(ss); ss.forEach(x => { if (!x.istPause) x.dauer = v; }); const z = zeitenFortlaufend(ss); ss.forEach((x, i) => { x.beginn = z[i].beginn; x.ende = z[i].ende; }); rasterAbleiten(ss); }); } }, 'Übernehmen')),
      h('div', { class: 'tabwrap' }, h('table', { class: 'tab zeitraster' }, h('thead', {}, h('tr', {}, ['Stunde', 'Beginn', 'Ende', 'Dauer', 'Bezeichnung', 'Pause', 'Doppelstunde', ''].map(t => h('th', {}, t)))), h('tbody', {}, zeilen))),
      (() => { const sl = stundenLaengen(s); return sl.abw.length ? h('div', { class: 'hinweis warn', id: 'stundenlaengeHinweis', style: { marginTop: '10px' } },
        h('b', {}, 'Die Unterrichtsstunden sind unterschiedlich lang: '), 'meist ' + sl.haeufig + ' min, aber ' + sl.text + '. ',
        'Für Umrechnungen – z. B. Aufgaben in Zeitstunden oder die Arbeitszeit noch nicht platzierter Stunden – rechnet das Programm mit dem Durchschnitt: ' + zahlDe(sl.mittel, 1) + ' min statt ' + sl.haeufig + ' min. Ist das nicht gewollt, das Ende der Stunde korrigieren oder oben die Stundendauer für alle einheitlich setzen.') : null; })()),
    zeitprofileKarte()
  ];
  const tabs = [['allgemein', 'Allgemein'], ['raster', 'Zeitraster & Pausen'], ['profile', 'Zeitprofile', s.zeitprofile.length ? h('span', { class: 'badge neutral' }, s.zeitprofile.length) : null]];
  const aktiv = reiterAktiv('schule', tabs);
  return [teile[0], reiterLeiste('schule', tabs), h('div', { class: 'reiterinhalt' }, aktiv === 'raster' ? teile[2] : aktiv === 'profile' ? teile[3] : [teile[1],
    h('div', { class: 'karte' }, h('h3', { style: { marginTop: 0 } }, 'Wo steht was?'),
      h('div', { class: 'zeile', style: { gap: '8px' } },
        h('button', { class: 'btn klein', onclick: () => gehe('schule', { reiter: 'raster' }) }, 'Zeitraster & Pausen →'), h('button', { class: 'btn klein', onclick: () => gehe('schule', { reiter: 'profile' }) }, 'Zeitprofile für Klassen und Fächer →'),
        h('button', { class: 'btn klein', onclick: () => gehe('arbeitszeit') }, 'Arbeitszeit & Deputat →'), h('button', { class: 'btn klein', onclick: () => gehe('aufsicht') }, 'Aufsichten →')))])];
};

