"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { mdToHtml } from "@/lib/utils";

export function NpsTracker() {
  const [promoters, setPromoters] = useState(120);
  const [passives, setPassives] = useState(60);
  const [detractors, setDetractors] = useState(30);
  const [themes, setThemes] = useState("Slow response times; pricing feels high for smaller plans; onboarding is confusing");
  const [out, setOut] = useState(""); const [loading, setLoading] = useState(false);

  const m = useMemo(() => {
    const total = promoters + passives + detractors;
    const pPct = total ? (promoters / total) * 100 : 0;
    const dPct = total ? (detractors / total) * 100 : 0;
    const nps = Math.round(pPct - dPct);
    const band = nps >= 50 ? "Excellent" : nps >= 30 ? "Good" : nps >= 0 ? "Needs work" : "Critical";
    const tone = nps >= 50 ? "text-success" : nps >= 30 ? "text-success" : nps >= 0 ? "text-warning" : "text-danger";
    return { total, pPct, dPct, passivePct: total ? (passives / total) * 100 : 0, nps, band, tone };
  }, [promoters, passives, detractors]);

  async function analyse() {
    setLoading(true); setOut("");
    const input = `NPS survey: ${promoters} promoters, ${passives} passives, ${detractors} detractors from ${m.total} responses → NPS ${m.nps} (${m.band}). Recurring feedback themes: ${themes}. Give me a prioritised plan to raise NPS, what to fix first, and how to convert passives into promoters.`;
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "strategy", input }) });
      const j = await r.json(); setOut(j.text || "No response.");
    } catch { setOut("Network error reaching the AI."); } finally { setLoading(false); }
  }

  const F = (label: string, value: number, set: (n: number) => void, color: string) => (
    <label className="block">
      <span className="text-sm text-muted-foreground flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${color}`} />{label}</span>
      <input type="number" value={value} onChange={(e) => set(Number(e.target.value))}
        className="mt-1 w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring" />
    </label>
  );

  return (
    <Card className="p-5 space-y-5">
      <div>
        <div className="font-semibold">Net Promoter Score</div>
        <div className="text-sm text-muted-foreground">"How likely are you to recommend us?" — 9–10 promoters, 7–8 passives, 0–6 detractors.</div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        {F("Promoters (9–10)", promoters, setPromoters, "bg-success")}
        {F("Passives (7–8)", passives, setPassives, "bg-warning")}
        {F("Detractors (0–6)", detractors, setDetractors, "bg-danger")}
      </div>

      <div className="rounded-lg border p-4 text-center">
        <div className="text-sm text-muted-foreground">Net Promoter Score</div>
        <div className={`text-4xl font-extrabold tabular-nums ${m.tone}`}>{m.nps}</div>
        <div className={`text-sm font-medium ${m.tone}`}>{m.band}</div>
        <div className="text-xs text-muted-foreground mt-1">{m.total} responses</div>
      </div>

      {m.total > 0 && (
        <div>
          <div className="flex h-3 rounded-full overflow-hidden">
            <div className="bg-success" style={{ width: `${m.pPct}%` }} title={`Promoters ${m.pPct.toFixed(0)}%`} />
            <div className="bg-warning" style={{ width: `${m.passivePct}%` }} title={`Passives ${m.passivePct.toFixed(0)}%`} />
            <div className="bg-danger" style={{ width: `${m.dPct}%` }} title={`Detractors ${m.dPct.toFixed(0)}%`} />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
            <span>{m.pPct.toFixed(0)}% promoters</span>
            <span>{m.passivePct.toFixed(0)}% passive</span>
            <span>{m.dPct.toFixed(0)}% detractors</span>
          </div>
        </div>
      )}

      <label className="block">
        <span className="text-sm text-muted-foreground">Recurring feedback themes</span>
        <textarea value={themes} onChange={(e) => setThemes(e.target.value)} rows={2}
          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y" />
      </label>

      <p className="text-xs text-muted-foreground">Rough guide: above 50 is excellent, 30–50 good, 0–30 needs work, below 0 means more detractors than promoters.</p>

      <Button onClick={analyse} disabled={loading}><Sparkles className="h-4 w-4" /> {loading ? "Analysing…" : "How do I raise this? (ask the AI COO)"}</Button>
      {out && <div className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(out) }} />}
    </Card>
  );
}
