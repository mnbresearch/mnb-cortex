"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, Clock, Sparkles, RefreshCw, ArrowRight } from "lucide-react";
import { updateMonthEndChecklistItem, setMonthEndCloseStatus, type CloseChecklistItem } from "@/lib/actions";

interface Props {
  initialPeriod: string;
  initialStatus: "in_progress" | "ready_for_review" | "closed" | "reopened";
  initialItems: CloseChecklistItem[];
  closedAt?: string | null;
}

export function MonthEndCloseCockpit({ initialPeriod, initialStatus, initialItems, closedAt }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<CloseChecklistItem[]>(initialItems);
  const [status, setStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);

  const completedCount = items.filter((i) => i.status === "reconciled").length;
  const exceptionCount = items.filter((i) => i.status === "exception").length;
  const progressPct = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

  async function handleToggleStatus(item: CloseChecklistItem, newStatus: "pending" | "reconciled" | "exception") {
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: newStatus } : it)));
    const fd = new FormData();
    fd.append("itemId", item.id);
    fd.append("status", newStatus);
    fd.append("period", initialPeriod);
    startTransition(async () => {
      await updateMonthEndChecklistItem(fd);
      router.refresh();
    });
  }

  async function handleSetCloseStatus(newStatus: "in_progress" | "ready_for_review" | "closed" | "reopened") {
    setStatus(newStatus);
    const fd = new FormData();
    fd.append("period", initialPeriod);
    fd.append("status", newStatus);
    startTransition(async () => {
      await setMonthEndCloseStatus(fd);
      router.refresh();
    });
  }

  async function runAiAudit() {
    setIsAuditing(true);
    setAiReport(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "close_audit",
          input: `Period: ${initialPeriod}. Items reconciled: ${completedCount}/${items.length}. Exceptions: ${exceptionCount}. Please perform automated continuous close anomaly and variance analysis.`,
        }),
      });
      const data = await res.json();
      if (data?.text) {
        setAiReport(data.text);
      }
    } catch {
      setAiReport("Unable to reach AI controller. Please verify connection and retry.");
    } finally {
      setIsAuditing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header KPI Bar */}
      <Card className="p-6 border-primary/20 bg-card">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold tracking-tight">Month-End Close Cockpit ({initialPeriod})</h2>
              <Badge className={
                status === "closed" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                status === "ready_for_review" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                "bg-primary/10 text-primary border-primary/20"
              }>
                {status.replace(/_/g, " ").toUpperCase()}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Autonomous continuous close, ledger balance verification, and GST/TDS statutory reconciliation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              onClick={runAiAudit}
              disabled={isAuditing}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 min-h-11"
            >
              <Sparkles className="h-4 w-4" />
              {isAuditing ? "Auditing Books..." : "Run AI Close Audit"}
            </Button>
            {status !== "closed" ? (
              <Button
                variant="outline"
                onClick={() => handleSetCloseStatus("closed")}
                disabled={isPending}
                className="gap-2 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 min-h-11"
              >
                <CheckCircle2 className="h-4 w-4" />
                Sign-off & Close Books
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => handleSetCloseStatus("reopened")}
                disabled={isPending}
                className="gap-2 text-muted-foreground min-h-11"
              >
                <RefreshCw className="h-4 w-4" />
                Reopen Period
              </Button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-6 pt-5 border-t">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>Reconciliation Progress: {completedCount} of {items.length} items complete</span>
            <span className="font-semibold text-foreground">{progressPct}%</span>
          </div>
          <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> {completedCount} Reconciled</span>
            <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> {exceptionCount} Exceptions</span>
            <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-muted-foreground" /> {items.length - completedCount - exceptionCount} Pending</span>
          </div>
        </div>
      </Card>

      {/* AI Controller Analysis Output */}
      {aiReport && (
        <Card className="p-6 border-primary/30 bg-primary/5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-base">Autonomous Financial Controller Verdict</h3>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap font-sans text-sm leading-relaxed">
            {aiReport}
          </div>
        </Card>
      )}

      {/* Reconciliation Checklist Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Continuous Reconciliation Items
        </h3>
        {items.map((item) => (
          <Card key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card hover:bg-accent/20 transition-colors">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                {item.status === "reconciled" ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : item.status === "exception" ? (
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                ) : (
                  <Clock className="h-5 w-5 text-muted-foreground/60" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground">{item.title}</span>
                  <Badge className="text-[10px] uppercase font-mono px-1.5 py-0 bg-secondary text-muted-foreground">
                    {item.category}
                  </Badge>
                </div>
                {item.note && (
                  <p className="text-xs text-muted-foreground mt-0.5">{item.note}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-center">
              <Button
                size="sm"
                variant={item.status === "reconciled" ? "default" : "outline"}
                onClick={() => handleToggleStatus(item, "reconciled")}
                className="h-8 text-xs min-h-8 min-w-8"
                aria-label={`Mark ${item.title} reconciled`}
              >
                Reconciled
              </Button>
              <Button
                size="sm"
                variant={item.status === "exception" ? "default" : "outline"}
                onClick={() => handleToggleStatus(item, "exception")}
                className={`h-8 text-xs min-h-8 min-w-8 ${item.status === "exception" ? "bg-amber-600 hover:bg-amber-700 text-white" : "text-amber-500 border-amber-500/30"}`}
                aria-label={`Flag exception on ${item.title}`}
              >
                Exception
              </Button>
              <Button
                size="sm"
                variant={item.status === "pending" ? "secondary" : "ghost"}
                onClick={() => handleToggleStatus(item, "pending")}
                className="h-8 text-xs min-h-8 min-w-8"
                aria-label={`Reset ${item.title} to pending`}
              >
                Pending
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
