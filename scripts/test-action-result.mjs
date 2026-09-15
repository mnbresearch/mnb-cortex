/*
  RECOVERABLE FAILURES MUST REACH THE PERSON WHO CAUSED THEM.

  The defect this guards, measured against production rather than assumed:
  submitting Settings with an empty company name showed "This page hit an
  error / Reference: 2541004096" instead of "Your company name cannot be
  empty." Next masks thrown action messages in production, and the boundary
  replaces the page, so the customer got a support code for a typo and lost
  everything else they had typed.

  Three properties are asserted here, and each one has bitten:

    1. RECOVERABLE ERRORS ARE RETURNED, NOT THROWN, so the wording survives.
    2. CONTROL FLOW IS NOT AN ERROR. redirect() and notFound() signal by
       throwing; catching those breaks sign-out. Asserted both ways.
    3. GUARDS STILL THROW. requireRole must never return a failure value — I
       converted it during this work and had to put it back, because a guard
       that returns is a guard fifty callers can forget to check.

  Run: node scripts/test-action-result.mjs
*/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { readCode, stripComments } from "./lib/read-code.mjs";

/** Every .tsx under a directory, recursively. */
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = dir + "/" + e;
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

let pass = 0, fail_ = 0;
const failures = [];
function t(name, fn) {
  try { fn(); pass++; } catch (e) { fail_++; failures.push(`${name}: ${e.message}`); }
}

const M = await import("../src/lib/action-result.ts");
const {
  ok, fail, isActionResult, isFailure, isControlFlowException,
  messageForThrown, FALLBACK_MESSAGE,
} = M;

/* ===================== the result shape ===================== */

t("R1 ok() is a success with no error field", () => {
  const r = ok();
  assert.equal(r.ok, true);
  assert.equal("error" in r, false);
  assert.equal(isFailure(r), false);
});

t("R2 ok(message) carries the message", () => {
  assert.deepEqual(ok("Saved."), { ok: true, message: "Saved." });
});

t("R3 fail() produces a failure the UI can render", () => {
  const r = fail("Your company name cannot be empty.");
  assert.equal(r.ok, false);
  assert.equal(r.error, "Your company name cannot be empty.");
  assert.equal(isFailure(r), true);
});

t("R4 an empty or whitespace message never renders as an empty red box", () => {
  for (const bad of ["", "   ", "\n\t", null, undefined]) {
    const r = fail(bad);
    assert.equal(r.ok, false);
    assert.ok(r.error.length > 20, `fail(${JSON.stringify(bad)}) -> "${r.error}"`);
    assert.equal(r.error, FALLBACK_MESSAGE);
  }
});

t("R5 fail() trims, so stray whitespace does not shift the layout", () => {
  assert.equal(fail("  Pick which number to watch.  ").error, "Pick which number to watch.");
});

t("R6 void is not a result — most actions return nothing and that means success", () => {
  for (const v of [undefined, null, 0, "", "ok", [], {}, { ok: "yes" }, { error: "x" }]) {
    assert.equal(isActionResult(v), false, JSON.stringify(v));
    assert.equal(isFailure(v), false, JSON.stringify(v));
  }
});

t("R7 a success result is a result but not a failure", () => {
  assert.equal(isActionResult({ ok: true }), true);
  assert.equal(isFailure({ ok: true }), false);
});

t("R8 a failure without a string error is not treated as a failure", () => {
  /* Defensive: rendering `undefined` into the alert box shows the word
     "undefined" to a customer, which is worse than the generic message. */
  assert.equal(isFailure({ ok: false }), false);
  assert.equal(isFailure({ ok: false, error: 42 }), false);
  assert.equal(isFailure({ ok: false, error: null }), false);
});

/* ============ control flow is not an error (sign-out) ============ */

t("C1 a redirect is recognised and must be rethrown", () => {
  const e = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
  assert.equal(isControlFlowException(e), true);
});

t("C2 every redirect digest shape is recognised", () => {
  for (const d of ["NEXT_REDIRECT", "NEXT_REDIRECT;push;/invoice;303;", "NEXT_REDIRECT;replace;/;307;"]) {
    assert.equal(isControlFlowException({ digest: d }), true, d);
  }
});

t("C3 notFound() is recognised", () => {
  assert.equal(isControlFlowException({ digest: "NEXT_NOT_FOUND" }), true);
});

t("C4 a real error is NOT mistaken for control flow", () => {
  /*
    The dangerous direction. If this returned true for an ordinary failure,
    SafeForm would rethrow it, the boundary would eat the page, and the whole
    feature would silently do nothing.
  */
  const cases = [
    new Error("boom"),
    Object.assign(new Error("x"), { digest: "1234567890" }),
    Object.assign(new Error("x"), { digest: "" }),
    Object.assign(new Error("x"), { digest: 42 }),
    Object.assign(new Error("x"), { digest: "NOT_NEXT_REDIRECT" }),
    Object.assign(new Error("x"), { digest: "next_redirect" }),
    { digest: "NEXT_NOT_FOUND_SOMETHING" },
    null, undefined, "NEXT_REDIRECT", 0,
  ];
  for (const c of cases) {
    assert.equal(isControlFlowException(c), false, `${JSON.stringify(c?.digest ?? c)} was treated as control flow`);
  }
});

t("C5 the not-found match is exact, not a prefix", () => {
  /* NEXT_REDIRECT is prefix-matched because it carries a URL; NEXT_NOT_FOUND
     carries nothing, so a prefix match there would swallow real digests. */
  assert.equal(isControlFlowException({ digest: "NEXT_NOT_FOUNDxyz" }), false);
});

/* ================= what a thrown error shows ================= */

t("T1 a thrown error never shows Next's masked placeholder", () => {
  const masked = new Error(
    "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details.",
  );
  masked.digest = "2541004096";
  const shown = messageForThrown(masked);
  assert.ok(!shown.includes("Server Components render"), shown);
  assert.ok(!shown.includes("omitted in production"), shown);
});

t("T2 the digest is surfaced so support can be quoted it", () => {
  const shown = messageForThrown(Object.assign(new Error("x"), { digest: "2541004096" }));
  assert.ok(shown.includes("2541004096"), shown);
  assert.ok(shown.startsWith(FALLBACK_MESSAGE), shown);
});

t("T3 no digest, no dangling 'Reference:'", () => {
  for (const e of [new Error("x"), {}, null, undefined, "nope"]) {
    const shown = messageForThrown(e);
    assert.ok(!shown.includes("Reference:"), `${JSON.stringify(e)} -> ${shown}`);
    assert.equal(shown, FALLBACK_MESSAGE);
  }
});

t("T4 the fallback says nothing was changed and what to do", () => {
  assert.ok(/didn't save|did not save/i.test(FALLBACK_MESSAGE), FALLBACK_MESSAGE);
  assert.ok(/nothing was changed/i.test(FALLBACK_MESSAGE), FALLBACK_MESSAGE);
  assert.ok(/try again/i.test(FALLBACK_MESSAGE), FALLBACK_MESSAGE);
});

/* ============ the actions: returned vs thrown ============ */

const ACTIONS = readCode(import.meta.url, "../src/lib/actions.ts", ["export async function updateOrgProfile"]);

/** The body of a named exported action, up to the next export. */
function bodyOf(name) {
  const i = ACTIONS.indexOf(`export async function ${name}(`);
  assert.ok(i > 0, `no action named ${name}`);
  const j = ACTIONS.indexOf("\nexport ", i + 10);
  return ACTIONS.slice(i, j === -1 ? ACTIONS.length : j);
}

/*
  Each entry: the action, and a phrase from a message the customer must be
  able to read. Every one of these was a `throw` that production masked.
*/
const MUST_RETURN = [
  ["updateOrgProfile", "company name cannot be empty"],
  ["updateOrgProfile", "logo URL must be a full https"],
  ["updateStatutoryProfile", "reload the page and try again"],
  ["inviteMember", "email address you want to invite"],
  ["inviteMember", "Upgrade under Billing"],
  ["inviteMember", "already has a pending invite"],
  ["addLead", "at least a name or an email"],
  ["convertLead", "no longer exists"],
  ["saveGoal", "Give the goal a name"],
  ["saveAlertRule", "Pick which number to watch"],
  ["addWebhook", "plain http isn't accepted"],
  ["addScheduledReport", "daily, weekly or monthly"],
  ["generatePO", "no purchase order to draft"],
  ["sendReminderAI", "nothing to chase"],
  ["runWorkflow", "no steps yet"],
  ["updateStatus", "changed or removed since this page loaded"],
];

t("A1 every recoverable message is RETURNED, never thrown", () => {
  for (const [name, phrase] of MUST_RETURN) {
    const body = bodyOf(name);
    const i = body.indexOf(phrase);
    assert.ok(i > 0, `${name}: the message "${phrase}" is gone`);
    /* Look backwards from the message to whichever keyword introduced it. */
    const before = body.slice(Math.max(0, i - 200), i);
    const lastReturn = before.lastIndexOf("return fail(");
    const lastThrow = before.lastIndexOf("throw new Error(");
    assert.ok(
      lastReturn > lastThrow,
      `${name}: "${phrase}" is still thrown — production will mask it`,
    );
  }
});

t("A2 each of those actions declares it can return a result", () => {
  for (const name of [...new Set(MUST_RETURN.map((m) => m[0]))]) {
    const sig = ACTIONS.slice(ACTIONS.indexOf(`export async function ${name}(`)).slice(0, 200);
    assert.ok(
      /Promise<ActionResult \| void>/.test(sig),
      `${name} returns a failure but its signature does not say so, so no call site is forced to handle it`,
    );
  }
});

t("A3 database errors still THROW — they are not the customer's problem", () => {
  /*
    A Postgres message can name columns, constraints and row contents. Those
    belong in the log and the digest, not in a box on the customer's screen.
    Asserted so a future "make all errors friendly" sweep cannot leak schema.
  */
  const leaked = [...ACTIONS.matchAll(/return fail\(([^)]*)\)/g)]
    .map((m) => m[1])
    .filter((arg) => /error\.message|\berr\.message|\.error\.message/.test(arg));
  assert.deepEqual(leaked, [], `raw database messages returned to the UI: ${leaked.join(" | ")}`);
});

t("A4 the database throws were left alone", () => {
  const n = (ACTIONS.match(/if \(error\) throw new Error\(error\.message\)/g) || []).length;
  assert.ok(n >= 25, `only ${n} database throws left — did a sweep convert them?`);
});

/* ============ the guard must still throw ============ */

t("G1 requireRole throws and never returns a failure", () => {
  const i = ACTIONS.indexOf("async function requireRole");
  assert.ok(i > 0, "requireRole is gone");
  const body = ACTIONS.slice(i, ACTIONS.indexOf("\nasync function", i + 10));
  assert.ok(/throw new Error\(`This action requires/.test(body),
    "requireRole no longer throws on an insufficient role");
  assert.ok(!/return fail\(/.test(body),
    "requireRole returns a failure value — fifty callers can now forget to check it");
});

t("G2 requireOrg throws too", () => {
  const i = ACTIONS.indexOf("async function requireOrg");
  const body = ACTIONS.slice(i, i + 400);
  assert.ok(/throw new Error\("Sign in/.test(body), "requireOrg stopped throwing");
});

/* ============ the call sites ============ */

t("S1 SafeForm rethrows control-flow exceptions before doing anything else", () => {
  const src = readCode(import.meta.url, "../src/components/safe-form.tsx", ["isControlFlowException"]);
  const i = src.indexOf("catch (e)");
  assert.ok(i > 0, "SafeForm has no catch");
  const afterCatch = src.slice(i, i + 220);
  const guard = afterCatch.indexOf("if (isControlFlowException(e)) throw e;");
  const setter = afterCatch.indexOf("announce(");
  assert.ok(guard > 0, "the redirect guard is missing — sign-out would break");
  assert.ok(guard < setter, "the guard must run before any state change");
});

t("S2 SafeForm renders the returned error, not just thrown ones", () => {
  const src = readCode(import.meta.url, "../src/components/safe-form.tsx", ["isActionResult"]);
  assert.ok(/isActionResult\(result\)[\s\S]{0,60}ok === false/.test(src),
    "a returned failure is not detected");
  assert.ok(src.includes('role="alert"'), "the message is not announced");
  assert.ok(src.includes('aria-live'), "no live region");
});

t("S3 the sign-out forms stay on a plain <form>", () => {
  /*
    Deliberate, and asserted so nobody 'finishes the migration'. Their success
    path is a navigation, so there is no surface left to render an inline
    error into — and wrapping the one action whose whole job is to redirect is
    how you discover the guard in S1 was wrong, in production, on logout.
  */
  for (const rel of ["../src/app/(app)/settings/page.tsx", "../src/components/user-menu.tsx"]) {
    const src = readCode(import.meta.url, rel, ["signOut"]);
    /* Attribute-tolerant: one of these carries a className, and a test that
       only matched the bare tag failed on formatting rather than on meaning. */
    assert.ok(/<form action=\{signOut\}[ >]/.test(src),
      `${rel}: signOut is no longer on a plain form`);
    assert.ok(!/<SafeForm action=\{signOut\}/.test(src),
      `${rel}: signOut was wrapped — redirects now depend on the digest guard alone`);
  }
});

t("S4 no form is bound to an action that can fail recoverably without SafeForm", () => {
  /*
    The regression this whole suite exists to prevent: someone adds a
    `return fail(...)` to an action and leaves its form as a plain <form>, so
    the message is computed, serialised, and silently dropped on the floor.
  */
  const failing = new Set(
    [...ACTIONS.matchAll(/export async function (\w+)\([^)]*\): Promise<ActionResult \| void>/g)]
      .map((m) => m[1]),
  );
  assert.ok(failing.size >= 14, `only ${failing.size} actions can report failure`);

  /* Walked rather than listed: a list is a file somebody forgets to update,
     and the whole point is to catch a NEW form nobody thought about. */
  const offenders = [];
  for (const abs of walk(new URL("../src/", import.meta.url).pathname)) {
    const src = stripComments(readFileSync(abs, "utf8"));
    for (const m of src.matchAll(/<form action=\{(\w+)\}/g)) {
      if (failing.has(m[1])) offenders.push(`${abs.split("/src/")[1]}: <form action={${m[1]}}>`);
    }
  }
  assert.deepEqual(offenders, [],
    "these forms can receive a failure they cannot display:\n  " + offenders.join("\n  "));
});

/* ========================================================================
   DID IT REACH US, AND IS A REPEAT SAFE?

   Two independent judgements, and conflating them is how you ship a Try
   again button that duplicates an invoice. form-buttons.tsx already exists
   because "Add invoice" pressed twice inserted the invoice twice; a retry is
   the same double submission wearing a friendlier label.
   ======================================================================== */

const { classifyFailure, UNREACHED_RETRYABLE, UNREACHED_CHECK_FIRST } = M;

t("F1 a digest means it reached the server and threw", () => {
  assert.equal(classifyFailure(Object.assign(new Error("x"), { digest: "2541004096" })), "server");
});

t("F2 no digest means we have no evidence it landed", () => {
  for (const e of [new Error("Failed to fetch"), new TypeError("NetworkError"), {}, null, undefined, "x", 0]) {
    assert.equal(classifyFailure(e), "unreached", JSON.stringify(e));
  }
});

t("F3 an empty or non-string digest is not evidence of arrival", () => {
  /* Defensive: treating a junk digest as "server" would suppress the retry
     button on exactly the connection failures it is meant for. */
  assert.equal(classifyFailure({ digest: "" }), "unreached");
  assert.equal(classifyFailure({ digest: 42 }), "unreached");
  assert.equal(classifyFailure({ digest: null }), "unreached");
});

t("F4 the retryable wording never claims nothing was written", () => {
  /*
    A 503 can happen AFTER a commit. The message may say the person's typing
    is safe — it is, it is still in the form — but it must not assert the
    database was untouched, which we cannot know.
  */
  assert.ok(!/nothing was saved|nothing was written|no changes were made/i.test(UNREACHED_RETRYABLE),
    `overclaims: ${UNREACHED_RETRYABLE}`);
  assert.ok(/didn't reach us/i.test(UNREACHED_RETRYABLE), UNREACHED_RETRYABLE);
});

t("F5 the non-retryable wording carries the uncertainty and says to check", () => {
  assert.ok(/can't be certain|cannot be certain/i.test(UNREACHED_CHECK_FIRST), UNREACHED_CHECK_FIRST);
  assert.ok(/reload/i.test(UNREACHED_CHECK_FIRST), UNREACHED_CHECK_FIRST);
  assert.ok(/check before/i.test(UNREACHED_CHECK_FIRST), UNREACHED_CHECK_FIRST);
  /* Must never tell them it is safe to press again. */
  assert.ok(!/try again|safe to/i.test(UNREACHED_CHECK_FIRST), UNREACHED_CHECK_FIRST);
});

t("F6 the two messages are different", () => {
  assert.notEqual(UNREACHED_RETRYABLE, UNREACHED_CHECK_FIRST);
});

/* ---- SafeForm's branching ---- */

const SF = readCode(import.meta.url, "../src/components/safe-form.tsx", ["classifyFailure", "repeatable"]);

t("F7 repeatable defaults to false", () => {
  assert.ok(/repeatable = false/.test(SF),
    "repeatable does not default to false — every form would offer a retry");
});

t("F8 the retry button is gated on BOTH unreached and repeatable", () => {
  const i = SF.indexOf('classifyFailure(e) === "unreached"');
  assert.ok(i > 0, "the unreached branch is gone");
  const branch = SF.slice(i, i + 320);
  assert.ok(/setCanRetry\(repeatable\)/.test(branch),
    "canRetry is not tied to the call site's repeatable declaration");
  assert.ok(/repeatable \? UNREACHED_RETRYABLE : UNREACHED_CHECK_FIRST/.test(branch),
    "both wordings are not selected by repeatable");
});

t("F9 a server-side throw never offers a retry", () => {
  /*
    The dangerous one. A throw from inside the action is precisely the case
    where a write may have partially committed, so canRetry must not be set
    on that path — even for an action whose repeat is otherwise safe.
  */
  const i = SF.indexOf("messageForThrown(e)");
  assert.ok(i > 0);
  const tail = SF.slice(SF.indexOf("catch (e)"), SF.length);
  const unreachedAt = tail.indexOf('=== "unreached"');
  const thrownAt = tail.indexOf("messageForThrown(e)");
  assert.ok(unreachedAt < thrownAt, "the unreached branch must come first and return");
  const afterUnreachedReturn = tail.slice(tail.indexOf("return;", unreachedAt));
  assert.ok(!/setCanRetry\(true\)|setCanRetry\(repeatable\)/.test(afterUnreachedReturn),
    "a retry is enabled after the unreached branch — a server throw would offer it");
});

t("F10 a RETURNED failure never offers a retry", () => {
  /* It ran and refused. The identical submission earns the identical refusal;
     the person has to change something first. */
  /*
    Bounded to the branch's own `return;`. Written as a fixed 400-character
    window first, which ran past the closing brace into the catch block and
    failed on the retry branch's setCanRetry — a test measuring the wrong
    region, not a product fault. Worth recording: a window wide enough to
    catch the bug is also wide enough to invent one.
  */
  const i = SF.indexOf("isActionResult(result)");
  assert.ok(i > 0, "the returned-failure branch is gone");
  const branch = SF.slice(i, SF.indexOf("return;", i) + 7);
  assert.ok(branch.length < 200, `branch slice looks wrong (${branch.length} chars)`);
  assert.ok(!/setCanRetry\(true\)|setCanRetry\(repeatable\)/.test(branch),
    "a returned failure enables the retry button");
});

t("F11 canRetry is cleared at the start of every submission", () => {
  const i = SF.indexOf("async function run(");
  const head = SF.slice(i, i + 260);
  assert.ok(/setCanRetry\(false\)/.test(head),
    "a stale retry button survives into the next attempt");
});

t("F12 the retry resends the captured submission, not a re-read of the form", () => {
  assert.ok(/lastSubmission\.current = fd/.test(SF), "the submission is not captured");
  const i = SF.indexOf("function retry(");
  const body = SF.slice(i, i + 220);
  assert.ok(/lastSubmission\.current/.test(body), "retry does not use the captured submission");
  assert.ok(!/new FormData/.test(body), "retry rebuilds the form data instead of resending it");
});

/* ---- the classification of each call site ---- */

t("F13 only single-row updates, upserts and deletes are marked repeatable", () => {
  /*
    THE ASSERTION THAT MATTERS. If an action that INSERTs is ever marked
    repeatable, a customer on a bad connection gets a Try again button that
    can add a second invoice, lead or invite. Derived from actions.ts rather
    than from a list, so a future change to what an action does is caught
    even if nobody revisits the call site.
  */
  const marked = new Set();
  for (const abs of walk(new URL("../src/", import.meta.url).pathname)) {
    const src = stripComments(readFileSync(abs, "utf8"));
    for (const m of src.matchAll(/<SafeForm action=\{(\w+)\}\s+repeatable/g)) marked.add(m[1]);
  }
  assert.ok(marked.size >= 5, `only ${marked.size} call sites marked repeatable`);

  for (const name of marked) {
    const body = bodyOf(name);
    assert.ok(
      !/\.insert\(/.test(body),
      `${name} is marked repeatable but INSERTs — a retry could duplicate a record`,
    );
    assert.ok(
      /\.update\(|\.upsert\(|\.delete\(/.test(body),
      `${name} is marked repeatable but does not update, upsert or delete`,
    );
  }
});

t("F14 the known inserting actions are NOT marked repeatable", () => {
  const inserters = ["inviteMember", "addLead", "saveGoal", "addWebhook",
    "addScheduledReport", "generatePO", "sendReminderAI", "runWorkflow",
    "convertLead", "updateStatus"];
  const offenders = [];
  for (const abs of walk(new URL("../src/", import.meta.url).pathname)) {
    const src = stripComments(readFileSync(abs, "utf8"));
    for (const name of inserters) {
      if (new RegExp(`<SafeForm action=\\{${name}\\}\\s+repeatable`).test(src)) {
        offenders.push(`${abs.split("/src/")[1]}: ${name}`);
      }
    }
  }
  assert.deepEqual(offenders, [], "inserting actions marked repeatable:\n  " + offenders.join("\n  "));
});

t("F15 every inserting action really does insert (the list is not stale)", () => {
  /* Guards F14 against rot: if one of these stops inserting, the list should
     shrink deliberately rather than sit there asserting nothing. */
  for (const name of ["inviteMember", "addLead", "saveGoal", "addWebhook", "generatePO"]) {
    assert.ok(/\.insert\(/.test(bodyOf(name)), `${name} no longer inserts — revisit F14`);
  }
});

/* ======================================================================== */

console.log(`\naction result: ${pass} passed, ${fail_} failed`);
if (fail_) { failures.forEach((f) => console.log("  FAIL " + f)); process.exit(1); }
