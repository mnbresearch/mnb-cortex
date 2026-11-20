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
  {
    name: "forensic_audit_score",
    description:
      "Continuous Big-4 Forensic Audit Readiness & Statutory Score (0-100, Grade A+ to D, qualification status, and rupee exposure). "
      + "Audits five statutory vectors: MSME 43B(h) disallowance, GSTR-2B vs Books ITC variance, TDS 194Q/C/J withholding rates, forensic anomalies, and bank/ledger clearing reconciliation. "
      + "Use for audit, statutory defense, CARO 2020, Companies Act qualification, or forensic compliance questions.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "detect_invoice_anomalies",
    description:
      "Forensic accounting anomaly scanner: scans payables and receivables for duplicate invoice numbers, identical amounts within 7 days, unexpected round-number disbursements, and vendor volume surges. "
      + "Use for fraud detection, audit sampling, internal controls, duplicate payment prevention, or forensic review.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "How many anomalies to report (1-25, default 10)." },
      },
    },
  },
  {
    name: "search_company_knowledge",
    description:
      "Search the company's own knowledge: emails (Outlook, Gmail), Teams chats, documents and files (OneDrive, SharePoint, Google Drive, uploads) and reports the company has connected. "
      + "Every result carries a `citation` naming where it came from. Use it for any question about what someone said or sent, a policy, a contract, a report, a decision, a customer conversation or anything not in the books. "
      + "When you use a result, quote its citation in your answer.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for: names, subjects, invoice numbers, topics." },
        kind: { type: "string", description: "Optional: email | chat | document | file | report." },
        limit: { type: "integer", description: "How many results (1-12, default 6)." },
      },
      required: ["query"],
    },
  },
  {
    name: "list_company_sources",
    description:
      "What the company has connected: mailboxes, chats, drives, uploaded documents and MCP-connected systems, with how much each holds and which system tools are available. "
      + "Use when asked what Cortex can see, or before query_connected_system to find the right source and tool.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "query_connected_system",
    description:
      "Ask one of the company's connected systems (an MCP server such as a CRM, ERP, ticketing tool or data warehouse) using one of its read-only tools. "
      + "Only tools the system marks read-only and the owner allowed can be called; nothing can be changed this way. Use list_company_sources first to find the source id and tool name.",
    parameters: {
      type: "object",
      properties: {
        source_id: { type: "string", description: "The source id from list_company_sources." },
        tool: { type: "string", description: "The tool name." },
        arguments: { type: "object", description: "The tool's arguments." },
      },
      required: ["source_id", "tool"],
    },
  },
] as const;

export type AgentToolName = (typeof AGENT_TOOL_DECLARATIONS)[number]["name"];
