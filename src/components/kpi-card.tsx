"use client";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Sparkline } from "@/components/charts/sparkline";
import { cn, inr, pct } from "@/lib/utils";
import type { HealthMetric } from "@/types";

const dot: Record<string, string> = { green: "bg-success", yellow: "bg-warning", red: "bg-danger" };
const line: Record<string, string> = { green: "hsl(var(--success))", yellow: "hsl(var(--warning))", red: "hsl(var(--danger))" };

function fmt(m: HealthMetric) {
  if (m.unit === "INR") return inr(m.value);
  if (m.unit === "%") return `${m.value}%`;
  if (m.unit === "/5") return `${m.value}/5`;
  if (m.unit === "days") return `${m.value} days`;
  if (m.unit === "months") return `${m.value} mo`;
  return `${m.value}`;
}

export function KpiCard({ m, i = 0 }: { m: HealthMetric; i?: number }) {
  const up = m.delta_pct >= 0;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
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
          <div className="text-2xl font-semibold tracking-tight">{fmt(m)}</div>
          <Sparkline data={m.trend} color={line[m.status]} />
        </div>
      </Card>
    </motion.div>
  );
}
