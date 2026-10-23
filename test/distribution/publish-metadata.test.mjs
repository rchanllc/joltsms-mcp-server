import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const run = promisify(execFile);

test('release publication preserves the tested tarball without local-path metadata', { timeout: 120_000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'joltsms-publish-test-'));
  const uploads = [];
  const requests = [];
  const server = createServer(async (request, response) => {
    requests.push({ method: request.method, url: request.url });
    if (request.method === 'PUT') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      uploads.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      response.writeHead(201, { 'Content-Type': 'application/json' });
      response.end('{"ok":true}');
    } else {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end('{"error":"not_found"}');
    }
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const registry = `http://127.0.0.1:${port}/`;
    const userconfig = join(directory, 'npmrc');
    const globalconfig = join(directory, 'global-npmrc');
    writeFileSync(userconfig, `registry=${registry}\n@joltsms:registry=${registry}\n//127.0.0.1:${port}/:_authToken=local-test-only\n`, { mode: 0o600 });
    writeFileSync(globalconfig, '', { mode: 0o600 });
    const env = {
      PATH: process.env.PATH,
      npm_config_userconfig: userconfig,
      npm_config_globalconfig: globalconfig,
      npm_config_cache: join(directory, 'cache'),
      npm_config_registry: registry,
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_update_notifier: 'false',
    };
    const options = { cwd: root, env, encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024 };
    const packedOutput = JSON.parse(execFileSync(process.execPath,
      [process.env.npm_execpath, 'pack', '--ignore-scripts', '--json', '--pack-destination', directory], options));
    const packed = Array.isArray(packedOutput) ? packedOutput[0] : packedOutput[manifest.name];
    const testedTarball = readFileSync(join(directory, packed.filename));

    await run(process.execPath, [process.env.npm_execpath, 'run', 'release:publish', '--',
      `--registry=${registry}`, `--@joltsms:registry=${registry}`], options);

    assert.equal(uploads.length, 1, 'Exactly one registry upload expected');
    assert.ok(requests.every(request => /^\/@joltsms(?:%2f|\/)mcp-server(?:\?|$)/i.test(request.url)), 'Only the local package endpoint may be used');
    const upload = uploads[0];
    const published = upload.versions[manifest.version];
    assert.equal(upload['dist-tags'].latest, manifest.version);
    assert.ok(published);
    assert.equal(published._resolved, undefined);
    assert.equal(published._from, undefined);
    const metadata = JSON.stringify({ ...upload, _attachments: undefined });
    for (const privatePath of [root, directory, process.cwd()]) {
      assert.ok(!metadata.includes(privatePath), 'Local paths must not enter registry metadata');
    }
    assert.doesNotMatch(metadata, /(?:\/home\/|\/Users\/|[A-Za-z]:\\\\Users\\\\)/);
    const attachments = Object.values(upload._attachments);
    assert.equal(attachments.length, 1);
    const uploadedTarball = Buffer.from(attachments[0].data, 'base64');
    assert.deepEqual(uploadedTarball, testedTarball, 'Publication must upload the reviewed package bytes');
    assert.equal(published.dist.integrity, `sha512-${createHash('sha512').update(testedTarball).digest('base64')}`);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});
