"use server";
import { revalidatePath } from "next/cache";

/**
 * Invalidate the pages that show derived numbers, after a write that happened
 * through fetch() rather than a server action.
 *
 * WHY THIS IS NEEDED. Server actions call revalidatePath themselves, so forms
 * were fine. But the highest-value writes in the product do not go through a
 * form — uploading a bank statement, parsing a GST return, running an agent,
 * ingesting via the API. Those POST to a route handler, and NO route handler in
 * the app called revalidatePath. Every (app) page is force-dynamic, so the
 * SERVER was always fresh; the problem is Next's client-side Router Cache,
 * which holds the rendered payload of a dynamic route for about 30 seconds and
 * indefinitely for back/forward navigation.
 *
 * The visible bug: upload a bank statement, watch Cortex read it, click
 * "Dashboard" in the sidebar — and see the dashboard from before the upload.
 * Which reads exactly like "I entered my data and it didn't show up", the
 * complaint this whole pass started from.
 *
 * Deliberately a server action rather than router.refresh(): refresh() re-fetches
 * only the page you are standing on, and the point is that the numbers changed
 * on eight OTHER pages you are about to navigate to.
 */

/** Pages whose contents are derived from health_metrics / finance_ledger. */
const DERIVED_PAGES = [
  "/dashboard", "/finance", "/sales", "/runway", "/cashflow",
  "/alerts", "/inventory", "/hr", "/production", "/reorder",
  "/receivables", "/payables", "/benchmarks", "/activity", "/usage",
];

/**
 * Call after any client-side write that changes derived numbers.
 * Cheap: revalidatePath only marks a path stale, it does not render anything.
 */
export async function refreshDerivedPages(): Promise<{ ok: true }> {
  for (const p of DERIVED_PAGES) {
    try { revalidatePath(p); } catch { /* an unknown path must not throw here */ }
  }
  return { ok: true };
}
