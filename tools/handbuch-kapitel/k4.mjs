// Kapitel 4 „Regeln & Gewichte“ (Expertenmodus) und Kapitel 5 „Plan berechnen“
export const k4 = { bilder: async c => {
  const { A, INHALT } = c;
  const SEITE = (h, y = 56) => A(INHALT.x, y, INHALT.w, h);
  const sp = y => c.js(`document.querySelector('#inhalt').scrollTop = ${y}`);
  await c.expert(true);
  await c.gehe('regeln');
  await c.marke2(1, { text: 'Stundenplan', sel: '[role=tab], button', in: '#inhalt' }); await c.marke2(2, { text: 'Ausgewogen', sel: 'button' }); await c.marke2(3, { text: 'Lehrkräfte zuerst', sel: 'button' }); await c.marke2(4, { text: 'Schülerwohl zuerst', sel: 'button' });
  await c.bild('k04-regeln', SEITE(804));
  await sp(500); await c.ruhe(400);
  await c.marke2(1, { sel: '#inhalt input[type=range]', nth: 0, hoch: false });
  await c.bild('k04-regeln-mitte', SEITE(804));
  await sp(1400); await c.ruhe(400);
  await c.bild('k04-regeln-unten', SEITE(804));
  // Schwellen und Paarregeln (W07, W09 …)
  await c.js("(() => { const e = [...document.querySelectorAll('#inhalt label')].find(l => /Kernfach bis Stunde/.test(l.textContent)); if (e) e.scrollIntoView({ block: 'start' }); })()"); await c.ruhe(400);
  await c.marke2(1, { text: 'Kernfach bis Stunde', teil: true, sel: '#inhalt label', hoch: 'label' }); await c.marke2(2, { text: 'Paarregeln', teil: true, sel: '#inhalt *', hoch: false }, { rahmen: false, pos: 'links' });
  await c.bild('k04-schwellen', SEITE(600));
  await sp(0); await c.ruhe(300);
  await c.klicke2({ text: 'Aufsichten', sel: '[role=tab], button', in: '#inhalt' }); await c.ruhe(700);
  await c.marke2(1, { text: 'sehr früh vor', teil: true, sel: '#inhalt *', hoch: 'label, div' }); await c.marke2(2, { text: 'lange Anwesenheit ab', teil: true, sel: '#inhalt *', hoch: 'label, div' });
  await c.bild('k04-regeln-aufsichten', SEITE(804));
  await sp(0); await c.ruhe(300);
  await c.klicke2({ text: 'Co-Lehrkräfte', sel: '[role=tab], button', in: '#inhalt' }); await c.ruhe(700);
  await c.marke2(1, { text: 'Ausgebildete Lehrkräfte als Co-Lehrkraft', teil: true, sel: '#inhalt *', hoch: 'label, div' }); await c.marke2(2, { text: 'Wichtung', teil: true, sel: '#inhalt *', hoch: 'label, div' });
  await c.bild('k04-regeln-co', SEITE(560));
  await c.expert(false);
} };

export const k5 = { bilder: async c => {
  const { A, INHALT } = c;
  const SEITE = (h, y = 56) => A(INHALT.x, y, INHALT.w, h);
  await c.gehe('berechnung');
  await c.marke2(1, { text: 'Rechenzeit', teil: true, sel: '#inhalt label', hoch: 'label' }); await c.marke2(2, { text: 'Ausgangspunkt', teil: true, sel: '#inhalt label', hoch: 'label' });
  await c.marke2(3, { text: 'Änderungen minimal halten', teil: true, sel: '#inhalt label', hoch: 'label' }); await c.marke2(4, { text: 'Teilneuplanung', teil: true, sel: '#inhalt label', hoch: 'label' });
  await c.marke2(5, { text: 'Plan berechnen', sel: '#inhalt button' });
  await c.bild('k05-einstellungen', SEITE(804));
  // Details für Fortgeschrittene
  await c.klicke2({ text: 'Details für Fortgeschrittene', teil: true, sel: 'summary' }); await c.ruhe(600);
  await c.js("(() => { const e = [...document.querySelectorAll('#inhalt summary')].find(s => /Details für Fortgeschrittene/.test(s.textContent)); if (e) e.scrollIntoView({ block: 'start' }); })()"); await c.ruhe(400);
  await c.marke2(1, { text: 'Iterationslimit', teil: true, sel: '#inhalt label', hoch: 'label' }); await c.marke2(2, { text: 'Seed', teil: true, sel: '#inhalt label', hoch: 'label' });
  await c.bild('k05-details', SEITE(804));
  // laufende Berechnung
  await c.gehe('berechnung');
  await c.js("rechnungKonfSetzen('zeitlimit', 30)");
  await c.klicke2('#kBerechnen'); await c.warte(9000); await c.js('__A.ruhe()');
  await c.marke2(1, { text: 'Stoppen und besten Plan übernehmen', sel: 'button' }); await c.marke2(2, { text: 'Co-Lehrkräfte', sel: '#inhalt *', hoch: 'ol, ul, .schritte' }); await c.marke2(3, { text: 'Der Plan wird berechnet', teil: true, sel: '#inhalt *', hoch: false }, { rahmen: false, pos: 'links' });
  await c.bild('k05-laeuft', SEITE(804));
  await c.p.warteBis('!APP.rechnung.laeuft && !!APP.rechnung.ergebnis', { timeout: 240000 }); await c.ruhe(1500);
  await c.gehe('berechnung');
  await c.marke2(1, { text: 'Im Editor öffnen', sel: 'button', in: '#inhalt' }); await c.marke2(2, { text: 'Offene Punkte', teil: true, sel: '#inhalt button' }); await c.marke2(3, { text: 'Erneut berechnen', teil: true, sel: '#inhalt button' });
  await c.bild('k05-ergebnis', SEITE(760));
  await c.js("(() => { const i = document.querySelector('#inhalt'); i.scrollTop = 700; })()"); await c.ruhe(400);
  await c.bild('k05-vorschau', SEITE(804));
} };
