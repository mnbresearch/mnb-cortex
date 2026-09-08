import "server-only";
import { runCortex } from "@/lib/ai/cortex";
import { FAST } from "@/lib/ai/generation";

/*
  TURN A ROUGH BRIEF INTO A GOOD ONE — AND NOTHING MORE THAN THAT.

  THE PROBLEM

  A business owner types "ring photo" or "video of my shop" and gets a
  disappointing result, then concludes the model is bad. It isn't: it was given
  three words. The gap between "ring photo" and a usable image is entirely
  detail the owner has in their head — the metal, the stone, the finish, where
  it should sit, what the shot is FOR — and no reason to think anyone wants.

  THE PART THAT IS EASY TO GET WRONG

  lib/ai/visual-prompts.ts already writes the camera, the lens, the lighting and
  the pacing, deterministically, for every generation. Those templates are
  tuned; they are why the output stopped looking like stock footage.

  So this must NOT produce camera language. If it did, every generation would
  carry two sets of instructions — "85mm three-quarter hero angle" from the
  template and "shot on a wide lens from above" from here — and the model would
  either average them into mush or follow the wrong one. The templates own HOW
  it is shot. This owns WHAT is being shot.

  That division is the whole design, and it is why the system prompt below
  spends as much space on what to leave out as on what to add.
*/

const SHARED_RULES = `
Rules, all of them mandatory:
- Write ONE paragraph, 25 to 60 words. No preamble, no headings, no bullet points, no quotes.
- Describe only the SUBJECT and its SETTING: what the thing is, its material,
  colour, texture, finish, scale, and where it sits.
- Do NOT mention camera, lens, focal length, angle, framing, aspect ratio,
  lighting, shadows, depth of field, film stock, resolution, or render quality.
  Those are added separately and your version would conflict with them.
- Do NOT invent a brand name, a price, a logo, text on the product, or a claim
  about the business.
- Do NOT add people unless the original brief mentioned them.
- Keep every concrete fact the user gave. You are enriching their brief, not
  replacing it.
- If the brief is already detailed, return it improved only slightly.
- Reply with the paragraph and nothing else.`;

export type ImproveKind = "image" | "video";

/**
 * Rewrite a user's rough brief into a fuller description of the subject.
 * Returns "" when the model gives nothing usable, so the caller can refund.
 */
export async function improveVisualBrief(
  brief: string,
  kind: ImproveKind,
  industry?: string | null,
): Promise<string> {
  const raw = String(brief || "").trim();
  if (!raw) return "";

  const trade = String(industry || "").trim();
  const context = trade ? `The business is in: ${trade}. Use vocabulary a ${trade} buyer would recognise.` : "";

  const system = kind === "video"
    ? `You improve short briefs for an AI video generator. The user has described what they want filmed.
Expand it into a vivid, concrete description of the SUBJECT and the SCENE — what is there, what it is made of,
what it is doing, and the surroundings. Describe motion only as what the subject itself does
(steam rising, fabric settling, liquid pouring), never as what the camera does.
${context}${SHARED_RULES}`
    : `You improve short briefs for an AI image generator. The user has described what they want pictured.
Expand it into a vivid, concrete description of the SUBJECT and the SETTING — what it is, its material,
colour, texture and finish, and the surface or space it sits in.
${context}${SHARED_RULES}`;

  let out = "";
  try {
    out = await runCortex([{ role: "user", content: `Improve this brief:\n\n${raw}` }], system, FAST);
  } catch {
    return "";
  }

  return cleanImprovedBrief(out, raw);
}

/*
  Models like to wrap an answer in conversation ("Sure! Here's an improved
  version:") and in quotes, and this text goes STRAIGHT into another prompt —
  so a stray "Here is" becomes part of the image description. Exported so the
  cleaning is testable without a model call.
*/
export function cleanImprovedBrief(out: string, original: string): string {
  let t = String(out || "").trim();
  if (!t) return "";

  /*
    Drop leading conversational fragments, REPEATEDLY.

    A single pass was not enough and the test caught it: "Sure! Here is an
    improved brief: ..." matched only "Sure", and because the separator class
    did not include "!", the exclamation mark survived — the cleaned brief began
    "! Here is an improved brief: A polished...". That whole string would then
    have been fed to the image model as part of the subject description.

    So: strip one fragment at a time, allow "!" and "." as separators, and keep
    going while anything still matches. Bounded, because a regex loop over model
    output should never be able to spin.
  */
  /*
    The trailing wildcard after "here's" is BOUNDED and stops at a dash.

    Unbounded, `[^:!.\n]*` swallowed an entire sentence: "Here's an improved
    brief — A carved teak chair beside a window." has no colon, bang or full
    stop until the very end, so the match consumed the brief itself and the
    cleaner returned "". The user would have pressed Improve, been charged, and
    been told it could not be improved — while the model had in fact answered
    perfectly.

    Excluding dashes and capping the run at 40 characters keeps it matching the
    lead-in ("Here's an improved brief:") and unable to reach the content.
  */
  const PREAMBLE = /^\s*(sure|certainly|of course|absolutely|okay|ok|here(?:'s| is)[^:!.\n—–-]{0,40}|improved(?: brief| version| prompt)?)\s*[:!.—–-]*\s*/i;
  for (let i = 0; i < 4 && PREAMBLE.test(t); i++) t = t.replace(PREAMBLE, "");
  // Strip surrounding quotes or markdown emphasis.
  t = t.replace(/^["'“”*_\s]+|["'“”*_\s]+$/g, "");
  // Collapse to a single paragraph — the templates expect one line.
  t = t.replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim();

  if (!t) return "";

  /*
    A hard ceiling. An over-long brief crowds out the camera and lighting
    instructions the template adds afterwards — the model weights early tokens
    more heavily, so a 300-word subject description quietly cancels the part
    that makes the output look professional. Cut at a sentence boundary so the
    result still reads as finished prose.
  */
  const MAX = 600;
  if (t.length > MAX) {
    const cut = t.slice(0, MAX);
    const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
    t = (lastStop > 200 ? cut.slice(0, lastStop + 1) : cut).trim();
  }

  /*
    If the model handed back something no longer than what the user wrote, it
    has not improved anything — offering it as an improvement would waste the
    customer's tap and their credits. The caller treats "" as a failure and
    refunds.
  */
  if (t.length <= String(original || "").trim().length) return "";

  return t;
}
