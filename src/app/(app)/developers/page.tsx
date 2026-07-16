import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/forms";
import { getApiKeys } from "@/lib/data";
import { generateApiKey, deleteApiKey } from "@/lib/actions";
import { KeyRound, Trash2, Terminal } from "lucide-react";

export const dynamic = "force-dynamic";
export default async function Developers() {
  const { rows, live } = await getApiKeys();
  return (
    <>
      <Topbar title="Developers · API" subtitle="Push data in and pull insights out" />
      <PageShell>
        {!live && <Card className="p-5 bg-warning/10 border-warning/20 text-sm"><a href="/login" className="text-primary underline">Sign in</a> (admin/owner) to generate API keys.</Card>}
        {live && (
          <Section title="API keys" desc="Use in the x-api-key header. Keep secret.">
            <form action={generateApiKey} className="flex flex-wrap items-end gap-2 mb-4">
              <div className="flex-1 min-w-[200px]"><Field name="label" label="Label" placeholder="e.g. Zapier, backend" /></div>
              <button className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground h-9 px-4 text-sm font-medium hover:opacity-90"><KeyRound className="h-4 w-4" /> Generate key</button>
            </form>
            <div className="space-y-2">
              {rows.length === 0 && <p className="text-sm text-muted-foreground">No keys yet.</p>}
              {rows.map((k) => (
                <div key={k.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div><div className="text-sm font-medium">{k.label}</div><code className="text-xs text-muted-foreground break-all">{k.key}</code></div>
                  <form action={deleteApiKey}><input type="hidden" name="id" value={k.id} /><button className="text-muted-foreground hover:text-danger p-1.5 rounded-md hover:bg-danger/10"><Trash2 className="h-4 w-4" /></button></form>
                </div>
              ))}
            </div>
          </Section>
        )}
        <Section title="Endpoints" desc="Base: https://mnb-cortex.vercel.app">
          <div className="space-y-3 text-sm">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2"><Terminal className="h-4 w-4 text-primary" /><b>POST /api/v1/ingest</b> — push records</div>
              <pre className="text-xs bg-background/60 border rounded-lg p-3 overflow-x-auto">{`curl -X POST https://mnb-cortex.vercel.app/api/v1/ingest \\
  -H "x-api-key: YOUR_KEY" -H "Content-Type: application/json" \\
  -d '{"table":"sales_orders","rows":[{"customer_name":"Acme","product":"Alpha-100","amount":250000}]}'`}</pre>
              <p className="text-xs text-muted-foreground mt-2">Tables: sales_orders · invoices · inventory_items · customers</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2"><Terminal className="h-4 w-4 text-primary" /><b>GET /api/v1/metrics</b> — read business KPIs</div>
              <pre className="text-xs bg-background/60 border rounded-lg p-3 overflow-x-auto">{`curl https://mnb-cortex.vercel.app/api/v1/metrics -H "x-api-key: YOUR_KEY"`}</pre>
            </Card>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
