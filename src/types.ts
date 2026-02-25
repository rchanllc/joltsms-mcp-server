export interface JoltNumber {
  id: string;
  phoneNumber: string;
  status: string;
  displayStatus?: string;
  serviceName?: string;
  tags?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
  rentedAt: string;
  expiresAt?: string;
  nextBillingDate?: string;
  messageCount: number;
  unreadCount: number;
  lastMessageAt?: string;
  subscriptionId?: string;
  subscriptionStatus?: string;
  autoRenewEnabled?: boolean;
}

export interface JoltMessage {
  id: string;
  numberId: string;
  number: {
    id: string;
    phoneNumber: string;
  };
  from: string;
  to: string;
  body: string;
  parsedCode?: string;
  encrypted: boolean;
  isRead: boolean;
  receivedAt: string;
  ingestedAt: string;
}

export interface ListResponse<T> {
  data: T[];
  meta: {
    hasMore: boolean;
    nextCursor?: string;
    total: number;
    limit: number;
  };
}

export interface RentResponse {
  success: boolean;
  subscriptionId?: string;
  status: string;
  clientSecret?: string;
  requiresAction: boolean;
  message?: string;
  error?: string;
  hostedInvoiceUrl?: string;
}

export interface SubscriptionInfo {
  id: string;
  status: string;
  billingHealth: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}

export interface SubscriptionDetail {
  id: string;
  stripeSubscriptionId: string;
  status: string;
  billingHealth: string;
  numberId?: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  basePriceDisplay?: string;
  addonPriceDisplay?: string;
  areaCodePref?: string;
}
