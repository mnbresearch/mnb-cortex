import "server-only";
import { createHash } from "node:crypto";
import { serviceClient } from "@/lib/supabase/server";

/**
 * A cache for model output that is keyed on the INPUT, not on the clock.
 *
 * THE PROBLEM.
 *
 * /api/priorities makes a real Gemini call, and next-best-actions.tsx fires it
 * from a useEffect on the dashboard — which is the app's landing page. So every
 * dashboard view, including a refresh, a back-navigation, or a second tab, costs
 * a model call and two to ten seconds of latency for a card nobody clicked. The
 * only existing guard is a 120/day rate limit, which caps the damage per
 * workspace but does nothing about cost across many workspaces, and turns into
 * a degraded dashboard for anyone who hits it.
 *
 * WHY FINGERPRINT RATHER THAN TTL.
 *
 * A plain TTL forces a bad trade: short enough to stay current means most views
 * still pay for a model call; long enough to save money means a user who fixes
 * a problem keeps being told to fix it. Both are avoidable, because the answer
 * is a pure function of the input — the same business context yields the same
 * priorities.
 *
 * So the key is a hash of the input. The cheap half of the work (the database
 * reads that build the context) still happens on every request; only the
 * expensive half is skipped. Data changes, hash changes, the model runs. Data
 * has not changed, and neither has the advice, so there is nothing to recompute.
 * That is exact invalidation rather than a guess at how long staleness is
 * tolerable, and it means the cache can be held far longer than a TTL would
 * safely allow.
 *
 * `maxAgeSecs` is still there as a ceiling, for the case the fingerprint cannot
 * see: a change in our own prompt or model. Bumping `version` invalidates
 * everything at once for a deliberate change.
 *
 * WHERE IT LIVES.
 *
 * app_settings — (org_id, key) primary key, service role only, no public
 * policy. Already the right shape, so this needs no migration and inherits the
 * isolation. Every failure path falls through to computing the value, so a
 * missing table or a cache error costs latency and never correctness.
 */

const VERSION = "v1";

export function fingerprint(...parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

export async function cachedByInput<T>(
  orgId: string,
  name: string,
  input: unknown,
  maxAgeSecs: number,
  compute: () => Promise<T>,
): Promise<{ value: T; hit: boolean }> {
  const key = `cache:${name}`;
  const want = fingerprint(VERSION, input);

  let svc: ReturnType<typeof serviceClient>;
  try { svc = serviceClient(); } catch { return { value: await compute(), hit: false }; }
  if (!svc) return { value: await compute(), hit: false };

  try {
    const { data } = await svc
      .from("app_settings").select("value, updated_at")
      .eq("org_id", orgId).eq("key", key).maybeSingle();

    if (data?.value) {
      const row = JSON.parse(String((data as any).value));
      const ageOk = maxAgeSecs <= 0 ||
        (Date.now() - new Date(String((data as any).updated_at || 0)).getTime()) < maxAgeSecs * 1000;
      if (row?.fp === want && ageOk) return { value: row.payload as T, hit: true };
    }
  } catch {
    /* Unparseable row, missing table, RLS surprise — recompute. A cache that
       throws must never be worse than no cache. */
  }

  const value = await compute();

  try {
    await svc.from("app_settings").upsert(
      { org_id: orgId, key, value: JSON.stringify({ fp: want, payload: value }), updated_at: new Date().toISOString() },
      { onConflict: "org_id,key" },
    );
  } catch { /* best effort — the caller already has its answer */ }

  return { value, hit: false };
}
