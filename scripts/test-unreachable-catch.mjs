/**
 * `catch {}` around a Supabase call is not error handling. It is nothing.
 *
 * ============================================================================
 * THE FACT THIS WHOLE FILE RESTS ON
 * ============================================================================
 *
 * PostgREST — which is what supabase-js speaks — REPORTS failures by returning
 * `{ data: null, error }`. It does not throw. A statement that matches no rows
 * does not even return an error: zero rows is a successful UPDATE.
 *
 * So this, written dozens of times across the repo, handles nothing at all:
 *
 *     try { await svc.from("t").update({...}).eq("id", id); } catch {}
 *
 * The `catch` is unreachable for both ways the write can fail. It reads like a
 * considered decision to tolerate failure — a reviewer skims it and moves on —
 * and it is an empty gesture. That is worse than no try at all, which would at
 * least look unfinished.
 *
 * ============================================================================
 * WHAT IT COST, CONCRETELY
 * ============================================================================
 *
 * Four found in one sweep, all on paths that move money or reach a customer:
 *
 *   subscription_ref        The ONLY write of the column. Fails → the mandate
 *                           exists at Cashfree and nothing in our database
 *                           points at it → every renewal webhook hits
 *                           `if (!org) return` → the customer is charged every
 *                           cycle and granted nothing, forever, silently. The
 *                           comment beside it named the GET reconciler as the
 *                           remedy; that reconciler filters ON subscription_ref,
 *                           so it could not run.
 *
 *   autorenew cancel        Cancelled at Cashfree, not recorded here → the
 *                           billing page keeps promising a renewal date that
 *                           will never arrive, and the workspace lapses on a
 *                           day the customer was told was a charge.
 *
 *   last_sent               The ONLY idempotency guard on scheduled reports,
 *                           and the file said so one line above. Fails → a
 *                           WEEKLY report is due again tomorrow, and every
 *                           morning after: regenerated, recharged to the
 *                           customer's credits, resent.
 *
 *   visibility lead         A prospect's name, email and brand, with the
 *                           operator email also best-effort. Both fail → the
 *                           lead is gone and no trace exists anywhere.
 *
 * ============================================================================
 * WHY THE RULE IS NARROW
 * ============================================================================
 *
 * Most of the ~57 bare catches in this repo are correct: localStorage in a
 * private window, `JSON.parse` of a cookie, `Notification.requestPermission`,
 * a Lenis instance being destroyed on unmount. Those genuinely throw and
 * genuinely have nothing to do about it.
 *
 * So this asserts only where silence changes what the customer is told or
 * charged: a WRITE (insert/update/upsert/delete/rpc) on a money, send, or
 * guard path. Reads are excluded — a failed read degrades a display, and the
 * pages that do it already fall back to a safe default. A checker that flagged
 * all 57 would be turned off within a week, and then it would protect nothing.
 */

import { readFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));

/* Comments are stripped before matching. Six guards in this repo have passed
   on deliberately broken code because the pattern they looked for appeared in
   the explanatory comment beside the fix rather than in the code. */
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ========================================================================= */
/* 1. THE FOUR WRITES, EACH NAMED AND EACH CHECKED FOR ITS OWN GUARANTEE     */
/* ========================================================================= */

/* --- subscription_ref: the whole product's most expensive write ---------- */
{
  const f = "src/app/api/pay/cashfree/subscription/route.ts";
  const s = strip(read(f));

  check(/async function recordRef\(/.test(s),
    "the mandate reference is written through a function that reports failure",
    "it was an inline update inside `catch {}` — the only write of the only " +
    "column the renewal webhook can match on");

  /* A row count, not merely `!error`. Zero rows is the quiet failure: the
     statement succeeded and changed nothing, and reports no error at all. */
  const rr = s.slice(s.indexOf("async function recordRef("));
  check(/\.select\(/.test(rr) && /data\?\.length/.test(rr),
    "recordRef proves a row changed",
    "`!error` alone passes a zero-row update, which is how a write to a " +
    "deleted org row reports success");

  check(/if \(!stored\)/.test(s) && /cancelSubscription\(res\.subscriptionId\)/.test(s),
    "an unrecorded mandate is cancelled rather than handed to the customer",
    "the authLink has not been opened yet, so no money has moved — returning " +
    "it anyway creates an active mandate nobody can attribute or switch off");

  check(/kind: "subscription_ref_unstored"/.test(s),
    "and the operator is told");

  /* The reconciler must be able to recover a ref that was never stored. It
     could not: ownership was proven with `.eq("subscription_ref", ref)`, the
     very column that failed to write. */
  check(/st\.orgId !== orgId/.test(s),
    "the reconciler can identify an unrecorded mandate from Cashfree's own note",
    "otherwise the documented remedy requires the thing it repairs");
  check(/\.is\("subscription_ref", null\)/.test(s),
    "and adopting one cannot overwrite a different live reference",
    "recovery must not be able to cause the orphan it recovers from");
}

/* --- the webhook: a charge that matches no workspace --------------------- */
{
  const s = strip(read("src/app/api/pay/cashfree/webhook/route.ts"));

  check(!/const \{ data: org \}[\s\S]{0,400}?\n  if \(!org\) return;/.test(s),
    "an unmatched subscription charge is no longer a bare return",
    "`if (!org) return` acks the webhook with a 200, so Cashfree never " +
    "retries and the debit is simply lost");

  /* Matched as a bare literal, not as `kind: "..."`. The alert chooses its
     kind with a ternary, so requiring the property-assignment form failed on
     correct code — the kind of false alarm that gets a checker deleted. */
  check(/"subscription_charge_unattributable"/.test(s),
    "an unattributable charge alerts the operator");

  check(/unattributable subscription charge for/.test(s),
    "and a real payment we cannot attribute throws rather than acking",
    "a 500 makes Cashfree redeliver, which is the right outcome for a cycle " +
    "the customer paid for and did not receive");

  /* The recovery path reaches the grant with `org === null`, so the two places
     that read `org.subscription_ends_at` had to stop doing that or the fix
     would crash the case it exists for. */
  check(!/\(org as any\)\.subscription_ends_at/.test(s),
    "the grant reads the paid-until date from a variable, not from `org`",
    "on the recovery path `org` is null — dereferencing it would turn a " +
    "repaired charge into a TypeError");
}

/* --- last_sent: the only thing standing between weekly and daily --------- */
{
  const s = strip(read("src/lib/scheduled-reports.ts"));
  const guard = s.slice(s.indexOf("if (res.sent)"));

  check(/data: marked, error/.test(guard) && /marked\?\.length/.test(guard),
    "advancing the report idempotency guard is checked, rows and all",
    "isDue() treats a stale or null last_sent as due, and the cron runs " +
    "daily — so a weekly report resends and recharges every morning");

  check(/kind: "report_guard_unwritten"/.test(guard),
    "and an unwritten guard alerts the operator",
    "nothing in the process can stop the loop; only a person can");

  check(/out\.errors\+\+/.test(guard),
    "a send we cannot remember making is counted as an error, not a success");

  /* The fetch, too: `catch { return out; }` made a rejected query look exactly
     like "no workspace has a report configured". */
  const fetchBlock = s.slice(s.indexOf("let rows"), s.indexOf("for (const r of rows)"));
  check(/if \(error\)/.test(fetchBlock) && /out\.errors\+\+/.test(fetchBlock),
    "a schedule that cannot be read is an error, not an empty schedule",
    "every subscriber silently stops receiving reports while the run " +
    "records { checked: 0, errors: 0 }");
}

/* --- the third lead path ------------------------------------------------- */
{
  const s = strip(read("src/app/api/visibility/public/route.ts"));

  check(/leadStored = !error/.test(s),
    "the visibility lead insert reads its error",
    "the two sibling lead endpoints already did; this one was written the " +
    "same day and left bare");
  check(/let notified = false/.test(s) && /notified = true/.test(s),
    "and the operator notification reports whether it sent");
  check(/if \(!leadStored && !notified\)/.test(s) && /kind: "lead_lost"/.test(s),
    "losing both records escalates instead of vanishing",
    "a prospect typed their name, email and brand — there is no second chance " +
    "at that");
}

/* ========================================================================= */
/* 2. THE FAMILY RULE: no new unreachable catch on a write path              */
/* ========================================================================= */

/*
  Scoped to the files where silence is expensive, not the whole tree. Adding a
  file here is how the rule grows; the point is that these specific paths can
  never regress to a bare catch, not that every catch in the repo is wrong.
*/
const MONEY_AND_SEND = [
  "src/app/api/pay/cashfree/subscription/route.ts",
  "src/app/api/pay/cashfree/webhook/route.ts",
  "src/app/api/pay/cashfree/verify/route.ts",
  "src/lib/scheduled-reports.ts",
  "src/lib/renewal-email.ts",
  "src/lib/credits.ts",
  "src/app/api/visibility/public/route.ts",
  "src/app/api/inquiry/route.ts",
  "src/app/api/access-request/route.ts",
];

const WRITE = /\.(insert|update|upsert|delete)\(|\.rpc\(/;

for (const f of MONEY_AND_SEND) {
  let raw, s;
  try { raw = read(f); s = strip(raw); } catch { continue; }   // file may not exist yet

  /*
    Line numbers must come from the ORIGINAL file, not the stripped copy.
    Stripping comments deletes lines, so counting newlines in `s` reported
    offences dozens of lines off — and a checker that points at the wrong line
    gets argued with rather than acted on. Matching the offending snippet back
    into `raw` is what makes the number real.
  */
  /*
    Anchored on the WRITE CALL, not on the first line of the try block. My
    first version used `body.split("\n")[0]`, which for most offenders is the
    five characters `try {` — and `raw.indexOf("try {")` found the first `try`
    anywhere in the file, including inside this test's own explanatory prose
    quoted in a doc comment. It reported "line 12" for a defect on line 166.
  */
  const lineOf = (body) => {
    const call = body.match(/\.(insert|update|upsert|delete|rpc)\([^\n]{0,80}/);
    const needle = call ? call[0] : body.replace(/\s+/g, " ").trim().slice(0, 60);
    const at = raw.indexOf(needle);
    return at === -1 ? "?" : raw.slice(0, at).split("\n").length;
  };

  /*
    Find each bare `catch {}` and look at the try block it closes. Matching
    backwards from the catch is what connects a handler to the statement it
    was written for — a file-wide "does a write appear anywhere" test would
    flag a legitimate catch around a read in a file that also writes.
  */
  const offenders = [];
  for (const m of s.matchAll(/catch\s*(\([^)]*\))?\s*\{\s*\}/g)) {
    const before = s.slice(Math.max(0, m.index - 600), m.index);
    const tryAt = before.lastIndexOf("try");
    if (tryAt === -1) continue;
    const body = before.slice(tryAt);
    if (WRITE.test(body)) {
      offenders.push(`line ${lineOf(body)}: ${body.replace(/\s+/g, " ").trim().slice(0, 110)}`);
    }
  }

  check(offenders.length === 0,
    `${f.replace("src/", "")} has no unreachable catch around a write`,
    offenders.length
      ? offenders.join("\n      ") +
        "\n      PostgREST returns { error }; it does not throw. Read the error " +
        "and the row count instead."
      : "");
}

/* ========================================================================= */
/* 3. THE ONE THAT IS CORRECT, ASSERTED SO IT IS NOT "FIXED" BY MISTAKE      */
/* ========================================================================= */

/*
  renewal-email.ts writes `sent_to` after a successful send, and a failure
  there is genuinely harmless — unlike the four above. Its idempotency guard is
  an INSERT taken BEFORE the send (claim, then send, then release the claim if
  the send failed), so `sent_to` only records which address was used and
  cannot cause a duplicate notice. It is logged rather than alerted.

  What actually protects that is the ORDERING, so the ordering is what gets
  asserted. If someone ever moves the claim insert after the send to "simplify"
  it, the harmless line becomes the guard and every one of this file's other
  lessons applies to it.

  The release, by contrast, is not harmless and is checked for an alert: the
  claim is uniquely indexed on (org_id, kind, period_end), so a release that
  fails means the customer never gets that renewal warning at all.
*/
{
  const s = strip(read("src/lib/renewal-email.ts"));
  const insertAt = s.indexOf('.insert({ org_id: o.id, kind, period_end');
  const sendAt = s.indexOf("await sendEmail(contact.email");
  check(insertAt !== -1 && sendAt !== -1 && insertAt < sendAt,
    "renewal notices claim the period BEFORE sending",
    "the claim row is the idempotency guard, which is why `sent_to` failing " +
    "afterwards is harmless — do not reorder these");
  check(/releaseClaim/.test(s),
    "and release the claim when the send fails, so tomorrow retries");
  check(/kind: "renewal_claim_stuck"/.test(s),
    "a claim that cannot be released alerts the operator",
    "the unique index means that workspace gets NO warning before it lapses — " +
    "they find out by being locked out");
}

console.log(`\nunreachable catch: ${pass} passed, ${failures.length} failed`);
if (!failures.length) {
  console.log(`  4 silent write failures closed; ${MONEY_AND_SEND.length} money/send files carry no unreachable catch around a write.`);
}
if (failures.length) {
  console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
