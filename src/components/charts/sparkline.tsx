"use client";
function path(data: number[], w: number, h: number) {
  /*
    Length 1 was the gap: `i / (data.length - 1)` is 0/0, so the path came out
    as "MNaN,0.0". Browsers drop it silently, but the moment it happens is the
    first bank statement or the first GST return — the point at which a new
    customer is deciding whether this product works. A single point is drawn as
    a flat line across the width instead.
  */
  if (!data.length) return "";
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  if (data.length === 1) {
    const y = (h / 2).toFixed(1);
    return `M0,${y} L${w.toFixed(1)},${y}`;
  }
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
