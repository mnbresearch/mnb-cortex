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
  { id: "services", name: "Professional Services", emoji: "💼", blurb: "Proposals, engagement & updates." },
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

const _mergedDeptSpecs: Record<string, DSpec[]> = {};
for (const src of [DEPT_SPECS, DEPT_SPECS_MORE]) {
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
