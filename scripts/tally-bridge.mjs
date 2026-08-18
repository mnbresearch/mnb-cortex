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
 *
 * Get the API key from Cortex → Developers · API → Generate key.
 * See SETUP.md → Tally for the full walkthrough.
 */

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

if (!API_KEY) {
  console.error("Missing --key. Generate one in Cortex → Developers · API, then:\n  node scripts/tally-bridge.mjs --key=ck_xxx");
  process.exit(1);
}

/** Ask Tally for a report as XML. */
async function tallyRequest(reportName) {
  const xml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>${reportName}</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></DESC></BODY></ENVELOPE>`;
  const r = await fetch(TALLY, { method: "POST", headers: { "Content-Type": "text/xml" }, body: xml });
  if (!r.ok) throw new Error(`Tally responded ${r.status}. Is Tally running with HTTP access enabled on ${TALLY}?`);
  return r.text();
}

/** Minimal XML field reader — enough for Tally's flat collection output. */
const pick = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : "";
};
const money = (v) => Math.abs(parseFloat(String(v).replace(/[^0-9.-]/g, "")) || 0);

function parseVouchers(xml) {
  const blocks = xml.match(/<VOUCHER[\s\S]*?<\/VOUCHER>/gi) || [];
  const sales = [];
  const invoices = [];
  for (const b of blocks) {
    const type = pick(b, "VOUCHERTYPENAME").toLowerCase();
    const party = pick(b, "PARTYLEDGERNAME") || pick(b, "PARTYNAME");
    const amount = money(pick(b, "AMOUNT"));
    const date = pick(b, "DATE");
    const iso = /^\d{8}$/.test(date) ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : "";
    const no = pick(b, "VOUCHERNUMBER");
    if (!amount) continue;

    if (type.includes("sales")) {
      sales.push({ order_no: no || `TALLY-${sales.length + 1}`, customer_name: party, amount, status: "won", order_date: iso || undefined });
      invoices.push({ invoice_no: no || `TALLY-${invoices.length + 1}`, party, amount, type: "receivable", status: "pending", due_date: iso || undefined });
    } else if (type.includes("purchase")) {
      invoices.push({ invoice_no: no || `TALLYP-${invoices.length + 1}`, party, amount, type: "payable", status: "pending", due_date: iso || undefined });
    }
  }
  return { sales, invoices };
}

async function pushToCortex(table, rows) {
  if (!rows.length) return { ok: true, inserted: 0 };
  const out = { ok: true, inserted: 0 };
  // Chunked so a big ledger doesn't build one enormous request.
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const r = await fetch(`${CORTEX}/api/v1/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({ table, rows: chunk }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) { out.ok = false; out.error = j.error || `HTTP ${r.status}`; break; }
    out.inserted += chunk.length;
  }
  return out;
}

async function syncOnce() {
  const stamp = new Date().toLocaleString("en-IN");
  try {
    process.stdout.write(`[${stamp}] Reading Tally at ${TALLY} … `);
    const xml = await tallyRequest("Voucher Register");
    const { sales, invoices } = parseVouchers(xml);
    console.log(`${sales.length} sales, ${invoices.length} invoices`);

    const a = await pushToCortex("sales_orders", sales);
    const b = await pushToCortex("invoices", invoices);

    if (a.ok && b.ok) {
      console.log(`[${stamp}] Pushed ${a.inserted} sales orders and ${b.inserted} invoices. Your Cortex dashboard will refresh automatically.`);
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
