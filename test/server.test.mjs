import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { validator } from 'hono/validator';
import { bodyLimit } from 'hono/body-limit';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { checkProtocol } from './helpers/protocol.mjs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('stdio tools register, validate input, and preserve the API contract', { timeout: 30_000 }, async () => {
  await checkProtocol({ command: process.execPath, args: ['dist/server.js'], version });
});

// These fixtures exercise optional SDK HTTP dependencies; the public server stays stdio-only.
// They do not claim live customer API access or memory-exhaustion resistance.
test('JSON validator sees fields for parameterized content types', async () => {
  const app = new Hono();
  app.post('/', validator('json', (value, c) => {
    if (value.admin === true) return c.text('forbidden', 403);
    return value;
  }), async c => c.json(await c.req.json()));

  for (const type of ['application/json', 'application/json ; charset=utf-8', 'application/json;', 'application/json; unusual*=value']) {
    const send = admin => app.request('http://fixture.invalid/', {
      method: 'POST', headers: { 'content-type': type }, body: JSON.stringify({ admin, query: '{}' }),
    });
    assert.equal((await send(true)).status, 403, `must validate ${type}`);
    const accepted = await send(false);
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { admin: false, query: '{}' });
  }
});

test('form validator sees fields for parameterized content types', async () => {
  const app = new Hono();
  app.post('/', validator('form', (value, c) => {
    if (value.role === 'admin') return c.text('forbidden', 403);
    return value;
  }), async c => c.json(await c.req.parseBody()));

  for (const type of ['application/x-www-form-urlencoded', 'application/x-www-form-urlencoded ; charset=utf-8', 'application/x-www-form-urlencoded;']) {
    const send = role => app.request('http://fixture.invalid/', {
      method: 'POST', headers: { 'content-type': type }, body: new URLSearchParams({ role }),
    });
    assert.equal((await send('admin')).status, 403, `must validate ${type}`);
    const accepted = await send('reader');
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { role: 'reader' });
  }
});

test('chunked bodies preserve size limits and allowed content', async () => {
  const app = new Hono();
  app.use(bodyLimit({ maxSize: 8 }));
  app.post('/', async c => c.text(await c.req.text()));
  const send = text => app.request(new Request('http://fixture.invalid/', {
    method: 'POST', duplex: 'half', body: new ReadableStream({
      start(controller) {
        for (const byte of new TextEncoder().encode(text)) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      },
    }),
  }));
  const accepted = await send('12345678');
  assert.equal(accepted.status, 200);
  assert.equal(await accepted.text(), '12345678');
  assert.equal((await send('123456789')).status, 413);
});

test('static files reject double decoding and preserve literal percent filenames', async () => {
  const root = await mkdtemp(join(tmpdir(), 'joltsms-hono-static-'));
  try {
    await mkdir(join(root, 'static/admin'), { recursive: true });
    await writeFile(join(root, 'static/admin/secret.txt'), 'private fixture');
    await writeFile(join(root, 'static/public.txt'), 'public fixture');
    await writeFile(join(root, 'static/100%.txt'), 'literal percent fixture');
    const app = new Hono();
    app.use('/static/admin/*', c => c.text('forbidden', 403));
    app.use('/static/*', serveStatic({ root, allowPercentInPath: true }));
    const get = path => app.request(`http://fixture.invalid${path}`);
    assert.equal((await get('/static/admin/secret.txt')).status, 403);
    assert.equal((await get('/static/%%36%31dmin/secret.txt')).status, 404);
    assert.equal(await (await get('/static/public.txt')).text(), 'public fixture');
    assert.equal(await (await get('/static/100%25.txt')).text(), 'literal percent fixture');
    assert.equal((await app.request('http://fixture.invalid/static/public.txt', { method: 'POST' })).status, 404);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Node adapter rejects raw path backslashes without rejecting encoded or query backslashes', { timeout: 10_000 }, async () => {
  const app = new Hono();
  app.get('*', c => c.text('public fixture'));
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
  try {
    if (!server.listening) await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const get = path => new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: address.port, path, agent: false }, res => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(await get('/public'), 200);
    assert.equal(await get('/admin\\secret'), 400);
    assert.equal(await get('/admin%5Csecret'), 200);
    assert.equal(await get('/public?query=back\\slash'), 200);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
