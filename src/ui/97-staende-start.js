/* ---------------- Stände (Momentaufnahmen) ---------------- */
function standSpeichern(name) {
  const { bewertung } = modell();
  if (APP.daten.staende.length >= 20) { toast('Höchstens 20 Stände – bitte zuerst einen löschen.', 'err'); return; }
  aendern('Stand „' + name + '“ gespeichert', d => { d.staende.push({ name, zeit: new Date().toISOString(), kosten: bewertung.k.weich, hart: hartEnd(), platzierungen: JSON.parse(JSON.stringify(d.plan.platzierungen)), frei: JSON.parse(JSON.stringify(d.plan.frei || [])), besetzung: JSON.parse(JSON.stringify(d.plan.besetzung || [])), auto: d.unterrichte.filter(u => !u.aufgabe && u.fachAuto).map(u => ({ id: u.id, lehrkraefte: JSON.parse(JSON.stringify(u.lehrkraefte)) })) }); });
}
function standVergleich(a, b) {
  const key = p => p.unterricht + '|' + p.blockNr;
  const ma = new Map(a.platzierungen.map(p => [key(p), p])), mb = new Map(b.platzierungen.map(p => [key(p), p]));
  let geaendert = 0;
  new Set([...ma.keys(), ...mb.keys()]).forEach(k => { const x = ma.get(k), y = mb.get(k); if (!x || !y || x.tag !== y.tag || x.stunde !== y.stunde || x.raum !== y.raum) geaendert++; });
  return geaendert;
}
SEITEN_RENDER.staende = () => {
  const d = APP.daten;
  const st = APP.tabellen.staende || (APP.tabellen.staende = { a: 0, b: 1 });
  const name = h('input', { type: 'text', placeholder: 'z. B. Entwurf 1, Nach Sitzung', style: { width: '260px' }, 'aria-label': 'Name des Stands' });
  const opts = d.staende.map((s, i) => [String(i), s.name]).concat([['aktuell', 'aktueller Plan']]);
  const holen = x => x === 'aktuell' ? { name: 'aktueller Plan', platzierungen: d.plan.platzierungen, kosten: d.plan.platzierungen.length ? modell().bewertung.k.weich : 0, hart: d.plan.platzierungen.length ? hartEnd() : 0 } : d.staende[Number(x)];
  let vergleich = null;
  if (d.staende.length) {
    const A = holen(String(st.a)), B = holen(String(st.b));
    if (A && B) vergleich = h('p', {}, h('b', {}, standVergleich(A, B)), ' geänderte Platzierungen · Strafpunkte ' + zahlDe(A.kosten, 1) + ' → ' + zahlDe(B.kosten, 1) + ' (' + zahlDe(B.kosten - A.kosten, 1, true) + ') · harte Verstöße ' + A.hart + ' → ' + B.hart);
  }
  return [
    seitenkopf('Stände', 'Benannte Momentaufnahmen des Plans (höchstens 20). Zwei Stände lassen sich vergleichen und einer davon wiederherstellen.'),
    h('div', { class: 'karte' }, h('div', { class: 'zeile' }, name, h('button', { class: 'btn primaer', disabled: !d.plan.platzierungen.length, onclick: () => standSpeichern(name.value.trim() || 'Stand ' + (d.staende.length + 1)) }, 'Aktuellen Plan als Stand speichern'), h('span', { class: 'muted klein' }, d.staende.length + ' / 20'))),
    h('div', { class: 'abstand' }),
    d.staende.length ? h('div', { class: 'tabwrap' }, h('table', { class: 'tab' }, h('thead', {}, h('tr', {}, ['Name', 'Gespeichert', 'Harte Verstöße', 'Strafpunkte', 'Platzierungen', ''].map(t => h('th', {}, t)))),
      h('tbody', {}, d.staende.map((s, i) => h('tr', {}, h('td', {}, h('b', {}, s.name)), h('td', {}, s.zeit ? new Date(s.zeit).toLocaleString('de-DE') : ''), h('td', {}, s.hart), h('td', {}, zahlDe(s.kosten, 1)), h('td', {}, s.platzierungen.length),
        h('td', { class: 'aktion' },
          h('button', { class: 'btn klein', onclick: async () => { if (await bestaetigen('Stand „' + s.name + '“ wiederherstellen? Der aktuelle Plan wird ersetzt (rückgängig machbar).', 'Wiederherstellen')) aendern('Stand „' + s.name + '“ wiederhergestellt', dd => { const s0 = dd.staende[i]; dd.plan.platzierungen = JSON.parse(JSON.stringify(s0.platzierungen)); dd.plan.frei = JSON.parse(JSON.stringify(s0.frei || [])); dd.plan.besetzung = JSON.parse(JSON.stringify(s0.besetzung || [])); (s0.auto || []).forEach(x => { const u = findeId(dd.unterrichte, x.id); if (u && u.fachAuto) u.lehrkraefte = JSON.parse(JSON.stringify(x.lehrkraefte)); }); }); } }, 'Wiederherstellen'),
          h('button', { class: 'btn icon klein gefahr', 'aria-label': 'Stand löschen', onclick: () => aendernMitUndo('Stand gelöscht', dd => { dd.staende.splice(i, 1); }, null, 'Stand „' + s.name + '“ gelöscht.') }, icon('papierkorb')))))))) : leerZustand({ klein: true, icon: 'stapel', titel: 'Noch keine Stände gespeichert', text: d.plan.platzierungen.length ? 'Ein Stand hält den jetzigen Plan unter einem Namen fest – zum Vergleichen und Zurückholen. Oben einen Namen eingeben und speichern.' : 'Stände halten einen Plan unter einem Namen fest. Dafür muss zuerst ein Plan berechnet sein.', aktion: d.plan.platzierungen.length ? null : { text: 'Plan berechnen', tun: () => gehe('berechnung') } }),
    d.staende.length ? h('div', { class: 'karte', style: { marginTop: '14px' } }, h('h3', { style: { marginTop: 0 } }, 'Vergleich'), h('div', { class: 'zeile' }, sel(opts, String(st.a), v => { st.a = v; render(); }, { 'aria-label': 'Stand A' }), '↔', sel(opts, String(st.b), v => { st.b = v; render(); }, { 'aria-label': 'Stand B' })), vergleich) : null
  ];
};

/* ---------------- Projekt, Info, Start ---------------- */
async function beispielLaden() {
  const hat = APP.daten && (APP.daten.klassen.length || APP.daten.unterrichte.length);
  if (hat && !(await bestaetigen('Beispieldaten laden? Der aktuelle Datenstand wird ersetzt (rückgängig machbar mit Strg+Z).', 'Beispieldaten laden'))) return;
  APP.speicherGesperrt = false;
  const b = beispieldaten();
  APP.banner = []; APP.rechnung.ergebnis = null;
  aendern('Beispieldaten geladen', d => { Object.keys(d).forEach(k => { delete d[k]; }); Object.assign(d, b); });
  APP.editor.id = null; APP.editor.id2 = null;
  toast('Beispieldaten geladen: ' + b.klassen.length + ' Klassen, ' + b.lehrer.length + ' Lehrkräfte und Co-Kräfte, ' + b.unterrichte.length + ' Unterrichte.', 'ok', 6000);
  gehe('start');
}
async function neuesProjekt() {
  if (!(await bestaetigen('Neues leeres Projekt beginnen? Der aktuelle Datenstand wird verworfen (rückgängig machbar mit Strg+Z). Tipp: vorher exportieren.', 'Neu beginnen', 'gefahr'))) return;
  APP.speicherGesperrt = false;
  const leer = leererDatenstand();
  APP.banner = []; APP.rechnung.ergebnis = null;
  aendern('Neues Projekt', d => { Object.keys(d).forEach(k => { delete d[k]; }); Object.assign(d, leer); });
  gehe('schule');
}
function infoDialog() {
  dialog({
    titel: 'Hilfe und Datenschutz', breite: '680px',
    inhalt: h('div', {},
      h('div', { class: 'hinweis ok' }, h('b', {}, 'Alle Daten bleiben lokal in diesem Browser. '), 'Die App sendet nichts an Server und lädt nichts nach. Lehrernamen und Verfügbarkeiten sind personenbezogene Daten – bitte die Projektdatei entsprechend sicher aufbewahren und für die Weitergabe von Beispielen den anonymisierten Export verwenden.'),
      h('p', { class: 'muted klein' }, 'Der Stundenplaner ist ein privates Projekt ohne Gewinnabsicht. Er wurde mit Hilfe künstlicher Intelligenz (KI) erstellt und wird ohne Gewähr bereitgestellt; Pläne und Berechnungsergebnisse sind vor der Verwendung selbst zu prüfen.'),
      h('p', {}, 'Das Benutzerhandbuch beschreibt alle Funktionen ausführlich – mit Bildern, Regelkatalog, Häufigen Fragen und Glossar – und liegt als PDF vor: ', handbuchLink('Handbuch (PDF) herunterladen'), '. Es wird nur auf Klick geöffnet.'),
      h('p', {}, 'Gespeichert wird automatisch eine Sekunde nach jeder Änderung (localStorage, bei großen Datenständen IndexedDB). Beim Löschen des Browserverlaufs gehen diese Daten verloren – deshalb regelmäßig über das Menü oben rechts „Projekt exportieren“ wählen.'),
      h('h3', {}, 'So geht es'),
      h('ol', {}, h('li', {}, h('b', {}, 'Grundsatz: '), 'Sie beschreiben die Schule – Klassen, Stundentafeln, Mitarbeitende mit Fächern und Arbeitszeit, Klassenleitung, Klassenteams, Verfügbarkeiten sowie den Aufsichtsbedarf. Das Programm erzeugt daraus Unterricht, Halbgruppen, Blöcke, Parallelbänder, die Zuteilung der Lehr- und Co-Lehrkräfte, den Stundenplan, die Aufsichten. Die Stundentafel nennt die Wochenstunden eines einzelnen Schülers: Halbgruppen zählen einmal, A-/B-Wochen halb.'), h('li', {}, 'Die Seitenleiste führt in neun Schritten: Schule & Zeiten, Mitarbeitende, Klassen & Stundentafel, Aufsichten, Prüfung, Plan berechnen, Plan bearbeiten & Ergebnis, GTA-Planer und Gesamtansicht (alle Personen eines Tages mit Unterricht, Aufgaben, GTAs und Aufsichten auf einer Zeitleiste). Der Expertenmodus (Menü → Einstellungen) blendet zusätzliche Reiter ein (Unterrichtsverteilung, Regeln & Gewichte, Selbsttest). Zusammengehöriges liegt als Reiter auf einer Seite (z. B. Zeitraster und Zeitprofile unter „Schule & Zeiten“). Im Zeitraster Uhrzeiten einfach tippen (7:30, 0730); Tab springt zum nächsten Feld, Enter eine Zeile tiefer, spätere Zeiten rücken automatisch mit. Stunden und Pausen lassen sich frei benennen.'), h('li', {}, 'Je Person gelten drei getrennte Grenzen: das Unterrichtsdeputat (höchstens so viele Unterrichtsstunden als Lehrkraft und Co zusammen), die Wochenarbeitszeit und die Höchstarbeitszeit je Tag. Alles dazu steht unter „Arbeitszeit & Deputat“; Verfügbarkeit, gesperrte Pausen, Grenzen und Aufsichtswünsche einer Person im Dialog „Zeiten & Verfügbarkeit“ (Seite „Mitarbeitende“).'), h('li', {}, 'Aufgaben (z. B. Schulleitung, Medienverantwortliche) unter „Aufgaben“ anlegen – in Unterrichtsstunden (UStd.) oder Zeitstunden (h), auch als langer Block über Pausen: Sie belegen Zeit im Plan der zugeordneten Personen, aber keine Klasse.'), h('li', {}, '„Plan berechnen“ – läuft im Hintergrund, Stop übernimmt den besten Stand. Priorität ist strikt: 1. Fachunterricht und Fachlehrkräfte werden während derselben Berechnung gekoppelt optimiert; vollständige Kursbesetzung geht vor Klassenleitung/Klassenteam als Wunsch. Problematische automatische Zuteilungen werden verworfen und mit Alternativen neu berechnet. 2. Auf dem fertigen Fachunterrichtsplan wird der konfigurierte Co-Bedarf automatisch anhand der tatsächlich freien Unterrichtszeiten ergänzt. 3. Erst gegen den fertigen Fach- und Co-Unterricht werden Aufsichten geplant und freie Soll-Arbeitszeit damit aufgefüllt; weiteres Personal wird dabei gezielt stark berücksichtigt. Fest gewählte Personen bleiben. Jede Stunde wird für die Klasse eingeplant; passt sie in keine Arbeitszeit oder freie Stunde der Lehrkraft, steht dort „N. N.“.'), h('li', {}, 'Aufsichten: Pausen aus dem Zeitraster übernehmen oder frei benannte Bedarfe anlegen und minutengenau staffeln. Geteilt wird nur an den Grenzen dieser Staffelung – verschobene Pausen der Zeitprofile teilen nichts. Wer zeitgleich Unterricht oder Co-Unterricht hat – auch bei verschobenen Zeitprofilen – ist für diesen Abschnitt hart ausgeschlossen. Springer sind Reserve: Sie werden auch über Arbeitszeitgrenzen hinweg eingeplant, und ein unbesetzter Springer ist nur eine Warnung (gelb). Danach wird zuerst hart verfügbares weiteres Personal eingesetzt; anschließend werden bevorzugt Personen mit noch offener Soll-Arbeitszeit verwendet. Persönliche Wünsche zu freien Zeiten, Lücken sowie Früh-/Spätpräferenzen sind nachgeordnet und dürfen eine notwendige Besetzung nicht verhindern; echte Abwesenheiten und ausdrückliche Abschnittsausschlüsse bleiben hart.'), h('li', {}, 'Im Plan-Editor Kacheln ziehen (Maus, Stift oder Finger): grün = regelkonform, gelb = weicher Verstoß, rot = harter Konflikt (mit Grund) – auf Nachfrage lässt sich der Zug trotzdem ausführen, das Programm sucht dann für die verdrängten Stunden neue Plätze. Lehrkräfte und Räume aus „Ziehen & zuordnen“ auf eine Stunde ziehen, um sie zuzuordnen – zieht man eine Person auf eine Stunde, in der sie schon steht (auch automatisch geplant), lässt sie sich für diese Stunde oder den ganzen Kurs herausnehmen; die automatische Planung setzt sie dann dort nicht wieder ein. Bei A/B-Wochen lässt sich jede Woche einzeln oder nebeneinander anzeigen.'), h('li', {}, 'Harte Fehler lassen sich in der Prüfung des fertigen Plans (Ergebnis & Auswertung) oder im Menü einer Kachel bewusst akzeptieren – nach einer Warnung. Sie zählen dann nicht mehr als harter Fehler; die betroffenen Stunden und Aufsichten tragen im Editor ein rotes Ausrufezeichen. „Zurücknehmen“ macht sie wieder hart.'),
        h('li', {}, 'GTA-Planer (8. Punkt der Seitenleiste): zeigt Personen mit mindestens 60 min freier Arbeitszeit. GTAs (frei benannt, keiner Klasse zugeordnet, eine oder mehrere Personen oder „Extern“ + Name) werden in das Wochenraster gezogen – auf Rasterstunden oder zu eigenen Zeiten, auf Wunsch mit Raum (freie Räume stehen zur Wahl). Sie zählen zur Arbeitszeit, aber nicht zur Verteilung des Unterrichts; passt eine GTA nach einer Neuberechnung nicht mehr, erscheint „GTA nicht mehr möglich“. Externe GTAs zählen nirgends. Der GTA-Plan steht unter „Druck & Export“.'),
        h('li', {}, 'Drucken oder exportieren unter „Druck & Export“.')),
      h('h3', {}, 'Tastatur'),
      h('p', {}, 'Die Seitenleiste ist ab 1280 px Fensterbreite ausgeklappt, darunter eine schmale Schiene mit Symbolen; unter 900 px öffnet sie der Menü-Knopf (drei Striche) oben links. Der Knopf oben in der Leiste klappt sie ein und aus; die Wahl bleibt gespeichert. Die „Übersicht“ zeigt jederzeit den Stand der sieben Schritte und den nächsten Schritt.'),
      h('p', {}, 'Strg+K: suchen und springen – zu jeder Seite, Klasse, Lehrkraft, jedem Raum und den wichtigsten Aktionen · Strg+Z / Strg+Y: rückgängig / wiederholen · F1 in einem Eingabefeld: Erklärung zum Feld · Editor: Pfeiltasten wählen Kachel, Entf legt in die Ablage, L fixiert/löst, V verschiebt, Enter öffnet Details, Shift+F10 öffnet das Menü.'),
      h('div', { class: 'zeile' }, h('button', { class: 'btn', onclick: () => { document.querySelector('dialog .dfuss .btn').click(); beispielLaden(); } }, 'Beispieldaten laden'), expertenModus() ? h('button', { class: 'btn', onclick: () => { document.querySelector('dialog .dfuss .btn').click(); gehe('selbsttest'); } }, 'Selbsttest') : null)),
    knoepfe: [{ text: 'Schließen', wert: true, art: 'primaer' }]
  });
}
async function start() {
  kopfBauen();
  let d = null, fehler = null;
  try { d = await ladenGespeichert(); } catch (e) { fehler = e; }
  if (fehler) {
    APP.speicherGesperrt = true;
    APP.daten = leererDatenstand();
    navBauen(); render();
    await dialog({ titel: 'Gespeicherter Stand nicht lesbar', inhalt: h('div', {}, h('p', {}, fehler.message), h('p', {}, 'Der gespeicherte Stand wird nicht verändert. Die App läuft mit einem leeren Projekt, speichert aber nichts, bis ein Projekt importiert oder neu begonnen wird.')), knoepfe: [{ text: 'Verstanden', wert: true, art: 'primaer' }] });
    return;
  }
  APP.daten = d || leererDatenstand();
  // Einstieg ist immer die Übersicht: Stand der sieben Schritte und der nächste Schritt
  APP.seite = 'start';
  delete APP.meta.assistent; // Einstellung des früheren Einrichtungsassistenten
  navBauen();
  APP.mach = machbarkeit(APP.daten);
  render();
  if (d) {
    APP.speicherStatus = 'Geladen um ' + uhrzeit(); kopfAktualisieren();
    const basis = APP.meta.letzterExport || APP.meta.ersterStand;
    if (basis && Date.now() - basis > 7 * 864e5) toast('Seit über sieben Tagen wurde keine Exportdatei gespeichert. Browserdaten können beim Löschen des Verlaufs verloren gehen – bitte exportieren.', 'err', 9000);
  }
}
document.addEventListener('keydown', ev => {
  const t = ev.target;
  const textfeld = t && ((t.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'color', 'button'].includes(t.type)) || t.tagName === 'TEXTAREA');
  if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && !textfeld && !document.querySelector('dialog[open]')) {
    const k = ev.key.toLowerCase();
    if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); rueckgaengig(); return; }
    if (k === 'y' || (k === 'z' && ev.shiftKey)) { ev.preventDefault(); wiederholen(); return; }
  }
  if (editorTaste(ev)) ev.preventDefault();
});
window.addEventListener('resize', () => { if (APP.seite === 'berechnung' && APP.rechnung.ui) kurveZeichnen(APP.rechnung.ui.canvas, APP.rechnung.verlauf); });
window.addEventListener('beforeunload', ev => { if (APP.speicherTimer && APP.speicherStatus.startsWith('Änderungen')) { speichernJetzt(); } });
document.addEventListener('DOMContentLoaded', () => { const sk = document.querySelector('.skiplink'); if (sk) sk.addEventListener('click', ev => { ev.preventDefault(); const m = $('#inhalt'); m.focus(); m.scrollTop = 0; }); });
document.addEventListener('DOMContentLoaded', start);

