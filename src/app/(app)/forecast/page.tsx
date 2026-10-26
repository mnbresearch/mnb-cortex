import { getUserAndOrg } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { lastCompleteMonthRevenue } from "@/lib/money-rules";
import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { AIPanel } from "@/components/ai-panel";
import { ScenarioPlanner, type ScenarioBaseline } from "@/components/scenario-planner";
import { StressTestSimulator } from "@/components/stress-test-simulator";
import { TredsArbitrageCard } from "@/components/treds-arbitrage-card";
import { TrendingUp, Wallet, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

/*
  THE DRIVER CARDS ARE GONE, NOT REWORDED.

  They were four hardcoded strings — "West region + Premium-X ramp",
  "RM-204 input cost +9%, unrepriced", "₹72 L overdue, 5 accounts >45 days",
  "Premium-X mix rising each week" — sitting under the heading "What's driving
  the forecast · The levers the model is weighting most", immediately below a
  section promising "a CFO-grade 90-day outlook grounded in your live numbers".

  None of it was this workspace's. There is no Premium-X and no RM-204 in the
  data; the products are Oil Seal OS-45, Gear Set GS-7, Axle Shaft AX-120. The
  real overdue figure is ₹2.54 Cr, not ₹72 L. So the page named invented
  products, an invented input-cost rise and an understated receivables number
  as the causes of the customer's own forecast, three and a half times off, and
  claimed live grounding in the sentence above them.

  Deleting them is the fix rather than relabelling them "example", because the
  section's entire claim is that these are the levers being weighted. An
  example lever is not a lever. The AI forecast above already explains its
  reasoning from the real figures, and the 90-day cards beside it are computed.
  If driver cards come back they must be derived from metric ids, not typed.
*/

/**
 * The scenario baseline, from the workspace's own KPIs.
 *
 * scenario-planner.tsx carried four constants under a comment claiming they
 * were "drawn from the live business snapshot" — ₹4.25 Cr monthly revenue, 12%
 * margin, ₹1.89 Cr reserve. They were read from nothing, so every customer's
 * what-ifs moved a business that does not exist. The misleading comment was the
 * reason it survived: it told each reader the wiring was already there.
 */
async function scenarioBaseline(): Promise<ScenarioBaseline> {
  try {
    const { getMetrics } = await import("@/lib/data");
    const m = await getMetrics();
    const pick = (k: string) => {
      const row = m.find((x) => x.metric_key === k);
      const v = row ? Number(row.value) : NaN;
      return Number.isFinite(v) ? v : null;
    };
    const cash = pick("cash_balance");
    /*
      REVENUE: THE LAST COMPLETE MONTH, NOT MONTH-TO-DATE.

      The "revenue" KPI is "Revenue (MTD)" — on the 3rd of the month it is
      three days of sales — and it was used as the MONTHLY baseline, so every
      what-if early in a month modelled a business a tenth of its size. The
      ledger carries one revenue figure per month (recomputeMetrics writes
      it); the newest month strictly before this one is the honest baseline.
    */
    let revenue: number | null = null;
    let revenueBasis: string | null = null;
    const { orgId } = await getUserAndOrg();
    if (orgId) {
      const sb = await createClient();
      const { data } = await sb.from("finance_ledger").select("period, revenue")
        .eq("org_id", orgId).order("period", { ascending: false }).limit(24);
      const full = lastCompleteMonthRevenue((data as any[]) || [], new Date().toISOString().slice(0, 7));
      if (full) {
        revenue = full.revenue;
        revenueBasis = new Date(full.period + "-01T00:00:00Z")
          .toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }) + ", the last complete month";
      }
    }
    /*
      MARGIN: NOT READ FROM ANYWHERE, BECAUSE NOTHING HOLDS IT.

      This used to be `pick("gross_margin") ?? pick("net_profit")`. metrics.ts
      emits neither key, so it was always null and the planner's 12%
      placeholder was presented as "from your own figures". It is now null on
      purpose and the planner asks the owner to set it as an assumption.
    */
    return { revenue, margin: null, cash, revenueBasis };
  } catch {
    return { revenue: null, margin: null, cash: null };
  }
}

export default async function Forecast() {
  const { orgId } = await getUserAndOrg();
  const signedIn = Boolean(orgId);
  const baseline = await scenarioBaseline();

  return (
    <>
      <Topbar title="Forecasting & Scenarios" subtitle="See the next 90 days before they happen" />
      <PageShell>
        {/*
          THE GATE WAS INVERTED, AND THIS IS THE SIXTH PAGE WITH IT.

          `{signedIn && (...)}` showed the "these are examples, not your data"
          card ONLY to a signed-in customer — so the logged-out visitor, the one
          person with no way to tell an invented figure from a real one, saw the
          worked example with no warning at all. marketing/page.tsx documents the
          fix and names the pages it was applied to; these were missed.

          Unconditional is correct. A signed-in owner also benefits from being
          told which numbers on the page are illustrative, and the cost of
          saying so twice is a sentence.
        */}
        <Card className="p-4 text-sm text-muted-foreground">
          The worked example below is illustrative — it is not your data. Use the AI panel on this page to get the
          same analysis built from your own numbers.
        </Card>
        {/*
          Labelled inline, not just prefaced by a disclaimer card.

          These three are styled identically to the live KPI cards on
          /dashboard, so a grey note above them does not stop someone reading
          "₹13.6 Cr" as their own projection — especially on a second visit,
          when the note has become furniture. The pattern used elsewhere in this
          codebase (receivables-aging, abc-analysis) marks the block itself.
        */}
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-warning/30 bg-warning/10 text-warning px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">Example</span>
          <span className="text-xs text-muted-foreground">Sample figures, not your business</span>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 opacity-90">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingUp className="h-4 w-4 text-success" /> Projected revenue (90d)</div>
            <div className="text-2xl font-bold mt-1">₹13.6 Cr</div>
            <div className="text-xs text-success mt-0.5">+11% vs prior quarter</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="h-4 w-4 text-warning" /> Cash runway</div>
            <div className="text-2xl font-bold mt-1">~5 months</div>
            <div className="text-xs text-warning mt-0.5">Tightens in Nov without action</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><AlertTriangle className="h-4 w-4 text-danger" /> Forecast confidence</div>
            <div className="text-2xl font-bold mt-1">High</div>
            <div className="text-xs text-muted-foreground mt-0.5">Based on 6 months of trend</div>
          </Card>
        </div>

        <ScenarioPlanner baseline={baseline} />

        <Section title="Working capital stress test" desc="Bank-grade adverse shock simulation, Altman Z'-score, and liquidity cliff modeling">
          <StressTestSimulator
            initialMetrics={{
              monthlyRevenue: baseline.revenue ?? undefined,
              cashReserve: baseline.cash ?? undefined,
              grossMarginPct: baseline.margin ? Math.round(baseline.margin * 100) : undefined,
            }}
          />
        </Section>

        <Section title="RBI TReDS factoring arbitrage" desc="Instant 48-hour working capital release via institutional invoice auction">
          <TredsArbitrageCard defaultAmount={baseline.revenue ? Math.round(baseline.revenue * 0.5) : undefined} />
        </Section>

        <Section title="AI forecast" desc="A 90-day outlook built from the figures in this workspace">
          <AIPanel inputOptional mode="forecast" placeholder="Optional: focus the forecast (e.g. 'if we win the Dubai order' or 'cash only')" cta="Generate 90-day forecast" saveMode="strategy" />
        </Section>

      </PageShell>
    </>
  );
}
