import { z } from 'zod';
import type { JoltSMSClient } from '../client.js';
import { forgetCanceledProvision } from './provision-number.js';

export const releaseNumberSchema = {
  subscription_id: z.string().uuid().describe('Subscription ID from joltsms_list_numbers, or the pending subscription ID returned for an unpaid 3DS checkout'),
};

export async function releaseNumber(
  client: JoltSMSClient,
  params: { subscription_id: string }
) {
  const result = await client.cancelNumber(params.subscription_id);

  if (result.success && result.unpaidCheckoutCancelled) {
    forgetCanceledProvision(params.subscription_id);
    return [
      'Unpaid rental order canceled.',
      result.message || null,
      '',
      'No number was provisioned and no service period remains active.',
    ].filter(Boolean).join('\n');
  }

  return [
    result.success ? 'Number scheduled for release.' : 'Failed to release number.',
    result.message || '',
    '',
    'The number will remain active until the end of the current billing period.',
    'SMS will continue to be received until then.',
  ].filter(Boolean).join('\n');
}
