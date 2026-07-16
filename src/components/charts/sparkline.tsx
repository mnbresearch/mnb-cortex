"use client";
function path(data: number[], w: number, h: number) {
  if (!data.length) return "";
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  return data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d - min) / span) * h;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}
export function Sparkline({ data, color = "hsl(var(--primary))", w = 110, h = 34 }: { data: number[]; color?: string; w?: number; h?: number }) {
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={path(data, w, h)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
