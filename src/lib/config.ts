export const APP_VERSION = "6.40.0";
export const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "919711488481";

// ADMIN_EMAIL and SUPER_ADMINS moved to src/lib/operators.ts, which is
// server-only. This file is imported by client components, so anything
// left here ships in the browser bundle.

/**
 * The businesses in your portfolio, with categorisation.
 * `publicKpis` are figures PUBLISHED on each company's own website — shown as
 * public/marketing figures, never presented as internal management accounts.
 */
export const MY_BUSINESSES = [
  {
    slug: "mnb-research",
    name: "MNB Research",
    legalName: "MNB Research",
    category: "Consulting & Growth",
    industry: "consulting",
    tagline: "Research-driven strategy, growth & digital transformation",
    services: ["Strategy consulting", "Financial modeling", "Market research", "Web development", "SEO", "AI tools", "Digital marketing"],
    sectorsServed: ["EdTech", "FMCG", "Manufacturing", "AI"],
    site: "https://www.mnbresearch.com",
    app: "",
    contact: "contact@mnbresearch.com",
    publicKpis: [
      { label: "Businesses impacted", value: "50+", note: "across EdTech, FMCG, Manufacturing, AI" },
      { label: "Positioning", value: "Growth & consultancy", note: "recognised as India's Best Business Growth & Consultancy Service Provider" },
    ],
  },
  {
    slug: "abrobot",
    name: "AbroBot",
    legalName: "Abrobot Technologies",
    category: "EdTech / AI SaaS",
    industry: "education",
    tagline: "India's AI-powered study abroad platform",
    services: ["AI Counsellor", "SOP Analyser", "ROI Predictor", "Scholarship Finder", "University matching", "Visa & compliance", "Test prep (IELTS/GRE/GMAT/TOEFL)", "Application & admission"],
    sectorsServed: ["Study abroad", "USA", "Canada", "UK", "Germany", "Australia"],
    site: "https://www.abrobot.ai",
    app: "https://app.abrobot.ai",
    contact: "contact@mnbresearch.com",
    publicKpis: [
      { label: "Student data points", value: "25 lakh+", note: "training data behind the AI" },
      { label: "Consultants trained", value: "4,000+", note: "expert insights" },
      { label: "Visa success rate", value: "88–92%", note: "across destinations (published)" },
      { label: "Scholarships facilitated", value: "₹55 Cr+", note: "2025–26 (published)" },
      { label: "AI tools live", value: "20+", note: "at app.abrobot.ai" },
      { label: "Press reach", value: "160+ outlets", note: "60M+ reach" },
    ],
  },
] as const;

export type Plan = {
  id: string; name: string; monthly: number; annual: number; tagline: string;
  usdMonthly?: number; usdAnnual?: number;
  highlight?: boolean; cta: string; features: string[];
};

// Display currencies for the marketing pricing page. Cashfree settles in INR;
// USD is shown for international prospects (who are routed to "Talk to sales").
export type CurrencyCode = "INR" | "USD";
export const CURRENCIES: Record<CurrencyCode, { symbol: string; label: string; locale: string }> = {
  INR: { symbol: "₹", label: "INR", locale: "en-IN" },
  USD: { symbol: "$", label: "USD", locale: "en-US" },
};
export function formatMoney(amount: number, cur: CurrencyCode): string {
  return CURRENCIES[cur].symbol + amount.toLocaleString(CURRENCIES[cur].locale);
}
/** Price for a plan in the chosen currency + billing cycle. Returns null for "custom". */
export function planPrice(p: Plan, cur: CurrencyCode, annual: boolean): number | null {
  if (p.monthly === 0 && (p.usdMonthly ?? 0) === 0) return null; // enterprise / custom
  if (cur === "USD") return annual ? (p.usdAnnual ?? 0) : (p.usdMonthly ?? 0);
  return annual ? p.annual : p.monthly;
}

// ---- AI credit metering ----------------------------------------------------
// What each AI action costs, in credits. Heavier generations cost more.
export const CREDIT_COSTS: Record<string, number> = {
  /*
    REPRICED against the TRUE credit floor. See lib/pricing-model.ts.

    The previous numbers were computed at "the ₹0.90 credit floor", taking the
    cheapest credit PACK as the worst case. But credits also arrive through
    PLANS, and the plans were far cheaper per credit — AI COO annual worked out
    at ₹0.556. Every margin in this file was therefore 1.62x too generous, and
    measured properly, 18 of 35 actions were LOSS-MAKING on an AI COO annual
    account: chat at -125%, the dashboard pulse at -227%, AI Visibility at -116%.
    Those are the highest-volume actions in the product, sold to its largest
    customer, below cost.

    Two things were changed together, because changing either alone does not
    work: PLAN_CREDITS was reduced so that no plan sells a credit below ₹0.90,
    and these costs were set from measured COGS at that floor.

    Each number is ceil(COGS / (1 - 0.85) / 0.90) — an 85% target, above the 80%
    minimum the margin test enforces, so a modest change in model pricing or the
    rupee does not immediately put an action underwater.

    Worst-case COGS per call, at the POST-promotional model price:
      FAST      2,048 output tokens   ₹1.81
      STANDARD  3,072                 ₹2.51
      DEEP      4,096                 ₹3.20
      EXTRACT   8,192                 ₹5.96
      image                           ₹3.74
      video     8s Veo Fast           ₹77.00
      visibility  several grounded searches  ₹12.00

    Do not edit a number here by hand. Change the assumption in
    pricing-model.ts and run `npm run test:margins`, which recomputes every
    action and fails if any drops below 80%.
  */

  // FAST — short, single-pass, the user is waiting.
  pulse: 14, actions: 14, brief: 14, critique: 14,
  account: 14, outreach: 14, act: 14, gbp: 14,

  // STANDARD — the default working answer.
  chat: 19, ask: 19, document: 19, meeting: 19,
  market: 19, marketing: 19, competitor: 19, negotiate: 19,
  hiring: 19, contract: 19, playbook: 19, proposal: 19,
  broadcast: 19, sop: 19, costs: 19, loan: 19,
  vendor: 19,

  // DEEP — multi-step reasoning, where the thinking is the value.
  scenario: 24, forecast: 24, strategy: 24, investor: 24,
  board: 24, valuation: 24, deepdive: 24, report: 24,

  // EXTRACT — parsing a document; needs output room, not deliberation.
  gst: 45, bankstatement: 45,

  /*
    Metered per call rather than per token. Video is the one number in this file
    that could bankrupt the product: at 40 credits it was ₹36 of revenue against
    ₹306 of Veo Standard billing, a ₹270 loss on every clip. It is now priced
    against the Fast tier it actually uses, at the real floor.
  */
  visibility: 89,
  agent_image: 28, agent_video: 571,
};

// Weekly image-generation caps by state. Trial = a small taste; paid tiers get more.
export const IMAGE_WEEKLY: Record<string, number> = {
  /*
    `payg` = no subscription, but a bought credit balance. The credits already
    carry the margin — every action is priced for 85% at the ₹0.90 floor — so
    these weekly caps are a runaway guard, not a commercial lever.

    Enterprise is a real number rather than -1 for the same reason its credit
    allowance is: an uncapped tier has unbounded COGS against a fixed
    negotiated price.
  */
  payg: 50,
  watch: 0, watchpro: 500, practice: 500, command: 2000, enterprise: 5000,
  starter: 0, growth: 120, business: 500, aicoo: 2000,
  // legacy ids kept so an existing workspace never falls through to a default
  solo: 0, premium: 500, trial: 0,
};

/**
 * Videos per week. Video shares the image gate but needs its own ceiling:
 * an 8-second clip costs ~₹77 against ~₹3.74 for an image, so one number
 * cannot sensibly govern both.
 */
export const VIDEO_WEEKLY: Record<string, number> = {
  payg: 10,
  watch: 0, watchpro: 20, practice: 20, command: 60, enterprise: 200,
  starter: 0, growth: 5, business: 20, aicoo: 60,
  solo: 0, premium: 20, trial: 0,
};

/*
  The fallback for any mode not listed above. It was 2 — ₹1.80 of revenue at the
  floor against ₹2.51 of COGS, so ANY action someone forgot to price lost money
  by default. It is now the STANDARD price, which means a new action is
  profitable from the moment it ships and is corrected downward later if it
  turns out to be cheap, rather than the other way round.
*/
export const DEFAULT_CREDIT_COST = 19;
export function creditCost(mode: string): number {
  return CREDIT_COSTS[String(mode || "").toLowerCase()] ?? DEFAULT_CREDIT_COST;
}

// Monthly included allowance per plan. -1 means unlimited.
export const PLAN_CREDITS: Record<string, number> = {
  /*
    Set so that NO plan sells a credit below ₹0.90 — the floor every action in
    CREDIT_COSTS is priced against. The old allowances broke that badly:

      AI COO annual   ₹33,332/mo for 60,000 credits = ₹0.556 per credit
      Business annual ₹12,499/mo for 20,000        = ₹0.625
      AI COO monthly  ₹39,999/mo for 60,000        = ₹0.667

    A plan that sells credits under cost turns the product's best customer into
    its biggest loss, and does it silently — the more they use it, the worse it
    gets. Each allowance is now floor(worst monthly price / ₹0.90), where the
    worst case is the annual price divided by twelve.

    Starter goes UP: at ₹1,499 for 1,000 credits it was selling at ₹1.50 and
    leaving money on the table.
  */
  /*
    Live tiers. Each is floor(worst monthly price / ₹0.90), where the worst case
    is the annual price divided by twelve — so no plan can sell a credit below
    the floor every action in CREDIT_COSTS is priced against.
  */
  watch: 4600, watchpro: 13850, practice: 27750, command: 37000,

  // Retired tiers, at the economics they were actually sold at.
  starter: 1350, growth: 4600, business: 13850, aicoo: 37000,
  /*
    A FAIR-USE CAP, not unlimited. "Unlimited" credits meant unbounded COGS
    against a negotiated fixed price — one enterprise account generating a few
    thousand videos at ₹77 of Veo billing each could cost more than its contract
    was worth, and nothing in the product would have stopped it or reported it.

    At ₹0.90 a credit this allowance implies a price floor of ₹1,35,000 a month.
    An enterprise deal signed below that is sold under cost; see
    ENTERPRISE_MIN_MONTHLY_INR.
  */
  enterprise: 150000,
  // legacy ids — an old row must still resolve to something sane
  solo: 1350, premium: 13850,
};

/**
 * There is no free trial.
 *
 * Kept as 0 rather than deleted because TRIAL_DAYS is read in several places;
 * zero means a workspace is never granted a free window. Entry is either the
 * ₹149 credit pack (pay as you go, no subscription) or a plan. The free public
 * Business Health Check remains the top of funnel — it is rate-limited and
 * costs three Gemini calls, not an open-ended account.
 *
 * A three-day trial on a product whose first step is "connect Tally or upload a
 * bank statement" was converting badly anyway: the clock ran out before an
 * owner had their data in.
 */
export const TRIAL_DAYS = 0;

/**
 * Credits granted to BOTH sides when a referred workspace starts paying.
 *
 * THIS IS THE ONE NUMBER TO CHANGE IF THE PROGRAMME IS TOO GENEROUS OR TOO MEAN.
 *
 * The old /referrals page promised "you both get a free month". On the AI COO
 * plan that is ₹39,999 of product per referral, twice — and this product was
 * repriced so every plan clears 85%. One referral would have wiped out the
 * margin on several months of a paying account.
 *
 * Credits bound the cost precisely instead. At 500 each:
 *
 *   retail value    500 × ₹0.90 floor          = ₹450 per side, ₹900 a referral
 *   worst-case COGS 500 credits of the least
 *                   efficient action (~15% of
 *                   revenue at the 85% target) ≈ ₹68 per side, ₹135 a referral
 *
 * So a referral costs about ₹135 of real money and is only ever paid out after
 * the referred business has actually subscribed. Raise it if conversion needs
 * the push; the arithmetic above is the thing to redo, not a guess.
 */
export const REFERRAL_REWARD_CREDITS = 500;

/** No free credits. A new workspace buys a pack or a plan. */
export const TRIAL_CREDITS = 0;

/**
 * Users allowed per plan — the caps the pricing page advertises ("1 user",
 * "up to 3 users", "Up to 75 users"). Nothing enforced them, so ₹799 and
 * ₹39,999 both bought unlimited seats. -1 means unlimited.
 */
export const PLAN_SEATS: Record<string, number> = {
  /*
    Live tiers. Practice gets 25 seats because a firm puts its whole team in;
    the CLIENT WORKSPACES it manages are counted separately (PRACTICE_CLIENTS).
  */
  watch: 3, watchpro: 20, practice: 25, command: 75, enterprise: -1,
  // Retired tiers — an existing workspace must keep the seats it paid for.
  starter: 1, growth: 5, business: 20, aicoo: 75,
  solo: 1, premium: 20,
};
/**
 * Client workspaces a Practice account may manage.
 *
 * Separate from seats on purpose. A CA firm has (say) six people who each need
 * a login — that is seats — and thirty CLIENT BUSINESSES whose books they watch.
 * Conflating the two is how a firm either pays for thirty logins it does not
 * need or gets thirty clients on a six-seat plan.
 *
 * The credit allowance is POOLED across clients rather than per client, because
 * a firm's usage is lumpy: nothing for three weeks, then everything at once in
 * the run-up to the 20th.
 */
export const PRACTICE_CLIENTS: Record<string, number> = {
  practice: 25,
  enterprise: -1,   // negotiated by hand; see ENTERPRISE_MIN_MONTHLY_INR
};

export function practiceClientLimit(plan: string | null | undefined): number {
  return PRACTICE_CLIENTS[String(plan || "").toLowerCase()] ?? 0;
}

export function seatLimit(plan: string | null | undefined): number {
  return PLAN_SEATS[String(plan || "").toLowerCase()] ?? PLAN_SEATS.starter;
}

/**
 * Capability entitlements — the plan bullets that are NOT metered by credits.
 *
 * WHY THIS EXISTS.
 *
 * Most of what the higher plans sell is AI work, and that is already gated by
 * PLAN_CREDITS: a Watch workspace gets 4,600 credits and a Command workspace
 * 37,000, so "AI agents across every department" and "Image & video generation"
 * are limited by the money, whatever the UI lets you click. Those are fine.
 *
 * The bullets below are different. They are capabilities, not consumption — an
 * API key works the same on any plan and costs us nothing per call, so nothing
 * stopped a ₹4,999 Watch workspace from using "Public API + outbound webhooks",
 * a Watch Pro bullet at ₹14,999. There was no feature-gate layer at all.
 *
 * THE FAILURE MODE THIS IS SHAPED AROUND.
 *
 * Refusing a PAYING customer is worse than letting a cheap one through — the
 * entitlement suite was written after nearly shipping exactly that. So:
 *
 *   - An unrecognised or empty plan gets the LOWEST entitlement, but callers
 *     are expected to gate only the CREATION of new things, never the use of
 *     what already exists. An API key issued under an older plan keeps working.
 *   - Legacy plan ids are listed explicitly. A workspace still on a retired
 *     tier bought these capabilities and does not lose them because we renamed
 *     the plans.
 */
export type Capability = "api" | "webhooks" | "whitelabel" | "workflows" | "alert_rules" | "memory";

const PLAN_CAPABILITIES: Record<string, Capability[]> = {
  watch: [],
  watchpro: ["api", "webhooks", "workflows", "alert_rules", "memory"],
  practice: ["api", "webhooks", "workflows", "alert_rules", "memory", "whitelabel"],
  command: ["api", "webhooks", "workflows", "alert_rules", "memory", "whitelabel"],
  enterprise: ["api", "webhooks", "workflows", "alert_rules", "memory", "whitelabel"],

  /*
    Retired tiers. These workspaces PAID for these capabilities under the old
    naming, and removing them here would silently downgrade a paying customer —
    the one failure this module is most concerned with. Mapped to the nearest
    current equivalent, generously where it is ambiguous.
  */
  starter: [],
  growth: ["api", "webhooks", "workflows", "alert_rules"],
  business: ["api", "webhooks", "workflows", "alert_rules", "memory"],
  aicoo: ["api", "webhooks", "workflows", "alert_rules", "memory", "whitelabel"],
};

export function planIncludes(plan: string | null | undefined, cap: Capability): boolean {
  return (PLAN_CAPABILITIES[String(plan || "").toLowerCase()] ?? []).includes(cap);
}

/** The cheapest current plan that includes a capability, for the upgrade prompt. */
export function lowestPlanWith(cap: Capability): string {
  for (const p of PLANS) if (planIncludes(p.id, cap)) return p.name;
  return "a higher plan";
}

// Buyable top-up packs (one-time). Price in INR.
export type CreditPack = { id: string; label: string; credits: number; price: number; per: string };
export const CREDIT_PACKS: CreditPack[] = [
  /*
    ₹0.90 is THE FLOOR THE WHOLE PRODUCT IS PRICED AGAINST. Every entry in
    CREDIT_COSTS is sized for an 85% margin at exactly this number, and
    PLAN_CREDITS is set so no plan undercuts it either — that second half was
    missing before, which is how AI COO annual came to sell credits at ₹0.556
    and put 18 actions underwater.

    Discounting past ₹0.90, by a cheaper pack OR by raising a plan's allowance,
    silently deletes the margin on every action at once. npm run test:margins
    recomputes the floor from this list and the plans, and fails if it moves.
  */
  { id: "pack_100", label: "Taster", credits: 100, price: 149, per: "₹1.49 / credit" },
  { id: "pack_500", label: "Small", credits: 500, price: 599, per: "₹1.20 / credit" },
  { id: "pack_2k", label: "Standard", credits: 2000, price: 1999, per: "₹1.00 / credit" },
  { id: "pack_10k", label: "Bulk", credits: 10000, price: 8999, per: "₹0.90 / credit" },
];

/*
  REPOSITIONED AND REPRICED.

  The old ladder started at ₹1,499 and led with "AI COO". Both were wrong, and
  they were wrong together.

  ₹1,499 anchors the product as a cheap tool next to Zoho Books at ₹899 and
  Vyapar below that — a price war against incumbents with a twenty-year head
  start, fought on their turf (recording what happened). It also cannot repay
  any paid acquisition, and it made the 90+ calculators the loudest thing on the
  page, which reads as a free-tools site.

  "AI COO" is a category with no search volume, describes a person the buyer
  already IS, and is unfalsifiable — the largest remaining overclaim in a
  product we spent weeks making honest.

  THE POSITION NOW: Cortex is the early-warning layer, not the ledger. Your
  books tell you what happened; Cortex tells you what is about to. It sits ON
  TOP of Tally, Zoho and Vyapar rather than replacing them, which is a far lower
  bar for adoption — nobody switches accounting packages, plenty will add
  something that reads their export and warns them.

  Priced accordingly: the floor is ₹4,999. That is a deliberate choice to stop
  competing on price and start competing on the one thing the incumbents
  structurally do not do.

  LEGACY IDS ARE KEPT BELOW, HIDDEN. Existing workspaces carry `plan` values of
  'starter'/'growth'/'business'/'aicoo' in the database, and their allowances in
  PLAN_CREDITS are set against the price they actually paid. Renaming or
  repricing those ids in place would silently hand a ₹1,499 customer the credit
  allowance of a ₹4,999 one — a margin hole created by a marketing change. New
  ids for new economics; old ids keep what was bought.
*/
export const PLANS: Plan[] = [
  { id: "watch", name: "Watch", monthly: 4999, annual: 49990, usdMonthly: 59, usdAnnual: 599,
    tagline: "Know what is going wrong, before it costs you.",
    cta: "Start watching",
    features: [
      "1 business · up to 3 users",
      "4,600 AI credits / month",
      "Receivables, payables & cash — watched daily",
      "MSME 45-day (43B(h)) deduction exposure",
      "GST & statutory deadline warnings",
      "Weekly brief by email, automatically",
      "Reads your Tally, Vyapar & Busy exports",
      "Bank statement & GST return reader",
    ] },
  { id: "watchpro", name: "Watch Pro", monthly: 14999, annual: 149990, usdMonthly: 179, usdAnnual: 1799,
    tagline: "For companies where a missed number costs real money.", highlight: true,
    cta: "Choose Watch Pro",
    features: [
      "Up to 20 users · multi-workspace",
      "13,850 AI credits / month",
      "Everything in Watch",
      "Ask Cortex anything about your own rows",
      "Alert rules you set, delivered by email",
      "Workflow automation on a schedule",
      "Public API + outbound webhooks",
      "Cortex Memory — permanent business context",
    ] },
  { id: "practice", name: "Practice", monthly: 29999, annual: 299990, usdMonthly: 359, usdAnnual: 3599,
    tagline: "For CAs and advisory firms. Every client, one screen.",
    cta: "Talk to us about Practice",
    features: [
      "Up to 25 client workspaces",
      "27,750 AI credits / month, pooled",
      "Practice console — every client's exposure ranked",
      "Whose GST is due, whose 43B(h) clock is running",
      "Whose receivables moved this week",
      "White-label — your firm's name on the brief",
      "Everything in Watch Pro, per client",
      "Named onboarding for your team",
    ] },
  { id: "command", name: "Command", monthly: 39999, annual: 399990, usdMonthly: 469, usdAnnual: 4699,
    tagline: "Cortex acts, not just warns.",
    cta: "Choose Command",
    features: [
      "Up to 75 users · multi-workspace",
      "37,000 AI credits / month",
      "Everything in Watch Pro",
      "WhatsApp execution (your Meta account)",
      "AI agents across every department",
      "White-label & custom branding",
      "Image & video generation",
      "Guided onboarding · priority support",
    ] },
  { id: "enterprise", name: "Enterprise", monthly: 0, annual: 0,
    tagline: "For groups, PE funds and family offices.",
    cta: "Talk to sales",
    features: [
      "Unlimited workspaces & users",
      "1,50,000 AI credits / month — fair use",
      "Everything in Command",
      "Single sign-on & audit export",
      "Dedicated environment options",
      "Named success manager",
    ] },
];

/*
  Retired tiers. NOT shown on the pricing page and not purchasable — kept only so
  an existing workspace whose `plan` column holds one of these still resolves to
  a real name, allowance and entitlement rather than falling through to a
  default. Removing them would silently downgrade paying customers.
*/
export const LEGACY_PLANS: Plan[] = [
  { id: "starter", name: "Starter (retired)", monthly: 1499, annual: 14990,
    tagline: "Retired tier — kept for existing workspaces.", cta: "", features: [] },
  { id: "growth", name: "Growth (retired)", monthly: 4999, annual: 49990,
    tagline: "Retired tier — kept for existing workspaces.", cta: "", features: [] },
  { id: "business", name: "Business (retired)", monthly: 14999, annual: 149990,
    tagline: "Retired tier — kept for existing workspaces.", cta: "", features: [] },
  { id: "aicoo", name: "AI COO (retired)", monthly: 39999, annual: 399990,
    tagline: "Retired tier — kept for existing workspaces.", cta: "", features: [] },
];

/** Every plan the system must be able to resolve, live or retired. */
export const ALL_PLANS: Plan[] = [...PLANS, ...LEGACY_PLANS];
