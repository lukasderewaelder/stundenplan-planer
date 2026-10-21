// Lädt die Rechen-Engine (src/engine/*) – und auf Wunsch die Selbsttests (src/tests/*) – für Node.
// Die Engine ist ein klassisches Skript ohne DOM-Zugriffe (läuft ebenso im Web Worker); hier fehlen ihr nur Browser-Globals, die sie
// ohnehin nicht braucht. Sie wird als Funktionskörper im Hauptkontext geladen (vm.Script ohne eigenen Kontext, Dateiname engine.js für Profile), nicht in einem vm-Kontext: In einem vm-Kontext läuft jeder
// Zugriff auf eine globale Funktion oder auf Math über Interzeptoren und ist etwa zehnmal langsamer als im Browser – das würde jede
// Zeit- und Profilmessung verfälschen. Alle Funktionen, Konstanten und Klassen der obersten Ebene stehen danach als Eigenschaften des
// Rückgabeobjekts bereit (`k.loeseStundenplan`, `k.hole('Plan')`); `let`-Variablen werden nicht herausgereicht.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(wurzel, 'src', 'manifest.json'), 'utf8'));

export function quelltext(praefix) {
  return manifest.dateien.filter(f => f.startsWith(praefix)).map(f => fs.readFileSync(path.join(wurzel, f), 'utf8')).join('');
}

// Namen der obersten Ebene (Spalte 0): function, async function, const, class
const namenVon = text => [...text.matchAll(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^(?:const|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1] || m[2]);

// mitTests: zusätzlich die Selbsttests laden (eigener Skriptblock wie im Browser, im selben Gültigkeitsbereich)
// aendere: optional, Text der Engine vor dem Laden umformen (Mutationstests: absichtlich eingebaute Fehler)
// zusatz: weitere Quelltexte, die im selben Gültigkeitsbereich laufen (z. B. Referenzfassungen von Regeln für Vergleiche)
export function ladeEngine({ mitTests = false, aendere = null, zusatz = [] } = {}) {
  const engine = aendere ? aendere(quelltext('src/engine/')) : quelltext('src/engine/');
  const teile = [engine];
  if (mitTests) teile.push(quelltext('src/tests/'));
  teile.push(...zusatz);
  const namen = [...new Set(teile.flatMap(namenVon))];
  const koerper = teile.join('\n') + '\n;return {' + namen.map(n => JSON.stringify(n) + ': ' + n).join(', ') + '};';
  const k = new vm.Script('(function(){' + koerper + '\n})', { filename: 'engine.js' }).runInThisContext()();
  k.hole = name => k[name];
  return k;
}
