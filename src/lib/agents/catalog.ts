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
  const heavy = ["jewellery", "fashion", "restaurant", "realestate", "retail", "beauty", "automotive"];
  return heavy.includes(ind.id) ? base : base.filter((a) => a.id.endsWith(".cleanup") || a.id.endsWith(".enhance"));
}

export const AGENTS: Agent[] = INDUSTRIES.flatMap((ind) => [
  ...commonAgents(ind),
  ...(SPECIAL[ind.id] || []),
  ...visualAgents(ind),
]);

export function agentsForIndustry(industry: string): Agent[] {
  return AGENTS.filter((a) => a.industry === industry);
}
export function findAgent(id: string): Agent | undefined {
  return AGENTS.find((a) => a.id === id);
}
export function agentCount() { return AGENTS.length; }
