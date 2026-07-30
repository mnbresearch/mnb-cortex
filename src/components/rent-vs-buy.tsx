"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

export function RentVsBuy() {
  const [rent, setRent] = useState(60000);        // monthly rent
  const [price, setPrice] = useState(12_000_000); // property price
  const [down, setDown] = useState(2_400_000);    // down payment
  const [rate, setRate] = useState(9);            // loan rate
  const [tenure, setTenure] = useState(15);       // loan tenure yrs
  const [years, setYears] = useState(7);          // holding horizon
  const [appr, setAppr] = useState(6);            // appreciation %/yr
  const [rentHike, setRentHike] = useState(7);    // rent increase %/yr

  const m = useMemo(() => {
    // Rent path: sum of rent over horizon with annual hikes.
    let rentTotal = 0, r = rent;
    for (let y = 0; y < years; y++) { rentTotal += r * 12; r *= 1 + rentHike / 100; }

    // Buy path: EMI over horizon + down payment − equity/appreciation recovered on sale.
    const loan = Math.max(price - down, 0);
    const mr = rate / 100 / 12, n = tenure * 12;
    const emi = mr === 0 ? loan / n : loan * mr * Math.pow(1 + mr, n) / (Math.pow(1 + mr, n) - 1);
    const monthsHeld = years * 12;
    const emiPaid = emi * Math.min(monthsHeld, n);
    // Outstanding balance after horizon
    let bal = loan;
    for (let i = 0; i < Math.min(monthsHeld, n); i++) { bal = bal + bal * mr - emi; }
    bal = Math.max(bal, 0);
    const saleValue = price * Math.pow(1 + appr / 100, years);
    const equityAtSale = saleValue - bal; // what you walk away with
    const buyNetCost = down + emiPaid - equityAtSale;

    const better = buyNetCost <= rentTotal ? "Buy" : "Rent";
    return { rentTotal, emi, emiPaid, equityAtSale, buyNetCost, better, diff: Math.abs(rentTotal - buyNetCost), saleValue };
  }, [rent, price, down, rate, tenure, years, appr, rentHike]);

  const F = (label: string, value: number, set: (n: number) => void, prefix = "₹") => (
    <label className="block"><span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring"><span className="text-xs text-muted-foreground">{prefix}</span>
        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" /></div></label>
  );

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {F("Monthly rent", rent, setRent)}
          {F("Rent hike /yr", rentHike, setRentHike, "%")}
          {F("Property price", price, setPrice)}
          {F("Down payment", down, setDown)}
          {F("Loan rate", rate, setRate, "%")}
          {F("Loan tenure", tenure, setTenure, "yrs")}
          {F("How long you'll stay", years, setYears, "yrs")}
          {F("Appreciation /yr", appr, setAppr, "%")}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Stat label="EMI /month" value={inr(m.emi)} />
          <Stat label="Total rent paid" value={inr(m.rentTotal)} />
          <Stat label="Net cost of buying" value={inr(m.buyNetCost)} highlight />
        </div>
      </Card>
      <Card className="p-5 text-sm">
        <b className="text-primary">{m.better}</b> is cheaper over {years} years by <b>{inr(m.diff)}</b>.
        <span className="text-muted-foreground"> Buying builds equity ({inr(m.equityAtSale)} at an assumed sale value of {inr(m.saleValue)}) but ties up your down payment and EMIs. Renting keeps you flexible and liquid. Shorter stays and high prices favour renting; longer stays and strong appreciation favour buying.</span>
      </Card>
    </div>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
