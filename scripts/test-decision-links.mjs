/*
  ONE-TAP DECISIONS FROM EMAIL, EXECUTED.

  A decision link is an authorisation, so what is asserted here is what it
  must NOT allow:

    1. A token for proposal A cannot decide proposal B (payload is signed).
    2. A token minted with one key is refused under another.
    3. An expired token is refused, even if signed correctly.
    4. Without a signing key, no token is ever minted (the digest says so).
    5. The page that RENDERS a token never decides; only the POST action does,
       and the action re-verifies the token and is rate-limited.
    6. The digest claims before sending and releases on every failed exit,
       and never sends without an owner contact.

  1–4 are executed against the real module (copied with the server-only
  marker stripped, as the other suites do). 5–6 are structural reads of the
  one file each lives in.

  Run: node scripts/test-decision-links.mjs
*/
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

let pass = 0; const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? `\n      ${d}` : ""}`));

process.env.LINK_SIGNING_SECRET = "test-secret-A";
const dir = mkdtempSync(join(tmpdir(), "decide-"));
const src = readFileSync("src/lib/engine/decision-links.ts", "utf8").replace(/^import ["']server-only["'];?\s*$/m, "");
writeFileSync(join(dir, "decision-links.ts"), src);
const L = await import(pathToFileURL(join(dir, "decision-links.ts")).href);

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ORG = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";
const future = new Date(Date.now() + 86_400_000).toISOString();

const t = L.signDecision({ p: A, o: ORG, u: USER, expiresAt: future });
check(typeof t === "string" && t.includes("."), "a token is minted with a key present");
const v = L.verifyDecision(t);
check(v && v.p === A && v.o === ORG && v.u === USER, "round-trip returns the same proposal, org and recipient");

/* 1. Swap the proposal id inside the payload, keep the signature. */
{
  const [body, sig] = t.split(".");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  payload.p = B;
  const forged = Buffer.from(JSON.stringify(payload)).toString("base64url") + "." + sig;
  check(L.verifyDecision(forged) === null, "a token re-pointed at another proposal is refused");
  payload.p = A; payload.u = B;
  const forged2 = Buffer.from(JSON.stringify(payload)).toString("base64url") + "." + sig;
  check(L.verifyDecision(forged2) === null, "a token re-pointed at another recipient is refused");
  check(L.verifyDecision(body + "." + sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A")) === null, "one flipped signature character is refused");
  check(L.verifyDecision(body) === null && L.verifyDecision("") === null && L.verifyDecision("x".repeat(700)) === null, "malformed tokens are refused");
}

/* 2. Different key. */
{
  process.env.LINK_SIGNING_SECRET = "test-secret-B";
  check(L.verifyDecision(t) === null, "a token minted under another key is refused");
  process.env.LINK_SIGNING_SECRET = "test-secret-A";
  check(L.verifyDecision(t) !== null, "…and accepted again under its own key");
}

/* 3. Expiry. */
{
  const soon = new Date(Date.now() + 2_000).toISOString();
  const short = L.signDecision({ p: A, o: ORG, u: USER, expiresAt: soon });
  check(short && L.verifyDecision(short) !== null, "a token is valid before its expiry");
  check(L.verifyDecision(short, Date.now() + 5_000) === null, "…and refused after it");
  check(L.signDecision({ p: A, o: ORG, u: USER, expiresAt: new Date(Date.now() - 1000).toISOString() }) === null, "a token is never minted for an already-expired proposal");
  check(L.signDecision({ p: "not-a-uuid", o: ORG, u: USER, expiresAt: future }) === null, "ids must be uuids");
}

/* 4. No key at all. */
{
  const saved = { a: process.env.LINK_SIGNING_SECRET, b: process.env.CRON_SECRET, c: process.env.SUPABASE_SERVICE_ROLE_KEY };
  delete process.env.LINK_SIGNING_SECRET; delete process.env.CRON_SECRET; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  check(L.signDecision({ p: A, o: ORG, u: USER, expiresAt: future }) === null, "no key → no token (never an unsigned one)");
  check(L.verifyDecision(t) === null, "no key → nothing verifies");
  process.env.LINK_SIGNING_SECRET = saved.a; if (saved.b) process.env.CRON_SECRET = saved.b; if (saved.c) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.c;
}
check(L.decisionUrl("https://x.test/", t) === `https://x.test/decide/${encodeURIComponent(t)}`, "the url is /decide/<token> on the given origin");

/* 5. Page renders, action decides. */
{
  const page = readFileSync("src/app/decide/[token]/page.tsx", "utf8");
  check(!/\bapprove\(|\breject\(|\.update\(/.test(page), "the GET page never approves, rejects or updates");
  check(/verifyDecision\(/.test(page), "the page verifies the token before showing anything");
  check(/\.eq\("org_id", p\.o\)/.test(page), "the page loads the proposal scoped to the token's org");
  const act = readFileSync("src/app/decide/[token]/actions.ts", "utf8");
  check(/^"use server";/m.test(act), "the decision is a server action");
  check(/verifyDecision\(String\(token/.test(act), "the action re-verifies the token itself");
  check(/enforce\(\[\{ key: `decide:\$\{ip\}`/.test(act), "the action is rate-limited per network");
  check(/approve\(p\.p, p\.o, p\.u\)/.test(act) && /reject\(p\.p, p\.o, p\.u/.test(act), "decided_by is the token's recipient, org and proposal from the token — never from the request body");
  const ledger = readFileSync("src/lib/engine/ledger.ts", "utf8");
  check(/\.eq\("status", "proposed"\)[\s\S]{0,120}\.select\("id"\)/.test(ledger.slice(ledger.indexOf("export async function approve"))), "approve() only moves a row that is still proposed, and reads the row back — a second click cannot act twice");
}

/* 6. The digest. */
{
  const d = readFileSync("src/lib/engine/decision-digest.ts", "utf8");
  check(/\.update\(\{ notified_at: stamp \}\)[\s\S]*?\.is\("notified_at", null\)\.eq\("status", "proposed"\)\.select\("id"\)/.test(d), "claims (notified_at) with a conditional update and reads the claimed ids back");
  const claimAt = d.indexOf("notified_at: stamp"), sendAt = d.indexOf("await sendEmail(");
  check(claimAt > 0 && sendAt > claimAt, "claims BEFORE sending");
  const releases = (d.match(/await release\(\)/g) || []).length;
  check(releases >= 3, `releases the claim on every non-delivering exit (gap, no owner, send failed): ${releases} release calls`);
  check(/if \(!to\) \{ await release\(\);/.test(d), "no owner contact → release, never send");
  check(/else \{ await release\(\);/.test(d), "send failed → release");
  check(/MIN_GAP_MS = 20 \* 60 \* 60 \* 1000/.test(d), "one digest per workspace per 20 hours");
  check(/signDecision\(\{ p: p\.id, o: orgId, u: to\.userId/.test(d), "each link is signed to this proposal, this org, this recipient");
  check(/Decision links are off on this deployment/.test(d), "says so when no key is configured instead of promising a link");
  check(/budget\.ok\(/.test(d), "respects the cron budget");
  const cron = readFileSync("src/app/api/cron/autopilot/route.ts", "utf8");
  check(/sendDecisionDigests\(new URL\(req\.url\)\.origin, budget\.slice\(SHARE\.decisions\)\)/.test(cron), "the autopilot runs it under its own share");
  const mig = readFileSync("supabase/migrations/2026_zzzs_proposal_notify.sql", "utf8");
  check(/add column if not exists notified_at timestamptz/.test(mig) && /notify pgrst/.test(mig), "the claim column migration exists and reloads PostgREST");
  check(/2026_zzzs_proposal_notify\.sql/.test(readFileSync("supabase/migrations/ORDER.txt", "utf8")), "…and is in ORDER.txt");
  check(/\["action_proposals", "notified_at", "2026_zzzs_proposal_notify"\]/.test(readFileSync("src/lib/health.ts", "utf8")), "…and health probes it");
}

console.log(`\ndecision links: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
console.log("  Tokens bind one proposal to one recipient; the page renders, only the POST decides.");
