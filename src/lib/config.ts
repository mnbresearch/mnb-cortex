export const APP_VERSION = "6.45.0";
/*
  …88480. The public footer, the contact page, the privacy, terms and refund
  pages all publish …88480; this default was …88481, so the pricing modal's
  "Message on WhatsApp" button opened a chat with a different number from the
  one on the page it was launched from.
*/
export const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "919711488480";

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
  /*
    "Improve my prompt". Deliberately the FAST price and not less: it is one
    short model call and should be costed like every other one. Pricing it at
    zero would make it free to spam, and pricing it cheaper than its own COGS
    would put the product's most-tapped button underwater — which is exactly
    how 18 actions ended up loss-making the last time a number here was chosen
    by feel rather than derived.

    It costs a fifth of the image it improves (28) and a fortieth of a video
    (571), so using it is always cheaper than generating twice.
  */
  improve_prompt: 14,
  /* Workbook transform: plans a short JSON op list from one instruction. FAST tier; the
     transform itself is deterministic code and costs nothing. */
  transform_plan: 14,
  /* "Automate this": one short JSON call turning a sentence into workflow steps. */
  automation_plan: 14,

  // STANDARD — the default working answer.
  chat: 19, ask: 19, document: 19, meeting: 19,
  market: 19, marketing: 19, competitor: 19, negotiate: 19,
  hiring: 19, contract: 19, playbook: 19, proposal: 19,
  broadcast: 19, sop: 19, costs: 19, loan: 19,
  vendor: 19,
  /*
    THREE MODES THE APP CHARGES FOR AND THIS TABLE HAD NEVER HEARD OF.

    `benchmark` (/benchmarks), `pricing` (/pricing-optimizer) and `risk` (a
    /playbooks card) are all passed to AIPanel as `mode=` and all reach
    chargeForMode. creditCost() falls back to DEFAULT_CREDIT_COST for an
    unknown mode, so they were billing 19 — the right number, by accident.

    The price was never the problem. Being ABSENT was: scripts/test-margins.mjs
    parses this block and verifies every entry earns its cost of goods, so a
    mode that is not listed here is a mode whose margin has never once been
    checked. The file's own header says "do not edit a number here by hand, run
    npm run test:margins" — that instruction cannot protect a row that does not
    exist.

    Listed explicitly at 19 so the value is unchanged and the coverage is real.
    scripts/test-ai-metering.mjs now fails if any mode= in the app is missing
    from this table, which is what stops the next one being added silently.
  */
  benchmark: 19, pricing: 19, risk: 19,

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

    payg is 0, not 50. A credit pack bought with no plan (or after a plan
    lapsed) unlocked 50 images and 10 videos a week — more than Try or Watch
    subscribers get (0), while the pricing page says image & video are Watch
    Pro and up and a pack buys "the AI reads and the calculators". The table
    now says what the copy says.
  */
  payg: 0,
  // "try" sits alongside watch: no image/video quota. Those are premium
  // actions on a premium plan, and an entry tier that included them would be
  // selling ₹77-a-clip Veo output inside ₹799.
  try: 0, watch: 0, watchpro: 500, practice: 500, command: 2000, enterprise: 5000,
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
  payg: 0, // see IMAGE_WEEKLY.payg
  try: 0, watch: 0, watchpro: 20, practice: 20, command: 60, enterprise: 200,
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
  /*
    PREMIUM REPRICE (2026-10, no customers on the old prices). Each allowance
    keeps the worst-case rate at or above the ₹0.90 floor:

      watch     ₹79,990/yr  → ₹6,665.83/mo ÷ 6,500  = ₹1.026 / credit
      watchpro  ₹1,99,990   → ₹16,665.83 ÷ 17,500    = ₹0.952
      practice  ₹3,99,990   → ₹33,332.50 ÷ 36,000    = ₹0.926
      command   ₹5,99,990   → ₹49,999.17 ÷ 55,000    = ₹0.909

    1218 = floor((14990 / 12) / 1.02551) — the entry plan's annual price per
    month divided by Watch's own worst-case rate, so Try is a smaller plan,
    never a cheaper way to buy credits. npm run test:margins and
    test:entry-plan recompute both and fail if either moves.
  */
  try: 1218,
  watch: 6500, watchpro: 17500, practice: 36000, command: 55000,

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
  try: 1, watch: 5, watchpro: 20, practice: 25, command: 75, enterprise: -1,
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
 *
 * THIS SENTENCE WAS AN ASSERTION WITH NO IMPLEMENTATION BEHIND IT for as long
 * as the plan has been sold. charge_credits was always called with the CURRENT
 * workspace's id, so a partner working inside a client workspace was refused
 * for want of credits that client had never been given — while this comment,
 * and the bullet listing 27,750 credits under 25 client workspaces, both said
 * otherwise.
 *
 * It is true now: lib/credit-pool.ts decides the payer, the link is written
 * only by cortex_practice_claim() (2026_zzzd_practice_pool.sql) which proves
 * owner/admin rank in the firm AND membership of the client, and the firm's
 * plan and status are re-checked on every single charge so a downgrade or a
 * lapse stops the funding immediately.
 *
 * Pooling is OPT-IN PER CLIENT, from the Practice console. Deciding to fund
 * another workspace is a spending decision; inferring it from shared
 * membership would drain a firm's allowance into any workspace someone had
 * been added to.
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
/*
  HIGH-GROWTH-ONLY CAPABILITIES (2026-10 reprice). Each is enforced server-side
  where the thing is created, never only in the UI:
    api_write  push data IN through the API (the ingest:write scope) —
               generateApiKey refuses that scope below Practice/Command.
               Reading through the API stays on Watch Pro.
    autonomy   let Cortex message customers or move money ON ITS OWN under a
               rule (policy mode "auto" for a high-impact action) —
               savePolicy / acceptAutonomy refuse it below Command.
               Approve-first stays on every plan.
  The deeper nightly watch (15 reminders a night instead of 5) follows the
  same tiers via WATCH_REMINDERS below.
*/
/*
  connectors (2026-10): sync your own books in through a connector key (the
  Tally bridge — scope connector:write). On EVERY plan, Try included: the entry
  plan is sold on "Reads your Tally, Vyapar & Busy exports", and a workspace
  that can't get its books in has nothing for Cortex to read. It is narrower
  than api_write (no leads, smaller batches on smaller plans — lib/api-keys.ts),
  which stays the Practice+ two-way API.
*/
export type Capability = "api" | "webhooks" | "whitelabel" | "workflows" | "alert_rules" | "memory" | "api_write" | "autonomy" | "connectors";

/* Exported so scripts/test-capabilities.mjs can check it against PLAN_SEATS —
   two maps keyed by plan id that drift apart is how `premium` lost everything. */
export const PLAN_CAPABILITIES: Record<string, Capability[]> = {
  // Same as Watch: no API, no webhooks, no white-label. The entry tier is a
  // smaller version of the product, not a differently-shaped one.
  try: ["connectors"],
  watch: ["connectors"],
  watchpro: ["api", "webhooks", "workflows", "alert_rules", "memory", "connectors"],
  practice: ["api", "webhooks", "workflows", "alert_rules", "memory", "whitelabel", "api_write", "connectors"],
  command: ["api", "webhooks", "workflows", "alert_rules", "memory", "whitelabel", "api_write", "autonomy", "connectors"],
  enterprise: ["api", "webhooks", "workflows", "alert_rules", "memory", "whitelabel", "api_write", "autonomy", "connectors"],

  /*
    Retired tiers. These workspaces PAID for these capabilities under the old
    naming, and removing them here would silently downgrade a paying customer —
    the one failure this module is most concerned with. Mapped to the nearest
    current equivalent, generously where it is ambiguous.
  */
  starter: ["connectors"],
  /* api_write: every key these tiers issued could already push data, so they keep it. */
  growth: ["api", "webhooks", "workflows", "alert_rules", "api_write", "connectors"],
  business: ["api", "webhooks", "workflows", "alert_rules", "memory", "api_write", "connectors"],
  aicoo: ["api", "webhooks", "workflows", "alert_rules", "memory", "whitelabel", "api_write", "autonomy", "connectors"],

  /*
    `solo` and `premium` are NOT in PLANS or LEGACY_PLANS, but they are real:
    superadmin-actions.ts accepts both (its own LEGACY_PLANS list), and
    provisionBusinesses() hardcodes `plan: "premium"` for the portfolio
    workspaces. PLAN_SEATS already knows them; this map did not, so every
    premium workspace — including our own — would have been refused API keys,
    webhooks, workflows and alert rules the moment gating went in.

    That is the failure this whole map is shaped to avoid: refusing someone who
    paid is worse than letting someone through who did not. Mirrored from
    PLAN_SEATS, where premium sits at 20 seats alongside `business`.
  */
  solo: ["connectors"],
  premium: ["api", "webhooks", "workflows", "alert_rules", "memory", "api_write", "connectors"],
};

/** Payment reminders the nightly watch may propose per workspace per night. */
export const WATCH_REMINDERS_DEFAULT = 5;
export const WATCH_REMINDERS_HIGH = 15;
export function watchRemindersFor(plan: string | null | undefined): number {
  return planIncludes(plan, "autonomy") || planIncludes(plan, "api_write") ? WATCH_REMINDERS_HIGH : WATCH_REMINDERS_DEFAULT;
}

export function planIncludes(plan: string | null | undefined, cap: Capability): boolean {
  return (PLAN_CAPABILITIES[String(plan || "").toLowerCase()] ?? []).includes(cap);
}

/** The cheapest current plan that includes a capability, for the upgrade prompt. */
export function lowestPlanWith(cap: Capability): string {
  for (const p of PLANS) if (planIncludes(p.id, cap)) return p.name;
  return "a higher plan";
}

// Buyable top-up packs (one-time). Price in INR.
export type CreditPack = {
  id: string; label: string; credits: number; price: number; per: string;
  /**
   * Never shown to a customer, never orderable except by a super-admin, and
   * excluded from the margin floor.
   *
   * Exists so the payment chain can be exercised end to end with real money for
   * a token amount — order creation, Cashfree checkout, webhook signature,
   * event routing, idempotency claim, grant, ledger — without any of it being
   * a simulation. Everything upstream of the grant is third-party
   * infrastructure that cannot be honestly mocked.
   */
  hidden?: boolean;
};
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
  /*
    Premium reprice: a pack always costs more per credit than any plan, so a
    plan is the better deal for anyone using Cortex every month and a pack is
    for trying it or topping up.
  */
  { id: "pack_100", label: "Taster", credits: 100, price: 249, per: "₹2.49 / credit" },
  { id: "pack_500", label: "Small", credits: 500, price: 999, per: "₹2.00 / credit" },
  { id: "pack_2k", label: "Standard", credits: 2000, price: 2999, per: "₹1.50 / credit" },
  { id: "pack_10k", label: "Bulk", credits: 10000, price: 12999, per: "₹1.30 / credit" },

  /*
    LIVE PAYMENT TEST. ₹1 for 1 credit.

    Hidden from every customer surface, refused to anyone who is not a
    super-admin (see api/pay/cashfree/order), and skipped by creditFloor() so it
    cannot move the ₹0.90 margin floor. At ₹1.00/credit it would not undercut
    the floor anyway, but excluding it means a future change to this row can
    never quietly reprice the product.

    Kept in the catalogue rather than special-cased, because settleOrder() looks
    the pack up here to decide what to grant — a test that bypassed that lookup
    would not be testing the real path, which is the entire point.

    Safe to delete once the chain has been verified in production.
  */
  { id: "pack_test", label: "Live payment test", credits: 1, price: 1, per: "₹1.00 / credit", hidden: true },
];

/** The packs a customer may see and buy. */
export const PUBLIC_CREDIT_PACKS: CreditPack[] = CREDIT_PACKS.filter((p) => !p.hidden);

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

  Priced accordingly. 2026-10: repriced up again, before the first customer —
  Try ₹1,499 · Watch ₹7,999 · Watch Pro ₹19,999 · Practice ₹39,999 · Command
  ₹59,999 — with three capabilities reserved for the top tiers (two-way API,
  Autopilot, the deeper nightly watch). Competing on price against the
  incumbents is the fight this product is built to avoid.

  LEGACY IDS ARE KEPT BELOW, HIDDEN. Existing workspaces carry `plan` values of
  'starter'/'growth'/'business'/'aicoo' in the database, and their allowances in
  PLAN_CREDITS are set against the price they actually paid. Renaming or
  repricing those ids in place would silently hand a ₹1,499 customer the credit
  allowance of a ₹4,999 one — a margin hole created by a marketing change. New
  ids for new economics; old ids keep what was bought.
*/
export const PLANS: Plan[] = [
  /*
    THE ENTRY TIER — priced at the same margin as everything else, deliberately.

    ₹1,499/month, ₹14,990/year (the same ten-months-for-twelve as every other
    plan). The credit allowance is DERIVED, not chosen:

      worst monthly price = annual / 12 = 14990 / 12 = ₹1,249.17
      credits             = 1,249.17 / ₹1.02551 per credit ≈ 1,218

    ₹1.02551 is Watch's own worst-case rate, so this tier sells a credit for
    fractionally MORE than Watch does — it is a smaller plan, not a cheaper one.
    That distinction is the whole point. A trial tier that quietly undercuts the
    paid tiers on rate does not win a customer, it teaches the ones you already
    have to downgrade, and it does so invisibly because the per-credit number is
    never shown on the pricing page.

    1,218 credits is a real month of watching, and the bullets below say exactly
    what it buys rather than implying it is unlimited: the daily read is 14
    credits, a question is 19, a bank statement or GST return is 45.

    It carries an annual price rather than being monthly-only because
    /api/pay/cashfree/order computes `annual ? plan.annual : plan.monthly` — a
    zero there would create a ₹0 order. (That route is now also guarded against
    a non-positive amount, but the plan should not depend on the guard.)
  */
  { id: "try", name: "Try Cortex", monthly: 1499, annual: 14990, usdMonthly: 19, usdAnnual: 189,
    tagline: "See whether it finds anything in your numbers.",
    cta: "Try it for a month",
    features: [
      "1 business · 1 user",
      "1,218 AI credits / month",
      "Receivables & overdue payments — watched daily",
      "MSME 45-day (43B(h)) deduction exposure",
      "GST & statutory deadline warnings",
      "Reads your Tally, Vyapar & Busy exports",
      "About 27 bank statement or GST reads, or 64 questions",
      "Upgrade any time — your data stays exactly as it is",
    ] },
  { id: "watch", name: "Watch", monthly: 7999, annual: 79990, usdMonthly: 95, usdAnnual: 949,
    tagline: "Know what is going wrong, before it costs you.",
    cta: "Start watching",
    features: [
      "1 business · up to 5 users",
      "6,500 AI credits / month",
      "Receivables, payables & cash — watched daily",
      "Nightly watch drafts up to 5 payment reminders for your approval",
      "MSME 45-day (43B(h)) deduction exposure",
      "GST & statutory deadline warnings",
      "Weekly brief by email, automatically",
      "Reads your Tally, Vyapar & Busy exports",
      "Bank statement & GST return reader",
    ] },
  { id: "watchpro", name: "Watch Pro", monthly: 19999, annual: 199990, usdMonthly: 239, usdAnnual: 2389,
    tagline: "For companies where a missed number costs real money.", highlight: true,
    cta: "Choose Watch Pro",
    features: [
      "Up to 20 users",
      "17,500 AI credits / month",
      "Everything in Watch",
      "Ask Cortex anything about your own rows",
      "Alert rules you set, delivered by email",
      "Workflow automation on a schedule",
      "Read API with scoped, expiring keys + signed outbound webhooks",
      "Cortex Memory — permanent business context",
      "Image & video generation — 500 images and 20 videos a week",
    ] },
  { id: "practice", name: "Practice", monthly: 39999, annual: 399990, usdMonthly: 479, usdAnnual: 4789,
    tagline: "For CAs and advisory firms. Every client, one screen.",
    cta: "Talk to us about Practice",
    features: [
      "Up to 25 client workspaces",
      "36,000 AI credits / month, shared across your clients",
      "Practice console — every client's exposure ranked",
      "Whose 43B(h) clock is running, client by client",
      "Whose receivables moved this week",
      "Two-way API — push data in from your own systems",
      "Nightly watch drafts up to 15 reminders per workspace",
      "Your accent colour across the workspace (outbound email is Cortex-branded)",
      "Everything in Watch Pro for your firm",
      "Named onboarding for your team",
    ] },
  { id: "command", name: "Command", monthly: 59999, annual: 599990, usdMonthly: 719, usdAnnual: 7189,
    tagline: "Cortex acts, not just warns.",
    cta: "Choose Command",
    features: [
      "Up to 75 users",
      "55,000 AI credits / month",
      "Everything in Watch Pro",
      "Autopilot — let reminders and other actions run on their own, within limits you set",
      "Two-way API — push data in from your own systems",
      "Nightly watch drafts up to 15 payment reminders a night (5 on Watch)",
      "WhatsApp reminders from your own number (also on Watch)",
      "AI agents across every department",
      /*
        SCOPED TO THE WORKSPACE, deliberately.

        The chrome is branded — layout.tsx reads logo_url and the accent, and
        the sidebar renders them. But renderBrandedEmail() takes no org
        parameter, so every email the customer's own clients receive is
        MNB-branded, and email is the surface a white-label buyer actually
        judges. Until that is threaded through all ten call sites, the bullet
        says where the branding stops.
      */
      "Custom accent colour & logo in your workspace",
      "Image & video generation — 2,000 images and 60 videos a week",
      "Guided onboarding · priority support",
    ] },
  { id: "enterprise", name: "Enterprise", monthly: 0, annual: 0,
    tagline: "For groups, PE funds and family offices.",
    cta: "Talk to sales",
    features: [
      "Unlimited workspaces & users",
      "1,50,000 AI credits / month — fair use",
      "Everything in Command",
      // Neither has code behind it today — both are arranged per contract.
      "Audit export & SSO — on request",
      "Dedicated environment — on request",
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

/*
  PRICE LABELS FOR COPY. Pages and emails that say "from ₹X" read these
  instead of a typed number, so the next reprice cannot leave a stale price in
  a FAQ, an email or the terms (which is what happened to "₹799" across eight
  files). en-IN grouping: ₹1,49,990.
*/
export const inrLabel = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
export const ENTRY_PRICE_LABEL = inrLabel(PLANS.filter((p) => p.monthly > 0).reduce((m, p) => Math.min(m, p.monthly), Infinity));
export const TOP_SELF_SERVE_PRICE_LABEL = inrLabel(PLANS.filter((p) => p.monthly > 0).reduce((m, p) => Math.max(m, p.monthly), 0));
export const SMALLEST_PACK_LABEL = inrLabel(PUBLIC_CREDIT_PACKS.reduce((m, p) => Math.min(m, p.price), Infinity));

/** Every plan the system must be able to resolve, live or retired. */
export const ALL_PLANS: Plan[] = [...PLANS, ...LEGACY_PLANS];

/**
 * What paying annually actually saves, as a whole percent.
 *
 * DERIVED, because the hardcoded version was wrong. Both the pricing toggle
 * and the billing page advertised "save ~20%". Every plan is
 * ten-months-for-twelve — this file's own comment says so — and two months
 * off twelve is 2/12 = 16.7%, not 20%. The number had presumably been right
 * for some earlier price and nothing recomputed it when the prices moved.
 *
 * Rounded DOWN, so the advertised saving is never larger than the real one:
 * 16.666… becomes 16, and a customer who checks the arithmetic finds they did
 * slightly better than promised rather than slightly worse.
 *
 * Asserted against every live plan rather than read off the first one, so a
 * future tier priced on a different ratio makes this return the smallest
 * saving any customer would get instead of quietly over-promising to some.
 */
export const ANNUAL_SAVING_PCT: number = (() => {
  const ratios = PLANS
    .filter((p) => p.monthly > 0 && p.annual > 0)
    .map((p) => 1 - p.annual / 12 / p.monthly);
  if (!ratios.length) return 0;
  return Math.floor(Math.min(...ratios) * 100);
})();
