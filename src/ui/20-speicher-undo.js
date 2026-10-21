// ---------- Speichern im Browser (localStorage, bei Bedarf IndexedDB) ----------
const LS_DATEN = 'stundenplaner.daten', LS_META = 'stundenplaner.meta', LS_ORT = 'stundenplaner.ort';
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('stundenplaner', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbSet(k, v) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
async function idbGet(k) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('kv', 'readonly'); const q = tx.objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
function metaSpeichern() { try { localStorage.setItem(LS_META, JSON.stringify(APP.meta)); } catch (e) { /* ignorieren */ } }
function speichernPlanen() {
  clearTimeout(APP.speicherTimer);
  APP.speicherStatus = 'Änderungen werden gespeichert …';
  kopfAktualisieren();
  APP.speicherTimer = setTimeout(speichernJetzt, 1000);
}
async function speichernJetzt() {
  if (APP.speicherGesperrt) { APP.speicherStatus = 'Speichern pausiert'; kopfAktualisieren(); return; }
  const json = JSON.stringify(APP.daten);
  const inIdb = async () => { await idbSet('daten', json); localStorage.setItem(LS_ORT, 'idb'); localStorage.removeItem(LS_DATEN); };
  try {
    if (json.length > 4e6) { await inIdb(); APP.speicherStatus = 'Gespeichert (IndexedDB) um ' + uhrzeit(); }
    else { localStorage.setItem(LS_DATEN, json); localStorage.setItem(LS_ORT, 'ls'); APP.speicherStatus = 'Gespeichert um ' + uhrzeit(); }
    bannerWeg('speichern');
  } catch (err) {
    try { await inIdb(); APP.speicherStatus = 'Gespeichert (IndexedDB) um ' + uhrzeit(); }
    catch (e2) { APP.speicherStatus = 'Speichern fehlgeschlagen'; banner({ id: 'speichern', art: 'err', text: 'Speichern im Browser fehlgeschlagen: ' + (e2.message || e2) + '. Bitte das Projekt als Datei exportieren, damit nichts verloren geht.', aktion: { text: 'Projekt exportieren', tun: () => exportJson(false) } }); }
  }
  if (!APP.meta.ersterStand) APP.meta.ersterStand = Date.now();
  metaSpeichern();
  kopfAktualisieren();
}
async function ladenGespeichert() {
  try { const m = localStorage.getItem(LS_META); if (m) Object.assign(APP.meta, JSON.parse(m)); } catch (e) { /* ignorieren */ }
  try { if (/experte/.test(location.hash)) APP.meta.experte = true; } catch (e) { /* ignorieren */ } // z. B. stundenplaner.html#experte
  themeAnwenden();
  let roh = null;
  try {
    if (localStorage.getItem(LS_ORT) === 'idb') roh = await idbGet('daten');
    else roh = localStorage.getItem(LS_DATEN);
  } catch (e) { roh = null; }
  if (!roh) return null;
  return datenstandLaden(JSON.parse(roh));
}

// ---------- Änderungen, Rückgängig/Wiederholen ----------
function aendern(beschr, fn, opt) {
  opt = opt || {};
  const vorher = JSON.stringify(APP.daten);
  fn(APP.daten);
  if (opt.normalisieren) APP.daten = normalisiere(APP.daten);
  // Aufsichten nachführen (nur, wo die automatische Nachplanung eingeschaltet ist)
  if (!opt.ohneDienste) { try { dienstAuto(APP.daten); } catch (err) { console.error(err); } }
  const nachher = JSON.stringify(APP.daten);
  if (nachher === vorher) return false;
  APP.undo.push({ d: vorher, b: beschr });
  if (APP.undo.length > 60) APP.undo.shift();
  APP.redo.length = 0;
  nachAenderung(opt);
  return true;
}
function nachAenderung(opt) {
  opt = opt || {};
  if (opt.nurPlan && APP.cache) APP.cache.bewertung = null; else APP.cache = null;
  speichernPlanen();
  machPlanen();
  kopfAktualisieren();
  if (opt.render !== false) render();
}
function rueckgaengig() {
  const x = APP.undo.pop(); if (!x) { toast('Nichts rückgängig zu machen.'); return; }
  APP.redo.push({ d: JSON.stringify(APP.daten), b: x.b });
  APP.daten = JSON.parse(x.d);
  nachAenderung({});
  toast('Rückgängig: ' + x.b);
}
function wiederholen() {
  const x = APP.redo.pop(); if (!x) { toast('Nichts zu wiederholen.'); return; }
  APP.undo.push({ d: JSON.stringify(APP.daten), b: x.b });
  APP.daten = JSON.parse(x.d);
  nachAenderung({});
  toast('Wiederholt: ' + x.b);
}

// ---------- Modell, Bewertung, Machbarkeit ----------
function modell() {
  if (!APP.cache) { const r = planAusDaten(APP.daten); APP.cache = { M: r.M, P: r.P, bewertung: null }; }
  if (!APP.cache.bewertung) {
    const det = [];
    const tot = bewerteAlles(APP.cache.M, APP.cache.P, det);
    APP.cache.bewertung = { tot, det, k: kostenVon(APP.cache.M, tot) };
  }
  return APP.cache;
}
function machPlanen() {
  clearTimeout(APP.machTimer);
  APP.machTimer = setTimeout(() => { APP.mach = machbarkeit(APP.daten); navAktualisieren(); if (APP.seite === 'pruefung' || APP.seite === 'berechnung') render(); }, 350);
}
const machFehler = () => APP.mach.filter(x => x.stufe === 'fehler');

