/**
 * Tally XML → Cortex rows. Pure, shared by scripts/tally-bridge.mjs and
 * scripts/test-tally-bridge.mjs, so what is tested is what runs next to Tally.
 */
export const pick = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim() : "";
};
export const money = (v) => Math.abs(parseFloat(String(v).replace(/[^0-9.-]/g, "")) || 0);
export const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Tally writes dates as YYYYMMDD in exports and "1-Apr-2026" in some reports. */
const MON = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
export function tallyIso(s) {
  const v = String(s || "").trim();
  if (/^\d{8}$/.test(v)) return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/.exec(v);
  if (m && MON[m[2].toLowerCase()]) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${MON[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`; }
  return "";
}

export function parseVouchers(xml, creditDays = 30) {
  const blocks = xml.match(/<VOUCHER[\s\S]*?<\/VOUCHER>/gi) || [];
  const sales = [];
  const invoices = [];
  for (const b of blocks) {
    const type = pick(b, "VOUCHERTYPENAME").toLowerCase();
    const party = pick(b, "PARTYLEDGERNAME") || pick(b, "PARTYNAME");
    const amount = money(pick(b, "AMOUNT"));
    const iso = tallyIso(pick(b, "DATE"));
    const no = pick(b, "VOUCHERNUMBER");
    if (!amount) continue;
    /*
      KEYS MUST BE STABLE ACROSS RUNS — Cortex upserts on them. A voucher with
      no number gets a key from its own content (date, party, amount), never
      from its position in this run's list. Tally numbers each voucher TYPE
      separately, so purchase keys are prefixed so they cannot overwrite a sale.
    */
    const fallback = `${iso || "nodate"}-${party || "noparty"}-${amount}`.replace(/\s+/g, "_").slice(0, 80);
    const due = iso ? addDays(iso, creditDays) : undefined;
    if (type.includes("sales")) {
      const key = no || `TALLY-${fallback}`;
      sales.push({ order_no: key, customer_name: party, amount, status: "won", order_date: iso || undefined });
      invoices.push({ invoice_no: key, party, amount, type: "receivable", status: "pending", issue_date: iso || undefined, due_date: due });
    } else if (type.includes("purchase")) {
      invoices.push({ invoice_no: `PUR-${no || fallback}`, party, amount, type: "payable", status: "pending", issue_date: iso || undefined, due_date: due });
    }
  }
  return { sales, invoices };
}

/**
 * Tally's "Bills Receivable" / "Bills Payable" reports: one entry per bill
 * STILL OUTSTANDING (bill-wise details). Returns ref → { pending, due }.
 */
export function parseOutstanding(xml) {
  const out = new Map();
  const blocks = xml.match(/<BILLFIXED>[\s\S]*?<\/BILLFIXED>[\s\S]*?(?=<BILLFIXED>|<\/ENVELOPE>|$)/gi) || [];
  for (const b of blocks) {
    const ref = pick(b, "BILLREF");
    if (!ref) continue;
    out.set(ref, { pending: money(pick(b, "BILLCL")), due: tallyIso(pick(b, "BILLDUE")) || undefined });
  }
  return out;
}

/**
 * PAID OR NOT. Tally records payment in Receipt/Payment vouchers against the
 * bill; the outstanding report is the bill-wise answer. A bill that is in the
 * register but NOT in the outstanding list has been settled.
 *
 * Only applied when the outstanding report came back with at least one bill:
 * a company that does not maintain bill-wise details returns an empty report,
 * and reading that as "everything is paid" would wipe its receivables. Then
 * nothing changes and the caller says so.
 */
export function applyOutstanding(invoices, receivable, payable) {
  const r = { applied: { receivable: receivable.size > 0, payable: payable.size > 0 }, paid: 0 };
  for (const inv of invoices) {
    const isPay = inv.type === "payable";
    const book = isPay ? payable : receivable;
    if (!book.size) continue;
    const ref = isPay ? inv.invoice_no.replace(/^PUR-/, "") : inv.invoice_no;
    const hit = book.get(ref);
    if (hit) {
      if (hit.due) inv.due_date = hit.due;
      if (inv.due_date && inv.due_date < new Date().toISOString().slice(0, 10)) inv.status = "overdue";
    } else {
      inv.status = "paid"; r.paid++;
    }
  }
  return r;
}

/** Stable fingerprint of a row, for "only push what changed". */
export const fingerprint = (row) => JSON.stringify(Object.keys(row).sort().map((k) => [k, row[k]]));
