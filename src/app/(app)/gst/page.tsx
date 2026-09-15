import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIPanel } from "@/components/ai-panel";
import {
  STATUTORY_CATALOGUE, nextOccurrence, daysUntilIST, whenPhrase, URGENT_WITHIN_DAYS,
} from "@/lib/statutory";
import { getStatutoryProfile } from "@/lib/data";
import { applicability, excludedBecause } from "@/lib/statutory-profile";
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

/*
  Distance comes from lib/statutory.ts now, not from a second implementation
  here. Mine measured from `now`; the warning engine and /compliance measure
  from IST midnight, so the same filing could be shown as a different number
  of days away on two pages of the same product. See daysUntilIST().
*/
function awayFrom(d: Date | null, now: Date): number {
  return d ? Math.max(0, daysUntilIST(d, now)) : Number.MAX_SAFE_INTEGER;
}

export default async function GST() {
  const now = new Date();
  /*
    NARROWED, with the reason kept.

    A monthly GST filer has no PMT-06 and no IFF; a QRMP filer has no monthly
    GSTR-1 or GSTR-3B. Showing all seven to everyone was the noise this
    profile exists to remove. Excluded rules are not dropped — they render
    below, muted, saying which answer hid them, because safety rule 3 in
    lib/statutory-profile.ts forbids a silently shortened compliance list.
  */
  const profile = await getStatutoryProfile();
  const rows = GST_RULE_IDS
    .map((id) => {
      const rule = STATUTORY_CATALOGUE.find((r) => r.id === id);
      if (!rule) return null;
      const next = nextOccurrence(id, now);
      return {
        rule, next, href: topicFor(id), away: awayFrom(nextOccurrence(id, now), now),
        excluded: applicability(id, profile) === "excluded",
        why: excludedBecause(id, profile),
      };
    })
    .filter(Boolean)
    /*
      SORTED BY WHAT IS ACTUALLY DUE NEXT.

      Caught by looking at the deployed page rather than the code. The cards
      were rendered in GST_RULE_IDS order, which is day-of-MONTH order — so on
      14 September the page opened with "TDS / TCS deposit — 7 Oct" and buried
      "PF & ESI — 15 Sept", due the following day, in fifth position.

      Every date on the card was correct. The page was still wrong, because a
      filing calendar's job is to answer "what do I have to do next", and this
      one answered "what falls earliest in an abstract month". A customer
      scanning the top row would have seen three things three weeks away and
      missed the one due tomorrow.

      Day-of-month ordering is the right ordering for a static reference table,
      which is what the hardcoded array this replaced actually was. Once the
      dates became real, the ordering had to become real too — that is the part
      I missed when I made them real.
    */
    .sort((a, b) => a!.away - b!.away) as Array<{
      rule: (typeof STATUTORY_CATALOGUE)[number]; next: Date | null; href: string | null; away: number;
      excluded: boolean; why: string | null;
    }>;
  const live = rows.filter((r) => !r.excluded);
  const hidden = rows.filter((r) => r.excluded);

  return (
    <>
      <Topbar title="GST & Compliance" subtitle="Stay filing-ready — with an AI assistant that knows Indian tax" />
      <PageShell>
        <Section
          title="Your next filing dates"
          desc="Read from the same calendar Cortex warns you from — not a second copy"
        >
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {live.map(({ rule, next, href, away }) => {
              /*
                "15 Sept" does not tell an owner that this is tomorrow, and
                tomorrow is the only thing they need to know from this card.
                The date stays — it is what they will write down — with the
                distance alongside it, which is what makes them act.
              */
              const when = whenPhrase(away);
              const urgent = away <= URGENT_WITHIN_DAYS;
              const card = (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm">{rule.name}</span>
                    <Badge className={urgent ? tone.high : tone[rule.severity]}>
                      {next ? fmt.format(next) : `Day ${rule.day}`}
                    </Badge>
                  </div>
                  {next && (
                    <div className={`text-xs mt-1 ${urgent ? "text-danger font-medium" : "text-muted-foreground"}`}>
                      Due {when}
                    </div>
                  )}
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

        {/*
          WHAT YOUR ANSWERS HID — shown, not dropped.

          Safety rule 3 in lib/statutory-profile.ts: a compliance list that
          silently gets shorter is indistinguishable from a bug. A QRMP filer
          should see that monthly GSTR-1 is absent BECAUSE they said quarterly,
          so that if they switch schemes — or mis-answered — the sentence that
          explains the absence is also the one that tells them what to change.

          The reason is always attributed to the owner ("you told us …"), never
          asserted by us. Cortex has no view on anybody's registration status.
        */}
        {hidden.length > 0 && (
          <Section
            title={`Not shown for you (${hidden.length})`}
            desc="Based on your own answers. Wrong? Change them on the compliance page and these come straight back."
          >
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {hidden.map(({ rule, next, why }) => (
                <Card key={rule.id} className="p-4 opacity-70">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm line-through decoration-muted-foreground/40">{rule.name}</span>
                    <Badge className={tone.low}>{next ? fmt.format(next) : `Day ${rule.day}`}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">{why}</div>
                </Card>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              <Link href="/compliance" className="text-primary underline">Review your compliance answers</Link>
            </p>
          </Section>
        )}

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
