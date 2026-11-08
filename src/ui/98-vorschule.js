/* =====================================================================
   5g. OBERFLÄCHE – Vorschule & Betreuung (Reiter unter „Aufsichten“)
   Rollen je Person (nicht zugelassen · Stammkraft · Reserve), Tagesbedarf des Vorschulbereichs und Wochenbilanz.
   Die Regeln (D13, DW12) und die Rollen selbst stehen im Rechenkern (lehrer[].vorschule, bereiche[].vorschule).
   Der Bedarf wird mit denselben Bausteinen bearbeitet wie unter „Aufsichten“ (bedarfDetailKarte, bedarfUebertragen).
   ===================================================================== */
const VS_ROLLEN = [['nein', 'Nicht zugelassen'], ['stamm', 'Stammkraft'], ['reserve', 'Reserve']];
const VS_ROLLEN_HILFE = {
  nein: 'Arbeitet nicht in der Vorschule.',
  stamm: 'Nur Vorschule sowie Früh-/Spätaufsicht und Betreuung; unterrichtet nie.',
  reserve: 'Hilft in der Vorschule nur beim Mindestbedarf, wenn keine Stammkraft frei ist; behält sonst alle anderen Aufgaben.'
};
function vsZustand() { const s = APP.tabellen.vorschule || (APP.tabellen.vorschule = { tag: 0 }); if (s.tag >= APP.daten.schule.tage.length) s.tag = 0; return s; }
function vsBereichIds(d) { return new Set(d.dienste.bereiche.filter(b => b.vorschule).map(b => b.id)); }
function vsBedarfe(d, tag) { const ids = vsBereichIds(d); return d.dienste.bedarfe.filter(b => b.bereich && ids.has(b.bereich) && (tag === undefined || b.tag === tag)); }
function vsRolleSetzen(id, rolle) {
  if (!VORSCHULROLLEN.includes(rolle)) return;
  aendern('Vorschulrolle geändert', d => { const l = d.lehrer.find(x => x.id === id); if (l) l.vorschule = rolle; });
}
// Neuer Tagesbedarf im Vorschulbereich: ein Abschnitt über die Schulzeit (Minimum 1, Soll 1) – Zeiten und Zahlen danach anpassen
function vsNeuerBedarf(d, bereich, tag) {
  const zg = stundenZeiten(d.schule, null).filter(Boolean);
  const von = zg.length ? Math.min(...zg.map(z => z.start)) : 450, bis = zg.length ? Math.max(...zg.map(z => z.end)) : 900;
  return nBedarf({ tag, typ: 'dt_dienst', bereich, name: 'Vorschule', arbeitszeit: true, springer: false, farbe: '#ad83d2', herkunft: 'vorschule',
    abschnitte: [{ beginn: zeitText(von), ende: zeitText(bis), min: 1, soll: 1 }] });
}
function vsEinrichten() {
  dienstAendern('Vorschule eingerichtet', d => {
    const DI = d.dienste;
    let b = DI.bereiche.find(x => x.vorschule);
    if (!b) { b = { id: neueId('a'), name: 'Vorschule', exklusiv: false, vorschule: true }; DI.bereiche.push(b); }
    d.schule.tage.forEach((_, tag) => { if (!DI.bedarfe.some(x => x.bereich === b.id && x.tag === tag)) DI.bedarfe.push(vsNeuerBedarf(d, b.id, tag)); });
  });
}
function vsBedarfErgaenzen(tag) {
  dienstAendern('Vorschulbedarf ergänzt', d => { const b = d.dienste.bereiche.find(x => x.vorschule); if (b) d.dienste.bedarfe.push(vsNeuerBedarf(d, b.id, tag)); });
}
function vsRollenKarte(d) {
  const lehrer = lehrerAlphabetisch(d.lehrer);
  const zaehl = r => d.lehrer.filter(l => l.vorschule === r).length;
  const unterrichtet = l => d.unterrichte.filter(u => !u.aufgabe && u.lehrkraefte.some(z => z.lehrer === l.id)).length;
  const zeilen = lehrer.map(l => {
    const n = vorschuleStamm(l) ? unterrichtet(l) : 0;
    return h('tr', {}, h('td', {}, l.name || l.kuerzel || '?', l.kuerzel && l.name ? h('span', { class: 'muted klein' }, ' · ' + l.kuerzel) : null),
      h('td', { class: 'muted klein' }, artText(l)),
      h('td', {}, sel(VS_ROLLEN, l.vorschule, v => vsRolleSetzen(l.id, v), { 'aria-label': 'Rolle in der Vorschule: ' + (l.name || l.kuerzel), title: VS_ROLLEN_HILFE[l.vorschule] })),
      h('td', {}, n ? h('span', { class: 'badge err', title: 'Stammkräfte unterrichten nie. Die Lehrkraft in der Unterrichtsversorgung austauschen.' }, 'unterrichtet in ' + n + ' Unterricht' + (n === 1 ? '' : 'en')) : null));
  });
  return h('div', { class: 'karte' },
    h('div', { class: 'zeile' }, h('h2', {}, 'Personal'), h('span', { class: 'badge neutral' }, zaehl('stamm') + ' Stammkräfte'), h('span', { class: 'badge neutral' }, zaehl('reserve') + ' Reserve')),
    h('p', { class: 'muted klein' }, VS_ROLLEN.filter(r => r[0] !== 'nein').map(r => r[1] + ': ' + VS_ROLLEN_HILFE[r[0]]).join(' ')),
    d.lehrer.length ? h('div', { class: 'tabwrap', style: { maxHeight: '340px', overflow: 'auto' } }, h('table', { class: 'tab' },
      h('thead', {}, h('tr', {}, ['Person', 'Art', 'Rolle in der Vorschule', ''].map(t => h('th', {}, t)))), h('tbody', {}, zeilen))) : h('p', { class: 'muted' }, 'Noch keine Mitarbeitenden angelegt.'),
    h('p', { class: 'klein muted' }, 'Prüfe unter „Arbeitszeit & Deputat“ die Wochenarbeitszeit der Stammkräfte: Nur darüber weiß die Planung, wie viele Stunden sie füllen soll.'));
}
function vsBedarfKarte(d) {
  const st = vsZustand(), tage = d.schule.tage;
  const tabs = h('div', { class: 'reiter', role: 'tablist' }, tage.map((t, i) => {
    const n = vsBedarfe(d, i).length;
    return h('button', { class: 'reiterknopf' + (st.tag === i ? ' aktiv' : ''), role: 'tab', 'aria-selected': st.tag === i ? 'true' : 'false', onclick: () => { st.tag = i; render(); } }, tagLang(i), n ? null : h('span', { class: 'badge warn', title: 'Für diesen Tag ist noch kein Vorschulbedarf eingetragen.' }, '–'));
  }));
  const heute = vsBedarfe(d, st.tag);
  const karten = heute.map(b => bedarfDetailKarte(d, b, { eingebettet: true }));
  const mind = vorschuleMindestbedarf(d);
  return h('div', {},
    h('div', { class: 'karte' }, h('div', { class: 'zeile' }, h('h2', {}, 'Bedarf je Tag'), h('span', { class: 'badge neutral', title: 'Summe aus Minimum × Dauer über alle Tage, ohne Sollbesetzung sowie Früh-/Spätaufsicht' }, 'Mindestbedarf pro Woche: ' + dauerText(mind))),
      h('p', { class: 'muted klein' }, 'Wie viele Personen werden wann gebraucht? „Minimum“ muss besetzt werden, „Soll“ ist der Wunsch – bei der Soll-Besetzung hilft die Reserve nicht. Über das Pfeilsymbol lässt sich ein Tag auf andere Tage übertragen.'),
      tabs),
    karten.length ? karten : h('div', { class: 'karte' }, h('p', { class: 'muted' }, 'Für ' + tagLang(st.tag) + ' ist noch kein Vorschulbedarf eingetragen.')),
    h('div', { class: 'zeile' }, h('button', { class: 'btn klein', onclick: () => vsBedarfErgaenzen(st.tag) }, '+ Bedarf für ' + tagLang(st.tag))));
}
function vsBilanzKarte(d) {
  const liste = vorschuleBilanz(d);
  if (!liste.length) return h('div', { class: 'karte' }, h('h2', {}, 'Wochenbilanz'), h('p', { class: 'muted' }, 'Sobald Stammkräfte oder Reserve festgelegt sind, zeigt die Bilanz hier, wie viele Stunden sie in der Vorschule und in der Betreuung arbeiten und wie weit sie ihre Wochenarbeitszeit erreichen.'));
  const stammSoll = liste.filter(x => x.rolle === 'stamm').reduce((n, x) => n + x.soll, 0), stammIst = liste.filter(x => x.rolle === 'stamm').reduce((n, x) => n + x.vorschule + x.betreuung, 0);
  const mind = vorschuleMindestbedarf(d), kap = liste.reduce((n, x) => n + x.soll, 0);
  const warn = mind > kap && kap > 0 ? h('p', { class: 'hinweis warn' }, 'Der Mindestbedarf der Vorschule (' + dauerText(mind) + ') ist größer als die Wochenarbeitszeit aller Stammkräfte und der Reserve zusammen (' + dauerText(kap) + '). Rechnerisch kann er nicht gedeckt werden.') : null;
  const t = m => dauerText(m) || '0 h';
  return h('div', { class: 'karte' }, h('h2', {}, 'Wochenbilanz'),
    h('p', { class: 'muted klein' }, 'Geplante Dienste, Wochenrhythmus und Rotation anteilig. „Gesamt“ und „Soll“ sind die Werte der Arbeitszeit (mit Unterricht und Aufgaben).'),
    warn,
    h('div', { class: 'tabwrap' }, h('table', { class: 'tab' },
      h('thead', {}, h('tr', {}, ['Person', 'Rolle', 'Vorschule', 'Früh-/Spätaufsicht, Betreuung', 'Sonstige Dienste', 'Gesamt', 'Soll', 'Differenz'].map((x, i) => h('th', { class: i > 1 ? 'zahl' : '' }, x)))),
      h('tbody', {}, liste.map(x => {
        const diff = x.ist - x.soll;
        return h('tr', {}, h('td', {}, x.name || x.kuerzel), h('td', {}, x.rolle === 'stamm' ? 'Stammkraft' : 'Reserve'), h('td', { class: 'zahl' }, t(x.vorschule)), h('td', { class: 'zahl' }, t(x.betreuung)),
          h('td', { class: 'zahl' }, x.sonstige ? h('span', { class: x.rolle === 'stamm' ? 'badge err' : '', title: x.rolle === 'stamm' ? 'Stammkräfte sind nur für Vorschule und Betreuung zulässig. Bitte prüfen.' : '' }, t(x.sonstige)) : '–'),
          h('td', { class: 'zahl' }, t(x.ist)), h('td', { class: 'zahl' }, x.soll ? t(x.soll) : '–'), h('td', { class: 'zahl' }, x.soll ? h('span', { class: 'badge ' + (Math.abs(diff) < 15 ? 'ok' : diff < 0 ? 'warn' : 'err') }, (diff > 0 ? '+' : diff < 0 ? '−' : '') + t(diff)) : '–'));
      })),
      h('tfoot', {}, h('tr', {}, h('td', {}, 'Stammkräfte'), h('td', {}), h('td', { class: 'zahl', colspan: 2 }, t(stammIst) + ' in Vorschule/Betreuung'), h('td', {}), h('td', {}), h('td', { class: 'zahl' }, stammSoll ? t(stammSoll) : '–'), h('td', {}))))));
}
SEITEN_RENDER.vorschule = () => {
  const d = APP.daten, hat = d.dienste.bereiche.some(b => b.vorschule);
  const kopf = seitenkopf('Vorschule & Betreuung', 'Die Vorschule hat eigene Stammkräfte und eine Reserve. Stammkräfte arbeiten nur in der Vorschule sowie in Früh-/Spätaufsicht und Betreuung und unterrichten nie. Die Reserve hilft nur, wenn der Mindestbedarf sonst offen bliebe. Wie viele Personen wann gebraucht werden, trägst du je Tag ein; geplant wird mit der normalen Aufsichtsplanung.',
    h('button', { class: 'btn', onclick: () => dienstePlanenStarten(true), title: 'Behält alle vorhandenen Aufsichtseinsätze und besetzt nur, was fehlt.' }, 'Nur offene besetzen'),
    h('button', { class: 'btn primaer', onclick: () => dienstePlanenStarten(false), title: 'Plant alle automatischen Aufsichten der Schule neu, nicht nur die Vorschule. Nur von Hand gesetzte und fixierte Einsätze bleiben.' }, 'Alle Aufsichten neu planen'));
  if (!hat) return [kopf, vsRollenKarte(d), h('div', { class: 'karte' }, h('h2', {}, 'Vorschule einrichten'), h('p', {}, 'Legt den Bereich „Vorschule“ mit einem Bedarf je Schultag an (ein Abschnitt über die Schulzeit, mindestens eine Person). Zeiten und Anzahl passt du danach an. Die bestehende Planung bleibt unverändert.'), h('button', { class: 'btn primaer', onclick: vsEinrichten }, 'Vorschule anlegen'))];
  return [kopf, vsRollenKarte(d), vsBedarfKarte(d), vsBilanzKarte(d)];
};
