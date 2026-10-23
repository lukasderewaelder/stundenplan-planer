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
  const { A, BREITE } = c;
  await c.gehe('start');
  // 1.4 Kopfleiste
  for (const [n, s] of [[1, '#kProjekt'], [2, '#kUndo'], [3, '#kSuche'], [4, '#kKosten'], [5, '#kBerechnen'], [6, '#kMenue']]) await c.marke2(n, s);
  await c.bild('k01-kopfleiste', A(0, 0, BREITE, 64));
  // Menü
  await menueAuf(c);
  const eintraege = ['Projekt importieren …', 'Projekt exportieren', 'Anonymisiert exportieren', 'Beispieldaten laden', 'Neues leeres Projekt …', 'Suchen und springen …', 'Einstellungen …', 'Hilfe und Datenschutz', 'Handbuch (PDF)'];
  let n = 0;
  for (const t of eintraege) { n++; await c.marke2(n, { text: t, teil: true, sel: '[role=menuitem], .menue button, button', hoch: false }, { rahmen: false, pos: 'links' }); }
  await c.bild('k01-menue', A(780, 0, 500, 500));
  await c.schliesseDialog();
  // Seitenleiste
  await c.marke2(1, 'Einklappen'); await c.marke2(2, { text: 'Übersicht', sel: '#nav button', hoch: false }); await c.marke2(3, { text: 'In neun Schritten', sel: '#nav *', hoch: false }, { rahmen: false, pos: 'links' });
  await c.marke2(4, { text: '5. Prüfung', teil: true, sel: '#nav button' }); await c.marke2(5, { text: '8. GTA-Planer', teil: true, sel: '#nav button' });
  await c.bild('k01-seitenleiste', A(0, 56, 290, 480));
  // Übersicht
  await c.marke2(1, { text: 'Nächster Schritt', teil: true, sel: '#inhalt *', hoch: '.karte' }, { pos: 'links' });
  await c.marke2(2, { text: 'Plan-Ampel', teil: true, sel: '#inhalt *', hoch: '.karte' }, { pos: 'rechts' });
  await c.marke2(3, { text: 'In sieben Schritten zum Plan', teil: true, sel: '#inhalt h2, #inhalt h3', hoch: false }, { pos: 'rechts' });
  await c.bild('k01-uebersicht');
  // Einstellungen
  await c.js('void einstellungenDialog()'); await c.ruhe(700);
  await c.marke2(1, { text: 'Hell', sel: 'dialog button, dialog label', hoch: 'label, button' }); await c.marke2(2, { text: 'Normal', sel: 'dialog button, dialog label', hoch: 'label, button' }); await c.marke2(3, { text: 'Expertenmodus', teil: true, sel: 'dialog label', hoch: 'label' });
  await c.bildDialog('k01-einstellungen');
  await c.schliesseDialog();
  // Suchen und springen
  await c.js('paletteOeffnen()'); await c.ruhe(600);
  await c.p.sende('Input.insertText', { text: '5a' }); await c.warte(500);
  await c.bild('k01-suche', A(300, 20, 680, 460));
  await c.schliesseDialog();
} };

K['2'] = { bilder: async c => {
  const { A, BREITE } = c;
  // Start des leeren Programms
  await c.js("aendern('leer', d => { const l = leererDatenstand(); Object.keys(d).forEach(k => { delete d[k]; }); Object.assign(d, l); })");
  await c.gehe('start');
  await c.marke2(1, 'Einrichtung starten'); await c.marke2(2, 'Beispieldaten laden'); await c.marke2(3, 'Projektdatei wählen …'); await c.marke2(4, 'Handbuch als PDF herunterladen', { pos: 'rechts' });
  await c.bild('k02-start', A(0, 0, BREITE, 520));
  // „Nächster Schritt“ in einem begonnenen Projekt (hier: ohne Fächer)
  await c.zustandLaden();
  await c.js("aendern('ohne Faecher', d => { d.faecher = []; d.plan = leererDatenstand().plan; })"); await c.gehe('start');
  await c.marke2(1, { text: 'Nächster Schritt', teil: true, sel: '#inhalt *', hoch: '.karte' }, { pos: 'links' }); await c.marke2(2, { text: 'In sieben Schritten zum Plan', teil: true, sel: '#inhalt h2, #inhalt h3', hoch: false }, { pos: 'rechts' });
  await c.bild('k02-naechster', A(284, 56, 996, 500));
} };
