"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { mdToHtml } from "@/lib/utils";

export function FinancialRatios() {
  const [v, setV] = useState({
    currentAssets: 18900000, currentLiabilities: 9000000, inventory: 5200000,
    debt: 12000000, equity: 26000000, ebit: 6600000, interest: 1400000,
    revenue: 51000000, totalAssets: 42000000, netProfit: 5100000,
  });
  const [out, setOut] = useState(""); const [loading, setLoading] = useState(false);

  const r = useMemo(() => {
    const s = (a: number, b: number) => b ? a / b : 0;
    return {
      current: s(v.currentAssets, v.currentLiabilities),
      quick: s(v.currentAssets - v.inventory, v.currentLiabilities),
      de: s(v.debt, v.equity),
      coverage: s(v.ebit, v.interest),
      assetTurn: s(v.revenue, v.totalAssets),
      netMargin: s(v.netProfit, v.revenue) * 100,
      roe: s(v.netProfit, v.equity) * 100,
      roa: s(v.netProfit, v.totalAssets) * 100,
    };
  }, [v]);

  const RATIOS = [
    { g: "Liquidity", items: [
      { k: "Current ratio", val: r.current.toFixed(2), good: r.current >= 1.5, warn: r.current >= 1, hint: "≥1.5 healthy" },
      { k: "Quick ratio", val: r.quick.toFixed(2), good: r.quick >= 1, warn: r.quick >= 0.8, hint: "≥1 healthy" },
    ]},
    { g: "Leverage", items: [
      { k: "Debt / equity", val: r.de.toFixed(2), good: r.de <= 1, warn: r.de <= 2, hint: "≤1 conservative" },
      { k: "Interest coverage", val: r.coverage.toFixed(1) + "x", good: r.coverage >= 3, warn: r.coverage >= 1.5, hint: "≥3x safe" },
    ]},
    { g: "Efficiency & returns", items: [
      { k: "Asset turnover", val: r.assetTurn.toFixed(2) + "x", good: r.assetTurn >= 1, warn: r.assetTurn >= 0.5, hint: "higher is better" },
      { k: "Net margin", val: r.netMargin.toFixed(1) + "%", good: r.netMargin >= 10, warn: r.netMargin >= 5, hint: "≥10% strong" },
      { k: "Return on equity", val: r.roe.toFixed(1) + "%", good: r.roe >= 15, warn: r.roe >= 8, hint: "≥15% strong" },
      { k: "Return on assets", val: r.roa.toFixed(1) + "%", good: r.roa >= 8, warn: r.roa >= 4, hint: "≥8% strong" },
    ]},
  ];

  async function analyse() {
    setLoading(true); setOut("");
    const input = `Financial ratios: current ${r.current.toFixed(2)}, quick ${r.quick.toFixed(2)}, debt/equity ${r.de.toFixed(2)}, interest coverage ${r.coverage.toFixed(1)}x, asset turnover ${r.assetTurn.toFixed(2)}x, net margin ${r.netMargin.toFixed(1)}%, ROE ${r.roe.toFixed(1)}%, ROA ${r.roa.toFixed(1)}%. Assess this company's financial health vs Indian SME norms — what's strong, what's a concern, and the 3 priorities to fix.`;
    try { const res = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "strategy", input }) }); const j = await res.json(); setOut(j.text || "No response."); }
    catch { setOut("Network error reaching the AI."); } finally { setLoading(false); }
  }

  const F = (label: string, key: keyof typeof v) => (
    <label className="block"><span className="text-xs text-muted-foreground">{label}</span>
      <input type="number" value={v[key]} onChange={(e) => setV({ ...v, [key]: Number(e.target.value) })} className="mt-1 w-full rounded-md border bg-background px-2 h-9 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
  );

  return (
    <div className="grid lg:grid-cols-2 gap-4">
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
        {RATIOS.map((grp) => (
          <div key={grp.g}>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{grp.g}</div>
            <div className="space-y-1.5">
              {grp.items.map((it) => (
                <div key={it.k} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{it.k} <span className="text-xs">· {it.hint}</span></span>
                  <span className={`font-semibold tabular-nums ${it.good ? "text-success" : it.warn ? "text-warning" : "text-danger"}`}>{it.val}</span>
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
