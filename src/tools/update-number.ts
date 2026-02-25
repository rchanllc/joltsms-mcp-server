import { z } from 'zod';
import type { JoltSMSClient } from '../client.js';

export const updateNumberSchema = {
  number_id: z.string()
    .describe('Number ID (UUID) or phone number (e.g. +17243213654 or 7243213654)'),
  service_name: z.string().min(1).max(100).optional()
    .describe('Service/platform label (e.g. "PayPal", "Discord Backup"). Max 100 chars.'),
  tags: z.array(z.string().min(1).max(50)).max(20).optional()
    .describe('Tags for categorization (e.g. ["production", "paypal"]). Max 20 tags, 50 chars each. Pass [] to clear.'),
  notes: z.string().max(1000).optional()
    .describe('Free-form notes (e.g. "Linked to acme@company.com"). Max 1000 chars. Pass "" to clear.'),
};

export async function updateNumber(
  client: JoltSMSClient,
  params: { number_id: string; service_name?: string; tags?: string[]; notes?: string }
) {
  const numberId = await client.resolveNumberId(params.number_id);

  const data: { serviceName?: string; tags?: string[]; notes?: string } = {};
  if (params.service_name !== undefined) data.serviceName = params.service_name;
  if (params.tags !== undefined) data.tags = params.tags;
  if (params.notes !== undefined) data.notes = params.notes;

  if (Object.keys(data).length === 0) {
    return 'No fields to update. Provide at least one of: service_name, tags, notes.';
  }

  const updated = await client.updateNumber(numberId, data);

  const parts = [`Updated ${updated.phoneNumber}:`];
  if (data.serviceName !== undefined) parts.push(`  service: ${data.serviceName || '(cleared)'}`);
  if (data.tags !== undefined) parts.push(`  tags: ${data.tags.length > 0 ? data.tags.join(', ') : '(cleared)'}`);
  if (data.notes !== undefined) parts.push(`  notes: ${data.notes || '(cleared)'}`);

  return parts.join('\n');
}
