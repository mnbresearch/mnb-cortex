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

export function createClient() {
  const cookieStore = cookies();
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
