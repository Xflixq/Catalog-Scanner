#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const publicDir = path.join(__dirname, 'public');
const downloadsDir = path.join(root, 'dist/downloads');
const port = Number(process.env.PORT || 47880);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.msi': 'application/octet-stream',
  '.exe': 'application/octet-stream',
  '.apk': 'application/vnd.android.package-archive',
  '.zip': 'application/zip',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function safeJoin(base, reqPath) {
  const decoded = decodeURIComponent(reqPath.split('?')[0]);
  const cleaned = decoded.replace(/^\/+/, '');
  const full = path.normalize(path.join(base, cleaned));
  if (!full.startsWith(base)) return null;
  return full;
}

function listDownloads() {
  if (!fs.existsSync(downloadsDir)) return [];
  /** @type {{name:string,size:number,mtime:string,url:string}[]} */
  const out = [];
  // Only surface top-level package files (zip/msi/apk/exe/cjs/txt/cmd).
  // Nested export folders stay downloadable by direct URL but are not listed.
  const allow = new Set(['.zip', '.msi', '.apk', '.exe', '.cjs', '.txt', '.cmd', '.pdf']);
  for (const name of fs.readdirSync(downloadsDir)) {
    const full = path.join(downloadsDir, name);
    const st = fs.statSync(full);
    if (!st.isFile()) continue;
    const ext = path.extname(name).toLowerCase();
    if (!allow.has(ext)) continue;
    out.push({
      name,
      size: st.size,
      mtime: st.mtime.toISOString(),
      url: `/files/${encodeURIComponent(name)}`,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const server = http.createServer((req, res) => {
  const url = req.url || '/';

  if (url === '/api/files') {
    send(res, 200, JSON.stringify({ files: listDownloads() }, null, 2), 'application/json; charset=utf-8');
    return;
  }

  if (url.startsWith('/files/')) {
    const filePath = safeJoin(downloadsDir, url.slice('/files/'.length));
    if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      send(res, 404, 'Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Content-Length': fs.statSync(filePath).size,
      'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`,
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  let rel = url === '/' ? '/index.html' : url;
  const filePath = safeJoin(publicDir, rel);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    send(res, 404, 'Not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(port, '0.0.0.0', () => {
  console.log('');
  console.log('DTM Inventory Downloads');
  console.log('-------------------------');
  console.log(`Open: http://127.0.0.1:${port}`);
  console.log(`Files: ${downloadsDir}`);
  console.log('');
});
