import "server-only";
import { toPlainText, chunk } from "@/lib/knowledge/core";
import { canExtract, extractText } from "@/lib/knowledge/files";
import type { ItemInput } from "@/lib/knowledge/store";

/*
  Readers for Microsoft 365 and Google Workspace. Each takes a fresh access
  token and a "since" date and returns items; it never writes anything to the
  provider (the scopes are read-only, and every call here is a GET).

  Bounded on purpose: one sync reads at most a few hundred items and a few
  dozen files, so a large mailbox fills in over several syncs instead of one
  sync timing out. Every list follows its provider's paging until the cap.
*/

const MAIL_CAP = 200;
const CHAT_CAP = 15;
const CHAT_MESSAGES = 30;
const FILE_CAP = 25;
const FILE_MAX_BYTES = 5 * 1024 * 1024;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
const authed = (token: string): Fetcher => (url, init = {}) =>
  fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });

async function json(f: Fetcher, url: string, headers: Record<string, string> = {}): Promise<any> {
  const r = await f(url, { headers });
  if (r.status === 401) throw Object.assign(new Error("The account's sign-in has expired."), { reauth: true });
  if (!r.ok) throw new Error(`${new URL(url).hostname} returned HTTP ${r.status}`);
  return r.json();
}

function fileItems(base: Omit<ItemInput, "content" | "external_id">, id: string, text: string): ItemInput[] {
  const parts = chunk(text);
  return parts.map((c, i) => ({ ...base, external_id: parts.length > 1 ? `${id}#${i}` : id, content: c, metadata: { ...(base.metadata || {}), part: i + 1, parts: parts.length } }));
}

/* ------------------------------------------------------------------ Microsoft 365 */

export async function microsoftAccount(token: string): Promise<string | null> {
  try { const me = await json(authed(token), "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName"); return me.mail || me.userPrincipalName || null; } catch { return null; }
}

export async function syncMicrosoft(token: string, since: Date, scopes: string[]): Promise<{ items: ItemInput[]; notes: string[] }> {
  const f = authed(token);
  const items: ItemInput[] = [];
  const notes: string[] = [];
  const G = "https://graph.microsoft.com/v1.0";

  if (scopes.includes("mail")) {
    try {
      let url: string | null = `${G}/me/messages?$top=50&$orderby=receivedDateTime desc&$filter=receivedDateTime ge ${since.toISOString()}&$select=id,subject,from,receivedDateTime,body,webLink,hasAttachments`;
      let n = 0;
      while (url && n < MAIL_CAP) {
        const page: any = await json(f, url, { Prefer: 'outlook.body-content-type="text"' });
        for (const m of page.value || []) {
          if (n >= MAIL_CAP) break;
          n++;
          items.push({
            kind: "email", external_id: `mail:${m.id}`, title: m.subject || "(no subject)",
            author: m.from?.emailAddress?.name || m.from?.emailAddress?.address || null, occurred_at: m.receivedDateTime || null,
            url: m.webLink || null, content: toPlainText(m.body?.content || "").slice(0, 20_000), metadata: { app: "Outlook", attachments: Boolean(m.hasAttachments) },
          });
        }
        url = page["@odata.nextLink"] || null;
      }
      if (n >= MAIL_CAP) notes.push(`Read the newest ${MAIL_CAP} emails; older mail fills in on the next syncs.`);
    } catch (e: any) { if (e?.reauth) throw e; notes.push(`Outlook: ${e.message}`); }
  }

  if (scopes.includes("chats")) {
    try {
      const chats: any = await json(f, `${G}/me/chats?$top=${CHAT_CAP}&$orderby=lastMessagePreview/createdDateTime desc`);
      for (const c of (chats.value || []).slice(0, CHAT_CAP)) {
        try {
          const msgs: any = await json(f, `${G}/chats/${encodeURIComponent(c.id)}/messages?$top=${CHAT_MESSAGES}`);
          for (const m of msgs.value || []) {
            if (m.messageType && m.messageType !== "message") continue;
            if (m.createdDateTime && new Date(m.createdDateTime) < since) continue;
            const text = toPlainText(m.body?.content || "");
            if (!text) continue;
            items.push({
              kind: "chat", external_id: `chat:${c.id}:${m.id}`, title: c.topic || "Teams chat",
              author: m.from?.user?.displayName || null, occurred_at: m.createdDateTime || null, url: c.webUrl || null,
              content: text.slice(0, 8000), metadata: { app: "Teams", chat: c.topic || null },
            });
          }
        } catch (e: any) { if (e?.reauth) throw e; }
      }
    } catch (e: any) { if (e?.reauth) throw e; notes.push(`Teams: ${e.message}`); }
  }

  if (scopes.includes("files")) {
    try {
      const recent: any = await json(f, `${G}/me/drive/recent?$top=${FILE_CAP}`);
      for (const d of (recent.value || []).slice(0, FILE_CAP)) {
        const name = d.name || "file";
        if (!d.file || (d.size || 0) > FILE_MAX_BYTES || !canExtract(name, d.file?.mimeType)) continue;
        const driveId = d.parentReference?.driveId || d.remoteItem?.parentReference?.driveId;
        const itemId = d.remoteItem?.id || d.id;
        if (!driveId || !itemId) continue;
        try {
          const r = await f(`${G}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`);
          if (!r.ok) continue;
          const x = await extractText(name, new Uint8Array(await r.arrayBuffer()), d.file?.mimeType);
          if (!x.ok || !x.text.trim()) continue;
          items.push(...fileItems({ kind: "document", title: name, author: d.lastModifiedBy?.user?.displayName || d.createdBy?.user?.displayName || null, occurred_at: d.lastModifiedDateTime || null, url: d.webUrl || null, metadata: { app: d.webUrl?.includes("sharepoint.com") ? "SharePoint" : "OneDrive" } }, `file:${itemId}`, x.text));
        } catch { /* one unreadable file never fails the sync */ }
      }
    } catch (e: any) { if (e?.reauth) throw e; notes.push(`OneDrive/SharePoint: ${e.message}`); }
  }
  return { items, notes };
}

/* ------------------------------------------------------------------ Google Workspace */

export async function googleAccount(token: string): Promise<string | null> {
  try { const me = await json(authed(token), "https://openidconnect.googleapis.com/v1/userinfo"); return me.email || null; } catch { return null; }
}

function b64url(s: string): string {
  try { return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"); } catch { return ""; }
}

function gmailBody(payload: any): string {
  const plain: string[] = [], html: string[] = [];
  const walk = (p: any) => {
    if (!p) return;
    if (p.mimeType === "text/plain" && p.body?.data) plain.push(b64url(p.body.data));
    else if (p.mimeType === "text/html" && p.body?.data) html.push(b64url(p.body.data));
    for (const c of p.parts || []) walk(c);
  };
  walk(payload);
  return plain.length ? plain.join("\n") : toPlainText(html.join("\n"));
}

export async function syncGoogle(token: string, since: Date, scopes: string[]): Promise<{ items: ItemInput[]; notes: string[] }> {
  const f = authed(token);
  const items: ItemInput[] = [];
  const notes: string[] = [];

  if (scopes.includes("mail")) {
    try {
      const days = Math.max(1, Math.ceil((Date.now() - since.getTime()) / 86_400_000));
      const ids: string[] = [];
      let pageToken = "";
      while (ids.length < MAIL_CAP) {
        const list: any = await json(f, `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=${encodeURIComponent(`newer_than:${days}d -in:chats`)}${pageToken ? `&pageToken=${pageToken}` : ""}`);
        for (const m of list.messages || []) ids.push(m.id);
        if (!list.nextPageToken) break;
        pageToken = list.nextPageToken;
      }
      const take = ids.slice(0, MAIL_CAP);
      for (let i = 0; i < take.length; i += 8) {
        const batch = await Promise.all(take.slice(i, i + 8).map((id) => json(f, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`).catch(() => null)));
        for (const m of batch) {
          if (!m) continue;
          const h = (n: string) => (m.payload?.headers || []).find((x: any) => String(x.name).toLowerCase() === n)?.value || null;
          items.push({
            kind: "email", external_id: `gmail:${m.id}`, title: h("subject") || "(no subject)", author: h("from"),
            occurred_at: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null,
            url: `https://mail.google.com/mail/u/0/#all/${m.id}`, content: (gmailBody(m.payload) || m.snippet || "").slice(0, 20_000), metadata: { app: "Gmail" },
          });
        }
      }
      if (ids.length >= MAIL_CAP) notes.push(`Read the newest ${MAIL_CAP} emails; older mail fills in on the next syncs.`);
    } catch (e: any) { if (e?.reauth) throw e; notes.push(`Gmail: ${e.message}`); }
  }

  if (scopes.includes("files")) {
    try {
      const q = encodeURIComponent(`trashed = false and modifiedTime > '${since.toISOString()}'`);
      const list: any = await json(f, `https://www.googleapis.com/drive/v3/files?pageSize=${FILE_CAP}&orderBy=modifiedTime desc&q=${q}&fields=files(id,name,mimeType,modifiedTime,webViewLink,size,owners(displayName),lastModifyingUser(displayName))`);
      for (const d of (list.files || []).slice(0, FILE_CAP)) {
        try {
          let text = "";
          if (d.mimeType === "application/vnd.google-apps.document" || d.mimeType === "application/vnd.google-apps.presentation") {
            const r = await f(`https://www.googleapis.com/drive/v3/files/${d.id}/export?mimeType=text/plain`); if (r.ok) text = await r.text();
          } else if (d.mimeType === "application/vnd.google-apps.spreadsheet") {
            const r = await f(`https://www.googleapis.com/drive/v3/files/${d.id}/export?mimeType=text/csv`); if (r.ok) text = await r.text();
          } else if (Number(d.size || 0) <= FILE_MAX_BYTES && canExtract(d.name || "", d.mimeType)) {
            const r = await f(`https://www.googleapis.com/drive/v3/files/${d.id}?alt=media`);
            if (r.ok) { const x = await extractText(d.name || "file", new Uint8Array(await r.arrayBuffer()), d.mimeType); if (x.ok) text = x.text; }
          }
          if (!text.trim()) continue;
          items.push(...fileItems({ kind: "document", title: d.name || "Drive file", author: d.lastModifyingUser?.displayName || d.owners?.[0]?.displayName || null, occurred_at: d.modifiedTime || null, url: d.webViewLink || null, metadata: { app: "Google Drive" } }, `drive:${d.id}`, text));
        } catch { /* one unreadable file never fails the sync */ }
      }
    } catch (e: any) { if (e?.reauth) throw e; notes.push(`Google Drive: ${e.message}`); }
  }
  return { items, notes };
}
