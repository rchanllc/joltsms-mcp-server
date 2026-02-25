import { z } from 'zod';
import type { JoltSMSClient } from '../client.js';

export const listNumbersSchema = {
  limit: z.number().min(1).max(10).default(10).optional()
    .describe('Max numbers to return (1-10, default 10)'),
};

export async function listNumbers(client: JoltSMSClient, params: { limit?: number }) {
  const result = await client.listNumbers(params.limit ?? 10);

  if (!result.data || result.data.length === 0) {
    return 'No phone numbers found. Use joltsms_provision_number to rent one.';
  }

  const lines = result.data.map((n) => {
    const parts: string[] = [
      `${n.phoneNumber} (${n.status})`,
    ];
    if (n.serviceName) parts.push(`service: ${n.serviceName}`);
    if (n.tags && n.tags.length > 0) parts.push(`tags: ${n.tags.join(', ')}`);

    const unreadLabel = n.unreadCount > 0 ? ` (${n.unreadCount} unread)` : '';
    parts.push(`messages: ${n.messageCount}${unreadLabel}`);

    if (n.expiresAt) parts.push(`expires: ${n.expiresAt.split('T')[0]}`);
    if (n.subscriptionId) parts.push(`sub: ${n.subscriptionId}`);
    return `- ${parts.join(' | ')}`;
  });

  return `Found ${result.data.length} number(s):\n${lines.join('\n')}`;
}
