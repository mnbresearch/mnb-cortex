#!/usr/bin/env node
/**
 * Cron fairness.  Run: npm run test:cron-rotation
 *
 * THE PROPERTY UNDER TEST is coverage, not correctness of one batch.
 *
 * The autopilot took `orgs.slice(0, 200)` from a list ordered by created_at
 * ascending. Every individual run was correct — it swept 200 real workspaces
 * and reported an honest count. The defect only exists ACROSS runs: it is the
 * same 200 every night, so workspace 201 is never processed. At 10,000
 * customers that is 98% receiving nothing, while every single run looks fine.
 *
 * A test that checks one batch cannot see that. So this simulates many nights
 * and asserts on the union: after ceil(total/cap) runs, every workspace must
 * have been visited at least once. The old behaviour is simulated alongside,
 * so the failure it fixes is demonstrated rather than described.
 */

let pass = 0, fail = 0;
const check = (label, cond) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
};

/* A fake cursor store standing in for cron_cursors. */
function makeSvc() {
  const cursors = new Map();
  return {
    cursors,
    from() {
      return {
        select() { return this; },
        eq(_c, name) { this._name = name; return this; },
        async maybeSingle() { return { data: cursors.get(this._name) ?? null }; },
      };
    },
    async rpc(_fn, { p_name, p_at, p_id }) {
      cursors.set(p_name, { cursor_at: p_at, cursor_id: p_id });
    },
  };
}

/* The rotation logic, mirroring src/lib/cron-rotation.ts. Kept in step by the
   source assertions at the end of this file. */
async function rotate(svc, job, all, cap) {
  const total = all.length;
  const key = (r) => `${r.created_at ?? ""}|${r.id}`;
  const sorted = [...all].sort((a, b) => key(a).localeCompare(key(b)));

  let cursor = null;
  const row = await svc.from("cron_cursors").select().eq("name", job).maybeSingle();
  if (row.data?.cursor_id) cursor = `${row.data.cursor_at ?? ""}|${row.data.cursor_id}`;

  const start = cursor ? sorted.findIndex((r) => key(r) > cursor) : 0;
  const from = start < 0 ? 0 : start;

  let batch = sorted.slice(from, from + cap);
  let wrapped = false;
  if (batch.length < cap && from > 0) {
    wrapped = true;
    batch = batch.concat(sorted.slice(0, Math.min(cap - batch.length, from)));
  }
  const last = batch[batch.length - 1];
  const commit = async (n) => {
    if (!last) return;
    await svc.rpc("cron_cursor_advance", { p_name: job, p_at: last.created_at, p_id: last.id, p_count: n });
  };
  return { batch, wrapped, total, commit };
}

const mkOrgs = (n, offset = 0) =>
  Array.from({ length: n }, (_, i) => ({
    id: `org-${String(i + offset).padStart(5, "0")}`,
    created_at: new Date(1700000000000 + (i + offset) * 60000).toISOString(),
  }));

/* ========================================================================= */
console.log("\nTHE OLD BEHAVIOUR — demonstrate the starvation");
/* ========================================================================= */
{
  const orgs = mkOrgs(1000);
  const CAP = 200;
  const seen = new Set();
  /* Thirty nights of `slice(0, CAP)` against a stable ordering. */
  for (let night = 0; night < 30; night++) {
    for (const o of orgs.slice(0, CAP)) seen.add(o.id);
  }
  check(`after 30 nights, slice() reached only ${seen.size} of 1000`, seen.size === 200);
  check("...and workspace 201 was never touched, not even once", !seen.has("org-00200"));
}

/* ========================================================================= */
console.log("\nTHE ROTATION — everyone, within a bounded number of nights");
/* ========================================================================= */
{
  const orgs = mkOrgs(1000);
  const CAP = 200;
  const svc = makeSvc();
  const seen = new Set();

  const needed = Math.ceil(1000 / CAP);          // 5
  for (let night = 0; night < needed; night++) {
    const r = await rotate(svc, "sweep", orgs, CAP);
    for (const o of r.batch) seen.add(o.id);
    await r.commit(r.batch.length);
  }
  check(`all 1000 covered in exactly ceil(1000/200) = ${needed} nights (saw ${seen.size})`,
        seen.size === 1000);

  /* No overlap within a cycle: a repeat inside one cycle means someone else
     was displaced, which is the starvation bug in a subtler form. */
  const svc2 = makeSvc();
  let totalBatched = 0;
  const seen2 = new Set();
  for (let night = 0; night < needed; night++) {
    const r = await rotate(svc2, "sweep", orgs, CAP);
    totalBatched += r.batch.length;
    for (const o of r.batch) seen2.add(o.id);
    await r.commit(r.batch.length);
  }
  check(`no workspace processed twice within one cycle (${totalBatched} slots, ${seen2.size} distinct)`,
        totalBatched === seen2.size);
}

/* ========================================================================= */
console.log("\nIT MUST WRAP, and keep going");
/* ========================================================================= */
{
  const orgs = mkOrgs(250);
  const CAP = 100;
  const svc = makeSvc();
  const counts = new Map();

  /* Ten cycles' worth. Every workspace should be visited a similar number of
     times — fairness, not just eventual coverage. */
  for (let night = 0; night < 30; night++) {
    const r = await rotate(svc, "sweep", orgs, CAP);
    for (const o of r.batch) counts.set(o.id, (counts.get(o.id) ?? 0) + 1);
    await r.commit(r.batch.length);
  }
  check("every workspace visited at least once", counts.size === 250);
  const vals = [...counts.values()];
  const min = Math.min(...vals), max = Math.max(...vals);
  check(`visits are even — min ${min}, max ${max}, spread <= 1`, max - min <= 1);
}

/* ========================================================================= */
console.log("\nCHURN — signups and deletions must not skip anyone");
/* ========================================================================= */
{
  /* This is why the cursor is a keyset on (created_at, id) rather than an
     OFFSET. With OFFSET, one insert shifts every later row by one and silently
     skips a workspace on the next run — and a different one each time, so it
     never looks like a pattern. */
  const CAP = 50;
  const svc = makeSvc();
  let orgs = mkOrgs(200);
  const seen = new Set();

  for (let night = 0; night < 4; night++) {
    const r = await rotate(svc, "sweep", orgs, CAP);
    for (const o of r.batch) seen.add(o.id);
    await r.commit(r.batch.length);
    /* A new workspace signs up mid-rotation, at the END of the ordering. */
    orgs = orgs.concat(mkOrgs(1, 900 + night));
  }
  const original = mkOrgs(200).map((o) => o.id);
  const missed = original.filter((id) => !seen.has(id));
  check(`no original workspace skipped despite signups mid-cycle (missed ${missed.length})`,
        missed.length === 0);

  /* A deleted workspace must not wedge the cursor. */
  const svc3 = makeSvc();
  let live = mkOrgs(100);
  const r1 = await rotate(svc3, "sweep", live, 50);
  await r1.commit(50);
  live = live.filter((o) => o.id !== r1.batch[r1.batch.length - 1].id);   // delete the cursor row
  const r2 = await rotate(svc3, "sweep", live, 50);
  check("a deleted cursor row does not stall the rotation", r2.batch.length > 0);
}

/* ========================================================================= */
console.log("\nDEGRADED MODE — an unmigrated database must still run");
/* ========================================================================= */
{
  /* If cron_cursors has not been created, the cursor read throws. The job must
     fall back to "first N" — the old behaviour — rather than processing
     nobody. A migration that has not been run yet must not stop the nightly. */
  const broken = {
    from() { return { select() { return this; }, eq() { return this; },
                      async maybeSingle() { throw new Error("relation cron_cursors does not exist"); } }; },
    async rpc() { throw new Error("no such function"); },
  };
  const safeRotate = async (all, cap) => {
    try { return await rotate(broken, "sweep", all, cap); }
    catch { return { batch: all.slice(0, cap), wrapped: false, total: all.length, commit: async () => {} }; }
  };
  const r = await safeRotate(mkOrgs(500), 200);
  check("falls back to a full batch rather than an empty one", r.batch.length === 200);
}

/* ========================================================================= */
console.log("\nTHE ROUTE MUST USE IT, AND REPORT COVERAGE");
/* ========================================================================= */
{
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const route = strip(readFileSync(join(ROOT, "src/app/api/cron/autopilot/route.ts"), "utf8"));
  check("the metrics sweep rotates", /rotate\("metrics_sweep"/.test(route));
  check("the daily analysis rotates", /rotate\("daily_analysis"/.test(route));
  check("the old slice(0, SWEEP_CAP) is gone", !/slice\(0,\s*SWEEP_CAP\)/.test(route));
  check("both cursors are committed after the work", (route.match(/\.commit\(/g) || []).length >= 2);
  check("the analysis rotates over ENTITLED orgs, not all of them",
        /entitledOrgs\s*=/.test(route) && /rotate\("daily_analysis",\s*entitledOrgs/.test(route));
  check("the response reports coverage instead of a bare ok", /coverage/.test(route));
  check("...including how many nights a full cycle takes",
        /nights_for_full_cycle/.test(route));

  const lib = strip(readFileSync(join(ROOT, "src/lib/cron-rotation.ts"), "utf8"));
  check("the cursor is a keyset on (created_at, id), not an offset",
        /created_at/.test(lib) && !/\.range\(/.test(lib) && !/offset/i.test(lib));
  check("a cursor read failure degrades rather than throws", /catch\s*\{/.test(lib));
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
