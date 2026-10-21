// ---------- Personalgrundlage einer Berechnung ----------
// Gespeichert bleiben nur zwingende Personalvorgaben (von Hand eingetragene Fach- und Co-Lehrkräfte). Automatische Zuordnungen früherer
// Berechnungen sind keine Eingabe: Eine volle Berechnung bestimmt sie neu. opt.behalten (Weiterrechnen vom aktuellen Plan, Teilneuplanung,
// Reparatur, „Änderungen minimal“): Die automatisch gewählten Fachlehrkräfte des vorhandenen Plans sind der Startwert der Suche.
function personalGrundlage(daten, opt) {
  opt = opt || {};
  const d = JSON.parse(JSON.stringify(daten));
  d.unterrichte.forEach(u => {
    if (u.aufgabe) return;
    // Automatische Co-Zuordnungen entfallen immer – sie werden nach dem fertigen Fachunterricht neu bestimmt.
    u.lehrkraefte = (u.lehrkraefte || []).filter(z => !z.auto || (opt.behalten && z.rolle === 'fach'));
    u.fachAuto = !u.lehrkraefte.some(z => z.rolle === 'fach' && z.lehrer && !z.auto);
  });
  // p.co gehört zu den (entfernten) automatischen Co-Zuordnungen
  const coFest = new Map(d.unterrichte.map(u => [u.id, new Set(u.lehrkraefte.filter(z => z.rolle === 'co').map(z => z.lehrer))]));
  ((d.plan && d.plan.platzierungen) || []).forEach(p => { const f = coFest.get(p.unterricht); if (p.co && p.co.length) p.co = p.co.filter(id => f && f.has(id)); });
  return d;
}
// Rückkopplung aus der Aufsichtsplanung an die Co-Zuteilung: Für jede offene Mindestschicht wird die Person gesucht, der – ohne ihren Springer, der weich ist –
// nur die Wochenarbeitszeit fehlt (D11). Ihr wird in reserve (Minuten je Person) die Arbeitszeit gutgeschrieben, die ihre Aufsichten brauchen (ihre
// bisherigen zählenden Aufsichten plus diese Schicht); die Co-Zuteilung lässt sie frei, weil sie Aufsichten sonst nicht kennt. Liefert true, wenn die Reserve wuchs.
function aufsichtReserve(d, offen, reserve) {
  const ctx = dienstKontext(d, { plan: d.dienste.plan.filter(x => !x.springer) });
  let gewachsen = false;
  for (const o of (offen || []).filter(x => x.prio === 'min')) {
    const b = d.dienste.bedarfe.find(x => x.id === o.bedarf); if (!b) continue;
    const von = minVon(o.beginn), bis = o.ende === '24:00' ? 1440 : minVon(o.ende);
    if (von === null || bis === null) continue;
    const ax = bedarfAusschlussFuerIntervall(b, von, bis);
    const s = schichtAusDienst(ctx, { id: 'reserve', tag: o.tag, typ: o.typ || 'dt_dienst', bereich: o.bereich || null, bedarf: o.bedarf, name: o.name, arbeitszeit: b.arbeitszeit, springer: b.springer, qualifikation: b.qualifikation,
      farbe: b.farbe, beginn: o.beginn, ende: o.ende, rhythmus: { art: 'woechentlich' }, quelle: 'auto', ausschlussPersonen: ax.personen, ausschlussGruppen: ax.gruppen });
    s.start = von; s.end = bis; s.neu = true; s.lehrer = null;
    let beste = null;
    for (const p of ctx.personen) {
      const g = dienstHartGruende(ctx, p, s, true);
      if (!g.length || !g.every(x => x.code === 'D11' && /Wochenarbeitszeit/.test(x.text))) continue;
      const schon = p.dienste.reduce((n, x) => n + (x.zaehlt ? (x.end - x.start) * x.faktor : 0), 0), frei = p.rest - schon, fehlt = (s.end - s.start) - frei;
      if (!beste || fehlt < beste.fehlt) beste = { p, schon, fehlt };
    }
    if (!beste) continue;
    const min = Math.ceil(beste.schon + (s.end - s.start) + 3);
    if (min > (reserve.get(beste.p.id) || 0)) { reserve.set(beste.p.id, min); gewachsen = true; }
  }
  return gewachsen;
}
// Regelbewertung eines Datenstands, so wie er gespeichert wird (frisch kompiliert)
function personalPlanBewertung(d) {
  try {
    const x = planAusDaten(d), tot = bewerteAlles(x.M, x.P, null), k = kostenVon(x.M, tot);
    return { hart: k.hart, weich: k.weich, gesamt: k.gesamt, verstoesse: Array.from(tot) };
  } catch (err) { return { hart: Number.MAX_SAFE_INTEGER, weich: Number.MAX_SAFE_INTEGER, gesamt: Number.MAX_SAFE_INTEGER, verstoesse: [] }; }
}
/* ---------------------------------------------------------------------------------------------------------------------
   GESAMTBERECHNUNG („Plan berechnen“) – immer in dieser Reihenfolge:
     a) Fachunterricht und Fachlehrkräfte: EINE gemeinsame Suche über Zeit, Raum und Personal (loeseUnterricht). Eine automatisch gewählte
        Lehrkraft ist bis zum Schluss eine Variable der Suche – nie eine Vorbedingung.
     b) Co-Lehrkräfte: blockweise auf Grundlage des fertigen Fachunterrichts, mit Prüfung jeder einzelnen Zuordnung.
     c) Aufsichten: vollständige Neuberechnung gegen den fertigen Fach- und Co-Plan (nie gegen einen alten Stand).
     d) Endvalidierung: eine zentrale Prüfung des Gesamtplans, wie er gespeichert wird. Die Zahl „harte Fehler“ (ergebnis.end.hart)
        stammt ausschließlich von dort; Zwischenwerte der Suche fließen nicht ein.
   --------------------------------------------------------------------------------------------------------------------- */
async function loeseStundenplan(data, konf, cb) {
  konf = konf || {}; cb = cb || {};
  const t0 = jetzt();
  const voll = konf.startwert !== 'aktuell' && !konf.minimal && !konf.reparatur && !(konf.teil && konf.teil.art);
  // Weiterrechnen: bisherige automatische Co-Einsätze und die Ausgangsqualität (Pflichtverstöße des vorhandenen Plans mit den jetzigen Daten)
  const coBisher = voll ? null : coBisherAus(data);
  let startEnd = null;
  if (!voll && !konf.reparatur && !(konf.teil && konf.teil.art) && !konf._konservativ && data.plan && data.plan.platzierungen && data.plan.platzierungen.length) {
    try { startEnd = endValidierung(JSON.parse(JSON.stringify(data))); } catch (err) { startEnd = null; }
  }
  const d = personalGrundlage(data, { behalten: !voll });
  const origL = new Map(data.unterrichte.map(u => [u.id, JSON.stringify(u.lehrkraefte || [])]));
  const gesamtSek = Math.max(1, _num(konf.zeitlimit, 60));
  const stop = () => !!(cb.stop && cb.stop());
  let letzter = null; // letzter Fortschritt der Suche (für die Meldungen der folgenden Stufen)
  // Fortschritt über die ganze Berechnung: gesamt (0–1) und der laufende Schritt (0 Fachunterricht und Personal, 1 Co-Lehrkräfte, 2 Aufsichten,
  // 3 Prüfung, 4 fertig). Die Suche nimmt den größten Teil der Zeit ein; Co-Lehrkräfte, Aufsichten und Prüfung folgen danach.
  const STUFE = { 'Co-Lehrkräfte': [0.88, 1], Aufsichten: [0.92, 2], Endvalidierung: [0.98, 3], 'Sicherheitsprüfung': [0.98, 3], Fertig: [1, 4] };
  const melde = (phase, extra) => { if (cb.progress) { const st = STUFE[phase] || [1, 4]; cb.progress(Object.assign({ iterationen: 0, kostenHart: 0, besteHart: 0, besteWeich: 0, verstoesse: [], unplatziert: 0 }, letzter || {}, { phase, prozent: 1, gesamt: st[0], schritt: st[1], zeit: (jetzt() - t0) / 1000 }, extra || {})); } };

  // ---------- a) Fachunterricht und Fachlehrkräfte ----------
  const out = await loeseUnterricht(d, konf, Object.assign({}, cb, { progress: p => { letzter = p; if (cb.progress) cb.progress(Object.assign({}, p, { gesamt: 0.88 * _clamp(p.prozent || 0, 0, 1), schritt: 0 })); } }));
  (out.lehrkraefte || []).forEach(x => { const u = d.unterrichte.find(q => q.id === x.id); if (u) u.lehrkraefte = x.lehrkraefte; });
  musterUebernehmen(d, out.muster);
  d.plan.platzierungen = JSON.parse(JSON.stringify(out.platzierungen));
  out.statistik = out.statistik || {};

  // ---------- b) Co-Lehrkräfte: erst jetzt, auf dem fertigen Fachunterricht mit seinen echten Uhrzeiten ----------
  melde('Co-Lehrkräfte');
  let co = coNachPlanErgaenzen(d, { ersetzen: true, bisher: coBisher });
  // Bleibt Co-Bedarf offen, weil zur geplanten Zeit niemand frei ist, wird der einzelne Block nachjustiert und die Co-Zuteilung komplett neu bestimmt
  // (nicht bei Teilneuplanung, Reparatur und „Änderungen minimal“ – dort bleibt der übrige Plan stehen).
  if (!konf.minimal && !konf.reparatur && !(konf.teil && konf.teil.art) && (co.fehlend.length || co.teilweise.length) && !stop()) {
    try { const nb = coNachbessern(d, { zeitlimit: Math.max(800, Math.min(4000, gesamtSek * 100)), bisher: coBisher }); if (nb.co) co = nb.co; out.statistik.coNachbesserung = { verschoben: nb.verschoben.length, pruefungen: nb.pruefungen }; }
    catch (err) { out.statistik.coNachbesserung = { fehler: String(err && err.message || err) }; }
  }
  const vorrang = new Set(); // Kurse mit Co-Lücken: in jeder weiteren Co-Zuteilung zuerst
  // Sicherung der Teile des Datenstands, die Co-Zuteilung und Aufsichtsplanung verändern (für Wiederholungen, die nur bei Verbesserung gelten)
  const sichere = () => ({ platz: JSON.stringify(d.plan.platzierungen), lk: JSON.stringify(d.unterrichte.map(u => u.lehrkraefte)), dienste: JSON.stringify(d.dienste) });
  const stelleHer = s => { d.plan.platzierungen = JSON.parse(s.platz); JSON.parse(s.lk).forEach((l, i) => { d.unterrichte[i].lehrkraefte = l; }); d.dienste = JSON.parse(s.dienste); };
  // Bleiben Co-Lücken, wird die Co-Zuteilung mit den betroffenen Kursen zuerst wiederholt (bis zu dreimal); übernommen nur, wenn weniger Co-Stunden fehlen
  // und die Regelverstöße des Plans nicht steigen
  if (!konf.minimal && !konf.reparatur && !(konf.teil && konf.teil.art) && !konf._ohneCoVorrang && (co.fehlend.length || co.teilweise.length) && !stop()) {
    const rv = { runden: 0, angenommen: 0 };
    let luecke = coLuecken(d).summe;
    for (let runde = 0; runde < 3 && luecke > 1e-9 && !stop(); runde++) {
      coLuecken(d).liste.forEach(x => vorrang.add(x.u.id));
      const sicher = sichere(), hartVor = personalPlanBewertung(d).hart;
      const co2 = coNachPlanErgaenzen(d, { ersetzen: true, bisher: coBisher, vorrang });
      const luecke2 = coLuecken(d).summe;
      rv.runden++;
      if (luecke2 < luecke - 1e-9 && personalPlanBewertung(d).hart <= hartVor) { co = co2; luecke = luecke2; rv.angenommen++; }
      else { stelleHer(sicher); break; }
    }
    out.statistik.coVorrang = rv;
  }
  const coUebernehmen = () => {
    out.platzierungen = JSON.parse(JSON.stringify(d.plan.platzierungen));
    out.statistik.lehrkraefte = d.unterrichte.filter(u => origL.has(u.id) && origL.get(u.id) !== JSON.stringify(u.lehrkraefte || [])).map(u => ({ id: u.id, lehrkraefte: JSON.parse(JSON.stringify(u.lehrkraefte || [])) }));
    out.statistik.zuteilung = Object.assign({}, out.statistik.zuteilung, { geaendert: out.statistik.lehrkraefte.length });
    out.statistik.coNachlauf = co;
  };
  coUebernehmen();
  delete out.lehrkraefte;

  // ---------- c) Aufsichten: immer neu, gegen genau diesen Fach- und Co-Plan ----------
  melde('Aufsichten');
  let auf = null;
  if (d.dienste) {
    try { auf = aufsichtenNeuBerechnen(d, { stabil: true, zeitlimit: Math.max(600, Math.min(4000, gesamtSek * 60)) }); }
    catch (err) { auf = null; out.statistik.aufsichtFehler = String(err && err.message || err); }
  }
  // Rückkopplung: Bleibt eine Mindestaufsicht offen, weil einer verfügbaren Person nur noch die Wochenarbeitszeit fehlt (die Co-Zuteilung hat sie
  // vorher aufgebraucht), wird die Co-Zuteilung mit einer Arbeitszeit-Reserve für diese Person wiederholt und die Aufsicht neu geplant.
  // Übernommen wird das Ergebnis nur, wenn die Endvalidierung danach weniger Pflichtverstöße meldet.
  if (auf && (auf.statistik.offenMin || 0) > 0 && !konf._ohneRueckkopplung && !konf.minimal && !konf.reparatur && !(konf.teil && konf.teil.art) && !stop()) {
    const reserve = new Map(), rk = { runden: 0, angenommen: 0, reserve: [] };
    let hart0 = null;
    for (let runde = 0; runde < 3 && (auf.statistik.offenMin || 0) > 0 && !stop(); runde++) {
      if (!aufsichtReserve(d, auf.offen, reserve)) break;
      if (hart0 === null) hart0 = endValidierung(d).hart;
      const sicher = sichere();
      let co2 = coNachPlanErgaenzen(d, { ersetzen: true, bisher: coBisher, reserve, vorrang });
      // fehlen durch die Reserve Co-Stunden, bekommen diese Kurse in einem zweiten Anlauf Vorrang
      { const l2 = coLuecken(d); if (l2.summe > 1e-9) { l2.liste.forEach(x => vorrang.add(x.u.id)); co2 = coNachPlanErgaenzen(d, { ersetzen: true, bisher: coBisher, reserve, vorrang }); } }
      let auf2 = null;
      try { auf2 = aufsichtenNeuBerechnen(d, { stabil: true, zeitlimit: Math.max(600, Math.min(1500, gesamtSek * 60)) }); } catch (err) { auf2 = null; }
      rk.runden++;
      const hart1 = auf2 ? endValidierung(d).hart : Infinity;
      if (auf2 && hart1 < hart0) { co = co2; auf = auf2; hart0 = hart1; rk.angenommen++; coUebernehmen(); }
      else { stelleHer(sicher); break; }
    }
    rk.reserve = [...reserve].map(([id, min]) => ({ lehrer: id, minuten: min }));
    if (rk.runden) out.statistik.aufsichtRueckkopplung = rk;
  }
  out.dienste = auf ? { plan: auf.plan, offen: auf.offen, stand: auf.stand, verdraengt: auf.verdraengt } : null;
  out.statistik.aufsicht = auf ? auf.statistik : null;

  out.statistik.ausgleich = ausgleichKennzahl(d);
  out.statistik.seed = konf.seed; out.statistik.strategie = konf.strategie === 'lahc' ? 'lahc' : 'sa';

  // ---------- d) Endvalidierung des Gesamtplans, wie er gespeichert wird ----------
  melde('Endvalidierung');
  const real = personalPlanBewertung(d);
  out.hart = real.hart; out.weich = real.weich; out.kosten = real.gesamt; out.verstoesse = real.verstoesse;
  out.regelHart = real.hart;
  try { const e = endValidierung(d); out.end = { hart: e.hart, ampel: e.ampel, pflicht: e.pflicht, hinweise: e.hinweise, weich: e.weich }; }
  catch (err) { out.end = null; out.statistik.endFehler = String(err && err.message || err); }
  // ---------- e) Sicherheitsnetz beim Weiterrechnen: nie mehr Pflichtverstöße als der vorhandene Plan ----------
  // Hat das freie Verbessern mehr Pflichtverstöße als der Ausgangsplan (mit den jetzigen Daten), wird ein zweiter, sehr vorsichtiger Lauf gerechnet:
  // Was liegt, bleibt liegen (hohe Stabilitätskosten); gelegt wird vor allem Neues. Übernommen wird der bessere der beiden Läufe.
  if (startEnd && out.end && out.end.hart > startEnd.hart && !stop()) {
    melde('Sicherheitsprüfung');
    const k2 = Object.assign({}, konf, { _konservativ: true, _stab: 400, startwert: 'aktuell', zeitlimit: Math.max(3, Math.round(gesamtSek * 0.3)), iterLimit: konf.iterLimit ? Math.max(2000, Math.round(konf.iterLimit * 0.3)) : 0 });
    let alt = null;
    // Fortschritt des Vergleichslaufs: im letzten Schritt („Prüfung“) zwischen 98 und 100 %
    const prog2 = cb.progress ? p => cb.progress(Object.assign({}, p, { phase: 'Sicherheitsprüfung', gesamt: 0.98 + 0.02 * _clamp(p.gesamt || 0, 0, 1), schritt: 3 })) : null;
    try { alt = await loeseStundenplan(data, k2, { stop: cb.stop, progress: prog2 }); } catch (err) { alt = null; }
    const uz = x => (x.statistik && x.statistik.unplatziert) || 0;
    if (alt && alt.end && (alt.end.hart < out.end.hart || (alt.end.hart === out.end.hart && (uz(alt) < uz(out) || (uz(alt) === uz(out) && alt.weich <= out.weich))))) {
      alt.statistik.sicherheitsnetz = { ersetzt: true, vorher: startEnd.hart, frei: out.end.hart, vorsichtig: alt.end.hart };
      alt.statistik.zeit = (jetzt() - t0) / 1000;
      melde('Fertig', { besteHart: alt.end.hart, kostenHart: alt.end.hart, besteWeich: alt.weich, verstoesse: alt.verstoesse });
      return alt;
    }
    out.statistik.sicherheitsnetz = { ersetzt: false, vorher: startEnd.hart, frei: out.end.hart, vorsichtig: alt && alt.end ? alt.end.hart : null };
  }
  out.statistik.zeit = (jetzt() - t0) / 1000;
  melde('Fertig', { besteHart: out.end ? out.end.hart : out.hart, kostenHart: out.end ? out.end.hart : out.hart, besteWeich: out.weich, verstoesse: out.verstoesse });
  return out;
}
// Vergleich zweier Ergebnisse von loeseStundenplan (parallele Suchläufe): zuerst die harten Fehler der Endvalidierung, dann nicht platzierte
// Blöcke, dann Strafpunkte des Stundenplans plus Ausgleich der Arbeitszeit (Summe der Abweichungsquadrate wie in der Suche). < 0: a besser.
function ergebnisVergleich(a, b) {
  const h = x => (x.end ? x.end.hart : x.hart) || 0, u = x => (x.statistik && x.statistik.unplatziert) || 0;
  const w = x => { const az = x.statistik && x.statistik.ausgleich; let f = 0; if (az && az.liste && az.n > 1) az.liste.forEach(y => { f += (y.diff - az.mittel) * (y.diff - az.mittel); }); return (x.weich || 0) + PERSONAL_W.ausgleich * f; };
  return h(a) - h(b) || u(a) - u(b) || w(a) - w(b);
}
// Von der Berechnung gewählte Blockaufteilung in einen Datenstand schreiben (u.bloeckeAuto / u.bloeckeAutoWoche)
function musterUebernehmen(d, muster) {
  (muster || []).forEach(x => { const u = d.unterrichte.find(q => q.id === x.id); if (u) { u.bloeckeAuto = x.bloecke.slice(); u.bloeckeAutoWoche = x.woche.slice(); } });
}
// Ausgleich der Arbeitszeit: Differenz Ist − Soll (Stunden) aller Personen mit Soll-Arbeitszeit – Unterricht mit Vorbereitung, Co-Einsätze,
// Aufgaben, Termine, Klassenleitung und Aufsichten. Liefert { n, min, max, spanne, mittel, sd, liste: [{ lehrer, diff }] }.
function ausgleichKennzahl(d) {
  try {
    const az = arbeitszeiten(d), liste = az.liste.filter(x => x.soll > 0).map(x => ({ lehrer: x.lehrer, diff: Math.round((x.summe - x.soll) / 6) / 10 }));
    if (!liste.length) return { n: 0, liste };
    const w = liste.map(x => x.diff), n = w.length, mittel = w.reduce((a, b) => a + b, 0) / n;
    const min = Math.min(...w), max = Math.max(...w), sd = Math.sqrt(w.reduce((a, b) => a + (b - mittel) * (b - mittel), 0) / n);
    return { n, min, max, spanne: Math.round((max - min) * 10) / 10, mittel: Math.round(mittel * 10) / 10, sd: Math.round(sd * 10) / 10, liste };
  } catch (err) { return { n: 0, liste: [], fehler: String(err && err.message || err) }; }
}
// Zentrale Endvalidierung: prüft den Gesamtplan, wie er im Datenstand d steht – frisch kompiliert, ohne Zähler oder Zwischenwerte der Berechnung.
// Geprüft werden alle Pflichtbedingungen (planStatus): Pflichtkurse und Sollstunden, Fachlehrkraft und Fachqualifikation, Doppelbelegungen von
// Lehrkräften, Co-Lehrkräften, Klassen und Räumen in echten Uhrzeiten (Zeitprofile), Co-Bedarf, Mindestbesetzung von Aufsichten und Springern,
// Ausschlussregeln, Überschneidungen Unterricht–Aufsicht und Aufsicht–Aufsicht, Arbeitszeitgrenzen und manuelle Fixierungen.
// Liefert { hart, ampel, pflicht, hinweise, weich, regelHart, verstoesse }; hart = Zahl der verletzten Einzelpunkte über alle Pflichtbedingungen.
function endValidierung(d, opt) {
  const st = planStatus(d, opt);
  return { hart: st.hart || 0, ampel: st.ampel, pflicht: st.pflicht, hinweise: st.hinweise, weich: st.weich, regelHart: st.regelHart || 0, verstoesse: st.verstoesse || [] };
}

function pause0() { return new Promise(r => setTimeout(r, 0)); }

// Diagnose: je nicht platziertem Ereignis die gescheiterten Regeln (gezählt) und ein Vorschlag
function diagnoseErstellen(M, P, beweglich) {
  const out = { ereignisse: [], vorschlag: '', lockerbar: [] };
  const gesamt = {};
  for (let e = 0; e < M.E.length; e++) {
    if (P.start[e] >= 0 || !M.aktiv[e] || (beweglich && !beweglich[e] && M.E[e].fixStart < 0)) continue;
    const zaehl = {}, beispiele = {}, lehrerZ = {};
    for (let s = 0; s < M.S; s++) {
      if (!M.slotOk[s]) continue;
      const g = slotGrund(M, P, e, s);
      if (!g.r) continue;
      zaehl[g.r] = (zaehl[g.r] || 0) + 1;
      if (!beispiele[g.r]) beispiele[g.r] = g.text;
      if (g.t !== undefined) lehrerZ[g.t] = (lehrerZ[g.t] || 0) + 1;
      gesamt[g.r] = (gesamt[g.r] || 0) + 1;
    }
    const top = Object.entries(zaehl).sort((a, b) => b[1] - a[1]);
    let vorschlag = '';
    if (top.length) {
      const r = top[0][0];
      const tl = Object.entries(lehrerZ).sort((a, b) => b[1] - a[1])[0];
      const lk = tl ? M.lKz[+tl[0]] : '';
      vorschlag = ({
        H05: 'Sperrzeiten lockern' + (lk ? ' (z. B. bei ' + lk + ')' : '') + '.',
        H01: 'Lehrkraft ' + lk + ' ist zu den möglichen Zeiten belegt – Verfügbarkeit erweitern oder Unterricht an andere Lehrkraft geben.',
        H02: 'Die Klasse ist zu den möglichen Zeiten schon belegt – Stundenkorridor erweitern oder Sperrzeiten der Lehrkraft lockern.',
        H03: 'Zu wenige freie Räume des benötigten Typs – weiteren Raum anlegen oder teilbar setzen.',
        H11: 'Stundenkorridor oder Tagesmaximum der Klasse erweitern („Klassenkorridor“ probeweise lockern).',
        H07: 'Blockaufteilung ändern oder Doppelstundenstellen im Zeitraster prüfen („Blockstruktur“ probeweise lockern).',
        H12: 'Tagesgrenzen der Lehrkraft lockern („Lehrkraft-Tagesgrenzen“ probeweise lockern).',
        H13: '„max. pro Tag“ des Fachs oder „Höchstens je Tag“ der Klasse (Stundentafel) erhöhen („Fach je Tag begrenzt“ probeweise lockern).',
        H15: '„Klassen ohne Freistunden“ probeweise lockern oder auf weich stellen.',
        H10: 'Zeitraster prüfen.', H09: 'Fixierung lösen.',
        H16: 'Wochenarbeitszeit oder Höchstarbeitszeit je Tag der Lehrkraft' + (lk ? ' ' + lk : '') + ' prüfen, Stunden an andere Personen geben oder „Arbeitszeitgrenzen“ auf „weich“ stellen.'
      })[r] || 'Regel ' + r + ' probeweise lockern.';
    }
    out.ereignisse.push({ e, name: evName(M, e), unterricht: M.U[M.E[e].parts[0].u].id, gruende: top.map(([r, n]) => ({ r, n, beispiel: beispiele[r] })), vorschlag });
  }
  const lockerbar = ['H05', 'H07', 'H11', 'H12', 'H13', 'H15', 'H16'];
  // harte Regeln mit Restverstößen ebenfalls als lockerbar anbieten
  const tot = bewerteAlles(M, P, null);
  const kand = new Set();
  Object.keys(gesamt).forEach(r => { if (lockerbar.includes(r)) kand.add(r); });
  lockerbar.forEach(r => { if (tot[RI[r]] > 0 && M.hart[RI[r]]) kand.add(r); });
  out.lockerbar = [...kand];
  const g = Object.entries(gesamt).sort((a, b) => b[1] - a[1]);
  if (g.length) out.vorschlag = 'Am häufigsten scheiterten Versuche an ' + g.slice(0, 3).map(([r, n]) => regelZitat(r) + ' (' + n + '×)').join(', ') + '.';
  // verbleibende harte Verstöße (auch wenn alles platziert ist)
  const rest = M.hartIdx.filter(r => r !== RI.H04 && tot[r] > 0).map(r => ({ r: REGELN[r].id, n: tot[r] }));
  out.rest = rest;
  if (rest.length) {
    const top = rest.slice().sort((a, b) => b.n - a.n)[0].r;
    const tipp = { H15: '„Klassen ohne Freistunden“ probeweise lockern oder auf weich stellen; oft hilft auch ein längeres Zeitlimit.', H12: 'Tagesgrenzen der Lehrkräfte prüfen oder „Lehrkraft-Tagesgrenzen“ probeweise lockern.', H13: '„max. pro Tag“ der Fächer und „Höchstens je Tag“ der Klassen prüfen oder „Fach je Tag begrenzt“ probeweise lockern.', H11: 'Stundenkorridor der Klassen erweitern oder „Klassenkorridor“ probeweise lockern.', H07: 'Blockaufteilung prüfen oder „Blockstruktur“ probeweise lockern.', H05: 'Sperrzeiten prüfen oder „Sperrzeiten eingehalten“ probeweise lockern.' }[top] || 'Regel ' + regelZitat(top) + ' prüfen.';
    out.vorschlag = (out.vorschlag ? out.vorschlag + ' Es' : (out.ereignisse.length ? 'Es' : 'Alle Blöcke sind platziert, aber es')) + ' bleiben harte Verstöße: ' + rest.map(x => regelZitat(x.r) + ' (' + x.n + '×)').join(', ') + '. Vorschlag: ' + tipp;
  }
  return out;
}

