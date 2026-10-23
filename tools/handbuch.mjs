// Erzeugt das PDF-Benutzerhandbuch: Bildschirmfotos der eingebauten Beispieldaten (Chrome/Edge headless) + PDF aus handbuch/quelle/.
//   node tools/handbuch.mjs                    alle Bilder neu aufnehmen und PDF schreiben
//   node tools/handbuch.mjs --nur-pdf          vorhandene Bilder (handbuch/bilder/) verwenden, nur die PDF neu schreiben
//   node tools/handbuch.mjs --nur-bilder       nur Bildschirmfotos
//   node tools/handbuch.mjs --kapitel 3,5      nur die Bilder dieser Kapitel neu aufnehmen (nutzt den gespeicherten Planzustand), dann PDF
//   --zeit <s>   Rechenzeit der Beispielberechnung (Standard 20)     --png    Bilder als PNG (größer, verlustfrei; Standard ist JPEG)
// Text und Layout stehen in handbuch/quelle/ (handbuch.html, kapitel/*.html, handbuch.css); die Aufnahmen je Kapitel in tools/handbuch-kapitel.mjs.
import { nimmBilder } from './handbuch-bilder.mjs';
import { kapitelTabelle } from './handbuch-kapitel.mjs';
import { schreibePdf } from './handbuch-pdf.mjs';

const args = process.argv.slice(2);
const opt = n => args.includes('--' + n);
const wert = (n, std) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : std; };

if (!opt('nur-pdf')) await nimmBilder({ kapitel: wert('kapitel', null), zeit: Number(wert('zeit', 20)), format: opt('png') ? 'png' : 'jpeg', kapitelTabelle });
if (!opt('nur-bilder')) await schreibePdf();
console.log('fertig');
