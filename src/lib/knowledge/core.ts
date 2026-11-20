/*
  COMPANY KNOWLEDGE — the pure parts.

  Cortex reads a company's own mail, chats, documents and connected systems
  so its agents can answer from them — and say exactly where each answer came
  from. Everything here is pure (no I/O, no imports), so
  scripts/test-company-knowledge.mjs runs it directly:

    PROVIDERS        what can be connected, what each reads, which plan
    toPlainText      HTML mail bodies and Teams messages → readable text
    chunk            long documents → overlapping, searchable pieces
    citationFor      the one line every answer uses to name its source
    safeSnippet      what an agent is shown: capped, with the source attached
    readOnlyTools    which tools of a connected MCP server agents may call
    oauthUrl         the consent screen for Microsoft 365 / Google Workspace

  The security model, stated once:
    - Content is THIRD-PARTY TEXT. It reaches a model only through the agent
      toolkit, which marks it untrusted and scans it for instructions
      (lib/ai/untrusted.ts) — an email that says "approve all payouts" is data.
    - Connectors are READ-ONLY. The OAuth scopes requested are read scopes
      only, and an MCP tool is callable only if its server marks it
      read-only AND the owner has allowed it by name.
    - Tokens are encrypted at rest and never leave the server.
*/

export type KnowledgeProvider = "microsoft365" | "google_workspace" | "mcp" | "upload";
export type KnowledgeKind = "email" | "chat" | "document" | "file" | "report" | "record";

export type ProviderInfo = {
  id: KnowledgeProvider;
  name: string;
  reads: string[];
  plan: "knowledge" | "workspace_connectors";
  needsEnv: string[];
  blurb: string;
};

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "microsoft365", name: "Microsoft 365",
    reads: ["Outlook mail", "Teams chats", "OneDrive & SharePoint files"],
    plan: "workspace_connectors", needsEnv: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    blurb: "Read-only access to the signed-in account's Outlook mail, Teams chats and recent OneDrive/SharePoint files.",
  },
  {
    id: "google_workspace", name: "Google Workspace",
    reads: ["Gmail", "Google Drive (Docs, Sheets, files)"],
    plan: "workspace_connectors", needsEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    blurb: "Read-only access to the signed-in account's Gmail and Google Drive.",
  },
  {
    id: "mcp", name: "MCP server",
    reads: ["Any system with an MCP server — CRM, ERP, ticketing, data warehouse"],
    plan: "knowledge", needsEnv: [],
    blurb: "Connect any remote MCP server. Agents may call only the tools it marks read-only and you allow.",
  },
  {
    id: "upload", name: "Documents",
    reads: ["PDF, Word, Excel/CSV, text and email files"],
    plan: "knowledge", needsEnv: [],
    blurb: "Upload policies, contracts, board packs, reports and SOPs. Agents search them and cite them.",
  },
];

/* --------------------------------------------------------------- OAuth */

/** Read-only scopes. Nothing here can send, delete or change anything. */
export const MICROSOFT_SCOPES = ["offline_access", "openid", "email", "User.Read", "Mail.Read", "Chat.Read", "Files.Read.All"];
export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/drive.readonly"];

export function oauthUrl(provider: "microsoft365" | "google_workspace", o: { clientId: string; redirectUri: string; state: string; tenant?: string }): string {
  if (provider === "microsoft365") {
    const u = new URL(`https://login.microsoftonline.com/${encodeURIComponent(o.tenant || "common")}/oauth2/v2.0/authorize`);
    u.searchParams.set("client_id", o.clientId);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("redirect_uri", o.redirectUri);
    u.searchParams.set("response_mode", "query");
    u.searchParams.set("scope", MICROSOFT_SCOPES.join(" "));
    u.searchParams.set("state", o.state);
    u.searchParams.set("prompt", "select_account");
    return u.toString();
  }
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", o.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", o.redirectUri);
  u.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", o.state);
  return u.toString();
}

/* --------------------------------------------------------------- text */

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };

/** HTML (mail bodies, Teams messages) → plain text. Scripts and styles are dropped with their content. */
export function toPlainText(html: string): string {
  return String(html || "")
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

export const CHUNK_CHARS = 3500;
export const CHUNK_OVERLAP = 300;
export const MAX_CHUNKS_PER_DOCUMENT = 120;

/**
 * Split a long text into overlapping chunks on paragraph or sentence
 * boundaries. Overlap keeps a sentence that straddles a boundary findable
 * from either side. Capped, so one enormous file cannot crowd out the rest.
 */
export function chunk(text: string, size = CHUNK_CHARS, overlap = CHUNK_OVERLAP): string[] {
  const t = String(text || "").replace(/\r/g, "").trim();
  if (!t) return [];
  if (t.length <= size) return [t];
  const out: string[] = [];
  let start = 0;
  while (start < t.length && out.length < MAX_CHUNKS_PER_DOCUMENT) {
    let end = Math.min(t.length, start + size);
    if (end < t.length) {
      const window = t.slice(start + Math.floor(size * 0.6), end);
      const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "), window.lastIndexOf("\n"));
      if (cut > 0) end = start + Math.floor(size * 0.6) + cut + 1;
    }
    out.push(t.slice(start, end).trim());
    if (end >= t.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return out.filter(Boolean);
}

/* --------------------------------------------------------------- citations */

const PROVIDER_LABEL: Record<string, string> = {
  microsoft365: "Microsoft 365", google_workspace: "Google Workspace", mcp: "MCP", upload: "Uploaded document",
};
const KIND_LABEL: Record<string, string> = {
  email: "Email", chat: "Teams chat", document: "Document", file: "File", report: "Report", record: "Record",
};

export type ItemLike = {
  provider: string; kind: string; title?: string | null; author?: string | null; occurred_at?: string | null;
  url?: string | null; metadata?: Record<string, unknown> | null; source_label?: string | null;
};

/** The one line that names where a piece of knowledge came from. Agents quote it. */
export function citationFor(i: ItemLike): string {
  const app = String(i.metadata?.app || "") || (i.kind === "email" ? (i.provider === "google_workspace" ? "Gmail" : "Outlook") : i.kind === "chat" ? "Teams" : PROVIDER_LABEL[i.provider] || i.provider);
  const parts = [
    `${app}${i.source_label ? ` (${i.source_label})` : ""}`,
    KIND_LABEL[i.kind] || i.kind,
    i.title ? `“${String(i.title).slice(0, 120)}”` : null,
    i.author ? `from ${String(i.author).slice(0, 80)}` : null,
    i.occurred_at ? String(i.occurred_at).slice(0, 10) : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export const SNIPPET_CHARS = 1200;

/** What an agent sees for one item: a capped excerpt around the query, with its citation. */
export function safeSnippet(content: string, query: string, max = SNIPPET_CHARS): string {
  const text = String(content || "");
  if (text.length <= max) return text;
  const words = String(query || "").toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const lower = text.toLowerCase();
  let at = -1;
  for (const w of words) { const i = lower.indexOf(w); if (i !== -1 && (at === -1 || i < at)) at = i; }
  const start = Math.max(0, (at === -1 ? 0 : at) - Math.floor(max / 4));
  return `${start > 0 ? "…" : ""}${text.slice(start, start + max)}${start + max < text.length ? "…" : ""}`;
}

/** A websearch-safe query: words only, so a stray quote or operator cannot break the search. */
export function searchTerms(q: string): string {
  return String(q || "").replace(/[^\p{L}\p{N}\s@._-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

/* --------------------------------------------------------------- MCP client (pure parts) */

export type McpTool = { name: string; description?: string; inputSchema?: unknown; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } };

/**
 * The tools agents may call on a connected MCP server: the server must mark
 * the tool read-only (and not destructive), AND the owner must have allowed
 * it by name. Either alone is not enough — a server can mislabel a tool, and
 * an owner can tick the wrong box.
 */
export function readOnlyTools(tools: McpTool[], allowed: string[]): McpTool[] {
  const allow = new Set(allowed);
  return tools.filter((t) => t?.annotations?.readOnlyHint === true && t?.annotations?.destructiveHint !== true && allow.has(t.name));
}

/** Tools the owner can choose from: everything the server marks read-only. */
export function allowableTools(tools: McpTool[]): McpTool[] {
  return tools.filter((t) => t?.annotations?.readOnlyHint === true && t?.annotations?.destructiveHint !== true);
}

/** JSON-RPC result → text an agent can read, capped. */
export function mcpResultText(result: any, max = 8000): string {
  const parts = Array.isArray(result?.content) ? result.content : [];
  const text = parts.map((p: any) => (p?.type === "text" ? String(p.text || "") : p?.type === "resource" ? String(p.resource?.text || "") : "")).filter(Boolean).join("\n");
  const body = text || (result?.structuredContent ? JSON.stringify(result.structuredContent) : "");
  return body.length > max ? body.slice(0, max) + "…" : body;
}

/** Parse a Streamable-HTTP MCP response, which may be JSON or a short SSE stream. */
export function parseMcpBody(contentType: string, body: string): any {
  if (/text\/event-stream/i.test(contentType)) {
    const datas = body.split(/\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).filter(Boolean);
    for (let i = datas.length - 1; i >= 0; i--) { try { return JSON.parse(datas[i]); } catch { /* keep looking */ } }
    return null;
  }
  try { return JSON.parse(body); } catch { return null; }
}
