import { SmoothScroll, Cursor, Kinetic, SectionLabel } from "@/components/loco";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { HealthCheckClient } from "@/components/health-check-client";
import { LedgerCheck } from "@/components/ledger-check";

/*
  The description now names what makes this different from the fifty other
  "business health quizzes" a search returns: you can put your own receivables
  in and get real numbers, with no account. That is the searchable, honest
  claim — and it is the half that was missing.
*/
/*
  "NOTHING IS STORED" WAS TRUE OF ONE HALF OF THIS PAGE AND FALSE OF THE OTHER.

  The ledger analyser genuinely stores nothing: /api/free-check parses the
  upload in the request and writes no row. That is the claim this sentence was
  written for, and it is worth making.

  The quiz half is a different thing. Its form POSTs name, email, phone,
  business name and the score to /api/inquiry, which does
  `.from("leads").insert(row)` and emails the operator. So the page told a
  visitor "we keep nothing" on the same screen where it asked for their phone
  number and then kept it.

  Under the DPDP Act that is a notice failure, not a wording preference: the
  visitor has to be told what is collected and why, before they hand it over.
  /pricing already does this properly with a consent checkbox and a link to
  the policy; this page had neither, and the claim above made it worse by
  actively telling them the opposite.

  Both halves are now stated separately, and the form carries the same
  consent control /pricing uses.
*/
export const metadata = {
  title: "Free Business Health Check + Overdue Receivables Analyser — MNB Cortex",
  description:
    "Free, no signup: score how your business runs, then upload your Tally, Busy, Vyapar or Excel receivables and see your real overdue total, your oldest unpaid invoice, and your MSME 45-day (43B(h)) exposure. Your file is read in the request and never stored.",
};

export default function HealthCheck() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <SmoothScroll />
      <Cursor />
      <PublicHeader />

      <section className="px-5 lg:px-10 pt-32 lg:pt-40 pb-8">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="00">Free tool</SectionLabel>
          <Kinetic as="h1" text={"Business Health Check."} className="font-display display-1 tracking-tightest mt-6" />
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
            Six quick questions for a score, then put your actual receivables in and see the real numbers —
            what is overdue, by how many days, and who is holding it. About two minutes. No signup and no card.
            Your receivables file is read in the request and never written down; if you ask us to email the
            report, we keep the contact details you give us for that.
          </p>
        </div>
      </section>

      <section className="px-5 lg:px-10 pb-10">
        <div className="max-w-7xl mx-auto"><HealthCheckClient /></div>
      </section>

      {/*
        The ledger check is NOT gated behind the quiz or behind the email form.
        Someone who arrives from a search for "overdue receivables calculator"
        should be able to scroll past six questions about themselves and get
        straight to the thing that reads their file. Gating the useful half is
        how a free tool turns into a lead form nobody recommends.
      */}
      <section className="px-5 lg:px-10 pb-28">
        <div className="max-w-7xl mx-auto"><LedgerCheck /></div>
      </section>

      <PublicFooter />
    </main>
  );
}
