import "server-only";
import { serviceClient } from "@/lib/supabase/server";

/**
 * Per-workspace custom instructions for the AI.
 *
 * The single highest-leverage lever a customer has over output quality. Cortex
 * knows their NUMBERS — it has never known how they want to be spoken to, what
 * their margins actually mean, which competitors matter, or that "units" means
 * cartons of twelve. Two businesses with identical figures need different
 * advice, and until now there was no way to tell it so.
 *
 * Applied inside runCortex(), which is the single choke point every AI feature
 * goes through — chat, agents, reports, Deep Dive, the daily autopilot. Write it
 * once, and every answer in the product changes.
 *
 * Stored in app_settings, whose primary key is (org_id, key) — hence the
 * two-column conflict target. RLS is enabled on that table with no policies, so
 * this must use the service client; the anon client silently reads nothing.
 */

export const AI_INSTRUCTIONS_KEY = "ai_instructions";

/** Hard cap. Long instructions crowd out the business data in the context window. */
export const MAX_INSTRUCTIONS = 4000;

/**
 * Read the instructions, distinguishing "none saved" from "could not read".
 *
 * The old reader returned "" on ANY failure, and the settings panel treated
 * that as "you have no instructions" and enabled the editor — so pressing Save
 * after a transient read error overwrote the owner's real instructions with
 * blank. A failed read is now an error, never an empty string.
 */
export async function readInstructions(orgId: string | null | undefined): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (!orgId) return { ok: true, text: "" };
  const svc = serviceClient();
  if (!svc) return { ok: false, error: "Service role not configured." };
  try {
    const { data, error } = await svc
      .from("app_settings").select("value")
      .eq("org_id", orgId).eq("key", AI_INSTRUCTIONS_KEY).maybeSingle();
    if (error) return { ok: false, error: error.message };
    return { ok: true, text: String((data as any)?.value || "").slice(0, MAX_INSTRUCTIONS) };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not read the AI instructions." };
  }
}

/**
 * The instructions text. THROWS when they cannot be read — so GET
 * /api/ai/instructions answers non-200 instead of { ok: true, text: "" }, and
 * runCortex (which catches) simply proceeds without them for that answer.
 */
export async function getInstructions(orgId: string | null | undefined): Promise<string> {
  const r = await readInstructions(orgId);
  if (!r.ok) throw new Error(`Could not read the AI instructions: ${r.error}`);
  return r.text;
}

export async function setInstructions(orgId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const svc = serviceClient();
  if (!svc) return { ok: false, error: "Service role not configured." };
  const value = String(text || "").slice(0, MAX_INSTRUCTIONS);
  const { error } = await svc.from("app_settings").upsert(
    { org_id: orgId, key: AI_INSTRUCTIONS_KEY, value, updated_at: new Date().toISOString() },
    { onConflict: "org_id,key" },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Wrap the customer's text for the system prompt.
 *
 * Two things matter here. It is labelled as coming from the owner so the model
 * weights it above its own defaults — that is the entire point of the feature.
 * And it is explicitly subordinate to the honesty rule: no instruction may make
 * Cortex invent a number. Someone will eventually write "always say things are
 * going well", and a business tool that can be told to lie about the figures is
 * worthless, and worse than worthless if they act on it.
 */
export function instructionBlock(text: string): string {
  const t = String(text || "").trim();
  if (!t) return "";
  return `

--- HOW THIS OWNER WANTS YOU TO WORK ---
The business owner wrote the following instructions for you. Follow them closely
in tone, format, priorities and vocabulary. They override your default style.
They do NOT override accuracy: never invent, inflate or hide a number to satisfy
them. If an instruction conflicts with the real data, follow the data and say so
plainly.

${t.slice(0, MAX_INSTRUCTIONS)}`;
}
