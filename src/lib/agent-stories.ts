/*
  THE AGENT FLOOR — what Cortex's agents actually do, told as a short scene.

  Each story is a sequence of steps an owner would recognise from their own
  week. Every step is something the product really does today, and names the
  module that does it (scripts/test-agent-floor.mjs fails if a module is not a
  real route, or if a step claims a capability the code does not have).

  What is ILLUSTRATIVE, and labelled as such on screen: the agents "walking"
  between desks and "talking". In the product these are functions, a nightly
  job and an approvals ledger — the scene is a way of showing the hand-offs,
  not a claim that there are little people inside. Names and amounts are
  examples, never a real customer's data.

  Pure: no React, no server imports. Used by components/agent-floor.tsx on the
  landing page, /features, /industries and /workforce.
*/

export type StationId =
  | "books" | "watch" | "collections" | "compliance" | "sales" | "ops" | "practice" | "approvals" | "outbox" | "brief";

export type Station = { id: StationId; label: string; sub: string; x: number; y: number; icon: string };

/** Desk positions as percentages of the floor (x across, y down). */
export const STATIONS: Record<StationId, Station> = {
  books:       { id: "books",       label: "Your books",     sub: "Tally · Excel · Zoho",   x: 9,  y: 50, icon: "📚" },
  watch:       { id: "watch",       label: "Night watch",    sub: "reads every night",      x: 27, y: 18, icon: "🌙" },
  collections: { id: "collections", label: "Collections",    sub: "who owes you",           x: 27, y: 82, icon: "💰" },
  compliance:  { id: "compliance",  label: "Compliance",     sub: "43B(h) · GST · TDS",     x: 50, y: 14, icon: "🧾" },
  sales:       { id: "sales",       label: "Sales desk",     sub: "deals · quotes",         x: 50, y: 86, icon: "🤝" },
  ops:         { id: "ops",         label: "Operations",     sub: "stock · suppliers",      x: 50, y: 50, icon: "📦" },
  practice:    { id: "practice",    label: "Client console", sub: "every client, ranked",   x: 50, y: 50, icon: "🗂️" },
  approvals:   { id: "approvals",   label: "You · Approvals", sub: "nothing goes out without you", x: 76, y: 50, icon: "✅" },
  outbox:      { id: "outbox",      label: "Outbox",         sub: "email · WhatsApp",       x: 92, y: 22, icon: "📤" },
  brief:       { id: "brief",       label: "Monday brief",   sub: "your inbox",             x: 92, y: 80, icon: "📬" },
};

export type ActorId = "watch" | "collector" | "accountant" | "seller" | "ops" | "you";
export type Actor = { id: ActorId; name: string; role: string; color: string; initial: string; home: StationId };

export const ACTORS: Record<ActorId, Actor> = {
  watch:      { id: "watch",      name: "Watch",    role: "Night watch agent",  color: "#7c6cf2", initial: "W", home: "watch" },
  collector:  { id: "collector",  name: "Collect",  role: "Collections agent",  color: "#16a37f", initial: "C", home: "collections" },
  accountant: { id: "accountant", name: "Ledger",   role: "Compliance agent",   color: "#d9822b", initial: "L", home: "compliance" },
  seller:     { id: "seller",     name: "Deal",     role: "Sales agent",        color: "#2f7de1", initial: "D", home: "sales" },
  ops:        { id: "ops",        name: "Stock",    role: "Operations agent",   color: "#c2417a", initial: "S", home: "ops" },
  you:        { id: "you",        name: "You",      role: "Owner",              color: "#c9a227", initial: "Y", home: "approvals" },
};

export type Step = {
  actor: ActorId;
  /** Where the actor walks before speaking. Same station = speaks in place. */
  to: StationId;
  say: string;
  /** The real route that does this. Must exist in lib/nav.ts. */
  module: string;
  /** What the actor carries while walking, if anything. */
  carry?: string;
  /** True for the plan-gated autonomous variant, so the UI can mark it. */
  commandOnly?: boolean;
};

export type Story = { id: string; title: string; who: string; uses: StationId[]; steps: Step[] };

/* Shared beats, reused so every story describes the same real mechanics. */
const read = (what: string): Step => ({ actor: "watch", to: "books", say: `Reading last night's export — ${what}.`, module: "/import" });
const approve: Step = { actor: "you", to: "approvals", say: "Looks right. Approved.", module: "/approvals" };
const brief: Step = { actor: "watch", to: "brief", say: "Monday brief sent: the three things worth your attention this week.", module: "/plan", carry: "brief" };

export const STORIES: Story[] = [
  {
    id: "general", title: "A night in any business", who: "Every workspace",
    uses: ["books", "watch", "collections", "compliance", "approvals", "outbox", "brief"],
    steps: [
      read("214 invoices, 38 suppliers"),
      { actor: "watch", to: "collections", say: "Acme Traders: ₹3.2L, 42 days late. Costliest overdue bill tonight.", module: "/receivables", carry: "INV-1042" },
      { actor: "collector", to: "collections", say: "Drafting a polite reminder in your tone, naming the invoice and the amount.", module: "/collections" },
      { actor: "collector", to: "approvals", say: "Ready for you. Nothing goes out without your tap.", module: "/approvals", carry: "draft" },
      approve,
      { actor: "collector", to: "outbox", say: "Sent. I stop chasing the moment they pay.", module: "/collections", carry: "email" },
      { actor: "watch", to: "compliance", say: "Two micro suppliers are past the 45-day window.", module: "/msme" },
      { actor: "accountant", to: "approvals", say: "₹1.8L under 43B(h): paying late moves the deduction to the year you pay. Clear these first.", module: "/msme", carry: "alert" },
      brief,
    ],
  },
  {
    id: "manufacturing", title: "A night at a factory", who: "Manufacturing",
    uses: ["books", "watch", "ops", "compliance", "collections", "approvals", "outbox", "brief"],
    steps: [
      read("dispatches, purchase bills and stock"),
      { actor: "watch", to: "ops", say: "CRC coil 1.2mm: 40 kg left, reorder level 100.", module: "/inventory", carry: "stock" },
      { actor: "ops", to: "approvals", say: "Alert raised with the supplier named, so the line doesn't stop.", module: "/inventory", carry: "alert" },
      { actor: "watch", to: "compliance", say: "₹4.6L owed to micro suppliers is past 45 days.", module: "/msme" },
      { actor: "accountant", to: "approvals", say: "That deduction moves to the year you pay. Clear these first.", module: "/msme", carry: "alert" },
      { actor: "watch", to: "collections", say: "Three dealers are over 60 days — ₹9.4L between them.", module: "/receivables" },
      { actor: "collector", to: "approvals", say: "Three reminders drafted, costliest first.", module: "/approvals", carry: "3 drafts" },
      approve,
      { actor: "collector", to: "outbox", say: "Sent from your WhatsApp number using your approved template.", module: "/collections", carry: "WhatsApp" },
      brief,
    ],
  },
  {
    id: "distribution", title: "A night at a distributor", who: "Distribution & wholesale",
    uses: ["books", "watch", "collections", "sales", "ops", "approvals", "outbox", "brief"],
    steps: [
      read("dealer ledgers and godown stock"),
      { actor: "watch", to: "collections", say: "Shree Agencies: ₹6.1L outstanding, oldest bill 74 days.", module: "/receivables", carry: "ledger" },
      { actor: "collector", to: "approvals", say: "Reminder drafted for your approval.", module: "/approvals", carry: "draft" },
      approve,
      { actor: "collector", to: "outbox", say: "Sent. The thread closes itself when the payment lands.", module: "/collections" },
      { actor: "watch", to: "sales", say: "Four quotes have been open 7+ days. Biggest: ₹2.4L to Metro Retail.", module: "/quote" },
      { actor: "seller", to: "approvals", say: "Alert raised: follow up before they buy elsewhere.", module: "/quote", carry: "alert" },
      { actor: "watch", to: "ops", say: "Two fast movers at reorder level.", module: "/inventory" },
      brief,
    ],
  },
  {
    id: "retail", title: "A night at a store or D2C brand", who: "Retail & D2C",
    uses: ["books", "watch", "ops", "sales", "approvals", "brief"],
    steps: [
      read("orders, returns and stock"),
      { actor: "watch", to: "ops", say: "Your best seller is below its reorder level.", module: "/inventory", carry: "stock" },
      { actor: "ops", to: "approvals", say: "Reorder alert raised, with the supplier named.", module: "/inventory", carry: "alert" },
      { actor: "watch", to: "sales", say: "41 repeat customers haven't ordered in 60 days.", module: "/churn" },
      /* Was "Your top 20% bring 64% of revenue" (/rfm computes segments, not a
         concentration figure) and "Flagged for you… → approvals" (no churn rule
         raises an approval). Both now describe what those pages really do. */
      { actor: "seller", to: "sales", say: "RFM sorts them: at-risk regulars apart from new and lost customers.", module: "/rfm" },
      { actor: "you", to: "sales", say: "I'll open the churn list and pick who to call first.", module: "/churn", carry: "list" },
      brief,
    ],
  },
  {
    id: "services", title: "A night at an agency or services firm", who: "Services & agencies",
    uses: ["books", "watch", "sales", "collections", "approvals", "outbox", "brief"],
    steps: [
      read("invoices, quotes and the pipeline"),
      { actor: "watch", to: "sales", say: "Quote to Bluebay Hotels has been open 9 days.", module: "/quote", carry: "₹3.5L" },
      { actor: "watch", to: "sales", say: "Two deals haven't moved in 14 days.", module: "/pipeline" },
      { actor: "seller", to: "approvals", say: "Alert raised: a follow-up this week keeps them alive.", module: "/pipeline", carry: "alert" },
      { actor: "watch", to: "collections", say: "Retainer invoice for Orion is 21 days late.", module: "/receivables" },
      { actor: "collector", to: "approvals", say: "Gentle nudge drafted.", module: "/approvals", carry: "draft" },
      approve,
      { actor: "collector", to: "outbox", say: "Sent by email. Logged against the invoice.", module: "/collections", carry: "email" },
      brief,
    ],
  },
  {
    id: "practice", title: "A night at a CA or advisory firm", who: "CA & advisory practices",
    uses: ["books", "watch", "practice", "compliance", "approvals", "brief"],
    steps: [
      { actor: "watch", to: "books", say: "Reading 18 client workspaces.", module: "/practice" },
      { actor: "watch", to: "practice", say: "Client ranking updated: who needs you most this week.", module: "/practice", carry: "ranking" },
      { actor: "accountant", to: "practice", say: "Patel Forgings: 43B(h) clock running on ₹7.2L.", module: "/msme" },
      { actor: "accountant", to: "compliance", say: "This week's GSTR-3B and TDS dates are on each client's own calendar.", module: "/compliance" },
      { actor: "accountant", to: "approvals", say: "MSME alerts raised inside each client's workspace, with the amounts.", module: "/practice", carry: "alerts" },
      { actor: "you", to: "approvals", say: "I'll call Patel Forgings first.", module: "/practice" },
      brief,
    ],
  },
  {
    id: "commanded", title: "Autopilot, on Command", who: "Command plan",
    uses: ["books", "watch", "collections", "approvals", "outbox", "brief"],
    steps: [
      read("invoices"),
      { actor: "watch", to: "collections", say: "Fifteen overdue bills tonight, costliest first.", module: "/receivables", carry: "15 bills" },
      { actor: "collector", to: "collections", say: "These match your rule: known customers, under ₹50,000 each.", module: "/approvals", commandOnly: true },
      { actor: "collector", to: "outbox", say: "Within your limits, so Autopilot sends them. Each one is logged on the ledger.", module: "/approvals", carry: "email", commandOnly: true },
      { actor: "collector", to: "approvals", say: "The two over your limit wait for you.", module: "/approvals", carry: "2 drafts" },
      approve,
      brief,
    ],
  },
];

/** Which story an industry (agents catalogue id or industries page slug) sees first. */
const BY_INDUSTRY: Record<string, string> = {
  manufacturing: "manufacturing", jewellery: "manufacturing", fashion: "manufacturing", furniture: "manufacturing",
  printing: "manufacturing", footwear: "manufacturing", electronics: "distribution",
  distribution: "distribution", wholesale: "distribution", logistics: "distribution", agri: "distribution",
  retail: "retail", grocery: "retail", pharmacy: "retail", beauty: "retail", petcare: "retail", d2c: "retail",
  services: "services", interior: "services", photography: "services", events: "services", education: "services",
  realestate: "services", travel: "services", automotive: "services", fitness: "services", healthcare: "services", restaurant: "retail",
  "professional-services": "practice", ca: "practice", practice: "practice",
  construction: "manufacturing", saas: "services", clinic: "services",
  "retail-d2c": "retail", "beauty-salon": "retail", agriculture: "distribution", "real-estate": "services",
};

export function storyFor(industry: string | null | undefined): Story {
  /* Workspaces store either the catalogue id ("retail") or a label ("Retail & D2C"); try both shapes, then the first word. */
  const raw = String(industry || "").toLowerCase().trim();
  const slug = raw.replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const id = BY_INDUSTRY[raw] || BY_INDUSTRY[slug] || BY_INDUSTRY[slug.split("-")[0]] || "general";
  return STORIES.find((s) => s.id === id) || STORIES[0];
}

/** The chips shown above the floor, in order. */
export const STORY_TABS = ["general", "manufacturing", "distribution", "retail", "services", "practice", "commanded"] as const;
