/*
  CORTEX AGENT TEAMS — the tool-using agents of the Agent Workspace.

  Pure data, no imports, so scripts/test-agent-workspace.mjs can read it.

  WHAT IS DIFFERENT FROM THE 438 CATALOGUE AGENTS (lib/agents/catalog.ts).
  Catalogue agents are templates: a form, one model call, a draft. They stay,
  and the supervisor can still hand a writing step to one of them. The agents
  below are the ones that WORK FROM THE BOOKS: each has a named set of tools
  over the workspace's own rows (lib/agents/tool-specs.ts + lib/ai/tools.ts),
  can propose actions into the approval queue, and can be planned into a team
  task by its team's lead.

  Every `tools` name must exist — the test fails the build if one does not —
  and `propose_action` only ever creates a proposal: approve-first is the
  default on every plan, and only the owner's own Autopilot rule (Command and
  above) lets one run on its own.
*/

export type TeamId = "finance" | "operations" | "growth";

export type CoreAgent = {
  id: string;
  team: TeamId;
  name: string;
  /** One line, shown on the agent card. */
  role: string;
  /** The role brief appended to the system prompt for this agent's steps. */
  brief: string;
  tools: string[];
  /** What this agent hands back, shown on its profile. */
  outputs: string[];
  /** Words that route a request to this agent (lib/agents/router.ts). */
  keywords: string[];
  lead?: boolean;
};

export type Team = {
  id: TeamId;
  name: string;
  solution: string;
  promise: string;
  lead: string;
  examples: string[];
};

export const TEAMS: Team[] = [
  {
    id: "finance",
    name: "Finance",
    solution: "Cortex for Finance",
    promise: "A finance team that works from your books: close, cash, receivables, compliance, FP&A and the board pack.",
    lead: "fin.cfo",
    examples: [
      "Who owes us the most, and draft reminders for anything over 60 days",
      "What is our 43B(h) exposure and which suppliers should we pay first?",
      "Prepare this month's board pack commentary from our numbers",
      "Which statutory deadlines are coming up in the next three weeks?",
    ],
  },
  {
    id: "operations",
    name: "Operations",
    solution: "Cortex for Operations",
    promise: "Stock, suppliers and processes watched every day, with the fixes drafted for your approval.",
    lead: "ops.coo",
    examples: [
      "What is about to run out of stock and what should we reorder?",
      "Which suppliers are we paying late, and what does it cost us?",
      "Write an SOP for our month-end stock count",
    ],
  },
  {
    id: "growth",
    name: "Sales & Growth",
    solution: "Cortex for Sales & Growth",
    promise: "Know which customers are growing, slipping or gone, and act on it the same day.",
    lead: "grw.cro",
    examples: [
      "Which good customers have gone quiet, and what should we say to them?",
      "How has revenue moved over the last six months and why?",
      "Who are our top ten customers and how concentrated are we?",
    ],
  },
];

const RULES_FINANCE = "Quote only figures a tool returned, with the customer, supplier, amount and date. Indian context: INR, lakh/crore, GST, TDS, Tally. Statutory dates and 43B(h) exposure come from the tools — never compute or recall them yourself.";

export const CORE_AGENTS: CoreAgent[] = [
  /* ---------------------------------------------------------------- Finance */
  {
    id: "fin.cfo", team: "finance", name: "CFO Agent", lead: true,
    role: "Leads the finance team: plans the work, reads the whole position, writes the answer.",
    brief: `You are the CFO Agent in Cortex for Finance. You lead a team of finance specialists and write the final answer for the owner: what is happening, why, and what to do — with the specific customer, supplier, amount and date. ${RULES_FINANCE}`,
    tools: ["business_snapshot", "revenue_by_month", "top_receivables", "top_payables", "msme_exposure", "statutory_deadlines", "recall_memory"],
    outputs: ["Financial position summary", "Prioritised action list", "Team task plans"],
    keywords: ["finance", "financial", "cfo", "position", "profit", "margin", "cash", "overall", "health", "money"],
  },
  {
    id: "fin.receivables", team: "finance", name: "Receivables Agent",
    role: "Finds who owes you, ranks who to chase, and drafts reminders for approval.",
    brief: `You are the Receivables Agent. Find overdue invoices, rank them by amount and age, say who to chase first and why, and use propose_action with send_payment_reminder for the ones worth chasing — they wait for the owner's approval. ${RULES_FINANCE}`,
    tools: ["top_receivables", "find_party", "collections_status", "recall_memory", "propose_action", "remember_fact"],
    outputs: ["Overdue ranking", "Payment reminders (for approval)", "Collections status"],
    keywords: ["owe", "owes", "overdue", "receivable", "receivables", "collect", "collection", "chase", "reminder", "debtor", "debtors", "dso", "unpaid", "payment reminder"],
  },
  {
    id: "fin.payables", team: "finance", name: "Payables & MSME Agent",
    role: "Tracks what you owe, the 43B(h) clock and which suppliers to pay first.",
    brief: `You are the Payables & MSME Agent. Report what the business owes, flag micro and small suppliers past the 43B(h) window (the deduction at risk), name unclassified suppliers as unknown exposure, and recommend a payment order. ${RULES_FINANCE}`,
    tools: ["top_payables", "msme_exposure", "find_party", "recall_memory", "propose_action"],
    outputs: ["Payables ranking", "43B(h) exposure", "Recommended payment order"],
    keywords: ["payable", "payables", "supplier", "suppliers", "vendor", "creditor", "msme", "43b", "43b(h)", "udyam", "pay first", "deduction"],
  },
  {
    id: "fin.compliance", team: "finance", name: "Compliance Agent",
    role: "Watches GST, TDS, advance tax, ROC and payroll dates for this business.",
    brief: `You are the Compliance Agent. List the statutory deadlines that apply to this business, what each needs, and what happens if it is missed. Raise an alert (propose_action raise_alert) for anything due within 3 days. Never give a date the statutory_deadlines tool did not return. ${RULES_FINANCE}`,
    tools: ["statutory_deadlines", "msme_exposure", "recall_memory", "propose_action"],
    outputs: ["Deadline calendar", "Alerts for imminent filings"],
    keywords: ["gst", "tds", "deadline", "deadlines", "compliance", "filing", "file", "return", "gstr", "advance tax", "roc", "penalty", "statutory", "pf", "esi"],
  },
  {
    id: "fin.fpa", team: "finance", name: "FP&A Agent",
    role: "Variance, trend, forecast and the story behind the numbers.",
    brief: `You are the FP&A Agent. Explain revenue and margin movement month by month, the drivers behind it, and a simple forward view with its assumptions stated. ${RULES_FINANCE}`,
    tools: ["business_snapshot", "revenue_by_month", "top_customers", "recall_memory"],
    outputs: ["Variance commentary", "Driver analysis", "Forecast with assumptions"],
    keywords: ["forecast", "variance", "budget", "trend", "growth", "fp&a", "fpa", "plan", "revenue", "month", "months", "why", "driver", "drivers"],
  },
  {
    id: "fin.close", team: "finance", name: "Month-end Close Agent",
    role: "Runs the month-end checklist and prepares the MIS pack.",
    brief: `You are the Month-end Close Agent. Check open receivables and payables, statutory dates in the close window, and the KPI snapshot; list what must be reconciled before the books close; propose export_xlsx with dataset mis_pack for the management pack. ${RULES_FINANCE}`,
    tools: ["business_snapshot", "top_receivables", "top_payables", "statutory_deadlines", "propose_action"],
    outputs: ["Close checklist", "MIS pack export (for approval)"],
    keywords: ["close", "month-end", "month end", "reconcile", "reconciliation", "mis", "books", "year-end"],
  },
  {
    id: "fin.board", team: "finance", name: "Board Pack Agent",
    role: "Writes board and investor commentary from the workspace's own figures.",
    brief: `You are the Board Pack Agent. Write concise board commentary: headline, performance, cash and working capital, risks (including 43B(h) and compliance), and decisions needed. Every figure must come from a tool. ${RULES_FINANCE}`,
    tools: ["business_snapshot", "revenue_by_month", "top_customers", "msme_exposure", "statutory_deadlines"],
    outputs: ["Board commentary", "Investor update draft"],
    keywords: ["board", "investor", "investors", "update", "pack", "commentary", "deck", "shareholder"],
  },

  /* ------------------------------------------------------------- Operations */
  {
    id: "ops.coo", team: "operations", name: "COO Agent", lead: true,
    role: "Leads operations: stock, suppliers and process, in one answer.",
    brief: "You are the COO Agent in Cortex for Operations. Lead the operations specialists and write the final answer: what is at risk operationally, the specific items and suppliers, and the next actions. Quote only figures a tool returned.",
    tools: ["business_snapshot", "low_stock", "recent_orders", "top_payables", "recall_memory"],
    outputs: ["Operations summary", "Prioritised fixes"],
    keywords: ["operations", "ops", "coo", "process", "efficiency", "capacity"],
  },
  {
    id: "ops.inventory", team: "operations", name: "Inventory Agent",
    role: "Spots stock about to run out and drafts the reorder list.",
    brief: "You are the Inventory Agent. Find items at or below reorder level, estimate urgency from recent orders, and give a reorder list by supplier. Raise an alert for anything critical. Quote only figures a tool returned.",
    tools: ["low_stock", "recent_orders", "find_party", "propose_action"],
    outputs: ["Reorder list", "Stock-out alerts"],
    keywords: ["stock", "inventory", "reorder", "stockout", "run out", "sku", "warehouse", "purchase"],
  },
  {
    id: "ops.vendors", team: "operations", name: "Vendor Agent",
    role: "Scores suppliers on what you owe them and how late you pay.",
    brief: "You are the Vendor Agent. Review supplier balances and late payments, including 43B(h) exposure for micro and small suppliers, and recommend which relationships need attention. Quote only figures a tool returned.",
    tools: ["top_payables", "msme_exposure", "find_party", "recall_memory"],
    outputs: ["Supplier review", "Relationship risks"],
    keywords: ["vendor", "vendors", "supplier", "suppliers", "procurement", "sourcing"],
  },
  {
    id: "ops.process", team: "operations", name: "Process Agent",
    role: "Writes SOPs, checklists and runbooks in your business's own terms.",
    brief: "You are the Process Agent. Write clear, numbered SOPs and checklists for this business, using what Cortex Memory knows about how it works. Mark anything you assumed.",
    tools: ["recall_memory", "remember_fact"],
    outputs: ["SOPs", "Checklists", "Runbooks"],
    keywords: ["sop", "sops", "checklist", "runbook", "procedure", "process", "how do we", "steps"],
  },

  /* ---------------------------------------------------------------- Growth */
  {
    id: "grw.cro", team: "growth", name: "CRO Agent", lead: true,
    role: "Leads sales and growth: revenue, customers and what to do next.",
    brief: "You are the CRO Agent in Cortex for Sales & Growth. Lead the growth specialists and write the final answer: where revenue is coming from, which customers are growing or slipping, and the next actions with names. Quote only figures a tool returned.",
    tools: ["business_snapshot", "revenue_by_month", "top_customers", "customer_segments", "recall_memory"],
    outputs: ["Growth summary", "Customer actions"],
    keywords: ["sales", "growth", "cro", "revenue", "pipeline", "grow"],
  },
  {
    id: "grw.customers", team: "growth", name: "Customer Agent",
    role: "Finds champions, at-risk and lost customers, and records what to do.",
    brief: "You are the Customer Agent. Segment customers, name the valuable ones who have gone quiet, and propose add_customer_note or set_customer_status where it helps the team. Quote only figures a tool returned.",
    tools: ["customer_segments", "top_customers", "find_party", "recall_memory", "propose_action", "remember_fact"],
    outputs: ["Segments", "At-risk list", "Customer notes (for approval)"],
    keywords: ["customer", "customers", "churn", "quiet", "lost", "retention", "loyal", "at risk", "rfm", "segment", "concentration", "top customers"],
  },
  {
    id: "grw.revenue", team: "growth", name: "Revenue Agent",
    role: "Explains revenue movement by month, customer and product.",
    brief: "You are the Revenue Agent. Explain revenue movement over time, which customers and orders drove it, and what that implies. Quote only figures a tool returned.",
    tools: ["revenue_by_month", "recent_orders", "top_customers", "business_snapshot"],
    outputs: ["Revenue analysis", "Concentration view"],
    keywords: ["revenue", "sales", "orders", "monthly", "trend", "seasonality", "top"],
  },
  {
    id: "grw.outreach", team: "growth", name: "Outreach Agent",
    role: "Drafts win-back, upsell and follow-up messages for named customers.",
    brief: "You are the Outreach Agent. Draft short, personal messages (WhatsApp and email) for the specific customers the task is about, in the owner's voice. Drafts only — nothing is sent. Quote only figures a tool returned.",
    tools: ["customer_segments", "find_party", "recall_memory"],
    outputs: ["Message drafts"],
    keywords: ["message", "messages", "email", "whatsapp", "outreach", "win back", "win-back", "upsell", "follow up", "follow-up", "draft"],
  },
];

export const CORE_AGENTS_BY_ID: Record<string, CoreAgent> = Object.fromEntries(CORE_AGENTS.map((a) => [a.id, a]));

export function teamOf(id: string): Team | undefined {
  return TEAMS.find((t) => t.id === id);
}

export function agentsInTeam(team: TeamId): CoreAgent[] {
  return CORE_AGENTS.filter((a) => a.team === team);
}

export function leadOf(team: TeamId): CoreAgent {
  const t = teamOf(team);
  return CORE_AGENTS_BY_ID[t?.lead || "fin.cfo"] || CORE_AGENTS[0];
}
