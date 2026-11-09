// Aufnahmen je Kapitel des Benutzerhandbuchs. Jede Funktion bekommt den Kontext aus handbuch-bilder.mjs:
// Ausgangszustand ist die Beispielschule mit berechnetem Plan (Übersicht geöffnet, Expertenmodus aus).
// Nicht gefundene Marken werden gemeldet (!!), die Aufnahme läuft weiter.
import k3 from './handbuch-kapitel/k3.mjs';
import { k4, k5 } from './handbuch-kapitel/k4.mjs';
import { k6, k7, k8 } from './handbuch-kapitel/k6.mjs';
import { k9, k10, k11, k12, k13, k14 } from './handbuch-kapitel/k9.mjs';

export const kapitelTabelle = {};
const K = kapitelTabelle;
K['3'] = k3; K['4'] = k4; K['5'] = k5; K['6'] = k6; K['7'] = k7; K['8'] = k8; K['9'] = k9; K['10'] = k10; K['11'] = k11; K['12'] = k12; K['13'] = k13; K['14'] = k14; // weitere Kapitel: tools/handbuch-kapitel/kN.mjs

// Menü öffnen und wieder schließen
async function menueAuf(c) { await c.klicke('#kMenue'); await c.warte(500); }

K['0'] = { bilder: async c => {
  await c.gehe('editor');
  await c.bild('k00-titel');
} };

K['1'] = { bilder: async c => {
  const { A, BREITE, EXPL, INSP, INHALT } = c;
  await c.gehe('start');
  // 1.4 Kopfleiste
  for (const [n, s] of [[1, '#kNav'], [2, '#kProjektKnopf'], [3, '#kModi'], [4, '#kSuche'], [5, '#kUndo'], [6, '#kKosten'], [7, '#kBerechnenGruppe'], [8, '#kMenue'], [9, '#kInspektor']]) await c.marke2(n, s, { pos: 'unten' });
  await c.bild('k01-kopfleiste', A(0, 0, BREITE, 76));
  // Projektmenü (Klick auf den Schulnamen)
  await c.klicke('#kProjektKnopf'); await c.warte(500);
  await c.bildUm('k01-projektmenue', { sel: '#kontextmenue', hoch: false });
  await c.schliesseDialog();
  // Menü rechts
  await menueAuf(c);
  await c.bildUm('k01-menue', { sel: '#kontextmenue', hoch: false });
  await c.schliesseDialog();
  // Explorer im Modus Einrichten
  await c.gehe('lehrer');
  await c.marke2(1, { sel: '#nav .bereich.aktiv', hoch: false }, { pos: 'rechts' }); await c.marke2(2, { sel: '#nav .bereich .zahl', hoch: false, nth: 0 }, { pos: 'rechts' });
  await c.marke2(3, { sel: '#nav .objekte', hoch: false }, { pos: 'rechts', pad: -4 });
  await c.bild('k01-explorer', A(EXPL.x, EXPL.y, EXPL.w + 30, Math.min(EXPL.h, 640)));
  // Inspektor: Probleme und Hilfe
  await c.gehe('schule');
  await c.marke2(1, { sel: '#inspektor [role=tab]', nth: 0, hoch: false }); await c.marke2(2, { sel: '#inspektor [role=tab]', nth: 1, hoch: false });
  await c.bild('k01-inspektor', A(INSP.x - 20, INSP.y, INSP.w + 20, Math.min(INSP.h, 560)));
  await c.klicke2({ sel: '#inspektor [role=tab]', nth: 1, hoch: false }); await c.ruhe(500);
  await c.bild('k01-inspektor-hilfe', A(INSP.x - 20, INSP.y, INSP.w + 20, Math.min(INSP.h, 560)));
  await c.klicke2({ sel: '#inspektor [role=tab]', nth: 0, hoch: false }); await c.ruhe(300);
  // Startseite mit Checkliste
  await c.gehe('start');
  await c.marke2(1, { sel: '#inhalt .naechst', hoch: false }, { pos: 'links' });
  await c.marke2(2, { sel: '#inhalt .checkblock', hoch: false }, { pos: 'links' });
  await c.marke2(3, { sel: '#inhalt .startampel', hoch: false }, { pos: 'rechts' });
  await c.marke2(4, { text: 'Projektdatei', sel: '#inhalt h2', hoch: 'section' }, { pos: 'rechts' });
  await c.bild('k01-start');
  // Einstellungen
  await c.js('void einstellungenDialog()'); await c.ruhe(700);
  await c.marke2(1, { text: 'Hell', sel: 'dialog button, dialog label', hoch: 'label, button' }); await c.marke2(2, { text: 'Normal', sel: 'dialog button, dialog label', hoch: 'label, button' }); await c.marke2(3, { text: 'Expertenmodus', teil: true, sel: 'dialog label', hoch: 'label' });
  await c.bildDialog('k01-einstellungen');
  await c.schliesseDialog();
  // Suchen und springen
  await c.js('paletteOeffnen()'); await c.ruhe(600);
  await c.p.sende('Input.insertText', { text: '5a' }); await c.warte(500);
  await c.bildDialog('k01-suche', 10);
  await c.schliesseDialog();
} };

K['2'] = { bilder: async c => {
  const { A, BREITE, INHALT } = c;
  // Start des leeren Programms
  await c.js("aendern('leer', d => { const l = leererDatenstand(); Object.keys(d).forEach(k => { delete d[k]; }); Object.assign(d, l); })");
  await c.gehe('start');
  await c.marke2(1, 'Einrichtung starten'); await c.marke2(2, 'Beispieldaten laden', { pos: 'rechts' }); await c.marke2(3, 'Projektdatei wählen …', { pos: 'rechts' }); await c.marke2(4, 'Handbuch als PDF herunterladen', { pos: 'rechts' });
  await c.bild('k02-start', A(INHALT.x, INHALT.y, INHALT.w, 560));
  // „Nächster Schritt“ in einem begonnenen Projekt (hier: ohne Fächer)
  await c.zustandLaden();
  await c.js("aendern('ohne Faecher', d => { d.faecher = []; d.plan = leererDatenstand().plan; })"); await c.gehe('start');
  await c.marke2(1, { sel: '#inhalt .naechst', hoch: false }, { pos: 'links' }); await c.marke2(2, { sel: '#inhalt .checkliste li', nth: 0, hoch: false }, { pos: 'links' });
  await c.marke2(3, { sel: '#inhalt .checkliste .cl-ziel', nth: 0, hoch: false }, { pos: 'rechts' });
  await c.bild('k02-naechster', A(INHALT.x, INHALT.y, INHALT.w, 620));
} };
