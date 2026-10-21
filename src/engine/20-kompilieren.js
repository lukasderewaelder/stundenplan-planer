/* =====================================================================
   2. VALIDIERUNG – Kompilieren in schnelle Arrays, Planzustand, Regeln
   ===================================================================== */

// Zerlegt Wochenstunden in Blöcke nach Fachregel (falls keine Blöcke vorgegeben)
function zerlegeBloecke(ws, bloecke, regel, D) {
  if (bloecke && bloecke.length) return bloecke.slice();
  if (ws <= 0) return [];
  let d2;
  if (regel === 'pflicht' || regel === 'bevorzugt') d2 = Math.floor(ws / 2);
  else if (regel === 'verboten') d2 = 0;
  else d2 = Math.max(0, ws - D); // egal/vermeiden: nur so viele Doppelblöcke wie nötig
  d2 = Math.min(d2, Math.floor(ws / 2));
  const res = [];
  for (let i = 0; i < d2; i++) res.push(2);
  for (let i = 0; i < ws - 2 * d2; i++) res.push(1);
  return res;
}

// Höchstzahl je Tag eines Fachs in einer Klasse: eigener Wert der Klasse (klasse.maxProTag), sonst „max. pro Tag“ des Fachs
function fachMaxTag(k, f) { if (!f) return 20; const v = k && k.maxProTag ? k.maxProTag[f.id] : undefined; return v >= 1 ? v : f.maxProTag; }
// Fach, wie es für die Blockaufteilung eines Unterrichts gilt: Darf es in einer seiner Klassen höchstens einmal am Tag vorkommen, gibt es keine
// Doppelstunden (ein Doppelblock zählt als zwei). „Pflicht“ bleibt – den Widerspruch meldet die Prüfung.
function fachFuerBloecke(daten, u, fach) {
  if (!fach || !fach.id || !u || u.aufgabe) return fach;
  const kl = (u.klassen || []).map(kid => daten.klassen.find(x => x.id === kid)).filter(Boolean);
  const min = kl.length ? Math.min(...kl.map(k => fachMaxTag(k, fach))) : fach.maxProTag;
  const ohneDoppel = min < 2 && fach.doppelstunde !== 'verboten' && fach.doppelstunde !== 'pflicht';
  if (min === fach.maxProTag && !ohneDoppel) return fach;
  return Object.assign({}, fach, { maxProTag: min }, ohneDoppel ? { doppelstunde: 'verboten', _maxGrund: true } : {});
}
// Zulässige Blockmuster eines Unterrichts für die Berechnung: n2 Doppelstunden jede Woche, n1 Einzelstunden jede Woche, nb 14-tägige
// Doppelstunden (eine in Woche A oder B, zählt im Schnitt 1 Stunde). Jedes Muster ergibt genau die Wochenstunden – die Stundentafel kann
// dadurch nicht verletzt werden. Doppelstunden „pflicht“: keine Einzelstunden; „verboten“ (oder höchstens 1× je Tag): keine Doppelblöcke;
// alle Blöcke an verschiedenen Tagen (H07), also höchstens D Blöcke.
function musterListe(ws, regel, maxProTag, D, ohneTagRegel) {
  const out = [], dbl = regel !== 'verboten' && (maxProTag === undefined || maxProTag >= 2);
  for (let nb = 0; nb <= (dbl ? 1 : 0); nb++) for (let n2 = 0; 2 * n2 + nb <= ws; n2++) {
    if (!dbl && n2 > 0) continue;
    const n1 = ws - nb - 2 * n2;
    if (regel === 'pflicht' && n1 > 0) continue;
    if (!ohneTagRegel && n2 + n1 + nb > D) continue;
    out.push({ n2, n1, nb });
  }
  return out;
}
// W08 je Unterricht nach Blockmuster: „bevorzugt“ – je vermeidbares Einzelstunden-Paar ½ und je 14-tägige Doppelstunde ½; „vermeiden“ – je
// Doppelblock 1; sonst je 14-tägige Doppelstunde ½ (der Wechselrhythmus wird nur genutzt, wenn er etwas bringt)
function musterStrafe(regel, ws, n2, n1, nb) {
  if (regel === 'bevorzugt') return Math.max(0, n1 - (ws % 2)) / 2 + 0.5 * nb;
  if (regel === 'vermeiden') return n2 + nb;
  if (regel === 'pflicht' || regel === 'verboten') return 0;
  return 0.5 * nb;
}
function musterZaehlen(dauer, woche) { const z = { n2: 0, n1: 0, nb: 0, w: 0 }; dauer.forEach((d, i) => { const wo = woche[i]; if (wo === 'A' || wo === 'B') { z.nb++; if (wo === 'B') z.w = 1; } else if (d === 2) z.n2++; else z.n1++; }); return z; }
// Von der Berechnung gewählte Blockaufteilung (u.bloeckeAuto / u.bloeckeAutoWoche) – gilt nur, solange sie zu Stunden, Fachregel und Tagen passt
function bloeckeAutoGueltig(u, regel, D) {
  const b = u.bloeckeAuto, w = u.bloeckeAutoWoche;
  if (!Array.isArray(b) || !b.length || !Array.isArray(w) || w.length !== b.length || u.aufgabe || u.rhythmus !== 'jede' || u.kopplung || (u.gruppen && u.gruppen.length)) return false;
  let summe = 0, ab = 0;
  for (let i = 0; i < b.length; i++) {
    if (b[i] !== 1 && b[i] !== 2) return false;
    if (w[i] === 'A' || w[i] === 'B') { if (b[i] !== 2) return false; ab++; summe += 1; } else if (w[i] === 'jede') summe += b[i]; else return false;
  }
  if (ab > 1 || Math.abs(summe - u.wochenstunden) > 1e-9 || b.length > D) return false;
  if (regel === 'pflicht' && b.includes(1)) return false;
  if (regel === 'verboten' && b.includes(2)) return false;
  return true;
}
// Blöcke eines Unterrichts mit Woche je Block ('jede' | 'A' | 'B').
// A/B-Rhythmus aktiv + Doppelstundenpflicht + ungerade Stundenzahl → die übrige Doppelstunde liegt im Wechsel (A oder B).
function bloeckeMitWoche(u, fach, D, ab, extraWoche) {
  const regel = fach ? fach.doppelstunde : 'egal';
  if (u.aufgabe && !u.bloecke.length) {
    // Aufgaben ohne eigene Aufteilung: gleichmäßig auf höchstens D Blöcke (bis D Stunden also Einzelstunden an verschiedenen Tagen)
    const ws = u.wochenstunden, n = Math.min(ws, Math.max(1, D)), b = [];
    for (let i = 0; i < n; i++) b.push(Math.floor(ws / n) + (i < ws % n ? 1 : 0));
    return { dauer: b, woche: b.map(() => 'jede'), abAuto: false };
  }
  if (u.bloecke.length) return { dauer: u.bloecke.slice(), woche: u.bloecke.map((_, i) => (ab && u.bloeckeWoche && (u.bloeckeWoche[i] === 'A' || u.bloeckeWoche[i] === 'B')) ? u.bloeckeWoche[i] : 'jede'), abAuto: false };
  // von der Berechnung gewählte Aufteilung (Einzel-/Doppelstunden, ggf. 14-tägige Doppelstunde) – solange sie gültig ist
  if (bloeckeAutoGueltig(u, regel, D)) return { dauer: u.bloeckeAuto.slice(), woche: u.bloeckeAutoWoche.slice(), abAuto: u.bloeckeAutoWoche.some(w => w !== 'jede'), auto: true };
  if (u.rhythmus === 'jede' && regel === 'pflicht' && u.wochenstunden % 2 === 1 && !u.aufgabe) {
    const n = Math.floor(u.wochenstunden / 2);
    return { dauer: Array(n + 1).fill(2), woche: Array(n).fill('jede').concat([extraWoche || 'A']), abAuto: true };
  }
  const b = zerlegeBloecke(u.wochenstunden, [], regel, D);
  return { dauer: b, woche: b.map(() => 'jede'), abAuto: false };
}
// Zusatz-Doppelstunden im Wechsel (Doppelstundenpflicht bei ungerader Stundenzahl): je Klasse und zwischen den Klassen abwechselnd Woche A und B.
// Gekoppelte Unterrichte bekommen dieselbe Woche. Halbgruppen liegen gekreuzt (Kunst Gr. 1 = A, Kunst Gr. 2 = B, Musik Gr. 1 = B, Musik Gr. 2 = A),
// damit in jeder Woche Gruppe 1 des einen neben Gruppe 2 des anderen Fachs liegen kann.
function abZusatzWochen(daten, tr) {
  tr = tr || teilungsRegeln(daten);
  const m = new Map(), zaehl = {}, kopWoche = new Map(), teilFach = new Map();
  const fI = new Map(daten.faecher.map(f => [f.id, f])), kI = new Map(daten.klassen.map((k, i) => [k.id, { k, i }])), fPos = new Map(daten.faecher.map((f, i) => [f.id, i]));
  daten.unterrichte.forEach(u => {
    const f = fI.get(u.fach);
    const regel = tr.has(u.id) ? tr.get(u.id) : f ? f.doppelstunde : 'egal';
    if (u.aufgabe || u.bloecke.length || u.rhythmus !== 'jede' || !f || regel !== 'pflicht' || u.wochenstunden % 2 !== 1) return;
    if (u.kopplung && kopWoche.has(u.kopplung)) { m.set(u.id, kopWoche.get(u.kopplung)); return; }
    const k = u.klassen[0] || '', kx = kI.get(k), ki = kx ? kx.i : 0;
    const paar = kx && !u.kopplung && u.gruppen.length === 1 && u.klassen.length === 1 && (kx.k.teilung || {})[u.fach] ? halbPaar(kx.k) : null;
    const gi = paar ? paar.findIndex(g => g.id === u.gruppen[0]) : -1;
    let w;
    if (gi >= 0) {
      if (!teilFach.has(k)) teilFach.set(k, []);
      const fs = teilFach.get(k); if (!fs.includes(u.fach)) fs.push(u.fach);
      const partner = (kx.k.parallel || {})[u.fach];
      const fi = partner && fPos.has(partner) ? (fPos.get(u.fach) < fPos.get(partner) ? 0 : 1) : fs.indexOf(u.fach);
      w = (gi + fi + ki) % 2 ? 'B' : 'A';
    } else { zaehl[k] = (zaehl[k] || 0) + 1; w = (zaehl[k] + ki) % 2 ? 'A' : 'B'; } // innerhalb der Klasse und zwischen Nachbarklassen abwechselnd
    m.set(u.id, w);
    if (u.kopplung) kopWoche.set(u.kopplung, w);
  });
  return m;
}
// Geteilte Fächer einer Klasse sollen nebeneinander liegen (Gruppe 1 Kunst, Gruppe 2 zur selben Zeit Musik). Dafür brauchen die Partner dieselbe
// Blockaufteilung: Geteilte Fächer einer Klasse mit gleicher Stundenzahl bekommen eine gemeinsame Doppelstunden-Regel – verlangt oder bevorzugt
// eines von ihnen Doppelstunden, gilt das für alle (ein Fach mit „verboten“ zieht die anderen auf Einzelstunden; „pflicht“ gegen „verboten“ bleibt getrennt).
// Liefert Map unterrichtId → Regel (nur für Unterrichte ohne eigene Blockaufteilung).
function teilungsRegeln(daten) {
  const out = new Map(), fI = new Map(daten.faecher.map(f => [f.id, f]));
  daten.klassen.forEach(k => {
    const ids = Object.keys(k.teilung || {}).filter(f => k.teilung[f] && fI.has(f)); if (ids.length < 2) return;
    const je = new Map();
    daten.unterrichte.forEach(u => { if (u.aufgabe || u.bloecke.length || u.rhythmus !== 'jede' || !u.gruppen.length || u.klassen.length !== 1 || u.klassen[0] !== k.id || !ids.includes(u.fach)) return; if (!je.has(u.fach)) je.set(u.fach, []); je.get(u.fach).push(u); });
    const nachStd = new Map();
    je.forEach((us, f) => { const ws = us[0].wochenstunden; if ((ws < 2 && !(k.parallel || {})[f]) || !us.every(u => u.wochenstunden === ws)) return; if (!nachStd.has(ws)) nachStd.set(ws, []); nachStd.get(ws).push(f); });
    nachStd.forEach(fs => {
      if (fs.length < 2) return;
      const regeln = fs.map(f => fI.get(f).doppelstunde);
      // darf eines der Fächer nur einmal am Tag vorkommen (max./Tag 1), sind Doppelstunden für alle ausgeschlossen
      const einzeln = regeln.includes('verboten') || fs.some(f => fachMaxTag(k, fI.get(f)) < 2);
      const r = einzeln ? (regeln.includes('pflicht') ? null : 'verboten') : regeln.includes('pflicht') ? 'pflicht' : regeln.includes('bevorzugt') ? 'bevorzugt' : null;
      if (r) fs.forEach(f => je.get(f).forEach(u => out.set(u.id, r)));
    });
  });
  return out;
}
// Blockplan für alle Unterrichte (für Anzeige und Kompilieren)
function bloeckeAlle(daten) {
  const ab = daten.schule.wochenrhythmus === 'AB', D = daten.schule.tage.length;
  const fI = new Map(daten.faecher.map(f => [f.id, f]));
  const tr = teilungsRegeln(daten), m = abZusatzWochen(daten, tr);
  return new Map(daten.unterrichte.map(u => [u.id, bloeckeMitWoche(u, tr.has(u.id) ? { doppelstunde: tr.get(u.id) } : fachFuerBloecke(daten, u, fI.get(u.fach)), D, ab, m.get(u.id))]));
}
/* ---------------------------------------------------------------------------------------------------------------------
   ZENTRALE STUNDENZÄHLUNG (einzige Quelle für „Wochenstunden“)
   Die Stundentafel nennt die durchschnittlichen Wochenstunden EINES SCHÜLERS. Halbgruppen, A-/B-Wochen, Doppelblöcke und
   Parallelbänder ändern nur die Durchführung, nicht diese Zahl:
     · ein in zwei Gruppen geteiltes Fach zählt für den Schüler einmal (er sitzt in genau einer Gruppe),
     · Unterricht nur in Woche A oder nur in Woche B zählt mit dem Faktor 0,5 (wochenAnteil).
   Alle Anzeigen und Prüfungen (Stundentafel, Unterrichtsverteilung, Prüfung, Plan, Auswertung) rufen schuelerStunden /
   schuelerWochenstunden auf. Die Sicht der Lehrkraft (Arbeitszeit, Deputat) zählt dagegen jede Gruppe – das rechnet arbeitszeiten().
   --------------------------------------------------------------------------------------------------------------------- */
// Anteil eines Termins an der durchschnittlichen Wochenstundenzahl: jede Woche = 1, nur Woche A oder nur Woche B = 0,5
function wochenAnteil(woche) { return woche === 'A' || woche === 'B' ? 0.5 : 1; }
// durchschnittliche Wochenstunden eines Unterrichts (reale Blockdauer × Wochenanteil)
function stundenSchnitt(u, bl) {
  if (u.rhythmus !== 'jede') return u.wochenstunden * wochenAnteil(u.rhythmus);
  return bl.dauer.reduce((a, d, i) => a + d * wochenAnteil(bl.woche[i]), 0);
}
// Wochenstunden je Schüler einer Klasse, je Fach: Map fachId → { wert, ganz, gruppen: { gruppeId: Std. }, gleich }
//   quelle 'tafel'      = Soll laut Stundentafel
//          'verteilung' = Durchschnitt laut Unterrichtsverteilung
//          'plan'       = Durchschnitt der im Plan platzierten Stunden
//   wert   = Unterricht der ganzen Klasse + Unterricht der Gruppe des Schülers (bei mehreren Gruppen die größte Summe)
//   gleich = false, wenn die Gruppen eines geteilten Fachs verschieden viele Stunden bekommen (dann stimmt wert nicht für jeden Schüler)
function schuelerStunden(daten, klasseId, quelle, opt) {
  opt = opt || {};
  const out = new Map(), k = daten.klassen.find(x => x.id === klasseId);
  if (!k) return out;
  if (quelle === 'tafel') { Object.keys(k.stundentafel || {}).forEach(f => out.set(f, { wert: k.stundentafel[f], ganz: k.stundentafel[f], gruppen: {}, gleich: true })); return out; }
  const bl = opt.bl || bloeckeAlle(daten), eigen = new Set(k.gruppen.map(g => g.id));
  const buche = (u, std) => {
    if (!(std > 0)) return;
    const x = out.get(u.fach) || { wert: 0, ganz: 0, gruppen: {}, gleich: true }; out.set(u.fach, x);
    const gr = u.gruppen.filter(g => eigen.has(g));
    if (!gr.length) x.ganz += std; else gr.forEach(g => { x.gruppen[g] = (x.gruppen[g] || 0) + std; });
  };
  if (quelle === 'plan') {
    const uMap = opt.uMap || new Map(daten.unterrichte.map(u => [u.id, u]));
    daten.plan.platzierungen.forEach(p => {
      const u = uMap.get(p.unterricht); if (!u || u.aufgabe || !u.fach || !u.klassen.includes(klasseId)) return;
      const b = bl.get(u.id), w = u.rhythmus !== 'jede' ? u.rhythmus : ((b && b.woche[p.blockNr - 1]) || 'jede');
      buche(u, p.dauer * wochenAnteil(w));
    });
  } else daten.unterrichte.forEach(u => { if (u.aufgabe || !u.fach || !u.klassen.includes(klasseId)) return; buche(u, stundenSchnitt(u, bl.get(u.id))); });
  const hp = halbPaar(k);
  out.forEach((x, f) => {
    const werte = Object.values(x.gruppen);
    x.wert = x.ganz + (werte.length ? Math.max(...werte) : 0);
    if ((k.teilung || {})[f] && hp) { const a = x.gruppen[hp[0].id] || 0, b = x.gruppen[hp[1].id] || 0; x.gleich = Math.abs(a - b) < 1e-9; }
    else if (werte.length > 1) x.gleich = werte.every(v => Math.abs(v - werte[0]) < 1e-9) || !(k.teilung || {})[f];
  });
  return out;
}
// Wochenstunden eines einzelnen Schülers: ein Fach (fachId) oder alle Fächer zusammen (fachId = null)
function schuelerWochenstunden(daten, klasseId, fachId, quelle, opt) {
  const m = schuelerStunden(daten, klasseId, quelle, opt);
  if (fachId) return (m.get(fachId) || { wert: 0 }).wert;
  // Summe über alle Fächer: Unterricht der ganzen Klasse + Halbgruppen (✂, jeder Schüler sitzt in einer der beiden) + Wahlgruppen
  // (Fächer, die es nur für einzelne Gruppen ohne ✂ gibt, z. B. Religion und Ethik): Dort zählt die Gruppe mit den meisten Stunden –
  // ein Schüler besucht nur eine von ihnen.
  const k = daten.klassen.find(x => x.id === klasseId); if (!k) return 0;
  const struktur = quelle === 'tafel' ? schuelerStunden(daten, klasseId, 'verteilung', opt) : m, wahl = {};
  let s = 0;
  m.forEach((x, f) => {
    const st = struktur.get(f), gs = st ? Object.keys(st.gruppen) : [];
    if (!gs.length || (k.teilung || {})[f] || st.ganz > 0) { s += x.wert; return; }
    gs.forEach(g => { wahl[g] = (wahl[g] || 0) + (quelle === 'tafel' ? x.wert : (x.gruppen[g] || 0)); });
  });
  // Wahlblöcke: Gruppen, deren Unterrichte gekoppelt sind (Religion ∥ Ethik), sind Alternativen; verschiedene Wahlblöcke (Religion/Ethik und
  // Französisch/Latein) addieren sich. Gruppen ohne Kopplung gelten zusammen als ein Wahlblock.
  const block = {}, eigen = new Set(k.gruppen.map(g => g.id)), jeKop = new Map();
  daten.unterrichte.forEach(u => { if (u.aufgabe || !u.kopplung || !u.klassen.includes(klasseId)) return; const gr = u.gruppen.filter(g => eigen.has(g) && wahl[g] !== undefined); if (!gr.length) return; if (!jeKop.has(u.kopplung)) jeKop.set(u.kopplung, new Set()); gr.forEach(g => jeKop.get(u.kopplung).add(g)); });
  const finde = g => { while (block[g] !== undefined && block[g] !== g) g = block[g]; return g; };
  Object.keys(wahl).forEach(g => { block[g] = g; });
  jeKop.forEach(set => { const l = [...set]; l.forEach(g => { block[finde(g)] = finde(l[0]); }); });
  const inKop = new Set([...jeKop.values()].flatMap(x => [...x])), max = {};
  Object.keys(wahl).forEach(g => { const b = inKop.has(g) ? finde(g) : '#ohne'; max[b] = Math.max(max[b] || 0, wahl[g]); });
  return s + Object.values(max).reduce((a, b) => a + b, 0);
}
// Abgleich Stundentafel ↔ Unterrichtsverteilung (↔ Plan mit opt.plan): alle Klasse-Fach-Paare, die nicht übereinstimmen.
// Klassen ohne Stundentafel werden mit art 'ohneTafel' gemeldet (ein Eintrag je Klasse).
function stundenAbgleich(daten, opt) {
  opt = opt || {};
  const bl = opt.bl || bloeckeAlle(daten), uMap = new Map(daten.unterrichte.map(u => [u.id, u])), fI = new Set(daten.faecher.map(f => f.id)), out = [];
  const hatPlan = !!opt.plan && daten.plan.platzierungen.length > 0;
  daten.klassen.forEach(k => {
    const soll = schuelerStunden(daten, k.id, 'tafel'), ist = schuelerStunden(daten, k.id, 'verteilung', { bl }), plan = hatPlan ? schuelerStunden(daten, k.id, 'plan', { bl, uMap }) : null;
    if (!soll.size) { if (ist.size) out.push({ art: 'ohneTafel', klasse: k.id, fach: null, tafel: 0, verteilung: schuelerWochenstunden(daten, k.id, null, 'verteilung', { bl }), plan: null }); }
    const faecher = new Set([...soll.keys(), ...ist.keys()]);
    faecher.forEach(f => {
      if (!fI.has(f)) return;
      const s = (soll.get(f) || { wert: 0 }).wert, x = ist.get(f) || { wert: 0, gleich: true, gruppen: {} }, p = plan ? (plan.get(f) || { wert: 0, gleich: true }) : null;
      const e = { klasse: k.id, fach: f, tafel: s, verteilung: x.wert, plan: p ? p.wert : null, gruppen: x.gruppen };
      if (soll.size && Math.abs(s - x.wert) > 1e-9) out.push(Object.assign({ art: 'verteilung' }, e));
      else if (!x.gleich) out.push(Object.assign({ art: 'gruppen' }, e));
      else if (p && (Math.abs(p.wert - x.wert) > 1e-9 || !p.gleich)) out.push(Object.assign({ art: 'plan' }, e));
    });
  });
  return out;
}
// Co-Bedarf eines Unterrichts in durchschnittlichen Wochenstunden (einzige Quelle): je Klasse der Eintrag der Stundentafel
// (klasse.coBedarf: 'alle' | Zahl | 'kein'), sonst die Vorgabe des Fachs. Liefert { std, alle, schnitt }.
function coBedarfVon(daten, u, bl, fach) {
  const schnitt = bl ? stundenSchnitt(u, bl) : u.wochenstunden * wochenAnteil(u.rhythmus);
  if (u.aufgabe || !u.fach || !u.klassen.length) return { std: 0, alle: false, schnitt };
  const f = fach || daten.faecher.find(x => x.id === u.fach);
  let std = 0, alle = false;
  u.klassen.forEach(kid => {
    const k = daten.klassen.find(x => x.id === kid); if (!k) return;
    let v = (k.coBedarf || {})[u.fach];
    if (v === undefined) v = f && f.coBedarf ? 'alle' : 'kein';
    if (v === 'alle') { alle = true; std = schnitt; } else if (v !== 'kein') std = Math.max(std, Math.min(v, schnitt));
  });
  return { std, alle: alle || (std > 0 && std >= schnitt - 1e-9), schnitt };
}
/* ---------------------------------------------------------------------------------------------------------------------
   PARALLELBÄNDER (einzige Quelle): Zwei geteilte Fächer einer Klasse, die als Parallelpartner eingetragen sind (klasse.parallel),
   liegen immer zeitgleich – Gruppe 1 hat das eine Fach, Gruppe 2 das andere, im zweiten Band umgekehrt. Technisch sind die beiden
   Unterrichte eines Bandes gekoppelt (ein gemeinsames Ereignis); die Kopplung erzeugt das Programm, niemand trägt eine Kopplungs-ID ein.
   Liefert je Partnerpaar { klasse, faecher: [f1, f2], paare: [[unterrichtId, unterrichtId], …], fehler }.
   --------------------------------------------------------------------------------------------------------------------- */
function parallelBaender(daten) {
  const out = [], fIdx = new Map(daten.faecher.map((f, i) => [f.id, i]));
  daten.klassen.forEach(k => {
    const par = k.parallel || {}, gesehen = new Set();
    Object.keys(par).forEach(fa => {
      const fb = par[fa];
      if (gesehen.has(fa) || par[fb] !== fa || !fIdx.has(fa) || !fIdx.has(fb)) return;
      gesehen.add(fa); gesehen.add(fb);
      const fs = fIdx.get(fa) <= fIdx.get(fb) ? [fa, fb] : [fb, fa];
      const band = { klasse: k.id, faecher: fs, paare: [], fehler: '' };
      out.push(band);
      const us = f => daten.unterrichte.filter(u => !u.aufgabe && u.fach === f && u.klassen.includes(k.id) && u.wochenstunden > 0);
      const u1 = us(fs[0]), u2 = us(fs[1]);
      if (!u1.length && !u2.length) return; // noch kein Unterricht – nichts zu koppeln
      const hp = halbPaar(k);
      if (!hp) { band.fehler = 'Die Klasse hat keine zwei Halbgruppen.'; return; }
      const von = (liste, g) => liste.filter(u => u.klassen.length === 1 && u.gruppen.length === 1 && u.gruppen[0] === g.id);
      const a1 = von(u1, hp[0]), b1 = von(u1, hp[1]), a2 = von(u2, hp[0]), b2 = von(u2, hp[1]);
      if (u1.length !== 2 || u2.length !== 2 || a1.length !== 1 || b1.length !== 1 || a2.length !== 1 || b2.length !== 1) { band.fehler = 'Für beide Fächer wird genau je ein Unterricht für jede der beiden Gruppen gebraucht.'; return; }
      const alle = [a1[0], b1[0], a2[0], b2[0]];
      if (alle.some(u => u.kopplung)) { band.fehler = 'Einer der Unterrichte hat eine eigene Kopplung – sie verträgt sich nicht mit dem Parallelband.'; return; }
      if (alle.some(u => u.wochenstunden !== alle[0].wochenstunden || u.rhythmus !== alle[0].rhythmus)) { band.fehler = 'Die beiden Fächer brauchen dieselbe Stundenzahl und denselben Rhythmus.'; return; }
      band.paare = [[a1[0].id, b2[0].id], [b1[0].id, a2[0].id]];
    });
  });
  return out;
}
// Unterricht → Kopplungsname seines Parallelbandes (nur vollständige Bänder)
function parallelKopplung(daten, baender) {
  const m = new Map(), kN = new Map(daten.klassen.map(k => [k.id, k.name])), fK = new Map(daten.faecher.map(f => [f.id, f.kuerzel || f.name]));
  (baender || parallelBaender(daten)).forEach(b => b.paare.forEach((p, i) => { const name = 'Parallelband ' + (kN.get(b.klasse) || '?') + ' ' + b.faecher.map(f => fK.get(f) || '?').join('/') + ' (' + (i + 1) + ')'; p.forEach(uid => m.set(uid, name)); }));
  return m;
}
function blockText(bl) { return bl.dauer.map((d, i) => d + (bl.woche[i] !== 'jede' ? bl.woche[i] : '')).join('+'); }
function slotText(M, s) {
  const d = Math.floor(s / M.H), h = s % M.H;
  const tag = M.data.schule.tage[d] || ('Tag ' + (d + 1));
  return M.pause[h] ? tag + ' ' + ((M.data.schule.stunden[h] || {}).name || 'Pause') : tag + ' ' + M.lnr[h] + '.';
}

// Handbesetzung einzelner Termine im Plan-Editor („Nur diese Stunde besetzen“):
//   plan.besetzung: Lehrkräfte, die von Hand NUR für einen einzelnen Block eingesetzt sind. Map 'unterricht|blockNr' → [lehrerId]
//   plan.frei:      eingetragene Lehrkräfte, die einen einzelnen Block NICHT halten (für diesen Termin ersetzt). Map 'unterricht|blockNr' → Map(lehrerId → Grund)
// Beide gelten, solange Unterricht, Person und Blockaufteilung bestehen. Die Berechnung erzeugt keine solchen Einträge.
function besetzungSig(bl) { return bl ? blockText(bl) : ''; }
function freiMap(d) {
  const out = new Map(), liste = (d.plan && d.plan.frei) || [];
  if (!liste.length) return out;
  const bl = bloeckeAlle(d), uMap = new Map(d.unterrichte.map(u => [u.id, u]));
  liste.forEach(x => {
    const u = uMap.get(x.unterricht), b = u && bl.get(u.id);
    if (!u || u.aufgabe || !b || x.blockNr < 1 || x.blockNr > b.dauer.length || x.sig !== besetzungSig(b) || !u.lehrkraefte.some(z => z.lehrer === x.lehrer && z.modus !== 'anteilig')) return;
    const k = x.unterricht + '|' + x.blockNr; if (!out.has(k)) out.set(k, new Map()); out.get(k).set(x.lehrer, x.grund || 'für diesen Termin ersetzt');
  });
  return out;
}
function besetzungMap(d) {
  const out = new Map(), liste = (d.plan && d.plan.besetzung) || [];
  out.co = new Set(); // 'unterricht|blockNr|lehrer' der nur als Co-Lehrkraft Eingesetzten
  if (!liste.length) return out;
  const bl = bloeckeAlle(d), lIds = new Set(d.lehrer.map(l => l.id)), uMap = new Map(d.unterrichte.map(u => [u.id, u]));
  liste.forEach(x => {
    const u = uMap.get(x.unterricht), b = u && bl.get(u.id);
    if (!u || u.aufgabe || !b || !lIds.has(x.lehrer) || x.blockNr < 1 || x.blockNr > b.dauer.length || x.sig !== besetzungSig(b)) return;
    const k = x.unterricht + '|' + x.blockNr;
    // wer ohnehin (für alle Blöcke) eingetragen ist, braucht keinen Eintrag
    if (u.lehrkraefte.some(z => z.lehrer === x.lehrer && z.modus !== 'anteilig')) return;
    if (!out.has(k)) out.set(k, []);
    if (!out.get(k).includes(x.lehrer)) out.get(k).push(x.lehrer);
    if (x.rolle === 'co') out.co.add(k + '|' + x.lehrer);
  });
  return out;
}
// Blöcke, in denen über die Co-Lehrkraft von Hand entschieden wurde: eine Co-Person für diesen Termin herausgenommen bzw. ersetzt (plan.frei mit
// rolle 'co') oder eine Co-Person nur für diesen Termin eingesetzt (plan.besetzung mit rolle 'co'). Die automatische Co-Planung lässt diese Blöcke
// unberührt, und sie zählen nicht als Co-Lücke. Ergebnis: Map 'unterricht|blockNr' → Set der herausgenommenen Personen (leer bei reiner Handbesetzung).
function coHandBloecke(d) {
  const out = new Map(), frei = (d.plan && d.plan.frei) || [], bes = (d.plan && d.plan.besetzung) || [];
  if (!frei.some(x => x.rolle === 'co') && !bes.some(x => x.rolle === 'co')) return out;
  const bl = bloeckeAlle(d), uMap = new Map(d.unterrichte.map(u => [u.id, u]));
  const gueltig = x => { const u = uMap.get(x.unterricht), b = u && bl.get(u.id); return !!(u && !u.aufgabe && b && x.blockNr >= 1 && x.blockNr <= b.dauer.length && x.sig === besetzungSig(b)); };
  frei.forEach(x => { if (x.rolle !== 'co' || !gueltig(x)) return; const k = x.unterricht + '|' + x.blockNr; if (!out.has(k)) out.set(k, new Set()); out.get(k).add(x.lehrer); });
  bes.forEach(x => { if (x.rolle !== 'co' || !gueltig(x)) return; const k = x.unterricht + '|' + x.blockNr; if (!out.has(k)) out.set(k, new Set()); });
  return out;
}
// Fachlehrkräfte, die einen Block tatsächlich halten: eingetragene (ohne die für diesen Termin ersetzten) plus von Hand eingesetzte
function blockFachLehrer(u, blockNr, freiM, handM) {
  const k = u.id + '|' + blockNr, o = freiM && freiM.get(k), hd = (handM && handM.get(k)) || [];
  const out = u.lehrkraefte.filter(z => z.rolle === 'fach' && z.lehrer && !(o && o.has(z.lehrer))).map(z => z.lehrer);
  hd.forEach(l => { if (handM.co && handM.co.has(k + '|' + l)) return; if (!out.includes(l)) out.push(l); });
  return out;
}
// Kompiliert den Datenstand in ein Modell M mit Indizes, Arrays und Ereignissen (Blöcken)
function kompiliere(data, opt) {
  opt = opt || {};
  const lock = new Set(opt.gelockert || []);
  const M = { data, fehler: [], warnungen: [], lock };
  const fehler = (text, ziel) => M.fehler.push({ text, ziel: ziel || null });
  const sch = data.schule;
  const D = sch.tage.length, H = sch.stunden.length, S = D * H;
  M.D = D; M.H = H; M.S = S;
  M.pause = new Uint8Array(H); M.dbl = new Uint8Array(H); M.lnr = new Int16Array(H);
  let n = 0;
  sch.stunden.forEach((st, h) => { M.pause[h] = st.istPause ? 1 : 0; M.dbl[h] = st.doppelMitNaechster ? 1 : 0; M.lnr[h] = st.istPause ? 0 : ++n; });
  M.nL = n;
  M.adj = new Uint8Array(H);
  for (let h = 0; h < H - 1; h++) M.adj[h] = (!M.pause[h] && !M.pause[h + 1]) ? 1 : 0;
  // Unterrichtsschluss je Wochentag: letzte erlaubte Stunde (Nummer der Unterrichtsstunde)
  M.schluss = new Int16Array(D);
  for (let d = 0; d < D; d++) { const v = (sch.tagSchluss || {})[sch.tage[d]]; M.schluss[d] = v >= 1 && v < n ? v : n; }
  M.slotOk = new Uint8Array(S); // Slot ist Unterrichtsstunde (keine Pause, nicht nach Unterrichtsschluss)
  for (let s = 0; s < S; s++) { const h = s % H, d = Math.floor(s / H); M.slotOk[s] = M.pause[h] || M.lnr[h] > M.schluss[d] ? 0 : 1; }
  // --- Regelwerk: hart/weich und Gewichte ---
  const rw = data.regeln;
  M.opt = rw.optionen;
  M.hart = new Uint8Array(RN); M.gew = new Float64Array(RN);
  REGELN.forEach((r, i) => {
    if (r.hart) {
      const weich = r.umschaltbar && rw.hartUmschaltbar[r.id] === 'weich';
      M.hart[i] = weich ? 0 : 1;
      M.gew[i] = weich ? _num(rw.gewichteHart[r.id], 5) : 0;
    } else { M.hart[i] = 0; M.gew[i] = _num(rw.gewichte[r.id], r.std) * (r.id === 'W14' ? 8 : 1); } // W14: Co-Stunden sind Pflicht (Ampel) – 8-faches Gewicht
  });
  M.h15weich = rw.hartUmschaltbar.H15 === 'weich';
  if (M.h15weich) M.gew[RI.H15] = 0; // Lücken zählen dann über W02
  else M.gew[RI.W02] = 0;
  M.minimal = !!opt.minimal;
  if (!M.minimal) M.gew[RI.W16] = 0;
  for (const id of lock) { const i = RI[id]; if (i !== undefined && REGELN[i].hart) { M.hart[i] = 0; M.gew[i] = 3; } }
  M.referenz = opt.referenz || null;
  M.hartIdx = []; M.weichIdx = [];
  for (let r = 0; r < RN; r++) (M.hart[r] ? M.hartIdx : M.weichIdx).push(r);
  // --- Fächer ---
  const F = data.faecher.length; M.F = F;
  M.fI = new Map(data.faecher.map((f, i) => [f.id, i]));
  M.fMax = new Int16Array(Math.max(1, F)); M.fSchwer = new Uint8Array(Math.max(1, F));
  M.fKz = []; M.fTyp = []; M.fDbl = []; M.fFarbe = [];
  data.faecher.forEach((f, i) => { M.fMax[i] = f.maxProTag; M.fSchwer[i] = f.schwer ? 1 : 0; M.fKz.push(f.kuerzel || f.name || '?'); M.fTyp.push(f.raumTyp); M.fDbl.push(f.doppelstunde); M.fFarbe.push(f.farbe); });
  M.paar = rw.paarregeln.map(p => ({ typ: p.typ, a: M.fI.has(p.a) ? M.fI.get(p.a) : -1, b: M.fI.has(p.b) ? M.fI.get(p.b) : -1 }));
  // --- Lehrkräfte ---
  const T = data.lehrer.length; M.T = T;
  M.lI = new Map(data.lehrer.map((l, i) => [l.id, i]));
  M.lVerf = new Int8Array(Math.max(1, T) * S).fill(1);
  M.lMax = new Int16Array(Math.max(1, T)); M.lMin = new Int16Array(Math.max(1, T)); M.lHohl = new Int16Array(Math.max(1, T));
  M.lFrei = new Uint8Array(Math.max(1, T) * D); M.lWunsch = new Uint8Array(Math.max(1, T)); M.lTagOk = new Uint8Array(Math.max(1, T) * D);
  M.lKz = [];
  // H16 Arbeitszeitgrenzen: Höchstarbeitszeit je Tag und Wochenarbeitszeit (Minuten, 0 = keine Grenze); lTagFix/lWocheFix = Termine und Klassenleitung
  const azm = sch.arbeitszeitModell || ARBEITSZEIT_STD;
  const ohneVM = ohneVorbSet(data), handM = besetzungMap(data), freiM = freiMap(data), coHandM = coHandBloecke(data);
  M.stdMin = standardMinuten(sch);
  M.lGap = new Uint8Array(Math.max(1, T) * S);
  M.lTagMax = new Int32Array(Math.max(1, T)); M.lWocheMax = new Int32Array(Math.max(1, T));
  M.lTagFix = new Float64Array(Math.max(1, T) * D); M.lWocheFix = new Float64Array(Math.max(1, T));
  data.lehrer.forEach((l, t) => {
    M.lKz.push(l.kuerzel || l.name || '?');
    for (let d = 0; d < D; d++) for (let h = 0; h < H; h++) {
      let v = l.verfuegbarkeit[d][h];
      if (l.anwesenheit === 'teilzeit' && l.anwesenheitTage.length && !l.anwesenheitTage.includes(d)) v = 0;
      if (l.anwesenheit === 'ausbildungstag' && l.anwesenheitTage.includes(d)) v = 0;
      if (v === 0 && lock.has('H05')) v = -1;
      M.lVerf[t * S + d * H + h] = v;
      if (v === 2 && !M.pause[h]) M.lWunsch[t] = 1;
      if (v !== 0 && !M.pause[h]) M.lTagOk[t * D + d] = 1;
    }
    M.lMax[t] = l.maxStundenTag; M.lMin[t] = l.minStundenTag; M.lHohl[t] = l.maxHohlstundenTag;
    l.freierTagWunsch.forEach(d => { if (d < D) M.lFrei[t * D + d] = 1; });
    // gesperrte Pausen zwischen zwei Stunden (Lücken): ein Aufgabenblock darf nicht darüber liegen
    (l.pausenGesperrt || []).forEach(k => { const [dd, key] = k.split('|'); const d = Number(dd), h = Number(key.slice(1)); if (d < D && h < H) M.lGap[t * S + d * H + h] = 1; });
    M.lTagMax[t] = Math.round((l.maxArbeitTag || 0) * 60); M.lWocheMax[t] = Math.round((l.arbeitszeit || 0) * 60);
    if (l.klassenleitung && data.klassen.some(k => k.id === l.klassenleitung)) M.lWocheFix[t] += azm.klassenleitungMin;
  });
  // Aufgaben mit festen Terminen: Stunden, die sich mit dem Termin überschneiden, sind für die Person belegt (H05).
  // Termine, die ganz in einer Pause liegen, berühren keine Stunde.
  M.lTermin = new Uint8Array(Math.max(1, T) * S);
  if (data.unterrichte.some(u => u.aufgabe && u.termine && u.termine.length)) {
    const zg = stundenZeiten(sch, null), pl = pausenListe(sch, data.klassen);
    data.unterrichte.forEach(u => aufgabeTermine(data, u, pl).forEach(tm => u.lehrkraefte.forEach(z => {
      const t = M.lI.get(z.lehrer); if (t === undefined) return;
      for (let h = 0; h < H; h++) if (!M.pause[h] && zg[h] && zg[h].start < tm.end && tm.start < zg[h].end) { M.lVerf[t * S + tm.tag * H + h] = lock.has('H05') ? -1 : 0; M.lTermin[t * S + tm.tag * H + h] = 1; }
      M.lTagFix[t * D + tm.tag] += tm.minuten; M.lWocheFix[t] += tm.minuten;
    })));
  }
  // Aufsichten haben gegenüber Unterricht niemals Vorrang: Sie sind keine Sperrzeit und keine Arbeitszeitreserve des Stundenplans.
  // Erst wenn Fach- und Co-Unterricht feststehen, plant die Dienst-Engine alle Aufsichten dagegen.
  // --- Räume ---
  const R = data.raeume.length; M.R = R;
  M.rI = new Map(data.raeume.map((r, i) => [r.id, i]));
  M.rTyp = []; M.rName = []; M.rKap = new Int16Array(Math.max(1, R)); M.rTeil = new Int16Array(Math.max(1, R));
  M.rVerf = new Int8Array(Math.max(1, R) * S).fill(1); M.rHeimK = new Int32Array(Math.max(1, R)).fill(-1);
  data.raeume.forEach((r, i) => {
    M.rTyp.push(r.typ); M.rName.push(r.name || '?'); M.rKap[i] = r.kapazitaet; M.rTeil[i] = r.teilbar;
    for (let d = 0; d < D; d++) for (let h = 0; h < H; h++) { let v = r.verfuegbarkeit[d][h]; if (v === 0 && lock.has('H05')) v = -1; M.rVerf[i * S + d * H + h] = v; }
  });
  // --- Klassen und Einheiten (Klasse ganz + Gruppen) ---
  const C = data.klassen.length; M.C = C;
  M.kI = new Map(data.klassen.map((k, i) => [k.id, i]));
  M.unitK = []; M.unitLokal = [];
  for (let t = 0; t < T; t++) { M.unitK.push(-1); M.unitLokal.push(0); }
  M.kGanz = new Int32Array(Math.max(1, C)); M.kUnits = []; M.gU = new Map(); M.gK = new Map(); M.gSch = new Map(); M.gName = new Map();
  let u = T; let maxKU = 1;
  M.kUnitSch = []; M.kUnitName = [];
  M.kName = []; M.kFrueh = new Int16Array(Math.max(1, C)); M.kSpaet = new Int16Array(Math.max(1, C)); M.kMax = new Int16Array(Math.max(1, C));
  M.kJg = new Int16Array(Math.max(1, C)); M.kSch = new Int16Array(Math.max(1, C)); M.kHeim = new Int32Array(Math.max(1, C)).fill(-1); M.kKL = new Int32Array(Math.max(1, C)).fill(-1);
  data.klassen.forEach((k, c) => {
    const units = [u]; M.kGanz[c] = u; M.unitK.push(c); M.unitLokal.push(0); u++;
    k.gruppen.forEach((g, gi) => {
      M.gU.set(g.id, u); M.gK.set(g.id, c); M.gSch.set(g.id, g.schueler || Math.ceil(k.schueler / 2)); M.gName.set(g.id, g.name || ('G' + (gi + 1)));
      units.push(u); M.unitK.push(c); M.unitLokal.push(gi + 1); u++;
    });
    M.kUnits.push(units); maxKU = Math.max(maxKU, units.length);
    M.kUnitSch.push([k.schueler].concat(k.gruppen.map(g => g.schueler || Math.ceil(k.schueler / 2)))); M.kUnitName.push(['ganze Klasse'].concat(k.gruppen.map((g, gi) => g.name || ('G' + (gi + 1)))));
    M.kName.push(k.name || '?'); M.kFrueh[c] = k.fruehestens; M.kSpaet[c] = k.spaetestens; M.kMax[c] = k.maxStundenTag;
    M.kJg[c] = k.jahrgang; M.kSch[c] = k.schueler;
    if (k.heimatraum && M.rI.has(k.heimatraum)) { M.kHeim[c] = M.rI.get(k.heimatraum); M.rHeimK[M.kHeim[c]] = c; }
  });
  M.NU = u; M.maxKU = maxKU;
  data.lehrer.forEach((l, t) => { if (l.klassenleitung && M.kI.has(l.klassenleitung)) M.kKL[M.kI.get(l.klassenleitung)] = t; });
  // H13: Höchstzahl je Tag je Klasse und Fach (eigener Wert der Klasse oder Vorgabe des Fachs)
  M.kfMax = new Int16Array(Math.max(1, C * F));
  data.klassen.forEach((k, c) => data.faecher.forEach((f, i) => { M.kfMax[c * F + i] = fachMaxTag(k, f); }));
  // --- Unterrichte ---
  M.uI = new Map(data.unterrichte.map((x, i) => [x.id, i]));
  const abAn = sch.wochenrhythmus === 'AB', teilRegel = teilungsRegeln(data), abMap = abZusatzWochen(data, teilRegel);
  M.baender = parallelBaender(data); const bandKop = parallelKopplung(data, M.baender);
  // Unterrichte mit einzeln festgelegten Blöcken (von Hand besetzt, „für diesen Termin ersetzt“, gesperrt) behalten ihre Aufteilung
  const blockFest = new Set(), uidVon = k => k.slice(0, k.lastIndexOf('|'));
  for (const k of handM.keys()) blockFest.add(uidVon(k));
  for (const k of freiM.keys()) blockFest.add(uidVon(k));
  data.plan.platzierungen.forEach(p => { if (p.gesperrt) blockFest.add(p.unterricht); });
  M.U = data.unterrichte.map((x, i) => {
    const f = M.fI.has(x.fach) ? M.fI.get(x.fach) : -1;
    // Fachregel für die Blockaufteilung: „höchstens 1 je Tag“ (Fach oder Klasse) schließt Doppelstunden aus
    const fach = f >= 0 ? fachFuerBloecke(data, x, data.faecher[f]) : null;
    const name = x.aufgabe ? (x.name || x.kuerzel || 'Aufgabe') : (f >= 0 ? M.fKz[f] : '?') + ' ' + x.klassen.map(k => M.kI.has(k) ? M.kName[M.kI.get(k)] : '?').join('/');
    const U = { id: x.id, i, f, name, klassen: [], units: [], schueler: 0, immer: [], coZiel: [], lehrer: [], fachL: [], rolle: new Map(), ws: x.wochenstunden, rhythmus: x.rhythmus, kopplung: x.kopplung || bandKop.get(x.id) || '', band: !x.kopplung && bandKop.has(x.id), aufgabe: !!x.aufgabe, kurz: x.aufgabe ? (x.kuerzel || x.name || 'Aufg.') : '', farbe: x.aufgabe ? x.farbe : '' };
    const ziel = { seite: x.aufgabe ? 'aufgaben' : 'unterricht', id: x.id };
    if (f < 0 && !x.aufgabe) fehler('Unterricht „' + name + '“ hat kein gültiges Fach.', ziel);
    const unitSet = new Set();
    const addUnit = un => { if (!unitSet.has(un)) { unitSet.add(un); U.units.push(un); } };
    x.klassen.forEach(kid => {
      if (!M.kI.has(kid)) { fehler('Unterricht „' + name + '“ verweist auf eine unbekannte Klasse.', ziel); return; }
      const c = M.kI.get(kid);
      if (!U.klassen.includes(c)) U.klassen.push(c);
      const gs = x.gruppen.filter(g => M.gK.get(g) === c);
      if (gs.length) gs.forEach(g => { addUnit(M.gU.get(g)); U.schueler += M.gSch.get(g); });
      else { M.kUnits[c].forEach(addUnit); U.schueler += M.kSch[c]; }
    });
    x.gruppen.forEach(g => {
      if (!M.gK.has(g)) return;
      const c = M.gK.get(g);
      if (!U.klassen.includes(c)) { U.klassen.push(c); addUnit(M.gU.get(g)); U.schueler += M.gSch.get(g); }
    });
    if (!U.klassen.length && !x.aufgabe) fehler('Unterricht „' + name + '“ hat keine Klasse.', ziel);
    x.lehrkraefte.forEach(z => {
      if (!M.lI.has(z.lehrer)) return;
      const t = M.lI.get(z.lehrer);
      if (U.lehrer.includes(t)) { fehler('Lehrkraft ' + M.lKz[t] + ' ist im Unterricht „' + name + '“ doppelt eingetragen.', ziel); return; }
      if (z.rolle === 'fach' && data.lehrer[t].ausgebildet === false && !z.zwang && !x.aufgabe) fehler(M.lKz[t] + ' ist keine ausgebildete Lehrkraft und darf in „' + name + '“ nur als Co-Lehrkraft eingesetzt werden (oder mit „Zwang“ im Unterrichtsdialog).', ziel);
      U.lehrer.push(t); U.rolle.set(t, z.rolle);
      if (z.rolle === 'fach') U.fachL.push(t);
      if (z.modus === 'anteilig') U.coZiel.push({ t, anteil: Math.max(0, Math.min(z.stundenAnteil, x.wochenstunden * wochenAnteil(x.rhythmus))) });
      else U.immer.push(t);
    });
    if (!U.fachL.length) {
      if (x.aufgabe) fehler('Aufgabe „' + name + '“ ist keiner Person zugeordnet.', { seite: 'aufgaben', id: x.id });
      else if (!x.fachAuto) M.warnungen.push({ ohneLk: i, text: 'Unterricht „' + name + '“ hat keine Fachlehrkraft. Die Stunden werden für die Klasse eingeplant und müssen von Hand besetzt werden – oder „Fachlehrkraft automatisch“ wählen.', ziel: { seite: 'unterricht', id: x.id } });
    } else if (!U.immer.length) fehler('Unterricht „' + name + '“: mindestens eine Lehrkraft muss im Modus „immer“ dabei sein.', ziel);
    const bl = bloeckeMitWoche(x, teilRegel.has(x.id) ? { doppelstunde: teilRegel.get(x.id) } : fach, D, abAn, abMap.get(x.id));
    U.bloecke = bl.dauer; U.blockWoche = bl.woche; U.abAuto = bl.abAuto;
    U.regel = fach ? (teilRegel.has(x.id) ? teilRegel.get(x.id) : fach.doppelstunde) : 'egal';
    // Variable Blockaufteilung (nur in der Berechnung): ein Pool aus Doppel-, Einzel- und 14-tägigen Blöcken; aktiv ist immer genau ein Muster
    U.muster = null;
    if (opt.muster && !x.aufgabe && fach && x.rhythmus === 'jede' && !x.bloecke.length && !x.kopplung && !bandKop.has(x.id) && !x.gruppen.length && !x.fixiert.length
      && !blockFest.has(x.id) && !teilRegel.has(x.id) && !x.lehrkraefte.some(z => z.modus === 'anteilig') && x.wochenstunden >= 1) {
      const liste = musterListe(x.wochenstunden, fach.doppelstunde, fach.maxProTag, D, lock.has('H07'));
      if (liste.length > 1 || liste.some(m => m.nb)) {
        // Standardaufteilung nach Fachregel – auch wenn eine frühere Berechnung anders aufgeteilt hat. Jede Abweichung davon ist in der Suche
        // teuer (letztes Mittel, wenn der Plan sonst nicht aufgeht)
        const blS = bl.auto ? bloeckeMitWoche(Object.assign({}, x, { bloeckeAuto: null, bloeckeAutoWoche: null }), fach, D, abAn, abMap.get(x.id)) : bl;
        const z = musterZaehlen(blS.dauer, blS.woche);
        let st = liste.findIndex(m => m.n2 === z.n2 && m.n1 === z.n1 && m.nb === z.nb);
        if (st < 0) { let bw = Infinity; liste.forEach((m, i) => { const w = musterStrafe(fach.doppelstunde, x.wochenstunden, m.n2, m.n1, m.nb) + (m.n2 + m.n1 + m.nb) * 0.01; if (w < bw) { bw = w; st = i; } }); z.w = 0; }
        const K2 = Math.max(...liste.map(m => m.n2)), K1 = Math.max(...liste.map(m => m.n1)), hatBi = liste.some(m => m.nb);
        U.muster = { liste, K2, K1, hatBi, start: st, w: z.w, ws: x.wochenstunden, regel: fach.doppelstunde, std: { n2: liste[st].n2, n1: liste[st].n1, nb: liste[st].nb } };
        U.bloecke = Array(K2).fill(2).concat(Array(K1).fill(1), hatBi ? [2, 2] : []);
        U.blockWoche = Array(K2 + K1).fill('jede').concat(hatBi ? ['A', 'B'] : []);
        U.abAuto = hatBi;
      }
    }
    const summe = U.muster ? x.wochenstunden : x.rhythmus !== 'jede' ? U.bloecke.reduce((a, b) => a + b, 0) : U.bloecke.reduce((a, b, j) => a + b * (U.blockWoche[j] === 'jede' ? 1 : 0.5), 0);
    if (Math.abs(summe - x.wochenstunden) > 1e-9) fehler('Unterricht „' + name + '“: Blockaufteilung ' + blockText(bl) + ' ergibt nicht ' + x.wochenstunden + ' UStd. je Woche' + (U.blockWoche.some(w => w !== 'jede') ? ' (A/B-Blöcke zählen halb)' : '') + '.', ziel);
    if (!x.aufgabe && U.bloecke.some(b => b !== 1 && b !== 2)) fehler('Unterricht „' + name + '“: Blöcke dürfen nur 1 oder 2 UStd. lang sein.', ziel);
    if (x.aufgabe && U.bloecke.some(b => b > H)) fehler('Aufgabe „' + name + '“: Ein Block ist länger als der Tag (' + H + ' Zeilen im Zeitraster).', ziel);
    if (!x.aufgabe && !U.muster && U.bloecke.length > D && !lock.has('H07')) fehler('Unterricht „' + name + '“: ' + U.bloecke.length + ' Blöcke passen nicht auf ' + D + ' verschiedene Tage.', ziel);
    if (fach && fach.doppelstunde === 'pflicht' && U.bloecke.some(b => b === 1) && x.wochenstunden % 2 === 1 && !x.aufgabe && !(x.bloecke && x.bloecke.length)) fehler('Unterricht „' + name + '“: ' + x.wochenstunden + ' UStd. nur in Woche ' + x.rhythmus + ' können bei ausschließlich zulässigen Doppelstunden nicht exakt abgebildet werden. Abhilfe: gerade Stundenzahl oder Rhythmus „jede Woche“ (dann liegt die übrige Doppelstunde im Wechsel).', ziel);
    else if (fach && fach.doppelstunde === 'pflicht' && U.bloecke.some(b => b === 1) && x.wochenstunden % 2 === 1 && !x.aufgabe) M.warnungen.push({ text: 'Unterricht „' + name + '“: Das Fach verlangt Doppelstunden, ' + (x.bloecke && x.bloecke.length ? 'die eingetragene Blockaufteilung ' + blockText(bl) + ' enthält aber Einzelstunden. Im Unterrichtsdialog das Feld „Blöcke“ leeren – dann plant das Programm nur Doppelstunden (bei ungerader Stundenzahl liegt die übrige im Wechsel A-/B-Woche).' : 'der Unterricht liegt aber nur in Woche ' + x.rhythmus + ' und hat eine ungerade Stundenzahl – es bleibt eine Einzelstunde (' + blockText(bl) + '). Abhilfe: gerade Stundenzahl oder Rhythmus „jede Woche“.'), ziel });
    if (fach && fach.doppelstunde === 'pflicht' && U.bloecke.some(b => b === 1) && x.wochenstunden % 2 === 0) fehler('Unterricht „' + name + '“: Fach verlangt Doppelstunden, Blockaufteilung enthält Einzelstunden.', ziel);
    if (fach && fach.doppelstunde === 'verboten' && U.bloecke.some(b => b === 2)) fehler('Unterricht „' + name + '“: ' + (fach._maxGrund ? 'Das Fach darf in der Klasse höchstens einmal am Tag vorkommen, die Blockaufteilung enthält aber einen Doppelblock.' : 'Fach verbietet Doppelstunden, Blockaufteilung enthält einen Doppelblock.'), ziel);
    U.maxBlock = Math.max(1, ...U.bloecke);
    { const z = musterZaehlen(U.bloecke, U.blockWoche); U.w08 = fach && !x.aufgabe && x.rhythmus === 'jede' && !U.muster ? musterStrafe(fach.doppelstunde, x.wochenstunden, z.n2, z.n1, z.nb) : 0; }
    U.wochen = x.rhythmus === 'A' ? [0] : x.rhythmus === 'B' ? [1] : [0, 1];
    U.raumFix = M.rI.has(x.raum) ? M.rI.get(x.raum) : -1;
    U.raumTyp = U.raumFix >= 0 ? M.rTyp[U.raumFix] : (x.raum || (fach ? fach.raumTyp : '') || '');
    U.cands = null;
    if (U.raumFix >= 0) U.cands = [U.raumFix];
    else if (U.raumTyp) {
      const heim = U.klassen.length ? M.kHeim[U.klassen[0]] : -1;
      const passend = [];
      for (let r = 0; r < R; r++) if (M.rTyp[r] === U.raumTyp && M.rKap[r] >= U.schueler) passend.push(r);
      const rang = r => (r === heim ? 0 : (M.rHeimK[r] < 0 ? 1 : 2));
      passend.sort((a, b) => rang(a) - rang(b) || M.rKap[a] - M.rKap[b] || a - b);
      const einzelKlasse = U.klassen.length === 1 && !x.gruppen.length;
      if (einzelKlasse && passend[0] === heim && heim >= 0) {
        // ganze Klasse: nur der eigene Heimatraum; freie Räume ohne Heimatklasse nur, wenn der Heimatraum Sperrzeiten hat
        let gesperrt = false; for (let s0 = 0; s0 < S; s0++) if (M.slotOk[s0] && M.rVerf[heim * S + s0] === 0) gesperrt = true;
        U.cands = gesperrt ? passend.filter(r => rang(r) < 2) : [heim];
      } else U.cands = passend;
      if (!passend.length && U.ws > 0) fehler('Unterricht „' + name + '“: kein Raum vom Typ „' + U.raumTyp + '“ mit mindestens ' + U.schueler + ' Plätzen.', ziel);
    }
    U.fix = x.fixiert.map(p => (p.tag >= 0 && p.tag < D && p.stunde >= 1 && p.stunde <= H) ? p.tag * H + p.stunde - 1 : -1);
    return U;
  });
  // Zeit-Tabellen: je Kombination von Zeitprofilen Beginn und Ende jeder Rasterzeile in Minuten (-1 = keine Zeit)
  const zcM = zeitCache(data), rowMin = sch.stunden.map(s => s.dauer || 45);
  M.zeitTab = []; const zeitKey = new Map();
  const tabFuer = pids => {
    const key = pids.slice().sort().join('|');
    if (zeitKey.has(key)) return zeitKey.get(key);
    const s = new Int16Array(H).fill(-1), e = new Int16Array(H).fill(-1);
    for (let h = 0; h < H; h++) pids.forEach(pid => { const z = zcM(pid)[h]; if (!z) return; s[h] = s[h] < 0 ? z.start : Math.min(s[h], z.start); e[h] = Math.max(e[h], z.end); });
    M.zeitTab.push({ s, e }); zeitKey.set(key, M.zeitTab.length - 1); return M.zeitTab.length - 1;
  };
  tabFuer(['']);
  M.coUs = Array.from({ length: T }, () => null);
  M.U.forEach(U => U.coZiel.forEach(z => { (M.coUs[z.t] || (M.coUs[z.t] = [])).push(U.i); }));
  // --- gesperrte (von Hand fixierte) Platzierungen aus dem Plan ---
  const gesperrt = new Map();
  data.plan.platzierungen.forEach(p => { if (p.gesperrt) gesperrt.set(p.unterricht + '|' + p.blockNr, p.tag * H + p.stunde - 1); });
  // --- Ereignisse: je Block ein Ereignis, gekoppelte Unterrichte als Sammelereignis ---
  M.E = []; M.uEv = M.U.map(() => []);
  const kop = new Map();
  M.U.forEach(U => { if (U.kopplung) { if (!kop.has(U.kopplung)) kop.set(U.kopplung, []); kop.get(U.kopplung).push(U.i); } });
  M.kopplungen = [...kop.values()].filter(g => g.length > 1);
  const gruppen = []; const gesehen = new Uint8Array(M.U.length);
  M.U.forEach(U => {
    if (gesehen[U.i]) return;
    let grp = [U.i];
    if (U.kopplung) grp = kop.get(U.kopplung);
    grp.forEach(j => { gesehen[j] = 1; });
    if (grp.length > 1) {
      const sig = j => M.U[j].bloecke.map((d, q) => d + M.U[j].blockWoche[q]).join(',');
      const b0 = sig(grp[0]);
      const ok = grp.every(j => M.U[j].ws === M.U[grp[0]].ws && sig(j) === b0 && M.U[j].rhythmus === M.U[grp[0]].rhythmus);
      if (!ok) {
        fehler(U.band ? U.kopplung + ': Die beiden Unterrichte haben nicht dieselbe Blockaufteilung (' + grp.map(j => M.U[j].name + ' ' + M.U[j].bloecke.map((d, q) => d + (M.U[j].blockWoche[q] !== 'jede' ? M.U[j].blockWoche[q] : '')).join('+')).join(', ') + '). Die Doppelstunden-Regel der beiden Fächer angleichen oder eigene Blöcke im Unterrichtsdialog entfernen.' : 'Kopplung „' + U.kopplung + '“: gekoppelte Unterrichte haben nicht dieselbe Stundenzahl, Blockaufteilung oder denselben Rhythmus.', { seite: 'unterricht', id: M.U[grp[0]].id });
        grp.forEach(j => gruppen.push([j]));
        return;
      }
    }
    gruppen.push(grp);
  });
  gruppen.forEach(grp => {
    M.U[grp[0]].bloecke.forEach((dur, b) => {
      const e = M.E.length;
      const U0 = M.U[grp[0]], wk = U0.rhythmus !== 'jede' ? U0.rhythmus : U0.blockWoche[b];
      const ev = { i: e, parts: [], dur, units: [], immer: [], co: [], lehrer: [], klassen: [], wochen: wk === 'A' ? [0] : wk === 'B' ? [1] : [0, 1], woche: wk, fixStart: -1, gesperrt: false, konflikt: '', kp: new Map() };
      const seen = new Set();
      grp.forEach(ui => {
        const U = M.U[ui];
        const p = ev.parts.length;
        ev.parts.push({ u: ui, b, f: U.f, cands: U.cands, schueler: U.schueler, typ: U.raumTyp, raumFix: U.raumFix, klassen: U.klassen });
        const frei = freiM.get(U.id + '|' + (b + 1));
        U.immer.forEach(t => { if (frei && frei.has(data.lehrer[t].id)) { (ev.ohne || (ev.ohne = [])).push({ t, grund: frei.get(data.lehrer[t].id) }); return; } if (seen.has(t)) ev.konflikt = 'Lehrkraft ' + M.lKz[t] + ' wird in gekoppelten Unterrichten gleichzeitig verlangt.'; else { seen.add(t); ev.units.push(t); ev.immer.push(t); } });
        U.units.forEach(un => { if (seen.has(un)) ev.konflikt = 'Klasse ' + M.kName[M.unitK[un]] + ' ist in gekoppelten Unterrichten doppelt belegt.'; else { seen.add(un); ev.units.push(un); } });
        // von Hand nur für diesen Block eingesetzte Lehrkräfte
        (handM.get(U.id + '|' + (b + 1)) || []).forEach(lid => { const t = M.lI.get(lid); if (t === undefined || seen.has(t)) return; seen.add(t); ev.units.push(t); ev.immer.push(t); (ev.hand || (ev.hand = [])).push({ t, p, co: handM.co.has(U.id + '|' + (b + 1) + '|' + lid) }); });
        // anteilige Co-Lehrkraft, die für diesen Termin von Hand herausgenommen wurde: hat hier keinen Platz (auch die Suche setzt sie nicht wieder ein)
        const coRaus = coHandM.get(U.id + '|' + (b + 1));
        U.coZiel.forEach(z => { if (seen.has(z.t) && ev.hand && ev.hand.some(x => x.t === z.t)) return; if (coRaus && coRaus.has(data.lehrer[z.t].id)) return; ev.co.push({ t: z.t, p, u: ui }); });
        U.klassen.forEach(c => { if (!ev.klassen.includes(c)) ev.klassen.push(c); if (!ev.kp.has(c)) ev.kp.set(c, []); ev.kp.get(c).push(p); });
        if (U.fix[b] !== undefined && U.fix[b] >= 0) ev.fixStart = U.fix[b];
        const g = gesperrt.get(U.id + '|' + (b + 1));
        if (g !== undefined && ev.fixStart < 0) { ev.fixStart = g; ev.gesperrt = true; }
        M.uEv[ui].push(e);
      });
      ev.co.forEach(z => { if (ev.immer.includes(z.t)) ev.konflikt = 'Lehrkraft ' + M.lKz[z.t] + ' ist im selben Block zugleich fest und anteilig eingeplant.'; });
      ev.lehrer = [...new Set(ev.immer.concat(ev.co.map(z => z.t)))];
      ev.aufgabe = ev.parts.length > 0 && ev.parts.every(p => M.U[p.u].aufgabe);
      // echte Zeit: Tabelle der beteiligten Zeitprofile; Minuten je Startzeile (Aufgaben mit „Pausen zählen“: ganze Spanne, sonst nur die Stunden)
      ev.zg = tabFuer([...new Set(grp.flatMap(ui => zcM.pids(data.unterrichte[ui])))]);
      const tab = M.zeitTab[ev.zg], spanne = ev.aufgabe && data.unterrichte[grp[0]].pausenZaehlen !== false;
      ev.pauseRand = spanne && dur > 1; // ein Block darf in einer Pausenzeile beginnen oder enden, aber nicht nur aus einer Pause bestehen
      ev.minAt = new Float64Array(H); ev.minMax = 0; ev.minMin = 0;
      for (let h = 0; h + dur <= H; h++) {
        let m = 0;
        if (spanne && tab.s[h] >= 0 && tab.e[h + dur - 1] > tab.s[h]) m = tab.e[h + dur - 1] - tab.s[h];
        else for (let k = 0; k < dur; k++) if (!M.pause[h + k]) m += tab.s[h + k] >= 0 ? tab.e[h + k] - tab.s[h + k] : rowMin[h + k];
        ev.minAt[h] = m; if (m > ev.minMax) ev.minMax = m;
      }
      // Arbeitszeit je Person und Woche: Unterrichtsminuten × Wochenanteil (azF) + Vorbereitung (azV) = feste Minuten je gehaltener
      // Unterrichtsstunde nach Rolle × Stunden des Blocks × Wochenanteil; Aufgaben ohne Vorbereitung
      ev.wf = ev.wochen.length === 2 ? 1 : 0.5;
      ev.azF = new Map(); ev.azV = new Map();
      const vorbWoche = co => ev.wf * ev.dur * (co ? azm.vorbCo : azm.vorbLehrkraft);
      grp.forEach(ui => { const U = M.U[ui], x = data.unterrichte[ui]; U.lehrer.forEach(t => { if (ev.azF.has(t)) return; ev.azF.set(t, ev.wf); ev.azV.set(t, x.aufgabe || x.vorbereitung === false || ohneVM.has(x.id + '|' + data.lehrer[t].id) ? 0 : vorbWoche(U.rolle.get(t) === 'co')); }); });
      if (ev.hand) ev.hand.forEach(x => { const xu = data.unterrichte[ev.parts[x.p].u]; ev.azF.set(x.t, ev.wf); ev.azV.set(x.t, xu.aufgabe || xu.vorbereitung === false ? 0 : vorbWoche(x.co)); });
      if (ev.konflikt) fehler(ev.konflikt, { seite: 'unterricht', id: M.U[grp[0]].id });
      M.E.push(ev);
    });
  });
  const E = M.E.length;
  // Unterricht ohne Fachlehrkraft, dessen Blöcke alle von Hand besetzt sind, braucht keine Warnung
  M.warnungen = M.warnungen.filter(w => w.ohneLk === undefined || !(M.uEv[w.ohneLk].length && M.uEv[w.ohneLk].every(e => (M.E[e].hand || []).some(x => M.E[e].parts[x.p].u === w.ohneLk))));
  // --- zulässige Startslots je Ereignis (Schnitt aller statischen Bedingungen) ---
  const korridor = M.hart[RI.H11] === 1;
  M.erlaubt = new Uint8Array(Math.max(1, E) * S);
  M.E.forEach((ev, e) => {
    const liste = [];
    for (let s0 = 0; s0 < S; s0++) {
      if (ev.fixStart >= 0) { if (s0 === ev.fixStart) liste.push(s0); continue; }
      if (statischerGrund(M, ev, s0, korridor)) continue;
      liste.push(s0);
    }
    ev.erlaubt = Int32Array.from(liste);
    for (const s0 of liste) M.erlaubt[e * S + s0] = 1;
  });
  // --- Ressourcen → Ereignisse ---
  M.kEv = Array.from({ length: C }, () => []); M.lEv = Array.from({ length: T }, () => []); M.rNutzer = Array.from({ length: R }, () => []);
  M.E.forEach((ev, e) => {
    ev.klassen.forEach(c => M.kEv[c].push(e));
    ev.lehrer.forEach(t => M.lEv[t].push(e));
    // mögliche Nutzer eines Raums: die Kandidaten der Automatik und – für die Zuweisung von Hand – alle Räume mit passendem Typ und genug Plätzen
    const rs = new Set(); ev.parts.forEach(p => { if (!p.cands) return; p.cands.forEach(r => rs.add(r)); if (p.raumFix < 0) for (let r = 0; r < R; r++) if (M.rTyp[r] === p.typ && M.rKap[r] >= p.schueler) rs.add(r); });
    rs.forEach(r => M.rNutzer[r].push(e));
    // Einheiten je Klasse als Bitmaske (für Überschneidungen in echter Zeit)
    ev.kMaske = new Map();
    ev.units.forEach(u => { const c = M.unitK[u]; if (c >= 0) ev.kMaske.set(c, (ev.kMaske.get(c) || 0) | (1 << Math.min(30, M.unitLokal[u]))); });
  });
  // Personen und Klassen, deren Ereignisse nach verschiedenen Zeit-Tabellen laufen: dort können sich zwei verschiedene Rasterstunden real überschneiden
  M.lMix = new Uint8Array(Math.max(1, T)); M.kMix = new Uint8Array(Math.max(1, C)); M.rMix = new Uint8Array(Math.max(1, R));
  if (M.zeitTab.length > 1) {
    for (let t = 0; t < T; t++) if (new Set(M.lEv[t].map(e => M.E[e].zg)).size > 1) M.lMix[t] = 1;
    for (let c = 0; c < C; c++) if (new Set(M.kEv[c].map(e => M.E[e].zg)).size > 1) M.kMix[c] = 1;
    for (let r = 0; r < R; r++) if (M.rTeil[r] === 1 && new Set(M.rNutzer[r].map(e => M.E[e].zg)).size > 1) M.rMix[r] = 1;
  }
  // Rang einer Person in einem Unterrichtsblock (wie bei der automatischen Verteilung): 1 Klassenleitung, 2 Klassenteam, 3 übrige
  M.stufeVon = (t, e) => {
    const ev = M.E[e], l = data.lehrer[t];
    if (l.klassenleitung && ev.klassen.some(c => data.klassen[c].id === l.klassenleitung)) return 1;
    return ev.klassen.some(c => (data.klassen[c].team || []).includes(l.id)) ? 2 : 3;
  };
  M.korridor = korridor; M.azm = azm;
  // --- variable Blockaufteilung: Startmuster aktiv, die übrigen Pool-Ereignisse inaktiv (ohne zulässigen Slot, zählen nirgends) ---
  M.aktiv = new Uint8Array(Math.max(1, E)).fill(1); M.musterEv = null;
  M.E.forEach(ev => { ev.erlaubtVoll = ev.erlaubt; });
  if (M.U.some(U => U.muster)) {
    M.musterEv = M.U.map(() => null);
    const poolEv = new Set();
    M.U.forEach(U => {
      if (!U.muster) return;
      const evs = M.uEv[U.i], K2 = U.muster.K2, K1 = U.muster.K1;
      M.musterEv[U.i] = { d2: evs.slice(0, K2), d1: evs.slice(K2, K2 + K1), bi: U.muster.hatBi ? evs.slice(K2 + K1, K2 + K1 + 2) : [] };
      evs.forEach(e => poolEv.add(e));
    });
    const startAn = U => { const g = M.musterEv[U.i], st = U.muster.liste[U.muster.start]; return g.d2.slice(0, st.n2).concat(g.d1.slice(0, st.n1), st.nb ? [g.bi[U.muster.w]] : []); };
    const an = new Set();
    const anBauen = () => { an.clear(); M.U.forEach(U => { if (U.muster) startAn(U).forEach(e => an.add(e)); }); };
    anBauen();
    // Ausgleich Woche A/B: Liegt die vollere Woche einer Klasse über ihren freien Rasterstunden, wandert bei einem Unterricht der ganzen Klasse eine
    // Einzelstunde als 14-tägige Doppelstunde in die leichtere Woche (bzw. eine 14-tägige Doppelstunde wechselt die Woche) – der Schnitt bleibt gleich.
    for (let c = 0; c < C; c++) {
      const cap = klassenSlots(M, c).slots, aktiv = e => !poolEv.has(e) || an.has(e);
      for (let runde = 0; runde < 12; runde++) {
        const L = klassenLastJeWoche(M, c, aktiv), schwer = L[0] >= L[1] ? 0 : 1, diff = L[schwer] - L[1 - schwer];
        if (L[schwer] <= cap || diff < 2) break;
        let best = null;
        M.U.forEach(U => {
          if (!U.muster || !U.klassen.includes(c) || !M.uEv[U.i].some(e => M.E[e].units.includes(M.kGanz[c]))) return;
          const m = U.muster, st = m.liste[m.start];
          if (st.nb && m.w === schwer && diff >= 4) { const k = { U, start: m.start, w: 1 - schwer, kosten: 0 }; if (!best || k.kosten < best.kosten) best = k; return; }
          if (st.nb) return;
          m.liste.forEach((p, i) => { if (!p.nb) return; const k = { U, start: i, w: 1 - schwer, kosten: musterStrafe(m.regel, m.ws, p.n2, p.n1, p.nb) - musterStrafe(m.regel, m.ws, st.n2, st.n1, st.nb) + (p.n2 + p.n1 + p.nb) * 0.01 }; if (!best || k.kosten < best.kosten) best = k; });
        });
        if (!best) break;
        best.U.muster.start = best.start; best.U.muster.w = best.w; anBauen();
      }
    }
    // Maßstab der Suche ist die Standardaufteilung NACH diesem Ausgleich: Der Ausgleich ist nötig, damit die Klasse in beide Wochen passt –
    // die Suche soll ihn nicht wieder zurücknehmen. Jede weitere Abweichung ist das letzte Mittel.
    M.U.forEach(U => { if (U.muster) { const p = U.muster.liste[U.muster.start]; U.muster.std = { n2: p.n2, n1: p.n1, nb: p.nb }; } });
    M.U.forEach(U => { if (!U.muster) return; const ein = new Set(startAn(U)); M.uEv[U.i].forEach(e => { if (!ein.has(e)) musterAktivSetzen(M, e, 0); }); });
  }
  // W18: Kernfächer je Klasse mit automatischer Fachlehrkraft, die die Klassenleitung unterrichten kann (eine feste Vorgabe geht vor)
  M.klKern = Array.from({ length: Math.max(1, C) }, () => []);
  for (let c = 0; c < C; c++) {
    const t = M.kKL[c]; if (t < 0) continue;
    const kl = data.lehrer[t]; if (kl.ausgebildet === false || (azm.stundenSoll && kl.deputat === 0)) continue;
    const jeFach = new Map(), fest = new Set();
    data.unterrichte.forEach((x, ui) => {
      const U = M.U[ui]; if (!U || x.aufgabe || U.f < 0 || !M.fSchwer[U.f] || U.klassen.length !== 1 || U.klassen[0] !== c || !(x.wochenstunden > 0)) return;
      if (!x.fachAuto) { fest.add(U.f); return; }
      if (!jeFach.has(U.f)) jeFach.set(U.f, []); jeFach.get(U.f).push(ui);
    });
    jeFach.forEach((us, f) => { if (!fest.has(f) && fachBefaehigt(kl, data.faecher[f].id)) M.klKern[c].push({ f, us, std: Math.max(...us.map(ui => data.unterrichte[ui].wochenstunden * wochenAnteil(data.unterrichte[ui].rhythmus))) }); });
  }
  personalEinheitenBauen(M, data, opt);
  return M;
}
const LEER_SLOTS = new Int32Array(0);
// zulässige Startslots eines Ereignisses für die aktuelle Besetzung (gemerkt je Kombination der Lehrkräfte)
function erlaubtListe(M, e) {
  const ev = M.E[e], S = M.S;
  const key = ev.immer.length > 1 ? ev.immer.slice().sort((a, b) => a - b).join(',') : String(ev.immer[0] === undefined ? '' : ev.immer[0]);
  const cache = ev.erlCache || (ev.erlCache = new Map());
  let liste = cache.get(key);
  if (!liste) { const l = []; for (let s0 = 0; s0 < S; s0++) if (!statischerGrund(M, ev, s0, M.korridor)) l.push(s0); liste = Int32Array.from(l); cache.set(key, liste); }
  return liste;
}
// Ereignis e aktivieren (zulässige Slots wie berechnet) oder deaktivieren (keine zulässigen Slots – es kann nicht platziert werden).
// Invariante: Die Listen je Klasse (kEv) und je Lehrkraft (lEv) enthalten nur aktive Ereignisse – so kostet der Pool in der Bewertung nichts.
function musterAktivSetzen(M, e, v) {
  const ev = M.E[e], S = M.S;
  v = v ? 1 : 0;
  if (M.aktiv[e] !== v) {
    for (const c of ev.klassen) { if (v) M.kEv[c].push(e); else _raus1(M.kEv[c], e); }
    for (const t of ev.lehrer) { if (v) M.lEv[t].push(e); else _raus1(M.lEv[t], e); }
  }
  if (M.aktiv[e] !== v) M.musterVer = (M.musterVer | 0) + 1;
  M.aktiv[e] = v;
  M.erlaubt.fill(0, e * S, (e + 1) * S);
  if (v && ev.erlaubtAlt) { ev.erlaubtVoll = erlaubtListe(M, e); ev.erlaubtAlt = false; }
  if (v) { ev.erlaubt = ev.erlaubtVoll; for (const s0 of ev.erlaubt) M.erlaubt[e * S + s0] = 1; } else ev.erlaubt = LEER_SLOTS;
}

/* ---------- Personal als Entscheidungsvariable ----------
   Für die Berechnung (opt.personal) bekommt jeder Unterricht mit „Fachlehrkraft automatisch“ eine Personal-Einheit (PE): Die Fachlehrkraft ist
   dann keine Vorbedingung, sondern eine Variable der Suche – genau wie Zeit und Raum. Geteilte Gruppen eines Fachs in einer Klasse (ohne
   Kopplung) teilen sich eine Einheit (dieselbe Person unterrichtet beide Gruppen). Kandidaten sind alle ausgebildeten Lehrkräfte mit dem Fach.
   lkModellSetzen() schreibt eine Zuordnung in das kompilierte Modell (Unterricht, Ereignisse, Ressourcenlisten, zulässige Slots); die
   Belegungszähler und Kosten pflegt Plan.setzeLehrer() in derselben Transaktion. -1 = noch niemand (N. N.). */
function personalEinheitenBauen(M, data, opt) {
  const T = M.T, nU = M.U.length;
  M.PE = []; M.uPE = new Int32Array(Math.max(1, nU)).fill(-1); M.uLk = new Int32Array(Math.max(1, nU)).fill(-1);
  M.peFach = new Map();
  if (!opt.personal) return;
  const am = M.azm, kM = new Map(data.klassen.map(k => [k.id, k]));
  const ohneStunden = t => am.stundenSoll && data.lehrer[t].deputat === 0; // Deputat 0 = wirklich keine Unterrichtsstunde
  const schl = x => x.gruppen.length && x.klassen.length === 1 && !x.kopplung ? 'g|' + x.klassen[0] + '|' + x.fach : 'u|' + x.id;
  const grp = new Map();
  data.unterrichte.forEach((x, ui) => {
    if (x.aufgabe || !x.fachAuto || !(x.wochenstunden > 0) || M.U[ui].f < 0 || !M.uEv[ui].length) return;
    if (M.uEv[ui].some(e => M.E[e].hand || M.E[e].ohne)) return; // einzelne Termine von Hand besetzt: die Person bleibt
    const k = schl(x); if (!grp.has(k)) grp.set(k, []); grp.get(k).push(ui);
  });
  const autoVon = ui => { const z = data.unterrichte[ui].lehrkraefte.find(z => z.rolle === 'fach' && z.auto && M.lI.has(z.lehrer)); return z ? M.lI.get(z.lehrer) : -1; };
  grp.forEach(us => {
    const p = M.PE.length, x0 = data.unterrichte[us[0]], fach = x0.fach;
    // Vorbereitung: Unterrichtet dieselbe Person mehrere Gruppen eines geteilten Fachs, zählt sie nur in der Gruppe mit den meisten Stunden (wie ohneVorbSet)
    const geteilt = us.length > 1 && !!((kM.get(x0.klassen[0]) || {}).teilung || {})[fach];
    const erste = us.slice().sort((a, b) => data.unterrichte[b].wochenstunden - data.unterrichte[a].wochenstunden || String(data.unterrichte[a].gruppen.slice().sort().join(',')).localeCompare(String(data.unterrichte[b].gruppen.slice().sort().join(','))) || String(data.unterrichte[a].id).localeCompare(String(data.unterrichte[b].id)))[0];
    us.forEach(ui => { const x = data.unterrichte[ui]; M.U[ui].pVorb = x.vorbereitung === false || (geteilt && ui !== erste) ? 0 : am.vorbLehrkraft; M.uPE[ui] = p; M.uLk[ui] = autoVon(ui); });
    const evs = [...new Set(us.flatMap(ui => M.uEv[ui]))];
    const klassen = [...new Set(us.flatMap(ui => M.U[ui].klassen))];
    let std = 0; us.forEach(ui => M.uEv[ui].forEach(e => { if (M.aktiv[e]) std += M.E[e].dur * M.E[e].wf; }));
    const nBl = Math.max(...us.map(ui => M.uEv[ui].filter(e => M.aktiv[e]).length));
    const drin = new Set(); us.forEach(ui => M.U[ui].lehrer.forEach(t => { if (t !== M.uLk[ui]) drin.add(t); }));
    const cands = [];
    const stufe = new Int8Array(Math.max(1, T)).fill(3);
    for (let t = 0; t < T; t++) {
      const l = data.lehrer[t];
      if (l.ausgebildet === false || !fachBefaehigt(l, fach) || drin.has(t) || ohneStunden(t) || us.some(ui => (data.unterrichte[ui].ohneAuto || []).includes(l.id))) continue;
      cands.push(t);
      if (l.klassenleitung && klassen.some(c => data.klassen[c].id === l.klassenleitung)) stufe[t] = 1;
      else if (klassen.some(c => (data.klassen[c].team || []).includes(l.id))) stufe[t] = 2;
    }
    const kann = new Uint8Array(Math.max(1, T)); cands.forEach(t => { kann[t] = 1; });
    const pe = { i: p, us, evs, f: M.U[us[0]].f, fach, klassen, std, nn: Math.max(1, Math.round(std)), nBl, cands, kann, stufe, t: -1, name: M.U[us[0]].name + (us.length > 1 ? ' (' + us.length + ' Gruppen)' : '') };
    M.PE.push(pe);
    if (!M.peFach.has(pe.f)) M.peFach.set(pe.f, []); M.peFach.get(pe.f).push(p);
    // Startwert: die zuletzt automatisch zugeteilte Person, sofern sie noch in Frage kommt – für alle Gruppen dieselbe
    let t0 = M.uLk[us[0]]; if (t0 >= 0 && !cands.includes(t0)) t0 = -1;
    us.forEach(ui => lkModellSetzen(M, ui, t0));
    pe.t = t0;
  });
}
// Entfernt das erste Vorkommen von x aus der Liste
function _raus1(liste, x) { const i = liste.indexOf(x); if (i >= 0) liste.splice(i, 1); }
// Zuordnung der Fachlehrkraft t (-1 = niemand) für den Unterricht ui in das Modell schreiben
function lkModellSetzen(M, ui, t) {
  const U = M.U[ui], alt = M.uLk[ui]; if (alt === t) return;
  if (alt >= 0) { _raus1(U.lehrer, alt); _raus1(U.fachL, alt); _raus1(U.immer, alt); if (!U.lehrer.includes(alt)) U.rolle.delete(alt); }
  if (t >= 0) { U.lehrer.push(t); U.fachL.push(t); U.immer.push(t); U.rolle.set(t, 'fach'); }
  M.uLk[ui] = t;
  const S = M.S;
  for (const e of M.uEv[ui]) {
    const ev = M.E[e], vorher = ev.lehrer;
    if (alt >= 0) { _raus1(ev.immer, alt); _raus1(ev.units, alt); }
    if (t >= 0) { ev.immer.push(t); ev.units.push(t); }
    { const l = ev.immer.slice(); for (const z of ev.co) if (!l.includes(z.t)) l.push(z.t); ev.lehrer = l; }
    const an = !M.aktiv || M.aktiv[e];
    if (alt >= 0 && !ev.lehrer.includes(alt)) { if (an) _raus1(M.lEv[alt], e); ev.azF.delete(alt); ev.azV.delete(alt); }
    if (t >= 0) { if (!vorher.includes(t) && an) M.lEv[t].push(e); ev.azF.set(t, ev.wf); ev.azV.set(t, ev.wf * ev.dur * (U.pVorb || 0)); }
    // zulässige Startslots hängen von den Sperrzeiten der Lehrkräfte ab (je Besetzung einmal berechnet und gemerkt);
    // inaktive Pool-Blöcke der variablen Blockaufteilung bekommen ihre Liste erst beim Aktivieren
    if (ev.fixStart < 0) {
      if (M.aktiv && !M.aktiv[e]) { ev.erlaubtAlt = true; continue; }
      const liste = erlaubtListe(M, e);
      ev.erlaubtVoll = liste;
      M.erlaubt.fill(0, e * S, (e + 1) * S);
      for (const s0 of liste) M.erlaubt[e * S + s0] = 1;
      ev.erlaubt = liste;
    }
  }
  if (M.zeitTab.length > 1) for (const x of [alt, t]) if (x >= 0) M.lMix[x] = new Set(M.lEv[x].map(e => M.E[e].zg)).size > 1 ? 1 : 0;
}

// Liefert den Grund (Regel-ID), warum ein Ereignis statisch nicht bei s0 beginnen kann, sonst ''
function statischerGrund(M, ev, s0, korridor) {
  const H = M.H, S = M.S;
  const d = Math.floor(s0 / H), h = s0 % H;
  if (h + ev.dur > H) return 'H07';
  // Aufgaben dürfen Pausenzeilen überdecken (nicht darin beginnen oder enden) und über Pausen zwischen zwei Stunden hinweg liegen
  // Unterricht nur in Unterrichtsstunden (nicht in Pausen, nicht nach Unterrichtsschluss). Aufgaben sind daran nicht gebunden: Sie dürfen nach
  // Unterrichtsschluss liegen und Pausenzeilen überdecken; in einer Pausenzeile beginnen oder enden dürfen sie mit „Pausen zählen als Arbeitszeit“.
  for (let k = 0; k < ev.dur; k++) if (!M.slotOk[s0 + k]) { if (!ev.aufgabe) return 'H10'; if (M.pause[h + k] && (k === 0 || k === ev.dur - 1) && !ev.pauseRand) return 'H10'; }
  if (ev.dur === 2 && !M.dbl[h] && !ev.aufgabe && !M.lock.has('H07')) return 'H07';
  if (ev.aufgabe && ev.dur > 1) for (const t of ev.immer) for (let k = 0; k < ev.dur - 1; k++) if (M.lGap[t * S + s0 + k]) return 'H05'; // gesperrte Pause im Block
  if (korridor) for (const c of ev.klassen) { if (M.lnr[h] < M.kFrueh[c] || M.lnr[h + ev.dur - 1] > M.kSpaet[c]) return 'H11'; }
  for (const t of ev.immer) for (let k = 0; k < ev.dur; k++) if (M.lVerf[t * S + s0 + k] === 0) return 'H05';
  for (const p of ev.parts) {
    if (!p.cands) continue;
    let ok = false;
    for (const r of p.cands) { let f = true; for (let k = 0; k < ev.dur; k++) if (M.rVerf[r * S + s0 + k] === 0) { f = false; break; } if (f) { ok = true; break; } }
    if (!ok) return p.cands.length ? 'H05' : 'H06';
  }
  return (d >= 0) ? '' : 'H07';
}

