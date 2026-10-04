"use server";
import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/roles";
import { getUserAndOrg } from "@/lib/data";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { CATALOGUE_BY_KEY, isActionKey } from "./catalogue";
import * as ledger from "./ledger";

/*
  SERVER ACTIONS FOR THE ENGINE.

  Every one resolves the workspace from the SESSION — never from the form —
  and checks rank with assertRole() before touching the ledger. These are
  publicly invokable POST endpoints, like every server action; the form is a
  convenience for the UI, not a boundary.

  Ranks:
    propose         analyst   (anyone who can write data can ask Cortex to act)
    approve/reject  the action's own minRank from the catalogue — money and
                    outbound need admin, a due-date change needs manager
    undo            same minRank as approving it
    set policy      admin     (granting autonomy is a workspace-level decision)
*/

const PATHS = ["/approvals", "/approvals/rules", "/dashboard", "/receivables", "/collections", "/alerts"];
const bump = () => PATHS.forEach((p) => revalidatePath(p));

async function actor() {
  const { orgId, user } = await getUserAndOrg();
  if (!orgId || !user) throw new Error("Sign in to use this feature.");
  return { orgId, userId: user.id };
}

/** A human asks Cortex to do something, from a form. */
export async function proposeAction(fd: FormData): Promise<ActionResult> {
  const { orgId, userId } = await actor();
  await assertRole("analyst");
  const action = String(fd.get("action") || "");
  if (!isActionKey(action)) return fail("That is not something Cortex can do.");
  let args: unknown = {};
  try { args = JSON.parse(String(fd.get("args") || "{}")); } catch { return fail("The action's details were not readable."); }
  const r = await ledger.propose({
    orgId, action, args, source: "user", proposedBy: userId,
    rationale: String(fd.get("rationale") || "").slice(0, 500) || null,
  });
  bump();
  if (!r.ok) return fail(r.problems?.length ? `${r.error} ${r.problems.join("; ")}.` : r.error);
  if (r.executed) return r.executed.ok ? ok(r.executed.summary) : fail(r.executed.error || "Could not run it.");
  return r.verdict.verdict === "blocked"
    ? fail(r.verdict.reason)
    : ok("Queued for approval — it is waiting in Approvals.");
}

export async function approveProposal(fd: FormData): Promise<ActionResult> {
  const { orgId, userId } = await actor();
  const id = String(fd.get("id") || "");
  const action = String(fd.get("action") || "");
  const def = CATALOGUE_BY_KEY[action];
  if (!def) return fail("Unknown action.");
  await assertRole(def.minRank);
  const r = await ledger.approve(id, orgId, userId);
  bump();
  return r.ok ? ok(r.summary) : fail(r.error);
}

export async function rejectProposal(fd: FormData): Promise<ActionResult> {
  const { orgId, userId } = await actor();
  const id = String(fd.get("id") || "");
  const action = String(fd.get("action") || "");
  const def = CATALOGUE_BY_KEY[action];
  if (!def) return fail("Unknown action.");
  await assertRole(def.minRank);
  const r = await ledger.reject(id, orgId, userId, String(fd.get("note") || "").slice(0, 300) || undefined);
  bump();
  return r.ok ? ok("Rejected. Cortex will not do this.") : fail(r.error);
}

export async function undoProposal(fd: FormData): Promise<ActionResult> {
  const { orgId, userId } = await actor();
  const id = String(fd.get("id") || "");
  const action = String(fd.get("action") || "");
  const def = CATALOGUE_BY_KEY[action];
  if (!def) return fail("Unknown action.");
  await assertRole(def.minRank);
  const r = await ledger.undo(id, orgId, userId);
  bump();
  return r.ok ? ok(r.summary) : fail(r.error);
}

export async function savePolicy(fd: FormData): Promise<ActionResult> {
  const { orgId, userId } = await actor();
  await assertRole("admin");
  const action = String(fd.get("action") || "");
  const mode = String(fd.get("mode") || "approve");
  if (!["approve", "auto", "blocked"].includes(mode)) return fail("Choose approve, auto or blocked.");
  const num = (k: string) => { const v = String(fd.get(k) || "").trim(); if (!v) return null; const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; };
  const caps = {
    max_per_day: num("max_per_day"),
    max_amount_inr: num("max_amount_inr"),
    known_parties_only: String(fd.get("known_parties_only") || "") === "on",
  };
  const r = await ledger.setPolicy(orgId, action, mode as any, caps, userId);
  revalidatePath("/approvals/rules"); revalidatePath("/approvals");
  return r.ok ? ok("Rule saved.") : fail(r.error);
}
