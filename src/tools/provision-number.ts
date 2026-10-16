import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { JoltSMSClient } from '../client.js';

export const provisionNumberSchema = {
  payment_method_id: z.string().trim().min(3).max(255).optional()
    .describe('Saved card ID from joltsms_list_payment_methods. Omit to use the valid account default or the sole saved card.'),
};

type JoltApiError = Error & {
  status?: number;
  data?: {
    error?: string;
    message?: string;
    subscriptionId?: string;
    hostedInvoiceUrl?: string;
  };
};

type IdempotencyEntry = {
  idempotencyKey: string;
  pendingSubscriptionId?: string;
  expiry?: ReturnType<typeof setTimeout>;
};

const ACTIONABLE_PAYMENT_METHOD_ERRORS = new Set([
  'PAYMENT_METHOD_INVALID',
  'PAYMENT_METHOD_REQUIRED',
  'PAYMENT_METHOD_SELECTION_REQUIRED',
  'PAYMENT_METHOD_UNAVAILABLE',
]);

// Reuse only for transport retries of the same logical payload.
const idempotencyCache = new Map<string, IdempotencyEntry>();

function deleteIdempotencyEntry(cacheKey: string, idempotencyKey?: string): void {
  const entry = idempotencyCache.get(cacheKey);
  if (!entry || (idempotencyKey && entry.idempotencyKey !== idempotencyKey)) return;
  if (entry.expiry) clearTimeout(entry.expiry);
  idempotencyCache.delete(cacheKey);
}

export function provisionRequestFingerprint(params: { payment_method_id?: string }): string {
  return createHash('sha256')
    .update(JSON.stringify({ paymentMethodId: params.payment_method_id ?? null }))
    .digest('hex');
}

export function paymentMethodGuidance(errorCode?: string): string | undefined {
  if (errorCode === 'PAYMENT_METHOD_REQUIRED') {
    return [
      'A saved card is required before a number can be rented.',
      '',
      'Ask the user to add a card in the JoltSMS dashboard, then retry joltsms_provision_number.',
    ].join('\n');
  }

  if (
    errorCode === 'PAYMENT_METHOD_INVALID'
    || errorCode === 'PAYMENT_METHOD_SELECTION_REQUIRED'
    || errorCode === 'PAYMENT_METHOD_UNAVAILABLE'
  ) {
    return [
      'The user must choose which saved card to use for this rental.',
      '',
      'Call joltsms_list_payment_methods, show the user the masked card choices, and ask which card to use.',
      'Then retry joltsms_provision_number with that card\'s payment_method_id.',
    ].join('\n');
  }

  return undefined;
}

function getIdempotencyKey(cacheKey: string): string {
  const existing = idempotencyCache.get(cacheKey);
  if (existing) return existing.idempotencyKey;

  const idempotencyKey = randomUUID();
  const entry: IdempotencyEntry = { idempotencyKey };
  idempotencyCache.set(cacheKey, entry);
  const expiry = setTimeout(() => {
    deleteIdempotencyEntry(cacheKey, idempotencyKey);
  }, 5 * 60 * 1000);
  expiry.unref();
  entry.expiry = expiry;

  return idempotencyKey;
}

export function clearProvisionIdempotencyCacheForTests(): void {
  for (const cacheKey of idempotencyCache.keys()) {
    deleteIdempotencyEntry(cacheKey);
  }
}

// Only a confirmed unpaid cancellation ends this pending order. Keep other
// cards and ambiguous transport/authentication retries on their original keys.
export function forgetCanceledProvision(subscriptionId: string): void {
  for (const [cacheKey, entry] of idempotencyCache) {
    if (entry.pendingSubscriptionId === subscriptionId) {
      deleteIdempotencyEntry(cacheKey, entry.idempotencyKey);
    }
  }
}

export async function provisionNumber(
  client: Pick<JoltSMSClient, 'rentNumber'>,
  params: { payment_method_id?: string }
) {
  const cacheKey = provisionRequestFingerprint(params);
  const idempotencyKey = getIdempotencyKey(cacheKey);

  try {
    const result = await client.rentNumber({
      idempotencyKey,
      paymentMethodId: params.payment_method_id,
    });

    if (result.success) {
      if (result.requiresAction || result.paymentStatus === 'requires_confirmation') {
        throw new Error(
          'Payment authentication is required, but JoltSMS did not return a hosted authentication URL. '
          + 'Retry this same rental request; do not send the user to a different JoltSMS environment.'
        );
      }

      deleteIdempotencyEntry(cacheKey, idempotencyKey);

      return [
        'Number provisioning started!',
        `Status: ${result.status}`,
        result.subscriptionId ? `Subscription: ${result.subscriptionId}` : null,
        result.message || null,
        '',
        'Provisioning is async — it may take a few seconds to minutes.',
        'Use joltsms_list_numbers to check when the number is ACTIVE.',
      ].filter(Boolean).join('\n');
    }

    const guidance = paymentMethodGuidance(result.error);
    if (guidance) {
      deleteIdempotencyEntry(cacheKey, idempotencyKey);
      return guidance;
    }

    return `Provisioning failed: ${result.error || result.message || 'Unknown error'}`;
  } catch (error) {
    const apiError = error as JoltApiError;
    if (apiError.status === 402 && apiError.data?.hostedInvoiceUrl) {
      const pending = idempotencyCache.get(cacheKey);
      if (pending?.idempotencyKey === idempotencyKey) {
        pending.pendingSubscriptionId = apiError.data.subscriptionId;
      }
      return [
        'Payment requires 3D Secure authentication.',
        '',
        'The user needs to complete payment verification at this URL:',
        apiError.data.hostedInvoiceUrl,
        apiError.data.subscriptionId
          ? `Pending subscription: ${apiError.data.subscriptionId}`
          : null,
        '',
        'After the user completes authentication, the number will be provisioned automatically.',
        apiError.data.subscriptionId
          ? `If the user abandons this unpaid order, call joltsms_release_number with subscription_id ${apiError.data.subscriptionId}.`
          : null,
        'Use joltsms_list_numbers to check status.',
      ].filter(Boolean).join('\n');
    }

    const errorCode = apiError.data?.error;
    const guidance = paymentMethodGuidance(errorCode);
    if (guidance && errorCode && ACTIONABLE_PAYMENT_METHOD_ERRORS.has(errorCode)) {
      deleteIdempotencyEntry(cacheKey, idempotencyKey);
      return guidance;
    }

    if (apiError.status === 403 && errorCode === 'OAUTH_BILLING_WRITE_SCOPE_REQUIRED') {
      throw new Error(
        'Reconnect the JoltSMS MCP connector with billing write permission to choose a saved card.'
      );
    }

    throw error;
  }
}
