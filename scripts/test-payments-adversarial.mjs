#!/usr/bin/env node
/**
 * Payments, adversarially.  Run: npm run test:payments-adversarial
 *
 * The webhook HMAC is already covered by test-cashfree-webhook.mjs and is
 * genuinely solid — raw body, timing-safe, fails closed, replay window. This
 * suite covers what happens AFTER a signature verifies, which is where the
 * money was actually going missing:
 *
 *   a refund event routed into the grant path, because REFUND_SUCCESS matches
 *   /SUCCESS/i;
 *
 *   a failed grant acked to Cashfree with a 200, so the customer paid and got
 *   nothing and no retry was ever attempted;
 *
 *   no refund or chargeback handling at all, so buy -> spend -> chargeback kept
 *   the credits and the plan permanently;
 *
 *   a ₹1 underpayment tolerance;
 *
 *   billing routes with no role check, where a viewer could create or cancel a
 *   mandate and orphan a live one.
 *
 * Most of these are properties of source that talks to Cashfree and Supabase,
 * so the checks are a mix of executed logic (event routing, amount tolerance,
 * reversal arithmetic) and source assertions where the alternative would be
 * mocking two external services and testing the mock.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const src = (p) => strip(readFileSync(join(ROOT, p), "utf8"));

let pass = 0, fail = 0;
const check = (label, cond) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
};

/* ========================================================================= */
console.log("\nEVENT ROUTING — a refund must never reach the grant path");
/* ========================================================================= */
{
  /* The exact predicates from the route, executed against the event names
     Cashfree actually sends. */
  const isRefund = (t) => /REFUND|DISPUTE|CHARGEBACK/i.test(t);
  const isOrderPaid = (t) => !isRefund(t) && /PAYMENT_SUCCESS/i.test(t);

  const OLD = (t) => /PAYMENT_SUCCESS|SUCCESS/i.test(t);

  check("the OLD predicate routed REFUND_SUCCESS into settleOrder (the bug)",
        OLD("REFUND_SUCCESS") === true);

  for (const t of ["REFUND_SUCCESS", "REFUND_FAILED", "DISPUTE_CREATED", "CHARGEBACK_RAISED"]) {
    check(`${t} does NOT settle`, isOrderPaid(t) === false);
    check(`${t} IS treated as a refund`, isRefund(t) === true);
  }
  for (const t of ["PAYMENT_SUCCESS_WEBHOOK", "PAYMENT_SUCCESS"]) {
    check(`${t} settles`, isOrderPaid(t) === true);
  }
  for (const t of ["PAYMENT_FAILED_WEBHOOK", "PAYMENT_USER_DROPPED_WEBHOOK"]) {
    check(`${t} does not settle`, isOrderPaid(t) === false);
  }

  const route = src("src/app/api/pay/cashfree/webhook/route.ts");
  check("the route no longer matches a bare /SUCCESS/", !/PAYMENT_SUCCESS\|SUCCESS/.test(route));
  check("the route excludes refunds from the paid branch", /!isRefund/.test(route));
}

/* ========================================================================= */
console.log("\nRETRY — a failed grant must not be acked as handled");
/* ========================================================================= */
{
  const route = src("src/app/api/pay/cashfree/webhook/route.ts");
  check("the order branch no longer swallows into an empty catch",
        !/try \{ await settleOrder\(orderId\); \} catch \{/.test(route));
  check("a thrown settle asks Cashfree to retry (500)",
        /settleOrder\(orderId\)[\s\S]{0,400}?status: 500/.test(route));
  check("a retryable failure asks for a retry", /res\.retryable[\s\S]{0,200}?status: 500/.test(route));

  const settle = src("src/lib/pay/settle.ts");
  check("settleOrder distinguishes retryable failures", /retryable\?: boolean|retryable: true/.test(settle));
  check("...on the plan grant failure", (settle.match(/retryable: true/g) || []).length >= 3);

  /* The distinction has to be real: a permanent refusal must NOT be retryable,
     or Cashfree retries an unknown plan forever and the real signal is buried. */
  check("an unknown plan is NOT retryable",
        /Unknown plan\."/.test(settle) && !/retryable: true[^\n]*Unknown plan/.test(settle));
  check("an amount mismatch is NOT retryable",
        !/retryable: true[^\n]*did not match/.test(settle));

  /*
    A DATABASE ERROR ON THE CLAIM IS RETRYABLE.

    The ₹1 live test failed here: payments.owner_id NOT NULL, added by the other
    product sharing this table, rejected every Cortex insert. Money gone, claim
    unwritten, nothing granted. Unmarked, the webhook acks and Cashfree never
    retries — a permanent loss from a one-line migration's absence.
  */
  check("a claim (insert) failure asks for a retry",
        /if \(claimErr\) return \{ orgId, ok: false, retryable: true/.test(settle));
}

/* ========================================================================= */
console.log("\nAMOUNT — the ₹1 discount is gone");
/* ========================================================================= */
{
  const settle = src("src/lib/pay/settle.ts");
  check("the tolerance is no longer a whole rupee", !/order\.amount \+ 1 < expected/.test(settle));
  check("...it is one paisa", /order\.amount \+ 0\.01 < expected/.test(settle));

  /* Executed, on the real plan prices. */
  const under = (paid, expected) => expected > 0 && paid + 0.01 < expected;
  check("paying ₹6,998 for a ₹6,999 plan is refused", under(6998, 6999) === true);
  check("paying ₹6,998.50 is refused", under(6998.50, 6999) === true);
  check("paying two paisa short is refused", under(6998.98, 6999) === true);
  check("paying the exact price is accepted", under(6999, 6999) === false);
  check("a float representation of the exact price is accepted", under(6998.999999, 6999) === false);
  check("overpaying is accepted", under(7000, 6999) === false);

  /*
    THE BOUNDARY, stated rather than assumed.

    One paisa short is ACCEPTED — that is what a one-paisa tolerance means, and
    my first draft of this test asserted the opposite. Worth pinning explicitly
    so the trade-off is visible: we give away at most ₹0.01 per transaction to
    avoid refusing a payment over IEEE-754 representation of a price we set
    ourselves. The old ₹1 tolerance was a hundred times that and served no
    purpose, since no float error reaches a whole rupee.
  */
  check("exactly one paisa short is accepted (the tolerance, by design)",
        under(6998.99, 6999) === false);
}

/* ========================================================================= */
console.log("\nREFUNDS — reversal arithmetic");
/* ========================================================================= */
{
  /* The clamp from lib/pay/refund.ts, executed. The property that matters is
     that a balance can never go negative — a negative balance would block a
     legitimate future top-up and turn a billing dispute into a broken account. */
  const reclaim = (granted, balance) => Math.min(granted, Math.max(balance, 0));

  check("unspent credits are fully reclaimed", reclaim(10000, 10000) === 10000);
  check("partly spent reclaims only what is left", reclaim(10000, 3000) === 3000);
  check("fully spent reclaims nothing, never negative", reclaim(10000, 0) === 0);
  check("a negative starting balance cannot deepen", reclaim(10000, -50) === 0);
  check("never takes more than was granted", reclaim(500, 10000) === 500);

  /* Plan period: subtract the days bought, clamp at now. */
  const DAY = 86_400_000;
  const shorten = (endsAt, days, now) => Math.max(endsAt - days * DAY, now);
  const now = 1_800_000_000_000;
  check("a refunded month is removed from the end date",
        shorten(now + 30 * DAY, 30, now) === now);
  check("a stacked period keeps what remains",
        shorten(now + 60 * DAY, 30, now) === now + 30 * DAY);
  check("the end date is never pushed into the past",
        shorten(now + 5 * DAY, 30, now) === now);

  const refund = src("src/lib/pay/refund.ts");
  check("reversal is idempotent on the payment status", /startsWith\("refunded"\)/.test(refund));
  check("grant_credits is called with all five arguments (p_user included)",
        /p_org[\s\S]{0,120}p_user[\s\S]{0,120}p_reason/.test(refund));
  check("an alert is raised even when nothing could be reversed",
        /recorded_only/.test(refund) && /alerts"\)\.insert/.test(refund));
  check("a payment.refunded webhook is emitted", /payment\.refunded/.test(refund));

  const events = src("src/lib/webhooks.ts");
  check("payment.refunded is a registered webhook event", /"payment\.refunded"/.test(events));
}

/* ========================================================================= */
console.log("\nAUTHORISATION — billing is an admin action");
/* ========================================================================= */
{
  const sub = src("src/app/api/pay/cashfree/subscription/route.ts");
  check("creating a mandate requires admin", /hasRole\("admin"\)/.test(sub));
  check("cancelling auto-renew requires admin too",
        (sub.match(/hasRole\("admin"\)/g) || []).length >= 2);
  check("an existing live mandate cannot be clobbered",
        /subscription_ref/.test(sub) && /409/.test(sub));
  check("...and cancelled/expired mandates can still be replaced",
        /CANCELLED", "EXPIRED"|"CANCELLED",\s*"EXPIRED"/.test(sub));
}

/* ========================================================================= */
console.log("\nVERIFY — no oracle, no amplification");
/* ========================================================================= */
{
  const verify = src("src/app/api/pay/cashfree/verify/route.ts");
  check("the verify route is rate limited", /enforce\(/.test(verify));
  check("...and refuses to report on another workspace's order",
        /orgId !== orgId|res as any\)\.orgId/.test(verify) && /403/.test(verify));

  const settle = src("src/lib/pay/settle.ts");
  check("settleOrder returns the owning org so that check can work",
        /orgId\?: string/.test(settle));
  check("...and it comes from the order, never the caller",
        /const orgId = \(order\.customerId \|\| ""\)\.trim\(\)/.test(settle));
}

/* ========================================================================= */
console.log("\nSTILL TRUE — the parts that were already right");
/* ========================================================================= */
{
  /* Guarding against a fix breaking something that worked. */
  const order = src("src/app/api/pay/cashfree/order/route.ts");
  check("the client never supplies an amount", !/amount = .*b\.amount|b\.amount/.test(order));
  check("the price comes from the catalogue", /PLANS|CREDIT_PACKS/.test(order));

  const wh = src("src/app/api/pay/cashfree/webhook/route.ts");
  check("the raw body is still used for the HMAC", /await req\.text\(\)/.test(wh));
  check("...and verified BEFORE parsing",
        wh.indexOf("verifyCashfreeWebhook") < wh.indexOf("JSON.parse(raw)"));
  check("an unset secret still fails closed", /if \(!secret\)[\s\S]{0,80}503/.test(wh));
  check("the subscription branch still asks for retries", /cashfree-sub[\s\S]{0,200}status: 500/.test(wh));
}

/* ========================================================================= */
console.log("\nTHE ₹1 TEST PACK MUST NOT LEAK");
/* ========================================================================= */
{
  /*
    A hidden pack is operator tooling that charges real money. Three ways it
    could escape, each checked: shown to a customer, orderable by knowing its
    id, or dragging the margin floor down with it.
  */
  const config = src("src/lib/config.ts");
  check("the test pack is marked hidden", /id: "pack_test"[^\n]*hidden: true/.test(config));
  check("PUBLIC_CREDIT_PACKS filters hidden packs", /CREDIT_PACKS\.filter\(\(p\) => !p\.hidden\)/.test(config));

  const usage = src("src/app/(app)/usage/page.tsx");
  check("the usage page renders only public packs",
        /PUBLIC_CREDIT_PACKS/.test(usage) && !/packs=\{CREDIT_PACKS\}/.test(usage));

  const order = src("src/app/api/pay/cashfree/order/route.ts");
  check("ordering a hidden pack requires super-admin",
        /pack\.hidden[\s\S]{0,220}isSuperAdmin/.test(order));
  check("...and the refusal is indistinguishable from an unknown pack",
        /pack\.hidden[\s\S]{0,300}Unknown pack/.test(order));

  const model = src("src/lib/pricing-model.ts");
  check("the margin floor skips hidden packs", /if \(p\.hidden\) continue;/.test(model));

  /* Executed: the floor must still be ₹0.90 from pack_10k, not ₹1.00 from the
     test pack — and more importantly, a hidden pack priced BELOW the floor must
     not move it either, which is the case a price typo would create. */
  const packs = [
    { id: "pack_10k", credits: 10000, price: 8999 },
    { id: "pack_test", credits: 1, price: 1, hidden: true },
    { id: "pack_typo", credits: 1000, price: 1, hidden: true },
  ];
  let floor = null;
  for (const p of packs) {
    if (p.hidden) continue;
    const v = p.price / p.credits;
    if (floor === null || v < floor) floor = v;
  }
  check(`the floor stays ₹0.90 even beside a ₹0.001 hidden pack (got ${floor})`,
        Math.abs(floor - 0.8999) < 0.001);

  const status = src("src/app/api/superadmin/paytest-status/route.ts");
  check("the result is read from the ledger, not the checkout response",
        /credit_ledger/.test(status) && /claimCount/.test(status));
  check("the status route is super-admin only", /isSuperAdmin/.test(status));
}

/* ========================================================================= */
console.log("\nCSP MUST NOT BLOCK CHECKOUT — this broke every payment");
/* ========================================================================= */
{
  /*
    Found by running a real ₹1 payment in production. The CSP was
    `form-action 'self'`, added with a comment asserting "no form in this app
    posts to an external origin; Cashfree checkout is a redirect".

    It is not a redirect. Cashfree's v3 SDK submits a form into its modal
    iframe at https://api.cashfree.com/pg/view/sessions/checkout, which
    form-action 'self' forbids. Confirmed live:

      directive:  form-action
      blockedURI: https://api.cashfree.com/pg/view/sessions/checkout

    The iframe never navigated, cf.checkout() never settled, and the customer
    saw a spinner forever with no error anywhere. Every payment the product
    could take was blocked, silently, for as long as that header shipped.

    No unit test could have caught this: the CSP is a response header, the SDK
    is third-party, and the failure is a promise that never settles. Hence the
    live test. These assertions stop it regressing.
  */
  /*
    Assert on the COMPUTED header, by importing next.config.mjs — not on its
    source text.

    Two reasons, both learned the hard way in the last ten minutes:

      the config now carries a long comment containing the words "form-action",
      and a regex over the source matched the PROSE, reporting the policy as a
      wildcard (the same comment-matching trap as test-ai-profiles and
      test-income-tax);

      and that comment contained a nested close-comment marker, which ended the
      block early and left the remaining prose as live JavaScript. The file was syntactically
      broken and would have failed the production build. A source-text regex
      cannot see that; importing the module fails loudly.
  */
  const cfgMod = await import(new URL("../next.config.mjs", import.meta.url).href);
  const headerGroups = await cfgMod.default.headers();
  const allHeaders = headerGroups.flatMap((g) => g.headers);
  const cspHeader = allHeaders.find((h) => h.key === "Content-Security-Policy");
  const cspValue = cspHeader ? cspHeader.value : "";

  check("next.config.mjs is valid and returns a CSP", Boolean(cspValue));

  const directives = Object.fromEntries(
    cspValue.split(";").map((d) => d.trim()).filter(Boolean)
      .map((d) => { const [name, ...rest] = d.split(/\s+/); return [name, rest]; }),
  );
  const formAction = directives["form-action"] || [];

  check(`form-action is not 'self' alone (${formAction.join(" ")})`, formAction.length > 1);
  check("production checkout host is allowed", formAction.includes("https://api.cashfree.com"));
  check("sandbox checkout host is allowed too", formAction.includes("https://sandbox.cashfree.com"));
  check("form-action still starts from 'self'", formAction[0] === "'self'");
  check("...and is not a wildcard", !formAction.includes("*") && !formAction.includes("https:"));
  check("the other three directives survive",
        directives["object-src"]?.includes("'none'")
        && directives["base-uri"]?.includes("'self'")
        && directives["frame-ancestors"]?.includes("'self'"));

  /* The exact URL the browser reported must now be permitted, and an unrelated
     origin must still be refused. */
  const permits = (url) => formAction.some((a) => a !== "'self'" && url.startsWith(a));
  check("the URL blocked in production would now be allowed",
        permits("https://api.cashfree.com/pg/view/sessions/checkout"));
  check("an unrelated origin is still refused", !permits("https://evil.example.com/collect"));

  const client = src("src/lib/pay/checkout-client.ts");
  check("checkout no longer swallows failures into an empty catch",
        !/\} catch \{ \/\* modal closed — fall through to verify \*\/ \}/.test(client));
  check("a CSP violation is detected and surfaced",
        /securitypolicyviolation/.test(client) && /security policy/.test(client));
  check("a never-settling checkout is timed out rather than awaited forever",
        /Promise\.race/.test(client) && /__stalled__/.test(client));
}

/* ========================================================================= */
console.log("\nTHE LEDGER MUST BE OURS ALONE");
/* ========================================================================= */
{
  /*
    `payments` is owned by the school/tuition app in this Supabase project. That
    coupling produced three failures: their revenue counted as ours, then
    owner_id NOT NULL rejected every Cortex insert, then student_id NOT NULL did
    the same on the very next attempt.

    The split to cortex_payments touches fourteen call sites. Missing ONE would
    be worse than not splitting: settle would claim in one table while the
    webhook checked the other, and the idempotency guard -- the thing that stops
    one payment granting twice -- would silently stop working. So every payment
    path must go through the constant.
  */
  const PAY_FILES = [
    "src/lib/pay/settle.ts",
    "src/lib/pay/refund.ts",
    "src/app/api/pay/cashfree/webhook/route.ts",
    "src/lib/admin-metrics.ts",
    "src/app/api/superadmin/paytest-status/route.ts",
    "src/lib/erasure.ts",
  ];
  for (const f of PAY_FILES) {
    const t = src(f);
    check(`${f.replace("src/", "")} never names the shared table`,
          !/\.from\("payments"\)/.test(t));
    if (/\.from\(/.test(t) && /PAYMENTS_TABLE/.test(t)) {
      check(`...and imports the constant`, /from "@\/lib\/pay\/table"/.test(t));
    }
  }

  const table = src("src/lib/pay/table.ts");
  check("the constant points at cortex_payments",
        /PAYMENTS_TABLE = "cortex_payments"/.test(table));

  const backup = src("src/lib/backup.ts");
  check("backups capture cortex_payments, not the other product's table",
        /"cortex_payments"/.test(backup) && !/"payments",/.test(backup));

  const mig = readFileSync(join(ROOT, "supabase/migrations/2026_cortex_payments.sql"), "utf8");
  check("the new table is service-role only (RLS on, no policy)",
        /enable row level security/.test(mig) && !/create policy/.test(mig));
  check("order_id is unique, so settlement stays idempotent",
        /unique index[^;]*cortex_payments\(order_id\)|order_id   text primary key/.test(mig));
  check("history is backfilled from the shared table", /insert into cortex_payments/.test(mig));
  check("...and the other product's table is not modified",
        !/alter table payments/.test(mig) && !/drop table payments/.test(mig));
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
