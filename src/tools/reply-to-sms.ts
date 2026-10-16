import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { JoltSMSClient } from '../client.js';

export const replyToSmsSchema = {
  message_id: z.string().uuid()
    .describe('Inbound SMS message UUID to reply to. The recipient is resolved server-side from this message.'),
  content: z.string().min(1).max(15)
    .describe('SMS reply content, max 15 characters. No destination can be provided.'),
};

export async function replyToSms(
  client: JoltSMSClient,
  params: { message_id: string; content: string }
) {
  const result = await client.replyToMessage(
    params.message_id,
    params.content,
    randomUUID()
  );

  return [
    result.success ? 'Reply sent.' : 'Reply was not sent.',
    `Status: ${result.status}`,
    `Reply ID: ${result.replyId}`,
    `Message ID: ${result.messageId}`,
    result.sentAt ? `Sent at: ${result.sentAt}` : null,
  ].filter(Boolean).join('\n');
}
