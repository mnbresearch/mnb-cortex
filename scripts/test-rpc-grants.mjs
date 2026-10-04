/*
  A FUNCTION THE SERVER CALLS MUST BE ONE THE SERVER IS ALLOWED TO CALL.

  ============================================================================
  THE BUG THIS EXISTS BECAUSE OF
  ============================================================================

  2026_zzzo_fn_body_probe.sql creates cortex_fn_has, the helper /api/health
  uses to tell an applied `create or replace function` from its predecessor.
  It ended:

      revoke execute on function cortex_fn_has(text, text)
        from public, anon, authenticated;
      -- The health endpoint calls this with the service role.

  The comment describes the caller. It does not grant the caller anything. A
  brand-new function's only EXECUTE privilege is the implicit grant to PUBLIC;
  revoke that and whether service_role can still call it depends on a default-
  privileges rule somewhere else — which is not a thing to leave to chance on
  the one check whose entire job is to notice an unapplied migration.

  Every other new function in these migrations pairs the revoke with
  `grant execute ... to service_role` on the very next line. cortex_fn_has did
  not, and neither did cron_cursor_advance, which the nightly cron calls on
  every run.

  The failure is quiet in the worst way: the status page says
  "cannot verify — run this file", the operator runs the file correctly, and
  the message does not change, because what is missing is the grant and not
  the function. The product spends that whole time telling someone to do
  something they have already done.

  ============================================================================
  THE RULE
  ============================================================================

  If src/ calls a function through `.rpc()`, and any .sql file revokes EXECUTE
  on it from PUBLIC, then some .sql file must grant EXECUTE on it to
  service_role.

  Scoped two ways, both deliberately:

  · TO FUNCTIONS THE SERVER CALLS. user_org_rank is revoked from public and
    anon and keeps `authenticated` on purpose — it is the membership check
    that RLS policies evaluate as the signed-in user, and service_role never
    calls it. A rule that demanded a service_role grant there would be
    demanding the wrong thing.

  · ACROSS FILES, NOT WITHIN ONE. `create or replace function` PRESERVES
    existing privileges, so a later migration that replaces an already-granted
    function does not need to re-grant it, and expire_lapsed_subscriptions is
    exactly that case: created and granted in 2026_hardening.sql, replaced
    twice since. Demanding a redundant line in each would train people to
    paste something they do not need, which is how a rule stops being read.

  What survives both scopings is the real invariant: a function the server
  calls, whose implicit PUBLIC grant has been taken away, has to have been
  given back to the server's role SOMEWHERE. cortex_fn_has and
  cron_cursor_advance were granted nowhere.

  Second rule, same subject from the other end: health.ts must not report an
  RPC failure as one named cause. Three codes, three different fixes.

  Run: node scripts/test-rpc-grants.mjs
*/
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fails = [];
const check = (cond, name, detail = "") => {
  if (cond) pass++;
  else fails.push(detail ? `${name} — ${detail}` : name);
};

/* ------------------------------------------------------------------ 1. SQL */

const SQL_DIRS = [join(ROOT, "supabase"), join(ROOT, "supabase/migrations")];
const sqlFiles = [];
for (const dir of SQL_DIRS) {
  for (const f of readdirSync(dir)) {
    if (f.endsWith(".sql")) sqlFiles.push(join(dir, f));
  }
}
check(sqlFiles.length > 20, "found the SQL files", `only ${sqlFiles.length}`);

/*
  Strip block comments before matching. Several of these files quote old,
  deliberately-wrong SQL in their headers to explain what was fixed; matching
  that prose as if it were a statement is a mistake this repo has already made
  once, in test-ist-and-finite.mjs, and it produced a confident false report.
*/
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");

/* `create ... function public.name(` or `create ... function name(` */
const CREATE_RE = /\bcreate\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi;
const REVOKE_RE = /\brevoke\s+execute\s+on\s+function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\([^)]*\)\s*(?:\n\s*)?from\s+([^;]*);/gi;
const GRANT_RE = /\bgrant\s+execute\s+on\s+function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\([^)]*\)\s*(?:\n\s*)?to\s+([^;]*);/gi;

const names = (s) => s.toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);

/* Which functions does the server actually call? */
const srcFiles = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) srcFiles.push(p);
  }
})(join(ROOT, "src"));

const calledByServer = new Set();
for (const f of srcFiles) {
  for (const m of readFileSync(f, "utf8").matchAll(/\.rpc\(\s*"([a-z_][a-z0-9_]*)"/g)) {
    calledByServer.add(m[1].toLowerCase());
  }
}
check(calledByServer.size > 15, "collected the RPCs the server calls", `only ${calledByServer.size}`);
check(calledByServer.has("cortex_fn_has"), "cortex_fn_has is seen as server-called");
check(calledByServer.has("cron_cursor_advance"), "cron_cursor_advance is seen as server-called");

/*
  MIGRATIONS AND HAND-RUN FILES ARE TWO DIFFERENT QUESTIONS.

  The first version of this pooled every .sql file into one set of grants, so
  "granted somewhere" counted — and deleting the grant from
  2026_cron_fairness.sql SURVIVED, because the identical line in RUN-scale.sql
  still satisfied it. The rule read as if it were checking the migration and
  was checking neither.

  · supabase/migrations/ has to stand alone: it is what builds a database from
    nothing, and a grant that exists only in a hand-run paste record is not in
    it.

  · a RUN-*.sql is pasted on its own into a live database, so whatever it
    leaves behind IS the privilege state — unless the function was already
    granted by an applied migration, since `create or replace` preserves
    privileges and re-revoking PUBLIC does not touch service_role. That
    exemption is why RUN-NOW-renewal-grace-and-probe.sql may re-revoke
    expire_lapsed_subscriptions without re-granting it.
*/
const migrationFiles = sqlFiles.filter((f) => f.includes("/migrations/"));
const runFiles = sqlFiles.filter((f) => !f.includes("/migrations/"));
check(migrationFiles.length > 10 && runFiles.length > 2, "both file kinds are present",
  `${migrationFiles.length} migrations, ${runFiles.length} run files`);

function scan(files, mutate = (s) => s) {
  const revoked = new Set();
  const granted = new Set();
  for (const file of files) {
    const src = mutate(stripComments(readFileSync(file, "utf8")), file);
    for (const m of src.matchAll(REVOKE_RE)) {
      if (names(m[2]).includes("public")) revoked.add(m[1].toLowerCase());
    }
    for (const m of src.matchAll(GRANT_RE)) {
      if (names(m[2]).includes("service_role")) granted.add(m[1].toLowerCase());
    }
  }
  return { revoked, granted };
}

/* Rule A — migrations alone must leave every server-called RPC executable. */
function migrationViolations(mutate) {
  const { revoked, granted } = scan(migrationFiles, mutate);
  return [...revoked].filter((fn) => calledByServer.has(fn) && !granted.has(fn)).sort();
}

/* Rule B — a hand-run file must not leave one unexecutable either. */
function runFileViolations(mutate) {
  const fromMigrations = scan(migrationFiles, mutate).granted;
  const out = [];
  for (const file of runFiles) {
    const { revoked, granted } = scan([file], mutate);
    for (const fn of revoked) {
      if (!calledByServer.has(fn)) continue;
      if (granted.has(fn) || fromMigrations.has(fn)) continue;
      out.push(`${basename(file)}:${fn}`);
    }
  }
  return out.sort();
}

const liveA = migrationViolations();
check(liveA.length === 0, "migrations alone grant service_role every RPC they revoke from PUBLIC",
  liveA.length ? `ungranted: ${liveA.join(", ")}` : "");

const liveB = runFileViolations();
check(liveB.length === 0, "no hand-run file leaves an RPC revoked and ungranted",
  liveB.length ? liveB.join(", ") : "");

/* The rule has to be able to examine something, or zero failures means nothing. */
{
  const inScope = [...scan(migrationFiles).revoked].filter((fn) => calledByServer.has(fn));
  check(inScope.length >= 3, "the rule is actually looking at server-called functions",
    `only ${inScope.length}: ${inScope.join(", ")}`);
}

/*
  THE MUTATIONS. Delete each grant that this bug taught us to add, and require
  the rule to report that exact function. A rule proved only by passing is not
  proved at all — two assertions in test-net-guard.mjs survived their mutations
  before being tightened, and they looked just as reasonable as these.
*/
for (const fn of ["cortex_fn_has", "cron_cursor_advance"]) {
  const re = new RegExp(`grant\\s+execute\\s+on\\s+function\\s+(?:public\\.)?${fn}[^;]*;`, "gi");
  /*
    Mutate ONLY the migrations. The earlier version stripped the grant from
    every file at once, which made this assertion pass while deleting the line
    from 2026_cron_fairness.sql alone survived — the copy in RUN-scale.sql was
    covering for it. A mutation has to be the edit someone would actually make.
  */
  const onlyMigrations = (s, file) => (file.includes("/migrations/") ? s.replace(re, "") : s);
  const found = migrationViolations(onlyMigrations);
  check(found.includes(fn), `removing the ${fn} grant from migrations is caught`,
    `rule reported [${found.join(", ")}] — it cannot see the defect it was written for`);
}

/* And the inverse: the scoping must not be so loose that nothing can pass. */
check(!migrationViolations().includes("user_org_rank"),
  "user_org_rank is not demanded to have a service_role grant",
  "it is the RLS membership check, evaluated as the signed-in user");
check(!migrationViolations().includes("expire_lapsed_subscriptions"),
  "a later replace of an already-granted function is not flagged",
  "create or replace preserves privileges");

/* ------------------------------------------------------- 2. the diagnosis */

/*
  rpcFailure() is EXECUTED here, not grepped. A test that greps for the string
  "42501" passes against a function that mentions it in a comment and never
  branches on it — the exact way two assertions in test-net-guard.mjs survived
  their mutations before being tightened.

  It is lifted out of health.ts and transpiled, because health.ts is a server
  module with a large import graph and rpcFailure is pure. If the signature
  ever changes shape enough that this extraction fails, the test fails loudly,
  which is the correct outcome.
*/
const healthSrc = readFileSync(join(ROOT, "src/lib/health.ts"), "utf8");
const start = healthSrc.indexOf("function rpcFailure(");
check(start !== -1, "found rpcFailure in health.ts");

let rpcFailure = null;
if (start !== -1) {
  /*
    Find the BODY's opening brace, not the first brace after the name. The
    first attempt at this took `healthSrc.indexOf("{", start)`, which lands
    inside the parameter's inline object type — `{ code?: string; … }` — and
    closed there, extracting a one-line fragment that transpiled to nothing
    and silently defined no function. It failed loudly only because the next
    assertion required the result to be callable.
  */
  let i = healthSrc.indexOf("(", start), parens = 0;
  for (; i < healthSrc.length; i++) {
    if (healthSrc[i] === "(") parens++;
    else if (healthSrc[i] === ")" && --parens === 0) { i++; break; }
  }
  const bodyStart = healthSrc.indexOf("{", i);          // past the return type
  let depth = 0, end = -1;
  for (let j = bodyStart; j < healthSrc.length; j++) {
    if (healthSrc[j] === "{") depth++;
    else if (healthSrc[j] === "}" && --depth === 0) { end = j + 1; break; }
  }
  const snippet = healthSrc.slice(start, end);
  const js = ts.transpileModule(snippet + "\nglobalThis.__rpcFailure = rpcFailure;", {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  // eslint-disable-next-line no-new-func
  new Function(js)();
  rpcFailure = globalThis.__rpcFailure;
}
check(typeof rpcFailure === "function", "rpcFailure extracted and executable");

if (typeof rpcFailure === "function") {
  const RUN = "2026_zzzo_fn_body_probe.sql";

  const missing = rpcFailure({ code: "PGRST202", message: "Could not find the function public.cortex_fn_has(p_name, p_needle) in the schema cache" }, RUN);
  const denied = rpcFailure({ code: "42501", message: "permission denied for function cortex_fn_has" }, RUN);
  const other = rpcFailure({ code: "57014", message: "canceling statement due to statement timeout" }, RUN);

  /*
    PGRST202 IS AMBIGUOUS, AND THE MESSAGE HAS TO SAY SO.

    The first version of this assertion required PGRST202 to read as "not
    installed". That encoded a false claim: PGRST202 means "not in PostgREST's
    schema cache", which is also what a freshly created function returns until
    the cache reloads. On 4 October the operator ran every file, saw the
    verify rows return true, and the status page still said NOT INSTALLED —
    because of this exact assertion's view of the world.

    So: PGRST202 must offer BOTH remedies, reload first (cheap, and the likely
    one right after a paste), and must not flatly assert absence. 42883 comes
    from Postgres itself and may say NOT INSTALLED.
  */
  check(/reload schema/.test(missing), "PGRST202 offers the schema-cache reload", missing);
  check(missing.includes(RUN), "PGRST202 names the file to run", missing);
  check(!/^NOT INSTALLED/i.test(missing),
    "PGRST202 does not flatly assert the function is absent", missing);
  const absent = rpcFailure({ code: "42883", message: "function cortex_fn_has(text, text) does not exist" }, RUN);
  check(/^NOT INSTALLED/i.test(absent) && absent.includes(RUN),
    "42883 (undefined_function from Postgres itself) reads as not installed", absent);
  check(missing !== absent, "PGRST202 and 42883 produce different messages");

  check(/grant|execute/i.test(denied) && /service_role/.test(denied),
    "42501 reads as a missing grant, not a missing migration", denied);
  check(!/^NOT INSTALLED/i.test(denied),
    "42501 is not reported as a missing migration", denied);

  /*
    THE ASSERTION THAT MATTERS. Before the fix every error produced the same
    sentence; three identical strings would have satisfied any test that only
    checked each one contained something plausible.
  */
  check(new Set([missing, denied, other]).size === 3,
    "the three causes produce three different messages",
    `got: ${JSON.stringify([missing, denied, other])}`);

  check(other.includes("statement timeout"),
    "an unrecognised failure passes through what the database actually said", other);

  /* No message at all must not become a blank sentence. */
  const silent = rpcFailure({ code: "", message: "" }, RUN);
  check(silent.trim().length > 20 && !/undefined|null/.test(silent),
    "a failure with no message still says something", silent);

  /* Text-only fallbacks, for a gateway that drops `code`. */
  check(/reload schema/.test(rpcFailure({ message: "Could not find the function public.x" }, RUN)),
    "recognises a schema-cache miss from the message alone");
  check(/service_role/.test(rpcFailure({ message: "permission denied for function x" }, RUN)),
    "recognises a denied grant from the message alone");
}

/*
  And the call sites: a message this careful is worthless if one branch still
  hard-codes the old sentence.
*/
check(!/cannot verify — run 2026_zzzo_fn_body_probe\.sql first/.test(healthSrc),
  "no probe hard-codes 'run the probe file' as the only cause");
check((healthSrc.match(/rpcFailure\(/g) || []).length >= 4,
  "every RPC probe routes its error through rpcFailure",
  "expected the helper plus three call sites");

/* ------------------------------------------------------------------ report */

console.log(`\n${fails.length ? "FAIL" : "PASS"}  rpc grants + probe diagnosis: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
