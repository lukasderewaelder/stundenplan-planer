'use strict';
/* =====================================================================
   5. OBERFLÄCHE – Grundlagen
   Ein zentrales Zustandsobjekt (APP.daten); alle Ansichten werden daraus gerendert.
   ===================================================================== */
const APP = {
  daten: null,
  meta: { letzterExport: 0, ersterStand: 0, rechnung: null, druck: null },
  seite: 'start',
  undo: [], redo: [],
  cache: null,              // { M, P, bewertung }
  mach: [], machTimer: 0,
  speicherTimer: 0, speicherStatus: 'Noch nicht gespeichert',
  editor: { art: 'klasse', id: null, art2: 'lehrer', id2: null, parallel: false, sel: -1, ablageAlle: false, woche: 'alle', woche2: 'alle', palette: 'lehrer', paletteFilter: '' },
  rechnung: { laeuft: false, worker: null, fortschritt: null, verlauf: [], vorschau: null, ergebnis: null, start: 0, vorschauKlasse: null },
  tabellen: {},
  auswertung: { filter: 'alle', offen: null }
};
const RECHNUNG_STD = { zeitlimit: 60, iterLimit: 0, startwert: 'leer', minimal: false, seed: 20260929, teilArt: '', teilId: '' };
const DRUCK_STD = { art: 'klassen', auswahl: 'alle', zeiten: true, raeume: true, vollnamen: false, pausen: true, farbe: true, woche: 'beide', aufsichten: true, gruppen: true };

// ---------- DOM-Hilfen ----------
function h(tag, p, ...kids) {
  const el = document.createElement(tag);
  let wert;
  if (p) for (const k in p) {
    const v = p[k];
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const sk in v) { if (sk.startsWith('--')) el.style.setProperty(sk, v[sk]); else if (v[sk] !== undefined && v[sk] !== null) el.style[sk] = v[sk]; } }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'value') wert = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'draggable' || k === 'open') el[k] = !!v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  if (wert !== undefined) el.value = wert;
  return el;
}
const $ = sel => document.querySelector(sel);
// Entfernt alle Kinder. Verliert dabei ein Feld den Fokus und zeichnet sein Änderungs-Ereignis denselben Bereich neu, wird ein zweites Mal geleert (sonst stünde der Inhalt doppelt da).
function leeren(el) { for (let i = 0; i < 3; i++) { try { el.replaceChildren(); } catch (err) { /* Knoten wurde in einem blur-Handler schon entfernt */ } if (!el.firstChild) break; } return el; }
function uhrzeit(t) { const d = t ? new Date(t) : new Date(); return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }
function datum(t) { const d = t ? new Date(t) : new Date(); return d.toLocaleDateString('de-DE'); }
function sel(opts, wert, onchange, attrs) {
  return h('select', Object.assign({ onchange: ev => onchange(ev.target.value), value: wert == null ? '' : String(wert) }, attrs || {}),
    opts.map(function opt(o) { return Array.isArray(o) ? h('option', { value: o[0] }, o[1]) : (o && typeof o === 'object' && o.gruppe) ? (o.opts.length ? h('optgroup', { label: o.gruppe }, o.opts.map(opt)) : null) : h('option', { value: o }, o); }));
}
// Seitenkopf: Titel, ein Satz Beschreibung; der Rest der Beschreibung steht eingeklappt hinter „Mehr erfahren“ (bleibt je Seite auf- oder zugeklappt).
function ersterSatz(text) {
  const t = String(text || '').trim();
  const ABK = /(?:^|[\s(„])(?:z|B|u|a|d|h|o|ä|S|bzw|ggf|inkl|max|min|Std|Nr|ca|vgl|evtl|usw|Jg|Kl|Tel|sog|bspw)$/;
  const rx = /[.!?](?=\s+[A-ZÄÖÜ„])/g; let m;
  while ((m = rx.exec(t))) {
    const vor = t.slice(0, m.index);
    if (m[0] === '.' && (ABK.test(vor) || /\d$/.test(vor))) continue;
    if (vor.length < 40) continue; // sehr kurzer Auftakt („Vorprüfung vor der Berechnung: …?“) – den nächsten Satz mitnehmen
    return [t.slice(0, m.index + 1), t.slice(m.index + 1).trim()];
  }
  return [t, ''];
}
function seitenkopf(titel, text, ...rechts) {
  const [kurz, rest] = ersterSatz(text);
  const offen = APP.mehr || (APP.mehr = {});
  return h('div', { class: 'seitenkopf' }, h('div', { class: 'text' }, h('h1', {}, titel), kurz ? h('p', {}, kurz) : null,
    rest ? h('details', { class: 'mehr', open: !!offen[titel], ontoggle: ev => { offen[titel] = ev.target.open; } }, h('summary', {}, 'Mehr erfahren'), h('p', {}, rest)) : null), ...rechts);
}

// ---------- Hilfe-Popover ----------
// hilfe(inhalt): kleines ⓘ-Symbol. Klick, Enter/Leertaste oder Tastaturfokus öffnen die Erklärung als Popover (funktioniert auch auf Touch);
// Esc, Klick daneben, Scrollen und Fokuswechsel schließen. inhalt: Text (Absätze mit \n) oder Funktion, die Knoten liefert (opt.text = Kurzfassung für Screenreader).
// F1 in einem Eingabefeld öffnet die Erklärung, die zu diesem Feld gehört.
let hilfeOffen = null;
function hilfe(inhalt, opt) {
  const text = typeof inhalt === 'string' ? inhalt : (opt && opt.text) || '';
  const el = h('span', { class: (opt && opt.klasse ? opt.klasse + ' ' : '') + 'hilfesym', role: 'button', tabindex: '0', 'aria-label': (opt && opt.label) || (text ? 'Hinweis: ' + text : 'Erklärung anzeigen'), title: opt && opt.label ? opt.label : null, 'aria-expanded': 'false',
    onclick: ev => { ev.preventDefault(); ev.stopPropagation(); if (hilfeOffen && hilfeOffen.knopf === el) hilfeSchliessen(); else hilfeZeigen(el); },
    onkeydown: ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); if (hilfeOffen && hilfeOffen.knopf === el) hilfeSchliessen(); else hilfeZeigen(el); } },
    onfocus: () => { let tast = false; try { tast = el.matches(':focus-visible'); } catch (e) { /* ältere Browser */ } if (tast) hilfeZeigen(el); },
    onblur: ev => { if (hilfeOffen && hilfeOffen.knopf === el && !(ev.relatedTarget && hilfeOffen.pop.contains(ev.relatedTarget))) hilfeSchliessen(); } }, icon((opt && opt.icon) || 'info'));
  el._hilfe = inhalt;
  return el;
}
function hilfeZeigen(knopf) {
  if (hilfeOffen && hilfeOffen.knopf === knopf) return;
  hilfeSchliessen();
  const inhalt = knopf._hilfe;
  const pop = h('div', { class: 'hilfepop', id: 'hilfepop', role: 'tooltip', onmousedown: ev => ev.preventDefault() },
    typeof inhalt === 'function' ? inhalt() : typeof inhalt === 'string' ? inhalt.split('\n').filter(t => t.trim()).map(t => h('p', {}, t)) : inhalt);
  (knopf.closest('dialog') || document.body).append(pop);
  const r = knopf.getBoundingClientRect(), pr = pop.getBoundingClientRect();
  const links = Math.max(8, Math.min(r.left + r.width / 2 - pr.width / 2, innerWidth - pr.width - 8));
  let oben = r.bottom + 8;
  if (oben + pr.height > innerHeight - 8 && r.top - pr.height - 8 >= 8) oben = r.top - pr.height - 8;
  pop.style.left = Math.round(links) + 'px'; pop.style.top = Math.round(Math.max(8, oben)) + 'px';
  pop.style.maxHeight = Math.max(160, innerHeight - Math.max(8, oben) - 8) + 'px';
  knopf.setAttribute('aria-expanded', 'true'); knopf.setAttribute('aria-describedby', 'hilfepop');
  hilfeOffen = { knopf, pop };
}
// Schließt das offene Popover; Rückgabe true, wenn eines offen war.
function hilfeSchliessen() {
  if (!hilfeOffen) return false;
  const { knopf, pop } = hilfeOffen; hilfeOffen = null;
  pop.remove();
  if (knopf.isConnected) { knopf.setAttribute('aria-expanded', 'false'); knopf.removeAttribute('aria-describedby'); }
  return true;
}
document.addEventListener('mousedown', ev => { if (hilfeOffen && !hilfeOffen.pop.contains(ev.target) && !hilfeOffen.knopf.contains(ev.target)) hilfeSchliessen(); }, true);
document.addEventListener('touchstart', ev => { if (hilfeOffen && !hilfeOffen.pop.contains(ev.target) && !hilfeOffen.knopf.contains(ev.target)) hilfeSchliessen(); }, { capture: true, passive: true });
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && hilfeOffen) { ev.preventDefault(); ev.stopPropagation(); const k = hilfeOffen.knopf; hilfeSchliessen(); if (k.isConnected) k.focus({ preventScroll: true }); return; }
  if (ev.key === 'F1' && ev.target && ev.target.matches && ev.target.matches('input, select, textarea')) {
    // Erklärung zum Feld: im selben Feld-Block oder – in Tabellen – in der Kopfzelle derselben Spalte
    const el = ev.target; let sym = null;
    const block = el.closest('label.feld, .feld, label.check');
    if (block) sym = block.querySelector('.hilfesym');
    if (!sym) { const td = el.closest('td'), tab = el.closest('table'); if (td && tab && tab.tHead && tab.tHead.rows[0]) { const th = tab.tHead.rows[0].cells[td.cellIndex]; if (th) sym = th.querySelector('.hilfesym'); } }
    if (sym) { ev.preventDefault(); if (hilfeOffen && hilfeOffen.knopf === sym) hilfeSchliessen(); else hilfeZeigen(sym); }
  }
}, true);
window.addEventListener('scroll', ev => { if (hilfeOffen && ev.target !== hilfeOffen.pop && !(ev.target.nodeType === 1 && hilfeOffen.pop.contains(ev.target))) hilfeSchliessen(); }, true);
window.addEventListener('resize', () => hilfeSchliessen());

// ---------- Icons (Inline-SVG aus dem Sprite im Seitenkopf) ----------
// icon('papierkorb') liefert ein <svg class="icon">; kl = zusätzliche Klasse (z. B. 'k' für klein).
// Regel: Icon-Buttons zeigen nur das Icon und tragen aria-label und title; Text-Buttons zeigen nur Text.
const SVG_NS = 'http://www.w3.org/2000/svg';
function icon(name, kl) {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('class', 'icon' + (kl ? ' ' + kl : ''));
  s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
  const u = document.createElementNS(SVG_NS, 'use'); u.setAttribute('href', '#i-' + name);
  s.append(u);
  return s;
}
// Sicherheitsnetz für Icon-Buttons: Fehlt aria-label oder title, wird das eine aus dem anderen ergänzt.
function iconKnoepfeBeschriften(root) {
  if (!root) return;
  root.querySelectorAll('button').forEach(b => {
    if (b.childNodes.length !== 1 || !(b.firstChild instanceof SVGElement)) return;
    const a = b.getAttribute('aria-label'), t = b.getAttribute('title');
    if (a && !t) b.setAttribute('title', a); else if (t && !a) b.setAttribute('aria-label', t);
  });
}
// Text, in dem „✋“ eine von Hand eingesetzte Person markiert: als Knoten mit Icon (für Kacheln) …
function mitHand(text) {
  const teile = String(text == null ? '' : text).split('✋');
  if (teile.length < 2) return text;
  return teile.flatMap((t, i) => i ? [h('span', { class: 'hand', title: 'von Hand eingesetzt' }, icon('hand')), t.replace(/^ /, '')] : [t]);
}
// … und als reiner Text (für Tooltips und Meldungen)
function handText(text) { return String(text == null ? '' : text).replace(/✋ ?/g, 'von Hand: '); }

// ---------- Farbschema (APP.meta.theme: 'auto' | 'hell' | 'dunkel') ----------
function themeAnwenden() {
  const t = APP.meta.theme === 'hell' || APP.meta.theme === 'dunkel' ? APP.meta.theme : 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
}
// Gleich beim Laden anwenden (vor dem ersten Zeichnen), damit die Seite nicht kurz im falschen Schema erscheint
try { const m0 = JSON.parse(localStorage.getItem('stundenplaner.meta') || 'null'); if (m0 && m0.theme) { APP.meta.theme = m0.theme; themeAnwenden(); } } catch (e) { /* ohne gespeicherte Einstellung: automatisch */ }
// Wechselt das System zwischen hell und dunkel, wird die Kurve der Berechnungsseite in den neuen Farben gezeichnet
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (APP.daten && APP.seite === 'berechnung') render(); }); } catch (e) { /* ältere Browser */ }

// ---------- Meldungen: Toast und Banner ----------
// Zwei Ebenen: toast() für kurze Bestätigungen (verschwindet von selbst), banner() für alles mit Handlungsbedarf –
// es steht am Seitenanfang, bis es geschlossen wird (auch über Seitenwechsel hinweg), mit einem Knopf zur passenden Stelle.
// o: { id, art: 'ok' | 'warn' | 'err' | '', text, aktion: { text, tun }, gueltig: () => boolean }
function banner(o) {
  APP.banner = (APP.banner || []).filter(b => b.id !== o.id);
  APP.banner.push(o);
  bannerZeichnen();
}
function bannerWeg(id) {
  const vor = (APP.banner || []).length;
  APP.banner = id === undefined ? [] : (APP.banner || []).filter(b => b.id !== id);
  if (APP.banner.length !== vor) bannerZeichnen();
}
function bannerLeiste() {
  APP.banner = (APP.banner || []).filter(b => { try { return !b.gueltig || b.gueltig(); } catch (e) { return false; } });
  const zeigen = APP.banner.filter(b => b.nichtAuf !== APP.seite);
  if (!zeigen.length) return null;
  return h('div', { id: 'banner' }, zeigen.map(b => h('div', { class: 'banner ' + (b.art || ''), role: b.art === 'err' ? 'alert' : 'status', 'data-banner': b.id },
    h('span', { class: 'bsym', 'aria-hidden': 'true' }, b.art === 'err' ? '⚠' : b.art === 'warn' ? '!' : b.art === 'ok' ? '✓' : 'i'),
    h('div', { class: 'btext' }, b.text),
    b.aktion ? h('button', { class: 'btn klein', type: 'button', onclick: () => b.aktion.tun() }, b.aktion.text) : null,
    h('button', { class: 'btn icon klein', type: 'button', 'aria-label': 'Meldung schließen', title: 'Meldung schließen', onclick: () => bannerWeg(b.id) }, icon('x')))));
}
// Banner außerhalb von render() auffrischen (z. B. wenn eine Meldung entsteht, während die Seite steht)
function bannerZeichnen() {
  const main = $('#inhalt'); if (!main) return;
  const alt = $('#banner'), neu = bannerLeiste();
  if (alt && neu) alt.replaceWith(neu); else if (alt) alt.remove(); else if (neu) main.prepend(neu);
}

// ---------- Toasts und Dialoge ----------
// aktion (optional): { text, tun } – ein Knopf im Toast, z. B. „Rückgängig“. Solange der Zeiger auf dem Toast steht oder der Knopf den Fokus hat, bleibt er stehen.
function toast(text, art, ms, aktion) {
  const box = $('#toasts');
  const el = h('div', { class: 'toast ' + (art || ''), role: 'status' }, h('span', { class: 'tsym', 'aria-hidden': 'true' }, art === 'err' ? '⚠' : art === 'ok' ? '✓' : 'i'), h('span', { class: 'ttext' }, text),
    aktion ? h('button', { class: 'taktion', type: 'button', onclick: () => { el.remove(); aktion.tun(); } }, aktion.text) : null);
  box.append(el);
  let timer = 0;
  const los = () => { clearTimeout(timer); timer = setTimeout(() => el.remove(), ms || 4200); };
  if (aktion) { el.addEventListener('mouseenter', () => clearTimeout(timer)); el.addEventListener('mouseleave', los); el.addEventListener('focusin', () => clearTimeout(timer)); el.addEventListener('focusout', los); }
  los();
  return el;
}
// Nach einem Löschen ohne Rückfrage: Toast „… · Rückgängig“ (8 s). Der Knopf nimmt genau diese Änderung zurück –
// wurde inzwischen weitergearbeitet, verweist er auf Strg+Z, statt eine andere Änderung zurückzunehmen.
function rueckgaengigToast(text) {
  const marke = APP.undo[APP.undo.length - 1];
  if (!marke) return;
  toast(text, '', 8000, { text: 'Rückgängig', tun: () => { if (APP.undo[APP.undo.length - 1] === marke) rueckgaengig(); else toast('Seitdem wurde weitergearbeitet – bitte schrittweise mit Strg+Z zurückgehen.', 'err', 6000); } });
}
// Für Änderungen über eigene Wege (rasterAendern, dienstAendern …): fn ausführen und – wenn dabei ein Undo-Schritt entstand – den Rückgängig-Toast zeigen.
function undoToastNach(fn, text) { const vor = APP.undo[APP.undo.length - 1]; fn(); if (APP.undo[APP.undo.length - 1] !== vor) rueckgaengigToast(text); }
// Ändern (meist: löschen) ohne Bestätigungsdialog, dafür mit Rückgängig-Toast. text = Meldung im Toast (sonst die Beschreibung der Änderung).
function aendernMitUndo(beschr, fn, opt, text) {
  if (!aendern(beschr, fn, opt)) return false;
  rueckgaengigToast(text || beschr);
  return true;
}
function dialog(o) {
  return new Promise(resolve => {
    let erledigt = false;
    const fuss = h('div', { class: 'dfuss' });
    const dlg = h('dialog', { style: o.breite ? { width: o.breite } : null, 'aria-label': o.titel },
      h('div', { class: 'dkopf' }, o.titel), h('div', { class: 'dinhalt' }, o.inhalt), fuss);
    const zu = w => { if (erledigt) return; erledigt = true; hilfeSchliessen(); dlg.close(); dlg.remove(); resolve(w); };
    (o.knoepfe || [{ text: 'OK', wert: true, art: 'primaer' }]).forEach(k => {
      fuss.append(h('button', { class: 'btn ' + (k.art || ''), hidden: !!k.verborgen, dataset: { wert: String(k.wert) }, onclick: () => { if (k.vorher && k.vorher() === false) return; zu(k.wert); } }, k.text));
    });
    dlg.addEventListener('cancel', ev => { ev.preventDefault(); if (hilfeSchliessen()) return; zu(null); });
    document.body.append(dlg);
    iconKnoepfeBeschriften(dlg);
    dlg.showModal();
    if (o.fokus) { const f = dlg.querySelector(o.fokus); if (f) f.focus(); }
  });
}
function bestaetigen(text, ok, art) {
  return dialog({ titel: 'Bitte bestätigen', inhalt: h('p', {}, text), knoepfe: [{ text: 'Abbrechen', wert: false }, { text: ok || 'OK', wert: true, art: art || 'primaer' }] }).then(x => !!x);
}
function menueZeigen(x, y, eintraege) {
  menueSchliessen();
  const zurueck = document.activeElement; // Esc gibt den Fokus an den Auslöser zurück
  const m = h('div', { class: 'menue', role: 'menu', id: 'kontextmenue' });
  // Einträge: '-' = Trennlinie · { titel } = Überschrift · { text, tun, icon?, taste?, hinweis?, aus? }
  const mitIcons = eintraege.some(e => e && e.icon);
  eintraege.forEach(e => {
    if (!e) return;
    if (e === '-') m.append(h('div', { class: 'sep', role: 'separator' }));
    else if (e.titel) m.append(h('div', { class: 'titel' }, e.titel));
    else m.append(h('button', { role: 'menuitem', disabled: e.aus, onclick: () => { menueSchliessen(); e.tun(); } }, mitIcons ? (e.icon ? icon(e.icon) : h('span', { class: 'mleer' })) : null, h('span', {}, e.text), e.hinweis ? h('span', { class: 'taste warn' }, e.hinweis) : e.taste ? h('span', { class: 'taste' }, e.taste) : null));
  });
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  const erster = m.querySelector('button:not([disabled])'); if (erster) erster.focus();
  m.addEventListener('keydown', ev => {
    const bs = [...m.querySelectorAll('button:not([disabled])')];
    const i = bs.indexOf(document.activeElement);
    if (ev.key === 'ArrowDown') { ev.preventDefault(); (bs[i + 1] || bs[0]).focus(); }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); (bs[i - 1] || bs[bs.length - 1]).focus(); }
    if (ev.key === 'Escape') { ev.preventDefault(); menueSchliessen(); if (zurueck && zurueck.isConnected && zurueck.focus) zurueck.focus(); }
  });
  setTimeout(() => document.addEventListener('mousedown', menueAussen, { once: true }), 0);
}
function menueAussen(ev) { const m = $('#kontextmenue'); if (m && !m.contains(ev.target)) menueSchliessen(); else if (m) document.addEventListener('mousedown', menueAussen, { once: true }); }
function menueSchliessen() { const m = $('#kontextmenue'); if (m) m.remove(); }

