import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserPlus, Plug } from "lucide-react";

export const dynamic = "force-dynamic";
const members = [
  { name: "You (Owner)", email: "owner@company.com", role: "owner" },
  { name: "Sneha Iyer", email: "sneha@company.com", role: "manager" },
  { name: "Priya Nair", email: "priya@company.com", role: "analyst" },
];
const integrations = [
  { name: "Tally", connected: true }, { name: "Zoho Books", connected: true }, { name: "Shopify", connected: false },
  { name: "WhatsApp Business", connected: true }, { name: "Salesforce", connected: false }, { name: "Google Workspace", connected: true },
];
export default function Admin() {
  return (
    <>
      <Topbar title="Admin & Permissions" subtitle="Team, roles & integrations" />
      <PageShell>
        <Section title="Team members" right={<Button size="sm"><UserPlus className="h-4 w-4" /> Invite</Button>}>
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.email} className="flex items-center justify-between rounded-lg border p-3">
                <div><div className="font-medium text-sm">{m.name}</div><div className="text-xs text-muted-foreground">{m.email}</div></div>
                <Badge className="border-border capitalize">{m.role}</Badge>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Integrations" desc="Connect your data sources">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {integrations.map((it) => (
              <Card key={it.name} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-2"><Plug className="h-4 w-4 text-muted-foreground" /><span className="text-sm font-medium">{it.name}</span></div>
                {it.connected ? <Badge className="bg-success/10 text-success border-success/20">Connected</Badge> : <Button size="sm" variant="outline">Connect</Button>}
              </Card>
            ))}
          </div>
        </Section>
      </PageShell>
    </>
  );
}
