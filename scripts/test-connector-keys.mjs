/**
 * Connect an app: the connector:write scope, its plan capability, and the
 * fences around it. Pure — exercises lib/api-keys.ts and config.ts directly.
 *
 * The bug this exists for: the Tally bridge needed ingest:write (Practice+),
 * while the Integrations page offered Tally from Watch — so every Try, Watch
 * and Watch Pro customer who followed the instructions was refused.
 */
import { readFileSync } from "node:fs";
const K = await import("../src/lib/api-keys.ts");
const C = await import("../src/lib/config.ts");

let pass = 0; const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(n + (d ? `\n      ${d}` : "")));
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

/* 1. capability on every plan, including retired ids */
for (const p of ["try", "watch", "watchpro", "practice", "command", "enterprise", "starter", "growth", "business", "aicoo", "solo", "premium"]) {
  check(C.planIncludes(p, "connectors"), `connectors: ${p} has it`);
}
check(!C.planIncludes("try", "api") && !C.planIncludes("watch", "api_write"), "connectors did not widen api / api_write");
check(C.lowestPlanWith("connectors") === "Try Cortex", "connectors: cheapest plan named correctly", C.lowestPlanWith("connectors"));

/* 2. scopes and the capabilities they need */
check(K.ALL_SCOPES.includes("connector:write") && K.ALL_SCOPES.includes("ai:ask"), "scopes: connector:write and ai:ask exist");
check(!K.LEGACY_SCOPES.includes("connector:write"), "scopes: old keys gain nothing");
check(K.capabilitiesForScopes(["connector:write"]).join() === "connectors", "issue: a Tally key needs only connectors");
check(K.capabilitiesForScopes(["metrics:read", "ingest:write"]).sort().join() === "api,api_write", "issue: read+ingest needs api and api_write");
check(K.capabilitiesForScopes(K.SCOPE_PRESETS.assistant).join() === "api", "issue: assistant preset needs api (Watch Pro+)");
for (const s of K.ALL_SCOPES) check(Array.isArray(K.SCOPE_CAPABILITIES[s]) && K.SCOPE_CAPABILITIES[s].length > 0, `every scope names its capabilities: ${s}`);

/* 3. admittingScope — which scope lets a call in */
const plan = (caps) => (c) => caps.includes(c);
const watch = plan(["connectors"]), practice = plan(["api", "api_write", "connectors"]), watchpro = plan(["api", "connectors"]);
const need = ["ingest:write", "connector:write"];
let r = K.admittingScope(["connector:write"], need, watch);
check(r.scope === "connector:write", "admit: Watch + connector key → connector:write");
r = K.admittingScope(["ingest:write"], need, watch);
check(r.scope === null && r.refused === "api", "admit: Watch + ingest-only key → refused (names the missing capability)", JSON.stringify(r));
r = K.admittingScope(["ingest:write", "connector:write"], need, practice);
check(r.scope === "ingest:write", "admit: Practice + full key → ingest:write (leads allowed, not the connector fence)");
r = K.admittingScope(["ingest:write", "connector:write"], need, watchpro);
check(r.scope === "connector:write", "admit: downgraded to Watch Pro, a key holding both falls back to connector:write");
r = K.admittingScope(["metrics:read"], "metrics:read", watch);
check(r.scope === null, "admit: Watch cannot read the API");
r = K.admittingScope(["connector:write"], K.ALL_SCOPES, watch);
check(r.scope === "connector:write", "admit: whoami works for a connector key on Watch");

/* 4. limits */
check(K.limitKindFor("connector:write", "write") === "connector" && K.limitKindFor("ai:ask", "write") === "ask" && K.limitKindFor("metrics:read", "read") === "read", "limits: bucket per admitting scope");
check(K.hourlyLimit("try", "connector") === 12 && K.hourlyLimit("watch", "connector") === 60 && K.hourlyLimit("nonsense", "connector") === 12, "limits: connector calls per hour by plan, unknown plan gets the floor");
check(K.connectorRowsPerCall("try") === 2000 && K.connectorRowsPerCall("watch") === 5000 && K.connectorRowsPerCall("command") === 10000 && K.connectorRowsPerCall("") === 2000, "limits: connector rows per call by plan");
check(K.hourlyLimit("watchpro", "write") === 120 && K.hourlyLimit("practice", "read") === 3000, "limits: existing read/write numbers unchanged");
check(!K.CONNECTOR_TABLES.includes("leads"), "fence: connector keys never write leads");

/* 5. wiring (source) */
const ing = read("src/app/api/v1/ingest/route.ts");
check(/apiAuth\(req, \["ingest:write", "connector:write"\], "write"/.test(ing), "route: ingest accepts either scope");
check(ing.indexOf('ctx.scope === "connector:write"') > -1 && ing.indexOf('ctx.scope === "connector:write"') < ing.indexOf('svc.rpc("api_ingest"'), "route: the connector fence runs before the write");
const sql = read("supabase/migrations/2026_zzzz_j_api_connector_scope.sql");
check(/'connector:write' = any\(scopes\)/.test(sql) && /a connector key cannot write/.test(sql), "db: api_ingest accepts connector keys and keeps the leads fence itself");
check(/grant execute on function public\.api_ingest\(text, text, jsonb\) to service_role/.test(sql) && /revoke all on function public\.api_ingest\(text, text, jsonb\) from anon, authenticated/.test(sql), "db: still service-role only");
check(/^2026_zzzz_j_api_connector_scope\.sql$/m.test(read("supabase/migrations/ORDER.txt")), "db: listed in ORDER.txt");
const integ = read("src/lib/integrations.ts");
check(/id: "tally"[^\n]*minPlan: "try"/.test(integ), "catalogue: Tally is offered from Try, where the key can now be issued");

if (failures.length) { console.error(`\nconnector keys: ${pass} passed, ${failures.length} failed`); for (const f of failures) console.error("  ✗ " + f); process.exit(1); }
console.log(`connector keys: ${pass} passed, 0 failed`);
