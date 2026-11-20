/*
  NAMED-COMPETITOR COMPARISON DATA — /compare and /compare/[slug].

  THE RULES THIS FILE IS HELD TO (scripts/test-compare.mjs):
    1. Every statement about another company comes from that company's own
       website or documentation, read on AS_OF, and carries its URL.
    2. Where their site says nothing, the cell says NOT_STATED — "not stated on
       the pages we read" — never "No". Absence of a claim is not absence of a
       feature, and the page says so in words.
    3. No price comparison: their prices are not published, and ours is.
       Saying ours is published is a fact about us; guessing theirs is not.
    4. Where another product is the better choice, the page says so
       (`chooseThem`). A comparison that never concedes anything is an ad.
    5. Our own column is what this repo can be held to — every Cortex cell
       names a capability that exists in code.

  Trademarks belong to their owners; MNB Cortex is not affiliated with any
  company named here. Comparative advertising in India must be factual and
  must not denigrate (ASCI Code, Chapter IV): hence rules 1–4.
*/

export const AS_OF = "20 November 2026";
export const NOT_STATED = "Not stated on the pages we read";

export type RowKey = "builtFor" | "worksFrom" | "india" | "customAgents" | "models" | "grids" | "deliverables" | "approvals" | "verification" | "pricing" | "security";
export const ROW_LABELS: Record<RowKey, string> = {
  builtFor: "Built for",
  worksFrom: "Works from",
  india: "Indian statutory work (GST, TDS, 43B(h))",
  customAgents: "Build your own agents",
  models: "Choice of AI models",
  grids: "Questions across many documents",
  deliverables: "Finished deliverables",
  approvals: "Agent actions wait for approval",
  verification: "Figures checked against the source",
  pricing: "Pricing published",
  security: "Security attestations stated",
};
export const ROW_ORDER: RowKey[] = ["builtFor", "worksFrom", "india", "customAgents", "models", "grids", "deliverables", "approvals", "verification", "pricing", "security"];

export const CORTEX: Record<RowKey, string> = {
  builtFor: "Enterprises and growing businesses — finance, operations and growth teams running their own company or group",
  worksFrom: "Your systems and books (Tally, Zoho Books, Odoo, Busy, Vyapar, Shopify, Razorpay, Stripe, spreadsheets, the REST API) plus your company's mail, Teams chats, documents and MCP-connected systems",
  india: "Built in: statutory calendar for your registration, GSTR-2B ITC reconciliation, MSME 43B(h) exposure, TDS and advance tax",
  customAgents: "Agent Studio: build agents in plain words, choose exactly which tools each may use, and see its permission card",
  models: "Model Router: Balanced, Speed or Frontier order across Gemini, Groq, Claude and GPT, with your own keys if you have them; every agent step shows which model answered",
  grids: "Grids: documents as rows, questions as columns; every cell quoted from its own document and the quote checked; export to Excel",
  deliverables: "Any agent result as a Word document, PowerPoint deck or Excel workbook with the Veritas line and work log; live share links that expire and can be revoked",
  approvals: "Yes, by default. Every reminder, alert or export waits in Approvals unless you write an Autopilot rule with limits",
  verification: "Veritas v1 traces every rupee figure to the rows the agents read and flags any it cannot find",
  pricing: "Yes, in INR on the pricing page",
  security: "No third-party attestation yet. Workspace isolation (row-level security), encryption of tokens and secrets, read-only connectors, masking before AI",
};

export type Competitor = {
  slug: string;
  name: string;
  /** What they are, in one neutral line. */
  is: string;
  url: string;
  sources: { label: string; url: string }[];
  cells: Record<RowKey, string>;
  chooseThem: string;
  chooseCortex: string;
  keywords: string[];
};

export const COMPETITORS: Competitor[] = [
  {
    slug: "model-ml-alternative",
    name: "Model ML",
    is: "an AI agent platform for investment banking, consulting, private equity and asset management",
    url: "https://modelml.com/",
    sources: [{ label: "modelml.com", url: "https://modelml.com/" }, { label: "Model ML — Agent Harness", url: "https://modelml.com/product/agent-harness" }, { label: "Model ML — Grids", url: "https://modelml.com/product/grids" }, { label: "Model ML — Sites", url: "https://modelml.com/product/sites" }],
    cells: {
      builtFor: "Investment banking, consulting, private equity & credit, asset & wealth management",
      worksFrom: "Firm context, files and connectors including PitchBook, FactSet, Capital IQ, SharePoint, DealCloud and Google Drive; MCP; works inside Excel, PowerPoint and Outlook",
      india: NOT_STATED,
      customAgents: "Yes — Custom Agents (“Build your own team”)",
      models: "Routes each task to “the best model for the job”, including its own fine-tuned models",
      grids: "Grids — structured analysis across many documents and companies, every source cited",
      deliverables: "Works in Excel, PowerPoint, Word and Outlook; Sites for live pages",
      approvals: NOT_STATED,
      verification: NOT_STATED,
      pricing: "Not published — book a demo",
      security: "ISO 27001, SOC 2 Type II, GDPR",
    },
    chooseThem: "You are a bank, fund or consultancy whose work is pitch books, models and diligence on market data from PitchBook, FactSet or Capital IQ, done inside Excel and PowerPoint.",
    chooseCortex: "You are an enterprise or growing business running its own operations — the close, collections, contracts, GST and TDS, the board pack — from your own systems and documents, and you want every agent action to wait for approval and every rupee checked.",
    keywords: ["Model ML alternative", "Model ML alternative India", "AI finance agent for companies"],
  },
  {
    slug: "rogo-alternative",
    name: "Rogo",
    is: "an AI platform for financial institutions — bankers and investors",
    url: "https://rogo.com/",
    sources: [{ label: "rogo.com", url: "https://rogo.com/" }],
    cells: {
      builtFor: "Financial institutions — bankers and investors",
      worksFrom: "Your firm's systems and data, including OneDrive, SharePoint, DealCloud, Salesforce, FactSet and PitchBook",
      india: NOT_STATED,
      customAgents: "Purpose-built financial agents and end-to-end workflows; a custom-agent builder is not described",
      models: NOT_STATED,
      grids: NOT_STATED,
      deliverables: NOT_STATED,
      approvals: NOT_STATED,
      verification: NOT_STATED,
      pricing: "Not published — request a demo",
      security: "SOC 2 Type II, ISO 27001, ISO 42001, GDPR, CCPA, EU AI Act",
    },
    chooseThem: "You are an investment bank or investment firm that wants research, watchlists and deal workflows on institutional data, with former bankers embedded in your rollout.",
    chooseCortex: "You need agents on your own company's books and statutory calendar — receivables, 43B(h), GSTR-2B, the month-end close — with your own agents built in Agent Studio.",
    keywords: ["Rogo alternative", "Rogo AI alternative", "AI agent for CFO India"],
  },
  {
    slug: "hebbia-alternative",
    name: "Hebbia",
    is: "an AI platform for finance and legal research across documents and market data",
    url: "https://www.hebbia.com/",
    sources: [{ label: "hebbia.com", url: "https://www.hebbia.com/" }, { label: "Hebbia — Security", url: "https://www.hebbia.com/security" }],
    cells: {
      builtFor: "Investors, bankers, lawyers, consultants and Fortune 500 companies",
      worksFrom: "Filings, earnings transcripts, FactSet, Capital IQ, PitchBook, SharePoint, OneDrive, Box, Dropbox, Salesforce, Snowflake and more",
      india: NOT_STATED,
      customAgents: NOT_STATED,
      models: NOT_STATED,
      grids: "Matrix — analysis across many documents side by side",
      deliverables: NOT_STATED,
      approvals: NOT_STATED,
      verification: "Matrix shows the source documents behind each answer",
      pricing: NOT_STATED,
      security: "SOC 2 Type 2, ISO 27001:2022, ISO 42001, GDPR, CCPA",
    },
    chooseThem: "Your work is reading thousands of filings, transcripts and data-room documents side by side, across many companies.",
    chooseCortex: "Your work is running one company's (or one group's) money: who owes you, what you owe, what is due to the government, and what the board needs — with actions you approve.",
    keywords: ["Hebbia alternative", "Hebbia Matrix alternative", "AI document search for finance teams India"],
  },
  {
    slug: "microsoft-copilot-finance-alternative",
    name: "Microsoft Finance agents",
    is: "Microsoft's finance solution in Microsoft 365 Copilot (formerly Copilot for Finance), working in Excel and Outlook",
    url: "https://learn.microsoft.com/en-us/copilot/finance/welcome",
    sources: [
      { label: "Microsoft Learn — Finance agents", url: "https://learn.microsoft.com/en-us/copilot/finance/welcome" },
      { label: "Microsoft — Finance solution in Microsoft 365 Copilot", url: "https://microsoft.com/en-us/dynamics-365/blog/it-professional/2025/10/20/empowering-finance-with-an-ai-assistant-in-microsoft-365-copilot" },
    ],
    cells: {
      builtFor: "Finance professionals working in Microsoft 365, with ERP systems such as Dynamics 365 Finance or SAP",
      worksFrom: "ERP data in Excel (reconciliation) and Outlook (collections), connected to Dynamics 365 Finance, SAP and other ERPs",
      india: NOT_STATED,
      customAgents: NOT_STATED,
      models: NOT_STATED,
      grids: NOT_STATED,
      deliverables: "Works inside Excel and Outlook",
      approvals: NOT_STATED,
      verification: NOT_STATED,
      pricing: NOT_STATED,
      security: "Runs within your Microsoft 365 tenant configuration",
    },
    chooseThem: "Your finance team runs on Dynamics 365 Finance or SAP and works all day in Excel and Outlook.",
    chooseCortex: "Your books are in Tally, Zoho Books or spreadsheets, you need GST, TDS and 43B(h) handled, and you want a team of agents that plans and runs whole tasks in the background — while still reading your Outlook and Teams.",
    keywords: ["Copilot for Finance alternative", "Microsoft 365 Copilot finance alternative", "AI finance agent for Tally"],
  },
];

export const bySlug = (slug: string) => COMPETITORS.find((c) => c.slug === slug);

/*
  The niche searches this cluster is written for. Each maps to the page that
  genuinely answers it — a keyword list with nowhere to send the reader is
  just stuffing.
*/
export const TOPICS: { q: string; a: string; href: string }[] = [
  { q: "AI agents for finance teams", a: "A CFO-led team of finance agents that plans work, reads your books and your company's mail, and hands back answers with sources.", href: "/solutions/finance" },
  { q: "AI month-end close software", a: "A close checklist built from open receivables, payables and statutory dates, and the MIS pack ready to approve.", href: "/solutions/finance" },
  { q: "GSTR-2B ITC reconciliation", a: "Input tax credit mismatches between your purchase register and GSTR-2B, supplier by supplier.", href: "/features" },
  { q: "MSME 43B(h) payment tracker", a: "Payables to micro and small suppliers past the 15/45-day window and the deduction at risk, oldest first.", href: "/features" },
  { q: "AI accounts receivable and collections agent", a: "Who owes you, ranked; reminders drafted in your name that wait for approval and stop when the invoice is paid.", href: "/solutions/finance" },
  { q: "AI for Tally and Zoho Books", a: "Reads Tally, Zoho Books, Vyapar and Busy exports as they come — no column mapping, nothing written back to your books.", href: "/business" },
  { q: "GST and TDS due-date reminders", a: "Every statutory date that applies to your registration, warned before it passes.", href: "/deadlines" },
  { q: "AI board pack and MIS reporting", a: "Board and lender commentary written from your own figures, with the emails and documents behind it cited.", href: "/solutions/finance" },
  { q: "Custom AI agents for business", a: "Agent Studio: describe a job, choose the tools, see the permission card, and the agent joins your team under the same approvals.", href: "/#studio" },
  { q: "AI that searches Outlook, Teams and SharePoint", a: "Read-only Company Knowledge across Microsoft 365 and Google Workspace, with every answer citing the email, chat or file.", href: "/#knowledge" },
];
