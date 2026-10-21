"use client";

import * as React from "react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users2,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  TrendingUp,
  Scale,
  Briefcase,
  CheckCircle2,
  Copy,
  Printer,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import {
  type CouncilExecutionResult,
  type CouncilPersona,
  PERSONA_METADATA,
  fallbackCouncil,
} from "@/lib/ai/council";

const PRESETS = [
  {
    label: "Receivables Discount vs Bad Debt",
    statement: "We have ₹28L in overdue receivables older than 60 days from 4 major distributors. Should we offer an immediate 3% prompt-pay rebate for settlement in 48 hours, or halt supply dispatches and issue formal recovery notices?",
  },
  {
    label: "Inventory Buffer vs Lean Working Capital",
    statement: "Our key raw material supplier is warning of a 12% price hike next month. Should we draw down ₹15L from our cash reserves to stockpile 90 days of inventory, or maintain lean just-in-time stock to safeguard liquidity?",
  },
  {
    label: "Working Capital Loan (14%) vs Stretch Payables",
    statement: "Should we take an unsecured NBFC working capital credit line at 14% p.a. to bridge cash flow, or extend our supplier payables beyond 30 days risking MSME 43B(h) scrutiny?",
  },
  {
    label: "Advance Tax Q3 Provisioning",
    statement: "Q3 advance tax installment is due December 15. How should we allocate cash reserves between advance tax statutory dues, pending vendor payments, and holiday marketing campaigns?",
  },
  {
    label: "0% Dynamic UPI vs 2% Gateway Commission",
    statement: "We collect ₹65L monthly via card/netbanking gateways losing ~₹1.3L in 2% commissions and waiting T+2 for settlement. Should we switch to Cortex 0% fee Dynamic UPI QR links with instant direct bank settlement for all B2B customer invoices?",
  },
];

export function CouncilChamber({ initialContext = "" }: { initialContext?: string }) {
  const [statement, setStatement] = useState(PRESETS[0].statement);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CouncilExecutionResult | null>(() =>
    fallbackCouncil(PRESETS[0].statement)
  );
  const [copied, setCopied] = useState(false);
  const [activePersona, setActivePersona] = useState<CouncilPersona | "all">("all");

  async function handleDeliberate() {
    if (!statement.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/council", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statement }),
      });
      const data = await res.json();
      if (data?.ok && data.result) {
        setResult(data.result);
      } else {
        setResult(fallbackCouncil(statement));
      }
    } catch {
      setResult(fallbackCouncil(statement));
    } finally {
      setLoading(false);
    }
  }

  function copyMarkdown() {
    if (!result) return;
    const md = `
# Executive Council Deliberation: ${result.decisionTitle}
**Problem Statement:** ${result.problemStatement}
**Date:** ${new Date(result.generatedAt).toLocaleDateString()}
**Consensus Recommendation:** ${result.executiveVerdict.consensusRecommendation}
**Confidence Score:** ${result.executiveVerdict.confidenceScore}%

## Primary Tradeoff
${result.executiveVerdict.primaryTradeoff}

## 7-Day Action Plan
${result.executiveVerdict.actionPlan7Days.map((a) => `- [ ] ${a}`).join("\n")}

## C-Suite Assessments
${Object.entries(result.perspectives)
  .map(
    ([_, p]) => `### ${p.role}: ${p.name} (${p.verdict.toUpperCase()})
**Core Argument:** ${p.keyArgument}
**Rationale:**
${p.rationale.map((r) => `- ${r}`).join("\n")}
**Metrics:** ${p.metricsWatched.join(", ")}
`
  )
  .join("\n")}
`.trim();
    navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function getVerdictBadge(verdict: string) {
    switch (verdict) {
      case "strongly_support":
        return <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">Strongly Support</Badge>;
      case "support_with_conditions":
        return <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20">Support with Guardrails</Badge>;
      case "oppose":
        return <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20">Oppose</Badge>;
      default:
        return <Badge className="border-border text-muted-foreground">Neutral / Deliberating</Badge>;
    }
  }

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <Card className="border-primary/20 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users2 className="h-5 w-5 text-primary" />
              Table a High-Stakes Strategic Dilemma
            </CardTitle>
            <Badge className="bg-primary/10 text-primary border-primary/20">4 Autonomous C-Suite Agents</Badge>
          </div>
          <CardDescription>
            Submit any critical operational, financial, or expansion question. Your Fractional CFO, COO, CRO, and Tax Counsel will debate and formulate an actionable verdict.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            rows={3}
            className="w-full rounded-lg border bg-background px-3.5 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Describe the trade-off or challenge your business faces..."
          />

          {/* Quick Presets */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Or choose a common enterprise scenario:</div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setStatement(p.statement)}
                  className="rounded-full border bg-muted/60 px-3 py-1 text-xs font-medium hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-left"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              onClick={handleDeliberate}
              disabled={loading || !statement.trim()}
              className="gap-2 px-6 h-11"
            >
              <Sparkles className="h-4 w-4" />
              {loading ? "Council Deliberating..." : "Convene Executive Council"}
            </Button>
            {result && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={copyMarkdown} className="gap-1.5 h-9">
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? "Copied Memo!" : "Copy Memo"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5 h-9">
                  <Printer className="h-3.5 w-3.5" />
                  Print / PDF
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Deliberation Results */}
      {result && (
        <div className="space-y-6">
          {/* Executive Verdict Banner */}
          <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-card to-primary/5 shadow-md">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Executive Council Verdict &amp; Consensus</CardTitle>
                    <CardDescription>{result.decisionTitle}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Confidence:</span>
                  <Badge className="bg-emerald-500 text-white font-mono text-sm px-2.5 py-0.5">
                    {result.executiveVerdict.confidenceScore}%
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-background/80 border p-4 text-sm font-medium leading-relaxed">
                {result.executiveVerdict.consensusRecommendation}
              </div>

              {/* Tradeoff Breakdown */}
              <div className="rounded-lg border bg-muted/40 p-3.5 text-sm space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Scale className="h-3.5 w-3.5 text-primary" /> Primary Executive Tradeoff
                </div>
                <p className="text-muted-foreground leading-relaxed">{result.executiveVerdict.primaryTradeoff}</p>
              </div>

              {/* 7-Day Action Plan & Mitigations Grid */}
              <div className="grid md:grid-cols-2 gap-4 pt-1">
                <div className="rounded-lg border p-3.5 bg-background space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <ArrowRight className="h-3.5 w-3.5 text-primary" /> 7-Day Tactical Execution Plan
                  </div>
                  <ul className="text-xs space-y-1.5 text-muted-foreground">
                    {result.executiveVerdict.actionPlan7Days.map((act, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="font-mono text-primary font-bold shrink-0">{i + 1}.</span>
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg border p-3.5 bg-background space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-500" /> Downside Risk Guardrails
                  </div>
                  <ul className="text-xs space-y-1.5 text-muted-foreground">
                    {result.executiveVerdict.riskMitigations.map((mit, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-amber-500 font-bold shrink-0">•</span>
                        <span>{mit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Persona Filter Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />
              C-Suite Leadership Perspectives
            </h3>
            <div className="flex items-center gap-1">
              {(["all", "cfo", "coo", "cro", "compliance"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActivePersona(tab)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    activePersona === tab
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {tab === "all" ? "All (4)" : tab.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* 4 C-Suite Persona Cards Grid */}
          <div className="grid md:grid-cols-2 gap-4">
            {(["cfo", "coo", "cro", "compliance"] as const)
              .filter((k) => activePersona === "all" || activePersona === k)
              .map((key) => {
                const p = result.perspectives[key];
                const meta = PERSONA_METADATA[key];
                return (
                  <Card key={key} className="border border-border/80 shadow-sm flex flex-col justify-between">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <CardTitle className="text-sm font-semibold">{meta.role}</CardTitle>
                          <div className="text-xs text-muted-foreground">{meta.name}</div>
                        </div>
                        {getVerdictBadge(p.verdict)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 flex-1 text-xs">
                      {/* Core Argument */}
                      <div className="rounded-md bg-muted/50 p-2.5 font-medium border text-foreground">
                        &ldquo;{p.keyArgument}&rdquo;
                      </div>

                      {/* Rationale */}
                      <div className="space-y-1">
                        <div className="font-semibold text-muted-foreground">Rationale &amp; Analysis:</div>
                        <ul className="space-y-1 list-disc list-inside text-muted-foreground">
                          {p.rationale.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>

                      {/* Metrics & Guardrails */}
                      <div className="pt-2 border-t space-y-1">
                        <div className="flex flex-wrap gap-1 items-center">
                          <span className="font-semibold text-muted-foreground">Monitors:</span>
                          {p.metricsWatched.map((m, i) => (
                            <Badge key={i} className="text-[10px] py-0 px-1.5 border-border text-muted-foreground">
                              {m}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>

          {/* Operational Proposals */}
          {result.proposedActions.length > 0 && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Ready-to-Execute Actions from this Deliberation
                </CardTitle>
                <CardDescription>
                  Actions formulated by the council ready for immediate operational deployment.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {result.proposedActions.map((act, i) => (
                    <div
                      key={i}
                      className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border bg-background"
                    >
                      <div>
                        <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <Badge className="text-[10px] uppercase border-border text-muted-foreground">
                            {act.kind}
                          </Badge>
                          {act.title}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{act.details}</p>
                      </div>
                      <a
                        href="/receivables"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        Execute in Cortex <ChevronRight className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
