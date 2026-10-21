const minimumVersions = new Map([
  [22, [23, 4]],
  [24, [22, 1]],
  [26, [12, 1]],
]);

/** Enforce the October 2026 security patches even when npm only warns about engines. */
export function assertSupportedNode(version = process.versions.node): void {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match) {
    const [major, minor, patch] = match.slice(1).map(Number);
    const minimum = minimumVersions.get(major);
    if (minimum && (minor > minimum[0] || (minor === minimum[0] && patch >= minimum[1]))) {
      return;
    }
  }

  throw new Error(
    `JoltSMS MCP requires patched Node.js 22 (22.23.4+), 24 (24.22.1+), or 26 (26.12.1+); found ${version}. ` +
    'Update the Node.js installation used by your MCP client, then restart the MCP connection.'
  );
}
