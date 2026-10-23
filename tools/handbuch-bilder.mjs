// Aufnahme der Bildschirmfotos für das Benutzerhandbuch (Chrome headless über das DevTools-Protokoll).
// Es werden ausschließlich die eingebauten Beispieldaten („Beispielschule“) gezeigt – ein frisches, leeres Chrome-Profil, keine fremden Daten.
// Aufbau: Kapitel-Funktionen (K[1], K[2] …) nehmen ihre Bilder aus dem Zustand „Beispielschule mit berechnetem Plan“ auf.
// Dieser Zustand wird beim ersten Lauf berechnet und unter handbuch/_zustand.json zwischengespeichert; Teilläufe (--kapitel 3,5) laden ihn.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { starteChrome } from './chrome-cdp.mjs';

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bilder = path.join(wurzel, 'handbuch', 'bilder');
const zustandDatei = path.join(wurzel, 'handbuch', '_zustand.json');
const warte = ms => new Promise(r => setTimeout(r, ms));
export const BREITE = 1280, HOEHE = 860, FAKTOR = 1.5;
const INHALT = { x: 284, y: 56, w: BREITE - 284, h: HOEHE - 56 }; // Arbeitsfläche ohne Kopfleiste und Seitenleiste
const A = (x, y, w, h) => ({ x, y, w, h });

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
        liste = liste.filter(e => ![...e.children].some(c => liste.includes(c))); // jeweils das tiefste passende Element
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
      const dlg = document.querySelector('dialog[open]'); // Marken müssen im Dialog liegen, sonst verdeckt ihn die Top-Layer-Ebene
      let wurzel = (dlg || document).querySelector('#__marken');
      if (!wurzel) { wurzel = document.createElement('div'); wurzel.id = '__marken'; wurzel.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000;pointer-events:none'; (dlg || document.body).append(wurzel); }
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
    marken_weg() { document.querySelectorAll('#__marken').forEach(w => w.remove()); },
    ruhe() { document.querySelectorAll('#toasts > *').forEach(e => e.remove()); try { bannerWeg(); } catch (e) {} document.activeElement && document.activeElement.blur && document.activeElement.blur(); }
  };
})()`;

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

export async function nimmBilder({ kapitel = null, zeit = 20, format = 'png', kapitelTabelle }) {
  fs.mkdirSync(bilder, { recursive: true });
  const nurTeil = !!kapitel;
  if (!nurTeil) for (const f of fs.readdirSync(bilder)) fs.rmSync(path.join(bilder, f));
  const { srv, url } = await starteServer();
  const { seite: p, schliessen } = await starteChrome({ breite: BREITE, hoehe: HOEHE });
  const warnungen = [];
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
    // nicht gefundene Marken melden, aber weitermachen (das Handbuch soll bei kleinen UI-Änderungen nicht scheitern)
    const marke2 = async (...a) => { try { return await marke(...a); } catch (e) { warnungen.push(e.message); console.warn('  !! ' + e.message); } };
    const klicke = async spec => { const r = await finde(spec); await p.klick(r.x + r.w / 2, r.y + r.h / 2); await warte(500); };
    const klicke2 = async spec => { try { await klicke(spec); return true; } catch (e) { warnungen.push(e.message); console.warn('  !! ' + e.message); return false; } };
    const taste = async k => { const c = { key: k, code: k, windowsVirtualKeyCode: k === 'Escape' ? 27 : 13 }; await p.sende('Input.dispatchKeyEvent', { type: 'keyDown', ...c }); await p.sende('Input.dispatchKeyEvent', { type: 'keyUp', ...c }); await warte(400); };
    const bild = async (id, ausschnitt = null) => {
      const buf = await p.foto({ format, qualitaet: 88, ausschnitt });
      fs.writeFileSync(path.join(bilder, id + (format === 'jpeg' ? '.jpg' : '.png')), buf);
      await js('__A.marken_weg()');
      console.log('  ' + id + ' (' + Math.round(buf.length / 1024) + ' KB)');
    };
    // Ausschnitt um das oberste offene Dialogfenster (mit Rand)
    const bildDialog = async (id, rand = 14) => {
      const r = await finde({ sel: 'dialog[open]', hoch: false });
      await bild(id, A(Math.max(0, r.x - rand), Math.max(0, r.y - rand), Math.min(BREITE, r.w + 2 * rand), Math.min(HOEHE, r.h + 2 * rand)));
    };
    const schliesseDialog = async () => { await taste('Escape'); await warte(300); };
    const expert = async an => { await js(`(() => { APP.meta.experte = ${an ? 'true' : 'false'}; metaSpeichern(); navBauen(); render(); })()`); await ruhe(500); };
    const stopp = warte;
    const zustandLaden = async () => {
      const z = fs.readFileSync(zustandDatei, 'utf8');
      await js(`(() => { const z = JSON.parse(${JSON.stringify(z)}); aendern('Zustand laden', d => { Object.keys(d).forEach(k => { delete d[k]; }); Object.assign(d, z); }); APP.editor.id = null; APP.editor.id2 = null; APP.banner = []; gehe('start'); })()`);
      await ruhe(1000);
    };
    const ctx = { p, js, ruhe, gehe, finde, marke, marke2, klicke, klicke2, taste, bild, bildDialog, schliesseDialog, expert, stopp, zustandLaden, A, INHALT, BREITE, HOEHE, warnungen, zeit, warte };

    // --- Vorbereitung: Beispielschule mit berechnetem Plan (einmal rechnen, dann zwischenspeichern) ---
    const brauchtRechnung = !nurTeil || !fs.existsSync(zustandDatei);
    if (!nurTeil && kapitelTabelle[2] && kapitelTabelle[2].vorher) await kapitelTabelle[2].vorher(ctx); // z. B. Startseite des leeren Projekts
    if (brauchtRechnung) {
      await js('beispielLaden()'); await ruhe(1200);
      await js("rechnungKonfSetzen('zeitlimit', " + zeit + ")");
      await gehe('berechnung');
      await js("document.querySelector('#kBerechnen').click()");
      await p.warteBis('!APP.rechnung.laeuft && !!APP.rechnung.ergebnis', { timeout: 300000 }); await ruhe(1500);
      const z = await js('JSON.stringify(APP.daten)');
      fs.writeFileSync(zustandDatei, z);
    } else {
      await js('beispielLaden()'); await ruhe(800);
      await zustandLaden();
    }

    const liste = (kapitel || Object.keys(kapitelTabelle).join(',')).split(',').map(x => x.trim()).filter(Boolean);
    for (const k of liste) {
      const f = kapitelTabelle[k];
      if (!f || !f.bilder) { console.warn('Kapitel ' + k + ': keine Aufnahmen definiert'); continue; }
      console.log('Kapitel ' + k);
      await zustandLaden(); await expert(false);
      try { await f.bilder(ctx); } catch (e) { warnungen.push('Kapitel ' + k + ': ' + e.message); console.warn('  !! Kapitel ' + k + ' abgebrochen: ' + e.message); }
    }
    if (warnungen.length) console.warn('Warnungen: ' + warnungen.length);
  } finally { await schliessen(); srv.close(); }
  return warnungen;
}
