#!/usr/bin/env node
/**
 * MNB Cortex — Tally bridge.
 *
 * Tally Prime serves its HTTP/XML gateway on localhost (default port 9000) on
 * the machine it runs on. Cortex runs on Vercel, on the public internet, and
 * cannot reach your LAN — no amount of code changes that. So the connection has
 * to be made from YOUR side: this script runs next to Tally, pulls the ledgers
 * and pushes them into Cortex through the public API you already have.
 *
 * Usage:
 *   node scripts/tally-bridge.mjs --key=<CORTEX_API_KEY> [--tally=http://localhost:9000] [--watch]
 *        [--from=2026-04-01] [--to=2027-03-31] [--credit-days=30]
 *
 * Safe to run repeatedly: Cortex upserts on the voucher number, so a re-run
 * updates rows instead of duplicating them (this needs the 2026_zzzt
 * migration on the Cortex side — before it, the second run failed).
 *
 * PAID STATUS: each run also reads Tally's Bills Receivable and Bills Payable
 * (bill-wise outstanding). A bill in the register that is no longer
 * outstanding is sent as paid; one past its due date as overdue. If the
 * company does not keep bill-wise details those reports are empty, and the
 * bridge leaves statuses alone rather than marking everything paid
 * (--no-paid-status turns this off entirely).
 *
 * ONLY CHANGES ARE PUSHED. A small cache next to this script
 * (.tally-bridge-cache.json) remembers what was sent, so a 30-minute run with
 * nothing new costs no API calls at all — which matters on plans with a small
 * hourly allowance.
 *
 * Get the key from Cortex → Developers → Connect an app → "Tally bridge"
 * (scope connector:write — included on every plan).
 * See SETUP.md → Tally for the full walkthrough.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { parseVouchers, parseOutstanding, applyOutstanding, fingerprint } from "./lib/tally-parse.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);

const API_KEY = args.key || process.env.CORTEX_API_KEY;
const TALLY = (args.tally || process.env.TALLY_URL || "http://localhost:9000").replace(/\/$/, "");
const CORTEX = (args.cortex || process.env.CORTEX_URL || "https://cortex.mnbresearch.com").replace(/\/$/, "");
const WATCH = Boolean(args.watch);
const EVERY_MIN = Number(args.every || 30);
const CREDIT_DAYS = Math.max(0, Math.min(365, Number(args["credit-days"] || 30)));
/* Default window: the current Indian financial year (1 April → 31 March). */
const fyStart = (() => { const d = new Date(); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-04-01`; })();
const FROM = String(args.from || fyStart);
const TO = String(args.to || new Date().toISOString().slice(0, 10));
const tallyDate = (iso) => iso.replace(/-/g, "");
const PAID_STATUS = !args["no-paid-status"];
const CACHE_FILE = new URL("./.tally-bridge-cache.json", import.meta.url);
let cache = {};
try { cache = JSON.parse(readFileSync(CACHE_FILE, "utf8")); } catch { cache = {}; }
const saveCache = () => { try { writeFileSync(CACHE_FILE, JSON.stringify(cache)); } catch { /* read-only folder: every run pushes everything, still correct */ } };

if (!API_KEY) {
  console.error("Missing --key. In Cortex: Developers → Connect an app → Tally bridge. Then:\n  node scripts/tally-bridge.mjs --key=mnbc_xxxxxxxxxx_… --watch");
  process.exit(1);
}

/** Ask Tally for a report as XML. */
async function tallyRequest(reportName) {
  /* "Voucher Register" is a REPORT, so it is exported as TYPE Data with a date
     range — not as a Collection, and not unbounded (an unbounded register on a
     multi-year company file is huge). */
  const xml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>${reportName}</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVFROMDATE>${tallyDate(FROM)}</SVFROMDATE><SVTODATE>${tallyDate(TO)}</SVTODATE></STATICVARIABLES></DESC></BODY></ENVELOPE>`;
  const r = await fetch(TALLY, { method: "POST", headers: { "Content-Type": "text/xml" }, body: xml, signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`Tally responded ${r.status}. Is Tally running with HTTP access enabled on ${TALLY}?`);
  return r.text();
}

/*
  Batches of 2,000 — the smallest plan's per-call allowance for a connector
  key — so a year's ledger is a handful of calls, not dozens. A 413 (a plan
  with a smaller cap, or a future change) halves the batch and retries.
*/
async function pushToCortex(table, all, keyOf) {
  const rows = all.filter((r) => cache[`${table}:${keyOf(r)}`] !== fingerprint(r));
  if (!rows.length) return { ok: true, inserted: 0, unchanged: all.length };
  const out = { ok: true, inserted: 0, unchanged: all.length - rows.length };
  let size = 2000;
  for (let i = 0; i < rows.length;) {
    const chunk = rows.slice(i, i + size);
    const r = await fetch(`${CORTEX}/api/v1/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ table, rows: chunk }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 413 && size > 100) { size = Math.floor(size / 2); continue; }
    if (r.status === 429) { out.ok = false; out.error = `${j.error || "Rate limit reached"} — the rest go on the next run.`; break; }
    if (!r.ok || j.ok === false) { out.ok = false; out.error = j.error || `HTTP ${r.status}`; break; }
    out.inserted += Number(j.written ?? chunk.length);
    if (j.skipped_no_key) out.skipped = (out.skipped || 0) + Number(j.skipped_no_key);
    for (const row of chunk) cache[`${table}:${keyOf(row)}`] = fingerprint(row);
    saveCache();
    i += chunk.length;
  }
  return out;
}

/** Bills Receivable / Payable are reports too; an error here never stops the voucher sync. */
async function outstanding(report) {
  try { return parseOutstanding(await tallyRequest(report)); } catch { return new Map(); }
}

async function syncOnce() {
  const stamp = new Date().toLocaleString("en-IN");
  try {
    process.stdout.write(`[${stamp}] Reading Tally at ${TALLY} (${FROM} → ${TO}) … `);
    const xml = await tallyRequest("Voucher Register");
    const { sales, invoices } = parseVouchers(xml, CREDIT_DAYS);
    console.log(`${sales.length} sales, ${invoices.length} invoices`);

    if (PAID_STATUS) {
      const rec = await outstanding("Bills Receivable");
      const pay = await outstanding("Bills Payable");
      const res = applyOutstanding(invoices, rec, pay);
      if (!res.applied.receivable) console.log(`[${stamp}] Bills Receivable came back empty — keep bill-wise details on in Tally to get paid/overdue status. Statuses left as pending.`);
      else console.log(`[${stamp}] ${res.paid} bill(s) settled in Tally will show as paid.`);
    }

    const a = await pushToCortex("sales_orders", sales, (r) => r.order_no);
    const b = await pushToCortex("invoices", invoices, (r) => r.invoice_no);

    if (a.ok && b.ok) {
      console.log(`[${stamp}] Synced ${a.inserted} sales orders and ${b.inserted} invoices (new or changed; ${a.unchanged + b.unchanged} unchanged, not resent). Your Cortex dashboard will refresh automatically.`);
    } else {
      console.error(`[${stamp}] Push failed: ${a.error || b.error}`);
    }
  } catch (e) {
    console.error(`[${stamp}] ${e.message}`);
  }
}

await syncOnce();
if (WATCH) {
  console.log(`Watching — syncing every ${EVERY_MIN} minutes. Ctrl+C to stop.`);
  setInterval(syncOnce, EVERY_MIN * 60_000);
}
