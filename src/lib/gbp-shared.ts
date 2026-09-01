/**
 * Google Business Profile — the parts BOTH the browser and the server need.
 *
 * WHY THIS FILE IS SEPARATE FROM lib/gbp.ts.
 *
 * lib/gbp.ts is `server-only`: it holds the prompt text, which is product IP and
 * has no business being readable in a page's JavaScript bundle. But the studio
 * UI is a client component, and it needs three things from that world — the
 * field limits (to show a live character counter), the list of content kinds (to
 * render the picker), and the GbpKind type.
 *
 * Importing them from the server-only module is not a style problem, it is a
 * BUILD FAILURE: `server-only` exists precisely to throw when a client component
 * reaches for it, and Next.js stops the build with "You're importing a component
 * that needs server-only".
 *
 * So the shared, non-secret half lives here, and gbp.ts re-exports it. There is
 * still exactly one definition of every limit — Google rejects a description
 * over 750 characters at publication time, so a counter that disagrees with the
 * generator would be worse than no counter at all.
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


/** Character budget for a given kind, for client-side counters. */
export function limitFor(kind: GbpKind): number {
  if (kind === "description") return GBP_LIMITS.description;
  if (kind === "services") return GBP_LIMITS.service;
  if (kind === "qanda") return GBP_LIMITS.answer;
  if (kind === "review_reply") return GBP_LIMITS.reviewReply;
  return GBP_LIMITS.post;
}


export const GBP_KINDS: { id: GbpKind; label: string; blurb: string; needsDetail?: string }[] = [
  // Built from GBP_LIMITS rather than typed as "750", so the blurb cannot drift
  // away from the counter and the prompt if Google changes the field.
  { id: "description", label: "Business description", blurb: `The ${GBP_LIMITS.description}-character 'from the business' section.` },
  { id: "post_update", label: "What's new post", blurb: "A regular update post with a call to action." },
  { id: "post_offer", label: "Offer post", blurb: "A discount or promotion, with its terms.", needsDetail: "The offer, and its dates" },
  { id: "post_event", label: "Event post", blurb: "An event with date, time and details.", needsDetail: "The event, date and time" },
  { id: "services", label: "Services list", blurb: "6-10 services with descriptions, ready to paste." },
  { id: "qanda", label: "Questions & answers", blurb: "8 questions customers actually ask, pre-answered." },
  { id: "review_reply", label: "Review reply", blurb: "A reply that fits the rating.", needsDetail: "Paste the review" },
];
