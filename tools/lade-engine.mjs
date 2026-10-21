// Lädt die Rechen-Engine (src/engine/*) – und auf Wunsch die Selbsttests (src/tests/*) – in einen Node-vm-Kontext.
// Die Engine ist ein klassisches Skript ohne DOM-Zugriffe (läuft ebenso im Web Worker); hier fehlen ihr nur Browser-Globals,
// die sie ohnehin nicht braucht. Alle Funktionen der Engine stehen danach als Eigenschaften von `kontext` bereit
// (const/class-Deklarationen wie `Plan` oder `REGELN` über `kontext.hole('Plan')`).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(wurzel, 'src', 'manifest.json'), 'utf8'));

export function quelltext(praefix) {
  return manifest.dateien.filter(f => f.startsWith(praefix)).map(f => fs.readFileSync(path.join(wurzel, f), 'utf8')).join('');
}

// mitTests: zusätzlich die Selbsttests laden (eigener Skriptblock wie im Browser, im selben Kontext)
// aendere: optional, Text der Engine vor dem Laden umformen (Mutationstests: absichtlich eingebaute Fehler)
export function ladeEngine({ mitTests = false, aendere = null } = {}) {
  const sandbox = { console, setTimeout, clearTimeout, performance, structuredClone };
  const kontext = vm.createContext(sandbox, { name: 'engine' });
  const engine = quelltext('src/engine/');
  vm.runInContext(aendere ? aendere(engine) : engine, kontext, { filename: 'engine.js' });
  if (mitTests) vm.runInContext(quelltext('src/tests/'), kontext, { filename: 'selbsttests.js' });
  // Zugriff auf Namen, die nicht an der globalen Umgebung hängen (const, class)
  kontext.hole = name => vm.runInContext(name, kontext);
  return kontext;
}
