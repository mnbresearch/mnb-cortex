#!/usr/bin/env node
/*
  AI CREDIT FIXES — the P0s from the AI/credits audit, each held in place.

    F1  runCortex's own failure text ("I couldn't reach the AI engine…", or the
        no-key setup hint) is never billed, saved or returned as an answer by a
        paid caller. isEngineFailure() is the one test, and every billed caller
        asks it.
    F2  Rebuilding the memory profile never overwrites the profile with a
        failure, and a workspace with no memories is not charged for the
        placeholder.
    F3  /chat "Remember this" says Remembered only when the server said ok.
    F4  No invented facts in the mode prompts ("cash runway ~5 months", "the
        rival's recent 8% price cut", "RM-204 single-source risk").
    F5  The public visibility teaser never shows (or emails) a score no engine
        measured; it reads sendEmail's result; it caps its inputs; it offers no
        trial that does not exist.
    F6  A Practice-pooled charge is refunded to the FIRM that paid — through
        the charge result, and when only the session is known.
    F7  A firm-pooled client is entitled by the FIRM's status and balance, not
        its own expired starter row.
    F8  Only a missing charge_credits function runs unmetered; any other RPC
        error, an unreadable org row, or a throw, refuses the action.
    F9  (scripts/test-media.mjs) an unrecorded video job is refunded.
    F10 Memory, profile and agent-design writes require analyst rank.

  F6–F8 are EXECUTED: credits.ts runs against an in-memory organizations table
  and a fake charge_credits / grant_credits. The rest are static checks over
  source with comments removed, so prose describing a fix cannot pass for it.

  Run: node --experimental-strip-types --no-warnings scripts/test-ai-credit-fixes.mjs
*/
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

let pass = 0; const failures = [];
const check = (cond, name, detail = "") => { if (cond) pass++; else failures.push(`${name}${detail ? `\n      ${detail}` : ""}`); };
const read = (p) => readFileSync(p, "utf8");
/* Block comments and whole-line // comments out; code and strings stay. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const between = (s, a, b) => { const i = s.indexOf(a); if (i < 0) return ""; const j = b ? s.indexOf(b, i + a.length) : -1; return s.slice(i, j < 0 ? undefined : j); };

/* ═══════════════════ F6 / F7 / F8 — credits.ts, executed ═══════════════════ */
const dir = mkdtempSync(join(tmpdir(), "aicredit-"));
const abs = (p) => pathToFileURL(resolve(p)).href;
const creditsSrc = read("src/lib/credits.ts")
  .replace(/^import ["']server-only["'];?\s*$/m, "")
  .replace(/^import \{ createClient, serviceClient \} from .*$/m, "const serviceClient = () => globalThis.__svc; const createClient = async () => globalThis.__svc;")
  .replace(/^import \{ getUserAndOrg \} from .*$/m, "const getUserAndOrg = async () => globalThis.__session;")
  .replace(/^import \{ isSuperAdmin \} from .*$/m, "const isSuperAdmin = async () => false;")
  .replace(/^import \{ PLAN_CREDITS, creditCost, IMAGE_WEEKLY, VIDEO_WEEKLY, TRIAL_CREDITS(?:, PLANS)? \} from .*$/m,
    "const PLAN_CREDITS = { starter: 300, practice: 27750 }; const creditCost = (m) => (m === 'deepdive' ? 24 : 10); const IMAGE_WEEKLY = {}; const VIDEO_WEEKLY = {}; const TRIAL_CREDITS = 150; const PLANS = [];")
  .replace(/from "@\/lib\/entitlement";/g, `from ${JSON.stringify(abs("src/lib/entitlement.ts"))};`)
  .replace(/from "@\/lib\/credit-pool";/g, `from ${JSON.stringify(abs("src/lib/credit-pool.ts"))};`)
  .replace(/await import\("@\/lib\/ai\/byo"\)/g, "({ loadOrgAiKeys: async () => ({ own: false }), enterOrgAiKeys: () => {} })")
  .replace(/await import\("@\/lib\/ai\/dlp-server"\)/g, "({ enterDlp: () => {} })")
  .replace(/await import\("@\/lib\/funnel"\)/g, "({ recordQuietly: () => {} })");
writeFileSync(join(dir, "credits.ts"), creditsSrc);
const C = await import(pathToFileURL(join(dir, "credits.ts")).href);

/* An in-memory organizations table plus the three RPCs credits.ts calls. */
function fakeDb(orgs, opts = {}) {
  const calls = { charge: [], grant: [], sync: [] };
  const svc = {
    from(table) {
      const st = { filters: [] };
      const q = {
        select() { return q; },
        eq(k, v) { st.filters.push([k, v]); return q; },
        single() {
          if (opts.orgReadError) return Promise.resolve({ data: null, error: opts.orgReadError });
          const row = table === "organizations" ? orgs.find((o) => st.filters.every(([k, v]) => o[k] === v)) : null;
          return Promise.resolve(row ? { data: { ...row }, error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } });
        },
      };
      return q;
    },
    async rpc(name, args) {
      if (name === "charge_credits") {
        calls.charge.push(args);
        if (opts.chargeThrows) throw new Error("socket hang up");
        if (opts.chargeError) return { data: null, error: opts.chargeError };
        const o = orgs.find((x) => x.id === args.p_org);
        if (!o || o.credits < args.p_amount) return { data: -1, error: null };
        o.credits -= args.p_amount;
        return { data: o.credits, error: null };
      }
      if (name === "grant_credits") {
        calls.grant.push(args);
        const o = orgs.find((x) => x.id === args.p_org); if (o) o.credits += args.p_amount;
        return { data: o ? o.credits : 0, error: null };
      }
      if (name === "sync_allowance") { calls.sync.push(args); return { data: null, error: null }; }
      return { data: null, error: { code: "PGRST202", message: "unknown rpc" } };
    },
  };
  return { svc, calls };
}
const FIRM = "f0000000-0000-4000-8000-000000000001";
const CLIENT = "c0000000-0000-4000-8000-000000000002";
const pooledOrgs = () => [
  { id: FIRM, plan: "practice", subscription_status: "active", credits: 5000 },
  /* The typical firm-provisioned client: starter, expired, no credits of its own. */
  { id: CLIENT, plan: "starter", subscription_status: "expired", credits: 0, practice_org_id: FIRM },
];

{
  /* F7 — the client is entitled by the firm, and the firm is debited. */
  const orgs = pooledOrgs(); const db = fakeDb(orgs); globalThis.__svc = db.svc;
  const r = await C.chargeOrgForMode(CLIENT, "strategy", { userId: "u1" });
  check(r.ok === true && r.enforced === true, "F7: a pooled client on an expired starter row is NOT refused while the firm pays", JSON.stringify(r));
  check(db.calls.charge.length === 1 && db.calls.charge[0].p_org === FIRM, "F7: the firm's balance is the one debited", JSON.stringify(db.calls.charge));
  check(r.payerOrgId === FIRM && r.pooledFor === CLIENT, "F6: the charge result names the payer", JSON.stringify(r));

  /* F6 — the refund goes back to the firm, through the gate. */
  globalThis.__session = { user: { id: "u1" }, orgId: CLIENT };
  await C.refundIfCharged(r, "strategy");
  check(db.calls.grant.length === 1 && db.calls.grant[0].p_org === FIRM, "F6: refundIfCharged refunds the firm that paid, not the session's workspace", JSON.stringify(db.calls.grant));
  check(/:client:/.test(String(db.calls.grant[0]?.p_reason)), "F6: the firm's ledger can see which client the refund was for", String(db.calls.grant[0]?.p_reason));
  check(orgs[0].credits === 5000 && orgs[1].credits === 0, "F6: balances end where they started", JSON.stringify(orgs.map((o) => o.credits)));
  await C.refundIfCharged(r, "strategy");
  check(db.calls.grant.length === 1, "F6: and never twice");
}
{
  /* F6 — a refund with no gate in hand (older call sites) resolves the payer the same way. */
  const orgs = pooledOrgs(); const db = fakeDb(orgs); globalThis.__svc = db.svc;
  globalThis.__session = { user: { id: "u1" }, orgId: CLIENT };
  await C.refundForMode("deepdive");
  check(db.calls.grant.length === 1 && db.calls.grant[0].p_org === FIRM && db.calls.grant[0].p_amount === 24, "F6: refundForMode(mode) without a gate still refunds the paying firm", JSON.stringify(db.calls.grant));
}
{
  /* A lapsed firm pays for nobody: the client stands alone again, and is refused as before. */
  const orgs = pooledOrgs(); orgs[0].subscription_status = "expired"; const db = fakeDb(orgs); globalThis.__svc = db.svc;
  const r = await C.chargeOrgForMode(CLIENT, "strategy", {});
  check(r.ok === false && r.reason === "lapsed" && db.calls.charge.length === 0, "F7: a lapsed firm does not fund its client (refused, nothing debited)", JSON.stringify(r));
}
{
  /* A workspace that is not pooled behaves exactly as before. */
  const orgs = [{ id: CLIENT, plan: "starter", subscription_status: "active", credits: 50 }]; const db = fakeDb(orgs); globalThis.__svc = db.svc;
  const r = await C.chargeOrgForMode(CLIENT, "strategy", {});
  check(r.ok && r.payerOrgId === CLIENT && db.calls.charge[0]?.p_org === CLIENT && orgs[0].credits === 40, "F6/F7: an unpooled workspace pays for itself, unchanged", JSON.stringify(r));
}
{
  /* F8 — only a missing function runs unmetered. */
  const solo = () => [{ id: CLIENT, plan: "starter", subscription_status: "active", credits: 50 }];
  let db = fakeDb(solo(), { chargeError: { code: "57014", message: "canceling statement due to statement timeout" } }); globalThis.__svc = db.svc;
  let r = await C.chargeOrgForMode(CLIENT, "strategy", {});
  check(r.ok === false && r.reason === "unavailable", "F8: a charge_credits timeout refuses the action instead of running it free", JSON.stringify(r));
  db = fakeDb(solo(), { chargeError: { code: "42501", message: "permission denied for function charge_credits" } }); globalThis.__svc = db.svc;
  r = await C.chargeOrgForMode(CLIENT, "strategy", {});
  check(r.ok === false && r.reason === "unavailable", "F8: a permissions error refuses too", JSON.stringify(r));
  db = fakeDb(solo(), { chargeError: { code: "PGRST202", message: "Could not find the function public.charge_credits" } }); globalThis.__svc = db.svc;
  r = await C.chargeOrgForMode(CLIENT, "strategy", {});
  check(r.ok === true && r.enforced === false, "F8: a charge_credits that does not exist yet (pre-migration) still allows, unmetered", JSON.stringify(r));
  db = fakeDb(solo(), { chargeError: { code: "42883", message: "function charge_credits(uuid, integer) does not exist" } }); globalThis.__svc = db.svc;
  r = await C.chargeOrgForMode(CLIENT, "strategy", {});
  check(r.ok === true && r.enforced === false, "F8: Postgres undefined_function (42883) is the same missing migration");
  db = fakeDb(solo(), { orgReadError: { code: "08006", message: "connection failure" } }); globalThis.__svc = db.svc;
  r = await C.chargeOrgForMode(CLIENT, "strategy", {});
  check(r.ok === false && r.reason === "unavailable" && db.calls.charge.length === 0, "F8: an unreadable org row refuses instead of allowing free AI", JSON.stringify(r));
  db = fakeDb(solo(), { chargeThrows: true }); globalThis.__svc = db.svc;
  r = await C.chargeOrgForMode(CLIENT, "strategy", {});
  check(r.ok === false && r.reason === "unavailable", "F8: a throw inside the charge refuses instead of allowing free AI", JSON.stringify(r));
  check(C.isMissingFunction({ code: "PGRST202" }) && C.isMissingFunction({ code: "42883" }) && !C.isMissingFunction({ code: "57014", message: "timeout" }), "F8: isMissingFunction recognises only the missing-function codes");
}

/* ═══════════════════ F1 — isEngineFailure, executed ═══════════════════ */
const cortex = read("src/lib/ai/cortex.ts");
{
  const constU = cortex.match(/export const ENGINE_UNREACHABLE = (".*?");/);
  const constN = cortex.match(/export const ENGINE_NOT_CONFIGURED = (".*?");/);
  const fn = cortex.match(/export function isEngineFailure\([\s\S]*?\n\}/);
  check(Boolean(constU && constN && fn), "F1: cortex.ts exports ENGINE_UNREACHABLE, ENGINE_NOT_CONFIGURED and isEngineFailure()");
  if (constU && constN && fn) {
    const js = `const ENGINE_UNREACHABLE = ${constU[1]}; const ENGINE_NOT_CONFIGURED = ${constN[1]};\n` +
      fn[0].replace(/^export /, "").replace(/\(text: string \| null \| undefined\): boolean/, "(text)") + "\nexport { isEngineFailure, ENGINE_UNREACHABLE, ENGINE_NOT_CONFIGURED };";
    writeFileSync(join(dir, "engine.mjs"), js);
    const E = await import(pathToFileURL(join(dir, "engine.mjs")).href);
    check(E.isEngineFailure(`${E.ENGINE_UNREACHABLE} The AI provider is rate-limiting us right now.\n\nYour data is safe`), "F1: the no-provider-answered text is a failure");
    check(E.isEngineFailure(`${E.ENGINE_NOT_CONFIGURED}, so I can't analyse your business.**`), "F1: the no-key setup hint is a failure");
    check(!E.isEngineFailure("## Executive summary\nRevenue grew 4%.") && !E.isEngineFailure("") && !E.isEngineFailure(null), "F1: a real answer (or nothing) is not mistaken for one");
  }
  /* The two strings runCortex actually returns start with those constants. */
  check(/return `\$\{ENGINE_UNREACHABLE\} \$\{describeFailure\(lastFailure\)\}/.test(cortex), "F1: runCortex's failure answer starts with ENGINE_UNREACHABLE");
  check(/return `\$\{ENGINE_NOT_CONFIGURED\}, so I can't analyse your business\.\*\*/.test(cortex), "F1: the no-key hint starts with ENGINE_NOT_CONFIGURED");
}

/* ═══════════════════ F1 — every billed caller asks it ═══════════════════ */
{
  const ai = code("src/app/api/ai/route.ts");
  const branch = between(ai, "if (isEngineFailure(text))", "return NextResponse.json({ ok: true");
  check(/await refundIfCharged\(gate, m\);[\s\S]*ok: false/.test(branch) && ai.indexOf("isEngineFailure(text)") < ai.indexOf("ok: true, text"), "F1: /api/ai refunds and answers ok:false on an engine failure, before the success path");

  const run = code("src/app/api/agents/run/route.ts");
  const reasoning = run.slice(run.indexOf("const output = await runReasoning(prompt);"));
  check(/if \(isEngineFailure\(output\)\) \{\s*await refundIfCharged\(gate, "document"\);\s*return NextResponse\.json\(\{ ok: false/.test(reasoning)
    && reasoning.indexOf("isEngineFailure(output)") < reasoning.indexOf("saveRun("), "F1: /api/agents/run refunds an engine failure and does not save it as a run");

  const gbp = code("src/app/api/gbp/route.ts");
  check(/if \(isEngineFailure\(text\)\) \{\s*await refundIfCharged\(gate, "gbp"\);\s*return NextResponse\.json\(\{ ok: false/.test(gbp) && gbp.indexOf("isEngineFailure(text)") < gbp.indexOf("ok: true, text"), "F1: /api/gbp refunds an engine failure");

  const wf = code("src/app/api/workforce/audit/route.ts");
  check(/if \(!String\(plan \|\| ""\)\.trim\(\) \|\| isEngineFailure\(plan\)\) \{\s*await refundIfCharged\(gate, "report"\)/.test(wf), "F1: /api/workforce/audit refunds an engine failure");

  const dd = between(code("src/lib/ai/cortex.ts"), "export async function runDeepDive", null);
  const passChecks = (dd.match(/if \(isEngineFailure\((diagnosis|options|plan)\) \|\| !\1\.trim\(\)\) return \[\];/g) || []).length;
  check(passChecks === 3, "F1: every Deep Dive pass stops the chain on an engine failure (all three or nothing)", `found ${passChecks}`);
  check((dd.match(/\{ deadlineAt \}\)/g) || []).length === 3 && (dd.match(/if \(!timeLeft\(\)\) return \[\];/g) || []).length === 3, "F18: each pass shares the route's deadline and is not started without time for it");
  const ddr = code("src/app/api/ai/deepdive/route.ts");
  check(/runDeepDive\(f, q, full, \{ deadlineAt \}\)/.test(ddr) && /sections\.length < 3\) \{\s*await refundIfCharged\(gate, "deepdive"\)/.test(ddr), "F1: the Deep Dive route refunds anything short of three sections, to whoever paid");

  const imp = code("src/lib/ai/improve-prompt.ts");
  check(/if \(isEngineFailure\(out\)\) return "";/.test(imp) && imp.indexOf("isEngineFailure(out)") < imp.indexOf("return cleanImprovedBrief(out, raw);"), "F1: improve-prompt never returns the failure text as an improved brief");

  const stream = between(code("src/lib/ai/cortex.ts"), "export async function streamCortex", "export async function generateReport");
  check((stream.match(/if \(isEngineFailure\(full\)\) \{ try \{ await hooks\.onEngineFailure\?\.\(\)/g) || []).length === 2, "F1: chat streaming refunds on an engine failure on both runCortex paths (incl. the no-key hint)");

  const mem = code("src/lib/memory.ts");
  check(/if \(isEngineFailure\(out\)\) return \{ count: 0, items: \[\], engineFailed: true \};/.test(mem), "F1: memory extraction treats an engine failure as no extraction");
  check(/if \(isEngineFailure\(out\)\) return \[\];/.test(between(mem, "export async function clusterThemes", null)), "F1: theme clustering treats an engine failure as no themes");
}

/* ═══════════════════ F2 — the memory profile ═══════════════════ */
{
  const mem = code("src/lib/memory.ts");
  const regen = between(mem, "export async function regenerateProfile", "export async function getProfile");
  const guard = regen.indexOf("if (!md || !md.trim() || isEngineFailure(md)) return null;");
  const upsert = regen.lastIndexOf('from("memory_profile").upsert');
  check(guard > 0 && upsert > guard, "F2: regenerateProfile returns before the upsert when the model failed — the profile is never overwritten with failure text");
  const route = code("src/app/api/memory/profile/route.ts");
  const post = route.slice(route.indexOf("export async function POST"));
  check(/const existing = await listMemories\(orgId, \{ limit: 1 \}\)/.test(post) && post.indexOf("listMemories(") < post.indexOf("chargeForMode("), "F2: no memories → no charge (checked before chargeForMode)");
  check(/if \(!md\) \{\s*await refundIfCharged\(gate, "strategy"\)/.test(post), "F2: a failed rebuild is refunded");
}

/* ═══════════════════ F3 — "Remember this" ═══════════════════ */
{
  const page = code("src/app/(app)/chat/page.tsx");
  const fn = between(page, "async function remember(", "const started = useRef(false);");
  check(fn.length > 0 && !/\.catch\(\(\) => \{\}\)/.test(fn), "F3: the memory request's response is not swallowed");
  const okAt = fn.indexOf("if (r.ok && j?.ok) {"); const setAt = fn.indexOf("setSaved((s) => ({ ...s, [i]: true }))");
  check(okAt > 0 && setAt > okAt && fn.lastIndexOf("setSaved((s) => ({ ...s, [i]: true }))") === setAt, "F3: Remembered is set only inside the ok branch, after the response");
  check(/String\(j\?\.error \|\|/.test(fn) && /\{saveState\[i\]\}/.test(page), "F3: a refused save shows the server's own message");
  const api = code("src/app/api/memory/route.ts");
  const post = between(api, "export async function POST", "export async function PATCH");
  check(/if \(!\(await canWriteMemory\(orgId\)\)\) return NextResponse\.json\(\{ ok: false, upgrade: true, error: await memoryUpgradeMessage\(\) \}/.test(post), "F3: /api/memory says why a plan without memory is refused");
}

/* ═══════════════════ F4 — no invented facts in the prompts ═══════════════════ */
{
  const c = code("src/lib/ai/cortex.ts");
  for (const [needle, what] of [[/runway ~5 months/i, "cash runway ~5 months"], [/8% price cut/i, "the rival's recent 8% price cut"], [/RM-204/, "RM-204 single-source risk"], [/the recent competitor price cut/i, "the recent competitor price cut"]]) {
    check(!needle.test(c), `F4: the mode prompts no longer assert "${what}" as the customer's fact`);
  }
}

/* ═══════════════════ F5 — the public visibility teaser ═══════════════════ */
{
  const pub = code("src/app/api/visibility/public/route.ts");
  const noEngineAt = pub.indexOf('const noEngine = report.engine === "none";');
  const refuseAt = pub.indexOf("if (noEngine) {\n      return NextResponse.json({\n        ok: false,");
  const okAt = pub.indexOf("ok: true,\n      brand,");
  check(noEngineAt > 0 && refuseAt > noEngineAt && okAt > refuseAt, "F5: no engine → 'could not run', never a 0 score (guard before the ok:true response)");
  check(/const scoreLine = noEngine\s*\?/.test(pub) && /\$\{scoreLine\}/.test(pub) && !/AI Visibility score: \$\{report\.score\}\/100 \(\$\{shown\}\/\$\{report\.results\.length\} answers\)\nEngine/.test(pub), "F5: the operator email does not carry an unmeasured score");
  check(/notified = Boolean\(sent\?\.sent\);/.test(pub) && !/;\s*notified = true;/.test(pub), "F5: 'notified' comes from sendEmail's result, not from not-throwing");
  check(!/start a trial/i.test(pub), "F5: no 'start a trial' offer (TRIAL_DAYS is 0)");
  for (const f of ["name", "brand", "category", "location"]) {
    check(new RegExp(`const ${f} = String\\(b\\.${f} \\|\\| ""\\)\\.trim\\(\\)\\.slice\\(0, MAX_FIELD\\);`).test(pub), `F5: ${f} is capped server-side`);
  }
  check(/const MAX_FIELD = 120;/.test(pub), "F5: the cap is ~120 characters");
}

/* ═══════════════════ F10 — writes need analyst rank ═══════════════════ */
{
  const rank = (file, startMarker, writeMarkers, label) => {
    const src = code(file);
    const body = startMarker ? between(src, startMarker, "\nexport async function") : src;
    const at = body.indexOf('hasRole("analyst")');
    const firstWrite = Math.min(...writeMarkers.map((m) => { const i = body.indexOf(m); return i < 0 ? Infinity : i; }));
    check(at > 0 && at < firstWrite, `F10: ${label} checks analyst rank before writing or charging`, `rank@${at} write@${firstWrite}`);
  };
  rank("src/app/api/memory/route.ts", "export async function POST", ["remember("], "POST /api/memory");
  rank("src/app/api/memory/route.ts", "export async function PATCH", ["setPinned(", "archiveMemory(", "supersedeMemory(", "updateMemory("], "PATCH /api/memory");
  rank("src/app/api/memory/extract/route.ts", "export async function POST", ["chargeForMode(", "extractMemories("], "/api/memory/extract");
  rank("src/app/api/memory/ingest/route.ts", "export async function POST", ["chargeForMode(", "ingestBusinessData("], "/api/memory/ingest");
  rank("src/app/api/memory/profile/route.ts", "export async function POST", ["chargeForMode(", "regenerateProfile("], "POST /api/memory/profile");
  rank("src/app/api/agents/build/route.ts", "export async function POST", ["chargeForMode(", "buildAgentsForBusiness("], "/api/agents/build");
}

console.log(`\nai credit fixes: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log("  ✗ " + f);
process.exit(failures.length ? 1 : 0);
