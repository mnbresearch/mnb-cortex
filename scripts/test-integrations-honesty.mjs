/*
  INTEGRATIONS: WHAT THEY CLAIM, WHAT THEY DO, AND WHETHER THEY STILL WORK.

  From an audit of all 63 catalogue entries (only 6 use the credential after
  saving: 4 pull data in, 2 send out). Every assertion here is a defect that
  existed:
    · descriptions promising behaviour no code performs
    · a rejected key saved anyway and shown as connected
    · a provider outage reported as "your key was rejected"
    · syncs silently stopping at the first page
    · sync failures never shown
    · WhatsApp numbers written "09876…" failing at Meta
    · a Graph API version about to expire
    · the Tally bridge re-keying rows by list position
  Executed where the code is pure (phone normalisation, Tally parsing,
  version expiry); structural where it needs a network.

  Run: node scripts/test-integrations-honesty.mjs
*/
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

let pass = 0; const fails = [];
const check = (c, n, d = "") => (c ? pass++ : fails.push(`${n}${d ? `\n      ${d}` : ""}`));
const read = (p) => readFileSync(p, "utf8");

/* 1. Catalogue copy tells the truth about what each entry does */
const cat = read("src/lib/integrations.ts");
const entries = [...cat.matchAll(/\{ id: "([a-z0-9_]+)", name: "([^"]+)",[^}]*?desc: "([^"]+)"/g)].map((m) => ({ id: m[1], name: m[2], desc: m[3] }));
check(entries.length >= 60, `catalogue parsed (${entries.length} entries)`);
const ACTIVE = new Set(["shopify", "razorpay", "stripe", "google_sheets", "ai", "whatsapp", "resend"]);
const FALSE_PROMISES = /alerts and daily briefs|bot alerts to|push cortex events to any url|connect 6,000\+ apps|transactional email delivery|use your own model key for ai features|visual automation flows$|open-source workflow automation$/i;
for (const e of entries) {
  if (ACTIVE.has(e.id)) continue;
  check(!FALSE_PROMISES.test(e.desc), `${e.name}: description does not promise behaviour no code performs`, e.desc);
}
check(/key: "from_email"/.test(cat.slice(cat.indexOf('id: "resend"'), cat.indexOf('id: "resend"') + 700)), "Resend has the from_email field collections reads (own-domain reminders could never be configured)");
check(/key: "data_center"/.test(cat.slice(cat.indexOf('id: "zoho_books"'), cat.indexOf('id: "zoho_books"') + 700)), "Zoho Books asks for its data centre");

/* 2. Credential checks */
const route = read("src/app/api/integrations/route.ts");
const tc = route.slice(route.indexOf("async function testCredentials"), route.indexOf("export async function POST"));
check(/r\.status === 429 \|\| r\.status >= 500\) return \{ ok: false, verified: false, unreachable: true/.test(tc), "429/5xx from a provider is 'could not verify', not 'rejected'");
check(/const fetch = \(u: string, init: RequestInit = \{\}\) => globalThis\.fetch\(u, \{ \.\.\.init, signal: AbortSignal\.timeout\(15_000\) \}\)/.test(tc), "every credential probe is time-bounded");
check(!/api_token=\$\{/.test(tc), "no token in a query string (Pipedrive uses a header)");
check(/restricted_api_key/.test(tc), "a Resend sending-only key is recognised as valid");
check(/zohoapis\.\$\{dc\}/.test(tc), "Zoho is checked against the account's own data centre");
check(/replace\(\/\^https\?:\\\/\\\/\/i, ""\)/.test(tc), "the Shopify check strips https:// like the sync does");
const post = route.slice(route.indexOf("export async function POST"));
check(/if \(test\.verified && !test\.ok\) \{\s*return NextResponse\.json\(\{ ok: false/.test(post), "a key the provider REJECTED is not saved (was: saved and shown in green)");
check(post.indexOf("if (test.verified && !test.ok)") < post.indexOf("encryptSecret(JSON.stringify(creds))"), "…and the refusal happens before encryption/storage");
check(/return r\.unreachable \? \{ ok: false, verified: false, unreachable: true/.test(tc), "a Meta outage is not recorded as a rejected WhatsApp token");

/* 3. Sync really pulls everything, and says when it fails */
const sync = read("src/lib/sync/index.ts");
check(/rel="next"/.test(sync) && /while \(url && pages < MAX_PAGES\)/.test(sync), "Shopify follows the Link-header cursor");
check(/skip=\$\{skip\}/.test(sync), "Razorpay pages with skip");
check(/starting_after/.test(sync) && /has_more/.test(sync), "Stripe pages with starting_after/has_more");
check((sync.match(/truncated \?/g) || []).length >= 3, "a page cap that is hit is reported in the sync note");
check(/financial_status/.test(sync) && !/value: money\(o\.total_price\)/.test(sync), "Shopify: only paid orders are 'won'; customer value is no longer overwritten by the last order");
check(/amount_refunded/.test(sync), "Stripe: partial refunds book the amount kept");
check(/order\("last_sync", \{ ascending: true, nullsFirst: true \}\)/.test(sync), "nightly sync runs longest-unsynced first");
check(/2026_upsert_arbiter_fix\.sql/.test(sync) && !/2026_sync_conflict_fix/.test(sync), "the error hint names a migration that exists");
const data = read("src/lib/data.ts");
check(/select\("provider,status,config,last_sync,last_error"\)/.test(data), "the integrations page reads last_sync and last_error");
check(/conn\.lastError/.test(read("src/components/integrations-manager.tsx")), "…and shows them on the card");

/* 4. WhatsApp: number formats and API version (executed) */
const wa = read("src/lib/whatsapp.ts");
const dir = mkdtempSync(join(tmpdir(), "wa-"));
writeFileSync(join(dir, "wa.mjs"), `export ${wa.slice(wa.indexOf("function normalisePhone"), wa.indexOf("\n}\n", wa.indexOf("function normalisePhone")) + 2).replace(/: string \| null/, "").replace(/\(raw: string\)/, "(raw)")}`);
const { normalisePhone } = await import(pathToFileURL(join(dir, "wa.mjs")).href);
const cases = [["9876543210", "919876543210"], ["09876543210", "919876543210"], ["+91 98765 43210", "919876543210"], ["0091 98765 43210", "919876543210"], ["+1 415 555 0100", "14155550100"], ["12345", null], ["", null]];
for (const [inp, want] of cases) check(normalisePhone(inp) === want, `normalisePhone(${JSON.stringify(inp)}) = ${want}`, `got ${normalisePhone(inp)}`);
const EXPIRY = { "v20.0": "2026-09-24", "v21.0": "2027-01-21", "v22.0": "2027-05-20" };
const v = wa.match(/GRAPH_VERSION = "(v[\d.]+)"/)?.[1];
check(Boolean(v), `Graph API version is pinned in one constant (${v})`);
if (EXPIRY[v]) check(Date.parse(EXPIRY[v]) - Date.now() > 120 * 86_400_000, `Graph ${v} is more than 120 days from its published expiry (${EXPIRY[v]})`);
check(/signal: AbortSignal\.timeout\(20_000\)/.test(wa), "WhatsApp sends are time-bounded");

/* 5. Tally bridge: stable keys, real dates (executed) */
const tb = read("scripts/tally-bridge.mjs");
const parse = new Function("CREDIT_DAYS", tb.slice(tb.indexOf("const pick ="), tb.indexOf("async function pushToCortex")) + "; return parseVouchers;")(30);
const xml = (n) => `<VOUCHER><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><PARTYLEDGERNAME>Acme</PARTYLEDGERNAME><AMOUNT>-1180</AMOUNT><DATE>20260415</DATE>${n}</VOUCHER>`;
const a = parse(xml("<VOUCHERNUMBER>12</VOUCHERNUMBER>") + "<VOUCHER><VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME><PARTYLEDGERNAME>S</PARTYLEDGERNAME><AMOUNT>500</AMOUNT><DATE>20260416</DATE><VOUCHERNUMBER>12</VOUCHERNUMBER></VOUCHER>");
check(a.invoices.map((i) => i.invoice_no).join() === "12,PUR-12", "sales #12 and purchase #12 get distinct keys", a.invoices.map((i) => i.invoice_no).join());
check(a.sales[0].order_date === "2026-04-15" && a.invoices[0].issue_date === "2026-04-15" && a.invoices[0].due_date === "2026-05-15", "voucher date kept; due = date + credit days (was: due on the voucher date → everything overdue)");
const k1 = parse(xml("")).sales[0].order_no, k2 = parse(xml("") + xml("") ).sales[0].order_no;
check(k1 === k2 && /^TALLY-2026-04-15-Acme-1180$/.test(k1), `a numberless voucher's key comes from its content, not its list position (${k1})`);
check(/<TYPE>Data<\/TYPE>/.test(tb) && /SVFROMDATE/.test(tb), "the Voucher Register is requested as a report with a date range");

console.log(`\nintegrations honesty: ${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
