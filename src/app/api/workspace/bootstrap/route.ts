import { NextResponse } from "next/server";
import { ensureWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called by the login flow right after sign-in / sign-up so a workspace exists
// before we drop the user into the dashboard.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const res = await ensureWorkspace({ name: body?.company || body?.name, industry: body?.industry });

  /*
    NO `next` ON FAILURE.

    This always computed one: `res.created ? "/onboarding" : "/dashboard"`, so a
    provisioning failure (created is undefined) produced
    `{ ok: false, error: "…", next: "/dashboard" }`. The client read `next` and
    ignored `ok`, which turned a hard failure into a redirect — the user landed
    in an app that could not show them anything, because the owner membership
    every RLS policy checks was never written.

    Withholding `next` means a client that only looks at `next` now falls back
    to its own default rather than being actively told where to go, and the
    status code says what happened. 200 is deliberate: the sign-in itself
    succeeded, so this is not a 4xx, and the client distinguishes on `ok`.
  */
  if (!res.ok) return NextResponse.json({ ...res, ok: false });

  // Tell the client where to land. A brand-new workspace goes through
  // onboarding once — that page was previously unreachable, so the only flow
  // collecting company name, industry and currency together was dead code.
  const next = res.created ? "/onboarding" : "/dashboard";
  return NextResponse.json({ ...res, next });
}
