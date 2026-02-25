import type {
  JoltNumber,
  JoltMessage,
  ListResponse,
  RentResponse,
  SubscriptionDetail,
} from './types.js';

/**
 * Normalize a US phone number to E.164 format (+1XXXXXXXXXX).
 * Mirrors @joltsms/config toE164() logic — inlined because MCP server
 * is a standalone package that cannot import workspace packages.
 */
function normalizePhone(input: string): string {
  const cleaned = input.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+1') && cleaned.length === 12) return cleaned;
  if (cleaned.startsWith('1') && cleaned.length === 11) return `+${cleaned}`;
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  throw new Error(`Invalid phone number: "${input}" (expected US 10-digit or E.164)`);
}

export class JoltSMSClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    options: { body?: any; headers?: Record<string, string>; params?: Record<string, string> } = {}
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/v1${path}`);
    if (options.params) {
      Object.entries(options.params).forEach(([k, v]) => {
        if (v !== undefined && v !== '') url.searchParams.set(k, v);
      });
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      ...options.headers,
    };

    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Request timed out after 30 seconds');
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const msg = (data as any)?.message || (data as any)?.error || `HTTP ${response.status}`;
      const err = new Error(msg) as Error & { status: number; data: any };
      err.status = response.status;
      err.data = data;
      throw err;
    }

    return data as T;
  }

  async listNumbers(limit = 10, cursor?: string): Promise<ListResponse<JoltNumber>> {
    const params: Record<string, string> = { scope: 'owned', limit: String(limit) };
    if (cursor) params.cursor = cursor;
    return this.request('GET', '/numbers', { params });
  }

  async resolveNumberId(input: string): Promise<string> {
    // UUID — return as-is
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)) {
      return input;
    }

    // Normalize to E.164 for comparison
    const e164 = normalizePhone(input);

    // Paginate through all numbers
    let cursor: string | undefined;
    do {
      const page = await this.listNumbers(10, cursor);
      const match = page.data?.find((n) => n.phoneNumber === e164);
      if (match) return match.id;
      cursor = page.meta?.hasMore ? page.meta.nextCursor : undefined;
    } while (cursor);

    throw new Error(`No active number matching "${input}"`);
  }

  async listMessages(options: {
    numberId?: string;
    since?: string;
    limit?: number;
    cursor?: string;
    from?: string;
  } = {}): Promise<ListResponse<JoltMessage>> {
    const params: Record<string, string> = {
      limit: String(options.limit ?? 10),
    };
    if (options.numberId) params.numberId = options.numberId;
    if (options.since) params.since = options.since;
    if (options.cursor) params.cursor = options.cursor;
    if (options.from) params.from = options.from;

    return this.request('GET', '/messages', { params });
  }

  async rentNumber(options: {
    areaCode?: string;
    preferredAreaCode?: boolean;
    idempotencyKey: string;
  }): Promise<RentResponse> {
    return this.request('POST', '/numbers/rent', {
      body: {
        areaCode: options.areaCode,
        preferredAreaCode: options.preferredAreaCode ?? !!options.areaCode,
        autoRenew: true,
      },
      headers: {
        'X-Idempotency-Key': options.idempotencyKey,
      },
    });
  }

  async cancelNumber(subscriptionId: string): Promise<{ success: boolean; message: string }> {
    return this.request('POST', `/billing/subscriptions/${subscriptionId}/auto-renew`, {
      body: { enabled: false },
    });
  }

  async listSubscriptions(): Promise<{ subscriptions: SubscriptionDetail[] }> {
    return this.request('GET', '/billing/subscriptions');
  }

  async updateNumber(
    id: string,
    data: { serviceName?: string; tags?: string[]; notes?: string }
  ): Promise<JoltNumber> {
    const body: Record<string, any> = {};
    if (data.serviceName !== undefined) body.serviceName = data.serviceName;
    if (data.tags !== undefined) body.tags = data.tags;
    if (data.notes !== undefined) body.notes = data.notes;
    return this.request('PUT', `/numbers/${id}`, { body });
  }

  async markMessageRead(messageId: string): Promise<{ success: boolean; messageId: string; readAt: string }> {
    return this.request('PUT', `/messages/${messageId}/read`);
  }

  async markAllMessagesRead(numberId?: string): Promise<{ success: boolean; count: number; message: string }> {
    const params: Record<string, string> = {};
    if (numberId) params.numberId = numberId;
    return this.request('PUT', '/messages/mark-all-read', { params });
  }
}
