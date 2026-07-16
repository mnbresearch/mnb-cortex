import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Globe, Search } from "lucide-react";
import { AIPanel } from "@/components/ai-panel";
import { DataTable } from "@/components/data-table";
import { getMarketList } from "@/lib/data";

export const dynamic = "force-dynamic";
export default async function Market() {
  const { rows, live } = await getMarketList();
  return (
    <>
      <Topbar title="Market Intelligence" subtitle="AI researches markets, competitors & trends" />
      <PageShell>
        <AIPanel mode="market" placeholder="Should I enter Saudi Arabia? Which city should I expand into? Which product to launch?" cta="Research this market" saveMode="market" />
        <DataTable title="Saved market briefs" rows={rows} live={live} table="market_reports" path="/market" cols={[{key:"title",label:"Title"},{key:"created_at",label:"Saved",kind:"date"}]} />
        <Card className="p-4">
          <div className="flex items-center gap-2 rounded-lg border px-3 h-11">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input className="flex-1 bg-transparent text-sm outline-none" placeholder="Should I enter Saudi Arabia? Which city should I expand into?" />
            <Button size="sm">Research</Button>
          </div>
        </Card>
        <Section title="UAE expansion scan" desc="AI-generated market brief" right={<Badge className="border-success/30 text-success">Recommended: Enter H2</Badge>}>
          <div className="grid sm:grid-cols-3 gap-3">
            <Card className="p-4"><div className="text-sm text-muted-foreground">Market size</div><div className="text-xl font-semibold mt-1">$2.1B</div><div className="text-xs text-muted-foreground">addressable</div></Card>
            <Card className="p-4"><div className="text-sm text-muted-foreground">Growth forecast</div><div className="text-xl font-semibold mt-1">7.4% CAGR</div><div className="text-xs text-muted-foreground">to 2030</div></Card>
            <Card className="p-4"><div className="text-sm text-muted-foreground">Entry mode</div><div className="text-xl font-semibold mt-1">Distributor</div><div className="text-xs text-muted-foreground">Dubai partner</div></Card>
          </div>
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            <Card className="p-4"><div className="font-medium text-sm mb-2 flex items-center gap-2"><Globe className="h-4 w-4 text-primary" /> Competitor map</div>
              <ul className="text-sm text-muted-foreground space-y-1"><li>Regional Co A — 22% share</li><li>Importer B — 15% share</li><li>Fragmented long tail — 63%</li></ul></Card>
            <Card className="p-4"><div className="font-medium text-sm mb-2">Entry barriers</div>
              <ul className="text-sm text-muted-foreground space-y-1"><li>Distributor relationships</li><li>Halal / regulatory certification</li><li>Logistics & landed cost</li></ul></Card>
          </div>
          <Card className="p-4 mt-3 bg-accent/40"><div className="text-sm"><b>AI recommendation:</b> Enter via a Dubai distributor partnership in H2. Pilot Premium-X before committing capex; defend the home premium tier against the competitor’s 8% price cut.</div></Card>
        </Section>
      </PageShell>
    </>
  );
}
