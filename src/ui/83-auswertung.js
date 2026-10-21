/* ---------------- Offene Punkte nach der Berechnung ---------------- */
// Harte Verstöße des Plans außer H04 (nicht platziert) und H16 (Arbeitszeitgrenzen) – die stehen in eigenen Gruppen
function offenHart() { if (!APP.daten.plan.platzierungen.length) return []; const c = modell(); return c.bewertung.det.filter(x => c.M.hart[RI[x.r]] && x.r !== 'H04' && x.r !== 'H16'); }
function offenePunkteZahl() { return offenGruppen().reduce((n, g) => n + g.eintraege.length, 0) + offenHart().length; }
// Zeigt, was im Plan noch fehlt (nicht platziert, ohne Raum, ohne Lehrkraft, ohne Co-Lehrkraft, harte Verstöße). Ein Klick springt zur Stelle.
// Inhalt „Offene Punkte“. zu(fn): schließt das Fenster (falls eines offen ist) und führt den Sprung aus.
/* ---------------- Ampel: Prüfung des fertigen Plans ---------------- */
// einmal je Datenstand berechnet (liegt am Bewertungs-Cache und verfällt mit jeder Änderung)
function planAmpel() {
  if (!APP.daten.plan.platzierungen.length) return { ampel: 'leer', pflicht: [], hinweise: [], weich: 0, hart: 0 };
  const c = modell();
  if (!c.bewertung.status) { try { c.bewertung.status = planStatus(APP.daten, { M: c.M, P: c.P, offen: offenGruppen() }); } catch (err) { console.error(err); c.bewertung.status = { ampel: 'leer', pflicht: [], hinweise: [], weich: 0 }; } }
  return c.bewertung.status;
}
const AMPEL_TEXT = {
  gruen: ['Grün', 'Alle Pflichtbedingungen sind erfüllt.'],
  gelb: ['Gelb', 'Der Plan ist vollständig – weiche Qualitätskriterien lassen sich noch verbessern.'],
  rot: ['Rot', 'Mindestens eine Pflichtbedingung ist verletzt.'],
  leer: ['–', 'Noch kein Plan berechnet.']
};
/* ---------------- Harte Fehler akzeptieren ----------------
   Ein harter Fehler lässt sich bewusst in Kauf nehmen: Er zählt danach nicht mehr als harter Fehler (Ampel höchstens gelb), bleibt aber
   sichtbar. Die betroffenen Stunden und Aufsichten tragen im Editor ein rotes Ausrufezeichen. Vor jedem Akzeptieren erscheint eine Warnung.
   Gespeichert wird der Fehler mit seinem Schlüssel (Art + Inhalt): Tritt nach einer Änderung ein anderer Fehler auf, gilt er wieder als hart. */
function akzeptiertAktuell() { try { return planAmpel().akzeptiert || []; } catch (err) { return []; } }
// Bezüge der aktuell akzeptierten Fehler: Blöcke („Unterricht|Block“), Aufsichten (Einsatz-IDs) und unbesetzte Aufsichtszeiten
function akzeptiertBezug() {
  const bl = new Map(), di = new Map(), auf = [], texte = new Set();
  akzeptiertAktuell().forEach(x => {
    texte.add(x.text);
    (x.bloecke || []).forEach(k => { if (!bl.has(k)) bl.set(k, []); bl.get(k).push(x.text); });
    (x.dienste || []).forEach(k => { if (!di.has(k)) di.set(k, []); di.get(k).push(x.text); });
    if (x.aufsicht) auf.push(x);
  });
  return { bl, di, auf, texte };
}
// unbesetzte Aufsicht o (offene Schicht) – als harter Fehler akzeptiert?
function aufsichtAkzeptiert(bez, o) {
  const iv = intervall(o.beginn, o.ende);
  return bez.auf.some(x => { const a = x.aufsicht, av = intervall(a.beginn, a.ende); return a.bedarf === o.bedarf && a.tag === o.tag && iv && av && av.start < iv.end && iv.start < av.end; });
}
const AKZ_WARNUNG = 'Ein harter Fehler verletzt eine Pflichtbedingung des Plans (z. B. Doppelbelegung, fehlende Aufsicht, fehlende Co-Lehrkraft). Wird er akzeptiert, zählt er nicht mehr als harter Fehler – die Ampel kann gelb werden, obwohl der Plan so in der Praxis nicht funktioniert. Akzeptieren Sie den Fehler nur, wenn er bewusst anders gelöst wird (z. B. durch eine Absprache vor Ort). Die betroffenen Stunden und Aufsichten erhalten im Editor ein rotes Ausrufezeichen; „Zurücknehmen“ macht ihn wieder zum harten Fehler.';
async function akzeptierenDialog(eintraege, kat) {
  eintraege = (Array.isArray(eintraege) ? eintraege : [eintraege]).filter(Boolean);
  if (!eintraege.length) return false;
  const ok = await dialog({ titel: '⚠ Harten Fehler akzeptieren?', breite: '560px',
    inhalt: h('div', {}, h('div', { class: 'hinweis err', style: { marginTop: 0 } }, h('b', {}, 'Warnung: '), AKZ_WARNUNG),
      h('p', { style: { marginBottom: '4px' } }, h('b', {}, eintraege.length === 1 ? 'Dieser Fehler wird akzeptiert:' : 'Diese ' + eintraege.length + ' Fehler werden akzeptiert:')),
      h('ul', { class: 'klein', style: { margin: 0, maxHeight: '40vh', overflow: 'auto' } }, eintraege.map(x => h('li', {}, x.text)))),
    knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'Trotzdem akzeptieren', wert: true, art: 'gefahr' }] });
  if (!ok) return false;
  aendern(eintraege.length === 1 ? 'Harten Fehler akzeptiert' : eintraege.length + ' harte Fehler akzeptiert', d => {
    d.akzeptiert = (d.akzeptiert || []).filter(a => !eintraege.some(x => x.key === a.schluessel));
    eintraege.forEach(x => d.akzeptiert.push(nAkzeptiert({ schluessel: x.key, kat: x.kat || kat || '', text: x.text, datum: new Date().toISOString(), bloecke: x.bloecke || [], dienste: x.dienste || [], aufsicht: x.aufsicht || null })));
  }, { ohneDienste: true });
  toast(eintraege.length === 1 ? 'Harter Fehler akzeptiert – im Editor rot markiert.' : eintraege.length + ' harte Fehler akzeptiert – im Editor rot markiert.', 'warn', 5000);
  return true;
}
function akzeptanzZuruecknehmen(schluessel) {
  aendern('Akzeptierten Fehler zurückgenommen', d => { d.akzeptiert = (d.akzeptiert || []).filter(a => a.schluessel !== schluessel); }, { ohneDienste: true });
}
// Alle aktuell offenen harten Fehler, die einen Block betreffen (für das Menü der Kachel)
function harteFehlerZuBlock(M, P, e) {
  const keys = M.E[e].parts.map((p, pi) => M.U[p.u].id + '|' + P._blockNr(e, pi));
  const out = [];
  try { planAmpel().pflicht.forEach(x => (x.eintraege || []).forEach(it => { if ((it.bloecke || []).some(k => keys.includes(k))) out.push(Object.assign({ kat: x.id }, it)); })); } catch (err) { console.error(err); }
  return out;
}
function ampelPunkt(st) { return h('span', { class: 'ampel ' + st.ampel, role: 'img', 'aria-label': 'Ampel ' + AMPEL_TEXT[st.ampel][0], title: 'Plan-Ampel ' + AMPEL_TEXT[st.ampel][0] + ': ' + AMPEL_TEXT[st.ampel][1] }); }
// Karte mit Ampel und Prüfliste der Pflichtbedingungen
function ampelKarte() {
  const st = planAmpel();
  if (st.ampel === 'leer') return h('div', { class: 'karte ampelkarte', id: 'ampelkarte' }, h('div', { class: 'zeile' }, ampelPunkt(st), h('b', {}, 'Noch kein Plan berechnet.')));
  const zeile = x => { const ok = x.ok, liste = x.eintraege || x.liste.map(t => ({ text: t })), anzahl = x.anzahl, akz = x.akzeptiert || [];
    return h('details', { class: 'ampelzeile' + (ok ? ' ok' : ''), open: !ok && liste.length <= 4 ? true : null },
    h('summary', {}, h('span', { class: 'sym ' + (ok ? 'o' : 'h') }, ok ? '✓' : '✕'), h('span', {}, x.titel), !ok ? h('span', { class: 'badge err' }, String(anzahl)) : null, akz.length ? h('span', { class: 'badge warn', title: akz.length + ' akzeptiert' }, '! ' + akz.length) : null),
    liste.length ? h('ul', { class: 'klein akzliste' }, liste.map(it => h('li', {}, h('span', {}, it.text), it.key ? h('button', { class: 'btn klein akzknopf', type: 'button', title: 'Diesen harten Fehler bewusst in Kauf nehmen (mit Warnung)', onclick: ev => { ev.preventDefault(); akzeptierenDialog(Object.assign({ kat: x.id }, it)); } }, 'Akzeptieren …') : null)),
      anzahl > liste.length ? h('li', { class: 'muted' }, '… und ' + (anzahl - liste.length) + ' weitere (siehe „Offene Punkte“)') : null,
      liste.length > 1 && liste.every(it => it.key) && anzahl === liste.length ? h('li', { class: 'akzalle' }, h('button', { class: 'btn klein akzknopf', type: 'button', onclick: ev => { ev.preventDefault(); akzeptierenDialog(liste.map(it => Object.assign({ kat: x.id }, it))); } }, 'Alle ' + liste.length + ' akzeptieren …')) : null) : null);
  };
  const akzAlle = st.akzeptiert || [], gespeichert = APP.daten.akzeptiert || [], aktivK = new Set(akzAlle.map(x => x.key)), alt = gespeichert.filter(a => !aktivK.has(a.schluessel));
  return h('div', { class: 'karte ampelkarte ' + st.ampel, id: 'ampelkarte' },
    h('div', { class: 'zeile', style: { marginBottom: '6px' } }, ampelPunkt(st), h('h2', { style: { margin: 0 } }, 'Prüfung des fertigen Plans: ' + AMPEL_TEXT[st.ampel][0]), h('span', { class: 'muted' }, AMPEL_TEXT[st.ampel][1])),
    h('div', { class: 'ampelliste' }, st.pflicht.map(zeile)),
    akzAlle.length || alt.length ? h('details', { class: 'ampelzeile akzeptiert', open: akzAlle.length <= 3 ? true : null },
      h('summary', {}, h('span', { class: 'sym akz' }, '!'), h('span', {}, 'Akzeptierte harte Fehler'), h('span', { class: 'badge warn' }, String(akzAlle.length))),
      h('ul', { class: 'klein akzliste' }, akzAlle.map(x => h('li', {}, h('span', { class: 'akzmarke', 'aria-hidden': 'true' }, '!'), h('span', {}, x.text), h('button', { class: 'btn klein', type: 'button', title: 'Wieder als harten Fehler zählen', onclick: ev => { ev.preventDefault(); akzeptanzZuruecknehmen(x.key); } }, 'Zurücknehmen'))),
        alt.length ? h('li', { class: 'muted' }, alt.length + (alt.length === 1 ? ' früher akzeptierter Fehler tritt' : ' früher akzeptierte Fehler treten') + ' im aktuellen Plan nicht mehr auf. ', h('button', { class: 'btn klein', type: 'button', onclick: ev => { ev.preventDefault(); aendern('Erledigte Akzeptanzen entfernt', d => { const k = new Set(alt.map(a => a.schluessel)); d.akzeptiert = (d.akzeptiert || []).filter(a => !k.has(a.schluessel)); }, { ohneDienste: true }); } }, 'Entfernen')) : null)) : null,
    st.hinweise.length ? h('div', { style: { marginTop: '8px' } }, h('b', { class: 'klein' }, 'Hinweise zur Qualität'), st.hinweise.map(x => h('details', { class: 'ampelzeile' }, h('summary', {}, h('span', { class: 'sym w' }, '!'), h('span', {}, x.titel), h('span', { class: 'badge warn' }, String(x.anzahl))), h('ul', { class: 'klein' }, x.liste.map(t => h('li', {}, t)))))) : null,
    h('p', { class: 'muted klein', style: { margin: '8px 0 0' } }, 'Grün: alle Pflichtbedingungen erfüllt. Gelb: vollständig, aber wichtige weiche Regeln (Gewicht 8–10) sind verletzt, harte Fehler wurden akzeptiert oder es gibt Hinweise (auch unbesetzte Springer). Rot: mindestens eine Pflichtbedingung ist verletzt. Springer zählen bei der Arbeitszeit nicht mit.'));
}
function offenePunkteInhalt(nachRechnung, zu) {
  const d = APP.daten, gruppen = offenGruppen();
  const hatPlan = d.plan.platzierungen.length > 0;
  const c = hatPlan ? modell() : null;
  const hart = offenHart();
  const n = gruppen.reduce((s, g) => s + g.eintraege.length, 0) + hart.length;
  const zumEintrag = (g, x) => () => {
    if (x.ziel) { springeZu(x.ziel); return; }
    const u = findeId(d.unterrichte, x.unterricht);
    if (g.art === 'lehrkraft' || g.art === 'co' || !hatPlan) { springeZu({ seite: u && u.aufgabe ? 'aufgaben' : 'unterricht', id: x.unterricht }); return; }
    const art = x.klasse ? 'klasse' : 'lehrer', id = x.klasse || x.lehrer;
    if (!id) { gehe('editor'); return; }
    let ee;
    if (x.tag !== null && x.stunde !== null) { const { M, P } = modell(); const ui = d.unterrichte.findIndex(y => y.id === x.unterricht); const s = x.tag * M.H + x.stunde - 1; ee = (M.uEv[ui] || []).find(q => P.start[q] === s); }
    editorZeigen(art, id, ee);
  };
  const SCHWER = new Set(['ablage', 'lehrkraft', 'aufgaben', 'aufsicht']);
  const istSchwer = (g, x) => (SCHWER.has(g.art) && !x.weich) || ((g.art === 'dienste' || g.art === 'ohne') && x.hart) || g.art === 'arbeitszeit';
  const liste = (eintraege, zeile, hoch) => h('ul', { class: 'vliste', style: hoch ? null : { maxHeight: '190px' } }, eintraege.slice(0, 300).map(zeile), eintraege.length > 300 ? h('li', { class: 'muted' }, '… und ' + (eintraege.length - 300) + ' weitere') : null);
  const seite = !nachRechnung && !zu;
  const los = fn => { if (zu) zu(fn); else fn(); };
  const el = h('div', { class: 'offenepunkte' },
    !n ? h('div', { class: 'hinweis ok' }, '✓ Keine offenen Punkte: Alle Stunden sind platziert und haben Lehrkraft, Raum und – wo verlangt – eine Co-Lehrkraft; Aufsichten sind besetzt, die Arbeitszeitgrenzen eingehalten.')
      : h('p', { style: { marginTop: 0 } }, nachRechnung ? 'Der Plan wurde übernommen. ' : '', 'Diese Punkte sind noch offen – ein Klick springt zur betroffenen Stelle:'),
    hart.length ? h('div', { 'data-art': 'hart' }, h('h3', {}, h('span', { class: 'badge err' }, String(hart.length)), ' Harte Verstöße, Konflikte und Überschneidungen'),
      h('p', { class: 'muted klein', style: { margin: '0 0 4px' } }, 'Regeln, die der Plan verletzt – z. B. doppelt belegte Lehrkräfte, Klassen oder Räume, Überschneidungen durch Zeitprofile, Sperrzeiten oder Tagesgrenzen.'),
      liste(hart, x => h('li', { tabindex: 0, title: REGELN[RI[x.r]].text, onclick: () => los(() => detZumEditor(c.M, x)), onkeydown: ev => { if (ev.key === 'Enter') los(() => detZumEditor(c.M, x)); } }, h('span', { class: 'sym h' }, '✕'), h('span', {}, x.text, ' ', regelMarke(x.r)), h('span', { class: 'rechts muted' }, icon('pfeil-rechts'))), seite)) : null,
    gruppen.map(g => h('div', { 'data-art': g.art }, h('h3', {}, h('span', { class: 'badge ' + (g.eintraege.some(x => istSchwer(g, x)) ? 'err' : 'warn') }, String(g.eintraege.length)), ' ' + g.titel),
      h('p', { class: 'muted klein', style: { margin: '0 0 4px' } }, g.hinweis),
      liste(g.eintraege, x => h('li', { tabindex: 0, onclick: () => los(zumEintrag(g, x)), onkeydown: ev => { if (ev.key === 'Enter') los(zumEintrag(g, x)); } }, h('span', { class: 'sym ' + (istSchwer(g, x) ? 'h' : 'w') }, istSchwer(g, x) ? '✕' : '!'), h('span', {}, x.text), h('span', { class: 'rechts muted' }, icon('pfeil-rechts'))), seite))));
  return { el, n };
}
async function offenePunkteDialog(nachRechnung) {
  let sprung = null;
  const zu = fn => { sprung = fn; const b = document.querySelector('dialog[open] .dfuss button'); if (b) b.click(); };
  const { el, n } = offenePunkteInhalt(!!nachRechnung, zu);
  if (!n && !nachRechnung) { toast('Keine offenen Punkte: Alle Stunden sind platziert und haben Lehrkraft, Raum und – wo verlangt – eine Co-Lehrkraft; Aufsichten sind besetzt.', 'ok', 6000); return; }
  if (nachRechnung && APP.daten.plan.platzierungen.length) {
    // Kurzbilanz der Berechnung über der Liste
    const { M, P, bewertung } = modell();
    let gesetzt = 0; for (let e = 0; e < M.E.length; e++) if (P.start[e] >= 0) gesetzt++;
    const kzahl = (w, n, kl) => h('div', { class: 'kennzahl ' + (kl || '') }, h('div', { class: 'w' }, String(w)), h('div', { class: 'n' }, n));
    el.prepend(h('div', { class: 'kennzahlen', id: 'ergebnisBilanz', style: { marginTop: 0 } },
      kzahl(gesetzt + ' / ' + M.E.length, 'Blöcke eingeplant', gesetzt < M.E.length ? 'warn' : 'ok'), kzahl(hartEnd(), 'harte Fehler (Endvalidierung)', hartEnd() ? 'err' : 'ok'),
      kzahl(zahlDe(bewertung.k.weich, 1), 'Strafpunkte (weiche Regeln)'), kzahl(n, 'offene Punkte', n ? 'warn' : 'ok')));
    el.querySelector('#ergebnisBilanz').after(ampelKarte());
    const zt = APP.rechnung.ergebnis && APP.rechnung.ergebnis.statistik ? APP.rechnung.ergebnis.statistik.zuteilung : null;
    if (zt && zt.auto) el.querySelector('#ergebnisBilanz').after(h('p', { class: 'muted klein', id: 'zuteilungBilanz', style: { margin: '6px 0 0' } }, 'Lehrkräfte automatisch zugeteilt: ' + (zt.auto - zt.offen) + ' von ' + zt.auto + (zt.auto === 1 ? ' Unterricht' : ' Unterrichten') + (zt.offen ? ' – ' + zt.offen + ' ohne Lehrkraft (N. N.)' : '') + '.'));
  }
  const zeigen = h('input', { type: 'checkbox', checked: APP.meta.offenNachRechnung === true, onchange: ev => { APP.meta.offenNachRechnung = ev.target.checked; metaSpeichern(); } });
  el.append(h('label', { class: 'check klein', style: { marginTop: '12px' } }, zeigen, 'Dieses Fenster nach jeder Berechnung öffnen'));
  await dialog({ titel: nachRechnung ? 'Ergebnis der Berechnung' + (n ? ': ' + n + ' offene' + (n === 1 ? 'r Punkt' : ' Punkte') : ': alles gelöst') : 'Offene Punkte (' + n + ')', breite: '780px', inhalt: el, knoepfe: [{ text: 'Schließen', wert: false }, { text: 'Zur Seite „Auswertung“', wert: 'seite' }] }).then(w => { if (w === 'seite') sprung = () => gehe('auswertung', { reiter: 'offen' }); });
  if (sprung) sprung();
}
function offenePunkteKnopf(klasse) {
  const n = offenePunkteZahl();
  return h('button', { class: 'btn ' + (klasse || 'klein'), title: 'Alles, was noch von Hand zu klären ist: Stunden ohne Platz, Raum, Lehrkraft oder Co-Lehrkraft, offene Aufsichten, Konflikte, Arbeitszeitgrenzen', onclick: () => gehe('auswertung', { reiter: 'offen' }) }, 'Offene Punkte', n ? h('span', { class: 'badge warn', style: { marginLeft: '6px' } }, String(n)) : null);
}
function inAblage(e) {
  const { M, P } = modell();
  if (M.E[e].fixStart >= 0) { toast('Fixierte Blöcke zuerst lösen.', 'err'); return; }
  P.begin(); P.entferne(e); P.commit();
  planUebernehmen('In die Ablage gelegt: ' + evName(M, e));
}
function fixierenUmschalten(e) {
  const { M, P } = modell();
  const ev = M.E[e];
  if (P.start[e] < 0) { toast('Nur platzierte Blöcke lassen sich fixieren.'); return; }
  if (ev.fixStart >= 0 && !ev.gesperrt) { toast('Diese Fixierung stammt aus dem Unterrichtsdialog und wird dort gelöst.'); return; }
  const an = !ev.gesperrt;
  const keys = new Set(ev.parts.map(p => M.U[p.u].id + '|' + (p.b + 1)));
  aendern((an ? 'Fixiert: ' : 'Gelöst: ') + evName(M, e), d => { d.plan.platzierungen.forEach(p => { if (keys.has(p.unterricht + '|' + p.blockNr)) p.gesperrt = an; }); });
}
function blitzKachel(e) { document.querySelectorAll('.kachel[data-e="' + e + '"]').forEach(n => { n.classList.remove('blitz'); void n.offsetWidth; n.classList.add('blitz'); }); }
async function verschiebenDialog(e, view) {
  const { M } = modell();
  const alle = [];
  for (let s = 0; s < M.S; s++) { if (M.pause[s % M.H] && !M.E[e].pauseRand) continue; alle.push({ s, st: zielStatus(e, s, view) }); }
  const rang = { ok: 0, weich: 1, hart: 2 };
  alle.sort((a, b) => rang[a.st.st] - rang[b.st.st] || a.s - b.s);
  let wahl = null, mitHart = false;
  const root = h('div', {});
  const nimm = x => { wahl = x; document.querySelector('dialog .dfuss .primaer').click(); };
  const zeichne = () => {
    const liste = alle.filter(x => x.st.st !== 'hart' || (mitHart && x.st.text !== 'aktuelle Position'));
    const box = liste.length ? h('div', { class: 'vliste', role: 'listbox', style: { maxHeight: '46vh' } }, liste.map(x => h('li', { tabindex: 0, role: 'option', class: x.st.st === 'hart' ? 'muted' : '', onclick: () => nimm(x), onkeydown: ev => { if (ev.key === 'Enter') nimm(x); } },
      h('span', { class: 'sym ' + (x.st.st === 'ok' ? '' : x.st.st === 'hart' ? 'h' : 'w'), style: { color: x.st.st === 'ok' ? 'var(--ok)' : '' } }, x.st.st === 'ok' ? '✓' : x.st.st === 'hart' ? '✕' : '~'), h('b', {}, slotStd(M, x.s)), h('span', { class: 'muted' }, x.st.text)))) : h('p', {}, 'Kein zulässiger Zielslot.');
    if (box.tagName === 'DIV') box.addEventListener('keydown', ev => { if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return; const li = [...box.querySelectorAll('li')]; const i = li.indexOf(document.activeElement); const j = Math.max(0, Math.min(li.length - 1, (i < 0 ? 0 : i + (ev.key === 'ArrowDown' ? 1 : -1)))); if (li[j]) { ev.preventDefault(); li[j].focus(); } });
    leeren(root).append(h('p', { class: 'muted klein' }, 'Angeboten werden zulässige Ziele (✓ regelkonform, ~ mit weichem Verstoß). Pfeiltasten/Tab wählen, Enter übernimmt.'), box,
      h('label', { class: 'check klein', style: { marginTop: '8px' }, title: 'Zeigt auch Ziele, die eine harte Regel verletzen (✕). Bei der Wahl fragt das Programm, ob der Zug trotzdem ausgeführt und der Plan neu gelöst werden soll.' }, h('input', { type: 'checkbox', checked: mitHart, onchange: ev => { mitHart = ev.target.checked; zeichne(); } }), 'auch Ziele mit hartem Verstoß zeigen (✕) – zum Erzwingen'));
  };
  zeichne();
  const ok = await dialog({ titel: 'Verschieben: ' + evName(M, e), inhalt: root, knoepfe: [{ text: 'Abbrechen', wert: false }, { text: 'Übernehmen', wert: true, art: 'primaer', vorher: () => wahl !== null }], fokus: '.vliste li' });
  if (!ok || wahl === null) return;
  if (wahl.st.st === 'hart') erzwingenDialog(e, wahl.s, view, wahl.st.text); else zugAusfuehren(e, wahl.s, view);
}
function kachelMenue(e, x, y, view) {
  const { M, P } = modell();
  const ev = M.E[e], U = M.U[ev.parts[0].u];
  const platziert = P.start[e] >= 0;
  const eintraege = [
    { titel: evName(M, e) },
    { icon: ev.gesperrt ? 'schloss-offen' : 'schloss', text: ev.gesperrt ? 'Lösen' : 'Fixieren', taste: 'L', aus: !platziert || (ev.fixStart >= 0 && !ev.gesperrt), tun: () => fixierenUmschalten(e) },
    { icon: 'verschieben', text: 'Verschieben nach …', taste: 'V', aus: ev.fixStart >= 0, tun: () => verschiebenDialog(e, view) },
    { icon: 'tuer', text: 'Raum ändern …', aus: !platziert || !ev.parts.some(p => p.cands && p.cands.length > 1), tun: () => raumMenue(e, x, y) },
    { icon: 'personen', text: 'Lehrkraft ändern …', tun: () => lehrerMenue(e, x, y) },
    { icon: 'lupe', text: 'Ersatz suchen: Fachlehrkraft', aus: !platziert || ev.aufgabe, tun: () => ersatzSuchen(e, 'lehrer') },
    { icon: 'lupe', text: 'Ersatz suchen: Co-Lehrkraft', aus: !platziert || ev.aufgabe, tun: () => ersatzSuchen(e, 'co') },
    { icon: 'lupe', text: 'Ersatz suchen: Raum', aus: !platziert || !ev.parts.some(p => p.cands), tun: () => ersatzSuchen(e, 'raum') },
    { icon: 'ablage', text: 'In die Ablage legen', taste: 'Entf', aus: !platziert || ev.fixStart >= 0, tun: () => inAblage(e) },
    (() => { const hf = harteFehlerZuBlock(M, P, e); return { icon: 'warnung', text: hf.length ? 'Harten Fehler akzeptieren … (' + hf.length + ')' : 'Harten Fehler akzeptieren …', aus: !hf.length, tun: () => akzeptierenDialog(hf) }; })(),
    '-',
    { icon: 'stift', text: 'Details öffnen (Unterrichtsdialog)', taste: 'Enter', tun: () => unterrichtDialog(U.id) }
  ];
  menueZeigen(x, y, eintraege);
}
function raumMenue(e, x, y) {
  const { M, P } = modell();
  const ev = M.E[e], s = P.start[e];
  const eintraege = [{ titel: 'Raum für ' + evName(M, e) }];
  ev.parts.forEach((part, p) => {
    if (!part.cands) return;
    const akt = P.raum[P.rOff[e] + p];
    if (ev.parts.length > 1) eintraege.push({ titel: M.U[part.u].name });
    part.cands.slice().sort((a, b) => natVergleich(M.rName[a], M.rName[b])).forEach(r => {
      const frei = r === akt || P.raumFrei(r, s, ev.dur, ev.wochen);
      eintraege.push({ text: (r === akt ? '● ' : '') + M.rName[r] + ' (' + M.rKap[r] + ' Pl.)' + (frei ? '' : ' – belegt'), aus: !frei || r === akt, tun: () => {
        P.begin(); P.touch(e); P._belegeRaum(e, p, -1); P.raum[P.rOff[e] + p] = r; P._belegeRaum(e, p, 1); P.commit();
        planUebernehmen('Raum geändert: ' + evName(M, e) + ' → ' + M.rName[r]);
      } });
    });
  });
  menueZeigen(x, y, eintraege);
}
function lehrerMenue(e, x, y) {
  const { M, P } = modell();
  const ev = M.E[e], part = ev.parts[0], U = M.U[part.u];
  const u = APP.daten.unterrichte[part.u];
  const fach = u.fach;
  const aktuell = u.lehrkraefte.find(z => z.rolle === 'fach');
  // frei = in allen platzierten Blöcken des Unterrichts verfügbar und nicht anderweitig belegt
  const team = teamVon(u.klassen);
  const alle = APP.daten.lehrer.map((l, t) => ({ l, t })).filter(k => U.aufgabe || k.l.art !== 'personal').map(({ l, t }) => ({ l, t, bef: U.aufgabe || (l.ausgebildet === false ? coBefaehigt(l, fach) : fachBefaehigt(l, fach)), frei: !lehrerFreiIn(M, P, part.u, t).length, team: team.has(l.id) }))
    .sort((a, b) => natVergleich(a.l.kuerzel || a.l.name, b.l.kuerzel || b.l.name) || natVergleich(a.l.name, b.l.name));
  const setzen = async (k, zwang) => {
    const tun = d => { const uu = d.unterrichte[part.u]; const i = uu.lehrkraefte.findIndex(z => z.rolle === 'fach'); if (i >= 0) Object.assign(uu.lehrkraefte[i], { lehrer: k.l.id, zwang, auto: false }); else uu.lehrkraefte.unshift(nLehrkraftZuordnung({ lehrer: k.l.id, rolle: 'fach', zwang })); };
    let erzw = false;
    // dieselbe Schranke wie in der Ressourcenleiste: ✕ nur nach „Trotzdem erzwingen“
    if (!U.aufgabe) { const xr = ressourceEintrag(e, 0, k.l.id, 'fach'); if (xr) { const r = await zuweisungBestaetigen(e, 0, xr, 'fach', 'alle', tun, k.l.kuerzel + ' → ' + U.name); if (!r) return; erzw = r.erzwungen; } }
    aendern('Lehrkraft geändert: ' + U.name + ' → ' + k.l.kuerzel + (zwang ? ' (Zwang)' : '') + (erzw ? ' (erzwungen)' : ''), tun, { normalisieren: true });
    if (!k.frei && !erzw) toast(k.l.kuerzel + ' ist in mindestens einem Block belegt – bitte Verstöße prüfen.', 'err', 6000);
  };
  // Verfügbarkeit laut Ressourcenprüfung (für alle Stunden des Unterrichts); ohne platzierten Block die einfache Belegungsprobe
  const status = k => { const xr = U.aufgabe ? null : ressourceEintrag(e, 0, k.l.id, 'fach'); if (!xr) return k.frei ? ' ✓ frei' : ' ✕ belegt'; if (xr.st === 'nein') return ' ✕ ' + (xr.gruende[0] || 'nicht verfügbar'); if (!xr.alle) return ' ✕ nicht in allen Stunden frei'; return xr.st === 'warn' ? ' ⚠ ' + xr.folgen[0] : ' ✓ frei'; };
  const eintrag = (k, zwang) => ({ text: (aktuell && aktuell.lehrer === k.l.id ? '● ' : '') + (zwang ? '⚠ ' : '') + k.l.kuerzel + ' – ' + k.l.name + (k.bef ? '' : ' (ohne Lehrbefähigung)') + (k.team && k.l.ausgebildet === false ? ' · Team' : '') + (aktuell && aktuell.lehrer === k.l.id ? '' : status(k)), aus: aktuell && aktuell.lehrer === k.l.id, tun: () => setzen(k, zwang) });
  const eintraege = [];
  if (!U.aufgabe) {
    // nur dieser Block: herausgenommene Person doch einsetzen, von Hand Eingesetzte wieder herausnehmen, einzelne Stunde besetzen
    eintraege.push({ titel: 'Nur ' + (ev.dur > 1 ? 'dieser Block' : 'diese Stunde') + (P.start[e] >= 0 ? ' (' + slotText(M, P.start[e]) + (ev.dur > 1 ? '–' + M.lnr[(P.start[e] + ev.dur - 1) % M.H] + '.' : '') + ' Std.)' : '') });
    (ev.ohne || []).forEach(o => eintraege.push({ icon: 'rueckgaengig', text: M.lKz[o.t] + ' wieder einsetzen', tun: () => ohneAufheben(e, o.t) }));
    (ev.hand || []).forEach(q => eintraege.push({ icon: 'x', text: M.lKz[q.t] + ' wieder herausnehmen', tun: () => blockBesetzungWeg(e, q.t) }));
    // eingesetzte Fach- und Co-Lehrkräfte (auch automatisch geplante) nur aus diesem Termin herausnehmen; herausgenommene anteilige Co-Lehrkräfte zurückholen
    const imKurs = [...new Set(ev.parts.flatMap(pt => { const uu = APP.daten.unterrichte[pt.u]; return uu.lehrkraefte.map(z => z.lehrer).concat((APP.daten.plan.frei || []).filter(a => a.unterricht === uu.id && a.blockNr === pt.b + 1).map(a => a.lehrer)); }))];
    imKurs.forEach(lid => { const info = lkImTermin(e, lid); if (!info || info.art === 'hand') return;
      if (info.aktiv) eintraege.push({ icon: 'x', text: (M.lKz[M.lI.get(lid)] || '?') + ' nur hier herausnehmen' + (info.rolle === 'co' ? ' (Co)' : ''), hinweis: info.auto ? 'automatisch geplant' : null, tun: () => lkEntfernen(e, lid, 'block') });
      else if (info.raus && (info.art === 'anteilig' || info.art === 'raus')) eintraege.push({ icon: 'rueckgaengig', text: (M.lKz[M.lI.get(lid)] || '?') + ' wieder einsetzen' + (info.rolle === 'co' ? ' (Co)' : ''), tun: () => lkWiederEinsetzen(e, lid) }); });
    eintraege.push({ icon: 'hand', text: 'Nur ' + (ev.dur > 1 ? 'diesen Block' : 'diese Stunde') + ' besetzen …', tun: () => blockLehrerMenue(e, x, y) }, '-');
    // ganzer Kurs: Personen entfernen (die automatische Planung setzt sie dort nicht wieder ein) bzw. wieder zulassen
    eintraege.push({ titel: 'Alle Blöcke von ' + U.name.replace(/ \(Block \d+\)/, '') });
    imKurs.forEach(lid => { const info = lkImTermin(e, lid); if (!info || info.art === 'hand' || info.art === 'raus') return; eintraege.push({ icon: 'papierkorb', text: (M.lKz[M.lI.get(lid)] || '?') + ' aus allen Stunden entfernen' + (info.rolle === 'co' ? ' (Co)' : ''), hinweis: info.auto ? 'automatisch geplant' : null, tun: () => lkEntfernen(e, lid, 'alle') }); });
    ev.parts.forEach(pt => { const uu = APP.daten.unterrichte[pt.u]; (uu.ohneAuto || []).forEach(lid => { const l0 = lehrerVon(lid); if (l0) eintraege.push({ icon: 'rueckgaengig', text: (l0.kuerzel || l0.name) + ' wieder automatisch einplanen lassen', tun: () => ohneAutoAufheben(uu.id, lid) }); }); });
    eintraege.push('-');
  }
  eintraege.push({ titel: (U.aufgabe ? 'Person für ' : 'Fachlehrkraft für ') + U.name + ' (alle Blöcke)' });
  if (U.aufgabe) { alle.forEach(k => eintraege.push(eintrag(k, false))); menueZeigen(x, y, eintraege); return; }
  // Klassenteam (gehört zur Klasse) zuerst, dann alle weiteren Lehrkräfte, zuletzt Co-Kräfte mit Zwang
  const tL = alle.filter(k => k.team && k.l.ausgebildet !== false);
  if (tL.length) { eintraege.push({ titel: teamTitel(u.klassen) }); tL.forEach(k => eintraege.push(eintrag(k, false))); eintraege.push('-', { titel: 'Weitere Lehrkräfte' }); }
  alle.filter(k => !k.team && k.l.ausgebildet !== false).forEach(k => eintraege.push(eintrag(k, false)));
  const co = alle.filter(k => k.l.ausgebildet === false).sort((a, b) => (b.team ? 1 : 0) - (a.team ? 1 : 0));
  if (co.length) { eintraege.push('-', { titel: 'Co-Kräfte – nur mit Zwang' }); co.forEach(k => eintraege.push(eintrag(k, true))); }
  menueZeigen(x, y, eintraege);
}
// --- einzelne Stunde (Block) besetzen: plan.besetzung / plan.frei ---
function blockSchluessel(M, ev) { return new Set(ev.parts.map(pt => M.U[pt.u].id + '|' + (pt.b + 1))); }
function ohneAufheben(e, t) {
  const { M } = modell(); const ev = M.E[e], lid = APP.daten.lehrer[t].id, keys = blockSchluessel(M, ev);
  const rolleCo = ev.parts.some(pt => M.U[pt.u].rolle.get(t) === 'co');
  aendern(M.lKz[t] + ' wieder eingesetzt: ' + evName(M, e), d => {
    d.plan.frei = (d.plan.frei || []).filter(a => !(a.lehrer === lid && keys.has(a.unterricht + '|' + a.blockNr)));
    // kehrt die Fachlehrkraft zurück, entfällt eine Vertretung von Hand für diesen Block
    if (!rolleCo) d.plan.besetzung = (d.plan.besetzung || []).filter(b => !keys.has(b.unterricht + '|' + b.blockNr));
  });
  toast(M.lKz[t] + ' hält die Stunde wieder selbst.', '', 5000);
}
function blockBesetzungWeg(e, t) {
  const { M } = modell(); const ev = M.E[e], lid = APP.daten.lehrer[t].id, keys = blockSchluessel(M, ev);
  aendern(M.lKz[t] + ' herausgenommen: ' + evName(M, e), d => { d.plan.besetzung = (d.plan.besetzung || []).filter(b => !(b.lehrer === lid && keys.has(b.unterricht + '|' + b.blockNr))); });
}
function blockBesetzen(e, p, lid) {
  const { M } = modell(); const ev = M.E[e], part = ev.parts[p] || ev.parts[0], U = M.U[part.u], l = lehrerVon(lid);
  aendern('Stunde besetzt: ' + evName(M, e) + ' → ' + (l.kuerzel || l.name), d => {
    d.plan.besetzung = (d.plan.besetzung || []).filter(b => !(b.unterricht === U.id && b.blockNr === part.b + 1 && b.lehrer === lid));
    d.plan.besetzung.push({ unterricht: U.id, blockNr: part.b + 1, lehrer: lid, sig: besetzungSig(bloeckeAlle(d).get(U.id)) });
  });
  requestAnimationFrame(() => blitzKachel(e));
}
// --- Lehrkraft aus einem Termin herausnehmen (Gegenstück zum Hinzufügen; gilt auch für automatisch geplante Fach- und Co-Lehrkräfte) ---
// Wie steht die Person in diesem Termin? null = gar nicht (oder Aufgabe). art: 'hand' (nur für diesen Block von Hand eingesetzt),
// 'kurs' (für alle Blöcke eingetragen), 'anteilig' (anteilige Co-Lehrkraft). aktiv: hält den Block jetzt. raus: für diesen Block von Hand herausgenommen.
function lkImTermin(e, lid) {
  const { M, P } = modell(), d = APP.daten, ev = M.E[e], t = M.lI.get(lid);
  if (!ev || ev.aufgabe || t === undefined) return null;
  for (let p = 0; p < ev.parts.length; p++) {
    const part = ev.parts[p], u = d.unterrichte[part.u]; if (!u || u.aufgabe) continue;
    const uid = u.id, blockNr = part.b + 1, z = u.lehrkraefte.find(q => q.lehrer === lid), hand = (ev.hand || []).find(x => x.t === t && x.p === p);
    const marke = (d.plan.frei || []).find(a => a.unterricht === uid && a.blockNr === blockNr && a.lehrer === lid), rausRoh = !!marke;
    // herausgenommen und inzwischen gar nicht mehr im Kurs (die automatische Co-Planung hat die übrigen Stunden anders vergeben)
    if (!z && !hand) { if (marke && marke.rolle) return { p, uid, blockNr, rolle: marke.rolle, art: 'raus', auto: false, aktiv: false, raus: true }; continue; }
    if (hand) return { p, uid, blockNr, rolle: hand.co ? 'co' : 'fach', art: 'hand', auto: false, aktiv: true, raus: false };
    if (z.modus === 'anteilig') {
      const aktiv = ev.co.some((c, j) => c.t === t && c.p === p && P.co[P.cOff[e] + j]);
      return { p, uid, blockNr, rolle: 'co', art: 'anteilig', auto: !!z.auto, aktiv, raus: !aktiv && rausRoh };
    }
    const raus = (ev.ohne || []).some(o => o.t === t);
    return { p, uid, blockNr, rolle: z.rolle, art: 'kurs', auto: !!z.auto, aktiv: !raus && ev.immer.includes(t), raus };
  }
  return null;
}
// Änderung als Funktion für aendern(). umfang 'block': nur dieser Termin (plan.frei / plan.besetzung / p.co); 'alle': aus dem ganzen Unterricht,
// und die automatische Planung setzt die Person hier nicht wieder ein (u.ohneAuto).
function lkEntfernenFn(info, lid, umfang) {
  return dd => {
    const u = dd.unterrichte.find(x => x.id === info.uid); if (!u) return;
    const bl = bloeckeAlle(dd), istBlock = x => x.unterricht === info.uid && x.blockNr === info.blockNr;
    dd.plan.frei = dd.plan.frei || []; dd.plan.besetzung = dd.plan.besetzung || [];
    const z = u.lehrkraefte.find(q => q.lehrer === lid);
    if (umfang === 'block') {
      if (info.art === 'hand') { dd.plan.besetzung = dd.plan.besetzung.filter(b => !(istBlock(b) && b.lehrer === lid)); return; }
      if (info.art === 'anteilig') {
        const pl = dd.plan.platzierungen.find(istBlock);
        if (pl) { pl.co = (pl.co || []).filter(c => c !== lid); if (z && z.auto) z.stundenAnteil = Math.max(0, Math.round((z.stundenAnteil - pl.dauer * (platzWochen(u, pl, bl).length === 1 ? 0.5 : 1)) * 2) / 2); }
      }
      dd.plan.frei = dd.plan.frei.filter(a => !(istBlock(a) && a.lehrer === lid));
      dd.plan.frei.push({ unterricht: info.uid, blockNr: info.blockNr, lehrer: lid, grund: 'von Hand herausgenommen', sig: besetzungSig(bl.get(info.uid)), rolle: info.rolle });
      return;
    }
    u.lehrkraefte = u.lehrkraefte.filter(q => q.lehrer !== lid);
    dd.plan.platzierungen.forEach(pl => { if (pl.unterricht === u.id && pl.co && pl.co.length) pl.co = pl.co.filter(c => c !== lid); });
    dd.plan.besetzung = dd.plan.besetzung.filter(b => !(b.unterricht === u.id && b.lehrer === lid));
    dd.plan.frei = dd.plan.frei.filter(a => !(a.unterricht === u.id && a.lehrer === lid));
    u.ohneAuto = [...new Set((u.ohneAuto || []).concat([lid]))];
    if (z && z.rolle === 'fach' && z.auto) u.fachAuto = true; // die nächste Berechnung wählt eine andere Fachlehrkraft
  };
}
function lkEntfernen(e, lid, umfang) {
  const info = lkImTermin(e, lid); if (!info) return;
  const { M } = modell(), l = lehrerVon(lid), kz = (l && (l.kuerzel || l.name)) || '?', U = M.U[M.E[e].parts[info.p].u], name = U.name.replace(/ \(Block \d+\)/, '');
  const rolleT = info.rolle === 'co' ? 'Co-Lehrkraft' : 'Fachlehrkraft', block = M.E[e].dur > 1 ? 'diesem Block' : 'dieser Stunde';
  const text = umfang === 'block'
    ? kz + ' ist in ' + block + ' nicht mehr ' + rolleT + '.' + (info.rolle === 'fach' && info.art !== 'hand' ? ' Die Stunde ist jetzt ohne Fachlehrkraft – eine Lehrkraft auf die Kachel ziehen, um sie zu besetzen.' : info.rolle === 'co' ? ' Die automatische Planung setzt hier niemanden nach.' : '')
    : kz + ' ist aus allen Stunden von ' + name + ' entfernt und wird dort nicht wieder automatisch eingeplant.' + (info.rolle === 'fach' ? ' Bis zur nächsten Berechnung ohne Fachlehrkraft (N. N.).' : ' Der Co-Bedarf bleibt – die automatische Planung kann eine andere Person einsetzen.');
  aendernMitUndo(rolleT + ' herausgenommen' + (umfang === 'block' ? ' (nur dieser Termin): ' : ' (alle Stunden): ') + kz + ' – ' + name, lkEntfernenFn(info, lid, umfang), { normalisieren: true }, text);
  APP.editor.sel = -1; // Blocknummern können sich geändert haben; die Leiste rechts zeigt danach wieder den Hinweis
}
// von Hand herausgenommene Person für diesen Termin wieder einsetzen (bzw. eine anteilige Co-Lehrkraft auch in diesem Block einsetzen)
function lkWiederEinsetzen(e, lid) {
  const info = lkImTermin(e, lid); if (!info) return;
  const { M } = modell(), t = M.lI.get(lid);
  if (info.art === 'kurs' && info.raus) { ohneAufheben(e, t); return; }
  if (info.art !== 'anteilig' && info.art !== 'raus') return;
  const z0 = APP.daten.unterrichte.find(u => u.id === info.uid).lehrkraefte.find(q => q.lehrer === lid);
  aendern(M.lKz[t] + ' in diesem Termin eingesetzt: ' + evName(M, e), dd => {
    const istBlock = x => x.unterricht === info.uid && x.blockNr === info.blockNr;
    dd.plan.frei = (dd.plan.frei || []).filter(a => !(istBlock(a) && a.lehrer === lid));
    // feste anteilige Co-Lehrkraft: zurück in den Block. Automatisch geplante oder nicht mehr eingetragene Person: von Hand für diesen Termin
    // (die automatische Co-Planung vergibt sonst bei der nächsten Änderung neu)
    if (z0 && z0.modus === 'anteilig' && !z0.auto) { const pl = dd.plan.platzierungen.find(istBlock); if (pl && !(pl.co || []).includes(lid)) pl.co = (pl.co || []).concat([lid]); }
    else { dd.plan.besetzung = (dd.plan.besetzung || []).filter(b => !(istBlock(b) && b.lehrer === lid)); dd.plan.besetzung.push({ unterricht: info.uid, blockNr: info.blockNr, lehrer: lid, sig: besetzungSig(bloeckeAlle(dd).get(info.uid)), rolle: info.rolle === 'fach' ? 'fach' : 'co' }); }
  }, { normalisieren: true });
}
// Menü für eine eingesetzte Person: aus dieser Stunde herausnehmen oder aus allen Stunden entfernen (Ziehen auf die Kachel, Leiste „Ressourcen“, „Lehrkraft ändern …“)
function lkEntfernenMenue(e, lid, x, y) {
  const info = lkImTermin(e, lid); if (!info) return false;
  const { M } = modell(), l = lehrerVon(lid), kz = (l && (l.kuerzel || l.name)) || '?', ev = M.E[e], U = M.U[ev.parts[info.p].u];
  const rolleT = info.rolle === 'co' ? 'Co-Lehrkraft' : 'Fachlehrkraft', wie = info.art === 'hand' ? 'von Hand nur für diesen Termin' : info.auto ? 'automatisch geplant' : 'fest eingetragen';
  const block = ev.dur > 1 ? 'diesem Block' : 'dieser Stunde';
  const eintraege = [{ titel: kz + ' – ' + rolleT + ' in ' + U.name.replace(/ \(Block \d+\)/, '') + ' (' + wie + ')' }];
  if (info.aktiv) eintraege.push({ icon: 'x', text: 'Nur aus ' + block + ' herausnehmen', hinweis: info.rolle === 'fach' && info.art !== 'hand' ? 'danach ohne Lehrkraft' : null, tun: () => lkEntfernen(e, lid, 'block') });
  else if (info.raus) eintraege.push({ icon: 'rueckgaengig', text: 'In ' + block + ' wieder einsetzen', tun: () => lkWiederEinsetzen(e, lid) });
  else if (info.art === 'anteilig') eintraege.push({ icon: 'plus', text: 'Auch in ' + block + ' einsetzen', tun: () => lkWiederEinsetzen(e, lid) });
  if (info.art !== 'hand' && info.art !== 'raus') eintraege.push({ icon: 'papierkorb', text: 'Aus allen Stunden des Kurses entfernen', hinweis: 'nicht wieder automatisch', tun: () => lkEntfernen(e, lid, 'alle') });
  menueZeigen(x, y, eintraege);
  return true;
}
// automatische Planung für eine von Hand entfernte Person wieder zulassen
function ohneAutoAufheben(uid, lid) {
  const l = lehrerVon(lid);
  aendern('Wieder automatisch zugelassen: ' + ((l && (l.kuerzel || l.name)) || '?'), dd => { const u = dd.unterrichte.find(x => x.id === uid); if (u) u.ohneAuto = (u.ohneAuto || []).filter(x => x !== lid); });
}
// Ist die Person t in diesem Block frei? '' = ja, sonst der Grund
function blockFreiText(M, P, e, t) {
  const ev = M.E[e], s0 = P.start[e]; if (s0 < 0) return '';
  for (let k = 0; k < ev.dur; k++) {
    if (M.lVerf[t * M.S + s0 + k] === 0) return 'gesperrt';
    for (const w of ev.wochen) { const i = (t * 2 + w) * M.S + s0 + k; if (P.occ[i] > 0 && P.who[i] !== e) return 'belegt: ' + evName(M, P.who[i]); }
  }
  return '';
}
function blockLehrerMenue(e, x, y, p0) {
  const { M, P } = modell();
  const ev = M.E[e]; let p = p0 !== undefined ? p0 : teilOhneLk(M, ev); if (p < 0) p = 0;
  const part = ev.parts[p], U = M.U[part.u];
  if (P.start[e] < 0) { toast('Die Stunde liegt in der Ablage – zuerst in den Plan legen, dann lässt sie sich besetzen.', 'err', 6000); return; }
  // einzige Quelle: die Ressourcenprüfung des Termins (wie in der Leiste rechts) – ✓ verfügbar, ⚠ mit Nachteilen, ✕ nicht verfügbar
  const teil = (ressourcen(e).teile[p] || ressourcen(e).teile[0]), SY = { ok: '✓', warn: '⚠', nein: '✕' };
  const kand = teil.lehrer.filter(k => !k.aktuell), da = kand.filter(k => k.st !== 'nein'), weg = kand.filter(k => k.st === 'nein');
  const zeile = k => ({ text: SY[k.st] + ' ' + k.kuerzel + ' – ' + k.name + ' · ' + k.rangText + (k.gruende.concat(k.folgen).length ? ' – ' + k.gruende.concat(k.folgen).slice(0, 2).join(' · ') : ''), tun: () => ressourceZuweisen(e, p, k, 'fach', 'block') });
  const eintraege = [{ titel: 'Nur ' + (ev.dur > 1 ? 'diesen Block' : 'diese Stunde') + ' besetzen: ' + U.name + ', ' + slotText(M, P.start[e]) + (ev.dur > 1 ? '–' + M.lnr[(P.start[e] + ev.dur - 1) % M.H] + '.' : '') + ' Std.' }];
  da.forEach(k => eintraege.push(zeile(k)));
  if (!da.length) eintraege.push({ text: 'Zu dieser Zeit ist keine Fachlehrkraft verfügbar', aus: true, tun: () => {} });
  if (weg.length) { eintraege.push('-', { titel: 'Nicht verfügbar (✕) – nur mit „Trotzdem erzwingen“' }); weg.slice(0, 14).forEach(k => eintraege.push(zeile(k))); }
  menueZeigen(x, y, eintraege);
}
function abWochenAktiv() { return APP.daten.schule.wochenrhythmus === 'AB' || APP.daten.unterrichte.some(u => u.rhythmus !== 'jede' || (u.bloeckeWoche || []).some(w => w === 'A' || w === 'B') || (!u.bloecke.length && (u.bloeckeAutoWoche || []).some(w => w === 'A' || w === 'B')) || (!u.aufgabe && !u.bloecke.length && u.wochenstunden % 2 === 1 && (fachVon(u.fach) || {}).doppelstunde === 'pflicht')); }
function abNebeneinander() {
  const E = APP.editor;
  E.parallel = true; E.art2 = E.art; E.id2 = E.id; E.woche = 'A'; E.woche2 = 'B';
  render();
}
// Kopf einer Planansicht: Ansicht (Klasse/Lehrkraft/Raum), Auswahl mit Vor/Zurück, bei A/B-Wochen die Woche; im Lehrerplan Stunden und Arbeitszeit.
// Für die Hauptansicht (rolle 'a') steht er links in der Werkzeugleiste, für die Parallelansicht (rolle 'b') über ihrem Plan.
function planAnsicht(rolle) {
  const E = APP.editor;
  const art = rolle === 'b' ? E.art2 : E.art;
  let id = rolle === 'b' ? E.id2 : E.id;
  const liste = ansichtListe(art);
  if (!liste.some(([i]) => i === id)) { id = liste.length ? liste[0][0] : null; if (rolle === 'b') E.id2 = id; else E.id = id; }
  return { art, id, liste };
}
function planKopf(rolle) {
  const E = APP.editor, { art, id, liste } = planAnsicht(rolle);
  const setze = (a, i) => { if (rolle === 'b') { E.art2 = a; E.id2 = i; } else { E.art = a; E.id = i; } render(); };
  const idx = liste.findIndex(([i]) => i === id);
  const kopf = h('div', { class: 'pkopf', role: 'group', 'aria-label': rolle === 'b' ? 'Ansicht des zweiten Plans' : 'Ansicht' },
    sel([['klasse', 'Klassenplan'], ['lehrer', 'Lehrerplan'], ['raum', 'Raumplan']], art, v => setze(v, null), { 'aria-label': 'Ansicht' }),
    h('button', { class: 'btn icon', 'aria-label': 'Vorherige', title: 'Vorherige', disabled: idx <= 0, onclick: () => setze(art, liste[idx - 1][0]) }, icon('links')),
    sel(liste, id || '', v => setze(art, v), { 'aria-label': 'Auswahl', style: { minWidth: '140px' } }),
    h('button', { class: 'btn icon', 'aria-label': 'Nächste', title: 'Nächste', disabled: idx < 0 || idx >= liste.length - 1, onclick: () => setze(art, liste[idx + 1][0]) }, icon('rechts')),
    abWochenAktiv() ? sel([['alle', 'Woche A + B'], ['A', 'nur Woche A'], ['B', 'nur Woche B']], (rolle === 'b' ? E.woche2 : E.woche) || 'alle', v => { if (rolle === 'b') E.woche2 = v; else E.woche = v; render(); }, { 'aria-label': 'Woche', title: 'A/B-Wochen: beide Wochen übereinander oder nur eine Woche anzeigen', class: (rolle === 'b' ? E.woche2 : E.woche) && (rolle === 'b' ? E.woche2 : E.woche) !== 'alle' ? 'wochewahl aktiv' : 'wochewahl' }) : null);
  if (id && art === 'lehrer') {
    const x = arbeitszeiten(APP.daten).liste.find(y => y.lehrer === id);
    if (x) { const m = stdStatus(x); kopf.append(h('span', { class: 'badge ' + m.kl, title: m.titel }, icon('buch', 'k'), m.text + ' UStd.')); }
    if (x) { const diff = x.diff / 60; kopf.append(h('span', { class: 'badge klickbar ' + (diff > 0.05 ? 'err' : diff < -1 ? 'warn' : 'ok'), role: 'button', tabindex: 0, onclick: ev => { ev.stopPropagation(); arbeitszeitDetailDialog(x.lehrer); }, onkeydown: ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); arbeitszeitDetailDialog(x.lehrer); } }, title: 'Klick: Berechnung im Detail · Wochenarbeitszeit: Unterricht ' + zahlDe(x.unterricht / 60, 1) + ' h, Vorbereitung ' + zahlDe(x.vorb / 60, 1) + ' h, Co ' + zahlDe((x.co + x.coVorb) / 60, 1) + ' h, Klassenleitung ' + zahlDe(x.kl / 60, 1) + ' h, Aufgaben ' + zahlDe(x.aufgaben / 60, 1) + ' h, Aufsicht ' + zahlDe(x.aufsicht / 60, 1) + ' h' + (diff < -1 ? ' – ' + zahlDe(-diff, 1) + ' h weniger als vertraglich vereinbart' : diff > 0.05 ? ' – ' + zahlDe(diff, 1) + ' h über der Wochenarbeitszeit' : '') }, icon('uhr', 'k'), zahlDe(x.summe / 60, 1) + ' / ' + zahlDe(x.soll / 60, 1) + ' h')); }
  }
  return kopf;
}
function planBox(rolle, mitKopf) {
  const { art, id } = planAnsicht(rolle);
  const kopf = mitKopf ? planKopf(rolle) : null;
  if (!id) return h('div', { class: 'planbox' }, kopf, h('p', { class: 'muted' }, 'Keine Einträge vorhanden.'));
  return h('div', { class: 'planbox' }, kopf, planRaster(art, id, rolle), art === 'lehrer' ? terminZeile(APP.daten, id) : null, art === 'lehrer' && druckOpt().aufsichten !== false ? aufsichtenBlockLehrer(APP.daten, id, { farbe: true }) : null);
}
// Ablage als Dock unter dem Plan: nicht platzierte Stunden in einer Reihe (horizontal scrollbar), einklappbar.
// Das ganze Dock ist Ablegeziel (.ablage) – auch eingeklappt lassen sich Kacheln hierher ziehen.
function ablageDock() {
  const { M, P } = modell();
  const E = APP.editor;
  const x = ansichtIndex(M, E.art, E.id);
  const offen = [];
  for (let e = 0; e < M.E.length; e++) {
    if (P.start[e] >= 0) continue;
    if (!E.ablageAlle) { const ev = M.E[e]; if (E.art === 'klasse' && !ev.klassen.includes(x)) continue; if (E.art === 'lehrer' && !ev.lehrer.includes(x)) continue; if (E.art === 'raum' && !ev.parts.some(p => p.cands && p.cands.includes(x))) continue; }
    offen.push(e);
  }
  const zu = !!APP.meta.ablageZu, akzAbl = akzeptiertBezug();
  const reihe = h('div', { class: 'ablagereihe' });
  offen.slice(0, 200).forEach(e => {
    const ev = M.E[e], f = ev.parts[0].f, U0 = M.U[ev.parts[0].u], fb = kachelFarbe(M, ev, 0);
    const el = h('div', { class: 'kachel', tabindex: 0, dataset: { e }, title: evName(M, e) + '\nIn einen Slot ziehen oder Rechtsklick → Verschieben nach …', style: { '--fach': fb } },
      h('div', { class: 'f' }, (U0.aufgabe ? U0.kurz : f >= 0 ? M.fKz[f] : '?') + (ev.dur > 1 ? ' (' + ev.dur + ' UStd.)' : '') + (ev.woche && ev.woche !== 'jede' ? ' [' + ev.woche + ']' : '')), h('div', { class: 'l' }, (ev.klassen.length ? ev.klassen.map(c => M.kName[c]).join('/') + ' · ' : '') + (ev.immer.map(t => M.lKz[t]).join('/') || (ev.aufgabe ? '–' : 'N. N.'))));
    if (!ev.aufgabe && teilOhneLk(M, ev) >= 0) el.classList.add('ohnelk');
    if (ev.parts.some((p, pi) => akzAbl.bl.has(M.U[p.u].id + '|' + P._blockNr(e, pi)))) { el.classList.add('akzeptiert'); el.append(h('span', { class: 'kmarken', 'aria-hidden': 'true' }, h('span', { class: 'kakz' }, '!'))); el.title += '\n❗ Fehlender Block als harter Fehler akzeptiert'; }
    kachelEvents(el, e, { art: E.art, id: E.id });
    reihe.append(el);
  });
  const leer = !offen.length; // ohne Einträge bleibt das Dock eine schmale Zeile
  return h('div', { class: 'ablage ablagedock' + (zu ? ' zu' : '') + (leer ? ' leer' : ''), role: 'region', 'aria-label': 'Ablage: nicht platzierte Stunden' },
    h('div', { class: 'adkopf' },
      h('button', { class: 'btn icon klein', disabled: leer, 'aria-expanded': zu || leer ? 'false' : 'true', 'aria-label': zu ? 'Ablage ausklappen' : 'Ablage einklappen', title: zu ? 'Ablage ausklappen' : 'Ablage einklappen', onclick: () => { APP.meta.ablageZu = !zu; metaSpeichern(); render(); } }, icon(zu ? 'oben' : 'unten')),
      h('b', {}, 'Ablage'), h('span', { class: 'muted klein adtext' }, 'nicht platzierte Stunden'), h('span', { class: 'badge ' + (offen.length ? 'err' : 'ok') }, offen.length),
      h('label', { class: 'check klein' }, h('input', { type: 'checkbox', checked: E.ablageAlle, onchange: ev => { E.ablageAlle = ev.target.checked; render(); } }), 'alle zeigen', hilfe('Ohne Haken: nur die Stunden der gewählten Klasse, Lehrkraft oder des Raums. Mit Haken: alle nicht platzierten Stunden des Projekts.')),
      zu || leer ? h('span', { class: 'muted klein rechts adhin' }, (leer ? 'Keine nicht platzierten Stunden' + (E.ablageAlle ? '' : ' in dieser Ansicht') + ' · ' : '') + 'Kacheln hierher ziehen, um sie aus dem Plan zu nehmen') : null),
    zu || leer ? null : reihe);
}
function detPasst(M, P, x, art, xi) {
  if (xi < 0) return false;
  if (art === 'klasse') return x.k ? x.k.includes(xi) : !!(x.e && x.e.some(e => M.E[e].klassen.includes(xi)));
  if (art === 'lehrer') return x.l ? x.l.includes(xi) : !!(x.e && x.e.some(e => P.start[e] >= 0 && istAktiv(M, P, e, xi)));
  return x.raum !== undefined ? x.raum === xi : !!(x.e && x.e.some(e => M.E[e].parts.some((p, pi) => P.raum[P.rOff[e] + pi] === xi)));
}
// Reiter „Probleme“ der Editor-Seitenleiste: Stand des Gesamtplans, Verstöße in dieser Ansicht und die offenen Punkte der Ansicht
function verstoesseBox() {
  const { M, P, bewertung } = modell();
  const E = APP.editor, d = APP.daten;
  const xi = ansichtIndex(M, E.art, E.id);
  const liste = bewertung.det.filter(x => detPasst(M, P, x, E.art, xi));
  const hart = liste.filter(x => M.hart[RI[x.r]]);
  const weich = liste.filter(x => !M.hart[RI[x.r]] && M.gew[RI[x.r]] > 0);
  const eintrag = (x, istHart) => h('li', { tabindex: 0, title: REGELN[RI[x.r]].name + ': ' + REGELN[RI[x.r]].text, onclick: () => detSprung(x), onkeydown: ev => { if (ev.key === 'Enter') detSprung(x); } }, h('span', { class: 'sym ' + (istHart ? 'h' : 'w') }, istHart ? '✕' : '~'), h('span', { title: regelName(x.r) }, x.text));
  // offene Punkte, die zur gewählten Klasse bzw. Lehrkraft gehören
  let offen = [];
  if (d.plan.platzierungen.length && E.id && E.art !== 'raum') {
    const uMap = new Map(d.unterrichte.map(u => [u.id, u]));
    const passt = x => { const u = uMap.get(x.unterricht); return E.art === 'klasse' ? (x.klasse === E.id || !!(u && u.klassen.includes(E.id))) : (x.lehrer === E.id || !!(u && u.lehrkraefte.some(z => z.lehrer === E.id))); };
    try { offenGruppen().forEach(g => g.eintraege.forEach(x => { if (passt(x)) offen.push({ g, x }); })); } catch (err) { offen = []; }
  }
  const nh = hartEnd();
  return h('div', { class: 'karte probleme', id: 'problemeBox' },
    h('div', { class: 'pstand' },
      nh ? h('button', { class: 'badge err', type: 'button', title: 'Endvalidierung des Gesamtplans (Unterricht, Personal, Co, Aufsichten) – davon ' + bewertung.k.hart + ' Verstöße gegen Pflichtregeln des Stundenplans. Klick: offene Punkte.', onclick: () => gehe('auswertung', { reiter: 'offen' }) }, '✕ ' + hartText(nh)) : h('span', { class: 'badge ok', title: 'Endvalidierung des Gesamtplans ohne harte Fehler' }, '✓ 0 harte Fehler'),
      h('span', { class: 'pstrafe', title: 'Strafpunkte des ganzen Plans: Summe aus Wichtigkeit × Verstöße aller Wünsche' }, h('b', {}, zahlDe(bewertung.k.weich, 1)), ' Strafpunkte')),
    h('h3', {}, 'Verstöße in dieser Ansicht', h('span', { class: 'badge ' + (hart.length ? 'err' : 'ok') }, '✕ ' + hart.length + ' hart'), h('span', { class: 'badge neutral' }, '~ ' + weich.length + ' weich')),
    hart.length || weich.length ? h('ul', { class: 'vliste' }, hart.map(x => eintrag(x, true)), weich.slice(0, 150).map(x => eintrag(x, false))) : h('p', { class: 'muted klein', style: { margin: '0 0 6px' } }, 'Keine Verstöße in dieser Ansicht.'),
    offen.length ? h('p', { class: 'klein', style: { margin: '10px 0 0' } }, h('span', { class: 'badge warn' }, offen.length), ' offene' + (offen.length === 1 ? 'r Punkt betrifft' : ' Punkte betreffen') + ' diese Ansicht ', h('button', { class: 'btn klein', onclick: () => gehe('auswertung', { reiter: 'offen' }) }, 'ansehen →')) : null);
}
// Zahl für die Marke am Reiter „Probleme“: harte Verstöße der Ansicht (rot), sonst die Zahl der weichen (grau)
function problemeZahl() {
  const { M, P, bewertung } = modell(), E = APP.editor, xi = ansichtIndex(M, E.art, E.id);
  const liste = bewertung.det.filter(x => detPasst(M, P, x, E.art, xi));
  return { hart: liste.filter(x => M.hart[RI[x.r]]).length, weich: liste.filter(x => !M.hart[RI[x.r]] && M.gew[RI[x.r]] > 0).length };
}
// Seitenleiste des Editors: drei Reiter – Details (Ressourcen des gewählten Blocks), Probleme, Zuordnen. Alle drei stehen im DOM,
// der Wechsel blendet nur um (kein Neuaufbau); ein Klick auf eine Kachel oder ein leeres Feld öffnet „Details“.
const EDITOR_TABS = [['details', 'Details', 'detail'], ['probleme', 'Probleme', 'warnung'], ['zuordnen', 'Zuordnen', 'hand']];
function editorLeiste(tab) {
  if (!EDITOR_TABS.some(t => t[0] === tab)) tab = 'details';
  APP.editor.leiste = tab;
  const sl = document.querySelector('.seitenleiste'); if (!sl) return;
  sl.classList.remove('zu'); APP.editor.leisteZu = false;
  sl.querySelectorAll('[data-sltab]').forEach(b => { const an = b.dataset.sltab === tab; b.classList.toggle('aktiv', an); b.setAttribute('aria-selected', an ? 'true' : 'false'); b.tabIndex = an ? 0 : -1; });
  sl.querySelectorAll('[data-slpanel]').forEach(p => { p.hidden = p.dataset.slpanel !== tab; });
}
function editorSeitenleiste() {
  const E = APP.editor, aktiv = EDITOR_TABS.some(t => t[0] === E.leiste) ? E.leiste : 'details';
  const pz = APP.daten.plan.platzierungen.length ? problemeZahl() : { hart: 0, weich: 0 };
  const tabs = h('div', { class: 'sl-tabs', role: 'tablist', 'aria-label': 'Seitenleiste des Editors',
    onkeydown: ev => { if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return; const i = EDITOR_TABS.findIndex(t => t[0] === APP.editor.leiste), n = EDITOR_TABS[(i + (ev.key === 'ArrowRight' ? 1 : EDITOR_TABS.length - 1)) % EDITOR_TABS.length][0]; ev.preventDefault(); ev.stopPropagation(); editorLeiste(n); const b = document.querySelector('.seitenleiste [data-sltab="' + n + '"]'); if (b) b.focus(); } },
    EDITOR_TABS.map(([k, t, sym]) => h('button', { class: 'sl-tab' + (aktiv === k ? ' aktiv' : ''), type: 'button', role: 'tab', id: 'sltab_' + k, 'data-sltab': k, 'aria-selected': aktiv === k ? 'true' : 'false', 'aria-controls': 'slpanel_' + k, tabindex: aktiv === k ? 0 : -1, onclick: () => editorLeiste(k) },
      icon(sym, 'k'), t, k === 'probleme' && (pz.hart || pz.weich) ? h('span', { class: 'badge ' + (pz.hart ? 'err' : 'neutral'), title: pz.hart + ' harte und ' + pz.weich + ' weiche Verstöße in dieser Ansicht' }, pz.hart || pz.weich) : null)),
    h('button', { class: 'btn icon klein sl-zu', type: 'button', 'aria-label': 'Leiste einklappen', title: 'Leiste einklappen', onclick: ev => { const sl = document.querySelector('.seitenleiste'); if (!sl) return; APP.editor.leisteZu = sl.classList.toggle('zu'); ev.currentTarget.setAttribute('aria-expanded', APP.editor.leisteZu ? 'false' : 'true'); } }, icon('unten')));
  const panel = (k, inhalt) => h('div', { class: 'sl-panel', role: 'tabpanel', id: 'slpanel_' + k, 'data-slpanel': k, 'aria-labelledby': 'sltab_' + k, hidden: aktiv !== k }, inhalt);
  // schmale Fenster: die Leiste ist ein Blatt am unteren Rand – anfangs eingeklappt, ein Klick auf eine Kachel oder einen Reiter öffnet es
  return h('aside', { class: 'seitenleiste' + (E.leisteZu !== false ? ' zu' : ''), 'aria-label': 'Details, Probleme und Zuordnen' }, tabs, panel('details', ressourcenBox()), panel('probleme', verstoesseBox()), panel('zuordnen', zuordnenBox()));
}
// „?“ der Werkzeugleiste: Tastatur und Legende
function editorLegende() {
  const taste = (t, text) => h('tr', {}, h('td', {}, t.split(' ').map(x => h('kbd', {}, x))), h('td', {}, text));
  const muster = (kl, text, sym) => h('div', { class: 'lgzeile' }, h('span', { class: 'lgk ' + kl }, sym ? icon(sym, 'k') : null), text);
  return [h('h4', {}, 'Tastatur'),
    h('table', { class: 'tasten' }, h('tbody', {}, taste('← ↑ → ↓', 'Kachel wählen'), taste('Enter', 'Details des Unterrichts öffnen'), taste('V', 'Verschieben nach …'), taste('L', 'Fixieren oder lösen'), taste('Entf', 'In die Ablage legen'), taste('Shift F10', 'Menü der Kachel'), taste('Strg Z', 'Rückgängig'), taste('Strg Y', 'Wiederholen'), taste('Strg K', 'Suchen und springen'))),
    h('h4', {}, 'Legende'),
    h('div', { class: 'lgliste' }, muster('hohl', 'Freistunde'), muster('schluss', 'nach Unterrichtsschluss (Aufgaben möglich)'), muster('gesperrt', 'gesperrt (Sperrzeit)'),
      muster('lfest', 'fixiert – wird nicht verschoben', 'schloss'), muster('lnn', 'ohne Lehrkraft (N. N.)', 'person'), muster('lkonf', 'Konflikt: verletzt eine Pflichtregel', 'warnung'), muster('lco', 'kursiv: Einsatz als Co-Lehrkraft')),
    h('p', { class: 'muted', style: { marginTop: '8px' } }, 'Ziehen verschiebt eine Stunde; die Felder zeigen dabei ✓ möglich, ~ mit Nachteilen, ✕ nicht möglich. Doppelklick öffnet den Unterricht, Rechtsklick das Menü.')];
}
// Overflow-Menü „⋯“ der Werkzeugleiste
function editorMenue(knopf) {
  const E = APP.editor, r = knopf.getBoundingClientRect(), dz = dichte();
  const { art, id } = planAnsicht('a');
  menueZeigen(r.right - 300, r.bottom + 6, [
    { titel: 'Ansicht' },
    { icon: E.parallel ? 'haken' : null, text: 'Parallelansicht (zwei Pläne nebeneinander)', tun: () => { E.parallel = !E.parallel; render(); } },
    abWochenAktiv() ? { text: 'Woche A | Woche B nebeneinander', tun: abNebeneinander } : null,
    { titel: 'Größe der Kacheln' },
    { icon: dz === 'kompakt' ? 'haken' : null, text: 'Kompakt', tun: () => dichteSetzen('kompakt') },
    { icon: dz === 'normal' ? 'haken' : null, text: 'Normal', tun: () => dichteSetzen('normal') },
    { icon: dz === 'gross' ? 'haken' : null, text: 'Groß', tun: () => dichteSetzen('gross') },
    '-',
    art !== 'raum' && id ? { icon: 'zahnrad', text: 'Nur diese ' + (art === 'klasse' ? 'Klasse' : 'Lehrkraft') + ' neu berechnen', aus: APP.rechnung.laeuft, tun: () => rechnungStart({ teilArt: art, teilId: id, startwert: 'aktuell' }) } : null,
    { icon: 'papierkorb', text: 'Plan verwerfen …', tun: async () => { if (await bestaetigen('Den ganzen Plan verwerfen? Alle Stunden kommen in die Ablage (rückgängig machbar mit Strg+Z).', 'Plan verwerfen', 'gefahr')) aendern('Plan verworfen', dd => { dd.plan.platzierungen = []; dd.plan.frei = []; dd.plan.besetzung = []; }); } }
  ]);
}
function detSprung(x) {
  if (x.e && x.e.length) { APP.editor.sel = x.e[0]; x.e.forEach(blitzKachel); const n = document.querySelector('.kachel[data-e="' + x.e[0] + '"]'); if (n) n.focus(); }
  if (x.s !== undefined) document.querySelectorAll('.zelle[data-slot="' + x.s + '"]').forEach(z => { z.classList.remove('blitz'); void z.offsetWidth; z.classList.add('blitz'); });
}
SEITEN_RENDER.editor = () => {
  const d = APP.daten, E = APP.editor;
  if (!d.unterrichte.length) return [seitenkopf('Plan-Editor', ''), h('div', { class: 'karte' }, leerZustand({ icon: 'kalender', titel: 'Noch kein Unterricht, der sich planen ließe', text: 'Der Editor zeigt den Wochenplan, sobald Klassen, Lehrkräfte und die Stundentafel angelegt sind. Die Übersicht nennt den nächsten Schritt.', aktion: { text: 'Zur Übersicht', tun: () => gehe('start') }, zweit: { text: 'Beispieldaten laden', tun: beispielLaden } }))];
  if (E.parallel && !E.id2 && E.art === 'klasse') { const kl = d.lehrer.find(l => l.klassenleitung === E.id); if (kl) { E.art2 = 'lehrer'; E.id2 = kl.id; } }
  // Werkzeugleiste: links die Ansichtswahl, rechts „Offene Punkte“, das Menü „⋯“ und „?“ (Tastatur und Legende)
  const werkzeuge = h('div', { class: 'editor-werkzeuge', role: 'toolbar', 'aria-label': 'Plan-Editor' },
    h('h1', { class: 'nurvorlesen' }, 'Plan-Editor'),
    planKopf('a'),
    h('div', { class: 'rechts' }),
    offenePunkteKnopf(''),
    h('button', { class: 'btn icon', id: 'editorMehr', type: 'button', 'aria-haspopup': 'menu', 'aria-label': 'Weitere Aktionen', title: 'Weitere Aktionen: Parallelansicht, Größe der Kacheln, Plan verwerfen', onclick: ev => editorMenue(ev.currentTarget) }, icon('mehr')),
    hilfe(editorLegende, { icon: 'hilfe', klasse: 'btn icon', label: 'Tastatur und Legende' }));
  const ohnePlan = !d.plan.platzierungen.length ? h('div', { class: 'karte', style: { marginBottom: '10px' } }, leerZustand({ klein: true, icon: 'kalender', titel: 'Noch kein Plan', text: 'Alle Stunden liegen in der Ablage unter dem Raster. „Plan berechnen“ legt sie automatisch; von Hand lassen sie sich aus der Ablage in den Plan ziehen.', aktion: { text: 'Plan berechnen', tun: () => { gehe('berechnung'); if (!APP.rechnung.laeuft) rechnungStart(); } } })) : null;
  const inhalt = h('div', { class: 'editor dichte-' + dichte() + (E.parallel ? ' parallel' : '') },
    h('div', { class: 'editor-haupt' }, h('div', { class: 'plaene' }, planBox('a'), E.parallel ? planBox('b', true) : null), ablageDock()),
    editorSeitenleiste());
  return [werkzeuge, ohnePlan, inhalt];
};
function editorTaste(ev) {
  if (APP.seite !== 'editor' || document.querySelector('dialog[open]') || $('#kontextmenue')) return false;
  const t = ev.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return false;
  const e = APP.editor.sel;
  const { M, P } = modell();
  if (e < 0 || e >= M.E.length) return false;
  const view = { art: APP.editor.art, id: APP.editor.id };
  if (ev.key === 'Delete' || ev.key === 'Backspace') { inAblage(e); return true; }
  if (ev.key === 'l' || ev.key === 'L') { fixierenUmschalten(e); return true; }
  if (ev.key === 'v' || ev.key === 'V') { verschiebenDialog(e, view); return true; }
  if (ev.key === 'Enter') { unterrichtDialog(M.U[M.E[e].parts[0].u].id); return true; }
  if (ev.key === 'ContextMenu' || (ev.key === 'F10' && ev.shiftKey)) { const n = document.querySelector('.kachel[data-e="' + e + '"]'); const r = n ? n.getBoundingClientRect() : { left: 200, bottom: 200 }; kachelMenue(e, r.left + 10, r.bottom, view); return true; }
  if (ev.key.startsWith('Arrow')) {
    const tiles = [...document.querySelectorAll('.plangrid[data-rolle="a"] .kachel')].map(n => ({ n, e: Number(n.dataset.e) })).map(o => Object.assign(o, { s: P.start[o.e], d: Math.floor(P.start[o.e] / M.H), h: P.start[o.e] % M.H }));
    if (!tiles.length) return false;
    const cur = tiles.find(o => o.e === e) || tiles[0];
    let kand = [];
    if (ev.key === 'ArrowDown') kand = tiles.filter(o => o.d === cur.d && o.h > cur.h).sort((a, b) => a.h - b.h);
    if (ev.key === 'ArrowUp') kand = tiles.filter(o => o.d === cur.d && o.h < cur.h).sort((a, b) => b.h - a.h);
    if (ev.key === 'ArrowRight') kand = tiles.filter(o => o.d > cur.d).sort((a, b) => (a.d - b.d) || Math.abs(a.h - cur.h) - Math.abs(b.h - cur.h));
    if (ev.key === 'ArrowLeft') kand = tiles.filter(o => o.d < cur.d).sort((a, b) => (b.d - a.d) || Math.abs(a.h - cur.h) - Math.abs(b.h - cur.h));
    const z = kand[0] || cur;
    APP.editor.sel = z.e; z.n.focus();
    document.querySelectorAll('.kachel.ausgewaehlt').forEach(n => n.classList.remove('ausgewaehlt')); z.n.classList.add('ausgewaehlt');
    return true;
  }
  return false;
}

/* ---------------- Diagnose & Auswertung ---------------- */
function editorZeigen(art, id, e) { APP.editor.art = art; APP.editor.id = id; if (e !== undefined) APP.editor.sel = e; gehe('editor'); if (e !== undefined) requestAnimationFrame(() => blitzKachel(e)); }
function detZumEditor(M, x) {
  if (x.e && x.e.length) { const ev = M.E[x.e[0]]; if (ev.klassen.length) return editorZeigen('klasse', M.data.klassen[ev.klassen[0]].id, x.e[0]); }
  if (x.k && x.k.length) return editorZeigen('klasse', M.data.klassen[x.k[0]].id);
  if (x.l && x.l.length) return editorZeigen('lehrer', M.data.lehrer[x.l[0]].id);
  if (x.raum !== undefined) return editorZeigen('raum', M.data.raeume[x.raum].id);
  gehe('editor');
}
SEITEN_RENDER.auswertung = () => {
  const d = APP.daten;
  const aTabs = [['offen', 'Offene Punkte', (() => { const n = offenePunkteZahl(); return n ? h('span', { class: 'badge warn' }, n) : null; })()], ['regeln', 'Regelverstöße'], ['auslastung', 'Auslastung']].concat(expertenModus() ? [['selbsttest', 'Selbsttest']] : []);
  const aAktiv = reiterAktiv('auswertung', aTabs);
  const aKopf = seitenkopf('Auswertung', 'Was noch offen ist, welche Regeln der Plan verletzt und wie Räume, Lehrkräfte und Klassen ausgelastet sind.', h('button', { class: 'btn', onclick: () => gehe('arbeitszeit') }, 'Arbeitszeit & Deputat →'));
  if (aAktiv === 'selbsttest') return [aKopf, reiterLeiste('auswertung', aTabs), h('div', { class: 'reiterinhalt' }, selbsttestInhalt())];
  if (aAktiv === 'offen' && !d.plan.platzierungen.length) return [aKopf, reiterLeiste('auswertung', aTabs), h('div', { class: 'reiterinhalt' }, h('div', { class: 'karte', id: 'ampelkarte' }, leerZustand({ icon: 'diagramm', titel: 'Noch kein Plan berechnet', text: 'Hier steht nach der Berechnung, ob alle Pflichtbedingungen erfüllt sind und was von Hand noch zu klären ist.', aktion: { text: 'Plan berechnen', tun: () => { gehe('berechnung'); if (!APP.rechnung.laeuft) rechnungStart(); } } })))];
  if (aAktiv === 'offen') return [aKopf, reiterLeiste('auswertung', aTabs), h('div', { class: 'reiterinhalt' }, ampelKarte(), h('div', { class: 'abstand' }), h('div', { class: 'karte' }, h('h2', { style: { marginTop: 0 } }, 'Offene Punkte'), offenePunkteInhalt(false, null).el))];
  if (!d.plan.platzierungen.length) return [aKopf, reiterLeiste('auswertung', aTabs), h('div', { class: 'karte' }, leerZustand({ icon: 'diagramm', titel: 'Noch kein Plan vorhanden', text: 'Regelverstöße und Auslastung lassen sich auswerten, sobald ein Plan berechnet ist.', aktion: { text: 'Plan berechnen', tun: () => { gehe('berechnung'); if (!APP.rechnung.laeuft) rechnungStart(); } } }))];
  const { M, P, bewertung } = modell();
  const A = APP.auswertung;
  const regelnZeilen = REGELN.map((r, i) => ({ r, i, v: bewertung.tot[i], hart: !!M.hart[i], g: M.gew[i] })).filter(x => A.filter === 'alle' || (A.filter === 'hart' ? x.hart : !x.hart));
  const tab = h('table', { class: 'tab' }, h('thead', {}, h('tr', {}, ['Regel', 'Art', 'Wichtigkeit', 'Verstöße', 'Strafpunkte', ''].map((t, i) => h('th', { class: i >= 2 && i <= 4 ? 'zahl' : '' }, t)))),
    h('tbody', {}, regelnZeilen.map(x => {
      const offen = A.offen === x.r.id;
      const zeilen = [h('tr', { style: { cursor: 'pointer' }, title: x.r.text, onclick: () => { A.offen = offen ? null : x.r.id; render(); } },
        h('td', {}, h('b', {}, x.r.name)),
        h('td', {}, x.hart ? 'Pflicht' : 'Wunsch'), h('td', { class: 'zahl' }, x.hart ? '–' : zahlDe(x.g, 1)),
        h('td', { class: 'zahl' }, x.v > 0 ? h('span', { class: 'badge ' + (x.hart ? 'err' : 'neutral') }, zahlDe(x.v, 1)) : '0'),
        h('td', { class: 'zahl' }, x.hart ? '' : zahlDe(x.v * x.g, 1)), h('td', {}, x.v > 0 ? (offen ? '▲' : '▼') : ''))];
      if (offen) {
        const liste = bewertung.det.filter(y => y.r === x.r.id);
        zeilen.push(h('tr', {}, h('td', { colspan: 6 }, h('ul', { class: 'vliste' }, liste.slice(0, 300).map(y => h('li', { onclick: () => detZumEditor(M, y) }, h('span', { class: 'sym ' + (x.hart ? 'h' : 'w') }, x.hart ? '✕' : '~'), h('span', {}, y.text), h('span', { class: 'rechts muted' }, '→ Editor')))), liste.length > 300 ? h('p', { class: 'muted klein' }, '… und ' + (liste.length - 300) + ' weitere') : null)));
      }
      return zeilen;
    })));
  // Raumauslastung
  const raeume = d.raeume.map((r, ri) => { let n = 0, verf = 0; for (let s = 0; s < M.S; s++) { if (!M.slotOk[s]) continue; if (M.rVerf[ri * M.S + s] !== 0) verf += M.rTeil[ri]; } for (const e of M.rNutzer[ri]) { const s0 = P.start[e]; if (s0 < 0) continue; M.E[e].parts.forEach((p, pi) => { if (P.raum[P.rOff[e] + pi] === ri) n += M.E[e].dur; }); } return { r, n, verf, q: verf ? n / verf : 0 }; }).sort((a, b) => b.q - a.q);
  const raumKarte = h('div', { class: 'karte' }, h('h2', { style: { marginTop: 0 } }, 'Raumauslastung'), h('table', { class: 'tab' }, h('thead', {}, h('tr', {}, ['Raum', 'Typ', 'belegt / verfügbar', 'Auslastung'].map(t => h('th', {}, t)))),
    h('tbody', {}, raeume.map(x => h('tr', { style: { cursor: 'pointer' }, onclick: () => editorZeigen('raum', x.r.id) }, h('td', {}, x.r.name), h('td', {}, x.r.typ), h('td', { class: 'zahl' }, x.n + ' / ' + x.verf), h('td', {}, h('div', { class: 'zeile eng' }, h('div', { class: 'balken', style: { width: '160px' } }, h('div', { style: { width: Math.min(100, Math.round(x.q * 100)) + '%' } })), Math.round(x.q * 100) + ' %')))))));
  // Freistunden je Lehrkraft und Tagesverteilung je Klasse
  const hohl = d.lehrer.map((l, t) => { bauL(M, P, t); let g = 0, std = 0; for (let dd = 0; dd < M.D; dd++) { std += P.L.n[dd]; if (P.L.n[dd] >= 2) for (let hh = P.L.a[dd] + 1; hh < P.L.z[dd]; hh++) if (!M.pause[hh] && !P.L.belegt[dd * M.H + hh]) g++; } return { l, g, std, tage: Array.from(P.L.n) }; }).sort((a, b) => b.g - a.g);
  const hohlKarte = h('div', { class: 'karte' }, h('h2', { style: { marginTop: 0 } }, 'Freistunden je Lehrkraft'), h('table', { class: 'tab' }, h('thead', {}, h('tr', {}, h('th', {}, 'Lehrkraft'), h('th', { class: 'zahl' }, 'Freistunden'), h('th', { class: 'zahl' }, 'UStd.'), d.schule.tage.map(t => h('th', { class: 'zahl' }, t)))),
    h('tbody', {}, hohl.map(x => h('tr', { style: { cursor: 'pointer' }, onclick: () => editorZeigen('lehrer', x.l.id) }, h('td', {}, x.l.kuerzel + ' – ' + x.l.name), h('td', { class: 'zahl' }, x.g ? h('span', { class: 'badge ' + (x.g > 3 ? 'warn' : 'neutral') }, x.g) : '0'), h('td', { class: 'zahl' }, x.std), x.tage.map(n => h('td', { class: 'zahl' }, n)))))));
  const blA = bloeckeAlle(d);
  const vert = d.klassen.map((k, c) => { bauK(M, P, c); return { k, tage: Array.from(P.K.n), soll: schuelerWochenstunden(d, k.id, null, 'tafel'), plan: schuelerWochenstunden(d, k.id, null, 'plan', { bl: blA }) }; });
  const vertKarte = h('div', { class: 'karte' }, h('h2', { style: { marginTop: 0 } }, 'Unterrichtsstunden (UStd.) je Klasse'), h('table', { class: 'tab' }, h('thead', {}, h('tr', {}, h('th', {}, 'Klasse'), d.schule.tage.map(t => h('th', { class: 'zahl', title: 'belegte Stunden an diesem Tag' }, t)), h('th', { class: 'zahl', title: 'belegte Stunden im Wochenraster (eine Stunde, die nur in Woche A oder B belegt ist, zählt hier als belegt)' }, 'belegt'), h('th', { class: 'zahl', title: 'durchschnittliche UStd. je Woche eines Schülers laut Plan: Halbgruppen zählen einmal, A-/B-Wochen halb' }, 'je Schüler'), h('th', { class: 'zahl', title: 'Soll laut Stundentafel' }, 'Stundentafel'))),
    h('tbody', {}, vert.map(x => h('tr', { style: { cursor: 'pointer' }, onclick: () => editorZeigen('klasse', x.k.id) }, h('td', {}, x.k.name), x.tage.map(n => h('td', { class: 'zahl' }, n)), h('td', { class: 'zahl' }, x.tage.reduce((a, b) => a + b, 0)), h('td', { class: 'zahl' }, h('span', { class: 'badge ' + (Math.abs(x.plan - x.soll) < 1e-9 ? 'ok' : 'err') }, zahlDe(x.plan, 1))), h('td', { class: 'zahl' }, zahlDe(x.soll, 1)))))));
  if (aAktiv === 'auslastung') return [aKopf, reiterLeiste('auswertung', aTabs), h('div', { class: 'reiterinhalt' }, h('div', { class: 'zwei' }, raumKarte, hohlKarte), h('div', { class: 'abstand' }), vertKarte)];
  return [
    aKopf, reiterLeiste('auswertung', aTabs),
    h('div', { class: 'karte' }, h('div', { class: 'zeile' }, h('h2', { style: { margin: 0 } }, 'Regeln'), h('span', { class: 'muted klein' }, 'Ein Klick auf eine Zeile listet die Verstöße einzeln, mit Sprung in den Editor.'),
      hartEnd() ? h('span', { class: 'badge err', title: 'Endvalidierung des Gesamtplans' }, '✕ ' + hartText(hartEnd())) : h('span', { class: 'badge ok', title: 'Endvalidierung des Gesamtplans' }, '✓ 0 harte Fehler'), h('span', { class: 'badge neutral', title: 'Verstöße gegen die Pflichtregeln des Stundenplans (Teil der Endvalidierung)' }, 'davon Regelverstöße: ' + bewertung.k.hart), h('span', { class: 'badge neutral' }, zahlDe(bewertung.k.weich, 1) + ' Strafpunkte'),
      h('div', { class: 'rechts zeile eng' }, ['alle', 'hart', 'weich'].map(f => h('button', { class: 'btn klein' + (A.filter === f ? ' aktiv' : ''), 'aria-pressed': A.filter === f ? 'true' : 'false', onclick: () => { A.filter = f; render(); } }, f === 'alle' ? 'Alle' : f === 'hart' ? 'Pflicht' : 'Wünsche')))), h('div', { class: 'abstand' }), tab)
  ];
};

