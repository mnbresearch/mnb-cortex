"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Check, Loader2, ShieldCheck, Building2, KeyRound, ChevronDown, ChevronRight, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

/*
  Settings → Company Knowledge connections.

  Two ways to pair, side by side, with every value an IT admin has to type
  shown here and copyable:
    A. Cortex's shared app (no registration): Microsoft admins grant
       organisation-wide consent once; then mailboxes connect with one click.
    B. Your company's own app: register it in your own Entra ID tenant or
       Google Cloud organisation using the redirect URI and permissions shown,
       then paste the client id and secret here.
*/

type Summary = { saved: boolean; clientId: string | null; tenant: string | null; updatedAt: string | null };
type P = { shared: boolean; own: Summary; redirectUri: string; permissions: string[] };
type Data = { ready: boolean; allowedByPlan: boolean; providers: { microsoft365: P; google_workspace: P } };

function CopyField({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
        <code className="text-xs break-all flex-1">{value}</code>
        <button type="button" aria-label={`Copy ${label}`} onClick={() => { navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }} className="text-muted-foreground hover:text-foreground">
          {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return <ol className="list-decimal pl-5 space-y-1.5 text-sm">{items.map((x, i) => <li key={i}>{x}</li>)}</ol>;
}

function OwnAppForm({ provider, p, onDone }: { provider: "microsoft365" | "google_workspace"; p: P; onDone: () => void }) {
  const [f, setF] = useState({ clientId: "", clientSecret: "", tenant: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ms = provider === "microsoft365";
  async function save() {
    setBusy(true); setMsg(null);
    try {
      const j = await (await fetch("/api/knowledge/apps", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, ...f }) })).json();
      if (!j.ok) setMsg(j.error); else { setF({ clientId: "", clientSecret: "", tenant: "" }); setMsg("Saved. Connect a mailbox from Company Knowledge to test it."); onDone(); }
    } finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm("Stop using your company's own app? Connections will use Cortex's shared app if it is available; existing mailboxes may need to sign in again.")) return;
    await fetch("/api/knowledge/apps", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider }) });
    onDone();
  }
  return (
    <div className="space-y-3">
      {p.own.saved && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm">
          <Check className="h-4 w-4 text-success" /> Your app is saved — client ID <code className="text-xs">{p.own.clientId}</code>{p.own.tenant ? <> · tenant <code className="text-xs">{p.own.tenant}</code></> : null}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={remove}><Trash2 className="h-3.5 w-3.5" /> Remove</Button>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <input aria-label={ms ? "Application (client) ID" : "Client ID"} value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}
          placeholder={ms ? "Application (client) ID — 1a2b3c4d-…" : "Client ID — …apps.googleusercontent.com"} className="h-9 rounded-lg border bg-background px-3 text-sm" />
        <input aria-label="Client secret" type="password" value={f.clientSecret} onChange={(e) => setF({ ...f, clientSecret: e.target.value })}
          placeholder={ms ? "Client secret — the Value, not the Secret ID" : "Client secret"} className="h-9 rounded-lg border bg-background px-3 text-sm" />
        {ms && <input aria-label="Directory (tenant) ID" value={f.tenant} onChange={(e) => setF({ ...f, tenant: e.target.value })}
          placeholder="Directory (tenant) ID, or yourcompany.onmicrosoft.com" className="h-9 rounded-lg border bg-background px-3 text-sm sm:col-span-2" />}
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={busy || !f.clientId || !f.clientSecret}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} {p.own.saved ? "Replace" : "Save"} app</Button>
        <span className="text-[11px] text-muted-foreground">The secret is encrypted and never shown again.</span>
      </div>
      {msg && <p className="text-xs text-muted-foreground" role="status">{msg}</p>}
    </div>
  );
}

export function KnowledgeConnections() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const load = useCallback(async () => {
    try { const j = await (await fetch("/api/knowledge/apps", { cache: "no-store" })).json(); if (j.ok) setD(j); else setErr(j.error); }
    catch { setErr("Could not load connection settings."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err) return <p className="text-sm text-muted-foreground">{err}</p>;
  if (!d) return <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>;
  if (!d.allowedByPlan) return <p className="text-sm text-muted-foreground">Microsoft 365 and Google Workspace connections are part of the Command and Enterprise plans. <Link href="/billing" className="underline">See plans</Link>. Documents and MCP servers are on Pro and above, under <Link href="/knowledge" className="underline">Company Knowledge</Link>.</p>;

  const ms = d.providers.microsoft365, g = d.providers.google_workspace;
  const using = (p: P) => p.own.saved ? "Using your company's own app" : p.shared ? "Using Cortex's shared app" : "Not set up yet — add your company's app below";
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  return (
    <div className="space-y-6">
      {!d.ready && <p className="text-sm rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">To save your own app, run <code>supabase/RUN-2026-11-20-knowledge-apps.sql</code> in Supabase first. Cortex&rsquo;s shared app works without it.</p>}
      <p className="text-sm text-muted-foreground flex items-start gap-2"><ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        Read-only either way: Cortex asks only for permissions to read mail, chats and files. Nothing can be sent, deleted or changed. Only workspace admins see this page.</p>

      {/* ---------------- Microsoft 365 ---------------- */}
      <div className="rounded-xl border p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2"><Building2 className="h-5 w-5 text-primary" /><h3 className="font-semibold">Microsoft 365 — Outlook, Teams, OneDrive &amp; SharePoint</h3><span className="ml-auto text-xs text-muted-foreground">{using(ms)}</span></div>

        {(ms.shared || ms.own.saved) && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Pair in two clicks</p>
            <Steps items={[
              <>A <strong>Global Administrator</strong> or <strong>Cloud Application Administrator</strong> of your Microsoft tenant presses <em>Grant organisation-wide consent</em> and approves Cortex&rsquo;s read-only permissions — once, for the whole company.</>,
              <>Each person whose mail Cortex should read (or the admin, for a shared mailbox they can open) presses <em>Connect Microsoft 365</em> on Company Knowledge. No permission prompt appears.</>,
            ]} />
            <div className="flex flex-wrap gap-2 pt-1">
              <a href="/api/knowledge/connect/microsoft365?admin=1" className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground h-9 px-4 text-sm font-medium hover:opacity-90">Grant organisation-wide consent</a>
              <Link href="/knowledge" className="inline-flex items-center gap-1.5 rounded-lg border h-9 px-4 text-sm font-medium hover:bg-accent">Connect a mailbox</Link>
            </div>
            <p className="text-[11px] text-muted-foreground">If your tenant lets users approve apps themselves, step 1 is optional — the first person to connect sees the prompt instead.</p>
          </div>
        )}

        <button type="button" onClick={() => toggle("ms")} className="flex items-center gap-1 text-sm font-medium" aria-expanded={!!open.ms}>
          {open.ms ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} {ms.own.saved ? "Your company's own app" : "Use your company's own app instead"} <span className="text-xs font-normal text-muted-foreground">(for tenants that only allow apps registered inside them)</span>
        </button>
        {(open.ms || (!ms.shared && !ms.own.saved)) && (
          <div className="space-y-4 pl-1">
            <Steps items={[
              <>Open <a className="underline inline-flex items-center gap-0.5" href="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener noreferrer">Microsoft Entra admin centre → App registrations <ExternalLink className="h-3 w-3" /></a> → <strong>New registration</strong>. Name: <em>Cortex</em>. Supported account types: <em>Accounts in this organizational directory only</em>.</>,
              <>Redirect URI: platform <strong>Web</strong>, value below. Register.</>,
              <><strong>API permissions</strong> → Add a permission → Microsoft Graph → <strong>Delegated</strong>: tick the permissions below → Add. Then <strong>Grant admin consent for your organisation</strong>.</>,
              <><strong>Certificates &amp; secrets</strong> → New client secret (24 months) → copy its <strong>Value</strong> straight away.</>,
              <>From <strong>Overview</strong>, copy the <strong>Application (client) ID</strong> and <strong>Directory (tenant) ID</strong>. Paste all three below and save.</>,
              <>Press <em>Connect Microsoft 365</em> on Company Knowledge. Set a reminder to replace the secret before it expires.</>,
            ]} />
            <CopyField label="Redirect URI (Web)" value={ms.redirectUri} />
            <CopyField label="Delegated permissions (Microsoft Graph)" value={ms.permissions.join(", ")} />
            <OwnAppForm provider="microsoft365" p={ms} onDone={load} />
          </div>
        )}
      </div>

      {/* ---------------- Google Workspace ---------------- */}
      <div className="rounded-xl border p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2"><Building2 className="h-5 w-5 text-primary" /><h3 className="font-semibold">Google Workspace — Gmail &amp; Drive</h3><span className="ml-auto text-xs text-muted-foreground">{using(g)}</span></div>
        <p className="text-sm text-muted-foreground">
          Google asks every outside app that reads Gmail to pass a review and a yearly security assessment. Until Cortex&rsquo;s shared app has passed it, the fastest
          way is your company&rsquo;s own <strong>Internal</strong> app: Google needs no review for apps used only inside your own Workspace, so it works the same day.
        </p>
        {(g.shared && !g.own.saved) && (
          <div className="flex flex-wrap gap-2"><Link href="/knowledge" className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground h-9 px-4 text-sm font-medium hover:opacity-90">Connect Google Workspace with Cortex&rsquo;s app</Link></div>
        )}
        <button type="button" onClick={() => toggle("g")} className="flex items-center gap-1 text-sm font-medium" aria-expanded={!!open.g}>
          {open.g ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} {g.own.saved ? "Your company's own app" : "Set up your company's own Internal app (recommended)"}
        </button>
        {(open.g || (!g.shared && !g.own.saved)) && (
          <div className="space-y-4 pl-1">
            <Steps items={[
              <>Sign in to <a className="underline inline-flex items-center gap-0.5" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener noreferrer">Google Cloud console <ExternalLink className="h-3 w-3" /></a> with an account in your Workspace and create a project named <em>Cortex</em> inside your organisation.</>,
              <><strong>APIs &amp; Services → Library</strong>: enable the <strong>Gmail API</strong> and the <strong>Google Drive API</strong>.</>,
              <><strong>OAuth consent screen</strong> (Google Auth Platform → Branding/Audience): User type <strong>Internal</strong>. App name <em>Cortex</em>; your support email. Under Data access, add the scopes below.</>,
              <><strong>Credentials → Create credentials → OAuth client ID</strong> → Web application. Authorised redirect URI: the value below. Create.</>,
              <>Copy the <strong>Client ID</strong> and <strong>Client secret</strong>, paste them below and save.</>,
              <>Press <em>Connect Google Workspace</em> on Company Knowledge for each mailbox Cortex should read.</>,
            ]} />
            <CopyField label="Authorised redirect URI" value={g.redirectUri} />
            <CopyField label="Scopes" value={g.permissions.join(", ")} />
            <OwnAppForm provider="google_workspace" p={g} onDone={load} />
          </div>
        )}
      </div>
    </div>
  );
}
