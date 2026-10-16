import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listNumbers } from '../dist/tools/list-numbers.js';
import { getNumber } from '../dist/tools/get-number.js';
import { billingStatus } from '../dist/tools/billing-status.js';

const number = {
  id: '11111111-1111-4111-8111-111111111111',
  subscriptionId: '22222222-2222-4222-8222-222222222222',
  phoneNumber: '+12025550123', status: 'ACTIVE', messageCount: 0, unreadCount: 0,
  assignedAt: '2026-10-01T00:00:00Z',
  customerEntitlementEndsAt: '2026-11-01T00:00:00Z',
  nextChargeDate: '2026-11-02T00:00:00Z',
  // Deliberately different provider date: never show as customer service expiry.
  expiresAt: '2026-10-20T00:00:00Z',
  cancelAtPeriodEnd: true, autoRenewEnabled: false,
};

test('customer service dates and auto-renew do not use provider rental expiry', async () => {
  const client = {
    async listNumbers() { return { data: [number], meta: { hasMore: false } }; },
    async resolveNumberId() { return number.id; },
  };
  const listing = await listNumbers(client, {});
  const detail = await getNumber(client, { number_id: number.id });
  assert.match(listing, /service ends: 2026-11-01/);
  assert.match(detail, /Service through: 2026-11-01/);
  assert.match(detail, /Auto-renew: disabled/);
  assert.doesNotMatch(listing + detail, /2026-10-20|2026-11-02/);
});

// Value: protects=payment dates, service access and cancellation are distinct;
// fails_when=retry/charge/service dates or access become conflated; why_new=single recovery example missed ending/blocked cases;
// seam=none; no_claim=live entitlement decisions (stubbed API).
test('billing status keeps charge, retry, cancellation and SMS access distinct', async () => {
  const states = [
    { billingHealth: 'payment_failing', isServiceAllowed: true, deliveryState: 'active', cancelAtPeriodEnd: false,
      nextChargeDate: number.nextChargeDate, date: 'next retry: 2026-11-02', sms: 'active' },
    { billingHealth: 'healthy', isServiceAllowed: true, deliveryState: 'active', cancelAtPeriodEnd: false,
      nextChargeDate: number.nextChargeDate, date: 'next charge: 2026-11-02', sms: 'active' },
    { billingHealth: 'payment_failing', isServiceAllowed: false, deliveryState: 'suspended', cancelAtPeriodEnd: false,
      nextChargeDate: null, date: 'next charge: not scheduled', sms: 'suspended' },
    { billingHealth: 'healthy', isServiceAllowed: true, deliveryState: 'active', cancelAtPeriodEnd: true,
      nextChargeDate: number.nextChargeDate, date: 'service ends: 2026-11-01', sms: 'active' },
  ];
  for (const state of states) {
  const result = await billingStatus({
    async listNumbers() { return { data: [number] }; },
    async listSubscriptions() {
      return { subscriptions: [{
        id: number.subscriptionId, numberId: number.id,
        ...state, currentPeriodEnd: number.customerEntitlementEndsAt,
        basePriceDisplay: '$50.00',
      }] };
    },
  }, {});
  assert.ok(result.includes(`payment: ${state.billingHealth} | SMS: ${state.sms}`));
  assert.ok(result.includes(state.date));
  assert.ok(result.includes(`auto-renew: ${state.cancelAtPeriodEnd ? 'off' : 'on'}`));
  if (state.cancelAtPeriodEnd) assert.doesNotMatch(result, /next charge|next retry|2026-11-02/);
  else assert.match(result, /service through: 2026-11-01/);
  assert.doesNotMatch(result, /2026-10-20/);
  }
});
