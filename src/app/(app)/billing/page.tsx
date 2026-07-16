import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getUsage, getReportLinks } from "@/lib/data";
import { PLANS } from "@/lib/config";
import { Check, Zap } from "lucide-react";
import Link from "next/link";
import { UpgradeButton } from "@/components/upgrade-button";
import { createReportLink, revokeReportLink } from "@/lib/actions";
import { Link2, Trash2 } from "lucide-react";

export const dynamic = "force-dynamic";
const LABEL: Record<string, string> = { sales_orders: "Sales orders", invoices: "Invoices", inventory_items: "Inventory items", employees: "Employees", customers: "Customers", documents: "Documents" };

export default async function Billing() {
  const { counts, live } = await getUsage();
  const links = await getReportLinks();
  return (
    <>
      <Topbar title="Billing & Plan" subtitle="Manage your subscription" />
      <PageShell>
        <Card className="p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/15 p-2.5"><Zap className="h-6 w-6 text-primary" /></div>
            <div><div className="flex items-center gap-2"><span className="font-semibold">Growth plan</span><Badge className="bg-success/10 text-success border-success/20">14-day trial</Badge></div>
              <div className="text-sm text-muted-foreground">₹7,999/mo · renews after trial · all 13 modules</div></div>
          </div>
          <UpgradeButton plan="Premium" />
        </Card>

        {live && (
          <Section title="Usage this month">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(counts).map(([k, v]) => (
                <Card key={k} className="p-4"><div className="text-sm text-muted-foreground">{LABEL[k] || k}</div><div className="text-2xl font-semibold mt-1">{v as number}</div></Card>
              ))}
            </div>
          </Section>
        )}

        {live && (
          <Section title="Share a read-only snapshot" desc="Public link to a live business snapshot — no login needed">
            <form action={createReportLink}><button className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground h-9 px-4 text-sm font-medium hover:opacity-90"><Link2 className="h-4 w-4" /> Create share link</button></form>
            <div className="space-y-2 mt-3">
              {links.rows.map((l: any) => (
                <div key={l.id} className="flex items-center justify-between rounded-lg border p-3">
                  <a href={`/r/${l.token}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary break-all">mnb-cortex.vercel.app/r/{l.token}</a>
                  <form action={revokeReportLink}><input type="hidden" name="id" value={l.id} /><button className="text-muted-foreground hover:text-danger p-1.5 rounded-md hover:bg-danger/10"><Trash2 className="h-4 w-4" /></button></form>
                </div>
              ))}
              {links.rows.length === 0 && <p className="text-xs text-muted-foreground">No share links yet.</p>}
            </div>
          </Section>
        )}

        <Section title="Available plans" desc="Change anytime — annual saves ~20%">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
            {PLANS.map((p) => (
              <Card key={p.id} className={`p-4 ${p.highlight ? "border-primary" : ""}`}>
                <div className="font-semibold">{p.name}</div>
                <div className="text-lg font-bold mt-1">{p.monthly === 0 ? "Custom" : `₹${p.monthly.toLocaleString("en-IN")}`}<span className="text-xs text-muted-foreground font-normal">{p.monthly ? "/mo" : ""}</span></div>
                <ul className="mt-3 space-y-1.5 text-xs">{p.features.slice(0, 4).map((f) => <li key={f} className="flex gap-1.5"><Check className="h-3.5 w-3.5 text-success shrink-0" />{f}</li>)}</ul>
                <Link href="/pricing" className="mt-3 block text-center rounded-lg border h-8 leading-8 text-xs hover:bg-accent">Choose</Link>
              </Card>
            ))}
          </div>
        </Section>
      </PageShell>
    </>
  );
}
