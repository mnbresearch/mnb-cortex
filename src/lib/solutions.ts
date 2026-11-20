/*
  CORTEX SOLUTIONS — one product, four ways in.

  Each solution is a team of agents (lib/agents/teams.ts) plus the modules it
  works through. Every capability listed here names the module that does the
  work (`module`), and scripts/test-agent-workspace.mjs fails the build if a
  module route does not exist — a solution page must never sell a page that
  isn't there.

  Pure data, no imports.
*/

export type Capability = { title: string; body: string; module: string };
export type CapabilityGroup = { name: string; items: Capability[] };
export type Solution = {
  slug: "finance" | "operations" | "growth" | "practice";
  name: string;
  short: string;
  eyebrow: string;
  headline: string;
  sub: string;
  team: "finance" | "operations" | "growth" | null;
  flagship?: boolean;
  forWho: string[];
  groups: CapabilityGroup[];
  delegations: string[];
};

export const SOLUTIONS: Solution[] = [
  {
    slug: "finance", flagship: true,
    name: "Cortex for Finance",
    short: "Close, cash, receivables, compliance, FP&A and the board pack — done by agents that read your books.",
    eyebrow: "For founders, CFOs and finance teams",
    headline: "A finance team that works from your books.",
    sub: "Seven finance agents read your Tally, Zoho Books or spreadsheet data every day. They chase what you're owed, track every statutory date, close the month and write the board pack. Every action waits for your approval, and every figure is checked against your own rows.",
    team: "finance",
    forWho: ["Owner-run businesses without a full finance team", "CFOs and finance heads who want the routine work off their desk", "Multi-entity groups that need one view across companies"],
    groups: [
      {
        name: "Cash & collections",
        items: [
          { title: "Receivables, ranked and chased", body: "Who owes you, how late, and who to call first. Reminders are drafted in your name and wait for your approval.", module: "/receivables" },
          { title: "Collections that stop when paid", body: "Email and WhatsApp reminders from your own number, with a 0% fee UPI QR, that stop the moment an invoice is marked paid.", module: "/collections" },
          { title: "13-week cash forecast", body: "The quarter ahead, week by week, with what-if changes to see what moves the cash line.", module: "/cash13" },
          { title: "Bank statement reader", body: "Upload a statement and get categorised inflows and outflows, with every figure checked against the statement's own text.", module: "/bank" },
        ],
      },
      {
        name: "Close & reporting",
        items: [
          { title: "Month-end close", body: "A close checklist built from your open receivables, payables and the statutory dates in the window.", module: "/close" },
          { title: "MIS pack", body: "The monthly management pack (KPIs, trend, ageing, payables, top customers, collections) exported to Excel.", module: "/reports" },
          { title: "P&L and ratios", body: "Profit and loss, margins and the ratios a lender looks at, graded against sensible bands.", module: "/pnl" },
          { title: "Board and investor commentary", body: "Headline, performance, cash, risks and the decisions needed, written from your own figures.", module: "/investor" },
        ],
      },
      {
        name: "Tax & compliance",
        items: [
          { title: "Statutory calendar for your registration", body: "GST, TDS, advance tax, ROC, PF and ESI dates, filtered by what you tell Cortex applies to you.", module: "/compliance" },
          { title: "MSME 43B(h) exposure", body: "Payables to micro and small suppliers past the 15/45-day window, and the deduction at risk.", module: "/msme" },
          { title: "GSTR-2B ITC reconciliation", body: "Input tax credit mismatches between your purchase register and 2B, supplier by supplier.", module: "/itc" },
          { title: "TDS and advance tax", body: "TDS deducted and due, and the advance-tax instalments for the year.", module: "/tds" },
        ],
      },
      {
        name: "Planning & decisions",
        items: [
          { title: "FP&A: variance and forecast", body: "Month-by-month variance with the drivers behind it, and a forward view with its assumptions written down.", module: "/forecast" },
          { title: "Stress test", body: "Debtor delays, cost inflation and MSME payment terms run against your balance sheet, with mitigation steps.", module: "/forecast" },
          { title: "Deep Dive", body: "One hard question taken through diagnosis, decision and a first draft of the action.", module: "/deepdive" },
          { title: "Valuation", body: "What the business could be worth on several methods, from your own numbers.", module: "/valuation" },
        ],
      },
    ],
    delegations: [
      "Who owes us the most, and draft reminders for anything over 60 days",
      "What is our 43B(h) exposure and which suppliers should we pay first?",
      "Run the month-end close checklist and prepare the MIS pack",
      "Write this month's board commentary from our numbers",
    ],
  },
  {
    slug: "operations",
    name: "Cortex for Operations",
    short: "Stock, suppliers and processes watched daily, with the fixes drafted for your approval.",
    eyebrow: "For operations heads, plant and store managers",
    headline: "Operations that tell you before they break.",
    sub: "Operations agents watch stock against reorder levels, score your suppliers on what you owe them and how late you pay, and write the SOPs your team runs on.",
    team: "operations",
    forWho: ["Manufacturers and traders carrying inventory", "Distributors managing many suppliers", "Teams that run on checklists and SOPs"],
    groups: [
      {
        name: "Stock & purchasing",
        items: [
          { title: "Reorder before you run out", body: "Items at or below reorder level, with urgency from recent orders and a reorder list by supplier.", module: "/reorder" },
          { title: "Inventory health", body: "Stock on hand, slow movers and dead stock, so cash isn't sitting on a shelf.", module: "/inventory" },
          { title: "Production runs", body: "Runs, output and yield in one place.", module: "/production" },
        ],
      },
      {
        name: "Suppliers & process",
        items: [
          { title: "Vendor scorecard", body: "Suppliers by spend, balance and payment behaviour, including 43B(h) exposure for micro and small vendors.", module: "/vendors" },
          { title: "SOPs and checklists", body: "Numbered procedures written in your business's own terms.", module: "/sops" },
          { title: "Capacity planning", body: "Team and machine capacity against the work coming in.", module: "/capacity" },
        ],
      },
    ],
    delegations: [
      "What is about to run out of stock and what should we reorder?",
      "Which suppliers are we paying late, and what does it cost us?",
      "Write an SOP for our month-end stock count",
    ],
  },
  {
    slug: "growth",
    name: "Cortex for Sales & Growth",
    short: "Know which customers are growing, slipping or gone, and act on it the same day.",
    eyebrow: "For founders and sales leaders",
    headline: "Every customer, read from your own orders.",
    sub: "Growth agents segment your customers on real order history, find the good ones who have gone quiet, explain where revenue came from, and draft the messages to win them back.",
    team: "growth",
    forWho: ["B2B businesses with repeat customers", "D2C brands on Shopify and marketplaces", "Sales teams that need a short call list, not a dashboard"],
    groups: [
      {
        name: "Customers",
        items: [
          { title: "Customer segments", body: "Champions, loyal, at risk and lost, scored on the last 12 months of orders.", module: "/rfm" },
          { title: "Churn early warning", body: "Customers whose ordering has slowed, before they're gone.", module: "/churn" },
          { title: "Customer 360", body: "One customer's orders, invoices, balance and notes in one place.", module: "/customers" },
        ],
      },
      {
        name: "Revenue & pipeline",
        items: [
          { title: "Revenue analysis", body: "Month-by-month revenue, concentration and the orders behind the movement.", module: "/sales" },
          { title: "Deals pipeline", body: "Open deals by stage, with what's stuck and why.", module: "/pipeline" },
          { title: "Pricing optimiser", body: "Where margin is being left on the table, item by item.", module: "/pricing-optimizer" },
          { title: "Campaigns", body: "Email campaigns with tracking and WhatsApp broadcasts, sent only after you approve them.", module: "/email" },
        ],
      },
    ],
    delegations: [
      "Which good customers have gone quiet, and what should we say to them?",
      "How has revenue moved over the last six months and why?",
      "Who are our top ten customers and how concentrated are we?",
    ],
  },
  {
    slug: "practice",
    name: "Cortex for Practices",
    short: "For CA and advisory firms: every client's exposure ranked, agents working across the book.",
    eyebrow: "For chartered accountants and advisory firms",
    headline: "Your whole client book, watched by agents.",
    sub: "One console ranks every client's receivables, 43B(h) clock and upcoming filings. Credits are pooled across clients, and the Finance team runs inside each client's workspace under your firm's name.",
    team: "finance",
    forWho: ["CA firms with dozens of SME clients", "Virtual CFO and advisory practices", "Bookkeeping firms moving to advisory"],
    groups: [
      {
        name: "Across the book",
        items: [
          { title: "Practice console", body: "Every client's exposure ranked, so the morning starts with the client who needs you.", module: "/practice" },
          { title: "43B(h) by client", body: "Whose MSME clock is running, client by client.", module: "/practice" },
          { title: "Pooled credits", body: "Buy once for the firm and spend inside any client workspace you've claimed.", module: "/practice" },
        ],
      },
      {
        name: "Inside each client",
        items: [
          { title: "The full Finance team", body: "Receivables, payables, compliance, close, FP&A and board commentary, per client.", module: "/workspace" },
          { title: "Your brand", body: "Your firm's name, logo and colour on the workspace and on the alert and decision emails clients receive.", module: "/settings" },
          { title: "Client briefs", body: "A short weekly brief per client that you can forward as your own.", module: "/practice" },
        ],
      },
    ],
    delegations: [
      "Which clients have the largest overdue receivables this week?",
      "Which clients have filings due in the next ten days?",
    ],
  },
];

export function solutionBySlug(slug: string): Solution | undefined {
  return SOLUTIONS.find((s) => s.slug === slug);
}
