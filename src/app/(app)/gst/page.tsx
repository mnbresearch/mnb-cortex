import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIPanel } from "@/components/ai-panel";
import { STATUTORY_CATALOGUE, nextOccurrence } from "@/lib/statutory";
import { GST_RATES, GST_RATES_AS_OF } from "@/lib/gst-rates";
import { DEADLINE_TOPICS } from "@/lib/deadline-seo";

export const dynamic = "force-dynamic";

/*
  THE HEADLINE COMPLIANCE PAGE HELD ITS OWN COPY OF THE CALENDAR AND THE RATES.

  What was here: a four-row `calendar` array typed into this file
  ("GSTR-1 · Due 11th", "GSTR-3B · Due 20th", …) under the heading "This
  month's filing calendar", and a four-row `rates` array with its own
  RATES_AS_OF string. Both duplicated data that already exists as a single
  source in this codebase:

    - lib/statutory.ts — nineteen rules with day, severity and an `appliesIf`
      saying who each one applies to. It is what the nightly warning engine,
      /compliance, and the thirteen public /deadlines pages all read.
    - lib/gst-rates.ts — the slabs, whose own header says it exists precisely
      "because the rate list was previously hardcoded".

  This is not a tidiness argument. The comment that used to sit above the rate
  table records that it had ALREADY gone stale once — it listed the 12% and 28%
  slabs for two years after GST 2.0 abolished them — and says "do not let this
  drift again", which a second hardcoded copy guarantees it will. In a product
  that warns people about tax dates, a page that states a due date from its own
  private array is one edit away from contradicting the warning email the same
  product sent that morning.

  Three things change as a consequence, all of them improvements a customer
  notices:

    - "Due 20th" becomes the actual next date, computed in IST, so the page
      answers "when" rather than making the reader do calendar arithmetic.
    - `appliesIf` is shown. The old cards asserted four dates at every visitor
      regardless of whether they file monthly, have employees, or are on QRMP.
    - each row links to its public deadline page, which is the fuller
      explanation we already wrote and never linked to from inside the app.
*/

/** The rules a GST-and-compliance page should lead with, in filing order. */
const GST_RULE_IDS = ["tds", "gstr7", "gstr1", "iff", "pf", "gstr3b", "pmt06"];

const tone: Record<string, string> = {
  high: "bg-danger/10 text-danger border-danger/20",
  medium: "bg-warning/10 text-warning border-warning/20",
  low: "border-border text-muted-foreground",
};

/** The public topic page covering a rule, if one exists. */
function topicFor(id: string): string | null {
  const t = DEADLINE_TOPICS.find((x) => x.ids.includes(id));
  return t ? `/deadlines/${t.slug}` : null;
}

const fmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

export default function GST() {
  const now = new Date();
  const rows = GST_RULE_IDS
    .map((id) => {
      const rule = STATUTORY_CATALOGUE.find((r) => r.id === id);
      if (!rule) return null;
      const next = nextOccurrence(id, now);
      return { rule, next, href: topicFor(id) };
    })
    .filter(Boolean) as Array<{ rule: (typeof STATUTORY_CATALOGUE)[number]; next: Date | null; href: string | null }>;

  return (
    <>
      <Topbar title="GST & Compliance" subtitle="Stay filing-ready — with an AI assistant that knows Indian tax" />
      <PageShell>
        <Section
          title="Your next filing dates"
          desc="Read from the same calendar Cortex warns you from — not a second copy"
        >
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rows.map(({ rule, next, href }) => {
              const card = (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm">{rule.name}</span>
                    <Badge className={tone[rule.severity]}>
                      {next ? fmt.format(next) : `Day ${rule.day}`}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{rule.what}</div>
                  {/*
                    ALWAYS SHOWN, NEVER ASSUMED. Cortex is not told whether a
                    business is GST-registered, has employees or files under
                    QRMP, so every date on this page is conditional and says so
                    — the same discipline lib/statutory.ts opens with and the
                    public deadline pages follow.
                  */}
                  <div className="text-[11px] text-muted-foreground mt-2">
                    Applies if {rule.appliesIf}.
                  </div>
                </>
              );
              return href ? (
                <Link key={rule.id} href={href} className="block">
                  <Card className="p-4 hover-lift h-full">{card}</Card>
                </Link>
              ) : (
                <Card key={rule.id} className="p-4 h-full">{card}</Card>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Dates are the next occurrence in IST. <Link href="/deadlines" className="text-primary underline">See the full compliance calendar</Link>,
            or <Link href="/compliance" className="text-primary underline">what is due for this workspace</Link>.
          </p>
        </Section>

        <Section title="Ask the GST assistant" desc="ITC, rates, place of supply, e-invoicing, returns">
          <AIPanel
            mode="gst"
            placeholder="e.g. Can I claim ITC on a company vehicle? What's the rate on my product?"
            aria-label="Ask a GST question"
            cta="Ask the GST assistant"
            multiline
            saveMode="strategy"
            suggestions={[
              "Can I claim ITC on a company vehicle?",
              "What is the place of supply for a service delivered online?",
              "Do I need e-invoicing at my turnover?",
              "What happens if I file GSTR-3B late?",
            ]}
          />
          <p className="text-xs text-muted-foreground mt-2">General guidance only — confirm edge cases with your chartered accountant.</p>
        </Section>

        <Section title="GST rate slabs" desc={`Quick reference · ${GST_RATES_AS_OF}`}>
          {/*
            From lib/gst-rates.ts, which the calculator, the invoice generator
            and the quote builder already share. The version typed into this
            file listed four slabs and omitted the 0.25% and 3% special rates
            for stones and bullion — so a jeweller reading the app's own
            reference table would have concluded their rate did not exist.
          */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {GST_RATES.map((r) => (
              <Card key={r.v} className="p-4">
                <div className="text-xl font-bold">{r.v}%</div>
                <div className="text-xs text-muted-foreground mt-1 capitalize">{r.note}</div>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            The 12% and 28% slabs were abolished on 22 September 2025. If you still have documents quoting them, they need reissuing.
          </p>
        </Section>
      </PageShell>
    </>
  );
}
