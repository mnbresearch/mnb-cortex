import "server-only";
import { serviceClient } from "@/lib/supabase/server";

/**
 * Fair rotation for capped cron jobs.
 *
 * The nightly autopilot took `orgs.slice(0, 200)` from a list ordered by
 * created_at ascending. The cap is necessary — the function dies at 300s — but
 * a fixed slice of a stable ordering is the same 200 workspaces every night, so
 * workspace 201 is never processed. Not late: never. At 10,000 customers that
 * is 98% receiving nothing while the run reports success.
 *
 * This walks the list instead. Each run starts where the last one stopped and
 * wraps at the end, so everyone is reached within ceil(total / cap) nights.
 *
 * KEYSET, NOT OFFSET.
 *
 * The cursor is the last (created_at, id) processed, and the next run asks for
 * rows greater than it. With OFFSET, a workspace created or deleted between
 * runs shifts every later row by one — which skips somebody, silently, and the
 * skipped one is different each time so it never shows up as a pattern.
 * (created_at, id) is stable under both: a new signup simply appears at its own
 * position in the order and is picked up when the rotation reaches it.
 *
 * `id` is the tiebreaker. created_at alone is not unique — bulk provisioning or
 * a seed script can give several workspaces the same timestamp, and a cursor on
 * a non-unique column either loses rows or repeats them forever.
 */

export type Rotatable = { id: string; created_at?: string | null };

export type Rotation<T> = {
  /** The slice to process this run. */
  batch: T[];
  /** True when the rotation reached the end and started again. */
  wrapped: boolean;
  /** Total candidates, so the caller can report coverage honestly. */
  total: number;
  /** Persist the new position. Call after the work, not before. */
  commit: (processed: number) => Promise<void>;
};

/**
 * @param job    cursor name, e.g. "metrics_sweep"
 * @param all    every candidate, ordered by (created_at, id) ascending
 * @param cap    how many to take this run
 */
export async function rotate<T extends Rotatable>(
  job: string, all: T[], cap: number,
): Promise<Rotation<T>> {
  const total = all.length;
  const key = (r: Rotatable) => `${r.created_at ?? ""}|${r.id}`;

  const sorted = [...all].sort((a, b) => key(a).localeCompare(key(b)));

  let cursor: string | null = null;
  const svc = (() => { try { return serviceClient(); } catch { return null; } })();

  if (svc) {
    try {
      const { data } = await svc.from("cron_cursors")
        .select("cursor_at, cursor_id").eq("name", job).maybeSingle();
      const at = (data as any)?.cursor_at, id = (data as any)?.cursor_id;
      if (id) cursor = `${at ?? ""}|${id}`;
    } catch {
      /* Table not migrated yet, or unreachable. Fall through with a null
         cursor: the job then behaves exactly as it did before this file
         existed — first N — rather than not running at all. Degrading to the
         old behaviour is acceptable; degrading to no nightly run is not. */
    }
  }

  /*
    Resume after the cursor. If the cursor points at a workspace that has since
    been deleted, `findIndex` returns -1 and we start from the beginning — a
    wasted rotation, not a stuck one.
  */
  const start = cursor ? sorted.findIndex((r) => key(r) > cursor!) : 0;
  const from = start < 0 ? 0 : start;

  let batch = sorted.slice(from, from + cap);
  let wrapped = false;

  /*
    Short batch means we hit the end. Top up from the front so a run is never
    mostly idle just because the cursor was near the tail — otherwise the last
    partial batch of every cycle wastes a whole night.
  */
  if (batch.length < cap && from > 0) {
    wrapped = true;
    batch = batch.concat(sorted.slice(0, Math.min(cap - batch.length, from)));
  }

  const last = batch[batch.length - 1];

  const commit = async (processed: number) => {
    if (!svc || !last) return;
    try {
      await svc.rpc("cron_cursor_advance", {
        p_name: job,
        p_at: last.created_at ?? null,
        p_id: last.id,
        p_count: processed,
        p_wrapped: wrapped,
      });
    } catch {
      /* If the cursor cannot be saved the next run repeats this batch. Wasteful
         but harmless — both jobs behind this are idempotent (recompute metrics,
         insert an alert). Losing the cursor must not fail the run that already
         did its work. */
    }
  };

  return { batch, wrapped, total, commit };
}
