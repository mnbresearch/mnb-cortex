/**
 * Escape a value used as a PostgREST `like`/`ilike` pattern.
 *
 * `%` and `_` are wildcards. An unescaped user-supplied value therefore matches
 * rows it shouldn't: an email like `john_doe@acme.com` also matches
 * `johnXdoe@acme.com`, and an entity named `RM_204` matches `RM-204`. Depending
 * on the call site that surfaces as a lost write (maybeSingle throws on two
 * matches) or — worse — as a cross-tenant mismatch.
 *
 * Escape the pattern AND re-check equality in JS. The escape narrows the query;
 * the re-check is what actually guarantees correctness.
 */
export function likeLiteral(value: string): string {
  return String(value ?? "").replace(/([\\%_])/g, "\\$1");
}
