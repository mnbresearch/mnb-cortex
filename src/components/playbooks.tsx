"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, ArrowLeft } from "lucide-react";
import { mdToHtml } from "@/lib/utils";
import { saveArtifact } from "@/lib/actions";
import { Save } from "lucide-react";

type Play = { id: string; title: string; desc: string; mode: string; prompt: string };

const PLAYS: Play[] = [
  { id: "turnaround", title: "90-day turnaround plan", desc: "Stabilise cash, margin and operations fast", mode: "strategy", prompt: "Build a 90-day turnaround plan for this business. Week-by-week priorities to stabilise cash, rebuild margin, and fix the biggest operational risk. Include KPIs." },
  { id: "cut15", title: "Cut costs 15%", desc: "Find savings without hurting growth", mode: "costs", prompt: "Give me a concrete plan to cut total costs by 15% within one quarter without damaging revenue or team morale. Rank by rupee impact." },
  { id: "double", title: "Double sales in 12 months", desc: "A realistic growth roadmap", mode: "strategy", prompt: "Build a realistic roadmap to double revenue in 12 months. Cover pricing, new segments, channels, retention and the sales-capacity needed." },
  { id: "cash30", title: "Free up 30 days of cash", desc: "Working-capital release plan", mode: "forecast", prompt: "Give me a plan to free up 30 days of cash from working capital — receivables, inventory and payables — with the rupee impact of each move." },
  { id: "fundraise", title: "Prepare to raise capital", desc: "Get investor-ready", mode: "investor", prompt: "What do I need to do over the next 90 days to be ready to raise growth capital? Metrics to hit, story to tell, documents to prepare, and red flags to fix." },
  { id: "premium", title: "Move upmarket / premiumise", desc: "Raise prices and perceived value", mode: "pricing", prompt: "Build a plan to move this business upmarket — raise prices and perceived value without losing the core customer base. Include the sequencing." },
  { id: "retention", title: "Fix customer retention", desc: "Stop the leaky bucket", mode: "strategy", prompt: "Build a customer-retention plan: why customers churn, the fastest fixes, and how to turn passives into promoters. Tie it to revenue saved." },
  { id: "resilience", title: "Recession-proof the business", desc: "Reduce fragility", mode: "risk", prompt: "How do I make this business more resilient to a downturn? Reduce fixed costs, diversify revenue and customers, protect cash. Give a prioritised plan." },
];

async function run(p: Play): Promise<string> {
  const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: p.mode, input: p.prompt }) });
  const j = await r.json(); return j.text || "No response.";
}

export function Playbooks() {
  const [active, setActive] = useState<Play | null>(null);
  const [out, setOut] = useState(""); const [loading, setLoading] = useState(false);

  async function open(p: Play) {
    setActive(p); setOut(""); setLoading(true);
    try { setOut(await run(p)); } catch { setOut("Network error reaching the AI."); } finally { setLoading(false); }
  }

  if (active) {
    return (
      <Card className="p-5 space-y-3">
        <button onClick={() => setActive(null)} className="text-sm text-primary inline-flex items-center gap-1"><ArrowLeft className="h-4 w-4" /> All playbooks</button>
        <div className="font-semibold text-lg">{active.title}</div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> The AI COO is writing your playbook…</div>
        ) : (
          <>
            <div className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(out) }} />
            {out && (
              <form action={saveArtifact} className="flex flex-wrap items-center gap-2 pt-1">
                <input type="hidden" name="mode" value="strategy" />
                <input type="hidden" name="content" value={out} />
                <input name="title" defaultValue={active.title} className="rounded-lg border bg-background px-3 h-9 text-sm flex-1 min-w-[200px] outline-none focus:ring-2 focus:ring-ring" />
                <Button type="submit" variant="outline"><Save className="h-4 w-4" /> Save to workspace</Button>
                <Button type="button" onClick={() => open(active)}><Sparkles className="h-4 w-4" /> Regenerate</Button>
              </form>
            )}
          </>
        )}
      </Card>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {PLAYS.map((p) => (
        <Card key={p.id} className="p-4 hover-lift cursor-pointer" onClick={() => open(p)}>
          <div className="h-10 w-10 rounded-xl brand-gradient grid place-items-center text-white"><Sparkles className="h-5 w-5" /></div>
          <div className="font-medium text-sm mt-2">{p.title}</div>
          <div className="text-sm text-muted-foreground">{p.desc}</div>
          <div className="text-xs text-primary mt-2">Generate →</div>
        </Card>
      ))}
    </div>
  );
}
