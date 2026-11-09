// ---------- Explorer (links): Objekte der Seite ----------
// Im Stundenplan: Klassen, Personen und Räume mit Suche, Mini-Wochenraster (Belegung, Pflichtverstöße rot) und Zahl der Pflichtverstöße.
// Auf Seiten mit „Liste mit Details“ legt tabelle() ihre Liste in APP._explorerTeil ab; sie erscheint hier statt neben den Details.
function explorerObjekteFuellen() {
  const box = $('#explorerObjekte'); if (!box) return;
  const akt = document.activeElement, fokusId = akt && box.contains(akt) && akt.id ? akt.id : null;
  const key = APP.seite + '|' + (APP.seite === 'editor' ? APP.editor.art : '');
  const alt = box.querySelector('.ex-liste, .md-liste'), sc = alt && box.dataset.key === key ? alt.scrollTop : null;
  leeren(box);
  let teil = null;
  try { teil = APP.seite === 'editor' && APP.daten.unterrichte.length ? editorExplorer() : APP._explorerTeil; } catch (err) { console.error(err); teil = null; }
  APP._explorerTeil = null;
  box.hidden = !teil; box.dataset.key = key;
  $('#nav').classList.toggle('mit-objekten', !!teil);
  if (!teil) return;
  box.append(teil);
  const neu = box.querySelector('.ex-liste, .md-liste');
  if (neu && sc !== null) neu.scrollTop = sc;
  else if (neu) { const a = neu.querySelector('[aria-current="true"]'); if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest' }); }
  if (fokusId) { const f = document.getElementById(fokusId); if (f) { f.focus({ preventScroll: true }); try { if (f.type === 'search') { const n = f.value.length; f.setSelectionRange(n, n); } } catch (e) { /* ohne Auswahl */ } } }
  iconKnoepfeBeschriften(box);
}
function editorExplorer() {
  const d = APP.daten, E = APP.editor, art = E.art;
  let c = null; try { c = modell(); } catch (err) { c = null; }
  const M = c && c.M, P = c && c.P, hatPlan = !!(M && d.plan.platzierungen.length);
  const suche = APP.exSuche || (APP.exSuche = {});
  const waehle = (id, zweit) => {
    if (zweit) { E.parallel = true; E.art2 = art; E.id2 = id; }
    else { E.id = id; E.sel = -1; E.letzte = Object.assign({}, E.letzte, { [art]: id }); }
    render();
  };
  const artWahl = h('div', { class: 'segment klein exart', role: 'group', 'aria-label': 'Welche Pläne' }, [['klasse', 'Klassen'], ['lehrer', 'Personen'], ['raum', 'Räume']].map(([a, t]) =>
    h('button', { type: 'button', class: art === a ? 'aktiv' : '', 'aria-pressed': art === a ? 'true' : 'false', onclick: () => {
      if (E.art === a) return;
      const l = ansichtListe(a), m = (E.letzte || {})[a];
      E.art = a; E.id = m && l.some(([i]) => i === m) ? m : (l[0] || [])[0] || null; E.sel = -1; render();
    } }, t)));
  const liste = h('div', { class: 'ex-liste' });
  const filtern = () => {
    const q = (suche[art] || '').trim().toLowerCase();
    liste.querySelectorAll('.ex-gruppe').forEach(g => {
      let sichtbar = 0;
      g.querySelectorAll('.ex-eintrag').forEach(el => { const an = !q || el.dataset.such.includes(q); el.hidden = !an; if (an) sichtbar++; });
      g.hidden = !sichtbar;
    });
    const leer = liste.querySelector('.ex-leer'); if (leer) leer.hidden = !!liste.querySelector('.ex-eintrag:not([hidden])');
  };
  const ersterSichtbarer = () => liste.querySelector('.ex-gruppe:not([hidden]) .ex-eintrag:not([hidden])');
  const feld = h('input', { type: 'search', id: 'exSuche', placeholder: art === 'klasse' ? 'Klasse suchen …' : art === 'lehrer' ? 'Person suchen …' : 'Raum suchen …', 'aria-label': 'Liste durchsuchen', value: suche[art] || '', autocomplete: 'off',
    oninput: ev => { suche[art] = ev.target.value; filtern(); },
    onkeydown: ev => { const e1 = ersterSichtbarer(); if (ev.key === 'ArrowDown' && e1) { ev.preventDefault(); e1.focus(); } else if (ev.key === 'Enter' && e1) { ev.preventDefault(); e1.click(); } } });
  // Mini-Wochenraster: Tage als Zeilen, Unterrichtsstunden als Spalten (Pausen fehlen)
  const H = M ? M.H : d.schule.stunden.length, D = M ? M.D : d.schule.tage.length;
  const lekt = []; for (let hh = 0; hh < H; hh++) if (!(M ? M.pause[hh] : (d.schule.stunden[hh] || {}).istPause)) lekt.push(hh);
  const hart = hatPlan ? c.bewertung.det.filter(x => M.hart[RI[x.r]]) : [];
  const az = art === 'lehrer' ? new Map(arbeitszeiten(d).liste.map(x => [x.lehrer, x])) : null;
  const pfeil = ev => {
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    const alle = [...liste.querySelectorAll('.ex-gruppe:not([hidden]) .ex-eintrag:not([hidden])')], i = alle.indexOf(ev.currentTarget);
    const z = alle[i + (ev.key === 'ArrowDown' ? 1 : -1)];
    ev.preventDefault(); if (z) z.focus(); else if (ev.key === 'ArrowUp') feld.focus();
  };
  const eintrag = o => {
    const xi = M ? ansichtIndex(M, art, o.id) : -1;
    let mini = null, nHart = 0;
    if (hatPlan && xi >= 0) {
      const bel = new Set(), prob = new Set();
      kachelnFuer(M, P, art, xi).forEach(k => { for (let i = 0; i < k.dur; i++) bel.add(k.start + i); });
      hart.forEach(x => { if (detPasst(M, P, x, art, xi)) { nHart++; if (x.s !== undefined) prob.add(x.s); } });
      mini = h('span', { class: 'mini', style: { '--h': lekt.length }, 'aria-hidden': 'true' }, Array.from({ length: D }, (_, t) => lekt.map(hh => { const s = t * H + hh; return h('i', { class: prob.has(s) ? 'p' : bel.has(s) ? 'b' : null }); })));
    }
    const an = E.id === o.id, zweit = E.parallel && E.art2 === art && E.id2 === o.id;
    let name, unter;
    if (art === 'klasse') { const r = raumVon(o.heimatraum); name = 'Klasse ' + (o.name || '?'); unter = [o.schueler ? o.schueler + ' Schüler' : null, r ? 'Raum ' + r.name : null].filter(Boolean).join(', '); }
    else if (art === 'lehrer') { const x = az && az.get(o.id); name = o.name || o.kuerzel || '?'; unter = [o.name ? o.kuerzel : null, x && o.art !== 'personal' ? (x.hatSollStd ? zahlDe(x.istStd, 1) + ' von ' + zahlDe(x.sollStd, 1) : zahlDe(x.istStd, 1)) + ' UStd.' : null].filter(Boolean).join(', '); }
    else { name = 'Raum ' + (o.name || '?'); unter = [o.typ, o.kapazitaet ? o.kapazitaet + ' Plätze' : null].filter(Boolean).join(', '); }
    return h('button', { class: 'ex-eintrag' + (zweit ? ' zweit' : ''), type: 'button', 'data-id': o.id, 'data-such': [o.name, o.kuerzel, o.typ, o.jahrgang].filter(x => x !== undefined && x !== null).join(' ').toLowerCase(),
      'aria-current': an ? 'true' : null, title: name + (nHart ? ' – ' + nHart + (nHart === 1 ? ' Pflichtverstoß' : ' Pflichtverstöße') : '') + '\nKlick: Plan zeigen · Strg+Klick: als zweiten Plan daneben zeigen',
      onclick: ev => waehle(o.id, ev.ctrlKey || ev.metaKey), onkeydown: pfeil },
      h('span', { class: 'ex-name' }, h('b', {}, name), unter ? h('span', {}, unter) : null), mini,
      h('span', { class: 'ex-marke' + (nHart ? ' err' : zweit ? ' zweit' : ''), 'aria-label': nHart ? nHart + ' Pflichtverstöße' : zweit ? 'zweiter Plan' : null }, nHart ? String(nHart) : zweit ? 'B' : ''));
  };
  const objekte = art === 'klasse' ? klassenAlphabetisch(d.klassen) : art === 'lehrer' ? lehrerAlphabetisch(d.lehrer) : raeumeAlphabetisch(d.raeume);
  const gruppeVon = o => art === 'klasse' ? (o.jahrgang ? 'Jahrgang ' + o.jahrgang : 'Ohne Jahrgang') : art === 'lehrer' ? (o.art === 'personal' ? 'Weiteres Personal' : o.ausgebildet === false ? 'Co-Kräfte' : 'Lehrkräfte') : (o.typ || 'Ohne Typ');
  const gruppen = new Map();
  objekte.forEach(o => { const g = gruppeVon(o); if (!gruppen.has(g)) gruppen.set(g, []); gruppen.get(g).push(o); });
  let namen = [...gruppen.keys()];
  if (art === 'klasse') namen.sort(natVergleich); else if (art === 'lehrer') namen = ['Lehrkräfte', 'Co-Kräfte', 'Weiteres Personal'].filter(g => gruppen.has(g));
  namen.forEach(g => liste.append(h('div', { class: 'ex-gruppe', role: 'group', 'aria-label': g }, namen.length > 1 ? h('div', { class: 'ex-gtitel' }, g) : null, gruppen.get(g).map(eintrag))));
  if (!objekte.length) liste.append(h('p', { class: 'muted klein ex-hin' }, art === 'klasse' ? 'Noch keine Klassen angelegt.' : art === 'lehrer' ? 'Noch niemand angelegt.' : 'Noch keine Räume angelegt.'));
  else liste.append(h('p', { class: 'muted klein ex-leer', hidden: true }, 'Nichts gefunden.'));
  filtern();
  return h('div', { class: 'ex-objekte' },
    h('div', { class: 'ex-kopf' }, artWahl, h('label', { class: 'ex-suche' }, icon('lupe'), feld)),
    liste,
    h('p', { class: 'ex-fuss muted' }, hatPlan ? 'Strg+Klick zeigt einen zweiten Plan daneben.' : 'Das Raster neben jedem Eintrag zeigt nach der Berechnung die Belegung der Woche.'));
}

// ---------- Inspektor (rechts) ----------
// Im Stundenplan die Seitenleiste des Editors (Details, Probleme, Zuordnen, Hilfe), auf allen anderen Seiten Probleme und Hilfe.
// Probleme passen zur Ansicht: in Einrichten die Meldungen der Prüfung zu diesem Bereich, in Start, Planen und Ausgeben Planstatus,
// offene Punkte und alle Meldungen. Hilfe zeigt den ausführlichen Text der Seite (aus seitenkopf) und die Tastatur.
const AMPEL_WORT = { gruen: 'Plan in Ordnung', gelb: 'Plan vollständig', rot: 'Pflichtregeln verletzt', leer: 'Noch kein Plan' };
const INSP_TABS = [['probleme', 'Probleme', 'warnung'], ['hilfe', 'Hilfe', 'hilfe']];
function inspektorBauen(gleicheSeite) {
  const ins = $('#inspektor'); if (!ins) return;
  const altP = ins.querySelector('.sl-panel:not([hidden])'), sc = gleicheSeite && altP ? altP.scrollTop : 0, altTab = altP ? altP.dataset.slpanel : null;
  const akt = document.activeElement, fokusTab = akt && ins.contains(akt) && akt.dataset && akt.dataset.sltab ? akt.dataset.sltab : null;
  leeren(ins);
  let inhalt;
  try { inhalt = APP.seite === 'editor' && APP.daten.unterrichte.length ? editorSeitenleiste() : inspektorAllgemein(gleicheSeite); }
  catch (err) { console.error(err); inhalt = h('div', { class: 'hinweis err' }, 'Fehler im Inspektor: ' + err.message); }
  ins.append(inhalt);
  if (sc) { const p = ins.querySelector('.sl-panel:not([hidden])'); if (p && p.dataset.slpanel === altTab) p.scrollTop = sc; }
  if (fokusTab) { const b = ins.querySelector('[data-sltab="' + fokusTab + '"]'); if (b) b.focus({ preventScroll: true }); }
  iconKnoepfeBeschriften(ins);
}
function inspektorTabs() { return (APP._inspektorDetails ? [['details', APP._inspektorDetails.titel || 'Details', 'detail']] : []).concat(INSP_TABS); }
function inspektorReiter(tab) {
  if (!inspektorTabs().some(t => t[0] === tab)) tab = 'probleme';
  APP.inspektorReiter = tab;
  const sl = document.querySelector('#inspektor .seitenleiste'); if (!sl) return;
  sl.querySelectorAll('[data-sltab]').forEach(b => { const an = b.dataset.sltab === tab; b.classList.toggle('aktiv', an); b.setAttribute('aria-selected', an ? 'true' : 'false'); b.tabIndex = an ? 0 : -1; });
  sl.querySelectorAll('[data-slpanel]').forEach(p => { p.hidden = p.dataset.slpanel !== tab; });
}
function inspektorAllgemein(gleicheSeite) {
  const TABS = inspektorTabs();
  // Bietet die Seite Details an (Druckoptionen, Besetzung der Aufsichten), stehen sie beim Betreten der Seite vorn
  if (APP._inspektorDetails && !gleicheSeite) APP.inspektorReiter = 'details';
  const aktiv = TABS.some(t => t[0] === APP.inspektorReiter) ? APP.inspektorReiter : 'probleme';
  const pr = inspektorProblemDaten();
  const zahl = pr.fehler ? h('span', { class: 'badge err', title: pr.fehler + ' Fehler' }, pr.fehler) : pr.warn ? h('span', { class: 'badge warn', title: pr.warn + ' Hinweise' }, pr.warn) : null;
  const tabs = h('div', { class: 'sl-tabs', role: 'tablist', 'aria-label': 'Inspektor',
    onkeydown: ev => { if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return; const i = TABS.findIndex(t => t[0] === APP.inspektorReiter), n = TABS[(Math.max(0, i) + (ev.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0]; ev.preventDefault(); inspektorReiter(n); const b = document.querySelector('#inspektor [data-sltab="' + n + '"]'); if (b) b.focus(); } },
    TABS.map(([k, t, sym]) => h('button', { class: 'sl-tab' + (aktiv === k ? ' aktiv' : ''), type: 'button', role: 'tab', id: 'insptab_' + k, 'data-sltab': k, 'aria-selected': aktiv === k ? 'true' : 'false', 'aria-controls': 'insppanel_' + k, tabindex: aktiv === k ? 0 : -1, onclick: () => inspektorReiter(k) },
      icon(sym, 'k'), t, k === 'probleme' ? zahl : null)));
  const panel = (k, inhalt) => h('div', { class: 'sl-panel', role: 'tabpanel', id: 'insppanel_' + k, 'data-slpanel': k, 'aria-labelledby': 'insptab_' + k, hidden: aktiv !== k }, inhalt);
  APP.inspektorReiter = aktiv;
  return h('aside', { class: 'seitenleiste inspektor-allg', 'aria-label': 'Inspektor' }, tabs, APP._inspektorDetails ? panel('details', h('div', { class: 'idetails' }, APP._inspektorDetails.inhalt)) : null, panel('probleme', inspektorProbleme(pr)), panel('hilfe', inspektorHilfe()));
}
// Gehört eine Meldung der Prüfung zur Ansicht? Gleiche Seite oder gleicher Bereich (Personen umfasst Stammdaten, Arbeitszeit, Aufgaben)
function machPasst(x, seite) { const z = x.ziel; if (!z || !z.seite) return false; return z.seite === seite || bereichVon(z.seite) === bereichVon(seite); }
const AUFSICHT_SEITEN = ['aufsicht', 'gesamtansicht', 'aufsichtauswertung', 'vorschule'];
function inspektorProblemDaten() {
  const d = APP.daten, seite = APP.seite, mo = modusVon(seite).id;
  const planNah = mo !== 'einrichten' || seite === 'pruefung';
  const mach = (APP.mach || []).slice().sort((a, b) => ({ fehler: 0, warnung: 1, hinweis: 2 }[a.stufe] - { fehler: 0, warnung: 1, hinweis: 2 }[b.stufe]));
  const hier = planNah ? mach : mach.filter(x => machPasst(x, seite));
  const hatPlan = d.plan.platzierungen.length > 0;
  let st = { ampel: 'leer' }, offen = 0;
  if (hatPlan) { try { st = planAmpel(); offen = offenePunkteZahl(); } catch (err) { st = { ampel: 'leer' }; } }
  let dienst = null;
  if (AUFSICHT_SEITEN.includes(seite) && (d.dienste.bedarfe.length || d.dienste.plan.length)) { try { dienst = dienstPruefung(d).meldungen.slice().sort((a, b) => ({ fehler: 0, warnung: 1, hinweis: 2 }[a.stufe] - { fehler: 0, warnung: 1, hinweis: 2 }[b.stufe])); } catch (err) { dienst = null; } }
  const fehler = hier.filter(x => x.stufe === 'fehler').length + (dienst ? dienst.filter(m => m.stufe === 'fehler').length : 0) + (planNah && st.ampel === 'rot' ? 1 : 0);
  const warn = hier.filter(x => x.stufe === 'warnung').length + (dienst ? dienst.filter(m => m.stufe === 'warnung').length : 0) + (planNah ? offen : 0);
  return { planNah, mach, hier, hatPlan, st, offen, dienst, fehler, warn };
}
function inspektorProbleme(pr) {
  const seite = APP.seite, teile = [];
  const SYM = { fehler: ['err', '✕'], warnung: ['warn', '!'], hinweis: ['info', 'i'] };
  const reihe = (x, tun) => h('button', { class: 'meldung', type: 'button', title: x.ziel ? 'Zur betroffenen Stelle springen' : null, onclick: () => tun(x.ziel) },
    h('span', { class: 'sym ' + (SYM[x.stufe] || SYM.hinweis)[0], 'aria-hidden': 'true' }, (SYM[x.stufe] || SYM.hinweis)[1]), h('span', { class: 'mtext' }, x.text));
  const zaehler = L => { const f = L.filter(x => x.stufe === 'fehler').length, w = L.filter(x => x.stufe === 'warnung').length, i = L.length - f - w; return [f ? h('span', { class: 'badge err' }, '✕ ' + f) : null, w ? h('span', { class: 'badge warn' }, '! ' + w) : null, i ? h('span', { class: 'badge neutral' }, 'i ' + i) : null]; };
  // 1. Stand des Plans (in Start, Planen und Ausgeben mit den offenen Punkten: Akzeptieren, Zurücknehmen, Sprung zur Stunde)
  if (pr.hatPlan && pr.st.ampel !== 'leer') {
    const T = AMPEL_TEXT[pr.st.ampel] || AMPEL_TEXT.leer;
    teile.push(h('section', { class: 'iabschnitt' }, h('div', { class: 'ampelzeile' }, ampelPunkt(pr.st), h('b', {}, AMPEL_WORT[pr.st.ampel] || T[0])), h('p', { class: 'muted klein' }, T[1])));
    const offenInMitte = seite === 'auswertung' && (!(APP.reiter || {}).auswertung || APP.reiter.auswertung === 'offen'); // dort stehen sie schon in der Mitte
    if (pr.planNah && !offenInMitte) {
      teile.push(h('section', { class: 'iabschnitt' }, h('h3', {}, 'Offene Punkte', pr.offen ? h('span', { class: 'badge warn' }, pr.offen) : null),
        pr.offen ? offenePunkteInhalt(false, null).el : h('p', { class: 'muted klein' }, 'Keine offenen Punkte im Plan.')));
    } else if (pr.offen) teile.push(h('section', { class: 'iabschnitt zeile' }, h('span', {}, pr.offen + (pr.offen === 1 ? ' offener Punkt' : ' offene Punkte') + ' im Plan'), h('button', { class: 'btn klein rechts', type: 'button', onclick: () => gehe('auswertung', { reiter: 'offen' }) }, 'Ansehen')));
  }
  // 2. Prüfung der Daten
  const d = APP.daten, max = 80;
  teile.push(h('section', { class: 'iabschnitt' },
    h('h3', {}, pr.planNah ? 'Prüfung der Daten' : 'Prüfung zu diesem Bereich', zaehler(pr.hier)),
    pr.hier.length ? h('div', { class: 'meldungen' }, pr.hier.slice(0, max).map(x => reihe(x, springeZu)), pr.hier.length > max ? h('p', { class: 'muted klein' }, '… und ' + (pr.hier.length - max) + ' weitere') : null)
      : h('p', { class: 'muted klein' }, pr.mach.length ? 'Keine Meldungen zu diesem Bereich.' : d.unterrichte.length ? 'Keine Meldungen – die Daten sind bereit für die Berechnung.' : 'Die Prüfung meldet Lücken und Widersprüche, sobald Klassen und Unterricht angelegt sind.'),
    seite !== 'pruefung' && pr.mach.length ? h('button', { class: 'btn klein', type: 'button', onclick: () => gehe('pruefung') }, 'Alle Meldungen (' + pr.mach.length + ')') : null));
  // 3. Aufsichten
  if (pr.dienst) teile.push(h('section', { class: 'iabschnitt' }, h('h3', {}, 'Aufsichten', zaehler(pr.dienst)),
    pr.dienst.length ? h('div', { class: 'meldungen' }, pr.dienst.slice(0, max).map(m => reihe(m, meldungZiel))) : h('p', { class: 'muted klein' }, 'Keine Meldungen zu den Aufsichten.')));
  return teile;
}
function inspektorHilfe() {
  const sh = APP._seitenHilfe, s = SEITEN.find(x => x.id === APP.seite) || SEITEN[0];
  const absaetze = t => String(t || '').split('\n').filter(x => x.trim()).map(x => h('p', {}, x));
  return h('div', { class: 'ihilfe' },
    h('h3', {}, sh && sh.titel ? sh.titel : s.titel),
    sh && sh.text ? absaetze(sh.text) : h('p', { class: 'muted' }, 'Zu dieser Ansicht gibt es keinen eigenen Hilfetext.'),
    APP.seite === 'editor' ? editorLegende() : null,
    h('h4', {}, 'Bedienung'),
    h('ul', { class: 'iliste' }, h('li', {}, h('kbd', {}, 'Alt'), ' + ', h('kbd', {}, '1'), ' bis ', h('kbd', {}, '4'), ' wechseln den Modus.'), h('li', {}, h('kbd', {}, 'Strg'), ' + ', h('kbd', {}, 'K'), ' sucht Seiten, Klassen, Personen, Räume und Aktionen.'), h('li', {}, h('kbd', {}, 'Strg'), ' + ', h('kbd', {}, 'Z'), ' nimmt eine Änderung zurück, ', h('kbd', {}, 'Strg'), ' + ', h('kbd', {}, 'Y'), ' wiederholt sie.'), h('li', {}, 'Die Zurück-Taste des Browsers führt zur vorigen Ansicht.')),
    h('p', {}, handbuchLink('Handbuch als PDF herunterladen')));
}
