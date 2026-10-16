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
  assignedAt?: string;
  customerEntitlementStartsAt?: string | null;
  customerEntitlementEndsAt?: string | null;
  nextChargeDate?: string | null;
  recoveryCheckAvailable?: boolean;
  messageCount: number;
  unreadCount: number;
  lastMessageAt?: string;
  subscriptionId?: string;
  subscriptionStatus?: string;
  billingHealth?: string;
  deliveryState?: string;
  isServiceAllowed?: boolean;
  autoRenewEnabled?: boolean;
  cancelAtPeriodEnd?: boolean;
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

export interface ReplyToMessageResponse {
  success: boolean;
  replyId: string;
  messageId: string;
  content: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'UNKNOWN' | 'REJECTED';
  sentAt?: string | null;
  correlationId: string;
  message: string;
}

export interface RentResponse {
  success: boolean;
  subscriptionId?: string;
  status: string;
  clientSecret?: string;
  requiresAction: boolean;
  paymentStatus?: string;
  message?: string;
  error?: string;
}

export interface PaymentMethodSummary {
  id: string;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
  isDefault: boolean;
}

export interface PaymentMethodsResponse {
  data: PaymentMethodSummary[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface SubscriptionInfo {
  id: string;
  status: string;
  billingHealth: string;
  deliveryState?: string;
  isServiceAllowed?: boolean;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}

export interface SubscriptionDetail {
  id: string;
  stripeSubscriptionId: string | null;
  billingProvider: 'STRIPE' | 'APP_STORE' | 'GOOGLE_PLAY';
  status: string;
  billingHealth: string;
  deliveryState: string;
  isServiceAllowed: boolean;
  numberId?: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextChargeDate?: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  basePriceDisplay?: string;
  addonPriceDisplay?: string;
  areaCodePref?: string;
}
