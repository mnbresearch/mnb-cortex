/**
 * Guards for the backend audit fixes (export, refunds, mandates, public forms,
 * backup redaction, super-admin/invites, AI instructions, collections send).
 *
 * Executed where the code can be executed without a database (the export
 * collector against a fake PostgREST client, the email sanitiser, the backup
 * scrubber, the super-admin rule, invite expiry, collections entitlement, the
 * sending-window arithmetic); asserted against source where the behaviour is
 * a Supabase call in a route.
 *
 * Run: node --experimental-strip-types --no-warnings scripts/test-backend-fixes.mjs
 */
import { readFileSync, mkdtempSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const root = resolve(import.meta.dirname, "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
let pass = 0;
const failures = [];
const ok = (name, cond, why = "") => (cond ? pass++ : failures.push(`${name}${why ? "\n      " + why : ""}`));
const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const tmp = mkdtempSync(join(tmpdir(), "backend-fixes-"));
/** Copy a server module into tmp with its server-only imports stubbed, then import it. */
async function loadStubbed(rel, replacements) {
  let src = read(rel).replace(/^import ["']server-only["'];?\s*$/m, "");
  for (const [from, to] of replacements) {
    if (!src.includes(from)) throw new Error(`stub target not found in ${rel}: ${from}`);
    src = src.replace(from, to);
  }
  const out = join(tmp, rel.replace(/[\\/]/g, "_"));
  writeFileSync(out, src);
  return import(pathToFileURL(out).href);
}

/* ======================================================================= */
console.log("\n1. EXPORT — every table, every page, or nothing");
/* ======================================================================= */
{
  const { collectWorkspace, WORKSPACE_TABLES, redactRows } = await import(pathToFileURL(join(root, "src/app/api/export/collect.ts")).href);

  for (const t of ["leads", "quotes", "collection_threads", "collection_messages", "memories", "action_proposals", "credit_ledger", "goals", "invoices", "app_settings", "report_links"]) {
    ok(`the export includes ${t}`, WORKSPACE_TABLES.includes(t));
  }
  ok("the export does not include the other product's `payments` table", !WORKSPACE_TABLES.includes("payments"));

  /* A fake PostgREST: honours .range(), caps at 1000 rows like Supabase. */
  function fakeClient({ rows = {}, failTable = null, missingTable = null }) {
    const calls = [];
    return {
      calls,
      from(table) {
        const q = { table, from: 0, to: 0 };
        const api = {
          select() { return api; }, eq() { return api; }, or() { return api; }, in() { return api; },
          order() { return api; },
          range(a, b) { q.from = a; q.to = b; return api; },
          then(res, rej) {
            calls.push({ table, from: q.from, to: q.to });
            if (table === failTable) return Promise.resolve({ data: null, error: { message: "boom", code: "57014" } }).then(res, rej);
            if (table === missingTable) return Promise.resolve({ data: null, error: { message: `Could not find the table 'public.${table}' in the schema cache`, code: "PGRST205" } }).then(res, rej);
            const all = rows[table] || [];
            const to = Math.min(q.to, q.from + 999);
            return Promise.resolve({ data: all.slice(q.from, to + 1), error: null }).then(res, rej);
          },
        };
        return api;
      },
    };
  }

  const big = Array.from({ length: 2500 }, (_, i) => ({ id: `inv${i}`, org_id: "o1" }));
  const sb = fakeClient({ rows: {
    invoices: big,
    app_settings: [{ org_id: "o1", key: "resend_webhook_secret", value: "whsec_live" }, { org_id: "o1", key: "inbound_address", value: "in@x.com" }],
    report_links: [{ id: "r1", org_id: "o1", token: "tok_live" }],
    chat_threads: [{ id: "t1", org_id: "o1" }],
    chat_messages: [{ id: "m1", thread_id: "t1" }],
  }, missingTable: "visibility_runs" });
  const r = await collectWorkspace(sb, "o1");
  ok("a complete read succeeds", r.ok === true, JSON.stringify(r).slice(0, 200));
  eq("2,500 invoices are exported, not the first 1,000", r.ok ? r.data.invoices.length : -1, 2500);
  ok("a table missing from this deployment is listed as absent, not failed", r.ok && r.absent.includes("visibility_runs"));
  ok("chat messages are exported via their threads", r.ok && r.data.chat_messages?.length === 1);
  ok("app_settings secret values are redacted in the export", r.ok && r.data.app_settings.find((x) => x.key === "resend_webhook_secret").value === "[redacted]");
  ok("…non-secret settings are kept", r.ok && r.data.app_settings.find((x) => x.key === "inbound_address").value === "in@x.com");
  ok("report_links.token is redacted in the export", r.ok && r.data.report_links[0].token === "[redacted]");
  ok("api_keys.key is redacted", redactRows("api_keys", [{ key: "ck_live", name: "n" }])[0].key === "[redacted]");

  const failing = await collectWorkspace(fakeClient({ rows: { invoices: big }, failTable: "leads" }), "o1");
  ok("ANY read error fails the whole export", failing.ok === false && failing.table === "leads", JSON.stringify(failing));

  const huge = await collectWorkspace(fakeClient({ rows: { invoices: big } }), "o1", { maxRows: 1500 });
  ok("a table too large to read in full fails rather than truncating", huge.ok === false && huge.table === "invoices");

  const route = strip(read("src/app/api/export/route.ts"));
  ok("/api/export uses the shared collector", /collectWorkspace\(sb, orgId\)/.test(route));
  ok("/api/export answers non-200 when the export failed", /if \(!r\.ok\)[\s\S]{0,300}status: 500/.test(route));
  ok("/api/export no longer reads tables with a bare select", !/\.select\("\*"\)\.eq\("org_id"/.test(route));
  const erasure = strip(read("src/lib/erasure.ts"));
  ok("the pre-deletion export uses the shared collector and fails on error",
     /collectWorkspace\(svc, orgId/.test(erasure) && /if \(!r\.ok\)\s*\{\s*return \{ ok: false/.test(erasure));
}

/* ======================================================================= */
console.log("\n2-3. REFUNDS — a failed read is not 'no such order'; a raised chargeback is not lost");
/* ======================================================================= */
{
  const refund = strip(read("src/lib/pay/refund.ts"));
  ok("the order read binds its error", /const \{ data: row, error: rowErr \} = await svc\.from\(PAYMENTS_TABLE\)/.test(refund));
  ok("…and THROWS on it, before the unmatched-refund path", /if \(rowErr\) throw new Error/.test(refund)
     && refund.indexOf("if (rowErr) throw") < refund.indexOf("if (!row)"));
  ok("disputes are decided by disputeOutcome (executed in test-refund-math.mjs)", /disputeOutcome\(status, t\)/.test(refund)
     && !/LOST\|ACCEPT\|CHARGEBACK/.test(refund));
  ok("…and nothing else can mark a dispute decided", /const decided = outcome === "lost";/.test(refund) && /const won = outcome === "won";/.test(refund));
}

/* ======================================================================= */
console.log("\n4-5. MANDATES — never 'wasn't on' on a failed read; never overwrite a live ref");
/* ======================================================================= */
{
  const sub = strip(read("src/app/api/pay/cashfree/subscription/route.ts"));
  const del = sub.slice(sub.indexOf("export async function DELETE"), sub.indexOf("export async function GET"));
  ok("cancel reads subscription_ref WITH its error", /const \{ data, error: readErr \} = await svc\.from\("organizations"\)\.select\("subscription_ref"\)/.test(del));
  ok("…and a read error returns ok:false before 'wasn't on'", /if \(readErr\)[\s\S]{0,300}ok: false/.test(del)
     && del.indexOf("if (readErr)") < del.indexOf("Auto-renewal wasn"));
  const post = sub.slice(sub.indexOf("export async function POST"), sub.indexOf("async function recordRef"));
  ok("setup refuses when the current mandate cannot be read", /if \(curErr \|\| !cur\)[\s\S]{0,300}ok: false/.test(post));
  ok("setup no longer falls through a swallowed catch", !/catch \{\s*\}/.test(post) && !/fall through rather than block/.test(post));
  const rec = sub.slice(sub.indexOf("async function recordRef"), sub.indexOf("export async function DELETE"));
  ok("recordRef is conditional on the ref we checked", /previousRef \? q\.eq\("subscription_ref", previousRef\) : q\.is\("subscription_ref", null\)/.test(rec));
  ok("…and still requires a written row", /\(data\?\.length \?\? 0\) > 0/.test(rec));
  ok("POST passes the checked ref to recordRef", /recordRef\(orgId, res\.subscriptionId, existingRef\)/.test(post));
}

/* ======================================================================= */
console.log("\n6. PUBLIC FORMS — not a phishing relay");
/* ======================================================================= */
{
  const be = await loadStubbed("src/lib/branded-email.ts", [
    ['import { signDestination } from "@/lib/track-link";', 'const signDestination = (_u: string) => "sig";'],
  ]);
  const { plainCallerText, renderBrandedEmail } = be;
  for (const evil of ["https://evil.example/login", "Visit http://x.co now", "www.evil.com", "evil.com/reset", "pay at a@b.co", "javascript:alert(1)"]) {
    const out = plainCallerText(evil, 60);
    ok(`plainCallerText strips "${evil}"`, !/https?:|www\.|\.com|\.co\b|@|javascript:/i.test(out), out);
  }
  eq("plainCallerText keeps a plain name", plainCallerText("Priya", 40), "Priya");
  ok("plainCallerText caps length", plainCallerText("a".repeat(500), 40).length <= 40);
  const html = renderBrandedEmail("See https://evil.example/x and https://www.mnbresearch.com/contactus", { linkHosts: ["mnbresearch.com"] });
  ok("with linkHosts, a foreign URL is NOT a link", !/href="https:\/\/evil\.example/.test(html));
  ok("…our own host still is", /href="https:\/\/www\.mnbresearch\.com\/contactus"/.test(html));

  const inq = strip(read("src/app/api/inquiry/route.ts"));
  ok("inquiry allow-lists plan", /PLAN_NAMES\.has\(String\(body\.plan/.test(inq) && !/const \{ plan, currency, cycle, source \} = body/.test(inq));
  ok("inquiry allow-lists currency and source", /CURRENCIES\.has\(curIn\)/.test(inq) && /SOURCES\.has\(String\(body\.source/.test(inq));
  ok("inquiry sanitises the echoed first name and weak areas", /firstName = plainCallerText\(/.test(inq) && /plainCallerText\(w, 60\)/.test(inq));
  ok("inquiry mail to the caller restricts links to our hosts", /linkHosts: ownHosts/.test(inq));
  const acc = strip(read("src/app/api/access-request/route.ts"));
  ok("access-request sanitises the echoed name and restricts links", /plainCallerText\(name\.split/.test(acc) && /We received your access request", linkHosts/.test(acc));
}

/* ======================================================================= */
console.log("\n7. BACKUP — no live secrets in the file");
/* ======================================================================= */
{
  const { scrub } = await loadStubbed("src/lib/backup.ts", [
    ['import { serviceClient } from "@/lib/supabase/server";', "const serviceClient = () => null;"],
  ]);
  const s = scrub("app_settings", [
    { org_id: "o", key: "resend_webhook_secret", value: "whsec_1" },
    { org_id: "o", key: "some_api_key", value: "k" },
    { org_id: "o", key: "inbound_address", value: "in@x.com" },
  ]);
  eq("app_settings secret-looking values are redacted", s.map((r) => r.value), ["[REDACTED]", "[REDACTED]", "in@x.com"]);
  const rl = scrub("report_links", [{ id: "a", token: "live1" }, { id: "b", token: "live2" }]);
  ok("report_links.token is not the live token", rl.every((r) => !/live/.test(r.token)));
  ok("…and stays unique (the column is UNIQUE NOT NULL)", rl[0].token !== rl[1].token);
  eq("api_keys.key still redacted", scrub("api_keys", [{ key: "x" }])[0].key, "[REDACTED]");
}

/* ======================================================================= */
console.log("\n8. SUPER-ADMIN AND INVITES — a confirmed mailbox, not a typed address");
/* ======================================================================= */
{
  process.env.SUPER_ADMIN_EMAILS = "ops@example.com";
  const { isSuperAdminUser } = await loadStubbed("src/lib/operators.ts", []);
  ok("an unconfirmed operator address is NOT super-admin", isSuperAdminUser({ email: "ops@example.com", email_confirmed_at: null }) === false);
  ok("a confirmed operator address is", isSuperAdminUser({ email: "OPS@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" }) === true);
  ok("a confirmed stranger is not", isSuperAdminUser({ email: "x@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" }) === false);
  ok("isSuperAdmin() uses the confirmed rule", /return isSuperAdminUser\(user\)/.test(strip(read("src/lib/superadmin.ts"))));

  const ws = read("src/lib/workspace.ts");
  const fnSrc = ws.slice(ws.indexOf("export const INVITE_TTL_DAYS"), ws.indexOf("async function claimInvites"));
  const js = stripTypeScriptTypes(fnSrc).replace(/export /g, "");
  const inviteIsLive = new Function(`${js}; return inviteIsLive;`)();
  const now = Date.parse("2026-10-14T00:00:00Z");
  ok("an invite past expires_at is not claimable", inviteIsLive({ expires_at: "2026-10-13T00:00:00Z" }, now) === false);
  ok("an invite before expires_at is", inviteIsLive({ expires_at: "2026-10-20T00:00:00Z" }, now) === true);
  ok("a legacy invite (no expires_at) older than 14 days is not", inviteIsLive({ created_at: "2026-09-01T00:00:00Z" }, now) === false);
  ok("a legacy invite within 14 days is", inviteIsLive({ created_at: "2026-10-10T00:00:00Z" }, now) === true);
  ok("an invite with no dates at all is not", inviteIsLive({}, now) === false);
  const claim = strip(ws.slice(ws.indexOf("async function claimInvites")));
  ok("claimInvites refuses an unconfirmed email before reading invites", /if \(!emailConfirmed\) return 0;/.test(claim)
     && claim.indexOf("if (!emailConfirmed) return 0;") < claim.indexOf('.from("invites")'));
  ok("claimInvites filters by expiry", /\.filter\(\(i\) => inviteIsLive\(i, now\)\)/.test(claim));
  ok("ensureWorkspace passes the confirmation through", /claimInvites\(svc, user\.id, user\.email \|\| "", Boolean\(\(user as any\)\.email_confirmed_at\)\)/.test(ws));
  const mig = read("supabase/migrations/2026_zzzz_e_invite_expiry.sql");
  ok("the expiry migration adds the column before setting the default (no extension of old invites)",
     mig.indexOf("add column if not exists expires_at timestamptz;") < mig.indexOf("set default"));
}

/* ======================================================================= */
console.log("\n9. AI INSTRUCTIONS — a failed load never becomes a blank save");
/* ======================================================================= */
{
  const lib = strip(read("src/lib/ai-instructions.ts"));
  ok("readInstructions returns the read error", /if \(error\) return \{ ok: false, error: error\.message \}/.test(lib));
  ok("getInstructions throws instead of returning \"\" on failure", /if \(!r\.ok\) throw new Error/.test(lib));
  const panel = strip(read("src/components/ai-instructions-panel.tsx"));
  ok("the panel no longer swallows the load error", !/\.catch\(\(\) => \{\}\)/.test(panel));
  ok("…and does not enable the editor in a finally", !/\.finally\(\(\) => setLoaded\(true\)\)/.test(panel));
  ok("loaded is set only on a successful read", /if \(r\.ok && j\?\.ok && typeof j\.text === "string"\) \{ setText\(j\.text\); setLoaded\(true\); \}/.test(panel));
  ok("Save stays disabled until loaded", /disabled=\{saving \|\| !canEdit \|\| !loaded\}/.test(panel));
}

/* ======================================================================= */
console.log("\n10. COLLECTIONS — scheduled sends happen inside the sending window");
/* ======================================================================= */
{
  const vercel = JSON.parse(read("vercel.json"));
  const sched = (p) => vercel.crons.find((c) => c.path === p)?.schedule || "";
  const istHour = (cron) => { const [m, h] = cron.split(" ").map(Number); return ((h * 60 + m + 330) % 1440) / 60; };
  const col = read("src/lib/collections/index.ts");
  const from = Number(/send_from_hour:\s*(\d+)/.exec(col)[1]);
  const to = Number(/send_to_hour:\s*(\d+)/.exec(col)[1]);
  const recIst = istHour(sched("/api/cron/reconcile"));
  const autoIst = istHour(sched("/api/cron/autopilot"));
  ok(`the reconcile cron (${recIst}h IST) is inside the default window ${from}–${to}`, recIst >= from && recIst < to);
  ok(`(and the nightly run at ${autoIst}h IST is not — which is why the send moved)`, !(autoIst >= from && autoIst < to));

  const rec = strip(read("src/app/api/cron/reconcile/route.ts"));
  ok("the reconcile cron sends approved collections", /sendCollectionsDaytime\(new URL\(req\.url\)\.origin, runBudget\.slice\(/.test(rec));
  ok("…never on a dry run", /if \(!dryRun\) \{[\s\S]{0,200}sendCollectionsDaytime/.test(rec));
  const day = strip(read("src/app/api/cron/reconcile/collections-daytime.ts"));
  ok("the daytime send calls sendApproved (which holds the kill switch, window and cap)", /sendApproved\(oid, origin\)/.test(day));
  ok("…for entitled, enabled workspaces only", /collectionsEntitledSet\(svc,/.test(day) && /\.eq\("enabled", true\)/.test(day));
  ok("…within a budget", /inWaves\(list, WIDTH, budget,/.test(day));

  const { collectionsEntitled } = await import(pathToFileURL(join(root, "src/app/api/cron/collections-entitled.ts")).href);
  const future = new Date(Date.now() + 10 * 86400e3).toISOString();
  const past = new Date(Date.now() - 40 * 86400e3).toISOString();
  ok("an active workspace may send", collectionsEntitled({ id: "a", plan: "watch", subscription_status: "active", subscription_ends_at: future }));
  ok("a lapsed workspace may not", !collectionsEntitled({ id: "b", plan: "watch", subscription_status: "expired", subscription_ends_at: past }));
  ok("a lapsed workspace on the operator override may", collectionsEntitled({ id: "c", plan: "watch", subscription_status: "expired", subscription_ends_at: past, credits_allowance: -1 }));
  ok("a lapsed client pooled by a live Practice firm may",
     collectionsEntitled({ id: "d", plan: "watch", subscription_status: "expired", subscription_ends_at: past, practice_org_id: "f" },
                         { id: "f", plan: "practice", subscription_status: "active", subscription_ends_at: future }));
  ok("no org row → no send", !collectionsEntitled(null));
  const auto = strip(read("src/app/api/cron/autopilot/route.ts"));
  ok("the nightly collections lane filters by entitlement", /collectionsEntitledSet\(svcC,/.test(auto));

  const dry = read("src/components/collections-dry-run.tsx");
  const ks = read("src/components/collections-killswitch.tsx");
  ok("the dry run no longer promises 'tonight'", !/tonight/i.test(dry));
  ok("the dry run says when sends actually happen", /11:30 IST/.test(dry) && /sending window/.test(dry));
  ok("the kill switch no longer says 'on the next run.'", !/on the next run\./.test(ks) && /11:30 IST/.test(ks));
}

/* ======================================================================= */
console.log("\n11-24. CRONS, MAIL, ENTITLEMENT, INTEGRATIONS, ERASURE, ENV");
/* ======================================================================= */
{
  /* 12 — inbound reply write failure asks for a retry */
  const inb = strip(read("src/app/api/inbound/resend/route.ts"));
  ok("inbound: a rejected reply write answers 500 (Resend retries)", /if \(repErr\)[\s\S]{0,200}status: 500/.test(inb) && !/catch \{ \/\* never 500/.test(read("src/app/api/inbound/resend/route.ts")));

  /* 13 — unsubscribe only says so once stored */
  const un = strip(read("src/app/api/unsub/route.ts"));
  ok("unsub: 'You're unsubscribed' only after a stored opt-out", /if \(!stored\)[\s\S]{0,400}503/.test(un) && un.indexOf("if (!stored)") < un.indexOf("You're unsubscribed"));

  /* 14 — campaigns honour opt-outs and offer one */
  const camp = strip(read("src/app/api/email/campaigns/route.ts"));
  ok("campaigns: opt-outs are read and filtered before sending", /from\("email_optouts"\)/.test(camp) && /const sendable = clean\.filter/.test(camp) && /for \(const r of sendable\)/.test(camp));
  ok("campaigns: an unreadable opt-out list sends nothing", /if \(ooErr\) return NextResponse\.json\(\{ ok: false/.test(camp));
  ok("campaigns: List-Unsubscribe header + one-click + link in body", /"List-Unsubscribe": `<\$\{unsub\}>`/.test(camp) && /List-Unsubscribe=One-Click/.test(camp) && /Unsubscribe: \$\{unsub\}/.test(camp));
  ok("campaigns: maxDuration set", /export const maxDuration = \d+/.test(camp));
  ok("campaigns: recipient insert checked before sending", /if \(recErr \|\| !rid\)[\s\S]{0,200}continue;/.test(camp));

  /* 15 — requireWorkspace on the four non-metered routes */
  for (const f of ["src/app/api/integrations/route.ts", "src/app/api/integrations/sync/route.ts", "src/app/api/export/mis-pack/route.ts", "src/app/api/actions/[id]/file/route.ts"]) {
    ok(`${f} calls requireWorkspace and returns its refusal`, /const gate = await requireWorkspace\(\);\s*if \(!gate\.ok\) return NextResponse\.json\(gate\.body, \{ status: gate\.status \}\)/.test(strip(read(f))));
  }

  /* 16 — ingest: data errors 400, everything else 500; docs match the SQL */
  const ing = strip(read("src/app/api/v1/ingest/route.ts"));
  ok("ingest: only SQLSTATE 22/23 is the caller's fault (400); the rest is 500", /if \(\/\^2\[23\]\/\.test\(code\)\)/.test(ing) && /apiError\(ctx\.rid, 500/.test(ing));
  const oa = read("src/lib/api/openapi.ts");
  ok("openapi no longer claims upsert for every table", !/upsert on each table's natural key/.test(oa) && /`inventory_items` is a plain insert/.test(oa) && /`leads` is insert-if-absent/.test(oa));

  /* 17 — a paid-but-refused intent counts as new (emails the operator) once */
  const rc = strip(read("src/lib/pay/reconcile.ts"));
  ok("reconcile: refused settlement increments newlyUnresolved when not already noted", /if \(!it\.outcome\) newlyUnresolved\+\+;/.test(rc) && /outcome: `refused: \$\{why\}`/.test(rc));

  /* 18 — webhook delivery writes last_error and checks it */
  const wh = strip(read("src/lib/webhooks.ts"));
  ok("webhooks: failed delivery writes last_error (not `error`) and checks the write", /last_error: "Signing secret could not be read/.test(wh) && /if \(updErr\) console\.error/.test(wh));

  /* 19 — no platform WhatsApp fallback for a workspace */
  const wa = strip(read("src/lib/whatsapp.ts"));
  const waFor = wa.slice(wa.indexOf("export async function whatsappConfigFor"), wa.indexOf("export async function hasWhatsAppFor"));
  ok("whatsapp: with an orgId the answer is the workspace's own account or null", /if \(orgId\) \{[\s\S]*?return null;\s*\}\s*return whatsappConfig\(\);/.test(waFor));

  /* 20 — one Shopify normaliser; Stripe guide = validator; Tally honest */
  const syncSrc = read("src/lib/sync/index.ts");
  const normSrc = syncSrc.slice(syncSrc.indexOf("export function normaliseShopDomain"), syncSrc.indexOf("const shopify: Connector"));
  const normaliseShopDomain = new Function(`${stripTypeScriptTypes(normSrc).replace(/export /g, "")}; return normaliseShopDomain;`)();
  for (const [inp, want] of [["https://Acme.myshopify.com/admin", "acme.myshopify.com"], ["acme.myshopify.com/", "acme.myshopify.com"], ["HTTP://acme.myshopify.com?x=1", "acme.myshopify.com"], ["  acme.myshopify.com.  ", "acme.myshopify.com"]]) {
    eq(`normaliseShopDomain(${JSON.stringify(inp)})`, normaliseShopDomain(inp), want);
  }
  ok("the connection test and the sync share it", /normaliseShopDomain\(c\.shop\)/.test(read("src/app/api/integrations/route.ts")) && /const shop = normaliseShopDomain\(c\.shop\)/.test(syncSrc));
  const guides = read("src/lib/setup-guides.ts");
  ok("the Stripe guide no longer offers sk_live_ (the validator refuses it)", !/rk_live_ \(restricted\) or sk_live_ \(secret\)/.test(guides) && /sk_live_\) is refused/.test(guides));
  ok("the Tally field is optional and says it is not read", /Not used by Cortex/.test(read("src/lib/integrations.ts")));

  /* 21 — autopilot 500 on critical failure; weekly budget; reconcile heartbeat probed */
  const ap = strip(read("src/app/api/cron/autopilot/route.ts"));
  ok("autopilot: no service role is a 500, not ok:true", /if \(!sb\) return NextResponse\.json\(\{ ok: false[\s\S]{0,200}status: 500/.test(ap));
  ok("autopilot: critical failures make the run a 500", /status: runOk \? 200 : 500/.test(ap) && /if \(heartbeat !== "ok"\) criticalFailures\.push/.test(ap));
  ok("weekly-update cron runs on a budget", /sendWeeklyUpdate\(\{ test, force, budget: createBudget\(/.test(strip(read("src/app/api/cron/weekly-update/route.ts"))));
  const hs = strip(read("src/lib/health.ts"));
  ok("health: the reconcile heartbeat is read and can degrade 'Scheduled jobs'", /RECONCILE_KEY\]/.test(hs) && /rec\.degraded \? "degraded"/.test(hs));
  const rv = hs.slice(hs.indexOf("export function reconcileVerdict"), hs.indexOf("async function checkCron"));
  const reconcileVerdict = new Function(`const RECONCILE_STALE_HOURS = 36; ${stripTypeScriptTypes(rv).replace(/export /g, "")}; return reconcileVerdict;`)();
  const nowT = Date.parse("2026-10-14T12:00:00Z");
  ok("reconcileVerdict: missing → degraded", reconcileVerdict(null, nowT).degraded === true);
  ok("reconcileVerdict: 40h old → degraded", reconcileVerdict("2026-10-12T20:00:00Z", nowT).degraded === true);
  ok("reconcileVerdict: 10h old → fine", reconcileVerdict("2026-10-14T02:00:00Z", nowT).degraded === false);
  ok("reconcile cron writes and checks its heartbeat", /from\("system_status"\)\s*\.upsert\(\{ key: RECONCILE_HEARTBEAT_KEY/.test(strip(read("src/app/api/cron/reconcile/route.ts"))));

  /* 22 — erasure needs a second factor, unconditionally; superadmin writes checked */
  const er = strip(read("src/lib/erasure.ts"));
  const erase = er.slice(er.indexOf("export async function eraseWorkspace"), er.indexOf("export async function exportBeforeErasure"));
  ok("erasure: a second factor is ALWAYS required (not the optional policy)", /strongAuthVerdict\(\{ required: true, current: a\.current, next: a\.next \}/.test(erase)
     && erase.indexOf("strongAuthVerdict(") < erase.indexOf("serviceClient()"));
  const sa = strip(read("src/lib/superadmin-actions.ts"));
  ok("superadmin: membership writes and org updates are checked (error AND rows)", /if \(memReadErr\) throw/.test(sa) && /no membership row was written/.test(sa) && /No workspace matched that id/.test(sa));

  /* 23 — unsubscribe signing key: LINK_SIGNING_SECRET, CRON_SECRET fallback, no literal */
  const wuSrc = read("src/lib/weekly-update.ts");
  const wuCode = strip(wuSrc);
  const keyFns = wuCode.slice(wuCode.indexOf("function unsubSecrets"), wuCode.indexOf("export function unsubUrl"));
  ok("weekly-update: no literal fallback key, no service-role key reuse", !/cortex-weekly-fallback/.test(wuCode) && !/SUPABASE_SERVICE_ROLE_KEY/.test(keyFns) && /LINK_SIGNING_SECRET, process\.env\.CRON_SECRET\]/.test(keyFns));
  const wu = await loadStubbed("src/lib/weekly-update.ts", [
    ['import { serviceClient } from "@/lib/supabase/server";', "const serviceClient = () => null;"],
    ['import { brandFrom } from "@/lib/branded-email";', 'const brandFrom = () => "x";'],
    ['import { RELEASES, releasesSince, type Release } from "@/lib/changelog";', "const RELEASES: any[] = []; const releasesSince = () => []; type Release = any;"],
  ]);
  const saveEnv = { L: process.env.LINK_SIGNING_SECRET, C: process.env.CRON_SECRET };
  delete process.env.LINK_SIGNING_SECRET; delete process.env.CRON_SECRET;
  ok("with no key, signing is unavailable and nothing verifies", wu.unsubSigningAvailable() === false && wu.verifyUnsub("a@b.co", "x".repeat(24)) === false);
  let threw = false; try { wu.unsubToken("a@b.co"); } catch { threw = true; }
  ok("…and minting a token throws rather than using a guessable key", threw);
  process.env.CRON_SECRET = "cron-secret-old-xxxxxxxx";
  const oldTok = wu.unsubToken("a@b.co");
  process.env.LINK_SIGNING_SECRET = "link-secret-new-yyyyyyyy";
  const newTok = wu.unsubToken("a@b.co");
  ok("LINK_SIGNING_SECRET is preferred for new links", newTok !== oldTok);
  ok("…links already sent (CRON_SECRET-signed) still verify", wu.verifyUnsub("a@b.co", oldTok) === true && wu.verifyUnsub("a@b.co", newTok) === true);
  ok("…a forged token does not", wu.verifyUnsub("a@b.co", "A".repeat(24)) === false);
  if (saveEnv.L === undefined) delete process.env.LINK_SIGNING_SECRET; else process.env.LINK_SIGNING_SECRET = saveEnv.L;
  if (saveEnv.C === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saveEnv.C;

  /* 24 — every env var the code reads is in .env.example */
  const used = new Set();
  const walk = (d) => { for (const e of readdirSync(join(root, d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name)) for (const m of read(p).matchAll(/process\.env\.([A-Z][A-Z0-9_]+)|envKey\("([A-Z][A-Z0-9_]+)"\)/g)) used.add(m[1] || m[2]); } };
  walk("src");
  const listed = new Set([...read(".env.example").matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]));
  const ignore = new Set(["NODE_ENV", "NEXT_RUNTIME", "VERCEL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_GIT_COMMIT_SHA", "VERCEL_GIT_COMMIT_REF", "VERCEL_REGION", "CI", "X", "X_API_KEY"]);
  const missing = [...used].filter((v) => !listed.has(v) && !ignore.has(v)).sort();
  eq(".env.example lists every env var the code reads", missing, []);
}

/* ======================================================================= */
console.log("\nFOLLOW-UPS. credit denials say why; engine failures are never billed or sent");
/* ======================================================================= */
{
  const guard = await loadStubbed("src/lib/api-guard.ts", [
    ['import { SMALLEST_PACK_LABEL } from "@/lib/config";', 'const SMALLEST_PACK_LABEL = "PACK";'],
    ['import { getUserAndOrg } from "@/lib/data";', "const getUserAndOrg = async () => ({});"],
  ]);
  const d = (g) => guard.creditDenial({ ok: false, enforced: true, cost: 3, balance: 50, ...g }, "This");
  const un = d({ reason: "unavailable" });
  ok("metering failure → 503, nothing charged, try again", un.status === 503 && /could not be checked right now — nothing was charged\. Please try again\./.test(un.body.error) && !un.body.outOfCredits);
  const ins = d({ reason: "insufficient", balance: 1 });
  ok("insufficient → 402 out of credits with the real balance", ins.status === 402 && ins.body.outOfCredits === true && /balance is 1/.test(ins.body.error));
  const pooled = d({ reason: "insufficient", balance: 0, pooledFor: "client" });
  ok("pooled insufficient names the practice's shared balance", /practice's shared AI credits/.test(pooled.body.error));
  const lapsed = d({ reason: "lapsed", balance: 0 });
  ok("lapsed → 402 planExpired, does not claim a plan 'ended' or that credits can't help", lapsed.status === 402 && lapsed.body.planExpired === true && !/has ended/.test(lapsed.body.error) && /add credits/.test(lapsed.body.error));
  const unk = d({ reason: undefined });
  ok("an unrecognised refusal is not reported as out of credits", unk.status === 503 && !unk.body.outOfCredits);

  const wfl = strip(read("src/lib/workflows.ts"));
  ok("workflows: both AI step kinds use isEngineFailure", (wfl.match(/!isEngineFailure\(text\)/g) || []).length >= 2 && !/I couldn't reach the AI engine/.test(wfl));
  ok("workflows: a denial says the reason the charge gave (unavailable is not 'not enough credits')", /reason === "insufficient"/.test(wfl) && /credits could not be checked right now/.test(wfl));
  const sr = strip(read("src/lib/scheduled-reports.ts"));
  ok("scheduled reports: engine failure → refund, nothing sent", /if \(!body \|\| !body\.trim\(\) \|\| isEngineFailure\(body\)\) \{[\s\S]{0,200}refundIfCharged\(gate[\s\S]{0,80}continue;/.test(sr));
  ok("autopilot analysis: engine failure is not stored as an insight", /if \(!text\.trim\(\) \|\| isEngineFailure\(text\)\) return;/.test(strip(read("src/app/api/cron/autopilot/route.ts"))));
  const be = strip(read("src/app/api/brief/email/route.ts"));
  ok("brief email: engine failure → refund to the payer, no email", /isEngineFailure\(brief\)\) \{\s*await refundIfCharged\(gate, "brief"\);\s*return NextResponse\.json\(\{ ok: false/.test(be)
     && be.indexOf("isEngineFailure(brief)") < be.indexOf("sendEmail("));
  const rp = strip(read("src/app/api/report/route.ts"));
  ok("report: engine failure → refund to the payer, ok:false", /isEngineFailure\(report\)\) \{\s*await refundIfCharged\(gate, "report"\);\s*return NextResponse\.json\(\{\s*ok: false/.test(rp) && !/refundForMode/.test(rp));
}

/* ======================================================================= */
console.log(`\nbackend fixes: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("✓ all green");
