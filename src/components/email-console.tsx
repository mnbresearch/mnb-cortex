"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, RefreshCw, Globe, Sparkles, Loader2 } from "lucide-react";

async function call(op: string, extra: Record<string, string> = {}) {
  const r = await fetch("/api/email", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op, ...extra }),
  });
  return r.json();
}

const TEMPLATES: Record<string, { subject: string; body: string }> = {
  "": { subject: "", body: "" },
  followup: {
    subject: "Following up on your enquiry",
    body: "Hi there,\n\nThanks for reaching out. I wanted to follow up and see if you had any questions.\n\nHappy to jump on a quick call this week if that's easier.\n\nBest,\nMridul\nMNB Research",
  },
  proposal: {
    subject: "Your proposal from MNB Research",
    body: "Hi there,\n\nPlease find our proposal attached/below. It covers scope, timeline and commercials.\n\nLet me know if you'd like anything adjusted.\n\nBest,\nMridul\nMNB Research",
  },
  welcome: {
    subject: "Welcome aboard",
    body: "Hi there,\n\nWelcome! We're glad to have you.\n\nHere's what happens next: our team will reach out within 24 hours to get you set up.\n\nBest,\nTeam MNB",
  },
};

export function EmailConsole() {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const [emails, setEmails] = useState<any[] | null>(null);
  const [emailsErr, setEmailsErr] = useState("");
  const [domains, setDomains] = useState<any[] | null>(null);
  const [loadingList, setLoadingList] = useState(false);

  async function refresh() {
    setLoadingList(true); setEmailsErr("");
    const [l, d] = await Promise.all([call("list"), call("domains")]);
    if (l.ok) setEmails(l.data?.data || []); else { setEmails([]); setEmailsErr(l.error || "Could not load sent mail"); }
    if (d.ok) setDomains(d.data?.data || []);
    setLoadingList(false);
  }
  useEffect(() => { refresh(); }, []);

  async function send() {
    if (!to || !subject) { setMsg("Recipient and subject are required."); return; }
    setSending(true); setMsg("");
    const j = await call("send", { to, subject, body });
    setMsg(j.ok ? `Sent to ${j.to}` : `Failed: ${j.error || "unknown"}`);
    setSending(false);
    if (j.ok) { setTo(""); setSubject(""); setBody(""); setTimeout(refresh, 1200); }
  }

  async function draftWithAI() {
    if (!subject && !body) { setMsg("Type a subject or a few words first — the AI will expand it."); return; }
    setAiBusy(true);
    try {
      const r = await fetch("/api/ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "outreach", input: `Write a short, warm business email. Subject/idea: ${subject || body}. Return only the email body, no headings.` }),
      });
      const j = await r.json();
      if (j.text) setBody(j.text.replace(/^#+ .*$/gm, "").replace(/\*\*/g, "").trim());
    } catch { setMsg("Could not reach the AI."); } finally { setAiBusy(false); }
  }

  function applyTemplate(k: string) {
    const t = TEMPLATES[k]; if (!t) return;
    setSubject(t.subject); setBody(t.body);
  }

  const I = "w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="space-y-5">
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold flex items-center gap-2"><Send className="h-4 w-4 text-primary" /> Compose</div>
          <select onChange={(e) => applyTemplate(e.target.value)} defaultValue="" className="rounded-lg border bg-background px-2 h-9 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="">Template…</option>
            <option value="followup">Follow-up</option>
            <option value="proposal">Proposal</option>
            <option value="welcome">Welcome</option>
          </select>
        </div>
        <input className={I} placeholder="To — person@company.com" value={to} onChange={(e) => setTo(e.target.value)} />
        <input className={I} placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <textarea rows={7} placeholder="Write your message…" value={body} onChange={(e) => setBody(e.target.value)}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y" />
        <div className="flex flex-wrap gap-2">
          <Button onClick={send} disabled={sending}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{sending ? "Sending…" : "Send email"}</Button>
          <Button variant="outline" onClick={draftWithAI} disabled={aiBusy}><Sparkles className="h-4 w-4" /> {aiBusy ? "Drafting…" : "Draft with AI"}</Button>
        </div>
        {msg && <p className={`text-sm ${msg.startsWith("Sent") ? "text-success" : "text-muted-foreground"}`}>{msg}</p>}
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold flex items-center gap-2"><Globe className="h-4 w-4 text-primary" /> Sending domains</div>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loadingList}>
            <RefreshCw className={`h-4 w-4 ${loadingList ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
        {domains === null ? <p className="text-sm text-muted-foreground">Loading…</p>
          : domains.length === 0 ? <p className="text-sm text-muted-foreground">No domains found.</p>
          : (
            <div className="space-y-2">
              {domains.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div><div className="font-medium text-sm">{d.name}</div><div className="text-xs text-muted-foreground">{d.region || "—"}</div></div>
                  <Badge className={d.status === "verified" ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20"}>{d.status}</Badge>
                </div>
              ))}
            </div>
          )}
      </Card>

      <Card className="p-5 space-y-3">
        <div className="font-semibold">Recently sent</div>
        {emailsErr && <p className="text-sm text-muted-foreground">{emailsErr}. You can always see the full log in your Resend dashboard.</p>}
        {emails === null ? <p className="text-sm text-muted-foreground">Loading…</p>
          : emails.length === 0 && !emailsErr ? <p className="text-sm text-muted-foreground">No emails sent yet.</p>
          : emails.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-3 font-medium">To</th><th className="py-2 pr-3 font-medium">Subject</th>
                  <th className="py-2 pr-3 font-medium">Status</th><th className="py-2 font-medium">Sent</th>
                </tr></thead>
                <tbody>
                  {emails.slice(0, 25).map((e: any) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">{Array.isArray(e.to) ? e.to.join(", ") : e.to}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{e.subject}</td>
                      <td className="py-2 pr-3"><Badge className="border-border text-muted-foreground">{e.last_event || "sent"}</Badge></td>
                      <td className="py-2 text-muted-foreground">{e.created_at ? new Date(e.created_at).toLocaleString("en-IN") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </div>
  );
}
