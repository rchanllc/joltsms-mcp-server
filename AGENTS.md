# JoltSMS npm MCP release guidance

- Whenever JoltSMS MCP changes, remind Chih to check and update the public
  `@joltsms/mcp-server` npm package. Report npm and MCP Registry release status
  explicitly in the handoff; a hosted API deployment does not publish npm.
- After an MCP release, check the existing directory listings in `RELEASING.md`.
  Report each correction as live, requested, or blocked; an npm publication does
  not guarantee that third-party descriptions and install examples are current.
- Read `RELEASING.md`. Sync approved MCP source from the JoltSMS monorepo;
  never copy credentials, local configuration, or an entire untracked directory.
- Preserve customer billing dates and reply eligibility. Provider rental expiry
  is not customer paid-through time. Replies target existing inbound messages.
- Test the packed installation on Node 22 as well as the source checkout.
  Keep package, lockfile, MCP Registry, and runtime versions consistent.
- Follow the dependency-update-review skill for dependency/runtime changes.
  Preserve unrelated work and existing merge/publication authorization.

## Testing

Run `npm ci --ignore-scripts`, `npm test`, `npm run test:package`, and `npm audit`.
Tests use Node's built-in runner and a loopback HTTP stub; they never charge a
card or send a real SMS. Repeat on Node 22 before publishing.
