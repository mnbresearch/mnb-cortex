import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase session cookie on each request.
 *
 * THIS MIDDLEWARE MUST NEVER BE ABLE TO TAKE THE SITE DOWN.
 *
 * It used to `await supabase.auth.getUser()` with no time limit. That call is a
 * network round trip to Supabase Auth, and it runs on essentially every request
 * — every page, every API route, even /sw.js. So whenever Supabase Auth got
 * slow, the middleware sat waiting, Vercel killed it at 25s, and the visitor
 * got a 504. Not on one route: on ALL of them.
 *
 * That is not hypothetical. Observed in production, from Vercel's own logs:
 *
 *     GET /dashboard    504  [error/edge-middleware]
 *     GET /settings     504  Your function was stopped as it did not return
 *     GET /api/export   504  an initial response within 25s
 *     POST /api/ai      504
 *     GET /sw.js        504
 *
 * 34 of 45 requests in a 45-minute window, ~75%, while Supabase itself
 * recovered to 0.3s responses minutes later. The tell was that /api/health
 * (called without a session cookie) kept returning 200 throughout: with no
 * cookie there is no token to validate, so getUser() returns immediately and
 * the middleware never blocks. Every request that DID carry a session hung.
 *
 * WHY A TIMEOUT IS SAFE HERE. This middleware does not gate access — it never
 * redirects and never blocks; it returns `res` on every path. Its only job is
 * to refresh the auth cookie. Access is enforced downstream by getUserAndOrg(),
 * requireRole() and Postgres RLS, none of which trust anything this file does.
 * So abandoning a slow refresh cannot grant access to anyone; the worst case is
 * that one request runs with a cookie that was not refreshed, and the next
 * request refreshes it.
 *
 * Failing OPEN on the refresh is therefore strictly better than failing the
 * whole request: a slightly stale cookie versus a dead site.
 */

/** Well under Vercel's 25s ceiling, and ~10x the normal 0.3s response. */
const AUTH_REFRESH_TIMEOUT_MS = 3000;

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return res; // demo mode — no auth configured

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return req.cookies.getAll(); },
      setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  try {
    // Race the refresh against the clock. Whichever finishes first, the request
    // proceeds — the point is that it proceeds at all.
    await Promise.race([
      supabase.auth.getUser(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("supabase auth refresh timed out")), AUTH_REFRESH_TIMEOUT_MS),
      ),
    ]);
  } catch {
    // Deliberately swallowed. A failed or slow cookie refresh is not a reason to
    // fail the request, and downstream auth is unaffected either way.
  }

  return res;
}

export const config = {
  /*
    Static files under public/ are excluded explicitly. They are served straight
    from the CDN and have no session to refresh, so putting them through an auth
    round trip only spends latency — and during the incident above it made
    /sw.js itself return 504, which breaks the PWA's ability to update.
    _next/static and _next/image are already excluded.
  */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|pdf)$).*)",
  ],
};
