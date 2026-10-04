"use server";
import { headers } from "next/headers";
import { verifyDecision } from "@/lib/engine/decision-links";
import { approve, reject } from "@/lib/engine/ledger";
import { enforce } from "@/lib/ratelimit";

/*
  The POST behind the two buttons on /decide/[token].

  The token is re-verified here, not trusted from the page: the page is a
  render, this is the decision. decided_by is the recipient the token was
  minted for. The ledger's approve()/reject() only move a row that is still
  `proposed`, and check the returned row count, so a second submit — or a
  forwarded email — reports "already decided" rather than acting twice.
*/
export type DecideResult = { ok: true; verb: "approve" | "reject"; summary: string } | { ok: false; error: string };

export async function decideByToken(token: string, verb: "approve" | "reject"): Promise<DecideResult> {
  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const hit = await enforce([{ key: `decide:${ip}`, limit: 30, windowSecs: 3600 }]);
  if (hit) return { ok: false, error: "Too many attempts from this network. Try again in an hour, or decide on the Approvals page." };

  const p = verifyDecision(String(token || ""));
  if (!p) return { ok: false, error: "This link is invalid or has expired. Open the Approvals page to decide there." };
  if (verb !== "approve" && verb !== "reject") return { ok: false, error: "Unknown decision." };

  try {
    if (verb === "approve") {
      const r = await approve(p.p, p.o, p.u);
      return r.ok ? { ok: true, verb, summary: r.summary } : { ok: false, error: r.error };
    }
    const r = await reject(p.p, p.o, p.u, "from email");
    return r.ok ? { ok: true, verb, summary: "Rejected. Nothing was changed." } : { ok: false, error: r.error };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not record the decision." };
  }
}
