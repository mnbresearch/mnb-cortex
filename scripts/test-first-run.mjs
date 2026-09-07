/*
  A new customer must be able to get from signup to their first real warning.

  WHAT WAS BROKEN

  1. THE DEADLOCK. TRIAL_DAYS is 0 by design — this is a paid product with no
     free tier — so ensureWorkspace() stamps `trial_ends_at = now` on every new
     workspace, entitlement immediately reads "expired", and billing marks it
     locked. The post-signup redirect sends the user to /onboarding, and
     /onboarding was NOT in TrialGuard's ALLOW list. So the first screen a
     customer ever saw was a full-screen lock over a welcome wizard they could
     not reach, asking them to choose a plan before the product had told them
     what it does. Every destination that wizard links to sat behind the same
     wall.

  2. ONE SHOT, NO RETURN. Onboarding was reachable only from the single
     bootstrap redirect, which fires only on the request that created the
     workspace. There was no completion record, no nav entry, and the wizard
     held its answers in useState with no initial values — so a refresh, a
     closed tab or a second device lost setup permanently, and finding the URL
     again showed a blank form that would overwrite a saved industry with
     "manufacturing".

  3. NINE CTAs, NO PATH. The empty dashboard offered nine calls to action across
     four destinations, two of which cost 45 credits on an account that by
     design has none — while the largest and most central empty card, "No
     business data yet", carried no link at all.

  These are static checks over the source. They cannot walk a browser through
  signup, and they do not pretend to. What they lock in is that the deadlock
  cannot come back, that setup stays reachable and seeded, and that the empty
  dashboard keeps exactly one recommended action.
*/
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) pass++;
  else { fail++; failures.push(`${name}${detail ? " — " + detail : ""}`); }
}

/** Comments removed, string literals KEPT — most checks here name a route. */
function stripComments(src) {
  let out = "", i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === "/" && d === "/") { const e = src.indexOf("\n", i); i = e < 0 ? n : e; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c, start = i; i++;
      while (i < n) { if (src[i] === "\\") { i += 2; continue; } if (src[i] === q) { i++; break; } i++; }
      out += src.slice(start, i); continue;
    }
    out += c; i++;
  }
  return out;
}
const read = (f) => stripComments(readFileSync(f, "utf8"));

/* ------------------------------------------------------------ the deadlock */

const guard = read("src/components/trial-guard.tsx");
const allow = (guard.match(/const ALLOW = \[([^\]]*)\]/) || [])[1] || "";

check(
  "the paywall lets a locked user reach onboarding",
  /"\/onboarding"/.test(allow),
  "TRIAL_DAYS is 0, so every new workspace is locked on creation and the post-signup redirect goes to /onboarding — leaving it out of ALLOW means the first screen after signup is a lock over a page nobody can use",
);

for (const p of ["/billing", "/pricing"]) {
  check(`the paywall still lets a locked user reach ${p}`, allow.includes(`"${p}"`),
    "a locked user who cannot reach billing cannot pay, which is the only thing the paywall wants them to do");
}

/*
  The deadlock only exists because the trial is zero-length. If that ever
  changes, this test should still pass — but the reason it matters changes, so
  assert the coupling rather than the constant.
*/
const config = read("src/lib/config.ts");
const trialDays = Number((config.match(/export const TRIAL_DAYS = (\d+)/) || [])[1] ?? -1);
check("TRIAL_DAYS is a stated number", trialDays >= 0, "could not read TRIAL_DAYS");
if (trialDays === 0) {
  check(
    "with a zero-length trial, onboarding MUST be in the allow-list",
    /"\/onboarding"/.test(allow),
    "a new workspace is locked from its first second, so anything a new user must do has to be reachable while locked",
  );
}

/* ------------------------------------------------------ setup is derivable */

const fr = read("src/lib/first-run.ts");

check("first-run state exists", /export async function getFirstRun/.test(fr));

check(
  "it returns exactly one next step, not a menu",
  /next:\s*SetupStep \| null/.test(fr) && /steps\.find\(\(s\) => !s\.done\)/.test(fr),
  "the whole point is to replace nine competing CTAs with one",
);

/*
  DERIVED, NOT STORED. A flag drifts: delete your test invoices and a stored
  "complete" still says you are set up; add a step later and every existing
  workspace is silently marked as having done it.
*/
/*
  Note on the assertion itself: the first version looked for `from("invoices")`,
  which is not how this module reads — the table name is an argument to a
  hasAny() probe, so the check failed on correct code. Asserting the shape the
  code actually has, rather than the shape I imagined it would have, is the
  difference between a test and a guess.
*/
check(
  "setup state is read from the database, not from a stored completion flag",
  /hasAny\(svc, "invoices"/.test(fr) && !/onboarding_complete|setup_complete|onboarded_at/.test(fr),
  "found a stored completion flag, or no live read at all — derived state cannot drift and self-heals; a flag does neither",
);

check(
  "the placeholder workspace names do not count as 'told us your company'",
  /my workspace\|my company\|untitled/i.test(fr),
  "ensureWorkspace falls back to the email local-part or 'My workspace', and the old DB trigger used 'My Company' — none of those is an answer the customer gave",
);

check(
  "the final step is a real warning, not merely having data",
  /due_date/.test(fr) && /"warning"/.test(fr),
  "the product is sold as an early-warning system; setup is not finished until one has fired",
);

/* --------------------------------------------------- setup stays reachable */

const sidebar = read("src/components/sidebar.tsx");
check(
  "the sidebar offers a way back into setup while it is unfinished",
  /setupIncomplete/.test(sidebar) && /href="\/onboarding"/.test(sidebar),
  "onboarding had no nav entry at all, so an interrupted setup could never be resumed",
);
check(
  "and hides it once setup is done",
  /\{setupIncomplete && \(/.test(sidebar),
  "a permanent 'finish setting up' link on a finished workspace is nagging",
);

const layout = read("src/app/(app)/layout.tsx");
check(
  "the layout computes that flag from the derived state",
  /getFirstRun\(\)/.test(layout) && /setupIncomplete=\{firstRun/.test(layout),
);

const onboardingPage = read("src/app/(app)/onboarding/page.tsx");
check(
  "the wizard is seeded from what is already saved",
  /initialName=/.test(onboardingPage) && /initialIndustry=/.test(onboardingPage),
  "returning to setup showed a blank company field and reset the industry to 'manufacturing', which would overwrite a real answer on save",
);

const wizard = read("src/components/onboarding-wizard.tsx");
check(
  "the wizard accepts those initial values rather than hardcoding them",
  /initialIndustry/.test(wizard) && !/useState\(\{ name: "", industry: "manufacturing"/.test(wizard),
);
check(
  "an empty company name is refused rather than silently saved as 'My Company'",
  !/fd\.set\("name", form\.name \|\| "My Company"\)/.test(wizard),
  "'My Company' is exactly the placeholder the checklist treats as not-done, so the step would never tick and nothing would say why",
);
check(
  "wizard errors are shown in the page, not in a browser alert()",
  !/alert\(/.test(wizard),
  "a native dialog on the first screen of a paid product reads as a crash",
);

/* ------------------------------------------- the dashboard has ONE next step */

const dash = read("src/app/(app)/dashboard/page.tsx");

check("the dashboard renders the single setup path", /<SetupPath run=\{firstRun\}/.test(dash));

check(
  "the three competing upload buttons are gone from the empty banner",
  !(/Upload bank statement/.test(dash) && /Read GST return/.test(dash) && /Import CSV \/ Excel/.test(dash)),
  "three equally-weighted buttons, two of which cost 45 credits on an account that has none by design",
);

check(
  "the 'No business data yet' card now links somewhere",
  (() => {
    const at = dash.indexOf("No business data yet");
    if (at < 0) return false;
    return /firstRun\.next/.test(dash.slice(at, at + 700));
  })(),
  "this was the largest element on an empty dashboard and had no link on it at all",
);

/* -------------------------------------------- both importers behave alike */

const actions = read("src/lib/actions.ts");

check(
  "there is one shared row mapper",
  /function mapImportedRow\(/.test(actions),
  "the URL importer had none of the file importer's four correctness fixes",
);

check(
  "both import paths use it",
  (actions.match(/mapImportedRow\(table, spec, orgId, applyMapping\(/g) || []).length >= 2,
  "importRows and importFromUrl must agree on what a row means; they write the same tables and are read by the same queries",
);

check(
  "the URL importer refuses an unrecognised sheet instead of writing blanks",
  (() => {
    const at = actions.indexOf("export async function importFromUrl");
    if (at < 0) return false;
    const body = actions.slice(at, at + 2500);
    return /resolveHeaders\(table, headers\)/.test(body) && /match\.matched === 0/.test(body);
  })(),
  "a Google Sheet with human headings matched nothing, produced N objects containing only org_id, and reported 'Imported N rows'",
);

/* ------------------------------------------------------------------ report */
console.log(`\nfirst run: ${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log("\n" + failures.map((f) => "  ✗ " + f).join("\n"));
  process.exit(1);
}
console.log("  Signup reaches setup, setup is resumable and derived, and the empty dashboard asks for one thing.");
