import { z } from 'zod';
import type { JoltSMSClient } from '../client.js';

export const billingStatusSchema = {
  limit: z.number().min(1).max(10).default(10).optional()
    .describe('Max subscriptions to show (1-10, default 10)'),
};

export async function billingStatus(
  client: JoltSMSClient,
  params: { limit?: number }
) {
  const limit = params.limit ?? 10;

  // Fetch subscriptions and numbers in parallel for phone display
  const [subsResult, numbersResult] = await Promise.all([
    client.listSubscriptions(),
    client.listNumbers(10),
  ]);

  const subs = subsResult.subscriptions;
  if (!subs || subs.length === 0) {
    return 'No active subscriptions found. Use joltsms_provision_number to rent a number.';
  }

  // Build numberId → phoneNumber lookup
  const numberMap = new Map<string, string>();
  if (numbersResult.data) {
    for (const n of numbersResult.data) {
      numberMap.set(n.id, n.phoneNumber);
    }
  }

  const total = subs.length;
  const shown = subs.slice(0, limit);

  const lines = shown.map((s, i) => {
    const phone = s.numberId ? numberMap.get(s.numberId) : undefined;
    const label = phone || s.id;
    const price = s.basePriceDisplay || '$50.00';
    const autoRenew = s.cancelAtPeriodEnd ? 'off' : 'on';

    const periodDate = s.cancelAtPeriodEnd
      ? `cancels: ${s.currentPeriodEnd.split('T')[0]}`
      : `renews: ${s.currentPeriodEnd.split('T')[0]}`;

    return `${i + 1}. ${label} | ${s.billingHealth} | ${price}/mo | ${periodDate} | auto-renew: ${autoRenew}`;
  });

  const header = `${total} subscription(s):\n`;
  const footer = total > limit
    ? `\n(Showing ${limit} of ${total})`
    : `\n(Showing ${shown.length} of ${total})`;

  return header + lines.join('\n') + footer;
}
