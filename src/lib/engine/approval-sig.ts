/*
  SIGNED APPROVALS — the approval is bound to exactly what was approved.

  A proposal row carries its arguments (which invoice, what amount, which
  channel). Before this, "approved" was a status string: anything that could
  write the row between the human's tap and execution — a bug, a migration,
  anyone with a database session, a future code path that "fixes up" args —
  could change WHAT runs without changing THAT it was approved.

  Now an approval is an HMAC-SHA256 over:

      approve : proposal id : workspace : action : sha256(canonical args)
              : approver (user id, or "policy" for an owner auto-rule)
              : assurance level ("aal2" = second factor, "aal1", "policy")

  execute() recomputes it from the row it is about to act on and refuses on
  any mismatch. The key never leaves the server; a row cannot be re-signed
  from the database alone.

  Key: APPROVAL_SIGNING_SECRET, else LINK_SIGNING_SECRET, else CRON_SECRET,
  else SUPABASE_SERVICE_ROLE_KEY — the same chain the decision links use, so a
  deployment that has any server secret signs. With none, sign() returns null
  and the ledger refuses to execute rather than run unsigned.

  Pure apart from node:crypto — executed by scripts/test-approval-sig.mjs.
*/
import { createHmac, createHash, timingSafeEqual } from "crypto";

export type ApprovalFields = {
  id: string;
  orgId: string;
  action: string;
  args: unknown;
  approver: string;
  aal: string;
};

/** JSON with object keys sorted at every depth, so {a,b} and {b,a} hash the same. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}

export function argsHash(args: unknown): string {
  return createHash("sha256").update(canonical(args)).digest("hex");
}

export function approvalKey(env: Record<string, string | undefined> = process.env): string | null {
  return env.APPROVAL_SIGNING_SECRET || env.LINK_SIGNING_SECRET || env.CRON_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function message(f: ApprovalFields): string {
  return ["approve", f.id, f.orgId, f.action, argsHash(f.args), f.approver, f.aal].join(":");
}

export function signApproval(f: ApprovalFields, key: string | null = approvalKey()): { sig: string; argsHash: string } | null {
  if (!key) return null;
  return { sig: createHmac("sha256", key).update(message(f)).digest("hex"), argsHash: argsHash(f.args) };
}

export function verifyApproval(f: ApprovalFields, sig: unknown, key: string | null = approvalKey()): boolean {
  if (!key || typeof sig !== "string" || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const want = Buffer.from(createHmac("sha256", key).update(message(f)).digest("hex"), "hex");
  const got = Buffer.from(sig, "hex");
  return want.length === got.length && timingSafeEqual(want, got);
}
