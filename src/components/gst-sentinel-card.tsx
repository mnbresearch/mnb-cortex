"use client";

import * as React from "react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Scale,
  Copy,
  Check,
  Calendar,
  FileText,
  HelpCircle,
} from "lucide-react";
import {
  runGstSentinelAudit,
  STATUTORY_NOTICE_PCT_THRESHOLD,
  STATUTORY_NOTICE_RUPEES_THRESHOLD,
  SECTION_50_OUTWARD_INTEREST_RATE_PCT,
  SECTION_50_ITC_INTEREST_RATE_PCT,
} from "@/lib/gst-sentinel";

export function GstSentinelCard({ className }: { className?: string }) {
  // GSTR-1 vs 3B Liability Inputs
  const [gstr1Tax, setGstr1Tax] = useState<number>(350000);
  const [gstr3bTax, setGstr3bTax] = useState<number>(270000);
  const [daysLate88c, setDaysLate88c] = useState<number>(15);

  // GSTR-3B vs 2B ITC Inputs
  const [gstr3bItc, setGstr3bItc] = useState<number>(180000);
  const [gstr2bItc, setGstr2bItc] = useState<number>(130000);
  const [daysLate88d, setDaysLate88d] = useState<number>(15);

  const [copiedType, setCopiedType] = useState<"88c" | "88d" | null>(null);

  const audit = runGstSentinelAudit(
    {
      taxPeriod: "Current Tax Period",
      gstr1Liability: { igst: gstr1Tax, cgst: 0, sgst: 0 },
      gstr3bLiabilityPaid: { igst: gstr3bTax, cgst: 0, sgst: 0 },
      daysLateSinceDueDate: daysLate88c,
    },
    {
      taxPeriod: "Current Tax Period",
      gstr3bItcClaimed: { igst: gstr3bItc, cgst: 0, sgst: 0 },
      gstr2bItcAvailable: { igst: gstr2bItc, cgst: 0, sgst: 0 },
      daysLateSinceDueDate: daysLate88d,
    }
  );

  const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

  function copyTemplate(text: string, type: "88c" | "88d") {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-danger/10 text-danger">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">
                GST Notice Risk Sentinel &bull; Rule 88C (DRC-01B) &amp; Rule 88D (DRC-01C)
              </CardTitle>
              <CardDescription>
                Algorithmic tax mismatch scanner &bull; Prevents portal blocking under Rule 59(6)
              </CardDescription>
            </div>
          </div>
          <div>
            {audit.overallComplianceStatus === "critical_notice_risk" ? (
              <Badge className="bg-danger/10 text-danger border-danger/20 text-xs flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Critical Notice Risk
              </Badge>
            ) : audit.overallComplianceStatus === "action_required" ? (
              <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-xs">
                Caution: Review Before Filing
              </Badge>
            ) : (
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> Safe: Within Tolerances
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Rule 88C vs Rule 88D Side-by-Side Panels */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Rule 88C: Outward Tax Liability */}
          <div className={`rounded-xl border p-4 space-y-3 ${audit.rule88c.breachesStatutoryThreshold ? "border-danger/30 bg-danger/5" : "bg-card"}`}>
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm flex items-center gap-1.5">
                <Scale className="h-4 w-4 text-primary" /> Rule 88C: GSTR-1 vs 3B Liability
              </div>
              <Badge
                className={
                  audit.rule88c.riskLevel === "danger"
                    ? "bg-danger/10 text-danger border-danger/20 text-[10px]"
                    : audit.rule88c.riskLevel === "warning"
                    ? "bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]"
                    : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]"
                }
              >
                {audit.rule88c.riskLevel === "danger" ? "DRC-01B Triggered" : audit.rule88c.riskLevel === "warning" ? "Caution" : "Safe"}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">GSTR-1 Outward Tax (₹)</label>
                <input
                  type="number"
                  value={gstr1Tax}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGstr1Tax(Number(e.target.value) || 0)}
                  className="w-full rounded-md border bg-background px-2.5 py-1 text-xs font-mono tabular-nums outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">GSTR-3B Tax Paid (₹)</label>
                <input
                  type="number"
                  value={gstr3bTax}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGstr3bTax(Number(e.target.value) || 0)}
                  className="w-full rounded-md border bg-background px-2.5 py-1 text-xs font-mono tabular-nums outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="rounded-lg border p-2.5 bg-background text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Differential Tax:</span>
                <span className={`font-mono font-medium ${audit.rule88c.excessLiability > 0 ? "text-danger" : ""}`}>
                  {inr(audit.rule88c.excessLiability)} ({audit.rule88c.excessPct}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Statutory Threshold:</span>
                <span className="font-mono text-muted-foreground">&gt; ₹25,000 &amp; &gt; 20%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sec 50 Interest ({SECTION_50_OUTWARD_INTEREST_RATE_PCT}% p.a.):</span>
                <span className="font-mono font-medium text-amber-600 dark:text-amber-400">
                  {inr(audit.rule88c.interestExposureSec50)} ({daysLate88c}d)
                </span>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {audit.rule88c.statusMessage}
            </p>

            {audit.rule88c.breachesStatutoryThreshold && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyTemplate(audit.rule88c.justificationTemplate, "88c")}
                className="w-full text-xs h-8 gap-1.5 border-danger/30 text-danger hover:bg-danger/10"
              >
                {copiedType === "88c" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedType === "88c" ? "Copied DRC-01B Part B Reply" : "Copy Form DRC-01B Part B Reply"}
              </Button>
            )}
          </div>

          {/* Rule 88D: Inward ITC Claimed */}
          <div className={`rounded-xl border p-4 space-y-3 ${audit.rule88d.breachesStatutoryThreshold ? "border-danger/30 bg-danger/5" : "bg-card"}`}>
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-primary" /> Rule 88D: GSTR-3B vs 2B ITC
              </div>
              <Badge
                className={
                  audit.rule88d.riskLevel === "danger"
                    ? "bg-danger/10 text-danger border-danger/20 text-[10px]"
                    : audit.rule88d.riskLevel === "warning"
                    ? "bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]"
                    : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]"
                }
              >
                {audit.rule88d.riskLevel === "danger" ? "DRC-01C Triggered" : audit.rule88d.riskLevel === "warning" ? "Caution" : "Safe"}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">GSTR-3B ITC Claimed (₹)</label>
                <input
                  type="number"
                  value={gstr3bItc}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGstr3bItc(Number(e.target.value) || 0)}
                  className="w-full rounded-md border bg-background px-2.5 py-1 text-xs font-mono tabular-nums outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">GSTR-2B ITC Available (₹)</label>
                <input
                  type="number"
                  value={gstr2bItc}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGstr2bItc(Number(e.target.value) || 0)}
                  className="w-full rounded-md border bg-background px-2.5 py-1 text-xs font-mono tabular-nums outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="rounded-lg border p-2.5 bg-background text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Excess ITC Claimed:</span>
                <span className={`font-mono font-medium ${audit.rule88d.excessItc > 0 ? "text-danger" : ""}`}>
                  {inr(audit.rule88d.excessItc)} ({audit.rule88d.excessPct}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Statutory Threshold:</span>
                <span className="font-mono text-muted-foreground">&gt; ₹25,000 &amp; &gt; 20%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sec 50(3) Interest ({SECTION_50_ITC_INTEREST_RATE_PCT}% p.a.):</span>
                <span className="font-mono font-medium text-amber-600 dark:text-amber-400">
                  {inr(audit.rule88d.interestExposureSec50)} ({daysLate88d}d)
                </span>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {audit.rule88d.statusMessage}
            </p>

            {audit.rule88d.breachesStatutoryThreshold && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyTemplate(audit.rule88d.justificationTemplate, "88d")}
                className="w-full text-xs h-8 gap-1.5 border-danger/30 text-danger hover:bg-danger/10"
              >
                {copiedType === "88d" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedType === "88d" ? "Copied DRC-01C Part B Reply" : "Copy Form DRC-01C Part B Reply"}
              </Button>
            )}
          </div>
        </div>

        {/* Portal Blocking Advisory */}
        {audit.portalBlockingRisk && (
          <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-xs flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-danger mt-0.5 shrink-0" />
            <div className="text-danger leading-relaxed">
              <span className="font-semibold">Rule 59(6) Portal Lock Warning:</span> If DRC-01B or DRC-01C is not responded to or paid via DRC-03 within <b>7 days</b> of notification, GSTN automatically suspends GSTR-1 generation for the following tax period and initiates Section 79 recovery proceedings without further show-cause notice.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
