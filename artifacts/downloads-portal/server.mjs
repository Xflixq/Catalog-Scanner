#!/usr/bin/env node
/**
 * Public downloads host for DTM Inventory.
 * Deploy behind reverse proxy at https://dtmsuite.xflixq.com/downloads
 *
 * Env:
 *   PORT=47880
 *   DOWNLOADS_DIR=/var/www/dtm/downloads   (binary files)
 *   BASE_PATH=/downloads                  (if served under subpath)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const publicDir = path.join(__dirname, 'public');
const downloadsDir = path.resolve(
  process.env.DOWNLOADS_DIR || path.join(root, 'dist/downloads'),
);
const port = Number(process.env.PORT || 47880);
const basePath = String(process.env.BASE_PATH || '').replace(/\/$/, '');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.msi': 'application/octet-stream',
  '.exe': 'application/octet-stream',
  '.apk': 'application/vnd.android.package-archive',
  '.zip': 'application/zip',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function stripBase(urlPath) {
  if (!basePath) return urlPath;
  if (urlPath === basePath) return '/';
  if (urlPath.startsWith(basePath + '/')) return urlPath.slice(basePath.length) || '/';
  return urlPath;
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
  const out = [];
  const allow = new Set(['.msi', '.apk', '.exe', '.txt', '.pdf']); // no zip preference
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
      url: `${basePath}/files/${encodeURIComponent(name)}`,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const server = http.createServer((req, res) => {
  let url = stripBase(req.url || '/');

  if (url === '/api/files' || url === '/api/files/') {
    send(res, 200, JSON.stringify({ files: listDownloads(), host: 'dtmsuite.xflixq.com/downloads' }, null, 2), 'application/json; charset=utf-8');
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
  // map /downloads -> index when base already stripped
  const filePath = safeJoin(publicDir, rel);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    send(res, 404, 'Not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(filePath).pipe(res);
});

// ensure logo
const logoSrc = path.join(root, 'artifacts/master-server/src/gui/shared/brand/icon-256.png');
const logoDst = path.join(publicDir, 'logo.png');
try {
  if (fs.existsSync(logoSrc)) fs.copyFileSync(logoSrc, logoDst);
} catch {}

server.listen(port, '0.0.0.0', () => {
  console.log('');
  console.log('DTM Inventory Downloads');
  console.log('-------------------------');
  console.log(`Open: http://127.0.0.1:${port}${basePath || ''}/`);
  console.log(`Public: https://dtmsuite.xflixq.com/downloads`);
  console.log(`Files: ${downloadsDir}`);
  console.log('');
});
