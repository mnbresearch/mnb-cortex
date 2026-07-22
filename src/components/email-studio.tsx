"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, Save, Trash2, Sparkles, Loader2, Users, BarChart3, FileText, Eye, MousePointerClick, Plus, ChevronDown } from "lucide-react";

type Template = { id: string; name: string; subject: string; body: string; updated_at?: string };
type Campaign = { id: string; name: string | null; subject: string; created_at: string; total: number; opened: number; clicked: number };
type Lead = { name?: string; email: string; plan?: string };

const TOKENS = ["{{name}}", "{{first_name}}", "{{email}}", "{{plan}}", "{{company}}"];

async function call(op: string, extra: Record<string, any> = {}) {
  const r = await fetch("/api/email/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, ...extra }) });
  return r.json();
}

export function EmailStudio({ templates, campaigns, leads }: { templates: Template[]; campaigns: Campaign[]; leads: Lead[] }) {
  const [tab, setTab] = useState<"compose" | "templates" | "insights">("compose");
  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg border p-1 w-fit">
        {([["compose", "Compose & Send", Send], ["templates", "Templates", FileText], ["insights", "Insights", BarChart3]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${tab === k ? "brand-gradient text-white" : "text-muted-foreground hover:bg-accent"}`}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
      {tab === "compose" && <Compose templates={templates} leads={leads} />}
      {tab === "templates" && <Templates templates={templates} />}
      {tab === "insights" && <Insights campaigns={campaigns} />}
    </div>
  );
}

/* ---------------- Compose & Send ---------------- */
function Compose({ templates, leads }: { templates: Template[]; leads: Lead[] }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const recipients: Lead[] = useMemo(() => {
    const base = leads.filter((l) => selected[l.email]);
    const manual = extra.split(/[\n,;]+/).map((e) => e.trim()).filter((e) => /\S+@\S+\.\S+/.test(e)).map((email) => ({ email }));
    const seen = new Set<string>();
    return [...base, ...manual].filter((r) => { if (seen.has(r.email)) return false; seen.add(r.email); return true; });
  }, [leads, selected, extra]);

  const preview = recipients[0];
  function applyPreview(t: string) {
    if (!preview) return t;
    const first = (preview.name || "").split(" ")[0] || "there";
    return t.replace(/\{\{\s*name\s*\}\}/gi, preview.name || "there").replace(/\{\{\s*first_name\s*\}\}/gi, first)
      .replace(/\{\{\s*email\s*\}\}/gi, preview.email).replace(/\{\{\s*plan\s*\}\}/gi, preview.plan || "").replace(/\{\{\s*company\s*\}\}/gi, "");
  }

  function loadTemplate(id: string) {
    const t = templates.find((x) => x.id === id); if (!t) return;
    setSubject(t.subject); setBody(t.body);
  }
  function insertToken(tok: string) { setBody((b) => b + (b.endsWith(" ") || !b ? "" : " ") + tok); }
  const allSel = leads.length > 0 && leads.every((l) => selected[l.email]);
  function toggleAll() { const v = !allSel; const m: Record<string, boolean> = {}; leads.forEach((l) => (m[l.email] = v)); setSelected(m); }

  async function draftAI() {
    if (!subject && !body) { setMsg("Type a subject or a few words first."); return; }
    setAiBusy(true);
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "outreach", input: `Write a short warm marketing email. Use {{first_name}} for personalisation. Topic: ${subject || body}. Return only the body.` }) });
      const j = await r.json(); if (j.text) setBody(j.text.replace(/^#+ .*$/gm, "").replace(/\*\*/g, "").trim());
    } catch { setMsg("Could not reach the AI."); } finally { setAiBusy(false); }
  }

  async function send() {
    if (!subject || !body) { setMsg("Subject and body are required."); return; }
    if (recipients.length === 0) { setMsg("Select at least one recipient."); return; }
    if (!confirm(`Send this campaign to ${recipients.length} recipient(s)?`)) return;
    setBusy(true); setMsg("");
    const j = await call("send", { name: subject.slice(0, 60), subject, body, recipients });
    setBusy(false);
    if (j.ok) { setMsg(`✅ Sent to ${j.sent}${j.failed ? `, ${j.failed} failed` : ""}. Track results under Insights.`); setSelected({}); setExtra(""); }
    else setMsg(`⚠️ ${j.error || "Failed"}`);
  }

  const I = "w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Message</div>
          {templates.length > 0 && (
            <select onChange={(e) => loadTemplate(e.target.value)} defaultValue="" className="rounded-lg border bg-background px-2 h-9 text-sm outline-none focus:ring-2 focus:ring-ring">
              <option value="">Load template…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>
        <input className={I} placeholder="Subject — Hi {{first_name}}, a quick note" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <div className="flex flex-wrap gap-1">
          {TOKENS.map((t) => <button key={t} onClick={() => insertToken(t)} className="text-xs rounded border px-2 py-1 text-muted-foreground hover:bg-accent font-mono">{t}</button>)}
        </div>
        <textarea rows={9} placeholder={"Hi {{first_name}},\n\nWrite your message here. Use the tokens above to personalise it per person."} value={body} onChange={(e) => setBody(e.target.value)}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y" />
        <div className="flex flex-wrap gap-2">
          <Button onClick={send} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{busy ? "Sending…" : `Send to ${recipients.length}`}</Button>
          <Button variant="outline" onClick={draftAI} disabled={aiBusy}><Sparkles className="h-4 w-4" /> {aiBusy ? "Drafting…" : "Draft with AI"}</Button>
        </div>
        {msg && <p className={`text-sm ${msg.startsWith("✅") ? "text-success" : "text-muted-foreground"}`}>{msg}</p>}
        {preview && (
          <div className="rounded-lg border bg-background/50 p-3">
            <div className="text-xs text-muted-foreground mb-1">Preview for {preview.email}</div>
            <div className="text-sm font-medium">{applyPreview(subject) || "(no subject)"}</div>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{applyPreview(body) || "(empty)"}</div>
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Recipients ({recipients.length})</div>
          {leads.length > 0 && <button onClick={toggleAll} className="text-sm text-primary">{allSel ? "Clear all" : "Select all leads"}</button>}
        </div>
        {leads.length === 0 ? (
          <p className="text-sm text-muted-foreground">No captured leads yet. Add recipients manually below, or leads from the pricing form will appear here.</p>
        ) : (
          <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
            {leads.map((l) => (
              <label key={l.email} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent">
                <input type="checkbox" checked={!!selected[l.email]} onChange={(e) => setSelected({ ...selected, [l.email]: e.target.checked })} />
                <span className="flex-1 min-w-0"><span className="font-medium">{l.name || "—"}</span> <span className="text-muted-foreground">· {l.email}</span></span>
                {l.plan && <Badge className="border-border text-muted-foreground">{l.plan}</Badge>}
              </label>
            ))}
          </div>
        )}
        <div>
          <div className="text-xs text-muted-foreground mb-1">Add more emails (comma or newline separated)</div>
          <textarea rows={2} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="person@company.com, another@company.com"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y" />
        </div>
        <p className="text-xs text-muted-foreground">Each person gets their own copy — merge tokens are filled in per recipient, and an invisible pixel tracks opens.</p>
      </Card>
    </div>
  );
}

/* ---------------- Templates ---------------- */
function Templates({ templates }: { templates: Template[] }) {
  const [editing, setEditing] = useState<Template | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!editing) return;
    setBusy(true);
    const j = await call("save_template", editing);
    setBusy(false);
    if (j.ok) location.reload(); else alert(j.error || "Failed");
  }
  async function remove(id: string) { if (!confirm("Delete this template?")) return; await call("delete_template", { id }); location.reload(); }

  const I = "w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <div className="space-y-3">
      <Button onClick={() => setEditing({ id: "", name: "", subject: "", body: "" })}><Plus className="h-4 w-4" /> New template</Button>
      <div className="grid sm:grid-cols-2 gap-3">
        {templates.map((t) => (
          <Card key={t.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="min-w-0"><div className="font-medium text-sm truncate">{t.name}</div><div className="text-xs text-muted-foreground truncate">{t.subject}</div></div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => setEditing(t)} className="text-xs text-primary px-1">Edit</button>
                <button onClick={() => remove(t.id)} className="text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2 line-clamp-3 whitespace-pre-wrap">{t.body.slice(0, 160)}</p>
          </Card>
        ))}
        {templates.length === 0 && <p className="text-sm text-muted-foreground">No templates yet. Create one to reuse it across campaigns.</p>}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => !busy && setEditing(null)}>
          <Card className="w-full max-w-lg p-5 space-y-3 animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="font-semibold">{editing.id ? "Edit template" : "New template"}</div>
            <input className={I} placeholder="Template name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <input className={I} placeholder="Subject (use {{first_name}} etc.)" value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} />
            <div className="flex flex-wrap gap-1">{TOKENS.map((t) => <button key={t} onClick={() => setEditing({ ...editing, body: editing.body + " " + t })} className="text-xs rounded border px-2 py-1 text-muted-foreground hover:bg-accent font-mono">{t}</button>)}</div>
            <textarea rows={8} placeholder="Body" value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ---------------- Insights ---------------- */
function Insights({ campaigns }: { campaigns: Campaign[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState("");

  async function toggle(id: string) {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    if (!detail[id]) {
      setLoading(id);
      const j = await call("detail", { id });
      if (j.ok) setDetail((d) => ({ ...d, [id]: j.recipients }));
      setLoading("");
    }
  }
  async function setOutcome(rid: string, outcome: string, cid: string) {
    await call("set_outcome", { id: rid, outcome });
    setDetail((d) => ({ ...d, [cid]: (d[cid] || []).map((r: any) => r.id === rid ? { ...r, outcome } : r) }));
  }

  if (campaigns.length === 0) return <Card className="p-6 text-sm text-muted-foreground">No campaigns sent yet. Send one from the Compose tab and its open/click results will appear here.</Card>;

  return (
    <div className="space-y-3">
      {campaigns.map((c) => {
        const openRate = c.total ? Math.round((c.opened / c.total) * 100) : 0;
        const clickRate = c.total ? Math.round((c.clicked / c.total) * 100) : 0;
        const recs = detail[c.id];
        return (
          <Card key={c.id} className="p-4">
            <button onClick={() => toggle(c.id)} className="w-full flex items-center justify-between gap-3 text-left">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{c.subject}</div>
                <div className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString("en-IN")} · {c.total} sent</div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-center"><div className="text-sm font-bold flex items-center gap-1"><Eye className="h-3.5 w-3.5 text-primary" />{openRate}%</div><div className="text-[10px] text-muted-foreground">opened</div></div>
                <div className="text-center"><div className="text-sm font-bold flex items-center gap-1"><MousePointerClick className="h-3.5 w-3.5 text-primary" />{clickRate}%</div><div className="text-[10px] text-muted-foreground">clicked</div></div>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open === c.id ? "rotate-180" : ""}`} />
              </div>
            </button>

            {open === c.id && (
              <div className="mt-3 border-t pt-3">
                {loading === c.id ? <p className="text-sm text-muted-foreground">Loading…</p> : recs ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-muted-foreground border-b">
                        <th className="py-1.5 pr-3 font-medium">Recipient</th><th className="py-1.5 pr-3 font-medium">Status</th>
                        <th className="py-1.5 pr-3 font-medium">Opens</th><th className="py-1.5 pr-3 font-medium">Clicks</th><th className="py-1.5 font-medium">Outcome</th>
                      </tr></thead>
                      <tbody>
                        {recs.map((r: any) => (
                          <tr key={r.id} className="border-b last:border-0">
                            <td className="py-1.5 pr-3"><div className="font-medium">{r.name || "—"}</div><div className="text-xs text-muted-foreground">{r.email}</div></td>
                            <td className="py-1.5 pr-3"><Badge className={r.status === "sent" ? "bg-success/10 text-success border-success/20" : "bg-danger/10 text-danger border-danger/20"}>{r.status}</Badge></td>
                            <td className="py-1.5 pr-3">{r.open_count > 0 ? <span className="text-success">{r.open_count}</span> : <span className="text-muted-foreground">—</span>}</td>
                            <td className="py-1.5 pr-3">{r.click_count > 0 ? <span className="text-success">{r.click_count}</span> : <span className="text-muted-foreground">—</span>}</td>
                            <td className="py-1.5">
                              <select value={r.outcome || ""} onChange={(e) => setOutcome(r.id, e.target.value, c.id)} className="rounded border bg-background px-2 h-8 text-xs outline-none focus:ring-2 focus:ring-ring">
                                <option value="">—</option><option value="interested">Interested</option><option value="replied">Replied</option><option value="not_interested">Not interested</option><option value="bounced">Bounced</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="text-sm text-muted-foreground">No recipient data.</p>}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
