/*
  AUDIT FIXES — actions, engine, collections, API, team. Executed where it can be.

  Each block names the finding it guards. Pure helpers are imported and run;
  the new migrations are applied to a real Postgres (PGlite) and attacked as an
  ordinary role (a superuser bypasses RLS, so that would measure nothing);
  server-only code that cannot be imported is checked at the source, against
  the specific line that was wrong.

    P0-1/2  invoice: no overwrite of another customer's invoice; no reopening a paid one
    P0-3    quote: same, and meta is merged so converted_invoice_id survives
    P0-4    revoking a share link: manager, error + row count, /billing revalidated
    P0-5    collections auto-send needs the autonomy capability (save AND draft time)
    P0-6    Autopilot rules re-check the plan when they fire
    P0-7    approving one reminder sends that one, on that channel
    P0-8    API keys refused when the plan lacks the API or has lapsed (also run in test-api-v1)
    P0-9    requireCapability checks the plan is LIVE, not just named
    P0-10   deleteLead: manager, and the operator path is scoped
    P0-11   team: change role / remove member, rank-gated in the app and in RLS
    P1      a few of the cheaper guards (event trigger, comma split, PO copy, stuck rows)

  Run: node --experimental-strip-types --no-warnings scripts/test-actions-fixes.mjs
*/
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let pass = 0;
const fails = [];
const check = (cond, name, detail = "") => { if (cond) pass++; else fails.push(detail ? `${name}\n      ${detail}` : name); };

const ACTIONS = strip(read("src/lib/actions.ts"));
/** The body of an exported or internal function in actions.ts, up to the next top-level function. */
function fnBody(src, name) {
  const re = new RegExp(`(export )?async function ${name}\\b`);
  const m = re.exec(src);
  if (!m) return "";
  const rest = src.slice(m.index + 10);
  const next = rest.search(/\n(export )?async function |\nexport type |\nconst [A-Z_]+ = /);
  return src.slice(m.index, m.index + 10 + (next === -1 ? rest.length : next));
}

/* ===================================================================== */
/* P0-9  plan-gate: plan includes it AND the subscription is live         */
/* ===================================================================== */
const { capabilityVerdict, capabilityMessage } = await import("../src/lib/engine/plan-gate.ts");
{
  const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const past = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const active = { id: "o1", plan: "command", subscription_status: "active", subscription_ends_at: future };
  check(capabilityVerdict(active, "api").ok, "plan-gate: a live Command workspace has the API");
  check(!capabilityVerdict({ ...active, plan: "watch" }, "api").ok && capabilityVerdict({ ...active, plan: "watch" }, "api").reason === "plan",
    "plan-gate: a plan without the capability is refused as 'plan'");
  const lapsed = capabilityVerdict({ ...active, subscription_ends_at: past }, "api");
  check(!lapsed.ok && lapsed.reason === "lapsed", "plan-gate: a Command plan whose period ran out is LAPSED, not entitled",
    "the bug: organizations.plan still said command, so a credit pack unlocked every capability");
  check(!capabilityVerdict({ ...active, subscription_status: "cancelled", credits: 5000 }, "webhooks").ok,
    "plan-gate: credits do not renew a plan (cancelled + 5000 credits → refused)");
  const sus = capabilityVerdict({ ...active, subscription_status: "suspended", credits_allowance: -1 }, "api");
  check(!sus.ok && sus.reason === "suspended", "plan-gate: suspended is refused even with the unlimited override");
  check(capabilityVerdict({ ...active, subscription_status: "expired", credits_allowance: -1 }, "api").ok,
    "plan-gate: the operator's unlimited override (credits_allowance -1) is honoured");
  check(capabilityVerdict({ id: "o1", plan: "watchpro", subscription_status: "trialing" }, "workflows").ok,
    "plan-gate: an open trial is entitled");
  check(!capabilityVerdict({ id: "o1", plan: "watchpro", subscription_status: "trialing", trial_ends_at: past }, "workflows").ok,
    "plan-gate: an expired trial is not");
  const client = { id: "c1", plan: "command", subscription_status: "expired", practice_org_id: "f1" };
  check(capabilityVerdict(client, "api", { id: "f1", plan: "practice", subscription_status: "active", subscription_ends_at: future }).ok,
    "plan-gate: a client pooled by a LIVE Practice firm stays entitled");
  check(!capabilityVerdict(client, "api", { id: "f1", plan: "practice", subscription_status: "expired" }).ok,
    "plan-gate: …and not when the firm has lapsed");
  check(!capabilityVerdict(null, "api").ok, "plan-gate: no row → refused");
  check(!/keeps? working/i.test(capabilityMessage(lapsed, "api", "The public API")),
    "plan-gate: the refusal never claims anything keeps working");

  const rc = fnBody(ACTIONS, "requireCapability");
  check(/capabilityVerdict\(/.test(rc) && /select\("\*"\)/.test(rc),
    "requireCapability reads the whole org row and decides through plan-gate",
    "it read only `plan`, so status was never considered");
  check(/requireCapability\(orgId, "api"/.test(fnBody(ACTIONS, "generateApiKey")),
    "generateApiKey goes through requireCapability (so a lapsed plan cannot issue keys)");
}

/* ===================================================================== */
/* P0-1/2/3  invoice and quote numbers                                    */
/* ===================================================================== */
const { nextDocNumber, sameParty } = await import("../src/lib/engine/doc-number.ts");
{
  check(nextDocNumber([], "INV-") === "INV-0001", "doc-number: an empty workspace starts at INV-0001");
  check(nextDocNumber(["INV-0001", "INV-0009", "X-77", null], "INV-") === "INV-0010", "doc-number: one past the highest, width kept");
  check(nextDocNumber(["inv-0004"], "INV-") === "INV-0005", "doc-number: case-insensitive");
  check(nextDocNumber(["QT-12345"], "QT-") === "QT-12346", "doc-number: wider numbers keep their width");
  check(nextDocNumber(["INV-0002", "INV-0003"], "INV-") === "INV-0004" && nextDocNumber(["INV-0001", "INV-0002"], "INV-") !== "INV-0002",
    "doc-number: never suggests a number already taken");
  check(sameParty("Sharma Traders", " sharma  traders ") && !sameParty("Sharma Traders", "Patel & Co") && !sameParty("", ""),
    "doc-number: party comparison ignores case/spacing; blank never matches");

  const inv = fnBody(ACTIONS, "saveInvoice");
  check(inv && !/\.upsert\(/.test(inv), "saveInvoice: no blind upsert on (org_id, invoice_no)",
    "the upsert replaced another customer's invoice on a reused number");
  check(/\.eq\("invoice_no", invoice_no\)/.test(inv) && /!sameParty\(prior\.party, party\)/.test(inv) && /return conflict\(\)/.test(inv),
    "saveInvoice: reads the number first and refuses when it belongs to a different party");
  check(/is_demo: false/.test(inv), "saveInvoice: writes is_demo:false (sample-data removal can never delete a real invoice)");
  const full = (/const full: Record<string, unknown> = \{([\s\S]*?)\};/.exec(inv) || [])[1] || "";
  check(full && !/status/.test(full), "saveInvoice: the payload used to UPDATE an existing invoice carries no status",
    "re-saving a paid invoice sent status 'pending' and reopened it");
  check(/\.update\(p\)\.eq\("id", prior\.id\)/.test(inv) && /\.select\("id"\)/.test(inv), "saveInvoice: an edit updates by id and reads the row back");

  const gen = strip(read("src/components/invoice-generator.tsx"));
  check(!/"INV-0001"/.test(gen) && /suggestInvoiceNumber\(/.test(gen) && /nextDocNumber\(/.test(gen),
    "invoice builder: does not open on INV-0001; asks the server for the next free number");

  const q = fnBody(ACTIONS, "saveQuote");
  check(q && !/\.upsert\(/.test(q) && /!sameParty\(prior\.party, party\)/.test(q), "saveQuote: no blind upsert; refuses a different party's number");
  check(/converted_invoice_id: priorMeta\.converted_invoice_id/.test(q) && /\.\.\.priorMeta/.test(q),
    "saveQuote: merges meta and keeps converted_invoice_id",
    "replacing meta erased the conversion marker and re-offered 'Invoice it' (double receivable)");
  const qb = strip(read("src/components/quote-builder.tsx"));
  check(!/"QT-0001"/.test(qb) && /suggestQuoteNumber\(/.test(qb), "quote builder: does not open on QT-0001");
}

/* ===================================================================== */
/* P0-4  revoking a public share link                                     */
/* ===================================================================== */
{
  const b = fnBody(ACTIONS, "revokeReportLink");
  check(/requireRole\("manager"\)/.test(b), "revokeReportLink: manager (RLS needs rank 3 to delete report_links)");
  check(/\.delete\(\)[\s\S]*?\.select\("id"\)/.test(b) && /if \(error\)/.test(b) && /data\.length === 0/.test(b),
    "revokeReportLink: checks the error AND the row count", "a zero-row delete left the public link live behind a success");
  check(/revalidatePath\("\/billing"\)/.test(b), "revokeReportLink: revalidates /billing, where the list lives");
}

/* ===================================================================== */
/* P0-5  collections auto-send needs autonomy                             */
/* ===================================================================== */
{
  const b = fnBody(ACTIONS, "saveCollectionPolicy");
  check(/if \(patch\.auto_send\)[\s\S]{0,200}requireCapability\(orgId, "autonomy"/.test(b),
    "saveCollectionPolicy: auto_send refused unless the plan includes autonomy");
  const col = strip(read("src/lib/collections/index.ts"));
  const prep = col.slice(col.indexOf("export async function prepareDrafts"), col.indexOf("export async function sendApproved"));
  check(/orgCapability\(orgId, "autonomy"\)/.test(prep) && /status: autoSend \? "approved" : "draft"/.test(prep) && !/status: p\.auto_send/.test(prep),
    "prepareDrafts: ignores a stored auto_send when the live plan lacks autonomy",
    "a policy saved on Command kept auto-approving after a downgrade");
}

/* ===================================================================== */
/* P0-6  Autopilot rules re-check the plan                                */
/* ===================================================================== */
{
  const { gateVerdict } = await import("../src/lib/engine/policy.ts");
  const { CATALOGUE } = await import("../src/lib/engine/catalogue.ts");
  const high = CATALOGUE.find((d) => d.effect === "outbound" || d.effect === "money");
  const low = CATALOGUE.find((d) => d.effect === "internal_write" || d.effect === "export");
  const auto = { verdict: "auto", reason: "rule" };
  const pol = { mode: "auto", caps: { max_per_day: 5, max_amount_inr: null, known_parties_only: false } };
  check(gateVerdict(auto, high, pol, { source: "autopilot", autonomy: false }).verdict === "approve",
    `gateVerdict: ${high.key} (${high.effect}) waits for a tap when the plan no longer includes autonomy`);
  check(gateVerdict(auto, high, pol, { source: "autopilot", autonomy: true }).verdict === "auto",
    "gateVerdict: …and runs when it does");
  check(gateVerdict(auto, low, pol, { source: "autopilot", autonomy: false }).verdict === "auto",
    `gateVerdict: a low-impact action (${low.key}) may still run on its own on any plan`);
  const led = strip(read("src/lib/engine/ledger.ts"));
  const prop = led.slice(led.indexOf("export async function propose"), led.indexOf("function defaultKey"));
  check(/planAllowsAutonomy\(input\.orgId\)/.test(prop) && /suspicious, autonomy/.test(prop), "propose(): passes the live plan's autonomy into gateVerdict");
  const ex = led.slice(led.indexOf("export async function execute"), led.indexOf("export async function undo"));
  check(/isHighImpact\(def\) && !\(await planAllowsAutonomy\(orgId\)\)/.test(ex), "execute(): the auto path re-asks the plan just before acting");

  /* P1-13: "Never" stops queued actions too. */
  check(/currentPolicy\?\.mode === "blocked"/.test(ex) && ex.indexOf('currentPolicy?.mode === "blocked"') < ex.indexOf("if (opts.recheckPolicy)"),
    "execute(): a blocked rule is checked on EVERY execution, not only the auto path");
  const sp = led.slice(led.indexOf("export async function setPolicy"), led.indexOf("export async function expireStale"));
  check(/mode === "blocked"[\s\S]*?\.in\("status", \["proposed", "approved"\]\)/.test(sp), "setPolicy(): switching to Never blocks what is already queued");

  /* P1-14: stuck rows. */
  check(/isStuck\(existing as Proposal\)/.test(prop) && /:stuck:/.test(prop), "propose(): a stuck earlier run is closed as failed so a retry can be recorded");
  const ap = strip(read("src/app/(app)/approvals/page.tsx"));
  check(/status: \["approved", "executing"\]/.test(ap) && /isStuck\(p\)/.test(ap), "/approvals lists approved/executing rows and marks interrupted ones");
}

/* ===================================================================== */
/* P0-7  one approval, one message, one channel                           */
/* ===================================================================== */
{
  const h = strip(read("src/lib/engine/handlers.ts"));
  const fn = h.slice(h.indexOf("async function sendPaymentReminder"), h.indexOf("async function sendPaymentReminder") + 4000);
  check(!/\|\|\s*\(\(drafts as any\[\]\) \|\| \[\]\)\[0\]/.test(fn) && /all\.find\(\(d\) => d\.channel === wantChannel\)/.test(fn),
    "send_payment_reminder: no fallback to a draft on another channel");
  check(/sendApproved\(ctx\.orgId, undefined, \{ onlyIds: \[String\(draft\.id\)\] \}\)/.test(fn),
    "send_payment_reminder: sends ONLY the approved draft", "unscoped, it sent every approved message in the workspace");
  const col = strip(read("src/lib/collections/index.ts"));
  const sa = col.slice(col.indexOf("export async function sendApproved"));
  check(/opts\?: \{ onlyIds\?: string\[\] \}/.test(sa) && /qb\.in\("id", opts\.onlyIds\)/.test(sa) && /onlyIds\.length === 0\) return/.test(sa),
    "sendApproved: an id filter, and an empty list sends nothing (never everything)");
}

/* ===================================================================== */
/* P0-8  the API refuses a plan without it, or a lapsed one               */
/* ===================================================================== */
{
  const a = strip(read("src/lib/api/auth.ts"));
  check(/capabilityVerdict\(orgRow, cap, firm\)/.test(a) && /^import \{ capabilityVerdict, capabilityMessage \} from "@\/lib\/engine\/plan-gate";/m.test(a) && /kind === "write" \? \(\["api", "api_write"\]/.test(a),
    "apiAuth: every call checks the plan includes api (and api_write for writes) and is live");
  check(/if \(gateRefusal\)[\s\S]{0,200}403/.test(a), "apiAuth: a refusal is a 403 with the reason");
}

/* ===================================================================== */
/* P0-10  deleteLead                                                      */
/* ===================================================================== */
{
  const b = fnBody(ACTIONS, "deleteLead");
  check(/requireRole\("manager"\)/.test(b), "deleteLead: manager (no role check at all before)");
  check(/\.or\(`org_id\.is\.null,org_id\.eq\.\$\{orgId\}`\)/.test(b), "deleteLead: the service-role operator path is scoped to platform leads or this workspace",
    "it deleted any tenant's lead by id");
  check(/data\.length === 0/.test(b), "deleteLead: a zero-row delete is reported");
  const cl = fnBody(ACTIONS, "convertLead");
  check(/requireRole\("manager"\)/.test(cl) && /linked\.length !== 1/.test(cl), "convertLead: manager (matches the new UPDATE policy) and the link update is counted");
}

/* ===================================================================== */
/* P0-11  team management                                                 */
/* ===================================================================== */
{
  for (const name of ["changeMemberRole", "removeMember"]) {
    const b = fnBody(ACTIONS, name);
    check(/requireRole\("admin"\)/.test(b), `${name}: admin or owner only`);
    check(/ownerCount\(sb, orgId\)\) <= 1/.test(b), `${name}: refuses to demote/remove the last owner`);
    check(/ROLE_RANK\[current\] \|\| 0\) > /.test(b), `${name}: cannot act on someone ranked above you`);
    check(/target === user\?\.id/.test(b), `${name}: not on yourself`);
    check(/\.select\("user_id"\)/.test(b) && /data\.length !== 1/.test(b) && /logActivity\(/.test(b), `${name}: row count checked and the change logged`);
  }
  check(/\(ROLE_RANK\[newRole\] \|\| 0\) > mine/.test(fnBody(ACTIONS, "changeMemberRole")), "changeMemberRole: cannot raise anyone above your own rank");
  const page = read("src/app/(app)/admin/page.tsx");
  const comp = read("src/components/admin-team.tsx");
  check(/<AdminTeam /.test(page) && /changeMemberRole/.test(comp) && /removeMember/.test(comp) && /window\.confirm\(/.test(comp),
    "/admin renders role controls and a confirmed Remove");
}

/* ===================================================================== */
/* RLS — the two new migrations, attacked as an ordinary role             */
/* ===================================================================== */
{
  const ORG = "aaaaaaaa-0000-0000-0000-000000000001";
  const OTHER = "bbbbbbbb-0000-0000-0000-000000000002";
  const U = {
    viewer: "11111111-0000-0000-0000-000000000001", analyst: "22222222-0000-0000-0000-000000000002",
    manager: "33333333-0000-0000-0000-000000000003", admin: "44444444-0000-0000-0000-000000000004",
    owner: "55555555-0000-0000-0000-000000000005", owner2: "66666666-0000-0000-0000-000000000006",
    stranger: "77777777-0000-0000-0000-000000000007",
  };
  const SCHEMA = `
    create table memberships (user_id uuid, org_id uuid, role text);
    create table leads (id uuid primary key default gen_random_uuid(), org_id uuid, name text, source text);
    create or replace function public.user_org_rank(p_org uuid) returns int language sql stable security definer as $$
      select coalesce(max(case m.role when 'owner' then 5 when 'admin' then 4 when 'manager' then 3
               when 'analyst' then 2 when 'viewer' then 1 else 0 end), 0)
        from memberships m where m.user_id = nullif(current_setting('app.uid', true), '')::uuid and m.org_id = p_org; $$;
    create or replace function public.user_org_ids() returns setof uuid language sql stable security definer as $$
      select org_id from memberships where user_id = nullif(current_setting('app.uid', true), '')::uuid; $$;
    create role authenticated nologin;
    create role app_user nologin;
    grant authenticated to app_user;
    grant usage on schema public to app_user;
    grant select, insert, update, delete on all tables in schema public to app_user;
    grant execute on all functions in schema public to app_user;
  `;
  /* The policies as the repo leaves them today (migration_leads_orgid.sql + 2026_rls_privilege_fix.sql). */
  const LEGACY = `
    alter table leads enable row level security;
    create policy "auth read leads" on leads for select to authenticated using (org_id in (select user_org_ids()));
    create policy "auth delete leads" on leads for delete to authenticated using (org_id in (select user_org_ids()));
    alter table memberships enable row level security;
    create policy "admins read members" on memberships for select using (org_id in (select user_org_ids()));
    create policy "admins update members" on memberships for update
      using (user_org_rank(org_id) >= 4)
      with check (user_org_rank(org_id) >= 4 and (lower(role::text) <> 'owner' or user_org_rank(org_id) >= 5));
    create policy "admins remove members" on memberships for delete
      using (user_org_rank(org_id) >= 4 and (lower(role::text) <> 'owner' or user_org_rank(org_id) >= 5));
  `;
  const leadsMig = read("supabase/migrations/2026_zzzz_b_leads_rank_gates.sql");
  const memberMig = read("supabase/migrations/2026_zzzz_b_member_rank_gates.sql");
  check(/select policyname[\s\S]*from pg_policies/i.test(leadsMig) && /select policyname[\s\S]*from pg_policies/i.test(memberMig),
    "migrations: both end with a verify select");
  check(!/\bdrop table\b|\btruncate\b|\bdelete from\b/i.test(leadsMig + memberMig), "migrations: non-destructive (no drop table / truncate / delete)");

  const build = async (withMigration) => {
    const db = new PGlite();
    await db.exec(SCHEMA);
    await db.exec(LEGACY);
    for (const [role, uid] of Object.entries(U)) {
      if (role === "stranger") { await db.query(`insert into memberships values ($1,$2,'owner')`, [uid, OTHER]); continue; }
      await db.query(`insert into memberships values ($1,$2,$3)`, [uid, ORG, role.replace(/\d$/, "")]);
    }
    await db.query(`insert into leads (org_id, name) values ($1,'A'),($1,'B'),($1,'C'),($2,'X'),(null,'platform')`, [ORG, OTHER]);
    if (withMigration) { await db.exec(leadsMig); await db.exec(memberMig); }
    await db.exec(`alter table leads force row level security; alter table memberships force row level security;`);
    return db;
  };
  const as = async (db, who, sql, params = []) => {
    await db.exec(`reset role;`);
    await db.query(`select set_config('app.uid', $1, false)`, [U[who]]);
    await db.exec(`set role app_user;`);
    /* A WITH CHECK violation raises (42501) rather than matching zero rows — both are a refusal. */
    try { const r = await db.query(sql, params); return /^\s*select/i.test(sql) ? r.rows.length : (r.affectedRows ?? 0); }
    catch (e) { if (String(e?.code) === "42501") return 0; throw e; }
    finally { await db.exec(`reset role;`); }
  };

  /* BEFORE: the holes reproduce. */
  {
    const db = await build(false);
    check(await as(db, "viewer", `delete from leads where name = 'A'`) === 1, "rls BEFORE: a viewer CAN delete a lead (the bug)");
    check(await as(db, "manager", `update leads set source = 'x · converted' where name = 'B'`) === 0, "rls BEFORE: no UPDATE policy — Make customer's update hits 0 rows (the bug)");
    check(await as(db, "admin", `update memberships set role = 'viewer' where user_id = $1`, [U.owner2]) === 1, "rls BEFORE: an admin CAN demote an owner (the bug)");
    await db.close();
  }
  /* AFTER. */
  {
    const db = await build(true);
    check(await as(db, "viewer", `delete from leads where name = 'A'`) === 0, "rls: a viewer cannot delete a lead");
    check(await as(db, "analyst", `delete from leads where name = 'A'`) === 0, "rls: an analyst cannot delete a lead");
    check(await as(db, "analyst", `update leads set source = 'x' where name = 'A'`) === 0, "rls: an analyst cannot update a lead");
    check(await as(db, "manager", `update leads set source = 'lead · converted' where name = 'B'`) === 1, "rls: a manager can mark a lead converted");
    check(await as(db, "manager", `delete from leads where name = 'C'`) === 1, "rls: a manager can delete a lead");
    check(await as(db, "owner", `update leads set source = 'x' where name = 'X'`) === 0 && await as(db, "owner", `delete from leads where name = 'X'`) === 0,
      "rls: nobody touches another workspace's leads");
    check(await as(db, "owner", `delete from leads where name = 'platform'`) === 0, "rls: platform leads (org_id null) are not deletable by a tenant");
    check(await as(db, "viewer", `select id from leads where org_id = $1`, [ORG]) >= 1, "rls: reads are unchanged");

    check(await as(db, "admin", `update memberships set role = 'viewer' where user_id = $1`, [U.owner2]) === 0, "rls: an admin can no longer demote an owner");
    check(await as(db, "admin", `update memberships set role = 'manager' where user_id = $1`, [U.analyst]) === 1, "rls: an admin can still change an analyst's role");
    check(await as(db, "admin", `update memberships set role = 'owner' where user_id = $1`, [U.manager]) === 0, "rls: an admin still cannot promote to owner");
    check(await as(db, "owner", `update memberships set role = 'admin' where user_id = $1`, [U.owner2]) === 1, "rls: an owner can change another owner's role");
    check(await as(db, "manager", `update memberships set role = 'viewer' where user_id = $1`, [U.analyst]) === 0, "rls: a manager cannot change roles");
    await db.close();
  }
}

/* ===================================================================== */
/* P1 — cheaper guards                                                    */
/* ===================================================================== */
{
  const wf = strip(read("src/app/(app)/workflows/page.tsx"));
  check(!/"event"/.test(wf), "/workflows: no 'event' trigger (nothing runs one)");
  check(/<textarea name="steps"/.test(wf) && !/comma-separated/i.test(wf), "/workflows: steps are one per line, not comma-separated");
  const aw = fnBody(ACTIONS, "addWorkflow");
  check(/split\(\/\\r\?\\n\/\)/.test(aw) && !/split\(","\)/.test(aw) && /validateWorkflowPlan\(/.test(aw), "addWorkflow: splits on lines and validates with validateWorkflowPlan");
  const sched = strip(read("src/lib/workflow-schedule.ts"));
  check(/orgsWithCapability\(rows\.map/.test(sched) && /for \(const wf of eligible\)/.test(sched), "scheduled workflows run only for entitled workspaces with the workflows capability");
  const ap = strip(read("src/app/(app)/approvals/page.tsx"));
  check(!/label="Approve & send"/.test(ap) && /label="Mark as sent"/.test(ap) && !/Approve to send to the supplier/.test(ap), "/approvals: purchase orders say 'Mark as sent' (no email exists)");
  const ra = fnBody(ACTIONS, "runAutopilot");
  check(/refundIfCharged\(gate, "pulse"\)/.test(ra) && /engineFailed/.test(ra) && /insErr/.test(ra), "runAutopilot: refunds on engine failure or a failed save, and checks the insert");
  const dt = fnBody(ACTIONS, "deleteTask");
  check(/requireRole\("manager"\)/.test(dt) && /data\.length === 0/.test(dt), "deleteTask: manager and row count");
  const ci = fnBody(ACTIONS, "cancelInvite");
  check(/if \(error\)/.test(ci) && /data\.length === 0/.test(ci), "cancelInvite: error and row count checked");
  check(/updateGoal/.test(ACTIONS) && /key=\{`unit:\$\{draftKey\}`\}/.test(read("src/components/goals-tracker.tsx")), "goals: updateGoal exists; unit/lower-is-better follow the metric dropdown");
  const col = strip(read("src/lib/collections/index.ts"));
  const fc = col.slice(col.indexOf("export async function findCandidates"), col.indexOf("export type PrepareResult"));
  check(!/\.limit\(500\)/.test(fc) && /pageAll/.test(fc) && /\.in\("invoice_id", ids\.slice/.test(fc), "findCandidates: every open invoice, stable order; threads only for those ids");
}

console.log(`\nactions fixes: ${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log("\nFAILURES:"); fails.forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
console.log("  Numbers never overwrite, plans gate at use, one approval sends one message, and RLS agrees with the app.");
