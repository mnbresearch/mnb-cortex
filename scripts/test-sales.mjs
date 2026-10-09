/*
  THE SALES SIDE — numbers that are true, actions that happen once.

    1. Pipeline: won/lost/closed deals are not "open pipeline"; a stage's
       weight is the default probability; a move takes the new stage's weight
       and must actually move a row.
    2. Leads: scored by a fixed, explainable rule; converted once.
    3. "Won" in any case counts as revenue (importer, customer pages, RFM).
    4. KPIs read every order, not the latest 200; RFM is paged past 1,000.
    5. A quote turned into an invoice is due after payment terms, not on the
       quote's expiry.

  Run: node --experimental-strip-types --no-warnings scripts/test-sales.mjs
*/
import { readFileSync } from "node:fs";

let pass = 0; const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? `\n      ${d}` : ""}`));
const read = (p) => readFileSync(p, "utf8");
const fn = (src, name) => { const i = src.indexOf(`export async function ${name}`); const j = src.indexOf("\nexport ", i + 10); return src.slice(i, j < 0 ? undefined : j); };

const L = await import("../src/lib/lead-score.ts");

/* 1. pipeline */
{
  const deals = [
    { id: "w", deal_name: "Won", value: 5_000_000, stage: "won", probability: null, created_at: new Date().toISOString() },
    { id: "l", deal_name: "Lost", value: 9_000_000, stage: "lost", probability: null },
    { id: "n", deal_name: "Neg", value: 1_000_000, stage: "negotiation", probability: null, created_at: new Date().toISOString() },
    { id: "q", deal_name: "Lead", value: 1_000_000, stage: "lead", probability: null, created_at: new Date().toISOString() },
  ];
  const s = L.scorePipeline(deals);
  check(s.length === 2 && !s.some((d) => d.id === "w" || d.id === "l"), "pipeline: won and lost deals are not open pipeline", s.map((d) => d.id).join(","));
  check(s[0].id === "n" && Math.round(s[0].expected) === 850000 && Math.round(s[1].expected) === 150000, "pipeline: no stored probability → the stage's weight decides the forecast", s.map((d) => `${d.id}:${d.expected}`).join(","));
  check(L.DEAL_STAGES.join(",") === "lead,qualified,proposal,negotiation,won,lost" && L.STAGE_WEIGHT.negotiation === 0.85, "pipeline: stages and weights are exported for moveDeal");
}
const acts = read("src/lib/actions.ts");
{
  const add = fn(acts, "addDeal");
  check(/typed === "" \? null/.test(add) && !/\|\| 30\) \/ 100/.test(add), "addDeal: a blank probability is stored as null, not 30%");
  const mv = fn(acts, "moveDeal");
  check(/DEAL_STAGES as readonly string\[\]\)\.includes\(stage\)/.test(mv), "moveDeal: only real stages");
  check(/probability: STAGE_WEIGHT\[stage\] \?\? null/.test(mv), "moveDeal: the deal takes its new stage's probability");
  check(/\.select\("id"\);\s*if \(error\) throw new Error\(error\.message\);\s*if \(!moved \|\| moved\.length !== 1\)/.test(mv), "moveDeal: a move that changed no row is not a success");
  check(/unwinErr/.test(mv), "moveDeal: reopening the sales order on un-win is checked");
}

/* 2. leads */
{
  const now = Date.parse("2026-10-09T10:00:00Z");
  const hot = L.scoreLead({ name: "Ravi", email: "ravi@acmesteel.in", phone: "98765 43210", company: "Acme Steel", plan: "Watch Pro", note: "Need it for 3 branches, call after 4", source: "referral", created_at: "2026-10-09T08:00:00Z" }, now);
  const cold = L.scoreLead({ name: "x", source: "import", created_at: "2026-06-01T00:00:00Z" }, now);
  const gmail = L.scoreLead({ email: "ravi@gmail.com" }, now);
  const biz = L.scoreLead({ email: "ravi@acmesteel.in" }, now);
  check(hot.band === "hot" && hot.score >= 90 && /referral/.test(hot.why) && /business email/.test(hot.why), "leads: a complete, referred, fresh lead is hot, with its reasons", JSON.stringify(hot));
  check(cold.band === "cold" && cold.score < 20 && /days old/.test(cold.why), "leads: an old lead with nothing is cold and says why", JSON.stringify(cold));
  check(biz.score - gmail.score === 15, "leads: a business email domain outranks a free one");
  check(L.scoreLead({}, now).score === 0 && L.scoreLead({}, now).why === "almost no details", "leads: nothing known → zero, said plainly");
  const page = read("src/app/(app)/leads/page.tsx");
  check(/scoreLead\(l\)/.test(page) && /b\._s\.score - a\._s\.score/.test(page), "leads page: scored and sorted hottest first");
  check(/l\._c \? <Badge/.test(page), "leads page: a converted lead shows Customer, not the button");
  check(/Never put the key in browser code/.test(page), "leads page: the API route is described safely");
  const conv = fn(acts, "convertLead");
  check(/converted_customer_id \|\| \/· converted\$\//.test(conv) && /already a customer/.test(conv), "convertLead: a second conversion is refused");
  check(/company: \(lead as any\)\.company/.test(conv) && /notes: \(lead as any\)\.note/.test(conv), "convertLead: company and note carry over");
}

/* 3. case */
check(/if \(table === "sales_orders" && o\.status\) o\.status = String\(o\.status\)\.trim\(\)\.toLowerCase\(\);/.test(read("src/lib/import-map.ts")), "import: sales status is lowercased");
check(!/\.eq\("status", "won"\)/.test(read("src/lib/customer-history.ts")), "RFM/churn: 'Won' in any case counts");
check(/String\(o\.status \|\| "won"\)\.trim\(\)\.toLowerCase\(\) === "won"/.test(read("src/lib/customer-360.ts")), "customer page: 'Won' in any case counts");
const mig = read("supabase/migrations/2026_zzzv_media_sales_watch.sql");
check(/update sales_orders set status = lower\(trim\(status\)\)/.test(mig), "db: stored mixed-case statuses are fixed once");
check(/create trigger sales_pipeline_touch before update on sales_pipeline/.test(mig), "db: a moved deal is no longer 'cold' — updated_at follows every change");

/* 4. completeness */
const hist = read("src/lib/customer-history.ts");
check(/pageAll<any>\(\(a, b\) => sb\.from\("sales_orders"\)/.test(hist) && /capped: truncated/.test(hist), "RFM/churn: paged, and says when it is incomplete");
const sales = read("src/app/(app)/sales/page.tsx");
check(/getSalesOrderStats\(\)/.test(sales) && /const won = all\.filter/.test(sales), "sales KPIs: computed over every order, not the table's 200");

/* 5. quotes */
const q = fn(acts, "convertQuoteToInvoice");
check(/due_date: due,/.test(q) && !/due_date: q\.valid_until/.test(q), "quote → invoice: due after payment terms, not on the quote's expiry");
check(/payment_terms_days\) \|\| 30/.test(q) && /recomputeQuietly\(orgId\)/.test(q) && /"\/invoice"/.test(q), "quote → invoice: 30-day default, KPIs recomputed, the real page revalidated");
check(/"order_no":"SO-1001"/.test(read("src/app/(app)/developers/page.tsx")), "developers: the sample request carries its key, so it writes a row");

console.log(`\nsales: ${pass} passed, ${failures.length} failed`);
for (const x of failures) console.log("  ✗ " + x);
process.exit(failures.length ? 1 : 0);
