import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIPanel } from "@/components/ai-panel";
import { upcomingDeadlines, whenPhrase, URGENT_WITHIN_DAYS, splitByProfile } from "@/lib/statutory";
import { getStatutoryProfile } from "@/lib/data";
import { profileIsSet } from "@/lib/statutory-profile";
import { StatutoryProfileForm } from "@/components/statutory-profile-form";

export const dynamic = "force-dynamic";

const monthly = [
  { day: "7", item: "TDS / TCS deposit", note: "Tax deducted in the previous month", tone: "warn" },
  { day: "10", item: "GSTR-7 / GSTR-8", note: "TDS/TCS under GST (if applicable)", tone: "flat" },
  { day: "11", item: "GSTR-1", note: "Outward supplies (monthly filers)", tone: "warn" },
  { day: "13", item: "GSTR-6 / IFF", note: "Input service distributor / QRMP invoices", tone: "flat" },
  { day: "15", item: "PF & ESI payment", note: "Provident fund and ESI contributions", tone: "danger" },
  { day: "20", item: "GSTR-3B", note: "Summary return + GST payment", tone: "danger" },
  { day: "25", item: "PMT-06", note: "GST payment for QRMP scheme", tone: "flat" },
];

const periodic = [
  { when: "15 Jun / Sep / Dec / Mar", item: "Advance tax instalments", note: "15% / 45% / 75% / 100% of estimated liability" },
  { when: "31 Jul", item: "Income Tax Return (individuals)", note: "Non-audit cases" },
  { when: "31 Oct", item: "ITR + Tax Audit", note: "Audit cases (44AB)" },
  { when: "30 Sep / 31 Oct", item: "ROC filings (AOC-4, MGT-7)", note: "For companies, post-AGM" },
  { when: "Quarterly", item: "TDS returns (24Q/26Q)", note: "31 Jul, 31 Oct, 31 Jan, 31 May" },
];

const tone: Record<string, string> = { danger: "bg-danger/10 text-danger border-danger/20", warn: "bg-warning/10 text-warning border-warning/20", flat: "border-border text-muted-foreground" };

export default async function Compliance() {
  /*
    What is actually due, now.

    This page used to be nothing but the two reference tables below — a calendar
    that never mentioned today. "GST & statutory deadline warnings" is a paid
    plan bullet, and a table of dates is not a warning: an owner had to already
    know to look, on the right day, to get anything from it. lib/statutory.ts
    dates them, so the band below says "in 4 days" rather than "the 20th".

    Every line keeps its "if this applies to you" condition. Cortex is not told
    whether a business files monthly or under QRMP, has employees on EPF, or is
    a company with ROC filings — and telling a sole proprietor they must file
    AOC-4 would cost us their trust in every other warning we send.
  */
  const all = upcomingDeadlines(10);
  /*
    NARROWED TO THIS WORKSPACE — and the narrowing is visible.

    The comment above is still true of the RULES: Cortex is not told anything
    about a business it has not been told. What has changed is that it can now
    be told, once, by the owner — and splitByProfile returns both halves so
    this page can show what it hid and why.

    An unanswered profile produces shown === all and hidden === [], so this
    page is byte-identical to its previous behaviour until somebody answers.
    That is the safety property, not a coincidence: see the header of
    lib/statutory-profile.ts.
  */
  const profile = await getStatutoryProfile();
  const { shown: soon, hidden } = splitByProfile(all, profile);
  const answered = profileIsSet(profile);

  return (
    <>
      <Topbar title="Compliance Calendar" subtitle="India statutory due dates — never miss a filing" />
      <PageShell>
        {soon.length > 0 && (
          <Section
            title="Due in the next 10 days"
            desc={answered
              ? "Dated from today, and narrowed to the answers you gave below."
              : "Dated from today. Check which of these apply to you — answer the six questions below and we will narrow it."}
          >
            {/*
              The "today / tomorrow / N days" ternary and the bare `3` were
              inline below, and I then wrote a third copy of both into /gst —
              with different arithmetic, measured from `now` rather than IST
              midnight. Two pages of the same product could print different day
              counts for the same tax date on the same afternoon. Both now read
              whenPhrase() and URGENT_WITHIN_DAYS from lib/statutory.ts, which
              is where the warning engine's own version already lived.
            */}
            <div className="space-y-2">
              {soon.map((d) => (
                <Card key={d.id} className={`p-4 flex items-start gap-3 ${d.severity === "high" && d.daysAway <= URGENT_WITHIN_DAYS ? "border-danger/30 bg-danger/5" : ""}`}>
                  <div className={`h-10 w-16 rounded-lg grid place-items-center text-xs font-bold shrink-0 ${
                    d.daysAway <= 1 ? "bg-danger/10 text-danger" : d.daysAway <= URGENT_WITHIN_DAYS ? "bg-warning/10 text-warning" : "border"
                  }`}>
                    {whenPhrase(d.daysAway)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{d.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {d.what} — <span className="italic">if {d.appliesIf}</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </Section>
        )}

        {/*
          WHAT WE HID, AND WHY — never "this does not apply to you".

          Safety rule 3 in lib/statutory-profile.ts: a filter that silently
          shortens a compliance list is indistinguishable from a bug, or from
          a missed filing. So every excluded deadline stays on this page with
          its date, muted, carrying the owner's own answer as the reason.

          The wording is always attributed: "hidden because you told us …".
          We are in no position to assert anything about somebody's tax
          affairs, and if the answer was wrong the sentence that shows them
          why is also the sentence that tells them what to change.
        */}
        {hidden.length > 0 && (
          <Section
            title={`Hidden by your answers (${hidden.length})`}
            desc="Still dated, still here. If any of these are wrong, change the answer below and it comes back."
          >
            <div className="space-y-2">
              {hidden.map((d) => (
                <Card key={d.id} className="p-4 flex items-start gap-3 opacity-70">
                  <div className="h-10 w-16 rounded-lg grid place-items-center text-xs font-bold shrink-0 border text-muted-foreground">
                    {whenPhrase(d.daysAway)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm line-through decoration-muted-foreground/40">{d.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {d.what} — hidden because <span className="italic">{d.hiddenBecause}</span>.
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </Section>
        )}

        {/*
          THE QUESTIONS THEMSELVES.

          Placed after the dated list rather than before it: an owner arriving
          at this page wants to know what is due, not to fill in a form. The
          form is the thing that makes the list shorter next time.
        */}
        <Section
          title="Which of these are actually yours?"
          desc={answered
            ? "Your answers. Six questions, changeable any time — anything left as “I’m not sure” keeps showing."
            : "Six questions, asked once. Answer them and this page stops showing you other businesses’ deadlines."}
        >
          <StatutoryProfileForm profile={profile} />
        </Section>

        <Section title="Every month" desc="Recurring monthly obligations (dates are typical; verify for your category)">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {monthly.map((d) => (
              <Card key={d.item} className="p-4 flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg brand-gradient grid place-items-center text-white font-bold shrink-0">{d.day}</div>
                <div><div className="flex items-center gap-2"><span className="font-medium text-sm">{d.item}</span><Badge className={tone[d.tone]}>day {d.day}</Badge></div><div className="text-xs text-muted-foreground">{d.note}</div></div>
              </Card>
            ))}
          </div>
        </Section>

        <Section title="Quarterly & annual" desc="The bigger deadlines to plan around">
          <div className="space-y-2">
            {periodic.map((p) => (
              <Card key={p.item} className="p-4 flex items-center gap-3">
                <div className="flex-1"><div className="font-medium text-sm">{p.item}</div><div className="text-xs text-muted-foreground">{p.note}</div></div>
                <Badge className="border-border text-muted-foreground">{p.when}</Badge>
              </Card>
            ))}
          </div>
        </Section>

        <Section title="Ask the compliance assistant" desc="Filings, applicability, penalties, procedure">
          <AIPanel mode="gst" placeholder="e.g. Do I need to file GSTR-9? What's the penalty for late TDS payment?" cta="Ask" multiline saveMode="strategy" />
          <p className="text-xs text-muted-foreground mt-2">General guidance only — confirm specifics with your CA/CS. Dates can shift with government notifications.</p>
        </Section>
      </PageShell>
    </>
  );
}
