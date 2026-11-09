// Kapitel 9 Arbeitszeit, 10 Auswertung, 11 Selbsttest, 12 Druck & Export, 13 Stände, 14 Speichern und Hilfe
export const k9 = { bilder: async c => {
  const { A, INHALT } = c;
  const SEITE = (h, y = INHALT.y) => A(INHALT.x, y, INHALT.w, h);
  await c.gehe('arbeitszeit');
  await c.klicke2({ text: 'Übersicht je Person', teil: true, sel: '[role=tab], button', in: '#inhalt' }); await c.ruhe(600);
  await c.klicke2({ text: 'Alle Bestandteile', sel: 'button' }); await c.ruhe(700);
  await c.marke2(1, { text: 'Unterricht (h)', teil: true, sel: '#inhalt th', hoch: false }); await c.marke2(2, { text: 'Summe (h)', teil: true, sel: '#inhalt th', hoch: false }); await c.marke2(3, { text: 'Differenz', teil: true, sel: '#inhalt th', hoch: false }); await c.marke2(4, { text: 'Alle Bestandteile', sel: 'button' });
  await c.bild('k09-uebersicht', SEITE(700));
  await c.js("void arbeitszeitDetailDialog(APP.daten.lehrer.find(l => l.kuerzel === 'Mü').id)"); await c.ruhe(1000);
  await c.bildDialog('k09-detail');
  await c.schliesseDialog();
} };

export const k10 = { bilder: async c => {
  const { A, INHALT } = c;
  const SEITE = (h, y = INHALT.y) => A(INHALT.x, y, INHALT.w, h);
  const sp = y => c.js(`document.querySelector('#inhalt').scrollTop = ${y}`);
  await c.gehe('auswertung');
  await c.marke2(1, { text: 'Prüfung des fertigen Plans', teil: true, sel: '#inhalt *', hoch: false }, { pos: 'links' }); await c.marke2(2, { text: 'Offene Punkte', sel: '[role=tab], button', in: '#inhalt' });
  await c.bild('k10-ampel', SEITE(804));
  await sp(650); await c.ruhe(400);
  await c.bild('k10-offene-punkte', SEITE(804));
  // Akzeptieren-Dialog (am ersten angebotenen Eintrag)
  await sp(0); await c.ruhe(300);
  // Der Beispielplan hat keinen harten Fehler – der Dialog wird deshalb mit einem erfundenen Eintrag geöffnet und abgebrochen
  await c.js("void akzeptierenDialog([{ text: 'Lehrkraft Hf unterrichtet dort 6b (De) – Lehrkraft nicht doppelt belegt', key: 'bsp' }], 'H01')"); await c.ruhe(800); await c.bildDialog('k10-akzeptieren'); await c.schliesseDialog();
  await c.klicke2({ text: 'Regelverstöße', sel: '[role=tab], button', in: '#inhalt' }); await c.ruhe(700);
  await c.marke2(1, { text: 'Alle', sel: 'button' }); await c.marke2(2, { text: 'Pflicht', sel: 'button' }); await c.marke2(3, { text: 'Wünsche', sel: 'button' });
  await c.bild('k10-regelverstoesse', SEITE(804));
  await c.klicke2({ text: 'Auslastung', sel: '[role=tab], button', in: '#inhalt' }); await c.ruhe(700);
  await c.bild('k10-auslastung', SEITE(804));
  // Inspektor › Probleme mit berechnetem Plan
  await c.gehe('auswertung');
  await c.js("inspektorZeigen('probleme')"); await c.ruhe(600);
  await c.bild('k10-inspektor', A(c.INSP.x - 16, c.INSP.y, c.INSP.w + 16, Math.min(c.INSP.h, 720)));
} };

export const k11 = { bilder: async c => {
  const { A, INHALT } = c;
  const SEITE = (h, y = INHALT.y) => A(INHALT.x, y, INHALT.w, h);
  await c.expert(true);
  await c.gehe('auswertung', { reiter: 'selbsttest' });
  await c.klicke2({ text: 'Selbsttest', sel: '[role=tab], button', in: '#inhalt' }); await c.ruhe(700);
  await c.marke2(1, { text: 'Selbsttest ausführen', sel: 'button' });
  await c.bild('k11-selbsttest', SEITE(560));
  await c.js("(() => { const e = selbsttestOberflaeche(); APP.selbsttest = (APP.selbsttest || []).concat(e); render(); })()"); await c.ruhe(900);
  await c.bild('k11-ergebnis', SEITE(804));
  await c.expert(false);
} };

export const k12 = { bilder: async c => {
  const { A, INHALT, INSP, BREITE, HOEHE } = c;
  const SEITE = (h, y = INHALT.y) => A(INHALT.x, y, INHALT.w, h);
  const art = async t => { await c.klicke2({ text: t, teil: true, sel: '#nav .ex-eintrag' }); await c.ruhe(900); };
  await c.gehe('ausgabe');
  await c.marke2(1, { sel: '#nav .ex-eintrag[aria-current]', hoch: false }, { pos: 'rechts' }); await c.marke2(2, { sel: '#inhalt .druckbuehne', hoch: false }, { pos: 'links' });
  await c.marke2(3, { sel: '#inspektor select', nth: 0, hoch: false }); await c.marke2(4, { text: 'Drucken / als PDF', sel: '#inspektor button' });
  await c.marke2(5, { text: 'Uhrzeiten anzeigen', teil: true, sel: '#inspektor label', hoch: 'label' }); await c.marke2(6, { text: 'Schwarzweiß', teil: true, sel: '#inspektor label', hoch: 'label' });
  await c.marke2(7, { text: 'Weitere Formate', sel: '#inspektor h3', hoch: 'section' }, { pos: 'links' });
  await c.bild('k12-druck', A(0, 0, BREITE, HOEHE));
  await c.bild('k12-vorschau', SEITE(840));
  await art('Lehrerpläne');
  await c.bild('k12-vorschau-lehrer', SEITE(840));
  await art('Aufsichtsplan');
  await c.bild('k12-vorschau-aufsicht', SEITE(840));
  // Projektdatei (Ausgeben › Projektdatei)
  await c.gehe('projektdatei');
  await c.bild('k12-projektdatei', SEITE(520));
  // Import-Dialog mit Beispieldatei
  await c.js("(() => { const j = JSON.stringify(APP.daten); void importText(j, 'stundenplan_beispielschule.json'); })()"); await c.ruhe(1200);
  if (await c.js("!!document.querySelector('dialog[open]')")) { await c.bildDialog('k12-import'); await c.schliesseDialog(); }
} };

export const k13 = { bilder: async c => {
  const { A, INHALT } = c;
  const SEITE = (h, y = INHALT.y) => A(INHALT.x, y, INHALT.w, h);
  await c.js("standSpeichern('Entwurf 1')"); await c.ruhe(500);
  await c.js("aendern('Änderung', d => { d.plan.platzierungen = d.plan.platzierungen.slice(); })");
  await c.js("standSpeichern('Nach Gesamtkonferenz')"); await c.ruhe(500);
  await c.gehe('staende');
  await c.marke2(1, { text: 'Aktuellen Plan als Stand speichern', sel: 'button' }); await c.marke2(2, { text: 'Wiederherstellen', sel: 'button', nth: 0 }); await c.marke2(3, { text: 'Vergleich', teil: true, sel: '#inhalt *', hoch: false }, { pos: 'links' });
  await c.bild('k13-staende', SEITE(560));
} };

export const k14 = { bilder: async c => {
  const { A, INHALT } = c;
  await c.js('void infoDialog()'); await c.ruhe(900);
  await c.bildDialog('k14-hilfe');
  await c.schliesseDialog();
} };
