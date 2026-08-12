// Single source of truth for industry-specific messaging.
// Used by the public landing IndustryPicker AND the /industries page, so a business
// owner sees their *own* problems and the exact Cortex tools that solve them.
import type { LucideIcon } from "lucide-react";
import {
  Gem, Shirt, UtensilsCrossed, Building2, ShoppingBag, Scissors, Car, Factory,
  Stethoscope, GraduationCap, Dumbbell, Plane, Truck, Sprout, Briefcase, Pill,
  Cpu, Sofa, ShoppingCart, PartyPopper, Camera, PawPrint, LampDesk, Printer, Footprints,
} from "lucide-react";

export type IndustryFix = { tool: string; href: string };
export type Industry = {
  slug: string;
  name: string;
  icon: LucideIcon;
  tagline: string;
  pains: string[];
  fixes: IndustryFix[];
  outcome: string;
};

export const INDUSTRIES: Industry[] = [
  {
    slug: "manufacturing", name: "Manufacturing", icon: Factory,
    tagline: "Make more, waste less, get paid faster.",
    pains: ["Stock-outs on some SKUs, dead inventory on others", "Margins per product are thin and unclear", "Big buyers stretch your receivables for months"],
    fixes: [
      { tool: "Reorder Optimizer (EOQ + safety stock)", href: "/reorder" },
      { tool: "Per-SKU unit economics & pricing", href: "/unit-economics" },
      { tool: "Receivables & DSO chase-first list", href: "/receivables" },
      { tool: "13-week cash flow for long cycles", href: "/cash13" },
    ],
    outcome: "Know exactly what to make, what to charge, and who to chase — before it costs you.",
  },
  {
    slug: "retail-d2c", name: "Retail & D2C", icon: ShoppingBag,
    tagline: "Grow orders without burning margin.",
    pains: ["CAC keeps rising and payback is unclear", "Discounts quietly eat your margin", "You don't know which SKUs actually make money"],
    fixes: [
      { tool: "Marketing funnel + ROAS allocator", href: "/funnel" },
      { tool: "Discount impact & Pricing Optimizer", href: "/discount" },
      { tool: "Customer LTV, RFM & churn", href: "/ltv" },
      { tool: "Inventory ABC & reorder planning", href: "/abc" },
    ],
    outcome: "Spend on what pays back, price with confidence, and keep your best customers.",
  },
  {
    slug: "services", name: "Services & Agencies", icon: Briefcase,
    tagline: "Stop projects quietly losing money.",
    pains: ["Some projects lose money and you find out late", "Teams are over- or under-booked", "Proposals are slow and generic"],
    fixes: [
      { tool: "Project & client profitability", href: "/projects" },
      { tool: "Team capacity & utilisation", href: "/capacity" },
      { tool: "AI Proposal & Quote generator", href: "/proposals" },
      { tool: "Billable-rate calculator", href: "/rate-card" },
    ],
    outcome: "See true project margin, staff to demand, and win work with sharper proposals.",
  },
  {
    slug: "jewellery", name: "Jewellery", icon: Gem,
    tagline: "From sketch to costed spec in minutes.",
    pains: ["Costing every design by hand", "Metal & stone prices swing constantly", "Turning a sketch into a maker's spec is slow"],
    fixes: [
      { tool: "Sketch → merchandising spec agent", href: "/agents" },
      { tool: "Live costing with metal/stone rates", href: "/agents" },
      { tool: "Making-charge & margin calculators", href: "/markup" },
      { tool: "Collection planner & stone-plot", href: "/agents" },
    ],
    outcome: "Quote accurately as rates move, and turn ideas into specs your karigars can build.",
  },
  {
    slug: "distribution", name: "Distribution & Wholesale", icon: Truck,
    tagline: "Protect margin and free up trapped cash.",
    pains: ["Hundreds of SKUs on razor-thin margins", "Credit risk spread across many dealers", "Cash locked in the working-capital cycle"],
    fixes: [
      { tool: "Payables & DPO with early-pay discounts", href: "/payables" },
      { tool: "DSCR & credit exposure by account", href: "/dscr" },
      { tool: "Cash conversion cycle simulator", href: "/ccc" },
      { tool: "Vendor scorecards & GST ITC set-off", href: "/itc" },
    ],
    outcome: "Extend payables smartly, watch dealer risk, and unlock cash from the cycle.",
  },
  {
    slug: "clinic", name: "Clinics & Healthcare", icon: Stethoscope,
    tagline: "Run the practice, not just the patients.",
    pains: ["Revenue is fragmented and no-shows hurt", "Statutory & compliance deadlines pile up", "No single view of the practice's health"],
    fixes: [
      { tool: "Business Health Dashboard", href: "/dashboard" },
      { tool: "Compliance calendar & GST helper", href: "/compliance" },
      { tool: "Daily brief + KPI alerts", href: "/brief" },
      { tool: "Payroll, CTC & appraisal tools", href: "/payroll" },
    ],
    outcome: "One clear view of the practice, with deadlines and cash under control.",
  },
  {
    slug: "restaurant", name: "Restaurant & F&B", icon: UtensilsCrossed,
    tagline: "Fatten the margin on every cover.",
    pains: ["Food cost and wastage creep up unnoticed", "Slow days kill the week's numbers", "You price the menu on gut feel"],
    fixes: [
      { tool: "Menu & recipe costing (markup/margin)", href: "/markup" },
      { tool: "Break-even by product mix", href: "/breakeven" },
      { tool: "WhatsApp Broadcast for footfall", href: "/broadcast" },
      { tool: "Daily brief + KPI alerts", href: "/brief" },
    ],
    outcome: "Price the menu on real cost, fill slow days, and protect food-cost margin.",
  },
  {
    slug: "fashion", name: "Fashion & Apparel", icon: Shirt,
    tagline: "Plan collections that sell through.",
    pains: ["Sizes and styles over/under-stocked", "Markdowns wreck the season's margin", "Trends move faster than your buying"],
    fixes: [
      { tool: "Inventory ABC & reorder planning", href: "/abc" },
      { tool: "Discount impact & Pricing Optimizer", href: "/discount" },
      { tool: "Collection planner agent", href: "/agents" },
      { tool: "Customer segments & LTV", href: "/rfm" },
    ],
    outcome: "Buy to demand, protect full-price sell-through, and cut end-of-season markdowns.",
  },
  {
    slug: "beauty-salon", name: "Beauty & Salon", icon: Scissors,
    tagline: "Fill the chair and lift the ticket.",
    pains: ["Empty slots and last-minute no-shows", "Retail products don't move", "Regulars slip away quietly"],
    fixes: [
      { tool: "WhatsApp Broadcast for rebooking", href: "/broadcast" },
      { tool: "Churn predictor for regulars", href: "/churn" },
      { tool: "Service pricing & bundles", href: "/markup" },
      { tool: "Daily brief + KPI alerts", href: "/brief" },
    ],
    outcome: "Keep the calendar full, win back regulars, and grow the average ticket.",
  },
  {
    slug: "automotive", name: "Automotive", icon: Car,
    tagline: "Turn the workshop into a margin machine.",
    pains: ["Parts inventory tied up in slow movers", "Labour vs parts margin is a mystery", "Big-ticket receivables run late"],
    fixes: [
      { tool: "Inventory turnover & holding cost", href: "/inventory-turns" },
      { tool: "Billable-rate & job costing", href: "/rate-card" },
      { tool: "Receivables & DSO tracker", href: "/receivables" },
      { tool: "Reorder Optimizer", href: "/reorder" },
    ],
    outcome: "Free up parts cash, price labour right, and collect on time.",
  },
  {
    slug: "education", name: "Education & Coaching", icon: GraduationCap,
    tagline: "Grow enrolments, keep them enrolled.",
    pains: ["Lead-to-admission conversion is leaky", "Batch profitability is unclear", "Drop-offs mid-course hurt revenue"],
    fixes: [
      { tool: "Marketing funnel & lead scoring", href: "/funnel" },
      { tool: "Project/batch profitability", href: "/projects" },
      { tool: "Churn (drop-off) predictor", href: "/churn" },
      { tool: "Customer LTV", href: "/ltv" },
    ],
    outcome: "Convert more enquiries, run profitable batches, and reduce drop-offs.",
  },
  {
    slug: "fitness", name: "Fitness & Gym", icon: Dumbbell,
    tagline: "Grow memberships, kill churn.",
    pains: ["Members lapse and you notice too late", "Slow months break the cash plan", "Trainer capacity is guesswork"],
    fixes: [
      { tool: "Churn predictor for members", href: "/churn" },
      { tool: "Cash runway & burn", href: "/runway" },
      { tool: "Team capacity planner", href: "/capacity" },
      { tool: "WhatsApp Broadcast for renewals", href: "/broadcast" },
    ],
    outcome: "Retain members, smooth the cash, and staff classes to demand.",
  },
  {
    slug: "travel", name: "Travel & Hospitality", icon: Plane,
    tagline: "Price for occupancy and margin.",
    pains: ["Seasonality swings cash hard", "Package margins are opaque", "Late payments from partners"],
    fixes: [
      { tool: "13-week cash flow", href: "/cash13" },
      { tool: "Package unit economics", href: "/unit-economics" },
      { tool: "Receivables & DSO", href: "/receivables" },
      { tool: "Forecasting & scenarios", href: "/forecast" },
    ],
    outcome: "Ride the seasons, price packages on real margin, and get paid on time.",
  },
  {
    slug: "logistics", name: "Logistics & Transport", icon: Truck,
    tagline: "Run every route in the black.",
    pains: ["Per-route/vehicle profit is unclear", "Fuel & maintenance eat margin", "Receivables from big clients lag"],
    fixes: [
      { tool: "Unit economics per route", href: "/unit-economics" },
      { tool: "Cost Optimizer", href: "/costs" },
      { tool: "Receivables & DSO tracker", href: "/receivables" },
      { tool: "Buy vs Lease for fleet", href: "/buyvslease" },
    ],
    outcome: "See which routes make money, cut cost leaks, and collect faster.",
  },
  {
    slug: "agriculture", name: "Agriculture & Agri-business", icon: Sprout,
    tagline: "Plan crops and cash around the season.",
    pains: ["Prices and yields swing wildly", "Working capital is tight pre-harvest", "Input costs are hard to track"],
    fixes: [
      { tool: "13-week cash flow", href: "/cash13" },
      { tool: "Cost Optimizer", href: "/costs" },
      { tool: "Scenario planner", href: "/forecast" },
      { tool: "Funding & loan tools", href: "/funding" },
    ],
    outcome: "Bridge the pre-harvest gap and plan around price and yield swings.",
  },
  {
    slug: "professional-services", name: "Professional Services", icon: Briefcase,
    tagline: "Bill more of what you're worth.",
    pains: ["Utilisation and realisation are opaque", "Scope creep erodes fees", "Cash flow is lumpy"],
    fixes: [
      { tool: "Team capacity & utilisation", href: "/capacity" },
      { tool: "Billable-rate calculator", href: "/rate-card" },
      { tool: "Project profitability", href: "/projects" },
      { tool: "13-week cash flow", href: "/cash13" },
    ],
    outcome: "Lift realisation, protect scope, and smooth the cash.",
  },
  {
    slug: "pharmacy", name: "Pharmacy & Wellness", icon: Pill,
    tagline: "Right stock, right margin, always compliant.",
    pains: ["Expiry and dead stock eat cash", "Thin margins across thousands of SKUs", "GST & compliance is relentless"],
    fixes: [
      { tool: "Inventory turnover & holding cost", href: "/inventory-turns" },
      { tool: "GST ITC set-off & compliance", href: "/itc" },
      { tool: "Reorder Optimizer", href: "/reorder" },
      { tool: "Inventory ABC analysis", href: "/abc" },
    ],
    outcome: "Cut expiry losses, protect margin, and stay effortlessly compliant.",
  },
  {
    slug: "electronics", name: "Electronics & Appliances", icon: Cpu,
    tagline: "Move stock before it's obsolete.",
    pains: ["Fast obsolescence traps cash in stock", "Price wars squeeze margin", "Warranty & service costs pile up"],
    fixes: [
      { tool: "Inventory turnover & holding cost", href: "/inventory-turns" },
      { tool: "Pricing Optimizer", href: "/pricing-optimizer" },
      { tool: "Reorder Optimizer", href: "/reorder" },
      { tool: "Unit economics", href: "/unit-economics" },
    ],
    outcome: "Turn stock faster, defend margin, and price to win without bleeding.",
  },
  {
    slug: "furniture", name: "Furniture & Decor", icon: Sofa,
    tagline: "Quote custom work profitably.",
    pains: ["Custom-order costing is guesswork", "Big items lock up showroom cash", "Long lead times strain cash"],
    fixes: [
      { tool: "Quotation builder", href: "/quote" },
      { tool: "Markup & margin", href: "/markup" },
      { tool: "Inventory turnover", href: "/inventory-turns" },
      { tool: "13-week cash flow", href: "/cash13" },
    ],
    outcome: "Quote custom jobs accurately and keep cash moving on big-ticket stock.",
  },
  {
    slug: "grocery", name: "Grocery & Kirana", icon: ShoppingCart,
    tagline: "Thin margins, tight control.",
    pains: ["Wafer-thin margins across thousands of items", "Spoilage and dead stock", "Cash is tied up in inventory"],
    fixes: [
      { tool: "Inventory ABC & turnover", href: "/abc" },
      { tool: "Reorder Optimizer", href: "/reorder" },
      { tool: "Cash conversion cycle", href: "/ccc" },
      { tool: "Cost Optimizer", href: "/costs" },
    ],
    outcome: "Stock the winners, cut spoilage, and free trapped cash.",
  },
  {
    slug: "events", name: "Events & Wedding", icon: PartyPopper,
    tagline: "Cost every event to profit.",
    pains: ["Per-event profitability is unclear", "Advances and payments are messy", "Vendor costs balloon"],
    fixes: [
      { tool: "Project (event) profitability", href: "/projects" },
      { tool: "Quotation builder", href: "/quote" },
      { tool: "Vendor scorecards", href: "/vendors" },
      { tool: "13-week cash flow", href: "/cash13" },
    ],
    outcome: "Price events to profit, manage advances, and rein in vendor cost.",
  },
  {
    slug: "photography", name: "Photography & Studio", icon: Camera,
    tagline: "Package your time for profit.",
    pains: ["Packages priced below true cost", "Feast-or-famine bookings", "Editing time isn't costed"],
    fixes: [
      { tool: "Billable-rate calculator", href: "/rate-card" },
      { tool: "Package unit economics", href: "/unit-economics" },
      { tool: "Quotation builder", href: "/quote" },
      { tool: "Cash runway", href: "/runway" },
    ],
    outcome: "Price shoots on real cost — including editing — and smooth the bookings.",
  },
  {
    slug: "petcare", name: "Pet Care", icon: PawPrint,
    tagline: "Recurring care, recurring revenue.",
    pains: ["Repeat visits slip without nudges", "Retail & service mix is unoptimised", "Slow days hurt"],
    fixes: [
      { tool: "Churn / repeat predictor", href: "/churn" },
      { tool: "WhatsApp Broadcast reminders", href: "/broadcast" },
      { tool: "Service pricing & bundles", href: "/markup" },
      { tool: "Customer LTV", href: "/ltv" },
    ],
    outcome: "Bring pets back on schedule and grow the value of every client.",
  },
  {
    slug: "interior", name: "Interior Design", icon: LampDesk,
    tagline: "Win projects, keep the margin.",
    pains: ["Project scope and margin drift", "Milestone payments run late", "Proposals take forever"],
    fixes: [
      { tool: "Project profitability", href: "/projects" },
      { tool: "AI Proposal generator", href: "/proposals" },
      { tool: "Receivables & DSO", href: "/receivables" },
      { tool: "Quotation builder", href: "/quote" },
    ],
    outcome: "Hold project margin, chase milestones, and pitch faster.",
  },
  {
    slug: "printing", name: "Printing & Signage", icon: Printer,
    tagline: "Quote fast, protect the job margin.",
    pains: ["Job costing (material + labour) is manual", "Rush jobs erode margin", "Small-ticket receivables pile up"],
    fixes: [
      { tool: "Quotation builder", href: "/quote" },
      { tool: "Markup & margin", href: "/markup" },
      { tool: "Receivables & DSO", href: "/receivables" },
      { tool: "Cost Optimizer", href: "/costs" },
    ],
    outcome: "Quote jobs in minutes with the margin baked in — and collect the tail.",
  },
  {
    slug: "real-estate", name: "Real Estate", icon: Building2,
    tagline: "Close deals, manage the cash.",
    pains: ["Long, lumpy sales cycles", "Commission & cost tracking is messy", "Cash timing is unpredictable"],
    fixes: [
      { tool: "Deals pipeline & lead scoring", href: "/pipeline" },
      { tool: "Sales commission calculator", href: "/commission" },
      { tool: "13-week cash flow", href: "/cash13" },
      { tool: "Forecasting & scenarios", href: "/forecast" },
    ],
    outcome: "Prioritise the deals that will close and plan the cash around them.",
  },
  {
    slug: "footwear", name: "Footwear", icon: Footprints,
    tagline: "Buy to sell-through, size by size.",
    pains: ["Size curves over/under-stocked", "Seasonal markdowns hurt", "Margins vary wildly by line"],
    fixes: [
      { tool: "Inventory ABC & reorder", href: "/abc" },
      { tool: "Discount impact", href: "/discount" },
      { tool: "Per-line unit economics", href: "/unit-economics" },
      { tool: "Customer segments", href: "/rfm" },
    ],
    outcome: "Buy the right size curve, cut markdowns, and back the profitable lines.",
  },
];

export function getIndustry(slug: string): Industry | undefined {
  return INDUSTRIES.find((i) => i.slug === slug);
}

// Maps a workspace's stored industry (agent-catalog ids or older values) to the
// canonical industry so the app can tailor itself to it.
const INDUSTRY_ALIAS: Record<string, string> = {
  manufacturing: "manufacturing",
  retail: "retail-d2c", d2c: "retail-d2c", "retail-d2c": "retail-d2c", ecommerce: "retail-d2c",
  services: "services", agency: "services",
  "professional-services": "professional-services", consulting: "professional-services",
  jewellery: "jewellery", jewelry: "jewellery",
  fashion: "fashion", apparel: "fashion",
  restaurant: "restaurant", food: "restaurant", fnb: "restaurant",
  realestate: "real-estate", "real-estate": "real-estate", property: "real-estate",
  beauty: "beauty-salon", salon: "beauty-salon", "beauty-salon": "beauty-salon",
  automotive: "automotive", auto: "automotive",
  healthcare: "clinic", clinic: "clinic", health: "clinic",
  education: "education", coaching: "education", edtech: "education",
  fitness: "fitness", gym: "fitness",
  travel: "travel", hospitality: "travel", hotel: "travel",
  logistics: "logistics", transport: "logistics",
  agri: "agriculture", agriculture: "agriculture", farming: "agriculture",
  pharmacy: "pharmacy", wellness: "pharmacy",
  electronics: "electronics", appliances: "electronics",
  furniture: "furniture", decor: "furniture",
  grocery: "grocery", kirana: "grocery",
  events: "events", wedding: "events",
  photography: "photography", studio: "photography",
  petcare: "petcare", pet: "petcare",
  interior: "interior",
  printing: "printing", signage: "printing",
  footwear: "footwear", shoes: "footwear",
  distribution: "distribution", trading: "distribution", wholesale: "distribution",
};

export function resolveIndustry(value?: string | null): Industry | undefined {
  const k = String(value || "").toLowerCase().trim();
  if (!k) return undefined;
  const slug = INDUSTRY_ALIAS[k] || k;
  return INDUSTRIES.find((i) => i.slug === slug);
}
