'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { ViewerManager } = require('../src/manager.cjs');
const root = process.env.VIEWER_APP_DIR ? path.resolve(process.env.VIEWER_APP_DIR) : path.resolve(__dirname, '../app');
const manager = new ViewerManager({ credentialsDirectory: process.env.VIEWER_CREDENTIALS_DIR || (process.platform === 'win32' ? undefined : path.join(os.tmpdir(), 'lg-xmeye-viewer')) });
const port = Number(process.env.VIEWER_PORT) || 19428;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:' + port);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (url.pathname.startsWith('/api/')) {
    const method = url.pathname.slice(5), origin = request.headers.origin;
    if (request.method !== 'POST' || request.headers['x-viewer-client'] !== '1' || (origin && origin !== 'http://' + request.headers.host) || !manager.methods.includes(method)) {
      response.writeHead(403); response.end(); return;
    }
    let size = 0, body = '';
    try {
      for await (const part of request) { size += part.length; if (size > 65536) throw new Error('Слишком большой запрос'); body += part.toString('utf8'); }
      const parameters = body ? JSON.parse(body) : {};
      const result = await manager[method](parameters);
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ returnValue: true, ...result, ...(method === 'bootstrap' ? { native: false } : {}) }));
    } catch (error) {
      response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ returnValue: false, errorText: error.message || 'Ошибка запроса', errorCode: Number(error.code) || -1 }));
    }
    return;
  }
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  let file;
  try { file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)); }
  catch (_) { response.writeHead(400); response.end(); return; }
  if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    response.end(request.method === 'HEAD' ? undefined : data);
  });
});
server.listen(port, '127.0.0.1', () => console.log('Viewer preview: http://127.0.0.1:' + port));
server.on('error', error => { console.error(error.code || 'Server error'); process.exitCode = 1; });
async function close() { await manager.close(); server.close(); }
process.on('SIGTERM', () => close().finally(() => process.exit(0)));
process.on('SIGINT', () => close().finally(() => process.exit(0)));
