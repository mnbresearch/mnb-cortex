"use client";

import { motion, useReducedMotion } from "framer-motion";
import { EASE } from "@/components/motion";
import type { HealthMetric } from "@/types";

const w: Record<string, number> = { green: 100, yellow: 62, red: 28 };

function scoreOf(metrics: HealthMetric[]): number {
  const s = metrics.reduce((a, m) => a + (w[m.status] ?? 60), 0) / metrics.length;
  return Math.round(s);
}

/**
 * Below this many KPIs the average isn't a meaningful health read — two green
 * rows from a single import scored a confident 100/100.
 */
const MIN_METRICS = 4;

/**
 * The single headline health figure.
 *
 * The honesty rule here is the whole point: when there isn't enough data to
 * compute a trustworthy score, DON'T SHOW A NUMBER. A previous version guarded
 * only the caption, so the dial read "100 / 100" in confident green directly
 * beside the words "Not enough data" — self-contradictory, and the sort of
 * detail that makes a founder doubt every other figure on the page.
 *
 * Now the thin state shows a dash and a neutral, deliberately incomplete ring:
 * it looks unfinished because it is.
 */
export function CortexScore({ metrics }: { metrics: HealthMetric[] }) {
  const reduced = useReducedMotion();
  const count = metrics.length;
  const thin = count < MIN_METRICS;
  const score = count ? scoreOf(metrics) : 0;

  const color = thin
    ? "hsl(var(--muted-foreground))"
    : score >= 75 ? "hsl(var(--success))"
    : score >= 50 ? "hsl(var(--warning))"
    : "hsl(var(--danger))";

  const label = count === 0
    ? "No data yet"
    : thin ? "Not enough data"
    : score >= 75 ? "Healthy"
    : score >= 50 ? "Needs attention"
    : "At risk";

  const R = 52;
  const C = 2 * Math.PI * R;
  // A thin state shows a fixed token arc, never the computed score — the arc
  // must not imply a reading we've just said we can't make.
  const shown = thin ? 0.18 : score / 100;

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-32 w-32 shrink-0">
        <svg viewBox="0 0 128 128" className="h-32 w-32 -rotate-90" aria-hidden>
          <circle cx="64" cy="64" r={R} fill="none" stroke="hsl(var(--border))" strokeWidth="10" />
          <motion.circle
            cx="64" cy="64" r={R} fill="none"
            stroke={color} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={C}
            // Draws itself on first paint. The eye follows the arc round to
            // where it stops, which communicates the value better than a
            // number appearing all at once.
            initial={{ strokeDashoffset: C }}
            animate={{ strokeDashoffset: C * (1 - shown) }}
            transition={{ duration: reduced ? 0 : 1.1, ease: EASE, delay: reduced ? 0 : 0.15 }}
            style={thin ? { opacity: 0.55 } : undefined}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            {thin ? (
              <div className="text-3xl font-bold text-muted-foreground leading-none">—</div>
            ) : (
              <motion.div
                className="text-3xl font-bold tabular leading-none"
                initial={reduced ? false : { opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: EASE, delay: 0.5 }}
              >
                {score}
              </motion.div>
            )}
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {thin ? "no score" : "/ 100"}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-wider">Cortex Score</div>
        <div className="text-xl font-semibold mt-0.5" style={{ color }}>{label}</div>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          {count === 0
            ? "Import your sales, invoices or inventory and Cortex will score your business health here."
            : thin
            ? `Only ${count} KPI${count === 1 ? "" : "s"} so far. Cortex needs at least ${MIN_METRICS} before a score means anything — connect more data and this fills in.`
            : "A single real-time score of your company's overall health, computed across all your KPIs."}
        </p>
      </div>
    </div>
  );
}
