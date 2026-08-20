"use client";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { LineChart } from "lucide-react";

/**
 * Trailing trend chart.
 *
 * The empty state lives HERE rather than in each page, because four pages render
 * this component and only one of them remembered to guard it. /finance drew a
 * full set of month labels and an empty plot area with no explanation, which
 * reads as a broken chart rather than an empty one.
 *
 * Two distinct kinds of nothing, and they need different words:
 *   - no rows at all      → there is no data
 *   - rows that are all 0 → we have periods but nothing measured in them
 * Saying "no data" over a flat zero line would be the same lie the dashboard
 * was telling before: a zero that means "unknown" presented as a measurement.
 */
export function TrendChart({
  data,
  keys,
  empty,
}: {
  data: any[];
  keys: { k: string; label: string; color: string }[];
  /** Overrides the default copy — pass page-specific guidance and links. */
  empty?: React.ReactNode;
}) {
  const rows = Array.isArray(data) ? data : [];
  const hasSeries = keys.length > 0;
  const hasValue = hasSeries && rows.some((r) => keys.some((s) => Number(r?.[s.k]) !== 0));

  if (!rows.length || !hasSeries || !hasValue) {
    return (
      <div className="h-[260px] grid place-items-center rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 text-center">
        <div className="max-w-sm">
          <LineChart className="h-6 w-6 mx-auto text-muted-foreground/60" aria-hidden />
          <p className="mt-2.5 text-sm text-muted-foreground">
            {empty ?? "Nothing to plot yet. Once your numbers are in, twelve months of trend appear here."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={rows} margin={{ left: -16, right: 8, top: 8 }}>
        <defs>
          {keys.map((s) => (
            <linearGradient key={s.k} id={`g-${s.k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {keys.map((s) => (
          <Area
            key={s.k}
            type="monotone"
            dataKey={s.k}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            fill={`url(#g-${s.k})`}
            // Draw the line on rather than having it appear. Recharts animates
            // from the baseline, so the series rises into place.
            isAnimationActive
            animationDuration={800}
            animationEasing="ease-out"
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
