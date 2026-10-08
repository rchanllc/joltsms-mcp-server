import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('stdio tools register, validate input, and call the JoltSMS API', async () => {
  const requests = [];
  const api = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url, authorization: request.headers.authorization });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ data: [], meta: { hasMore: false, total: 0, limit: 10 } }));
  });

  await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
  const address = api.address();
  assert.ok(address && typeof address !== 'string');

  const client = new Client({ name: 'joltsms-test', version: '1.0.0' }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/server.js'],
    env: {
      ...process.env,
      JOLTSMS_API_KEY: 'jolt_sk_test',
      JOLTSMS_API_URL: `http://127.0.0.1:${address.port}`,
    },
  });

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 10);
    assert.ok(tools.some((tool) => tool.name === 'joltsms_list_numbers'));

    const listed = await client.callTool({ name: 'joltsms_list_numbers', arguments: {} });
    assert.equal(listed.isError, undefined);
    assert.equal(listed.content[0].text, 'No phone numbers found. Use joltsms_provision_number to rent one.');

    const invalid = await client.callTool({
      name: 'joltsms_list_numbers',
      arguments: { limit: 11 },
    });
    assert.equal(invalid.isError, true);
    assert.deepEqual(requests, [{
      method: 'GET',
      url: '/v1/numbers?scope=owned&limit=10',
      authorization: 'Bearer jolt_sk_test',
    }]);
  } finally {
    await client.close();
    await new Promise((resolve) => api.close(resolve));
  }
});
