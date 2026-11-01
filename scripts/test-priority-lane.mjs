/**
 * Priority lane: Enterprise (and its group companies), Command and Practice
 * get a daily business-hours run of sync, watch and collections, best first,
 * and nobody lapsed or suspended is in it.
 */
import { readFileSync } from "node:fs";
const L = await import("../src/lib/priority-lane.ts");
let pass = 0; const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(n + (d ? `\n      ${d}` : "")));
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const future = new Date(Date.now() + 30 * 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();
const live = (id, plan, extra = {}) => ({ id, plan, subscription_status: "active", subscription_ends_at: future, created_at: "2026-01-01", ...extra });

/* ranking */
check(L.priorityRank("enterprise") > L.priorityRank("command"), "enterprise outranks command");
check(L.priorityRank("command") > L.priorityRank("practice"), "command outranks practice");
check(L.priorityRank("ENTERPRISE") === L.priorityRank("enterprise"), "plan match is case-insensitive");
for (const p of ["try", "watch", "watchpro", "starter", "growth", "", null]) check(L.priorityRank(p) === -1, `${p || "(none)"} is not in the lane`);

/* selection */
const group = live("g1", "enterprise", { created_at: "2026-05-01" });
const firms = new Map([["g1", group]]);
const orgs = [
  live("p1", "practice"),
  live("c1", "command"),
  group,
  { id: "k1", plan: "watch", subscription_status: "trialing", trial_ends_at: past, practice_org_id: "g1", created_at: "2026-06-01" },
  live("w1", "watch"),
  { id: "x1", plan: "command", subscription_status: "cancelled", subscription_ends_at: past, created_at: "2025-01-01" },
  live("s1", "enterprise", { subscription_status: "suspended" }),
  { id: "lapsed", plan: "practice", subscription_status: "active", subscription_ends_at: past, created_at: "2025-01-01" },
];
const ids = L.selectPriority(orgs, firms);
check(JSON.stringify(ids) === JSON.stringify(["g1", "k1", "c1", "p1"]), "lane order: group, its company, command, practice", JSON.stringify(ids));
check(ids.includes("k1"), "an Enterprise group's company is in the lane on the group's plan");
check(!ids.includes("w1"), "a Watch workspace is not");
check(!ids.includes("x1") && !ids.includes("lapsed"), "a cancelled or lapsed top-plan workspace is not");
check(!ids.includes("s1"), "a suspended workspace is not, whatever its plan");
check(!L.selectPriority([orgs[3]], new Map([["g1", { ...group, subscription_status: "cancelled", subscription_ends_at: past }]])).includes("k1"),
  "a company of a lapsed group drops out");
check(!L.selectPriority([{ ...orgs[3], subscription_status: "suspended" }], firms).length, "a suspended company drops out even with a live group");
check(L.selectPriority(orgs, firms, 2).length === 2, "the lane respects its cap");
check(L.selectPriority([live("b", "command", { created_at: "2026-02-01" }), live("a", "command", { created_at: "2026-01-01" })], new Map())[0] === "a",
  "same plan: the older workspace first (stable order)");
check(L.selectPriority([null, {}, ...orgs], firms).length === 4, "junk rows are ignored");

/* budget */
const total = Object.values(L.PRIORITY_SHARE).reduce((a, b) => a + b, 0);
check(total <= 280_000, "lane shares fit its own 280s budget", String(total));

/* route + schedule */
const route = strip(read("src/app/api/cron/priority/route.ts"));
check(/cronAuthorised\(req\)/.test(route), "route requires the cron secret");
check(/maxDuration = 300/.test(route) && /createBudget\(280_000\)/.test(route), "route runs on its own 300s function and budget");
check(/selectPriority\(/.test(route), "route picks workspaces through selectPriority");
check(/collectionsEntitledSet\(/.test(route), "collections in the lane re-check entitlement");
check(/budget\.slice\(PRIORITY_SHARE\.(sync|watch|collections)\)/g.test(route) && (route.match(/budget\.slice\(PRIORITY_SHARE\./g) || []).length === 3, "each step runs on its own budget slice");
check(/runWatch\(/.test(route) && /sendApproved\(/.test(route) && /syncProvider\(/.test(route), "route runs sync, watch and collections");
const vercel = JSON.parse(read("vercel.json"));
const cron = (vercel.crons || []).find((c) => c.path === "/api/cron/priority");
check(!!cron, "priority cron is scheduled in vercel.json");
if (cron) {
  const [m, h] = cron.schedule.split(" ").map(Number);
  const ist = ((h * 60 + m + 330) % 1440) / 60;
  check(ist >= 9 && ist <= 18, "priority lane runs in Indian business hours", `${ist}h IST`);
}

if (failures.length) { console.error(`priority-lane: ${failures.length} failed\n  ✗ ` + failures.join("\n  ✗ ")); process.exit(1); }
console.log(`priority-lane: ${pass} checks passed`);
