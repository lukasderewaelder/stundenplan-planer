/* =====================================================================
   5c. OBERFLÄCHE – Berechnung (Web Worker), Plan-Editor, Auswertung, Selbsttest
   ===================================================================== */

/* ---------------- Berechnung im Web Worker ---------------- */
const WORKER_GLUE = `
let stopFlag = false;
self.onmessage = async function (ev) {
  const m = ev.data;
  if (m.typ === 'stop') { stopFlag = true; return; }
  if (m.typ !== 'start') return;
  stopFlag = false;
  try {
    const res = await loeseStundenplan(m.daten, m.konf, {
      progress: p => self.postMessage(Object.assign({ typ: 'progress' }, p)),
      snapshot: s => self.postMessage(Object.assign({ typ: 'snapshot' }, s)),
      stop: () => stopFlag
    });
    self.postMessage(Object.assign({ typ: 'done' }, res));
  } catch (err) { self.postMessage({ typ: 'error', text: String(err && err.message || err) }); }
};`;
function workerErzeugen() {
  const src = document.getElementById('engine').textContent + '\n' + WORKER_GLUE;
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  const w = new Worker(url);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return w;
}
function rechnungKonf() { return Object.assign({}, RECHNUNG_STD, APP.meta.rechnung || {}); }
function rechnungKonfSetzen(k, v) { APP.meta.rechnung = Object.assign(rechnungKonf(), { [k]: v }); metaSpeichern(); }
async function rechnungStart(extra) {
  const R = APP.rechnung;
  if (R.laeuft) { toast('Es läuft bereits eine Berechnung.'); return; }
  APP.mach = machbarkeit(APP.daten);
  if (machFehler().length) { toast('Der Machbarkeitscheck meldet ' + machFehler().length + ' Fehler – die Berechnung ist blockiert.', 'err'); gehe('pruefung'); return; }
  if (!APP.daten.unterrichte.length) { toast('Es gibt noch keine Unterrichte.', 'err'); return; }
  const k = Object.assign(rechnungKonf(), extra || {});
  if (k.teilArt && (k.teilId === '' || k.teilId === null || k.teilId === undefined)) { toast('Teilneuplanung: bitte zuerst ' + (k.teilArt === 'klasse' ? 'eine Klasse' : k.teilArt === 'lehrer' ? 'eine Lehrkraft' : 'einen Tag') + ' wählen oder die Teilneuplanung ausschalten.', 'err', 6000); gehe('berechnung'); return; }
  const konf = { zeitlimit: k.zeitlimit, iterLimit: k.iterLimit, startwert: k.startwert, minimal: k.minimal, seed: k.seed, teil: k.teilArt ? { art: k.teilArt, id: k.teilId } : null, gelockert: (extra && extra.gelockert) || [], reparatur: !!(extra && extra.reparatur) };
  Object.assign(R, { laeuft: true, fortschritt: null, verlauf: [], vorschau: null, vorschauLk: null, ergebnis: null, start: Date.now(), konf });
  bannerWeg('rechnung'); bannerWeg('rechnung-daten');
  const daten = JSON.parse(JSON.stringify(APP.daten));
  const onmsg = m => {
    if (m.typ === 'progress') {
      R.fortschritt = m;
      R.verlauf.push({ t: m.zeit, k: m.besteHart * HART_GEWICHT + m.besteWeich });
      rechnungAnzeigeAktualisieren(); kopfAktualisieren();
    } else if (m.typ === 'snapshot') {
      R.vorschau = m.platzierungen; R.vorschauLk = m.lehrkraefte || null; R.vorschauMuster = m.muster || null; rechnungVorschauAktualisieren();
    } else if (m.typ === 'done') {
      rechnungEnde(m, daten);
    } else if (m.typ === 'error') {
      R.laeuft = false; (R.workers || []).forEach(x => x.terminate()); R.workers = []; R.worker = null;
      banner({ id: 'rechnung', art: 'err', text: 'Berechnung fehlgeschlagen: ' + m.text, aktion: { text: 'Daten prüfen', tun: () => gehe('pruefung') } }); render();
    }
  };
  // Parallele Suchläufe: Auf Rechnern mit mehreren Kernen rechnen bis zu vier Worker mit verschiedenen Startwerten und Suchstrategien
  // (Simulated Annealing / Late Acceptance) – übernommen wird das beste Ergebnis (Endvalidierung, dann Strafpunkte und Arbeitszeit-Ausgleich).
  const nW = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  const laeufe = [];
  const besserP = (a, b) => !b || a.besteHart < b.besteHart || (a.besteHart === b.besteHart && a.besteWeich < b.besteWeich);
  const onmsgW = (i, m) => {
    const L = laeufe[i]; if (!L || L.fertig) return;
    if (m.typ === 'progress') {
      L.fortschritt = m;
      let b = null, iter = 0, langsam = null;
      laeufe.forEach(x => {
        const p = x.fortschritt;
        if (p) { iter += p.iterationen || 0; if (besserP(p, b)) b = p; }
        // Gesamtfortschritt und Schritt: der Lauf, der am weitesten zurück ist (das Ergebnis braucht alle Läufe)
        const g = x.fertig ? { gesamt: 1, schritt: 4, phase: 'Fertig' } : p ? { gesamt: p.gesamt !== undefined ? p.gesamt : 0.88 * (p.prozent || 0), schritt: p.schritt || 0, phase: p.phase } : { gesamt: 0, schritt: 0, phase: 'Start' };
        if (!langsam || g.gesamt < langsam.gesamt) langsam = g;
      });
      onmsg(Object.assign({}, b, { typ: 'progress', iterationen: iter, laeufe: laeufe.length, gesamt: langsam.gesamt, schritt: langsam.schritt, phase: langsam.phase }));
    } else if (m.typ === 'snapshot') {
      L.snap = m;
      let bi = -1, b = null; laeufe.forEach((x, j) => { if (x.snap && besserP({ besteHart: x.snap.hart, besteWeich: x.snap.weich }, b)) { b = { besteHart: x.snap.hart, besteWeich: x.snap.weich }; bi = j; } });
      if (bi === i) onmsg(m);
    } else if (m.typ === 'done' || m.typ === 'error') {
      L.fertig = true; if (m.typ === 'done') L.ergebnis = m; else L.fehler = m.text;
      try { L.w.terminate(); } catch (e) { /* schon beendet */ }
      if (!laeufe.every(x => x.fertig)) return;
      const erg = laeufe.filter(x => x.ergebnis).map(x => x.ergebnis);
      if (!erg.length) { onmsg({ typ: 'error', text: laeufe.map(x => x.fehler).filter(Boolean)[0] || 'unbekannter Fehler' }); return; }
      erg.sort((a, b) => ergebnisVergleich(a, b));
      const best = erg[0];
      best.statistik = Object.assign({}, best.statistik, { laeufe: erg.map(x => ({ seed: x.statistik.seed, strategie: x.statistik.strategie, hart: x.end ? x.end.hart : x.hart, weich: Math.round(x.weich), ausgleich: x.statistik.ausgleich ? x.statistik.ausgleich.sd : null })), iterationen: erg.reduce((a, x) => a + (x.statistik.iterationen || 0), 0) });
      R.workers = []; R.worker = null;
      rechnungEnde(Object.assign({ typ: 'done' }, best), daten);
    }
  };
  try {
    R.workers = [];
    for (let i = 0; i < nW; i++) {
      const w = workerErzeugen(), L = { w, fertig: false };
      laeufe.push(L); R.workers.push(w);
      w.onmessage = ev => onmsgW(i, ev.data);
      w.onerror = ev => { ev.preventDefault(); onmsgW(i, { typ: 'error', text: ev.message || 'Worker-Fehler' }); };
      w.postMessage({ typ: 'start', daten, konf: Object.assign({}, konf, { seed: (konf.seed || 1) + i * 7919, strategie: i % 2 === 1 ? 'lahc' : 'sa' }) });
    }
    R.worker = R.workers[0];
  } catch (err) {
    (R.workers || []).forEach(x => { try { x.terminate(); } catch (e) { /* */ } }); R.workers = [];
    // Rückfall: Solver im Hauptfenster (in Häppchen, die Oberfläche bleibt bedienbar)
    R.worker = null; R.stopFlag = false;
    toast('Web Worker nicht verfügbar – die Berechnung läuft im Hauptfenster.', '', 6000);
    loeseStundenplan(daten, konf, { progress: p => onmsg(Object.assign({ typ: 'progress' }, p)), snapshot: s => onmsg(Object.assign({ typ: 'snapshot' }, s)), stop: () => R.stopFlag })
      .then(res => onmsg(Object.assign({ typ: 'done' }, res))).catch(e => onmsg({ typ: 'error', text: e.message }));
  }
  kopfAktualisieren();
  if (APP.seite === 'berechnung') render();
}
function rechnungStop() {
  const R = APP.rechnung; if (!R.laeuft) return;
  if (R.workers && R.workers.length) R.workers.forEach(w => w.postMessage({ typ: 'stop' })); else if (R.worker) R.worker.postMessage({ typ: 'stop' }); else R.stopFlag = true;
  toast('Berechnung wird gestoppt, der beste Stand wird übernommen …');
}
function rechnungEnde(m, datenStart) {
  const R = APP.rechnung;
  R.laeuft = false;
  (R.workers || []).forEach(w => { try { w.terminate(); } catch (e) { /* schon beendet */ } }); R.workers = [];
  if (R.worker) { try { R.worker.terminate(); } catch (e) { /* */ } R.worker = null; }
  R.ergebnis = m;
  if (m.verlauf && m.verlauf.length) R.verlauf.push(m.verlauf[m.verlauf.length - 1]);
  // Ergebnis übernehmen (rückgängig machbar). Die Gesamtberechnung liefert Fachunterricht, Co-Lehrkräfte UND Aufsichten in einem Stück.
  const gleich = JSON.stringify(datenStart.unterrichte) === JSON.stringify(APP.daten.unterrichte) && JSON.stringify(datenStart.lehrer) === JSON.stringify(APP.daten.lehrer) && JSON.stringify(datenStart.dienste.bedarfe) === JSON.stringify(APP.daten.dienste.bedarfe);
  const uebernommen = aendern('Plan berechnet', d => {
    d.plan.platzierungen = m.platzierungen;
    // von der Berechnung gewählte Blockaufteilung (Einzel-/Doppelstunden, ggf. 14-tägige Doppelstunde) – passt zu den Blocknummern des Plans
    musterUebernehmen(d, m.muster);
    // automatisch zugeteilte Lehrkräfte und Co-Lehrkräfte: Die Berechnung hat sie (neu) vergeben – zusammen mit dem Plan übernehmen
    (m.statistik.lehrkraefte || []).forEach(x => { const u = findeId(d.unterrichte, x.id); if (u) u.lehrkraefte = x.lehrkraefte; });
    // Fach- und Co-Lehrkräfte sind bereits Bestandteil der Berechnung. Hier wird nur das Ergebnis übernommen.
    d.plan.coNachlauf = m.statistik.coNachlauf || null;
    if (gleich) d.plan.coStand = coSignatur(d); // Co-Besetzung passt zu genau diesem Stand
    // Aufsichten: bei JEDER Berechnung vollständig neu gegen genau diesen Fach- und Co-Plan – unabhängig vom Schalter „automatisch nachplanen“.
    // Alte automatische Einsätze sind damit ersetzt; nur von Hand gesetzte/fixierte bleiben.
    if (m.dienste && gleich) { d.dienste.plan = m.dienste.plan; d.dienste.offen = m.dienste.offen; d.dienste.verdraengt = m.dienste.verdraengt || []; d.dienste.stand = dienstGrundlagenSignatur(d); }
    else aufsichtenNeuBerechnen(d, { stabil: true, zeitlimit: 900 }); // die Daten wurden während der Berechnung geändert: Aufsichten hier gegen den übernommenen Stand rechnen
  }, { render: false, ohneDienste: true, ohneAufsicht: true });
  if (!gleich) banner({ id: 'rechnung-daten', art: 'warn', text: 'Die Daten wurden während der Berechnung geändert – bitte das Ergebnis prüfen oder neu berechnen.', aktion: { text: 'Neu berechnen', tun: () => { gehe('berechnung'); if (!APP.rechnung.laeuft) rechnungStart(); } }, gueltig: () => APP.rechnung.ergebnis === m });
  // Endvalidierung: Die Zahl „harte Fehler“ stammt ausschließlich aus der Prüfung des jetzt gespeicherten Gesamtplans (keine Zwischenwerte der Suche).
  let st = null; try { st = planAmpel(); } catch (err) { console.error(err); }
  const endHart = st && st.ampel !== 'leer' ? (st.hart || 0) : (m.end ? m.end.hart : m.hart);
  m.endHart = endHart;
  if (uebernommen && APP.undo.length) APP.undo[APP.undo.length - 1].b = 'Plan berechnet (' + hartText(endHart) + ')';
  R.fortschritt = Object.assign({}, R.fortschritt || {}, { phase: m.statistik.gestoppt ? 'Gestoppt' : 'Fertig', prozent: 1, gesamt: 1, schritt: 4, besteHart: endHart, besteWeich: m.weich, iterationen: m.statistik.iterationen, zeit: m.statistik.zeit, unplatziert: m.statistik.unplatziert, verstoesse: m.verstoesse });
  const rep = !!(R.konf && R.konf.reparatur);
  { let gw = []; try { gw = gtaWarnungen(APP.daten); } catch (err) { console.error(err); }
    const gA = new Set(gw.map(w => w.gta)).size;
    if (gw.length) banner({ id: 'gta', art: 'warn', text: (gw.some(w => w.art === 'arbeitszeit') ? 'GTA nicht mehr möglich – Arbeitszeitüberschreitung! ' : 'GTA nicht mehr möglich – ') + (gA === 1 ? '1 GTA passt' : gA + ' GTAs passen') + ' nach der Berechnung nicht mehr: ' + gw[0].text + (gw.length > 1 ? ' (+' + (gw.length - 1) + ' weitere)' : ''), aktion: { text: 'GTA-Planer öffnen', tun: () => gehe('gta') }, gueltig: () => APP.rechnung.ergebnis === m }); }
  if (rep) {
    // Neulösen nach einem erzwungenen Zug: melden, wie viele Stunden dafür umziehen mussten (hier zählen die harten Regeln des Stundenplans)
    const alt = new Map(datenStart.plan.platzierungen.map(p => [p.unterricht + '|' + p.blockNr, p]));
    const bewegt = m.platzierungen.filter(p => { const q = alt.get(p.unterricht + '|' + p.blockNr); return !q || q.tag !== p.tag || q.stunde !== p.stunde; }).length;
    const repText = m.hart ? 'Keine vollständige Lösung gefunden: ' + (m.hart === 1 ? '1 harter Regelverstoß bleibt.' : m.hart + ' harte Regelverstöße bleiben.') : 'Neue Lösung gefunden: ' + bewegt + ' ' + (bewegt === 1 ? 'Stunde wurde' : 'Stunden wurden') + ' dafür verschoben, keine harten Regelverstöße.' + (endHart ? ' Endvalidierung des Gesamtplans: ' + hartText(endHart) + '.' : '');
    if (m.hart || endHart) banner({ id: 'rechnung', art: 'err', text: repText, aktion: { text: 'Probleme ansehen', tun: () => gehe('auswertung', { reiter: 'offen' }) }, gueltig: () => APP.rechnung.ergebnis === m });
    else toast(repText, 'ok', 8000);
  } else {
    const nNN = APP.daten.unterrichte.filter(u => !u.aufgabe && u.wochenstunden > 0 && !u.lehrkraefte.some(z => z.rolle === 'fach' && z.lehrer)).length;
    // Ergebnis als Banner: bleibt stehen, bis es geschlossen wird oder eine neue Berechnung beginnt
    let nOffen = 0; try { nOffen = offenePunkteZahl(); } catch (err) { nOffen = 0; }
    const handeln = !!(endHart || nNN || nOffen);
    banner({ id: 'rechnung', art: endHart ? 'err' : handeln ? 'warn' : 'ok',
      text: (m.statistik.gestoppt ? 'Gestoppt – bester Plan übernommen: ' : 'Berechnung fertig: ') + (endHart ? hartText(endHart) + ' in der Endvalidierung' : 'Endvalidierung ohne harte Fehler') + ', ' + zahlDe(m.weich, 1) + ' Strafpunkte'
        + (nNN ? '; ' + nNN + (nNN === 1 ? ' Unterricht hat' : ' Unterrichte haben') + ' noch keine Lehrkraft' : '') + (!endHart && !nNN && nOffen ? '; ' + nOffen + (nOffen === 1 ? ' offener Punkt' : ' offene Punkte') : '') + '.'
        + (m.statistik.sicherheitsnetz && m.statistik.sicherheitsnetz.ersetzt ? ' Freies Verbessern hätte mehr Pflichtverstöße ergeben – der Plan wurde deshalb nur vorsichtig ergänzt.' : ''),
      aktion: handeln ? { text: 'Probleme ansehen', tun: () => gehe('auswertung', { reiter: 'offen' }) } : { text: 'Im Editor öffnen', tun: () => gehe('editor') },
      nichtAuf: 'berechnung', gueltig: () => APP.rechnung.ergebnis === m });
  }
  render();
  if (rep && m.hart && !document.querySelector('dialog[open]')) { reparaturOffenDialog(m); return; }
  // Fenster mit allem, was noch fehlt (Stunden ohne Platz, Raum, Lehrkraft, Co-Lehrkraft, harte Verstöße)
  if (APP.meta.offenNachRechnung === true && !document.querySelector('dialog[open]')) offenePunkteDialog(true);
}
function kurveZeichnen(cv, verlauf) {
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 600, Hh = cv.clientHeight || 180;
  cv.width = W * dpr; cv.height = Hh * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, W, Hh);
  const cs = getComputedStyle(document.documentElement), farbe = (name, ersatz) => (cs.getPropertyValue(name) || '').trim() || ersatz;
  g.font = '11px system-ui, sans-serif'; g.fillStyle = farbe('--muted', '#5a6474');
  if (verlauf.length < 2) { g.fillText('Kurve der besten Kosten erscheint während der Berechnung.', 12, Hh / 2); return; }
  const tmax = Math.max(1, verlauf[verlauf.length - 1].t);
  const ys = verlauf.map(p => Math.log10(1 + Math.max(0, p.k)));
  const ymax = Math.max(...ys) * 1.05 || 1, ymin = Math.min(...ys) * 0.95;
  const L = 56, Rr = 10, T = 10, B = 22;
  const X = t => L + (W - L - Rr) * t / tmax, Y = y => T + (Hh - T - B) * (1 - (y - ymin) / Math.max(1e-9, ymax - ymin));
  g.strokeStyle = farbe('--line', '#d9dee7'); g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const y = T + (Hh - T - B) * i / 4; g.beginPath(); g.moveTo(L, y); g.lineTo(W - Rr, y); g.stroke(); const val = Math.pow(10, ymax - (ymax - ymin) * i / 4) - 1; g.fillText(val >= 1000 ? String(Math.round(val / 100) / 10).replace('.', ',') + ' Tsd.' : String(Math.round(val)), 4, y + 4); }
  g.fillText('0 s', L, Hh - 6); g.fillText(Math.round(tmax) + ' s', W - Rr - 30, Hh - 6);
  const hartGrenze = Math.log10(1 + HART_GEWICHT);
  if (hartGrenze > ymin && hartGrenze < ymax) { g.strokeStyle = farbe('--err-rand', '#f0bab0'); g.setLineDash([4, 4]); g.beginPath(); g.moveTo(L, Y(hartGrenze)); g.lineTo(W - Rr, Y(hartGrenze)); g.stroke(); g.setLineDash([]); g.fillStyle = farbe('--err', '#b42f1d'); g.fillText('darüber: harte Verstöße', W - Rr - 130, Y(hartGrenze) - 4); }
  g.strokeStyle = farbe('--accent', '#2a50c8'); g.lineWidth = 2; g.beginPath();
  verlauf.forEach((p, i) => { const x = X(p.t), y = Y(ys[i]); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
  g.stroke();
}
// Die vier Schritte der Berechnung in Klartext. Die Suche (Konstruktion → Reparatur → Verbesserung) ist Schritt 1;
// Co-Lehrkräfte, Aufsichten und die Prüfung folgen am Ende in einem Zug.
const RECHEN_SCHRITTE = ['Fachunterricht und Personal', 'Co-Lehrkräfte', 'Aufsichten', 'Prüfung'];
const PHASE_TEXT = { Start: 'Die Berechnung wird vorbereitet …', Konstruktion: 'Die Stunden werden in den Plan gesetzt …', Reparatur: 'Überschneidungen werden aufgelöst …', Verbesserung: 'Der Plan steht – jetzt werden die Wünsche berücksichtigt …', 'Co-Lehrkräfte': 'Die Co-Lehrkräfte werden eingeteilt …', Aufsichten: 'Die Aufsichten werden geplant …', Endvalidierung: 'Der ganze Plan wird geprüft …', 'Sicherheitsprüfung': 'Ein vorsichtiger Vergleichslauf wird gerechnet, damit der Plan nicht schlechter wird …', Gestoppt: 'Gestoppt – der beste Stand wurde übernommen.', Fertig: 'Fertig.' };
// Fortschritt über die ganze Berechnung (0–1): Suche, Co-Lehrkräfte, Aufsichten und Prüfung zusammen
function rechnungGesamt(f) { f = f || {}; return f.gesamt !== undefined ? f.gesamt : 0.88 * (f.prozent || 0); }
function rechnungAnzeigeAktualisieren() {
  const ui = APP.rechnung.ui; if (!ui || !(document.body.contains(ui.bar) || document.body.contains(ui.zahlen))) return;
  const R = APP.rechnung, f = R.fortschritt || {};
  const g = R.laeuft ? rechnungGesamt(f) : (R.ergebnis ? 1 : rechnungGesamt(f));
  const pz = R.laeuft ? Math.min(99, Math.floor(g * 100)) : Math.round(g * 100);
  ui.bar.style.width = pz + '%';
  if (ui.barBox) ui.barBox.setAttribute('aria-valuenow', pz);
  // Hero: Prozent, Klartext zur Phase und zum Zwischenstand, Restzeit
  if (ui.prozent) ui.prozent.textContent = pz + ' %';
  if (ui.status && R.laeuft) {
    // Restzeit aus der verstrichenen Zeit und dem Gesamtfortschritt (gilt für alle vier Schritte und für Läufe mit Iterationslimit)
    const verstrichen = R.start ? (Date.now() - R.start) / 1000 : (f.zeit || 0), rest = g > 0.03 && g < 0.995 ? Math.max(1, Math.round(verstrichen * (1 - g) / g)) : null;
    const stand = f.besteHart === undefined ? '' : f.unplatziert ? (f.unplatziert === 1 ? '1 Stunde hat' : f.unplatziert + ' Stunden haben') + ' noch keinen Platz' : f.besteHart > 0 ? (f.besteHart === 1 ? 'noch 1 Überschneidung' : 'noch ' + f.besteHart + ' Überschneidungen') + ' zu lösen' : 'alle Pflichtregeln sind erfüllt';
    leeren(ui.status).append(h('b', {}, PHASE_TEXT[f.phase || 'Start'] || (f.phase || '')), stand ? ' Zwischenstand: ' + stand + '.' : '', rest !== null && rest > 0 ? ' Noch etwa ' + (rest >= 90 ? Math.round(rest / 60) + ' Minuten' : rest + ' Sekunden') + '.' : '');
  }
  // Schritte: erledigte grün, der laufende hervorgehoben – auch während der Berechnung
  const sch = R.laeuft ? Math.min(4, f.schritt || 0) : (R.ergebnis ? 4 : -1);
  if (ui.schritte) [...ui.schritte.children].forEach((li, i) => { const fertig = (!R.laeuft && !!R.ergebnis) || (R.laeuft && i < sch), aktiv = R.laeuft && i === sch; li.className = 'rschritt' + (fertig ? ' fertig' : aktiv ? ' aktiv' : ''); if (aktiv) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
  const kz = [['Phase', f.phase || 'Start'], ['Zeit', zahlDe(f.zeit || 0, 1) + ' s'], ['Iterationen', zahlDe(f.iterationen || 0)], [APP.rechnung.laeuft ? 'Zwischenstand: harte Verstöße' : 'Harte Fehler (Endvalidierung)', f.besteHart ?? '–'], [APP.rechnung.laeuft ? 'Zwischenstand: Strafpunkte' : 'Strafpunkte', f.besteWeich !== undefined ? zahlDe(f.besteWeich, 1) : '–'], ['Unplatziert', f.unplatziert ?? '–']];
  leeren(ui.zahlen).append(...kz.map(([n, v]) => h('div', { class: 'kennzahl' }, h('div', { class: 'w' }, String(v)), h('div', { class: 'n' }, n))));
  kurveZeichnen(ui.canvas, APP.rechnung.verlauf);
  if (f.verstoesse) {
    const M = modell().M;
    leeren(ui.regeln).append(h('table', { class: 'tab' }, h('thead', {}, h('tr', {}, h('th', {}, 'Regel'), h('th', {}, 'Art'), h('th', { class: 'zahl' }, 'Verstöße (aktuell)'))),
      h('tbody', {}, REGELN.map((r, i) => (f.verstoesse[i] > 0 || M.hart[i]) ? h('tr', { title: r.text }, h('td', {}, h('b', {}, r.name)), h('td', {}, M.hart[i] ? 'Pflicht' : 'Wunsch'), h('td', { class: 'zahl' }, f.verstoesse[i] > 0 ? h('span', { class: 'badge ' + (M.hart[i] ? 'err' : 'neutral') }, zahlDe(f.verstoesse[i], 1)) : '0')) : null))));
  }
}
function rechnungVorschauAktualisieren() {
  const ui = APP.rechnung.ui; if (!ui || !document.body.contains(ui.vorschau)) return;
  const R = APP.rechnung;
  const pl = R.vorschau || (R.ergebnis && R.ergebnis.platzierungen) || null;
  // Zwischenstand: die in der Suche gewählten Fachlehrkräfte anzeigen (noch nicht übernommen)
  let d = APP.daten;
  if (R.vorschau && R.vorschauLk && R.vorschauLk.length) { const lk = new Map(R.vorschauLk.map(x => [x.id, x.lehrkraefte])); d = Object.assign({}, d, { unterrichte: d.unterrichte.map(u => lk.has(u.id) ? Object.assign({}, u, { lehrkraefte: lk.get(u.id) }) : u) }); }
  if (R.vorschau && R.vorschauMuster && R.vorschauMuster.length) { const mm = new Map(R.vorschauMuster.map(x => [x.id, x])); d = Object.assign({}, d, { unterrichte: d.unterrichte.map(u => mm.has(u.id) ? Object.assign({}, u, { bloeckeAuto: mm.get(u.id).bloecke, bloeckeAutoWoche: mm.get(u.id).woche }) : u) }); }
  if (!R.vorschauKlasse || !klasseVon(R.vorschauKlasse)) R.vorschauKlasse = d.klassen[0] ? d.klassen[0].id : null;
  leeren(ui.vorschau);
  if (!pl || !R.vorschauKlasse) { ui.vorschau.append(h('p', { class: 'muted' }, 'Die Vorschau des aktuell besten Plans erscheint mit dem ersten Zwischenstand.')); return; }
  ui.vorschau.append(h('div', { class: 'zeile', style: { marginBottom: '6px' } }, 'Klasse', sel(klassenOpts(), R.vorschauKlasse, v => { R.vorschauKlasse = v; rechnungVorschauAktualisieren(); })),
    h('div', { class: 'mini-plan' }, statischerPlan(d, pl, 'klasse', R.vorschauKlasse, { klein: true })));
}
SEITEN_RENDER.berechnung = () => {
  const d = APP.daten, R = APP.rechnung, k = rechnungKonf();
  const f = machFehler();
  const setz = (key, v, neu) => { rechnungKonfSetzen(key, v); if (neu) render(); };
  const zeitOpts = [[5, '5 Sekunden'], [15, '15 Sekunden'], [30, '30 Sekunden'], [60, '60 Sekunden'], [120, '2 Minuten'], [300, '5 Minuten'], [600, '10 Minuten'], [1800, '30 Minuten']];
  const teilIds = k.teilArt === 'klasse' ? klassenOpts() : k.teilArt === 'lehrer' ? lehrerOpts() : k.teilArt === 'tag' ? d.schule.tage.map((t, i) => [String(i), TAGE_LANG[t]]) : [];
  // Einstellungen für alle: Zeit, Ausgangspunkt, Teilneuplanung. Seed und Iterationslimit stehen bei den Details für Fortgeschrittene.
  const einstellungen = h('div', { class: 'karte' }, h('h2', { style: { marginTop: 0 } }, 'Einstellungen'),
    h('div', { class: 'zeile', style: { gap: '16px', alignItems: 'flex-end' } },
      h('label', { class: 'feld' }, h('span', {}, 'Rechenzeit', hilfe('So lange sucht die Berechnung nach dem besten Plan. Mehr Zeit bringt meist weniger Strafpunkte; für einen ersten Blick genügen 30 bis 60 Sekunden.')), sel((zeitOpts.some(o => o[0] === k.zeitlimit) || !(k.zeitlimit > 0) ? zeitOpts : zeitOpts.concat([[k.zeitlimit, k.zeitlimit + ' Sekunden']]).sort((x, y) => x[0] - y[0])).map(([v, t]) => [String(v), t]), String(k.zeitlimit), v => setz('zeitlimit', Number(v)), { disabled: R.laeuft, 'aria-label': 'Rechenzeit' })),
      h('label', { class: 'feld' }, h('span', {}, 'Ausgangspunkt', hilfe('Leerer Plan: alles wird neu gelegt – Unterricht, Fach- und Co-Lehrkräfte und Aufsichten.\nAktueller Plan (verbessern): Was schon liegt, bleibt bewusst liegen. Unterricht, Fachlehrkräfte und Co-Lehrkräfte werden nur bewegt, wenn eine Pflichtregel es verlangt oder es deutlich besser wird – gut nach kleinen Änderungen, etwa an Aufsichten oder Aufgaben einzelner Personen.\nErgibt das Verbessern mehr Pflichtverstöße als der bisherige Plan, rechnet die Berechnung zusätzlich einen vorsichtigen Lauf, der fast nur Neues legt, und übernimmt den besseren.')), sel([['leer', 'leerer Plan'], ['aktuell', 'aktueller Plan (verbessern)']], k.startwert, v => setz('startwert', v), { disabled: R.laeuft, 'aria-label': 'Ausgangspunkt' })),
      h('label', { class: 'check', title: 'Jede Verschiebung gegenüber dem gespeicherten Plan kostet Strafpunkte – der neue Plan bleibt dem alten möglichst ähnlich.' }, h('input', { type: 'checkbox', checked: k.minimal, disabled: R.laeuft, onchange: ev => setz('minimal', ev.target.checked) }), 'Änderungen minimal halten'),
      h('label', { class: 'feld' }, h('span', {}, 'Teilneuplanung', hilfe('Nur eine Klasse, eine Lehrkraft oder ein Tag wird neu berechnet, alles andere bleibt temporär fixiert.')), sel([['', 'aus (ganzer Plan)'], ['klasse', 'nur eine Klasse'], ['lehrer', 'nur eine Lehrkraft'], ['tag', 'nur ein Tag']], k.teilArt, v => { rechnungKonfSetzen('teilArt', v); rechnungKonfSetzen('teilId', ''); render(); }, { disabled: R.laeuft, 'aria-label': 'Teilneuplanung' })),
      k.teilArt ? h('label', { class: 'feld' }, 'Auswahl', sel([['', '– wählen –']].concat(teilIds), k.teilId, v => setz('teilId', v, true), { disabled: R.laeuft })) : null),
    d.plan.platzierungen.length && k.startwert !== 'aktuell' && !k.teilArt && !R.laeuft ? h('p', { class: 'muted klein', style: { margin: '10px 0 0' } }, 'Es gibt schon einen Plan. Nach kleinen Änderungen – etwa an Aufsichten oder Aufgaben einzelner Personen – „aktueller Plan (verbessern)“ wählen: Dann bleibt alles andere stehen. ', h('button', { class: 'btn klein', type: 'button', onclick: () => setz('startwert', 'aktuell', true) }, 'Auf „verbessern“ stellen')) : null);
  const technikFelder = h('div', { class: 'zeile', style: { gap: '16px', alignItems: 'flex-end' } },
    h('label', { class: 'feld' }, h('span', {}, 'Iterationslimit', hilfe('Statt Zeitlimit: feste Zahl von Suchschritten. Mit gleichem Seed entsteht dann immer derselbe Plan. 0 = aus.')), h('input', { type: 'number', min: 0, max: 100000000, step: 10000, value: k.iterLimit, style: { width: '120px' }, disabled: R.laeuft, 'aria-label': 'Iterationslimit', onchange: ev => setz('iterLimit', Math.max(0, Number(ev.target.value) || 0)) })),
    h('label', { class: 'feld' }, h('span', {}, 'Seed', hilfe('Zufallsstartwert (Generator mulberry32). Gleicher Seed + Iterationslimit = reproduzierbarer Lauf.')), h('span', { class: 'zeile eng' }, h('input', { type: 'number', min: 0, max: 4294967295, value: k.seed, style: { width: '120px' }, disabled: R.laeuft, 'aria-label': 'Seed', onchange: ev => setz('seed', Math.max(0, Math.floor(Number(ev.target.value) || 0))) }), h('button', { class: 'btn icon', title: 'Neuen Seed würfeln', 'aria-label': 'Neuen Seed würfeln', disabled: R.laeuft, onclick: () => setz('seed', Math.floor(Math.random() * 1e9), true) }, icon('wuerfel')))));
  const bar = h('div'), zahlen = h('div', { class: 'kennzahlen' }), canvas = h('canvas', { class: 'kurve', 'aria-label': 'Kurve der besten Kosten über der Zeit' }), regeln = h('div', { style: { maxHeight: '360px', overflow: 'auto' } }), vorschau = h('div');
  const barBox = h('div', { class: 'fortschritt gross', role: 'progressbar', 'aria-label': 'Fortschritt der Berechnung', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 }, bar);
  const prozent = h('span', { class: 'rprozent', 'aria-hidden': 'true' }, '0 %'), status = h('p', { class: 'rstatus', role: 'status', 'aria-live': 'polite' });
  const schritte = h('ol', { class: 'rschritte', 'aria-label': 'Schritte der Berechnung' }, RECHEN_SCHRITTE.map((t, i) => h('li', { class: 'rschritt' }, h('span', { class: 'rnr', 'aria-hidden': 'true' }, h('span', { class: 'rzahlnr' }, i + 1), icon('haken')), h('span', {}, t))));
  R.ui = { bar, barBox, zahlen, canvas, regeln, vorschau, prozent, status, schritte };
  const zeigen = R.laeuft || R.fortschritt || R.ergebnis;
  const erg = R.ergebnis && !R.laeuft ? R.ergebnis : null;
  // Hero: je nach Zustand – läuft · Ergebnis · bereit
  let hero;
  if (R.laeuft) hero = h('div', { class: 'karte rhero laeuft' },
    h('div', { class: 'rkopf' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Berechnung läuft'), h('h2', {}, 'Der Plan wird berechnet …')), prozent),
    barBox, status, schritte,
    h('div', { class: 'zeile' }, h('button', { class: 'btn primaer', onclick: rechnungStop }, 'Stoppen und besten Plan übernehmen'), h('span', { class: 'muted klein' }, 'Die Berechnung läuft im Hintergrund; die Oberfläche bleibt bedienbar.')));
  else if (erg) hero = ergebnisHero(erg, schritte);
  else hero = h('div', { class: 'karte rhero bereit' },
    h('div', { class: 'rkopf' }, h('div', {}, h('div', { class: 'eyebrow' }, f.length ? 'Noch nicht bereit' : 'Bereit'), h('h2', {}, f.length ? 'Zuerst die Fehler in den Daten beheben' : d.plan.platzierungen.length ? 'Den Plan neu berechnen' : 'Den Plan berechnen'))),
    h('p', { class: 'rstatus' }, f.length ? 'Die Vorprüfung meldet ' + (f.length === 1 ? '1 Fehler' : f.length + ' Fehler') + '. Solange sie bestehen, lässt sich kein Plan berechnen.' : 'Die Berechnung legt Unterricht, Lehrkräfte und Räume fest, ergänzt Co-Lehrkräfte, plant die Aufsichten und prüft am Ende den ganzen Plan.'),
    schritte,
    h('div', { class: 'zeile' },
      f.length ? h('button', { class: 'btn primaer gross', onclick: () => gehe('pruefung') }, 'Fehler ansehen') : h('button', { class: 'btn primaer gross', disabled: !d.unterrichte.length || (k.teilArt && !k.teilId), onclick: () => rechnungStart() }, 'Plan berechnen'),
      f.length || !d.unterrichte.length ? null : h('span', { class: 'badge ok' }, '✓ Vorprüfung ohne Fehler'),
      !d.unterrichte.length ? h('span', { class: 'zeile', style: { gap: '10px' } }, h('span', { class: 'muted klein' }, 'Es gibt noch keinen Unterricht – zuerst Klassen und Stundentafel anlegen.'), h('button', { class: 'btn', type: 'button', onclick: () => gehe('klassen') }, 'Zu Klassen & Stundentafel')) : k.teilArt && !k.teilId ? h('span', { class: 'muted klein' }, 'Für die Teilneuplanung bitte unten eine Auswahl treffen.') : null));
  const nochmal = erg ? h('div', { class: 'zeile', style: { marginTop: '10px' } }, h('button', { class: 'btn', disabled: !!f.length || (k.teilArt && !k.teilId), onclick: () => rechnungStart() }, 'Erneut berechnen'), f.length ? h('span', { class: 'badge err', style: { cursor: 'pointer' }, onclick: () => gehe('pruefung') }, '✕ ' + f.length + ' Fehler in der Vorprüfung – Berechnung blockiert') : null) : null;
  if (nochmal) einstellungen.append(nochmal);
  const diagnose = erg ? ergebnisDiagnose(erg) : null;
  const vorschauKarte = zeigen ? h('div', { class: 'karte' }, h('h3', { style: { marginTop: 0 } }, R.laeuft ? 'Vorschau des bisher besten Plans' : 'Vorschau des Plans'), vorschau) : null;
  // Kurve, Kennzahlen, Regeltabelle, Statistik, Seed und Iterationslimit: eingeklappt
  const technik = h('details', { class: 'karte technik', open: !!APP.meta.rechnungDetails, ontoggle: ev => { APP.meta.rechnungDetails = ev.target.open; metaSpeichern(); if (ev.target.open) rechnungAnzeigeAktualisieren(); } },
    h('summary', {}, 'Details für Fortgeschrittene', h('span', { class: 'muted klein' }, 'Verlauf der Suche, Verstöße je Regel, Statistik, Seed')),
    h('div', { class: 'technikinhalt' },
      technikFelder,
      zeigen ? [h('h3', {}, R.laeuft ? 'Verlauf der laufenden Berechnung' : 'Letzte Berechnung'), zahlen, canvas, erg ? ergebnisTechnik(erg) : null, h('h3', {}, 'Verstöße je Regel'), regeln] : h('p', { class: 'muted klein' }, 'Kennzahlen, Kurve und Verstöße je Regel erscheinen mit der ersten Berechnung.')));
  setTimeout(() => { rechnungAnzeigeAktualisieren(); rechnungVorschauAktualisieren(); if (R.ergebnis && !R.laeuft) { bar.style.width = '100%'; } }, 0);
  return [seitenkopf('Plan berechnen', 'Die Berechnung läuft vollständig automatisch – in vier Schritten vom Unterricht bis zur Prüfung des fertigen Plans. Die Reihenfolge ist immer dieselbe: a) Fachlehrkräfte und Unterricht in einer gemeinsamen Suche über Zeit, Raum und Personal (eine automatisch gewählte Lehrkraft bleibt bis zum Schluss veränderbar; Stunden mit Co-Bedarf legt die Suche möglichst dorthin, wo eine Co-Person frei ist), b) Co-Lehrkräfte blockweise auf dem fertigen Unterrichtsplan, c) Aufsichten und Springer – jedes Mal neu gegen den fertigen Fach- und Co-Plan, d) Endvalidierung des Gesamtplans. Gespeichert werden nur zwingende Personalvorgaben; die Zahl „harte Fehler“ stammt ausschließlich aus der Endvalidierung.'),
    hero, diagnose, h('div', { class: 'abstand' }), einstellungen, vorschauKarte ? h('div', { class: 'abstand' }) : null, vorschauKarte, h('div', { class: 'abstand' }), technik];
};
// Ergebnis der Berechnung als große Karte: „✓ Plan fertig · 2 Hinweise“ mit dem Knopf „Im Editor öffnen“
function ergebnisHero(m, schritte) {
  const s = m.statistik, R = APP.rechnung;
  // harte Fehler: ausschließlich aus der Endvalidierung des gespeicherten Gesamtplans (zum Zeitpunkt der Berechnung)
  const eh = m.endHart !== undefined ? m.endHart : (m.end ? m.end.hart : m.hart);
  let nOffen = 0; try { nOffen = offenePunkteZahl(); } catch (err) { nOffen = 0; }
  const co = s.coNachlauf, au = s.aufsicht, zt = s.zuteilung || {};
  const art = eh ? 'err' : nOffen ? 'warn' : 'ok';
  const titel = (s.gestoppt ? 'Gestoppt – bester Plan übernommen' : eh ? 'Plan berechnet – mit Problemen' : 'Plan fertig') + (eh ? ' · ' + hartText(eh) : nOffen ? ' · ' + nOffen + (nOffen === 1 ? ' Hinweis' : ' Hinweise') : '');
  // die vier Schritte mit ihrem Ergebnis in einem Satz
  const texte = [
    s.unplatziert ? s.unplatziert + (s.unplatziert === 1 ? ' Block ohne Platz' : ' Blöcke ohne Platz') : 'alle Stunden platziert' + (zt.auto ? ', ' + (zt.auto - (zt.offen || 0)) + ' von ' + zt.auto + ' Kursen automatisch besetzt' : ''),
    co ? co.ergaenzt.length + (co.ergaenzt.length === 1 ? ' Kurs besetzt' : ' Kurse besetzt') + (co.fehlend.length ? ', ' + co.fehlend.length + ' offen' : '') : 'kein Co-Bedarf',
    au ? au.neu + (au.neu === 1 ? ' Einsatz geplant' : ' Einsätze geplant') + (au.offenMin ? ', ' + au.offenMin + ' unbesetzt' : '') : 'keine Aufsichten geplant',
    eh ? hartText(eh) : 'keine harten Fehler'];
  [...schritte.children].forEach((li, i) => { li.className = 'rschritt fertig' + ((i === 0 && s.unplatziert) || (i === 1 && co && co.fehlend.length) || (i === 2 && au && au.offenMin) || (i === 3 && eh) ? ' offen' : ''); li.append(h('span', { class: 'rinfo' }, texte[i])); });
  return h('div', { class: 'karte rhero ergebnis ' + art },
    h('div', { class: 'rkopf' }, h('span', { class: 'rsymbol', 'aria-hidden': 'true' }, art === 'ok' ? icon('haken') : icon('warnung')), h('div', {}, h('div', { class: 'eyebrow' }, 'Ergebnis'), h('h2', {}, titel))),
    h('p', { class: 'rstatus' }, 'Der Plan wurde übernommen (rückgängig mit Strg+Z).' + (eh ? ' Die Endprüfung meldet ' + hartText(eh) + ' – die Einzelpunkte stehen unter „Offene Punkte“.' : nOffen ? ' Er ist vollständig; ' + (nOffen === 1 ? 'ein Punkt lässt' : nOffen + ' Punkte lassen') + ' sich von Hand noch verbessern.' : ' Alle Pflichtbedingungen sind erfüllt.')),
    schritte,
    h('div', { class: 'zeile' }, h('button', { class: 'btn primaer gross', onclick: () => gehe('editor') }, 'Im Editor öffnen'), offenePunkteKnopf(''),
      R.konf && R.konf.gelockert && R.konf.gelockert.length ? h('span', { class: 'badge warn' }, 'probeweise gelockert: ' + R.konf.gelockert.map(regelName).join(', ')) : null,
      s.unplatziert ? h('span', { class: 'badge err' }, s.unplatziert + ' Blöcke unplatziert') : null));
}
// Was nach der Berechnung zu tun bleibt: verbleibende Verstöße, Diagnose nicht platzierter Unterrichte, Regeln probeweise lockern
function ergebnisDiagnose(m) {
  const s = m.statistik, dg = m.diagnose || { ereignisse: [] }, R = APP.rechnung;
  const teile = [
    !dg.ereignisse.length && dg.vorschlag ? h('div', { class: 'hinweis ' + (m.hart ? 'err' : '') }, dg.vorschlag) : null, // m.hart: harte Regeln des Stundenplans (Teil der Endvalidierung)
    R.konf && R.konf.teil && !m.hart ? h('p', { class: 'muted klein' }, 'Teilneuplanung: nur ' + (R.konf.teil.art === 'klasse' ? 'die Klasse ' + ((klasseVon(R.konf.teil.id) || {}).name || '') : R.konf.teil.art === 'lehrer' ? 'die Lehrkraft ' + ((lehrerVon(R.konf.teil.id) || {}).kuerzel || '') : 'der gewählte Tag') + ' wurde neu berechnet, alles andere blieb fixiert.') : null,
    dg.ereignisse.length ? h('div', {},
      h('h3', {}, 'Diagnose: nicht platzierte Unterrichte'),
      h('p', {}, dg.vorschlag),
      h('ul', { class: 'vliste', style: { maxHeight: '320px' } }, dg.ereignisse.map(x => h('li', { onclick: () => springeZu({ seite: 'unterricht', id: x.unterricht }) },
        h('span', { class: 'sym h' }, '✕'), h('div', {}, h('b', {}, x.name), h('div', { class: 'klein' }, x.gruende.map(g => REGELN[RI[g.r]].name + ': ' + g.n + '×' + (g.beispiel ? ' (z. B. ' + g.beispiel + ')' : '')).join(' · ')), h('div', { class: 'klein muted' }, 'Vorschlag: ' + x.vorschlag)))))) : null,
    dg.lockerbar && dg.lockerbar.length && m.hart ? h('div', { class: 'zeile', style: { marginTop: '10px' } }, h('span', {}, 'Regel probeweise lockern und neu rechnen:'),
      dg.lockerbar.map(r => h('button', { class: 'btn', title: REGELN[RI[r]].text, onclick: () => rechnungStart({ gelockert: [r] }) }, REGELN[RI[r]].name))) : null
  ].filter(Boolean);
  return teile.length ? h('div', { class: 'karte', style: { marginTop: '16px' } }, h('h2', { style: { marginTop: 0 } }, 'Diagnose der Berechnung'), teile, h('p', { class: 'muted klein', style: { margin: '8px 0 0' } }, 'Alle offenen Punkte und Verstöße: ', h('button', { class: 'btn klein', onclick: () => gehe('auswertung', { reiter: 'offen' }) }, 'Ergebnis & Auswertung →'))) : null;
}
// Technische Angaben zur letzten Berechnung (Details für Fortgeschrittene): Ablauf in fester Reihenfolge, Zeit, Iterationen
function ergebnisTechnik(m) {
  const s = m.statistik;
  const eh = m.endHart !== undefined ? m.endHart : (m.end ? m.end.hart : m.hart);
  const zt = s.zuteilung || {}, co = s.coNachlauf, au = s.aufsicht, nb = s.coNachbesserung;
  const schritte = [
    'a) Fachlehrkräfte und Unterricht: ' + (zt.auto ? (zt.auto - (zt.offen || 0)) + ' von ' + zt.auto + ' Kursen automatisch besetzt' : 'alle Lehrkräfte fest vorgegeben') + (zt.wechsel ? ' – Personal und Stundenplan gemeinsam optimiert (' + zt.wechsel + ' Personalwechsel in der Suche)' : ''),
    'b) Co-Lehrkräfte: ' + (co ? co.ergaenzt.length + ' Kurs' + (co.ergaenzt.length === 1 ? '' : 'e') + ' besetzt' + (co.geteilt ? ', davon ' + co.geteilt + ' blockweise mit mehreren Co-Lehrkräften' : '') + ((co.teilweise || []).length ? ', ' + co.teilweise.length + ' nur teilweise' : '') + (co.fehlend.length ? ', ' + co.fehlend.length + ' ohne Co-Lehrkraft' : '') + (nb && nb.verschoben ? ' · ' + nb.verschoben + (nb.verschoben === 1 ? ' Unterrichtsblock' : ' Unterrichtsblöcke') + ' dafür verlegt' : '') : 'kein Co-Bedarf'),
    'c) Aufsichten: ' + (au ? au.neu + ' Einsätze neu berechnet' + (au.behalten ? ', ' + au.behalten + ' von Hand gesetzte/fixierte behalten' : '') + (au.autoEntfernt ? ', ' + au.autoEntfernt + ' alte automatische Einträge ersetzt' : '') + (au.verdraengt ? ', ' + au.verdraengt + ' fester Einsatz kollidierte mit Unterricht' : '') + (au.offenMin ? ' · ' + au.offenMin + ' Mindestbesetzung(en) offen' : ' · Mindestbesetzung vollständig') : 'keine Aufsichten geplant'),
    'd) Endvalidierung des Gesamtplans: ' + (eh ? hartText(eh) : 'keine harten Fehler'),
    s.ausgleich && s.ausgleich.n > 1 ? 'Ausgleich der Arbeitszeit: Differenz Ist − Soll zwischen ' + zahlDe(s.ausgleich.min, 1) + ' h und ' + zahlDe(s.ausgleich.max, 1) + ' h (Mittel ' + zahlDe(s.ausgleich.mittel, 1) + ' h, Streuung ± ' + zahlDe(s.ausgleich.sd, 1) + ' h)' : null,
    s.muster && s.muster.kurse ? 'Blockaufteilung: bei ' + s.muster.kurse + ' Kursen von der Berechnung gewählt' + (s.muster.wechsel ? ', davon ' + s.muster.wechsel + ' mit 14-tägiger Doppelstunde (Woche A/B)' : '') : null,
    s.sicherheitsnetz ? 'Sicherheitsnetz beim Verbessern: ' + (s.sicherheitsnetz.ersetzt ? 'Freies Verbessern hätte ' + hartText(s.sicherheitsnetz.frei) + ' ergeben (vorher ' + s.sicherheitsnetz.vorher + ') – übernommen wurde der vorsichtige Lauf mit ' + hartText(s.sicherheitsnetz.vorsichtig) + '.' : 'Der vorsichtige Vergleichslauf war nicht besser (' + (s.sicherheitsnetz.vorsichtig === null ? 'abgebrochen' : hartText(s.sicherheitsnetz.vorsichtig)) + ').') : null,
    s.laeufe && s.laeufe.length > 1 ? s.laeufe.length + ' parallele Suchläufe – übernommen der beste (Endvalidierung je Lauf: ' + s.laeufe.map(x => x.hart).join(' / ') + ' harte Fehler)' : null
  ].filter(Boolean);
  return h('div', {},
    h('p', { class: 'muted' }, 'Zeit ' + zahlDe(s.zeit, 1) + ' s · ' + zahlDe(s.iterationen) + ' Iterationen · Strafpunkte ' + zahlDe(m.weich, 1) + ' · Ende: ' + s.abbruch + '.'),
    h('ul', { class: 'klein', id: 'ergebnisSchritte', style: { margin: '0 0 8px 18px', padding: 0 } }, schritte.map(t => h('li', {}, t))));
}

