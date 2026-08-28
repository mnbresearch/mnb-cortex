#!/usr/bin/env node
/**
 * API route configuration tests.  Run: npm run test:routes
 *
 * WHY THIS SUITE EXISTS
 *
 * A route that calls a language model can run for tens of seconds. Measured
 * against a real workspace, /api/ai took 27.9s to produce the dashboard pulse.
 * Eleven AI routes in this app set an explicit budget — 30s, 60s, 300s for the
 * nightly agent — because somebody thought about it. Seven did not, and
 * silently inherited whatever the platform default happens to be:
 *
 *     /api/ai            the dashboard pulse and every "ask the AI COO" button
 *     /api/chat          AI CEO Chat, a headline feature
 *     /api/chat/stream
 *     /api/act
 *     /api/agents/run
 *     /api/integrations
 *     /api/workforce/audit
 *
 * That default is not ours, differs between Vercel plans and runtimes, and has
 * changed over time. Hanging the product's headline feature on it is a bad bet,
 * and the failure mode is the worst kind: a 504 with nothing in the app's own
 * logs, and a user staring at a button that appears to do nothing.
 *
 * This is a STRUCTURAL test — it reads the routes rather than calling them, so
 * it costs nothing and cannot flake. It fails the moment someone adds an AI
 * route without deciding how long it is allowed to take.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = join(ROOT, "src", "app", "api");

let pass = 0, fail = 0;
const check = (label, cond) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
};

/** Every route.ts under src/app/api. */
function routeFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...routeFiles(p));
    else if (e === "route.ts") out.push(p);
  }
  return out;
}

const files = routeFiles(API);
check(`found API routes to check (${files.length})`, files.length > 20);

/*
  "Calls a model" is detected from the imports and call sites the app actually
  uses. Deliberately broad: a false positive costs one explicit line in a route
  file, a false negative costs a silent 504 in production.
*/
const AI_SIGNAL = /generateFor|geminiUrl|geminiTextModels|@\/lib\/ai\/|api\.openai\.com|api\.anthropic\.com|api\.groq\.com/;

const aiRoutes = [], missing = [], durations = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  if (!AI_SIGNAL.test(src)) continue;
  const rel = relative(API, f).replace(/\/route\.ts$/, "");
  aiRoutes.push(rel);
  const m = src.match(/export\s+const\s+maxDuration\s*=\s*(\d+)/);
  if (!m) missing.push(rel);
  else durations.push([rel, Number(m[1])]);
}

console.log(`\nEvery AI route must declare how long it may take (${aiRoutes.length} found)`);
if (missing.length) {
  fail++;
  console.log(`  FAIL  ${missing.length} AI route(s) have no maxDuration:`);
  for (const r of missing) console.log(`          /api/${r}`);
} else {
  pass++;
  console.log(`  ok    all ${aiRoutes.length} AI routes set an explicit maxDuration`);
}

console.log("\nThe declared budgets must be sane");
for (const [rel, d] of durations) {
  // Under 15s is not enough for a model round trip — /api/ai alone measured
  // 27.9s. Over 300s exceeds what any Vercel plan allows.
  const ok = d >= 15 && d <= 300;
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  /api/${rel} = ${d}s`);
}

console.log("\nRuntime must be nodejs where the model SDKs need it");
{
  const edgeAi = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    if (!AI_SIGNAL.test(src)) continue;
    if (/export\s+const\s+runtime\s*=\s*["']edge["']/.test(src)) edgeAi.push(relative(API, f));
  }
  check("no AI route is pinned to the edge runtime", edgeAi.length === 0);
}

console.log("");
if (fail) { console.log(`${fail} FAILED, ${pass} passed\n`); process.exit(1); }
console.log(`all ${pass} passed\n`);
