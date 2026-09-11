/*
  WHO CAN EXECUTE EACH SECURITY DEFINER FUNCTION *AFTER THE LAST MIGRATION RUNS*.

  WHY THIS EXISTS, WHICH IS NOT THE SAME QUESTION AS WHAT IT CHECKS.

  test-definer-grants.cjs proves the sweep in 2026_definer_grant_sweep.sql
  works. It does that by building synthetic functions in PGlite and applying
  that ONE file. So it can only ever answer "does the sweep close what it is
  pointed at" — and it passed, cleanly, while production had a hole.

  The hole: 2026_zz_aggregate_ist_overdue.sql ends with a grant of
  cortex_aggregate to `authenticated`. That function is SECURITY DEFINER, takes
  the org id as a PARAMETER, and checks no membership — so the grant published
  any workspace's twelve months of revenue, receivables, payables, stock value,
  headcount and total monthly payroll to any signed-in user who knew that org's
  UUID. Org UUIDs are not secret; the org switcher ships them to the browser.

  Two earlier files had already closed it. 2026_tenancy_aggregate.sql revoked
  it deliberately, with a comment arguing the case. The sweep would have caught
  it too — cortex_aggregate is not on the sweep's allowlist. Both lost anyway,
  because migrations apply in FILENAME ORDER and `zz` sorts last. The last
  writer wins, and no test in the suite was looking at the last writer.

  THE ONE THING THIS FILE ASSERTS, THEREFORE:

  replay every grant and revoke in the whole migrations directory, in the order
  Postgres will apply them, and look at the FINAL state. Not any single file's
  intent — the resulting privilege. A file that re-opens something an earlier
  file closed fails here no matter how good the earlier file's comment was.

  WHY A TEXT REPLAY RATHER THAN A REAL DATABASE.

  Applying the full migration set to PGlite needs the whole Supabase preamble
  (auth schema, extensions, storage) and would fail for reasons unrelated to
  privileges — a test that is skipped in CI proves nothing. The semantics that
  actually matter here are small and exact: grants and revokes on named
  functions, applied in order, last one wins, plus one dynamic sweep. That is
  modelled below and mutation-tested at the bottom of this file.
*/
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "supabase/migrations");

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) pass++;
  else { fail++; failures.push(`${name}${detail ? " — " + detail : ""}`); }
}

/*
  THE TEST'S OWN ALLOWLIST, deliberately NOT read from the sweep migration.

  If this were parsed out of 2026_definer_grant_sweep.sql the test would agree
  with whatever that file happened to say, including a name someone added to it
  by mistake. Kept separate, adding a definer function to the reachable set
  requires editing two files and writing down why — here, in front of a human.
*/
const REACHABLE_ON_PURPOSE = {
  user_org_rank: "RLS helper. Every tenant policy calls it through the cookie client; it resolves auth.uid() itself and answers only about the caller.",
  user_org_ids: "RLS helper, same reasoning.",
  api_ingest: "Authenticates on an API key it is handed, not on the session. Reachable by anon on purpose.",
  api_metrics: "Same — API key.",
  public_report: "Authenticates on a share token. Anon reachability is the feature.",
  seed_demo_data: "Called with the user's client, and checks membership itself (2026_seed_rpc_lockdown.sql).",
  seed_demo_customers: "Same.",
  cortex_collections_enabled: "Reads one global boolean. No org parameter, no writes, same answer for everyone.",
  cortex_norm_name: "Pure function over its argument. No table access.",
  /*
    These two MOVE MONEY — they decide whose credit balance a workspace spends —
    so they get more than a line.

    They must be definer: the check spans two organizations (the firm and the
    client) and no single RLS policy can express "is this caller an ADMIN of the
    claiming org AND a member of the claimed one". They must be reachable by
    `authenticated` because a CA partner, not a service process, is the person
    pressing the button.

    What makes that safe is that each resolves auth.uid() itself and refuses
    before writing anything: rank in the firm must be owner/admin, membership of
    the client must exist, the firm's plan must include pooling, and the client
    cap applies. The firm id is taken from the SESSION by the calling server
    action, never from the request, so it is not attacker-controlled.

    Verified by scripts/test-practice-pool-sql.cjs against real Postgres, which
    runs the two attacks this would otherwise open — pointing at a rich
    stranger's balance, and claiming a workspace nobody from the firm belongs to
    — and kills the mutants that remove either check.
  */
  cortex_practice_claim: "Resolves auth.uid() itself; requires owner/admin rank in the firm AND membership of the client before writing the pool link. Attacks covered in test-practice-pool-sql.cjs.",
  cortex_practice_release: "Same, and deliberately more permissive: an admin of EITHER side may break the link, because a business must be able to stop funding without its accountant's cooperation. Releasing only ever makes a workspace pay for itself.",
};

/* ------------------------------------------------------------------ parsing */

/** Strip /* *\/ and -- comments so commented-out SQL is never counted as real. */
function stripSql(src) {
  let out = "", i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; out += " "; continue; }
    if (c === "-" && d === "-") { const e = src.indexOf("\n", i); i = e < 0 ? n : e; continue; }
    if (c === "'") {
      const start = i; i++;
      while (i < n) { if (src[i] === "'" && src[i + 1] === "'") { i += 2; continue; } if (src[i] === "'") { i++; break; } i++; }
      out += src.slice(start, i); continue;
    }
    out += c; i++;
  }
  return out;
}

/*
  Dollar-quoted function bodies contain the word "grant" in comments and in
  `execute format('revoke ...')`. Blank them out before looking for statements,
  or the sweep's own dynamic SQL is read as a literal grant to nobody.
  The bodies are kept only long enough to detect `security definer`, which
  appears in the HEADER, before the body opens.
*/
function blankDollarBodies(src) {
  return src.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, (m) => " ".repeat(Math.min(m.length, 8)));
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
check("there are migrations to replay", files.length > 5, `found ${files.length}`);

/** name -> Set of roles holding EXECUTE. Only SECURITY DEFINER fns are tracked. */
const acl = new Map();
const definer = new Set();
const declaredIn = new Map();

/*
  Supabase ships `alter default privileges in schema public grant execute on
  functions to postgres, anon, authenticated, service_role`. So a NEWLY created
  function starts reachable by authenticated — that is the whole reason the
  sweep had to exist. `create or replace` over an existing function preserves
  its ACL and must NOT reset it; replaying in order is what lets us tell the
  two apart.
*/
const FRESH = () => new Set(["anon", "authenticated", "service_role"]);

const RE_CREATE = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(([^;]*?)\)\s*returns[\s\S]{0,600}?(?:\bas\b|\blanguage\b)/gi;
const RE_GRANT = /\bgrant\s+(?:execute|all)(?:\s+privileges)?\s+on\s+function\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\([^)]*\)\s*to\s+([^;]+);/gi;
const RE_REVOKE = /\brevoke\s+(?:execute|all)(?:\s+privileges)?\s+on\s+function\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\([^)]*\)\s*from\s+([^;]+);/gi;

const roles = (s) => s.split(",").map((r) => r.trim().toLowerCase().replace(/;$/, "")).filter(Boolean);

for (const f of files) {
  const raw = stripSql(fs.readFileSync(path.join(DIR, f), "utf8"));
  const flat = blankDollarBodies(raw);

  /*
    Statements must be replayed in the order they appear IN THE FILE, not
    grouped by kind — 2026_zz creates the function and then grants, and a file
    could equally revoke and then re-grant. Collect with positions, sort once.
  */
  const events = [];

  // Detect definer-ness on the un-blanked source: the header sits before $$.
  for (const m of raw.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(([\s\S]{0,4000}?)\blanguage\b([\s\S]{0,200}?)(?:\bas\b|\$)/gi)) {
    const header = (m[2] || "") + (m[3] || "");
    events.push({ at: m.index, kind: "create", fn: m[1].toLowerCase(), secdef: /security\s+definer/i.test(header) });
  }
  for (const m of flat.matchAll(RE_GRANT)) events.push({ at: m.index, kind: "grant", fn: m[1].toLowerCase(), roles: roles(m[2]) });
  for (const m of flat.matchAll(RE_REVOKE)) events.push({ at: m.index, kind: "revoke", fn: m[1].toLowerCase(), roles: roles(m[2]) });

  // The dynamic sweep. Modelled by what it does, not by its text.
  const sweepAt = raw.search(/prosecdef[\s\S]{0,400}?proname\s*<>\s*all\s*\(\s*allowed\s*\)/i);
  if (sweepAt >= 0) events.push({ at: sweepAt, kind: "sweep" });

  events.sort((a, b) => a.at - b.at);

  for (const e of events) {
    if (e.kind === "create") {
      if (e.secdef) { definer.add(e.fn); if (!declaredIn.has(e.fn)) declaredIn.set(e.fn, f); }
      else definer.delete(e.fn); // a rewrite to SECURITY INVOKER is a real change
      if (!acl.has(e.fn)) acl.set(e.fn, FRESH());   // create or replace preserves the ACL
    } else if (e.kind === "grant") {
      const s = acl.get(e.fn) || FRESH(); acl.set(e.fn, s);
      for (const r of e.roles) { if (r === "public") { s.add("anon"); s.add("authenticated"); } s.add(r); }
    } else if (e.kind === "revoke") {
      const s = acl.get(e.fn) || FRESH(); acl.set(e.fn, s);
      for (const r of e.roles) { if (r === "public") { s.delete("anon"); s.delete("authenticated"); } s.delete(r); }
    } else if (e.kind === "sweep") {
      for (const fn of definer) {
        if (fn in REACHABLE_ON_PURPOSE) continue;
        const s = acl.get(fn); if (!s) continue;
        s.delete("anon"); s.delete("authenticated"); s.add("service_role");
      }
    }
  }
}

/* ------------------------------------------------------------------- assert */

check("the replay found the definer functions", definer.size >= 8, `found ${definer.size}`);
check("it found cortex_aggregate specifically", definer.has("cortex_aggregate"),
  "if the parser stops seeing this function the test goes quiet rather than failing");

const exposed = [];
for (const fn of [...definer].sort()) {
  if (fn in REACHABLE_ON_PURPOSE) continue;
  const s = acl.get(fn) || new Set();
  if (s.has("authenticated") || s.has("anon")) {
    exposed.push(`${fn} (declared in ${declaredIn.get(fn)}) is reachable by ${[...s].filter((r) => r === "anon" || r === "authenticated").join(" and ")}`);
  }
}

check(
  "NO security-definer function ends up reachable by anon or authenticated",
  exposed.length === 0,
  exposed.join("; ") + " — definer rights bypass RLS, so for these the grant IS the access control; there is no policy underneath to catch the mistake",
);

/*
  The specific regression, named. The check above is the general one and would
  catch this; this one exists so the failure message says what was lost rather
  than just listing a function name.
*/
const aggAcl = acl.get("cortex_aggregate") || new Set();
check(
  "cortex_aggregate is service-role only after every migration has run",
  !aggAcl.has("authenticated") && !aggAcl.has("anon"),
  "granted to authenticated, any signed-in user can POST /rest/v1/rpc/cortex_aggregate with another workspace's UUID and receive its revenue, receivables and total payroll",
);
check(
  "...and service_role can still call it, or the dashboard goes blank",
  aggAcl.has("service_role"),
  "lib/metrics.ts:94 calls this with the service client on every dashboard load",
);

/*
  THE ALLOWLIST MUST STAY SMALL, and its members must be the ones that can
  defend themselves. Each name here is either checking a credential it was
  handed or resolving auth.uid() on its own. If one grows an org parameter it
  acts on, this list is where the review has to happen.
*/
/*
  Reported, NOT failed. Several of these were created by the batch files in
  supabase/ rather than by anything in supabase/migrations, and this replay
  deliberately reads only the ordered migration directory — those root files
  are historical and are not part of the run whose final state we care about.
  So absence here means "defined elsewhere", not "stale", and failing on it
  would train someone to delete a name that is doing real work.
*/
const notSeen = Object.keys(REACHABLE_ON_PURPOSE).filter((fn) => !definer.has(fn));
if (notSeen.length) console.log(`  note: allowlisted but not declared in migrations/ (defined in the supabase/ batch files): ${notSeen.join(", ")}`);

/* ---------------------------------------------------------- mutation checks */
/*
  A test that cannot fail is worse than no test, and four in this repo already
  turned out to be exactly that. So: re-run the replay against a copy of the
  real files with the bug put back, and require that it FAILS.
*/
function replayWith(mutate) {
  const acl2 = new Map(); const definer2 = new Set();
  for (const f of files) {
    let raw = stripSql(mutate(f, fs.readFileSync(path.join(DIR, f), "utf8")));
    const flat = blankDollarBodies(raw);
    const events = [];
    for (const m of raw.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(([\s\S]{0,4000}?)\blanguage\b([\s\S]{0,200}?)(?:\bas\b|\$)/gi))
      events.push({ at: m.index, kind: "create", fn: m[1].toLowerCase(), secdef: /security\s+definer/i.test((m[2] || "") + (m[3] || "")) });
    for (const m of flat.matchAll(RE_GRANT)) events.push({ at: m.index, kind: "grant", fn: m[1].toLowerCase(), roles: roles(m[2]) });
    for (const m of flat.matchAll(RE_REVOKE)) events.push({ at: m.index, kind: "revoke", fn: m[1].toLowerCase(), roles: roles(m[2]) });
    const sweepAt = raw.search(/prosecdef[\s\S]{0,400}?proname\s*<>\s*all\s*\(\s*allowed\s*\)/i);
    if (sweepAt >= 0) events.push({ at: sweepAt, kind: "sweep" });
    events.sort((a, b) => a.at - b.at);
    for (const e of events) {
      if (e.kind === "create") { if (e.secdef) definer2.add(e.fn); else definer2.delete(e.fn); if (!acl2.has(e.fn)) acl2.set(e.fn, FRESH()); }
      else if (e.kind === "grant") { const s = acl2.get(e.fn) || FRESH(); acl2.set(e.fn, s); for (const r of e.roles) { if (r === "public") { s.add("anon"); s.add("authenticated"); } s.add(r); } }
      else if (e.kind === "revoke") { const s = acl2.get(e.fn) || FRESH(); acl2.set(e.fn, s); for (const r of e.roles) { if (r === "public") { s.delete("anon"); s.delete("authenticated"); } s.delete(r); } }
      else if (e.kind === "sweep") { for (const fn of definer2) { if (fn in REACHABLE_ON_PURPOSE) continue; const s = acl2.get(fn); if (!s) continue; s.delete("anon"); s.delete("authenticated"); s.add("service_role"); } }
    }
  }
  const bad = [...definer2].filter((fn) => !(fn in REACHABLE_ON_PURPOSE) && (acl2.get(fn)?.has("authenticated") || acl2.get(fn)?.has("anon")));
  return bad;
}

const REGRANT = "grant execute on function public.cortex_aggregate(uuid) to authenticated, service_role;";
const restoreBug = (src) => src.replace(
  /revoke execute on function public\.cortex_aggregate\(uuid\)[^;]*;\s*grant\s+execute on function public\.cortex_aggregate\(uuid\)[^;]*;/i,
  REGRANT);

/*
  1a. Put the original bug back AND take away the final lockdown. This is the
      state the repository was actually in, and the replay must call it out —
      otherwise the test agrees with a broken tree and proves nothing.
*/
const bare = replayWith((f, src) => {
  if (f === "2026_zz_aggregate_ist_overdue.sql") return restoreBug(src);
  if (f === "2026_zzz_definer_final_lockdown.sql") return "-- removed for this mutation\n";
  return src;
});
check("MUTATION: the original bug, with the final lockdown removed, is caught",
  bare.includes("cortex_aggregate"),
  "the replay does not notice a later file re-granting, so it would not have caught the bug it was written for");

/*
  1b. Put the bug back but LEAVE the final lockdown in place. Now it must NOT
      be reported — because 2026_zzz_definer_final_lockdown.sql sweeps it up
      afterwards. This is the assertion that the new migration is load-bearing
      rather than decorative: if someone deletes it, 1a and 1b swap answers.
*/
const swept = replayWith((f, src) => f === "2026_zz_aggregate_ist_overdue.sql" ? restoreBug(src) : src);
check("MUTATION: ...and the final lockdown alone would have closed it anyway",
  !swept.includes("cortex_aggregate"),
  "2026_zzz_definer_final_lockdown.sql did not sweep up a re-granted definer function, so it is not the backstop it claims to be");

// 2. A brand-new definer function added after the sweep, with no revoke at all.
const withNewFn = replayWith((f, src) =>
  f === files[files.length - 1]
    ? src + "\ncreate function public.zzz_new_definer_fn(p_org uuid) returns void language plpgsql security definer as $q$ begin end $q$;\n"
    : src);
check("MUTATION: a new definer function added after the sweep is caught",
  withNewFn.includes("zzz_new_definer_fn"),
  "Supabase's default privileges grant EXECUTE to authenticated on creation, so silence here means the next one ships open");

/* ------------------------------------------------------------------ report */
console.log(`\ndefiner ACL after the last migration: ${pass} passed, ${fail} failed`);
console.log(`  replayed ${files.length} migrations; ${definer.size} security-definer functions; ${Object.keys(REACHABLE_ON_PURPOSE).length} reachable on purpose.`);
if (failures.length) {
  console.log("\n" + failures.map((f) => "  ✗ " + f).join("\n"));
  process.exit(1);
}
console.log("  Every other definer function is service-role only at the end of the run, not merely at the end of its own file.");
