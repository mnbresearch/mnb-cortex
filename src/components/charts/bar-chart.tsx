"use client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
export function SimpleBar({ data, x, y, color = "hsl(var(--primary))", colorField }: { data: any[]; x: string; y: string; color?: string; colorField?: string }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey={x} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} cursor={{ fill: "hsl(var(--accent))" }} />
        <Bar dataKey={y} radius={[6, 6, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={colorField ? (d[colorField] || color) : color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
