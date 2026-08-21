import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getUsage, getReportLinks, getOrgProfile } from "@/lib/data";
import { getBillingStatus } from "@/lib/billing";
import { PLANS } from "@/lib/config";
import { Check, Zap, Clock, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { UpgradeButton } from "@/components/upgrade-button";
import { PlanPicker } from "@/components/plan-picker";
import { AutoRenew } from "@/components/autorenew";
import { PaymentReturn } from "@/components/payment-return";
import { TRIAL_DAYS } from "@/lib/config";
import { createReportLink, revokeReportLink } from "@/lib/actions";
import { Link2, Trash2 } from "lucide-react";

export const dynamic = "force-dynamic";
const LABEL: Record<string, string> = { sales_orders: "Sales orders", invoices: "Invoices", inventory_items: "Inventory items", employees: "Employees", customers: "Customers", documents: "Documents" };

export default async function Billing() {
  const { counts, live } = await getUsage();
  const links = await getReportLinks();
  const billing = await getBillingStatus();
  const profile = await getOrgProfile();   // carries the remembered billing phone
  const planName = billing.plan.charAt(0).toUpperCase() + billing.plan.slice(1);
  const badge = billing.status === "active"
    ? { cls: "bg-success/10 text-success border-success/20", text: "Active" }
    : billing.status === "expired"
    ? { cls: "bg-danger/10 text-danger border-danger/20", text: "No active plan" }
    : { cls: "bg-warning/10 text-warning border-warning/20", text: `Trial · ${billing.daysLeft} ${billing.daysLeft === 1 ? "day" : "days"} left` };
  return (
    <>
      <Topbar title="Billing & Plan" subtitle="Manage your subscription" />
      <PageShell>
        <PaymentReturn />
        <Card className={`p-5 flex flex-wrap items-center justify-between gap-3 ${billing.status === "expired" ? "border-danger/30 bg-danger/5" : ""}`}>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/15 p-2.5">
              {billing.status === "active" ? <Zap className="h-6 w-6 text-primary" /> : billing.status === "expired" ? <AlertTriangle className="h-6 w-6 text-danger" /> : <Clock className="h-6 w-6 text-warning" />}
            </div>
            <div>
              <div className="flex items-center gap-2"><span className="font-semibold">{planName} plan</span><Badge className={badge.cls}>{badge.text}</Badge></div>
              <div className="text-sm text-muted-foreground">
                {billing.status === "active"
                  ? (billing.subscriptionEndsAt
                      ? `Active · renews ${new Date(billing.subscriptionEndsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                      : "Subscription active · thank you!")
                  : billing.status === "expired" ? "No active plan — choose one below to start using Cortex."
                  : billing.trialEndsAt ? `Free trial ends ${new Date(billing.trialEndsAt).toLocaleDateString("en-IN")} · full access until then`
                  : "No active plan"}
              </div>
            </div>
          </div>
        </Card>

        {billing.status !== "active" && (
          <Card className="p-4 text-sm text-muted-foreground">
            Cortex runs on credits. Start with a ₹149 credit pack to try it with no subscription, or pick a plan below for a monthly allowance. Either way your data stays yours — nothing is deleted if you pause.
          </Card>
        )}

        {live && (
          <Section title="Your data" desc="Records in this workspace — not billing usage">
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

        {/* Only offer a mandate for a plan the customer has actually chosen.
            Every workspace is created with plan: "growth" as a signup default,
            so a trial user who had never picked anything was being offered a
            ₹6,999/month standing authorisation — five times the entry price,
            for a tier they may not want. Anyone still on the default is sent to
            the plan list below to choose first. */}
        <Section title="Auto-renewal" desc="Authorise once instead of re-paying every cycle">
          {billing.status === "active" || (profile as any)?.autorenew_status ? (
            <AutoRenew
              planId={billing.plan}
              status={(profile as any)?.autorenew_status}
              nextCharge={(profile as any)?.autorenew_next}
            />
          ) : (
            <div className="rounded-xl border p-4">
              <p className="text-sm font-medium">Choose a plan first</p>
              <p className="text-sm text-muted-foreground mt-1">
                Auto-renewal sets up a standing authorisation for a specific plan, so pick the one you want below.
                You can switch it on straight after — and turn it off at any time without losing the period you've paid for.
              </p>
              <a href="#plans" className="mt-3 inline-flex items-center rounded-lg border h-9 px-3 text-xs hover:bg-accent">
                See plans
              </a>
            </div>
          )}
        </Section>

        <div id="plans" className="scroll-mt-24" />
        <Section title="Available plans" desc="Change anytime — annual saves ~20%">
          <PlanPicker currentPlan={billing.status === "active" ? planName : ""} savedPhone={(profile as any)?.billing_phone || ""} />
        </Section>

      </PageShell>
    </>
  );
}
