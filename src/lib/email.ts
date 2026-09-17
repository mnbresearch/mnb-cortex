import "server-only";
import crypto from "crypto";
import { envKey } from "@/lib/env";
import { brandFrom, brandReplyTo } from "@/lib/branded-email";
import { classifyAttempt } from "@/lib/email-state";

/**
 * The single exit point for outbound email.
 *
 * WHAT IT SENDS AS. The defaults here used to be a hardcoded
 * "MNB Cortex <noreply@…>" with no reply-to, while branded-email.ts separately
 * defined the real sender. Five callers relied on the default, and one was the
 * workspace INVITE — so the email most likely to be read by someone who has
 * never heard of us arrived from an address that silently discards the obvious
 * reply, "is this real?". An explicit `from`/`replyTo` still wins.
 *
 * WHAT CHANGED, AND WHY IT MATTERS MORE THAN THE ABOVE.
 *
 * THERE WAS NO TIMEOUT. `fetch()` with no AbortController: a hung connection to
 * Resend hung the request doing the sending, up to the serverless function's
 * own wall clock, and then returned `{ sent: false }` — the same value as a
 * refusal. Two consequences, both real:
 *
 *   - a caller that surfaced the result told the customer their email had not
 *     been sent, which may simply be untrue: the provider may have accepted it;
 *   - a caller that retried could send the same message twice, and this
 *     product sends debt reminders to other people's customers.
 *
 * NOTHING WAS RECORDED. The return value was the entire memory of the event. No
 * provider id, no error text, no duration, no attempt count — so "which emails
 * failed today?" had no answer, and the health probe's verdict could not be
 * checked against reality. Every send now leaves a row in email_sends: queued
 * first (never "sent" — our own queue is not evidence of anything), then the
 * provider's actual answer.
 *
 * IDEMPOTENCY. Every request carries an Idempotency-Key, which is also the
 * correlation id on the row and in the logs. That is what makes the ONE retry
 * below safe: a timeout is retried because the provider will de-duplicate it,
 * not because we hope it did not arrive.
 *
 * Still returns rather than throws: callers are usually mid-transaction and a
 * failed notification must not roll back the thing it was announcing. But the
 * result now says which of "accepted", "refused" and "we do not know" happened,
 * because those need different sentences in front of a user.
 */

export type SendResult = {
  /** True only when the PROVIDER accepted it. Never true for a queued row. */
  sent: boolean;
  /** accepted | rejected | unknown — see lib/email-state.ts. */
  state: "accepted" | "rejected" | "unknown";
  /** Human-readable, safe to show a user. Absent on success. */
  reason?: string;
  providerId?: string;
  /** Ours. Quote it in support, grep it in logs, find it in email_sends. */
  correlationId: string;
  attempts: number;
  ms: number;
};

/** How long we wait for Resend before giving up on one attempt. */
const SEND_TIMEOUT_MS = 10_000;

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  /**
   * `replyTo: null` means "send with NO reply-to header". That distinction
   * matters: on the one path where a customer emails their own customer, an
   * absent reply-to must not silently become ours, or we would receive
   * another company's correspondence.
   *
   * `kind` and `orgId` are recorded so "what is failing?" can be answered by
   * feature and by workspace instead of guessed from subject lines.
   */
  opts?: { from?: string; replyTo?: string | null; kind?: string; orgId?: string | null },
): Promise<SendResult> {
  const correlationId = `em_${crypto.randomUUID()}`;
  const key = envKey("RESEND_API_KEY");

  if (!key || !to) {
    const reason = !key ? "email is not configured (no RESEND_API_KEY)" : "no recipient address";
    await record({ correlationId, to, subject, kind: opts?.kind, orgId: opts?.orgId,
      status: "failed", providerError: reason, attempts: 0, ms: 0 });
    return { sent: false, state: "rejected", reason, correlationId, attempts: 0, ms: 0 };
  }

  const from = opts?.from || process.env.EMAIL_FROM || brandFrom();
  const replyTo = opts?.replyTo === null ? "" : (opts?.replyTo || brandReplyTo());
  const payload: any = { from, to: [to], subject, html };
  if (replyTo) payload.reply_to = replyTo;

  /* QUEUED, not sent. The row exists before the attempt so a process that dies
     mid-request still leaves a trace of a message that may have gone out. */
  await record({ correlationId, to, subject, kind: opts?.kind, orgId: opts?.orgId, status: "queued", attempts: 0, ms: 0 });

  const started = Date.now();
  let attempts = 0;
  let last = { status: 0, errorName: "", message: "", providerId: "" };

  /* Two attempts at most. The retry is only taken for a genuinely retryable
     outcome, and it reuses the SAME idempotency key, so the provider treats it
     as the same message rather than a second one. */
  for (let i = 0; i < 2; i++) {
    attempts++;
    const a = await attempt(key, payload, correlationId);
    last = a;
    const verdict = classifyAttempt({ status: a.status, errorName: a.errorName, message: a.message, idempotent: true });
    if (verdict.outcome === "accepted") {
      const ms = Date.now() - started;
      await record({ correlationId, to, subject, kind: opts?.kind, orgId: opts?.orgId,
        status: "accepted", providerId: a.providerId, httpStatus: a.status, attempts, ms });
      return { sent: true, state: "accepted", providerId: a.providerId, correlationId, attempts, ms };
    }
    if (!verdict.retryable || i === 1) {
      const ms = Date.now() - started;
      /*
        `unknown` IS ITS OWN STATE ON THE ROW. Recording a timeout as "failed"
        is what made this dangerous: the operator sees a failure, re-sends by
        hand, and the customer gets it twice.
      */
      const status = verdict.outcome === "unknown" ? "unknown" : "failed";
      await record({ correlationId, to, subject, kind: opts?.kind, orgId: opts?.orgId,
        status, providerError: verdict.reason, httpStatus: a.status || null, attempts, ms });
      return { sent: false, state: verdict.outcome, reason: verdict.reason, correlationId, attempts, ms };
    }
    /* Retryable. A short pause, because the common retryable cases are a rate
       limit and a blip, and both are helped by waiting. */
    await new Promise((r) => setTimeout(r, 400));
  }

  /* Unreachable: the loop always returns. Kept explicit so the types hold and
     a future edit cannot fall out of the bottom reporting success. */
  const ms = Date.now() - started;
  return { sent: false, state: "unknown", reason: last.message || "email not attempted", correlationId, attempts, ms };
}

/** One HTTP attempt, with a hard timeout. */
async function attempt(key: string, payload: any, correlationId: string): Promise<{
  status: number; errorName: string; message: string; providerId: string;
}> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS);
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        /* The provider de-duplicates on this, which is the whole basis for
           retrying a timeout instead of guessing. It is also the id on the
           email_sends row and in every log line about this message. */
        "Idempotency-Key": correlationId,
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const j: any = await r.json().catch(() => ({}));
    return {
      status: r.status,
      errorName: "",
      message: r.ok ? "" : String(j?.message || j?.name || ""),
      providerId: String(j?.id || ""),
    };
  } catch (e: any) {
    return { status: 0, errorName: String(e?.name || ""), message: String(e?.message || ""), providerId: "" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Write the delivery record. Best effort, and never allowed to break a send.
 *
 * An email that went out but was not recorded is a smaller problem than a send
 * that failed because the audit table was missing. But it is still a problem,
 * so a failure here is logged with the correlation id rather than swallowed.
 */
async function record(r: {
  correlationId: string;
  to: string;
  subject: string;
  kind?: string;
  orgId?: string | null;
  status: "queued" | "accepted" | "failed" | "unknown";
  providerId?: string;
  providerError?: string;
  httpStatus?: number | null;
  attempts: number;
  ms: number;
}): Promise<void> {
  try {
    const { serviceClient } = await import("@/lib/supabase/server");
    const svc = serviceClient();
    if (!svc) return;
    const nowIso = new Date().toISOString();
    const row: Record<string, any> = {
      correlation_id: r.correlationId,
      org_id: r.orgId || null,
      kind: r.kind || null,
      to_email: r.to || null,
      subject: (r.subject || "").slice(0, 300),
      status: r.status,
      attempts: r.attempts,
      duration_ms: r.ms || null,
      updated_at: nowIso,
    };
    if (r.providerId) row.provider_id = r.providerId;
    if (r.providerError) row.provider_error = r.providerError.slice(0, 500);
    if (r.httpStatus) row.http_status = r.httpStatus;
    if (r.status === "accepted") row.accepted_at = nowIso;
    if (r.status === "failed") row.failed_at = nowIso;

    const { error } = await svc.from("email_sends")
      .upsert(row, { onConflict: "correlation_id" });
    if (error) {
      console.error(`[email] delivery record not written (${r.correlationId}, ${r.status}):`, error.message);
    }
  } catch (e: any) {
    console.error(`[email] delivery record threw (${r.correlationId}):`, e?.message);
  }
}
