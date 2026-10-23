// Kapitel 6 „Der Plan-Editor“, 7 „Aufsichten“, 8 „GTA-Planer und Gesamtansicht“
const kachel = n => `document.querySelectorAll('.plangrid .kachel[data-e]')[${n}]`;

export const k6 = { bilder: async c => {
  const { A, INHALT, BREITE, HOEHE, p } = c;
  const SEITE = (h, y = 56) => A(INHALT.x, y, INHALT.w, h);
  await c.gehe('editor');
  await c.marke2(1, { sel: '#inhalt select', nth: 0, hoch: false }); await c.marke2(2, { sel: '.plangrid .kachel[data-e]', nth: 3, hoch: false }); await c.marke2(3, { text: 'Details', sel: '[role=tab], button' });
  await c.marke2(4, { text: 'Ablage', sel: '*', hoch: '.ablage' }); await c.marke2(5, { text: 'Offene Punkte', sel: 'button', in: '#inhalt' }); await c.marke2(6, { sel: '[aria-label="Weitere Aktionen"], button[title*="Weitere"]', hoch: false });
  await c.bild('k06-editor', SEITE(804));
  // ⋯-Menü
  if (await c.klicke2({ sel: '[aria-label="Weitere Aktionen"], button[title*="Weitere"]', hoch: false })) { await c.warte(500); await c.bild('k06-menue', A(INHALT.x + 500, 56, 496, 520)); await c.schliesseDialog(); }
  // Legende
  if (await c.klicke2({ sel: '[aria-label="Tastatur und Legende"], button[title*="Tastatur"]', hoch: false })) { await c.warte(600); await c.bild('k06-legende', A(INHALT.x + 300, 56, 696, 700)); await c.schliesseDialog(); }
  // Kachel anwählen: Details der Stunde
  await c.js(`${kachel(8)}.click()`); await c.ruhe(700);
  await c.marke2(1, { text: 'Fachlehrkräfte', teil: true, sel: '#inhalt *', hoch: false }, { rahmen: false, pos: 'links' });
  await c.bild('k06-details', SEITE(804));
  // Reiter Probleme und Zuordnen
  await c.klicke2({ text: 'Probleme', teil: true, sel: '[role=tab], button' }); await c.ruhe(500); await c.bild('k06-probleme', A(INHALT.x + 560, 56, 436, 620));
  await c.klicke2({ text: 'Zuordnen', teil: true, sel: '[role=tab], button' }); await c.ruhe(500); await c.bild('k06-zuordnen', A(INHALT.x + 560, 56, 436, 720));
  // Ziehen
  const q = await c.finde({ sel: '.plangrid .kachel[data-e]', nth: 2, hoch: false });
  await p.maus('mouseMoved', q.x + q.w / 2, q.y + q.h / 2, { button: 'none', clickCount: 0 });
  await p.maus('mousePressed', q.x + q.w / 2, q.y + q.h / 2);
  for (let i = 1; i <= 8; i++) { await p.maus('mouseMoved', q.x + q.w / 2 + i * 25, q.y + q.h / 2 + i * 12, { button: 'left', clickCount: 0 }); await c.warte(40); }
  await c.warte(500);
  await c.bild('k06-ziehen', A(INHALT.x, 56, 700, HOEHE - 56));
  await p.maus('mouseMoved', 5, 5, { button: 'left', clickCount: 0 }); await p.maus('mouseReleased', 5, 5); await c.warte(500); await c.js('__A.ruhe()');
  // Kachelmenü
  await c.js(`(() => { const k = ${kachel(0)}; const r = k.getBoundingClientRect(); k.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 30, clientY: r.y + 20 })); })()`); await c.warte(600);
  await c.bild('k06-kachelmenue', A(INHALT.x, 56, 700, HOEHE - 56)); await c.taste('Escape');
  // Verschieben nach …
  await c.js(`void (typeof verschiebeDialog === 'function' ? 0 : 0)`);
  await c.js(`(() => { const k = ${kachel(2)}; k.click(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true })); })()`); await c.ruhe(900);
  if (await c.js("!!document.querySelector('dialog[open]')")) { await c.bildDialog('k06-verschieben'); await c.schliesseDialog(); }
  // Lehrerplan mit Arbeitszeit und Aufsichten
  await c.js("(() => { editorZeigen('lehrer', APP.daten.lehrer.find(l => l.kuerzel === 'Kl').id); })()"); await c.ruhe(900);
  await c.bild('k06-lehrerplan', SEITE(804));
  // Raumplan
  await c.js("(() => { editorZeigen('raum', APP.daten.raeume.find(r => r.name === 'Chemie 1').id); })()"); await c.ruhe(900);
  await c.bild('k06-raumplan', SEITE(700));
  // Parallelansicht
  await c.js("(() => { editorZeigen('klasse', APP.daten.klassen.find(k => k.name === '5a').id); })()"); await c.ruhe(600);
  if (await c.klicke2({ sel: '[aria-label="Weitere Aktionen"], button[title*="Weitere"]', hoch: false })) { await c.warte(400); await c.klicke2({ text: 'Parallelansicht', teil: true, sel: '[role=menuitem], .menue button, button' }); await c.ruhe(900); await c.bild('k06-parallel', SEITE(804)); }
} };

export const k7 = { bilder: async c => {
  const { A, INHALT } = c;
  const SEITE = (h, y = 56) => A(INHALT.x, y, INHALT.w, h);
  const sp = y => c.js(`document.querySelector('#inhalt').scrollTop = ${y}`);
  await c.gehe('aufsicht');
  await c.marke2(1, { text: 'Aufsichten planen', sel: 'button', in: '#inhalt' }); await c.marke2(2, { text: 'Nur offene besetzen', sel: 'button', in: '#inhalt' }); await c.marke2(3, { text: 'automatisch nachplanen', teil: true, sel: '#inhalt label', hoch: 'label' });
  await c.marke2(4, { text: 'Bereiche', sel: '[role=tab], button', in: '#inhalt' }); await c.marke2(5, { text: 'Gesamtansicht', teil: true, sel: '#inhalt button' });
  await c.bild('k07-aufsichten', SEITE(804));
  await sp(500); await c.ruhe(400);
  await c.marke2(1, { text: 'Mo → Di–Fr', sel: 'button' }); await c.marke2(2, { text: 'Ganzen Tag kopieren …', sel: 'button' }); await c.marke2(3, { text: '+ Aufsicht', sel: 'button' });
  await c.bild('k07-wochenuebersicht', SEITE(804));
  await sp(0);
  // Pausen und Springer
  await c.klicke2({ text: 'Pausen aus dem Zeitraster und Springer', teil: true, sel: 'summary, button' }); await c.ruhe(600);
  await c.marke2(1, { text: 'Alle übernehmen', sel: 'button' }); await c.marke2(2, { text: 'Springer je Pause', teil: true, sel: '#inhalt *', hoch: false }, { rahmen: false, pos: 'links' });
  await c.bild('k07-pausen', SEITE(700));
  // Dialog Neue Aufsicht
  await c.klicke2({ text: '+ Aufsicht', sel: 'button' }); await c.ruhe(700); await c.bildDialog('k07-neue-aufsicht'); await c.schliesseDialog();
  // Detailkarte einer Aufsicht
  await c.js("(() => { const z = [...document.querySelectorAll('#inhalt table td button, #inhalt table td [role=button], #inhalt [data-bedarf]')][3]; if (z) z.click(); })()"); await c.ruhe(700);
  await c.js("(() => { const e = [...document.querySelectorAll('#inhalt h3, #inhalt h4, #inhalt strong')].find(x => /^Bearbeiten/.test(x.textContent.trim())); if (e) e.scrollIntoView({ block: 'start' }); })()"); await c.ruhe(400);
  await c.bild('k07-detail', SEITE(804));
  // Bereiche
  await sp(0); await c.ruhe(300);
  await c.klicke2({ text: 'Bereiche', sel: '[role=tab], button', in: '#inhalt' }); await c.ruhe(600);
  await c.marke2(1, { text: 'Bereich', teil: true, sel: '#inhalt button', nth: 0 }); await c.marke2(2, { text: 'exklusiv', teil: true, sel: '#inhalt *', hoch: 'label, div', nth: 0 });
  await c.bild('k07-bereiche', SEITE(560));
  // Auswertung
  await sp(0); await c.ruhe(300);
  await c.klicke2({ text: 'Auswertung', sel: '[role=tab], button', in: '#inhalt' }); await c.ruhe(700);
  await c.bild('k07-auswertung', SEITE(804));
} };

export const k8 = { bilder: async c => {
  const { A, INHALT, HOEHE } = c;
  const SEITE = (h, y = 56) => A(INHALT.x, y, INHALT.w, h);
  await c.gehe('gesamtansicht');
  await c.marke2(1, { text: 'Tag × Personen', sel: 'button' }); await c.marke2(2, { text: 'Person × Woche', sel: 'button' }); await c.marke2(3, { text: 'Fein verschieben', teil: true, sel: '#inhalt label', hoch: 'label' });
  await c.marke2(4, { text: 'Drucken / PDF', teil: true, sel: 'button' }); await c.marke2(5, { text: '+ Aufsicht', sel: 'button' });
  await c.bild('k08-gesamt', SEITE(804));
  await c.klicke2({ text: 'Person × Woche', sel: 'button' }); await c.ruhe(700); await c.bild('k08-person-woche', SEITE(700));
  await c.klicke2({ text: 'Tag × Personen', sel: 'button' }); await c.ruhe(500);
  // Aufsicht bearbeiten (Dialog „dienstDialog“)
  await c.js('void dienstDialog(APP.daten.dienste.plan[3].id)'); await c.ruhe(900);
  if (await c.js("!!document.querySelector('dialog[open]')")) { await c.bildDialog('k08-aufsicht-dialog'); await c.schliesseDialog(); }
  // GTA-Planer
  await c.gehe('gta');
  await c.marke2(1, { text: 'Freie Kapazität', teil: true, sel: '#inhalt *', hoch: '.karte' }); await c.marke2(2, { text: 'Neue GTA', teil: true, sel: '#inhalt button', nth: 0 });
  await c.bild('k08-gta', SEITE(804));
  await c.klicke2({ text: 'Neue GTA', teil: true, sel: '#inhalt button' }); await c.ruhe(700);
  if (await c.js("!!document.querySelector('dialog[open]')")) { await c.bildDialog('k08-gta-dialog'); await c.schliesseDialog(); }
} };
