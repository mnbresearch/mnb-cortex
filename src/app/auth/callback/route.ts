import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureWorkspace } from "@/lib/workspace";

/**
 * OAuth / magic-link return path.
 *
 * Three failures were all treated as success, which matters far more now that
 * Google sign-in is a supported route in:
 *
 *  1. The provider can return an ERROR instead of a code — a cancelled Google
 *     consent screen sends ?error=access_denied. That was ignored, so the user
 *     was redirected to /dashboard while signed out and simply bounced.
 *  2. exchangeCodeForSession() can fail (expired or reused code, PKCE
 *     mismatch). Its result was discarded, producing the same silent bounce.
 *  3. ensureWorkspace() was wrapped in `catch { /* non-fatal *\/ }`. It is
 *     emphatically fatal: without it the user is signed in with orgId = null,
 *     which is the state where data.ts falls back to DEMO figures and every AI
 *     endpoint answers "sign in first". Someone's first minute in the product
 *     would be a fake company and an AI that says they're logged out.
 *
 * Every failure now lands back on /login with a readable reason.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const oauthError = searchParams.get("error_description") || searchParams.get("error");
  if (oauthError) {
    const reason = /access_denied/i.test(oauthError)
      ? "Sign-in was cancelled. Please try again."
      : oauthError.slice(0, 200);
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`);
  }

  const code = searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("That sign-in link is missing its code. Please request a new one.")}`);
  }

  const next = searchParams.get("next") || "/dashboard";
  const supabase = createClient();

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    const expired = /expired|invalid|used/i.test(exchangeError.message || "");
    const reason = expired
      ? "That sign-in link has expired or was already used. Please request a new one."
      : (exchangeError.message || "Could not complete sign-in.");
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`);
  }

  // A signed-in user with no workspace is a broken account, not a minor issue.
  try {
    const res = await ensureWorkspace();
    if (!res?.ok) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(res?.error || "Signed in, but your workspace could not be created. Please try again or contact support.")}`,
      );
    }
    if (res.created && !searchParams.get("next")) {
      return NextResponse.redirect(`${origin}/onboarding`);
    }
  } catch (e: any) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(e?.message || "Signed in, but your workspace could not be created.")}`,
    );
  }

  return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/dashboard"}`);
}
