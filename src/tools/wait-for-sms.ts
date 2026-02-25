import { z } from 'zod';
import type { JoltSMSClient } from '../client.js';

export const waitForSmsSchema = {
  number_id: z.string()
    .describe('Number ID (UUID) or phone number (e.g. +17243213654 or 7243213654)'),
  timeout_seconds: z.number().min(10).max(300).default(120).optional()
    .describe('Max seconds to wait (10-300, default 120)'),
  poll_interval_seconds: z.number().min(3).max(30).default(5).optional()
    .describe('Seconds between polls (3-30, default 5)'),
  from_filter: z.string().optional()
    .describe('Only match SMS from this sender (partial match)'),
};

export async function waitForSms(
  client: JoltSMSClient,
  params: {
    number_id: string;
    timeout_seconds?: number;
    poll_interval_seconds?: number;
    from_filter?: string;
  }
) {
  const numberId = await client.resolveNumberId(params.number_id);
  const timeout = (params.timeout_seconds ?? 120) * 1000;
  const interval = (params.poll_interval_seconds ?? 5) * 1000;
  const startTime = Date.now();
  const since = new Date().toISOString();

  let polls = 0;

  while (Date.now() - startTime < timeout) {
    polls++;

    const result = await client.listMessages({
      numberId,
      since,
      limit: 1,
    });

    if (result.data && result.data.length > 0) {
      const msg = result.data[0]!;

      // Apply from filter if specified
      if (params.from_filter && !msg.from.includes(params.from_filter)) {
        // Keep waiting
      } else {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        return [
          `SMS received after ${elapsed}s (${polls} polls):`,
          '',
          `From: ${msg.from}`,
          `To: ${msg.number.phoneNumber}`,
          `Body: ${msg.body}`,
          msg.parsedCode ? `\nOTP Code: ${msg.parsedCode}` : '',
          `\nReceived at: ${msg.receivedAt}`,
          `Message ID: ${msg.id}`,
        ].filter(Boolean).join('\n');
      }
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  return `No SMS received after ${elapsed}s (${polls} polls). The sender may not have sent the message yet, or it's still being delivered.`;
}
