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
      "args": ["-y", "@joltsms/mcp-server@2"],
      "env": {
        "JOLTSMS_API_KEY": "jolt_sk_your_key_here"
      }
    }
  }
}
```

### 3. Use It

Your AI agent now has access to all 15 JoltSMS tools. Try:

> "List my saved cards, then rent the next available number using the card I choose."

## Tools

| Tool | Description |
|------|-------------|
| `joltsms_list_numbers` | List active numbers with service labels, tags, and unread counts |
| `joltsms_get_number` | Full details for a single number |
| `joltsms_update_number` | Set service label, tags, or notes on a number |
| `joltsms_list_payment_methods` | List masked saved cards and payment method IDs |
| `joltsms_provision_number` | Rent the next available number, optionally using a selected saved card ($50/mo) |
| `joltsms_release_number` | End auto-renew at period end, or cancel an unpaid initial checkout |
| `joltsms_list_messages` | List recent SMS with parsed OTP codes and message IDs |
| `joltsms_reply_to_sms` | Reply to an eligible inbound message (up to 15 characters) |
| `joltsms_mark_read` | Mark single or bulk messages as read |
| `joltsms_wait_for_sms` | Poll until an SMS arrives (key tool for OTP flows) |
| `joltsms_get_latest_otp` | Get the most recent parsed verification code |
| `joltsms_billing_status` | Check up to 10 subscriptions with billing health |
| `joltsms_hide_sender` | Hide one exact sender on one number for your account and mute its alerts |
| `joltsms_show_sender_in_inbox` | Restore that sender to your inbox, keeping its alerts muted |
| `joltsms_list_hidden_senders` | List your hidden senders, optionally by number, with cursor pagination |

## Personal sender visibility (2.1.0)

Hiding is personal to your account and number. It keeps messages available and
does not block SMS delivery or hide messages from other people sharing a number.
Use the exact sender from a message and the number's UUID for hide/show calls.
These writes require an API key with `sms:preferences:write` enabled; existing
keys retain their current permissions.

`joltsms_list_messages`, `joltsms_get_latest_otp`, and `joltsms_wait_for_sms`
accept optional `visibility: "all" | "inbox" | "hidden"`. Omitting it preserves
the existing default: all accessible messages, including personally hidden ones.
Use `"inbox"` to follow the dashboard inbox or `"hidden"` to review retained
messages. To review one hidden sender, pass its `number_id` and `from_filter`
to `joltsms_list_messages` with `visibility: "hidden"`.

Restoring with `joltsms_show_sender_in_inbox` keeps notifications muted. It does
not undo a previous notification preference; use dashboard notification controls
to enable alerts again after restoring the sender.

## Tool annotations (2.0.2)

All 15 tools expose a human-readable `annotations.title` and explicit boolean
`readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint` values
through `tools/list`.

| Tools | Read only | Destructive | Idempotent | Open world |
| --- | --- | --- | --- | --- |
| List numbers, get number, list payment methods, list messages, wait for SMS, get latest OTP, billing status, list hidden senders | true | false | true | false |
| Update number metadata | false | true | true | false |
| Provision number, release number, reply to SMS | false | true | false | true |
| Mark messages read, hide sender, show sender in inbox | false | false | true | false |

“Destructive” includes overwriting labels/tags/notes, spending money, canceling
service, and sending an SMS that cannot be recalled. Account reads and read-status
updates stay within your private JoltSMS account. Rentals, cancellations, and
replies interact with payment or telecom services outside it.

Provisioning protects a pending attempt, but a new call after success can buy
another number. Replies use a new request key per call. Cancellation sends a new
API request on each call and does not promise safe automatic retries.
These hints help clients present actions accurately; API permissions and user
approval are still required for authorized actions.

Version 2.0.2 also updates bundled `ip-address` to 10.7.4 for
[GHSA-rxp7-6hxx-x8q5](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5).

## OTP Verification Workflow

The most common use case — automated phone verification:

```
1. joltsms_provision_number({ payment_method_id: "pm_chosen_from_saved_cards" })
   → Number provisioning started! Use joltsms_list_numbers to check when it is ACTIVE.

2. joltsms_list_numbers({})
   → Once provisioning completes: +17245550100 (ACTIVE)

3. joltsms_update_number({ number_id: "+17245550100", service_name: "PayPal" })
   → Tagged for easy lookup later

4. [Agent enters phone number on PayPal and requests OTP]

5. joltsms_wait_for_sms({ number_id: "+17245550100", timeout_seconds: 120 })
   → SMS received after 8.2s: "Your PayPal code is 847291"
   → OTP Code: 847291

6. joltsms_mark_read({ number_id: "+17245550100" })
   → Inbox clean

7. [Agent enters 847291 on PayPal — verification complete]
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JOLTSMS_API_KEY` | Yes | Your API key (`jolt_sk_*`) |
| `JOLTSMS_API_URL` | No | API base URL (defaults to `https://api.joltsms.com`) |

## Requirements

- A patched Node.js release: **22.23.5+ within 22.x**, **24.22.3+ within 24.x**,
  or **26.13.1+ within 26.x**
- A JoltSMS account with a payment method on file
- If payment authentication is required, open the hosted invoice URL returned by the tool
- SMS replies require an API key with the SMS replies capability

## Node.js security update (2.0.5)

Version 2.0.5 requires the [November 2026 Node.js security patches](https://nodejs.org/en/blog/vulnerability/november-2026-security-releases).
It checks the Node runtime at startup and exits with an upgrade message on an
older patch, unsupported major, or prerelease. npm's engine warning alone does
not enforce this requirement.

For `npx` installations, update Node on the machine that launches your MCP client,
check `node --version` in that environment, then restart the MCP connection.
Clients can use a different PATH from your terminal; ensure their environment
selects the patched Node binary too. Installing a new npm package does not
replace Node itself. The Docker build uses `node:22.23.5-slim` in both stages;
rebuild and replace existing containers to use the patched runtime.

That security update preserved the API key, executable names, and the 12 tools
available in 2.0.5. Version 2.1.0 adds the three sender tools described above.

## Upgrading from 1.x

Use one of the patched Node.js versions above, change a pinned MCP configuration to
`@joltsms/mcp-server@2`, and restart the MCP connection. Your existing JoltSMS API
key and the `mcp-server` / `joltsms-mcp` executable names still work.

Area codes are not selectable. Remove the old `area_code` argument: rentals use
the next available dedicated U.S. mobile number. Each provisioning call orders
one number; grouped checkout remains in the dashboard.

To choose a saved card, call `joltsms_list_payment_methods`, let the user select
one, and pass its `payment_method_id` to `joltsms_provision_number`. Omitting it
uses a valid account default or the sole saved card. If authentication is needed,
the tool returns a hosted invoice URL and a pending subscription ID. An abandoned
unpaid checkout can be canceled with `joltsms_release_number`; paid rentals retain
service until the customer billing period ends.

Number details show customer service-through and next-charge/retry dates
separately. Provider rental expiry is not a customer service end date. The number
list and billing summary display at most 10 entries; use `joltsms_get_number` to
look up a specific number on larger accounts, or use the dashboard for the full
list.

Replies target an existing inbound message ID. They do not accept an arbitrary
destination or enable outbound campaigns.

## Development

```sh
npm ci --ignore-scripts
npm test
npm run test:package
npm audit --audit-level=low
```

See [RELEASING.md](RELEASING.md) for source synchronization, compatibility checks,
and the separate npm and MCP Registry publication steps.

## Documentation

- [MCP Server Docs](https://joltsms.com/developers/mcp)
- [API Reference](https://joltsms.com/developers/api-reference)
- [JoltSMS Website](https://joltsms.com)

## License

MIT
