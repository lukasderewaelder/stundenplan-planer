// ---------- Befehlspalette (Strg+K): suchen und springen ----------
// Ein Suchfeld über Seiten, Klassen, Lehrkräfte, Räume und Aktionen. Enter springt: Klasse/Lehrkraft/Raum → ihr Plan im Editor
// (ohne Plan zu den Stammdaten), Seite → gehe(), Aktion → wird ausgeführt. Umschalt+Enter öffnet statt des Plans die Stammdaten.
function paletteEintraege() {
  const d = APP.daten, hatPlan = d.plan.platzierungen.length > 0, out = [];
  const seite = (id, titel, sym, zusatz, tun) => out.push({ art: 'Seite', text: titel, icon: sym, such: titel + ' ' + (zusatz || ''), tun: tun || (() => gehe(id)) });
  SEITEN.forEach(x => seite(x.id, x.titel, x.symbol, bereichVon(x.id).titel || ''));
  seite('stundentafeln', 'Stundentafeln', 'tabelle', 'Wochenstunden Klassen Fächer');
  seite('zeitprofile', 'Zeitprofile', 'uhr', 'Unterrichtszeiten Klassen');
  seite('mitarbeitende', 'Einsätze & Anwesenheit', 'person', 'Einsatzübersicht Früh Spät Springer Anwesenheit Lücken Arbeitszeit');
  seite('offen', 'Offene Punkte', 'warnung', 'Probleme Konflikte Auswertung');
  if (expertenModus()) seite('selbsttest', 'Selbsttest', 'pruefung', 'Programm prüfen');
  seite('regeln', 'Regeln für Aufsichten', 'regler', 'Wichtigkeit Gewichte', () => gehe('regeln', { reiter: 'dienste' }));
  const aktion = (text, sym, tun, such) => out.push({ art: 'Aktion', text, icon: sym, such: text + ' ' + (such || ''), tun });
  aktion('Plan berechnen', 'start', () => { gehe('berechnung'); if (!APP.rechnung.laeuft) rechnungStart(); }, 'starten rechnen optimieren');
  aktion('Projekt exportieren', 'herunterladen', () => exportJson(false), 'speichern Datei JSON sichern');
  aktion('Projekt importieren …', 'ordner', importDialog, 'laden öffnen Datei JSON');
  aktion('Pläne drucken / als PDF', 'drucker', () => gehe('ausgabe'), 'Druck Export PDF');
  aktion('Gesamtplan drucken / als PDF', 'drucker', () => { APP.meta.druck = Object.assign(druckOpt(), { art: 'gesamtplan', auswahl: 'alle' }); metaSpeichern(); gehe('ausgabe'); }, 'Gesamtplan Tag Personen Übersicht alle Lehrkräfte Aufsichten PDF');
  aktion('Rückgängig', 'rueckgaengig', rueckgaengig, 'undo zurück');
  aktion('Wiederholen', 'wiederholen', wiederholen, 'redo');
  aktion('Einstellungen …', 'zahnrad', einstellungenDialog, 'Farbschema dunkel hell Expertenmodus Dichte');
  aktion(expertenModus() ? 'Expertenmodus ausschalten' : 'Expertenmodus einschalten', 'regler', () => { APP.meta.experte = !expertenModus(); metaSpeichern(); navBauen(); render(); }, 'Zusatzreiter Unterrichtsversorgung Regeln Selbsttest');
  aktion('Hilfe und Datenschutz', 'hilfe', infoDialog, 'Anleitung Tastatur');
  aktion('Beispieldaten laden', 'stern', beispielLaden, 'Beispiel Demo');
  const ziel = (art, sym, o, text, unter, such, planArt, stammSeite) => out.push({ art, text, unter: unter + (hatPlan ? '' : ' · Stammdaten'), icon: sym, such, kurz: (o.kuerzel || o.name || '').toLowerCase(),
    tun: () => { if (hatPlan) editorZeigen(planArt, o.id); else springeZu({ seite: stammSeite, id: o.id }); }, tun2: () => springeZu({ seite: stammSeite, id: o.id }) });
  klassenAlphabetisch(d.klassen).forEach(k => ziel('Klasse', 'gruppe', k, 'Klasse ' + k.name, 'Jahrgang ' + k.jahrgang, k.name + ' Klasse ' + k.name + ' Jahrgang ' + k.jahrgang, 'klasse', 'klassen'));
  lehrerAlphabetisch(d.lehrer).forEach(l => ziel(l.art === 'personal' ? 'Personal' : l.ausgebildet === false ? 'Co-Kraft' : 'Lehrkraft', 'person', l, (l.name || l.kuerzel || '?') + (l.kuerzel && l.name ? ' (' + l.kuerzel + ')' : ''), artText(l), (l.kuerzel || '') + ' ' + (l.name || ''), 'lehrer', 'lehrer'));
  raeumeAlphabetisch(d.raeume).forEach(r => ziel('Raum', 'tuer', r, 'Raum ' + r.name, r.typ || '', r.name + ' Raum ' + r.name + ' ' + (r.typ || ''), 'raum', 'raeume'));
  return out;
}
function paletteOeffnen() {
  if ($('#palette')) return;
  hilfeSchliessen(); menueSchliessen();
  const zurueck = document.activeElement;
  const alle = paletteEintraege().map(e => Object.assign(e, { s: e.such.toLowerCase() }));
  let sicht = [], aktiv = 0;
  const liste = h('ul', { class: 'pliste', id: 'paletteListe', role: 'listbox', 'aria-label': 'Treffer' });
  const feld = h('input', { type: 'text', id: 'paletteFeld', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'paletteListe', 'aria-autocomplete': 'list', autocomplete: 'off', spellcheck: 'false', placeholder: 'Seite, Klasse, Lehrkraft, Raum oder Aktion …', 'aria-label': 'Suchen und springen' });
  const dlg = h('dialog', { id: 'palette', class: 'palette-dlg', 'aria-label': 'Suchen und springen' },
    h('div', { class: 'dkopf' }, icon('lupe'), feld, h('kbd', {}, 'Esc')),
    h('div', { class: 'dinhalt' }, liste),
    h('div', { class: 'dfuss' }, h('span', {}, h('kbd', {}, '↑'), h('kbd', {}, '↓'), 'wählen'), h('span', {}, h('kbd', {}, 'Enter'), 'öffnen'), h('span', {}, h('kbd', {}, 'Umschalt'), h('kbd', {}, 'Enter'), 'Stammdaten statt Plan')));
  const zu = () => { dlg.close(); dlg.remove(); };
  const los = (e, zweit) => { zu(); if (zurueck && zurueck.isConnected && zurueck.focus) zurueck.focus({ preventScroll: true }); (zweit && e.tun2 ? e.tun2 : e.tun)(); };
  const rang = (e, q, teile) => {
    if (!teile.every(t => e.s.includes(t))) return -1;
    const text = e.text.toLowerCase();
    let r = e.kurz === q ? 100 : text === q ? 95 : (e.kurz && e.kurz.startsWith(q)) ? 80 : text.startsWith(q) ? 70 : new RegExp('(^|[\\s(/-])' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(e.s) ? 50 : 20;
    if (e.art === 'Klasse') r += 3; else if (e.art === 'Seite') r += 1;
    return r;
  };
  const zeichne = () => {
    const q = feld.value.trim().toLowerCase(), teile = q.split(/\s+/).filter(Boolean);
    sicht = q ? alle.map(e => ({ e, r: rang(e, q, teile) })).filter(x => x.r >= 0).sort((a, b) => b.r - a.r).slice(0, 40).map(x => x.e) : alle.filter(e => e.art === 'Seite' || e.art === 'Aktion').slice(0, 40);
    if (aktiv >= sicht.length) aktiv = 0;
    leeren(liste);
    sicht.forEach((e, i) => liste.append(h('li', { class: 'palzeile' + (i === aktiv ? ' aktiv' : ''), role: 'option', id: 'pal_' + i, 'aria-selected': i === aktiv ? 'true' : 'false', onmousemove: () => { if (aktiv !== i) { aktiv = i; markiere(); } }, onclick: ev => los(e, ev.shiftKey) },
      h('span', { class: 'psym' }, icon(e.icon || 'pfeil-rechts')), h('span', { class: 'ptext' }, e.text, e.unter ? h('span', { class: 'punter' }, e.unter) : null), h('span', { class: 'part' }, e.art))));
    if (!sicht.length) liste.append(h('li', { class: 'pleer muted' }, 'Nichts gefunden für „' + feld.value.trim() + '“.'));
    feld.setAttribute('aria-activedescendant', sicht.length ? 'pal_' + aktiv : '');
  };
  const markiere = () => { [...liste.children].forEach((li, i) => { li.classList.toggle('aktiv', i === aktiv); li.setAttribute('aria-selected', i === aktiv ? 'true' : 'false'); }); feld.setAttribute('aria-activedescendant', sicht.length ? 'pal_' + aktiv : ''); const a = liste.children[aktiv]; if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest' }); };
  feld.addEventListener('input', () => { aktiv = 0; zeichne(); });
  feld.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); if (sicht.length) { aktiv = (aktiv + 1) % sicht.length; markiere(); } }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (sicht.length) { aktiv = (aktiv - 1 + sicht.length) % sicht.length; markiere(); } }
    else if (ev.key === 'Enter') { ev.preventDefault(); if (sicht[aktiv]) los(sicht[aktiv], ev.shiftKey); }
  });
  dlg.addEventListener('cancel', ev => { ev.preventDefault(); zu(); if (zurueck && zurueck.isConnected && zurueck.focus) zurueck.focus({ preventScroll: true }); });
  dlg.addEventListener('click', ev => { if (ev.target === dlg) { zu(); } }); // Klick auf den Schleier schließt
  document.body.append(dlg);
  zeichne();
  dlg.showModal();
  feld.focus();
}
// Strg+K (auf dem Mac auch Cmd+K) öffnet die Palette von überall – auch aus einem Textfeld heraus
document.addEventListener('keydown', ev => {
  if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && !ev.shiftKey && ev.key.toLowerCase() === 'k') {
    ev.preventDefault();
    if ($('#palette')) return;
    if (document.querySelector('dialog[open]')) return; // über einem offenen Dialog nicht
    paletteOeffnen();
  }
}, true);

// ---------- Startseite „Übersicht“ ----------
// Stand der sieben Bereiche, abgeleitet aus den Daten, der Vorprüfung (machbarkeit) und der Plan-Ampel.
// status: 'fertig' | 'offen' | 'leer'; schwer = offen mit Fehlern (rot statt gelb)
function startStand() {
  const d = APP.daten, S = d.schule, DN = d.dienste || {};
  const pl = (n, e, m) => n + ' ' + (n === 1 ? e : m);
  const nL = d.lehrer.length, nK = d.klassen.length, nF = d.faecher.length, nR = d.raeume.length;
  const nU = d.unterrichte.filter(u => !u.aufgabe).length;
  const lekt = S.stunden.filter(x => !x.istPause).length;
  const f = machFehler().length, w = APP.mach.filter(x => x.stufe === 'warnung').length;
  const plan = d.plan.platzierungen.length > 0;
  let st = { ampel: 'leer', pflicht: [], hinweise: [] }, nOffen = 0, nHart = 0;
  if (plan) { try { st = planAmpel(); nOffen = offenePunkteZahl(); nHart = hartEnd(); } catch (err) { console.error(err); } }
  const nBed = (DN.bedarfe || []).length, nEin = (DN.plan || []).length;
  const akzS = (DN.offen || []).length ? akzeptiertBezug() : null, offMin = plan || (DN.plan || []).some(x => x.quelle === 'auto') ? (DN.offen || []).filter(o => o.prio === 'min' && !aufsichtAkzeptiert(akzS, o)).length : 0;
  const hatDaten = !!(nL || nK || nF || nR || d.unterrichte.length);
  const co = d.lehrer.filter(l => l.art !== 'personal' && l.ausgebildet === false).length, pers = d.lehrer.filter(l => l.art === 'personal').length;
  const schritte = [
    { id: 'schule', ziel: !nF ? 'faecher' : !nR ? 'raeume' : 'schule', status: nF && nR ? 'fertig' : hatDaten || nF || nR ? 'offen' : 'leer',
      text: [pl(S.tage.length, 'Unterrichtstag', 'Unterrichtstage'), pl(lekt, 'UStd.', 'UStd.') + ' je Tag', nF ? pl(nF, 'Fach', 'Fächer') : 'noch keine Fächer', nR ? pl(nR, 'Raum', 'Räume') : 'noch keine Räume'].join(' · ') },
    { id: 'lehrer', ziel: 'lehrer', status: nL ? 'fertig' : 'leer',
      text: nL ? pl(nL - co - pers, 'Lehrkraft', 'Lehrkräfte') + (co ? ', ' + pl(co, 'Co-Kraft', 'Co-Kräfte') : '') + (pers ? ', ' + pers + ' weiteres Personal' : '') + ' angelegt' : 'Noch niemand angelegt' },
    { id: 'klassen', ziel: nK && !nU ? 'stundentafeln' : 'klassen', status: !nK ? 'leer' : nU ? 'fertig' : 'offen',
      text: !nK ? 'Noch keine Klassen angelegt' : pl(nK, 'Klasse', 'Klassen') + ' angelegt · ' + (nU ? pl(nU, 'Unterricht', 'Unterrichte') + ' aus der Stundentafel' : 'Stundentafel noch leer') },
    { id: 'pausen', ziel: 'aufsicht', status: !nBed && !nEin ? 'leer' : offMin ? 'offen' : 'fertig', schwer: offMin > 0, optional: !nBed && !nEin,
      text: !nBed && !nEin ? 'Optional – noch kein Aufsichtsbedarf eingetragen' : offMin ? pl(offMin, 'Aufsicht', 'Aufsichten') + ' unter dem Mindestbedarf unbesetzt' : pl(nBed, 'Bedarf', 'Bedarfe') + ' · ' + pl(nEin, 'Einsatz', 'Einsätze') + ' geplant' },
    { id: 'pruefung', ziel: 'pruefung', status: !nU ? 'leer' : f ? 'offen' : 'fertig', schwer: f > 0,
      text: !nU ? 'Prüft die Daten, sobald Unterricht angelegt ist' : f ? pl(f, 'Fehler', 'Fehler') + ' blockieren die Berechnung' + (w ? ' · ' + pl(w, 'Warnung', 'Warnungen') : '') : '0 Fehler' + (w ? ' · ' + pl(w, 'Warnung', 'Warnungen') : ' – alles bereit') },
    { id: 'berechnung', ziel: 'berechnung', status: plan ? 'fertig' : nU && !f ? 'offen' : 'leer',
      text: APP.rechnung.laeuft ? 'Berechnung läuft …' : plan ? pl(d.plan.platzierungen.length, 'Block', 'Blöcke') + ' im Plan' : nU && !f ? 'Bereit – noch kein Plan berechnet' : 'Noch kein Plan berechnet' },
    { id: 'editor', ziel: st.ampel === 'rot' || nOffen ? 'offen' : 'editor', status: !plan ? 'leer' : st.ampel === 'rot' || nOffen ? 'offen' : 'fertig', schwer: st.ampel === 'rot',
      text: !plan ? 'Sobald ein Plan berechnet ist' : st.ampel === 'rot' ? pl(nHart || nOffen || 1, 'Problem', 'Probleme') + ' im Plan' : nOffen ? pl(nOffen, 'offener Punkt', 'offene Punkte') : (st.ampel === 'gelb' ? 'Plan vollständig' : 'Plan in Ordnung') + ' – bereit für Druck und Export' }
  ];
  return { schritte, hatDaten, plan, st, nOffen, nHart, f, w, nF, nR, nL, nK, nU };
}
// Der nächste sinnvolle Schritt: der erste nicht erledigte Bereich in der Reihenfolge der Arbeit
function startNaechster(z) {
  const R = APP.rechnung;
  if (R.laeuft) return { titel: 'Die Berechnung läuft', text: 'Der Plan wird gerade berechnet. Der Fortschritt steht auf der Seite „Plan berechnen“; das Ergebnis wird automatisch übernommen.', knopf: 'Fortschritt ansehen', tun: () => gehe('berechnung') };
  if (!z.nF) return { titel: 'Fächer anlegen', text: 'Jedes Fach bekommt Kürzel, Farbe und – wenn nötig – einen Raumtyp. Die üblichen Fächer lassen sich mit einem Klick übernehmen. Das Zeitraster der Schule steht schon mit Standardwerten bereit und lässt sich unter „Schule & Zeiten“ anpassen.', knopf: 'Fächer anlegen', tun: () => gehe('faecher'), zweit: ['Zeitraster ansehen', () => gehe('schule')] };
  if (!z.nR) return { titel: 'Räume anlegen', text: 'Klassenräume, Fachräume und Hallen mit Typ und Platzzahl – die Berechnung legt jeden Unterricht in einen passenden Raum.', knopf: 'Räume anlegen', tun: () => gehe('raeume') };
  if (!z.nL) return { titel: 'Mitarbeitende anlegen', text: 'Lehrkräfte, Co-Kräfte und weiteres Personal mit Fächern, Wochenarbeitszeit und Verfügbarkeit. Eine Liste aus Excel lässt sich direkt einfügen.', knopf: 'Mitarbeitende anlegen', tun: () => gehe('lehrer') };
  if (!z.nK) return { titel: 'Klassen anlegen', text: 'Klassen mit Jahrgang, Schülerzahl und Klassenraum – mehrere auf einmal über ein Muster wie „5a–5d“.', knopf: 'Klassen anlegen', tun: () => gehe('klassen') };
  if (!z.nU) return { titel: 'Stundentafel ausfüllen', text: 'Die Stundentafel nennt die Wochenstunden je Fach für jede Klasse. Daraus erzeugt das Programm den Unterricht von selbst.', knopf: 'Zur Stundentafel', tun: () => gehe('stundentafeln') };
  if (z.f) return { titel: (z.f === 1 ? '1 Fehler' : z.f + ' Fehler') + ' in den Daten beheben', text: 'Die Vorprüfung hat Fehler gefunden, mit denen sich kein Plan berechnen lässt. Jede Meldung führt mit einem Klick zur betroffenen Stelle.', knopf: 'Fehler ansehen', tun: () => gehe('pruefung'), art: 'err' };
  if (!z.plan) return { titel: 'Plan berechnen', text: 'Die Daten sind bereit' + (z.w ? ' (' + z.w + (z.w === 1 ? ' Warnung' : ' Warnungen') + ' – sie blockieren nicht)' : '') + '. Die Berechnung legt Unterricht, Lehrkräfte, Räume, Co-Lehrkräfte und Aufsichten in einem Durchgang fest.', knopf: 'Plan berechnen', tun: () => { gehe('berechnung'); if (!APP.rechnung.laeuft) rechnungStart(); }, zweit: z.w ? ['Warnungen ansehen', () => gehe('pruefung')] : null };
  if (z.st.ampel === 'rot' || z.nOffen) { const n = z.st.ampel === 'rot' ? (z.nHart || z.nOffen || 1) : z.nOffen; return { titel: n + (z.st.ampel === 'rot' ? (n === 1 ? ' Problem' : ' Probleme') : (n === 1 ? ' offenen Punkt' : ' offene Punkte')) + ' klären', text: z.st.ampel === 'rot' ? 'Der Plan verletzt noch mindestens eine Pflichtbedingung. Die Liste der offenen Punkte führt jeweils direkt zur betroffenen Stunde.' : 'Der Plan ist vollständig. Einzelne Punkte lassen sich im Editor von Hand noch verbessern.', knopf: 'Offene Punkte ansehen', tun: () => gehe('auswertung', { reiter: 'offen' }), zweit: ['Plan im Editor öffnen', () => gehe('editor')], art: z.st.ampel === 'rot' ? 'err' : '' }; }
  return { titel: 'Pläne drucken und weitergeben', text: (z.st.ampel === 'gelb' ? 'Der Plan ist vollständig; einzelne Wünsche sind noch nicht erfüllt (siehe Plan-Ampel).' : 'Der Plan ist in Ordnung.') + ' Klassen-, Lehrer- und Raumpläne lassen sich drucken, als PDF speichern oder als Datei weitergeben.', knopf: 'Zu Druck & Export', tun: () => gehe('ausgabe'), zweit: ['Plan im Editor ansehen', () => gehe('editor')], art: 'ok' };
}
SEITEN_RENDER.start = () => {
  const d = APP.daten, z = startStand();
  const lokal = h('p', { class: 'startlokal muted klein' }, icon('schloss', 'k'), 'Alle Daten bleiben lokal in diesem Browser – es wird nichts an einen Server gesendet.');
  // Ohne Daten: Auswahl, womit es losgehen soll
  if (!z.hatDaten) {
    const wahl = (sym, titel, text, knopf, tun, primaer) => h('div', { class: 'karte startwahl' + (primaer ? ' haupt' : '') }, h('span', { class: 'swsym' }, icon(sym)), h('h2', {}, titel), h('p', { class: 'muted' }, text),
      h('button', { class: 'btn' + (primaer ? ' primaer' : ''), onclick: tun }, knopf));
    return [
      h('div', { class: 'starthero' }, h('h1', {}, 'Willkommen beim Stundenplaner'),
        h('p', {}, 'Dieses Werkzeug erzeugt einen Wochenstundenplan, lässt ihn von Hand nachbearbeiten und gibt ihn druckfertig aus. Es läuft vollständig offline in dieser einen Datei. Womit soll es losgehen?')),
      h('div', { class: 'startwahlen' },
        wahl('kompass', 'Neu einrichten', 'In sieben Schritten von den Unterrichtszeiten bis zum fertigen Plan – die Übersicht zeigt jederzeit den nächsten Schritt.', 'Einrichtung starten', () => gehe('schule'), true),
        wahl('stern', 'Beispieldaten ansehen', 'Eine fertige Beispielschule mit zwölf Klassen zum Ausprobieren – lässt sich jederzeit wieder ersetzen.', 'Beispieldaten laden', beispielLaden),
        wahl('ordner', 'Projekt importieren', 'Eine früher exportierte Projektdatei (JSON) öffnen und dort weiterarbeiten.', 'Projektdatei wählen …', importDialog)),
      lokal
    ];
  }
  const nx = startNaechster(z);
  const SYM = { fertig: () => icon('haken'), offen: (i, s) => s.schwer ? '!' : String(i + 1), leer: i => String(i + 1) };
  const WORT = s => s.status === 'fertig' ? 'fertig' : s.status === 'offen' ? (s.schwer ? 'Fehler' : 'offen') : s.optional ? 'optional' : 'leer';
  const bereiche = BEREICHE.filter(b => !b.start);
  const stepper = h('ol', { class: 'stepper', 'aria-label': 'Stand der sieben Schritte' }, z.schritte.map((s, i) => { const b = bereiche.find(x => x.id === s.id) || bereiche[i];
    return h('li', {}, h('button', { class: 'schritt ' + s.status + (s.schwer ? ' schwer' : ''), type: 'button', onclick: () => gehe(s.ziel), 'aria-label': (i + 1) + '. ' + b.titel + ' – ' + WORT(s) + ': ' + s.text },
      h('span', { class: 'snr', 'aria-hidden': 'true' }, SYM[s.status](i, s)),
      h('span', { class: 'stext' }, h('b', {}, b.titel), h('span', { class: 'sinfo' }, s.text)),
      h('span', { class: 'sstatus' }, WORT(s)), h('span', { class: 'spfeil', 'aria-hidden': 'true' }, icon('rechts')))); }));
  const fertig = z.schritte.filter(s => s.status === 'fertig').length;
  // Plan-Ampel: Zustand und Zahl der offenen Punkte – die Einzelheiten stehen unter „Ergebnis & Auswertung“ → „Offene Punkte“
  const ampelText = !z.plan ? 'Noch kein Plan' : z.st.ampel === 'rot' ? 'Plan mit Problemen' : z.nOffen ? 'Plan vollständig' : z.st.ampel === 'gelb' ? 'Plan vollständig' : 'Plan in Ordnung';
  const ampel = h('div', { class: 'karte startampel ' + (z.plan ? z.st.ampel : 'leer') },
    h('div', { class: 'sakopf' }, h('span', { class: 'ampel gross ' + (z.plan && z.st.ampel !== 'leer' ? z.st.ampel : ''), role: 'img', 'aria-label': 'Plan-Ampel: ' + (AMPEL_TEXT[z.st.ampel] || AMPEL_TEXT.leer)[0] }), h('div', {}, h('div', { class: 'eyebrow' }, 'Plan-Ampel'), h('h2', {}, ampelText))),
    h('p', { class: 'muted' }, (AMPEL_TEXT[z.plan ? z.st.ampel : 'leer'] || AMPEL_TEXT.leer)[1]),
    z.plan ? h('p', { class: z.nOffen || z.st.ampel === 'rot' ? '' : 'saok' }, z.nOffen ? h('b', {}, z.nOffen + (z.nOffen === 1 ? ' offener Punkt' : ' offene Punkte')) : z.st.ampel === 'rot' ? h('b', {}, hartText(z.nHart || 1)) : '✓ Keine offenen Punkte') : null,
    z.plan ? h('div', { class: 'zeile' }, h('button', { class: 'btn klein', onclick: () => gehe('auswertung', { reiter: 'offen' }) }, z.nOffen || z.st.ampel === 'rot' ? 'Offene Punkte ansehen' : 'Zur Auswertung'), h('button', { class: 'btn klein ghost', onclick: () => gehe('editor') }, 'Plan öffnen')) : null);
  return [
    seitenkopf('Übersicht', d.schule.name + (d.schule.schuljahr ? ' · ' + d.schule.schuljahr : '') + ' – wo das Projekt steht und was als Nächstes zu tun ist.'),
    h('div', { class: 'startgrid' },
      h('div', { class: 'karte naechster ' + (nx.art || '') }, h('div', { class: 'eyebrow' }, 'Nächster Schritt'), h('h2', {}, nx.titel), h('p', {}, nx.text),
        h('div', { class: 'zeile' }, h('button', { class: 'btn primaer gross', onclick: nx.tun }, nx.knopf, icon('pfeil-rechts')), nx.zweit ? h('button', { class: 'btn ghost', onclick: nx.zweit[1] }, nx.zweit[0]) : null)),
      ampel),
    h('div', { class: 'karte' },
      h('div', { class: 'zeile', style: { marginBottom: '6px' } }, h('h2', { style: { margin: 0 } }, 'In sieben Schritten zum Plan'), h('span', { class: 'muted klein' }, fertig + ' von 7 erledigt')),
      h('div', { class: 'fortschritt schmal', role: 'progressbar', 'aria-label': 'Erledigte Schritte', 'aria-valuemin': 0, 'aria-valuemax': 7, 'aria-valuenow': fertig }, h('div', { style: { width: Math.round(fertig / 7 * 100) + '%' } })),
      stepper),
    lokal
  ];
};


// ---------- Leere Zustände ----------
// Statt „Noch keine Einträge“: Symbol, ein erklärender Satz und der Knopf für den ersten Schritt.
// o: { icon, titel, text, aktion: { text, tun }, zweit: { text, tun } | [ … ], klein }
function leerZustand(o) {
  const zweit = [].concat(o.zweit || []).filter(Boolean);
  return h('div', { class: 'leerzustand' + (o.klein ? ' klein' : '') },
    h('span', { class: 'lzsym', 'aria-hidden': 'true' }, icon(o.icon || 'info')),
    h('div', { class: 'lztext' }, h('strong', {}, o.titel), o.text ? h('p', {}, o.text) : null),
    o.aktion || zweit.length ? h('div', { class: 'lzknoepfe' }, o.aktion ? h('button', { class: 'btn primaer', type: 'button', onclick: o.aktion.tun }, o.aktion.text) : null, zweit.map(z => h('button', { class: 'btn', type: 'button', onclick: z.tun }, z.text))) : null);
}

