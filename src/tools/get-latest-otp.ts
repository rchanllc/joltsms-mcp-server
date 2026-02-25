import { z } from 'zod';
import type { JoltSMSClient } from '../client.js';

export const getLatestOtpSchema = {
  number_id: z.string()
    .describe('Number ID (UUID) or phone number (e.g. +17243213654 or 7243213654)'),
  since: z.string().optional()
    .describe('Only look at messages after this ISO 8601 datetime. Defaults to last 10 minutes.'),
};

export async function getLatestOtp(
  client: JoltSMSClient,
  params: { number_id: string; since?: string }
) {
  const numberId = await client.resolveNumberId(params.number_id);
  // Default: look back 10 minutes
  const since = params.since ?? new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const result = await client.listMessages({
    numberId,
    since,
    limit: 10,
  });

  if (!result.data || result.data.length === 0) {
    return 'No recent messages found. The OTP may not have arrived yet — try joltsms_wait_for_sms to poll.';
  }

  // Find the most recent message with a parsed OTP code
  const withCode = result.data.find((m) => m.parsedCode);

  if (!withCode) {
    // Return the most recent message even without a parsed code
    const latest = result.data[0]!;
    return [
      'No parsed OTP code found in recent messages.',
      `Most recent message (${latest.receivedAt}):`,
      `From: ${latest.from}`,
      `Body: ${latest.body}`,
      '',
      'The OTP may need to be extracted manually from the message body above.',
    ].join('\n');
  }

  return [
    `OTP Code: ${withCode.parsedCode}`,
    '',
    `From: ${withCode.from}`,
    `Body: ${withCode.body}`,
    `Received: ${withCode.receivedAt}`,
    `Message ID: ${withCode.id}`,
  ].join('\n');
}
