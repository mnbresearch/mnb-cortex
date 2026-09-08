import "server-only";
import crypto from "crypto";
import { serviceClient } from "@/lib/supabase/server";

/*
  COUNTING THE FUNNEL, WITHOUT WATCHING ANYONE.

  See 2026_zzzb_funnel_events.sql for why this is first-party rather than a
  third-party script. This file is the write side: a fixed vocabulary of steps,
  a privacy-preserving visitor hash, and a record() that can never break the
  page it is called from.

  THREE RULES THIS FILE ENFORCES

  1. A FIXED VOCABULARY. Free-text event names rot within a month — someone
     writes "checkout_start", someone else "checkout-started", and the funnel
     silently splits in two. FunnelEvent is a union; a typo is a type error.

  2. NEVER THROW, NEVER BLOCK. Analytics that can break a checkout is worse
     than no analytics. Every call is fire-and-forget behind a catch, and the
     caller is not asked to await it.

  3. NOTHING PERSONAL. No raw IP, no user agent, no cookie, no query string.
     Paths are recorded without their query, because that is where emails and
     tokens end up.
*/

export const FUNNEL_EVENTS = [
  /* ---- anonymous, top of funnel ------------------------------------ */
  "landing_view",        // someone reached the home page
  "pricing_view",        // ...and got as far as looking at prices
  "calculator_view",     // arrived on one of the 28 free tools
  "healthcheck_start",   // began the six-question check
  "healthcheck_done",    // finished it and saw a score
  "ledger_check_run",    // ran the real receivables analysis — highest intent
  "lead_captured",       // gave us a name and email

  /* ---- signup and activation --------------------------------------- */
  "signup_started",      // pressed a sign-in/sign-up button
  "workspace_created",   // a workspace actually exists now
  "data_imported",       // they put real numbers in — the moment value starts
  "first_warning",       // Cortex told them something about their own business

  /* ---- money -------------------------------------------------------- */
  "checkout_started",    // a Cashfree order was created
  "payment_succeeded",   // it settled and something was granted
  "payment_failed",      // it did not — worth counting separately
] as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

/*
  A DAILY, SALTED, TRUNCATED HASH — deliberately weak as an identifier.

  The salt includes today's date in IST, so the same visitor hashes differently
  tomorrow. That means we can count DISTINCT PEOPLE PER DAY and cannot follow
  anyone across days. For "how many saw pricing and how many of those bought",
  per-day distinctness is all the question needs.

  Truncated to 16 hex characters (64 bits): collisions are irrelevant at this
  volume, and a shorter value is a smaller thing to leak.

  The salt itself is an existing server secret rather than a new env var — one
  more secret to rotate is one more that will not be.
*/
function visitorHash(ip: string): string {
  const salt = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "cortex-funnel";
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return crypto.createHash("sha256").update(`${salt}|${day}|${ip}`).digest("hex").slice(0, 16);
}

/** Path without its query string — that is where tokens and emails live. */
function safePath(p: string | null | undefined): string | null {
  if (!p) return null;
  try { return new URL(p, "https://x.invalid").pathname.slice(0, 120); }
  catch { return String(p).split("?")[0].slice(0, 120); }
}

/**
 * Record one funnel step.
 *
 * Deliberately NOT awaited by callers. It returns a promise so a test can wait,
 * but every call site should treat it as fire-and-forget: a counter must never
 * be able to slow down, or fail, the thing it is counting.
 */
export async function record(
  event: FunnelEvent,
  opts: { ip?: string; path?: string | null; orgId?: string | null; meta?: Record<string, any> } = {},
): Promise<void> {
  try {
    const svc = serviceClient();
    if (!svc) return;

    /*
      META IS CAPPED AND FLATTENED. It exists for countable facts — a plan id, a
      score band, an error kind. Somebody will eventually try to put a whole
      request body in here; 10 keys and 120 characters each makes that
      impossible rather than merely discouraged.
    */
    const meta: Record<string, any> = {};
    for (const [k, v] of Object.entries(opts.meta || {}).slice(0, 10)) {
      if (v === null || v === undefined) continue;
      meta[k.slice(0, 40)] = typeof v === "number" || typeof v === "boolean" ? v : String(v).slice(0, 120);
    }

    await svc.from("funnel_events").insert({
      event,
      path: safePath(opts.path),
      visitor: opts.ip ? visitorHash(opts.ip) : null,
      org_id: opts.orgId || null,
      meta,
    });
  } catch {
    /* A counter must never break the thing it counts. */
  }
}

/** Fire-and-forget, for call sites that must not await anything. */
export function recordQuietly(
  event: FunnelEvent,
  opts: { ip?: string; path?: string | null; orgId?: string | null; meta?: Record<string, any> } = {},
): void {
  void record(event, opts).catch(() => {});
}

/* ==========================================================================
   THE READ SIDE — one query, for the superadmin console.
   ========================================================================== */

export type FunnelRow = { event: FunnelEvent; total: number; people: number };

/**
 * Counts per step over a window, with distinct people alongside raw events.
 *
 * Both numbers matter and they answer different questions: 400 pricing views
 * from 30 people is a very different business than 400 from 380.
 */
export async function getFunnel(days = 30): Promise<{ rows: FunnelRow[]; since: string; available: boolean }> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const empty = { rows: [] as FunnelRow[], since, available: false };
  try {
    const svc = serviceClient();
    if (!svc) return empty;

    /*
      Read the raw rows and aggregate in JS rather than adding an RPC.

      At this product's stage that is a few thousand rows a month — cheap, and
      it keeps the whole feature inside one file that can be deleted in one
      commit if it turns out nobody looks at it. If it ever gets slow, the
      indexes for the GROUP BY are already there.

      The 50k cap is a ceiling, not a page: past that the shape of the funnel
      does not change and an unbounded select is how a console page times out.
    */
    const { data, error } = await svc
      .from("funnel_events")
      .select("event, visitor")
      .gte("created_at", since)
      .limit(50_000);
    if (error) return empty;

    const totals = new Map<string, { total: number; people: Set<string> }>();
    for (const r of (data as any[]) || []) {
      const cur = totals.get(r.event) || { total: 0, people: new Set<string>() };
      cur.total++;
      if (r.visitor) cur.people.add(r.visitor);
      totals.set(r.event, cur);
    }

    /* Ordered by the funnel, not by size — the shape is the point. */
    const rows: FunnelRow[] = FUNNEL_EVENTS
      .map((e) => ({ event: e, total: totals.get(e)?.total ?? 0, people: totals.get(e)?.people.size ?? 0 }))
      .filter((r) => r.total > 0);

    return { rows, since, available: true };
  } catch {
    return empty;
  }
}
