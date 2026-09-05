"use client";
import { motion, useReducedMotion } from "framer-motion";
import { Ticker, EASE, DURATION } from "@/components/motion";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Sparkline } from "@/components/charts/sparkline";
import { cn, inr, pct } from "@/lib/utils";
import type { HealthMetric } from "@/types";

const dot: Record<string, string> = { green: "bg-success", yellow: "bg-warning", red: "bg-danger" };
const line: Record<string, string> = { green: "hsl(var(--success))", yellow: "hsl(var(--warning))", red: "hsl(var(--danger))" };

/**
 * Format a metric. Takes the live (possibly mid-animation) figure so the ticker
 * and the static rendering can never disagree about grouping or units — an
 * animated number that formats differently from the rest of the app reads as a
 * bug rather than a flourish.
 */
function fmt(m: HealthMetric, value: number = m.value) {
  if (m.unit === "INR") return inr(value);
  if (m.unit === "%") return `${Math.round(value)}%`;
  if (m.unit === "/5") return `${value.toFixed(1)}/5`;
  if (m.unit === "days") return `${Math.round(value)} days`;
  if (m.unit === "months") return `${Math.round(value)} mo`;
  return `${Math.round(value)}`;
}

export function KpiCard({ m, i = 0 }: { m: HealthMetric; i?: number }) {
  const up = m.delta_pct >= 0;
  /*
    A dashboard renders a whole GRID of these, so the staggered entrance is a
    dozen tiles moving at once — the case that actually triggers vestibular
    symptoms. motion.tsx honours the preference in all six of its primitives;
    this component was written separately and did not.
  */
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={reduce ? undefined : { opacity: 1, y: 0 }}
      transition={reduce ? undefined : { delay: i * 0.04, duration: DURATION.base, ease: EASE }}
      whileHover={reduce ? undefined : { y: -3 }}
    >
      <Card className="p-4 hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className={cn("h-2 w-2 rounded-full", dot[m.status])} />
            {m.label}
          </div>
          <span className={cn("flex items-center text-xs font-medium", up ? "text-success" : "text-danger")}>
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {pct(m.delta_pct)}
          </span>
        </div>
        <div className="mt-2 flex items-end justify-between">
          <div className="text-2xl font-semibold tracking-tight tabular">
            <Ticker value={m.value} format={(n) => fmt(m, n)} />
          </div>
          <Sparkline data={m.trend} color={line[m.status]} />
        </div>
      </Card>
    </motion.div>
  );
}
