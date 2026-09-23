"use client";
import dynamic from "next/dynamic";

/*
  RECHARTS, LOADED ONLY WHEN THE CHART IS ACTUALLY RENDERED.

  trend-chart.tsx imports recharts at the top level — about 100KB gzipped — and
  the dashboard imported it statically. So every dashboard load paid for the
  whole charting library before first paint, for a component that sits below
  the fold and that a lot of visits never scroll to.

  WHY A SEPARATE FILE. `next/dynamic` with `ssr: false` is only legal inside a
  client component, and dashboard/page.tsx is a server component. It also
  already exports `const dynamic = "force-dynamic"`, so importing next/dynamic
  there collides with its own identifier. One three-line client boundary avoids
  both problems and keeps the page untouched.

  The skeleton matches the chart's height so the layout does not jump when it
  arrives — a chart that shifts the page under the cursor is worse than a chart
  that took another 200ms.
*/
export const TrendChart = dynamic(
  () => import("@/components/charts/trend-chart").then((m) => m.TrendChart),
  { ssr: false, loading: () => <div className="h-64 rounded-xl skeleton" aria-hidden="true" /> },
);
