import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { AIPanel } from "@/components/ai-panel";
import { getMetrics } from "@/lib/data";
import Link from "next/link";

export const dynamic = "force-dynamic";

/*
  The "You" column used to be invented — Gross margin 31%, DSO 47, Revenue per
  employee ₹42 L — under a heading that reads "You vs peer median". The page
  disclaimed only the PEER column, so the one number a reader would take as
  fact about their own business was the fabricated one.

  The peer figures below remain directional estimates and are labelled as such.
  The "You" column is now populated from health_metrics, and shows an em dash
  where the workspace has not supplied the data to compute it.
*/
const PEERS: { key: string; metric: string; peer: string; higherIsBetter: boolean; fmt: (v: number) => string; peerValue: number }[] = [
  { key: "growth", metric: "Revenue growth (YoY)", peer: "12%", higherIsBetter: true, fmt: (v) => `${v.toFixed(0)}%`, peerValue: 12 },
  { key: "inventory", metric: "Inventory cover", peer: "18 days", higherIsBetter: true, fmt: (v) => `${v.toFixed(0)} days`, peerValue: 18 },
  { key: "attendance", metric: "Average attendance", peer: "92%", higherIsBetter: true, fmt: (v) => `${v.toFixed(0)}%`, peerValue: 92 },
  { key: "productivity", metric: "Productivity index", peer: "70", higherIsBetter: true, fmt: (v) => v.toFixed(0), peerValue: 70 },
  { key: "risk", metric: "Risk score", peer: "30", higherIsBetter: false, fmt: (v) => v.toFixed(0), peerValue: 30 },
];

export default async function Benchmarks() {
  const metrics = await getMetrics();
  const byKey = Object.fromEntries(metrics.map((m) => [m.metric_key, m]));

  const rows = PEERS.map((p) => {
    const m = byKey[p.key];
    if (!m) return { metric: p.metric, you: "—", peer: p.peer, gap: "—", bad: false, missing: true };
    const v = Number(m.value);
    const diff = v - p.peerValue;
    const better = p.higherIsBetter ? diff >= 0 : diff <= 0;
    const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
    return {
      metric: p.metric,
      you: p.fmt(v),
      peer: p.peer,
      gap: diff === 0 ? "level" : `${sign}${p.fmt(Math.abs(diff)).replace(/^[+−]/, "")}`,
      bad: !better,
      missing: false,
    };
  });

  const missing = rows.filter((r) => r.missing).length;

  return (
    <>
      <Topbar title="Industry Benchmarks" subtitle="How you stack up against peer SMEs in your sector" />
      <PageShell>
        <Section title="You vs peer median" desc="Estimated benchmarks for Indian manufacturing SMEs (~₹25 Cr revenue)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4 font-medium">Metric</th>
                <th className="py-2 pr-4 font-medium">You</th>
                <th className="py-2 pr-4 font-medium">Peer median</th>
                <th className="py-2 font-medium">Gap</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.metric} className="border-b last:border-0">
                    <td className="py-2 pr-4">{r.metric}</td>
                    <td className={`py-2 pr-4 font-semibold ${r.missing ? "text-muted-foreground font-normal" : ""}`}>{r.you}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{r.peer}</td>
                    <td className={`py-2 font-medium ${r.missing ? "text-muted-foreground font-normal" : r.bad ? "text-danger" : "text-success"}`}>{r.gap}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Your column is computed from your own data. The peer column is a directional estimate for
            Indian manufacturing SMEs, not an audited figure.
            {missing > 0 && <> {missing} row{missing === 1 ? " shows" : "s show"} an em dash because Cortex does not yet have the data to compute it — <Link href="/import" className="text-primary">import your records</Link> to fill them in.</>}
          </p>
        </Section>

        <Section title="Ask for a deeper benchmark" desc="Cortex compares any area to sector peers">
          <AIPanel mode="benchmark" placeholder="Optional: focus (e.g. 'working capital vs peers' or 'margin structure')" cta="Benchmark my business" saveMode="strategy" />
        </Section>
      </PageShell>
    </>
  );
}
