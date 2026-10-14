import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { AIPanel } from "@/components/ai-panel";
import { getMetrics, getUserAndOrg } from "@/lib/data";
import Link from "next/link";

export const dynamic = "force-dynamic";

/*
  The "You" column used to be invented — Gross margin 31%, DSO 47, Revenue per
  employee ₹42 L — under a heading that reads "You vs peer median". The page
  disclaimed only the PEER column, so the one number a reader would take as
  fact about their own business was the fabricated one.

  The "You" column is populated from health_metrics, and shows an em dash
  where the workspace has not supplied the data to compute it.

  THE PEER COLUMN HAS NO SOURCE. It was headed "peer median", which claims a
  measured distribution; nothing in this repository says where these numbers
  came from, and two of them (productivity index, risk score) are Cortex's own
  scores, which no peer survey could have a median of. They are now labelled
  as illustrative reference points, which is all they are.

  AND "YoY" WAS NOT YEAR ON YEAR. The growth metric (lib/metrics.ts) compares
  this month SO FAR with the whole month eleven months earlier — a partial
  month against a full one, a month short of a year. Until that computation
  is fixed it is named for what it is here and not set against a peer figure,
  because "−40% vs 12%" on the 5th of the month would be a fiction.
*/
const PEERS: { key: string; metric: string; peer: string; higherIsBetter: boolean; fmt: (v: number) => string; peerValue: number | null }[] = [
  { key: "growth", metric: "Revenue, this month so far vs the same days of this month last year", peer: "—", higherIsBetter: true, fmt: (v) => `${v.toFixed(0)}%`, peerValue: null },
  { key: "inventory", metric: "Inventory cover", peer: "18 days", higherIsBetter: true, fmt: (v) => `${v.toFixed(0)} days`, peerValue: 18 },
  { key: "attendance", metric: "Average attendance", peer: "92%", higherIsBetter: true, fmt: (v) => `${v.toFixed(0)}%`, peerValue: 92 },
  { key: "productivity", metric: "Productivity index", peer: "70", higherIsBetter: true, fmt: (v) => v.toFixed(0), peerValue: 70 },
  { key: "risk", metric: "Risk score", peer: "30", higherIsBetter: false, fmt: (v) => v.toFixed(0), peerValue: 30 },
];

export default async function Benchmarks() {
  // getMetrics() returns the DEMO snapshot to a logged-out visitor, so without
  // this the "You" column would show another company's numbers under text
  // saying it is computed from your own data.
  const { orgId } = await getUserAndOrg();
  const signedIn = Boolean(orgId);
  const metrics = signedIn ? await getMetrics() : [];
  const byKey = Object.fromEntries(metrics.map((m) => [m.metric_key, m]));

  const rows = PEERS.map((p) => {
    const m = byKey[p.key];
    if (!m) return { metric: p.metric, you: "—", peer: p.peer, gap: "—", bad: false, missing: true };
    const v = Number(m.value);
    /* Not comparable to any peer figure — see the note on the growth row above. */
    if (p.peerValue === null) return { metric: p.metric, you: p.fmt(v), peer: p.peer, gap: "—", bad: false, missing: false };
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
      <Topbar title="Industry Benchmarks" subtitle="Your own figures beside illustrative SME reference points" />
      <PageShell>
        <Section title="You vs illustrative peer figures" desc="Rough reference points for an Indian manufacturing SME (~₹25 Cr revenue) — not a measured median">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4 font-medium">Metric</th>
                <th className="py-2 pr-4 font-medium">You</th>
                <th className="py-2 pr-4 font-medium">Illustrative peer</th>
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
            Your column is computed from your own data. The peer column is illustrative — a rough reference point, not
            drawn from a survey or a published dataset — so treat a gap as a prompt to look, not a finding.
            {signedIn && missing > 0 && <> {missing} row{missing === 1 ? " shows" : "s show"} an em dash because Cortex does not yet have the data to compute it — <Link href="/import" className="text-primary">import your records</Link> to fill them in.</>}
            {!signedIn && <> Sign in to see your own figures in the You column.</>}
          </p>
        </Section>

        <Section title="Ask for a deeper benchmark" desc="Cortex compares any area to sector peers">
          <AIPanel inputOptional mode="benchmark" placeholder="Optional: focus (e.g. 'working capital vs peers' or 'margin structure')" cta="Benchmark my business" saveMode="strategy" />
        </Section>
      </PageShell>
    </>
  );
}
