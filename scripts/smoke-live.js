/**
 * LIVE SMOKE: click the real buttons, assert the screen actually changed.
 *
 * ============================================================================
 * WHY THIS EXISTS, STATED PLAINLY
 * ============================================================================
 *
 * This repo has ~94 test suites and over 4,700 assertions. Every one of them
 * READS SOURCE. That is a real limit, not a style preference: a suite that
 * reads source cannot see a defect that lives BETWEEN two correct things.
 *
 * It has now missed the same class three times:
 *
 *   /quote could not save for months. lib/actions.ts upserted on
 *   (org_id, quote_no); the migration had made that index PARTIAL. Both files
 *   were correct. 84 suites passed. Found by pressing the button.
 *
 *   /nps had no delete at all. Every assertion about the page passed, because
 *   the defect was an ABSENCE and absences are invisible to a checker that
 *   looks at what is there. Found by looking for the way back.
 *
 *   /nps's delete then succeeded and left the row on screen. The action was
 *   correct, the component was correct, and the server's answer never reached
 *   the user's eyes. 80 assertions passed while the feature was visibly
 *   broken. Found by pressing the button again.
 *
 * Three different defects, one shape: correct parts, broken whole. The only
 * instrument that detects it is the running product.
 *
 * ============================================================================
 * HOW TO RUN IT
 * ============================================================================
 *
 * 1. Sign in to https://cortex.mnbresearch.com in a normal browser.
 * 2. Open DevTools → Console.
 * 3. Paste this entire file and press Enter.
 * 4. Read the table it prints.
 *
 * It drives the real UI with real clicks against the real database, so it
 * CREATES AND THEN DELETES rows prefixed `ZZ-SMOKE`. Every check cleans up
 * after itself; anything left behind is reported at the end so it can be
 * removed by hand.
 *
 * ============================================================================
 * WHAT IT WILL NOT DO
 * ============================================================================
 *
 * It never touches a path that sends something to a third party or takes
 * money: no collections message, no WhatsApp, no payment, no workspace
 * deletion. Those are listed at the bottom as NOT COVERED rather than
 * silently skipped, because a smoke suite that quietly omits the dangerous
 * half reads as broader than it is.
 */

(async () => {
  const PREFIX = "ZZ-SMOKE";
  const results = [];
  const residue = [];

  const log = (area, name, ok, detail = "") => results.push({ area, name, ok, detail });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const text = () => document.body.innerText;

  /* React ignores a plain `el.value = x`; the native setter plus an input
     event is what makes a controlled component register the change. */
  const type = (el, v) => {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const $ph = (needle) =>
    [...document.querySelectorAll("input,textarea")]
      .find((e) => ((e.placeholder || "") + (e.getAttribute("aria-label") || "")).toLowerCase().includes(needle.toLowerCase()));

  const $btn = (label) =>
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === label);

  const $btnLike = (needle) =>
    [...document.querySelectorAll("button")]
      .find((b) => (b.textContent + " " + (b.getAttribute("aria-label") || "")).toLowerCase().includes(needle.toLowerCase()));

  /* Navigation has to be a real load: the client router cache is precisely
     what hid the stale-row defect, so a smoke suite must not rely on it. */
  const go = async (path) => {
    if (location.pathname !== path) { location.href = path; await wait(99999); }
  };

  /* ====================================================================== */
  /* Because a full-page navigation ends this script, each page's checks are */
  /* a separate STEP and the runner remembers where it got to.              */
  /* ====================================================================== */

  const STEPS = [
    {
      path: "/nps",
      async run() {
        const label = $ph("label") || $ph("september");
        if (!label) return log("/nps", "label field present", false, "no label input found");
        const name = `${PREFIX}-NPS`;
        type(label, name);

        const save = $btn("Save reading");
        if (!save) return log("/nps", "Save reading button", false, "not found");
        save.click();
        await wait(9000);
        const appeared = text().includes(name);
        log("/nps", "a saved reading appears without a reload", appeared,
          appeared ? "" : "saved but the trend did not update — the server-to-screen gap");

        const rm = $btnLike(`Remove the reading "${name}"`) || $btnLike("Remove the reading");
        if (!rm) { residue.push(`${name} on /nps`); return log("/nps", "remove control exists", false, "no delete button"); }
        rm.click();
        await wait(9000);
        const gone = !text().includes(name);
        log("/nps", "a removed reading leaves the screen without a reload", gone,
          gone ? "" : "THE EXACT DEFECT THIS FILE EXISTS FOR: delete succeeded, row stayed");
        if (!gone) residue.push(`${name} on /nps`);
      },
    },
    {
      path: "/captable",
      async run() {
        const name = `${PREFIX}-SCENARIO`;
        const field = $ph("scenario") || $ph("e.g. Seed");
        if (!field) return log("/captable", "scenario name field", false, "not found");
        type(field, name);
        const save = $btn("Save");
        if (!save) return log("/captable", "Save button", false, "not found");
        save.click();
        await wait(9000);
        const appeared = text().includes(name);
        log("/captable", "a saved scenario appears without a reload", appeared);

        const rm = $btnLike(`Remove the scenario "${name}"`) || $btnLike("Remove the scenario");
        if (!rm) { residue.push(`${name} on /captable`); return log("/captable", "remove control exists", false); }
        rm.click();
        await wait(9000);
        const gone = !text().includes(name);
        log("/captable", "a removed scenario leaves the screen without a reload", gone);
        if (!gone) residue.push(`${name} on /captable`);
      },
    },
    {
      path: "/quote",
      async run() {
        const no = $ph("quote #");
        const client = $ph("client name");
        if (!no || !client) return log("/quote", "quote fields present", false);
        const name = `${PREFIX}-QUOTE`;
        type(client, `${PREFIX} Buyer`);
        type(no, name);
        const save = $btn("Save to workspace");
        if (!save) return log("/quote", "Save to workspace button", false);
        save.click();
        await wait(10000);
        const t = text();
        log("/quote", "saving a quote does not show a raw database error",
          !/ON CONFLICT|constraint|duplicate key|violates/i.test(t),
          "the /quote P0 was a raw Postgres string shown to the customer");
        log("/quote", "a saved quote appears in the list without a reload", t.includes(name));
        if (t.includes(name)) residue.push(`${name} on /quote (quotes have no delete in the UI)`);
      },
    },
    {
      path: "/dashboard",
      async run() {
        const t = text();
        log("/dashboard", "renders without an error boundary",
          !/Application error|client-side exception/i.test(t));
        /* The landing page promises the warning names a customer. If this
           workspace has an overdue invoice with a party, the insight must
           carry a name — not just a rupee total. */
        const hasOverdue = /past its due date|past due/i.test(t);
        if (hasOverdue) {
          log("/dashboard", "the overdue warning names a customer, not just a total",
            /owes you/.test(t),
            "the landing page says 'which customer, how much, how late'");
        }
      },
    },
    {
      path: "/receivables",
      async run() {
        const t = text();
        log("/receivables", "renders", !/Application error/i.test(t));
        log("/receivables", "the chase-first list is present", /Chase these first/i.test(t));
      },
    },
    {
      path: "/autopilot",
      async run() {
        const t = text();
        log("/autopilot", "states when this workspace was last read",
          /last read|have not been read/i.test(t),
          "the cadence claim must be checkable by the person it is made to");
      },
    },
  ];

  /* ---------------------------------------------------------------------- */

  const KEY = "__cortex_smoke__";
  const state = JSON.parse(sessionStorage.getItem(KEY) || '{"i":0,"results":[],"residue":[]}');
  results.push(...state.results);
  residue.push(...state.residue);

  for (let i = state.i; i < STEPS.length; i++) {
    const step = STEPS[i];
    if (location.pathname !== step.path) {
      sessionStorage.setItem(KEY, JSON.stringify({ i, results, residue }));
      console.log(`[smoke] navigating to ${step.path} — re-paste this script if it does not continue`);
      location.href = step.path;
      return;
    }
    try { await step.run(); }
    catch (e) { log(step.path, "step completed without throwing", false, e.message); }
  }

  sessionStorage.removeItem(KEY);

  /* ---------------------------------------------------------------------- */

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== LIVE SMOKE: ${results.length - failed.length} passed, ${failed.length} failed ===\n`);
  console.table(results.map((r) => ({ area: r.area, check: r.name, ok: r.ok ? "PASS" : "FAIL", detail: r.detail })));

  if (failed.length) {
    console.log("\nFAILURES:");
    for (const f of failed) console.log(`  ✗ ${f.area}  ${f.name}${f.detail ? "\n      " + f.detail : ""}`);
  }
  if (residue.length) {
    console.log("\nLEFT BEHIND (remove by hand):");
    for (const r of residue) console.log("  · " + r);
  }

  console.log(`
NOT COVERED, deliberately — each of these sends something or moves money, and
a smoke run must never do that on a live workspace:
  · collections send (emails the customer's own customers)
  · WhatsApp send
  · checkout / payment / refund
  · workspace deletion
  · CSV import (writes bulk rows that are tedious to unpick)
Test those on a scratch workspace, by hand, before a release.
`);

  return `${results.length - failed.length}/${results.length} passed`;
})();
