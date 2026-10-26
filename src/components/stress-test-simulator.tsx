"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  runStressSimulation,
  type FinancialBaseMetrics,
  type StressShockParameters,
} from "@/lib/stress-test";
import { inr } from "@/lib/utils";
import { Activity, AlertTriangle, ShieldCheck, TrendingDown, Clock, Compass } from "lucide-react";

interface StressTestSimulatorProps {
  initialMetrics?: Partial<FinancialBaseMetrics>;
}

export function StressTestSimulator({ initialMetrics }: StressTestSimulatorProps) {
  // Baseline financial position
  const [monthlyRevenue, setMonthlyRevenue] = useState(initialMetrics?.monthlyRevenue ?? 5000000);
  const [monthlyExpenses, setMonthlyExpenses] = useState(initialMetrics?.monthlyExpenses ?? 4100000);
  const [grossMarginPct, setGrossMarginPct] = useState(initialMetrics?.grossMarginPct ?? 22);
  const [cashReserve, setCashReserve] = useState(initialMetrics?.cashReserve ?? 3500000);
  const [totalReceivables, setTotalReceivables] = useState(initialMetrics?.totalReceivables ?? 6500000);
  const [totalPayables, setTotalPayables] = useState(initialMetrics?.totalPayables ?? 3200000);

  // Shock parameters
  const [debtorDelayDays, setDebtorDelayDays] = useState(30);
  const [cogsInflationPct, setCogsInflationPct] = useState(8);
  const [revenueDropPct, setRevenueDropPct] = useState(10);
  const [creditorAccelerationDays, setCreditorAccelerationDays] = useState(15);

  const simulation = useMemo(() => {
    const base: FinancialBaseMetrics = {
      annualRevenue: monthlyRevenue * 12,
      monthlyRevenue,
      monthlyExpenses,
      grossMarginPct,
      cashReserve,
      totalReceivables,
      totalPayables,
      totalAssets: cashReserve + totalReceivables + monthlyRevenue * 2, // Current + fixed estimate
      totalLiabilities: totalPayables + monthlyExpenses * 1.5,
      retainedEarnings: monthlyRevenue * 1.2,
      ebit: (monthlyRevenue - monthlyExpenses) * 12,
    };

    const shock: StressShockParameters = {
      debtorDelayDays,
      cogsInflationPct,
      revenueDropPct,
      creditorAccelerationDays,
    };

    return runStressSimulation(base, shock);
  }, [
    monthlyRevenue,
    monthlyExpenses,
    grossMarginPct,
    cashReserve,
    totalReceivables,
    totalPayables,
    debtorDelayDays,
    cogsInflationPct,
    revenueDropPct,
    creditorAccelerationDays,
  ]);

  const { postShockAltmanZ } = simulation;

  return (
    <div className="space-y-6">
      {/* Simulation Header */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-primary">
                <Activity className="h-3.5 w-3.5" /> Institutional Stress-Testing
              </span>
              <span className="rounded bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                Altman Z&prime;-Score & Liquidity Cliff
              </span>
            </div>
            <h3 className="mt-1 font-semibold text-foreground text-base sm:text-lg">
              Macro & Micro Working Capital Shock Simulator
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
              Simulate the compounded shock of debtor payment delays, direct material inflation, contract drop, and MSME Section 43B(h) creditor acceleration on your cash runway and insolvency probability.
            </p>
          </div>
        </div>
      </div>

      {/* KPI Scorecards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Altman Z' Dial */}
        <Card className="p-3.5">
          <div className="text-xs text-muted-foreground font-medium">Post-Shock Altman Z&prime; Score</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`text-xl sm:text-2xl font-black tabular-nums ${
                postShockAltmanZ.zone === "SAFE"
                  ? "text-success"
                  : postShockAltmanZ.zone === "GREY"
                  ? "text-warning"
                  : "text-danger"
              }`}
            >
              {postShockAltmanZ.score}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                postShockAltmanZ.zone === "SAFE"
                  ? "bg-success/15 text-success"
                  : postShockAltmanZ.zone === "GREY"
                  ? "bg-warning/15 text-warning"
                  : "bg-danger/15 text-danger"
              }`}
            >
              {postShockAltmanZ.zone} ZONE
            </span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
            {postShockAltmanZ.zone === "SAFE" ? "Low insolvency risk" : postShockAltmanZ.zone === "GREY" ? "Caution required" : "High distress risk"}
          </div>
        </Card>

        {/* Days to Liquidity Cliff */}
        <Card className="p-3.5">
          <div className="text-xs text-muted-foreground font-medium">Liquidity Cliff Horizon</div>
          <div className="mt-1 text-xl sm:text-2xl font-black text-foreground tabular-nums">
            {simulation.daysToLiquidityCliff === null ? (
              <span className="text-success text-lg font-bold">Resilient (No Cliff)</span>
            ) : (
              <span className={simulation.daysToLiquidityCliff <= 45 ? "text-danger" : "text-warning"}>
                {simulation.daysToLiquidityCliff} Days
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {simulation.daysToLiquidityCliff !== null
              ? "Until cash buffer is depleted"
              : "Inflows exceed stressed burn"}
          </div>
        </Card>

        {/* Locked Working Capital */}
        <Card className="p-3.5">
          <div className="text-xs text-muted-foreground font-medium">Immediate Capital Trapped</div>
          <div className="mt-1 text-xl sm:text-2xl font-black text-danger tabular-nums">
            {inr(simulation.immediateWorkingCapitalLocked)}
          </div>
          <div className="mt-1 text-[11px] text-danger">Frozen in receivables & faster payables</div>
        </Card>

        {/* Stressed Monthly Burn */}
        <Card className="p-3.5">
          <div className="text-xs text-muted-foreground font-medium">Stressed Monthly Outflows</div>
          <div className="mt-1 text-xl sm:text-2xl font-black text-foreground tabular-nums">
            {inr(simulation.stressedBurnMonthly)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Baseline: {inr(simulation.baselineBurnMonthly)} (+{Math.round(((simulation.stressedBurnMonthly - simulation.baselineBurnMonthly) / simulation.baselineBurnMonthly) * 100)}%)
          </div>
        </Card>
      </div>

      {/* Interactive Shock Controls */}
      <Card className="p-5 space-y-5">
        <div className="flex items-center gap-2 border-b pb-2">
          <Compass className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-sm">Adverse Scenario Levers (Drag to Stress Test)</h4>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {/* Lever 1: Debtor Delay */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-foreground">1. Debtor Payment Delay Shock</span>
              <span className="font-bold text-primary tabular-nums">+{debtorDelayDays} Days</span>
            </div>
            <input
              type="range"
              min={0}
              max={90}
              step={5}
              value={debtorDelayDays}
              onChange={(e) => setDebtorDelayDays(Number(e.target.value))}
              className="w-full accent-[hsl(var(--primary))]"
            />
            <div className="text-[11px] text-muted-foreground">
              Traps ₹{((monthlyRevenue / 30) * debtorDelayDays / 100000).toFixed(1)}L of collections past scheduled terms.
            </div>
          </div>

          {/* Lever 2: Input Cost Inflation */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-foreground">2. Direct Cost / COGS Inflation Shock</span>
              <span className="font-bold text-danger tabular-nums">+{cogsInflationPct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={25}
              step={1}
              value={cogsInflationPct}
              onChange={(e) => setCogsInflationPct(Number(e.target.value))}
              className="w-full accent-[hsl(var(--primary))]"
            />
            <div className="text-[11px] text-muted-foreground">
              Adds ₹{((monthlyRevenue * (1 - grossMarginPct / 100) * (cogsInflationPct / 100)) / 100000).toFixed(1)}L/mo to raw material & operational expenses.
            </div>
          </div>

          {/* Lever 3: Demand Contraction */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-foreground">3. Revenue / Order Contraction Shock</span>
              <span className="font-bold text-warning tabular-nums">-{revenueDropPct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={40}
              step={5}
              value={revenueDropPct}
              onChange={(e) => setRevenueDropPct(Number(e.target.value))}
              className="w-full accent-[hsl(var(--primary))]"
            />
            <div className="text-[11px] text-muted-foreground">
              Reduces monthly gross receipts by ₹{((monthlyRevenue * (revenueDropPct / 100)) / 100000).toFixed(1)}L.
            </div>
          </div>

          {/* Lever 4: MSME 43B(h) Acceleration */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-foreground">4. Creditor Acceleration (Sec 43B(h) Squeeze)</span>
              <span className="font-bold text-primary tabular-nums">{creditorAccelerationDays} Days Faster</span>
            </div>
            <input
              type="range"
              min={0}
              max={30}
              step={5}
              value={creditorAccelerationDays}
              onChange={(e) => setCreditorAccelerationDays(Number(e.target.value))}
              className="w-full accent-[hsl(var(--primary))]"
            />
            <div className="text-[11px] text-muted-foreground">
              Suppliers demand statutory 15/45 day payment windows instead of 60-day credit.
            </div>
          </div>
        </div>
      </Card>

      {/* Prescriptive Action Levers */}
      <Card className="p-5 space-y-3 border-primary/20">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-success" />
          <h4 className="font-semibold text-sm">Cortex Prescriptive Survival Levers</h4>
        </div>
        <div className="space-y-2 text-xs">
          {simulation.actionLevers.map((lever, i) => (
            <div key={i} className="flex items-start gap-2 rounded-md bg-muted/40 p-2.5">
              <span className="font-bold text-primary shrink-0">{i + 1}.</span>
              <span className="text-foreground">{lever}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
