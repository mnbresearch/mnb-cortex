import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIPanel } from "@/components/ai-panel";
import { getUserAndOrg } from "@/lib/data";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Worked example for the logged-out preview only.
 *
 * These SKUs and the three stat cards below were rendered to every signed-in
 * workspace as if they were that customer's own margin analysis — "Current
 * gross margin 31%", "Est. margin upside ₹8–9 L/mo" — with no connection to
 * their data at all.
 */
const exampleSkus = [
  { sku: "Premium-X", elasticity: "Low", move: "+5%", note: "Strong PMF, little competition", tone: "up" },
  { sku: "Standard-100", elasticity: "Medium", move: "+3%", note: "Pass through RM-204 cost", tone: "up" },
  { sku: "Value-Tier", elasticity: "High", move: "Hold", note: "Defend vs competitor's 8% cut", tone: "flat" },
  { sku: "Bulk-B2B", elasticity: "High", move: "+2% + rebate", note: "Protect volume, trade on terms", tone: "up" },
];

export default async function PricingOptimizer() {
  const { orgId } = await getUserAndOrg();
  const signedIn = Boolean(orgId);

  return (
    <>
      <Topbar title="AI Pricing Optimizer" subtitle="Rebuild margin without losing volume — GST-aware" />
      <PageShell>
        {signedIn ? (
          <Card className="p-4 text-sm text-muted-foreground">
            Describe your products and costs below and the AI will build a repricing plan for them. To ground it in your
            own numbers first, <Link href="/import" className="text-primary">import your sales and inventory</Link>.
          </Card>
        ) : (
          <div className="grid sm:grid-cols-3 gap-3">
            <Card className="p-4"><div className="text-sm text-muted-foreground">Current gross margin</div><div className="text-2xl font-bold mt-1">31%</div><div className="text-xs text-danger">−2 pts vs last quarter</div></Card>
            <Card className="p-4"><div className="text-sm text-muted-foreground">Target margin</div><div className="text-2xl font-bold mt-1">33%</div><div className="text-xs text-muted-foreground">Achievable in ~60 days</div></Card>
            <Card className="p-4"><div className="text-sm text-muted-foreground">Est. margin upside</div><div className="text-2xl font-bold mt-1">₹8–9 L/mo</div><div className="text-xs text-success">From selective repricing</div></Card>
          </div>
        )}

        <Section
          title={signedIn ? "How the optimizer works" : "Recommended price moves"}
          desc={signedIn ? "An example of the output — yours is generated from your own brief below" : "By SKU, weighted by elasticity and competitor risk"}
        >
          <div className="space-y-2">
            {exampleSkus.map((s) => (
              <Card key={s.sku} className="p-4 flex items-center gap-3">
                <div className="flex-1">
                  <div className="font-medium text-sm">{s.sku}</div>
                  <div className="text-sm text-muted-foreground">{s.note}</div>
                </div>
                <Badge className="border-border text-muted-foreground">Elasticity: {s.elasticity}</Badge>
                <Badge className={s.tone === "up" ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20"}>{s.move}</Badge>
              </Card>
            ))}
          </div>
        </Section>

        <Section title="Build a full pricing strategy" desc="Cortex models elasticity, GST and competitor response">
          <AIPanel mode="pricing" placeholder="Optional: focus (e.g. 'B2B contracts' or 'how much can I raise Premium-X?')" cta="Optimise my pricing" saveMode="strategy" />
        </Section>
      </PageShell>
    </>
  );
}
