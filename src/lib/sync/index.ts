import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { credentialsFor } from "@/lib/credentials";
import { recomputeQuietly } from "@/lib/metrics";
import type { Budget } from "@/lib/cron-budget";
import { safeFetch } from "@/lib/net-guard";

/**
 * Shopify Admin API version — ONE constant, because it was two.
 *
 * It was pinned at `2024-01` in this file and again, separately, in
 * api/integrations/route.ts. Shopify supports each version for a minimum of 12
 * months and releases quarterly, so `2024-01` stopped being accessible in early
 * 2025 — around 20 months before this was noticed. As of September 2026 the
 * oldest version Shopify still serves is 2025-10.
 *
 * That is the worst kind of integration rot: not a loud failure, but a version
 * the provider may silently coerce, deprecate fields on, or reject outright,
 * with the "Connected to Shopify" health probe pinned to the same dead version
 * and therefore agreeing with the broken sync.
 *
 * 2026-07 is the current stable release (accessible to 16 July 2027). Pinning
 * rather than tracking `latest` is deliberate — an API version that changes
 * under you without a deploy is how a working sync breaks overnight — but a
 * pin needs a renewal date, so: REVIEW BEFORE JULY 2027.
 *
 * Note also that Shopify is steering integrations from the REST Admin API to
 * GraphQL. This code still uses REST (`orders.json`), which works today and is
 * a larger migration than a version bump.
 */
export const SHOPIFY_API_VERSION = "2026-07";

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
  /* What was deliberately NOT imported, and why — e.g. foreign-currency
     charges skipped rather than booked at a guessed exchange rate. Surfaced
     on the integrations page and stored on the row so it survives the sync. */
  note?: string;
};

type Creds = Record<string, string>;
type Connector = {
  id: string;
  label: string;
  /**
   * Pull recent records. `since` is an ISO timestamp bounding the window.
   *
   * `note` carries anything the customer needs to know about what was NOT
   * imported — currently foreign-currency charges, which are skipped rather
   * than booked at an invented exchange rate. A connector that silently drops
   * rows is worse than one that says which rows it dropped and why.
   */
  pull: (c: Creds, since: string) => Promise<{ sales?: any[]; invoices?: any[]; customers?: any[]; note?: string }>;
};

const money = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
/** Pages per provider per run — bounds one large account's share of the nightly cron. */
const MAX_PAGES = 20;
const day = (iso?: string) => (iso ? String(iso).slice(0, 10) : undefined);

/* ------------------------------------------------------------------ Shopify */
const shopify: Connector = {
  id: "shopify",
  label: "Shopify",
  async pull(c, since) {
    const shop = String(c.shop || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!shop || !c.api_key) throw new Error("Shopify needs a shop domain and access token.");
    /*
      `c.shop` is a free-text field the customer saved. Interpolated into a
      URL and fetched from our server it is a request to hit any host they
      name — including 169.254.169.254 or an internal address — and we would
      send the workspace's own Shopify token in the header while doing it.
      A real Shopify domain is *.myshopify.com or a custom storefront domain;
      either way it is public, so assertPublicUrl costs nothing legitimate.
    */
    /*
      EVERY PAGE, NOT THE FIRST 250. Shopify paginates with a cursor in the Link
      header; reading one page silently dropped everything after the 250th
      order in the window and still reported success. Capped at MAX_PAGES so
      one enormous store cannot eat the cron, and the cap is reported.
    */
    let url: string | null = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&limit=250&created_at_min=${encodeURIComponent(since)}`;
    const orders: any[] = [];
    let pages = 0;
    while (url && pages < MAX_PAGES) {
      const r = await safeFetch(url, { headers: { "X-Shopify-Access-Token": c.api_key } });
      if (!r.ok) throw new Error(`Shopify returned ${r.status}`);
      const j = await r.json();
      if (Array.isArray(j?.orders)) orders.push(...j.orders);
      pages++;
      const link = r.headers.get("link") || "";
      const next = link.split(",").find((part) => /rel="next"/.test(part));
      url = next ? (next.match(/<([^>]+)>/)?.[1] ?? null) : null;
    }
    const truncated = Boolean(url);

    return {
      sales: orders.map((o: any) => ({
        order_no: `SHOP-${o.order_number ?? o.id}`,
        customer_name: [o?.customer?.first_name, o?.customer?.last_name].filter(Boolean).join(" ") || o?.email || "Shopify customer",
        product: (o?.line_items || []).map((li: any) => li.title).slice(0, 3).join(", ") || null,
        amount: money(o.total_price),
        /* Won means paid. An unpaid or refunded order is not revenue: it was
           all "won" before, so pending COD orders and refunds inflated sales. */
        status: o.cancelled_at || ["refunded", "voided"].includes(String(o.financial_status)) ? "lost"
          : ["paid", "partially_paid", "partially_refunded"].includes(String(o.financial_status)) ? "won" : "open",
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
          /* No `value`: it was overwritten with the LAST order's total on every
             sync. Customer value is the owner's figure; orders carry the money. */
        })),
      note: truncated ? `Shopify has more than ${MAX_PAGES * 250} orders in this window; the oldest beyond that were not read this run and will be picked up as the window moves.` : undefined,
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
    /* Every page: Razorpay returns at most 100 per call; `skip` walks the rest. */
    const items: any[] = [];
    let skip = 0, pages = 0, more = true;
    while (more && pages < MAX_PAGES) {
      const r = await fetch(`https://api.razorpay.com/v1/payments?count=100&skip=${skip}&from=${from}`, {
        headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) throw new Error(`Razorpay returned ${r.status}`);
      const j = await r.json();
      const got: any[] = Array.isArray(j?.items) ? j.items : [];
      items.push(...got); pages++; skip += got.length;
      more = got.length === 100;
    }
    const truncated = more;

    /*
      Razorpay reports amounts in paise — in the payment's own currency. It is
      INR for the overwhelming majority of accounts, which is exactly why the
      currency field is easy to forget; an account that has enabled
      international payments would otherwise book a $1,000 charge as ₹1,000.
      Same rule as Stripe: import INR, skip the rest, and say so.
    */
    const foreign = new Set<string>();
    const invoices = items
      .filter((p: any) => p.status === "captured")
      .filter((p: any) => {
        const cur = String(p.currency || "INR").toUpperCase();
        if (cur === "INR") return true;
        foreign.add(cur);
        return false;
      })
      .map((p: any) => ({
        invoice_no: `RZP-${p.id}`,
        party: p.email || p.contact || "Razorpay payment",
        amount: money(p.amount) / 100,
        type: "receivable",
        status: "paid",
        due_date: day(new Date((p.created_at || 0) * 1000).toISOString()),
      }));

    return {
      invoices,
      note: [
        foreign.size ? `Skipped payments in ${[...foreign].join(", ")} — Cortex books in INR only, and converting at a guessed rate would put a wrong number in your ledger.` : "",
        truncated ? `More than ${MAX_PAGES * 100} payments in this window; the rest are picked up on the next runs.` : "",
      ].filter(Boolean).join(" ") || undefined,
    };
  },
};

/* ------------------------------------------------------------------- Stripe */
const stripe: Connector = {
  id: "stripe",
  label: "Stripe",
  async pull(c, since) {
    if (!c.api_key) throw new Error("Stripe needs a restricted (read-only) key.");
    const from = Math.floor(new Date(since).getTime() / 1000);
    /* Every page: Stripe says has_more and pages with starting_after. */
    const items: any[] = [];
    let after = "", pages = 0, more = true;
    while (more && pages < MAX_PAGES) {
      const r = await fetch(`https://api.stripe.com/v1/charges?limit=100&created[gte]=${from}${after ? `&starting_after=${encodeURIComponent(after)}` : ""}`, {
        headers: { Authorization: `Bearer ${c.api_key}` }, signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) throw new Error(`Stripe returned ${r.status}`);
      const j = await r.json();
      const got: any[] = Array.isArray(j?.data) ? j.data : [];
      items.push(...got); pages++;
      more = Boolean(j?.has_more) && got.length > 0;
      after = got.length ? String(got[got.length - 1].id) : "";
    }
    const truncated = more;

    /*
      CURRENCY. Stripe reports minor units in the charge's OWN currency, and
      this ignored `p.currency` entirely — so a $1,000 charge was divided by 100
      and written into invoices.amount as 1000, which every downstream surface
      renders as ₹1,000. Roughly 90x understated, and it flows straight into
      open receivables, overdue receivables and working capital.

      There is no FX feed here, and inventing a rate would be a different kind
      of wrong number. So: INR charges are imported, and anything else is
      skipped and reported rather than silently mis-booked. A missing row a
      customer can see explained is better than a wrong row they cannot.
    */
    const foreign = new Set<string>();
    const invoices = items
      /* Fully refunded → not revenue. Partly refunded → book what was kept, not the original amount. */
      .filter((p: any) => p.paid && !p.refunded && money(p.amount) - money(p.amount_refunded) > 0)
      .filter((p: any) => {
        const cur = String(p.currency || "inr").toLowerCase();
        if (cur === "inr") return true;
        foreign.add(cur.toUpperCase());
        return false;
      })
      .map((p: any) => ({
        invoice_no: `STR-${p.id}`,
        party: p.billing_details?.name || p.receipt_email || "Stripe payment",
        amount: (money(p.amount) - money(p.amount_refunded)) / 100,
        type: "receivable",
        status: "paid",
        due_date: day(new Date((p.created || 0) * 1000).toISOString()),
      }));

    return {
      invoices,
      note: [
        foreign.size ? `Skipped charges in ${[...foreign].join(", ")} — Cortex books in INR only, and converting at a guessed rate would put a wrong number in your ledger.` : "",
        truncated ? `More than ${MAX_PAGES * 100} charges in this window; the rest are picked up on the next runs.` : "",
      ].filter(Boolean).join(" ") || undefined,
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
    /*
      Same class as importFromUrl, and easier to miss: this URL was validated
      once when the integration was saved and is re-fetched on every nightly
      sync, so a host that was public on Tuesday can point somewhere private on
      Wednesday. Validate at fetch time, every time.
    */
    const r = await safeFetch(toCsvUrl(url), { headers: { "User-Agent": "MNBCortex" } });
    if (!r.ok) throw new Error(`Could not read the sheet (${r.status}). Make sure it's shared publicly.`);
    const all = parseCsv(await r.text());
    const rows = all.slice(0, 10_000);

    // Match on header name so the customer's own column titles work.
    const pick = (row: any, ...names: string[]) => {
      for (const n of names) {
        const hit = Object.keys(row).find((k) => k.toLowerCase().replace(/[^a-z]/g, "") === n);
        if (hit && row[hit] !== "") return row[hit];
      }
      return undefined;
    };

    const sales = rows.map((row: any) => {
      const amount = money(String(pick(row, "amount", "total", "value") ?? "").replace(/[^0-9.-]/g, ""));
      if (!amount) return null;
      /* A row with no order number is keyed by its CONTENT, not its position:
         a row-number key overwrote the wrong order whenever the sheet was
         sorted or a row inserted above. */
      const cust = String(pick(row, "customer", "customername", "name", "party") ?? "Sheet row");
      const dt = day(String(pick(row, "date", "orderdate") ?? "")) || "";
      return {
        order_no: String(pick(row, "orderno", "order", "id") ?? `SHEET-${dt || "nodate"}-${cust}-${amount}`.replace(/\s+/g, "_").slice(0, 80)),
        customer_name: cust,
        product: pick(row, "product", "item", "description") ?? null,
        amount,
        status: "won",
        order_date: day(String(pick(row, "date", "orderdate") ?? "")) || undefined,
      };
    });

    return { sales: sales.filter(Boolean) as any[], note: all.length > rows.length ? `The sheet has ${all.length} rows; the first 10,000 were read.` : undefined };
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
/*
  ==========================================================================
  THE SECOND COPY OF credentialsFor IS GONE — IT HAD LOST THE ALLOWLIST
  ==========================================================================

  This file carried its own private credentialsFor, identical in shape to the
  one in lib/credentials.ts and missing the hardening that one was given:

      for (const [k, v] of Object.entries(cfg)) {
        if (k === "hint" || ...) continue;
        out[k] = String(v ?? "");          // every key, whatever it is named
      }

  lib/credentials.ts was changed to read a plaintext `config` field only when
  the CATALOGUE declares that field non-password, and to skip any key it does
  not recognise — "an unknown key in a plaintext column is exactly the shape
  of the attack". 2026_integrations_lockdown.sql records the same rule as a
  `comment on column`. That change was applied to one of the two copies.

  Exploiting the gap needed an admin writing a password-named field straight
  through PostgREST, so the exposure was narrow. The problem is the shape: a
  security fix applied to one of two identical functions is a regression
  waiting for whichever call site the next reader does not know about.

  Same signature, same serviceClient, same decrypt-and-explain error strings —
  so this is a deletion, not a rewrite.
*/

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
          ? ` — run the 2026_upsert_arbiter_fix.sql migration`
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
    const creds = await credentialsFor(orgId, id);
    if (!creds) { out.error = `No saved ${conn.label} credentials for this workspace.`; return out; }

    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const pulled = await conn.pull(creds, since);
    /* LLM01 tripwire: a store's customer names and notes are written by the public. */
    try { const { flagSuspiciousRows } = await import("@/lib/ingest-scan"); await flagSuspiciousRows(orgId, conn.label, [...(pulled.sales || []), ...(pulled.invoices || []), ...(pulled.customers || [])]); } catch { /* best-effort */ }

    // Each of these can throw. Whatever landed before the throw is real data
    // that must still reach the dashboard, so the counts are assigned as we go
    // and the recompute happens in the finally below.
    out.salesOrders = await upsert(svc, "sales_orders", "order_no", orgId, pulled.sales || []);
    out.invoices = await upsert(svc, "invoices", "invoice_no", orgId, pulled.invoices || []);
    out.customers = await upsert(svc, "customers", "name", orgId, pulled.customers || []);
    out.note = pulled.note;
    out.ok = true;

    try {
      /*
        A skip note is recorded in last_error so it reaches the integrations
        page. It is not a failure — status stays "connected" — but a customer
        whose international charges are being left out has to be told, and
        this is the only field on the row that carries a message.
      */
      /*
        A SUCCESSFUL PULL NO LONGER RE-MINTS THE "Live" BADGE.

        This hardcoded `status: "connected"`. Since lib/integration-status.ts
        introduced a third state, that quietly promoted any `saved` row —
        stored but never credential-verified — to the green verified badge, on
        the strength of a data pull rather than a credential test. It would
        also resurrect an `error` row without re-testing.

        A pull IS strong evidence the credential works, which is why this is
        arguable. But `connected` now has a specific meaning — "we made a real
        API call against this credential and it was accepted" — and letting a
        second code path assign it on different evidence is how the meaning
        erodes. `last_sync` already records that the pull happened, and the
        integrations page shows it.

        So: clear a stale `error` (the pull proves it is not broken) but do not
        invent a verification that did not occur.
      */
      const { data: cur } = await svc.from("integrations")
        .select("status").eq("org_id", orgId).eq("provider", id).maybeSingle();
      const prior = String((cur as any)?.status || "");
      const next = prior === "connected" ? "connected" : "saved";
      await svc.from("integrations")
        .update({ status: next, last_sync: new Date().toISOString(), last_error: out.note ? String(out.note).slice(0, 300) : null })
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
export async function syncAll(limit = 100, budget?: Budget): Promise<{ ran: number; ok: number }> {
  const svc = serviceClient();
  if (!svc) return { ran: 0, ok: 0 };
  let ran = 0, ok = 0;
  try {
    /* Longest-unsynced first: unordered, the same 100 rows could come back every
       night and workspace 101 would never sync. */
    const { data } = await svc.from("integrations").select("org_id, provider").in("provider", SYNCABLE)
      .order("last_sync", { ascending: true, nullsFirst: true }).limit(limit);
    for (const row of ((data as any[]) || [])) {
      // A provider pull is an external HTTP call with no timeout of its own:
      // budget generously and stop rather than risk the whole run.
      if (budget && !budget.ok(4_000)) break;
      ran++;
      if ((await syncProvider(row.org_id, row.provider)).ok) ok++;
    }
  } catch { /* retried tomorrow */ }
  return { ran, ok };
}
