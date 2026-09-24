"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";
import { ExampleFigures } from "@/components/example-figures";
import { orDefault, seedSource, type WorkspaceSeed } from "@/lib/seed-types";

/*
  THE FIVE FIELDS ON THIS PAGE ALL EXIST IN THE WORKSPACE ALREADY.

  This calculator used to open on an invented ₹6 crore business and conclude
  "Roughly ₹52,05,479 is tied up in the cycle" — in the second person, with no
  label anywhere saying the figures were not the reader's. Meanwhile `invoices`
  held their real open receivables and payables and `inventory_items` held
  their real stock, one query away.

  The defaults are unchanged and still apply when nothing can be read. What is
  new is the fuel line, and a banner that says which of the two the reader is
  looking at.

  ONE APPROXIMATION, STATED ON SCREEN: the three balance fields are labelled
  "Avg" because a cash conversion cycle is properly computed on period
  averages. The workspace stores current open balances. For a business whose
  receivables are not wildly seasonal these are close, and they are enormously
  closer than a number invented in a text editor — but the banner says so
  rather than letting the reader assume an average was computed.
*/
export function CccCycle({ seed }: { seed?: WorkspaceSeed } = {}) {
  const [revenue, setRevenue] = useState(orDefault(seed?.revenue, 60_000_000));   // annual
  const [cogs, setCogs] = useState(orDefault(seed?.cogs, 42_000_000));            // annual
  const [inventory, setInventory] = useState(orDefault(seed?.inventoryValue, 4_000_000));
  const [receivables, setReceivables] = useState(orDefault(seed?.receivables, 6_500_000));
  const [payables, setPayables] = useState(orDefault(seed?.payables, 3_800_000));

  const source = seedSource(seed, "revenue", "cogs", "inventoryValue", "receivables", "payables");

  const m = useMemo(() => {
    const dio = cogs > 0 ? (inventory / cogs) * 365 : 0;         // days inventory outstanding
    const dso = revenue > 0 ? (receivables / revenue) * 365 : 0; // days sales outstanding
    const dpo = cogs > 0 ? (payables / cogs) * 365 : 0;          // days payables outstanding
    const ccc = dio + dso - dpo;
    const dailyCogs = cogs / 365;
    const cashTied = ccc * dailyCogs;                            // approx cash locked in the cycle
    return { dio, dso, dpo, ccc, cashTied };
  }, [revenue, cogs, inventory, receivables, payables]);

  const F = (label: string, value: number, set: (n: number) => void) => (
    <label className="block"><span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring"><span className="text-xs text-muted-foreground">₹</span>
        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" /></div></label>
  );

  const max = Math.max(m.dio, m.dso, m.dpo, 1);
  return (
    <div className="space-y-4">
      <ExampleFigures
        source={source}
        what="cycle figures"
        note="Stock, receivables and payables are your current open balances — a textbook cycle uses period averages, so treat these as a close starting point rather than an audited figure."
      />
      <Card className="p-5 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {F("Annual revenue", revenue, setRevenue)}
          {F("Annual COGS", cogs, setCogs)}
          {F("Avg inventory", inventory, setInventory)}
          {F("Avg receivables", receivables, setReceivables)}
          {F("Avg payables", payables, setPayables)}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="DIO — inventory days" value={`${m.dio.toFixed(0)}`} />
          <Stat label="DSO — collection days" value={`${m.dso.toFixed(0)}`} />
          <Stat label="DPO — payment days" value={`${m.dpo.toFixed(0)}`} />
          <Stat label="Cash conversion cycle" value={`${m.ccc.toFixed(0)} days`} cls={m.ccc <= 30 ? "text-success" : m.ccc <= 75 ? "text-warning" : "text-danger"} highlight />
        </div>
      </Card>

      <Card className="p-5">
        <div className="font-semibold mb-3">The cycle, in days</div>
        <div className="space-y-2 text-sm">
          {[["Inventory (DIO)", m.dio, "bg-warning"], ["+ Receivables (DSO)", m.dso, "bg-primary"], ["− Payables (DPO)", m.dpo, "bg-success"]].map(([label, val, color]) => (
            <div key={label as string} className="flex items-center gap-3">
              <span className="w-40 shrink-0 text-muted-foreground">{label as string}</span>
              <div className="flex-1 h-4 rounded bg-muted overflow-hidden"><div className={`h-full ${color as string}`} style={{ width: `${((val as number) / max) * 100}%` }} /></div>
              <span className="w-12 text-right tabular-nums">{(val as number).toFixed(0)}</span>
            </div>
          ))}
        </div>
        <p className="text-sm mt-4"><span className="text-muted-foreground">Roughly </span><b>{inr(m.cashTied)}</b><span className="text-muted-foreground"> is tied up in the cycle. Every day you cut off the CCC — faster collection, leaner stock, or longer supplier terms — frees about {inr(m.cashTied / Math.max(m.ccc, 1))}.</span></p>
      </Card>
    </div>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
