import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { checkProtocol } from '../helpers/protocol.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const registry = JSON.parse(readFileSync(join(root, 'server.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));

test('published tarball installs a locked runtime and both executable names work', { timeout: 120_000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'joltsms-package-test-'));
  const npm = (args, cwd = root) => execFileSync(process.execPath, [process.env.npm_execpath, ...args], {
    cwd, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    assert.equal(registry.version, manifest.version);
    assert.equal(registry.packages[0].version, manifest.version);
    assert.equal(registry.name, manifest.mcpName);
    assert.equal(lock.version, manifest.version);
    assert.equal(lock.packages[''].version, manifest.version);
    const packOutput = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', directory]));
    const packed = Array.isArray(packOutput) ? packOutput[0] : packOutput[manifest.name];
    for (const { path } of packed.files) {
      assert.match(path, /^(node_modules\/.+|dist\/[a-z0-9/-]+\.(js|d\.ts)|package\.json|README\.md|LICENSE)$/,
        `Unexpected published file: ${path}`);
      assert.doesNotMatch(path, /(^|\/)(\.env(?:\..*)?|\.npmrc|\.mcpregistry_.*)$/);
    }
    assert.ok(packed.files.some(({ path }) => path === 'node_modules/@modelcontextprotocol/sdk/package.json'));
    assert.ok(packed.files.some(({ path }) => path === 'node_modules/zod/package.json'));
    assert.ok(!packed.files.some(({ path }) => /^node_modules\/(typescript|tsx|dotenv|esbuild)\//.test(path)));
    assert.ok(packed.files.some(({ path }) => path === 'dist/tools/reply-to-sms.js'));
    writeFileSync(join(directory, 'package.json'), '{"name":"joltsms-install-check","private":true}');
    npm(['install', '--ignore-scripts', '--omit=dev', '--no-fund', '--no-audit',
      '--registry=https://registry.npmjs.org', join(directory, packed.filename)], directory);
    const packageRoot = join(directory, 'node_modules/@joltsms/mcp-server');
    for (const [path, dependency] of Object.entries(lock.packages)) {
      if (!path || dependency.dev || dependency.optional) continue;
      const installed = JSON.parse(readFileSync(join(packageRoot, path, 'package.json'), 'utf8'));
      assert.equal(installed.version, dependency.version, `Installed graph drift: ${path}`);
    }
    for (const name of ['mcp-server', 'joltsms-mcp']) {
      await checkProtocol({ command: join(directory, 'node_modules/.bin', name), version: manifest.version });
    }
    const installed = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
    assert.equal(installed.engines.node, '>=22');
    npm(['audit', '--omit=dev', '--audit-level=low', '--registry=https://registry.npmjs.org'], directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
