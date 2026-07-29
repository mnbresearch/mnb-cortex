import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { AgentsConsole } from "@/components/agents-console";
import { getOrgProfile } from "@/lib/data";
import { INDUSTRIES, agentCount } from "@/lib/agents/catalog";
import { Bot } from "lucide-react";

export const dynamic = "force-dynamic";

function guessIndustry(industry?: string | null): string {
  const s = (industry || "").toLowerCase();
  const hit = INDUSTRIES.find((i) => s.includes(i.id) || s.includes(i.name.toLowerCase().split(" ")[0]));
  return hit?.id || "jewellery";
}

export default async function Agents() {
  const profile = await getOrgProfile();
  const initial = guessIndustry((profile as any)?.industry);

  return (
    <>
      <Topbar title="AI Agents" subtitle="Purpose-built AI agents for your industry — and any you invent" />
      <PageShell>
        <Card className="p-4 border-primary/20 bg-primary/5 text-sm flex items-start gap-2">
          <Bot className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <span>Cortex ships <b>{agentCount()}+ ready agents</b> across {INDUSTRIES.length} industries — catalogue writers, ad scripts, merchandising briefs, and more — each grounded in your business memory. Pick your industry, run an agent, revise, and export. Or have Cortex <b>build brand-new agents</b> for your exact business in the Custom tab.</span>
        </Card>
        <AgentsConsole initialIndustry={initial} />
      </PageShell>
    </>
  );
}
