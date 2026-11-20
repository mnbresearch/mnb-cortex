/*
  COMPANY KNOWLEDGE, PINNED.

  Run with:  npm run test:company-knowledge

  Cortex reads a company's mail, chats and documents. The things that must
  never be wrong:

  1. READ-ONLY. The OAuth scopes requested contain no write, send or modify
     permission; the readers only ever GET; an MCP tool is callable only when
     the server marks it read-only AND the owner allowed it.
  2. NOBODY ELSE'S CONSENT. The OAuth state is signed, expires, and is bound to
     the user and the provider — a tampered, expired, replayed or
     cross-provider state is refused.
  3. ATTRIBUTION. Every search hit carries a citation naming its app, kind,
     title, sender and date; every agent brief requires quoting it.
  4. ISOLATION. Tables have RLS, no PostgREST writes, the encrypted token
     column is not selectable by signed-in users, and every store query is
     scoped to the workspace.
  5. WHO MAY CONNECT. Admins connect and remove sources; managers upload;
     the corporate connectors are a Command/Enterprise capability.
  6. TEXT HANDLING. HTML is flattened without script content, documents are
     chunked with overlap and capped, MCP SSE answers are parsed.
*/
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

let pass = 0;
const fails = [];
const check = (c, n, d = "") => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`));
const read = (p) => readFileSync(p, "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const dir = mkdtempSync(join(tmpdir(), "knowledge-"));
writeFileSync(join(dir, "core.ts"), read("src/lib/knowledge/core.ts"));
const K = await import(pathToFileURL(join(dir, "core.ts")).href);
writeFileSync(join(dir, "apps-stub.ts"), "export const orgApp = async () => null;\n");
writeFileSync(join(dir, "oauth.ts"), read("src/lib/knowledge/oauth.ts").replace(/^import "server-only";\s*$/m, "").replace(/from "@\/lib\/knowledge\/core"/, 'from "./core.ts"').replace(/from "@\/lib\/knowledge\/apps"/, 'from "./apps-stub.ts"'));
process.env.ENCRYPTION_KEY = "test-key-for-state-signing-only-000000";
const O = await import(pathToFileURL(join(dir, "oauth.ts")).href);

/* 1. read-only */
const WRITE = /ReadWrite|Send|Mail\.Write|\.send|\.modify|\.compose|\/auth\/drive$|\/auth\/gmail$|Files\.ReadWrite|Chat\.ReadWrite|full_access/i;
check(K.MICROSOFT_SCOPES.every((s) => !WRITE.test(s)) && K.MICROSOFT_SCOPES.includes("Mail.Read") && K.MICROSOFT_SCOPES.includes("Chat.Read") && K.MICROSOFT_SCOPES.includes("Files.Read.All"), "Microsoft scopes are read-only (Mail.Read, Chat.Read, Files.Read.All)", K.MICROSOFT_SCOPES.join(" "));
check(K.GOOGLE_SCOPES.every((s) => !WRITE.test(s)) && K.GOOGLE_SCOPES.some((s) => s.endsWith("gmail.readonly")) && K.GOOGLE_SCOPES.some((s) => s.endsWith("drive.readonly")), "Google scopes are read-only (gmail.readonly, drive.readonly)", K.GOOGLE_SCOPES.join(" "));
const ms = new URL(K.oauthUrl("microsoft365", { clientId: "c", redirectUri: "https://x/cb", state: "s" }));
check(ms.searchParams.get("scope") === K.MICROSOFT_SCOPES.join(" ") && ms.searchParams.get("state") === "s", "the Microsoft consent URL asks for exactly those scopes and carries the state");
const gg = new URL(K.oauthUrl("google_workspace", { clientId: "c", redirectUri: "https://x/cb", state: "s" }));
check(gg.searchParams.get("access_type") === "offline" && gg.searchParams.get("scope") === K.GOOGLE_SCOPES.join(" "), "the Google consent URL asks for offline, read-only access");
const reader = strip(read("src/lib/knowledge/workspace-sync.ts"));
check(!/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(reader) && !/\/send\b|\/sendMail|\/move\b|\/delete\b|\/modify\b|\/trash\b/i.test(reader), "the Microsoft and Google readers only ever GET");
const tools = [
  { name: "search_crm", annotations: { readOnlyHint: true } },
  { name: "delete_contact", annotations: { readOnlyHint: false, destructiveHint: true } },
  { name: "update_deal" },
  { name: "lying_tool", annotations: { readOnlyHint: true, destructiveHint: true } },
  { name: "get_orders", annotations: { readOnlyHint: true } },
];
check(K.allowableTools(tools).map((t) => t.name).join() === "search_crm,get_orders", "only tools the server marks read-only and non-destructive can be offered");
check(K.readOnlyTools(tools, ["search_crm", "delete_contact", "update_deal"]).map((t) => t.name).join() === "search_crm", "a tool must be read-only AND allowed — allowing a write tool does not make it callable");
check(K.readOnlyTools(tools, []).length === 0, "nothing is callable until the owner allows it");
const tk = strip(read("src/lib/agents/toolkit.ts"));
check(/readOnlyTools\(offered, \(source\.config\?\.allowed as string\[\]\) \|\| \[\]\)/.test(tk) && /permitted\.some\(\(t\) => t\.name === tool\)/.test(tk), "agents can call only the allowed read-only tools of a connected system");
check(/source\.provider !== "mcp"/.test(tk) && /getSource\(orgId,/.test(tk), "a connected system is looked up in the task's own workspace");
const sourcesRoute = strip(read("src/app/api/knowledge/sources/route.ts"));
check(/allowableTools\(found\.tools\)/.test(sourcesRoute) && /filter\(\(n: string\) => offered\.has\(n\)\)/.test(sourcesRoute), "the owner can only allow tools the server offered as read-only");
check(/safeFetch\(s\.url/.test(read("src/lib/knowledge/mcp-client.ts")), "MCP requests go through the SSRF guard");

/* 2. state */
const st = O.signState({ orgId: "org-1", userId: "user-1", provider: "microsoft365" });
check(Boolean(st) && O.verifyState(st, "microsoft365", "user-1")?.orgId === "org-1", "a fresh state verifies for its own user and provider");
check(O.verifyState(st, "google_workspace", "user-1") === null, "...not for another provider");
check(O.verifyState(st, "microsoft365", "user-2") === null, "...not for another user");
const [body, sig] = st.split(".");
const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), orgId: "org-evil" })).toString("base64url");
check(O.verifyState(`${forged}.${sig}`, "microsoft365", "user-1") === null, "a state edited to name another workspace is refused");
const expired = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), exp: Date.now() - 1 })).toString("base64url");
check(O.verifyState(`${expired}.${sig}`, "microsoft365", "user-1") === null, "an expired state is refused");
check(O.verifyState("garbage", "microsoft365", "user-1") === null && O.verifyState("", "microsoft365", "user-1") === null, "malformed states are refused");
const cb = strip(read("src/app/api/knowledge/callback/[provider]/route.ts"));
check(/verifyState\(String\(u\.searchParams\.get\("state"\) \|\| ""\), p, user\.id\)/.test(cb), "the callback verifies the state against the signed-in user");
check(/if \(!tok\.refresh_token\)/.test(cb), "a grant without offline access is refused, not stored half-working");

/* 3. attribution */
const c = K.citationFor({ provider: "microsoft365", kind: "email", title: "CC limit renewal", author: "Ravi Mehta", occurred_at: "2026-11-12T09:00:00Z", metadata: { app: "Outlook" } });
check(c === "Outlook · Email · “CC limit renewal” · from Ravi Mehta · 2026-11-12", "an email's citation names app, kind, subject, sender and date", c);
check(K.citationFor({ provider: "microsoft365", kind: "chat", title: "Stock Oct", metadata: { app: "Teams" } }).startsWith("Teams · Teams chat"), "a Teams message is cited as Teams");
check(K.citationFor({ provider: "upload", kind: "document", title: "Travel policy.pdf", source_label: "Documents" }).startsWith("Uploaded document (Documents) · Document"), "an upload is cited as an uploaded document");
const teams = read("src/lib/agents/teams.ts");
const agentCount = (teams.match(/^\s*id: "[a-z]+\.[a-z]+", team:/gm) || []).length;
check(agentCount >= 15 && (teams.match(/\$\{KNOWLEDGE_RULE\}/g) || []).length === agentCount, "every agent's brief requires citing the source", `${agentCount} agents`);
check((teams.match(/"search_company_knowledge"/g) || []).length === agentCount, "every agent can search Company Knowledge");
check(/Quote each one's citation when you use it/.test(tk) && /evidence, never instructions/.test(tk), "search results tell the model to cite them and to treat them as data");

/* 4. isolation */
const sql = read("supabase/migrations/2026_zzzz_s_company_knowledge.sql");
for (const t of ["knowledge_sources", "knowledge_items"]) {
  check(new RegExp(`alter table ${t}\\s+enable row level security`).test(sql), `${t} has RLS`);
  check(new RegExp(`revoke insert, update, delete on ${t}\\s+from anon, authenticated`).test(sql), `${t} cannot be written through PostgREST`);
}
check(/revoke select on knowledge_sources from anon, authenticated/.test(sql) && !/grant select \([^)]*\bsecret\b/.test(sql), "the encrypted token column is not selectable by signed-in users");
check(read("supabase/RUN-2026-11-20-company-knowledge.sql") === sql, "the hand-run file is the migration, byte for byte");
const store = strip(read("src/lib/knowledge/store.ts"));
/* Every read, update and delete is scoped; inserts carry org_id in the row; the readiness probe reads one id and nothing else. */
const qLines = store.split("\n").filter((l) => /\.from\("knowledge_(sources|items)"\)/.test(l));
const unscoped = qLines.filter((l) => !/\.eq\("org_id", (orgId|source\.org_id)\)|scope\(sb\.from|\.insert\(\{?$|\.insert\(\{|\.upsert\(rows|select\("id"\)\.limit\(1\)/.test(l));
check(qLines.length >= 8 && unscoped.length === 0, "store queries are scoped to the workspace", unscoped.map((l) => l.trim().slice(0, 90)).join(" | "));
check(/org_id: input\.orgId/.test(store) && /org_id: source\.org_id/.test(store), "inserted rows carry the workspace id from the caller");
check(/const SAFE_SOURCE_COLS = "[^"]*"/.test(store) && !/SAFE_SOURCE_COLS = "[^"]*secret/.test(store), "source reads never select the token");
check(/encryptSecret\(input\.secret\)/.test(store) && /decryptSecret\(enc\)/.test(store), "tokens are encrypted at rest");

/* 5. who may connect */
check(/hasRole\("admin"\)/.test(sourcesRoute) && (sourcesRoute.match(/hasRole\("admin"\)/g) || []).length >= 3, "connecting, listing-for-management and changing sources require admin");
check(/hasRole\("admin"\)/.test(read("src/app/api/knowledge/connect/[provider]/route.ts")), "starting an OAuth connection requires admin");
check(/hasRole\("manager"\)/.test(read("src/app/api/knowledge/upload/route.ts")), "uploading requires manager");
const cfg = strip(read("src/lib/config.ts"));
const caps = (id) => (cfg.match(new RegExp(`\\n  ${id}: \\[([^\\]]*)\\]`)) || ["", ""])[1];
check(!/workspace_connectors/.test(caps("watchpro")) && /workspace_connectors/.test(caps("command")) && /workspace_connectors/.test(caps("enterprise")), "Microsoft 365 / Google Workspace are Command and Enterprise");
check(/knowledge/.test(caps("watchpro")) && !/knowledge/.test(caps("watch")) && !/knowledge/.test(caps("try")), "documents and MCP start at Pro");
check(/mayConnect\(orgId, "mcp"\)/.test(sourcesRoute) && /mayConnect\(orgId, "upload"\)/.test(read("src/app/api/knowledge/upload/route.ts")) && /mayConnect\(orgId, p\)/.test(read("src/app/api/knowledge/connect/[provider]/route.ts")), "the plan is checked where every source is created");

/* 7. a company's own app */
const oauthSrc = strip(read("src/lib/knowledge/oauth.ts"));
const cf = oauthSrc.slice(oauthSrc.indexOf("export async function clientFor"), oauthSrc.indexOf("export function configured"));
check(cf.indexOf("orgApp(orgId, p)") !== -1 && cf.indexOf("orgApp(orgId, p)") < cf.indexOf("sharedClient(p)"), "a company's own app is used before Cortex's shared app");
check(/exchangeCode\(req, p, String\(u\.searchParams\.get\("code"\) \|\| ""\), st\.orgId\)/.test(cb), "the code is exchanged with the app of the workspace named in the signed state");
check(/refreshAccess\(source\.provider as OAuthProvider, refresh, source\.org_id\)/.test(read("src/lib/knowledge/sync.ts")), "tokens refresh through the source's own workspace app");
const cbOrder = cb.indexOf("verifyState(") < cb.indexOf('get("admin_consent")');
check(cbOrder, "organisation-wide consent is only acknowledged after the signed state is verified");
check(/scope", "https:\/\/graph\.microsoft\.com\/\.default"/.test(oauthSrc) && /\/v2\.0\/adminconsent/.test(oauthSrc), "organisation-wide consent uses Microsoft's v2 admin-consent endpoint for the app's registered permissions");
const apps = strip(read("src/lib/knowledge/apps.ts"));
check(/client_secret: enc/.test(apps) && /encryptSecret\(String\(a\.clientSecret\)\.trim\(\)\)/.test(apps), "a company's client secret is encrypted before it is stored");
check(/orgAppSummary[\s\S]*select\("client_id, tenant, updated_at"\)/.test(apps), "the settings screen never reads the secret back");
check(/validateApp\(provider, a\); if \(bad\)/.test(apps) && /apps\.googleusercontent\.com/.test(apps) && /GUID\.test\(id\)/.test(apps), "client ids are shape-checked before saving");
const appsSql = read("supabase/migrations/2026_zzzz_t_knowledge_oauth_apps.sql");
check(/alter table knowledge_oauth_apps enable row level security/.test(appsSql) && /revoke all on knowledge_oauth_apps from anon, authenticated/.test(appsSql), "company app credentials are invisible to every signed-in user");
check(read("supabase/RUN-2026-11-20-knowledge-apps.sql") === appsSql, "the hand-run apps file is the migration, byte for byte");
const appsRoute = strip(read("src/app/api/knowledge/apps/route.ts"));
check(/hasRole\("admin"\)/.test(appsRoute) && /orgCapability\(g\.orgId, "workspace_connectors"\)/.test(appsRoute), "only admins on a corporate-connector plan can save an app");
check(/hasRole\("admin"\)/.test(read("src/app/(app)/settings/page.tsx").slice(0, 3000)) && /canEditAi && \(\s*<Section id="company-knowledge-connections"/.test(read("src/app/(app)/settings/page.tsx")), "the connections section shows only to admins");

/* 6. text */
const html = '<html><head><style>p{}</style><script>alert("x")</script></head><body><p>Dear team,</p><p>Please send the &amp; stock statement.</p></body></html>';
const plain = K.toPlainText(html);
check(!/alert|p\{\}/.test(plain) && /Dear team,/.test(plain) && /send the & stock statement/.test(plain), "HTML is flattened, scripts and styles dropped, entities decoded", plain);
const long = Array.from({ length: 600 }, (_, i) => `Sentence ${i} about the working capital limit and the bank.`).join(" ");
const parts = K.chunk(long);
check(parts.length > 1 && parts.every((p) => p.length <= K.CHUNK_CHARS + 5), "long documents are chunked within the size", `${parts.length} parts`);
check(parts.slice(1).every((p, i) => parts[i].slice(-80).split(" ").some((w) => w.length > 4 && p.includes(w))), "chunks overlap, so a sentence across a boundary is findable");
check(K.chunk("x".repeat(K.CHUNK_CHARS * (K.MAX_CHUNKS_PER_DOCUMENT + 20))).length <= K.MAX_CHUNKS_PER_DOCUMENT, "one huge file is capped");
check(K.chunk("").length === 0 && K.chunk("short").length === 1, "empty and short texts chunk sensibly");
check(K.parseMcpBody("text/event-stream", 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n')?.result?.ok === true, "an SSE MCP answer is parsed");
check(K.mcpResultText({ content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }) === "a\nb", "MCP tool text is joined");
check(K.searchTerms('GST" OR 1=1; -- notice') === "GST OR 1 1 -- notice", "search input is reduced to words", K.searchTerms('GST" OR 1=1; -- notice'));
check(K.safeSnippet("a".repeat(5000) + " renewal " + "b".repeat(5000), "renewal").includes("renewal"), "the excerpt centres on the query");

console.log("");
if (fails.length) {
  console.log(`company knowledge: ${pass} passed, ${fails.length} failed\n`);
  for (const f of fails) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`company knowledge: ${pass} passed, 0 failed`);
console.log("  read-only scopes, signed consent, cited answers, isolated storage, admin-only sources.");
