import { z } from 'zod';
import type { JoltSMSClient } from '../client.js';

export const getNumberSchema = {
  number_id: z.string()
    .describe('Number ID (UUID) or phone number (e.g. +17243213654 or 7243213654)'),
};

export async function getNumber(
  client: JoltSMSClient,
  params: { number_id: string }
) {
  const numberId = await client.resolveNumberId(params.number_id);

  // Find the number in the list (resolveNumberId already validated it exists)
  let cursor: string | undefined;
  do {
    const page = await client.listNumbers(10, cursor);
    const match = page.data?.find((n) => n.id === numberId);
    if (match) {
      const lines = [
        `${match.phoneNumber} (${match.status})`,
      ];

      if (match.serviceName) lines.push(`  Service: ${match.serviceName}`);
      if (match.tags && match.tags.length > 0) lines.push(`  Tags: ${match.tags.join(', ')}`);
      if (match.notes) lines.push(`  Notes: ${match.notes}`);

      const unreadLabel = match.unreadCount > 0 ? ` (${match.unreadCount} unread)` : '';
      lines.push(`  Messages: ${match.messageCount}${unreadLabel}`);

      if (match.rentedAt) lines.push(`  Rented: ${match.rentedAt.split('T')[0]}`);
      if (match.expiresAt) lines.push(`  Expires: ${match.expiresAt.split('T')[0]}`);
      if (match.subscriptionId) lines.push(`  Subscription: ${match.subscriptionId}`);

      const autoRenew = match.autoRenewEnabled !== undefined
        ? (match.autoRenewEnabled ? 'enabled' : 'disabled')
        : undefined;
      if (autoRenew) lines.push(`  Auto-renew: ${autoRenew}`);

      return lines.join('\n');
    }
    cursor = page.meta?.hasMore ? page.meta.nextCursor : undefined;
  } while (cursor);

  throw new Error(`Number ${params.number_id} not found`);
}
