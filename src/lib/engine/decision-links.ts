import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/*
  ONE-TAP DECISIONS FROM EMAIL.

  A proposal that waits on /approvals is only useful if the owner finds out it
  is waiting. The daily digest carries, per proposal, one link to
  /decide/<token>. That page shows the proposal and offers Approve / Reject as
  POST buttons — the link itself changes nothing, so a mail scanner or a
  preview fetch cannot approve anything.

  The token is the authorisation, so it is built to be narrow:

    · bound to ONE proposal, ONE workspace and ONE recipient (the owner or
      admin the digest was addressed to; their id becomes decided_by)
    · expires with the proposal (7 days by default) — a stale link is dead
    · single-use in effect: approve/reject only move a row out of `proposed`,
      and the ledger checks the returned row count, so a second click reports
      "already decided" instead of acting twice
    · HMAC-SHA256 over the payload with the same key the other signed links
      use; no key → no links (the digest says "open Approvals" instead),
      because a signature scheme that silently disables itself is worse than
      none.

  Format: base64url(json payload) + "." + base64url(hmac)[0..32]
*/

export type DecisionPayload = {
  p: string;   // proposal id
  o: string;   // org id
  u: string;   // recipient user id → decided_by
  x: number;   // expiry, unix seconds
};

function key(): Buffer | null {
  const k = process.env.LINK_SIGNING_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return k ? Buffer.from(k, "utf8") : null;
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");

function sig(body: string, k: Buffer): string {
  return createHmac("sha256", k).update(`decide:${body}`).digest("base64url").slice(0, 32);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Null when no signing key is configured — the caller must then not promise a link. */
export function signDecision(p: Omit<DecisionPayload, "x"> & { expiresAt: string | Date }): string | null {
  const k = key();
  if (!k) return null;
  if (!UUID.test(p.p) || !UUID.test(p.o) || !UUID.test(p.u)) return null;
  const x = Math.floor(new Date(p.expiresAt).getTime() / 1000);
  if (!Number.isFinite(x) || x * 1000 <= Date.now()) return null;
  const body = b64(JSON.stringify({ p: p.p, o: p.o, u: p.u, x }));
  return `${body}.${sig(body, k)}`;
}

/** The payload if the token is well-formed, correctly signed and unexpired; otherwise null. */
export function verifyDecision(token: string, now = Date.now()): DecisionPayload | null {
  const k = key();
  if (!k) return null;
  if (typeof token !== "string" || token.length > 600) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot), given = token.slice(dot + 1);
  const want = sig(body, k);
  if (given.length !== want.length) return null;
  if (!timingSafeEqual(Buffer.from(given), Buffer.from(want))) return null;
  let p: any;
  try { p = JSON.parse(unb64(body)); } catch { return null; }
  if (!p || !UUID.test(String(p.p)) || !UUID.test(String(p.o)) || !UUID.test(String(p.u))) return null;
  if (typeof p.x !== "number" || p.x * 1000 <= now) return null;
  return { p: p.p, o: p.o, u: p.u, x: p.x };
}

export function decisionUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/decide/${encodeURIComponent(token)}`;
}
