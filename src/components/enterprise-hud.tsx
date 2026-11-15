"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  AlertTriangle,
  TrendingDown,
  Sparkles,
  Zap,
  CheckCircle2,
  Clock,
  Activity,
  Sliders,
  Printer,
  ChevronRight,
  RefreshCw,
  FileText,
  DollarSign,
  Briefcase,
  AlertCircle,
  Eye,
} from "lucide-react";
import { inr } from "@/lib/utils";
import type { EnterpriseHudData } from "@/lib/actions";
import { simulateFinancialShocks, DEFAULT_SHOCK_PARAMETERS, type ShockParameters } from "@/lib/digital-twin";
import { runForensicAuditSnapshot, saveDigitalTwinScenario } from "@/lib/actions";

interface Props {
  initialData: EnterpriseHudData;
}

export function EnterpriseCommandHud({ initialData }: Props) {
  const [data, setData] = useState<EnterpriseHudData>(initialData);
  const [shocks, setShocks] = useState<ShockParameters>(DEFAULT_SHOCK_PARAMETERS);
  const [activeTab, setActiveTab] = useState<"overview" | "forensic" | "digital_twin" | "operations">("overview");
  const [isPending, startTransition] = useTransition();
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Recalculate digital twin dynamically as sliders move
  const liveTwin = simulateFinancialShocks(data.pillar4_digitalTwin.baseline, shocks);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const auditReport = data.pillar2_forensic;
  const capital = data.pillar1_capital;
  const ops = data.pillar3_operations;

  // Audit badge styling
  const auditBadgeColor =
    auditReport.grade === "A+" || auditReport.grade === "A"
      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
      : auditReport.grade === "B"
      ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
      : "bg-rose-500/10 text-rose-500 border-rose-500/30";

  // Covenant breach styling
  const covenantBadgeColor =
    liveTwin.impact.covenantBreachRisk === "severe"
      ? "bg-rose-500/15 text-rose-500 border-rose-500/40 animate-pulse"
      : liveTwin.impact.covenantBreachRisk === "medium"
      ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
      : "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";

  const handleRecordAuditSnapshot = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("score", String(auditReport.overallScore));
      fd.append("grade", auditReport.grade);
      fd.append("status", auditReport.status);
      fd.append("checks", JSON.stringify(auditReport.vectors));
      fd.append("anomalies", JSON.stringify(auditReport.anomalies));
      const res = await runForensicAuditSnapshot(fd);
      if (res.ok) showToast("Audit snapshot & Big-4 pre-flight pack recorded.");
      else showToast(res.error || "Failed to record audit snapshot.");
    });
  };

  const handleSaveScenario = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("name", `Shock Sim (${shocks.debtorDelayDays}d Delay, ${shocks.cogsInflationPct}% COGS)`);
      fd.append("shocks", JSON.stringify(shocks));
      fd.append("impact", JSON.stringify(liveTwin.impact));
      fd.append("mitigations", JSON.stringify(liveTwin.mitigations));
      const res = await saveDigitalTwinScenario(fd);
      if (res.ok) showToast("Digital Twin simulation scenario saved to executive records.");
      else showToast(res.error || "Failed to save scenario.");
    });
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-card border border-primary/30 p-4 shadow-2xl text-xs flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Executive Header & HUD Telemetry */}
      <Card className="p-6 bg-gradient-to-br from-card via-card to-primary/5 border shadow-sm relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                Enterprise Command HUD · Autonomous Financial Sentinel
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground mt-1 flex items-center gap-2">
              {data.orgName}
              {!data.isReal && (
                <Badge className="text-[10px] text-muted-foreground border-dashed">
                  Demo Preview
                </Badge>
              )}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Unified 4-Pillar Executive Cockpit: Capital Velocity, Forensic Audit Shield, Auto-Operations & Digital Twin.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 no-print">
            {/* View Switcher Tabs */}
            <div className="flex items-center bg-muted/60 p-1 rounded-lg border text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("overview")}
                className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                  activeTab === "overview" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                HUD Overview
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("forensic")}
                className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                  activeTab === "forensic" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Forensic Sentinel ({auditReport.overallScore}/100)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("digital_twin")}
                className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                  activeTab === "digital_twin" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Digital Twin Simulator
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="gap-1.5 text-xs h-9 border"
            >
              <Printer className="h-3.5 w-3.5" />
              Export Brief (PDF)
            </Button>
          </div>
        </div>

        {/* High-Altitude Executive Metrics Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-5 border-t border-border/60">
          <div className="rounded-xl p-3 bg-background/50 border border-border/50">
            <div className="text-[11px] font-medium text-muted-foreground">Big-4 Audit Readiness</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold tracking-tight">{auditReport.overallScore}</span>
              <span className="text-xs text-muted-foreground">/100</span>
              <Badge className={`ml-auto text-[10px] px-1.5 py-0.5 border ${auditBadgeColor}`}>
                Grade {auditReport.grade}
              </Badge>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1 truncate">
              {auditReport.cleanChecksCount} of {auditReport.totalChecksCount} audit checks passed
            </div>
          </div>

          <div className="rounded-xl p-3 bg-background/50 border border-border/50">
            <div className="text-[11px] font-medium text-muted-foreground">Liquidity Runway</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold tracking-tight tabular-nums">{capital.runwayMonths}</span>
              <span className="text-xs text-muted-foreground">months</span>
              <Badge className="ml-auto text-[10px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                Safe
              </Badge>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              Burn: {inr(capital.monthlyBurnRate)}/mo · Cash: {inr(capital.cashInBank)}
            </div>
          </div>

          <div className="rounded-xl p-3 bg-background/50 border border-border/50">
            <div className="text-[11px] font-medium text-muted-foreground">Continuous Close Status</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold tracking-tight">{ops.closeCompletedPct}%</span>
              <Badge className="ml-auto text-[10px] px-1.5 py-0.5 capitalize bg-primary/10 text-primary border-primary/30">
                {ops.closeStatus.replace("_", " ")}
              </Badge>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {ops.closeExceptionsCount > 0 ? `${ops.closeExceptionsCount} exceptions to reconcile` : "Clean ledger balances"}
            </div>
          </div>

          <div className="rounded-xl p-3 bg-background/50 border border-border/50">
            <div className="text-[11px] font-medium text-muted-foreground">P0/P1 Actions & Commitments</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold tracking-tight text-amber-500">{ops.p0TasksCount + ops.p1TasksCount}</span>
              <span className="text-xs text-muted-foreground">priority tasks</span>
              <Badge className="ml-auto text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground">
                {ops.pendingCommitmentsCount} promises
              </Badge>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {ops.p0TasksCount} P0 critical items awaiting decision
            </div>
          </div>
        </div>
      </Card>

      {/* TAB 1: OVERVIEW — The 4 Executive Pillars */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pillar 1: Capital Velocity & Treasury Radar */}
          <Card className="p-5 space-y-4 border hover:border-primary/40 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                  <DollarSign className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Pillar 1: Capital Velocity & Treasury Radar</h2>
                  <p className="text-[11px] text-muted-foreground">Cash velocity, working capital, and debtor collection speed</p>
                </div>
              </div>
              <Link href="/receivables" className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
                Receivables <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="p-3 rounded-lg bg-muted/40 border">
                <div className="text-[10px] text-muted-foreground">Receivables (AR)</div>
                <div className="text-lg font-bold tabular-nums mt-0.5">{inr(capital.totalReceivables)}</div>
                <div className="text-[10px] text-emerald-500 mt-1">DSO: ~{capital.dsoDays} days</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/40 border">
                <div className="text-[10px] text-muted-foreground">Payables (AP)</div>
                <div className="text-lg font-bold tabular-nums mt-0.5">{inr(capital.totalPayables)}</div>
                <div className="text-[10px] text-muted-foreground mt-1">Vendor liabilities</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/40 border">
                <div className="text-[10px] text-muted-foreground">Net Liquidity Buffer</div>
                <div className="text-lg font-bold tabular-nums mt-0.5 text-primary">
                  {inr(capital.cashInBank + capital.totalReceivables - capital.totalPayables)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">Net working capital</div>
              </div>
            </div>

            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary shrink-0" />
                <span>
                  <b>0% Fee Dynamic UPI QR</b> active across all collections links — bypasses 1.8% gateway MDR.
                </span>
              </div>
              <Link href="/receivables" className="shrink-0 text-primary font-semibold hover:underline">
                Collect Now →
              </Link>
            </div>
          </Card>

          {/* Pillar 2: Forensic Sentinel & Big-4 Audit Pre-Flight */}
          <Card className="p-5 space-y-4 border hover:border-primary/40 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Pillar 2: Forensic Sentinel & Big-4 Audit Pre-Flight</h2>
                  <p className="text-[11px] text-muted-foreground">MSME 43B(h), GSTR-2B ITC match, TDS 194Q & anomaly scans</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("forensic")}
                className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
              >
                Details <ChevronRight className="h-3 w-3" />
              </button>
            </div>

            <div className="space-y-2.5 pt-1">
              {auditReport.vectors.slice(0, 3).map((vec) => (
                <div key={vec.id} className="p-2.5 rounded-lg border bg-muted/20 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 max-w-[70%]">
                    {vec.status === "pass" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    ) : vec.status === "warning" ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                    )}
                    <span className="font-medium truncate">{vec.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums font-semibold">{vec.score}/100</span>
                    <Badge
                      className={`text-[9px] px-1 py-0 capitalize ${
                        vec.status === "pass"
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                          : vec.status === "warning"
                          ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                          : "bg-rose-500/10 text-rose-500 border-rose-500/30"
                      }`}
                    >
                      {vec.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs pt-1 border-t">
              <span className="text-muted-foreground">
                At-risk disallowance exposure: <b className="text-foreground">{inr(auditReport.totalAtRiskExposure)}</b>
              </span>
              <button
                type="button"
                onClick={handleRecordAuditSnapshot}
                disabled={isPending}
                className="text-xs text-primary font-medium hover:underline"
              >
                Save Pre-Flight Workpaper →
              </button>
            </div>
          </Card>

          {/* Pillar 3: Autonomous Operations Cockpit */}
          <Card className="p-5 space-y-4 border hover:border-primary/40 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                  <Briefcase className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Pillar 3: Autonomous Operations Cockpit</h2>
                  <p className="text-[11px] text-muted-foreground">Month-End Close, P0–P3 Action Triage & Promises</p>
                </div>
              </div>
              <Link href="/close" className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
                Close Cockpit <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="p-3 rounded-lg border bg-muted/20 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Month-End Continuous Close Progress</span>
                <span className="font-bold">{ops.closeCompletedPct}% Complete</span>
              </div>
              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                <div className="bg-primary h-full transition-all duration-300" style={{ width: `${ops.closeCompletedPct}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <Link href="/tasks" className="p-3 rounded-lg border bg-muted/40 hover:bg-muted/70 transition-colors">
                <div className="text-[10px] text-muted-foreground">P0 & P1 Critical Actions</div>
                <div className="text-base font-bold text-amber-500 mt-1 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {ops.p0TasksCount} P0 / {ops.p1TasksCount} P1
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Triage in Action Board →</div>
              </Link>

              <Link href="/tasks" className="p-3 rounded-lg border bg-muted/40 hover:bg-muted/70 transition-colors">
                <div className="text-[10px] text-muted-foreground">Pending Commitments</div>
                <div className="text-base font-bold text-foreground mt-1 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  {ops.pendingCommitmentsCount} Active
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Track counterparties →</div>
              </Link>
            </div>
          </Card>

          {/* Pillar 4: Digital Twin & Balance Sheet Shock Chamber */}
          <Card className="p-5 space-y-4 border hover:border-primary/40 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Pillar 4: Digital Twin & Balance Sheet Shock Chamber</h2>
                  <p className="text-[11px] text-muted-foreground">Live what-if stress-testing & covenant breach prediction</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("digital_twin")}
                className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
              >
                Launch Simulator <ChevronRight className="h-3 w-3" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/40 border">
                <div className="text-[10px] text-muted-foreground">Simulated Runway</div>
                <div className="text-lg font-bold tabular-nums mt-0.5 text-foreground flex items-center gap-1.5">
                  {liveTwin.impact.simulatedRunwayMonths} mos
                  {liveTwin.impact.runwayContractedMonths > 0 && (
                    <span className="text-xs font-normal text-rose-500">
                      (-{liveTwin.impact.runwayContractedMonths}m)
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Under active shock stress</div>
              </div>

              <div className="p-3 rounded-lg bg-muted/40 border">
                <div className="text-[10px] text-muted-foreground">Covenant Risk Level</div>
                <div className="mt-1">
                  <Badge className={`text-[10px] px-2 py-0.5 capitalize border ${covenantBadgeColor}`}>
                    {liveTwin.impact.covenantBreachRisk} Risk
                  </Badge>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Shortfall: {inr(liveTwin.impact.immediateCashShortfall)}</div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-secondary/50 border flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {liveTwin.mitigations.length} Autonomous Countermeasure(s) Available
              </span>
              <button
                type="button"
                onClick={() => setActiveTab("digital_twin")}
                className="text-primary font-semibold hover:underline"
              >
                Open Shock Chamber →
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: FORENSIC AUDIT SENTINEL */}
      {activeTab === "forensic" && (
        <div className="space-y-6">
          <Card className="p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-indigo-500" />
                  Forensic Audit Sentinel — Big-4 Pre-Flight Workpaper
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Deterministic statutory defense checking 50+ compliance and fraud anomaly vectors across your ledger.
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRecordAuditSnapshot}
                  disabled={isPending}
                  className="text-xs gap-1.5"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
                  Capture Pre-Flight Snapshot
                </Button>
                <Button size="sm" variant="secondary" onClick={() => window.print()} className="text-xs gap-1.5 border">
                  <Printer className="h-3.5 w-3.5" />
                  Print Workpaper (PDF)
                </Button>
              </div>
            </div>

            {/* Vectors Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {auditReport.vectors.map((vec) => (
                <div key={vec.id} className="p-4 rounded-xl border bg-card/60 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs font-semibold">{vec.title}</div>
                      <Badge className="text-[9px] mt-1 capitalize bg-muted text-muted-foreground">
                        {vec.category}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-bold tabular-nums">{vec.score}/100</div>
                      <Badge
                        className={`text-[9px] mt-0.5 capitalize border ${
                          vec.status === "pass"
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                            : vec.status === "warning"
                            ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                            : "bg-rose-500/10 text-rose-500 border-rose-500/30"
                        }`}
                      >
                        {vec.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-muted-foreground bg-muted/30 p-2.5 rounded-lg">
                    {vec.findings.map((f, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className="text-foreground shrink-0">•</span>
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 border-t text-muted-foreground">
                    <span>
                      At-risk penalty: <b className="text-foreground">{inr(vec.exposureRupees)}</b>
                    </span>
                    <Link href={vec.remediationRoute} className="text-primary font-medium hover:underline">
                      {vec.remediationAction} →
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {/* Forensic Anomaly Sentinel Alerts */}
            <div className="space-y-3 pt-4 border-t">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Forensic Anomaly & Duplicate Detection Journal
              </h4>

              {auditReport.anomalies.length > 0 ? (
                <div className="divide-y divide-border/60 border rounded-xl overflow-hidden text-xs">
                  {auditReport.anomalies.map((anom) => (
                    <div key={anom.id} className="p-3 bg-muted/10 hover:bg-muted/30 transition-colors flex items-center justify-between">
                      <div className="space-y-0.5 max-w-[70%]">
                        <div className="font-semibold flex items-center gap-2">
                          <span className="text-primary">{anom.title}</span>
                          <Badge
                            className={`text-[9px] uppercase px-1 py-0 ${
                              anom.severity === "high"
                                ? "bg-rose-500/15 text-rose-500 border-rose-500/30"
                                : anom.severity === "medium"
                                ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {anom.severity}
                          </Badge>
                        </div>
                        <div className="text-muted-foreground text-[11px]">{anom.detail}</div>
                      </div>
                      <div className="text-right tabular-nums font-bold text-foreground">
                        {inr(anom.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-muted-foreground border rounded-xl bg-muted/10">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                  Zero duplicate invoices, sudden counterparty surges, or round-number anomalies detected.
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: DIGITAL TWIN & SHOCK CHAMBER */}
      {activeTab === "digital_twin" && (
        <div className="space-y-6">
          <Card className="p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Activity className="h-5 w-5 text-purple-500" />
                  Financial Digital Twin & Live Stress Chamber
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Simulate macroeconomic shocks (debtor freezes, Section 43B(h) vendor squeezes, and COGS inflation) in real time.
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveScenario}
                  disabled={isPending}
                  className="text-xs gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Save Scenario to Board Records
                </Button>
                <Button size="sm" variant="secondary" onClick={() => window.print()} className="text-xs gap-1.5 border">
                  <Printer className="h-3.5 w-3.5" />
                  Print Shock Report (PDF)
                </Button>
              </div>
            </div>

            {/* Shock Sliders Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl bg-muted/20 border">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Top Debtor Delay</span>
                  <span className="font-bold text-foreground">+{shocks.debtorDelayDays} days</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="90"
                  step="5"
                  value={shocks.debtorDelayDays}
                  onChange={(e) => setShocks((prev) => ({ ...prev, debtorDelayDays: Number(e.target.value) }))}
                  className="w-full accent-primary"
                />
                <div className="text-[10px] text-muted-foreground">Simulates collection slowdown</div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Debtor Default / Insolvency</span>
                  <span className="font-bold text-rose-500">{shocks.debtorDefaultPct}% AR</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="25"
                  step="1"
                  value={shocks.debtorDefaultPct}
                  onChange={(e) => setShocks((prev) => ({ ...prev, debtorDefaultPct: Number(e.target.value) }))}
                  className="w-full accent-rose-500"
                />
                <div className="text-[10px] text-muted-foreground">Direct write-off exposure</div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">COGS & Raw Material Surge</span>
                  <span className="font-bold text-amber-500">+{shocks.cogsInflationPct}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="20"
                  step="1"
                  value={shocks.cogsInflationPct}
                  onChange={(e) => setShocks((prev) => ({ ...prev, cogsInflationPct: Number(e.target.value) }))}
                  className="w-full accent-amber-500"
                />
                <div className="text-[10px] text-muted-foreground">Direct margin erosion</div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">MSME 15-Day Terms Compression</span>
                  <span className={`font-bold ${shocks.msmeTermsCompression ? "text-primary" : "text-muted-foreground"}`}>
                    {shocks.msmeTermsCompression ? "Enforced" : "Standard"}
                  </span>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShocks((prev) => ({ ...prev, msmeTermsCompression: !prev.msmeTermsCompression }))}
                    className={`w-full py-1.5 px-3 rounded text-xs font-semibold border transition-all ${
                      shocks.msmeTermsCompression
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {shocks.msmeTermsCompression ? "Active (43B(h) Priority)" : "Off (Standard terms)"}
                  </button>
                </div>
                <div className="text-[10px] text-muted-foreground">Accelerated vendor cash drain</div>
              </div>
            </div>

            {/* Simulation Results HUD */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl border bg-card/60">
                <div className="text-xs text-muted-foreground font-medium">Post-Shock Runway</div>
                <div className="text-2xl font-bold mt-1 text-foreground tabular-nums">
                  {liveTwin.impact.simulatedRunwayMonths} <span className="text-xs text-muted-foreground">months</span>
                </div>
                <div className="text-xs text-rose-500 mt-1 font-medium">
                  -{liveTwin.impact.runwayContractedMonths} months contracted
                </div>
              </div>

              <div className="p-4 rounded-xl border bg-card/60">
                <div className="text-xs text-muted-foreground font-medium">Immediate Cash Shortfall</div>
                <div className="text-2xl font-bold mt-1 text-rose-500 tabular-nums">
                  {inr(liveTwin.impact.immediateCashShortfall)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Direct liquidity deficit</div>
              </div>

              <div className="p-4 rounded-xl border bg-card/60">
                <div className="text-xs text-muted-foreground font-medium">Annual EBITDA Hit</div>
                <div className="text-2xl font-bold mt-1 text-foreground tabular-nums">
                  {inr(liveTwin.impact.ebitdaImpactAnnual)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">EBITDA margin compression</div>
              </div>

              <div className="p-4 rounded-xl border bg-card/60">
                <div className="text-xs text-muted-foreground font-medium">Covenant Breach Risk</div>
                <div className="mt-2">
                  <Badge className={`text-xs px-2.5 py-1 capitalize border ${covenantBadgeColor}`}>
                    {liveTwin.impact.covenantBreachRisk} Risk
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1.5">
                  Working Capital Gap: {inr(liveTwin.impact.workingCapitalGap)}
                </div>
              </div>
            </div>

            {/* Autonomous Mitigation Levers */}
            <div className="space-y-3 pt-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Autonomous Defensive Playbooks & Liquidity Restoration Levers
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {liveTwin.mitigations.map((mit) => (
                  <div key={mit.id} className="p-4 rounded-xl border bg-primary/5 border-primary/20 space-y-3 flex flex-col justify-between">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Badge className="text-[9px] uppercase bg-primary/15 text-primary border-primary/30">
                          {mit.category}
                        </Badge>
                        <span className="text-xs font-bold text-emerald-500">+{mit.runwayRestoredMonths}m Runway</span>
                      </div>
                      <div className="text-xs font-bold text-foreground">{mit.title}</div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{mit.description}</p>
                    </div>

                    <div className="pt-2 border-t border-primary/10 flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">Unlocks {inr(mit.cashUnlocked)}</span>
                      <Link href={mit.actionRoute}>
                        <Button size="sm" className="text-[11px] h-7 px-2.5 gap-1 bg-primary text-primary-foreground">
                          {mit.actionLabel}
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
