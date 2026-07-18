import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AIPanel } from "@/components/ai-panel";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

const actions = [
  { p: "P1", title: "Approve PO-4471 (RM-204, 10,000 units)", why: "Line B stocks out in ~9 days vs 12-day lead time", impact: "Avoids ~₹6 L lost output", href: "/approvals" },
  { p: "P1", title: "Chase Apex Traders — ₹18 L, 48 days overdue", why: "Largest overdue account, dragging cash runway", impact: "Frees ₹18 L cash", href: "/finance" },
  { p: "P1", title: "Reprice low-elasticity SKUs +4%", why: "Margin slipped 33%→31% on RM-204 inflation", impact: "+₹8–9 L/mo margin", href: "/pricing-optimizer" },
  { p: "P2", title: "Add a backup supplier for RM-204", why: "Single-source risk on a critical input", impact: "De-risks supply", href: "/production" },
  { p: "P2", title: "Cap Packing overtime, add half-shift", why: "Overtime +18%, productivity −7%", impact: "−₹2 L/mo opex", href: "/hr" },
  { p: "P2", title: "Retain 3 at-risk high performers", why: "Attrition risk flagged in HR signals", impact: "Protects delivery", href: "/hr" },
  { p: "P3", title: "Pilot Premium-X in South region", why: "Whitespace + strong product-market fit", impact: "New revenue mix", href: "/sales" },
  { p: "P3", title: "Draft UAE export feasibility", why: "Adjacent market, existing demand signals", impact: "Optionality", href: "/strategy" },
];

const tone: Record<string, string> = {
  P1: "bg-danger/10 text-danger border-danger/20",
  P2: "bg-warning/10 text-warning border-warning/20",
  P3: "bg-primary/10 text-primary border-primary/20",
};

export default function ActionCenter() {
  return (
    <>
      <Topbar title="AI Action Center" subtitle="Everything that needs a decision — ranked by impact" />
      <PageShell>
        <Section title="This week's action plan" desc="Generated fresh from your live business snapshot">
          <AIPanel mode="actions" placeholder="" cta="Generate my prioritised action plan" saveMode="strategy" />
        </Section>

        <Section title="Priority queue" desc="Standing recommendations, highest impact-to-effort first">
          <div className="space-y-2">
            {actions.map((a) => (
              <Card key={a.title} className="p-4 flex items-start gap-3">
                <Badge className={tone[a.p]}>{a.p}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{a.title}</div>
                  <div className="text-sm text-muted-foreground">{a.why}</div>
                  <div className="text-xs text-success mt-0.5">{a.impact}</div>
                </div>
                <Link href={a.href}>
                  <Button variant="outline" size="sm">Do it <ArrowRight className="h-3.5 w-3.5" /></Button>
                </Link>
              </Card>
            ))}
          </div>
        </Section>
      </PageShell>
    </>
  );
}
