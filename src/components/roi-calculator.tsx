"use client";
import { useState } from "react";
export function RoiCalculator() {
  const [rev, setRev] = useState(2);   // ₹ crore/yr
  const [hrs, setHrs] = useState(12);  // hrs/week manual reporting
  const hoursSaved = Math.round(hrs * 0.45 * 52);
  const decisionValue = Math.round(rev * 100 * 0.03); // ~3% of revenue in lakh, better decisions
  return (
    <div className="rounded-2xl border bg-card p-6 max-w-2xl mx-auto">
      <h3 className="font-semibold text-lg">What could an AI COO save you?</h3>
      <div className="grid sm:grid-cols-2 gap-5 mt-4">
        <label className="text-sm">Annual revenue: <b>₹{rev} Cr</b>
          <input type="range" min={1} max={100} value={rev} onChange={(e) => setRev(+e.target.value)} className="w-full accent-[hsl(var(--primary))] mt-1" />
        </label>
        <label className="text-sm">Hours/week on manual reports: <b>{hrs}</b>
          <input type="range" min={2} max={40} value={hrs} onChange={(e) => setHrs(+e.target.value)} className="w-full accent-[hsl(var(--primary))] mt-1" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-5">
        <div className="rounded-xl bg-primary/5 border border-primary/20 p-4"><div className="text-2xl font-bold text-primary">{hoursSaved} hrs/yr</div><div className="text-xs text-muted-foreground">time saved on manual reporting</div></div>
        <div className="rounded-xl bg-success/5 border border-success/20 p-4"><div className="text-2xl font-bold text-success">≈ ₹{decisionValue} L</div><div className="text-xs text-muted-foreground">est. annual upside from faster, better decisions</div></div>
      </div>
      <p className="text-xs text-muted-foreground mt-3">Illustrative estimate. Your mileage varies with how much you let the AI execute.</p>
    </div>
  );
}
