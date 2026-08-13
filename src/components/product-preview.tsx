import { Sparkles } from "lucide-react";

/** Stylised in-product preview — a browser frame with a mini AI-COO dashboard. Pure CSS/SVG. */
export function ProductPreview() {
  const spark = [22, 30, 26, 38, 34, 48, 44, 60, 55, 72, 68, 84];
  const max = Math.max(...spark);
  const pts = spark.map((v, i) => `${(i / (spark.length - 1)) * 100},${40 - (v / max) * 34}`).join(" ");
  const kpis = [
    { l: "Revenue (MTD)", v: "₹42.8L", d: "+18%", up: true },
    { l: "Cash runway", v: "7.4 mo", d: "+0.6", up: true },
    { l: "Cortex Score", v: "82", d: "+5", up: true },
  ];
  return (
    <div className="rounded-2xl border bg-card shadow-2xl overflow-hidden glow-ring">
      {/* window bar */}
      <div className="flex items-center gap-2 px-4 h-10 border-b bg-secondary/40">
        <span className="h-3 w-3 rounded-full bg-danger/60" />
        <span className="h-3 w-3 rounded-full bg-warning/60" />
        <span className="h-3 w-3 rounded-full bg-success/60" />
        <div className="mx-auto text-xs text-muted-foreground rounded-md bg-background/70 px-3 py-1 border">cortex.mnbresearch.com/dashboard</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[64px_1fr] md:grid-cols-[180px_1fr]">
        {/* sidebar */}
        <div className="border-r p-3 hidden sm:block">
          <div className="flex items-center gap-2 mb-5">
            <div className="h-6 w-6 rounded-lg brand-gradient" />
            <span className="font-semibold text-sm hidden md:inline">Cortex</span>
          </div>
          {["Dashboard", "AI CEO Chat", "Workforce", "Finance", "Memory", "Agents"].map((x, i) => (
            <div key={x} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 mb-1 text-xs ${i === 0 ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground"}`}>
              <span className="h-3.5 w-3.5 rounded bg-current opacity-40" /><span className="hidden md:inline">{x}</span>
            </div>
          ))}
        </div>
        {/* main */}
        <div className="p-4 md:p-6">
          <div className="text-xs text-muted-foreground">Good morning, Mridul</div>
          <div className="font-display text-xl md:text-2xl tracking-tightest mt-0.5">Here&rsquo;s your business today</div>
          <div className="grid grid-cols-3 gap-2.5 mt-4">
            {kpis.map((k) => (
              <div key={k.l} className="rounded-xl border bg-background p-3">
                <div className="text-[10px] text-muted-foreground truncate">{k.l}</div>
                <div className="font-display text-lg md:text-2xl tracking-tightest mt-1">{k.v}</div>
                <div className="text-[10px] text-success mt-0.5">▲ {k.d}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl border bg-background p-3">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1"><span>Revenue trend</span><span>last 12 weeks</span></div>
            <svg viewBox="0 0 100 40" className="w-full h-16" preserveAspectRatio="none">
              <defs>
                <linearGradient id="pp" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polyline points={`0,40 ${pts} 100,40`} fill="url(#pp)" stroke="none" />
              <polyline points={pts} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="mt-3 rounded-xl border bg-primary/5 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-primary"><Sparkles className="h-3.5 w-3.5" /> Cortex</div>
            <p className="text-xs mt-1 text-foreground/80">
              Cash is healthy, but receivables aged 45+ days rose 22%. I&rsquo;ve drafted 3 polite reminders and a ₹6L working-capital plan — approve to send.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
