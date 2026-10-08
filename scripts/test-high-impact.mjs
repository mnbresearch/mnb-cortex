/*
  HIGH-IMPACT OPERATIONS: SIGNED APPROVALS + SECOND FACTOR, EXECUTED.

  1. SIGNATURE  An approval is an HMAC over (id, workspace, action, sha256 of
                canonical args, approver, assurance level). Change any one and
                it no longer verifies; key order in args does not matter.
  2. LEDGER     The REAL ledger.ts, run against an in-memory action_proposals
                table: approve signs, execute verifies, and a row whose args
                are changed after approval FAILS CLOSED instead of running.
                Before the migration (no column) it behaves exactly as before.
  3. STEP-UP    strongAuthVerdict: aal2 passes; aal1 is refused when the
                workspace requires it, with the right next step (enrol vs
                verify); loosening a setting is detected.
  4. WIRING     every high-impact entry point asks for it: approve/undo of
                money+outbound, auto rules for them, earned autonomy, API keys,
                webhooks, integration connect, collections approve; the email
                link cannot approve money/outbound; the settings columns are
                guarded in the database.

  Run: node --experimental-strip-types --no-warnings scripts/test-high-impact.mjs
*/
import { readFileSync, mkdtempSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

let pass = 0; const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? `\n      ${d}` : ""}`));
const read = (p) => readFileSync(p, "utf8");
const abs = (p) => pathToFileURL(join(process.cwd(), p)).href;

process.env.APPROVAL_SIGNING_SECRET = "test-approval-key";
const S = await import("../src/lib/engine/approval-sig.ts");

/* ── 1. signature ─────────────────────────────────────────────────────── */
const base = { id: "p1", orgId: "o1", action: "mark_invoice_paid", args: { invoice_id: "i1", amount: 5000 }, approver: "u1", aal: "aal2" };
const s1 = S.signApproval(base);
check(s1 && /^[0-9a-f]{64}$/.test(s1.sig), "sig: signs with a key");
check(S.verifyApproval(base, s1.sig), "sig: verifies the same fields");
check(S.verifyApproval({ ...base, args: { amount: 5000, invoice_id: "i1" } }, s1.sig), "sig: key order in args does not matter (canonical)");
for (const [k, v] of [["id", "p2"], ["orgId", "o2"], ["action", "send_payment_reminder"], ["approver", "u2"], ["aal", "aal1"]]) {
  check(!S.verifyApproval({ ...base, [k]: v }, s1.sig), `sig: a different ${k} does not verify`);
}
check(!S.verifyApproval({ ...base, args: { invoice_id: "i1", amount: 500000 } }, s1.sig), "sig: changed args do not verify");
check(!S.verifyApproval({ ...base, args: { invoice_id: "i1", amount: 5000, extra: 1 } }, s1.sig), "sig: an added arg does not verify");
check(!S.verifyApproval(base, s1.sig, "another-key"), "sig: another key does not verify");
check(!S.verifyApproval(base, null) && !S.verifyApproval(base, "zz") && !S.verifyApproval(base, s1.sig.toUpperCase()), "sig: missing or malformed signatures do not verify");
check(S.signApproval(base, null) === null, "sig: no key → no signature (never a fake one)");
check(S.approvalKey({}) === null && S.approvalKey({ CRON_SECRET: "c" }) === "c" && S.approvalKey({ APPROVAL_SIGNING_SECRET: "a", CRON_SECRET: "c" }) === "a", "sig: key chain prefers the dedicated secret");
check(S.argsHash({ a: 1, b: [1, { d: 2, c: 3 }] }) === S.argsHash({ b: [1, { c: 3, d: 2 }], a: 1 }), "sig: canonical hashing is deep");
check(S.argsHash([1, 2]) !== S.argsHash([2, 1]), "sig: array order still matters");

/* ── 2. ledger, executed ──────────────────────────────────────────────── */
function fakeDb({ hasSigColumns }) {
  const tables = { action_proposals: [], action_policies: [] };
  const SIG = ["approval_sig", "approval_args_hash", "approved_aal"];
  function builder(table) {
    const st = { table, op: "select", filters: [], patch: null, row: null, head: false, count: false, single: false };
    const match = (r) => st.filters.every(([k, op, v]) =>
      op === "eq" ? r[k] === v : op === "in" ? v.includes(r[k]) : op === "is" ? (v === null ? r[k] == null : r[k] === v)
      : op === "gt" ? String(r[k]) > String(v) : op === "gte" ? String(r[k] ?? "") >= String(v) : true);
    const run = () => {
      const rows = tables[table] || (tables[table] = []);
      if (st.op === "insert") {
        const r = { id: randomUUID(), created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 864e5).toISOString(), ...st.row };
        if (hasSigColumns) for (const c of SIG) if (!(c in r)) r[c] = null;
        rows.push(r);
        return { data: st.single ? r : [r], error: null };
      }
      if (st.op === "update") {
        if (!hasSigColumns && Object.keys(st.patch).some((k) => SIG.includes(k))) return { data: null, error: { code: "PGRST204", message: "Could not find the 'approval_sig' column" } };
        const hit = rows.filter(match);
        for (const r of hit) Object.assign(r, st.patch);
        return { data: hit.map((r) => ({ ...r })), error: null };
      }
      const hit = rows.filter(match);
      if (st.count) return { data: null, count: hit.length, error: null };
      return { data: st.single ? (hit[0] ? { ...hit[0] } : null) : hit.map((r) => ({ ...r })), error: null };
    };
    const b = {
      select(_c, o) { if (st.op === "select" && o?.count) { st.count = true; } return b; },
      insert(r) { st.op = "insert"; st.row = r; return b; },
      update(p) { st.op = "update"; st.patch = p; return b; },
      upsert() { return b; },
      eq(k, v) { st.filters.push([k, "eq", v]); return b; },
      in(k, v) { st.filters.push([k, "in", v]); return b; },
      is(k, v) { st.filters.push([k, "is", v]); return b; },
      gt(k, v) { st.filters.push([k, "gt", v]); return b; },
      gte(k, v) { st.filters.push([k, "gte", v]); return b; },
      not() { return b; }, order() { return b; }, limit() { return b; }, ilike() { return b; }, or() { return b; },
      maybeSingle() { st.single = true; return Promise.resolve(run()); },
      single() { st.single = true; return Promise.resolve(run()); },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return b;
  }
  return { tables, from: (t) => builder(t) };
}

const dir = mkdtempSync(join(tmpdir(), "hi-"));
copyFileSync("src/lib/ai/untrusted.ts", join(dir, "untrusted.ts"));
const ledgerSrc = read("src/lib/engine/ledger.ts")
  .replace(/^import ["']server-only["'];?\s*$/m, "")
  .replace(/^import \{ serviceClient \} from .*$/m, "const serviceClient = () => globalThis.__svc;")
  .replace(/from "\.\/catalogue"/, `from "${abs("src/lib/engine/catalogue.ts")}"`)
  .replace(/from "@\/lib\/ai\/untrusted"/, `from "${pathToFileURL(join(dir, "untrusted.ts")).href}"`)
  .replace(/from "\.\/policy"/, `from "${abs("src/lib/engine/policy.ts")}"`)
  .replace(/^import \{ HANDLERS, undoHandler \} from .*$/m, "const HANDLERS = globalThis.__handlers; const undoHandler = async () => ({ ok: false, error: 'n/a' });")
  .replace(/from "\.\/approval-sig"/, `from "${abs("src/lib/engine/approval-sig.ts")}"`);
writeFileSync(join(dir, "ledger.ts"), ledgerSrc);
const runs = [];
globalThis.__handlers = new Proxy({}, { get: (_t, key) => async (args) => { runs.push({ key, args }); return { ok: true, summary: `ran ${String(key)}`, result: {}, undo: null }; } });
const L = await import(pathToFileURL(join(dir, "ledger.ts")).href);

{
  const db = fakeDb({ hasSigColumns: true }); globalThis.__svc = db;
  const ORG = "org-A";
  const p = await L.propose({ orgId: ORG, action: "send_payment_reminder", args: { invoice_id: "11111111-1111-4111-8111-111111111111", channel: "email" }, source: "user", proposedBy: "u1", actorRole: "owner" });
  check(p.ok && p.proposal.status === "proposed", "ledger: an outbound action waits for a human", JSON.stringify(p).slice(0, 300));
  const id = p.proposal.id;

  const r = await L.approve(id, ORG, "u1", "aal2");
  const row = db.tables.action_proposals.find((x) => x.id === id);
  check(r.ok && runs.length === 1, "ledger: an approved, signed proposal runs", JSON.stringify(r));
  check(row.approved_aal === "aal2" && /^[0-9a-f]{64}$/.test(row.approval_sig || "") && row.approval_args_hash === S.argsHash(row.args), "ledger: the approval is stored signed, with the args hash and the level", JSON.stringify(row));
  check(S.verifyApproval({ id, orgId: ORG, action: row.action, args: row.args, approver: "u1", aal: "aal2" }, row.approval_sig), "ledger: the stored signature verifies independently");

  // Tamper: approve, then change args before execution.
  const p2 = await L.propose({ orgId: ORG, action: "send_payment_reminder", args: { invoice_id: "22222222-2222-4222-8222-222222222222", channel: "email" }, source: "user", proposedBy: "u1", actorRole: "owner" });
  const id2 = p2.proposal.id;
  const row2 = db.tables.action_proposals.find((x) => x.id === id2);
  Object.assign(row2, { status: "approved", decided_by: "u1" });
  const sig = S.signApproval({ id: id2, orgId: ORG, action: row2.action, args: row2.args, approver: "u1", aal: "aal2" });
  Object.assign(row2, { approval_sig: sig.sig, approval_args_hash: sig.argsHash, approved_aal: "aal2" });
  row2.args = { ...row2.args, invoice_id: "33333333-3333-4333-8333-333333333333" };   // ← changed after approval
  const before = runs.length;
  const e2 = await L.execute(id2, ORG, "u1", { recheckPolicy: false });
  check(!e2.ok && runs.length === before && row2.status === "failed" && /does not match/.test(row2.error || ""), "ledger: args changed after approval → refused, not run, recorded as failed", JSON.stringify({ e2, status: row2.status, error: row2.error }));

  // Unsigned approved row (e.g. inserted by hand) → refused.
  const p3 = await L.propose({ orgId: ORG, action: "send_payment_reminder", args: { invoice_id: "44444444-4444-4444-8444-444444444444", channel: "whatsapp" }, source: "user", proposedBy: "u1", actorRole: "owner" });
  const row3 = db.tables.action_proposals.find((x) => x.id === p3.proposal.id);
  Object.assign(row3, { status: "approved", decided_by: "u1" });
  const e3 = await L.execute(row3.id, ORG, "u1", { recheckPolicy: false });
  check(!e3.ok && row3.status === "failed", "ledger: an approved row with no signature is refused");

  // Upgraded level claim: signed at aal1, record edited to say aal2 → refused.
  const p4 = await L.propose({ orgId: ORG, action: "send_payment_reminder", args: { invoice_id: "55555555-5555-4555-8555-555555555555", channel: "email" }, source: "user", proposedBy: "u1", actorRole: "owner" });
  const row4 = db.tables.action_proposals.find((x) => x.id === p4.proposal.id);
  Object.assign(row4, { status: "approved", decided_by: "u1" });
  const s4 = S.signApproval({ id: row4.id, orgId: ORG, action: row4.action, args: row4.args, approver: "u1", aal: "aal1" });
  Object.assign(row4, { approval_sig: s4.sig, approved_aal: "aal2" });
  const e4 = await L.execute(row4.id, ORG, "u1", { recheckPolicy: false });
  check(!e4.ok, "ledger: a record cannot later claim a stronger approval than was signed");

  // Auto under an owner rule: signed as "policy" and runs.
  db.tables.action_policies.push({ org_id: ORG, action: "add_customer_note", mode: "auto", caps: {} });
  const before5 = runs.length;
  const p5 = await L.propose({ orgId: ORG, action: "add_customer_note", args: { customer_id: "66666666-6666-4666-8666-666666666666", note: "prefers WhatsApp" }, source: "user", proposedBy: "u1", actorRole: "owner" });
  const row5 = db.tables.action_proposals.find((x) => x.id === p5.proposal?.id);
  check(p5.ok && p5.executed?.ok && runs.length === before5 + 1 && row5?.approved_aal === "policy", "ledger: an owner auto-rule approval is signed as 'policy' and runs", JSON.stringify({ p5: { ok: p5.ok, executed: p5.executed, err: p5.error, problems: p5.problems }, row5 }).slice(0, 400));
}

{
  // Before 2026_zzzu: no columns. Everything behaves as it did.
  const db = fakeDb({ hasSigColumns: false }); globalThis.__svc = db;
  const p = await L.propose({ orgId: "org-B", action: "send_payment_reminder", args: { invoice_id: "77777777-7777-4777-8777-777777777777", channel: "email" }, source: "user", proposedBy: "u1", actorRole: "owner" });
  const before = runs.length;
  const r = await L.approve(p.proposal.id, "org-B", "u1", "aal2");
  check(r.ok && runs.length === before + 1, "ledger: before the migration, approval still works (no column, no check)", JSON.stringify(r));
}

{
  // No key at all: approval refused, row put back, nothing runs.
  const saved = { ...process.env };
  for (const k of ["APPROVAL_SIGNING_SECRET", "LINK_SIGNING_SECRET", "CRON_SECRET", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
  const db = fakeDb({ hasSigColumns: true }); globalThis.__svc = db;
  const p = await L.propose({ orgId: "org-C", action: "send_payment_reminder", args: { invoice_id: "88888888-8888-4888-8888-888888888888", channel: "email" }, source: "user", proposedBy: "u1", actorRole: "owner" });
  const before = runs.length;
  const r = await L.approve(p.proposal.id, "org-C", "u1", "aal2");
  const row = db.tables.action_proposals.find((x) => x.id === p.proposal.id);
  check(!r.ok && runs.length === before && row.status === "proposed", "ledger: with no signing key nothing runs and the proposal is put back", JSON.stringify({ r, status: row.status }));
  Object.assign(process.env, saved);
}

/* ── 3. step-up rule ──────────────────────────────────────────────────── */
const R = await import("../src/lib/strong-auth-rules.ts");
const v = (required, current, next) => R.strongAuthVerdict({ required, current, next }, "approve this");
check(v(true, "aal2", "aal2").ok && v(true, "aal2", "aal2").aal === "aal2", "mfa: aal2 passes");
check(!v(true, "aal1", "aal1").ok && v(true, "aal1", "aal1").reason === "enrol", "mfa: required + no factor → enrol");
check(!v(true, "aal1", "aal2").ok && v(true, "aal1", "aal2").reason === "verify", "mfa: required + factor not used this sign-in → verify");
check(/\/settings\/security/.test(v(true, "aal1", "aal1").message) && /approve this/.test(v(true, "aal1", "aal1").message), "mfa: the message names the action and where to go");
check(v(false, "aal1", "aal1").ok && v(false, "aal1", "aal1").aal === "aal1", "mfa: optional workspace → aal1 allowed, recorded as aal1");
check(!v(false, null, null).ok && v(false, null, null).reason === "signed-out", "mfa: signed out is never ok, even when optional");
check(!v(true, "garbage", "aal2").ok, "mfa: an unknown level is not trusted");
check(R.isLoosening({ mfaFrom: true, mfaTo: false, redactionFrom: "pii", redactionTo: "pii" }), "mfa: switching MFA off is loosening");
check(R.isLoosening({ mfaFrom: true, mfaTo: true, redactionFrom: "strict", redactionTo: "pii" }) && R.isLoosening({ mfaFrom: false, mfaTo: false, redactionFrom: "pii", redactionTo: "off" }), "mfa: lowering redaction is loosening");
check(!R.isLoosening({ mfaFrom: false, mfaTo: true, redactionFrom: "off", redactionTo: "strict" }), "mfa: tightening is not loosening");
check(R.parseRedaction("nonsense") === "pii" && R.parseRedaction("strict") === "strict", "mfa: an unknown redaction value falls back to the default, never to off");

/* ── 4. wiring ────────────────────────────────────────────────────────── */
const sa = read("src/lib/engine/server-actions.ts");
const fn = (src, name) => src.slice(src.indexOf(`export async function ${name}`), src.indexOf("export async function", src.indexOf(`export async function ${name}`) + 10) >>> 0 || undefined);
const approveFn = fn(sa, "approveProposal");
check(/isHighImpact\(def\)[\s\S]*requireStrongAuth\(orgId/.test(approveFn) && approveFn.indexOf("requireStrongAuth") < approveFn.indexOf("ledger.approve("), "wiring: approving money/outbound asks for a second factor before the ledger is touched");
check(/ledger\.approve\(id, orgId, userId, aal\)/.test(approveFn), "wiring: the approver's level is passed to the ledger to be signed");
check(/isHighImpact\(def\)[\s\S]*requireStrongAuth/.test(fn(sa, "undoProposal")), "wiring: undoing money/outbound asks for a second factor");
check(/mode === "auto" && pdef && isHighImpact\(pdef\)[\s\S]*requireStrongAuth/.test(fn(sa, "savePolicy")), "wiring: an auto rule for money/outbound asks for a second factor");
check(/isHighImpact\(adef\)[\s\S]*requireStrongAuth/.test(fn(sa, "acceptAutonomy")), "wiring: accepting earned autonomy for money/outbound asks for a second factor");
const acts = read("src/lib/actions.ts");
for (const [name, what] of [["generateApiKey", "issue an API key"], ["addWebhook", "send events to an outside address"], ["approveMessage", "approve a message to a customer"]]) {
  const body = fn(acts, name);
  check(body.includes(`requireStrongAuth(orgId, "${what}")`) && /if \(!sa\.ok\)/.test(body), `wiring: ${name} asks for a second factor`);
}
const integ = read("src/app/api/integrations/route.ts");
const conn = integ.slice(integ.indexOf('if (op === "connect")'));
check(conn.indexOf("requireStrongAuth") > -1 && conn.indexOf("requireStrongAuth") < conn.indexOf("credentials"), "wiring: connecting an integration asks for a second factor before credentials are handled");
const dec = read("src/app/decide/[token]/actions.ts");
check(/verb === "approve" && isHighImpact\(def\)/.test(dec) && dec.indexOf("isHighImpact(def)") < dec.indexOf("await approve("), "wiring: an email link cannot approve money/outbound");
check(/canApprove=\{!\(def && isHighImpact\(def\)\)\}/.test(read("src/app/decide/[token]/page.tsx")), "wiring: and the page does not offer it");
check(/isHighImpact\(def\)/.test(read("src/lib/engine/decision-digest.ts")), "wiring: the digest says such items are approved in the app");
const sec = read("src/lib/security-actions.ts");
check(/assertRole\("admin"\)/.test(sec) && /isLoosening\(/.test(sec) && /a\.current !== "aal2"/.test(sec), "wiring: settings are admin-only and loosening needs aal2");
const st = read("src/lib/strong-auth.ts");
check(/getAuthenticatorAssuranceLevel\(\)/.test(st), "wiring: the level comes from Supabase Auth, not the request");
check(/const strict: SecuritySettings = \{ requireMfa: true/.test(st) && /if \(error \|\| !data\) return strict/.test(st), "wiring: unreadable settings mean the strict default");
const mig = read("supabase/migrations/2026_zzzu_security_controls.sql");
check(/'require_mfa_high_impact'/.test(mig) && /'ai_redaction'/.test(mig), "db: both settings are in the guarded column list");
check(/require_mfa_high_impact boolean not null default true/.test(mig), "db: MFA is required by default");
check(read("supabase/migrations/ORDER.txt").includes("2026_zzzu_security_controls.sql"), "db: the migration is in ORDER.txt");

console.log(`\nhigh-impact: ${pass} passed, ${failures.length} failed`);
for (const x of failures) console.log("  ✗ " + x);
process.exit(failures.length ? 1 : 0);
