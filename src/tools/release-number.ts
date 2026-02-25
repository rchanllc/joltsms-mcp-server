import { z } from 'zod';
import type { JoltSMSClient } from '../client.js';

export const releaseNumberSchema = {
  subscription_id: z.string().uuid().describe('Subscription ID of the number to release (from joltsms_list_numbers)'),
};

export async function releaseNumber(
  client: JoltSMSClient,
  params: { subscription_id: string }
) {
  const result = await client.cancelNumber(params.subscription_id);

  return [
    result.success ? 'Number scheduled for release.' : 'Failed to release number.',
    result.message || '',
    '',
    'The number will remain active until the end of the current billing period.',
    'SMS will continue to be received until then.',
  ].filter(Boolean).join('\n');
}
