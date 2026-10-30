/** The Tally bridge's parsing and paid-status rule (scripts/lib/tally-parse.mjs). */
import { parseVouchers, parseOutstanding, applyOutstanding, fingerprint, tallyIso } from "./lib/tally-parse.mjs";
import { readFileSync } from "node:fs";
let pass = 0; const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(n + (d ? `\n      ${d}` : "")));

const V = (type, no, party, amt, date) => `<VOUCHER><DATE>${date}</DATE><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME><VOUCHERNUMBER>${no}</VOUCHERNUMBER><PARTYLEDGERNAME>${party}</PARTYLEDGERNAME><AMOUNT>-${amt}</AMOUNT></VOUCHER>`;
const reg = `<ENVELOPE>${V("Sales", "S-1", "Acme &amp; Co", "1000.00", "20260901")}${V("Sales", "S-2", "Beta", "500", "20200101")}${V("Purchase", "P-1", "Steel", "300", "20260905")}${V("Receipt", "R-1", "Acme", "1000", "20260910")}</ENVELOPE>`;
const { sales, invoices } = parseVouchers(reg, 30);
check(sales.length === 2 && invoices.length === 3, "register: sales → order + receivable, purchase → payable, receipts ignored");
check(invoices[0].party === "Acme & Co" && invoices[0].due_date === "2026-10-01", "register: XML entities decoded; due = date + credit days");
check(invoices.find((i) => i.type === "payable").invoice_no === "PUR-P-1", "register: purchase keys prefixed");
check(tallyIso("1-Apr-2026") === "2026-04-01" && tallyIso("20261031") === "2026-10-31" && tallyIso("x") === "", "dates: both Tally formats");

const out = `<ENVELOPE><BILLFIXED><BILLDATE>20200101</BILLDATE><BILLREF>S-2</BILLREF><BILLPARTY>Beta</BILLPARTY></BILLFIXED><BILLCL>-500.00</BILLCL><BILLDUE>31-Jan-2020</BILLDUE></ENVELOPE>`;
const rec = parseOutstanding(out);
check(rec.size === 1 && rec.get("S-2").pending === 500 && rec.get("S-2").due === "2020-01-31", "outstanding: bill ref, pending amount and due date read");
const pay = parseOutstanding("<ENVELOPE></ENVELOPE>");
const res = applyOutstanding(invoices, rec, pay);
const by = Object.fromEntries(invoices.map((i) => [i.invoice_no, i]));
check(by["S-1"].status === "paid", "paid: not outstanding → settled");
check(by["S-2"].status === "overdue" && by["S-2"].due_date === "2020-01-31", "overdue: still outstanding and past Tally's due date");
check(by["PUR-P-1"].status === "pending", "safety: empty Bills Payable leaves payables alone (never 'everything paid')");
check(res.paid === 1 && res.applied.receivable && !res.applied.payable, "result reports what was applied");

const inv2 = parseVouchers(reg, 30).invoices;
applyOutstanding(inv2, new Map(), new Map());
check(inv2.every((i) => i.status === "pending"), "safety: no bill-wise data → no status changes");
check(fingerprint({ b: 1, a: 2 }) === fingerprint({ a: 2, b: 1 }) && fingerprint({ a: 1 }) !== fingerprint({ a: 2 }), "fingerprint: key order irrelevant, value changes detected");

const bridge = readFileSync(new URL("./tally-bridge.mjs", import.meta.url), "utf8");
check(/Authorization: `Bearer \$\{API_KEY\}`/.test(bridge), "bridge: sends the key as a Bearer header");
check(/r\.status === 413 && size > 100/.test(bridge) && /let size = 2000/.test(bridge), "bridge: 2,000-row batches, halves on 413");
check(/cache\[`\$\{table\}:\$\{keyOf\(r\)\}`\] !== fingerprint\(r\)/.test(bridge), "bridge: only changed rows are pushed");

if (failures.length) { console.error(`\ntally bridge: ${pass} passed, ${failures.length} failed`); for (const f of failures) console.error("  ✗ " + f); process.exit(1); }
console.log(`tally bridge: ${pass} passed, 0 failed`);
