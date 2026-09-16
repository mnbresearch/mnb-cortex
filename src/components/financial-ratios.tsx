"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { inr, mdToHtml } from "@/lib/utils";
import { ExampleFigures } from "@/components/example-figures";
import { computeRatios, ratioRows, type Grade, type RatioRow } from "@/lib/ratios";

export function FinancialRatios() {
  const [v, setV] = useState({
    currentAssets: 18900000, currentLiabilities: 9000000, inventory: 5200000,
    debt: 12000000, equity: 26000000, ebit: 6600000, interest: 1400000,
    revenue: 51000000, totalAssets: 42000000, netProfit: 5100000,
  });
  const [out, setOut] = useState(""); const [loading, setLoading] = useState(false);

  /*
    The arithmetic and the grading thresholds live in lib/ratios.ts, which is
    pure and therefore testable — see scripts/test-ratios.mjs, which pins the
    negative-equity case that used to render green. This component decides how
    the result looks, not what it means.
  */
  const r = useMemo(() => computeRatios(v), [v]);
  const rows = useMemo(() => ratioRows(r), [r]);

  const GROUPS: Array<RatioRow["group"]> = ["Liquidity", "Leverage", "Efficiency & returns"];

  const gradeClass: Record<Grade, string> = {
    good: "text-success", warn: "text-warning", bad: "text-danger", na: "text-muted-foreground",
  };

  async function analyse() {
    setLoading(true); setOut("");
    /*
      Only send what was computable. These are `number | null` now, so the old
      unconditional .toFixed() would throw on any uncomputed ratio — and before
      that, it was shipping "-12.00" to the model as a debt/equity reading and
      asking it to assess a business off the back of it.

      Negative equity is stated in words instead, because that is the fact; a
      ratio derived from it would just launder it back into a number.
    */
    const parts: string[] = [];
    const add = (label: string, val: number | null, unit = "", dp = 2) => {
      if (val !== null) parts.push(`${label} ${val.toFixed(dp)}${unit}`);
    };
    add("current", r.current); add("quick", r.quick);
    add("debt/equity", r.de);
    add("interest coverage", r.coverage, "x", 1);
    add("asset turnover", r.assetTurn, "x", 1);
    add("net margin", r.netMargin, "%", 1);
    add("ROE", r.roe, "%", 1);
    add("ROA", r.roa, "%", 1);

    const caveats: string[] = [];
    if (!r.equityOk) {
      caveats.push(
        `Equity is ${v.equity < 0 ? `negative (${inr(v.equity)})` : "zero"}, so debt/equity and ROE are not meaningful and have been omitted deliberately — do not infer them or treat their absence as neutral. Address the negative net worth directly.`,
      );
    }
    if (parts.length === 0) caveats.push("No ratio could be computed from the figures entered.");

    const input = `Financial ratios: ${parts.join(", ") || "none computable"}.${caveats.length ? " " + caveats.join(" ") : ""} Assess this company's financial health vs Indian SME norms — what's strong, what's a concern, and the 3 priorities to fix. Do not invent any ratio that was not supplied.`;
    try { const res = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "strategy", input }) }); const j = await res.json(); setOut(j.text || "No response."); }
    catch { setOut("Network error reaching the AI."); } finally { setLoading(false); }
  }

  const F = (label: string, key: keyof typeof v) => (
    <label className="block"><span className="text-xs text-muted-foreground">{label}</span>
      <input type="number" value={v[key]} onChange={(e) => setV({ ...v, [key]: Number(e.target.value) })} className="mt-1 w-full rounded-md border bg-background px-2 h-9 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
  );

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <ExampleFigures what="balance-sheet figures" />
      <Card className="p-5 space-y-3">
        <div className="font-semibold">Inputs (₹)</div>
        <div className="grid grid-cols-2 gap-2">
          {F("Current assets", "currentAssets")}{F("Current liabilities", "currentLiabilities")}
          {F("Inventory", "inventory")}{F("Total debt", "debt")}
          {F("Equity", "equity")}{F("EBIT", "ebit")}
          {F("Interest expense", "interest")}{F("Revenue", "revenue")}
          {F("Total assets", "totalAssets")}{F("Net profit", "netProfit")}
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        {/*
          Stated, not graded. When equity is negative this is the finding — the
          leverage and return rows above it are blank precisely because there is
          nothing meaningful to say about returns on a negative base.
        */}
        {!r.equityOk && (
          <div role="status" className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm">
            <b className="text-danger">Equity is {v.equity < 0 ? "negative" : "zero"}.</b>{" "}
            {v.equity < 0
              ? "Liabilities exceed assets — a negative net worth. "
              : "There is no equity base to measure against. "}
            Leverage and return ratios cannot be graded in this state, so they read “—” rather than
            a number. This is worth taking to your CA rather than reading off a dashboard.
          </div>
        )}
        {GROUPS.map((g) => (
          <div key={g}>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{g}</div>
            <div className="space-y-1.5">
              {rows.filter((it) => it.group === g).map((it) => (
                <div key={it.key} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{it.label} <span className="text-xs">· {it.hint}</span></span>
                  <span className={`font-semibold tabular-nums ${gradeClass[it.grade]}`}>{it.val}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <Button onClick={analyse} disabled={loading} className="w-full"><Sparkles className="h-4 w-4" /> {loading ? "Analysing…" : "Assess financial health (AI)"}</Button>
        {out && <div className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(out) }} />}
      </Card>
    </div>
  );
}
