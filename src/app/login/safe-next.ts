/**
 * Sanitise a post-login `next` destination.
 *
 * Pricing, /features and the credit-pack card send a new visitor to
 * /login?mode=signup&next=/billing (or /usage, or a feature route) so the
 * account they create lands them where they were going — checkout — rather
 * than on a dashboard with the plan they picked forgotten. The value arrives
 * from a URL, so it is untrusted: only a same-origin relative path is
 * accepted. Anything else ("https://…", "//evil.com", "/\\evil.com",
 * "javascript:…", control characters, absurd lengths) falls back to null and
 * the caller uses its own default.
 *
 * Pure, no imports — scripts/test-public-fixes.mjs imports it directly.
 */
export function safeNext(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v || v.length > 512) return null;
  if (!v.startsWith("/")) return null;
  // "//host" and "/\host" are protocol-relative to browsers.
  if (v.startsWith("//") || v.startsWith("/\\")) return null;
  // No control characters or backslashes anywhere (browsers normalise "\" to "/").
  if (/[\u0000-\u001f\u007f\\]/.test(v)) return null;
  // Never bounce back into the auth flow itself.
  if (v === "/login" || v.startsWith("/login?") || v.startsWith("/login/") || v.startsWith("/auth/")) return null;
  return v;
}
