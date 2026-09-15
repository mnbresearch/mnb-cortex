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

/* ======================================================================== */

console.log(`\naction result: ${pass} passed, ${fail_} failed`);
if (fail_) { failures.forEach((f) => console.log("  FAIL " + f)); process.exit(1); }
