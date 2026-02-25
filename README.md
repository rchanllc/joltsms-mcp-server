# @joltsms/mcp-server

MCP server for [JoltSMS](https://joltsms.com) — provision dedicated real-SIM US phone numbers and receive SMS/OTP codes through AI agents.

Built on the [Model Context Protocol](https://modelcontextprotocol.io), this server gives AI agents (Claude Code, Claude Desktop, Cursor, etc.) the ability to rent phone numbers, wait for incoming SMS, extract OTP codes, and manage billing — all through standardized tool calls.

## Quick Start

### 1. Get an API Key

Create a JoltSMS account and generate an API key at **[Dashboard → Settings → API Keys](https://app.joltsms.com/settings)**.

### 2. Configure Your MCP Client

Add to your `.mcp.json` (Claude Code) or MCP settings (Claude Desktop, Cursor):

```json
{
  "mcpServers": {
    "joltsms": {
      "command": "npx",
      "args": ["-y", "@joltsms/mcp-server"],
      "env": {
        "JOLTSMS_API_KEY": "jolt_sk_your_key_here"
      }
    }
  }
}
```

### 3. Use It

Your AI agent now has access to all JoltSMS tools. Try:

> "Provision a new phone number with area code 650 and wait for an OTP"

## Tools

| Tool | Description |
|------|-------------|
| `joltsms_list_numbers` | List active numbers with service labels, tags, and unread counts |
| `joltsms_get_number` | Full details for a single number |
| `joltsms_update_number` | Set service label, tags, or notes on a number |
| `joltsms_provision_number` | Rent a new dedicated real-SIM US number ($50/mo) |
| `joltsms_release_number` | Cancel/release a number at end of billing period |
| `joltsms_list_messages` | List recent SMS with parsed OTP codes |
| `joltsms_mark_read` | Mark single or bulk messages as read |
| `joltsms_wait_for_sms` | Poll until an SMS arrives (key tool for OTP flows) |
| `joltsms_get_latest_otp` | Get the most recent parsed verification code |
| `joltsms_billing_status` | Check all subscriptions with billing health |

## OTP Verification Workflow

The most common use case — automated phone verification:

```
1. joltsms_provision_number({ area_code: "650" })
   → Number provisioning started! Phone: +16505551234

2. joltsms_update_number({ number_id: "+16505551234", service_name: "PayPal" })
   → Tagged for easy lookup later

3. [Agent enters phone number on PayPal and requests OTP]

4. joltsms_wait_for_sms({ number_id: "+16505551234", timeout_seconds: 120 })
   → SMS received after 8.2s: "Your PayPal code is 847291"
   → OTP Code: 847291

5. joltsms_mark_read({ number_id: "+16505551234" })
   → Inbox clean

6. [Agent enters 847291 on PayPal — verification complete]
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JOLTSMS_API_KEY` | Yes | Your API key (`jolt_sk_*`) |
| `JOLTSMS_API_URL` | No | API base URL (defaults to `https://api.joltsms.com`) |

## Requirements

- Node.js 18+
- A JoltSMS account with a payment method on file
- Your first number must be ordered through the [Dashboard](https://app.joltsms.com) to complete initial 3D Secure verification

## Documentation

- [MCP Server Docs](https://joltsms.com/developers/mcp)
- [API Reference](https://joltsms.com/developers/api-reference)
- [JoltSMS Website](https://joltsms.com)

## License

MIT
