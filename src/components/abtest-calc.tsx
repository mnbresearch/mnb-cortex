"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";

// Normal CDF approximation for the two-sided p-value.
function normCdf(z: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p;
}

export function AbTestCalc() {
  const [aV, setAV] = useState(4000);
  const [aC, setAC] = useState(240);
  const [bV, setBV] = useState(4000);
  const [bC, setBC] = useState(300);

  const m = useMemo(() => {
    const pa = aV > 0 ? aC / aV : 0;
    const pb = bV > 0 ? bC / bV : 0;
    const uplift = pa > 0 ? (pb - pa) / pa * 100 : 0;
    const pPool = (aC + bC) / (aV + bV);
    const se = Math.sqrt(pPool * (1 - pPool) * (1 / aV + 1 / bV));
    const z = se > 0 ? (pb - pa) / se : 0;
    const pValue = 2 * (1 - normCdf(Math.abs(z)));
    const confidence = (1 - pValue) * 100;
    const significant = pValue < 0.05;
    return { pa, pb, uplift, z, pValue, confidence, significant };
  }, [aV, aC, bV, bC]);

  const F = (label: string, value: number, set: (n: number) => void) => (
    <label className="block"><span className="text-sm text-muted-foreground">{label}</span>
      <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="mt-1 w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
  );

  const winner = m.pb > m.pa ? "B" : m.pb < m.pa ? "A" : "—";
  return (
    <Card className="p-5 space-y-5">
      <div><div className="font-semibold">A/B test significance</div><div className="text-sm text-muted-foreground">Two-proportion z-test — is the difference real or noise?</div></div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-lg border p-4 space-y-3"><div className="font-medium text-sm">Variant A (control)</div>{F("Visitors", aV, setAV)}{F("Conversions", aC, setAC)}<div className="text-sm text-muted-foreground">Rate: <b className="text-foreground">{(m.pa * 100).toFixed(2)}%</b></div></div>
        <div className="rounded-lg border p-4 space-y-3"><div className="font-medium text-sm">Variant B (test)</div>{F("Visitors", bV, setBV)}{F("Conversions", bC, setBC)}<div className="text-sm text-muted-foreground">Rate: <b className="text-foreground">{(m.pb * 100).toFixed(2)}%</b></div></div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Uplift (B vs A)" value={`${m.uplift >= 0 ? "+" : ""}${m.uplift.toFixed(1)}%`} cls={m.uplift >= 0 ? "text-success" : "text-danger"} />
        <Stat label="Confidence" value={`${m.confidence.toFixed(1)}%`} cls={m.significant ? "text-success" : "text-warning"} />
        <Stat label="p-value" value={m.pValue.toFixed(3)} />
        <Stat label="Winner" value={winner} />
      </div>

      <div className={`rounded-lg border p-4 text-sm ${m.significant ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5"}`}>
        {m.significant
          ? <span className="text-success"><b>Statistically significant.</b> Variant {winner} wins at {m.confidence.toFixed(0)}% confidence — you can act on this result.</span>
          : <span className="text-warning"><b>Not yet significant.</b> The difference could be noise ({m.confidence.toFixed(0)}% confidence). Keep the test running or gather more data before deciding.</span>}
      </div>
      <p className="text-xs text-muted-foreground">Aim for 95%+ confidence before calling a winner. Small samples produce big swings that don't hold up.</p>
    </Card>
  );
}

function Stat({ label, value, cls = "" }: { label: string; value: string; cls?: string }) {
  return <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
