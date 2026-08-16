/**
 * Placeholder-aware environment reads.
 *
 * `vercel env pull` writes the literal string "[SENSITIVE]" for every variable
 * marked sensitive in the dashboard, so a pulled .env.local looks fully
 * populated while every secret in it is a placeholder.
 *
 * Plain `Boolean(process.env.X)` therefore reports a key as present when it
 * isn't, which turns a clear "not configured" into a confusing runtime failure:
 * the AI layer reports "the engine is busy (rate limit)" after three doomed
 * retries, and the status page shows "all systems operational" against keys
 * that cannot authenticate.
 */

/** A value that is present AND is not an obvious placeholder. */
export function envKey(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const v = raw.trim();
  if (v.length < 20) return undefined;              // no real API key is this short
  if (/^\[.*\]$/.test(v)) return undefined;         // [SENSITIVE], [REDACTED], …
  if (/^(your|changeme|placeholder|xxx|test-key)/i.test(v)) return undefined;
  return v;
}

/** True when at least one of the named variables holds a usable value. */
export function anyEnvKey(...names: string[]): boolean {
  return names.some((n) => Boolean(envKey(n)));
}
