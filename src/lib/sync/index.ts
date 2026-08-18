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
        // The natural key is the name, so a nameless customer would insert a
        // fresh row on every single sync. Skip rather than duplicate forever.
        .filter((o: any) => o?.customer?.id && ([o.customer.first_name, o.customer.last_name].filter(Boolean).join(" ") || o.email))
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

/**
 * Decrypt whatever this workspace saved for the provider.
 *
 * The secrets live in `credentials_encrypted`, NOT in `config`. /api/integrations
 * deliberately copies only non-password fields into `config` so they can be shown
 * back to the user, and every provider's actual secret is a `password` field.
 * Reading `config` alone therefore returned the shop domain but never the access
 * token, and Shopify/Razorpay/Stripe could never authenticate — only Google
 * Sheets worked, because its single field happens to be plain text.
 */
async function credentialsFor(svc: any, orgId: string, provider: string): Promise<Creds | null> {
  const { data } = await svc
    .from("integrations").select("config, credentials_encrypted")
    .eq("org_id", orgId).eq("provider", provider).maybeSingle();
  if (!data) return null;

  const out: Creds = {};

  // Non-secret fields first, so a decrypt failure still leaves a usable error
  // message rather than an empty object.
  const cfg = (data as any).config;
  if (cfg && typeof cfg === "object") {
    for (const [k, v] of Object.entries(cfg)) {
      if (k === "hint" || k === "last_test_ok" || k === "last_test_at") continue;
      out[k] = String(v ?? "");
    }
  }

  // Then the real credentials, which win on conflict.
  const enc = String((data as any).credentials_encrypted || "");
  if (enc) {
    // decryptSecret returns null (it does not throw) when ENCRYPTION_KEY is
    // absent or has changed since the credential was saved. Without this check
    // the sync fell through to config-only and reported "needs an access token",
    // which sends the user looking for the wrong problem entirely.
    const plain = decryptSecret(enc);
    if (!plain) {
      throw new Error("Saved credentials could not be decrypted — ENCRYPTION_KEY is missing or has changed. Re-connect this integration to store them again.");
    }
    try {
      const parsed = JSON.parse(plain);
      if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed)) out[k] = String(v ?? "");
      }
    } catch {
      throw new Error("Saved credentials are corrupt. Re-connect this integration.");
    }
  }

  return Object.keys(out).length ? out : null;
}

/**
 * Upsert on the natural key, so a re-sync updates rather than duplicates.
 *
 * Three things here are load-bearing and were each a silent data-loss bug:
 *
 * 1. A failed chunk THROWS. This used to be `if (!error) n += ...`, which
 *    discarded the reason and reported a clean `ok: true, 0 orders` — a sync
 *    that imported nothing looked exactly like a sync with nothing to import.
 * 2. Rows are de-duplicated on the conflict key first. Postgres refuses to let
 *    one INSERT ... ON CONFLICT touch the same row twice ("cannot affect row a
 *    second time"), and a repeat customer inside one batch of orders does
 *    exactly that. Last occurrence wins, matching row-by-row upsert order.
 * 3. Every row is given the same key set. PostgREST rejects a bulk body whose
 *    objects have differing keys, and `undefined` fields vanish through
 *    JSON.stringify — so one row missing a date would fail the whole chunk.
 */
async function upsert(svc: any, table: string, conflict: string, orgId: string, rows: any[]): Promise<number> {
  const clean = (rows || []).filter(Boolean).map((r) => ({ ...r, org_id: orgId }));
  if (!clean.length) return 0;

  // De-duplicate on the natural key, keeping the last occurrence. `org_id` is
  // stamped identically on every row above, so the bare column is the whole key.
  // An empty string counts: unlike NULL it is a real value that DOES conflict.
  // A row with no key at all can't be upserted meaningfully — it would insert a
  // fresh copy on every sync — so it is dropped rather than silently duplicated.
  const byKey = new Map<string, any>();
  let dropped = 0;
  for (const r of clean) {
    const k = r[conflict];
    if (k === null || k === undefined) { dropped++; continue; }
    byKey.set(String(k), r);
  }
  if (dropped) console.warn(`[sync] ${table}: skipped ${dropped} row(s) with no ${conflict}`);
  const deduped = [...byKey.values()];
  if (!deduped.length) return 0;

  // PostgREST rejects a bulk body whose objects have differing key sets, and
  // `undefined` disappears through JSON.stringify. Filling the gaps with null
  // would be wrong — it bypasses column DEFAULTs on insert and, on the DO UPDATE
  // branch, would erase a good value already in the row. So group by key shape
  // and send each group as its own statement, leaving absent columns absent.
  const groups = new Map<string, any[]>();
  for (const r of deduped) {
    const keys = Object.keys(r).filter((k) => r[k] !== undefined).sort();
    const sig = keys.join(",");
    const o: any = {};
    for (const k of keys) o[k] = r[k];
    const g = groups.get(sig);
    if (g) g.push(o); else groups.set(sig, [o]);
  }

  let n = 0;
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i += 200) {
      const chunk = group.slice(i, i + 200);
      const { error } = await svc.from(table).upsert(chunk, { onConflict: `org_id,${conflict}` });
      if (error) {
        const hint = error.code === "42P10"
          ? ` — run the 2026_sync_conflict_fix.sql migration`
          : "";
        throw new Error(`Writing ${table}: ${error.message}${hint}`);
      }
      n += chunk.length;
    }
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

    // Each of these can throw. Whatever landed before the throw is real data
    // that must still reach the dashboard, so the counts are assigned as we go
    // and the recompute happens in the finally below.
    out.salesOrders = await upsert(svc, "sales_orders", "order_no", orgId, pulled.sales || []);
    out.invoices = await upsert(svc, "invoices", "invoice_no", orgId, pulled.invoices || []);
    out.customers = await upsert(svc, "customers", "name", orgId, pulled.customers || []);
    out.ok = true;

    try {
      await svc.from("integrations")
        .update({ status: "connected", last_sync: new Date().toISOString(), last_error: null })
        .eq("org_id", orgId).eq("provider", id);
    } catch { /* column set may predate this */ }

  } catch (e: any) {
    out.error = e?.message || "Sync failed.";
    try {
      await svc.from("integrations").update({ last_error: String(out.error).slice(0, 300) })
        .eq("org_id", orgId).eq("provider", id);
    } catch { /* ignore */ }
  } finally {
    // Whatever the sync brought in must reach the dashboard — including a
    // partial import that ended in an error partway through.
    if (out.salesOrders || out.invoices || out.customers) await recomputeQuietly(orgId);
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
