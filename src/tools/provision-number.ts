import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { JoltSMSClient } from '../client.js';

export const provisionNumberSchema = {
  area_code: z.string().regex(/^\d{3}$/).optional()
    .describe('Preferred US area code (3 digits, e.g. "212"). Optional — omit for any available area.'),
};

// Cache idempotency keys per invocation to handle retries safely
const idempotencyCache = new Map<string, string>();

export async function provisionNumber(
  client: JoltSMSClient,
  params: { area_code?: string }
) {
  // Generate or reuse idempotency key for this logical request
  const cacheKey = `provision:${params.area_code ?? 'any'}`;
  let idempotencyKey = idempotencyCache.get(cacheKey);
  if (!idempotencyKey) {
    idempotencyKey = randomUUID();
    idempotencyCache.set(cacheKey, idempotencyKey);
    // Clear after 5 minutes so a genuinely new request gets a new key
    setTimeout(() => idempotencyCache.delete(cacheKey), 5 * 60 * 1000);
  }

  try {
    const result = await client.rentNumber({
      areaCode: params.area_code,
      preferredAreaCode: !!params.area_code,
      idempotencyKey,
    });

    if (result.success) {
      // Clear the cache key on success so next provision gets a fresh key
      idempotencyCache.delete(cacheKey);

      return [
        `Number provisioning started!`,
        `Status: ${result.status}`,
        result.subscriptionId ? `Subscription: ${result.subscriptionId}` : null,
        result.message || null,
        '',
        'Provisioning is async — it may take a few seconds to minutes.',
        'Use joltsms_list_numbers to check when the number is ACTIVE.',
        result.requiresAction
          ? 'NOTE: Payment requires additional authentication. The user needs to complete 3DS verification.'
          : null,
      ].filter(Boolean).join('\n');
    }

    return `Provisioning failed: ${result.error || result.message || 'Unknown error'}`;
  } catch (err: any) {
    // Handle 402 Payment Required (3DS)
    if (err.status === 402 && err.data?.hostedInvoiceUrl) {
      return [
        'Payment requires 3D Secure authentication.',
        '',
        'The user needs to complete payment verification at this URL:',
        err.data.hostedInvoiceUrl,
        '',
        'After the user completes authentication, the number will be provisioned automatically.',
        'Use joltsms_list_numbers to check status.',
      ].join('\n');
    }

    throw err;
  }
}
