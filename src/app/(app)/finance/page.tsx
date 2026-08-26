import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Stat } from "@/components/stat";
import { Section } from "@/components/section";
import { InsightCard } from "@/components/insight-card";
import { TrendChart } from "@/components/charts/trend-chart";
import { DataTable } from "@/components/data-table";
import { CollapsibleForm, Field, SelectField, ActionForm } from "@/components/forms";
import { getInsights, getInvoices, getFinanceSeries, getUserAndOrg, getMetrics } from "@/lib/data";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { addInvoice, createInvoiceAI, sendReminderAI } from "@/lib/actions";

export const dynamic = "force-dynamic";
const pl = Array.from({ length: 12 }, (_, m) => ({ month: new Date(2025, m, 1).toLocaleString("en", { month: "short" }), revenue: 3.0 + m * 0.11, profit: 0.42 + m * 0.009 }));

export default async function Finance() {
  const { orgId } = await getUserAndOrg();
  const signedIn = Boolean(orgId);
  const metrics = await getMetrics();
  const byKey = Object.fromEntries(metrics.map((m) => [m.metric_key, m]));
  const insights = await getInsights("finance");
  const { rows, live } = await getInvoices();
  const fin = await getFinanceSeries();
  // A signed-in workspace with an empty ledger used to get `pl` — a smooth
  // invented ramp from ₹3.0 Cr to ₹4.21 Cr, labelled "Trailing 12 months", with
  // no disclaimer. The dashboard already handled this correctly; this page was
  // missed. Signed in and no data now means an empty chart, which is the truth.
  const chartData = fin.live && fin.series ? fin.series : (signedIn ? [] : pl);
  const showingSample = !signedIn && !fin.live;
  // Plot only the series with real numbers (see getFinanceSeries).
  const FIN_KEYS = [{ k: "revenue", label: "Revenue", color: "hsl(var(--primary))" }, { k: "profit", label: "Net profit", color: "hsl(var(--success))" }];
  return (
    <>
      <Topbar title="Finance Intelligence" subtitle="Tally · Zoho Books · QuickBooks · GST · Bank" />
      <PageShell>
        {/*
          These four were hardcoded — "Net profit ₹51.0 L", "Gross margin 31%",
          "Cash runway 5 months", "EBITDA ₹62.0 L" — and shown to every signed-in
          workspace as its own figures, directly above a chart plotting their real
          (and completely different) numbers. A signed-in workspace now sees only
          KPIs derived from its own data.
        */}
        {signedIn ? (
          metrics.length ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {["revenue", "receivables", "cash_balance", "cash", "working_capital", "gst_turnover"]
                .filter((k) => byKey[k])
                .slice(0, 4)
                .map((k) => {
                  const m = byKey[k];
                  const money = m.unit === "INR";
                  return (
                    <Stat
                      key={k}
                      label={m.label}
                      value={money ? `₹${Number(m.value).toLocaleString("en-IN")}` : `${m.value}${m.unit ? " " + m.unit : ""}`}
                      hint={m.delta_pct ? `${m.delta_pct > 0 ? "+" : ""}${m.delta_pct}% vs last period` : undefined}
                      tone={m.status === "red" ? "text-danger" : m.status === "yellow" ? "text-warning" : undefined}
                    />
                  );
                })}
            </div>
          ) : (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              No finance KPIs yet. <Link href="/bank" className="text-primary">Upload a bank statement</Link>,{" "}
              <Link href="/gst-reader" className="text-primary">read a GST return</Link> or{" "}
              <Link href="/import" className="text-primary">import invoices</Link> and they'll appear here.
            </Card>
          )
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Net profit (MTD)" value="₹51.0 L" hint="-7% MoM" tone="text-warning" />
            <Stat label="Gross margin" value="31%" hint="-2 pts" tone="text-warning" />
            <Stat label="Cash runway" value="5 months" hint="watch" tone="text-warning" />
            <Stat label="EBITDA" value="₹62.0 L" hint="14.6% margin" />
          </div>
        )}
        <Section title="Revenue vs net profit" desc={showingSample ? "Sample data — trailing 12 months (₹ Cr)" : "Trailing 12 months (₹ Cr)"}>
          <TrendChart
            data={chartData}
            keys={fin.live ? FIN_KEYS.filter((s) => fin.keys.includes(s.k)) : FIN_KEYS}
            empty={<>No revenue or profit history yet. <Link href="/bank" className="text-primary">Upload a bank statement</Link> or <Link href="/import" className="text-primary">import invoices</Link> to build the trend.</>}
          />
        </Section>

        <Section title="AI actions" desc="The COO executes — these write real records">
          <div className="flex flex-wrap gap-2">
            <ActionForm action={createInvoiceAI} label="Generate invoice (AI)" primary />
            <ActionForm action={sendReminderAI} label="Send payment reminders" />
          </div>
        </Section>

        <CollapsibleForm title="Add invoice" action={addInvoice}>
          <Field name="party" label="Party" required />
          <Field name="amount" label="Amount (₹)" type="number" />
          <Field name="due_date" label="Due date" type="date" />
          <SelectField name="type" label="Type" options={["receivable","payable"]} />
          <SelectField name="status" label="Status" options={["pending","paid","overdue"]} />
        </CollapsibleForm>
        <DataTable title="Invoices" rows={rows} live={live} table="invoices" path="/finance"
          cols={[{key:"invoice_no",label:"Invoice #"},{key:"party",label:"Party"},{key:"amount",label:"Amount",kind:"inr"},{key:"type",label:"Type"},{key:"status",label:"Status"},{key:"due_date",label:"Due",kind:"date"}]} />

        <div className="grid md:grid-cols-2 gap-3">{insights.map((i) => <InsightCard key={i.id} ins={i} />)}</div>
      </PageShell>
    </>
  );
}
