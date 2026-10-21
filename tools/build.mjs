// Baut index.html aus den Quelldateien unter src/ (Reihenfolge: src/manifest.json).
// Die Dateien werden Byte für Byte aneinandergehängt – es gibt keine Umformung, kein Bundler-Format, keine Abhängigkeiten.
//   node tools/build.mjs                  schreibt index.html
//   node tools/build.mjs --check          baut im Speicher und vergleicht mit index.html auf der Platte (Exit 1 bei Abweichung)
//   node tools/build.mjs --gegen <Ref>    vergleicht zusätzlich mit index.html aus einem Git-Stand, z. B. 7cbb387 oder origin/main
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(wurzel, 'src', 'manifest.json'), 'utf8'));

export function baue() {
  const teile = manifest.dateien.map(f => {
    const voll = path.join(wurzel, f);
    if (!fs.existsSync(voll)) throw new Error('Quelldatei fehlt: ' + f);
    const b = fs.readFileSync(voll);
    if (b.includes(13)) throw new Error('CR gefunden (nur LF erlaubt): ' + f);
    return b;
  });
  return Buffer.concat(teile);
}

const sha = b => crypto.createHash('sha256').update(b).digest('hex').slice(0, 12);
function vergleiche(name, a, b) {
  if (Buffer.compare(a, b) === 0) { console.log('gleich    ' + name + ' (' + a.length + ' Byte, sha256 ' + sha(a) + ')'); return true; }
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const zeile = a.subarray(0, i).toString('utf8').split('\n').length;
  console.error('ABWEICHUNG ' + name + ': Build ' + a.length + ' Byte, Vergleich ' + b.length + ' Byte, erster Unterschied bei Byte ' + i + ' (Zeile ' + zeile + ')');
  return false;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const ausgabe = path.join(wurzel, manifest.ausgabe);
  const bau = baue();
  let ok = true;
  const i = args.indexOf('--gegen');
  if (i >= 0) {
    const ref = args[i + 1]; if (!ref) throw new Error('--gegen braucht einen Git-Verweis');
    const alt = execFileSync('git', ['show', ref + ':' + manifest.ausgabe], { cwd: wurzel, maxBuffer: 1 << 28 });
    ok = vergleiche('gegen ' + ref, bau, alt) && ok;
  }
  if (args.includes('--check')) ok = vergleiche('gegen ' + manifest.ausgabe + ' auf der Platte', bau, fs.readFileSync(ausgabe)) && ok;
  else if (i < 0) { fs.writeFileSync(ausgabe, bau); console.log('geschrieben ' + manifest.ausgabe + ' (' + bau.length + ' Byte, sha256 ' + sha(bau) + ', ' + manifest.dateien.length + ' Quelldateien)'); }
  process.exit(ok ? 0 : 1);
}
