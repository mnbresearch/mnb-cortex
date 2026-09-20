# MNB Cortex — strategic positioning

*Working document. Written to be argued with, not admired. Every product claim
in here is checkable against the repository; every number that is not yet true
is marked as a target rather than a fact.*

---

## 1. The one-sentence position

**Cortex is the execution layer between an Indian SME's books and its business:
it reads the company's own numbers every day, tells the owner the specific
thing that is about to cost them money, and does something about it.**

The three clauses are the whole argument, and they are in priority order:

- **reads their own numbers** — not a chatbot with general knowledge. Tool calls
  over the workspace's own rows.
- **the specific thing** — a named customer, an amount, a date. Not a score, not
  a dashboard, not "revenue is down 4%".
- **does something about it** — drafts the reminder, waits for approval, sends
  it, and records what came back. Advice that nobody executes is a PDF.

### What we are not saying any more, and why

| Retired | Why |
|---|---|
| "AI COO" | Unfalsifiable, and every AI product claims to be a person. A buyer cannot tell two AI COOs apart. |
| "128 modules, 438 agents" as the lead | Breadth reads as a free-tools site. It answers "how much is there?" when the buyer is asking "what will you do for me on Tuesday?" |
| "For CA firms" as the frame | True of one channel, not of the product. It made a cross-industry system look like accounting software. |

Breadth is a **second-order** proof point. It answers "will this still be useful
in a year?", which is the second question, never the first.

---

## 2. The wedge

**Money that is already at risk, and the statutory clock attached to it.**

Not "run your business better". Three specific bleeds, in the order an Indian
SME feels them:

1. **Receivables.** The money is earned, invoiced and not collected. The owner
   finds out when they need the cash.
2. **Section 43B(h).** Since FY 2024-25, a payment to an MSME-registered
   supplier that goes past the statutory window is disallowed as a deduction
   until it is actually paid. Slow payables stopped being a cash-flow
   preference and became a tax event.
3. **Statutory dates.** GST, TDS, advance tax, ROC, the audit report. Each one
   is a penalty with a date on it, and the calendar is not the same for every
   registration.

Why this is the right wedge, and not one of the other 125 things the product
does:

- **It is quantified in rupees without us having to estimate anything.** The
  exposure is arithmetic over the customer's own rows.
- **It has a deadline.** Urgency we did not manufacture.
- **It is checkable on day one.** Import the file, see the number, verify it
  against your own ledger. Trust is established before we ask for money.
- **It is not a taste question.** Nobody argues about whether they want to lose
  a deduction.

The free 60-second Business Health Check is the top of this funnel and should
be understood as the product's actual first chapter, not as a lead magnet.

---

## 3. Why now

Four forcing functions, none of which is "AI is exciting". The first two are
the ones that make this a 2026 company rather than a 2019 one.

**a. A statutory clock that did not exist two years ago.** 43B(h) turned
supplier-payment hygiene into a tax exposure with a hard date. That is a new,
recurring, government-created reason to look at your payables — and an
inherently *computational* problem: which of these bills, aged from when,
against which supplier's MSME status.

**b. SME data became machine-readable.** GST e-invoicing has walked down the
turnover thresholds year by year. A meaningful share of Indian SMEs now
generate structured transaction data as a by-product of compliance. Before
that, "read their numbers" meant OCR on a photo of a ledger.

**c. Inference cost collapsed.** Running a daily analysis per workspace, plus
drafting, plus a weekly plan, has to cost single-digit rupees for a ₹799/month
plan to work. Two years ago the unit economics of this product were negative by
construction.

**d. Discovery is moving to assistants.** SMEs are starting to be found — or
not found — through AI answers rather than ten blue links. That is the AI
Visibility surface, and it is a real second wedge for D2C and services, where
the owner can see the problem in one screen.

---

## 4. Moat

Ranked by how hard each is to copy, not by how good it sounds.

**1. Statutory logic as tested code, not prompts.** `lib/statutory.ts`,
`lib/msme.ts` and their suites encode the 45-day window, per-deadline notice
periods, IST date handling, and a statutory profile so the product never
asserts that a rule does not apply to a business it does not understand. A
competitor who asks a model for a tax date will be wrong occasionally, and one
wrong date destroys the trust the whole product runs on. This is unglamorous
and genuinely hard to shortcut.

**2. The ingestion layer.** Tally, Vyapar and Busy exports, plus arbitrary CSV
with fuzzy header matching, normalised into one schema with customer identity
resolution across spellings. This is the part nobody wants to build and
everybody needs. It is also where a new entrant loses three months.

**3. Closing the loop, with evidence.** Collections drafts in the customer's
own name, sends from their address, stops the instant the invoice is marked
paid, and keeps a recovery ledger of what came back. The kill switch, the
circuit breaker, the do-not-contact list and the per-event refund accounting
all exist because the loop is real. Anyone can generate a reminder; running
outbound messaging to somebody else's customers safely is an operational moat.

**4. Compounding per-workspace memory.** Metric history, decisions, memory
entities. A rival starts from zero for every customer they win; a Cortex
workspace is worth more in month twelve than in month one. This is the slowest
moat to build and the most durable once built.

**5. The CA firm as a distribution channel.** One firm brings dozens of SMEs
who already trust them, and the Practice console with credit pooling makes the
firm the account. B2B2B beats paid acquisition in a market where trust is
local. **This is a channel, not the product** — which is exactly the distinction
the previous positioning got wrong.

### The honest counter-argument

A large incumbent — Zoho, Tally, a bank — could bolt a warning layer onto data
they already hold, and they have the distribution. The defence is not that they
cannot; it is that the loop (warn → draft → send → prove) is a different
product discipline from record-keeping, and record-keeping companies are
structurally bad at outbound execution on a customer's behalf. That is a real
risk and should be stated in the room rather than hidden.

---

## 5. Competitive frame

| | What it does | What it does not |
|---|---|---|
| **Tally / Zoho Books / Vyapar** | Record what happened, correctly | Tell you what is about to happen, or act |
| **A BI dashboard** | Show you a chart when you open it | Notice anything while you are not looking |
| **ChatGPT / a generic assistant** | Answer questions well, about text | Know your rows, your dates, or your customers |
| **A consultant or a CA** | Judgement, once a month or once a year | Watch daily, at ₹799 |
| **Cortex** | Watches the rows daily, names the specific risk, drafts and sends the action, proves the recovery | Replace the accounting system. Deliberately. |

The last line matters commercially: **keep your Tally** is a sales asset, not a
limitation. Rip-and-replace is how SME software deals die.

---

## 6. Product, in the shape a buyer understands

Playbooks (`lib/playbooks.ts`), each resolving to a module that exists:

Nobody has paid you · The 45-day MSME clock · The date you were going to miss ·
When the cash runs out · Chasing, without you doing it · About to run out of
stock · A customer going quiet · The Monday plan · The price you are leaving on
the table · Who is actually worth keeping

Three different mechanisms, and being precise about which is which is part of
the positioning:

- **Rules decide** — statutory windows, ageing, reorder points. Tested
  arithmetic over real rows, because a model that computes a tax date will
  eventually be wrong.
- **The model reads and writes** — reads the workspace's own rows through tool
  calls, explains in the owner's language, drafts the message.
- **The product acts** — draft, approve, send, record.

"AI-native" means the loop is impossible without a model and unsafe without the
rules. It does not mean there is a chat box.

---

## 7. Business model

- **Credits.** Usage-priced, from a ₹149 pack with no subscription. Aligns cost
  with the AI spend and lets a sceptic start for less than lunch.
- **Plans.** ₹799 to ₹39,999 a month, each with a monthly credit allowance.
- **Practice pooling.** A CA firm buys credits once and spends them across
  client workspaces — the pricing shape that makes the channel work.
- **Free health check.** No card. The wedge, not a teaser.

Margin discipline is enforced in code (`scripts/test-margins.mjs`): the cost of
each AI mode is modelled per credit so a plan cannot be priced below what it
costs to serve. Video generation was found to be loss-making at ₹270 a clip
through exactly this check.

---

## 8. Expansion path

1. **Warn** — the free check and the first import. Trust, in one screen.
2. **Act** — collections, the weekly plan, the compliance calendar. The moment
   the product stops being a report.
3. **Become the record of decisions** — memory, the action board, the recovery
   ledger. Switching cost.
4. **Underwrite** *(ambition, not product)* — a business whose receivables,
   payables and statutory position we verify daily is a business a lender can
   price. Verified operating data is the asset; working-capital origination is
   the way it gets monetised at a size that matters.

Step 4 is where this becomes venture-scale rather than a good SaaS business,
and it should be pitched as a thesis with a prerequisite — thousands of
workspaces with continuous, verified data — not as a roadmap item with a date.

---

## 9. What has to become true

The product is real and deep; the company is early. A partner will ask for
these, and the honest answer today is that most are not yet measured. That is
the work, and pretending otherwise is the fastest way to lose the room.

| Metric | Why this one | Status |
|---|---|---|
| Paying workspaces, and month-on-month growth | The only proof the wedge converts | To be filled from `cortex_payments` |
| Activation: import → first genuine warning | The product's core promise, timed | Instrumented (`funnel_events`) |
| Week-4 retention of the weekly plan | Whether the loop becomes a habit | Instrumented (`weekly_plan_sends`) |
| Rupees of exposure surfaced per workspace | Value delivered, in the customer's units | Computable today, not yet aggregated |
| Recovered-after-reminder, as a share | The claim the collections module exists to make | `recovery ledger` exists; needs volume |
| Gross margin after AI cost | Whether the pricing survives scale | Modelled per mode; needs real usage |
| CA firms live, and SMEs per firm | Whether the channel compounds | Console shipped; channel unproven |

**Do not put a number in a deck that the product cannot reproduce on demand.**
This repository has a test suite whose entire job is stopping published claims
from drifting from the code (`scripts/test-claims.mjs`, 136 assertions). The
same standard should apply to the fundraise, for the same reason: the first
investor who checks and finds a gap is the last conversation.

---

## 10. The pitch, in five lines

> India has 60 million-plus small businesses. They run on Tally, WhatsApp and
> memory, and they find out about a cash crunch, a missed statutory date or a
> customer who has stopped paying only once it has cost them.
>
> Cortex reads their own numbers every day and tells them the specific thing
> that is about to cost them money — the customer, the amount, the date — and
> then does something about it: drafts the reminder, sends it on approval,
> stops when the invoice is paid.
>
> It works because the statutory logic is tested code rather than a prompt,
> because we read the file formats Indian SMEs actually export, and because
> every workspace gets more valuable to its owner the longer it runs.
>
> They keep their accounting software. We are the part it was never built to
> do.
>
> We reach them through the accountants who already have their trust.
