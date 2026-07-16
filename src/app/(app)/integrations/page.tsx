import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getIntegrations } from "@/lib/data";
import { connectIntegration, disconnectIntegration } from "@/lib/actions";
import { Plug, Check, Link2 } from "lucide-react";

export const dynamic = "force-dynamic";
const PROVIDERS = [
  { id: "tally", name: "Tally", desc: "Accounting & finance ledger" },
  { id: "zoho_books", name: "Zoho Books", desc: "Invoicing & accounting" },
  { id: "quickbooks", name: "QuickBooks", desc: "Accounting" },
  { id: "shopify", name: "Shopify", desc: "E-commerce orders" },
  { id: "google_sheets", name: "Google Sheets", desc: "Import from a shared sheet", url: true },
  { id: "whatsapp", name: "WhatsApp Business", desc: "Campaigns & reminders" },
  { id: "salesforce", name: "Salesforce", desc: "CRM" },
  { id: "gmail", name: "Gmail / Workspace", desc: "Email & calendar" },
  { id: "slack", name: "Slack", desc: "Alerts & notifications" },
];

export default async function Integrations() {
  const { map, live } = await getIntegrations();
  return (
    <>
      <Topbar title="Integrations" subtitle="Connect your data sources" />
      <PageShell>
        {!live && <Card className="p-5 bg-warning/10 border-warning/20 text-sm"><a href="/login" className="text-primary underline">Sign in</a> to connect and save integrations to your workspace. You can also import data now via <a href="/import" className="text-primary underline">Import data</a>.</Card>}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {PROVIDERS.map((p) => {
            const conn = map[p.id];
            return (
              <Card key={p.id} className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2"><div className="h-9 w-9 rounded-lg bg-secondary grid place-items-center"><Plug className="h-4 w-4 text-muted-foreground" /></div>
                    <div><div className="text-sm font-medium">{p.name}</div><div className="text-xs text-muted-foreground">{p.desc}</div></div></div>
                  {conn && <Badge className="bg-success/10 text-success border-success/20"><Check className="h-3 w-3 mr-1" />Connected</Badge>}
                </div>
                {live && (conn ? (
                  <form action={disconnectIntegration}><input type="hidden" name="provider" value={p.id} /><button className="w-full rounded-lg border h-9 text-sm hover:bg-accent">Disconnect</button></form>
                ) : (
                  <form action={connectIntegration} className="space-y-2"><input type="hidden" name="provider" value={p.id} />
                    {p.url && <input name="config" placeholder='{"url":"https://docs.google.com/…"}' className="w-full rounded-lg border bg-background px-2 h-8 text-xs outline-none" />}
                    <button className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground h-9 text-sm font-medium hover:opacity-90"><Link2 className="h-3.5 w-3.5" /> Connect</button>
                  </form>
                ))}
              </Card>
            );
          })}
        </div>
      </PageShell>
    </>
  );
}
