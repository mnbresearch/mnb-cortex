"use client";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { ArrowLeftRight } from "lucide-react";

// Indicative rates per 1 unit → INR. Editable; update to today's rates when needed.
const DEFAULT_RATES: Record<string, number> = { INR: 1, USD: 83.3, EUR: 90.1, GBP: 105.6, AED: 22.7, SGD: 61.8, AUD: 55.2, CAD: 61.0, JPY: 0.56 };

export function CurrencyConverter() {
  const [rates, setRates] = useState(DEFAULT_RATES);
  const [amount, setAmount] = useState(1000);
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("INR");

  useEffect(() => { try { const s = localStorage.getItem("cortex_fx"); if (s) setRates({ ...DEFAULT_RATES, ...JSON.parse(s) }); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem("cortex_fx", JSON.stringify(rates)); } catch {} }, [rates]);

  const result = useMemo(() => {
    const inr = amount * (rates[from] || 1);
    return inr / (rates[to] || 1);
  }, [amount, from, to, rates]);

  const codes = Object.keys(rates);
  const S = "rounded-lg border bg-background px-3 h-11 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="grid sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Amount</div>
            <div className="flex gap-2">
              <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className={S + " flex-1"} />
              <select value={from} onChange={(e) => setFrom(e.target.value)} className={S}>{codes.map((c) => <option key={c}>{c}</option>)}</select>
            </div>
          </div>
          <button onClick={() => { setFrom(to); setTo(from); }} className="h-11 w-11 rounded-lg border grid place-items-center hover:bg-accent self-end"><ArrowLeftRight className="h-4 w-4" /></button>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Converts to</div>
            <div className="flex gap-2">
              <div className={S + " flex-1 flex items-center font-semibold"}>{result.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
              <select value={to} onChange={(e) => setTo(e.target.value)} className={S}>{codes.map((c) => <option key={c}>{c}</option>)}</select>
            </div>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">1 {from} = {(rates[from] / rates[to]).toFixed(4)} {to}</div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="font-semibold text-sm">Rates (per 1 unit → INR)</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {codes.filter((c) => c !== "INR").map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm"><span className="w-10 text-muted-foreground">{c}</span>
              <input type="number" value={rates[c]} onChange={(e) => setRates({ ...rates, [c]: Number(e.target.value) })} className="flex-1 rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Rates are indicative and editable — update them to today's before invoicing. Saved to this device.</p>
      </Card>
    </div>
  );
}
