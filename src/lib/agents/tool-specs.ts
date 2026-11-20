/*
  Declarations for the agent-only tools (lib/agents/toolkit.ts implements them).

  Pure data, no imports — scripts/test-agent-workspace.mjs reads this file
  directly to check every declared tool is implemented and every agent only
  names tools that exist.

  Descriptions are written for the MODEL: they say when to reach for the tool.
*/

export const AGENT_TOOL_DECLARATIONS = [
  {
    name: "business_snapshot",
    description:
      "The workspace's current KPIs (revenue, cash, receivables, margins, inventory and so on) exactly as Cortex last computed them from the owner's own data. "
      + "Call this first for any question about how the business is doing, before quoting any headline figure.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "msme_exposure",
    description:
      "Section 43B(h) exposure: payables to micro and small (MSME) suppliers that are past the 15/45-day payment window, and so at risk of being disallowed as a tax deduction. "
      + "Also lists suppliers not yet classified, whose exposure is unknown. Use for MSME, 43B(h), supplier payment or tax-deduction questions.",
    parameters: { type: "object", properties: { limit: { type: "integer", description: "How many suppliers to list (1-25, default 10)." } } },
  },
  {
    name: "statutory_deadlines",
    description:
      "Indian statutory deadlines (GST returns, TDS, advance tax, ROC, PF/ESI and others) falling due in the next N days, already filtered by what the owner said applies to this business. "
      + "Use for compliance, filing, due-date or penalty questions.",
    parameters: { type: "object", properties: { within_days: { type: "integer", description: "Look-ahead window in days (1-60, default 21)." } } },
  },
  {
    name: "customer_segments",
    description:
      "RFM segmentation of customers on the last 12 months of orders: Champion, Loyal, At risk, Lost, New / promising, Needs attention — with value and days since last order. "
      + "Use for retention, churn, who to call, upsell or customer-quality questions.",
    parameters: {
      type: "object",
      properties: {
        segment: { type: "string", description: "Optional: only this segment, e.g. 'At risk'." },
        limit: { type: "integer", description: "How many customers (1-25, default 10)." },
      },
    },
  },
  {
    name: "recall_memory",
    description:
      "Search Cortex Memory — what the owner has told Cortex and what Cortex has learned about this business (customers, preferences, past decisions). "
      + "Each result says whether it came from the owner, from their data, or was inferred by AI. Use before giving advice that depends on how this business works.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for, in plain words." },
        limit: { type: "integer", description: "How many items (1-12, default 6)." },
      },
      required: ["query"],
    },
  },
  {
    name: "remember_fact",
    description:
      "Save ONE durable fact or decision to Cortex Memory so future agents know it. It is labelled as AI-inferred and the owner can remove it. "
      + "Use sparingly, only for things worth knowing next month (a customer's payment habit, a decision the owner made). Never for figures that change daily.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "The fact, in one or two plain sentences." },
        title: { type: "string", description: "A short title." },
        kind: { type: "string", description: "fact | decision | insight | preference" },
      },
      required: ["content"],
    },
  },
] as const;

export type AgentToolName = (typeof AGENT_TOOL_DECLARATIONS)[number]["name"];
