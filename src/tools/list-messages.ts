import { z } from 'zod';
import type { JoltSMSClient } from '../client.js';

export const listMessagesSchema = {
  number_id: z.string().optional()
    .describe('Filter by number ID (UUID) or phone number (e.g. +17243213654 or 7243213654). Omit for all numbers.'),
  since: z.string().optional()
    .describe('ISO 8601 datetime — only return messages after this time. Example: "2025-01-15T00:00:00Z"'),
  limit: z.number().min(1).max(10).default(10).optional()
    .describe('Max messages to return (1-10, default 10)'),
  cursor: z.string().optional()
    .describe('Pagination cursor from previous response'),
  from_filter: z.string().optional()
    .describe('Filter by sender phone number (exact match, e.g. "+18005551234")'),
};

export async function listMessages(
  client: JoltSMSClient,
  params: { number_id?: string; since?: string; limit?: number; cursor?: string; from_filter?: string }
) {
  const numberId = params.number_id
    ? await client.resolveNumberId(params.number_id)
    : undefined;
  const result = await client.listMessages({
    numberId,
    since: params.since,
    limit: params.limit ?? 10,
    cursor: params.cursor,
    from: params.from_filter,
  });

  if (!result.data || result.data.length === 0) {
    return 'No messages found.';
  }

  const lines = result.data.map((m) => {
    const parts = [
      `From: ${m.from}`,
      `To: ${m.number.phoneNumber}`,
      `Body: ${m.body.slice(0, 200)}${m.body.length > 200 ? '...' : ''}`,
      m.parsedCode ? `OTP Code: ${m.parsedCode}` : null,
      `Received: ${m.receivedAt}`,
    ].filter(Boolean);
    return parts.join('\n  ');
  });

  const summary = [
    `${result.data.length} message(s)${result.meta.hasMore ? ` (more available)` : ''}:`,
    '',
    ...lines.map((l, i) => `${i + 1}. ${l}`),
  ];

  if (result.meta.hasMore && result.meta.nextCursor) {
    summary.push('', `Next page cursor: ${result.meta.nextCursor}`);
  }

  return summary.join('\n');
}
