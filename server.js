// Zero-dependency static server. WebHID needs a secure context, and
// http://localhost counts as one, so this is all the site needs locally.
//
//   node server.js [--port 8137] [--open]

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PUBLIC = new Set(['index.html', 'styles.css', 'src', 'vendor']);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const port = Number(portArg >= 0 ? args[portArg + 1] : process.env.PORT) || 8137;

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const rel = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, '') || 'index.html';
  const file = join(ROOT, rel);
  // Only serve the site itself (not package.json, tools/, etc.) and never escape ROOT.
  if (!file.startsWith(ROOT + sep) || !PUBLIC.has(rel.split(/[/\\]/)[0])) {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('Not found');
  }
});

server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`Port ${port} is busy — maybe XFKEY Studio is already running at http://localhost:${port}/ ?`);
  console.error('Or pick another port: npm start -- --port 8138');
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  const url = `http://localhost:${port}/`;
  console.log(`XFKEY Studio running at ${url}  (Ctrl+C to stop)`);
  if (args.includes('--open') && process.platform === 'darwin') {
    execFile('open', ['-a', 'Google Chrome', url], (err) => err && execFile('open', [url]));
  }
});
