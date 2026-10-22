// Minimaler Chrome-Steuerer über das DevTools-Protokoll (ohne Abhängigkeiten; nutzt den in Node eingebauten WebSocket).
// Startet Chrome headless mit einem leeren, temporären Profil – es sind also nie fremde Browserdaten im Spiel.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const KANDIDATEN = [
  process.env.CHROME_PFAD,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

export function findeChrome() {
  const p = KANDIDATEN.find(x => fs.existsSync(x));
  if (!p) throw new Error('Chrome/Edge nicht gefunden (Pfad in CHROME_PFAD setzen).');
  return p;
}

const warte = ms => new Promise(r => setTimeout(r, ms));

export class Seite {
  constructor(ws) { this.ws = ws; this.id = 0; this.offen = new Map(); this.ereignisse = []; this.hoerer = new Map();
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.offen.has(m.id)) { const { ok, fehler } = this.offen.get(m.id); this.offen.delete(m.id); m.error ? fehler(new Error(m.error.message)) : ok(m.result); return; }
      if (m.method) (this.hoerer.get(m.method) || []).forEach(f => f(m.params));
    });
  }
  sende(methode, params = {}) { return new Promise((ok, fehler) => { const id = ++this.id; this.offen.set(id, { ok, fehler }); this.ws.send(JSON.stringify({ id, method: methode, params })); }); }
  auf(methode, f) { if (!this.hoerer.has(methode)) this.hoerer.set(methode, []); this.hoerer.get(methode).push(f); }
  // JavaScript im Seitenkontext auswerten (Promises werden abgewartet); gibt den Wert zurück
  async auswerten(ausdruck) {
    const r = await this.sende('Runtime.evaluate', { expression: ausdruck, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error('Seitenfehler: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
    return r.result.value;
  }
  async warteBis(ausdruck, { timeout = 30000, takt = 150 } = {}) {
    const ende = Date.now() + timeout;
    for (;;) { if (await this.auswerten(ausdruck)) return true; if (Date.now() > ende) throw new Error('Zeitüberschreitung: ' + ausdruck); await warte(takt); }
  }
  async navigiere(url) { const geladen = new Promise(r => this.auf('Page.loadEventFired', r)); await this.sende('Page.navigate', { url }); await geladen; }
  async ansicht(breite, hoehe, faktor = 1, mobil = false) { await this.sende('Emulation.setDeviceMetricsOverride', { width: breite, height: hoehe, deviceScaleFactor: faktor, mobile: mobil }); }
  // Bildschirmfoto (optional nur ein Ausschnitt in CSS-Pixeln) → Buffer
  async foto({ format = 'png', qualitaet = 90, ausschnitt = null } = {}) {
    const p = { format, captureBeyondViewport: false };
    if (format === 'jpeg') p.quality = qualitaet;
    if (ausschnitt) p.clip = { x: ausschnitt.x, y: ausschnitt.y, width: ausschnitt.w, height: ausschnitt.h, scale: 1 };
    const r = await this.sende('Page.captureScreenshot', p);
    return Buffer.from(r.data, 'base64');
  }
  async maus(typ, x, y, extra = {}) { return this.sende('Input.dispatchMouseEvent', Object.assign({ type: typ, x, y, button: 'left', clickCount: 1 }, extra)); }
  async klick(x, y) { await this.maus('mouseMoved', x, y, { button: 'none', clickCount: 0 }); await this.maus('mousePressed', x, y); await this.maus('mouseReleased', x, y); }
}

export async function starteChrome({ breite = 1440, hoehe = 900 } = {}) {
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'stundenplaner-chrome-'));
  const proc = spawn(findeChrome(), [
    '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profil, `--window-size=${breite},${hoehe}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--force-color-profile=srgb',
    '--hide-scrollbars', '--lang=de-DE', '--accept-lang=de-DE', 'about:blank'
  ], { stdio: 'ignore' });
  const portDatei = path.join(profil, 'DevToolsActivePort');
  const ende = Date.now() + 20000;
  while (!fs.existsSync(portDatei)) { if (Date.now() > ende) { proc.kill(); throw new Error('Chrome startet nicht.'); } await warte(100); }
  const port = fs.readFileSync(portDatei, 'utf8').split('\n')[0];
  let ziel;
  for (let i = 0; i < 50 && !ziel; i++) {
    try { ziel = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch { /* noch nicht bereit */ }
    if (!ziel) await warte(100);
  }
  const ws = new WebSocket(ziel.webSocketDebuggerUrl);
  await new Promise((ok, fehler) => { ws.addEventListener('open', ok); ws.addEventListener('error', fehler); });
  const seite = new Seite(ws);
  await seite.sende('Page.enable'); await seite.sende('Runtime.enable');
  const schliessen = async () => { try { await seite.sende('Browser.close'); } catch { /* beendet */ } try { proc.kill(); } catch { /* weg */ } await warte(300); try { fs.rmSync(profil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows hält Dateien kurz fest */ } };
  return { seite, schliessen };
}
