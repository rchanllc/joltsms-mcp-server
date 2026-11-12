import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export async function checkProtocol({ command, args = [], version }) {
  const requests = [];
  const messageId = '11111111-1111-4111-8111-111111111111';
  const subscriptionId = '22222222-2222-4222-8222-222222222222';
  let canceledKey;
  let pendingKey;
  let replyError;
  let walletError;
  let preferenceError;
  const api = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push({ method: request.method, url: request.url,
      authorization: request.headers.authorization, body: body ? JSON.parse(body) : null,
      idempotencyKey: request.headers['x-idempotency-key'] });
    response.setHeader('Content-Type', 'application/json');
    if (request.method === 'GET' && request.url.startsWith('/v1/numbers?')) {
      response.end(JSON.stringify({ data: [], meta: { hasMore: false, total: 0, limit: 10 } }));
    } else if (request.method === 'GET' && request.url.startsWith('/v1/billing/payment-methods?')) {
      response.statusCode = walletError ? 403 : 200;
      response.end(JSON.stringify(walletError || { data: [{ id: 'pm_test', brand: 'visa', last4: '4242',
        isDefault: true, fullNumber: 'must-not-be-returned' }], hasMore: false }));
    } else if (request.method === 'GET' && request.url.startsWith('/v1/messages?')) {
      response.end(JSON.stringify({ data: [{ id: messageId, from: '+12025550101',
        number: { phoneNumber: '+12025550123' }, body: 'Please reply YES',
        receivedAt: '2026-10-15T12:00:00Z' }], meta: { hasMore: false } }));
    } else if (request.url.startsWith('/v1/messages/sender-preferences')) {
      response.statusCode = preferenceError ? 403 : 200;
      response.end(JSON.stringify(preferenceError || (request.method === 'PUT'
        ? JSON.parse(body)
        : { data: [{ numberId: messageId, sender: '+12025550101', hidden: true,
          number: { phoneNumber: '+12025550123' } }], meta: { hasMore: true, nextCursor: 'sender-page-2' } })));
    } else if (request.method === 'POST' && request.url === `/v1/messages/${messageId}/reply`) {
      response.statusCode = replyError?.status || 200;
      response.end(JSON.stringify(replyError?.body || { success: true, status: 'SENT',
        replyId: 'reply_test', messageId, sentAt: '2026-10-15T12:00:00Z' }));
    } else if (request.method === 'POST' && request.url === '/v1/numbers/rent') {
      const key = request.headers['x-idempotency-key'];
      if (canceledKey === key) {
        response.statusCode = 409;
        response.end(JSON.stringify({ error: 'RENTAL_ORDER_CANCELED' }));
      } else if (canceledKey) {
        response.end(JSON.stringify({ success: true, status: 'PROVISIONING', requiresAction: false }));
      } else {
        pendingKey = key;
        response.statusCode = 402;
        response.end(JSON.stringify({ error: 'PAYMENT_REQUIRES_ACTION', subscriptionId,
          hostedInvoiceUrl: 'https://invoice.example.test/authenticate' }));
      }
    } else if (request.method === 'POST' && request.url === `/v1/billing/subscriptions/${subscriptionId}/auto-renew`) {
      canceledKey = pendingKey;
      response.end(JSON.stringify({ success: true, unpaidCheckoutCancelled: true }));
    } else {
      response.statusCode = 404;
      response.end(JSON.stringify({ error: 'Unexpected test request' }));
    }
  });
  await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
  const client = new Client({ name: 'joltsms-release-test', version: '1.0.0' }, { capabilities: {} });
  const transport = new StdioClientTransport({ command, args, env: {
    PATH: process.env.PATH ?? '',
    JOLTSMS_API_KEY: 'jolt_sk_test',
    JOLTSMS_API_URL: `http://127.0.0.1:${api.address().port}`,
  } });
  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion().version, version);
    const { tools } = await client.listTools();
    // Public discovery contract: clients use these hints before authorizing tool calls.
    // These expectations are independent of the server's registration objects.
    const expectedHints = {
      joltsms_hide_sender: [false, false, true, false],
      joltsms_show_sender_in_inbox: [false, false, true, false],
      joltsms_list_hidden_senders: [true, false, true, false],
      joltsms_list_numbers: [true, false, true, false],
      joltsms_get_number: [true, false, true, false],
      joltsms_update_number: [false, true, true, false],
      joltsms_list_payment_methods: [true, false, true, false],
      joltsms_provision_number: [false, true, false, true],
      joltsms_release_number: [false, true, false, true],
      joltsms_list_messages: [true, false, true, false],
      joltsms_reply_to_sms: [false, true, false, true],
      joltsms_mark_read: [false, false, true, false],
      joltsms_wait_for_sms: [true, false, true, false],
      joltsms_get_latest_otp: [true, false, true, false],
      joltsms_billing_status: [true, false, true, false],
    };
    assert.deepEqual(tools.map(({ name }) => name).sort(), Object.keys(expectedHints).sort());
    assert.equal(requests.length, 0, 'discovery must not call the JoltSMS API');
    for (const { name, annotations } of tools) {
      assert.ok(annotations?.title?.trim(), `${name} needs a human-readable title`);
      assert.deepEqual([
        annotations.readOnlyHint, annotations.destructiveHint,
        annotations.idempotentHint, annotations.openWorldHint,
      ], expectedHints[name], `${name} must declare its actual effects explicitly`);
    }
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      'billing_status', 'get_latest_otp', 'get_number', 'list_messages',
      'list_numbers', 'list_payment_methods', 'mark_read', 'provision_number',
      'release_number', 'reply_to_sms', 'update_number', 'wait_for_sms',
      'hide_sender', 'show_sender_in_inbox', 'list_hidden_senders',
    ].map((name) => `joltsms_${name}`).sort());
    const rent = tools.find((tool) => tool.name === 'joltsms_provision_number');
    assert.ok(rent.inputSchema.properties.payment_method_id);
    assert.equal(rent.inputSchema.properties.area_code, undefined);
    const reply = tools.find((tool) => tool.name === 'joltsms_reply_to_sms');
    assert.equal(reply.inputSchema.properties.to, undefined);

    const listed = await client.callTool({ name: 'joltsms_list_numbers', arguments: {} });
    assert.equal(listed.isError, undefined);
    assert.match(listed.content[0].text, /No phone numbers found/);
    for (const [name, input] of [
      ['joltsms_hide_sender', { number_id: '+12025550123', sender: 'otp' }],
      ['joltsms_show_sender_in_inbox', { number_id: messageId, sender: '' }],
      ['joltsms_list_hidden_senders', { number_id: 'not-a-uuid' }],
      ['joltsms_list_messages', { visibility: 'unknown' }],
      // Value: protects=all message readers reject unsupported visibility before API access;
      // fails_when=OTP or polling loses enum validation; why_new=only list_messages had an invalid-visibility case;
      // seam=none; no_claim=server-side visibility enforcement (loopback API).
      ['joltsms_get_latest_otp', { number_id: messageId, visibility: 'unknown' }],
      ['joltsms_wait_for_sms', { number_id: messageId, visibility: 'unknown' }],
      ['joltsms_list_numbers', { limit: 11 }],
      ['joltsms_list_payment_methods', { limit: 0 }],
      ['joltsms_provision_number', { payment_method_id: ' ' }],
      ['joltsms_release_number', { subscription_id: 'not-a-uuid' }],
      ['joltsms_reply_to_sms', { message_id: messageId, content: 'more than fifteen characters' }],
      ['joltsms_reply_to_sms', { to: '+12025550123', content: 'YES' }],
    ]) {
      const invalid = await client.callTool({ name, arguments: input });
      assert.equal(invalid.isError, true);
    }
    assert.equal(requests.length, 1, 'invalid tool calls must not reach the API');
    const cards = await client.callTool({ name: 'joltsms_list_payment_methods', arguments: { limit: 1 } });
    assert.equal(cards.isError, undefined);
    assert.match(cards.content[0].text, /4242/);
    assert.doesNotMatch(cards.content[0].text, /must-not-be-returned/);
    const sent = await client.callTool({ name: 'joltsms_reply_to_sms', arguments: { message_id: messageId, content: 'YES' } });
    assert.equal(sent.isError, undefined);
    assert.match(sent.content[0].text, /Reply sent/);
    assert.deepEqual(requests.map(({ method, url, body }) => ({ method, url, body })), [
      { method: 'GET', url: '/v1/numbers?scope=owned&limit=10', body: null },
      { method: 'GET', url: '/v1/billing/payment-methods?limit=1', body: null },
      { method: 'POST', url: `/v1/messages/${messageId}/reply`, body: { content: 'YES' } },
    ]);
    assert.ok(requests.every((request) => request.authorization === 'Bearer jolt_sk_test'));
    assert.match(requests[2].idempotencyKey, /^[0-9a-f-]{36}$/);

    // Value: protects=installed tools expose message IDs and propagate reply refusal/uncertainty;
    // fails_when=errors become success or trigger hidden retries; why_new=happy-path reply did not cover API refusal;
    // seam=none; no_claim=provider delivery (loopback API stub).
    const messages = await client.callTool({ name: 'joltsms_list_messages', arguments: {} });
    assert.match(messages.content[0].text, new RegExp(`Message ID: ${messageId}`));
    for (const [status, error, message] of [
      [403, 'API_KEY_CAPABILITY_REQUIRED', 'This API key is not allowed to send SMS replies.'],
      [409, 'SMS_REPLY_IN_PROGRESS', 'A reply is already being processed for this SMS.'],
      [503, 'SMS_REPLY_STATUS_UNKNOWN', 'Reply status is unknown. Please check before trying again.'],
    ]) {
      replyError = { status, body: { error, message } };
      const before = requests.length;
      const refused = await client.callTool({ name: 'joltsms_reply_to_sms',
        arguments: { message_id: messageId, content: 'YES' } });
      assert.equal(refused.isError, true);
      assert.ok(refused.content[0].text.includes(message));
      assert.doesNotMatch(refused.content[0].text, /Reply sent/);
      assert.equal(requests.length, before + 1);
    }
    walletError = { error: 'OAUTH_BILLING_READ_SCOPE_REQUIRED' };
    const deniedWallet = await client.callTool({ name: 'joltsms_list_payment_methods', arguments: {} });
    assert.equal(deniedWallet.isError, true);
    assert.match(deniedWallet.content[0].text, /Reconnect.*billing read permission/);

    // Value: protects=installed personal sender controls, filter forwarding and refusal handling;
    // fails_when=scope errors become success or tools send the wrong preference;
    // why_new=existing protocol checks covered replies and billing, not personal sender preferences; seam=none;
    // no_claim=real API authorization (loopback transport contract only).
    for (const [name, hidden] of [['joltsms_hide_sender', true], ['joltsms_show_sender_in_inbox', false]]) {
      const changed = await client.callTool({ name, arguments: { number_id: messageId, sender: '+12025550101' } });
      assert.equal(changed.isError, undefined);
      assert.deepEqual(JSON.parse(changed.content[0].text), {
        numberId: messageId, sender: '+12025550101', hidden, muted: true,
      });
      assert.deepEqual(requests.at(-1).body, { numberId: messageId, sender: '+12025550101', hidden, muted: true });
      assert.equal(requests.at(-1).method, 'PUT');
      assert.equal(requests.at(-1).url, '/v1/messages/sender-preferences');
    }
    // Value: protects=both sender controls preserve the exact 256-character limit;
    // fails_when=the limit changes or an oversized sender reaches the API;
    // why_new=existing sender checks only covered normal and empty values; seam=none;
    // no_claim=backend sender validation (loopback API).
    const longestSender = 'A'.repeat(256);
    for (const [name, hidden] of [['joltsms_hide_sender', true], ['joltsms_show_sender_in_inbox', false]]) {
      const accepted = await client.callTool({ name, arguments: { number_id: messageId, sender: longestSender } });
      assert.equal(accepted.isError, undefined);
      assert.deepEqual(requests.at(-1).body, { numberId: messageId, sender: longestSender, hidden, muted: true });
      const beforeOversized = requests.length;
      const rejected = await client.callTool({ name, arguments: { number_id: messageId, sender: `${longestSender}A` } });
      assert.equal(rejected.isError, true);
      assert.equal(requests.length, beforeOversized, 'oversized senders must not reach the API');
    }
    const hiddenSenders = await client.callTool({ name: 'joltsms_list_hidden_senders',
      arguments: { number_id: messageId, cursor: 'sender-page-1' } });
    assert.equal(hiddenSenders.isError, undefined);
    assert.equal(JSON.parse(hiddenSenders.content[0].text).meta.nextCursor, 'sender-page-2');
    const preferenceUrl = new URL(requests.at(-1).url, 'http://fixture.test');
    assert.equal(preferenceUrl.pathname, '/v1/messages/sender-preferences');
    assert.equal(requests.at(-1).method, 'GET');
    assert.equal(preferenceUrl.searchParams.get('numberId'), messageId);
    assert.equal(preferenceUrl.searchParams.get('cursor'), 'sender-page-1');
    // Value: protects=unfiltered hidden-sender discovery reads the first page across accessible numbers;
    // fails_when=optional filters become undefined strings or listing uses a write verb;
    // why_new=the existing listing case supplied both numberId and cursor; seam=none;
    // no_claim=database ownership or pagination correctness (loopback API).
    const allHiddenSenders = await client.callTool({ name: 'joltsms_list_hidden_senders', arguments: {} });
    assert.equal(allHiddenSenders.isError, undefined);
    assert.deepEqual(JSON.parse(allHiddenSenders.content[0].text).data, [{
      numberId: messageId, sender: '+12025550101', hidden: true,
      number: { phoneNumber: '+12025550123' },
    }]);
    assert.equal(requests.at(-1).method, 'GET');
    assert.equal(requests.at(-1).url, '/v1/messages/sender-preferences');
    const unfilteredPreferenceUrl = new URL(requests.at(-1).url, 'http://fixture.test');
    assert.equal(unfilteredPreferenceUrl.searchParams.has('numberId'), false);
    assert.equal(unfilteredPreferenceUrl.searchParams.has('cursor'), false);
    preferenceError = { error: 'CAPABILITY_REQUIRED', message: 'This API key requires sms:preferences:write.' };
    const beforeRefusal = requests.length;
    const deniedPreference = await client.callTool({ name: 'joltsms_hide_sender',
      arguments: { number_id: messageId, sender: '+12025550101' } });
    assert.equal(deniedPreference.isError, true);
    assert.match(deniedPreference.content[0].text, /sms:preferences:write/);
    assert.equal(requests.length, beforeRefusal + 1, 'a preference refusal must not retry');
    preferenceError = undefined;
    for (const name of ['joltsms_list_messages', 'joltsms_get_latest_otp', 'joltsms_wait_for_sms']) {
      for (const visibility of ['all', 'inbox', 'hidden']) {
        const viewed = await client.callTool({ name, arguments: { number_id: messageId, visibility } });
        assert.equal(viewed.isError, undefined);
        assert.equal(new URL(requests.at(-1).url, 'http://fixture.test').searchParams.get('visibility'), visibility);
        assert.equal(requests.at(-1).authorization, 'Bearer jolt_sk_test');
      }
    }
    for (const name of ['joltsms_list_messages', 'joltsms_get_latest_otp', 'joltsms_wait_for_sms']) {
      await client.callTool({ name, arguments: { number_id: messageId } });
      assert.equal(new URL(requests.at(-1).url, 'http://fixture.test').searchParams.has('visibility'), false,
        'omitted visibility must preserve the API default');
    }

    // Value: protects=3DS retry, confirmed cancellation, and subsequent same-card checkout across installed tools;
    // fails_when=canceled keys persist or authentication retries create a new order; why_new=unit stubs missed cross-tool state;
    // seam=none; no_claim=live billing (loopback API stub).
    for (let retry = 0; retry < 2; retry++) {
      const pending = await client.callTool({ name: 'joltsms_provision_number', arguments: { payment_method_id: 'pm_test' } });
      assert.equal(pending.isError, undefined);
      assert.match(pending.content[0].text, /https:\/\/invoice\.example\.test\/authenticate/);
      assert.ok(pending.content[0].text.includes(subscriptionId));
    }
    const cancel = await client.callTool({ name: 'joltsms_release_number', arguments: { subscription_id: subscriptionId } });
    assert.equal(cancel.isError, undefined);
    assert.match(cancel.content[0].text, /Unpaid rental order canceled/);
    assert.doesNotMatch(cancel.content[0].text, /remain active/);
    const restarted = await client.callTool({ name: 'joltsms_provision_number', arguments: { payment_method_id: 'pm_test' } });
    assert.equal(restarted.isError, undefined);
    assert.match(restarted.content[0].text, /Number provisioning started/);
    const rentRequests = requests.filter(({ url }) => url === '/v1/numbers/rent');
    assert.equal(rentRequests.length, 3);
    assert.equal(rentRequests[0].idempotencyKey, rentRequests[1].idempotencyKey);
    assert.notEqual(rentRequests[0].idempotencyKey, rentRequests[2].idempotencyKey);
    assert.ok(rentRequests.every(({ body }) => body.paymentMethodId === 'pm_test' && body.autoRenew === true));
    assert.deepEqual(requests.find(({ url }) => url.endsWith('/auto-renew')).body, { enabled: false });
  } finally {
    await client.close();
    api.closeAllConnections();
    await new Promise((resolve) => api.close(resolve));
  }
}
