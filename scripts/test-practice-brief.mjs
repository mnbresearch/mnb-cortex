/*
  The client brief — a document that goes out over a chartered accountant's name.

  WHY THIS IS TESTED AT ALL, GIVEN IT IS "JUST COPY"

  Because it is not just copy. Every sentence carries a figure about someone's
  business, and the reader is a CA's client. Three specific ways it could
  embarrass the firm sending it:

  1. SAYING SOMETHING WHEN THERE IS NOTHING TO SAY. The temptation in a weekly
     report is to manufacture concern so it looks substantial. A firm that sends
     twenty-five worried letters a month teaches its clients not to open them,
     and the one week something IS wrong, nobody reads it. A quiet client must
     produce a quiet brief.

  2. OUR NAME ON THEIR ADVICE. The entire commercial argument for Practice is
     that the firm's client sees the FIRM's work. A "powered by" line, a footer,
     or a fallback that puts "MNB Cortex" where the signature goes turns the
     partner into a reseller — and they will notice once and never send it
     again.

  3. STATING 43B(h) AS A CERTAINTY. Section 43B(h) disallows a deduction for
     amounts unpaid past 45 days to registered micro and small suppliers. We
     compute exposure from the ledger; whether a given supplier is registered is
     something only the client knows. A brief that asserts the disallowance as
     settled fact is wrong tax advice with an accountant's name on it.

  Every case below is one of those, plus the arithmetic that decides what gets
  said at all. `now` is injected so nothing is time-dependent.
*/
import { composeBrief } from "../src/lib/practice-brief.ts";

let pass = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) pass++;
  else failures.push(`${name}${detail ? " — " + detail : ""}`);
}

const NOW = new Date(Date.UTC(2026, 5, 1));
const FIRM = "Agarwal & Associates";

const base = {
  orgId: "org-1",
  clientName: "Sharma Steel (India) Pvt Ltd",
  receivablesOverdue: 0,
  msmeAtRisk: 0,
  openAlerts: 0,
  recovered: 0,
  movedPct: null,
  topDebtors: [],
  oldestDays: 0,
};

/* ============================================ the quiet case ============= */

const quiet = composeBrief(base, FIRM, NOW);
check("a client with nothing wrong produces a quiet brief", quiet.quiet === true);
check("...and says so plainly",
  /Nothing needs your attention this week/i.test(quiet.text),
  quiet.text.slice(0, 160));
check("...with no invented findings",
  !/WHAT WE FOUND/.test(quiet.text),
  "manufacturing concern is how a weekly report becomes unread");
check("...and no invented actions",
  !/WHAT WE SUGGEST/.test(quiet.text));

/* ============================================ the firm's name =========== */

for (const b of [quiet, composeBrief({ ...base, receivablesOverdue: 500000 }, FIRM, NOW)]) {
  check("the firm signs it", b.text.trim().endsWith(FIRM), b.text.slice(-80));
  check("Cortex is named nowhere in the text", !/cortex/i.test(b.text),
    "a CA forwarding a vendor's branding to their client looks like a reseller");
  check("Cortex is named nowhere in the html", !/cortex/i.test(b.html));
  check("no 'powered by'", !/powered by/i.test(b.text + b.html));
}

/* ============================================ receivables =============== */

const od = composeBrief({
  ...base,
  receivablesOverdue: 840000,
  oldestDays: 94,
  topDebtors: [
    { party: "Verma Traders", amount: 310000, days: 94 },
    { party: "Gupta & Co", amount: 120000, days: 41 },
  ],
}, FIRM, NOW);

check("the overdue total appears, in Indian grouping",
  /₹8,40,000/.test(od.text), od.text);
check("the oldest is named in days", /94 days/.test(od.text), od.text);
check("past 90 days gets the recovery warning",
  /Recovery rates fall sharply past ninety/i.test(od.text), od.text);
check("concentration is called out when one party dominates",
  /37% of it sits with one party/.test(od.text) || /concentration/i.test(od.text),
  od.text);
check("the suggestion names who to chase, with amounts",
  /Chase these first: Verma Traders \(₹3,10,000, 94 days\)/.test(od.text), od.text);

/* Under the concentration threshold, no concentration claim. */
const spread = composeBrief({
  ...base,
  receivablesOverdue: 1000000,
  oldestDays: 20,
  topDebtors: [
    { party: "A", amount: 200000, days: 20 },
    { party: "B", amount: 190000, days: 15 },
  ],
}, FIRM, NOW);
check("a spread book is NOT called a concentration risk",
  !/concentration/i.test(spread.text),
  "20% is ordinary; calling it a risk is the kind of overstatement that loses a reader");
check("under 90 days, no recovery-rate warning",
  !/fall sharply/i.test(spread.text));

/* ============================================ 43B(h) ==================== */

const msme = composeBrief({ ...base, msmeAtRisk: 260000 }, FIRM, NOW);
check("the 43B(h) figure appears", /₹2,60,000/.test(msme.text), msme.text);
check("43B(h) is framed as a deadline, not a threat",
  /disallowed as a deduction in the year they were incurred and only allowed when actually paid/i.test(msme.text),
  msme.text);
check("...and it does not claim the suppliers ARE registered",
  !/your suppliers are registered|are MSME-registered suppliers/i.test(msme.text),
  "registration status is something only the client knows; asserting it is wrong tax advice with a CA's name on it");

/* ============================================ movement ================== */

const moved = composeBrief({ ...base, receivablesOverdue: 100000, movedPct: 18 }, FIRM, NOW);
check("a material rise is reported", /risen 18%/.test(moved.text), moved.text);

const noise = composeBrief({ ...base, receivablesOverdue: 100000, movedPct: 2 }, FIRM, NOW);
check("a 2% wobble is NOT reported as movement",
  !/risen|fallen/.test(noise.text),
  "week-to-week noise dressed as a finding is how a report loses credibility");

const unknown = composeBrief({ ...base, receivablesOverdue: 100000, movedPct: null }, FIRM, NOW);
check("no history means no movement claim at all",
  !/risen|fallen|unchanged/i.test(unknown.text),
  "'nothing moved' and 'we cannot see yet' must never read the same");

/* ============================================ recovered ================= */

const rec = composeBrief({ ...base, recovered: 1150000 }, FIRM, NOW);
check("what was collected is stated when there is some",
  /₹11,50,000 of previously overdue invoices has been collected/.test(rec.text), rec.text);
check("...and omitted entirely when there is none",
  !/has been collected/.test(quiet.text));

/* ============================================ escaping ================== */

const nasty = composeBrief({
  ...base,
  clientName: 'Sharma <script>alert(1)</script> & Co',
  receivablesOverdue: 5000,
  topDebtors: [{ party: "<img src=x onerror=alert(1)>", amount: 5000, days: 3 }],
}, FIRM, NOW);
check("client names are escaped in the html",
  !/<script>/.test(nasty.html) && /&lt;script&gt;/.test(nasty.html),
  "this html is pasted into an email client and printed; a party name comes from an imported CSV");
check("debtor names are escaped too",
  !/<img src=x/.test(nasty.html), nasty.html.slice(0, 200));
check("the ampersand is escaped, not doubled",
  /Sharma &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; Co/.test(nasty.html), nasty.html.slice(0, 300));

/* ============================================ shape ===================== */

const full = composeBrief({
  ...base, receivablesOverdue: 500000, msmeAtRisk: 100000, openAlerts: 3, recovered: 200000, movedPct: 12,
  oldestDays: 60, topDebtors: [{ party: "X", amount: 400000, days: 60 }],
}, FIRM, NOW);
check("a busy client gets both sections", /WHAT WE FOUND/.test(full.text) && /WHAT WE SUGGEST/.test(full.text));
check("the date is on it", /1 June 2026/.test(full.text), full.periodLabel);
check("the client's name heads it", full.text.startsWith(base.clientName), full.text.slice(0, 60));
check("it is short enough to read", full.text.split("\n").length <= 30, `${full.text.split("\n").length} lines`);

/* ------------------------------------------------------------------ report */
console.log(`\npractice client brief: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\n" + failures.map((f) => "  ✗ " + f).join("\n"));
  process.exit(1);
}
console.log("  Quiet clients get quiet briefs; the firm signs it; 43B(h) stays exposure, not assertion.");
