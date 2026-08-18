import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { recomputeQuietly } from "@/lib/metrics";

/**
 * Integration data sync.
 *
 * The catalogue advertised "62 Integrations" and stored credentials for all of
 * them — but nothing ever READ a stored credential to pull data in. It was a
 * credential vault wearing an integration's clothes.
 *
 * This closes the loop: decrypt the saved credential, call the provider, map
 * their objects onto Cortex's own tables, recompute the KPIs. Adding a
 * connector is one function plus a line in CONNECTORS.
 *
 * Idempotency: each connector writes a deterministic external id into the
 * record's natural key (order_no / invoice_no) and we upsert on it, so
 * re-syncing the same orders can never duplicate them.
 */

export type SyncResult = {
  provider: string;
  ok: boolean;
  salesOrders: number;
  invoices: number;
  customers: number;
  error?: string;
};

type Creds = Record<string, string>;
type Connector = {
  id: string;
  label: string;
  /** Pull recent records. `since` is an ISO timestamp bounding the window. */
  pull: (c: Creds, since: string) => Promise<{ sales?: any[]; invoices?: any[]; customers?: any[] }>;
};

const money = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const day = (iso?: string) => (iso ? String(iso).slice(0, 10) : undefined);

/* ------------------------------------------------------------------ Shopify */
const shopify: Connector = {
  id: "shopify",
  label: "Shopify",
  async pull(c, since) {
    const shop = String(c.shop || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!shop || !c.api_key) throw new Error("Shopify needs a shop domain and access token.");
    const url = `https://${shop}/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=${encodeURIComponent(since)}`;
    const r = await fetch(url, { headers: { "X-Shopify-Access-Token": c.api_key } });
    if (!r.ok) throw new Error(`Shopify returned ${r.status}`);
    const j = await r.json();
    const orders: any[] = Array.isArray(j?.orders) ? j.orders : [];

    return {
      sales: orders.map((o: any) => ({
        order_no: `SHOP-${o.order_number ?? o.id}`,
        customer_name: [o?.customer?.first_name, o?.customer?.last_name].filter(Boolean).join(" ") || o?.email || "Shopify customer",
        product: (o?.line_items || []).map((li: any) => li.title).slice(0, 3).join(", ") || null,
        amount: money(o.total_price),
        status: o.cancelled_at ? "lost" : "won",
        order_date: day(o.created_at),
      })),
      customers: orders
        .filter((o: any) => o?.customer?.id)
        .map((o: any) => ({
          name: [o.customer.first_name, o.customer.last_name].filter(Boolean).join(" ") || o.email,
          email: o.email || null,
          company: o?.customer?.default_address?.company || null,
          status: "active",
          value: money(o.total_price),
        })),
    };
  },
};

/* ----------------------------------------------------------------- Razorpay */
const razorpay: Connector = {
  id: "razorpay",
  label: "Razorpay",
  async pull(c, since) {
    if (!c.key_id || !c.key_secret) throw new Error("Razorpay needs a key id and secret.");
    const from = Math.floor(new Date(since).getTime() / 1000);
    const auth = Buffer.from(`${c.key_id}:${c.key_secret}`).toString("base64");
    const r = await fetch(`https://api.razorpay.com/v1/payments?count=100&from=${from}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!r.ok) throw new Error(`Razorpay returned ${r.status}`);
    const j = await r.json();
    const items: any[] = Array.isArray(j?.items) ? j.items : [];

    // Razorpay reports amounts in paise.
    return {
      invoices: items
        .filter((p: any) => p.status === "captured")
        .map((p: any) => ({
          invoice_no: `RZP-${p.id}`,
          party: p.email || p.contact || "Razorpay payment",
          amount: money(p.amount) / 100,
          type: "receivable",
          status: "paid",
          due_date: day(new Date((p.created_at || 0) * 1000).toISOString()),
        })),
    };
  },
};

/* ------------------------------------------------------------------- Stripe */
const stripe: Connector = {
  id: "stripe",
  label: "Stripe",
  async pull(c, since) {
    if (!c.api_key) throw new Error("Stripe needs a secret key.");
    const from = Math.floor(new Date(since).getTime() / 1000);
    const r = await fetch(`https://api.stripe.com/v1/charges?limit=100&created[gte]=${from}`, {
      headers: { Authorization: `Bearer ${c.api_key}` },
    });
    if (!r.ok) throw new Error(`Stripe returned ${r.status}`);
    const j = await r.json();
    const items: any[] = Array.isArray(j?.data) ? j.data : [];

    return {
      invoices: items
        .filter((p: any) => p.paid && !p.refunded)
        .map((p: any) => ({
          invoice_no: `STR-${p.id}`,
          party: p.billing_details?.name || p.receipt_email || "Stripe payment",
          amount: money(p.amount) / 100,
          type: "receivable",
          status: "paid",
          due_date: day(new Date((p.created || 0) * 1000).toISOString()),
        })),
    };
  },
};

/* ------------------------------------------------------------- Google Sheets */
const googleSheets: Connector = {
  id: "google_sheets",
  label: "Google Sheets",
  async pull(c) {
    const url = String(c.sheet_url || c.url || "").trim();
    if (!url) throw new Error("Google Sheets needs a published sheet URL.");
    const { toCsvUrl, parseCsv } = await import("@/lib/csv");
    const r = await fetch(toCsvUrl(url), { headers: { "User-Agent": "MNBCortex" } });
    if (!r.ok) throw new Error(`Could not read the sheet (${r.status}). Make sure it's shared publicly.`);
    const rows = parseCsv(await r.text()).slice(0, 1000);

    // Match on header name so the customer's own column titles work.
    const pick = (row: any, ...names: string[]) => {
      for (const n of names) {
        const hit = Object.keys(row).find((k) => k.toLowerCase().replace(/[^a-z]/g, "") === n);
        if (hit && row[hit] !== "") return row[hit];
      }
      return undefined;
    };

    const sales = rows.map((row: any, i: number) => {
      const amount = money(String(pick(row, "amount", "total", "value") ?? "").replace(/[^0-9.-]/g, ""));
      if (!amount) return null;
      return {
        order_no: String(pick(row, "orderno", "order", "id") ?? `SHEET-${i + 1}`),
        customer_name: String(pick(row, "customer", "customername", "name", "party") ?? "Sheet row"),
        product: pick(row, "product", "item", "description") ?? null,
        amount,
        status: "won",
        order_date: day(String(pick(row, "date", "orderdate") ?? "")) || undefined,
      };
    });

    return { sales: sales.filter(Boolean) as any[] };
  },
};

export const CONNECTORS: Connector[] = [shopify, razorpay, stripe, googleSheets];
export const SYNCABLE: string[] = CONNECTORS.map((c) => c.id);
export function isSyncable(provider: string): boolean {
  return SYNCABLE.includes(String(provider || "").toLowerCase());
}

/** Decrypt whatever this workspace saved for the provider. */
async function credentialsFor(svc: any, orgId: string, provider: string): Promise<Creds | null> {
  const { data } = await svc.from("integrations").select("config").eq("org_id", orgId).eq("provider", provider).maybeSingle();
  const cfg = (data as any)?.config;
  if (!cfg || typeof cfg !== "object") return null;
  const out: Creds = {};
  for (const [k, v] of Object.entries(cfg)) {
    const raw = String(v ?? "");
    out[k] = raw.startsWith("v1.") ? (decryptSecret(raw) ?? "") : raw;
  }
  return out;
}

/** Upsert on the natural key, so a re-sync updates rather than duplicates. */
async function upsert(svc: any, table: string, conflict: string, orgId: string, rows: any[]): Promise<number> {
  const clean = (rows || []).filter(Boolean).map((r) => ({ ...r, org_id: orgId }));
  if (!clean.length) return 0;
  let n = 0;
  for (let i = 0; i < clean.length; i += 200) {
    const chunk = clean.slice(i, i + 200);
    const { error } = await svc.from(table).upsert(chunk, { onConflict: `org_id,${conflict}` });
    if (!error) n += chunk.length;
  }
  return n;
}

/** Run one provider's sync for one workspace. */
export async function syncProvider(orgId: string, provider: string, days = 90): Promise<SyncResult> {
  const id = String(provider || "").toLowerCase();
  const out: SyncResult = { provider: id, ok: false, salesOrders: 0, invoices: 0, customers: 0 };
  const conn = CONNECTORS.find((c) => c.id === id);
  if (!conn) { out.error = `${provider} doesn't support data sync yet.`; return out; }

  const svc = serviceClient();
  if (!svc) { out.error = "Service role not configured."; return out; }

  try {
    const creds = await credentialsFor(svc, orgId, id);
    if (!creds) { out.error = `No saved ${conn.label} credentials for this workspace.`; return out; }

    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const pulled = await conn.pull(creds, since);

    out.salesOrders = await upsert(svc, "sales_orders", "order_no", orgId, pulled.sales || []);
    out.invoices = await upsert(svc, "invoices", "invoice_no", orgId, pulled.invoices || []);
    out.customers = await upsert(svc, "customers", "name", orgId, pulled.customers || []);
    out.ok = true;

    try {
      await svc.from("integrations")
        .update({ status: "connected", last_sync: new Date().toISOString(), last_error: null })
        .eq("org_id", orgId).eq("provider", id);
    } catch { /* column set may predate this */ }

    // Whatever the sync brought in must reach the dashboard.
    await recomputeQuietly(orgId);
  } catch (e: any) {
    out.error = e?.message || "Sync failed.";
    try {
      await svc.from("integrations").update({ last_error: String(out.error).slice(0, 300) })
        .eq("org_id", orgId).eq("provider", id);
    } catch { /* ignore */ }
  }
  return out;
}

/** Nightly sweep across every workspace with a syncable integration. */
export async function syncAll(limit = 100): Promise<{ ran: number; ok: number }> {
  const svc = serviceClient();
  if (!svc) return { ran: 0, ok: 0 };
  let ran = 0, ok = 0;
  try {
    const { data } = await svc.from("integrations").select("org_id, provider").in("provider", SYNCABLE).limit(limit);
    for (const row of ((data as any[]) || [])) {
      ran++;
      if ((await syncProvider(row.org_id, row.provider)).ok) ok++;
    }
  } catch { /* retried tomorrow */ }
  return { ran, ok };
}
