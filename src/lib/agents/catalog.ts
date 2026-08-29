// MNB Cortex — Agent platform catalog.
// Reasoning agents run today on the text model. Visual/video agents are real
// definitions that light up once an image/video generation provider is connected.

export type AgentInput = { key: string; label: string; type?: "text" | "textarea" | "number"; placeholder?: string };
export type AgentKind = "reasoning" | "image" | "video";
export type Agent = {
  id: string;
  industry: string;      // industry id
  name: string;
  desc: string;
  kind: AgentKind;
  inputs: AgentInput[];
  prompt: string;        // {{key}} placeholders, used for reasoning agents
  exports: string[];     // pdf | md | copy
};

export type Industry = { id: string; name: string; emoji: string; blurb: string };

export const INDUSTRIES: Industry[] = [
  { id: "jewellery", name: "Jewellery", emoji: "💍", blurb: "Design, merchandise & sell fine jewellery." },
  { id: "fashion", name: "Fashion & Apparel", emoji: "👗", blurb: "Collections, catalogues & lookbooks." },
  { id: "restaurant", name: "Restaurant & F&B", emoji: "🍽️", blurb: "Menus, dishes & food marketing." },
  { id: "realestate", name: "Real Estate", emoji: "🏠", blurb: "Listings, brochures & buyer outreach." },
  { id: "retail", name: "Retail & D2C", emoji: "🛒", blurb: "Product listings, bundles & campaigns." },
  { id: "beauty", name: "Beauty & Salon", emoji: "💅", blurb: "Services, packages & promos." },
  { id: "automotive", name: "Automotive", emoji: "🚗", blurb: "Vehicle listings, finance & service." },
  { id: "manufacturing", name: "Manufacturing", emoji: "🏭", blurb: "RFQs, specs & SOPs." },
  { id: "healthcare", name: "Clinic & Healthcare", emoji: "🩺", blurb: "Patient comms & practice marketing." },
  { id: "education", name: "Education & Coaching", emoji: "🎓", blurb: "Courses, lessons & assessments." },
  { id: "fitness", name: "Fitness & Gym", emoji: "💪", blurb: "Plans, classes & transformations." },
  { id: "travel", name: "Travel & Hospitality", emoji: "✈️", blurb: "Itineraries, packages & reviews." },
  { id: "logistics", name: "Logistics & Transport", emoji: "🚚", blurb: "Quotes, SLAs & notices." },
  { id: "agri", name: "Agriculture", emoji: "🌾", blurb: "Advisory, listings & buyer outreach." },
  { id: "services", name: "Services & Agencies", emoji: "💼", blurb: "Proposals, projects & client updates." },
  { id: "professional-services", name: "Professional Services (CA, legal, consulting)", emoji: "⚖️", blurb: "Engagements, advisories & billing." },
  { id: "distribution", name: "Distribution & Wholesale", emoji: "📦", blurb: "Dealer networks, credit & stock." },
  { id: "pharmacy", name: "Pharmacy & Wellness", emoji: "💊", blurb: "OTC info, store promos & comms." },
  { id: "electronics", name: "Electronics & Appliances", emoji: "📱", blurb: "Listings, specs & comparisons." },
  { id: "furniture", name: "Furniture & Decor", emoji: "🛋️", blurb: "Catalogues, room styling & offers." },
  { id: "grocery", name: "Grocery & Kirana", emoji: "🥫", blurb: "Offers, combos & WhatsApp orders." },
  { id: "events", name: "Events & Wedding", emoji: "🎉", blurb: "Packages, proposals & planning." },
  { id: "photography", name: "Photography & Studio", emoji: "📷", blurb: "Packages, galleries & enquiries." },
  { id: "petcare", name: "Pet Care", emoji: "🐾", blurb: "Services, products & reminders." },
  { id: "interior", name: "Interior Design", emoji: "🎨", blurb: "Moodboards, proposals & pitches." },
  { id: "printing", name: "Printing & Signage", emoji: "🖨️", blurb: "Quotes, product lists & artwork briefs." },
  { id: "footwear", name: "Footwear", emoji: "👟", blurb: "Listings, sizing & campaigns." },
  { id: "generic", name: "Any Business", emoji: "✨", blurb: "Works for every business type." },
];

const A = (industry: string, id: string, name: string, desc: string, inputs: AgentInput[], prompt: string, kind: AgentKind = "reasoning"): Agent =>
  ({ industry, id: `${industry}.${id}`, name, desc, kind, inputs, prompt, exports: kind === "reasoning" ? ["pdf", "md", "copy"] : [] });

// Reasoning agents shared by every industry, tuned with the industry name.
function commonAgents(ind: Industry): Agent[] {
  const N = ind.name;
  return [
    A(ind.id, "catalogue", "Product Catalogue AI", `Write polished catalogue listings for your ${N} products.`,
      [{ key: "product", label: "Product / item", type: "text" }, { key: "details", label: "Key details, materials, specs", type: "textarea" }],
      `You are a senior catalogue copywriter for a ${N} business. Write a listing for the product below.\nReturn: a punchy title (max 12 words), a 60-word description, 5 bullet specs, and 6 SEO keywords.\nProduct: {{product}}\nDetails: {{details}}`),
    A(ind.id, "adscript", "UGC Ad Script", `Write a 30-second UGC ad script for ${N}.`,
      [{ key: "product", label: "What are we promoting?", type: "text" }, { key: "audience", label: "Target audience", type: "text" }],
      `Write a 30-second UGC-style video ad script for a ${N} business promoting {{product}} to {{audience}}. Structure: Hook (3s), Problem, Product reveal, 2 benefits, Social proof line, CTA. Keep it casual, first-person, mobile-native. Add on-screen text cues.`),
    A(ind.id, "email", "Email Campaign Writer", `Draft a marketing email for your ${N} audience.`,
      [{ key: "goal", label: "Campaign goal", type: "text" }, { key: "audience", label: "Audience / segment", type: "text" }, { key: "offer", label: "Offer / news (optional)", type: "text" }],
      `Write a marketing email for a ${N} business. Goal: {{goal}}. Audience: {{audience}}. Offer/news: {{offer}}. Return: 3 subject-line options, preview text, and a 150-word body with a clear CTA. Warm, credible, no spammy hype.`),
    A(ind.id, "social", "Social Content Calendar", `A 7-day content calendar for ${N}.`,
      [{ key: "focus", label: "This week's focus", type: "text" }, { key: "platforms", label: "Platforms", type: "text", placeholder: "Instagram, WhatsApp" }],
      `Create a 7-day social media content calendar for a ${N} business. Focus: {{focus}}. Platforms: {{platforms}}. For each day give: platform, post type, hook, caption (40 words), and 5 hashtags.`),
    A(ind.id, "faq", "FAQ Builder", `Generate a customer FAQ for your ${N} business.`,
      [{ key: "topic", label: "Topic / area", type: "text", placeholder: "returns, sizing, delivery" }],
      `Write a customer FAQ of 10 clear question-and-answer pairs for a ${N} business about: {{topic}}. Answers should be concise, friendly and accurate.`),
    A(ind.id, "reviews", "Review Responder", `Draft on-brand replies to customer reviews.`,
      [{ key: "reviews", label: "Paste reviews (one per line)", type: "textarea" }],
      `You handle customer relations for a ${N} business. Write a professional, empathetic public reply to each review below. Thank genuine praise, address concerns without being defensive, and offer a next step where needed.\nReviews:\n{{reviews}}`),
  ];
}

// Industry-specific reasoning agents.
const SPECIAL: Record<string, Agent[]> = {
  /*
    These eight industries shipped with only the generic agent set. A kirana
    store and a signage printer were being offered the same six tools with their
    industry's name substituted in, which is the "generic dashboard" the product
    positions itself against. The agents below are the ones each trade actually
    runs on — size curves for footwear, substrate specs for printing, recall
    lists for a clinic.
  */
  retail: [
    A("retail", "marketplace", "Marketplace Listing Optimiser", "Rewrite a listing to rank and convert on Amazon / Flipkart / Meesho.",
      [{ key: "product", label: "Product + key specs", type: "textarea" }, { key: "platform", label: "Platform(s)", type: "text", placeholder: "Amazon, Flipkart, Meesho" }, { key: "competitors", label: "What competitors charge (optional)", type: "text" }],
      `You are an Indian marketplace listing specialist. Rewrite the product below for {{platform}}. Return: a title within each platform's character limit, 5 bullet points leading with benefit then spec, a 150-word description, backend search terms, and the 8 highest-intent keywords. Flag any claim that would breach marketplace policy. Note where the listing must differ per platform. Product: {{product}}. Competitor pricing: {{competitors}}.`),
    A("retail", "returns", "Return-Rate Reducer", "Find why items come back and what to change.",
      [{ key: "returns", label: "Returns: SKU, reason, count (one per line)", type: "textarea" }, { key: "margin", label: "Average margin % ", type: "text" }],
      `Act as a D2C operations analyst. Group the returns below by root cause (size/fit, quality, wrong expectation from the listing, damage in transit, buyer's remorse). For each cause give the SKUs affected, the cost of those returns at {{margin}} margin including reverse logistics, and one specific fix — a listing change, a size chart, packaging, or a QC check. Rank the fixes by rupees recovered per unit of effort. Returns:\n{{returns}}`),
  ],
  healthcare: [
    A("healthcare", "recall", "Patient Recall Campaign", "Bring due patients back for follow-ups and check-ups.",
      [{ key: "cohort", label: "Who is due (treatment type + how overdue)", type: "textarea" }, { key: "channel", label: "Channels", type: "text", placeholder: "WhatsApp, SMS, call" }],
      `Write a patient recall campaign for an Indian clinic. This is ADMINISTRATIVE outreach only — never give clinical advice, never suggest a diagnosis, and never imply urgency about a specific person's condition. Cohort: {{cohort}}. Channels: {{channel}}. Provide: a respectful WhatsApp message under 60 words, an SMS under 160 characters, a short call script with two objection responses, the best send window, and a follow-up cadence. Include an opt-out line in every message. Keep language neutral and non-alarming.`),
    A("healthcare", "packages", "Treatment Package Pricing", "Structure and price service packages for a practice.",
      [{ key: "services", label: "Services + cost & duration each", type: "textarea" }, { key: "goal", label: "Goal", type: "text", placeholder: "raise utilisation, smooth revenue" }],
      `Act as a practice-management consultant for an Indian clinic. This is a BUSINESS pricing exercise, not clinical guidance. From the services below, build 3 package tiers. For each: what is included, chair/room time required, cost to deliver, price, gross margin %, and the patient it suits. Goal: {{goal}}. Add the utilisation needed to break even, and flag any package that would be loss-making at under 60% utilisation. Services:\n{{services}}`),
  ],
  grocery: [
    A("grocery", "combo", "Combo & Basket Builder", "Design combos that lift basket size without cutting margin.",
      [{ key: "items", label: "Items: name, MRP, your cost, monthly units", type: "textarea" }, { key: "occasion", label: "Occasion / theme (optional)", type: "text" }],
      `You are a kirana merchandising planner. From the items below, design 5 combos that raise basket value. For each: contents, individual total, combo price, blended margin %, and why the pairing works (staple + impulse, festival, replenishment cycle). Never let a combo drop below 8% blended margin — say so if one would. Add a WhatsApp broadcast message in Hindi-English for the best two. Occasion: {{occasion}}. Items:\n{{items}}`),
    A("grocery", "shelf", "Shelf & Fast-Mover Plan", "Put the right stock where hands reach first.",
      [{ key: "sales", label: "Items with monthly units + margin", type: "textarea" }, { key: "space", label: "Shelf/space constraints", type: "text" }],
      `Act as a retail shelf-space planner for an Indian grocery store. Rank the items below by units and by margin, then classify each: fast-mover high-margin (eye level), fast-mover low-margin (traffic driver, keep accessible), slow-mover high-margin (impulse zone near billing), slow-mover low-margin (delist candidate). Give a specific placement plan for the space described, the items to stop stocking, and the working capital that frees. Space: {{space}}. Sales:\n{{sales}}`),
  ],
  furniture: [
    A("furniture", "roomset", "Room-Set Merchandising", "Sell the room, not the single piece.",
      [{ key: "pieces", label: "Pieces available + prices", type: "textarea" }, { key: "style", label: "Style / target home", type: "text" }],
      `You are a furniture visual merchandiser. Build 4 room sets from the pieces below for a {{style}} home. For each: the pieces, total ticket, a suggested bundle price, the margin impact, a 40-word showroom story, and the one add-on most likely to be accepted at the till. Note which sets work in a compact Indian flat versus a larger home. Pieces:\n{{pieces}}`),
    A("furniture", "customquote", "Custom Order Quote Builder", "Quote bespoke work without losing money on it.",
      [{ key: "brief", label: "Customer brief + dimensions", type: "textarea" }, { key: "rates", label: "Material & labour rates", type: "text" }],
      `Act as a bespoke furniture estimator. From the brief below produce: a materials list with quantities and wastage allowance, labour hours by skill, finishing and hardware, delivery and installation, subtotal, contingency for custom work, GST, and the final quote with margin %. State the lead time and list the three things most likely to cause a cost overrun on this specific job. Brief: {{brief}}. Rates: {{rates}}.`),
  ],
  printing: [
    A("printing", "jobquote", "Print Job Estimator", "Quote a print or signage job accurately.",
      [{ key: "job", label: "Job: size, quantity, substrate, finish", type: "textarea" }, { key: "rates", label: "Your rates (per sq ft / per sheet, ink, labour)", type: "text" }],
      `Act as a print and signage estimator for an Indian print shop. For the job below compute: material area including bleed and wastage, substrate cost, ink/consumable cost, machine time, finishing (lamination, eyelets, mounting, cutting), labour, delivery, and installation if applicable. Show the per-unit cost, the quantity break points where per-unit cost drops, GST, and a quote with margin %. Flag anything in the spec that will slow the job or risk a reprint. Job: {{job}}. Rates: {{rates}}.`),
    A("printing", "spec", "Substrate & Finish Advisor", "Pick the right material for where the sign will live.",
      [{ key: "use", label: "Where it will be used + how long", type: "textarea" }, { key: "budget", label: "Budget band", type: "text" }],
      `You are a signage production advisor. For the application below, recommend 3 substrate + finish combinations at different price points within {{budget}}. For each: material, thickness/GSM, print method, lamination or coating, expected outdoor life in Indian sun and monsoon, mounting method, and relative cost. State clearly which you would not use and why. Application: {{use}}.`),
  ],
  footwear: [
    A("footwear", "sizecurve", "Size Curve Buying Plan", "Buy the sizes that actually sell.",
      [{ key: "history", label: "Past sales by size (one per line)", type: "textarea" }, { key: "order", label: "Total units to buy + style", type: "text" }],
      `Act as a footwear buying planner for the Indian market. From the size-wise history below, compute the size curve as a percentage of sales, apply it to an order of {{order}}, and return a size-wise buy quantity. Flag sizes over-bought last season versus their sell-through, the sizes that stock out first and cost you full-price sales, and the broken-size risk if the curve is followed too literally. Give the recommended buy plus a small buffer on the two fastest sizes. History:\n{{history}}`),
    A("footwear", "seasonplan", "Season & Markdown Plan", "Clear stock on a schedule instead of panicking.",
      [{ key: "stock", label: "Styles: units, cost, current price, weeks on floor", type: "textarea" }, { key: "season", label: "Season / end date", type: "text" }],
      `You are a footwear merchandise planner. For the styles below, compute weeks of cover and sell-through rate. Build a markdown ladder to clear seasonal stock by {{season}}: when to take the first markdown, the depth, and the second and final markdown. Show the margin given up at each step versus the carrying cost of holding the stock. Name the styles to mark down now and the ones to hold at full price. Stock:\n{{stock}}`),
  ],
  photography: [
    A("photography", "packages", "Shoot Package & Pricing", "Price shoots by what they actually cost you.",
      [{ key: "shoot", label: "Shoot type, hours, deliverables", type: "textarea" }, { key: "costs", label: "Your costs: gear, assistant, editing hours, travel", type: "text" }],
      `Act as a photography business consultant in India. For the shoot below compute the true cost: shoot hours, editing hours at a realistic rate per image, assistant, gear depreciation, travel, and storage. Build 3 packages (essential / standard / premium) with deliverable counts, turnaround, price and margin %. State the effective hourly rate for each and flag any package where editing time makes it a loss. Shoot: {{shoot}}. Costs: {{costs}}.`),
    A("photography", "shotlist", "Shot List & Call Sheet", "Turn up knowing exactly what you are shooting.",
      [{ key: "brief", label: "Client brief / event", type: "textarea" }, { key: "hours", label: "Time available + team", type: "text" }],
      `Create a shot list and call sheet for the shoot below. Shot list: grouped by scene or segment, each with framing, lens suggestion, lighting note, and whether it is a must-have or nice-to-have. Call sheet: timings across {{hours}}, crew roles, kit checklist, location notes, and buffer time. Add the 5 shots clients most often ask for afterwards and regret not having. Brief: {{brief}}.`),
  ],
  petcare: [
    A("petcare", "plans", "Service Plan & Subscription Builder", "Turn one-off visits into recurring revenue.",
      [{ key: "services", label: "Services + price & duration", type: "textarea" }, { key: "goal", label: "Goal", type: "text", placeholder: "steady monthly revenue, fill weekdays" }],
      `Act as a pet-care business consultant. From the services below, design 3 subscription plans (monthly grooming, wellness, or day-care bundles). For each: what is included, frequency, price, the discount versus paying per visit, margin %, and the break-even number of subscribers. Goal: {{goal}}. Add the cancellation risk for each plan and one way to reduce it. Services:\n{{services}}`),
    A("petcare", "retention", "Pet Parent Retention Campaign", "Bring pet parents back on the right cycle.",
      [{ key: "lapsed", label: "Lapsed customers: pet, service, last visit", type: "textarea" }, { key: "offer", label: "Offer you can make", type: "text" }],
      `Write a retention campaign for an Indian pet-care business. For the lapsed customers below, segment by how overdue they are against the natural cycle for their service (grooming roughly 4-8 weeks, wellness checks quarterly). For each segment: a warm WhatsApp message under 50 words using the pet's name, the best day and time to send, and whether to lead with the offer or the pet's care schedule. Offer available: {{offer}}. Customers:\n{{lapsed}}`),
  ],
  /*
    Distribution & Wholesale and Professional Services both had a full playbook
    in lib/industries.ts and no way to select them: neither id existed in this
    list, which is what Settings renders. The distribution playbook — dealer
    credit exposure, razor-thin SKU margins, cash trapped in the working-capital
    cycle — was written, maintained, and unreachable by every customer.

    "services" was separately doing double duty: it was LABELLED "Professional
    Services" here while resolving to the Services & Agencies playbook, so a CA
    or law firm picked their industry and got agency content about pitching
    proposals. The two are now distinct, and the existing "services" id is
    untouched so saved workspaces keep working.
  */
  distribution: [
    A("distribution", "dealercredit", "Dealer Credit Review", "Assess credit exposure across your dealer network.",
      [{ key: "dealers", label: "Dealers with outstanding + days (one per line)", type: "textarea", placeholder: "Sharma Traders, 8,40,000, 62 days" }, { key: "terms", label: "Your standard credit terms", type: "text", placeholder: "30 days, 2% early-pay" }],
      `You are a credit controller for an Indian distribution business. For each dealer below, assess credit risk using outstanding amount and ageing against the stated terms. Output a table: dealer, outstanding (INR), days, risk band (low/watch/high), and a specific action. Then give: total exposure, the concentration risk if any single dealer is more than 15% of it, and a prioritised collection sequence for this week. Terms: {{terms}}. Dealers:\n{{dealers}}`),
    A("distribution", "skumargin", "SKU Margin Triage", "Find which of your many SKUs actually make money.",
      [{ key: "skus", label: "SKUs: name, buy price, sell price, monthly units", type: "textarea" }, { key: "overheads", label: "Monthly overheads to cover (INR)", type: "text" }],
      `Act as a distribution margin analyst. For each SKU below compute gross margin per unit, margin %, and monthly gross profit. Rank them, identify the SKUs that contribute under 5% of profit while consuming working capital, and name any sold at or below cost. Recommend which to delist, which to renegotiate with the supplier, and which to push. Cover overheads of {{overheads}} and state the break-even volume. SKUs:\n{{skus}}`),
    A("distribution", "schemeplan", "Dealer Scheme Designer", "Design a trade scheme that moves stock without giving away margin.",
      [{ key: "goal", label: "Goal", type: "text", placeholder: "clear slow-moving stock, grow a region" }, { key: "margin", label: "Current margin % and stock at risk", type: "text" }],
      `Design a dealer/trade scheme for an Indian wholesale distributor. Goal: {{goal}}. Margin position: {{margin}}. Give: the scheme mechanic (slab, QPS, free-goods or credit-period based), exact slabs with payout %, the margin impact per slab, the volume needed to stay profit-neutral, a dealer-facing announcement in plain Hindi-English, and the single biggest way dealers might game it.`),
  ],
  "professional-services": [
    A("professional-services", "engagement", "Engagement Letter Draft", "Draft a scoped engagement letter that resists scope creep.",
      [{ key: "client", label: "Client & work", type: "text" }, { key: "scope", label: "Scope, deliverables & timeline", type: "textarea" }, { key: "fee", label: "Fee basis", type: "text", placeholder: "retainer, hourly, fixed" }],
      `Draft a professional-services engagement letter for an Indian firm (CA / legal / consulting). Client and work: {{client}}. Scope: {{scope}}. Fee basis: {{fee}}. Include: scope in and OUT of scope stated explicitly, deliverables with dates, fee and billing schedule, a change-control clause for out-of-scope requests, client responsibilities, and confidentiality. Flag anything in the scope that is vague enough to invite scope creep.`),
    A("professional-services", "realisation", "Realisation & Utilisation Review", "Find the gap between hours worked and fees billed.",
      [{ key: "matters", label: "Matters: name, hours, billed (one per line)", type: "textarea" }, { key: "rate", label: "Standard charge-out rate (INR/hr)", type: "text" }],
      `Act as a practice-management analyst for a professional-services firm. For each matter below compute: notional value at the standard rate, actual billed, realisation %, and effective rate per hour. Identify the matters bleeding value, quantify the total write-off, and name the likely cause for each (under-scoping, scope creep, junior time on senior work, or unbilled admin). Recommend three specific changes. Standard rate: {{rate}}. Matters:\n{{matters}}`),
    A("professional-services", "advisory", "Client Advisory Note", "Turn a regulatory or financial change into a client-ready note.",
      [{ key: "change", label: "The change / update", type: "textarea" }, { key: "segment", label: "Which clients it affects", type: "text" }],
      `Write a client advisory note from an Indian professional-services firm. Change: {{change}}. Affected clients: {{segment}}. Structure: what changed, from when, who it affects, what it means in rupee terms with a worked example, what the client must do and by when, and how the firm can help. Plain language, no jargon, under 400 words. End with a one-line confidence note if anything awaits clarification.`),
  ],
  jewellery: [
    A("jewellery", "merch", "Merchandising Brief (sketch → spec)", "Interpret a sketch into a full design & manufacturing brief.",
      [{ key: "sketch", label: "Describe / annotate the sketch", type: "textarea", placeholder: "Solitaire ring, oval centre, halo, tapered band…" }, { key: "constraints", label: "Constraints (metal, budget, size)", type: "text" }],
      `You are a master jewellery merchandiser. From the sketch description, produce a design brief with: (1) design interpretation, (2) recommended dimensions in mm, (3) metal choice and estimated gross weight, (4) stone-plot layout — centre + accents with counts, sizes (mm/ct) and setting type, (5) total carat weight, (6) a manufacturing spec sheet (findings, finish, tolerances), (7) an estimated cost band. Sketch: {{sketch}}. Constraints: {{constraints}}.`),
    A("jewellery", "stoneplot", "Stone Plot Layout", "Generate a symmetric stone plot for a piece.",
      [{ key: "piece", label: "Piece type", type: "text", placeholder: "necklace, ring, earrings" }, { key: "center", label: "Centre stone", type: "text" }, { key: "accents", label: "Accent stones", type: "text" }],
      `Create a stone plot layout for a jewellery piece. Piece: {{piece}}. Centre stone: {{center}}. Accent stones: {{accents}}. Output: numbered plot positions, per-stone size (mm & ct) and setting, total stone count, total carat weight, and a symmetry/balance check with any adjustment notes.`),
    A("jewellery", "collection", "Collection Planner", "Plan a cohesive jewellery collection.",
      [{ key: "theme", label: "Theme / occasion", type: "text" }, { key: "tier", label: "Price tier", type: "text", placeholder: "bridal, daily-wear, luxury" }],
      `Plan a jewellery collection. Theme: {{theme}}. Price tier: {{tier}}. Output 8 SKUs, each with: name, piece type, metal & stones, price band (INR), and target buyer. Add a one-line merchandising story for the collection.`),
    A("jewellery", "valuation", "Piece Valuation Brief", "Break down the cost & price of a piece.",
      [{ key: "piece", label: "Piece + materials", type: "textarea" }, { key: "rates", label: "Metal & stone rates", type: "text" }],
      `Act as a jewellery costing analyst. For the piece and materials given, produce an itemised cost breakdown (metal, stones, making charges, wastage, GST at 3%), a suggested retail price with margin, and a customer-facing value summary. Piece: {{piece}}. Rates: {{rates}}.`),
  ],
  restaurant: [
    A("restaurant", "menu", "Menu Writer", "Write an appetising, structured menu.",
      [{ key: "cuisine", label: "Cuisine / concept", type: "text" }, { key: "items", label: "Dishes (one per line)", type: "textarea" }],
      `Write a restaurant menu for a {{cuisine}} concept. For each dish below, give an appetising 15-word description and a suggested price band. Group into sensible sections. Dishes:\n{{items}}`),
    A("restaurant", "promo", "Festival Promo Plan", "Plan a festival / weekend promotion.",
      [{ key: "occasion", label: "Occasion", type: "text" }, { key: "goal", label: "Goal (footfall, AOV…)", type: "text" }],
      `Plan a restaurant promotion for {{occasion}} with the goal: {{goal}}. Include: offer mechanic, combo ideas, pricing, 3 social captions, a WhatsApp broadcast message, and a simple success metric.`),
  ],
  realestate: [
    A("realestate", "listing", "Listing Description Writer", "Turn property facts into a sales-ready listing.",
      [{ key: "property", label: "Property facts", type: "textarea", placeholder: "3BHK, 1450 sqft, sea-facing, Bandra…" }, { key: "audience", label: "Target buyer", type: "text" }],
      `Write a compelling real-estate listing from these facts: {{property}}. Target buyer: {{audience}}. Return: a headline, a 120-word description, a bullet list of highlights, and a short WhatsApp-ready teaser.`),
    A("realestate", "persona", "Buyer Persona & Pitch", "Profile the ideal buyer and how to pitch.",
      [{ key: "property", label: "Property + price", type: "textarea" }],
      `For this property, define the 2 most likely buyer personas (demographics, motivation, objections) and a tailored one-paragraph pitch for each. Property: {{property}}.`),
  ],
  fashion: [
    A("fashion", "lookbook", "Lookbook Copy", "Write evocative lookbook / collection copy.",
      [{ key: "collection", label: "Collection theme", type: "text" }, { key: "pieces", label: "Key pieces", type: "textarea" }],
      `Write lookbook copy for a fashion collection themed "{{collection}}". Give an opening manifesto (60 words) and a one-line caption for each piece:\n{{pieces}}`),
    A("fashion", "sizeguide", "Size & Fit Guide", "Draft a clear size and fit guide.",
      [{ key: "garment", label: "Garment type", type: "text" }, { key: "sizes", label: "Available sizes/measurements", type: "textarea" }],
      `Write a friendly size & fit guide for {{garment}}. Include how to measure, a size table interpretation, and fit tips. Sizes/measurements: {{sizes}}.`),
  ],
  manufacturing: [
    A("manufacturing", "rfq", "RFQ Responder", "Draft a professional quote response to an RFQ.",
      [{ key: "rfq", label: "RFQ details", type: "textarea" }, { key: "terms", label: "Your terms (MOQ, lead time)", type: "text" }],
      `Draft a professional response to this RFQ, including scope understanding, a line-item quote structure, MOQ, lead time, payment terms and a courteous close. RFQ: {{rfq}}. Terms: {{terms}}.`),
    A("manufacturing", "sop", "SOP Generator", "Turn a process into a clean SOP.",
      [{ key: "process", label: "Process to document", type: "textarea" }],
      `Write a clear Standard Operating Procedure for: {{process}}. Include purpose, scope, materials/tools, numbered steps, safety notes, and quality checks.`),
  ],
  education: [
    A("education", "course", "Course Outline Builder", "Design a structured course outline.",
      [{ key: "topic", label: "Course topic", type: "text" }, { key: "level", label: "Level & duration", type: "text" }],
      `Design a course outline for "{{topic}}" ({{level}}). Give modules, per-module learning outcomes, key activities, and an assessment plan.`),
    A("education", "quiz", "Quiz Generator", "Generate a quiz with an answer key.",
      [{ key: "topic", label: "Topic", type: "text" }, { key: "count", label: "Number of questions", type: "number" }],
      `Create a {{count}}-question quiz on "{{topic}}" with a mix of MCQ and short-answer. Provide an answer key at the end.`),
  ],
  beauty: [
    A("beauty", "menu", "Service Menu Builder", "Write a salon/spa service menu.",
      [{ key: "services", label: "Services (one per line)", type: "textarea" }],
      `Write an elegant salon/spa service menu. For each service give a 12-word description, duration and price band. Services:\n{{services}}`),
  ],
  automotive: [
    A("automotive", "listing", "Vehicle Listing Writer", "Write a used/new vehicle listing.",
      [{ key: "vehicle", label: "Vehicle details", type: "textarea" }],
      `Write a persuasive vehicle listing from: {{vehicle}}. Include headline, condition highlights, key specs, and a finance-friendly CTA.`),
  ],
  fitness: [
    A("fitness", "plan", "Membership Plan Copy", "Package and price membership plans.",
      [{ key: "plans", label: "Plans / tiers", type: "textarea" }],
      `Write compelling copy for these gym membership plans, with a benefit list and a nudge to the recommended tier:\n{{plans}}`),
  ],
  travel: [
    A("travel", "itinerary", "Itinerary Builder", "Draft a day-by-day travel itinerary.",
      [{ key: "trip", label: "Destination, days, style", type: "textarea" }],
      `Build a day-by-day travel itinerary from: {{trip}}. Include timings, highlights, meal ideas and a budget band per day.`),
  ],
  logistics: [
    A("logistics", "quote", "Freight Quote Writer", "Draft a freight/quote response.",
      [{ key: "shipment", label: "Shipment details", type: "textarea" }],
      `Draft a freight quote from these details: {{shipment}}. Include route, mode, transit time, cost structure, and terms.`),
  ],
  agri: [
    A("agri", "listing", "Produce Listing & Outreach", "List produce and draft buyer outreach.",
      [{ key: "produce", label: "Produce, grade, quantity", type: "textarea" }],
      `Create a produce listing and a short buyer-outreach message from: {{produce}}. Include grade, quantity, packaging, and a price ask.`),
  ],
  services: [
    A("services", "proposal", "Proposal Writer", "Draft a client proposal.",
      [{ key: "brief", label: "Client brief / scope", type: "textarea" }, { key: "price", label: "Pricing approach", type: "text" }],
      `Write a professional client proposal from this brief: {{brief}}. Pricing: {{price}}. Include understanding, scope, deliverables, timeline, pricing and terms.`),
  ],
  electronics: [
    A("electronics", "compare", "Spec Comparison", "Compare two products for a customer.",
      [{ key: "a", label: "Product A + specs", type: "textarea" }, { key: "b", label: "Product B + specs", type: "textarea" }],
      `Compare these two electronics products for a shopper. Give a specs table, who each is best for, and a clear recommendation. A: {{a}} | B: {{b}}.`),
    A("electronics", "warranty", "Warranty & Care Explainer", "Explain warranty and care in plain language.",
      [{ key: "product", label: "Product + warranty terms", type: "textarea" }],
      `Write a plain-language warranty and care guide for: {{product}}. Cover what's covered, what isn't, care tips, and how to claim.`),
  ],
  events: [
    A("events", "plan", "Event Plan & Package", "Draft an event plan and a client package.",
      [{ key: "event", label: "Event type, guests, budget", type: "textarea" }],
      `Plan an event from: {{event}}. Output a timeline, vendor checklist, a 3-tier package offer (with inclusions and price bands), and a short client-facing pitch.`),
  ],
  interior: [
    A("interior", "moodboard", "Moodboard Brief", "Turn a client brief into a design direction.",
      [{ key: "space", label: "Space, style, budget", type: "textarea" }],
      `Create an interior design direction from: {{space}}. Output a concept statement, palette (colours + materials), key furniture/decor list, and a room-by-room plan.`),
  ],
  pharmacy: [
    A("pharmacy", "promo", "Store Promo & Offer", "Draft a pharmacy/wellness store promotion.",
      [{ key: "focus", label: "Offer focus (health check, wellness range…)", type: "text" }],
      `Write a compliant pharmacy/wellness store promotion for: {{focus}}. Include a headline, offer, 3 social captions and a WhatsApp message. Do NOT give medical advice or make health claims — keep it about the store, service and products only.`),
  ],
};

// Visual & video agents — real definitions that activate when a generation provider is connected.
function visualAgents(ind: Industry): Agent[] {
  const v = (id: string, name: string, desc: string, inputs: AgentInput[], kind: AgentKind) => A(ind.id, id, name, desc, inputs, "", kind);
  const base: Agent[] = [
    v("mockup3d", "3D Mockup Studio", "Turn a sketch or photo into a 3D product mockup.", [{ key: "brief", label: "Describe the product / upload sketch", type: "textarea" }], "image"),
    v("materialswap", "Material Swap", "Swap metals, colours or materials in a product image.", [{ key: "brief", label: "What to swap", type: "text" }], "image"),
    v("enhance", "Sharpen & Upscale", "Deblur and upscale a phone-shot product photo.", [{ key: "brief", label: "Notes (optional)", type: "text" }], "image"),
    v("cleanup", "Catalogue Photo Cleanup", "Auto background removal & clean catalogue shots.", [{ key: "brief", label: "Background style", type: "text" }], "image"),
    v("ugcvideo", "UGC Video Maker", "Turn a product into a short UGC video ad.", [{ key: "brief", label: "Ad concept / script", type: "textarea" }], "video"),
  ];
  // Visual-heavy industries get the full set; others get photo cleanup only.
  const heavy = ["jewellery", "fashion", "restaurant", "realestate", "retail", "beauty", "automotive", "electronics", "furniture", "footwear", "events", "interior", "photography", "grocery"];
  return heavy.includes(ind.id) ? base : base.filter((a) => a.id.endsWith(".cleanup") || a.id.endsWith(".enhance"));
}

/* ============================ THE 7-DEPARTMENT WORKFORCE ============================ */
// A complete AI org chart: every business runs on these seven functions. Each agent is
// industry-agnostic and runs today, grounded in your Cortex Memory (second brain).

export type Department = { id: string; name: string; emoji: string; blurb: string };
export const DEPARTMENTS: Department[] = [
  { id: "d_sales", name: "Sales", emoji: "📈", blurb: "Find and win new customers." },
  { id: "d_deals", name: "Deals", emoji: "🤝", blurb: "Move opportunities to closed-won." },
  { id: "d_marketing", name: "Marketing", emoji: "📣", blurb: "Create demand across every channel." },
  { id: "d_operations", name: "Operations", emoji: "⚙️", blurb: "Deliver and run the business." },
  { id: "d_intel", name: "Intelligence", emoji: "🔭", blurb: "Know your market and rivals." },
  { id: "d_customer", name: "Customer", emoji: "💬", blurb: "Support and retain customers." },
  { id: "d_back", name: "Back Office", emoji: "🧾", blurb: "Finance, admin and compliance." },
];

// Compact spec: [id, name, desc, inputs, prompt]
type DSpec = [string, string, string, AgentInput[], string];
const t = (key: string, label: string, type: AgentInput["type"] = "text"): AgentInput => ({ key, label, type });

const DEPT_SPECS: Record<string, DSpec[]> = {
  d_sales: [
    ["outbound", "Outbound Writer", "Personalised cold email from live signals.", [t("prospect", "Prospect / company + signal", "textarea"), t("offer", "What you offer")], "Write a concise, personalised cold outbound email to {{prospect}} offering {{offer}}. Open with a specific signal, one clear value line, a soft CTA. No fluff. Give 2 subject lines."],
    ["leadsource", "Lead Sourcing Brief", "Where and how to find your next 50 leads.", [t("icp", "Ideal customer", "textarea")], "For this ICP: {{icp}} — list where to find them (channels, communities, search filters), 5 example search queries, and a qualification checklist."],
    ["coldcall", "Cold-Call Script", "A natural call script with branches.", [t("offer", "Offer + audience", "textarea")], "Write a cold-call script for {{offer}}: opener, permission line, value, 3 discovery questions, objection branches, and a booking close."],
    ["linkedin", "LinkedIn DM Sequence", "A 4-touch connection + DM sequence.", [t("target", "Who you're targeting"), t("offer", "Offer")], "Write a 4-message LinkedIn sequence to {{target}} for {{offer}}: connection note + 3 follow-ups, friendly, no hard pitch until message 3."],
    ["icp", "ICP Definition", "Sharpen your ideal customer profile.", [t("business", "Your business / product", "textarea")], "From this business: {{business}} — define 2 sharp ICPs (firmographics, pains, triggers, where they hang out) and disqualifiers."],
    ["objection", "Objection Handling", "Rebuttals for your top objections.", [t("objections", "Objections you hear", "textarea")], "For these sales objections: {{objections}} — give an empathetic reframe and a concise rebuttal for each, plus one proof point to use."],
    ["followup", "Follow-up Sequence", "A polite multi-touch follow-up.", [t("context", "Deal context", "textarea")], "Write a 4-step follow-up sequence for this stalled deal: {{context}}. Vary the angle each time; last one is a graceful break-up."],
    ["discovery", "Discovery Questions", "Great questions for a discovery call.", [t("offer", "What you sell")], "Give 12 sharp discovery-call questions for selling {{offer}}, grouped by: current state, pain, impact, decision process."],
    ["pitch", "Elevator Pitch", "A crisp 30-second pitch.", [t("business", "Business + who it's for", "textarea")], "Write 3 versions of a 30-second elevator pitch for {{business}} — one punchy, one outcome-led, one story-led."],
    ["referral", "Referral Ask", "A message that earns referrals.", [t("context", "Client + result", "textarea")], "Write a warm referral-ask message given this happy-client context: {{context}}. Make it easy to say yes and to forward."],
  ],
  d_deals: [
    ["proposal", "Proposal Writer", "A branded proposal from your discovery.", [t("brief", "Scope + discovery notes", "textarea"), t("price", "Pricing")], "Write a client proposal from: {{brief}}. Pricing: {{price}}. Sections: understanding, scope, phased deliverables, timeline, pricing, terms."],
    ["meetingrecap", "Meeting Recap", "Recap + action items from notes.", [t("notes", "Call notes / transcript", "textarea")], "Turn these call notes into a crisp recap: {{notes}} — summary, decisions, action items (owner + due), and the agreed next step."],
    ["negotiation", "Negotiation Plan", "Your plan for the negotiation.", [t("context", "Deal + sticking points", "textarea")], "Build a negotiation plan for: {{context}} — your BATNA, likely their asks, trade variables (not just price), 3 concession options, and target/walk-away."],
    ["contractsummary", "Contract Summary", "Plain-English summary of a contract.", [t("contract", "Paste key clauses", "textarea")], "Summarise this contract in plain English: {{contract}} — obligations, term, payment, termination, liability, and any red flags. Not legal advice."],
    ["closeplan", "Mutual Close Plan", "A step-by-step path to signature.", [t("deal", "Deal context", "textarea")], "Create a mutual close plan for: {{deal}} — milestones, owners, dates from now to signed, and what could derail it."],
    ["winloss", "Win/Loss Analysis", "Learn from a closed deal.", [t("deal", "What happened", "textarea")], "Do a win/loss analysis of: {{deal}} — why it went the way it did, what to repeat, what to change, and one process fix."],
    ["upsell", "Upsell Suggestor", "Spot the next sale to a client.", [t("client", "Client + what they bought", "textarea")], "For this client: {{client}} — suggest 3 upsell/cross-sell moves with the trigger, pitch line, and rough value for each."],
    ["quote", "Quotation Draft", "A clean text quotation.", [t("items", "Items + prices", "textarea")], "Draft a professional quotation from: {{items}} — line items, subtotal, GST 18%, total, validity 15 days, and payment terms."],
  ],
  d_marketing: [
    ["content", "Content Engine", "A full blog post from a topic.", [t("topic", "Topic + angle", "textarea")], "Write a 700-word blog post on: {{topic}} — SEO title, intro hook, subheads, practical body, and a CTA. Indian SME audience."],
    ["carousel", "Carousel Copy", "A 7-slide social carousel.", [t("idea", "Idea / message")], "Write a 7-slide Instagram/LinkedIn carousel on: {{idea}} — hook slide, 5 value slides, CTA slide, plus caption and 5 hashtags."],
    ["seo", "SEO Brief", "A brief to rank for a keyword.", [t("keyword", "Target keyword")], "Create an SEO content brief for '{{keyword}}': search intent, title options, H2 outline, entities to cover, internal-link ideas, and word count."],
    ["newsletter", "Email Newsletter", "A value-first newsletter issue.", [t("topic", "This issue's theme")], "Write an email newsletter issue on {{topic}}: subject line, 250-word body with one insight and one tip, and a soft CTA."],
    ["adcopy", "Ad Copy Pack", "Ads for Meta/Google.", [t("product", "Product + audience", "textarea")], "Write an ad pack for {{product}}: 3 Meta primary texts + headlines, 3 Google RSA headlines + 2 descriptions, angled differently."],
    ["calendar", "Content Calendar", "A 2-week posting plan.", [t("focus", "Focus / campaign")], "Build a 2-week content calendar for {{focus}}: per day — platform, format, hook, caption seed. Mix education, proof, offer."],
    ["landing", "Landing Page Copy", "Conversion copy for a page.", [t("offer", "Offer + audience", "textarea")], "Write landing-page copy for {{offer}}: hero headline + subhead, 3 benefit blocks, social proof placeholder, FAQ (5), and CTA."],
    ["videoscript", "Short Video Script", "A 30–45s reel/short script.", [t("idea", "Idea / message")], "Write a 30–45s short-video script for: {{idea}} — hook (first 2s), beats with on-screen text, and CTA. Casual, mobile-first."],
    ["pressrelease", "Press Release", "A newsworthy release.", [t("news", "The announcement", "textarea")], "Write a press release for: {{news}} — headline, dateline, 3 tight paragraphs, a quote, and boilerplate."],
  ],
  d_operations: [
    ["onboarding", "Client Onboarding Plan", "A smooth first-30-days plan.", [t("service", "What you deliver", "textarea")], "Create a client onboarding plan for {{service}}: welcome steps, info to collect, kickoff agenda, 30-day milestones, and touchpoints."],
    ["sop", "SOP Writer", "A clean standard operating procedure.", [t("process", "Process to document", "textarea")], "Write an SOP for: {{process}} — purpose, scope, tools, numbered steps, quality checks, and common mistakes."],
    ["status", "Status Update", "A clear stakeholder update.", [t("notes", "What's happened", "textarea")], "Write a status update from: {{notes}} — done, in progress, blockers, next, and one-line risk. Confident and concise."],
    ["projectplan", "Project Plan", "A phased plan with milestones.", [t("goal", "Project goal + constraints", "textarea")], "Build a project plan for: {{goal}} — phases, key tasks, owners, dependencies, and milestone dates."],
    ["checklist", "Process Checklist", "A do-not-miss checklist.", [t("task", "Task / event")], "Create a thorough checklist for: {{task}} — grouped by before / during / after, with the easy-to-forget items flagged."],
    ["handoff", "Handoff Doc", "A clean handover document.", [t("context", "What's being handed off", "textarea")], "Write a handoff doc for: {{context}} — current state, access/tools, open items, contacts, and gotchas."],
    ["agenda", "Meeting Agenda", "A tight, timeboxed agenda.", [t("purpose", "Meeting purpose + attendees", "textarea")], "Write a timeboxed meeting agenda for: {{purpose}} — objective, topics with minutes, pre-reads, and decisions to make."],
  ],
  d_intel: [
    ["dossier", "Prospect Dossier", "A one-pass research dossier.", [t("target", "Company / person", "textarea")], "Build a prospect dossier on: {{target}} — what they do, likely priorities, buying triggers, people to know, and a tailored opening line. Note where you'd verify facts."],
    ["competitor", "Competitor Watch", "A weekly competitor brief.", [t("competitor", "Competitor + what to track", "textarea")], "Write a competitor brief on: {{competitor}} — positioning, likely recent moves, strengths/gaps, and how to counter. Flag assumptions to verify."],
    ["marketsizing", "Market Sizing", "A TAM/SAM/SOM estimate.", [t("market", "Market + geography", "textarea")], "Estimate the market size for: {{market}} — TAM/SAM/SOM with the assumptions and a bottom-up sanity check. Be explicit about guesses."],
    ["swot", "SWOT Analysis", "A sharp SWOT.", [t("business", "Business / situation", "textarea")], "Do a SWOT for: {{business}} — 3–4 crisp points each, then the single most important move it implies."],
    ["trends", "Trend Brief", "What's changing in a space.", [t("space", "Industry / topic")], "Write a trend brief on {{space}}: 5 shifts, why each matters for an SME, and one action per trend."],
    ["pricingintel", "Pricing Intelligence", "How to position your price.", [t("context", "Your offer + rivals", "textarea")], "Analyse pricing for: {{context}} — likely competitor price bands, your positioning options (premium/parity/penetration), and a recommended structure."],
  ],
  d_customer: [
    ["triage", "Support Triage", "Sort and draft replies to tickets.", [t("tickets", "Paste tickets", "textarea")], "Triage these support messages: {{tickets}} — for each: category, urgency, and a ready-to-send empathetic reply."],
    ["faq", "FAQ Engine", "A customer FAQ from a topic.", [t("topic", "Area / product")], "Write a 10-question customer FAQ about {{topic}} — concise, friendly, accurate answers."],
    ["churnsave", "Churn Save Message", "Win back an at-risk customer.", [t("context", "Why they're leaving", "textarea")], "Write a churn-save message for: {{context}} — acknowledge, address the real reason, offer a concrete next step, no begging."],
    ["welcome", "Customer Welcome", "A warm onboarding email.", [t("product", "What they signed up for")], "Write a warm customer welcome/onboarding email for {{product}}: what to do first, a quick win, and where to get help."],
    ["reviewreply", "Review Reply", "On-brand replies to reviews.", [t("reviews", "Paste reviews", "textarea")], "Write professional public replies to: {{reviews}} — thank praise, address concerns, offer a next step. Match tone."],
    ["npsfollow", "NPS Follow-up", "Follow up on NPS scores.", [t("context", "Score + comment", "textarea")], "Write NPS follow-up messages for: {{context}} — a promoter ask (referral/review) and a detractor recovery note."],
  ],
  d_back: [
    ["invoicereminder", "Invoice Reminder", "A firm, friendly payment nudge.", [t("context", "Invoice + how overdue", "textarea")], "Write a payment-reminder message for: {{context}} — polite, clear amount and due date, easy pay step; escalate tone with age."],
    ["reconcile", "Reconciliation Checklist", "Month-end close checklist.", [t("scope", "What to reconcile")], "Write a month-end reconciliation checklist for: {{scope}} — accounts to match, documents to gather, and common mismatches to check."],
    ["expense", "Expense Policy", "A simple expense policy.", [t("company", "Company context", "textarea")], "Draft a simple expense & reimbursement policy for: {{company}} — categories, limits, approval flow, receipts, and timelines."],
    ["vendoremail", "Vendor Email", "Negotiate or chase a vendor.", [t("context", "Vendor + goal", "textarea")], "Write a professional vendor email for: {{context}} — clear ask, reasonable justification, and a specific next step."],
    ["policydoc", "Policy Document", "Any internal policy, cleanly written.", [t("topic", "Policy topic + rules", "textarea")], "Write an internal policy document on: {{topic}} — purpose, scope, the rules clearly numbered, exceptions, and effective date."],
    ["reportsummary", "Report Summary", "Exec summary of a report.", [t("report", "Paste report / numbers", "textarea")], "Write an executive summary of: {{report}} — the story in 5 lines, 3 key numbers, and the one decision it points to."],
  ],
};

// Second wave of department agents — deeper coverage per function.
const DEPT_SPECS_MORE: Record<string, DSpec[]> = {
  d_sales: [
    ["winback", "Win-back Campaign", "Re-open a lapsed prospect.", [t("context", "Who + why they went cold", "textarea")], "Write a 3-message win-back sequence for this lapsed prospect: {{context}}. New angle, no guilt, one reason to re-engage now."],
    ["casestudyask", "Case Study Request", "Ask a happy client to be a case study.", [t("client", "Client + result", "textarea")], "Write a friendly note asking this client to be a case study: {{client}}. Make it low-effort and flattering; offer to do the writing."],
    ["demoscript", "Demo Script", "A tight product-demo flow.", [t("product", "Product + audience", "textarea")], "Write a demo script for {{product}}: pre-frame, the 3 'wow' moments to show in order, questions to ask mid-demo, and the close."],
    ["battlecard", "Sales Battlecard", "Beat a specific competitor in deals.", [t("competitor", "Competitor + your product", "textarea")], "Create a sales battlecard vs {{competitor}}: where you win, their traps, landmine questions to plant, and a one-line reframe."],
    ["territory", "Territory Plan", "A plan to work a segment/region.", [t("segment", "Segment / region + goal", "textarea")], "Write a territory plan for: {{segment}} — top account tiers, outreach cadence, channels, and a weekly activity target."],
  ],
  d_deals: [
    ["roicase", "ROI Justification", "A business case that unlocks budget.", [t("deal", "Their situation + your price", "textarea")], "Build an ROI justification for: {{deal}} — the cost of doing nothing, expected gains, payback period, and a CFO-ready one-liner."],
    ["redline", "Redline Notes", "Suggested edits to their contract.", [t("clauses", "Paste clauses", "textarea")], "Review these contract clauses from the buyer's paper: {{clauses}} — flag risky terms, suggest redlines, and rank by importance. Not legal advice."],
    ["stakeholdermap", "Stakeholder Map", "Map the buying committee.", [t("deal", "Org + people you know", "textarea")], "Map the buying committee for: {{deal}} — likely roles (champion, economic buyer, blockers), what each cares about, and how to reach the ones you're missing."],
    ["renewal", "Renewal Pitch", "Secure and expand a renewal.", [t("account", "Account + usage/results", "textarea")], "Write a renewal pitch for: {{account}} — value delivered, a light expansion offer, and a confident ask with a deadline."],
  ],
  d_marketing: [
    ["webinar", "Webinar Outline", "A webinar that converts.", [t("topic", "Topic + audience")], "Outline a 40-minute webinar on {{topic}}: title, promise, 4 sections, the soft-pitch section, and 3 promo hooks."],
    ["casestudy", "Case Study Writer", "A results-driven case study.", [t("story", "Client, problem, result", "textarea")], "Write a case study from: {{story}} — challenge, approach, results with numbers, and a pull-quote. Skimmable."],
    ["brandvoice", "Brand Voice Guide", "Codify how the brand sounds.", [t("about", "Brand + vibe", "textarea")], "Create a brand voice guide from: {{about}} — 3 voice principles, do/don't words, and 2 before/after rewrites."],
    ["coldseq", "Cold Email Sequence", "A 4-email cold sequence.", [t("offer", "Offer + audience", "textarea")], "Write a 4-email cold sequence for {{offer}} — different angle each email, short, with subject lines and a breakup last."],
    ["whatsapp", "WhatsApp Broadcast", "A compliant promo broadcast.", [t("promo", "What you're promoting")], "Write a WhatsApp broadcast for {{promo}}: a tight hook, the offer, one CTA, and a shorter follow-up nudge. Friendly, not spammy."],
  ],
  d_operations: [
    ["runbook", "Incident Runbook", "What to do when things break.", [t("scenario", "Failure scenario", "textarea")], "Write an incident runbook for: {{scenario}} — detection, immediate steps, who to call, comms template, and post-mortem prompts."],
    ["vendorcompare", "Vendor Comparison", "Pick between suppliers.", [t("options", "Options + criteria", "textarea")], "Compare these vendors: {{options}} — a scored table on the criteria, pros/cons, and a recommendation with the trade-off stated."],
    ["capacity", "Capacity Plan", "Match workload to people.", [t("context", "Team + workload", "textarea")], "Build a capacity plan from: {{context}} — utilization per person, where you're over/under, and hiring or reallocation moves."],
    ["retro", "Retrospective", "Turn a project into lessons.", [t("project", "What happened", "textarea")], "Run a retrospective on: {{project}} — what went well, what didn't, root causes, and 3 concrete changes with owners."],
  ],
  d_intel: [
    ["persona", "Buyer Persona", "A rich buyer persona.", [t("audience", "Who you sell to", "textarea")], "Build a buyer persona for: {{audience}} — goals, pains, a day in their life, objections, and where they learn. Keep it usable."],
    ["newsdigest", "Industry News Digest", "A weekly market digest.", [t("space", "Industry / beat")], "Write a weekly news digest for {{space}}: 5 developments, why each matters, and one action. Note that live figures should be verified."],
    ["riskscan", "Risk Scan", "Surface the business's key risks.", [t("business", "Business context", "textarea")], "Do a risk scan for: {{business}} — top 6 risks (financial, ops, market, people), likelihood/impact, and a mitigation for each."],
    ["survey", "Survey Designer", "A survey that gets real answers.", [t("goal", "What you want to learn")], "Design a customer survey to learn: {{goal}} — 10 unbiased questions (mix of scale + open), and how to analyse the results."],
  ],
  d_customer: [
    ["macros", "Support Macros", "Reusable canned replies.", [t("topics", "Common issues", "textarea")], "Write support macros (canned replies) for these common issues: {{topics}} — warm, clear, with placeholders for specifics."],
    ["onboardseq", "Customer Onboarding Sequence", "A 5-email onboarding flow.", [t("product", "Product + first win")], "Write a 5-email customer onboarding sequence for {{product}} — each email drives one action toward the first win."],
    ["csat", "CSAT Survey", "A short satisfaction survey.", [t("touchpoint", "Touchpoint")], "Design a CSAT survey for {{touchpoint}}: the core score question, 2 follow-ups, and how to route detractors vs promoters."],
    ["helparticle", "Help Article", "A clear how-to article.", [t("topic", "What to explain", "textarea")], "Write a help-centre article on: {{topic}} — short intro, numbered steps, screenshots-placeholder notes, and a troubleshooting section."],
  ],
  d_back: [
    ["collections", "Collections Sequence", "Escalating payment chase.", [t("context", "Invoice + age", "textarea")], "Write a 3-step collections sequence for: {{context}} — friendly reminder, firm follow-up, and a final notice. Keep the relationship intact."],
    ["budgetmemo", "Budget Memo", "Propose or defend a budget.", [t("context", "What + why + numbers", "textarea")], "Write a budget memo for: {{context}} — the ask, the rationale, expected return, and what happens if it's not funded."],
    ["auditprep", "Audit Prep Checklist", "Get ready for an audit.", [t("scope", "Audit scope")], "Write an audit-prep checklist for: {{scope}} — documents to gather, reconciliations to complete, and common findings to pre-empt."],
    ["boardfin", "Board Finance Note", "A crisp finance update for the board.", [t("numbers", "Key figures + context", "textarea")], "Write a board-ready finance note from: {{numbers}} — the headline, 3 KPIs with commentary, cash position, and the one ask or decision."],
  ],
};

const DEPT_SPECS_3: Record<string, DSpec[]> = {
  d_sales: [
    ["accountlist", "Ideal Account List", "Build a target account list.", [t("icp", "ICP + market", "textarea")], "From this ICP: {{icp}} — produce a target account list framework: 15 example companies to pursue, why each fits, and the best entry contact role."],
    ["voicemail", "Voicemail Script", "A voicemail that gets callbacks.", [t("offer", "Offer + who")], "Write two 20-second sales voicemail scripts for {{offer}} — curiosity-led, with a clear reason to call back."],
  ],
  d_deals: [
    ["paymentterms", "Payment Terms Proposal", "Structure the payment terms.", [t("deal", "Deal size + risk", "textarea")], "Propose payment terms for: {{deal}} — 2-3 structures (upfront/milestone/retainer) with pros/cons and your recommended default."],
    ["thankyou", "Post-close Thank You", "A memorable close note.", [t("deal", "What they bought", "textarea")], "Write a warm post-close thank-you message for: {{deal}} — set expectations for next steps and make them feel great about the decision."],
  ],
  d_marketing: [
    ["hooks", "10 Hooks", "Ten scroll-stopping hooks.", [t("topic", "Topic / product")], "Write 10 scroll-stopping hooks for content about {{topic}} — mix curiosity, contrarian, and outcome angles."],
    ["repurpose", "Repurpose Content", "One asset into many.", [t("asset", "Source content", "textarea")], "Repurpose this content into a LinkedIn post, an X thread, an Instagram caption, and an email — keep the core idea, fit each format: {{asset}}"],
  ],
  d_operations: [
    ["kpidef", "KPI Definitions", "Define the metrics that matter.", [t("area", "Function / goal")], "Define the 6 KPIs that matter most for: {{area}} — exact formula, target range, and how often to review each."],
    ["escalation", "Escalation Matrix", "Who handles what, when.", [t("context", "Team + issue types", "textarea")], "Build an escalation matrix for: {{context}} — severity levels, who owns each, response times, and when to escalate up."],
  ],
  d_intel: [
    ["pricingteardown", "Pricing Page Teardown", "Analyse a rival's pricing page.", [t("context", "Competitor + their tiers", "textarea")], "Tear down this competitor pricing: {{context}} — their strategy, anchors, gaps you can exploit, and a positioning move."],
    ["quickread", "Quick Market Read", "A fast take on an opportunity.", [t("idea", "Opportunity / idea", "textarea")], "Give a fast market read on: {{idea}} — demand signals, who already serves it, the wedge, and a go/no-go lean with the reason."],
  ],
  d_customer: [
    ["complaint", "Complaint Resolver", "Defuse an upset customer.", [t("context", "The complaint", "textarea")], "Write a resolution reply to this complaint: {{context}} — acknowledge, take responsibility where fair, offer a concrete fix, and rebuild trust."],
    ["loyalty", "Loyalty Program Idea", "Design a simple loyalty play.", [t("business", "Business + customers", "textarea")], "Design a simple loyalty/referral program for: {{business}} — mechanic, reward, how to launch it over WhatsApp/email, and a success metric."],
  ],
  d_back: [
    ["cashflownote", "Cash Flow Note", "A plain-English cash update.", [t("numbers", "Inflows/outflows", "textarea")], "Write a plain-English cash-flow note from: {{numbers}} — position, what's coming, any crunch, and the one action to take."],
    ["compliancereminder", "Compliance Reminder", "Draft a due-date reminder.", [t("item", "Filing / due date")], "Write an internal compliance reminder for: {{item}} — what's due, by when, who owns it, and what happens if it's missed."],
  ],
};

const DEPT_SPECS_4: Record<string, DSpec[]> = {
  d_sales: [
    ["engage", "Prospect Engagement", "Warm a prospect before you pitch.", [t("prospect", "Prospect + recent post/news", "textarea")], "Suggest 3 genuine ways to engage this prospect before pitching: {{prospect}} — a thoughtful comment, a useful share, and a soft opener."],
    ["gifting", "Gifting Note", "A note to accompany a client gift.", [t("context", "Occasion + relationship", "textarea")], "Write a short, warm gifting note for: {{context}} — personal, not salesy, memorable."],
  ],
  d_deals: [
    ["lostdebrief", "Lost Deal Debrief", "Turn a loss into intel.", [t("deal", "What happened", "textarea")], "Debrief this lost deal: {{deal}} — the real reason, what signals you missed, and a re-engagement trigger to set for later."],
    ["champkit", "Champion Enablement Kit", "Arm your internal champion.", [t("deal", "Champion + their org", "textarea")], "Build a champion enablement kit for: {{deal}} — a one-pager they can forward, answers to the CFO's likely questions, and a suggested internal email."],
  ],
  d_marketing: [
    ["subjectlab", "Subject Line Lab", "Ten tested subject lines.", [t("email", "Email topic / offer")], "Write 10 email subject lines for: {{email}} — mix curiosity, benefit, urgency and personal; note which 3 to A/B test first."],
    ["testimonial", "Testimonial Polish", "Turn raw praise into a clean quote.", [t("raw", "Raw customer words", "textarea")], "Polish this raw customer praise into 2 crisp, believable testimonial quotes (keep their voice): {{raw}}"],
  ],
  d_operations: [
    ["emponboard", "Employee Onboarding", "A first-week plan for a new hire.", [t("role", "Role + team", "textarea")], "Create a first-week onboarding plan for a new {{role}} — accounts/tools to set up, intro meetings, a starter task, and 30-day expectations."],
    ["notestasks", "Notes → Tasks", "Extract action items from messy notes.", [t("notes", "Raw notes", "textarea")], "Extract a clean task list from these notes: {{notes}} — each with owner and due-by if implied, plus a one-line summary at the top."],
  ],
  d_intel: [
    ["reviewmining", "Review Mining", "Find themes in customer reviews.", [t("reviews", "Paste reviews", "textarea")], "Mine these reviews for insight: {{reviews}} — top praise themes, top complaints, feature requests, and 2 actions to take."],
    ["keywordideas", "Keyword Ideas", "SEO/ad keyword clusters.", [t("topic", "Product / topic")], "Generate keyword ideas for {{topic}} — 4 intent clusters (informational, commercial, branded, long-tail) with 6 keywords each."],
  ],
  d_customer: [
    ["apology", "Service Apology", "A sincere recovery message.", [t("issue", "What went wrong", "textarea")], "Write a sincere service-recovery message for: {{issue}} — own it, explain briefly, make it right, and prevent it recurring."],
    ["upgradenudge", "Upgrade Nudge", "Nudge a customer to a higher plan.", [t("context", "Usage + plan", "textarea")], "Write a helpful upgrade nudge for: {{context}} — tie it to a limit they're hitting and the value of the next tier, not pressure."],
  ],
  d_back: [
    ["reimburse", "Reimbursement Note", "Approve/clarify an expense claim.", [t("claim", "Claim details", "textarea")], "Write a clear reimbursement response for: {{claim}} — approve, request missing info, or decline with policy reference, professionally."],
    ["invoicedraft", "Invoice Draft", "A clean invoice in text.", [t("details", "Client, items, amounts", "textarea")], "Draft an invoice from: {{details}} — invoice number placeholder, line items, subtotal, GST 18%, total, due date, and payment details."],
  ],
};

const _mergedDeptSpecs: Record<string, DSpec[]> = {};
for (const src of [DEPT_SPECS, DEPT_SPECS_MORE, DEPT_SPECS_3, DEPT_SPECS_4]) {
  for (const [dept, specs] of Object.entries(src)) _mergedDeptSpecs[dept] = [...(_mergedDeptSpecs[dept] || []), ...specs];
}
const DEPT_AGENTS: Agent[] = Object.entries(_mergedDeptSpecs).flatMap(([dept, specs]) =>
  specs.map(([id, name, desc, inputs, prompt]) => A(dept, id, name, desc, inputs, prompt))
);

export const AGENTS: Agent[] = [
  ...INDUSTRIES.flatMap((ind) => [
    ...commonAgents(ind),
    ...(SPECIAL[ind.id] || []),
    ...visualAgents(ind),
  ]),
  ...DEPT_AGENTS,
];

export function agentsForIndustry(industry: string): Agent[] {
  return AGENTS.filter((a) => a.industry === industry);
}
export function agentsForDepartment(dept: string): Agent[] {
  return AGENTS.filter((a) => a.industry === dept);
}
export function findAgent(id: string): Agent | undefined {
  return AGENTS.find((a) => a.id === id);
}
export function agentCount() { return AGENTS.length; }
