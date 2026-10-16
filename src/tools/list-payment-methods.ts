import { z } from 'zod';
import type { JoltSMSClient } from '../client.js';

export const listPaymentMethodsSchema = {
  limit: z.number().int().min(1).max(100).default(25).optional()
    .describe('Max saved cards to return (1-100, default 25)'),
  cursor: z.string().trim().min(3).max(255).optional()
    .describe('Pagination cursor from the previous response'),
};

type JoltApiError = Error & {
  status?: number;
  data?: { error?: string };
};

export async function listPaymentMethods(
  client: Pick<JoltSMSClient, 'listPaymentMethods'>,
  params: { limit?: number; cursor?: string }
) {
  try {
    const result = await client.listPaymentMethods({
      limit: params.limit ?? 25,
      cursor: params.cursor,
    });

    return JSON.stringify({
      paymentMethods: result.data.map((paymentMethod) => ({
        payment_method_id: paymentMethod.id,
        brand: paymentMethod.brand,
        last4: paymentMethod.last4,
        expMonth: paymentMethod.expMonth,
        expYear: paymentMethod.expYear,
        isDefault: paymentMethod.isDefault,
      })),
      hasMore: result.hasMore,
      ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
    }, null, 2);
  } catch (error) {
    const apiError = error as JoltApiError;
    if (apiError.status === 403 && apiError.data?.error === 'OAUTH_BILLING_READ_SCOPE_REQUIRED') {
      throw new Error(
        'Reconnect the JoltSMS MCP connector with billing read permission to list masked saved cards.'
      );
    }
    throw error;
  }
}
