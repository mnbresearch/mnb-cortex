import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { AIPanel } from "@/components/ai-panel";

export const dynamic = "force-dynamic";

const rows = [
  { metric: "Gross margin", you: "31%", peer: "34%", gap: "−3 pts", bad: true },
  { metric: "Revenue growth (YoY)", you: "18%", peer: "12%", gap: "+6 pts", bad: false },
  { metric: "DSO (receivable days)", you: "47", peer: "38", gap: "+9 days", bad: true },
  { metric: "Inventory cover", you: "9 days", peer: "18 days", gap: "−9 days", bad: true },
  { metric: "Attrition", you: "11%", peer: "16%", gap: "−5 pts", bad: false },
  { metric: "Revenue / employee", you: "₹42 L", peer: "₹38 L", gap: "+₹4 L", bad: false },
];

export default function Benchmarks() {
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
                    <td className="py-2 pr-4 font-semibold">{r.you}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{r.peer}</td>
                    <td className={`py-2 font-medium ${r.bad ? "text-danger" : "text-success"}`}>{r.gap}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">Benchmarks are directional estimates, not audited figures.</p>
        </Section>

        <Section title="Ask for a deeper benchmark" desc="Cortex compares any area to sector peers">
          <AIPanel mode="benchmark" placeholder="Optional: focus (e.g. 'working capital vs peers' or 'margin structure')" cta="Benchmark my business" saveMode="strategy" />
        </Section>
      </PageShell>
    </>
  );
}
