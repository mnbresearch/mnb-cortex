"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  Zap,
  Sliders,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  Users,
  Activity,
  DollarSign,
  Scale,
  FileCheck2,
} from "lucide-react";
import { inr } from "@/lib/utils";

export function UnrivaledMoat() {
  const [activePillar, setActivePillar] = useState<"twin" | "audit" | "upi" | "council">("twin");

  // Interactive Digital Twin simulation state for prospective owners
  const [debtorDelayDays, setDebtorDelayDays] = useState(30);
  const [cogsInflationPct, setCogsInflationPct] = useState(10);

  // Math-grounded model based on standard ₹35L baseline
  const baselineCash = 3500000;
  const baselineBurn = 900000;
  const baselineAr = 4000000;

  const delayedArCash = Math.round(baselineAr * 0.4 * (debtorDelayDays / 60));
  const cogsSurcharge = Math.round(baselineBurn * 0.6 * (cogsInflationPct / 100));
  const effectiveCash = Math.max(0, baselineCash - delayedArCash);
  const effectiveBurn = baselineBurn + cogsSurcharge;
  const simulatedRunway = Number((effectiveCash / effectiveBurn).toFixed(1));
  const baseRunway = Number((baselineCash / baselineBurn).toFixed(1));
  const runwayLoss = Math.max(0, Number((baseRunway - simulatedRunway).toFixed(1)));
  const shortfallRisk = Math.max(0, delayedArCash + cogsSurcharge * 3 - baselineCash * 0.4);

  return (
    <div className="mt-12 rounded-2xl border bg-card/60 backdrop-blur-sm overflow-hidden shadow-xl">
      {/* Top Navigation Tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 border-b hairline bg-secondary/30 text-xs font-medium">
        <button
          type="button"
          onClick={() => setActivePillar("twin")}
          className={`flex items-center justify-center gap-2 py-4 px-3 text-center transition-all ${
            activePillar === "twin"
              ? "bg-card text-foreground border-b-2 border-primary font-semibold shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-card/40"
          }`}
        >
          <Sliders className="h-4 w-4 text-primary shrink-0" />
          <span>1. Balance Sheet Digital Twin</span>
        </button>

        <button
          type="button"
          onClick={() => setActivePillar("audit")}
          className={`flex items-center justify-center gap-2 py-4 px-3 text-center transition-all ${
            activePillar === "audit"
              ? "bg-card text-foreground border-b-2 border-primary font-semibold shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-card/40"
          }`}
        >
          <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
          <span>2. Big-4 Forensic Audit Sentinel</span>
        </button>

        <button
          type="button"
          onClick={() => setActivePillar("upi")}
          className={`flex items-center justify-center gap-2 py-4 px-3 text-center transition-all ${
            activePillar === "upi"
              ? "bg-card text-foreground border-b-2 border-primary font-semibold shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-card/40"
          }`}
        >
          <QrCode className="h-4 w-4 text-amber-500 shrink-0" />
          <span>3. 0% Fee Dynamic UPI QR</span>
        </button>

        <button
          type="button"
          onClick={() => setActivePillar("council")}
          className={`flex items-center justify-center gap-2 py-4 px-3 text-center transition-all ${
            activePillar === "council"
              ? "bg-card text-foreground border-b-2 border-primary font-semibold shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-card/40"
          }`}
        >
          <Users className="h-4 w-4 text-purple-500 shrink-0" />
          <span>4. Autonomous C-Suite Council</span>
        </button>
      </div>

      {/* Pillar 1: Balance Sheet Digital Twin */}
      {activePillar === "twin" && (
        <div className="p-6 lg:p-10">
          <div className="grid lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-6 space-y-4">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" /> First-in-Market Feature
              </div>
              <h3 className="font-display text-2xl lg:text-3xl tracking-tightest">
                Real-Time Macro Shock Chamber & Financial Digital Twin
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                ERPs like Tally or Zoho Books only record history after your cash is already gone. Cortex builds a live
                digital twin of your balance sheet so you can stress-test macro shocks before they happen.
              </p>

              {/* What competitors don't have */}
              <div className="rounded-xl border bg-background/50 p-4 space-y-2.5 text-xs">
                <div className="font-semibold text-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  What competitors cannot do:
                </div>
                <div className="grid gap-2 text-muted-foreground pl-6">
                  <div>
                    <span className="font-medium text-foreground">Interactive stress testing:</span> Instant mathematical
                    runway contraction as debtor delays, MSME 45-day compression, or raw material inflation move.
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Autonomous mitigation playbooks:</span> Pre-configured 1-click
                    action plans (Dynamic UPI QR acceleration, selective factoring, MSME vendor payment scheduling).
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <Link
                  href="/login?mode=signup"
                  className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline underline-offset-4"
                >
                  Test your own balance sheet in Cortex →
                </Link>
              </div>
            </div>

            {/* Interactive Simulator Card */}
            <div className="lg:col-span-6 rounded-2xl border bg-secondary/20 p-5 lg:p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                    Interactive Live Simulation
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground font-mono">Sample ₹35L Baseline</span>
              </div>

              {/* Interactive Sliders */}
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-medium">Debtor Payment Delay</span>
                    <span className="font-mono text-primary font-semibold">{debtorDelayDays} days</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="60"
                    step="5"
                    value={debtorDelayDays}
                    onChange={(e) => setDebtorDelayDays(Number(e.target.value))}
                    className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                    <span>On Time (0d)</span>
                    <span>Severe Squeeze (60d)</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-medium">Raw Material / COGS Inflation</span>
                    <span className="font-mono text-primary font-semibold">+{cogsInflationPct}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="2"
                    value={cogsInflationPct}
                    onChange={(e) => setCogsInflationPct(Number(e.target.value))}
                    className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                    <span>Stable (0%)</span>
                    <span>High Inflation (+20%)</span>
                  </div>
                </div>
              </div>

              {/* Real-time Simulated Outputs */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                <div className="rounded-xl border bg-background p-3">
                  <div className="text-[11px] text-muted-foreground">Post-Shock Runway</div>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-2xl font-bold tracking-tight text-foreground font-mono">
                      {simulatedRunway}
                    </span>
                    <span className="text-xs text-muted-foreground">months</span>
                  </div>
                  <div className="text-[10px] text-danger font-medium mt-0.5">
                    -{runwayLoss} months from baseline
                  </div>
                </div>

                <div className="rounded-xl border bg-background p-3">
                  <div className="text-[11px] text-muted-foreground">Cash Shortfall Risk</div>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-2xl font-bold tracking-tight text-foreground font-mono">
                      {shortfallRisk > 0 ? inr(shortfallRisk) : "₹0"}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {shortfallRisk > 0 ? "Requires automated mitigation" : "Adequate liquidity reserve"}
                  </div>
                </div>
              </div>

              {/* Autonomous Mitigation Playbook Generated */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs flex items-start gap-3">
                <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-semibold text-primary">Cortex Autonomous Mitigation Playbook</div>
                  <div className="text-muted-foreground text-[11px] mt-0.5 leading-relaxed">
                    Deploys Dynamic UPI QR payment links to overdue debtors to recapture{" "}
                    <span className="text-foreground font-semibold">{inr(Math.round(delayedArCash * 0.7))}</span> without
                    discounting or credit facility interest.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pillar 2: Big-4 Forensic Audit Sentinel */}
      {activePillar === "audit" && (
        <div className="p-6 lg:p-10">
          <div className="grid lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-6 space-y-4">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-500">
                <ShieldCheck className="h-3.5 w-3.5" /> Continuous Statutory Defense
              </div>
              <h3 className="font-display text-2xl lg:text-3xl tracking-tightest">
                Continuous Big-4 Pre-Flight Audit Sentinel & Anomaly Scanner
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Most businesses scramble through 3 weeks of painful Excel cleanups when auditors arrive. Cortex runs a continuous
                0–100% Big-4 audit readiness score across 5 statutory vectors and scans for forensic invoice anomalies.
              </p>

              <div className="space-y-3 pt-2">
                {[
                  {
                    title: "MSME Section 43B(h) Tax Disallowance Defense",
                    desc: "Flags micro/small supplier invoices past 45 days, calculating the 30% tax penalty and 3x bank interest disallowance.",
                  },
                  {
                    title: "GSTR-2B Rule 88D Input Tax Credit Defense",
                    desc: "Matches your purchase register against vendor portal filings to avoid 18% p.a. interest and ITC clawbacks.",
                  },
                  {
                    title: "TDS 194Q / 194C / 194J Cumulative Thresholds",
                    desc: "Monitors ₹50L+ cumulative annual purchase caps and validates PAN deductee rates automatically.",
                  },
                  {
                    title: "Duplicate & Round-Number Forensic Anomaly Scanners",
                    desc: "Flags duplicate billings to identical parties and suspicious round-number transaction spikes before auditors see them.",
                  },
                ].map((v, i) => (
                  <div key={i} className="rounded-xl border bg-background/50 p-3.5 flex items-start gap-3">
                    <span className="h-5 w-5 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-xs font-bold shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-foreground">{v.title}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{v.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Audit Readiness Preview Card */}
            <div className="lg:col-span-6 rounded-2xl border bg-secondary/20 p-5 lg:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                    Big-4 Pre-Flight Audit Readiness
                  </span>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
                  Grade A+ (94/100)
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl border bg-background">
                  <div className="text-[10px] text-muted-foreground uppercase font-mono">MSME 43B(h) Exposure</div>
                  <div className="text-lg font-bold text-foreground font-mono mt-1">₹0 at Risk</div>
                  <div className="text-[10px] text-emerald-500 mt-0.5 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> 100% compliant
                  </div>
                </div>

                <div className="p-3 rounded-xl border bg-background">
                  <div className="text-[10px] text-muted-foreground uppercase font-mono">GSTR-2B Rule 88D ITC</div>
                  <div className="text-lg font-bold text-foreground font-mono mt-1">99.4% Matched</div>
                  <div className="text-[10px] text-emerald-500 mt-0.5 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Safe from notice
                  </div>
                </div>
              </div>

              {/* Sample Anomaly Caught */}
              <div className="rounded-xl border border-warning/30 bg-warning/5 p-3.5 space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5 text-warning font-semibold">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Forensic Sentinel Anomaly Prevented
                </div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Identified 1 duplicate invoice (₹4,50,000 billed twice under identical party details within 48h) and flagged for
                  exclusion before bank ledger clearance.
                </div>
              </div>

              <div className="rounded-xl border bg-background p-3 flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-foreground">One-Click Big-4 Audit Pack</div>
                  <div className="text-[10px] text-muted-foreground">Exports formatted statutory workpapers & reconciliations</div>
                </div>
                <span className="text-[11px] text-primary font-medium border border-primary/30 rounded-lg px-2.5 py-1">
                  Ready in 1 click
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pillar 3: 0% Fee Dynamic UPI QR Acceleration */}
      {activePillar === "upi" && (
        <div className="p-6 lg:p-10">
          <div className="grid lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-6 space-y-4">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-500">
                <QrCode className="h-3.5 w-3.5" /> Direct Bank Inflow
              </div>
              <h3 className="font-display text-2xl lg:text-3xl tracking-tightest">
                0% Fee Dynamic UPI QR Acceleration & Autopilot Collections
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Traditional payment gateways take a 1.5% to 2% bite out of every transaction, while wire transfers take weeks to
                arrive. Cortex embeds dynamic NPCI-compliant UPI QR codes straight onto invoices and automated WhatsApp chasing
                messages.
              </p>

              <div className="rounded-xl border bg-background/50 p-4 space-y-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <span className="text-primary font-bold">✓</span>
                  <div>
                    <span className="font-semibold text-foreground">Zero Gateway Commission:</span> 100% of the funds go directly
                    into your business bank account. ₹0 platform cut.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="text-primary font-bold">✓</span>
                  <div>
                    <span className="font-semibold text-foreground">Auto-Shutoff Chasing:</span> When customer pays via QR, the
                    reminders stop instantly — zero risk of embarrassing duplicate calls.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="text-primary font-bold">✓</span>
                  <div>
                    <span className="font-semibold text-foreground">Tone-Modulated WhatsApp & Email:</span> Gentle reminder at 7
                    days, firm statutory reminder at 30 days, formal legal demand note at 45 days.
                  </div>
                </div>
              </div>
            </div>

            {/* Visual Comparison Card */}
            <div className="lg:col-span-6 rounded-2xl border bg-secondary/20 p-5 lg:p-6 shadow-sm space-y-4">
              <div className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono">
                Payment Economics Comparison
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-4 rounded-xl border bg-background/80 space-y-2">
                  <div className="font-bold text-danger">Standard Payment Gateways</div>
                  <div className="text-2xl font-bold font-mono text-foreground">1.75% – 2.0%</div>
                  <div className="text-[11px] text-muted-foreground">₹20,000 lost per ₹10 Lakhs collected</div>
                  <div className="text-[10px] text-muted-foreground pt-1 border-t">T+2 settlement delay & gateway holds</div>
                </div>

                <div className="p-4 rounded-xl border border-primary/40 bg-primary/5 space-y-2">
                  <div className="font-bold text-primary flex items-center gap-1">
                    Cortex Dynamic UPI QR
                  </div>
                  <div className="text-2xl font-bold font-mono text-primary">0% Commission</div>
                  <div className="text-[11px] text-muted-foreground">₹0 lost · 100% retained working capital</div>
                  <div className="text-[10px] text-emerald-500 font-medium pt-1 border-t">Instant real-time bank settlement</div>
                </div>
              </div>

              <div className="rounded-xl border bg-background p-3.5 flex items-center gap-3">
                <QrCode className="h-8 w-8 text-primary shrink-0" />
                <div className="text-xs min-w-0">
                  <div className="font-semibold text-foreground">Pre-Filled & Immutable Invoice QRs</div>
                  <div className="text-muted-foreground text-[11px]">
                    Encodes your VPA, exact invoice amount, and invoice reference number to eliminate manual reconciliation errors.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pillar 4: Autonomous C-Suite Council */}
      {activePillar === "council" && (
        <div className="p-6 lg:p-10">
          <div className="grid lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-6 space-y-4">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 px-3 py-1 text-xs font-semibold text-purple-500">
                <Users className="h-3.5 w-3.5" /> Boardroom Multi-Agent Intelligence
              </div>
              <h3 className="font-display text-2xl lg:text-3xl tracking-tightest">
                Autonomous Executive Council: Fractional CFO, COO, CRO & Counsel
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Single-purpose AI wrappers generate isolated paragraphs. Cortex convenes an Autonomous Executive Council where
                specialised C-suite personas review your actual numbers, debate cross-functional trade-offs, and deliver unified
                verdicts.
              </p>

              <div className="grid sm:grid-cols-2 gap-2.5 pt-2 text-xs">
                <div className="rounded-xl border bg-background p-3">
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-500" /> Fractional CFO
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Watches liquidity runway, debtor concentration risk, and cash flow forecasting.
                  </p>
                </div>

                <div className="rounded-xl border bg-background p-3">
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Autonomous COO
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Tracks inventory reorder thresholds, vendor lead times, and capacity utilization.
                  </p>
                </div>

                <div className="rounded-xl border bg-background p-3">
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-500" /> Revenue Lead (CRO)
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Audits sales pipeline velocity, customer churn signals, and discount margin leakages.
                  </p>
                </div>

                <div className="rounded-xl border bg-background p-3">
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-500" /> Statutory & Tax Counsel
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Enforces Section 43B(h), GSTR-2B ITC matching, and TDS compliance before penalties hit.
                  </p>
                </div>
              </div>
            </div>

            {/* Council Verdict Simulation */}
            <div className="lg:col-span-6 rounded-2xl border bg-secondary/20 p-5 lg:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b pb-3 text-xs">
                <span className="font-mono font-semibold uppercase text-muted-foreground">Sample Council Session</span>
                <span className="font-semibold text-primary">Consensus Reached</span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="rounded-lg border bg-background p-3 space-y-1">
                  <div className="text-[10px] text-blue-500 font-semibold uppercase font-mono">Fractional CFO Finding</div>
                  <p className="text-muted-foreground text-[11px]">
                    &ldquo;Receivables ageing in top distributor account crossed 42 days. Cash runway will compress by 1.2 months if
                    uncollected by month-end.&rdquo;
                  </p>
                </div>

                <div className="rounded-lg border bg-background p-3 space-y-1">
                  <div className="text-[10px] text-rose-500 font-semibold uppercase font-mono">Tax Counsel Alert</div>
                  <p className="text-muted-foreground text-[11px]">
                    &ldquo;Supplier Bharat Steel is a registered Micro enterprise. Bill due in 4 days. Non-payment triggers 43B(h)
                    tax disallowance and 3x bank interest.&rdquo;
                  </p>
                </div>

                <div className="rounded-xl border border-primary/30 bg-primary/10 p-3.5 space-y-1">
                  <div className="text-xs font-semibold text-primary flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> Unified Boardroom Verdict & Action
                  </div>
                  <p className="text-foreground text-[11px] leading-relaxed">
                    Prioritise ₹1.8L payout to Bharat Steel to preserve full tax deduction, and trigger 0% UPI QR automated WhatsApp
                    reminder to top distributor to replenish liquidity.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
