"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp, TrendingDown, RotateCcw } from "lucide-react";
import { inr, mdToHtml } from "@/lib/utils";

/**
 * The baseline comes from the WORKSPACE, not from constants.
 *
 * The comment here used to read "Baseline drawn from the live business
 * snapshot" above four hardcoded numbers — ₹4.25 Cr revenue, 12% margin,
 * ₹1.89 Cr reserve — read from nothing. That comment was the worst part: it
 * told the next reader the wiring existed, so nobody checked. Every customer
 * moved sliders against the same fictional business, and the page is sold as
 * "interactive what-ifs".
 *
 * The fallbacks below are only used when the workspace has no figures at all,
 * and in that case the UI says so instead of presenting them as the customer's.
 */
export type ScenarioBaseline = {
  revenue: number | null;   // monthly
  margin: number | null;    // 0..1
  cash: number | null;
};

const COST_PER_HIRE = 60_000; // fully-loaded monthly

function Slider({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{value > 0 && unit === "%" ? "+" : ""}{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[hsl(var(--primary))]" />
    </div>
  );
}

export function ScenarioPlanner({ baseline }: { baseline?: ScenarioBaseline } = {}) {
  /*
    `real` drives the banner. Without it a workspace with no data silently
    models zero, which reads as "your business makes nothing" rather than
    "we do not know yet".
  */
  const real = Boolean(baseline && baseline.revenue !== null);
  const BASE_REVENUE = baseline?.revenue ?? 0;
  const BASE_MARGIN = baseline?.margin ?? 0.12;
  const BASE_COSTS = BASE_REVENUE * (1 - BASE_MARGIN);
  /*
    Cash is tracked as "do we know it" separately from its value. `?? 0` alone
    made an unknown reserve indistinguishable from an empty bank account, and
    the runway card then divided by it and printed "0.0 mo" in red — asserting
    the business is out of cash when Cortex simply has not been told.
  */
  const cashKnown = typeof baseline?.cash === "number";
  const CASH_RESERVE = baseline?.cash ?? 0;
  const [g, setG] = useState(5);     // revenue growth %/mo
  const [p, setP] = useState(0);     // price change %
  const [c, setC] = useState(3);     // cost inflation %
  const [h, setH] = useState(0);     // new hires
  const [out, setOut] = useState("");
  const [loading, setLoading] = useState(false);

  const m = useMemo(() => {
    const revenue = BASE_REVENUE * (1 + g / 100) * (1 + p / 100);
    const costs = BASE_COSTS * (1 + c / 100) + h * COST_PER_HIRE;
    const profit = revenue - costs;
    const margin = revenue > 0 ? profit / revenue : 0;
    const dProfit = profit - BASE_REVENUE * BASE_MARGIN;
    /*
      Infinity means "profitable, so it does not run out". null means "we
      cannot say". They are different answers and used to be the same one:
      with no figures at all, revenue and costs were both 0, profit was 0,
      `profit >= 0` held, and the card rendered a green "Cash-positive" for a
      workspace that had never told us a single number. Missing data came out
      the other end as good news, on the page an owner opens to find out
      whether they are about to run out of money.
    */
    const runwayMonths: number | null =
      !real ? null : profit >= 0 ? Infinity : cashKnown ? CASH_RESERVE / -profit : null;
    // 6-month revenue trajectory for the sparkline
    const traj = Array.from({ length: 6 }, (_, i) => BASE_REVENUE * Math.pow(1 + g / 100, i) * (1 + p / 100));
    return { revenue, costs, profit, margin, dProfit, runwayMonths, traj };
    /* baseline-derived values belong in the deps too — they were missing, so a
       workspace whose figures arrived after first paint kept the old model. */
  }, [g, p, c, h, real, cashKnown, BASE_REVENUE, BASE_MARGIN, BASE_COSTS, CASH_RESERVE]);

  function reset() { setG(5); setP(0); setC(3); setH(0); setOut(""); }

  async function stressTest() {
    setLoading(true); setOut("");
    /* `.toFixed()` on a null runway would throw; "cash-positive" for an unknown
       one would lie to the model as well as to the reader. */
    const runwayPhrase =
      m.runwayMonths === null
        ? "runway not calculable (cash balance unknown)"
        : m.runwayMonths === Infinity
          ? "cash-positive, so no runway limit at this rate"
          : `runway ${m.runwayMonths.toFixed(1)} months`;
    const input = `Scenario the owner is considering (monthly): revenue growth ${g}%/mo, price change ${p}%, cost inflation ${c}%, ${h} new hires at ~₹${COST_PER_HIRE.toLocaleString("en-IN")}/mo each. Model output: projected monthly revenue ${inr(m.revenue)}, costs ${inr(m.costs)}, net profit ${inr(m.profit)} (margin ${(m.margin * 100).toFixed(1)}%), profit change vs today ${inr(m.dProfit)}, ${runwayPhrase}. Stress-test this decision.`;
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "scenario", input }) });
      const j = await r.json(); setOut(j.text || "No response.");
    } catch { setOut("Network error reaching the AI."); }
    finally { setLoading(false); }
  }

  const max = Math.max(...m.traj), min = Math.min(...m.traj);
  const pts = m.traj.map((v, i) => `${(i / 5) * 100},${40 - ((v - min) / (max - min || 1)) * 36 - 2}`).join(" ");
  const marginUp = m.margin >= BASE_MARGIN;

  return (
    <>
    {real ? (
      <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground mb-3">
        Baseline: <b>{inr(BASE_REVENUE)}</b> monthly revenue at <b>{Math.round(BASE_MARGIN * 100)}%</b> net,
        from your own figures. Move the sliders to model against it.
      </div>
    ) : (
      <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground mb-3">
        Cortex doesn&rsquo;t have your revenue yet, so there is nothing to model against. Import your
        sales or upload a bank statement and this page will run scenarios on your real baseline.
      </div>
    )}
    <Card className="p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> What-if scenario planner</div>
          <div className="text-sm text-muted-foreground">Drag the levers — the model recalculates instantly, then let the Cortex stress-test it.</div>
        </div>
        <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="h-4 w-4" /> Reset</Button>
      </div>

      <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
        <Slider label="Revenue growth" value={g} min={-20} max={30} step={1} unit="%/mo" onChange={setG} />
        <Slider label="Price change" value={p} min={-15} max={20} step={1} unit="%" onChange={setP} />
        <Slider label="Cost inflation" value={c} min={-10} max={25} step={1} unit="%" onChange={setC} />
        <Slider label="New hires" value={h} min={0} max={20} step={1} unit="" onChange={setH} />
      </div>

      {/*
        With no baseline every one of these is arithmetic on zero, so they are
        shown as unknown rather than as results. The sliders still move and the
        model still runs — there is just nothing truthful to display yet.
      */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Monthly revenue" value={real ? inr(m.revenue) : "—"} />
        <Metric label="Net profit" value={real ? inr(m.profit) : "—"} tone={real ? (m.profit >= 0 ? "up" : "down") : "flat"} />
        <Metric label="Net margin" value={real ? `${(m.margin * 100).toFixed(1)}%` : "—"} tone={real ? (marginUp ? "up" : "down") : "flat"} />
        <Metric
          label="Cash runway"
          value={m.runwayMonths === null ? "—" : m.runwayMonths === Infinity ? "Cash-positive" : `${m.runwayMonths.toFixed(1)} mo`}
          tone={m.runwayMonths === null ? "flat" : m.runwayMonths === Infinity ? "up" : m.runwayMonths < 4 ? "down" : "flat"}
        />
      </div>
      {real && !cashKnown && (
        <p className="text-xs text-muted-foreground -mt-2">
          Runway needs your cash balance — Cortex doesn&rsquo;t have it yet, so it isn&rsquo;t estimating one.
        </p>
      )}

      {real && (
        <div className="rounded-lg border p-4 bg-background/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">6-month revenue trajectory</span>
            <Badge className={m.dProfit >= 0 ? "bg-success/10 text-success border-success/20" : "bg-danger/10 text-danger border-danger/20"}>
              {m.dProfit >= 0 ? "+" : ""}{inr(m.dProfit)} profit vs today
            </Badge>
          </div>
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-16">
            <polyline points={pts} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      )}

      {/* Nothing to stress-test without a baseline, and a credit should not be
          spent finding that out. */}
      <Button onClick={stressTest} disabled={loading || !real} title={real ? undefined : "Import your sales or a bank statement first"}>
        <Sparkles className="h-4 w-4" /> {loading ? "Stress-testing…" : "Stress-test this with Cortex"}
      </Button>
      {out && <div className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(out) }} />}
    </Card>
    </>
  );
}

function Metric({ label, value, tone = "flat" }: { label: string; value: string; tone?: "up" | "down" | "flat" }) {
  const Icon = tone === "up" ? TrendingUp : tone === "down" ? TrendingDown : null;
  const color = tone === "up" ? "text-success" : tone === "down" ? "text-danger" : "text-foreground";
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold tabular-nums flex items-center gap-1 ${color}`}>
        {Icon && <Icon className="h-4 w-4" />}{value}
      </div>
    </div>
  );
}
