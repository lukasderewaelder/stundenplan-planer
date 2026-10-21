/* =====================================================================
   6. IMPORT/EXPORT, DRUCK, STÄNDE, START
   ===================================================================== */
function isoDatum() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function slug(s) { return (s || 'schule').replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase() || 'schule'; }
function herunterladen(text, name, typ) {
  const blob = new Blob([text], { type: (typ || 'text/plain') + ';charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
async function inZwischenablage(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = h('textarea', { style: { position: 'fixed', left: '-9999px' } }, text); document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove(); return ok;
  }
}

/* ---------------- JSON-Export und -Import ---------------- */
function exportText(anonym) {
  const daten = normalisiere(JSON.parse(JSON.stringify(APP.daten)));
  if (anonym) {
    daten.lehrer.forEach(l => { l.name = l.kuerzel; });
    // Freitext kann Namen enthalten
    daten.dienste.plan.forEach(x => { x.notiz = ''; }); daten.dienste.bedarfe.forEach(b => { b.notiz = ''; });
  }
  return JSON.stringify(daten, null, 2);
}
function exportJson(anonym) {
  herunterladen(exportText(anonym), 'stundenplan_' + slug(APP.daten.schule.name) + '_' + isoDatum() + (anonym ? '_anonym' : '') + '.json', 'application/json');
  if (!anonym) { APP.meta.letzterExport = Date.now(); metaSpeichern(); kopfAktualisieren(); }
  toast('Export erstellt.', 'ok');
}
function importPruefen(roh) {
  const f = [];
  const F = (ort, grund) => f.push({ ort, grund });
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) { F('Datei', 'kein JSON-Objekt'); return f; }
  if (roh.schemaVersion === undefined) F('schemaVersion', 'fehlt – wird als Version 0 behandelt');
  const listen = ['faecher', 'raeume', 'klassen', 'lehrer', 'unterrichte'];
  const ids = {};
  listen.forEach(k => {
    if (roh[k] !== undefined && !Array.isArray(roh[k])) F(k, 'ist keine Liste');
    ids[k] = new Set();
    (Array.isArray(roh[k]) ? roh[k] : []).forEach((o, i) => {
      if (!o || typeof o !== 'object') { F(k + '[' + i + ']', 'kein Objekt'); return; }
      if (!o.id) F(k + '[' + i + ']', 'ohne id – bekommt eine neue');
      else if (ids[k].has(o.id)) F(k + '[' + i + '] ' + o.id, 'id doppelt');
      ids[k].add(o.id);
    });
  });
  if (!roh.schule || !Array.isArray(roh.schule.stunden)) F('schule.stunden', 'fehlt – Standard-Zeitraster wird verwendet');
  const gruppen = new Set(); (roh.klassen || []).forEach(k => (k && k.gruppen || []).forEach(g => g && gruppen.add(g.id)));
  const zahl = (ort, v, a, b) => { if (v !== undefined && (typeof v !== 'number' || v < a || v > b)) F(ort, 'Wert ' + JSON.stringify(v) + ' außerhalb ' + a + '–' + b); };
  (roh.faecher || []).forEach((x, i) => { if (!x) return; zahl('faecher[' + i + '].maxProTag', x.maxProTag, 1, 20); });
  (roh.raeume || []).forEach((x, i) => { if (!x) return; zahl('raeume[' + i + '].kapazitaet', x.kapazitaet, 0, 9999); zahl('raeume[' + i + '].teilbar', x.teilbar, 1, 9); });
  (roh.klassen || []).forEach((x, i) => { if (!x) return; if (x.heimatraum && !ids.raeume.has(x.heimatraum)) F('klassen[' + i + '].heimatraum', 'unbekannter Raum ' + x.heimatraum); zahl('klassen[' + i + '].schueler', x.schueler, 0, 999); Object.keys(x.teilung || {}).forEach(fid => { if (!ids.faecher.has(fid)) F('klassen[' + i + '].teilung', 'unbekanntes Fach ' + fid); }); Object.keys(x.stundentafel || {}).forEach(fid => { if (!ids.faecher.has(fid)) F('klassen[' + i + '].stundentafel', 'unbekanntes Fach ' + fid); });  Object.keys(x.maxProTag && typeof x.maxProTag === 'object' ? x.maxProTag : {}).forEach(fid => { zahl('klassen[' + i + '].maxProTag.' + fid, x.maxProTag[fid], 1, 20); }); });
  (roh.lehrer || []).forEach((x, i) => {
    if (!x) return;
    (x.faecher || []).forEach(fid => { if (!ids.faecher.has(fid)) F('lehrer[' + i + '].faecher', 'unbekanntes Fach ' + fid); });
    (x.coFaecher || []).forEach(fid => { if (!ids.faecher.has(fid)) F('lehrer[' + i + '].coFaecher', 'unbekanntes Fach ' + fid); });
    if (x.klassenleitung && !ids.klassen.has(x.klassenleitung)) F('lehrer[' + i + '].klassenleitung', 'unbekannte Klasse ' + x.klassenleitung);
    if (x.deputat !== null && x.deputat !== undefined) zahl('lehrer[' + i + '].deputat', x.deputat, 0, 99);
    zahl('lehrer[' + i + '].maxArbeitTag', x.maxArbeitTag, 0, 24);
    (x.pausenGesperrt || []).forEach(k => { if (!/^\d+\|n\d+$/.test(String(k))) F('lehrer[' + i + '].pausenGesperrt', 'unbekannte Angabe ' + JSON.stringify(k)); });
    zahl('lehrer[' + i + '].arbeitszeit', x.arbeitszeit, 0, 80);
    (x.verfuegbarkeit || []).forEach((row, d) => (row || []).forEach((v, hh) => { if (![0, 1, 2, -1].includes(v)) F('lehrer[' + i + '].verfuegbarkeit[' + d + '][' + hh + ']', 'Wert ' + v + ' ist nicht 0, 1, 2 oder -1'); }));
  });
  (roh.unterrichte || []).forEach((x, i) => {
    if (!x) return;
    const o = 'unterrichte[' + i + ']' + (x.id ? ' ' + x.id : '');
    if (!x.aufgabe && !ids.faecher.has(x.fach)) F(o + '.fach', 'unbekanntes Fach ' + x.fach);
    (x.klassen || []).forEach(k => { if (!ids.klassen.has(k)) F(o + '.klassen', 'unbekannte Klasse ' + k); });
    (x.gruppen || []).forEach(g => { if (!gruppen.has(g)) F(o + '.gruppen', 'unbekannte Gruppe ' + g); });
    (x.lehrkraefte || []).forEach(z => { if (!z || !ids.lehrer.has(z.lehrer)) F(o + '.lehrkraefte', 'unbekannte Lehrkraft ' + (z && z.lehrer)); });
    zahl(o + '.wochenstunden', x.wochenstunden, 0, 60);
  });
  (roh.klassen || []).forEach((x, i) => { if (!x) return; (x.team || []).forEach(t => { if (!ids.lehrer.has(t)) F('klassen[' + i + '].team', 'unbekannte Lehrkraft ' + t); }); });
  // Zeitprofile und Aufsichten
  const zp = new Set(((roh.schule && roh.schule.zeitprofile) || []).map(z => z && z.id));
  (roh.klassen || []).forEach((x, i) => { if (x && x.zeitprofil && !zp.has(x.zeitprofil)) F('klassen[' + i + '].zeitprofil', 'unbekanntes Zeitprofil ' + x.zeitprofil + ' – wird entfernt'); });
  ((roh.schule && roh.schule.zeitprofile) || []).forEach((z, i) => ((z && z.bloecke) || []).forEach((b, j) => { if (b && (!zeitNorm(b.beginn) || !zeitNorm(b.ende))) F('schule.zeitprofile[' + i + '].bloecke[' + j + ']', 'Beginn oder Ende fehlt/ungültig'); }));
  if (roh.dienste && typeof roh.dienste === 'object') {
    const DI = roh.dienste;
    const be = new Set((DI.bereiche || []).map(b => b && b.id));
    (DI.plan || []).forEach((x, i) => {
      if (!x) return;
      const o = 'dienste.plan[' + i + ']';
      if (!ids.lehrer.has(x.lehrer)) F(o, 'unbekannte Person ' + x.lehrer);
      if (x.bereich && !be.has(x.bereich)) F(o, 'unbekannter Bereich ' + x.bereich);
      if (!zeitNorm(x.beginn) || !zeitNorm(x.ende)) F(o, 'Beginn oder Ende fehlt/ungültig');
      (((x.rhythmus || {}).personen) || []).forEach(pid => { if (!ids.lehrer.has(pid)) F(o + '.rhythmus.personen', 'unbekannte Person ' + pid); });
    });
    (DI.bedarfe || []).forEach((b, i) => { if (!b) return; if (b.bereich && !be.has(b.bereich)) F('dienste.bedarfe[' + i + ']', 'unbekannter Bereich ' + b.bereich); (b.abschnitte || []).forEach((a, j) => { if (a) { zahl('dienste.bedarfe[' + i + '].abschnitte[' + j + '].min', a.min, 0, 50); zahl('dienste.bedarfe[' + i + '].abschnitte[' + j + '].soll', a.soll, 0, 50); } }); });
  }
  const nH = roh.schule && Array.isArray(roh.schule.stunden) ? roh.schule.stunden.length : 99;
  const nD = roh.schule && Array.isArray(roh.schule.tage) ? roh.schule.tage.length : 6;
  ((roh.plan && roh.plan.platzierungen) || []).forEach((p, i) => { if (!p) return; if (!ids.unterrichte.has(p.unterricht)) F('plan.platzierungen[' + i + ']', 'unbekannter Unterricht ' + p.unterricht); if (p.tag < 0 || p.tag >= nD || p.stunde < 1 || p.stunde > nH) F('plan.platzierungen[' + i + ']', 'Slot außerhalb des Zeitrasters'); });
  return f;
}
function importDialog() {
  const input = h('input', { type: 'file', accept: '.json,application/json' });
  input.addEventListener('change', async () => { const f = input.files[0]; if (!f) return; importText(await f.text(), f.name); });
  input.click();
}
async function importText(text, name) {
  let roh;
  try { roh = JSON.parse(text); } catch (e) { toast('Keine gültige JSON-Datei: ' + e.message, 'err', 8000); return false; }
  let daten;
  try { daten = datenstandLaden(roh); } catch (e) { await dialog({ titel: 'Import abgebrochen', inhalt: h('p', {}, e.message) }); return false; }
  const fehler = importPruefen(roh);
  const hatDaten = APP.daten.klassen.length || APP.daten.lehrer.length || APP.daten.unterrichte.length || APP.daten.faecher.length;
  const knoepfe = [{ text: 'Abbrechen', wert: null }];
  if (hatDaten) knoepfe.push({ text: 'Zusammenführen', wert: 'zusammen' });
  knoepfe.push({ text: hatDaten ? 'Ersetzen' : 'Laden', wert: 'ersetzen', art: 'primaer' });
  const w = await dialog({
    titel: 'Import: ' + name, breite: '720px',
    inhalt: h('div', {},
      h('p', {}, 'Die Datei enthält ' + daten.klassen.length + ' Klassen, ' + daten.lehrer.length + ' Lehrkräfte, ' + daten.raeume.length + ' Räume, ' + daten.unterrichte.length + ' Unterrichte und ' + daten.plan.platzierungen.length + ' Platzierungen.'),
      fehler.length ? h('div', {}, h('div', { class: 'hinweis warn' }, fehler.length + ' Auffälligkeiten gefunden (Ort und Grund):'), h('ul', { class: 'vliste', style: { maxHeight: '240px' } }, fehler.slice(0, 200).map(x => h('li', {}, h('span', { class: 'sym w' }, '!'), h('span', { class: 'mono' }, x.ort), h('span', {}, x.grund))))) : h('div', { class: 'hinweis ok' }, '✓ Pflichtfelder, Verweise und Zahlenbereiche sind in Ordnung.'),
      hatDaten ? h('p', {}, h('b', {}, 'Ersetzen'), ' verwirft den aktuellen Datenstand. ', h('b', {}, 'Zusammenführen'), ' übernimmt Objekte mit neuer ID und überschreibt Objekte mit gleicher ID; Schule, Regeln, Aufsichten bleiben.') : null),
    knoepfe
  });
  if (!w) return false;
  APP.speicherGesperrt = false;
  if (w === 'ersetzen') {
    APP.banner = []; APP.rechnung.ergebnis = null;
    aendern('Import „' + name + '“ (ersetzt)', d => { Object.keys(d).forEach(k => { delete d[k]; }); Object.assign(d, daten); }, { ohneDienste: true, ohneAufsicht: true });
  } else {
    aendern('Import „' + name + '“ (zusammengeführt)', d => {
      ['faecher', 'raeume', 'klassen', 'lehrer', 'unterrichte'].forEach(k => daten[k].forEach(o => { const i = d[k].findIndex(x => x.id === o.id); if (i >= 0) d[k][i] = o; else d[k].push(o); }));
      Object.entries(daten.stundentafelVorlagen).forEach(([jg, t]) => { d.stundentafelVorlagen[jg] = t; });
      // Zeitprofile, auf die übernommene Klassen oder Fächer verweisen, kommen mit (vorhandene Profile bleiben unverändert)
      (daten.schule.zeitprofile || []).forEach(z => { if (!d.schule.zeitprofile.some(y => y.id === z.id)) d.schule.zeitprofile.push(z); });
      // übernommene Stunden-Vorgaben sollen nicht unsichtbar bleiben
      if (daten.schule.arbeitszeitModell.stundenSoll && daten.lehrer.some(l => l.deputat !== null && l.deputat !== undefined)) d.schule.arbeitszeitModell.stundenSoll = true;
      const us = new Set(daten.unterrichte.map(u => u.id));
      d.plan.platzierungen = d.plan.platzierungen.filter(p => !us.has(p.unterricht)).concat(daten.plan.platzierungen);
      d.plan.frei = (d.plan.frei || []).filter(p => !us.has(p.unterricht)).concat(daten.plan.frei || []);
      d.plan.besetzung = (d.plan.besetzung || []).filter(p => !us.has(p.unterricht)).concat(daten.plan.besetzung || []);
    }, { normalisieren: true });
  }
  toast('Import abgeschlossen.', 'ok');
  if (w === 'ersetzen') gehe('start');
  return true;
}

/* ---------------- CSV, Zwischenablage, HTML-Export ---------------- */
function csvZelle(v) { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function planCsv() {
  const d = APP.daten;
  const zeilen = [['Klasse', 'Gruppe', 'Tag', 'Stunde', 'Beginn', 'Ende', 'Fach', 'Fachlehrkraft', 'Co-Lehrkraft', 'Raum']];
  const sortiert = d.plan.platzierungen.slice().sort((a, b) => a.tag - b.tag || a.stunde - b.stunde);
  const zc = zeitCache(d); // echte Zeiten nach Zeitprofil (Klasse oder Fach)
  const ohneL = freiMap(d), handB = besetzungMap(d);
  sortiert.forEach(p => {
    const u = findeId(d.unterrichte, p.unterricht); if (!u) return;
    const f = u.aufgabe ? { kuerzel: u.name } : (fachVon(u.fach) || {});
    const oL = ohneL.get(u.id + '|' + p.blockNr);
    const fl = u.aufgabe ? u.lehrkraefte.filter(z => z.rolle === 'fach').map(z => (lehrerVon(z.lehrer) || {}).kuerzel).join('/') : (blockFachLehrer(u, p.blockNr, ohneL, handB).map(id => (lehrerVon(id) || {}).kuerzel).join('/') || 'N. N.');
    const co = u.lehrkraefte.filter(z => z.rolle === 'co' && (z.modus !== 'anteilig' || p.co.includes(z.lehrer)) && !(oL && oL.has(z.lehrer))).map(z => (lehrerVon(z.lehrer) || {}).kuerzel).join('/');
    const raum = p.raum ? (raumVon(p.raum) || {}).name : '';
    for (let k = 0; k < p.dauer; k++) {
      const st = d.schule.stunden[p.stunde - 1 + k] || {};
      if (u.aufgabe) zeilen.push(['(Aufgabe)', '', d.schule.tage[p.tag], stundeLabel(p.stunde - 1 + k).replace('.', ''), st.beginn, st.ende, f.kuerzel, fl, '', raum]);
      u.klassen.forEach(kid => {
        const kl = klasseVon(kid) || {};
        const gr = u.gruppen.map(g => ((kl.gruppen || []).find(x => x.id === g) || {}).name).filter(Boolean).join('/');
        const zt = zc(zc.pidK(u, kid))[p.stunde - 1 + k];
        zeilen.push([kl.name, gr, d.schule.tage[p.tag], stundeLabel(p.stunde - 1 + k).replace('.', ''), zt ? zeitText(zt.start) : st.beginn, zt ? zeitText(zt.end) : st.ende, f.kuerzel, fl, co, raum]);
      });
    }
  });
  // Aufgaben mit festen Terminen (Uhrzeit oder Pause)
  const pl = pausenListe(d.schule, d.klassen);
  d.unterrichte.forEach(u => aufgabeTermine(d, u, pl).forEach(t => zeilen.push(['(Aufgabe)', '', d.schule.tage[t.tag], t.pause ? t.pause.kurz : 'Termin', zeitText(t.start), zeitText(t.end), u.name, u.lehrkraefte.map(z => (lehrerVon(z.lehrer) || {}).kuerzel).join('/'), '', ''])));
  // Aufsichten und Dienste (Druckoption „Aufsichten bei Lehrkräften mitdrucken“): Klasse leer, Stunde „(Aufsicht)“, Fach = Bezeichnung, Raum = Bereich
  if (druckOpt().aufsichten !== false) lehrerAlphabetisch(d.lehrer).forEach(l => aufsichtenLehrerZeilen(d, l.id).forEach(z => zeilen.push(['', '', d.schule.tage[z.x.tag], '(Aufsicht)', z.x.beginn, z.x.ende, z.titel, l.kuerzel || l.name || '', '', z.bereich])));
  return '﻿' + zeilen.map(z => z.map(csvZelle).join(';')).join('\r\n');
}
function planTsv(art, id) {
  const d = APP.daten, S = d.schule, gruppenAn = druckOpt().gruppen !== false;
  const eintr = eintraegeFuer(d, d.plan.platzierungen, art, id);
  const zeilen = [['Stunde'].concat(S.tage.map(t => TAGE_LANG[t]))];
  S.stunden.forEach((st, hh) => {
    if (st.istPause) return;
    const z = [stundeLabel(hh) + ' ' + st.beginn + '–' + st.ende];
    S.tage.forEach((t, dd) => { z.push(eintr.filter(e => e.p.tag === dd && hh >= e.p.stunde - 1 && hh < e.p.stunde - 1 + e.p.dauer).map(e => { const x = eintragText(d, e, art, { gruppen: gruppenAn }); return [x.titel + (x.gruppe ? ' · ' + x.gruppe : ''), x.zeile, x.raum].filter(Boolean).join(' '); }).join(' | ')); });
    zeilen.push(z);
  });
  return zeilen.map(z => z.join('\t')).join('\n');
}
function htmlExport() {
  const d = APP.daten, dro = druckOpt(), po = { gruppen: dro.gruppen !== false };
  const plaene = [];
  d.klassen.forEach(k => plaene.push({ id: 'k_' + k.id, name: 'Klasse ' + k.name, html: statischerPlan(d, d.plan.platzierungen, 'klasse', k.id, po).outerHTML }));
  d.lehrer.forEach(l => { const az = dro.aufsichten !== false ? aufsichtenBlockLehrer(d, l.id, { farbe: true }) : null, tz = terminZeile(d, l.id); plaene.push({ id: 'l_' + l.id, name: 'Lehrkraft ' + (l.kuerzel || '') + ' – ' + (l.name || ''), html: statischerPlan(d, d.plan.platzierungen, 'lehrer', l.id, po).outerHTML + (tz ? tz.outerHTML : '') + (az ? az.outerHTML : '') }); });
  const at = d.dienste && d.dienste.plan.length ? dienstDruckSeite('dienstWoche', '', 'Aufsichtsplan', 0, 1) : null;
  if (at) plaene.push({ id: 'aufsicht', name: 'Aufsichtsplan', html: at.innerHTML });
  if ((d.gta || []).length) plaene.push({ id: 'gta', name: 'GTA-Plan (Ganztagsangebote)', html: h('div', {}, gtaPlanInhalt(d, true)).innerHTML });
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // Gesamtplan je Tag (alle Personen × Uhrzeit) – dieselben Tabellen wie im Druck
  if (d.lehrer.length) d.schule.tage.forEach((t, tag) => {
    const liste = gpDruckListe(Object.assign({}, dro, { auswahl: String(tag) }));
    plaene.push({ id: 'gesamt_' + tag, name: 'Gesamtplan ' + TAGE_LANG[t], html: liste.map(([, id, titel], i) => { const s = gesamtplanSeite(id, titel, i, liste.length, dro, true), r = s.querySelector('.gp-rahmen'), lg = s.querySelector('.gp-legende'); return (liste.length > 1 ? '<h3>' + esc(titel) + '</h3>' : '') + (r ? r.outerHTML : '<p>Keine Einsätze an diesem Tag.</p>') + (lg ? lg.outerHTML : ''); }).join('') });
  });
  const css = gpCssText() + 'body{font:14px system-ui,sans-serif;margin:20px;color:#1c2230}h1{font-size:20px}select{font:inherit;padding:4px}table.druckplan{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:12px}table.druckplan th,table.druckplan td{border:1px solid #999;padding:3px 5px;vertical-align:top}table.druckplan th{background:#eee}td.pause{background:#eee;text-align:center;font-size:12px;color:#555}tr.pz td{font-size:11px;padding:1px 4px;height:16px}tr.pz td.pname{text-align:left}tr.pz .pzt{display:block;font-size:10px;white-space:nowrap}tr.pz td.hat{background:#fff3cf;color:#000;font-weight:600}td.zeit{width:90px;font-size:12px}.de{border-radius:3px;padding:2px 4px;margin-bottom:2px}td.mehr{height:1px;padding:2px}td.mehr>.neben{display:flex;gap:3px;height:100%}table.gtaplan td{vertical-align:top}.gta-dz{border-left:4px solid #2f8f6b;padding:2px 6px;margin:2px 0;background:#f2f8f5}.gtazeile{margin-top:6px;font-size:13px}td.mehr>.neben>.de{flex:1 1 0;min-width:min-content;margin:0;overflow-wrap:break-word;-webkit-hyphens:auto;hyphens:auto}td.mehr.n4>.neben>.de{min-width:0;overflow-wrap:anywhere}td.mehr.n3 .de{font-size:12px}td.mehr.n3 .de .x{font-size:11px}.de .x{font-size:12px}.de .gr{font-weight:400;white-space:nowrap}.plan{display:none}.plan.an{display:block}.aufsichtzeile{margin-top:8px;font-size:13px}.aufsblock{margin-top:12px;font-size:13px}.aufsblock .ab-kopf{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline;margin-bottom:4px}.aufsblock .ab-summe{color:#555;font-size:12px}.aufsblock .ab-spalten{display:grid;grid-template-columns:repeat(var(--sp,1),minmax(0,1fr));gap:0 16px;align-items:start}table.aufstab{width:100%;border-collapse:collapse}table.aufstab th{text-align:left;font-size:12px;color:#555;border-bottom:1px solid #999;padding:2px 8px 2px 0}table.aufstab td{padding:2px 8px 2px 0;border-bottom:1px solid #ddd;vertical-align:top}.aufstab .afp{display:inline-block;width:4px;height:1em;border-radius:2px;margin-right:5px;vertical-align:-2px}.aufstab .afs{display:inline-block;min-width:1.5em;text-align:center;border:1px solid #333;border-radius:3px;font-size:.85em;font-weight:700;margin-right:4px;padding:0 2px}.x{font-size:12px;color:#555}td.offen{background:#fce6e2}.badge{color:#b8321f;font-size:12px}@media print{select,.hinweis{display:none}}';
  const html = '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Stundenpläne ' + esc(d.schule.name) + '</title><style>' + css + '</style></head><body>' +
    '<h1>' + esc(d.schule.name) + ' · Schuljahr ' + esc(d.schule.schuljahr) + '</h1><p class="hinweis">Stand: ' + datum() + '. Plan auswählen:</p>' +
    '<select id="wahl" aria-label="Plan auswählen">' + plaene.map(p => '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>').join('') + '</select>' +
    plaene.map((p, i) => '<div class="plan' + (i ? '' : ' an') + '" id="' + esc(p.id) + '"><h2>' + esc(p.name) + '</h2>' + p.html + '</div>').join('') +
    '<script>document.getElementById("wahl").addEventListener("change",function(e){document.querySelectorAll(".plan").forEach(function(p){p.classList.toggle("an",p.id===e.target.value);});});<\/script></body></html>';
  herunterladen(html, 'stundenplaene_' + slug(d.schule.name) + '_' + isoDatum() + '.html', 'text/html');
}

