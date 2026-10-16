import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkProtocol } from './helpers/protocol.mjs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('stdio tools register, validate input, and preserve the API contract', { timeout: 30_000 }, async () => {
  await checkProtocol({ command: process.execPath, args: ['dist/server.js'], version });
});
