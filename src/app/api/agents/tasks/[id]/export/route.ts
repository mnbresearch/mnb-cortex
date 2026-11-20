import { getUserAndOrg } from "@/lib/data";
import { getTask } from "@/lib/agents/tasks";
import { toDocx, toPptx, toXlsx, type DeliverableInput } from "@/lib/deliverables/build";
import { serviceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/*
  GET /api/agents/tasks/:id/export?format=docx|pptx|xlsx
  A finished task as a Word document, PowerPoint deck or Excel workbook, with
  its Veritas line and work log (lib/deliverables/build.ts). Scoped to the
  signed-in workspace; only finished tasks export.
*/
const TYPES = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return new Response("Sign in to a workspace.", { status: 401 });
  const format = (new URL(req.url).searchParams.get("format") || "docx") as keyof typeof TYPES;
  if (!(format in TYPES)) return new Response("format must be docx, pptx or xlsx", { status: 400 });
  const found = await getTask(orgId, String(params.id || ""));
  if (!found) return new Response("No such task in this workspace.", { status: 404 });
  const { task, steps } = found as any;
  if (task.status !== "done" || !task.result) return new Response("This task has not finished yet.", { status: 409 });

  let workspace = "Your workspace";
  try { const { data } = await (serviceClient() as any).from("organizations").select("name").eq("id", orgId).maybeSingle(); if (data?.name) workspace = String(data.name); } catch { /* label only */ }
  const input: DeliverableInput = {
    title: String(task.title || "Agent result"), request: String(task.request || ""),
    date: new Date(task.finished_at || task.updated_at || Date.now()).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }),
    workspace, result: String(task.result), verification: task.verification || null,
    steps: (steps || []).filter((s: any) => s.kind === "agent" && s.status === "done").map((s: any) => ({ agent: String(s.agent_name || s.agent_id || "Agent"), instruction: String(s.instruction || ""), output: String(s.output || "") })),
  };
  const buf = format === "docx" ? await toDocx(input) : format === "pptx" ? await toPptx(input) : await toXlsx(input);
  const safe = input.title.replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "cortex-result";
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": TYPES[format], "Content-Disposition": `attachment; filename="${safe}.${format}"` } });
}
