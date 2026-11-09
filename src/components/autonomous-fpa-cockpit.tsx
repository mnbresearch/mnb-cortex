"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp, TrendingDown, RefreshCw, Sliders, Presentation, ArrowRight, CheckCircle2 } from "lucide-react";
import { inr, mdToHtml } from "@/lib/utils";
import { saveFpaModel, type FpaModelData, type FpaDriver, type FpaBudgetLine } from "@/lib/actions";

interface Props {
  initialModel: FpaModelData;
  canEdit: boolean;
}

export function AutonomousFpaCockpit({ initialModel, canEdit }: Props) {
  const router = useRouter();
  const [model, setModel] = useState<FpaModelData>(initialModel);
  const [activeTab, setActiveTab] = useState<"drivers" | "budget" | "narrative">("drivers");
  const [isAuditing, setIsAuditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [aiReport, setAiReport] = useState<string | null>(model.varianceCommentary);

  const totalBudget = model.budgetLines.reduce((acc, l) => acc + l.budgetMonthly, 0);
  const totalActual = model.budgetLines.reduce((acc, l) => acc + l.actualMonthly, 0);
  const netVariancePct = totalBudget > 0 ? ((totalActual - totalBudget) / totalBudget) * 100 : 0;

  function handleDriverChange(driverId: string, currentVal: number) {
    setModel((prev) => ({
      ...prev,
      drivers: prev.drivers.map((d) => (d.id === driverId ? { ...d, current: currentVal } : d)),
    }));
  }

  async function handleSaveModel() {
    const fd = new FormData();
    fd.append("fiscalYear", model.fiscalYear);
    fd.append("name", model.name);
    fd.append("drivers", JSON.stringify(model.drivers));
    fd.append("budgetLines", JSON.stringify(model.budgetLines));
    if (aiReport) fd.append("varianceCommentary", aiReport);
    if (model.executiveSummary) fd.append("executiveSummary", model.executiveSummary);

    startTransition(async () => {
      await saveFpaModel(fd);
      router.refresh();
    });
  }

  async function runAiFpaAudit() {
    setIsAuditing(true);
    try {
      const summaryContext = `Fiscal Year: ${model.fiscalYear}
Drivers:
${model.drivers.map((d) => `- ${d.name} (${d.category}): Baseline ${d.baseline} ${d.unit} -> Current ${d.current} ${d.unit} (Elasticity: ${d.elasticity})`).join("\n")}

Budget vs Actuals:
${model.budgetLines.map((l) => `- ${l.category}: Budget ${inr(l.budgetMonthly)}, Actual ${inr(l.actualMonthly)} (Variance: ${l.variancePct}%)`).join("\n")}`;

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "fpa_model",
          input: `Analyze budget vs actuals and evaluate operational sensitivity levers across our financial structure.`,
          context: summaryContext,
        }),
      });
      const data = await res.json();
      if (data.ok && data.output) {
        setAiReport(data.output);
        setActiveTab("narrative");
      }
    } catch {
      // Graceful fallback
    } finally {
      setIsAuditing(false);
    }
  }

  async function generateBoardNarrative() {
    setIsAuditing(true);
    try {
      const summaryContext = `Fiscal Year: ${model.fiscalYear}
Net Topline Variance: ${netVariancePct.toFixed(1)}%
Budget vs Actuals:
${model.budgetLines.map((l) => `- ${l.category}: Budget ${inr(l.budgetMonthly)}, Actual ${inr(l.actualMonthly)} (${l.flag})`).join("\n")}`;

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "fpa_narrative",
          input: `Synthesize operational actuals into an executive-ready board pack commentary with Price-Volume-Mix decomposition.`,
          context: summaryContext,
        }),
      });
      const data = await res.json();
      if (data.ok && data.output) {
        setAiReport(data.output);
        setActiveTab("narrative");
      }
    } catch {
      // Graceful fallback
    } finally {
      setIsAuditing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-card/60 backdrop-blur border">
          <div className="text-xs font-medium text-muted-foreground">Budgeted Run-rate</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">{inr(totalBudget)}</div>
          <div className="text-xs text-muted-foreground mt-1">Monthly baseline</div>
        </Card>
        <Card className="p-4 bg-card/60 backdrop-blur border">
          <div className="text-xs font-medium text-muted-foreground">Actual Run-rate</div>
          <div className="text-2xl font-bold mt-1 tabular-nums text-foreground">{inr(totalActual)}</div>
          <div className="text-xs text-muted-foreground mt-1">Ledger actuals</div>
        </Card>
        <Card className="p-4 bg-card/60 backdrop-blur border">
          <div className="text-xs font-medium text-muted-foreground">Net Variance</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`text-2xl font-bold tabular-nums ${netVariancePct >= 0 ? "text-emerald-500" : "text-amber-500"}`}>
              {netVariancePct >= 0 ? "+" : ""}{netVariancePct.toFixed(1)}%
            </span>
            {netVariancePct >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-500" /> : <TrendingDown className="h-4 w-4 text-amber-500" />}
          </div>
          <div className="text-xs text-muted-foreground mt-1">vs Operating Plan</div>
        </Card>
        <Card className="p-4 bg-card/60 backdrop-blur border flex flex-col justify-between">
          <div>
            <div className="text-xs font-medium text-muted-foreground">Active Model</div>
            <div className="text-sm font-semibold truncate mt-0.5">{model.name}</div>
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={runAiFpaAudit}
              disabled={isAuditing}
              className="text-xs h-7 gap-1"
            >
              <Sparkles className="h-3 w-3 text-primary" />
              {isAuditing ? "Auditing..." : "AI FP&A"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={generateBoardNarrative}
              disabled={isAuditing}
              className="text-xs h-7 gap-1"
            >
              <Presentation className="h-3 w-3 text-primary" />
              Board Pack
            </Button>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={activeTab === "drivers" ? "default" : "ghost"}
            onClick={() => setActiveTab("drivers")}
            className="text-xs gap-1.5"
          >
            <Sliders className="h-3.5 w-3.5" />
            Operational Drivers ({model.drivers.length})
          </Button>
          <Button
            size="sm"
            variant={activeTab === "budget" ? "default" : "ghost"}
            onClick={() => setActiveTab("budget")}
            className="text-xs gap-1.5"
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Budget vs Actuals ({model.budgetLines.length})
          </Button>
          <Button
            size="sm"
            variant={activeTab === "narrative" ? "default" : "ghost"}
            onClick={() => setActiveTab("narrative")}
            className="text-xs gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI Board Commentary
          </Button>
        </div>

        {canEdit && (
          <Button size="sm" onClick={handleSaveModel} disabled={isPending} className="text-xs gap-1">
            {isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Save Changes
          </Button>
        )}
      </div>

      {/* Driver Levers */}
      {activeTab === "drivers" && (
        <Card className="p-6 space-y-6">
          <div>
            <h3 className="text-base font-semibold">Driver-Based Sensitivity Levers (Abacum & Drivetrain Parity)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live operational metrics bound to financial outcomes. Adjust sliders to see projected operational elasticity.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {model.drivers.map((driver) => (
              <div key={driver.id} className="p-4 rounded-lg border bg-secondary/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium">{driver.name}</span>
                    <Badge className="ml-2 text-[10px] capitalize bg-muted/50">
                      {driver.category.replace("_", " ")}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Elasticity: <span className="font-semibold text-foreground">{driver.elasticity > 0 ? "+" : ""}{driver.elasticity}x</span>
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Baseline: {driver.baseline} {driver.unit}</span>
                  <span className="font-bold text-foreground tabular-nums">Current: {driver.current} {driver.unit}</span>
                </div>

                <input
                  type="range"
                  min={Math.round(driver.baseline * 0.5)}
                  max={Math.round(driver.baseline * 1.8)}
                  step={driver.unit === "%" ? 0.5 : driver.unit === "FTE" ? 1 : Math.round(driver.baseline * 0.02)}
                  value={driver.current}
                  disabled={!canEdit}
                  onChange={(e) => handleDriverChange(driver.id, Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Budget vs Actuals */}
      {activeTab === "budget" && (
        <Card className="p-6 space-y-4">
          <div>
            <h3 className="text-base font-semibold">Budget vs Actuals (P&L Breakdown)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Automated line-item variance tracking comparing operating budget against actuals.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2">Line Item</th>
                  <th className="pb-2 text-right">Budget (₹)</th>
                  <th className="pb-2 text-right">Actual (₹)</th>
                  <th className="pb-2 text-right">Variance (%)</th>
                  <th className="pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {model.budgetLines.map((line, idx) => (
                  <tr key={idx} className="hover:bg-accent/30 transition-colors">
                    <td className="py-2.5 font-medium">{line.category}</td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">{inr(line.budgetMonthly)}</td>
                    <td className="py-2.5 text-right tabular-nums font-semibold">{inr(line.actualMonthly)}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      <span className={line.variancePct > 0 ? "text-emerald-500 font-medium" : "text-amber-500 font-medium"}>
                        {line.variancePct > 0 ? "+" : ""}{line.variancePct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <Badge
                        className={`text-[10px] capitalize ${
                          line.flag === "favorable"
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                            : line.flag === "unfavorable"
                            ? "bg-rose-500/10 text-rose-500 border-rose-500/30"
                            : "bg-muted/50 text-muted-foreground"
                        }`}
                      >
                        {line.flag}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* AI Narrative */}
      {activeTab === "narrative" && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">AI Executive & Board Commentary</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Audit-grade Price-Volume-Mix decomposition and strategic commentary derived from live numbers.
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={runAiFpaAudit} disabled={isAuditing} className="text-xs">
                Re-run Analysis
              </Button>
            </div>
          </div>

          {aiReport ? (
            <div
              className="prose prose-sm dark:prose-invert max-w-none border rounded-lg p-5 bg-background text-xs leading-relaxed"
              dangerouslySetInnerHTML={{ __html: mdToHtml(aiReport) }}
            />
          ) : (
            <div className="py-12 text-center text-muted-foreground text-xs">
              No commentary generated yet. Click &ldquo;AI FP&amp;A&rdquo; or &ldquo;Board Pack&rdquo; above to analyze budget variances.
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
