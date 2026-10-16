# JoltSMS npm MCP release guidance

- Whenever JoltSMS MCP changes, remind Chih to update the public GitHub source,
  then the `@joltsms/mcp-server` npm package, then the Glama.ai and MCPServers.org
  listings. Use the release checklist in `RELEASING.md`; it also covers the
  official MCP Registry, developer docs, and verification of the published package.
- Report each destination as current, published, verified live, requested,
  deferred, or blocked, with a reason for unfinished work. A hosted API deployment
  does not publish npm, and npm publication does not refresh every directory.
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
