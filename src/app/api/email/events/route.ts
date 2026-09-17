import { NextResponse } from "next/server";
import crypto from "crypto";
import { serviceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resend delivery events — the half of the story our own code cannot know.
 *
 * WHY THIS EXISTS.
 *
 * "The provider accepted it" and "it reached the mailbox" are different facts,
 * and until now the product only ever had the first one — and often not even
 * that, since nothing was recorded at all. So a bounce was invisible: a
 * collections reminder to a dead address, an invite to a typo'd domain, a
 * receipt to a mailbox that is full, all of them looked exactly like a
 * successful send for ever.
 *
 * This endpoint carries `delivered`, `bounced` and `complained` back onto the
 * email_sends row, matched on the provider's own message id.
 *
 * SIGNED, OR REFUSED.
 *
 * Resend signs webhooks with Svix: the signed content is
 * `${svix-id}.${svix-timestamp}.${rawBody}`, HMAC-SHA256 with the secret's
 * base64 body (everything after `whsec_`), compared against one of the
 * space-separated `v1,<base64>` values in `svix-signature`.
 *
 * Three refusals, each deliberate:
 *
 *   no secret configured  → 503. An unauthenticated endpoint that writes
 *                           delivery state is a way for anyone to mark a
 *                           bounced address as delivered.
 *   bad signature         → 401, and the reason is logged, never returned. A
 *                           stranger learns nothing about why.
 *   stale timestamp       → 401. Without it a captured delivery event can be
 *                           replayed indefinitely.
 *
 * The raw body is hashed BEFORE any parsing. JSON.parse → JSON.stringify
 * changes whitespace and key order, and the signature can then never match —
 * the same mistake the Cashfree webhook documents having made.
 */

/** Replay window. Svix's own recommendation. */
const TOLERANCE_SECONDS = 300;

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET || "";
  if (!secret) {
    return NextResponse.json({ ok: false, error: "not configured" }, { status: 503 });
  }

  const raw = await req.text();
  const id = req.headers.get("svix-id") || "";
  const ts = req.headers.get("svix-timestamp") || "";
  const sig = req.headers.get("svix-signature") || "";

  const check = verifySvix({ secret, id, timestamp: ts, signature: sig, body: raw });
  if (!check.ok) {
    console.error("[email-events] rejected:", check.reason, {
      hasId: Boolean(id), hasTimestamp: Boolean(ts), hasSignature: Boolean(sig), bodyBytes: raw.length,
    });
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  let body: any = {};
  try { body = JSON.parse(raw); } catch { /* handled below */ }

  const type = String(body?.type || "");
  const providerId = String(body?.data?.email_id || body?.data?.id || "");
  if (!providerId) {
    /* Ack: retrying will not make an id appear, and a 500 here would have
       Resend redeliver an event we can never match. */
    console.warn("[email-events] no email id on", type);
    return NextResponse.json({ ok: true, ignored: "no email id" });
  }

  const status = mapEventToStatus(type);
  if (!status) return NextResponse.json({ ok: true, ignored: type });

  const svc = serviceClient();
  if (!svc) return NextResponse.json({ ok: false, error: "no service role" }, { status: 500 });

  const nowIso = new Date().toISOString();
  const patch: Record<string, any> = { status, updated_at: nowIso };
  if (status === "delivered") patch.delivered_at = nowIso;
  if (status === "bounced" || status === "complained") {
    patch.failed_at = nowIso;
    patch.provider_error = String(
      body?.data?.bounce?.message || body?.data?.reason || type,
    ).slice(0, 500);
  }

  const { data, error } = await svc.from("email_sends")
    .update(patch).eq("provider_id", providerId).select("correlation_id, to_email, org_id, kind");

  if (error) {
    /* A 500 asks Resend to redeliver, which is what we want for a transient
       database failure: the event is real and the row should end up updated. */
    console.error("[email-events] could not record", type, error.message);
    return NextResponse.json({ ok: false, error: "temporary failure" }, { status: 500 });
  }
  if (!Array.isArray(data) || data.length === 0) {
    /* An event for a message we have no row for — anything sent before this
       table existed. Not an error, and not worth a retry. */
    return NextResponse.json({ ok: true, unmatched: providerId });
  }

  /*
    A BOUNCE IS AN OPERATOR EVENT, not a log line. It means a real message did
    not arrive, and for a collections reminder that is the owner's customer not
    being chased while the product says they were.
  */
  if (status === "bounced" || status === "complained") {
    const row = data[0] as any;
    const { operatorAlert } = await import("@/lib/operator-alert");
    await operatorAlert({
      kind: `email_${status}`,
      severity: status === "complained" ? "red" : "amber",
      title: `Email ${status}: ${row.kind || "unknown path"}`,
      body: `${row.to_email || "recipient unknown"} — ${patch.provider_error}. Correlation ${row.correlation_id}. `
        + `This message was accepted by the provider and then did not arrive, so nothing in the product would `
        + `have said so without this.`,
      orgId: row.org_id || null,
      email: status === "complained",
    });
  }

  return NextResponse.json({ ok: true, status, matched: data.length });
}

/** Which Resend events change a message's state, and to what. */
function mapEventToStatus(type: string): "delivered" | "bounced" | "complained" | null {
  const t = String(type || "").toLowerCase();
  if (t === "email.delivered") return "delivered";
  if (t === "email.bounced") return "bounced";
  if (t === "email.complained") return "complained";
  /*
    email.sent, email.delivery_delayed and email.opened deliberately change
    nothing. `sent` is the acceptance we already recorded ourselves;
    `delivery_delayed` is not an outcome; and opens are tracking we do not want
    to treat as delivery evidence.
  */
  return null;
}

/** Svix signature verification. Exported for the test suite. */
export function verifySvix(args: {
  secret: string; id: string; timestamp: string; signature: string; body: string;
  now?: number;
}): { ok: boolean; reason?: string } {
  const { secret, id, timestamp, signature, body } = args;
  if (!id || !timestamp || !signature) return { ok: false, reason: "missing svix headers" };

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: "timestamp is not a number" };
  const now = Math.floor((args.now ?? Date.now()) / 1000);
  if (Math.abs(now - tsNum) > TOLERANCE_SECONDS) {
    return { ok: false, reason: `timestamp outside the ${TOLERANCE_SECONDS}s window` };
  }

  const keyB64 = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  let keyBytes: Buffer;
  try { keyBytes = Buffer.from(keyB64, "base64"); } catch { return { ok: false, reason: "secret is not base64" }; }
  if (!keyBytes.length) return { ok: false, reason: "empty secret" };

  const expected = crypto.createHmac("sha256", keyBytes)
    .update(`${id}.${timestamp}.${body}`).digest("base64");

  /*
    The header can carry several versioned signatures, space separated, because
    Svix rotates keys. Any v1 match is a pass; comparison is timing-safe, and
    length is checked first because timingSafeEqual throws on a mismatch.
  */
  for (const part of signature.split(" ")) {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;
    const a = Buffer.from(value);
    const b = Buffer.from(expected);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return { ok: true };
  }
  return { ok: false, reason: "no matching v1 signature" };
}
