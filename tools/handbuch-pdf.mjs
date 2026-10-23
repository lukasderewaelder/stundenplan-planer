// PDF des Benutzerhandbuchs: setzt die Kapitel aus handbuch/quelle/ zusammen, nummeriert Überschriften, baut das Inhaltsverzeichnis
// (Seitenzahlen aus den PDF-Lesezeichen) und druckt über Chrome (A4, Kopf-/Fußzeile über @page-Randfelder in handbuch.css).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { starteChrome } from './chrome-cdp.mjs';

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quelle = path.join(wurzel, 'handbuch', 'quelle');
export const pdfDatei = path.join(wurzel, 'handbuch', 'Stundenplaner-Handbuch.pdf');

export function setzeZusammen() {
  const vorlage = fs.readFileSync(path.join(quelle, 'handbuch.html'), 'utf8');
  const dir = path.join(quelle, 'kapitel');
  const teile = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.html')).sort().map(f => fs.readFileSync(path.join(dir, f), 'utf8')) : [];
  const html = vorlage.replace('<!--KAPITEL-->', teile.join('\n'));
  const ziel = path.join(quelle, '_gesamt.html');
  fs.writeFileSync(ziel, html);
  return ziel;
}

// läuft in der Seite: Nummerierung, Verweise, Inhaltsverzeichnis
const AUFBAU = `(stand) => {
  document.querySelectorAll('[data-stand]').forEach(e => { e.textContent = stand; });
  document.documentElement.style.setProperty('--stand', JSON.stringify(stand));
  const ueberschriften = [];
  let k = 0;
  document.querySelectorAll('.kapitel').forEach(kap => {
    k++;
    let m = 0;
    kap.querySelectorAll(':scope > h1, :scope > h2').forEach(h => {
      const istK = h.tagName === 'H1';
      if (!istK) m++;
      const nr = istK ? String(k) : k + '.' + m;
      h.dataset.nr = nr;
      const sp = document.createElement('span'); sp.className = 'nr'; sp.textContent = nr; h.prepend(sp);
      if (!h.id) h.id = istK ? 'k' + k : 'k' + k + '-' + m;
      ueberschriften.push({ id: h.id, nr, ebene: istK ? 1 : 2, text: h.textContent.replace(nr, '').trim() });
    });
  });
  // Abbildungen nummerieren
  let a = 0;
  document.querySelectorAll('figure').forEach(f => {
    a++; f.dataset.nr = String(a);
    const c = f.querySelector('figcaption');
    if (c) { const b = document.createElement('b'); b.textContent = 'Abbildung ' + a + ': '; c.prepend(b); }
  });
  // Verweise: <a data-ref="k3-7"> bzw. <a data-ref="abb-xyz">
  const fehlend = [];
  document.querySelectorAll('a[data-ref]').forEach(l => {
    let z = document.getElementById(l.dataset.ref);
    if (z && z.classList.contains('kapitel')) z = z.querySelector(':scope > h1');
    if (!z) { fehlend.push(l.dataset.ref); l.textContent = '?'; return; }
    l.classList.add('ref'); l.setAttribute('href', '#' + z.id);
    l.textContent = z.dataset.nr ? (z.tagName === 'FIGURE' ? 'Abbildung ' + z.dataset.nr : z.dataset.nr) : '?';
  });
  // Inhaltsverzeichnis
  const ol = document.querySelector('#toc-liste');
  if (ol) ueberschriften.forEach(u => {
    const li = document.createElement('li'); li.className = 'k' + u.ebene;
    li.innerHTML = '<span class="nr"></span><a></a><span class="punkte"></span><span class="seite" data-ziel=""></span>';
    li.querySelector('.nr').textContent = u.nr;
    const l = li.querySelector('a'); l.href = '#' + u.id; l.textContent = u.text;
    li.querySelector('.seite').dataset.ziel = u.id;
    ol.append(li);
  });
  return { ueberschriften, fehlend, abbildungen: a };
}`;

// Seiten und Lesezeichen aus der PDF lesen (Skia schreibt Seitenbaum und Outline als unkomprimierte Objekte)
export function seitenAusPdf(buf) {
  const roh = buf.toString('latin1');
  const objekte = new Map();
  for (const m of roh.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) objekte.set(Number(m[1]), m[2]);
  const seiten = [];
  const wurzelBaum = [...objekte.entries()].find(([, v]) => /\/Type\s*\/Pages/.test(v) && /\/Kids/.test(v) && !/\/Parent/.test(v));
  const sammle = nr => { const o = objekte.get(nr) || ''; if (/\/Type\s*\/Pages/.test(o)) { const k = o.match(/\/Kids\s*\[([^\]]*)\]/); if (k) [...k[1].matchAll(/(\d+) 0 R/g)].forEach(x => sammle(Number(x[1]))); } else seiten.push(nr); };
  if (wurzelBaum) sammle(wurzelBaum[0]);
  const eintraege = [];
  for (const [nr, v] of objekte) {
    const titel = v.match(/\/Title\s*<([0-9A-Fa-f]+)>/) || v.match(/\/Title\s*\(([^)]*)\)/);
    const ziel = v.match(/\/Dest\s*\[\s*(\d+) 0 R/);
    if (!titel || !ziel) continue;
    let text = titel[1];
    if (/^[0-9A-Fa-f]+$/.test(text) && text.length % 4 === 0) text = Buffer.from(text.replace(/^FEFF/i, ''), 'hex').swap16().toString('utf16le'); else text = Buffer.from(text, 'latin1').toString('latin1');
    const idx = seiten.indexOf(Number(ziel[1]));
    if (idx >= 0) eintraege.push({ nr, text, seite: idx + 1 });
  }
  eintraege.sort((a, b) => a.nr - b.nr); // Objektnummern folgen der Dokumentreihenfolge der Lesezeichen
  return { seiten: seiten.length, eintraege };
}

const norm = x => x.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

export async function schreibePdf() {
  const ziel = setzeZusammen();
  const { seite: p, schliessen } = await starteChrome({ breite: 1000, hoehe: 1400 });
  const stand = new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  try {
    await p.navigiere(pathToFileURL(ziel).href);
    await p.auswerten('document.fonts.ready.then(() => true)');
    const info = await p.auswerten('(' + AUFBAU + ')(' + JSON.stringify(stand) + ')');
    if (info.fehlend.length) console.warn('!! Querverweise ohne Ziel: ' + [...new Set(info.fehlend)].join(', '));
    const defekt = await p.auswerten("[...document.images].filter(i => !(i.complete && i.naturalWidth > 0)).map(i => i.getAttribute('src'))");
    if (defekt.length) console.warn('!! Bilder fehlen: ' + defekt.join(', '));
    const druck = async () => Buffer.from((await p.sende('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, generateDocumentOutline: true, generateTaggedPDF: true })).data, 'base64');
    let buf = await druck();
    // Seitenzahlen ins Inhaltsverzeichnis einsetzen (der zweite Lauf hat dieselbe Seitenaufteilung)
    const { seiten, eintraege } = seitenAusPdf(buf);
    const zuord = {};
    let zeiger = 0;
    for (const u of info.ueberschriften) {
      for (let i = zeiger; i < eintraege.length; i++) {
        if (norm(eintraege[i].text).includes(norm(u.text))) { zuord[u.id] = eintraege[i].seite; zeiger = i + 1; break; }
      }
    }
    const gefunden = Object.keys(zuord).length;
    if (gefunden === info.ueberschriften.length) {
      await p.auswerten('((z) => { document.querySelectorAll(".seite[data-ziel]").forEach(e => { if (z[e.dataset.ziel]) e.textContent = z[e.dataset.ziel]; }); })(' + JSON.stringify(zuord) + ')');
      buf = await druck();
      console.log('Inhaltsverzeichnis: Seitenzahlen eingesetzt (' + gefunden + ' Überschriften)');
    } else console.warn('!! Seitenzahlen: nur ' + gefunden + ' von ' + info.ueberschriften.length + ' Überschriften zugeordnet (fehlt: ' + info.ueberschriften.filter(u => !zuord[u.id]).map(u => u.nr + ' ' + u.text).join('; ') + ') – Inhaltsverzeichnis ohne Seitenzahlen.');
    fs.writeFileSync(pdfDatei, buf);
    console.log('PDF: ' + path.relative(wurzel, pdfDatei) + ' (' + Math.round(buf.length / 1024) + ' KB, ' + seiten + ' Seiten, ' + info.abbildungen + ' Abbildungen)');
    return { seiten, abbildungen: info.abbildungen };
  } finally { await schliessen(); }
}
