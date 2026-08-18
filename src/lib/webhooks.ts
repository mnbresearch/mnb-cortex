import "server-only";
import crypto from "crypto";
import { serviceClient } from "@/lib/supabase/server";

/**
 * Outbound webhooks.
 *
 * "Public API + webhooks" is a Business-plan bullet. The API was real; webhooks
 * did not exist. This is the whole thing: registration, HMAC signing, delivery,
 * and a retry queue swept by the daily cron.
 *
 * Signing matches the convention Cortex already verifies on the way IN from
 * Cashfree — base64(HMAC-SHA256(timestamp + "." + body)) — so anyone
 * integrating has one scheme to learn, and it's the same one we ask of others.
 */

export const WEBHOOK_EVENTS = [
  "metrics.recomputed",
  "alert.created",
  "workflow.completed",
  "invoice.overdue",
  "payment.succeeded",
  "subscription.expired",
  "report.generated",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const MAX_ATTEMPTS = 5;
const TIMEOUT_MS = 8000;

export function newSecret(): string {
  return "whsec_" + crypto.randomBytes(24).toString("base64url");
}

/** The signature a receiver should recompute to trust the request. */
export function sign(secret: string, timestamp: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("base64");
}

/**
 * Queue an event for every endpoint in this workspace that wants it, then try
 * to deliver immediately. Queue-first means a crash mid-send still leaves a
 * row the cron will retry — the event is never simply lost.
 */
export async function emit(orgId: string | null | undefined, event: WebhookEvent, payload: Record<string, any>): Promise<number> {
  if (!orgId) return 0;
  const svc = serviceClient();
  if (!svc) return 0;

  try {
    const { data } = await svc.from("webhook_endpoints")
      .select("id, url, secret, events").eq("org_id", orgId).eq("is_active", true).limit(50);
    const targets = ((data as any[]) || []).filter(
      (e) => !Array.isArray(e.events) || e.events.length === 0 || e.events.includes(event),
    );
    if (!targets.length) return 0;

    const rows = targets.map((t) => ({ org_id: orgId, endpoint_id: t.id, event, payload }));
    const { data: queued } = await svc.from("webhook_deliveries").insert(rows).select("id, endpoint_id");

    // Deliver now, best effort. Anything still pending gets retried nightly.
    await Promise.all(((queued as any[]) || []).map(async (q) => {
      const t = targets.find((x) => x.id === q.endpoint_id);
      if (t) await attempt(svc, q.id, t, event, payload);
    }));
    return targets.length;
  } catch {
    return 0;
  }
}

async function attempt(svc: any, deliveryId: string, endpoint: any, event: string, payload: any): Promise<boolean> {
  const body = JSON.stringify({ event, created_at: new Date().toISOString(), data: payload });
  const ts = String(Date.now());
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  let status = 0, errMsg = "";
  try {
    const r = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MNBCortex-Webhook/1",
        "X-Cortex-Event": event,
        "X-Cortex-Timestamp": ts,
        "X-Cortex-Signature": sign(endpoint.secret, ts, body),
      },
      body,
      signal: ctrl.signal,
    });
    status = r.status;
  } catch (e: any) {
    errMsg = e?.name === "AbortError" ? `timeout after ${TIMEOUT_MS}ms` : (e?.message || "network error");
  } finally {
    clearTimeout(timer);
  }

  const ok = status >= 200 && status < 300;
  try {
    const { data: cur } = await svc.from("webhook_deliveries").select("attempts").eq("id", deliveryId).maybeSingle();
    const attempts = Number((cur as any)?.attempts ?? 0) + 1;
    await svc.from("webhook_deliveries").update({
      attempts,
      last_status: status || null,
      last_error: ok ? null : (errMsg || `HTTP ${status}`),
      status: ok ? "delivered" : attempts >= MAX_ATTEMPTS ? "failed" : "pending",
      delivered_at: ok ? new Date().toISOString() : null,
    }).eq("id", deliveryId);

    await svc.from("webhook_endpoints").update(
      ok
        ? { last_ok_at: new Date().toISOString(), last_error: null, fail_count: 0 }
        : { last_error: (errMsg || `HTTP ${status}`).slice(0, 300) },
    ).eq("id", endpoint.id);
  } catch { /* logging must never break delivery */ }

  return ok;
}

/** Retry sweep for the daily cron. Returns how many pending deliveries succeeded. */
export async function retryPending(limit = 200): Promise<{ tried: number; delivered: number }> {
  const svc = serviceClient();
  if (!svc) return { tried: 0, delivered: 0 };
  let tried = 0, delivered = 0;
  try {
    const { data } = await svc.from("webhook_deliveries")
      .select("id, endpoint_id, event, payload, attempts")
      .eq("status", "pending").lt("attempts", MAX_ATTEMPTS)
      .order("created_at", { ascending: true }).limit(limit);

    for (const d of ((data as any[]) || [])) {
      const { data: ep } = await svc.from("webhook_endpoints")
        .select("id, url, secret, is_active").eq("id", d.endpoint_id).maybeSingle();
      if (!ep || !(ep as any).is_active) continue;
      tried++;
      if (await attempt(svc, d.id, ep, d.event, d.payload)) delivered++;
    }
  } catch { /* swept again tomorrow */ }
  return { tried, delivered };
}

/** Fire-and-forget: a webhook must never break the action that triggered it. */
export function emitQuietly(orgId: string | null | undefined, event: WebhookEvent, payload: Record<string, any>): void {
  void emit(orgId, event, payload).catch(() => {});
}
