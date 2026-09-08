import { NextResponse } from "next/server";
import { getClientBrief } from "@/lib/practice-brief-data";
import { getUserAndOrg } from "@/lib/data";
import { planRank } from "@/lib/integrations";
import { serviceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  One client's brief, for the firm to send under its own name.

  TWO GATES, AND THEY ARE DIFFERENT QUESTIONS.

  1. MEMBERSHIP — "may this user see this client at all". Enforced inside
     getClientBrief(), which is where it belongs: any future caller gets the
     check for free rather than having to remember it. An org id in a request
     body is never sufficient on its own.

  2. ENTITLEMENT — "does this firm's plan include Practice". Enforced here,
     because it is a commercial question rather than a safety one, and because
     the answer should be a clear message about the plan rather than a 404 that
     looks like a bug.

  Both are needed and neither substitutes for the other: a member of two
  workspaces on a Watch plan passes (1) and must fail (2); a Practice firm
  asking about a business they do not advise passes (2) and must fail (1).
*/
export async function GET(req: Request) {
  const { orgId: myOrg } = await getUserAndOrg();
  if (!myOrg) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const target = new URL(req.url).searchParams.get("org") || "";
  if (!target) return NextResponse.json({ ok: false, error: "Which client?" }, { status: 400 });

  /* Practice is a plan feature. Same rank check the console itself uses. */
  try {
    const svc = serviceClient();
    const { data } = await svc!.from("organizations").select("plan").eq("id", myOrg).maybeSingle();
    const plan = String((data as any)?.plan || "").toLowerCase();
    if (planRank(plan) < planRank("practice")) {
      return NextResponse.json({
        ok: false,
        error: "Client briefs are part of the Practice plan — the one built for firms managing several businesses.",
      }, { status: 200 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Could not check your plan just now." }, { status: 200 });
  }

  const brief = await getClientBrief(target);
  if (!brief) {
    /*
      Deliberately the same message whether the workspace does not exist or the
      user is not a member of it. Distinguishing the two would let a Practice
      subscriber probe org ids and learn which ones are real.
    */
    return NextResponse.json({ ok: false, error: "That client is not on your list." }, { status: 200 });
  }

  return NextResponse.json({ ok: true, brief });
}
