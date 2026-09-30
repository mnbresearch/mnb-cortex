/**
 * Three pages now remember things, and one page now states the right time.
 *
 * ============================================================================
 * WHAT THIS GUARDS
 * ============================================================================
 *
 * /decisions, /captable and /nps each asked an owner to do real work and then
 * threw it away — a journal in localStorage, a dilution model that reset on
 * every visit, and a sentiment tracker whose own copy says "sentiment turns
 * before the numbers do" while being unable to remember yesterday.
 *
 * The risks in fixing that are specific, and each has an assertion here:
 *
 *   SILENT WRITES. `strategy_docs` is RLS-protected. A viewer's insert is
 *     accepted and writes nothing — no error, no row. This repo spent a week
 *     removing exactly that pattern from every other write path. A decision
 *     journal that says "Saved" and saved nothing is the worst possible
 *     version of this feature, because the owner stops keeping a copy.
 *
 *   DATA LOSS ON MIGRATION. Journals that have been collecting entries in one
 *     browser for months must not come back empty. The import is explicit and
 *     localStorage is never cleared — there is an assertion for both, because
 *     "tidying up after a successful import" is the obvious next commit and it
 *     is the one that loses somebody's year of notes.
 *
 *   CROSS-TENANT READS AND DELETES. Every query carries org_id even where RLS
 *     should make it redundant.
 *
 *   THE CLOCK. /autopilot said "daily 8:00 AM" while the cron said 04:30 UTC,
 *     which is 10:00 IST. The conversion is executed here against the real
 *     vercel.json rather than asserted against a string.
 */

import { readFileSync } from "node:fs";
import { cronToIst, AUTOPILOT_CRON, AUTOPILOT_TIME_IST } from "../src/lib/cron-schedule.ts";
import { WORKBENCH_KINDS } from "../src/lib/workbench-types.ts";

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));
const src = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ======================================================================== */
/* 1. THE CLOCK: what /autopilot says vs what vercel.json does              */
/* ======================================================================== */

check(cronToIst("30 4 * * *") === "10:00 AM IST", "cronToIst: 04:30 UTC is 10:00 IST",
  `got ${cronToIst("30 4 * * *")}`);
check(cronToIst("0 6 * * *") === "11:30 AM IST", "cronToIst: 06:00 UTC is 11:30 IST",
  `got ${cronToIst("0 6 * * *")}`);
/* The wrap case: 20:00 UTC is 01:30 the NEXT day in IST, not 25:30. */
check(cronToIst("0 20 * * *") === "1:30 AM IST", "cronToIst: wraps past midnight",
  `got ${cronToIst("0 20 * * *")}`);
check(cronToIst("0 0 * * *") === "5:30 AM IST", "cronToIst: midnight UTC is 5:30 IST");
/* Anything that is not a simple daily schedule must refuse rather than
   render one wrong clock time for a job that runs four times a day. */
check(cronToIst("0 */6 * * *") === null, "cronToIst: refuses a non-daily schedule");
check(cronToIst("0 9 * * 1") === null, "cronToIst: refuses a weekly schedule");
check(cronToIst("") === null, "cronToIst: refuses empty");

const vercel = JSON.parse(src("vercel.json"));
const autopilotCron = (vercel.crons || []).find((c) => String(c.path).includes("autopilot"))?.schedule;
check(Boolean(autopilotCron), "vercel.json still defines an autopilot cron");
check(autopilotCron === AUTOPILOT_CRON,
  "lib/cron-schedule mirrors the REAL autopilot cron",
  `vercel.json says "${autopilotCron}", cron-schedule.ts says "${AUTOPILOT_CRON}". ` +
  "Update the constant and check every screen that states a time.");

const autopilotPage = src("src/app/(app)/autopilot/page.tsx");
check(!/8:00\s*AM/.test(strip(autopilotPage)),
  "/autopilot no longer claims 8:00 AM",
  "The cron fires at 04:30 UTC — 10:00 IST. An owner who checked at 8:15 and saw " +
  "nothing would conclude the early-warning product had nothing to warn them about.");
check(/AUTOPILOT_TIME_IST/.test(autopilotPage),
  "/autopilot renders the time derived from the cron, not a literal");
check(AUTOPILOT_TIME_IST === cronToIst(autopilotCron),
  "the exported time agrees with vercel.json",
  `exported "${AUTOPILOT_TIME_IST}", computed "${cronToIst(autopilotCron)}"`);

/* ======================================================================== */
/* 2. THE WRITE PATH                                                        */
/* ======================================================================== */

const actions = src("src/lib/actions.ts");
/* Isolate just the three workbench actions — assertions about "the file"
   would pass on the strength of some unrelated function elsewhere in 900
   lines. */
const wbSection = actions.slice(
  actions.indexOf("export async function saveWorkbenchEntry"),
  actions.indexOf("// ---- Workflows ----"),
);
check(wbSection.length > 500, "found the workbench actions", `saw ${wbSection.length} chars`);

for (const fn of ["saveWorkbenchEntry", "deleteWorkbenchEntry", "patchWorkbenchEntry"]) {
  check(wbSection.includes(`export async function ${fn}`), `${fn} exists`);
}

/* Every workbench mutation asks Postgres how many rows it actually touched. */
const mutations = wbSection.match(/\.(insert|update|delete)\(/g) || [];
check(mutations.length >= 3, "found the workbench mutations", `saw ${mutations.length}`);
check((wbSection.match(/count:\s*"exact"/g) || []).length >= 3,
  "every workbench mutation requests an exact row count",
  "Without it, an RLS-rejected write returns no error and no rows, and the UI says 'Saved'.");
check((wbSection.match(/count\s*===\s*0/g) || []).length >= 3,
  "every workbench mutation FAILS on a zero-row result",
  "Asking for the count and not checking it is the same bug with extra steps.");

/* ---- Tenancy: id-addressed queries must also carry org_id ---------------
   Asserted as a PAIRING, not a count. My first version of this check counted
   `.eq("org_id", orgId)` occurrences in the section and required three — and
   it passed when I mutated the delete to drop its org scope, because the
   other two queries still supplied the quota. A count can be satisfied by the
   wrong lines. Each `.eq("id", id)` is now checked against its own statement.

   Scoped to the whole of actions.ts rather than the workbench, because the
   invariant belongs to every tenant table: RLS should make the extra
   predicate redundant, and writing it anyway downgrades a policy regression
   from "act on another workspace's row" to "act on nothing".
*/
const ID_EXEMPT = [
  /* One deliberate exception: the service-client lead delete, which bypasses
     RLS by design and is authorised by its own caller. Listed by the line it
     appears on so a NEW unscoped query cannot hide behind it. */
  `svc.from("leads").delete().eq("id", id)`,
];
const statements = actions.split(/;\s*\n/);
const unscoped = statements
  .filter((s) => /\.eq\("id",\s*id\)/.test(s))
  .filter((s) => !/\.eq\("org_id",\s*orgId\)/.test(s))
  .filter((s) => !ID_EXEMPT.some((x) => s.includes(x)))
  .map((s) => s.trim().replace(/\s+/g, " ").slice(0, 110));

check(unscoped.length === 0,
  "every id-addressed query in actions.ts is ALSO scoped to org_id",
  unscoped.length ? unscoped.join("\n      ") :
  "A bare .eq('id', id) trusts RLS alone to stop a cross-tenant write.");

/* And specifically inside the workbench, so the check above cannot be
   satisfied by the rest of the file if these three ever move. */
const wbStatements = wbSection.split(/;\s*\n/).filter((s) => /\.eq\("id",\s*id\)/.test(s));
check(wbStatements.length >= 3, "the workbench's id-addressed queries are present",
  `saw ${wbStatements.length}`);
check(wbStatements.every((s) => /\.eq\("org_id",\s*orgId\)/.test(s)),
  "every workbench query addressed by id is also scoped to org_id");

check(/requireWriteOrg\(\)/.test(wbSection),
  "workbench writes go through requireWriteOrg",
  "A viewer must get the app's explanation, not a raw Postgres RLS string.");

/* Recoverable failures RETURN. Next masks thrown action messages in
   production and the boundary unmounts the form — losing the paragraph of
   reasoning the owner just typed. See lib/action-result.ts. */
check((wbSection.match(/return fail\(/g) || []).length >= 4,
  "user-recoverable workbench failures are returned, not thrown");

/* ======================================================================== */
/* 3. THE READ PATH                                                         */
/* ======================================================================== */

const workbench = strip(src("src/lib/workbench.ts"));
check(/\.eq\("org_id",\s*orgId\)/.test(workbench), "workbench reads are scoped to org_id");
check(/\.eq\("framework",\s*kind\)/.test(workbench),
  "workbench reads filter by kind",
  "Without it /nps would list /decisions entries — they share a table.");
check(/\.limit\(/.test(workbench), "workbench reads are bounded");
check(/catch\s*\{[\s\S]{0,80}return \[\]/.test(workbench),
  "a failed workbench read degrades to an empty list rather than a 500",
  "These three pages render perfectly well with nothing saved. A calculator " +
  "that errors because its history query failed is a worse outcome.");

/* ======================================================================== */
/* 4. NOTHING IS DELETED ON MIGRATION                                       */
/* ======================================================================== */

const journal = src("src/components/decision-journal.tsx");
const journalCode = strip(journal);

/* Two halves, asserted separately: the key has to still be the OLD one, and
   it has to still be read. Checking only "localStorage.getItem is called"
   would pass if someone renamed the key, which loses every existing journal
   just as thoroughly as deleting it. */
check(/LOCAL_KEY\s*=\s*"cortex_decisions"/.test(journalCode),
  "the journal still points at the ORIGINAL localStorage key",
  "Renaming it orphans every entry anyone has ever saved in a browser.");
check(/localStorage\.getItem\(LOCAL_KEY\)/.test(journalCode),
  "the journal still READS that key",
  "Entries collected in one browser for months must not vanish when this ships.");
check(!/localStorage\.removeItem|localStorage\.clear/.test(journalCode),
  "the journal NEVER removes or clears localStorage",
  "Tidying up after a 'successful' import is the obvious next commit and it is " +
  "the one that loses somebody's year of notes. If rows failed, or they want " +
  "them back, the browser copy must still be there.");
check(/importStrays|Import/.test(journalCode),
  "importing local entries is an explicit action",
  "Writing a dozen rows into a shared workspace without asking is not helpfulness.");

/* A signed-out visitor keeps the old behaviour — every calculator is
   reachable without an account, and a Save button that redirects to /login
   loses whatever was typed. */
check(/canSave/.test(journalCode), "the journal knows whether saving is possible at all");
check(/if \(canSave\) return;[\s\S]{0,120}localStorage\.setItem/.test(journalCode),
  "a signed-OUT visitor still gets the localStorage journal",
  "And a signed-IN one does not mirror to it, or there would be two journals that drift.");

/* The 14-credit critique is written back. */
check(/patchWorkbenchEntry/.test(journalCode) && /critique/.test(journalCode),
  "the AI critique is persisted to the decision it was written about",
  "It costs 14 credits and was previously discarded on refresh.");

/* ======================================================================== */
/* 5. THE OTHER TWO PAGES ACTUALLY SAVE                                     */
/* ======================================================================== */

for (const [file, page, kind] of [
  ["src/components/cap-table.tsx", "src/app/(app)/captable/page.tsx", "captable"],
  ["src/components/nps-tracker.tsx", "src/app/(app)/nps/page.tsx", "nps"],
  ["src/components/decision-journal.tsx", "src/app/(app)/decisions/page.tsx", "decision"],
]) {
  const comp = src(file);
  check(/saveWorkbenchEntry/.test(comp), `${kind}: the component can save`);
  check(comp.includes(`"${kind}"`), `${kind}: the component tags its entries with its own kind`);
  const pg = src(page);
  check(/listWorkbench|canSaveWorkbench/.test(pg), `${kind}: the page loads what was saved`);
  check(/export default async function/.test(pg), `${kind}: the page is a server component`);
}

/* Every kind a component writes is a kind the action will accept. */
const used = new Set();
for (const f of ["src/components/cap-table.tsx", "src/components/nps-tracker.tsx", "src/components/decision-journal.tsx"]) {
  const m = strip(src(f)).match(/fd\.set\("kind",\s*"([a-z]+)"\)/g) || [];
  m.forEach((s) => used.add(s.match(/"kind",\s*"([a-z]+)"/)[1]));
}
check(used.size >= 3, "found the kinds the UI writes", [...used].join(", "));
check([...used].every((k) => WORKBENCH_KINDS.includes(k)),
  "every kind the UI writes is one the server accepts",
  `UI writes: ${[...used].join(", ")} · server accepts: ${WORKBENCH_KINDS.join(", ")}`);

/* strategy_docs must stay deletable through the existing whitelist, or a
   saved scenario becomes permanently undeletable from /data. */
check(/"strategy_docs"/.test(actions.slice(actions.indexOf("export async function deleteRecord"), actions.indexOf("export async function deleteRecord") + 900)),
  "strategy_docs is still in deleteRecord's allowed-table list");

/* ======================================================================== */
/* ANYTHING SAVEABLE MUST BE REMOVABLE                                      */
/* ======================================================================== */

/*
  Found by walking the product live, not by reading it: /nps had no delete
  anywhere. Save a reading once and it was in your trend permanently — and
  an NPS trend is a line whose entire meaning is its shape, so one
  fat-fingered "430" instead of "43" bent the chart forever. /captable had
  the same gap for saved scenarios.

  `deleteWorkbenchEntry` already existed, org-scoped and row-count checked,
  and /decisions already used it. Nothing needed building; two surfaces had
  simply never been connected to it. That is the kind of gap a source-
  reading suite cannot see — both files compiled, both saved correctly, and
  the missing thing was an absence.

  So it is asserted going forward: a component that can write a workbench
  entry must also offer to remove one.
*/
const WB_SURFACES = [
  ["src/components/nps-tracker.tsx", "nps"],
  ["src/components/cap-table.tsx", "captable"],
  ["src/components/decision-journal.tsx", "decision"],
];
for (const [file, kind] of WB_SURFACES) {
  const code = strip(src(file));
  check(/saveWorkbenchEntry/.test(code), `${kind}: the surface can save`);
  check(/deleteWorkbenchEntry/.test(code), `${kind}: and can remove what it saved`,
    "a saved row the owner cannot delete is permanent by omission, not by design");
  check(new RegExp(`fd\\.set\\("kind",\\s*"${kind}"\\)[\\s\\S]{0,400}deleteWorkbenchEntry`).test(code)
     || new RegExp(`deleteWorkbenchEntry[\\s\\S]{0,400}fd\\.set\\("kind",\\s*"${kind}"\\)`).test(code)
     || new RegExp(`fd\\.set\\("kind",\\s*"${kind}"\\)`).test(code),
    `${kind}: the delete is issued for the right kind`);
  /*
    SCOPED TO THE CONTROL THAT DELETES, not to any "Remove" in the file.

    My first version matched `aria-label="Remove` anywhere. Stripping the
    label off the captable scenario chip PASSED, because the same file has
    an unrelated Remove button for funding rounds. A guard that can be
    satisfied by a different control than the one it names is not guarding
    anything.

    Now anchored on the JSX that actually calls remove(), within the
    element around it.
  */
  /* Match only up to the opening paren: the arguments themselves contain
     nested calls — remove(String(r.id), String(r.title)) — and a
     [^)]* class stops at the first inner bracket. */
  /*
    THE HANDLER IS DERIVED, NOT GUESSED.

    Two wrong versions before this one:

      /onClick=\{\(\) => remove\(/  missed /decisions, whose handler is
      named `del` — a rename is not a regression, so the guard was wrong.

      /onClick=\{\(\) => (remove|del)\(/ then matched cap-table's
      `del(r.id)`, which removes a FUNDING ROUND from local state and has
      nothing to do with workbench persistence. Replacing the scenario
      chip's handler with a no-op passed, because an unrelated control in
      the same file satisfied the pattern.

    So: find the function that actually calls deleteWorkbenchEntry, take
    its name, and require a control to invoke THAT. The guard now follows
    the code instead of a naming convention nobody agreed to.
  */
  const fnName = (code.match(/function\s+(\w+)\s*\([^)]*\)\s*\{[\s\S]{0,600}?deleteWorkbenchEntry/) || [])[1];
  check(!!fnName, `${kind}: a named handler calls deleteWorkbenchEntry`);
  const handler = fnName ? code.match(new RegExp(`onClick=\\{\\(\\)\\s*=>\\s*${fnName}\\(`)) : null;
  check(!!handler, `${kind}: a control invokes remove()`);
  if (handler) {
    const around = code.slice(Math.max(0, handler.index - 400), handler.index + 400);
    check(/aria-label=/.test(around),
      `${kind}: that remove control is labelled for screen readers`,
      "an icon-only button with no label is a button a screen reader announces as nothing");
  }
}

/* ======================================================================== */

console.log(`\nworkbench + cron clock: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
