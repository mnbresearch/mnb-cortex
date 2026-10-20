"use client";

import * as React from "react";
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

export function SolvencyScorecardCard({ scorecard, metrics, className }: SolvencyScorecardProps) {
  const result =
    scorecard ??
    (metrics
      ? calculateSolvencyScore(metrics)
      : calculateSolvencyScore({
          cashBalance: 24_00_000,
          monthlyBurn: 6_00_000,
          totalReceivables: 14_00_000,
          overdueReceivables: 2_50_000,
          dsoDays: 38,
          grossMarginPct: 36,
          advanceTaxPaidPct: 75,
          hasGstDiscrepancy: false,
        }));

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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Liquidity */}
          <div className="p-3 rounded-lg border bg-background space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-foreground">
                <Flame className="h-3.5 w-3.5 text-amber-500" /> Cash Runway &amp; Liquidity
              </span>
              <span className="font-mono text-muted-foreground">{result.dimensions.liquidity.score}/25</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full ${getStatusColor(result.dimensions.liquidity.status).split(" ")[1]}`}
                style={{ width: `${(result.dimensions.liquidity.score / 25) * 100}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">{result.dimensions.liquidity.note}</p>
          </div>

          {/* Receivables */}
          <div className="p-3 rounded-lg border bg-background space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-foreground">
                <Clock className="h-3.5 w-3.5 text-blue-500" /> Receivables &amp; MSME 43B(h)
              </span>
              <span className="font-mono text-muted-foreground">{result.dimensions.receivables.score}/25</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full ${getStatusColor(result.dimensions.receivables.status).split(" ")[1]}`}
                style={{ width: `${(result.dimensions.receivables.score / 25) * 100}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">{result.dimensions.receivables.note}</p>
          </div>

          {/* Margins */}
          <div className="p-3 rounded-lg border bg-background space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-foreground">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Unit Economics &amp; Gross Margin
              </span>
              <span className="font-mono text-muted-foreground">{result.dimensions.margins.score}/25</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full ${getStatusColor(result.dimensions.margins.status).split(" ")[1]}`}
                style={{ width: `${(result.dimensions.margins.score / 25) * 100}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">{result.dimensions.margins.note}</p>
          </div>

          {/* Compliance */}
          <div className="p-3 rounded-lg border bg-background space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-foreground">
                <FileCheck2 className="h-3.5 w-3.5 text-purple-500" /> Statutory Tax &amp; GST Defense
              </span>
              <span className="font-mono text-muted-foreground">{result.dimensions.compliance.score}/25</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full ${getStatusColor(result.dimensions.compliance.status).split(" ")[1]}`}
                style={{ width: `${(result.dimensions.compliance.score / 25) * 100}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">{result.dimensions.compliance.note}</p>
          </div>
        </div>

        {/* Critical Alerts */}
        {result.criticalAlerts.length > 0 && (
          <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 space-y-1.5">
            <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> High-Priority Solvency Attention Items
            </div>
            <ul className="text-xs space-y-1 text-muted-foreground">
              {result.criticalAlerts.map((alert, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-amber-500 font-bold">•</span>
                  <span>{alert}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Top Operational Action */}
        <div className="p-3.5 rounded-lg border border-primary/20 bg-primary/5 flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Top Recommended COO Action
            </div>
            <p className="text-xs text-foreground font-medium">{result.topAction}</p>
          </div>
          <a
            href="/receivables"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline shrink-0"
          >
            Take action <ArrowRight className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
