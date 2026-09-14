/*
  THE FAILURES THAT REPORTED SUCCESS.

  supabase-js RETURNS `{ error }` for a rejected write rather than throwing, and
  sendEmail() RETURNS `{ sent: false, reason }` rather than throwing. Both facts
  are easy to know and easy to forget, and forgetting either produces the same
  bug shape: a handler runs to its end, reports ok, and nothing happened.

  This codebase has now been bitten by that shape at least six times — the cron
  heartbeat, the collections kill switch, the owner membership, two lead-capture
  routes, the memory supersede. Reading for it does not scale, so the specific
  places that were fixed are pinned here.

  WHAT THIS SUITE IS AND IS NOT. These are source-level assertions, not
  behavioural tests: the paths involved need a live Postgres and a live Resend
  to exercise, which a unit suite cannot have. So it asserts the STRUCTURE that
  makes the bug impossible — the error is bound to a name, the name is branched
  on, the success response is conditional. That is weaker than executing the
  path, and it is much stronger than nothing, which is what guarded these lines
  before.

  Every assertion strips comments first. This codebase documents the code it
  removes, quoting the broken expression verbatim, so a naive "no longer
  contains" grep would be permanently red for the most honest possible reason.

  Run: npm run test:silent-writes
*/
import { readFileSync } from "node:fs";
import { readCode, stripComments } from "./lib/read-code.mjs";

let pass = 0;
const fails = [];
const ok = (name, cond, extra = "") => cond ? pass++ : fails.push(`${name}${extra ? " — " + extra : ""}`);

/*
  Every file is read through readCode(), which strips only standalone comments
  and FAILS LOUDLY if stripping removed code the caller named as a landmark.

  That guard is not theoretical. The first version of this suite used a naive
  `/\/\*[\s\S]*?\*\//` replace, and components/ai-panel.tsx contains
  `accept="...,text/*,application/pdf"` — the `text/*` opened a comment that ran
  to the next close and deleted fifteen lines of real JSX. It happened to turn
  a positive assertion red. Had it been a NEGATIVE assertion, the subject would
  have been deleted and the test would have passed for ever. See
  scripts/lib/read-code.mjs.
*/
const read = (rel, ...landmarks) => readCode(import.meta.url, "../" + rel, landmarks);

/* The instrument, checked on a file whose prose is known. */
const workspace = read("src/lib/workspace.ts", "export async function ensureWorkspace", "claimInvites");
ok("comment stripping removes the prose", !workspace.includes("THE OWNER MEMBERSHIP IS THE WHOLE ACCOUNT"));
ok("comment stripping keeps a mid-expression /* intact",
  stripComments('const a = "text/*"; /* gone */ const b = 1;').includes('"text/*"'));
ok("comment stripping still removes a standalone block", !stripComments("  /* x */\nconst b = 1;").includes("x"));

/* ───────────────────── A1 · the owner membership ────────────────────────── */

/*
  The single highest-stakes one. Every RLS policy in the schema authorises
  through `memberships`, and `orgId` is resolved BY READING memberships — so a
  dropped insert means a user who owns a workspace they cannot read one row of,
  and who mints a fresh orphan org on every subsequent sign-in.
*/
ok("the membership insert no longer discards its result",
  !/await svc\.from\("memberships"\)\s*\.?\s*\n?\s*\.insert\(\{ org_id: orgId, user_id: user\.id, role: "owner" \}\);/.test(workspace),
  "found a bare awaited insert with no destructure");
ok("the membership insert binds its error", /const \{ data: memRow, error: memErr \}/.test(workspace));
ok("the membership row is read back with .select()",
  /\.insert\(\{ org_id: orgId, user_id: user\.id, role: "owner" \}\)\s*\n?\s*\.select\(/.test(workspace));
ok("an empty returned row is treated as failure too",
  /!\(\(memRow as any\[\]\) \|\| \[\]\)\.length/.test(workspace),
  "a write accepted and then filtered by policy returns no error AND no row");
ok("failure returns ok:false rather than falling through",
  /if \(memErr \|\| !\(\(memRow[\s\S]{0,600}?return \{ ok: false/.test(workspace));
ok("the orphan org is rolled back", /from\("organizations"\)\.delete\(\)\.eq\("id", orgId\)/.test(workspace));

/* Both callers must honour ok:false, or the fix is decorative. */
const bootstrap = read("src/app/api/workspace/bootstrap/route.ts", "ensureWorkspace");
ok("bootstrap withholds `next` when provisioning failed",
  /if \(!res\.ok\) return NextResponse\.json\(/.test(bootstrap));
ok("bootstrap computes `next` only after the ok check",
  bootstrap.indexOf("if (!res.ok)") < bootstrap.indexOf("res.created ? \"/onboarding\""));

const login = read("src/app/login/page.tsx", "afterAuthed");
ok("the login page reads ok, not just next", /j\.ok === false/.test(login));
ok("the login page stops instead of navigating on failure",
  /j\.ok === false\)[\s\S]{0,320}?return;/.test(login));

const callback = read("src/app/auth/callback/route.ts", "exchangeCodeForSession");
ok("the auth callback already honoured ok and still does", /if \(!res\?\.ok\)/.test(callback));

/* ───────────────────── A2 · lead capture ────────────────────────────────── */

for (const [label, rel] of [
  ["access-request", "src/app/api/access-request/route.ts"],
  ["inquiry", "src/app/api/inquiry/route.ts"],
]) {
  const src = read(rel, "NextResponse.json");
  ok(`${label}: the lead insert error is inspected`, /const \{ error(: e2)? \}/.test(src));
  ok(`${label}: whether it stored is recorded`, /let stored = false;/.test(src) && /stored = /.test(src));
  ok(`${label}: ok is conditional on actually capturing`,
    /const captured = adminRes\.sent \|\| stored;/.test(src));
  ok(`${label}: a total failure answers ok:false`,
    /if \(!captured\)[\s\S]{0,400}?ok: false/.test(src));
  ok(`${label}: no bare unconditional success remains`,
    !/return NextResponse\.json\(\{ ok: true, notified/.test(src),
    "found the old flat ok:true response");
  ok(`${label}: the send failure is logged for the operator`,
    /console\.error\("\[(access-request|inquiry)\] NOT captured/.test(src));
}

/*
  access-request was also DROPPING two of the six fields it collected: company
  and message went into the operator's email and never into the row, so the two
  that say who the lead is and what they want existed only as email prose.
*/
const accessReq = read("src/app/api/access-request/route.ts", "sendEmail(");
ok("access-request persists company", /company: company \|\| null/.test(accessReq));
ok("access-request persists the message", /note: message \|\| null/.test(accessReq));
ok("access-request retries with the core columns if the schema is older",
  /const \{ company: _c, note: _n, \.\.\.core \} = row/.test(accessReq));

/* The UI must not promise an email that did not send. */
const contact = read("src/components/contact-form.tsx");
ok("the contact form reads `confirmed`", /setConfirmed\(Boolean\(j\.confirmed\)\)/.test(contact));
ok("the contact form only promises a confirmation when one was sent",
  /confirmed\s*\n?\s*\?\s*<>\s*A confirmation is on its way/.test(contact));

const hc = read("src/components/health-check-client.tsx");
ok("the health check reads `confirmed`", /setReportSent\(Boolean\(j\?\.confirmed\)\)/.test(hc));
ok("the health check only promises the report when it sent",
  /reportSent \?/.test(hc));
ok("the health check has an honest fallback that keeps the score on screen",
  /did not go through/.test(hc));

/* ───────────────────── A3 · the AI health check ─────────────────────────── */

/*
  `critical: true` means this check drives the 503 an uptime monitor watches,
  which makes it the worst one to fake. It ended with a hardcoded "operational"
  reached whenever only OPENAI_API_KEY or ANTHROPIC_API_KEY is set — the exact
  `Boolean(process.env.X)` behaviour the module header says was removed.
*/
const health = read("src/lib/health.ts", "async function checkAI", "async function checkCron");
ok("checkAI no longer returns operational from key presence",
  !/status: "operational", detail: "provider configured"/.test(health),
  "found the hardcoded operational return");
ok("checkAI pings OpenAI", /ping\("https:\/\/api\.openai\.com\/v1\/models"/.test(health));
ok("checkAI pings Anthropic", /ping\("https:\/\/api\.anthropic\.com\/v1\/models"/.test(health));
ok("the Anthropic ping sends the required version header",
  /"anthropic-version": "2023-06-01"/.test(health));
ok("checkAI ends at down, not up",
  /status: "down",\s*\n?\s*detail: `no provider answered/.test(health),
  "the last return must be down, never a bare operational");
ok("both providers are reported when both were tried",
  /settled\.map\(\(x\) => `\$\{x\.label\}:/.test(health));

/*
  THE 504 THIS CAUSED IN PRODUCTION, pinned.

  Replacing checkAI's hardcoded `operational` with two real pings was correct
  and cost real time, and I made them sequential inside a function that can
  already spend MODEL_TIMEOUT in its Gemini loop. /api/health returned
  504 FUNCTION_INVOCATION_TIMEOUT after 31.1s and /status hung on "Checking…".
  Found with a browser; no source-level assertion would have noticed.
*/
ok("the AI probes run concurrently, not one after the other",
  /await Promise\.all\(aiProbes\)/.test(health),
  "two independent probes must not serialise inside a bounded route");
ok("no sequential awaited ping remains in the provider fallback",
  !/const r = await ping\("https:\/\/api\.openai\.com/.test(health));
ok("every check runs under a deadline", /async function bounded\(/.test(health));
/*
  The ping array is `aiProbes`, not `probes`, and that name is load-bearing:
  scripts/test-schema-probes.mjs locates checkSchema's probe list by slicing
  this file, and a second `const probes:` earlier in it stole the anchor —
  making that suite report all 30 hand-run tables as unprobed when nothing had
  changed. Both sides were fixed; this pins one of them.
*/
ok("checkAI's ping array does not shadow checkSchema's probe list",
  /const aiProbes:/.test(health) && !/const probes: Array<Promise</.test(health));
ok("the deadline is applied to all seven checks",
  (health.match(/bounded\("/g) || []).length >= 7,
  "one unbounded check can still outlast the route");
ok("a timed-out check is degraded, not down",
  /status: "degraded",\s*\n?\s*detail: `check did not finish/.test(health),
  "reporting an unmeasured critical dependency as down would drive a false 503");

const healthRoute = read("src/app/api/health/route.ts", "export async function GET");
const badgeRoute = read("src/app/api/badge/route.ts", "getHealth");
ok("/api/health has headroom above the model budget", /maxDuration = 60/.test(healthRoute));
ok("/api/badge shares it, since it calls the same getHealth", /maxDuration = 60/.test(badgeRoute));

/* ───────────────────── D1 · memory ──────────────────────────────────────── */

const memory = read("src/lib/memory.ts", "export async function supersedeMemory", "export async function ingestBusinessData");
ok("entity counts are no longer incremented unconditionally",
  !/upsertEntity\([^)]*\)\.catch\(\(\) => \{\}\); entities\+\+;/.test(memory),
  "found `.catch(); entities++` — the count would include failed writes");
ok("a customer entity counts only when written", /const cid = await upsertEntity[\s\S]{0,160}?if \(cid\) entities\+\+;/.test(memory));
ok("a person entity counts only when written", /const eid = await upsertEntity[\s\S]{0,160}?if \(eid\) entities\+\+;/.test(memory));

/*
  supersedeMemory is the correctness one rather than the billing one: if the
  old row is not retired it stays `status: "active"`, so recallContext() feeds
  both the stale fact and its correction into every AI call.
*/
ok("supersede inspects the retire error", /const \{ data: retired, error: retireErr \}/.test(memory));
ok("supersede returns null when the old fact could not be retired",
  /if \(retireErr \|\| !\(\(retired as any\[\]\) \|\| \[\]\)\.length\)[\s\S]{0,400}?return null;/.test(memory));
ok("supersede no longer swallows both updates in a bare catch",
  !/await svc\.from\("memories"\)\.update\(\{ status: "superseded" \}\)[\s\S]{0,200}?\} catch \{\}/.test(memory));

const console_ = read("src/components/memory-console.tsx", "async function pin", "async function archive");
ok("pin checks ok before mutating the list", /async function pin[\s\S]{0,400}?if \(!j\?\.ok\)/.test(console_));
ok("archive checks ok before removing the row", /async function archive[\s\S]{0,400}?if \(!j\?\.ok\)/.test(console_));
ok("a failed archive re-syncs from the server", /async function archive[\s\S]{0,600}?await reload\(\);/.test(console_));

const board = read("src/components/action-board.tsx", "async function persist");
ok("generated tasks that failed to save are counted", /const failed: string\[\] = \[\];/.test(board));
ok("unsaved generated tasks are removed from the board",
  /setTasks\(\(t\) => t\.filter\(\(x\) => !failed\.includes\(x\.id\)\)\)/.test(board));
ok("the user is told how many did not save", /couldn.t be saved/.test(board));

/* ───────────────────── E1 · dead code ──────────────────────────────────── */

const actions = read("src/lib/actions.ts", "export async function addTask");
for (const fn of ["connectIntegration", "disconnectIntegration", "syncIntegration"]) {
  ok(`${fn} is gone from actions.ts`, !new RegExp(`export async function ${fn}\\b`).test(actions));
}
/*
  Deleting them had to not lose what they did. syncIntegration was the only
  implementation that revalidated the pages a sync changes — without it the
  customer pulls rows in, is told it worked, and sees pre-sync numbers.
*/
const syncRoute = read("src/app/api/integrations/sync/route.ts", "syncProvider(orgId");
ok("the live sync route revalidates the pages a sync changes",
  /revalidatePath/.test(syncRoute)
  && ["/integrations", "/dashboard", "/sales", "/finance"].every((p) => syncRoute.includes(`"${p}"`)));
ok("the live sync route revalidates only on success", /if \(result\.ok\)/.test(syncRoute));
ok("the live sync route logs the sync to activity", /from\("activity"\)\.insert\(/.test(syncRoute));

for (const f of ["vendors", "costs", "negotiate", "risks", "hiring", "strategy", "marketing"]) {
  const p = read(`src/app/(app)/${f}/page.tsx`, "export const dynamic");
  ok(`${f}: the unread signedIn boolean is gone`, !/const signedIn = Boolean\(orgId\)/.test(p));
  ok(`${f}: no per-request auth call remains just to compute it`, !/await getUserAndOrg\(\)/.test(p));
}

/* ───────────────────── C1/C2 · claims the UI makes ─────────────────────── */

for (const [f, rel] of [
  ["sops", "src/app/(app)/sops/page.tsx"],
  ["proposals", "src/app/(app)/proposals/page.tsx"],
  ["marketing", "src/app/(app)/marketing/page.tsx"],
]) {
  const p = read(rel, "AIPanel");
  ok(`${f}: no longer tells the user to tap a non-interactive chip`,
    !/Tap (one|an idea)/.test(p), "found 'Tap one' copy");
  ok(`${f}: the ideas are passed to the panel as suggestions`, /suggestions=\{/.test(p));
}
const panel = read("src/components/ai-panel.tsx", "function useSuggestion", "aria-label={ariaLabel", "accept=\".txt");
ok("the panel renders suggestions as real buttons",
  /suggestions!\.map[\s\S]{0,300}?<button/.test(panel));
ok("a suggestion fills the field", /function useSuggestion[\s\S]{0,200}?setInput\(s\)/.test(panel));
ok("the panel finally applies the aria-label three pages were passing",
  /aria-label=\{ariaLabel \|\| placeholder\}/.test(panel));

const gst = read("src/app/(app)/gst/page.tsx", "export default function GST");
ok("/gst reads the statutory catalogue instead of its own array",
  /from "@\/lib\/statutory"/.test(gst));
ok("/gst reads the shared GST rates", /from "@\/lib\/gst-rates"/.test(gst));
ok("/gst no longer hardcodes a filing calendar",
  !/\{ form: "GSTR-3B", desc:/.test(gst), "found the inline calendar array");
ok("/gst no longer hardcodes rate slabs", !/const rates = \[/.test(gst));
ok("/gst shows the actual next date rather than a day-of-month string",
  /nextOccurrence\(/.test(gst));
ok("/gst states who each date applies to", /rule\.appliesIf/.test(gst));

const sitemap = read("src/app/sitemap.ts", "CALCULATOR_ROUTES");
ok("the calculators hub is in the sitemap", /entry\("\/calculators"/.test(sitemap));
const chrome = read("src/components/public-chrome.tsx", "PublicFooter");
ok("the public footer links the free tools", /\["Free calculators", "\/calculators"\]/.test(chrome));

/* ───────────── F · errors written for the operator, shown to the customer ── */

/*
  A DIFFERENT FAILURE-REPORTING BUG FROM THE ONES ABOVE, AND WORSE IN ONE WAY:
  this one was not silent. It spoke, at length, and told the customer to do
  something they cannot do.

  sendText() and sendTemplate() returned whatsappSetupHint() as their
  user-facing error, and that function names WHATSAPP_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID and SETUP.md — a server environment variable on our
  deployment, a second one, and a file in this repository. Meanwhile the
  module's own header says WhatsApp is bring-your-own-account per workspace and
  whatsappConfigFor() implements exactly that, so the action the customer
  should take (connect it on /integrations) was the one thing not mentioned.
*/
const wa = read("src/lib/whatsapp.ts", "export async function sendText", "whatsappConfigFor");

ok("the send paths no longer hand the operator hint to a customer",
  !/needsSetup: true, error: whatsappSetupHint\(\)/.test(wa),
  "a customer is being told to set a server env var");
ok("the send paths use the customer-facing hint", (wa.match(/whatsappCustomerHint\(\)/g) || []).length >= 2);
ok("the customer hint names the page they can actually use",
  /Integrations page/.test(wa) && /permanent access token/.test(wa));
ok("the customer hint mentions no environment variable",
  !/WHATSAPP_TOKEN[\s\S]{0,400}?Integrations page/.test(wa.slice(wa.indexOf("whatsappCustomerHint"))));
ok("the operator hint survives for /setup, which is super-admin only",
  /export function whatsappSetupHint/.test(wa) && /WHATSAPP_TOKEN/.test(wa));

const setupPage = read("src/app/(app)/setup/page.tsx", "hasWhatsApp");
ok("/setup still names the env vars, which is right for an operator page",
  /WHATSAPP_TOKEN \+ WHATSAPP_PHONE_NUMBER_ID/.test(setupPage));

/*
  verifyWhatsApp was written "for the integrations Test button", read the
  PLATFORM config, and had no callers — so it would have tested our shared
  account rather than the credentials being connected, if anything had called
  it at all.
*/
ok("verification takes an explicit credential pair", /export async function verifyWhatsAppCreds/.test(wa));
ok("the per-org verifier resolves through whatsappConfigFor",
  /export async function verifyWhatsApp\(orgId[\s\S]{0,200}?whatsappConfigFor\(orgId\)/.test(wa));
ok("no deprecated platform-only verifier was left behind", !/_legacyVerify/.test(wa));

const intRoute = read("src/app/api/integrations/route.ts", "async function testCredentials");
ok("whatsapp has a real test case now", /case "whatsapp":/.test(intRoute));
ok("it verifies the credentials it was handed, not stored ones",
  /verifyWhatsAppCreds\(\{[\s\S]{0,200}?c\.phone_number_id/.test(intRoute));

/* needsSetup was threaded through two layers and dropped by the client. */
const act = read("src/components/act-center.tsx", "async function send");
ok("act-center reads needsSetup", /setNeedsSetup\(Boolean\(j\.needsSetup\)\)/.test(act));
ok("a setup state is not rendered as a red error", /err && !needsSetup &&/.test(act));
ok("it offers the link that fixes it", /href="\/integrations"/.test(act));

/* ───────────── G · the rest of the unreachable UI ─────────────────────── */

const mobile = read("src/components/mobile-nav.tsx", "export function MobileNav");
for (const r of ["/superadmin", "/email", "/setup"]) {
  ok(`mobile nav can reach ${r}`, mobile.includes(`href: "${r}"`));
}
ok("the platform block is gated on superAdmin", /superAdmin && \(/.test(mobile));
const appLayout = read("src/app/(app)/layout.tsx", "MobileNav");
ok("the layout passes superAdmin to the mobile nav", /<MobileNav superAdmin=\{superAdmin\} \/>/.test(appLayout));

const csv = read("src/components/csv-import.tsx", "result.inserted");
ok("the import result finally renders the column ratio it returns",
  /result\.matched[\s\S]{0,200}?result\.totalCols/.test(csv));

/* ───────────── H · the defects the review of MY OWN code found ─────────── */

/*
  An adversarial pass over the previous two commits found five real faults in
  them. These pin the fixes. Two of the five were mine outright; two were
  long-standing and I am fixing them because I was in the file; one was a false
  justification I had written in a comment.
*/

/* The billing divergence. byo.ts waives AI credits from config.last_test_ok
   alone, and the Test op wrote only `status` — so a revoked key kept its
   waiver and ran free on the platform key. Long-standing, not new. */
/*
  SLICED FROM `if (op === "test")`, NOT FROM `op === "test"`.

  The first version anchored on the bare comparison — which appears earlier, in
  the rate-limit ternary (`const over = op === "test" ? …`) — so the slice
  still contained the CONNECT block, whose own `last_test_ok` satisfied the
  regex. The assertion passed while the test op wrote nothing, and a mutation
  removing it survived. Found by running that mutation.
*/
const testOp = intRoute.slice(intRoute.indexOf('if (op === "test")'));
ok("the test-op slice was located", intRoute.includes('if (op === "test")') && testOp.length > 200);
ok("the test-op slice excludes the connect block", !testOp.includes("credentials_encrypted: encrypted"));
ok("the test op persists last_test_ok, not just status",
  /last_test_ok: lastTestOk\(test\.ok, test\.verified\)/.test(testOp),
  "status and config.last_test_ok can still disagree");
ok("the test op merges config rather than replacing it",
  /\.\.\.\(\(\(cur as any\)\?\.config\) \|\| \{\}\)/.test(intRoute),
  "writing a bare object would destroy hint / phone_number_id");

/* An outage is not a rejection. This one was mine: I wrote verified:true in
   the catch, which stamped `error` onto credentials we never reached. */
ok("the catch no longer claims a call happened",
  !/catch \(e: any\) \{\s*\n?\s*return \{ ok: false, verified: true, message: e\?\.message \|\| "Could not reach the provider" \}/.test(intRoute));
ok("the catch reports unreachable", /unreachable: true/.test(intRoute));
ok("an unreachable result is not written to the row", /shouldPersistResult\(test\.unreachable\)/.test(intRoute));
ok("connect stores an unreachable provider via statusForAttempt",
  /statusForAttempt\(test\.ok, test\.verified, test\.unreachable\)/.test(intRoute));

/* The row-count check I applied in workspace.ts and skipped in memory.ts. */
ok("supersede reads the retired row back",
  /\.update\(\{ status: "superseded" \}\)[\s\S]{0,160}?\.select\("id"\)/.test(memory));
ok("supersede treats a zero-row update as failure",
  /!\(\(retired as any\[\]\) \|\| \[\]\)\.length/.test(memory));
ok("updateMemory treats a zero-row update as failure",
  /return \(\(data as any\[\]\) \|\| \[\]\)\.length > 0;/.test(memory),
  "archive would report success while the memory stayed active");

/* The tenth instance of the bug the previous commit was named after — which
   that same commit introduced. */
ok("the sync activity insert binds its error", /const \{ error: actErr \}/.test(syncRoute));
ok("it no longer wraps a non-throwing call in try/catch",
  !/try \{\s*\n?\s*const pulled[\s\S]{0,300}?\} catch \{ \/\* the log is not the deliverable/.test(syncRoute));

/* A funnel event that made failure look like success. */
ok("workspace_created is recorded after the membership check, not before",
  workspace.indexOf("recordQuietly(\"workspace_created\"") > workspace.indexOf("const { data: memRow, error: memErr }"),
  "a rolled-back signup would still count as a conversion");

/* A comment of mine that was simply false. */
const syncRaw = readCode(import.meta.url, "../src/app/api/integrations/sync/route.ts", ["syncProvider(orgId"]);
ok("the revalidate justification no longer claims it fixes stale numbers",
  !/sees the numbers from before the sync/.test(
    readFileSync(new URL("../src/app/api/integrations/sync/route.ts", import.meta.url), "utf8"),
  ),
  "all four targets are force-dynamic, so there is no route cache to bust");

/* And sync must not re-mint a verified badge it did not earn. */
const syncLib = read("src/lib/sync/index.ts", "export async function syncProvider");
ok("a successful pull does not promote an unverified row to connected",
  !/\.update\(\{ status: "connected", last_sync/.test(syncLib));
ok("it preserves a prior verification and clears a stale error",
  /prior === "connected" \? "connected" : "saved"/.test(syncLib));

/* ────────────────────────────────────────────────────── report ─────────── */

console.log(`\nsilent writes: ${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log("  ✗ " + f);
  process.exit(1);
}
console.log("✓ all green");

/*
  MUTATION LOG — each mutation was applied to the real source, this suite was
  run, and the file was restored. All twelve were caught.

    N1  the membership insert's error left unbound          caught
    N2  the `.select()` read-back removed                   caught
    N3  the orphan-org rollback turned into a select        caught
    N4  `captured` hardcoded to true in access-request      caught
    N5  the OpenAI ping pointed elsewhere                   caught
    N6  the mandatory anthropic-version header dropped      caught
    N7  `if (cid) entities++` → `entities++`                caught
    N8  supersede's retire-error branch disabled            caught
    N9  archive's `ok` check disabled                       caught
    N10 the sync route's revalidation disabled              caught
    N11 the aria-label removed from the field again          caught
    N12 /gst stops computing the next occurrence            caught

  Separately, readCode()'s landmark guard was checked by asking for a landmark
  that does not exist: it throws, rather than returning a stripped file that
  would make the next assertion vacuous. It also fired for real during
  development, catching a landmark this suite had applied to the wrong file.

  WHAT THIS SUITE CANNOT DO. It reads source, so it cannot prove the runtime
  behaviour — that a real Postgres rejection is actually branched on, or that
  Resend's failure shape is what sendEmail reports. Those need an integration
  environment the repo does not have. The honest summary is: these assertions
  make the FIX hard to remove, not the BUG impossible to reintroduce somewhere
  new. For the new places, the rule is the one at the top of this file —
  supabase-js returns, it does not throw.
*/
