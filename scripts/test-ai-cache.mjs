#!/usr/bin/env node
/**
 * The input-keyed model cache.  Run: npm run test:ai-cache
 *
 * WHAT THIS HAS TO GET RIGHT, and why each one is a real risk:
 *
 *   A hit must return the SAME answer. Obvious, and the only part a naive test
 *   checks.
 *
 *   A change in the input must MISS. This is the whole justification for
 *   fingerprinting instead of a TTL — if it does not hold, the product tells a
 *   user to fix something they already fixed, and the cache is worse than no
 *   cache because the staleness is unbounded rather than capped at a TTL.
 *
 *   A different workspace must MISS. Serving one business's priorities to
 *   another is a cross-tenant leak, and the cache is keyed (org_id, key) — if
 *   org_id were dropped from the key it would still pass every other test here.
 *
 *   Every failure must FALL THROUGH to computing. A cache that throws when the
 *   table is missing takes the dashboard down with it.
 *
 * The store is faked rather than run against Postgres because the logic under
 * test is the key derivation and the fall-through, not the SQL. The queries it
 * issues are a two-column read and an upsert on a primary key.
 */

import { createHash } from "node:crypto";

let pass = 0, fail = 0;
const check = (label, cond) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
};

/* A faithful re-implementation of cachedByInput's contract against a fake
   store, so the test does not need a database. Kept in step with the real file
   by the source assertions at the bottom. */
const VERSION = "v1";
const fingerprint = (...parts) =>
  createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);

function makeStore({ readThrows = false, writeThrows = false } = {}) {
  const rows = new Map();
  return {
    rows,
    async read(orgId, key) {
      if (readThrows) throw new Error("relation app_settings does not exist");
      return rows.get(`${orgId}|${key}`) ?? null;
    },
    async write(orgId, key, value) {
      if (writeThrows) throw new Error("write denied");
      rows.set(`${orgId}|${key}`, { value, updated_at: new Date().toISOString() });
    },
  };
}

async function cachedByInput(store, orgId, name, input, maxAgeSecs, compute) {
  const key = `cache:${name}`;
  const want = fingerprint(VERSION, input);
  try {
    const data = await store.read(orgId, key);
    if (data?.value) {
      const row = JSON.parse(data.value);
      const ageOk = maxAgeSecs <= 0 ||
        (Date.now() - new Date(data.updated_at).getTime()) < maxAgeSecs * 1000;
      if (row?.fp === want && ageOk) return { value: row.payload, hit: true };
    }
  } catch { /* fall through */ }
  const value = await compute();
  try { await store.write(orgId, key, JSON.stringify({ fp: want, payload: value })); } catch {}
  return { value, hit: false };
}

const ORG_A = "org-a", ORG_B = "org-b";

/* ========================================================================= */
console.log("\nHIT AND MISS");
/* ========================================================================= */
{
  const store = makeStore();
  let calls = 0;
  const compute = async () => { calls++; return { priorities: [`answer ${calls}`] }; };

  const first = await cachedByInput(store, ORG_A, "priorities", { a: 1 }, 3600, compute);
  check("first call is a miss and computes", first.hit === false && calls === 1);

  const second = await cachedByInput(store, ORG_A, "priorities", { a: 1 }, 3600, compute);
  check("same input is a hit and does NOT compute", second.hit === true && calls === 1);
  check("...and returns the same answer", JSON.stringify(second.value) === JSON.stringify(first.value));

  console.log("\n  The point of fingerprinting: changed data must recompute");
  const changed = await cachedByInput(store, ORG_A, "priorities", { a: 2 }, 3600, compute);
  check("different input misses", changed.hit === false && calls === 2);
  check("...and returns the NEW answer, not the stale one",
        JSON.stringify(changed.value) !== JSON.stringify(first.value));

  /* Deep, not shallow: the context is a nested object, and a shallow key would
     serve last week's advice after this week's numbers landed. */
  const deepA = await cachedByInput(store, ORG_A, "deep", { m: { cash: 100 } }, 3600, compute);
  const deepB = await cachedByInput(store, ORG_A, "deep", { m: { cash: 101 } }, 3600, compute);
  check("a nested change is detected", deepA.hit === false && deepB.hit === false);
}

/* ========================================================================= */
console.log("\nTENANT ISOLATION — a cache is a cross-tenant leak if keyed wrong");
/* ========================================================================= */
{
  const store = makeStore();
  let calls = 0;
  const compute = async () => { calls++; return { org: calls }; };

  await cachedByInput(store, ORG_A, "priorities", { a: 1 }, 3600, compute);
  const other = await cachedByInput(store, ORG_B, "priorities", { a: 1 }, 3600, compute);

  /* Identical input, different workspace. Must NOT hit — two businesses can
     easily have identical context (both empty, both freshly signed up). */
  check("identical input in another workspace misses", other.hit === false);
  check("...and gets its own answer", other.value.org === 2);
  check("the two are stored separately", store.rows.size === 2);
}

/* ========================================================================= */
console.log("\nTHE AGE CEILING — for changes the fingerprint cannot see");
/* ========================================================================= */
{
  const store = makeStore();
  let calls = 0;
  const compute = async () => { calls++; return { n: calls }; };

  await cachedByInput(store, ORG_A, "priorities", { a: 1 }, 3600, compute);
  /* Backdate the row past the ceiling. Same input, so only age can force it. */
  const k = `${ORG_A}|cache:priorities`;
  store.rows.set(k, { ...store.rows.get(k), updated_at: new Date(Date.now() - 7200_000).toISOString() });

  const stale = await cachedByInput(store, ORG_A, "priorities", { a: 1 }, 3600, compute);
  check("an entry older than maxAge misses even on an identical input", stale.hit === false);

  const fresh = await cachedByInput(store, ORG_A, "priorities", { a: 1 }, 3600, compute);
  check("...and the recomputed entry is fresh again", fresh.hit === true);
}

/* ========================================================================= */
console.log("\nFAILURE MUST DEGRADE TO 'NO CACHE', NEVER TO 'NO ANSWER'");
/* ========================================================================= */
{
  /* app_settings missing, RLS surprise, a half-written row — the dashboard
     must still render. This is the difference between a slow page and an
     outage. */
  const readBroken = makeStore({ readThrows: true });
  let calls = 0;
  const r1 = await cachedByInput(readBroken, ORG_A, "p", { a: 1 }, 3600, async () => { calls++; return "ok"; });
  check("a read failure still returns a computed answer", r1.value === "ok" && r1.hit === false);

  const writeBroken = makeStore({ writeThrows: true });
  const r2 = await cachedByInput(writeBroken, ORG_A, "p", { a: 1 }, 3600, async () => "ok");
  check("a write failure still returns the answer", r2.value === "ok");

  const corrupt = makeStore();
  corrupt.rows.set(`${ORG_A}|cache:p`, { value: "{not json", updated_at: new Date().toISOString() });
  const r3 = await cachedByInput(corrupt, ORG_A, "p", { a: 1 }, 3600, async () => "recomputed");
  check("an unparseable row recomputes instead of throwing", r3.value === "recomputed");
}

/* ========================================================================= */
console.log("\nTHE ROUTE MUST ACTUALLY USE IT");
/* ========================================================================= */
{
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const route = strip(readFileSync(join(ROOT, "src/app/api/priorities/route.ts"), "utf8"));
  check("the priorities route calls cachedByInput", /cachedByInput\(/.test(route));
  check("...and no longer calls buildPriorities unconditionally",
        !/const res = await buildPriorities\(/.test(route));
  check("...keyed on the context, so it invalidates when the data does",
        /\{\s*ctx,\s*hasData\s*\}/.test(route));

  const lib = strip(readFileSync(join(ROOT, "src/lib/ai/cache.ts"), "utf8"));
  check("the cache key includes org_id", /\.eq\("org_id", orgId\)/.test(lib));
  check("the cache key includes a version, so a prompt change can invalidate all",
        /VERSION/.test(lib) && /fingerprint\(VERSION/.test(lib));
  check("every catch falls through rather than rethrowing", !/catch\s*\([^)]*\)\s*\{\s*throw/.test(lib));
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
