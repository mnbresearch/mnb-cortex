import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api-guard";
import { hasRole } from "@/lib/roles";
import { getInstructions, setInstructions, MAX_INSTRUCTIONS } from "@/lib/ai-instructions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read and write the workspace's custom AI instructions.
 *
 * Admin-only to write: these instructions apply to every answer every member
 * receives, so this is a workspace-wide setting, not a personal preference.
 * Anyone in the workspace may read them, because people should be able to see
 * why the AI is behaving the way it is.
 */
export async function GET() {
  const gate = await requireWorkspace();
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });
  const text = await getInstructions(gate.orgId);
  return NextResponse.json({ ok: true, text, max: MAX_INSTRUCTIONS });
}

export async function POST(req: Request) {
  const gate = await requireWorkspace();
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  if (!(await hasRole("admin"))) {
    return NextResponse.json(
      { ok: false, error: "Only an admin or owner can change the workspace's AI instructions." },
      { status: 200 },
    );
  }

  const b = await req.json().catch(() => ({} as any));
  const text = String(b.text ?? "");
  if (text.length > MAX_INSTRUCTIONS) {
    return NextResponse.json(
      { ok: false, error: `Instructions are limited to ${MAX_INSTRUCTIONS} characters — longer ones crowd out your actual business data.` },
      { status: 200 },
    );
  }

  const res = await setInstructions(gate.orgId, text);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 200 });
  return NextResponse.json({ ok: true, saved: text.length });
}
