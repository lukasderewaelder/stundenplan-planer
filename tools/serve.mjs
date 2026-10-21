// Kleiner statischer Server für die lokale Vorschau (z. B. für die Oberflächen-Selbsttests im Browser): node tools/serve.mjs [Port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || 8765);
const typen = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
http.createServer((req, res) => {
  const pfad = path.join(wurzel, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const datei = pfad.endsWith(path.sep) || pfad === wurzel ? path.join(pfad, 'index.html') : pfad;
  if (!datei.startsWith(wurzel) || !fs.existsSync(datei) || !fs.statSync(datei).isFile()) { res.writeHead(404); res.end('nicht gefunden'); return; }
  res.writeHead(200, { 'Content-Type': typen[path.extname(datei)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(datei).pipe(res);
}).listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port + '/'));
