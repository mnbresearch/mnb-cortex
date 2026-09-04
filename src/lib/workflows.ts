import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { generateFor } from "@/lib/ai/cortex";
import { recomputeMetrics } from "@/lib/metrics";
import { sendEmail } from "@/lib/email";
import { brandFrom } from "@/lib/branded-email";

/**
 * The workflow executor.
 *
 * runWorkflow() used to insert a row reading "steps executed successfully." and
 * do nothing at all — while the landing page sold "Workflows & Approvals —
 * automate the busywork" and the Growth plan listed "Workflow automation".
 *
 * A step is a line of text whose FIRST WORD is the action. Anything after it is
 * the argument. An unrecognised step is reported as skipped, by name — never
 * silently counted as success, which was the original sin here.
 */

export type StepResult = { step: string; ok: boolean; detail: string; skipped?: boolean };
export type RunResult = { ok: boolean; results: StepResult[]; summary: string };

const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/** Everything a workflow step can actually do, with help text for the UI. */
export const ACTIONS: { verb: string; arg: string; does: string }[] = [
  { verb: "recompute", arg: "", does: "Refresh the dashboard KPIs from current data" },
  { verb: "receivables", arg: "", does: "Total overdue invoices and list the worst offenders" },
  { verb: "reorder", arg: "", does: "Find stock below its reorder level" },
  { verb: "alert", arg: "<message>", does: "Raise an in-app alert" },
  { verb: "email", arg: "<subject>", does: "Email the workspace owner a run summary" },
  { verb: "ai", arg: "<mode> <prompt>", does: "Run an AI mode (brief, actions, risk, costs…) and save the output" },
  { verb: "note", arg: "<text>", does: "Record a note in the run log" },
];

function parse(step: string): { verb: string; rest: string } {
  const t = String(step || "").trim();
  const sp = t.indexOf(" ");
  const head = (sp === -1 ? t : t.slice(0, sp)).toLowerCase().replace(/[:,]$/, "");
  return { verb: head, rest: sp === -1 ? "" : t.slice(sp + 1).trim() };
}

/**
 * Execute one workflow. Every step runs even if an earlier one fails, so the
 * log tells the owner exactly which parts worked.
 */
export async function executeWorkflow(
  orgId: string,
  steps: string[],
  ctx: { name: string; ownerEmail?: string | null },
): Promise<RunResult> {
  const svc = serviceClient();
  if (!svc) return { ok: false, results: [], summary: "Service role not configured — cannot run workflows." };

  const results: StepResult[] = [];
  const facts: string[] = [];   // things later steps (and the email) can reference

  for (const raw of steps) {
    const { verb, rest } = parse(raw);
    try {
      switch (verb) {
        case "recompute": {
          const r = await recomputeMetrics(orgId);
          results.push({ step: raw, ok: r.ok, detail: r.ok ? `Refreshed ${r.metrics} KPIs` : (r.reason || "Recompute failed") });
          break;
        }

        case "receivables": {
          const today = new Date().toISOString().slice(0, 10);
          const { data } = await svc.from("invoices")
            .select("party,amount,due_date,status").eq("org_id", orgId).eq("type", "receivable")
            .or("status.is.null,status.not.ilike.paid").limit(500);
          const overdue = ((data as any[]) || [])
            .filter((i) => i.status === "overdue" || (i.due_date && String(i.due_date) < today))
            .sort((a, b) => num(b.amount) - num(a.amount));
          const total = overdue.reduce((a, i) => a + num(i.amount), 0);
          const top = overdue.slice(0, 3).map((i) => `${i.party || "Unnamed"} ${inr(num(i.amount))}`).join(", ");
          const detail = overdue.length
            ? `${overdue.length} overdue worth ${inr(total)}${top ? ` — top: ${top}` : ""}`
            : "No overdue receivables";
          facts.push(detail);
          results.push({ step: raw, ok: true, detail });
          break;
        }

        case "reorder": {
          const { data } = await svc.from("inventory_items")
            .select("sku,name,on_hand,reorder_level").eq("org_id", orgId).limit(2000);
          const low = ((data as any[]) || []).filter((i) => num(i.reorder_level) > 0 && num(i.on_hand) < num(i.reorder_level));
          const detail = low.length
            ? `${low.length} item(s) below reorder level: ${low.slice(0, 3).map((i) => i.sku || i.name).join(", ")}`
            : "Nothing below reorder level";
          facts.push(detail);
          results.push({ step: raw, ok: true, detail });
          break;
        }

        case "alert": {
          const body = rest || facts.join(" · ") || "Workflow checkpoint";
          const { error } = await svc.from("alerts").insert({
            org_id: orgId, severity: "yellow", module: "workflow",
            title: `Workflow: ${ctx.name}`, body: body.slice(0, 400),
          });
          results.push({ step: raw, ok: !error, detail: error ? error.message : "Alert raised" });
          break;
        }

        case "email": {
          if (!ctx.ownerEmail) { results.push({ step: raw, ok: false, detail: "No owner email on file" }); break; }
          const subject = rest || `Workflow: ${ctx.name}`;
          const lines = facts.length ? facts : results.map((r) => r.detail);
          const html = `<h2>${ctx.name}</h2><ul>${lines.map((l) => `<li>${String(l).replace(/</g, "&lt;")}</li>`).join("")}</ul>`;
          const res = await sendEmail(ctx.ownerEmail, subject, html, { from: brandFrom() });
          results.push({ step: raw, ok: res.sent, detail: res.sent ? `Emailed ${ctx.ownerEmail}` : (res.reason || "Send failed") });
          break;
        }

        case "ai": {
          const [mode, ...tail] = rest.split(/\s+/);
          if (!mode) { results.push({ step: raw, ok: false, detail: "ai needs a mode, e.g. `ai brief`" }); break; }
          const context = facts.length ? `WORKFLOW FINDINGS:\n${facts.map((f) => `- ${f}`).join("\n")}` : "";
          const text = await generateFor(mode.toLowerCase(), tail.join(" "), context);
          const okAi = Boolean(text) && !/^I couldn't reach the AI engine/.test(text);
          let saved = false;
          if (okAi) {
            // strategy_docs is (framework, question, content jsonb) — an insert
            // naming `title`/`body` is rejected by PostgREST, and supabase-js
            // returns that in the result rather than throwing, so the old
            // try/catch never saw it and every run still claimed "and saved".
            const { error: saveErr } = await svc.from("strategy_docs").insert({
              org_id: orgId,
              framework: "workflow",
              question: `${ctx.name} — ${mode}`,
              content: { text: text.slice(0, 20000) },
            });
            saved = !saveErr;
            facts.push(`AI ${mode}: ${text.slice(0, 160)}…`);
          }
          results.push({
            step: raw,
            ok: okAi,
            detail: okAi ? (saved ? `Generated and saved "${mode}" output` : `Generated "${mode}" output (could not save it)`) : "AI unavailable",
          });
          break;
        }

        case "note": {
          if (rest) facts.push(rest);
          results.push({ step: raw, ok: true, detail: rest || "(empty note)" });
          break;
        }

        default:
          // The honest branch. The old code counted this as success.
          results.push({
            step: raw, ok: false, skipped: true,
            detail: `Not a known action. Start the step with one of: ${ACTIONS.map((a) => a.verb).join(", ")}`,
          });
      }
    } catch (e: any) {
      results.push({ step: raw, ok: false, detail: e?.message || "Step failed" });
    }
  }

  const done = results.filter((r) => r.ok).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.length - done - skipped;
  const summary =
    `${done}/${results.length} steps ran` +
    (skipped ? `, ${skipped} skipped (unknown action)` : "") +
    (failed ? `, ${failed} failed` : "");

  return { ok: failed === 0, results, summary };
}
