/*
  THE NIGHTLY WATCH — Cortex proposing work from each workspace's own records.

  Executes planWatch() (pure) against hand-built workspaces and pins how the
  cron calls it. What must hold:
    · reminders go to the costliest overdue invoices, max five, never to a
      do-not-contact party, never twice a week, never for paid/small/fresh
      invoices or payables, and not at all when collections is switched on;
    · MSME: covered suppliers past 45 days raise a critical alert; unclassified
      old bills raise a classify nudge; medium suppliers raise nothing;
    · cold deals and hanging quotes raise one alert each, biggest first;
    · every proposal has a week-scoped idempotency key;
    · the cron runs it for entitled workspaces, rotated, in waves, and the
      ledger (not this code) decides what runs.

  Run: node --experimental-strip-types --no-warnings scripts/test-watch.mjs
*/
import { readFileSync } from "node:fs";

let pass = 0; const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? `\n      ${d}` : ""}`));
const read = (p) => readFileSync(p, "utf8");

const W = await import("../src/lib/watch-plan.ts");
const norm = (s) => (s ? String(s).toLowerCase().replace(/\b(pvt|private|ltd|limited)\b\.?/g, "").replace(/[^a-z0-9]+/g, " ").trim() || null : null);
const today = "2026-10-08";
const inv = (id, party, amount, due, extra = {}) => ({ id, invoice_no: `INV-${id}`, party, amount, due_date: due, status: "pending", type: "receivable", ...extra });
const base = {
  orgId: "org-1", today, doNotContact: [], collectionsOn: false, recentlyReminded: [], msme: [], deals: [], quotes: [], normalise: norm,
  invoices: [
    inv("a", "Acme Traders", 200000, "2026-09-01"),      // 37 days late, big
    inv("b", "Shree Balaji", 50000, "2026-09-20"),       // 18 days
    inv("c", "Small Co", 500, "2026-08-01"),             // too small
    inv("d", "Fresh Co", 90000, "2026-10-05"),           // 3 days — too fresh
    inv("e", "Paid Co", 90000, "2026-08-01", { status: "Paid" }),
    inv("f", "Supplier X", 90000, "2026-08-01", { type: "payable" }),
    inv("g", "Blocked Pvt Ltd", 400000, "2026-07-01"),
    inv("h", "Recent Co", 300000, "2026-08-01"),
    inv("i", "Co I", 20000, "2026-09-01"), inv("j", "Co J", 21000, "2026-09-01"), inv("k", "Co K", 22000, "2026-09-01"), inv("l", "Co L", 23000, "2026-09-01"),
    inv("m", "No Due", 99000, null),
  ],
};

{
  const p = W.planWatch({ ...base, doNotContact: ["BLOCKED PRIVATE LIMITED"], recentlyReminded: ["h"] });
  const r = p.filter((x) => x.action === "send_payment_reminder");
  const ids = r.map((x) => x.args.invoice_id);
  check(r.length === W.MAX_REMINDERS, "reminders: at most five a night", ids.join(","));
  check(ids[0] === "a", "reminders: the costliest (amount × days late) first", ids.join(","));
  check(!ids.includes("g"), "reminders: never to a do-not-contact party (matched after normalisation)");
  check(!ids.includes("h"), "reminders: never twice in a week for the same invoice");
  check(!ids.includes("c") && !ids.includes("d") && !ids.includes("e") && !ids.includes("f") && !ids.includes("m"), "reminders: not for small, fresh, paid (any case), payable or undated invoices", ids.join(","));
  check(r.every((x) => x.args.channel === "email" && typeof x.args.amount === "number" && x.evidence.length >= 2 && /days past due/.test(x.rationale)), "reminders: carry amount (for caps), evidence and a reason");
  check(r[0].key === `watch:org-1:remind:a:${W.isoWeek(today)}`, "reminders: idempotency key is per invoice per week", r[0].key);
}
{
  const rev = W.planWatch({ ...base, invoices: [...base.invoices].reverse() }).filter((x) => x.action === "send_payment_reminder").map((x) => x.args.invoice_id);
  check(rev[0] === "g" && rev[1] === "h" && rev[2] === "a", "reminders: ranked by cost whatever order the rows arrive in", rev.join(","));
}
check(W.planWatch({ ...base, collectionsOn: true }).every((x) => x.action !== "send_payment_reminder"), "reminders: none when the collections engine is on (it drafts its own)");
check(W.isoWeek("2026-10-08") === W.isoWeek("2026-10-11") && W.isoWeek("2026-10-08") !== W.isoWeek("2026-10-12"), "keys: same week, same key; next Monday, new key", `${W.isoWeek("2026-10-08")} ${W.isoWeek("2026-10-11")} ${W.isoWeek("2026-10-12")}`);
check(W.isoWeek("2026-01-01") === "2026-W01" && W.isoWeek("2027-01-01") === "2026-W53", "keys: ISO week numbering at year edges", `${W.isoWeek("2026-01-01")} ${W.isoWeek("2027-01-01")}`);

{
  const p = W.planWatch({ ...base, invoices: [], msme: [
    { party: "Micro Supplier", udyam_category: "micro", total_amount: 120000, oldest_days: 61, past_window: true, invoice_count: 2 },
    { party: "Small Supplier", udyam_category: "small", total_amount: 30000, oldest_days: 50, past_window: true, invoice_count: 1 },
    { party: "Medium Supplier", udyam_category: "medium", total_amount: 900000, oldest_days: 90, past_window: true, invoice_count: 3 },
    { party: "Unknown Supplier", udyam_category: "unclassified", total_amount: 40000, oldest_days: 35, past_window: false, invoice_count: 1 },
  ] });
  const crit = p.find((x) => x.key.includes(":msme:"));
  check(crit && crit.args.severity === "critical" && /₹1,50,000/.test(crit.args.message) && /2 micro\/small/.test(crit.args.message) && /Micro Supplier, 61 days/.test(crit.args.message), "msme: covered suppliers past the window raise a critical alert with the real total", crit?.args.message);
  check(!JSON.stringify(crit).includes("Medium Supplier"), "msme: a medium supplier is not counted (no 43B(h) effect)");
  const nudge = p.find((x) => x.key.includes(":msme-classify:"));
  check(nudge && nudge.args.severity === "warning" && /not classified/.test(nudge.args.message), "msme: unclassified old bills raise a classify nudge");
  check(W.planWatch({ ...base, invoices: [], msme: [{ party: "M", udyam_category: "medium", total_amount: 1, oldest_days: 99, past_window: true, invoice_count: 1 }] }).length === 0, "msme: nothing to say, nothing said");
}
{
  const p = W.planWatch({ ...base, invoices: [], deals: [
    { id: "1", deal_name: "Big deal", customer_name: "A", value: 900000, stage: "proposal", updated_at: "2026-09-01", created_at: "2026-08-01" },
    { id: "2", deal_name: "Won deal", customer_name: "B", value: 9900000, stage: "won", updated_at: "2026-08-01", created_at: "2026-07-01" },
    { id: "3", deal_name: "Fresh deal", customer_name: "C", value: 800000, stage: "qualified", updated_at: "2026-10-01", created_at: "2026-08-01" },
    { id: "4", deal_name: "Old untouched", customer_name: "D", value: 100000, stage: "lead", updated_at: null, created_at: "2026-08-15" },
  ] });
  const d = p.find((x) => x.key.includes(":deals:"));
  check(d && /Big deal/.test(d.args.message) && /Old untouched/.test(d.args.message), "deals: cold open deals are named", d?.args.message);
  check(d && !/Won deal/.test(d.args.message) && !/Fresh deal/.test(d.args.message), "deals: won and recently moved deals are not 'cold'");
  check(d && d.args.message.indexOf("Big deal") < d.args.message.indexOf("Old untouched"), "deals: biggest first");
}
{
  const p = W.planWatch({ ...base, invoices: [], quotes: [
    { id: "q1", quote_no: "Q-1", party: "Buyer A", amount: 250000, status: "open", valid_until: "2026-09-30", created_at: "2026-09-10" },
    { id: "q2", quote_no: "Q-2", party: "Buyer B", amount: 50000, status: "open", valid_until: "2026-12-01", created_at: "2026-09-25" },
    { id: "q3", quote_no: "Q-3", party: "Buyer C", amount: 70000, status: "open", valid_until: null, created_at: "2026-10-05" },
  ] });
  const q = p.find((x) => x.key.includes(":quotes:"));
  check(q && /2 quotes worth ₹3,00,000/.test(q.args.message) && /1 already past validity/.test(q.args.message) && /Buyer A/.test(q.args.message), "quotes: open quotes over a week old, with the expired ones called out", q?.args.message);
}
{
  const p = W.planWatch({ ...base, invoices: [], stock: [
    { id: "s1", name: "TMT 12mm", on_hand: 0, reorder_level: 50, supplier: "Shree Balaji" },
    { id: "s2", name: "Cement", on_hand: 40, reorder_level: 50, supplier: null },
    { id: "s3", name: "Paint", on_hand: 90, reorder_level: 50, supplier: null },
    { id: "s4", name: "No level", on_hand: 0, reorder_level: 0, supplier: null },
  ] });
  const st = p.find((x) => x.key.includes(":stock:"));
  check(st && st.args.severity === "critical" && /2 stock items/.test(st.args.message) && /1 already out/.test(st.args.message) && st.args.message.indexOf("TMT 12mm") < st.args.message.indexOf("Cement") && !/Paint|No level/.test(st.args.message), "stock: items at or below reorder level, emptiest first, critical when one is out", st?.args.message);
}
check(W.planWatch({ ...base, invoices: [] }).length === 0, "an empty workspace gets nothing (no invented work)");
check(W.planWatch(base).every((x) => /^watch:org-1:/.test(x.key) && x.key.endsWith(W.isoWeek(today))), "every proposal is keyed to this workspace and this week");

/* ── wiring ── */
const watch = read("src/lib/watch.ts");
check(/source: "autopilot", proposedBy: null/.test(watch) && /idempotencyKey: p\.key/.test(watch), "runWatch: proposals go through the ledger as autopilot, idempotently");
check(!/\.insert\(|\.update\(|sendEmail|sendWhatsApp/.test(watch), "runWatch: writes nothing itself — the ledger and the owner's rules do");
check(/action", "send_payment_reminder"\)\.gte\("created_at", since7\)/.test(watch), "runWatch: knows what it already proposed this week");
const cron = read("src/app/api/cron/autopilot/route.ts");
check(/rotate\("watch", entitledOrgs, WATCH_CAP\)/.test(cron), "cron: watch runs for entitled workspaces, rotated");
check(/inWaves\(watch\.batch, WATCH_WIDTH, budget\.slice\(SHARE\.watch\)/.test(cron) && /await watch\.commit\(watched\)/.test(cron), "cron: in waves, committing what was reached");
check(/inWaves\(on \|\| \[\], COLLECTIONS_WIDTH, cBudget/.test(cron), "cron: collections runs five workspaces at a time");
check(/inWaves\(analysis\.batch, ANALYSIS_WIDTH, aBudget/.test(cron) && /from\("ai_insights"\)\.insert\(\{\s*org_id: o\.id, module: "autopilot"/.test(cron), "cron: the daily analysis is an insight, six at a time");
check(!/from\("alerts"\)\.insert\(\{ org_id: o\.id, severity: "yellow", module: "autopilot"/.test(cron), "cron: the daily analysis is no longer an alert");
check(/\.neq\("module", "autopilot"\)/.test(read("src/lib/metrics.ts")), "metrics: a save does not wipe tonight's AI read");
check(/your attention/.test(read("src/lib/alert-delivery.ts")) && !/crossed a line you set/.test(read("src/lib/alert-delivery.ts")), "alert email no longer claims every alert was a line the owner set");
const cb = read("src/lib/cron-budget.ts");
check(/export async function inWaves/.test(cb) && /if \(!budget\.ok\(perItemMs\)\) break;/.test(cb), "inWaves: a wave starts only if the budget can finish it");

/* inWaves executed */
{
  const src = cb.slice(cb.indexOf("export async function inWaves"), cb.indexOf("export const SHARE_TOTAL_MS"));
  const inWaves = new Function(`return (${src.replace(/^export async function inWaves<T>/, "async function inWaves").replace(/: T\[\]|: number|: Budget|: \(item: T\) => Promise<void>|: Promise<number>/g, "")})`)();
  let budgetLeft = 3;
  const budget = { ok: () => budgetLeft-- > 0 };
  const seen = [];
  const done = await inWaves([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 3, budget, 1000, async (x) => { seen.push(x); if (x === 2) throw new Error("boom"); });
  check(done === 9 && seen.join(",") === "1,2,3,4,5,6,7,8,9", "inWaves: stops between waves when the budget runs out, and one failure does not stop its wave", `${done} ${seen}`);
}

console.log(`\nwatch: ${pass} passed, ${failures.length} failed`);
for (const x of failures) console.log("  ✗ " + x);
process.exit(failures.length ? 1 : 0);
