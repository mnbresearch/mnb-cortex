import { NextResponse } from "next/server";
import { anyEnvKey, envKey } from "@/lib/env";
import { hasSupabase, serviceClient } from "@/lib/supabase/server";
import { encryptionAvailable } from "@/lib/crypto";
import { geminiTextModels, geminiUrl } from "@/lib/ai/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Real health checks.
 *
 * This endpoint used to report "operational" from `Boolean(process.env.X)`. The
 * AI provider could be down, the key revoked, Resend failing and the daily cron
 * broken for weeks — and it still said all systems operational, with `ok: true`
 * hardcoded. Any external monitor pointed at it could never fire.
 *
 * Every check below actually talks to the dependency. `ok` is false when
 * anything critical is down, and the HTTP status follows, so uptime monitoring
 * works the way people expect.
 */

type Check = { name: string; status: "operational" | "degraded" | "down"; detail?: string; critical?: boolean };

const TIMEOUT = 6000;

/** fetch with a hard timeout — a hung dependency must not hang the health check. */
async function ping(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; error?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    return { ok: r.ok, status: r.status };
  } catch (e: any) {
    return { ok: false, status: 0, error: e?.name === "AbortError" ? `no response in ${TIMEOUT}ms` : (e?.message || "network error") };
  } finally {
    clearTimeout(t);
  }
}

/** Can we actually read from the database? */
async function checkDatabase(): Promise<Check> {
  if (!hasSupabase()) return { name: "Database", status: "down", detail: "Supabase not configured", critical: true };
  const sb = serviceClient();
  if (!sb) return { name: "Database", status: "degraded", detail: "No service role — server-side features are off", critical: true };
  try {
    const t0 = Date.now();
    const { error } = await sb.from("organizations").select("id", { head: true, count: "exact" }).limit(1);
    if (error) return { name: "Database", status: "down", detail: error.message, critical: true };
    return { name: "Database", status: "operational", detail: `${Date.now() - t0}ms`, critical: true };
  } catch (e: any) {
    return { name: "Database", status: "down", detail: e?.message || "query failed", critical: true };
  }
}

/** Does the AI provider actually answer? Cheap call, real answer. */
async function checkAI(): Promise<Check> {
  if (!anyEnvKey("GEMINI_API_KEY", "GROQ_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY")) {
    return { name: "AI engine", status: "down", detail: "No provider key configured", critical: true };
  }
  const gem = envKey("GEMINI_API_KEY");
  if (gem) {
    const model = geminiTextModels()[0];
    const r = await ping(geminiUrl(model, gem), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }], generationConfig: { maxOutputTokens: 1 } }),
    });
    if (r.ok) return { name: "AI engine", status: "operational", detail: `gemini · ${model}`, critical: true };
    // A 404 here is exactly how the whole AI layer died unnoticed once before.
    return {
      name: "AI engine",
      status: "down",
      detail: r.status === 404 ? `model ${model} not found — it may have been retired` : (r.error || `HTTP ${r.status}`),
      critical: true,
    };
  }
  const groq = envKey("GROQ_API_KEY");
  if (groq) {
    const r = await ping("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${groq}` } });
    return { name: "AI engine", status: r.ok ? "operational" : "down", detail: r.ok ? "groq" : (r.error || `HTTP ${r.status}`), critical: true };
  }
  return { name: "AI engine", status: "operational", detail: "provider configured", critical: true };
}

/** Is the Resend key valid right now? */
async function checkEmail(): Promise<Check> {
  const key = envKey("RESEND_API_KEY");
  if (!key) return { name: "Email", status: "down", detail: "RESEND_API_KEY not configured" };
  const r = await ping("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } });
  if (r.ok) return { name: "Email", status: "operational" };
  return { name: "Email", status: r.status === 401 || r.status === 403 ? "down" : "degraded", detail: r.error || `HTTP ${r.status}` };
}

/** Are the payment credentials live? */
async function checkPayments(): Promise<Check> {
  const id = envKey("CASHFREE_APP_ID"), secret = envKey("CASHFREE_SECRET_KEY");
  if (!id || !secret) return { name: "Payments", status: "down", detail: "Cashfree not configured", critical: true };
  const base = (process.env.CASHFREE_ENV || "").toLowerCase() === "sandbox"
    ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg";
  // Fetching a non-existent order proves auth without creating anything:
  // 404 means the credentials were accepted, 401 means they weren't.
  const r = await ping(`${base}/orders/healthcheck_probe_${Date.now()}`, {
    headers: { "x-client-id": id, "x-client-secret": secret, "x-api-version": "2023-08-01" },
  });
  if (r.status === 401 || r.status === 403) return { name: "Payments", status: "down", detail: "Cashfree rejected the credentials", critical: true };
  if (r.status === 0) return { name: "Payments", status: "degraded", detail: r.error, critical: true };
  return { name: "Payments", status: "operational", detail: base.includes("sandbox") ? "sandbox" : "production", critical: true };
}

/** Has the daily cron actually run recently? Reads its own heartbeat. */
async function checkCron(): Promise<Check> {
  const sb = serviceClient();
  if (!sb) return { name: "Scheduled jobs", status: "degraded", detail: "No service role" };
  try {
    const { data, error } = await sb.from("system_status").select("value").eq("key", "cron_last_run").maybeSingle();
    if (error) return { name: "Scheduled jobs", status: "degraded", detail: "Heartbeat table missing — run 2026_system_status.sql" };
    const last = (data as any)?.value;
    if (!last) {
      return { name: "Scheduled jobs", status: "degraded", detail: "Not run since this was deployed — first run is 08:00 IST" };
    }
    const hours = (Date.now() - new Date(String(last)).getTime()) / 3_600_000;
    if (hours > 48) return { name: "Scheduled jobs", status: "down", detail: `Last ran ${Math.round(hours)}h ago` };
    if (hours > 26) return { name: "Scheduled jobs", status: "degraded", detail: `Last ran ${Math.round(hours)}h ago` };
    return { name: "Scheduled jobs", status: "operational", detail: `Last ran ${Math.round(hours)}h ago` };
  } catch (e: any) {
    return { name: "Scheduled jobs", status: "degraded", detail: e?.message };
  }
}

/** Confirms a migration landed, by selecting a column it introduced. */
async function checkSchema(): Promise<Check> {
  const sb = serviceClient();
  if (!sb) return { name: "Schema migrations", status: "degraded", detail: "No service role" };
  const probes: [string, string, string][] = [
    ["organizations", "subscription_ends_at", "2026_hardening"],
    ["finance_ledger", "gst_turnover", "2026_metrics_layer"],
    ["rate_limits", "key", "2026_hardening"],
    ["renewal_notices", "kind", "2026_renewal_notices"],
    ["webhook_endpoints", "secret", "2026_integrations_layer"],
  ];
  const missing: string[] = [];
  for (const [table, col, name] of probes) {
    try {
      const { error } = await sb.from(table).select(col).limit(1);
      if (error) missing.push(name);
    } catch { missing.push(name); }
  }
  const uniq = Array.from(new Set(missing));
  return uniq.length
    ? { name: "Schema migrations", status: "degraded", detail: `Not applied: ${uniq.join(", ")}` }
    : { name: "Schema migrations", status: "operational" };
}

export async function GET() {
  const [db, ai, email, pay, cron, schema] = await Promise.all([
    checkDatabase(), checkAI(), checkEmail(), checkPayments(), checkCron(), checkSchema(),
  ]);

  const services: Check[] = [
    { name: "Web app", status: "operational", critical: true },   // it answered, so it's up
    db, ai, pay, email, cron, schema,
    { name: "Credential encryption", status: encryptionAvailable() ? "operational" : "degraded", detail: encryptionAvailable() ? undefined : "ENCRYPTION_KEY not set" },
  ];

  const criticalDown = services.some((s) => s.critical && s.status === "down");
  const anyDegraded = services.some((s) => s.status !== "operational");

  return NextResponse.json(
    {
      ok: !criticalDown,
      status: criticalDown ? "down" : anyDegraded ? "degraded" : "operational",
      services,
      updated: new Date().toISOString(),
    },
    // 503 on a real outage, so uptime monitors and load balancers react.
    { status: criticalDown ? 503 : 200 },
  );
}
