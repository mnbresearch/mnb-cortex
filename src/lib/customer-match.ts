/**
 * Canonical customer-name matching.
 *
 * WHY THIS EXISTS. sales_orders historically carried only `customer_name text`,
 * and /rfm and /churn joined orders to customers with
 * `String(name).trim().toLowerCase()`. That fails silently in both directions:
 *
 *   "Acme Pvt. Ltd." vs "Acme Private Limited"  -> same customer, no match, so
 *     a live customer is scored at zero orders and shown as Lost or at-risk.
 *   two different customers sharing a name      -> merged into one score, with
 *     their revenue summed and attributed to whichever record comes first.
 *
 * Both render as a confident number about the wrong customer.
 *
 * CRITICAL: normalizeCustomerName() must stay behaviourally identical to
 * cortex_norm_name() in supabase/migrations/2026_sales_order_customer_link.sql.
 * The migration links rows using the SQL version; the running app matches
 * leftovers using this one. If they drift, rows link one way and match another
 * and nothing anywhere reports a problem. scripts/test-customer-match.mjs runs
 * both against real Postgres over the same inputs to keep them honest.
 */

/**
 * Reduce a customer name to a comparable key.
 *
 * Deliberately does NOT strip the legal form: "Acme Private Limited" and
 * "Acme Limited" are different legal entities and must not collapse together.
 * It only canonicalises spelling variants of the SAME form, which is the case
 * that actually shows up ("Pvt. Ltd." / "Private Limited" / "pvt ltd").
 *
 * Returns null for anything that normalises to nothing, so an empty name can
 * never accidentally match another empty name.
 */
export function normalizeCustomerName(raw: string | null | undefined): string | null {
  let t = String(raw ?? "").toLowerCase();
  t = t.split("&").join(" and ");
  // Punctuation becomes a separator: "Acme Pvt. Ltd." -> "acme pvt ltd "
  t = t.replace(/[^a-z0-9]+/g, " ");
  t = t.replace(/\bprivate\b/g, "pvt");
  t = t.replace(/\blimited\b/g, "ltd");
  t = t.replace(/\bincorporated\b/g, "inc");
  t = t.replace(/\bcorporation\b/g, "corp");
  t = t.replace(/\bcompany\b/g, "co");
  t = t.replace(/\s+/g, " ").trim();
  // "M/s Acme Traders" is an address convention, not part of the name.
  t = t.replace(/^m s /, "").trim();
  return t || null;
}

export type CustomerLike = { id: string; name?: string | null };

/**
 * Group customers by normalised name.
 *
 * A key can map to SEVERAL ids — that is the duplicate-name case, and it is
 * kept rather than flattened so callers can report it instead of guessing.
 */
export function indexCustomers(customers: CustomerLike[]): Map<string, string[]> {
  const byNorm = new Map<string, string[]>();
  for (const c of customers) {
    const key = normalizeCustomerName(c.name);
    if (!key) continue;
    const list = byNorm.get(key);
    if (list) list.push(String(c.id));
    else byNorm.set(key, [String(c.id)]);
  }
  return byNorm;
}

export type Resolution =
  | { status: "matched"; customerId: string }
  | { status: "none" }
  | { status: "ambiguous"; candidates: string[] };

/**
 * Resolve one order's customer_name to a customer id.
 *
 * Returns "ambiguous" rather than picking a winner when several customers
 * share a name. Writing a guess into a foreign key is permanent and
 * unreviewable; leaving it null is recoverable and can be surfaced.
 */
export function resolveCustomerId(byNorm: Map<string, string[]>, name: string | null | undefined): Resolution {
  const key = normalizeCustomerName(name);
  if (!key) return { status: "none" };
  const ids = byNorm.get(key);
  if (!ids || ids.length === 0) return { status: "none" };
  if (ids.length > 1) return { status: "ambiguous", candidates: ids };
  return { status: "matched", customerId: ids[0] };
}

/*
 * NOTE: there is deliberately no write-path helper here.
 *
 * Setting customer_id on insert is done by a database trigger
 * (cortex_link_sales_order_customer, in 2026_sales_order_customer_link.sql)
 * rather than in application code, because sales_orders is written from six
 * places — including the public API, which runs through the `api_ingest`
 * Postgres function and never executes any of this TypeScript. A helper here
 * would cover five of the six and quietly miss the one that cannot use it.
 */
