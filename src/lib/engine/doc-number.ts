/*
  THE NEXT FREE DOCUMENT NUMBER, AND WHETHER A SAVE WOULD OVERWRITE SOMEONE ELSE'S.

  The invoice and quote builders opened on INV-0001 / QT-0001 every time, and
  saving upserted on (org_id, number). So the second invoice anyone made on the
  default number silently REPLACED the first — another customer's receivable,
  gone, with "Saved" on screen. These two pure helpers are the fix's logic:

    nextDocNumber   — one past the highest PREFIX+digits already used (keeps
                      the width, so INV-0009 → INV-0010), skipping anything taken
    sameParty       — is the existing row the same customer (an edit / a
                      double-submit, safe) or a different one (refuse)?

  Pure and import-free: scripts/test-actions-fixes.mjs executes them.
*/

export function nextDocNumber(existing: Iterable<string | null | undefined>, prefix: string, width = 4): string {
  const taken = new Set<string>();
  let max = 0;
  let w = width;
  const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${esc}(\\d+)$`, "i");
  for (const raw of existing) {
    const s = String(raw ?? "").trim();
    if (!s) continue;
    taken.add(s.toLowerCase());
    const m = re.exec(s);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) { max = n; w = Math.max(width, m[1].length); }
    }
  }
  let n = max + 1;
  let candidate = prefix + String(n).padStart(w, "0");
  while (taken.has(candidate.toLowerCase())) { n++; candidate = prefix + String(n).padStart(w, "0"); }
  return candidate;
}

/** Case/whitespace-insensitive party comparison. Blank never matches anything. */
export function sameParty(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string | null | undefined) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const x = norm(a), y = norm(b);
  return Boolean(x) && x === y;
}
