import { getEnterpriseHudData } from "@/lib/actions";
import { EnterpriseCommandHud } from "@/components/enterprise-hud";
import { ShieldCheck, FileCheck2, Scale, AlertTriangle, ArrowRight, Bot, Download } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Audit Sentinel — Big-4 Pre-Flight Defense & Forensic Readiness",
  description: "Continuous statutory audit defense, CARO 2020 pre-flight vectors, duplicate invoice anomaly scanning, and Section 43B(h) compliance for Indian enterprises.",
};

export default async function AuditPage() {
  const hudData = await getEnterpriseHudData();
  const auditReport = hudData.pillar2_forensic;

  return (
    <div className="space-y-8 p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-2">
            <ShieldCheck className="h-3.5 w-3.5" />
            Continuous Forensic Audit Sentinel · CARO 2020 & Companies Act §143(3)
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Audit Sentinel & Pre-Flight Defense
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Live pre-flight qualification defense for your statutory audit. Scans 50+ forensic accounting vectors across invoices, GSTR-2B ITC, TDS rates, and Section 43B(h) MSME terms.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href="/workspace?agent=fin.audit">
            <Button variant="outline" className="gap-2 text-xs h-9">
              <Bot className="h-4 w-4 text-primary" />
              Dispatch Forensic Audit Agent
            </Button>
          </Link>
          <Link href="/compliance">
            <Button variant="default" className="gap-2 text-xs h-9">
              <FileCheck2 className="h-4 w-4" />
              Statutory Calendar
            </Button>
          </Link>
        </div>
      </div>

      {/* Highlights Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border-border/80 bg-card/60 backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Audit Readiness Score</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              auditReport.overallScore >= 80 ? "bg-success/15 text-success border border-success/30" : "bg-warning/15 text-warning-foreground border border-warning/30"
            }`}>
              Grade {auditReport.grade}
            </span>
          </div>
          <div className="text-2xl font-bold mt-2">
            {auditReport.overallScore}<span className="text-sm font-normal text-muted-foreground">/100</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Status: <span className="font-semibold text-foreground capitalize">{auditReport.status.replace("_", " ")}</span>
          </p>
        </Card>

        <Card className="p-4 border-border/80 bg-card/60 backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">At-Risk Statutory Exposure</span>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold mt-2 text-amber-600 dark:text-amber-400">
            {inr(auditReport.totalAtRiskExposure)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            43B(h) disallowance + ITC dispute exposure
          </p>
        </Card>

        <Card className="p-4 border-border/80 bg-card/60 backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Clean Statutory Vectors</span>
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold mt-2">
            {auditReport.cleanChecksCount} / {auditReport.totalChecksCount}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Checked against Indian tax & ROC mandates
          </p>
        </Card>

        <Card className="p-4 border-border/80 bg-card/60 backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Forensic Anomalies</span>
            <Scale className="h-4 w-4 text-primary" />
          </div>
          <div className="text-2xl font-bold mt-2">
            {auditReport.anomalies.length}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Duplicate bills or disbursement surges detected
          </p>
        </Card>
      </div>

      {/* Main Enterprise Command HUD Component */}
      <EnterpriseCommandHud initialData={hudData} />
    </div>
  );
}
