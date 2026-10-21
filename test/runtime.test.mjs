import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { assertSupportedNode } from '../dist/runtime.js';

test('supports the patched stable Node release lines', () => {
  for (const version of ['22.23.4', '22.23.5', '22.24.0', '24.22.1', '24.23.0', '26.12.1', '26.13.0']) {
    assert.doesNotThrow(() => assertSupportedNode(version), version);
  }
});

test('rejects vulnerable, unsupported, prerelease and malformed runtimes', () => {
  for (const version of ['20.20.2', '22.23.3', '22.22.99', '23.11.0', '24.22.0', '25.9.0',
    '26.11.1', '26.12.0', '27.0.0', '22.23.4-rc.1', 'unknown', '22.23']) {
    assert.throws(() => assertSupportedNode(version), /Update the Node.js installation/, version);
  }
});

test('CLI rejects an old runtime on stderr before configuration or protocol handling', () => {
  const bootstrap = `Object.defineProperty(process.versions, 'node', { value: '22.23.3' }); await import('./dist/server.js');`;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', bootstrap], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, JOLTSMS_API_KEY: '' },
    encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /requires patched Node.js/);
  assert.match(result.stderr, /found 22\.23\.3/);
  assert.doesNotMatch(result.stderr, /Missing required env/);
});
