import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.js';

test('HTTP CRUD, validation, concurrent writes and persistence across restart', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'notes-api-'));
  const dataFile = path.join(dir, 'notes.json');
  let server;
  async function start() {
    server = await createApp({ dataFile });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() {
    await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
  try {
    let base = await start();
    const write = (method, route, body) => fetch(base + route, {
      method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    assert.deepEqual(await (await fetch(base + '/health')).json(), { status: 'ok' });
    assert.equal((await write('POST', '/api/notes', { text: ' ' })).status, 400);
    assert.equal((await fetch(base + '/api/notes', { method: 'POST', body: '{' })).status, 400);
    assert.equal((await write('POST', '/api/notes', { text: 'x'.repeat(17000) })).status, 413);
    const response = await write('POST', '/api/notes', { text: 'hello' });
    assert.equal(response.status, 201);
    const note = await response.json();
    assert.equal((await (await fetch(base + '/api/notes/' + note.id)).json()).text, 'hello');
    assert.equal((await write('PUT', '/api/notes/' + note.id, { text: 'updated' })).status, 200);
    const concurrent = await Promise.all(['a', 'b', 'c'].map(text => write('POST', '/api/notes', { text })));
    assert.ok(concurrent.every(r => r.status === 201));
    await stop();
    base = await start();
    const restored = await (await fetch(base + '/api/notes')).json();
    assert.equal(restored.length, 4);
    assert.equal(restored.find(n => n.id === note.id).text, 'updated');
    assert.equal((await fetch(base + '/api/notes/' + note.id, { method: 'DELETE' })).status, 204);
    assert.equal((await fetch(base + '/api/notes/' + note.id)).status, 404);
    assert.equal((await fetch(base + '/missing')).status, 404);
  } finally {
    if (server?.listening) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
