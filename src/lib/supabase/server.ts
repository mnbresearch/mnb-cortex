import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createRawClient } from "@supabase/supabase-js";
import { envKey } from "@/lib/env";

/**
 * Database reads must never be served from Next's Data Cache.
 *
 * Next 14 replaces the global `fetch` and caches GET responses by default.
 * supabase-js talks to PostgREST over `fetch`, so every server-side read was a
 * candidate for being answered from cache instead of the database. Two
 * consequences, one merely confusing and one serious:
 *
 *  - Stale figures. The cron would recompute a workspace's KPIs and the
 *    dashboard would keep rendering the previous numbers. This was visible in
 *    production: /api/health reported the cron heartbeat as hours old seconds
 *    after it had been rewritten.
 *  - Cross-tenant risk. PostgREST request URLs are identical for every tenant
 *    (`/rest/v1/sales_orders?...`); only the Authorization header differs. A
 *    shared response cache keyed primarily on URL is the wrong place to be
 *    storing multi-tenant rows, whatever the exact keying rules turn out to be.
 *
 * Marking every database call `no-store` costs a little latency and removes
 * both problems. Page-level caching is unaffected — this only opts out the
 * individual data reads, which should always reflect the row as it is now.
 */
const noStore: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });

/*
  ASYNC, AND DELIBERATELY SO WHILE WE ARE STILL ON NEXT 14.

  Next 15 makes cookies() return a Promise. That is the single change with real
  reach in this codebase: this function is called at 123 sites across 34 files,
  and every one of them has to await it. Doing that in the same commit as the
  framework bump would mean a wide mechanical diff landing at the same moment
  as a major upgrade, with no way to tell which of the two broke anything.

  So it is done FIRST, on Next 14, where it is a no-op at runtime: `await` on a
  non-Promise resolves to the value immediately. The behaviour today is
  identical; the difference is that when `next@15` is installed this file needs
  no further change, and neither do the 123 call sites.

  The compiler is what makes this safe. Once this returns a Promise, every call
  site that uses the result synchronously is a type error — so `tsc --noEmit`
  enumerates the work exhaustively rather than a grep guessing at it.

  NOTE for the upgrade: the ONLY edit needed here afterwards is nothing at all.
  `await cookies()` is correct on both versions.
*/
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: noStore },
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options));
          } catch { /* called from a Server Component */ }
        },
      },
    }
  );
}

export function hasSupabase() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // envKey() rejects the "[SENSITIVE]" placeholder that `vercel env pull`
  // writes, so a placeholder degrades to the migration-safe "not configured"
  // path instead of a client that 401s on every call.
  if (!url || !envKey("SUPABASE_SERVICE_ROLE_KEY")) return null;
  return createRawClient(url, key!, {
    auth: { persistSession: false },
    global: { fetch: noStore },
  });
}

/**
 * True when a real service-role key is configured. Used by the health check so
 * a placeholder is reported as "not configured" rather than silently green.
 */
export function hasServiceRole(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && envKey("SUPABASE_SERVICE_ROLE_KEY"));
}
