"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Sparkles, Loader2, AlertCircle, CheckCircle2, Zap, RotateCcw } from "lucide-react";
import { createWorkflowFromPlan } from "@/lib/actions";

/*
  "Automate this": a sentence → a plan you read → a workflow you create.
  The plan arrives already validated by the server; create re-validates it.
  Default is "create paused" so a daily schedule never fires before the
  owner has pressed Run once and read the log.
*/
type Plan = { name: string; trigger: "schedule" | "manual"; steps: string[]; describe: string[] };

const EXAMPLES = [
  "Every morning refresh my KPIs, list who is overdue and email me the summary",
  "Each day check stock below reorder level and raise an alert if anything is low",
  "Daily: export my receivables ageing to Excel",
  "Every day run the risk analysis and email me the findings",
];

export function AutomateThis() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"plan" | "create" | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<{ text: string; problems?: string[] } | null>(null);
  const [done, setDone] = useState<{ name: string; active: boolean } | null>(null);

  const reset = () => { setPlan(null); setError(null); setDone(null); setNote(""); };

  async function getPlan() {
    if (text.trim().length < 8) { setError({ text: "Describe the automation in a sentence." }); return; }
    setBusy("plan"); reset();
    try {
      const r = await fetch("/api/automation/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instruction: text }) });
      const j = await r.json().catch(() => ({ ok: false, error: `The server answered ${r.status} without a readable body.` }));
      if (!j.ok) { setError({ text: j.error || "Could not plan that.", problems: j.problems }); setNote(j.note || ""); return; }
      setPlan(j.plan); setNote(j.note || "");
    } catch (e: any) { setError({ text: `Could not reach the server: ${e?.message || "network error"}. Nothing was created.` }); }
    finally { setBusy(null); }
  }

  async function create(activate: boolean) {
    if (!plan) return;
    setBusy("create"); setError(null);
    try {
      const r = await createWorkflowFromPlan({ plan, activate });
      if (!r.ok) { setError({ text: r.error, problems: r.problems }); return; }
      setDone({ name: r.name, active: r.active }); setPlan(null);
      router.refresh();
    } catch (e: any) { setError({ text: e?.message || "Could not create the workflow." }); }
    finally { setBusy(null); }
  }

  return (
    <Card className="p-5 space-y-4">
      <div>
        <div className="text-sm font-medium flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /> Automate this</div>
        <p className="text-xs text-muted-foreground mt-0.5">Say what should happen, in a sentence. Cortex turns it into steps you can read before anything is created.</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input value={text} onChange={(e) => { setText(e.target.value); if (plan || done) reset(); }} placeholder={EXAMPLES[0]}
          onKeyDown={(e) => { if (e.key === "Enter" && !busy) getPlan(); }} aria-label="Describe the automation"
          className="flex-1 rounded-md border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <button type="button" onClick={getPlan} disabled={busy !== null}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground h-10 px-4 text-sm font-medium disabled:opacity-60">
          {busy === "plan" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Zap className="h-4 w-4" aria-hidden="true" />}
          {busy === "plan" ? "Planning…" : "Show me the steps"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" onClick={() => { setText(ex); reset(); }}
            className="rounded-full border px-3 h-7 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">{ex}</button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm flex items-start gap-2" role="alert">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <div>{error.text}</div>
            {error.problems && error.problems.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">{error.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
            {note && <p className="mt-1 text-xs text-muted-foreground italic">{note}</p>}
          </div>
        </div>
      )}

      {plan && (
        <div className="rounded-xl border p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-sm">{plan.name}</div>
            <span className="text-xs rounded-full border px-2 py-0.5">{plan.trigger === "schedule" ? "Runs every day" : "Runs when you press Run"}</span>
          </div>
          <ol className="list-decimal pl-5 text-sm space-y-1">
            {plan.describe.map((d, i) => (
              <li key={i}>{d} <code className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-[11px]">{plan.steps[i]}</code></li>
            ))}
          </ol>
          {note && <p className="text-xs text-muted-foreground italic">{note}</p>}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" onClick={() => create(false)} disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground h-9 px-4 text-sm font-medium disabled:opacity-60">
              {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />} Create paused
            </button>
            <button type="button" onClick={() => create(true)} disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-lg border h-9 px-4 text-sm font-medium hover:bg-accent disabled:opacity-60">
              Create & activate
            </button>
            <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg h-9 px-3 text-sm text-muted-foreground hover:text-foreground">
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Change it
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Paused is the safe default: press Run once, read the log, then resume it. Any <code>propose</code> step still goes through your Approvals rules.</p>
        </div>
      )}

      {done && (
        <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm flex items-center gap-2" role="status">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
          Created <span className="font-medium">{done.name}</span>{done.active ? " — active; it will run on the next nightly schedule or when you press Run." : " — paused; press Run to try it, then Resume."}
        </div>
      )}
    </Card>
  );
}
