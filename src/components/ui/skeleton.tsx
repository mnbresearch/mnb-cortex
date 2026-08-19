import { cn } from "@/lib/utils";

/**
 * Loading placeholders.
 *
 * A skeleton that mirrors the shape of the content it replaces is far better
 * than a spinner: the layout doesn't jump when data arrives, and the user can
 * start reading the structure of the page before the numbers land.
 *
 * The shimmer is a moving highlight rather than a pulsing opacity. Pulsing
 * makes a whole screen throb, which is unpleasant at the size of a dashboard;
 * a sweep reads as "loading" without demanding attention. It is disabled under
 * prefers-reduced-motion by the rule in globals.css.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton rounded-md bg-muted/70", className)} {...props} />;
}

/** A single KPI tile placeholder, matching <KpiCard>'s real dimensions. */
export function SkeletonKpi() {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 card-elevated">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-3.5 w-24" />
        </div>
        <Skeleton className="h-3 w-10" />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-8 w-20 rounded" />
      </div>
    </div>
  );
}

/** Table placeholder. `cols` keeps the column rhythm of the real table. */
export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card overflow-hidden card-elevated">
      <div className="border-b border-border/70 bg-muted/40 px-4 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3.5" style={{ width: `${100 / cols - 4}%` }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="px-4 py-3.5 flex gap-4 border-b border-border/50 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className="h-4"
              style={{ width: `${100 / cols - 4}%`, opacity: 1 - r * 0.1 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border/70 bg-card p-5 card-elevated", className)}>
      <Skeleton className="h-4 w-1/3" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-3.5" style={{ width: `${95 - i * 12}%` }} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonChart({ className }: { className?: string }) {
  // Fixed bar heights, not random: a skeleton that differs between the server
  // and client render causes a hydration mismatch.
  const bars = [42, 61, 35, 78, 54, 88, 47, 69, 58, 81, 39, 72];
  return (
    <div className={cn("rounded-xl border border-border/70 bg-card p-5 card-elevated", className)}>
      <Skeleton className="h-4 w-40" />
      <div className="mt-6 flex h-40 items-end gap-2">
        {bars.map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-t" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

/** The default page-level shape: title, a row of KPIs, then a chart and a table. */
export function SkeletonPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonKpi key={i} />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <SkeletonChart className="lg:col-span-2" />
        <SkeletonCard lines={5} />
      </div>
      <SkeletonTable />
    </div>
  );
}
