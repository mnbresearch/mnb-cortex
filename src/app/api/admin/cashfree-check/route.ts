import { NextResponse } from "next/server";
import crypto from "crypto";
import { isSuperAdmin } from "@/lib/superadmin";
import { verifyCashfreeWebhook } from "@/lib/pay/cashfree-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnose a rejected Cashfree webhook, without ever revealing the secret.
 *
 * WHY THIS EXISTS. The webhook answers a deliberately vague "invalid signature"
 * to its caller, which is correct — an unauthenticated caller should learn
 * nothing. But it left the OPERATOR with the same non-answer, and on a hosting
 * plan whose runtime logs are not readable there was no way to tell the four
 * possible causes apart:
 *
 *   the secret is wrong          → re-copy it from Cashfree
 *   the secret has whitespace    → re-paste it without the trailing space
 *   the body was re-serialised   → a code bug
 *   the clock/window is off      → a timestamp problem
 *
 * Each has a different fix, and money is not being fulfilled while you guess
 * between them. This turns the guess into a single request.
 *
 * SUPER-ADMIN ONLY, and it discloses nothing that would help anyone forge a
 * webhook: booleans, lengths, and a SHA-256 FINGERPRINT of the secret. The
 * fingerprint lets you compare the deployed key against the one in the Cashfree
 * dashboard — take the same hash of the dashboard value and see whether they
 * match — without the key itself ever leaving the server.
 *
 * GET  → what is configured
 * POST → paste a real failed delivery and find out exactly which check fails:
 *        { "timestamp": "1787814895250", "signature": "…", "body": "{\"type\":…}" }
 *        Copy all three from Cashfree → Developers → Webhooks → Logs → the
 *        failed delivery → Headers and Body tabs.
 */

function describeSecret() {
  const raw = process.env.CASHFREE_SECRET_KEY || "";
  const trimmed = raw.trim();
  return {
    configured: Boolean(trimmed),
    length: raw.length,
    trimmedLength: trimmed.length,
    // The single most likely cause of "payments work but webhooks 401": a
    // trailing space survives the HTTP header on the order-creation call and
    // changes the HMAC key.
    hasSurroundingWhitespace: raw !== trimmed,
    // Non-reversible. Enough to compare two values, useless for forging one.
    fingerprint: trimmed ? crypto.createHash("sha256").update(trimmed).digest("hex").slice(0, 16) : null,
    looksLikeCashfreeKey: /^cfsk_/i.test(trimmed),
    environment: (process.env.CASHFREE_ENV || "production").toLowerCase(),
    // A production webhook signed with a sandbox key fails every time, and the
    // app id says which environment the credentials belong to.
    appIdPrefix: (process.env.CASHFREE_APP_ID || "").slice(0, 10) || null,
  };
}

export async function GET() {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const secret = describeSecret();
  const hints: string[] = [];
  if (!secret.configured) hints.push("CASHFREE_SECRET_KEY is not set — the webhook answers 503, not 401.");
  if (secret.hasSurroundingWhitespace) {
    hints.push("THE SECRET HAS SURROUNDING WHITESPACE. This is almost certainly your bug: a trailing space is tolerated by the HTTP header on order creation but changes the HMAC key, so payments succeed and every webhook 401s. Re-paste the key in Vercel with no trailing space and redeploy. (Verification now trims, so this should already be neutralised — but fix the variable too.)");
  }
  if (secret.configured && !secret.looksLikeCashfreeKey) {
    hints.push("The secret does not start with 'cfsk_'. Check you pasted the SECRET KEY and not the App ID or a client token.");
  }
  if (secret.environment === "sandbox") {
    hints.push("CASHFREE_ENV is sandbox. A live webhook is signed with your PRODUCTION secret and will never verify against a sandbox key.");
  }
  return NextResponse.json({
    ok: true,
    secret,
    hints,
    howToDiagnose:
      "POST here with { timestamp, signature, body } copied verbatim from Cashfree → Developers → Webhooks → Logs → a failed delivery (Headers and Body tabs). The response names the exact check that fails.",
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }

  const b = await req.json().catch(() => ({} as any));
  const timestamp = String(b?.timestamp ?? "");
  const signature = String(b?.signature ?? "");
  const body = typeof b?.body === "string" ? b.body : JSON.stringify(b?.body ?? "");

  if (!timestamp || !signature || !body) {
    return NextResponse.json({
      ok: false,
      error: "Provide timestamp, signature and body — all three exactly as Cashfree sent them.",
    }, { status: 400 });
  }

  // The age check is deliberately disabled here: you are replaying a delivery
  // from the dashboard, which is by definition old. The question being asked is
  // "does the SIGNATURE match", and an age rejection would mask that answer.
  const result = verifyCashfreeWebhook({
    rawBody: body,
    signature,
    timestamp,
    secret: process.env.CASHFREE_SECRET_KEY,
    maxAgeSeconds: Number.MAX_SAFE_INTEGER,
  });

  const verdict = result.ok
    ? "The signature VERIFIES. The secret and the body are correct, so a live rejection was the replay window or a header that did not arrive — check the timestamp age."
    : result.reason === "signature_mismatch"
      ? "The signature DOES NOT match. In order of likelihood: the deployed secret is not the one Cashfree signed with (compare the fingerprint from GET against a hash of the dashboard value), the body was altered in transit or in the paste, or the webhook belongs to a different Cashfree environment."
      : `Rejected before the signature was even compared: ${result.reason}.`;

  return NextResponse.json({
    ok: result.ok,
    verdict,
    result,
    // So a paste that lost a character is obvious rather than mysterious.
    echo: { timestampDigits: timestamp.length, signatureLength: signature.length, bodyBytes: body.length },
    secret: describeSecret(),
  }, { headers: { "Cache-Control": "no-store" } });
}
