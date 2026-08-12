"use client";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Send, Check, AlertTriangle, MessageCircle, Wand2 } from "lucide-react";

const KINDS: { id: string; label: string }[] = [
  { id: "payment_reminder", label: "Payment reminder" },
  { id: "supplier", label: "Supplier note" },
  { id: "winback", label: "Customer win-back" },
  { id: "followup", label: "Sales follow-up" },
  { id: "thankyou", label: "Thank-you note" },
  { id: "custom", label: "Custom" },
];

const IN = "w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring";

export function ActCenter() {
  const [kind, setKind] = useState("payment_reminder");
  const [to, setTo] = useState("");
  const [phone, setPhone] = useState("");
  const [brief, setBrief] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  // Deep-link prefill: a plan/priority card can open this pre-filled with a brief.
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const k = p.get("kind"); const b = p.get("brief");
      if (k && KINDS.some((x) => x.id === k)) setKind(k);
      if (b) setBrief(b);
    } catch {}
  }, []);

  async function draft() {
    setDrafting(true); setErr(""); setSent(false); setConfirm(false);
    try {
      const r = await fetch("/api/act", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "draft", kind, brief }) });
      const j = await r.json();
      if (!j.ok) setErr(j.error || "Couldn't draft.");
      else { setSubject(j.draft.subject || ""); setBody(j.draft.body || ""); }
    } catch { setErr("Network error reaching the AI."); }
    finally { setDrafting(false); }
  }

  async function send() {
    if (!confirm) { setConfirm(true); return; }
    setSending(true); setErr(""); setConfirm(false);
    try {
      const r = await fetch("/api/act", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "send", to, subject, body }) });
      const j = await r.json();
      if (!j.ok) setErr(j.error || "Send failed."); else setSent(true);
    } catch { setErr("Network error sending."); }
    finally { setSending(false); }
  }

  const waLink = `https://wa.me/${phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(body)}`;

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">What should Cortex write?</div>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button key={k.id} onClick={() => setKind(k.id)} className={`rounded-full px-3.5 h-9 text-sm border transition-colors ${kind === k.id ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}>{k.label}</button>
            ))}
          </div>
        </div>
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={2} className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          placeholder="A line of detail — e.g. “Reminder to Apex Traders, invoice INV-204 for ₹1.8L, 45 days overdue.”" />
        <Button onClick={draft} disabled={drafting}>
          {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} {drafting ? "Cortex is writing…" : "Draft with Cortex"}
        </Button>
        {err && !subject && <div className="flex items-start gap-2 text-sm text-danger"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {err}</div>}
      </Card>

      {(subject || body) && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-primary"><Sparkles className="h-3.5 w-3.5" /> Cortex drafted this — review and edit before you send</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <input className={IN} placeholder="Recipient email" value={to} onChange={(e) => setTo(e.target.value)} />
            <input className={IN} placeholder="Phone for WhatsApp (optional, e.g. 9198…)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <input className={IN} placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <textarea className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" rows={9} value={body} onChange={(e) => setBody(e.target.value)} />

          {sent ? (
            <div className="flex items-center gap-2 text-sm text-success rounded-lg border border-success/30 bg-success/5 p-3"><Check className="h-4 w-4" /> Sent to {to}. Replies come straight to your inbox.</div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={send} disabled={sending || !to.trim()}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? "Sending…" : confirm ? `Confirm — send to ${to}?` : "Send email"}
              </Button>
              {confirm && <button onClick={() => setConfirm(false)} className="text-sm text-muted-foreground">Cancel</button>}
              {phone.trim() && <a href={waLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-md bg-[#25D366] text-white h-9 px-4 text-sm font-medium"><MessageCircle className="h-4 w-4" /> WhatsApp</a>}
              {err && <span className="text-sm text-danger flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> {err}</span>}
            </div>
          )}
          <p className="text-xs text-muted-foreground">You approve every send. Email goes from your verified domain with replies routed to you.</p>
        </Card>
      )}
    </div>
  );
}
