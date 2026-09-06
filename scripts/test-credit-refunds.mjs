/*
  Every billable AI route must give the credits back when it fails.

  WHY THIS TEST EXISTS. Twelve routes charged credits and then returned an
  error without refunding — /api/visibility burned 89 credits, the single most
  expensive action in the product, and answered "Visibility check failed —
  check the AI key." The correct pattern already existed in the repo
  (bank/analyze), which is what makes this a rule worth enforcing mechanically:
  it was not a missing idea, it was a missing line, twelve times.

  These are static checks over the source. They cannot prove a refund happens
  at runtime, and they do not pretend to: what they lock in is that a route
  which takes money has some refund path at all, and that the refund helper
  keeps the two properties that stop it doing damage of its own.

  COMMENT STRIPPING IS NOT OPTIONAL. Earlier versions of four other suites in
  this repo passed by matching the explanatory prose above the code they meant
  to check — including, on one memorable occasion, a comment describing that
  exact mistake. Every check below runs on code with comments removed.
*/
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) { pass++; }
  else { fail++; failures.push(`${name}${detail ? " — " + detail : ""}`); }
}

/** Remove block and line comments, and the contents of string literals. */
function strip(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === "/" && d === "/") { const e = src.indexOf("\n", i); i = e < 0 ? n : e; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; i++;
      while (i < n) { if (src[i] === "\\") { i += 2; continue; } if (src[i] === q) { i++; break; } i++; }
      out += '""';
      continue;
    }
    out += c; i++;
  }
  return out;
}

/*
  Comments removed, STRING LITERALS KEPT.

  strip() above blanks every string, which is right for structural checks and
  catastrophic for any assertion that cares WHICH string. The first version of
  the mode check below matched `refundIfCharged(gate, "")` as a fallback —
  because that is what strip() had turned every call into — so the mode column
  of the table matched unconditionally. Proven by mutation: pointing
  visibility's 89-credit refund at the 8-credit "chat" mode still passed.
*/
function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === "/" && d === "/") { const e = src.indexOf("\n", i); i = e < 0 ? n : e; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; const start = i; i++;
      while (i < n) { if (src[i] === "\\") { i += 2; continue; } if (src[i] === q) { i++; break; } i++; }
      out += src.slice(start, i);          // the literal, verbatim
      continue;
    }
    out += c; i++;
  }
  return out;
}

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (e === "route.ts") acc.push(p);
  }
  return acc;
}

const routes = walk("src/app/api");

/*
  Routes that legitimately call chargeForMode but need no refund path.

  Kept deliberately short and justified one by one — an allowlist that grows
  without argument is how a rule stops being a rule.
*/
const EXEMPT = new Set([
  // Charges, then streams. A pre-stream failure IS refunded (see the catch);
  // the file is listed here only because its refund lives in a catch that
  // returns a Response rather than NextResponse, which the shape check below
  // does not recognise. It does call refundIfCharged.
]);

// ---------------------------------------------------------------- the rule
let charging = 0;
for (const f of routes) {
  const src = strip(readFileSync(f, "utf8"));
  if (!/\bchargeForMode\s*\(/.test(src)) continue;
  charging++;
  if (EXEMPT.has(f)) continue;
  check(
    `${f}: charges credits, so it must be able to refund them`,
    /\brefundIfCharged\s*\(|\brefundForMode\s*\(/.test(src),
    "calls chargeForMode() with no refundIfCharged()/refundForMode() anywhere in the file",
  );
}

// A guard against the test quietly measuring nothing, which is a failure mode
// this repo has produced before: if the glob or the name ever changes, the loop
// above would find zero files and report a clean pass over an empty set.
check(
  "the scan actually found billable routes",
  charging >= 15,
  `only ${charging} route(s) call chargeForMode — expected 15+; the scan is probably broken`,
);

// ------------------------------------------------- the helper's own properties
const credits = strip(readFileSync("src/lib/credits.ts", "utf8"));

check(
  "refundIfCharged exists",
  /export async function refundIfCharged\s*\(/.test(credits),
);

/*
  PROPERTY 1: it must not refund a charge that never happened.

  `enforced` is false for a bring-your-own-key workspace, an unlimited plan, or
  a database without the metering migration. Refunding those grants credits out
  of nothing — a leak that looks like generosity until the balance climbs on an
  account that has never paid.
*/
const refundFn = credits.slice(credits.indexOf("export async function refundIfCharged"));
check(
  "refundIfCharged checks gate.enforced before granting",
  /!\s*gate\.enforced/.test(refundFn.slice(0, 600)),
  "no `!gate.enforced` early return — an unenforced gate would be refunded anyway",
);

/*
  PROPERTY 2: it must not refund twice.

  Several routes have both a failure branch and a surrounding catch, and which
  paths can reach both is not obvious while editing a dozen files. The gate
  object is per-request and per-charge, so marking it is the right place to
  record that the money has already gone back.
*/
check(
  "refundIfCharged is idempotent per gate",
  /REFUNDED/.test(refundFn.slice(0, 900)),
  "no marker on the gate — a route with a failure branch AND a catch could refund twice",
);

/*
  PROPERTY 3: the refund must never throw.

  Every call site is an error path. A refund that threw would replace the
  caller's specific, useful message with an unhandled 500 — and the customer
  would lose both the credits and the explanation. getUserAndOrg() reads
  cookies and hits the network, so it can throw; it used to sit outside the try.
*/
const bare = credits.slice(credits.indexOf("export async function refundForMode"));
const bareBody = bare.slice(0, bare.indexOf("export async function refundIfCharged"));
const tryAt = bareBody.indexOf("try");
const userAt = bareBody.indexOf("getUserAndOrg");
check(
  "refundForMode wraps getUserAndOrg in its try",
  tryAt >= 0 && userAt > tryAt,
  "getUserAndOrg() is outside the try — a throw there would mask the caller's own error",
);

// --------------------------------------------- the routes that used to be wrong
/*
  Named individually, because a generic "has a refund somewhere" check would
  pass on a file that refunds one branch and not the one that actually failed.
  These are the specific failures found in the audit.
*/
const NAMED = [
  ["src/app/api/visibility/route.ts", '"visibility"', 'report.engine === "none"'],
  ["src/app/api/ai/route.ts", "m", "empty completion — the mode is dynamic, so the refund must use the same variable"],
  ["src/app/api/gbp/route.ts", '"gbp"', "missing company name"],
  ["src/app/api/agents/run/route.ts", '"document"', "empty agent output"],
  ["src/app/api/agents/run/route.ts", '"agent_image"', "image provider returned nothing"],
  ["src/app/api/agents/build/route.ts", '"report"', "zero agents designed"],
  ["src/app/api/agents/video/route.ts", '"agent_video"', "Veo never started — the most expensive action in the product"],
  ["src/app/api/act/route.ts", '"act"', "draft failed, or the send threw"],
  ["src/app/api/gst/analyze/route.ts", '"gst"', "analysis threw"],
  ["src/app/api/bank/analyze/route.ts", '"bankstatement"', "analysis threw"],
  ["src/app/api/memory/extract/route.ts", '"document"', "nothing extracted"],
  ["src/app/api/memory/ingest/route.ts", '"report"', "nothing to ingest"],
  ["src/app/api/memory/profile/route.ts", '"strategy"', "null profile"],
  ["src/app/api/memory/themes/route.ts", '"critique"', "no themes"],
  ["src/app/api/workforce/audit/route.ts", '"report"', "empty plan"],
  ["src/app/api/chat/stream/route.ts", '"chat"', "provider unreachable"],
];
for (const [file, mode, why] of NAMED) {
  // stripComments, NOT strip: the mode is the thing being asserted, so the
  // string literal has to survive.
  const src = stripComments(readFileSync(file, "utf8"));
  const esc = mode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  check(
    `${file} refunds ${mode} (${why})`,
    new RegExp(`refundIfCharged\\s*\\(\\s*gate\\s*,\\s*${esc}\\s*\\)`).test(src),
    `no refundIfCharged(gate, ${mode}) call found — refunding a different mode returns the wrong number of credits`,
  );
}

/*
  THE OUTER CATCH, specifically.

  Five routes refunded carefully in the branches their author had thought about
  and not at all in the catch — so a provider timeout, the single most likely
  failure of an AI call, kept the money. A file-level "has a refund somewhere"
  check passes on every one of them, which is why this looks at the catch block
  itself.
*/
const CATCH_MUST_REFUND = [
  ["src/app/api/act/route.ts", '"act"'],
  ["src/app/api/gst/analyze/route.ts", '"gst"'],
  ["src/app/api/bank/analyze/route.ts", '"bankstatement"'],
  ["src/app/api/agents/video/route.ts", '"agent_video"'],
  ["src/app/api/visibility/route.ts", '"visibility"'],
  ["src/app/api/gbp/route.ts", '"gbp"'],
  ["src/app/api/chat/stream/route.ts", '"chat"'],
];
for (const [file, mode] of CATCH_MUST_REFUND) {
  const src = stripComments(readFileSync(file, "utf8"));
  const at = src.lastIndexOf("} catch");
  const tail = at < 0 ? "" : src.slice(at);
  const esc = mode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  check(
    `${file}: the outer catch refunds ${mode}`,
    at >= 0 && new RegExp(`refundIfCharged\\s*\\(\\s*gate\\s*,\\s*${esc}`).test(tail),
    at < 0 ? "no catch block at all — a throw after the charge is an unhandled 500 with the credits gone"
           : "the catch returns an error without refunding",
  );
}

/*
  The two preconditions that are now checked BEFORE the charge rather than
  after it. Both were deterministic unfair charges: clusterThemes() returns []
  for a workspace with under three memories without calling a model at all, and
  extractMemories() returns count 0 for empty text. Charging first meant a new
  workspace paid, repeatedly, for a guaranteed empty answer.
*/
/*
  MEASURE THE HANDLER, NOT THE IMPORTS.

  The first version of these two checks compared indexOf() over the whole file.
  Both names also appear in the import block at the top, so what they actually
  compared was the order of two import statements. The extract check failed for
  that reason while the code was correct, and — worse — the themes check PASSED
  for that reason, which would have kept passing had the precondition been
  deleted. Same class of mistake as the "4 of 4 OK" verdict elsewhere in this
  repo: a comparison that cannot express the thing it claims to test.

  Slicing from `export async function POST` confines both to the handler body.
*/
function handlerBody(path) {
  const src = strip(readFileSync(path, "utf8"));
  const at = src.indexOf("export async function POST");
  if (at < 0) throw new Error(`no POST handler found in ${path}`);
  return src.slice(at);
}

const themes = handlerBody("src/app/api/memory/themes/route.ts");
check(
  "themes checks the 3-memory precondition before charging",
  themes.indexOf("listMemories") >= 0 && themes.indexOf("listMemories") < themes.indexOf("chargeForMode"),
  "chargeForMode() runs before the memory-count check — a workspace under 3 memories is billed for a guaranteed empty result",
);

/*
  Assert the GUARD, not the parse.

  The first version checked that `req.json` appeared before `chargeForMode`,
  which is a fact about where the body is read and says nothing about whether
  the empty-text case is refused. Mutation-tested: moving the guard after the
  charge passed, and DELETING the guard entirely passed. It is the emptiness
  check that must come first, so that is what is measured.
*/
const extract = handlerBody("src/app/api/memory/extract/route.ts");
const guardAt = extract.search(/if\s*\(\s*!\s*text\.trim\(\)\s*\)/);
check(
  "extract refuses empty text before charging",
  guardAt >= 0 && guardAt < extract.indexOf("chargeForMode"),
  guardAt < 0
    ? "no `if (!text.trim())` guard — an empty submission is billed for a guaranteed empty result"
    : "the guard runs after chargeForMode()",
);

/*
  And the same for gbp, which is the third of these: the company-name check
  needs a profile that is only loaded after the charge, so it cannot be hoisted
  — it refunds instead. Assert the refund is in that specific branch rather
  than merely somewhere in the file.
*/
const gbp = handlerBody("src/app/api/gbp/route.ts");
const nameBranch = gbp.slice(gbp.indexOf("if (!business)"), gbp.indexOf("const prompt"));
check(
  "gbp refunds when the company name is missing",
  /refundIfCharged/.test(nameBranch),
  "the !business branch returns without refunding — a pure validation failure, billed",
);

// ------------------------------------------------------------------- report
console.log(`\ncredit refunds: ${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log("\n" + failures.map((f) => "  ✗ " + f).join("\n"));
  process.exit(1);
}
console.log("  Every billable AI route can refund; the helper is gated, idempotent and non-throwing.");
