import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function createApp({ dataFile = process.env.DATA_FILE || 'data/notes.json' } = {}) {
  let notes;
  try {
    notes = JSON.parse(await readFile(dataFile, 'utf8'));
    if (!Array.isArray(notes) || notes.some(n => typeof n.id !== 'string' || typeof n.text !== 'string')) {
      throw new Error('Invalid notes data');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    notes = [];
  }
  let queue = Promise.resolve();
  async function persist(next) {
    await mkdir(path.dirname(dataFile), { recursive: true });
    await writeFile(`${dataFile}.tmp`, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
    await rename(`${dataFile}.tmp`, dataFile);
    notes = next;
  }
  function send(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  }
  async function textBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16384) throw Object.assign(new Error('Body too large'), { status: 413 });
      chunks.push(chunk);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString()); }
    catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
    if (!body || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 2000) {
      throw Object.assign(new Error('text must contain 1–2000 characters'), { status: 400 });
    }
    return body.text.trim();
  }
  async function handle(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname;
      if (req.method === 'GET' && route === '/health') return send(res, 200, { status: 'ok' });
      if (req.method === 'GET' && route === '/api/notes') return send(res, 200, notes);
      if (req.method === 'POST' && route === '/api/notes') {
        const text = await textBody(req);
        const note = { id: randomUUID(), text, createdAt: new Date().toISOString() };
        await persist([...notes, note]);
        return send(res, 201, note);
      }
      const match = /^\/api\/notes\/([a-zA-Z0-9-]+)$/.exec(route);
      if (match && ['GET', 'PUT', 'DELETE'].includes(req.method)) {
        const index = notes.findIndex(n => n.id === match[1]);
        if (index === -1) return send(res, 404, { error: 'Note not found' });
        if (req.method === 'GET') return send(res, 200, notes[index]);
        const next = [...notes];
        if (req.method === 'DELETE') {
          next.splice(index, 1);
          await persist(next);
          return send(res, 204);
        }
        next[index] = { ...next[index], text: await textBody(req), updatedAt: new Date().toISOString() };
        await persist(next);
        return send(res, 200, next[index]);
      }
      return send(res, 404, { error: 'Route not found' });
    } catch (error) {
      if (!error.status) console.error(error);
      if (!res.destroyed) send(res, error.status || 500, { error: error.status ? error.message : 'Internal server error' });
    }
  }
  // Serialize requests so each JSON-file mutation observes the previous write.
  return http.createServer((req, res) => {
    queue = queue.then(() => handle(req, res)).catch(console.error);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const server = await createApp();
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 3000);
  server.listen(port, host, () => console.log(`API listening on ${host}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
