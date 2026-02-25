import { z } from 'zod';
import type { JoltSMSClient } from '../client.js';

export const markReadSchema = z.object({
  message_id: z.string().uuid().optional()
    .describe('Mark a single message as read by its UUID'),
  number_id: z.string().optional()
    .describe('Mark ALL messages on this number as read. Accepts UUID or phone number (e.g. +17243213654).'),
}).refine(
  (data) => (data.message_id && !data.number_id) || (!data.message_id && data.number_id),
  { message: 'Provide exactly one of message_id or number_id, not both or neither' }
);

// Export the raw shape for server.tool() registration (MCP SDK expects a shape object, not a ZodObject)
export const markReadSchemaShape = {
  message_id: z.string().uuid().optional()
    .describe('Mark a single message as read by its UUID. Provide exactly one of message_id or number_id.'),
  number_id: z.string().optional()
    .describe('Mark ALL messages on this number as read. Accepts UUID or phone number. Provide exactly one of message_id or number_id.'),
};

export async function markRead(
  client: JoltSMSClient,
  params: { message_id?: string; number_id?: string }
) {
  // Validate XOR constraint
  const parsed = markReadSchema.parse(params);

  if (parsed.message_id) {
    const result = await client.markMessageRead(parsed.message_id);
    return `Marked message ${result.messageId} as read (at ${result.readAt})`;
  }

  // Bulk: mark all messages on a number as read
  const numberId = await client.resolveNumberId(parsed.number_id!);

  // Get the phone number for display
  let phoneDisplay = parsed.number_id!;
  let cursor: string | undefined;
  do {
    const page = await client.listNumbers(10, cursor);
    const match = page.data?.find((n) => n.id === numberId);
    if (match) {
      phoneDisplay = match.phoneNumber;
      break;
    }
    cursor = page.meta?.hasMore ? page.meta.nextCursor : undefined;
  } while (cursor);

  const result = await client.markAllMessagesRead(numberId);
  return `Marked ${result.count} message(s) on ${phoneDisplay} as read`;
}
