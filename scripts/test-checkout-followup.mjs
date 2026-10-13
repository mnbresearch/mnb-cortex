/*
  ANALYTICS AND THE ABANDONED-CHECKOUT FOLLOW-UP — who is counted, who is
  emailed, and what the email may say. Synthetic data only.

    1. planFollowups: only Cashfree-confirmed unpaid checkouts, 24h–7d old;
       never paid / subscribed / paid-later / opted-out / unconfirmed /
       recently emailed; one per workspace; retries capped; unknown never retried.
    2. renderFollowup: true statements only, no discount or urgency, unsubscribe.
    3. /api/t (compiled, run with fakes): only the client allow-list; GPC/DNT
       record nothing; meta is enumerated; oversize refused.
    4. Wiring: every new funnel event is recorded where it really happens —
       payments/subscriptions from the verified settle path, never a redirect.
    5. Runner + migration: default dry_run; a missing column means off; claim
       before send; List-Unsubscribe; masked addresses; additive SQL.

  Run: node --experimental-strip-types --no-warnings scripts/test-checkout-followup.mjs
*/
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
let pass = 0; const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? `\n      ${d}` : ""}`));
const read = (p) => readFileSync(join(root, p), "utf8");

/* ---------------- 1. the plan ---------------- */
const P = await import("../src/lib/checkout-followup-plan.ts");
const NOW = Date.parse("2026-10-13T06:00:00Z");
const ago = (d) => new Date(NOW - d * 86_400_000).toISOString();
const it = (o) => ({ order_id: o.id, org_id: o.org ?? "org-" + o.id, kind: o.kind ?? "plan", ref: "watchpro", amount: 19999, created_at: ago(o.days ?? 4), settled_at: ago(1), outcome: o.outcome === undefined ? "abandoned" : o.outcome });
const base = (intents, extra = {}) => ({
  now: NOW, intents, paidOrders: new Set(), lastPaidAt: new Map(), activeOrgs: new Set(), previous: new Map(), lastSentAt: new Map(),
  recipients: new Map(intents.map((i) => [i.org_id, { email: `${i.org_id}@example.test`, confirmed: true }])), optedOut: new Set(), ...extra,
});
const act = (ds, id) => ds.find((d) => d.order_id === id);
{
  const ds = P.planFollowups(base([it({ id: "a" })]));
  check(act(ds, "a").action === "send" && act(ds, "a").to === "org-a@example.test", "plan: a confirmed-unpaid 4-day-old checkout gets one email to the owner");

  const cases = [
    [it({ id: "open", outcome: null }), {}, "not confirmed unpaid yet", "an OPEN intent (Cashfree not yet asked) is never emailed"],
    [it({ id: "set", outcome: "settled" }), {}, "settled", "a settled intent is never emailed"],
    [it({ id: "new", days: 0.5 }), {}, "too recent", "under 24 hours is too soon"],
    [it({ id: "old", days: 8 }), {}, "too old", "over 7 days is stale"],
    [it({ id: "paid" }), { paidOrders: new Set(["paid"]) }, "paid", "an order with a payment row is never emailed (money may have been taken)"],
    [it({ id: "later" }), { lastPaidAt: new Map([["org-later", NOW - 86_400_000]]) }, "paid later", "a workspace that paid after this checkout is not emailed"],
    [it({ id: "sub" }), { activeOrgs: new Set(["org-sub"]) }, "already subscribed", "a workspace on a live plan is not emailed"],
    [it({ id: "opt" }), { optedOut: new Set(["org-opt@example.test"]) }, "opted out", "an opted-out owner is not emailed"],
    [it({ id: "unc" }), { recipients: new Map([["org-unc", { email: "x@example.test", confirmed: false }]]) }, "owner email not confirmed", "an unconfirmed address is not emailed"],
    [it({ id: "none" }), { recipients: new Map() }, "no owner email", "no owner → nothing guessed"],
    [it({ id: "cool" }), { lastSentAt: new Map([["org-cool", NOW - 5 * 86_400_000]]) }, "emailed this workspace recently", "14-day frequency cap per workspace"],
    [it({ id: "done" }), { previous: new Map([["done", { status: "sent", attempts: 1 }]]) }, "already sent", "an order already emailed is never emailed again"],
    [it({ id: "unk" }), { previous: new Map([["unk", { status: "unknown", attempts: 1 }]]) }, "already unknown", "an UNKNOWN outcome is never retried (a duplicate is worse than none)"],
    [it({ id: "gave" }), { previous: new Map([["gave", { status: "failed", attempts: 3 }]]) }, "gave up after retries", "failed sends stop after 3 attempts"],
    [it({ id: "nop", kind: "refund" }), {}, "not a purchase", "only plan and credit purchases"],
  ];
  for (const [row, extra, reason, name] of cases) {
    const d = act(P.planFollowups(base([row], extra)), row.order_id);
    check(d.action === "skip" && d.reason === reason, `plan: ${name}`, JSON.stringify(d));
  }
  const r = act(P.planFollowups(base([it({ id: "retry" })], { previous: new Map([["retry", { status: "failed", attempts: 1 }]]) })), "retry");
  check(r.action === "retry", "plan: a failed send under the cap is retried");
  const two = P.planFollowups(base([it({ id: "x1", org: "o1", days: 3 }), it({ id: "x2", org: "o1", days: 5 })]));
  check(act(two, "x1").action === "send" && act(two, "x2").action === "skip", "plan: one email per workspace per run — the newest checkout");
  const many = P.planFollowups(base(Array.from({ length: 60 }, (_, i) => it({ id: "m" + i, days: 4 }))));
  check(many.filter((d) => d.action === "send").length === P.MAX_PER_RUN, "plan: capped per run");
  const pass1 = P.planFollowups({ ...base([it({ id: "p1" })]), recipients: undefined });
  check(act(pass1, "p1").action === "send" && act(pass1, "p1").to === null, "plan: pass 1 (no recipients) finds candidates without inventing an address");
  check(P.maskEmail("ravi@acme.in") === "r***@acme.in" && P.maskEmail("bad") === "—", "mask: a***@domain");
}

/* ---------------- 2. the copy ---------------- */
{
  const m = P.renderFollowup({ firstName: "Ravi", itemName: "Cortex Watch Pro", amount: 19999, cycle: "monthly", startedOn: "9 October", billingUrl: "https://c.test/billing", unsubscribeUrl: "https://c.test/api/unsub?e=x&t=y" });
  check(/not been charged/.test(m.body) && /payment was not completed/.test(m.body), "copy: states only what Cashfree confirmed");
  check(!/%|discount|offer|hurry|last chance|expires|today only|limited/i.test(m.subject + m.body), "copy: no discount, countdown or invented urgency");
  check(m.body.includes("https://c.test/billing") && m.body.includes("https://c.test/api/unsub?e=x&t=y"), "copy: one link to finish, one to unsubscribe");
  check(/only reminder/.test(m.body) && /reply/i.test(m.body), "copy: says it is the only reminder, and that a reply reaches a person");
  check(/₹19,999 a month/.test(m.body), "copy: the real amount and cycle");
}

/* ---------------- 3. /api/t ---------------- */
{
  const out = mkdtempSync(join(tmpdir(), "track-"));
  writeFileSync(join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: { outDir: out, module: "esnext", target: "es2022", moduleResolution: "bundler", skipLibCheck: true, noCheck: true, baseUrl: root, paths: { "@/*": ["src/*"] }, rootDir: join(root, "src") },
    files: [join(root, "src/app/api/t/route.ts")],
  }));
  try { execFileSync(join(root, "node_modules/.bin/tsc"), ["-p", join(out, "tsconfig.json")], { cwd: root, stdio: "pipe" }); } catch (e) { console.error(String(e.stdout || "").slice(0, 800)); }
  const walk = (d, acc = []) => { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? walk(p, acc) : (p.endsWith(".js") && acc.push(p)); } return acc; };
  const nextServer = pathToFileURL(join(root, "node_modules/next/server.js")).href;
  for (const p of walk(out)) {
    const up = relative(dirname(p), out) || ".";
    writeFileSync(p, readFileSync(p, "utf8").replace(/^import ["']server-only["'];?\s*$/m, "").replace(/from "next\/server"/g, `from "${nextServer}"`)
      .replace(/(from |import\()"@\/([a-zA-Z0-9_.\/-]+?)(\.ts)?"/g, (_, kw, m) => `${kw}"${up}/${m}.js"`));
  }
  mkdirSync(join(out, "lib"), { recursive: true });
  const real = read("src/lib/funnel.ts");
  const clientEvents = /CLIENT_EVENTS = (\[[^\]]+\])/.exec(real)[1];
  writeFileSync(join(out, "lib/funnel.js"), `export const CLIENT_EVENTS = ${clientEvents}; export async function record(e, o) { (globalThis.__rec ||= []).push({ e, o }); }`);
  writeFileSync(join(out, "lib/ratelimit.js"), `export const clientIp = () => "203.0.113.7"; export async function enforce(r) { (globalThis.__rl ||= []).push(...r); return globalThis.__over ? r[0] : null; }`);
  const T = await import(pathToFileURL(join(out, "app/api/t/route.js")).href);
  const post = (body, headers = {}) => T.POST(new Request("https://c.test/api/t", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));
  globalThis.__rec = [];
  let r = await post({ e: "pricing_view", p: "/pricing?email=a@b.c" });
  check(r.status === 204 && globalThis.__rec.length === 1 && globalThis.__rec[0].e === "pricing_view", "beacon: an allowed event is recorded");
  r = await post({ e: "payment_succeeded" });
  check(r.status === 400 && globalThis.__rec.length === 1, "beacon: a browser cannot report a payment (or any server-only event)");
  r = await post({ e: "landing_view" }, { "sec-gpc": "1" });
  check(r.status === 204 && r.headers.get("x-analytics") === "opted-out" && globalThis.__rec.length === 1, "beacon: Global Privacy Control → nothing recorded");
  r = await post({ e: "landing_view" }, { dnt: "1" });
  check(globalThis.__rec.length === 1, "beacon: Do Not Track → nothing recorded");
  r = await post({ e: "plan_selected", plan: "watchpro", cycle: "annual", email: "x@y.z", password: "p", note: "free text" });
  const last = globalThis.__rec[globalThis.__rec.length - 1];
  check(JSON.stringify(last.o.meta) === JSON.stringify({ plan: "watchpro", cycle: "annual" }), "beacon: meta is enumerated keys only — no email, password or free text", JSON.stringify(last.o.meta));
  r = await post({ e: "login_failed", reason: "bad_credentials" });
  check(globalThis.__rec[globalThis.__rec.length - 1].o.meta.reason === "bad_credentials", "beacon: login_failed carries a reason KIND");
  r = await post({ e: "plan_selected", plan: "<script>" });
  check(!("plan" in globalThis.__rec[globalThis.__rec.length - 1].o.meta), "beacon: a non-slug plan is dropped");
  r = await post("x".repeat(10), { "content-length": "5000" });
  check(r.status === 413, "beacon: oversize refused");
  r = await post("{bad");
  check(r.status === 400, "beacon: junk refused");
  const n = globalThis.__rec.length; globalThis.__over = true;
  r = await post({ e: "landing_view" }); globalThis.__over = false;
  check(r.status === 204 && globalThis.__rec.length === n, "beacon: over the per-IP limit → silently not counted");
  check((globalThis.__rl || []).every((x) => x.key === "t:ip:203.0.113.7" && x.limit === 120), "beacon: 120 per IP per hour");
}

/* ---------------- 4. wiring ---------------- */
{
  const F = read("src/lib/funnel.ts");
  for (const e of ["plan_selected", "login_succeeded", "login_failed", "onboarding_completed", "checkout_abandoned", "subscription_activated", "subscription_renewed", "subscription_cancelled", "feature_used", "api_key_created", "checkout_followup_sent"]) {
    check(new RegExp(`"${e}",`).test(F), `funnel: ${e} is in the fixed vocabulary`);
  }
  const settle = read("src/lib/pay/settle.ts");
  check(/if \(!alreadyGrantedAt\) \{\s*const continuing[\s\S]{0,200}"subscription_renewed" : "subscription_activated"/.test(settle), "wiring: activation/renewal recorded in the VERIFIED settle path, once per payment");
  check(/recordQuietly\("checkout_abandoned"/.test(read("src/lib/pay/reconcile.ts")) && /closeIntent\(svc, orderId, "abandoned"\);\s*\/\*[^*]*\*\/\s*const \{ recordQuietly \}/.test(read("src/lib/pay/reconcile.ts")), "wiring: abandonment recorded only after Cashfree confirmed unpaid");
  check(/cancelSubscription\(ref\);\s*if \(!res\.ok\) return[^\n]*\n[^\n]*\n\s*\{ const \{ recordQuietly \}[^\n]*"subscription_cancelled"/.test(read("src/app/api/pay/cashfree/subscription/route.ts")), "wiring: cancellation recorded only after Cashfree confirmed it");
  const cb = read("src/app/auth/callback/route.ts");
  check((cb.match(/await failed\(/g) || []).length === 4 && /await record\("login_succeeded"/.test(cb) && !/email/.test(cb.slice(cb.indexOf("const failed"), cb.indexOf("export async function"))), "wiring: callback records success and four failure kinds, never the address");
  check(/await record\("login_succeeded"/.test(read("src/app/api/workspace/bootstrap/route.ts")), "wiring: password / one-tap sign-ins counted server-side");
  check(/str\(fd\.get\("source"\)\) === "onboarding"/.test(read("src/lib/actions.ts")) && /fd\.set\("source", "onboarding"\)/.test(read("src/components/onboarding-wizard.tsx")), "wiring: onboarding completion counted after the save lands");
  check(/if \(r\.ok\) \{[\s\S]{0,200}"feature_used"/.test(read("src/lib/credits.ts")), "wiring: feature usage counted at the single AI choke point, mode name only");
  check(/<Track event="landing_view" \/>/.test(read("src/app/page.tsx")) && /<Track event="pricing_view" \/>/.test(read("src/app/pricing/page.tsx")) && /beacon\("plan_selected"/.test(read("src/components/pricing-client.tsx")), "wiring: landing, pricing and plan choice beacons");
  check(/globalPrivacyControl === true/.test(read("src/components/track.tsx")), "wiring: the browser's own opt-out is honoured before anything leaves the page");
  check(/Global Privacy Control or Do Not Track/.test(read("src/app/privacy/page.tsx")), "privacy policy says so");
}

/* ---------------- 5. runner + migration ---------------- */
{
  const R = read("src/lib/checkout-followup.ts");
  check(/CHECKOUT_FOLLOWUP_MODE[^\n]*=== "off"\) return "off"/.test(R) && /if \(error\) return "off"/.test(R), "runner: env kill switch, and an unmigrated database reads as off");
  check(/if \(mode !== "live"\) continue;/.test(R), "runner: dry run never sends or writes");
  check(/ignoreDuplicates: true/.test(R) && /\.eq\("status", "failed"\)\.eq\("attempts", prevAttempts\)/.test(R) && /data\.length === 1/.test(R), "runner: claim before send (insert-or-nothing; retry only a still-failed row)");
  check(R.indexOf("claimed = ") < R.indexOf("await sendEmail(to"), "runner: the claim comes before the send");
  check(/"List-Unsubscribe": `<\$\{unsubscribe\}>`/.test(R) && /List-Unsubscribe=One-Click/.test(R), "runner: one-click unsubscribe headers");
  check(/sent_to: maskEmail\(to\)/.test(R) && /to: maskEmail\(d\.to/.test(R), "runner: only masked addresses stored or shown");
  check(/res\.state === "unknown" \? "unknown"/.test(R), "runner: an uncertain send is recorded as unknown (never retried)");
  check(/\[TEST\]/.test(R) && !/checkout_followups[^\n]*insert/.test(R.slice(R.indexOf("export async function sendFollowupTest"))), "test send: synthetic data, operator only, nothing recorded");
  const E = read("src/lib/email.ts");
  check(/for \(const k of \["List-Unsubscribe", "List-Unsubscribe-Post"\] as const\)/.test(E) && /!\/\[\\r\\n\]\/\.test\(v\)/.test(E), "email: header pass-through is an allow-list and refuses CR/LF");
  const M = read("supabase/migrations/2026_zzzx_checkout_followup.sql");
  check(/order_id\s+text primary key/.test(M) && /default 'dry_run'/.test(M) && /check \(checkout_followup_mode in \('off', 'dry_run', 'live'\)\)/.test(M), "db: one row per order (dedupe), default dry_run, constrained mode");
  check(/enable row level security/.test(M) && /revoke all on checkout_followups from anon, authenticated/.test(M), "db: service-role only");
  check(!/drop table|drop column|truncate|delete from/i.test(M.replace(/\/\*[\s\S]*?\*\//g, "")), "db: additive");
  check(read("supabase/migrations/ORDER.txt").includes("2026_zzzx_checkout_followup.sql") && /"checkout_followups"/.test(read("src/lib/backup.ts")), "db: in ORDER.txt and the backup list");
  const cron = read("src/app/api/cron/reconcile/route.ts");
  check(cron.indexOf("reconcilePayments(") < cron.indexOf("runCheckoutFollowups(") && /forceMode: "dry_run"/.test(cron), "cron: runs after reconcile; ?dry=1 is always a dry run");
  const sa = read("src/lib/superadmin-actions.ts");
  check(/export async function setCheckoutFollowupMode[\s\S]{0,120}await assertSuper\(\)/.test(sa) && /export async function sendCheckoutFollowupTest[\s\S]{0,120}await assertSuper\(\)/.test(sa), "console: both controls are super-admin only");
  check(/confirm\("Go live/.test(read("src/components/followup-panel.tsx")), "console: going live asks for confirmation");
}

console.log(`\ncheckout-followup: ${pass} passed, ${failures.length} failed`);
for (const x of failures) console.log("  ✗ " + x);
process.exit(failures.length ? 1 : 0);
