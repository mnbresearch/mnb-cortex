import { apiAuth, apiError, apiOk } from "@/lib/api/auth";
import { askCortex, ASK_MAX_INPUT } from "@/lib/api/ask";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
  POST /api/v1/ask  { "question": "How is cash looking this month?" }

  Scope ai:ask (Watch Pro and above). Each answer is charged in credits at the
  in-app chat price and refunded if the engine does not answer — see
  lib/api/ask.ts. Read-only: an API caller cannot make Cortex act.
*/
export async function POST(req: Request) {
  const auth = await apiAuth(req, "ai:ask", "read", "/api/v1/ask");
  if (!auth.ok) return auth.res;
  const { ctx } = auth;
  let body: any = {};
  try { body = await req.json(); } catch { return apiError(ctx.rid, 400, "bad_request", "Body is not valid JSON."); }
  if (String(body?.question ?? "").length > ASK_MAX_INPUT) {
    return apiError(ctx.rid, 413, "payload_too_large", `Questions are limited to ${ASK_MAX_INPUT} characters. Nothing was charged.`);
  }
  const r = await askCortex(ctx.orgId, body?.question);
  if (!r.ok) return apiError(ctx.rid, r.status, r.code, r.error);
  return apiOk(ctx.rid, { answer: r.answer, credits_charged: r.credits_charged, balance: r.balance });
}
