import { NextResponse } from "next/server";
import { runExecutiveCouncil, fallbackCouncil } from "@/lib/ai/council-server";
import { getBusinessContext, getUserAndOrg } from "@/lib/data";
import { recallContext } from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_STATEMENT = 2_000;

export async function POST(req: Request) {
  try {
    const { statement } = await req.json().catch(() => ({}));
    const cleanStatement = String(statement || "").slice(0, MAX_STATEMENT).trim();

    if (!cleanStatement) {
      return NextResponse.json(
        { ok: false, error: "Please enter a strategic dilemma or question for the Executive Council." },
        { status: 400 }
      );
    }

    let fullContext = "";
    let orgId: string | null = null;
    try {
      const u = await getUserAndOrg();
      orgId = u.orgId || null;
      const baseContext = await getBusinessContext();
      const mem = orgId ? await recallContext(orgId, cleanStatement, 8) : "";
      fullContext = mem ? `${baseContext}\n\n${mem}` : baseContext;
    } catch {
      // In guest/demo mode, run with empty or public context
    }

    const result = await runExecutiveCouncil(cleanStatement, fullContext, orgId);
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error("[council] route threw error, returning fallback:", err);
    return NextResponse.json({
      ok: true,
      result: fallbackCouncil("Strategic Business Evaluation"),
      notice: "Executive council generated from deterministic business baseline.",
    });
  }
}
