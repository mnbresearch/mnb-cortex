/*
  WHOSE CREDITS PAY — every branch, including the ones that must never happen.

  Run with:  npm run test:credit-pool

  This module decides to spend another workspace's money. That is the most
  abusable capability in the product, so the bar here is not "the happy path
  works" — it is "every way of reaching somebody else's balance that should be
  refused, is refused, and the refusal lands on paying-for-yourself rather than
  on free".

  The Practice plan advertises "Up to 25 client workspaces" above "27,750 AI
  credits / month", and config.ts asserts "POOLED across clients" in a comment.
  The code charged the current workspace, so the bullet was false. This is the
  implementation of that bullet — and the test that it cannot become a way in.
*/

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolvePayer, pooledReason, isPooledReason, clientFromReason, POOLING_PLANS,
} from "../src/lib/credit-pool.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let pass = 0;
const fails = [];
const check = (cond, name, detail = "") => {
  if (cond) pass++;
  else fails.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

const CLIENT = { id: "11111111-1111-1111-1111-111111111111", plan: "try", status: "expired" };
const FIRM = { id: "22222222-2222-2222-2222-222222222222", plan: "practice", status: "active" };

/* ============================================== the promise, working ===== */
{
  const d = resolvePayer(CLIENT, FIRM);
  check(d.pooled === true, "a Practice firm funds its client");
  check(d.payerOrgId === FIRM.id, "the FIRM's balance is the one charged", d.payerOrgId);
  check(d.reason === "practice-pool", "reason names the pool", d.reason);

  /* The client is `expired` — a brand-new workspace is, since TRIAL_DAYS is 0.
     That must not stop the firm paying for it; if it did, pooling would be
     useless for exactly the workspaces a firm creates for its clients. */
  check(d.pooled, "an expired CLIENT is still funded by an active firm");
}

{
  /* Enterprise pools too — negotiated, unlimited client count. */
  const d = resolvePayer(CLIENT, { ...FIRM, plan: "enterprise" });
  check(d.pooled === true, "enterprise pools as well as practice");
}

/* =================================== THE ATTACK: pointing at a stranger === */
{
  /*
    The exploit this feature would create if the link were writable by the
    client: sign up, name a large paying workspace, spend their month.

    resolvePayer cannot prevent that on its own — the control is
    cortex_practice_claim() in the migration, which requires owner/admin rank
    in the FIRM and membership of the client. What this asserts is the second
    line of defence: the firm must be on a plan that actually bought pooling,
    so naming a rich workspace on any other plan gets nothing.
  */
  for (const plan of ["try", "watch", "watchpro", "command", "starter", "growth", "business", "aicoo", "premium", "solo", ""]) {
    const d = resolvePayer(CLIENT, { ...FIRM, plan });
    check(!d.pooled, `a "${plan || "(blank)"}" workspace cannot be made to pay for another`);
    check(d.payerOrgId === CLIENT.id, `"${plan || "(blank)"}": falls back to paying for itself`, d.payerOrgId);
    check(d.reason === "firm-not-entitled", `"${plan || "(blank)"}": reason says why`, d.reason);
  }
}

{
  /* Case must not be a way past the plan check. */
  const d = resolvePayer(CLIENT, { ...FIRM, plan: "PRACTICE" });
  check(d.pooled === true, "plan matching is case-insensitive");
}

{
  /* A plan that merely CONTAINS a pooling name is not a pooling plan. */
  for (const plan of ["practice-lite", "not-practice", "enterprise-trial", "xpractice"]) {
    const d = resolvePayer(CLIENT, { ...FIRM, plan });
    check(!d.pooled, `"${plan}" is not treated as a pooling plan`);
  }
}

/* ====================== a firm that stopped paying stops funding ========= */
{
  for (const status of ["expired", "cancelled", "suspended", "", null, undefined, "unknown"]) {
    const d = resolvePayer(CLIENT, { ...FIRM, status });
    check(!d.pooled, `a "${status}" firm funds nobody`, d.reason);
    check(d.payerOrgId === CLIENT.id, `"${status}": client pays for itself`);
    check(d.reason === "firm-lapsed", `"${status}": reason distinguishes lapse from plan`, d.reason);
  }
  /* trialing is the one non-active status that may still fund — a firm mid
     onboarding should not have its clients break. */
  const t = resolvePayer(CLIENT, { ...FIRM, status: "trialing" });
  check(t.pooled === true, "a trialing firm still funds its clients");
}

/* =============================================== degenerate and missing == */
{
  check(resolvePayer(CLIENT, null).pooled === false, "no link: pays for itself");
  check(resolvePayer(CLIENT, null).reason === "no-link", "no link: reason says so");
  check(resolvePayer(CLIENT, undefined).payerOrgId === CLIENT.id, "undefined firm is not an error");
  check(resolvePayer(CLIENT, { id: "" }).reason === "no-link", "a blank firm id is no link");

  /* A row pointing at itself — what a hand-edited or corrupted link looks
     like. The DB constraint forbids it; this must not loop or double-charge. */
  const self = resolvePayer(CLIENT, { ...CLIENT });
  check(self.pooled === false, "self-link is not pooling");
  check(self.payerOrgId === CLIENT.id, "self-link charges the workspace once");
  check(self.reason === "self", "self-link is named as such", self.reason);
}

{
  /* THE INVARIANT THAT MATTERS MOST: there is no input for which the payer is
     a third party, and none for which the payer is empty (which would send a
     null org id to charge_credits and fail open). */
  const firms = [
    null, undefined, { id: "" }, { ...CLIENT },
    { ...FIRM }, { ...FIRM, plan: "watch" }, { ...FIRM, status: "suspended" },
    { id: "33333333-3333-3333-3333-333333333333", plan: "practice", status: "active" },
  ];
  for (const f of firms) {
    const d = resolvePayer(CLIENT, f);
    check(d.payerOrgId === CLIENT.id || d.payerOrgId === (f && f.id),
      "payer is always either this workspace or the named firm — never a third party",
      String(d.payerOrgId));
    check(typeof d.payerOrgId === "string" && d.payerOrgId.length > 0,
      "payer id is never empty (an empty id would fail open at charge_credits)");
  }
}

/* ================================================ the ledger reason ====== */
{
  const r = pooledReason("chat", CLIENT.id);
  check(r.startsWith("ai:chat"), "pooled reason keeps the ai:<mode> prefix the ledger already groups by", r);
  check(r.includes(CLIENT.id), "pooled reason carries the client id");
  check(isPooledReason(r), "a pooled reason is recognisable as pooled");
  check(!isPooledReason("ai:chat"), "an ordinary charge is not mistaken for pooled");
  check(clientFromReason(r) === CLIENT.id, "the client id round-trips out of the reason", String(clientFromReason(r)));
  check(clientFromReason("ai:chat") === null, "no client id in an ordinary reason");
  check(clientFromReason(null) === null, "null reason does not throw");
  check(pooledReason("CHAT", CLIENT.id) === pooledReason("chat", CLIENT.id), "mode is normalised");
}

/* ============ POOLING_PLANS must agree with what config.ts actually sells = */
{
  /*
    credit-pool.ts is import-free so it can be executed here, which means its
    plan list is a COPY of the one in config.ts. A copy that drifts either
    strands a paying firm or quietly extends pooling to a tier that never
    bought it, so the two are pinned here by reading the source.
  */
  const cfg = readFileSync(join(ROOT, "src/lib/config.ts"), "utf8");
  const block = cfg.slice(cfg.indexOf("export const PRACTICE_CLIENTS"), cfg.indexOf("}", cfg.indexOf("export const PRACTICE_CLIENTS")));
  const inConfig = [...block.matchAll(/^\s*([a-z_]+)\s*:/gim)].map((m) => m[1]);

  check(inConfig.length > 0, "PRACTICE_CLIENTS parsed out of config.ts", String(inConfig.length));
  for (const p of inConfig) {
    check(POOLING_PLANS.includes(p), `config sells client workspaces on "${p}" — POOLING_PLANS must include it`);
  }
  for (const p of POOLING_PLANS) {
    check(inConfig.includes(p), `POOLING_PLANS has "${p}" — config.ts must sell client workspaces on it`);
  }
}

/* ===== and the SQL guard must name the same plans as the TS =============== */
{
  const sql = readFileSync(join(ROOT, "supabase/migrations/2026_zzzd_practice_pool.sql"), "utf8");
  const m = sql.match(/v_plan not in \(([^)]*)\)/);
  check(!!m, "the migration's plan guard is found");
  if (m) {
    const inSql = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    check(inSql.length === POOLING_PLANS.length, "SQL and TS allow the same NUMBER of plans", `sql=${inSql.join(",")}`);
    for (const p of POOLING_PLANS) {
      check(inSql.includes(p), `the migration allows "${p}" too — otherwise a claim succeeds in TS and fails in SQL, or worse`);
    }
  }
}

console.log(`\ncredit pooling: ${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log("  FAIL " + f);
  process.exit(1);
}
console.log("  The firm pays; a lapsed or downgraded firm pays for nobody; nothing reaches a third party.");
