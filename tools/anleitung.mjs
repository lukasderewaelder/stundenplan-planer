// Erzeugt die PDF-Anleitung: Screenshots der eingebauten Beispieldaten (Chrome headless) + PDF aus anleitung/quelle/anleitung.html.
//   node tools/anleitung.mjs                  Bilder neu aufnehmen und PDF schreiben
//   node tools/anleitung.mjs --nur-pdf        vorhandene Bilder (anleitung/bilder/) verwenden, nur die PDF neu schreiben
//   node tools/anleitung.mjs --nur-bilder     nur Screenshots
//   --zeit <s>   Rechenzeit der Beispielberechnung (Standard 20)     --jpeg   Bilder als JPEG (kleinere PDF)
// Es werden ausschließlich die Beispieldaten der App („Beispielschule“) gezeigt – ein frisches, leeres Chrome-Profil, keine fremden Daten.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { starteChrome } from './chrome-cdp.mjs';

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quelle = path.join(wurzel, 'anleitung', 'quelle');
const bilder = path.join(wurzel, 'anleitung', 'bilder');
const pdfDatei = path.join(wurzel, 'anleitung', 'Stundenplaner-Anleitung.pdf');
const args = process.argv.slice(2);
const opt = n => args.includes('--' + n);
const wert = (n, std) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : std; };
const RECHENZEIT = Number(wert('zeit', 20));
const FORMAT = opt('jpeg') ? 'jpeg' : 'png';
const warte = ms => new Promise(r => setTimeout(r, ms));
const BREITE = 1280, HOEHE = 860, FAKTOR = 2;
const INHALT = { x: 284, y: 56, w: BREITE - 284, h: HOEHE - 56 }; // Arbeitsfläche ohne Kopfleiste und Seitenleiste

// ---------- Hilfsfunktionen, die in der Seite laufen ----------
const SEITENHILFE = `(() => {
  const norm = s => (s || '').replace(/\\s+/g, ' ').trim();
  const sichtbar = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  window.__A = {
    finde(spec) {
      const s = typeof spec === 'string' ? (/^[#.[]/.test(spec) ? { sel: spec, hoch: false } : { text: spec }) : spec;
      let liste = [...document.querySelectorAll(s.sel || '*')].filter(sichtbar);
      if (s.text !== undefined) {
        liste = liste.filter(e => (s.teil ? norm(e.textContent).includes(s.text) : norm(e.textContent) === s.text));
        // jeweils das tiefste Element, dessen Text passt (nicht seine Vorfahren)
        liste = liste.filter(e => ![...e.children].some(c => liste.includes(c)));
      }
      if (s.in) { const w = document.querySelector(s.in); if (w) liste = liste.filter(e => w.contains(e)); }
      const e = liste[s.nth || 0];
      if (!e) return null;
      const z = s.hoch === false ? e : (e.closest(s.hoch || 'button,[role=tab],a,label,th,summary,select,input,.karte,.kachel') || e);
      const r = z.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    },
    marke(n, r, o) {
      o = o || {};
      let wurzel = document.getElementById('__marken');
      if (!wurzel) { wurzel = document.createElement('div'); wurzel.id = '__marken'; wurzel.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000;pointer-events:none'; document.body.append(wurzel); }
      const pad = o.pad === undefined ? 3 : o.pad;
      if (o.rahmen !== false) {
        const b = document.createElement('div');
        b.style.cssText = 'position:fixed;border:2.5px solid #d92d20;border-radius:7px;box-shadow:0 0 0 2px rgba(255,255,255,.85);left:' + (r.x - pad) + 'px;top:' + (r.y - pad) + 'px;width:' + (r.w + 2 * pad) + 'px;height:' + (r.h + 2 * pad) + 'px';
        wurzel.append(b);
      }
      const k = document.createElement('div');
      const px = o.pos === 'rechts' ? r.x + r.w + pad - 6 : o.pos === 'mitte' ? r.x + r.w / 2 - 13 : r.x - pad - 13;
      const py = o.pos === 'unten' ? r.y + r.h + pad - 13 : r.y - pad - 13;
      k.textContent = String(n);
      k.style.cssText = 'position:fixed;width:26px;height:26px;border-radius:50%;background:#d92d20;color:#fff;font:700 14px/26px Inter,Segoe UI,Arial,sans-serif;text-align:center;box-shadow:0 0 0 2.5px #fff,0 1px 4px rgba(0,0,0,.35);left:' + Math.max(2, px) + 'px;top:' + Math.max(2, py) + 'px';
      wurzel.append(k);
    },
    marken_weg() { const w = document.getElementById('__marken'); if (w) w.remove(); },
    ruhe() { document.querySelectorAll('#toasts > *').forEach(e => e.remove()); try { bannerWeg(); } catch (e) {} document.activeElement && document.activeElement.blur && document.activeElement.blur(); }
  };
})()`;

// ---------- statischer Server (nur für diesen Lauf) ----------
function starteServer() {
  const typen = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
  const srv = http.createServer((req, res) => {
    const pfad = path.join(wurzel, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const datei = pfad.endsWith(path.sep) || pfad === wurzel ? path.join(pfad, 'index.html') : pfad;
    if (!datei.startsWith(wurzel) || !fs.existsSync(datei) || !fs.statSync(datei).isFile()) { res.writeHead(404); res.end('nicht gefunden'); return; }
    res.writeHead(200, { 'Content-Type': typen[path.extname(datei)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(datei).pipe(res);
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok({ srv, url: 'http://127.0.0.1:' + srv.address().port + '/' })));
}

// ---------- Screenshots ----------
async function nimmBilder() {
  fs.mkdirSync(bilder, { recursive: true });
  for (const f of fs.readdirSync(bilder)) fs.rmSync(path.join(bilder, f));
  const { srv, url } = await starteServer();
  const { seite: p, schliessen } = await starteChrome({ breite: BREITE, hoehe: HOEHE });
  const log = m => console.log('  ' + m);
  try {
    await p.ansicht(BREITE, HOEHE, FAKTOR);
    await p.navigiere(url);
    await p.warteBis("typeof APP !== 'undefined' && !!document.querySelector('#inhalt h1')");
    await p.auswerten(SEITENHILFE);
    const js = x => p.auswerten(x);
    const ruhe = async (ms = 500) => { await warte(ms); await js('__A.ruhe()'); await warte(150); };
    const gehe = async (s, o) => { await js(`gehe(${JSON.stringify(s)}${o ? ', ' + JSON.stringify(o) : ''})`); await ruhe(700); };
    const finde = async spec => { const r = await js(`__A.finde(${JSON.stringify(spec)})`); if (!r) throw new Error('Element nicht gefunden: ' + JSON.stringify(spec)); return r; };
    const marke = async (n, spec, o) => { const r = await finde(spec); await js(`__A.marke(${n}, ${JSON.stringify(r)}, ${JSON.stringify(o || {})})`); return r; };
    const klicke = async spec => { const r = await finde(spec); await p.klick(r.x + r.w / 2, r.y + r.h / 2); await warte(500); };
    const bild = async (id, ausschnitt = null) => {
      const buf = await p.foto({ format: FORMAT, qualitaet: 88, ausschnitt });
      fs.writeFileSync(path.join(bilder, id + (FORMAT === 'jpeg' ? '.jpg' : '.png')), buf);
      await js('__A.marken_weg()');
      log(id + ' (' + Math.round(buf.length / 1024) + ' KB)');
    };

    // nicht gefundene Marken melden, aber weitermachen (die Anleitung soll bei kleinen UI-Änderungen nicht scheitern)
    const warnungen = [];
    const marke2 = async (...a) => { try { return await marke(...a); } catch (e) { warnungen.push(e.message); console.warn('  !! ' + e.message); } };
    const ablage = (x, y, w, h) => ({ x, y, w, h });
    const stopp = ms => warte(ms);
    const taste = async k => { const c = { key: k, code: k, windowsVirtualKeyCode: 27 }; await p.sende('Input.dispatchKeyEvent', { type: 'keyDown', ...c }); await p.sende('Input.dispatchKeyEvent', { type: 'keyUp', ...c }); await stopp(400); };

    // 01 Startseite des leeren Programms
    await ruhe(800);
    await marke(1, 'Einrichtung starten'); await marke(2, 'Beispieldaten laden'); await marke(3, 'Projektdatei wählen …'); await marke2(4, 'Anleitung als PDF herunterladen', { pos: 'rechts' });
    await bild('01-start', ablage(0, 0, BREITE, 520));

    // Beispieldaten laden (wie der Knopf „Beispieldaten laden“)
    await js('beispielLaden()'); await ruhe(1200);

    // 02 Übersicht mit Beispielschule
    await gehe('start');
    await marke(1, { text: 'Plan berechnen', sel: 'button', in: '#inhalt' }, { pad: 4 });
    await marke(2, { text: 'Plan-Ampel', teil: true, sel: '#inhalt *', hoch: '.karte' }, { pos: 'rechts' });
    await marke(3, { text: 'In sieben Schritten zum Plan', teil: true, sel: '#inhalt h2, #inhalt h3', hoch: false }, { pos: 'rechts' });
    await bild('02-uebersicht');

    // 03 Kopfleiste und Menü
    await klicke('#kMenue'); await stopp(500);
    await marke(1, '#kProjekt'); await marke(2, '#kUndo'); await marke(3, '#kSuche'); await marke(4, '#kKosten'); await marke(5, '#kBerechnen'); await marke(6, '#kMenue');
    await marke2(7, { text: 'Hilfe und Datenschutz', sel: '[role=menuitem], button, a', hoch: false }, { pos: 'links' });
    await marke2(8, { text: 'Anleitung (PDF)', teil: true, sel: '[role=menuitem], button, a', hoch: false }, { pos: 'links' });
    await bild('03-kopfleiste', ablage(0, 0, BREITE, 440));
    await taste('Escape');

    // 04 Seitenleiste
    await gehe('start');
    await marke2(1, 'Einklappen'); await marke2(2, { text: 'In neun Schritten', sel: '#nav *', hoch: false }, { rahmen: false, pos: 'rechts' }); await marke2(3, { text: '5. Prüfung', teil: true, sel: '#nav button' });
    await bild('04-seitenleiste', ablage(0, 56, 290, 480));

    // 05 Schule & Zeiten
    await gehe('schule');
    await marke2(1, { text: 'Zeitraster & Pausen', sel: '[role=tab], button', in: '#inhalt' }); await marke2(2, { text: 'Unterrichtstage', sel: '#inhalt *', hoch: false }, { rahmen: false, pos: 'links' }); await marke2(3, { text: 'Wochenrhythmus', teil: true, sel: '#inhalt label', hoch: 'label' }, { pos: 'rechts' });
    await bild('05-schule', ablage(INHALT.x, 56, INHALT.w, 480));
    await klicke({ text: 'Zeitraster & Pausen', sel: '[role=tab], button', in: '#inhalt' }); await ruhe(600);
    await marke2(1, { text: '45-Minuten-Raster mit Pausen', sel: 'button' }); await marke2(2, { text: 'Folgende Zeiten mitverschieben', teil: true, sel: '#inhalt label', hoch: 'label' }, { pos: 'rechts' }); await marke2(3, { text: 'Lücke zwischen zwei Stunden – zählt als Pause für die Aufsichten.', sel: '#inhalt *', hoch: false, nth: 0 }, { pos: 'links' });
    await bild('06-zeitraster', ablage(INHALT.x, 56, INHALT.w, 640));

    // 07 Mitarbeitende, 08 Zeiten & Verfügbarkeit
    await gehe('lehrer');
    await marke2(1, { sel: '[data-id]', nth: 0, hoch: false }); await marke2(2, { text: 'Art', sel: '#inhalt *', hoch: false }, { rahmen: false, pos: 'links' }); await marke2(3, { text: 'Wochenarbeitszeit (h)', sel: '#inhalt *', hoch: false }, { rahmen: false, pos: 'links' }); await marke2(4, { text: 'Fächer', sel: '#inhalt h3, #inhalt h4, #inhalt strong, #inhalt div, #inhalt span', hoch: false }, { rahmen: false, pos: 'links' });
    await bild('07-mitarbeitende', ablage(INHALT.x, 56, INHALT.w, 720));
    await js("void personDialog(APP.daten.lehrer[0], 'verf')"); await ruhe(900);
    await marke2(1, { text: 'Verfügbarkeit & Pausen', sel: 'dialog button, dialog [role=tab]' }); await marke2(2, { text: 'Grenzen & Anwesenheit', sel: 'dialog button, dialog [role=tab]' }); await marke2(3, { text: 'Aufsichten', sel: 'dialog button, dialog [role=tab]' }); await marke2(4, { text: 'Alle gesperrt', sel: 'dialog button' });
    await bild('08-verfuegbarkeit');
    await klicke({ text: 'Abbrechen', sel: 'dialog button' }); await ruhe(500);

    // 09 Klassen, 10 Stundentafeln
    await gehe('klassen');
    await marke2(1, { text: 'Massenanlage über Muster', sel: 'h3, h4, strong, div', hoch: '.karte' }); await marke2(2, { text: 'Klasse 5a', teil: true, sel: '[data-id]', hoch: false, nth: 0 }); await marke2(3, { text: 'Klassenleitung', sel: '#inhalt *', hoch: false }, { rahmen: false, pos: 'links' });
    await bild('09-klassen', ablage(INHALT.x, 56, INHALT.w, 700));
    await klicke({ text: 'Stundentafeln', sel: '[role=tab], button', in: '#inhalt' }); await ruhe(800);
    await marke2(1, { sel: '#inhalt input[type=number], #inhalt input', nth: 0, hoch: false }); await marke2(2, { text: 'Co 2', sel: '#inhalt *', hoch: false });
    await bild('10-stundentafeln', ablage(INHALT.x, 56, INHALT.w, 560));

    // 11 Prüfung, 12 Berechnung (Einstellungen)
    await gehe('pruefung');
    await marke2(1, { text: 'keine Fehler', teil: true, sel: '#inhalt *', hoch: false }); await marke2(2, { text: 'Plan berechnen', sel: 'button', in: '#inhalt' }); await marke2(3, { text: 'Aufsichten:', teil: true, sel: '#inhalt *', hoch: '.banner, .hinweis, div' });
    await bild('11-pruefung', ablage(INHALT.x, 56, INHALT.w, 420));
    await gehe('berechnung');
    await marke2(1, { text: 'Rechenzeit', sel: '#inhalt *', hoch: false }, { rahmen: false, pos: 'links' }); await marke2(2, { text: 'Ausgangspunkt', sel: '#inhalt *', hoch: false }, { rahmen: false, pos: 'links' }); await marke2(3, { text: 'Plan berechnen', sel: 'button', in: '#inhalt' });
    await bild('12-berechnung', ablage(INHALT.x, 56, INHALT.w, 520));

    // Berechnung starten (wie ein Klick auf „Plan berechnen“)
    await js("rechnungKonfSetzen('zeitlimit', " + RECHENZEIT + ")");
    await js("gehe('berechnung')"); await ruhe(500);
    await klicke('#kBerechnen'); await stopp(7000); await js('__A.ruhe()');
    await marke2(1, { text: 'Stoppen und besten Plan übernehmen', sel: 'button' }); await marke2(2, { text: 'Co-Lehrkräfte', sel: '#inhalt *', hoch: 'ol, ul, .schritte' }); await marke2(3, { text: 'Rechenzeit', sel: '#inhalt *', hoch: false }, { rahmen: false, pos: 'links' });
    await bild('13-berechnung-laeuft', ablage(INHALT.x, 56, INHALT.w, 560));
    await p.warteBis('!APP.rechnung.laeuft && !!APP.rechnung.ergebnis', { timeout: 240000 }); await ruhe(1500);
    await gehe('berechnung');
    await marke2(1, { text: 'Im Editor öffnen', sel: 'button', in: '#inhalt' }); await marke2(2, { text: 'Co-Lehrkräfte', sel: '#inhalt *', hoch: 'ol, ul, .schritte' });
    await bild('14-berechnung-fertig', ablage(INHALT.x, 56, INHALT.w, 470));

    // 15 Aufsichten (nach der Berechnung)
    await gehe('aufsicht');
    await marke2(1, { text: 'Aufsichten planen', sel: 'button', in: '#inhalt' }); await marke2(2, { text: 'Pausen aus dem Zeitraster und Springer', sel: '#inhalt *', hoch: false }, { pos: 'links' }); await marke2(3, { text: 'Wochenübersicht', sel: '#inhalt *', hoch: false }, { pos: 'links' }); await marke2(4, { sel: '#inhalt table td, #inhalt [data-id]', nth: 3, hoch: false });
    await bild('15-aufsichten', ablage(INHALT.x, 56, INHALT.w, 640));

    // 16 Plan-Editor: Klassenplan
    await gehe('editor');
    await marke2(1, { sel: '#inhalt select', nth: 0, hoch: false }); await marke2(2, { sel: '.plangrid .kachel[data-e]', nth: 3, hoch: false }); await marke2(3, { text: 'Details', sel: '[role=tab], button' }); await marke2(4, { text: 'Ablage', sel: '*', hoch: '.ablage' }); await marke2(5, { text: 'Offene Punkte', sel: 'button', in: '#inhalt' });
    await bild('16-editor', INHALT);

    // 17 Kachelmenü (Rechtsklick auf eine Stunde)
    await js("(() => { const k = document.querySelectorAll('.plangrid .kachel[data-e]')[0]; const r = k.getBoundingClientRect(); k.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 30, clientY: r.y + 20 })); })()"); await stopp(600);
    await bild('17-kachelmenue', ablage(296, 56, 700, HOEHE - 56));
    await taste('Escape');

    // 18 Ziehen: grün/gelb/rot am Ziel
    const q = await finde({ sel: '.plangrid .kachel[data-e]', nth: 2, hoch: false });
    await p.maus('mouseMoved', q.x + q.w / 2, q.y + q.h / 2, { button: 'none', clickCount: 0 });
    await p.maus('mousePressed', q.x + q.w / 2, q.y + q.h / 2);
    for (let i = 1; i <= 8; i++) { await p.maus('mouseMoved', q.x + q.w / 2 + i * 25, q.y + q.h / 2 + i * 12, { button: 'left', clickCount: 0 }); await stopp(40); }
    await stopp(500);
    await bild('18-ziehen', ablage(296, 56, 700, HOEHE - 56));
    await js("document.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true }))"); await p.maus('mouseReleased', q.x + q.w / 2 + 200, q.y + q.h / 2 + 96); await stopp(500); await js('__A.ruhe()');

    // 19 Ergebnis & Auswertung, 20 GTA-Planer, 21 Gesamtansicht, 22 Druck & Export, 23 Stände
    await gehe('auswertung');
    await marke2(1, { text: 'Prüfung des fertigen Plans', teil: true, sel: '#inhalt *', hoch: false }, { pos: 'links' }); await marke2(2, { text: 'Hinweise zur Qualität', sel: '#inhalt *', hoch: false }, { pos: 'links' }); await marke2(3, { text: 'Offene Punkte', sel: '#inhalt h2, #inhalt h3', hoch: false }, { pos: 'links' }); await marke2(4, { text: 'Auslastung', sel: '[role=tab], button' });
    await bild('19-auswertung', ablage(INHALT.x, 56, INHALT.w, 700));
    await gehe('gta');
    await marke2(1, { text: 'Freie Kapazität', teil: true, sel: '#inhalt h2, #inhalt h3, #inhalt strong', hoch: '.karte' }); await marke2(2, { text: 'Wochenraster', teil: true, sel: '#inhalt h2, #inhalt h3, #inhalt strong', hoch: '.karte' }, { pos: 'rechts' }); await marke2(3, { text: 'Neue GTA', teil: true, sel: '#inhalt button', nth: 0 });
    await bild('20-gta', ablage(INHALT.x, 56, INHALT.w, 700));
    await gehe('gesamtansicht');
    await marke2(1, { text: 'Tag × Personen', sel: 'button' }); await marke2(2, { text: 'Person × Woche', sel: 'button' }); await marke2(3, { text: 'Besetzung Montag', teil: true, sel: '#inhalt *', hoch: false }, { pos: 'links' }); await marke2(4, { text: 'Aufsichten planen', sel: 'button', in: '#inhalt' });
    await bild('21-gesamtansicht', ablage(INHALT.x, 56, INHALT.w, 720));
    await gehe('ausgabe');
    await marke2(1, { sel: '#inhalt select', nth: 0, hoch: false }); await marke2(2, { text: 'Drucken / als PDF', sel: 'button' }); await marke2(3, { text: 'Schwarzweiß (Muster je Fach)', teil: true, sel: '#inhalt label', hoch: 'label' }, { pos: 'rechts' });
    await bild('22-druck', ablage(INHALT.x, 56, INHALT.w, 640));
    await js("standSpeichern('Entwurf 1')"); await ruhe(600);
    await gehe('staende');
    await marke2(1, { text: 'Aktuellen Plan als Stand speichern', sel: 'button' }); await marke2(2, { text: 'Vergleich', sel: '#inhalt *', hoch: false }, { pos: 'links' });
    await bild('23-staende', ablage(INHALT.x, 56, INHALT.w, 520));
    if (warnungen.length) console.warn('Warnungen: ' + warnungen.length);
  } finally { await schliessen(); srv.close(); }
}


// ---------- PDF ----------
// Chrome druckt die Anleitung (A4, Fußzeile, Lesezeichen). Die Seitenzahlen im Inhaltsverzeichnis werden in einem ersten Lauf
// aus den Lesezeichen der erzeugten PDF gelesen und im zweiten Lauf eingesetzt.
function seitenAusPdf(buf) {
  // Skia schreibt Seiten und Lesezeichen als unkomprimierte Objekte: /Type /Page … und Outline-Einträge /Title <UTF-16> /Dest [<Seite> 0 R …]
  const roh = buf.toString('latin1');
  const objekte = new Map();
  for (const m of roh.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) objekte.set(Number(m[1]), m[2]);
  const seiten = [];
  const kids = [...objekte.entries()].find(([, v]) => /\/Type\s*\/Pages/.test(v) && /\/Kids/.test(v) && !/\/Parent/.test(v));
  const sammle = nr => { const o = objekte.get(nr) || ''; if (/\/Type\s*\/Pages/.test(o)) { const k = o.match(/\/Kids\s*\[([^\]]*)\]/); if (k) [...k[1].matchAll(/(\d+) 0 R/g)].forEach(x => sammle(Number(x[1]))); } else seiten.push(nr); };
  if (kids) sammle(kids[0]);
  const ergebnis = new Map();
  for (const [, v] of objekte) {
    const titel = v.match(/\/Title\s*<([0-9A-Fa-f]+)>/) || v.match(/\/Title\s*\(([^)]*)\)/);
    const ziel = v.match(/\/Dest\s*\[\s*(\d+) 0 R/);
    if (!titel || !ziel) continue;
    let text = titel[1];
    if (/^[0-9A-Fa-f]+$/.test(text) && text.length % 4 === 0) text = Buffer.from(text.replace(/^FEFF/i, ''), 'hex').swap16().toString('utf16le'); else text = Buffer.from(text, 'latin1').toString('latin1');
    const idx = seiten.indexOf(Number(ziel[1]));
    if (idx >= 0) ergebnis.set(text, idx + 1);
  }
  return { seiten: seiten.length, titel: ergebnis };
}

async function schreibePdf() {
  const { seite: p, schliessen } = await starteChrome({ breite: 1000, hoehe: 1400 });
  const stand = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const datei = pathToFileURL(path.join(quelle, 'anleitung.html')).href;
  const drucke = async () => {
    await p.navigiere(datei);
    await p.auswerten("document.querySelectorAll('[data-stand]').forEach(e => { e.textContent = " + JSON.stringify(stand) + "; })");
    await p.auswerten('document.fonts.ready.then(() => true)');
    await p.warteBis("[...document.images].every(i => i.complete && i.naturalWidth > 0)", { timeout: 60000 });
    const r = await p.sende('Page.printToPDF', {
      paperWidth: 8.27, paperHeight: 11.69, marginTop: 0.63, marginBottom: 0.71, marginLeft: 0.63, marginRight: 0.63, printBackground: true, preferCSSPageSize: true,
      displayHeaderFooter: true, headerTemplate: '<span></span>',
      footerTemplate: '<div style="width:100%;font:8px Segoe UI,Arial,sans-serif;color:#5b6475;padding:0 17mm;display:flex;justify-content:space-between"><span>Stundenplaner – Anleitung · Stand ' + stand + '</span><span>Seite <span class="pageNumber"></span> von <span class="totalPages"></span></span></div>',
      generateDocumentOutline: true, generateTaggedPDF: true
    });
    return Buffer.from(r.data, 'base64');
  };
  try {
    let buf = await drucke();
    const { seiten, titel } = seitenAusPdf(buf);
    // Kapitelüberschriften lauten im Lesezeichen z. B. "1Schnellstart in zehn Minuten" (Nummer + Titel ohne Leerraum)
    const kapitel = await p.auswerten("[...document.querySelectorAll('.kapitel')].map(k => ({ id: k.id, titel: [...k.querySelector('h1').childNodes].filter(n => !(n.classList && n.classList.contains('nr'))).map(n => n.textContent).join('').trim() }))");
    const zuordnung = {};
    const norm = x => x.replace(/\s+/g, '');
    for (const k of kapitel) { for (const [t, s] of titel) { if (!zuordnung[k.id] && norm(t).includes(norm(k.titel))) zuordnung[k.id] = s; } }
    const gefunden = Object.keys(zuordnung).length;
    if (gefunden === kapitel.length) {
      await p.auswerten('(' + (z => { document.querySelectorAll('[data-ziel]').forEach(e => { if (z[e.dataset.ziel]) e.textContent = z[e.dataset.ziel]; }); }).toString() + ')(' + JSON.stringify(zuordnung) + ')');
      // zweiter Lauf mit Seitenzahlen (die Zahlen ändern die Seitenaufteilung nicht)
      await p.auswerten("document.querySelectorAll('[data-stand]').forEach(e => { e.textContent = " + JSON.stringify(stand) + "; })");
      const r = await p.sende('Page.printToPDF', {
        paperWidth: 8.27, paperHeight: 11.69, marginTop: 0.63, marginBottom: 0.71, marginLeft: 0.63, marginRight: 0.63, printBackground: true, preferCSSPageSize: true,
        displayHeaderFooter: true, headerTemplate: '<span></span>',
        footerTemplate: '<div style="width:100%;font:8px Segoe UI,Arial,sans-serif;color:#5b6475;padding:0 17mm;display:flex;justify-content:space-between"><span>Stundenplaner – Anleitung · Stand ' + stand + '</span><span>Seite <span class="pageNumber"></span> von <span class="totalPages"></span></span></div>',
        generateDocumentOutline: true, generateTaggedPDF: true
      });
      buf = Buffer.from(r.data, 'base64');
      console.log('Inhaltsverzeichnis: Seitenzahlen eingesetzt (' + gefunden + ' Kapitel)');
    } else {
      console.warn('!! Seitenzahlen konnten nicht aus der PDF gelesen werden (' + gefunden + '/' + kapitel.length + ' Kapitel) – Inhaltsverzeichnis ohne Seitenzahlen.');
    }
    fs.writeFileSync(pdfDatei, buf);
    console.log('PDF: ' + path.relative(wurzel, pdfDatei) + ' (' + Math.round(buf.length / 1024) + ' KB, ' + seiten + ' Seiten)');
  } finally { await schliessen(); }
}

if (!opt('nur-pdf')) await nimmBilder();
if (!opt('nur-bilder')) await schreibePdf();
console.log('fertig');
