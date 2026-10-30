import "server-only";
import { serviceClient } from "@/lib/supabase/server";

/*
  ASK CORTEX FROM OUTSIDE — /api/v1/ask and the MCP tool ask_cortex.

  Same engine, same price, same refund rules as chat in the app:
    - chargeOrgForMode(org, "ask") — 19 credits, the CREDIT_COSTS price; it also
      loads the workspace's own AI key (BYO) and scopes DLP redaction to it,
      exactly as the nightly cron paths do;
    - runCortex with the workspace's snapshot, fenced as third-party data;
    - no tools (opts.tools stays false): an API caller can read answers, it
      cannot make Cortex draft or send anything;
    - an empty answer or an engine failure is refunded and reported as a
      failure, never billed as an answer.

  The org comes from the API key (lib/api/auth.ts), never from a session.
*/

export const ASK_MAX_INPUT = 4000;
export const ASK_MODE = "ask";

/** Pure: the business snapshot as the model sees it. Exported for tests. */
export function snapshotText(metrics: { label: string; value: any; unit?: string | null; delta_pct?: number | null; status?: string | null }[]): string {
  if (!metrics.length) {
    return `NO BUSINESS DATA HAS BEEN CONNECTED TO THIS WORKSPACE YET.
Do NOT invent, assume, or state any figures. Say plainly that you don't have their numbers yet, and that connecting Tally, Zoho Books or another source under Integrations will fix it.`;
  }
  return "KEY METRICS:\n" + metrics.map((x) => {
    const d = typeof x.delta_pct === "number" && Number.isFinite(x.delta_pct) ? `${x.delta_pct > 0 ? "+" : ""}${x.delta_pct}%, ` : "";
    return `- ${x.label}: ${x.value}${x.unit === "INR" ? " INR" : x.unit ? " " + x.unit : ""} (${d}status ${x.status || "unknown"})`;
  }).join("\n");
}

export type AskResult =
  | { ok: true; answer: string; credits_charged: number; balance: number }
  | { ok: false; status: number; code: "bad_request" | "payment_required" | "unavailable" | "internal"; error: string };

export async function askCortex(orgId: string, rawQuestion: unknown): Promise<AskResult> {
  const question = String(rawQuestion ?? "").trim().slice(0, ASK_MAX_INPUT);
  if (!question) return { ok: false, status: 400, code: "bad_request", error: "Send { \"question\": \"…\" }." };

  const { chargeOrgForMode, refundIfCharged } = await import("@/lib/credits");
  const gate = await chargeOrgForMode(orgId, ASK_MODE);
  if (!gate.ok) {
    const { creditDenial } = await import("@/lib/api-guard");
    const d = creditDenial(gate, "Asking Cortex");
    const status = d.status === 402 || /credit/i.test(String((d.body as any).error || "")) ? 402 : d.status;
    return { ok: false, status, code: status === 402 ? "payment_required" : "unavailable", error: String((d.body as any).error || "Not enough credits.") };
  }
  try {
    const svc = serviceClient();
    const { data } = svc ? await svc.from("health_metrics").select("label, value, unit, delta_pct, status").eq("org_id", orgId).limit(200) : { data: [] as any[] };
    let context = snapshotText(((data as any[]) || []));
    try {
      const { recallContext } = await import("@/lib/memory");
      const mem = await recallContext(orgId, question, 8);
      if (mem) context += `\n\n${mem}`;
    } catch { /* memory is optional */ }

    const { runCortex, isEngineFailure } = await import("@/lib/ai/cortex");
    const { FAST } = await import("@/lib/ai/generation");
    const answer = await runCortex([{ role: "user", content: question }], context, FAST, { tools: false, deadlineAt: Date.now() + 45_000 });
    if (!String(answer || "").trim() || isEngineFailure(answer)) {
      await refundIfCharged(gate, ASK_MODE);
      return { ok: false, status: 503, code: "unavailable", error: "The AI engine did not answer. Nothing was charged — retry shortly." };
    }
    return { ok: true, answer, credits_charged: gate.enforced ? gate.cost : 0, balance: gate.balance };
  } catch (e: any) {
    await refundIfCharged(gate, ASK_MODE);
    console.error("[api/ask] failed:", e?.message);
    return { ok: false, status: 500, code: "internal", error: "Something went wrong on our side. Nothing was charged." };
  }
}
