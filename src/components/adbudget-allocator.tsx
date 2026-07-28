"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { inr } from "@/lib/utils";

type Ch = { id: string; name: string; spend: number; revenue: number; conversions: number };

const SEED: Ch[] = [
  { id: "c1", name: "Google Ads", spend: 200000, revenue: 900000, conversions: 300 },
  { id: "c2", name: "Meta Ads", spend: 150000, revenue: 450000, conversions: 250 },
  { id: "c3", name: "WhatsApp / referral", spend: 40000, revenue: 320000, conversions: 120 },
  { id: "c4", name: "Influencer", spend: 90000, revenue: 180000, conversions: 60 },
];

export function AdBudgetAllocator() {
  const [chs, setChs] = useState<Ch[]>(SEED);

  const m = useMemo(() => {
    const rows = chs.map((c) => ({ ...c, roas: c.spend ? c.revenue / c.spend : 0, cac: c.conversions ? c.spend / c.conversions : 0 }));
    const spend = rows.reduce((s, r) => s + r.spend, 0);
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);
    const conv = rows.reduce((s, r) => s + r.conversions, 0);
    const blendedRoas = spend ? revenue / spend : 0;
    const blendedCac = conv ? spend / conv : 0;
    const best = [...rows].sort((a, b) => b.roas - a.roas)[0];
    const worst = [...rows].sort((a, b) => a.roas - b.roas)[0];
    return { rows, spend, revenue, blendedRoas, blendedCac, best, worst };
  }, [chs]);

  function upd(id: string, k: keyof Ch, v: string) { setChs((xs) => xs.map((c) => c.id === id ? { ...c, [k]: k === "name" ? v : Number(v) } : c)); }
  function add() { setChs((xs) => [...xs, { id: "c" + Date.now(), name: "New channel", spend: 50000, revenue: 100000, conversions: 50 }]); }
  function del(id: string) { setChs((xs) => xs.filter((c) => c.id !== id)); }
  const I = "rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Total spend" value={inr(m.spend)} />
        <Stat label="Attributed revenue" value={inr(m.revenue)} />
        <Stat label="Blended ROAS" value={`${m.blendedRoas.toFixed(2)}×`} cls={m.blendedRoas >= 3 ? "text-success" : m.blendedRoas >= 1 ? "text-warning" : "text-danger"} highlight />
        <Stat label="Blended CAC" value={inr(m.blendedCac)} />
      </div>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Channels</div>
          <Button size="sm" variant="outline" onClick={add}><Plus className="h-4 w-4" /> Add channel</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b"><th className="py-2 pr-2 font-medium">Channel</th><th className="py-2 pr-2 font-medium">Spend</th><th className="py-2 pr-2 font-medium">Revenue</th><th className="py-2 pr-2 font-medium">Conv.</th><th className="py-2 pr-2 font-medium">ROAS</th><th className="py-2 pr-2 font-medium">CAC</th><th className="py-2 font-medium"></th></tr></thead>
            <tbody>
              {m.rows.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-2"><input className={I + " w-36"} value={c.name} onChange={(e) => upd(c.id, "name", e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className={I + " w-24"} type="number" value={c.spend} onChange={(e) => upd(c.id, "spend", e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className={I + " w-24"} type="number" value={c.revenue} onChange={(e) => upd(c.id, "revenue", e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className={I + " w-16"} type="number" value={c.conversions} onChange={(e) => upd(c.id, "conversions", e.target.value)} /></td>
                  <td className={`py-1.5 pr-2 font-medium tabular-nums ${c.roas >= 3 ? "text-success" : c.roas < 1 ? "text-danger" : ""}`}>{c.roas.toFixed(2)}×</td>
                  <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">{inr(c.cac)}</td>
                  <td className="py-1.5"><button onClick={() => del(c.id)} className="text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {m.best && m.worst && m.best.id !== m.worst.id && (
        <Card className="p-5 text-sm">
          <span className="text-muted-foreground">Reallocation hint: </span>
          <b className="text-success">{m.best.name}</b> returns {m.best.roas.toFixed(1)}× vs <b className="text-danger">{m.worst.name}</b> at {m.worst.roas.toFixed(1)}×.
          <span className="text-muted-foreground"> Shifting budget from your weakest channel to your strongest lifts blended ROAS without spending a rupee more — test in small steps so you don't saturate the winner.</span>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
