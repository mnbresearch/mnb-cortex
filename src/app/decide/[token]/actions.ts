"use server";
import { headers } from "next/headers";
import { verifyDecision } from "@/lib/engine/decision-links";
import { approve, reject } from "@/lib/engine/ledger";
import { enforce } from "@/lib/ratelimit";
import { serviceClient } from "@/lib/supabase/server";
import { CATALOGUE_BY_KEY } from "@/lib/engine/catalogue";
import { RANK } from "@/lib/engine/policy";

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

  /*
    The link is a bearer credential for one person's decision. Re-check, at the
    moment of deciding, that this person is still a member of the workspace and
    still holds the rank the action needs — a removed or demoted admin's
    7-day-old email must not keep its power.
  */
  try {
    const svc = serviceClient();
    if (!svc) return { ok: false, error: "The server cannot record decisions right now." };
    const [{ data: mem }, { data: prop }] = await Promise.all([
      svc.from("memberships").select("role").eq("org_id", p.o).eq("user_id", p.u).maybeSingle(),
      svc.from("action_proposals").select("action").eq("id", p.p).eq("org_id", p.o).maybeSingle(),
    ]);
    const def = prop ? CATALOGUE_BY_KEY[(prop as any).action] : undefined;
    if (!def) return { ok: false, error: "That proposal no longer exists." };
    if (!mem || (RANK[String((mem as any).role)] || 0) < (RANK[def.minRank] || 0)) {
      return { ok: false, error: `This link was sent to someone who no longer has ${def.minRank} rights in this workspace. Decide on the Approvals page instead.` };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not check your access." };
  }

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
