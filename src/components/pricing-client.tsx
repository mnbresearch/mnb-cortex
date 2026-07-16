"use client";
import { useState } from "react";
import { Check, Sparkles, X, MessageCircle } from "lucide-react";
import { PLANS, WHATSAPP_NUMBER } from "@/lib/config";

function inr(n: number) { return "₹" + n.toLocaleString("en-IN"); }

export function PricingClient() {
  const [annual, setAnnual] = useState(false);
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState("Growth");
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  function openForm(p: string) { setPlan(p); setForm({ name: "", email: "", phone: "" }); setStatus("idle"); setOpen(true); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email) return;
    setStatus("sending");
    try {
      const r = await fetch("/api/inquiry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, plan }) });
      const j = await r.json();
      setStatus(j.ok ? "done" : "error");
    } catch { setStatus("error"); }
  }

  const waText = encodeURIComponent(`Hi, I'm interested in MNB Cortex (${plan} plan).\nName: ${form.name || "-"}\nEmail: ${form.email || "-"}\nPhone: ${form.phone || "-"}`);
  const waLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${waText}`;

  return (
    <>
      <div className="flex items-center justify-center gap-3 mb-8">
        <span className={!annual ? "font-medium" : "text-muted-foreground"}>Monthly</span>
        <button onClick={() => setAnnual((a) => !a)} className="relative h-6 w-11 rounded-full bg-secondary border">
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-primary transition-all ${annual ? "left-[22px]" : "left-0.5"}`} />
        </button>
        <span className={annual ? "font-medium" : "text-muted-foreground"}>Annual <span className="text-success text-xs">(save ~20%)</span></span>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
        {PLANS.map((p) => (
          <div key={p.id} className={`rounded-2xl border p-5 flex flex-col ${p.highlight ? "border-primary ring-1 ring-primary bg-primary/5" : "bg-card"}`}>
            {p.highlight && <div className="text-xs font-semibold text-primary mb-2 flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Most popular</div>}
            <h3 className="text-lg font-semibold">{p.name}</h3>
            <p className="text-sm text-muted-foreground mt-1 min-h-[40px]">{p.tagline}</p>
            <div className="mt-4 mb-4">
              {p.monthly === 0 ? <div className="text-2xl font-bold">Custom</div> : (
                <div><span className="text-3xl font-bold">{inr(annual ? Math.round(p.annual / 12) : p.monthly)}</span><span className="text-sm text-muted-foreground">/mo</span>
                  {annual && <div className="text-xs text-muted-foreground">{inr(p.annual)} billed yearly</div>}</div>
              )}
            </div>
            <button onClick={() => openForm(p.name)} className={`w-full rounded-lg h-10 text-sm font-medium ${p.highlight ? "bg-primary text-primary-foreground" : "border hover:bg-accent"}`}>{p.cta}</button>
            <ul className="mt-5 space-y-2 text-sm">
              {p.features.map((f) => <li key={f} className="flex gap-2"><Check className="h-4 w-4 text-success shrink-0 mt-0.5" /><span>{f}</span></li>)}
            </ul>
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm grid place-items-center p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-semibold">Get started — {plan}</h3>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Leave your details and we'll reach out, or message us on WhatsApp instantly.</p>
            {status === "done" ? (
              <div className="text-center py-6">
                <Check className="h-10 w-10 text-success mx-auto" />
                <p className="mt-3 font-medium">Thanks, {form.name}!</p>
                <p className="text-sm text-muted-foreground">We've got your request for the {plan} plan and will be in touch.</p>
                <a href={waLink} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#25D366] text-white h-10 px-4 text-sm font-medium"><MessageCircle className="h-4 w-4" /> Also message on WhatsApp</a>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <input required placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring" />
                <input required type="email" placeholder="Work email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring" />
                <input placeholder="Phone number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring" />
                <select value={plan} onChange={(e) => setPlan(e.target.value)} className="w-full rounded-lg border bg-background px-3 h-10 text-sm">
                  {PLANS.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" required className="mt-0.5" />
                  <span>I agree to be contacted about MNB Cortex and consent to my details being processed for this inquiry.</span>
                </label>
                {status === "error" && <p className="text-xs text-danger">Something went wrong sending the email — please use WhatsApp below.</p>}
                <button disabled={status === "sending"} className="w-full rounded-lg bg-primary text-primary-foreground h-10 text-sm font-medium hover:opacity-90">{status === "sending" ? "Sending…" : "Submit request"}</button>
                <a href={waLink} target="_blank" rel="noopener noreferrer" className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#25D366] text-white h-10 text-sm font-medium"><MessageCircle className="h-4 w-4" /> Message on WhatsApp</a>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
