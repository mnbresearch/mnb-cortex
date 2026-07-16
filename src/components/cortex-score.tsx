import type { HealthMetric } from "@/types";

const w: Record<string, number> = { green: 100, yellow: 62, red: 28 };
function scoreOf(metrics: HealthMetric[]) {
  if (!metrics.length) return 72;
  const s = metrics.reduce((a, m) => a + (w[m.status] ?? 60), 0) / metrics.length;
  return Math.round(s);
}

export function CortexScore({ metrics }: { metrics: HealthMetric[] }) {
  const score = scoreOf(metrics);
  const color = score >= 75 ? "hsl(var(--success))" : score >= 50 ? "hsl(var(--warning))" : "hsl(var(--danger))";
  const label = score >= 75 ? "Healthy" : score >= 50 ? "Needs attention" : "At risk";
  const R = 52, C = 2 * Math.PI * R, off = C * (1 - score / 100);
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-32 w-32 shrink-0">
        <svg viewBox="0 0 128 128" className="h-32 w-32 -rotate-90">
          <circle cx="64" cy="64" r={R} fill="none" stroke="hsl(var(--border))" strokeWidth="10" />
          <circle cx="64" cy="64" r={R} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center"><div className="text-3xl font-bold">{score}</div><div className="text-[10px] text-muted-foreground -mt-1">/ 100</div></div>
        </div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-wider">Cortex Score</div>
        <div className="text-xl font-semibold mt-0.5" style={{ color }}>{label}</div>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">A single real-time score of your company's overall health, computed by the AI across all KPIs.</p>
      </div>
    </div>
  );
}
