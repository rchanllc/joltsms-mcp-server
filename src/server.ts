#!/usr/bin/env node
/**
 * MCP server for JoltSMS — provision real-SIM phone numbers and receive OTP codes.
 * Runs over stdio — spawned by AI agents (Claude Code, GPTs, LangChain, etc.).
 *
 * Required env: JOLTSMS_API_KEY (jolt_sk_...)
 * Optional env: JOLTSMS_API_URL (defaults to https://api.joltsms.com)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { JoltSMSClient } from './client.js';

import { listNumbersSchema, listNumbers } from './tools/list-numbers.js';
import { getNumberSchema, getNumber } from './tools/get-number.js';
import { updateNumberSchema, updateNumber } from './tools/update-number.js';
import { provisionNumberSchema, provisionNumber } from './tools/provision-number.js';
import { releaseNumberSchema, releaseNumber } from './tools/release-number.js';
import { listMessagesSchema, listMessages } from './tools/list-messages.js';
import { markReadSchemaShape, markRead } from './tools/mark-read.js';
import { waitForSmsSchema, waitForSms } from './tools/wait-for-sms.js';
import { getLatestOtpSchema, getLatestOtp } from './tools/get-latest-otp.js';
import { billingStatusSchema, billingStatus } from './tools/billing-status.js';

// --- Validate env ---
const { JOLTSMS_API_KEY, JOLTSMS_API_URL } = process.env;
if (!JOLTSMS_API_KEY) {
  console.error('Missing required env: JOLTSMS_API_KEY');
  console.error('Create an API key at https://app.joltsms.com/settings');
  process.exit(1);
}

const client = new JoltSMSClient(
  JOLTSMS_API_URL || 'https://api.joltsms.com',
  JOLTSMS_API_KEY
);

// --- MCP Server ---
const server = new McpServer({
  name: 'joltsms',
  version: '1.0.0',
});

// Helper to wrap tool handlers
function wrapTool(fn: (...args: any[]) => Promise<string>) {
  return async (...args: any[]) => {
    try {
      const text = await fn(...args);
      return { content: [{ type: 'text' as const, text }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  };
}

// --- Register tools ---

server.tool(
  'joltsms_list_numbers',
  `List your active JoltSMS phone numbers. Returns phone number, status, service label, tags, message count, and subscription details.

Each number costs $50/month and receives unlimited inbound SMS with parsed OTP codes.`,
  listNumbersSchema,
  wrapTool((params: any) => listNumbers(client, params))
);

server.tool(
  'joltsms_get_number',
  `Get full details for a single phone number, including service label, tags, notes, message counts, billing dates, and subscription status.

Accepts a UUID or phone number (e.g. "+16505551234", "650-555-1234", "(650) 555-1234").`,
  getNumberSchema,
  wrapTool((params: any) => getNumber(client, params))
);

server.tool(
  'joltsms_update_number',
  `Update metadata on a phone number — set a service label, tags, or notes.

Only provided fields are updated. Omitted fields remain unchanged.
Pass an empty array [] to clear tags, or an empty string "" to clear notes.

Examples:
  update_number("+16505551234", service_name="PayPal", tags=["production"])
  update_number("+16505551234", notes="Linked to acme@company.com")`,
  updateNumberSchema,
  wrapTool((params: any) => updateNumber(client, params))
);

server.tool(
  'joltsms_provision_number',
  `Rent a new dedicated real-SIM US phone number ($50/month).

IMPORTANT: The user must have a payment method set up in the JoltSMS dashboard first.

Provisioning is async — the number may take seconds to minutes to become ACTIVE.
For specific area codes, provide the 3-digit code (e.g. "212" for New York).

If 3DS authentication is required, this tool returns a URL the user must visit to authorize payment.`,
  provisionNumberSchema,
  wrapTool((params: any) => provisionNumber(client, params))
);

server.tool(
  'joltsms_release_number',
  `Cancel/release a phone number. The number stays active until the end of the current billing period.

Requires the subscription ID (from joltsms_list_numbers output).
This disables auto-renewal — the number will be released when the period ends.`,
  releaseNumberSchema,
  wrapTool((params: any) => releaseNumber(client, params))
);

server.tool(
  'joltsms_list_messages',
  `List recent SMS messages received on your JoltSMS numbers.

Returns sender, body, parsed OTP code (if detected), and timestamps.
Use number_id to filter to a specific number, or omit for all numbers.
Use from_filter for exact-match sender filtering.`,
  listMessagesSchema,
  wrapTool((params: any) => listMessages(client, params))
);

server.tool(
  'joltsms_mark_read',
  `Mark messages as read. Provide exactly ONE of:

- message_id: Mark a single message as read (UUID)
- number_id: Mark ALL messages on a number as read (UUID or phone number)

Use after extracting an OTP to keep the inbox clean.`,
  markReadSchemaShape,
  wrapTool((params: any) => markRead(client, params))
);

server.tool(
  'joltsms_wait_for_sms',
  `Poll for an incoming SMS message on a specific number. This is the KEY tool for OTP verification workflows.

Typical workflow:
1. Trigger OTP on a website/app using the JoltSMS phone number
2. Call this tool with the number_id
3. The tool polls every few seconds until an SMS arrives or timeout
4. Returns the message body and parsed OTP code

Use from_filter to only match messages from a specific sender.
Default timeout is 120 seconds with 5-second polling intervals.`,
  waitForSmsSchema,
  wrapTool((params: any) => waitForSms(client, params))
);

server.tool(
  'joltsms_get_latest_otp',
  `Get the most recent parsed OTP code from a phone number.

Convenience tool — checks recent messages (last 10 minutes by default) for a parsed verification code.
If no parsed code is found, returns the most recent message body for manual extraction.

Use joltsms_wait_for_sms if you need to wait for an OTP that hasn't arrived yet.`,
  getLatestOtpSchema,
  wrapTool((params: any) => getLatestOtp(client, params))
);

server.tool(
  'joltsms_billing_status',
  `Check billing and subscription status for all your JoltSMS numbers.

Shows each subscription with billing health, price, renewal/cancellation dates, and auto-renew status.
Cross-references with phone numbers for easy identification.`,
  billingStatusSchema,
  wrapTool((params: any) => billingStatus(client, params))
);

// --- Start ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP JoltSMS server failed to start:', err);
  process.exit(1);
});
