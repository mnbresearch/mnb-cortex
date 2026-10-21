"use client";

import * as React from "react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  AlertTriangle,
  Flame,
  Clock,
  TrendingUp,
  FileCheck2,
  ArrowRight,
  Sparkles,
  Building2,
} from "lucide-react";
import {
  type SolvencyScorecardResult,
  type HealthStatus,
  calculateSolvencyScore,
} from "@/lib/solvency-scorecard";

export interface SolvencyScorecardProps {
  scorecard?: SolvencyScorecardResult;
  metrics?: {
    cashBalance: number;
    monthlyBurn: number;
    totalReceivables: number;
    overdueReceivables: number;
    dsoDays: number;
    grossMarginPct: number;
    advanceTaxPaidPct: number;
    hasGstDiscrepancy?: boolean;
  };
  className?: string;
}

const PRESET_PROFILES = {
  default: {
    label: "Standard SME",
    metrics: {
      cashBalance: 24_00_000,
      monthlyBurn: 6_00_000,
      totalReceivables: 14_00_000,
      overdueReceivables: 2_50_000,
      dsoDays: 38,
      grossMarginPct: 36,
      advanceTaxPaidPct: 75,
      hasGstDiscrepancy: false,
    },
  },
  services: {
    label: "IT / Services",
    metrics: {
      cashBalance: 32_00_000,
      monthlyBurn: 7_50_000,
      totalReceivables: 18_00_000,
      overdueReceivables: 1_20_000,
      dsoDays: 28,
      grossMarginPct: 52,
      advanceTaxPaidPct: 85,
      hasGstDiscrepancy: false,
    },
  },
  manufacturing: {
    label: "Manufacturing",
    metrics: {
      cashBalance: 18_00_000,
      monthlyBurn: 9_00_000,
      totalReceivables: 35_00_000,
      overdueReceivables: 8_50_000,
      dsoDays: 54,
      grossMarginPct: 24,
      advanceTaxPaidPct: 60,
      hasGstDiscrepancy: true,
    },
  },
  distribution: {
    label: "Wholesale / Retail",
    metrics: {
      cashBalance: 12_00_000,
      monthlyBurn: 4_50_000,
      totalReceivables: 22_00_000,
      overdueReceivables: 4_80_000,
      dsoDays: 42,
      grossMarginPct: 16,
      advanceTaxPaidPct: 70,
      hasGstDiscrepancy: false,
    },
  },
};

export function SolvencyScorecardCard({ scorecard, metrics, className }: SolvencyScorecardProps) {
  const [activeProfile, setActiveProfile] = useState<keyof typeof PRESET_PROFILES>("default");

  const effectiveMetrics = metrics ?? PRESET_PROFILES[activeProfile].metrics;
  const result = scorecard ?? calculateSolvencyScore(effectiveMetrics);

  function getStatusColor(status: HealthStatus) {
    switch (status) {
      case "optimal":
        return "text-emerald-500 bg-emerald-500";
      case "adequate":
        return "text-blue-500 bg-blue-500";
      case "warning":
        return "text-amber-500 bg-amber-500";
      case "critical":
        return "text-rose-500 bg-rose-500";
    }
  }

  function getGradeBadge(grade: string) {
    if (grade.startsWith("A")) {
      return <Badge className="bg-emerald-500 text-white font-mono text-sm px-2.5 py-0.5">{grade}</Badge>;
    }
    if (grade === "B") {
      return <Badge className="bg-blue-500 text-white font-mono text-sm px-2.5 py-0.5">{grade}</Badge>;
    }
    if (grade === "C") {
      return <Badge className="bg-amber-500 text-white font-mono text-sm px-2.5 py-0.5">{grade}</Badge>;
    }
    return <Badge className="bg-rose-500 text-white font-mono text-sm px-2.5 py-0.5">{grade}</Badge>;
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Cortex Solvency &amp; Resilience Scorecard</CardTitle>
              <CardDescription>Composite operational health index derived from live financial metrics</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getGradeBadge(result.grade)}
            <span className="text-xs font-medium text-muted-foreground">{result.gradeLabel}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Industry Model Preset Switcher (when not pinned to external metrics) */}
        {!metrics && (
          <div className="flex items-center gap-1.5 rounded-lg border bg-muted/30 p-1 text-xs">
            <span className="text-muted-foreground px-2 flex items-center gap-1 shrink-0 font-medium">
              <Building2 className="h-3.5 w-3.5 text-primary" /> Sector Benchmark:
            </span>
            {(Object.keys(PRESET_PROFILES) as (keyof typeof PRESET_PROFILES)[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setActiveProfile(k)}
                className={`flex-1 py-1 px-2 rounded-md font-medium transition-all text-center truncate ${
                  activeProfile === k
                    ? "bg-background shadow-xs text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {PRESET_PROFILES[k].label}
              </button>
            ))}
          </div>
        )}

        {/* Main Score Gauge */}
        <div className="rounded-xl border bg-muted/30 p-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Overall Solvency Index</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-3xl font-extrabold tracking-tight text-foreground font-mono">{result.overallScore}</span>
              <span className="text-xs text-muted-foreground font-medium">/ 100</span>
            </div>
          </div>
          <div className="flex-1 max-w-sm">
            <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden border">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  result.overallScore >= 75 ? "bg-emerald-500" : result.overallScore >= 60 ? "bg-blue-500" : result.overallScore >= 40 ? "bg-amber-500" : "bg-rose-500"
                }`}
                style={{ width: `${result.overallScore}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>Distressed</span>
              <span>Vulnerable</span>
              <span>Stable</span>
              <span>Robust</span>
            </div>
          </div>
        </div>

        {/* 4 Pillars Grid */}
        <div className="grid sm:grid-cols-2 gap-3">
          {/* 1. Liquidity */}
          <div className="rounded-lg border p-3.5 bg-background space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold flex items-center gap-1.5 text-foreground">
                <Flame className="h-3.5 w-3.5 text-primary" /> Cash Runway &amp; Burn
              </span>
              <span className="font-mono font-bold">{result.dimensions.liquidity.score} / 25</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full ${getStatusColor(result.dimensions.liquidity.status)}`}
                style={{ width: `${(result.dimensions.liquidity.score / 25) * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{result.dimensions.liquidity.note}</p>
          </div>

          {/* 2. Receivables */}
          <div className="rounded-lg border p-3.5 bg-background space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold flex items-center gap-1.5 text-foreground">
                <Clock className="h-3.5 w-3.5 text-primary" /> Receivables &amp; 43B(h) Aging
              </span>
              <span className="font-mono font-bold">{result.dimensions.receivables.score} / 25</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full ${getStatusColor(result.dimensions.receivables.status)}`}
                style={{ width: `${(result.dimensions.receivables.score / 25) * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{result.dimensions.receivables.note}</p>
          </div>

          {/* 3. Margins */}
          <div className="rounded-lg border p-3.5 bg-background space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold flex items-center gap-1.5 text-foreground">
                <TrendingUp className="h-3.5 w-3.5 text-primary" /> Gross Margin Stability
              </span>
              <span className="font-mono font-bold">{result.dimensions.margins.score} / 25</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full ${getStatusColor(result.dimensions.margins.status)}`}
                style={{ width: `${(result.dimensions.margins.score / 25) * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{result.dimensions.margins.note}</p>
          </div>

          {/* 4. Compliance */}
          <div className="rounded-lg border p-3.5 bg-background space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold flex items-center gap-1.5 text-foreground">
                <FileCheck2 className="h-3.5 w-3.5 text-primary" /> Statutory Tax &amp; GST Defense
              </span>
              <span className="font-mono font-bold">{result.dimensions.compliance.score} / 25</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full ${getStatusColor(result.dimensions.compliance.status)}`}
                style={{ width: `${(result.dimensions.compliance.score / 25) * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{result.dimensions.compliance.note}</p>
          </div>
        </div>

        {/* Action Priority Banner */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-start gap-2.5 text-xs">
          <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold text-foreground">Immediate Financial Action:</span>
            <p className="text-muted-foreground">{result.topAction}</p>
          </div>
        </div>

        {/* Critical Alerts (if any) */}
        {result.criticalAlerts.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="text-xs font-semibold text-rose-500 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> High-Risk Solvency Exposures ({result.criticalAlerts.length})
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 pl-4 list-disc">
              {result.criticalAlerts.map((alert, i) => (
                <li key={i}>{alert}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
