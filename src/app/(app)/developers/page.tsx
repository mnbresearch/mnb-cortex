import { getWebhooks, getWebhookDeliveries } from "@/lib/data";
import { addWebhook, deleteWebhook, testWebhook } from "@/lib/actions";
import { WEBHOOK_EVENTS } from "@/lib/webhooks";
import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Field, CollapsibleForm } from "@/components/forms";
import { getApiKeys } from "@/lib/data";
import { generateApiKey, deleteApiKey } from "@/lib/actions";
import { KeyRound, Trash2, Terminal } from "lucide-react";
import { hasRole } from "@/lib/roles";

export const dynamic = "force-dynamic";
export default async function Developers() {
  /*
    ROLE GUARD. This page had none.

    It renders API keys in plaintext and, until the fix in lib/data.ts, the
    webhook HMAC signing secret — to any member, including a `viewer`. A viewer
    is the role given to accountants, interns and (in Practice mode) clients,
    and it exists specifically to deny writes. With the API key in hand they
    could write through /api/v1/ingest, which authorises on the key alone;
    with the signing secret they could forge events the customer's own systems
    would verify as genuinely from Cortex.

    lib/data.ts now enforces this independently, because a guard that lives
    only in a page is one new page away from being missed.
  */
  if (!(await hasRole("admin"))) {
    return (
      <>
        <Topbar title="Developers · API" subtitle="Push data in and pull insights out" />
        <PageShell>
          <Card className="p-6 text-sm max-w-2xl">
            <div className="font-medium">API keys are visible to admins and owners only.</div>
            <p className="text-muted-foreground mt-2 leading-6">
              An API key can read and write everything in this workspace, and the webhook signing
              secret can be used to forge messages that look like they came from Cortex — so both
              are kept to the people who can already do those things. Ask an admin if you need one.
            </p>
          </Card>
        </PageShell>
      </>
    );
  }

  const hooks = await getWebhooks();
  const deliveries = await getWebhookDeliveries();
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

        <Section title="Outbound webhooks" desc="Cortex POSTs a signed JSON event to your URL when something happens">
          <div className="rounded-lg border p-4 text-sm space-y-2">
            <div className="font-medium">How to verify a request</div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Every delivery carries <code className="bg-secondary px-1 rounded">X-Cortex-Event</code>,{" "}
              <code className="bg-secondary px-1 rounded">X-Cortex-Timestamp</code> and{" "}
              <code className="bg-secondary px-1 rounded">X-Cortex-Signature</code>. Recompute the signature as
              base64(HMAC-SHA256(<code className="bg-secondary px-1 rounded">timestamp + "." + rawBody</code>)) using your
              endpoint secret and compare. Reject anything that doesn't match. We retry a failed delivery up to 5 times.
            </p>
            <div className="text-xs text-muted-foreground">
              Events: {WEBHOOK_EVENTS.map((e) => <code key={e} className="bg-secondary px-1 rounded mr-1">{e}</code>)}
            </div>
          </div>

          <CollapsibleForm title="Add webhook endpoint" action={addWebhook}>
            <Field name="url" label="HTTPS endpoint" placeholder="https://your-app.com/hooks/cortex" required />
            <Field name="label" label="Label (optional)" placeholder="Zapier, internal ERP…" />
            <Field name="events" label="Events (comma-separated, blank = all)" placeholder="alert.created, payment.succeeded" />
          </CollapsibleForm>

          <div className="space-y-2 mt-3">
            {hooks.rows.map((h: any) => (
              <div key={h.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium break-all">{h.url}</div>
                    <div className="text-xs text-muted-foreground">
                      {h.label ? h.label + " · " : ""}{(h.events || []).length ? (h.events || []).join(", ") : "all events"}
                      {h.last_ok_at ? ` · last OK ${new Date(h.last_ok_at).toLocaleString("en-IN")}` : ""}
                    </div>
                    {h.last_error && <div className="text-xs text-danger mt-0.5">Last error: {h.last_error}</div>}
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Secret: <code className="bg-secondary px-1 rounded break-all">{h.secret}</code>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <form action={testWebhook}><input type="hidden" name="id" value={h.id} />
                      <button className="rounded-lg border h-8 px-3 text-xs hover:bg-accent">Send test</button></form>
                    <form action={deleteWebhook}><input type="hidden" name="id" value={h.id} />
                      <button className="rounded-lg border h-8 px-3 text-xs text-danger hover:bg-danger/10">Remove</button></form>
                  </div>
                </div>
              </div>
            ))}
            {hooks.rows.length === 0 && <p className="text-xs text-muted-foreground">No endpoints yet.</p>}
          </div>

          {deliveries.rows.length > 0 && (
            <div className="mt-4">
              <div className="text-sm font-medium mb-2">Recent deliveries</div>
              <div className="space-y-1.5">
                {deliveries.rows.map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs">
                    <span><code className="bg-secondary px-1 rounded">{d.event}</code> · {new Date(d.created_at).toLocaleString("en-IN")}</span>
                    <span className={d.status === "delivered" ? "text-success" : d.status === "failed" ? "text-danger" : "text-warning"}>
                      {d.status}{d.last_status ? ` (${d.last_status})` : ""}{d.attempts > 1 ? ` · ${d.attempts} tries` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      </PageShell>
    </>
  );
}
