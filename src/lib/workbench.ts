import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";

/**
 * Persistence for the three pages that asked an owner to do real work and then
 * threw it away.
 *
 * ============================================================================
 * WHAT WAS WRONG
 * ============================================================================
 *
 *   /decisions  A decision journal. Its entire value is being able to read,
 *               months later, what you decided and why — and it lived in
 *               `localStorage.cortex_decisions`. One browser, one device,
 *               gone on a cache clear, invisible to a co-founder, absent from
 *               every other machine the same person signs in on. Its "Devil's
 *               advocate" button spends 14 credits on an AI critique and
 *               discards the result on refresh.
 *
 *   /captable   Models a full dilution waterfall across rounds and cannot save
 *               any of it. Every visit starts from the same invented cap table.
 *
 *   /nps        Computes a score from promoters, passives and detractors, and
 *               tells the owner "sentiment turns before the numbers do" —
 *               which is a claim about a TREND, from a page that has never
 *               been able to remember yesterday's reading.
 *
 * ============================================================================
 * WHY strategy_docs AND NOT THREE NEW TABLES
 * ============================================================================
 *
 * Three new tables would each need a migration the operator has to run by
 * hand against a live database before any of this works, plus RLS policies,
 * plus write-rank grants, plus an entry in the delete whitelist — four places
 * to get right, three times over, for three low-volume tables holding a
 * handful of rows each.
 *
 * `strategy_docs` already exists and already has every one of those:
 *
 *   framework  text   a kind discriminator — already used for issue_tree,
 *                     swot, porter, bcg, ansoff and "analysis"
 *   question   text   a title
 *   content    jsonb  arbitrary structured payload
 *
 * Its RLS policies are in place, it is in `deleteRecord`'s allowed-table list,
 * and lib/actions.ts already writes to it. So these three pages start working
 * on every existing deployment the moment this ships, with no SQL to run and
 * no new tenancy surface to get wrong.
 *
 * The cost is that `framework` is now doing more work than its name suggests.
 * That is a real cost and it is smaller than the alternative; WORKBENCH_KINDS
 * below is the list, and the reader of a `framework` column has one place to
 * look.
 *
 * ============================================================================
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ============================================================================
 *
 * It does not remove the in-memory behaviour of any page. Every one of the
 * three keeps working exactly as it does today for a signed-out visitor, for
 * a viewer who cannot write, and for a workspace where the insert fails.
 * Saving is something the owner now CAN do, not something they must.
 */

/* The shapes live in lib/workbench-types.ts so client components can import
   them without pulling this server-only module into their bundle. Re-exported
   here so a server caller has one import. */
export {
  WORKBENCH_KINDS,
  type WorkbenchKind, type WorkbenchEntry,
  type DecisionData, type CapTableData, type NpsData,
} from "@/lib/workbench-types";
import type { WorkbenchKind, WorkbenchEntry } from "@/lib/workbench-types";

/* ----------------------------------------------------------------- reads -- */

/**
 * Everything of one kind for the current workspace, newest first.
 *
 * Returns [] — never throws — for a signed-out visitor, a workspace with no
 * `strategy_docs` table, or a failed read. Each of the three pages renders
 * perfectly well with nothing saved, and a calculator that 500s because a
 * history query failed is a worse outcome than one showing an empty list.
 */
export async function listWorkbench<T = any>(kind: WorkbenchKind, limit = 100): Promise<WorkbenchEntry<T>[]> {
  const { user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return [];
  try {
    const sb = await createClient();
    const { data, error } = await sb
      .from("strategy_docs")
      .select("id, question, content, created_at")
      .eq("org_id", orgId)
      .eq("framework", kind)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return ((data as any[]) || []).map((r) => ({
      id: String(r.id),
      title: String(r.question ?? ""),
      /* `content` is jsonb, so it arrives parsed — but a row written by an
         older path, or by hand, may hold a string. Tolerate both rather than
         letting one malformed row blank the whole list. */
      data: (typeof r.content === "string" ? safeParse(r.content) : r.content) as T,
      createdAt: String(r.created_at ?? ""),
    }));
  } catch {
    return [];
  }
}

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return {}; }
}

/**
 * The most recent entry of a kind — what /captable loads to resume a model.
 */
export async function latestWorkbench<T = any>(kind: WorkbenchKind): Promise<WorkbenchEntry<T> | null> {
  const rows = await listWorkbench<T>(kind, 1);
  return rows[0] ?? null;
}

/**
 * Can this visitor save at all?
 *
 * The three pages use this to decide whether to render a Save button. Showing
 * one to a signed-out visitor — every calculator is reachable signed-out —
 * would mean a click, a redirect to /login, and the loss of whatever they had
 * typed. Not offering is kinder than offering and failing.
 */
export async function canSaveWorkbench(): Promise<boolean> {
  const { user, orgId } = await getUserAndOrg();
  return Boolean(user && orgId);
}
