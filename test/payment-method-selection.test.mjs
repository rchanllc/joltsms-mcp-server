import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { JoltSMSClient, MCP_REQUEST_TIMEOUT_MS } from '../dist/client.js';
import { listPaymentMethods } from '../dist/tools/list-payment-methods.js';
import { releaseNumber } from '../dist/tools/release-number.js';
import {
  clearProvisionIdempotencyCacheForTests,
  paymentMethodGuidance,
  provisionNumber,
} from '../dist/tools/provision-number.js';

function apiError(status, error, extra = {}) {
  return Object.assign(new Error(error), {
    status,
    data: { error, ...extra },
  });
}

function sequenceClient(outcomes) {
  const calls = [];
  return {
    calls,
    async rentNumber(options) {
      calls.push(options);
      const outcome = outcomes.shift();
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
}

async function rejectedError(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail('Expected promise to reject');
}

beforeEach(() => {
  clearProvisionIdempotencyCacheForTests();
});

describe('standalone MCP request timeout', () => {
  it('leaves ten seconds of margin above the maximum safe-read retry deadline', () => {
    assert.ok(MCP_REQUEST_TIMEOUT_MS >= 40_000);
  });

  it('schedules the abort for the full budget and reports that budget', async () => {
    const originalFetch = globalThis.fetch;
    const originalSetTimeout = globalThis.setTimeout;
    let scheduledDelay;
    let abortRequest;

    globalThis.setTimeout = (callback, delay) => {
      abortRequest = callback;
      scheduledDelay = delay;
      return 1;
    };
    globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });

    try {
      const client = new JoltSMSClient('https://api.example.test', 'jolt_sk_test');
      const request = client.listPaymentMethods();
      let settled = false;
      void request.then(
        () => { settled = true; },
        () => { settled = true; }
      );

      await Promise.resolve();
      assert.equal(scheduledDelay, MCP_REQUEST_TIMEOUT_MS);
      assert.equal(settled, false);

      abortRequest();
      const error = await rejectedError(request);
      assert.equal(error.message, 'Request timed out after 40 seconds');
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.setTimeout = originalSetTimeout;
    }
  });
});

describe('standalone MCP payment-method selection', () => {
  it('returns only masked fields across cursor-paginated wallet pages', async () => {
    const calls = [];
    const pages = [
      {
        data: [{
          id: 'pm_1',
          brand: 'mastercard',
          last4: '4444',
          expMonth: 8,
          expYear: 2031,
          isDefault: false,
          fullNumber: 'should-never-leak',
        }],
        hasMore: true,
        nextCursor: 'pm_1',
      },
      {
        data: [{
          id: 'pm_2',
          brand: 'visa',
          last4: '4242',
          expMonth: 12,
          expYear: 2032,
          isDefault: true,
        }],
        hasMore: false,
      },
    ];
    const client = {
      async listPaymentMethods(options) {
        calls.push(options);
        return pages.shift();
      },
    };

    const firstPage = JSON.parse(
      await listPaymentMethods(client, { limit: 1, cursor: 'pm_before' })
    );
    const secondPage = JSON.parse(
      await listPaymentMethods(client, { limit: 1, cursor: firstPage.nextCursor })
    );

    assert.deepEqual(calls, [
      { limit: 1, cursor: 'pm_before' },
      { limit: 1, cursor: 'pm_1' },
    ]);
    assert.deepEqual(firstPage, {
      paymentMethods: [{
        payment_method_id: 'pm_1',
        brand: 'mastercard',
        last4: '4444',
        expMonth: 8,
        expYear: 2031,
        isDefault: false,
      }],
      hasMore: true,
      nextCursor: 'pm_1',
    });
    assert.deepEqual(secondPage, {
      paymentMethods: [{
        payment_method_id: 'pm_2',
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2032,
        isDefault: true,
      }],
      hasMore: false,
    });
    const ids = [...firstPage.paymentMethods, ...secondPage.paymentMethods]
      .map((paymentMethod) => paymentMethod.payment_method_id);
    assert.deepEqual(ids, ['pm_1', 'pm_2']);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(JSON.stringify([firstPage, secondPage]).includes('should-never-leak'), false);
  });

  it('maps pagination and selected-card parameters to REST', async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    const responses = [
      new Response(JSON.stringify({ data: [], hasMore: false }), { status: 200 }),
      new Response(JSON.stringify({
        success: true,
        status: 'PROVISIONING',
        requiresAction: false,
      }), { status: 201 }),
    ];
    globalThis.fetch = async (input, init) => {
      calls.push([input, init]);
      return responses.shift();
    };

    try {
      const client = new JoltSMSClient('https://api.example.test', 'jolt_sk_test');
      await client.listPaymentMethods({ limit: 2, cursor: 'pm_cursor' });
      await client.rentNumber({
        paymentMethodId: 'pm_selected',
        idempotencyKey: 'request-key-123',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(
      calls[0][0],
      'https://api.example.test/v1/billing/payment-methods?limit=2&startingAfter=pm_cursor'
    );
    assert.equal(calls[1][1].headers['X-Idempotency-Key'], 'request-key-123');
    assert.deepEqual(JSON.parse(calls[1][1].body), {
      autoRenew: true,
      paymentMethodId: 'pm_selected',
    });
  });

  it('uses generic list/choose/retry guidance for every unavailable-card code', () => {
    for (const errorCode of [
      'PAYMENT_METHOD_INVALID',
      'PAYMENT_METHOD_SELECTION_REQUIRED',
      'PAYMENT_METHOD_UNAVAILABLE',
    ]) {
      const guidance = paymentMethodGuidance(errorCode);
      assert.match(guidance, /joltsms_list_payment_methods/);
      assert.match(guidance, /payment_method_id/);
      assert.equal(guidance.includes('pm_'), false);
    }
  });

  it('reuses a key for transport retries and changes it with the card', async () => {
    const client = sequenceClient([
      new Error('socket reset'),
      new Error('socket reset'),
      new Error('socket reset'),
    ]);

    assert.match((await rejectedError(
      provisionNumber(client, { payment_method_id: 'pm_1' })
    )).message, /socket reset/);
    await rejectedError(provisionNumber(client, { payment_method_id: 'pm_1' }));
    await rejectedError(provisionNumber(client, { payment_method_id: 'pm_2' }));

    assert.equal(client.calls[0].idempotencyKey, client.calls[1].idempotencyKey);
    assert.notEqual(client.calls[2].idempotencyKey, client.calls[0].idempotencyKey);
  });

  it('rotates after add/choose guidance and retains the key for 3DS or provider retries', async () => {
    const selectionClient = sequenceClient([
      apiError(402, 'PAYMENT_METHOD_SELECTION_REQUIRED'),
      new Error('transport failure'),
    ]);
    const guidance = await provisionNumber(selectionClient, {});
    await rejectedError(provisionNumber(selectionClient, {}));
    assert.match(guidance, /joltsms_list_payment_methods/);
    assert.notEqual(selectionClient.calls[0].idempotencyKey, selectionClient.calls[1].idempotencyKey);

    clearProvisionIdempotencyCacheForTests();
    const requiredClient = sequenceClient([apiError(402, 'PAYMENT_METHOD_REQUIRED')]);
    assert.match(await provisionNumber(requiredClient, {}), /add a card/);

    clearProvisionIdempotencyCacheForTests();
    const threeDsClient = sequenceClient([
      {
        success: true,
        status: 'incomplete',
        requiresAction: true,
        clientSecret: 'pi_secret_should_not_leak',
      },
      new Error('transport failure'),
    ]);
    const missingHandoffError = await rejectedError(provisionNumber(threeDsClient, {}));
    assert.match(missingHandoffError.message, /hosted authentication URL/);
    assert.equal(missingHandoffError.message.includes('app.joltsms.com'), false);
    assert.equal(missingHandoffError.message.includes('pi_secret_should_not_leak'), false);
    await rejectedError(provisionNumber(threeDsClient, {}));
    assert.equal(threeDsClient.calls[0].idempotencyKey, threeDsClient.calls[1].idempotencyKey);

    clearProvisionIdempotencyCacheForTests();
    const lookupClient = sequenceClient([
      apiError(503, 'PAYMENT_METHOD_LOOKUP_UNAVAILABLE'),
      new Error('transport failure'),
    ]);
    assert.match((await rejectedError(provisionNumber(lookupClient, {}))).message, /LOOKUP_UNAVAILABLE/);
    await rejectedError(provisionNumber(lookupClient, {}));
    assert.equal(lookupClient.calls[0].idempotencyKey, lookupClient.calls[1].idempotencyKey);
  });

  it('retains the key for hosted-invoice 402 compatibility', async () => {
    const client = sequenceClient([
      apiError(402, 'PAYMENT_REQUIRES_ACTION', {
        hostedInvoiceUrl: 'https://invoice.example.test',
        subscriptionId: '11111111-1111-4111-8111-111111111111',
      }),
      new Error('transport failure'),
    ]);

    const guidance = await provisionNumber(client, {});
    await rejectedError(provisionNumber(client, {}));
    assert.match(guidance, /https:\/\/invoice\.example\.test/);
    assert.match(guidance, /Pending subscription: 11111111-1111-4111-8111-111111111111/);
    assert.match(guidance, /joltsms_release_number/);
    assert.equal(client.calls[0].idempotencyKey, client.calls[1].idempotencyKey);
  });

  it('does not promise an active service period when an unpaid order is cancelled', async () => {
    const guidance = await releaseNumber({
      async cancelNumber() {
        return {
          success: true,
          cancellationMode: 'immediate',
          unpaidCheckoutCancelled: true,
        };
      },
    }, {
      subscription_id: '11111111-1111-4111-8111-111111111111',
    });

    assert.match(guidance, /Unpaid rental order canceled/);
    assert.match(guidance, /No number was provisioned/);
    assert.equal(guidance.includes('remain active until'), false);
  });

  // Value: protects=a canceled unpaid checkout can be ordered again; fails_when=the canceled request key is reused;
  // why_new=cancellation text alone did not test the next rental; seam=none; no_claim=live Stripe acceptance (stubbed API).
  it('clears only the confirmed unpaid checkout and preserves other pending requests', async () => {
    const subscriptionId = '22222222-2222-4222-8222-222222222222';
    const pending = apiError(402, 'PAYMENT_REQUIRES_ACTION', {
      hostedInvoiceUrl: 'https://invoice.example.test', subscriptionId,
    });
    const client = sequenceClient([pending, new Error('socket reset'), pending, pending,
      { success: true, status: 'PROVISIONING', requiresAction: false }, new Error('socket reset')]);
    await provisionNumber(client, { payment_method_id: 'pm_selected' });
    await rejectedError(provisionNumber(client, { payment_method_id: 'pm_other' }));
    await assert.rejects(releaseNumber({ async cancelNumber() { throw new Error('cancel timeout'); } },
      { subscription_id: subscriptionId }), /cancel timeout/);
    await provisionNumber(client, { payment_method_id: 'pm_selected' });
    await releaseNumber({ async cancelNumber() { return { success: true, cancellationMode: 'period_end' }; } },
      { subscription_id: subscriptionId });
    await provisionNumber(client, { payment_method_id: 'pm_selected' });
    await releaseNumber({ async cancelNumber() { return { success: true, unpaidCheckoutCancelled: true }; } },
      { subscription_id: subscriptionId });
    const restarted = await provisionNumber(client, { payment_method_id: 'pm_selected' });
    await rejectedError(provisionNumber(client, { payment_method_id: 'pm_other' }));
    assert.match(restarted, /Number provisioning started/);
    assert.equal(client.calls[0].idempotencyKey, client.calls[2].idempotencyKey);
    assert.equal(client.calls[0].idempotencyKey, client.calls[3].idempotencyKey);
    assert.notEqual(client.calls[0].idempotencyKey, client.calls[4].idempotencyKey);
    assert.equal(client.calls[1].idempotencyKey, client.calls[5].idempotencyKey);
  });

  // Value: protects=success permits a new intentional order and ambiguous authentication keeps the same order;
  // fails_when=success retains a key or authentication clears it; why_new=existing tests only covered failures;
  // seam=none; no_claim=provider acceptance (stubbed API).
  it('rotates keys after success and returned card errors, but retains authentication retries', async () => {
    for (const payment_method_id of [undefined, 'pm_selected']) {
      const success = { success: true, status: 'PROVISIONING', requiresAction: false };
      const client = sequenceClient([success, success]);
      assert.match(await provisionNumber(client, { payment_method_id }), /joltsms_list_numbers/);
      await provisionNumber(client, { payment_method_id });
      assert.equal(client.calls[0].paymentMethodId, payment_method_id);
      assert.notEqual(client.calls[0].idempotencyKey, client.calls[1].idempotencyKey);
    }
    for (const [result, rotates] of [
      [{ success: false, error: 'PAYMENT_METHOD_INVALID' }, true],
      [{ success: false, error: 'PROVIDER_UNAVAILABLE' }, false],
      [{ success: true, paymentStatus: 'requires_confirmation' }, false],
    ]) {
      clearProvisionIdempotencyCacheForTests();
      const client = sequenceClient([result, new Error('socket reset')]);
      if (result.paymentStatus) await assert.rejects(provisionNumber(client, {}), /hosted authentication URL/);
      else await provisionNumber(client, {});
      await rejectedError(provisionNumber(client, {}));
      assert.equal(client.calls[0].idempotencyKey !== client.calls[1].idempotencyKey, rotates);
    }
  });
});
