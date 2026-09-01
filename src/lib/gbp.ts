import "server-only";

/**
 * Google Business Profile content engine.
 *
 * WHAT THIS DOES AND DOES NOT DO — stated plainly, because the difference
 * matters commercially.
 *
 * This generates Google Business Profile content: the business description,
 * services, posts, Q&A and review replies, written to Google's own field limits
 * and content rules. It does NOT publish to Google.
 *
 * Publishing requires the Google Business Profile API, which needs an OAuth
 * consent flow, a verified Google Cloud project, and per-location authorisation
 * from the business owner — plus Google's own approval of the app for that
 * scope. None of that exists in Cortex today, and pretending otherwise would
 * mean a customer clicks "post" and nothing reaches Google. So this produces
 * copy-ready content with the field limits enforced, and says so.
 *
 * The limits below are Google's, and getting them wrong is not cosmetic: a
 * description over 750 characters or a post over 1,500 is rejected at
 * publication, after the owner has already written it.
 */

export const GBP_LIMITS = {
  /** Business description field. */
  description: 750,
  /** Post body. Google truncates the preview at roughly 80 characters. */
  post: 1500,
  postPreview: 80,
  /** Q&A answer. */
  answer: 440,
  /** Review reply. */
  reviewReply: 4096,
  /** Service description. */
  service: 300,
} as const;

export type GbpKind =
  | "description"
  | "post_update"
  | "post_offer"
  | "post_event"
  | "services"
  | "qanda"
  | "review_reply";

export type GbpInput = {
  kind: GbpKind;
  business: string;
  industry?: string | null;
  city?: string | null;
  /** Free-text: the offer, the event, the review being replied to, etc. */
  detail?: string;
  /** For review replies: the star rating, so the tone can match. */
  rating?: number;
};

/*
  Google's content policy, compressed to the rules that actually get posts
  rejected or profiles suspended. These are asserted in every prompt because a
  model left to itself writes marketing copy that breaks them — most often by
  inventing a superlative ("the best in Delhi") or stuffing keywords.
*/
const POLICY = `
Google Business Profile content rules you MUST follow:
- No unverifiable superlatives ("best", "number one", "cheapest") unless the user supplied proof.
- No keyword stuffing, no lists of nearby localities, no competitor names.
- No phone numbers or URLs inside the business description field.
- No prices stated as guarantees unless the user gave them.
- No claims about results, cures, or outcomes — especially anything health-related.
- Write in natural sentences a customer would read, not SEO filler.`;

const VOICE = `
Write for an Indian small-business audience: plain, warm, concrete and specific.
Prefer what the business actually does over adjectives about how good it is.
Use Indian English and INR where money appears.`;

function locality(i: GbpInput): string {
  return i.city ? `The business serves customers in and around ${i.city}.` : "";
}

/** The instruction sent to the model, per content type. */
export function buildGbpPrompt(i: GbpInput): string {
  const who = `Business name: ${i.business}.${i.industry ? ` Industry: ${i.industry}.` : ""} ${locality(i)}`;
  const detail = i.detail?.trim() ? `Details supplied by the owner: ${i.detail.trim()}` : "";

  const bodies: Record<GbpKind, string> = {
    description:
      `Write the Google Business Profile "from the business" description.
STRICT LIMIT: ${GBP_LIMITS.description} characters including spaces. Count them and stay under.
Structure: what the business does and for whom, what makes it genuinely different (only what the owner supplied), how long it has operated if known, and what a first-time customer can expect.
Do not include a phone number, an address or a URL — Google rejects those in this field.`,

    post_update:
      `Write a Google Business Profile "What's new" post.
STRICT LIMIT: ${GBP_LIMITS.post} characters. The first ${GBP_LIMITS.postPreview} characters are all most people see, so lead with the point.
End with one clear call to action. Suggest which Google CTA button to use (Book / Order online / Buy / Learn more / Sign up / Call now).`,

    post_offer:
      `Write a Google Business Profile OFFER post.
STRICT LIMIT: ${GBP_LIMITS.post} characters. Lead with the offer itself in the first ${GBP_LIMITS.postPreview} characters.
State exactly what the offer is, who it applies to, and its terms. If the owner gave no start and end date, say that a date range must be set before publishing — an offer post requires one.
Do not invent a discount, a code or a deadline that was not supplied.`,

    post_event:
      `Write a Google Business Profile EVENT post.
STRICT LIMIT: ${GBP_LIMITS.post} characters. Open with the event name and when it is.
Include what happens, who it suits and how to attend. If a date or time was not supplied, list exactly what is missing rather than inventing it.`,

    services:
      `List the services this business should publish on its Google Business Profile.
Give 6 to 10 services. For each: a short service name, then a description under ${GBP_LIMITS.service} characters.
Base them on what this kind of business genuinely offers. Mark any you inferred rather than were told, so the owner can delete them.`,

    qanda:
      `Write the Questions & Answers this business should seed on its Google Business Profile.
Give 8 real questions a customer would actually type, with answers under ${GBP_LIMITS.answer} characters each.
Cover the things people ask before visiting: timings, parking, payment methods, appointments, delivery, returns, languages spoken.
Where the answer depends on information the owner has not supplied, write the answer with a clearly marked blank for them to fill.`,

    review_reply:
      `Write a reply to this Google review${typeof i.rating === "number" ? ` (${i.rating} out of 5 stars)` : ""}.
STRICT LIMIT: ${GBP_LIMITS.reviewReply} characters, but aim for 3 to 5 sentences — long replies read as defensive.
${typeof i.rating === "number" && i.rating <= 3
  ? `This is a critical review. Thank them, acknowledge the specific problem without excuses, say concretely what will change, and move the conversation offline with a contact route. Never dispute the customer's experience and never blame staff publicly.`
  : `This is a positive review. Thank them specifically for what they mentioned rather than generically, reinforce one thing the business does well, and invite them back. Do not sound like a template.`}
Never offer compensation, refunds or discounts unless the owner supplied that instruction.`,
  };

  return [who, detail, bodies[i.kind], VOICE, POLICY].filter(Boolean).join("\n\n");
}

/** Character budget for a given kind, for client-side counters. */
export function limitFor(kind: GbpKind): number {
  if (kind === "description") return GBP_LIMITS.description;
  if (kind === "services") return GBP_LIMITS.service;
  if (kind === "qanda") return GBP_LIMITS.answer;
  if (kind === "review_reply") return GBP_LIMITS.reviewReply;
  return GBP_LIMITS.post;
}

export const GBP_KINDS: { id: GbpKind; label: string; blurb: string; needsDetail?: string }[] = [
  { id: "description", label: "Business description", blurb: "The 750-character 'from the business' section." },
  { id: "post_update", label: "What's new post", blurb: "A regular update post with a call to action." },
  { id: "post_offer", label: "Offer post", blurb: "A discount or promotion, with its terms.", needsDetail: "The offer, and its dates" },
  { id: "post_event", label: "Event post", blurb: "An event with date, time and details.", needsDetail: "The event, date and time" },
  { id: "services", label: "Services list", blurb: "6-10 services with descriptions, ready to paste." },
  { id: "qanda", label: "Questions & answers", blurb: "8 questions customers actually ask, pre-answered." },
  { id: "review_reply", label: "Review reply", blurb: "A reply that fits the rating.", needsDetail: "Paste the review" },
];
