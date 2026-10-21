// ---------- Teilung eines Fachs in die Halbgruppen A und B ----------
// Die beiden Halbgruppen einer Klasse: Gruppen namens A/B oder 1/2 (auch „Gr. 1“, „Gruppe A“ …). Namen lassen sich im Klassen-Dialog ändern.
function halbName(g) { const n = String((g && g.name) || '').toLowerCase().replace(/^(gruppe|gr\.?|g)\s*/, '').trim(); return n === 'a' || n === '1' ? 0 : n === 'b' || n === '2' ? 1 : -1; }
function halbPaar(kl) {
  if (kl.halb && kl.halb.length === 2) { const x = kl.gruppen.find(g => g.id === kl.halb[0]), y = kl.gruppen.find(g => g.id === kl.halb[1]); if (x && y) return [x, y]; }
  const a = kl.gruppen.find(g => halbName(g) === 0), b = kl.gruppen.find(g => halbName(g) === 1); return a && b ? [a, b] : null;
}
function halbgruppen(kl) {
  const hp = halbPaar(kl); if (hp) { kl.halb = [hp[0].id, hp[1].id]; return hp; }
  let gA = kl.gruppen.find(g => halbName(g) === 0), gB = kl.gruppen.find(g => halbName(g) === 1);
  // neue Gruppen heißen wie die schon vorhandene (1/2 oder A/B)
  const ziffer = (gA && /1/.test(gA.name)) || (gB && /2/.test(gB.name)), vor = ((gA || gB || { name: '' }).name.match(/^(gruppe\s*|gr\.?\s*|g\s*(?=[12ab]$))/i) || [''])[0];
  if (!gA) { gA = { id: neueId('g'), name: vor + (ziffer ? '1' : 'A'), schueler: Math.ceil(kl.schueler / 2) }; kl.gruppen.push(gA); }
  if (!gB) { gB = { id: neueId('g'), name: vor + (ziffer ? '2' : 'B'), schueler: Math.floor(kl.schueler / 2) }; kl.gruppen.push(gB); }
  kl.halb = [gA.id, gB.id];
  return [gA, gB];
}
// Zwei einfache Gruppen-Unterrichte (A und B, nicht gekoppelt, beide mit demselben Wochenanteil) eines Klasse-Fach-Paars?
function teilungsPaar(kl, alle) {
  if (alle.length !== 2) return null;
  const hp = halbPaar(kl); if (!hp) return null;
  const gA = hp[0], gB = hp[1];
  const einfach = u => u.klassen.length === 1 && !u.kopplung && u.gruppen.length === 1;
  if (!alle.every(einfach) || wochenAnteil(alle[0].rhythmus) !== wochenAnteil(alle[1].rhythmus)) return null;
  const a = alle.find(u => u.gruppen[0] === gA.id), b = alle.find(u => u.gruppen[0] === gB.id);
  return a && b ? [a, b] : null;
}
// Bringt die Unterrichte eines Klasse-Fach-Paars mit der Angabe „in Gruppen geteilt“ (klasse.teilung) in Einklang.
// Liefert null (nicht zuständig: normales Paar), sonst 'neu' | 'geteilt' | 'geaendert' | 'ok' | 'zusammen' | 'entfernt' | 'offen'.
function teilungAbgleichen(d, kl, fa, soll, opt) {
  opt = opt || {};
  const alle = d.unterrichte.filter(u => !u.aufgabe && u.fach === fa.id && u.klassen.includes(kl.id));
  const weg = ids => { d.plan.platzierungen = d.plan.platzierungen.filter(p => !ids.includes(p.unterricht)); if (d.plan.besetzung) d.plan.besetzung = d.plan.besetzung.filter(p => !ids.includes(p.unterricht)); if (d.plan.frei) d.plan.frei = d.plan.frei.filter(p => !ids.includes(p.unterricht)); };
  const stunden = (u, ws) => { if (u.wochenstunden === ws) return false; u.wochenstunden = ws; if (u.bloecke.length && u.bloecke.reduce((a, b) => a + b, 0) !== ws) { u.bloecke = []; u.bloeckeWoche = []; } u.lehrkraefte.forEach(z => { if (z.stundenAnteil > ws) z.stundenAnteil = ws; }); weg([u.id]); return true; };
  if (kl.teilung && kl.teilung[fa.id]) {
    const paar = teilungsPaar(kl, alle);
    // halbe Wochenstunden (nur Woche A oder B): geht in Halbgruppen nur, wenn die Gruppen-Unterrichte schon im A-/B-Rhythmus laufen
    if (soll && !Number.isInteger(soll) && !(paar && paar.every(u => Number.isInteger(soll / wochenAnteil(u.rhythmus))))) return 'offen';
    if (!soll) {
      if (paar && opt.entfernen) { d.unterrichte = d.unterrichte.filter(u => !paar.includes(u)); weg(paar.map(u => u.id)); return 'entfernt'; }
      return alle.length ? 'offen' : 'ok';
    }
    if (!alle.length) {
      if (opt.anlegen === false) return 'ok';
      const [gA, gB] = halbgruppen(kl);
      [gA, gB].forEach(g => d.unterrichte.push(nUnterricht({ fach: fa.id, klassen: [kl.id], gruppen: [g.id], wochenstunden: soll, lehrkraefte: [], vorbereitung: fa.vorbereitung, fachAuto: true })));
      return 'neu';
    }
    if (paar) { const a = stunden(paar[0], soll / wochenAnteil(paar[0].rhythmus)), b = stunden(paar[1], soll / wochenAnteil(paar[1].rhythmus)); return a || b ? 'geaendert' : 'ok'; }
    const u = alle[0];
    if (alle.length === 1 && u.klassen.length === 1 && !u.gruppen.length && !u.kopplung && u.rhythmus === 'jede') {
      const [gA, gB] = halbgruppen(kl);
      const b = JSON.parse(JSON.stringify(u));
      b.id = neueId('u'); b.fixiert = []; b.gruppen = [gB.id];
      u.gruppen = [gA.id];
      stunden(u, soll); stunden(b, soll);
      d.unterrichte.splice(d.unterrichte.indexOf(u) + 1, 0, b);
      weg([u.id]);
      return 'geteilt';
    }
    return 'offen';
  }
  // ohne Teilung: ein Gruppen-Paar wird nur auf ausdrücklichen Wunsch wieder zu einem Unterricht der ganzen Klasse
  if (opt.zusammen) {
    const paar = teilungsPaar(kl, alle);
    if (paar) {
      paar[0].gruppen = [];
      if (soll && Number.isInteger(soll)) { paar[0].rhythmus = 'jede'; stunden(paar[0], soll); } // ganze Stundenzahl: wieder jede Woche
      else if (soll && Number.isInteger(soll / wochenAnteil(paar[0].rhythmus))) stunden(paar[0], soll / wochenAnteil(paar[0].rhythmus));
      d.unterrichte = d.unterrichte.filter(u => u !== paar[1]); weg([paar[0].id, paar[1].id]);
      return 'zusammen';
    }
  }
  return null;
}
// Geteilte Gruppen: Unterrichtet dieselbe Person dasselbe Fach in mehreren Gruppen derselben Klasse (z. B. Kunst in Gruppe A und in Gruppe B),
// zählt die Vorbereitung nur einmal. Liefert die Menge 'unterrichtId|lehrerId' der Unterrichte, die für diese Person OHNE Vorbereitung zählen.
function ohneVorbSet(d) {
  const out = new Set(), je = new Map(), kI = new Map(d.klassen.map(k => [k.id, k]));
  d.unterrichte.forEach(u => {
    if (u.aufgabe || !u.fach || !u.gruppen || !u.gruppen.length || u.klassen.length !== 1 || u.vorbereitung === false) return;
    const kl = kI.get(u.klassen[0]); if (!kl || !kl.teilung || !kl.teilung[u.fach]) return; // nur für Fächer mit Kennzeichen „in Gruppen geteilt“
    const k = u.klassen[0] + '|' + u.fach; if (!je.has(k)) je.set(k, []); je.get(k).push(u);
  });
  je.forEach(liste => {
    if (liste.length < 2) return;
    // Die Vorbereitung zählt in der Gruppe mit den meisten Stunden (bei Gleichstand die erste nach ID) – unabhängig von der Reihenfolge der Unterrichte
    const sortiert = liste.slice().sort((a, b) => b.wochenstunden - a.wochenstunden || String(a.gruppen[0]).localeCompare(String(b.gruppen[0])) || String(a.id).localeCompare(String(b.id)));
    const erste = new Map(); // Person|Rolle → Gruppe, in der die Vorbereitung zählt
    sortiert.forEach(u => { const sig = u.gruppen.slice().sort().join(','); u.lehrkraefte.forEach(z => { if (!z.lehrer) return; const key = z.lehrer + '|' + z.rolle; if (!erste.has(key)) erste.set(key, sig); else if (erste.get(key) !== sig) out.add(u.id + '|' + z.lehrer); }); });
  });
  return out;
}
// ---------- Arbeitszeit je Lehrkraft (Minuten je Woche) ----------
// Unterricht + Vorbereitung (Lehrkraft 35 min, Co 17 min je gehaltener Unterrichtsstunde, abschaltbar je Unterricht) + Klassenleitung 90 min + Aufsichten
function standardMinuten(sch) { const l = sch.stunden.filter(s => !s.istPause).map(s => s.dauer || 45); return l.length ? l.reduce((a, b) => a + b, 0) / l.length : 45; }
function arbeitszeiten(daten, opt) {
  opt = opt || {};
  const sch = daten.schule, am = sch.arbeitszeitModell || ARBEITSZEIT_STD, std = standardMinuten(sch);
  const bl = bloeckeAlle(daten);
  const liste = daten.lehrer.map(l => ({ lehrer: l.id, kuerzel: l.kuerzel || l.name || '?', name: l.name, ausgebildet: l.ausgebildet !== false, art: l.art || (l.ausgebildet === false ? 'co' : 'lk'), soll: (l.arbeitszeit || 0) * 60, sollStd: 0, hatSollStd: false, istL: 0, tagMax: Math.round((l.maxArbeitTag || 0) * 60), tag: null, tagUeber: 0, aufgaben: 0, termine: 0, aufgStd: 0, springer: 0, istStd: 0, unterricht: 0, vorb: 0, co: 0, coVorb: 0, kl: 0, aufsicht: 0, dienst: 0, gta: 0, fruehdienst: 0, spaetdienst: 0, sonstigeDienste: 0, stunden: 0, coStunden: 0, summe: 0, diff: 0 }));
  const by = new Map(liste.map(x => [x.lehrer, x]));
  // Unterrichtsdeputat (Höchstzahl, Lehrkraft + Co zusammen) nur, wenn die Option eingeschaltet ist und bei der Person etwas eingetragen wurde
  // leeres Deputat (null) = keine Grenze; 0 = keine Unterrichtsstunde
  if (am.stundenSoll) daten.lehrer.forEach(l => { const x = by.get(l.id); x.hatSollStd = l.deputat !== null && l.deputat !== undefined; x.sollStd = x.hatSollStd ? l.deputat : 0; });
  daten.lehrer.forEach(l => { if (l.klassenleitung && daten.klassen.some(k => k.id === l.klassenleitung)) by.get(l.id).kl = am.klassenleitungMin; });
  const uMap = new Map(daten.unterrichte.map(u => [u.id, u]));
  const ohneV = ohneVorbSet(daten);
  // opt.protokoll: jede einzelne Buchung festhalten – Grundlage des Arbeitszeitnachweises je Person (dieselben Zahlen wie die Übersicht)
  const prot = opt.protokoll ? [] : null;
  if (prot) daten.lehrer.forEach(l => { const x = by.get(l.id); if (x.kl) prot.push({ lehrer: l.id, art: 'kl', klasse: l.klassenleitung, min: x.kl }); });
  // min = Unterrichtsminuten, std2 = Unterrichtsstunden (UStd., A/B-Stunden halb); Vorbereitung = feste Minuten je UStd. nach Rolle
  const buche = (x, rolle, min, std2, vorb, u, info) => {
    const art = u && u.aufgabe ? 'aufgabe' : rolle === 'fach' ? 'fach' : 'co';
    const vm = art === 'aufgabe' || !vorb ? 0 : std2 * (art === 'fach' ? am.vorbLehrkraft : am.vorbCo);
    if (prot) prot.push(Object.assign({ lehrer: x.lehrer, art, u: u ? u.id : null, min, ustd: std2, vorbMin: vm }, info || {}));
    if (art === 'aufgabe') { x.aufgaben += min; if (u.anrechnung !== false) x.aufgStd += std2; return; }
    if (art === 'fach') { x.unterricht += min; x.stunden += std2; x.vorb += vm; }
    else { x.co += min; x.coStunden += std2; x.coVorb += vm; }
  };
  const ohneGrund = (u, lid) => u.vorbereitung === false ? 'kurs' : lid && ohneV.has(u.id + '|' + lid) ? 'geteilt' : '';
  const nutzePlan = !opt.geplant && daten.plan.platzierungen.length > 0;
  if (nutzePlan) {
    const zc = zeitCache(daten), freiM = freiMap(daten), handB = besetzungMap(daten);
    daten.plan.platzierungen.forEach(p => {
      const u = uMap.get(p.unterricht); if (!u) return;
      const b = bl.get(u.id);
      const w = u.rhythmus !== 'jede' ? u.rhythmus : (b && b.woche[p.blockNr - 1]) || 'jede';
      const f = w === 'jede' ? 1 : 0.5;
      const min = platzMinuten(daten, u, p, zc); // nach Zeitprofil; Aufgaben mit „Pausen zählen“ als ganze Spanne
      const oL = freiM.get(p.unterricht + '|' + p.blockNr), hd = handB.get(p.unterricht + '|' + p.blockNr) || [];
      u.lehrkraefte.forEach(z => { const x = by.get(z.lehrer); if (!x) return; if (z.modus === 'anteilig' && !p.co.includes(z.lehrer)) return; if ((oL && oL.has(z.lehrer)) || hd.includes(z.lehrer)) return; buche(x, z.rolle, min * f, p.dauer * f, u.vorbereitung !== false && !ohneV.has(u.id + '|' + z.lehrer), u, { ohne: ohneGrund(u, z.lehrer), f, anteilig: z.modus === 'anteilig' }); });
      hd.forEach(lid => { const x = by.get(lid); if (x) buche(x, handB.co.has(p.unterricht + '|' + p.blockNr + '|' + lid) ? 'co' : 'fach', min * f, p.dauer * f, u.vorbereitung !== false, u, { ohne: ohneGrund(u, null), f, hand: true }); });
    });
  } else {
    daten.unterrichte.forEach(u => {
      const avg = stundenSchnitt(u, bl.get(u.id));
      u.lehrkraefte.forEach(z => { const x = by.get(z.lehrer); if (!x) return; const hh = z.modus === 'anteilig' ? Math.min(z.stundenAnteil, avg) : avg; buche(x, z.rolle, hh * std, hh, u.vorbereitung !== false && !ohneV.has(u.id + '|' + z.lehrer), u, { ohne: ohneGrund(u, z.lehrer), schnitt: true, anteilig: z.modus === 'anteilig' }); });
    });
  }
  // Aufgaben mit festen Terminen (auch in Pausen) zählen immer mit ihrer Dauer – mit und ohne Plan
  daten.unterrichte.forEach(u => {
    if (!u.aufgabe || !u.termine || !u.termine.length) return;
    const min = aufgabeTermine(daten, u).reduce((s, t) => s + t.minuten, 0);
    if (min) u.lehrkraefte.forEach(z => { const x = by.get(z.lehrer); if (x) { x.aufgaben += min; x.termine += min; if (prot) prot.push({ lehrer: z.lehrer, art: 'termin', u: u.id, min }); } });
  });
  // GTAs zählen mit ihrer Dauer zur Arbeitszeit der internen Personen – „on top“: nicht in der Planung des Unterrichts (opt.geplant, opt.ohneGta)
  const ohneGta = !!(opt.geplant || opt.ohneGta);
  if (!ohneGta) (daten.gta || []).forEach(g => { const min = gtaMinuten(daten, g); if (!min) return; g.personen.forEach(lid => { const x = by.get(lid); if (!x) return; x.gta += min; if (prot) prot.push({ lehrer: lid, art: 'gta', gta: g.id, min }); }); });
  // Aufsichten (Früh-/Spätaufsicht, Aufsicht, Springer, Sonstiges) – mit Wochenanteil des Rhythmus
  if (!opt.ohneDienste && daten.dienste) dienstMinutenJeLehrer(daten, prot).forEach((v, lid) => { const x = by.get(lid); if (!x) return; x.fruehdienst = v.fruehdienst; x.spaetdienst = v.spaetdienst; x.aufsicht += v.aufsicht; x.springer += v.springer; x.sonstigeDienste = v.sonstige; x.dienst = v.dienst; });
  liste.forEach(x => { x.summe = x.unterricht + x.vorb + x.co + x.coVorb + x.kl + x.aufgaben + x.dienst + x.gta; x.diff = x.summe - x.soll; x.istL = x.stunden + x.aufgStd; x.istStd = x.istL + x.coStunden; });
  // Einsatzzeit je Tag (nur auf Wunsch – braucht die Belegung in echten Zeiten)
  if (opt.mitTagen) {
    const te = tagesEinsatz(daten, belegungsIndex(daten, { ohneAufsicht: !!opt.ohneAufsicht, ohneDienste: !!opt.ohneDienste, ohneGta }));
    liste.forEach(x => { x.tag = Array.from(te.get(x.lehrer) || []); x.tagUeber = x.tagMax > 0 ? x.tag.filter(m => m > x.tagMax + 0.5).length : 0; });
  }
  return { liste, quelle: nutzePlan ? 'plan' : 'planung', stundenSoll: !!am.stundenSoll, protokoll: prot };
}

// ---------- Co-Lehrkräfte NACH dem Fachunterricht, VOR den Aufsichten ----------
// Automatische Co-Einsätze sind bewusst die zweite Prioritätsstufe:
//   1. Fachunterricht vollständig besetzen,
//   2. den konfigurierten Co-Bedarf mit fachlich passenden Personen planen,
//   3. erst danach Aufsichten aus der verbleibenden freien Personalzeit verteilen.
// Automatisch berücksichtigt werden nur Personen mit einer EXPLIZIT passenden Fachzugehörigkeit als Co-Fach;
// die alte allgemeine Fallback-Regel „Co-Kraft ohne Fachangabe kann alles“ gilt für diese Automatik ausdrücklich nicht.
function coAutoBefaehigt(l, fach) {
  return !!(l && l.art !== 'personal' && coBefaehigt(l, fach) && ((l.coFaecher || []).includes(fach) || (l.faecher || []).includes(fach)));
}
// Bisherige automatische Co-Einsätze je Unterricht: Map u.id → Map lehrer → 'alle' | Set der Blocknummern. Beim Weiterrechnen („Plan verbessern“,
// „Änderungen minimal“) kommen diese Personen zuerst zum Zug – solange sie zur geplanten Zeit frei sind und Arbeitszeit übrig haben.
function coBisherAus(data) {
  const m = new Map();
  (data.unterrichte || []).forEach(u => { if (u.aufgabe) return; (u.lehrkraefte || []).forEach(z => { if (z.rolle !== 'co' || !z.auto || !z.lehrer) return; if (!m.has(u.id)) m.set(u.id, new Map()); m.get(u.id).set(z.lehrer, z.modus === 'anteilig' ? new Set() : 'alle'); }); });
  ((data.plan && data.plan.platzierungen) || []).forEach(p => { const x = m.get(p.unterricht); if (!x) return; (p.co || []).forEach(id => { const s = x.get(id); if (s && s !== 'alle') s.add(p.blockNr); }); });
  return m;
}
function coNachPlanErgaenzen(d, opt) {
  opt = opt || {};
  const erg = { ergaenzt: [], fehlend: [], teilweise: [], personen: [], bloecke: 0, geteilt: 0, zurueck: 0 };
  if (!d.plan || !d.plan.platzierungen || !d.plan.platzierungen.length) return erg;
  const R = nCoRegeln(d.schule.coRegeln || {}), am = d.schule.arbeitszeitModell || ARBEITSZEIT_STD;
  const bl = bloeckeAlle(d), uMap = new Map(d.unterrichte.map(u => [u.id, u])), fMap = new Map(d.faecher.map(f => [f.id, f]));
  // Alte automatisch gesetzte Co-Zuordnungen entfernen; manuelle (= ausdrücklich fixierte) Co-Zuordnungen bleiben unangetastet.
  const altAuto = new Map();
  d.unterrichte.forEach(u => {
    const ids = u.lehrkraefte.filter(z => z.rolle === 'co' && z.auto).map(z => z.lehrer);
    if (ids.length) altAuto.set(u.id, new Set(ids));
    u.lehrkraefte = u.lehrkraefte.filter(z => !(z.rolle === 'co' && z.auto));
  });
  d.plan.platzierungen.forEach(p => {
    const ids = altAuto.get(p.unterricht);
    if (ids && p.co) p.co = p.co.filter(id => !ids.has(id));
  });
  const kursPlaetze = new Map(), coHand = coHandBloecke(d);
  // Blöcke, in denen die Co-Lehrkraft von Hand herausgenommen, ersetzt oder eingesetzt wurde, bleiben, wie sie sind
  d.plan.platzierungen.forEach(p => { if (coHand.has(p.unterricht + '|' + p.blockNr)) return; if (!kursPlaetze.has(p.unterricht)) kursPlaetze.set(p.unterricht, []); kursPlaetze.get(p.unterricht).push(p); });
  const handBloecke = new Set(); d.plan.platzierungen.forEach(p => { if (coHand.has(p.unterricht + '|' + p.blockNr)) handBloecke.add(p.unterricht); });
  const teamVon = u => { const t = new Set(); u.klassen.forEach(kid => { const k = d.klassen.find(x => x.id === kid); if (k) (k.team || []).forEach(id => t.add(id)); }); return t; };
  const wochenFaktor = (u, p) => platzWochen(u, p, bl).length === 1 ? 0.5 : 1;
  const kursName = u => { const f = fMap.get(u.fach); return ((f && (f.kuerzel || f.name)) || '?') + ' ' + u.klassen.map(kid => (d.klassen.find(k => k.id === kid) || {}).name || '?').join('/'); };
  const tagKz = t => d.schule.tage[t] || '?';
  // Kurse mit Co-Bedarf, die noch keine (fest eingetragene) Co-Lehrkraft haben
  const kurse = [];
  d.unterrichte.forEach(u => {
    const f = fMap.get(u.fach), pls = (kursPlaetze.get(u.id) || []).slice().sort((x, y) => x.tag - y.tag || x.stunde - y.stunde);
    if (!f || u.aufgabe || !u.klassen.length || !pls.length || u.lehrkraefte.some(z => z.rolle === 'co')) return;
    const cb = coBedarfVon(d, u, bl.get(u.id), f); if (!(cb.std > 0)) return;
    kurse.push({ u, pls, cb });
  });
  if (!kurse.length) return erg;
  // opt.vorrang (Menge von Unterrichts-IDs): diese Kurse zuerst – wer nur wenige mögliche Personen hat, bekommt sie, bevor andere Kurse deren Arbeitszeit aufbrauchen
  if (opt.vorrang && opt.vorrang.size) kurse.sort((p, q) => (opt.vorrang.has(q.u.id) ? 1 : 0) - (opt.vorrang.has(p.u.id) ? 1 : 0));
  // Ausgangsniveau der harten Regeln. Automatische Co-Zuordnungen dürfen dieses Niveau niemals verschlechtern (Punkt 11).
  let coHartBasis = personalPlanBewertung(d).hart;

  // Der Co-Bedarf wird BLOCKWEISE besetzt: Kann eine Person nicht alle Stunden eines Kurses übernehmen, teilen sich mehrere fachlich passende
  // Co-Lehrkräfte den Kurs (z. B. Mo/Di Co A, Do Co B). Bevorzugt wird eine möglichst konstante Person – die vollständige Besetzung hat Vorrang.
  // Nach jeder Zuordnung werden Arbeitszeit und Belegung neu gelesen. Vorhandene Aufsichten bleiben außer Betracht: Sie werden erst danach
  // gegen den fertigen Fach- und Co-Plan neu berechnet. Unterricht, andere Co-Einsätze, Aufgaben und Sperrzeiten sind harte Belegungen.
  kurse.forEach(({ u, pls, cb }) => {
    const stdVon = p => p.dauer * wochenFaktor(u, p);
    const bedarfStd = cb.alle ? pls.reduce((a, p) => a + stdVon(p), 0) : Math.min(cb.std, pls.reduce((a, p) => a + stdVon(p), 0));
    const team = teamVon(u), gesperrt = new Set(), vergeben = [];
    const altK = opt.bisher ? opt.bisher.get(u.id) : null; // bisherige Co-Personen dieses Kurses (Weiterrechnen)
    const reiheAlt = (liste, alt) => alt === 'alle' ? liste : liste.slice().sort((x, y) => (alt.has(y.blockNr) ? 1 : 0) - (alt.has(x.blockNr) ? 1 : 0));
    let offen = pls.slice(), gedeckt = 0;
    for (let runde = 0; runde < 16; runde++) {
      if (!offen.length || gedeckt >= bedarfStd - 1e-9) break;
      const idx = belegungsIndex(d, { ohneDienste: true, ohneGta: true });
      const az = arbeitszeiten(d, { mitTagen: true, ohneDienste: true, ohneGta: true }), azMap = new Map(az.liste.map(x => [x.lehrer, x]));
      const drin = new Set(u.lehrkraefte.map(z => z.lehrer)), brauche = bedarfStd - gedeckt;
      let best = null;
      d.lehrer.forEach(l => {
        if (drin.has(l.id) || gesperrt.has(l.id) || !coAutoBefaehigt(l, u.fach) || (u.ohneAuto || []).includes(l.id)) return;
        const ausgebildet = l.ausgebildet !== false;
        if (ausgebildet && R.lehrkraefte === 'nie') return;
        const ax = azMap.get(l.id); if (!ax) return;
        // Wichtung (0–10): Anteil des noch offenen Deputats, den eine ausgebildete Lehrkraft für Co-Einsätze verwenden darf
        // opt.reserve (Minuten je Person): Arbeitszeit, die für Mindestaufsichten freibleiben soll (Rückkopplung aus der Aufsichtsplanung)
        const restArbeit = (ax.soll > 0 ? ax.soll - ax.summe : 0) - ((opt.reserve && opt.reserve.get(l.id)) || 0), restDep = ax.hatSollStd ? (ax.sollStd - ax.istStd) * (ausgebildet ? R.wichtung / 10 : 1) : Infinity;
        // Automatisch nur Personen einsetzen, bei denen nach dem Fachunterricht tatsächlich noch Soll-Kapazität frei ist.
        if (!(restArbeit > 3) || !(restDep > 1e-9)) return;
        const busy = idx.get(l.id) || [], gewaehlt = [], tagPlus = new Map(); let std = 0, arbeit = 0, dep = 0;
        const alt = altK ? altK.get(l.id) : null;
        for (const p0 of (alt ? reiheAlt(offen, alt) : offen)) {
          if (l.anwesenheit === 'teilzeit' && l.anwesenheitTage.length && !l.anwesenheitTage.includes(p0.tag)) continue;
          if (l.anwesenheit === 'ausbildungstag' && l.anwesenheitTage.includes(p0.tag)) continue;
          const iv = unterrichtsIntervall(d, p0, null, uMap); if (!iv) continue;
          const w = platzWochen(u, p0, bl);
          // keine Überschneidung mit eigenem Unterricht, anderen Co-Einsätzen, Aufgaben, Terminen oder Sperrzeiten – in echten Uhrzeiten (Zeitprofile)
          if ((busy[p0.tag] || []).some(x => intervalleUeberschneiden(x, iv) && wochenSchnitt(x.wochen || ['A', 'B'], w))) continue;
          const wf = wochenFaktor(u, p0), m = platzMinuten(d, u, p0) * wf;
          const depStd = p0.dauer * wf, arbeitsMin = m + (u.vorbereitung !== false ? am.vorbCo * depStd : 0);
          if (arbeit + arbeitsMin > restArbeit + 3 || dep + depStd > restDep + 1e-9) continue;
          const tagIst = (ax.tag && ax.tag[p0.tag] ? ax.tag[p0.tag] : 0) + (tagPlus.get(p0.tag) || 0);
          if (ax.tagMax > 0 && tagIst + (iv.end - iv.start) > ax.tagMax + 0.5) continue;
          gewaehlt.push({ p: p0, iv, w }); arbeit += arbeitsMin; dep += depStd; std += depStd; tagPlus.set(p0.tag, (tagPlus.get(p0.tag) || 0) + (iv.end - iv.start));
          if (std >= brauche - 1e-9) break;
        }
        if (!gewaehlt.length) return;
        const eigene = !!l.klassenleitung && u.klassen.includes(l.klassenleitung), imTeam = team.has(l.id) || eigene;
        const k = { l, gewaehlt, std, ausgebildet,
          // Rangfolge: Co-Kräfte vor ausgebildeten Lehrkräften (Regel „nur wenn keine Co-Kraft passt“), danach ein Wert in Stunden:
          // Ausgleich zuerst – wer die meisten Minusstunden hat (offene Soll-Arbeitszeit) –, dazu Zuschläge für eine konstante Person
          // (deckt den ganzen Rest allein ab, 2 h), je abgedeckte Stunde 0,25 h, Klassenteam 1 h und Klassenleitung (Wichtung × 0,3 h).
          stufe: alt ? -1 : ausgebildet && R.lehrkraefte !== 'gleich' ? 1 : 0, // bisherige Co-Person zuerst (Weiterrechnen)
          wert: (ax.soll > 0 ? restArbeit / 60 : 0) + (std >= brauche - 1e-9 ? 2 : 0) + 0.25 * std + (imTeam ? 1 : 0) + (eigene ? R.wichtung * 0.3 : 0) + (!ausgebildet ? 0.2 : 0) };
        if (!best || k.stufe < best.stufe || (k.stufe === best.stufe && k.wert > best.wert + 1e-9)) best = k;
      });
      if (!best) break;
      const ganz = cb.alle && !vergeben.length && best.gewaehlt.length === pls.length && !handBloecke.has(u.id);
      const zu = nLehrkraftZuordnung(ganz ? { lehrer: best.l.id, rolle: 'co', modus: 'immer', stundenAnteil: u.wochenstunden, deputatFaktor: 0.5, auto: true } : { lehrer: best.l.id, rolle: 'co', modus: 'anteilig', stundenAnteil: best.std, deputatFaktor: 0.5, auto: true });
      u.lehrkraefte.push(zu);
      const coPlaetzeNeu = [];
      if (!ganz) best.gewaehlt.forEach(z => { z.p.co = Array.isArray(z.p.co) ? z.p.co : []; if (!z.p.co.includes(best.l.id)) { z.p.co.push(best.l.id); coPlaetzeNeu.push(z.p); } });
      // Punkt 11: exakte Prüfung genau dieser Zuordnung. Verletzt sie eine harte Regel, wird nur sie zurückgenommen und anders vergeben –
      // der fehlerfreie Fachunterricht und die übrigen Co-Einsätze bleiben unverändert.
      const coReal = personalPlanBewertung(d);
      if (coReal.hart > coHartBasis) {
        u.lehrkraefte = u.lehrkraefte.filter(x => x !== zu);
        coPlaetzeNeu.forEach(p => { p.co = (p.co || []).filter(id => id !== best.l.id); });
        gesperrt.add(best.l.id); erg.zurueck++;
        continue;
      }
      coHartBasis = coReal.hart;
      vergeben.push(best); gedeckt += best.std;
      const weg = new Set(best.gewaehlt.map(z => z.p)); offen = offen.filter(p => !weg.has(p));
    }
    if (!vergeben.length) { erg.fehlend.push(kursName(u) + (gesperrt.size ? ' (Co würde eine harte Regel verletzen)' : '')); return; }
    const wer = vergeben.map(v => lehrerNameKurz(v.l) + (vergeben.length > 1 ? ' (' + [...new Set(v.gewaehlt.map(z => tagKz(z.p.tag)))].join(', ') + ')' : '')).join(' + ');
    erg.ergaenzt.push(kursName(u) + ' → ' + wer);
    vergeben.forEach(v => { erg.personen.push(v.l.id); erg.bloecke += v.gewaehlt.length; });
    if (vergeben.length > 1) erg.geteilt++;
    if (gedeckt < bedarfStd - 1e-9) erg.teilweise.push(kursName(u) + ': ' + zahlDe(gedeckt, 1) + ' von ' + zahlDe(bedarfStd, 1) + ' UStd. mit Co-Lehrkraft');
  });
  erg.personen = [...new Set(erg.personen)];
  return erg;
}

// Unterrichtsblöcke mit Co-Bedarf, die keine Co-Lehrkraft haben. Liefert { liste: [{ u, p, std }], summe } – summe = fehlende Co-Stunden je Woche.
function coLuecken(d) {
  const liste = [], bl = bloeckeAlle(d), fMap = new Map(d.faecher.map(f => [f.id, f])), handB = besetzungMap(d), coHand = coHandBloecke(d);
  const plaetze = new Map(); ((d.plan && d.plan.platzierungen) || []).forEach(p => { if (coHand.has(p.unterricht + '|' + p.blockNr)) return; if (!plaetze.has(p.unterricht)) plaetze.set(p.unterricht, []); plaetze.get(p.unterricht).push(p); });
  let summe = 0;
  d.unterrichte.forEach(u => {
    if (u.aufgabe || !u.klassen.length) return;
    const f = fMap.get(u.fach); if (!f) return;
    const cb = coBedarfVon(d, u, bl.get(u.id), f); if (!(cb.std > 0)) return;
    const ps = plaetze.get(u.id) || []; if (!ps.length) return;
    const co = u.lehrkraefte.filter(z => z.rolle === 'co' && z.lehrer);
    if (co.some(z => z.modus !== 'anteilig')) return;
    const wf = p => platzWochen(u, p, bl).length === 1 ? 0.5 : 1;
    const mit = p => co.some(z => (p.co || []).includes(z.lehrer)) || (handB.get(u.id + '|' + p.blockNr) || []).some(l => handB.co.has(u.id + '|' + p.blockNr + '|' + l));
    const geplant = ps.reduce((a, p) => a + p.dauer * wf(p), 0), soll = cb.alle ? geplant : Math.min(cb.std, geplant), ist = ps.reduce((a, p) => a + (mit(p) ? p.dauer * wf(p) : 0), 0);
    if (ist >= soll - 1e-9) return;
    summe += soll - ist;
    ps.filter(p => !mit(p)).forEach(p => liste.push({ u, p, std: p.dauer * wf(p) }));
  });
  return { liste, summe };
}
// Bleibt nach der blockweisen Co-Zuteilung Co-Bedarf offen, weil zur geplanten Uhrzeit keine passende Co-Person frei ist, wird der betroffene
// Unterrichtsblock an eine Zeit gelegt, zu der eine Co-Person kann (Verschieben oder Tausch mit einem gleich langen Block derselben Klasse).
// Fachlehrkräfte bleiben unverändert; ein Zug wird nur übernommen, wenn kein harter Verstoß entsteht und danach – mit vollständig neu
// bestimmter Co-Zuteilung – weniger Co-Stunden fehlen. Die Reihenfolge bleibt gewahrt: Co-Lehrkräfte stehen immer auf dem fertigen Unterrichtsplan.
function coNachbessern(d, opt) {
  opt = opt || {};
  const t0 = jetzt(), limit = opt.zeitlimit || 2000, maxPruef = opt.maxPruefungen || 16;
  const erg = { verschoben: [], pruefungen: 0, co: null };
  let L = coLuecken(d); if (!L.summe) return erg;
  let basis = personalPlanBewertung(d);
  const versucht = new Set();
  for (let runde = 0; runde < 24; runde++) {
    if (erg.pruefungen >= maxPruef || jetzt() - t0 > limit) break;
    L = coLuecken(d); if (!L.summe) break;
    const luecke = L.liste.find(x => !versucht.has(x.u.id + '|' + x.p.blockNr)); if (!luecke) break;
    versucht.add(luecke.u.id + '|' + luecke.p.blockNr);
    let M, P; try { const mp = planAusDaten(d); M = mp.M; P = mp.P; } catch (err) { break; }
    const ui = M.uI.get(luecke.u.id), e = ui === undefined ? undefined : (M.uEv[ui] || [])[luecke.p.blockNr - 1];
    if (e === undefined) continue;
    const ev = M.E[e];
    if (ev.fixStart >= 0 || P.start[e] < 0 || ev.parts.length > 1) continue; // fixierte und gekoppelte Blöcke bleiben, wo sie sind
    const alt = P.start[e], hart0 = P.hartSumme(), H = M.H, tab = M.zeitTab[ev.zg], wochen = ev.wochen.map(w => 'AB'[w]);
    const idx = belegungsIndex(d, { ohneDienste: true, ohneGta: true });
    const coK = d.lehrer.filter(l => coAutoBefaehigt(l, luecke.u.fach) && !luecke.u.lehrkraefte.some(z => z.lehrer === l.id && z.rolle === 'fach') && !(luecke.u.ohneAuto || []).includes(l.id));
    if (!coK.length) continue;
    // Vorfilter: Ist zu dieser Zeit überhaupt eine passende Co-Person im Haus und frei?
    const coFrei = sl => {
      const tag = Math.floor(sl / H), h = sl % H, von = tab.s[h], bis = tab.e[h + ev.dur - 1]; if (von < 0 || bis < 0) return false;
      return coK.some(l => !(l.anwesenheit === 'teilzeit' && l.anwesenheitTage.length && !l.anwesenheitTage.includes(tag)) && !(l.anwesenheit === 'ausbildungstag' && l.anwesenheitTage.includes(tag))
        && !((idx.get(l.id) || [])[tag] || []).some(x => x.start < bis && von < x.end && wochenSchnitt(x.wochen || ['A', 'B'], wochen)));
    };
    // Zug: den Block nach k.s legen; k.partner = Blöcke derselben Klasse, die dafür an den alten Platz wechseln (gleiche Lage zueinander)
    const zug = k => { if (k.partner.length) { P.entferne(e); k.partner.forEach(x => P.entferne(x.e)); } if (!P.platziere(e, k.s, false)) return false; for (const x of k.partner) if (!P.platziere(x.e, x.ziel, false)) return false; return true; };
    const kand = [];
    for (const sl of ev.erlaubt) {
      if (sl === alt || !coFrei(sl)) continue;
      let k = { s: sl, partner: [] };
      P.begin();
      let ok = zug(k);
      if (!ok) {
        P.rollback();
        // Tausch: Die Blöcke derselben Klasse, die genau das Zielfenster füllen (ein gleich langer Block oder z. B. zwei Einzelstunden für eine
        // Doppelstunde), wechseln an den alten Platz. Fixierte und gekoppelte Blöcke bleiben, wo sie sind.
        if (Math.floor(sl / H) === Math.floor(alt / H) && sl < alt + ev.dur && alt < sl + ev.dur) continue; // überlappende Fenster am selben Tag
        const cs = new Set(); for (const c of ev.klassen) for (const x of M.kEv[c]) { const sx = P.start[x]; if (x !== e && sx >= 0 && sx < sl + ev.dur && sl < sx + M.E[x].dur) cs.add(x); }
        const liste = [...cs]; let dauer = 0, passt = liste.length > 0;
        for (const x of liste) { const ex = M.E[x], sx = P.start[x]; dauer += ex.dur; if (sx < sl || sx + ex.dur > sl + ev.dur || ex.fixStart >= 0 || ex.parts.length !== 1 || !M.erlaubt[x * M.S + alt + (sx - sl)]) passt = false; }
        if (!passt || dauer !== ev.dur) continue;
        k = { s: sl, partner: liste.map(x => ({ e: x, ziel: alt + (P.start[x] - sl) })) };
        P.begin(); ok = zug(k);
      }
      if (ok) { P.commit(); if (P.hartSumme() <= hart0) { k.weich = P.weichSumme(); kand.push(k); } }
      P.rollback();
    }
    kand.sort((p, q) => p.weich - q.weich);
    for (const k of kand.slice(0, 4)) {
      if (erg.pruefungen >= maxPruef || jetzt() - t0 > limit) break;
      erg.pruefungen++;
      P.begin();
      if (!zug(k)) { P.rollback(); continue; }
      P.commit();
      const d2 = JSON.parse(JSON.stringify(d)); d2.plan.platzierungen = P.exportiere();
      P.rollback();
      const co2 = coNachPlanErgaenzen(d2, { ersetzen: true, bisher: opt.bisher }), b2 = personalPlanBewertung(d2), L2 = coLuecken(d2);
      if (b2.hart <= basis.hart && L2.summe < L.summe - 1e-9) {
        d.plan.platzierungen = d2.plan.platzierungen; d.unterrichte = d2.unterrichte; basis = b2; erg.co = co2;
        erg.verschoben.push({ unterricht: luecke.u.id, blockNr: luecke.p.blockNr, tausch: k.partner.length > 0 });
        versucht.clear(); // nach einer Verbesserung dürfen alle noch offenen Blöcke erneut versucht werden
        break;
      }
    }
  }
  return erg;
}

// ---------- Aufsichten ----------
// Pausen: als Pause markierte Zeilen und Lücken ab 10 Minuten zwischen zwei Stunden.
// Mit klassen (Liste der Klassen) kommen die eigenen Pausen der Zeitprofile dazu, denen Klassen zugeordnet sind:
// Lücken ab 10 Minuten zwischen zwei Stunden des Profils, die zeitlich nicht genau auf eine Schulpause fallen.
// Jede Pause trägt start/end (Minuten) und vor/nach (Rasterzeile der Stunde davor bzw. danach).
function pausenListe(sch, klassen) {
  const out = [], st = sch.stunden;
  let lnr = 0;
  st.forEach((s, i) => {
    if (!s.istPause) lnr++;
    if (s.istPause) {
      let v = i - 1; while (v >= 0 && st[v].istPause) v--;
      let n = i + 1; while (n < st.length && st[n].istPause) n++;
      const zeit = (s.beginn || '') + (s.ende ? '–' + s.ende : '');
      out.push({ key: 'p' + i, name: s.name ? s.name + ' (' + zeit + ')' : 'Pause ' + zeit, kurz: s.name || 'Pause ' + (s.beginn || ''), eigenName: s.name || '', zeit, minuten: s.dauer, vor: v, nach: n < st.length ? n : -1 });
    } else if (i < st.length - 1 && !st[i + 1].istPause && s.pauseDanach >= 10) {
      const zeit = (s.ende || '') + '–' + (st[i + 1].beginn || '');
      out.push({ key: 'n' + i, name: s.pauseName ? s.pauseName + ' (' + zeit + ')' : 'nach der ' + lnr + '. Stunde (' + zeit + ')', kurz: s.pauseName || 'nach ' + lnr + '.', eigenName: s.pauseName || '', zeit, minuten: s.pauseDanach, vor: i, nach: i + 1 });
    }
  });
  out.forEach(pa => { const iv = pausenIntervall(sch, pa.key); pa.start = iv ? iv.start : null; pa.end = iv ? iv.end : null; pa.profil = ''; });
  const profile = (klassen && sch.zeitprofile) ? sch.zeitprofile.filter(z => klassen.some(k => k.zeitprofil === z.id)) : [];
  if (!profile.length) return out;
  const schul = out.slice();
  profile.forEach(z => {
    const zt = stundenZeiten(sch, z);
    let vor = -1, nrVor = 0, nr = 0;
    st.forEach((s, i) => {
      if (s.istPause) return;
      nr++;
      if (vor >= 0 && zt[vor] && zt[i] && zt[i].start - zt[vor].end >= 10) {
        const a = zt[vor].end, e = zt[i].start;
        if (!schul.some(g => g.start === a && g.end === e)) {
          const eigen = (z.pausen || {})[nrVor] || '', zeit = zeitText(a) + '–' + zeitText(e);
          out.push({ key: 'z' + z.id + ':' + nrVor, name: (eigen || 'Pause') + ' – ' + z.name + ' (' + zeit + ')', kurz: (eigen || 'Pause ' + zeitText(a)) + ' · ' + z.name, eigenName: eigen, zeit, minuten: e - a, vor, nach: i, start: a, end: e, profil: z.id, profilName: z.name });
        }
      }
      vor = i; nrVor = nr;
    });
  });
  // nach Uhrzeit ordnen (Pausen ohne gültige Zeit bleiben an ihrer Stelle im Raster)
  return out.map((pa, i) => ({ pa, i })).sort((x, y) => { const a = x.pa.start, b = y.pa.start; return a !== null && b !== null && a !== b ? a - b : (x.pa.vor - y.pa.vor) || (x.i - y.i); }).map(x => x.pa);
}
