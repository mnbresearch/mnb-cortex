"use client";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

export function TrendChart({ data, keys }: { data: any[]; keys: { k: string; label: string; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
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
          <Area key={s.k} type="monotone" dataKey={s.k} name={s.label} stroke={s.color} strokeWidth={2} fill={`url(#g-${s.k})`} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
