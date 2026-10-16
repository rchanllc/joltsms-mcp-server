# Releasing the JoltSMS npm MCP server

Every MCP update needs an explicit npm status in the handoff to Chih: published,
ready for approval, or deferred with a reason. Deploying the hosted MCP endpoint
does not update `@joltsms/mcp-server` on npm.

## Source and compatibility

The 2.0.0 candidate synchronizes the 12-tool standalone implementation from
`joltsms-v2` commit `354f00fd3b10c729343eb6e59405f0f19faa50cd`, directory
`tools/mcp-joltsms`. The public server reads its runtime version from its own
package manifest. It also clears the matching pending rental request after a
confirmed unpaid cancellation, so a new same-card checkout can start immediately.
That cancellation fix must be carried back to the monorepo's standalone source
before the next sync. Release packaging, tests, and documentation live here.

For future changes, compare approved source in both repositories before copying
tracked files. Never copy an entire local directory: it can contain API keys or
MCP Registry login tokens. The hosted MCP API has separate transport/auth code.

Version 2 requires Node 22+ and no longer advertises selectable area codes.
The API key, executable names, and stdio transport are unchanged. See README for
the customer migration. Update package.json with `npm version --no-git-tag-version`
and update both versions in server.json; the package test rejects metadata drift.

## Verify the exact package

```sh
npm ci --ignore-scripts
npm test
npm run test:package
npm audit --audit-level=low
docker build -t joltsms-mcp-check .
```

CI repeats the source and packed-install tests on Node 22, 24, and 26. JoltSMS
protocol checks use a loopback API stub with a dummy key, including SMS replies
and billing. They do not make purchases or send real messages. Package installation
and npm audit contact the npm registry.

`bundleDependencies` carries the reviewed SDK/Zod runtime tree from the lockfile
into the tarball. The install test checks every bundled runtime version, both
CLI names, all 12 tools, validation, and masked payment methods. Dev tools are
excluded. Keep the root audit clean before packing; bundled dependencies require
a new package release to update them. Root-only npm overrides would not protect
consumer installs, and npm 12 ignores npm-shrinkwrap.json. See the
[npm 12 migration notes](https://github.com/npm/cli/blob/latest/CHANGELOG.md#1200-2026-07-08).

## Publish after merge/release approval

1. Check out the approved commit and repeat the commands above. Pack with
   `npm pack --json`, inspect the file list, and retain the tarball and integrity.
2. Publish that exact tested tarball with `npm publish ./joltsms-mcp-server-VERSION.tgz
   --access public --tag latest`. Authentication or OTP must be supplied through
   the normal npm login flow, never committed or put in a PR.
3. Verify npm's version and integrity using `npm view @joltsms/mcp-server@VERSION
   version dist.integrity --json`. Install it in a clean directory and repeat
   the stdio smoke against a stub or an authorized read-only staging account.
4. Publish this repository's server.json with the official MCP Registry publisher
   after npm is available. Check the registry entry points to the same npm version.
   Follow the [official publishing guide](https://modelcontextprotocol.io/registry/quickstart).
5. Check the directory listings below against the published README and package.
   Request corrections or refreshes through each site's supported update flow.
6. Record source commit, npm version/integrity, MCP Registry status, directory
   update status, test results, and any remaining hosted/monorepo sync work.
   Remind Chih about npm and directory checks on the next MCP change as well.

No merge in this repository automatically deploys JoltSMS customer services.

## Directory listings

These are known public listings verified on 2026-10-16, not a complete record of
past submissions. Check the live pages after each release; search snippets can
lag behind both npm and the page itself.

| Directory | Existing listing | Update route |
| --- | --- | --- |
| Glama | [JoltSMS](https://glama.ai/mcp/servers/rchanllc/joltsms-mcp-server) | Imports GitHub updates. Claim the organization-owned server with the root `glama.json` maintainer entry and that maintainer's GitHub login, then use its management controls. |
| MCPServers.org | [JoltSMS](https://mcpservers.org/servers/rchanllc/joltsms-mcp-server) | Use the existing listing's **Request update** action. Human verification may be required. |
| AgentSift | [JoltSMS](https://agentsift.ai/capabilities/joltsms) | No existing-listing edit route was visible during the audit. Use a confirmed correction channel; the new-capability submission form is not a confirmed update route. |
| MCPHub | [JoltSMS](https://www.mcphub.space/servers/rchanllc--joltsms-mcp-server) | Verify the existing listing and follow any supported correction flow if its details are stale. |
| VerifyMCP | [JoltSMS](https://verifymcp.io/servers/rchanllc-joltsms-sms/joltsms-mcp-server) | Check its detected package version; its scan had already discovered 2.0.0 on 2026-10-16. |

For each listing:

- Check the npm package name, supported Node version, install configuration,
  required `JOLTSMS_API_KEY`, tool list, and links against the released README.
  Version 2 uses `@joltsms/mcp-server@2`, Node 22+, and 12 tools. Do not copy the
  incorrect `@modelcontextprotocol/server-joltsms` name found on AgentSift.
- Preserve product limits in descriptions: next-available numbers, one number per
  MCP provisioning call, and replies to eligible existing inbound messages.
  Area-code selection and arbitrary outbound messaging are unsupported.
- Prefer refreshing or correcting an existing listing. Do not submit duplicates
  or assume that a new-listing form also edits existing records.
- Record the checked time, requested change, and confirmation or request ID.
  Report **live** only after the public page shows the correction; keep **requested**
  and **blocked** separate. A submitted refresh is not a verified update.
- Leave site sign-in and human-verification challenges to the account owner.
  Never commit API keys, registry tokens, browser credentials, or session state.

`glama.json` authorizes the listed GitHub maintainer to manage the Glama entry.
Keep it limited to the intended owner; it does not change npm or GitHub repository
permissions. See [Glama's maintainer schema](https://glama.ai/mcp/schemas/server.json).
