"use client";
import { useState } from "react";
import { Check, Sparkles, X, MessageCircle } from "lucide-react";
import { PLANS, WHATSAPP_NUMBER, CURRENCIES, formatMoney, planPrice, type CurrencyCode } from "@/lib/config";

export function PricingClient() {
  const [annual, setAnnual] = useState(false);
  const [cur, setCur] = useState<CurrencyCode>("INR");
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
      const r = await fetch("/api/inquiry", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, plan, currency: cur, cycle: annual ? "annual" : "monthly" }),
      });
      const j = await r.json();
      setStatus(j.ok ? "done" : "error");
    } catch { setStatus("error"); }
  }

  const waText = encodeURIComponent(`Hi, I'm interested in MNB Cortex (${plan} plan, ${cur}).\nName: ${form.name || "-"}\nEmail: ${form.email || "-"}\nPhone: ${form.phone || "-"}`);
  const waLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${waText}`;

  return (
    <>
      <div className="flex flex-col items-center gap-4 mb-10">
        <div className="flex items-center gap-3">
          <span className={!annual ? "font-medium" : "text-muted-foreground"}>Monthly</span>
          <button onClick={() => setAnnual((a) => !a)} className="relative h-6 w-11 rounded-full bg-secondary border" aria-label="Toggle annual billing">
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-primary transition-all ${annual ? "left-[22px]" : "left-0.5"}`} />
          </button>
          <span className={annual ? "font-medium" : "text-muted-foreground"}>Annual <span className="text-success text-xs">(save ~20%)</span></span>
        </div>
        <div className="inline-flex rounded-full border p-1 text-sm">
          {(Object.keys(CURRENCIES) as CurrencyCode[]).map((c) => (
            <button key={c} onClick={() => setCur(c)}
              className={`px-4 h-8 rounded-full font-medium transition-colors ${cur === c ? "btn-ink" : "text-muted-foreground hover:text-foreground"}`}>
              {CURRENCIES[c].symbol} {CURRENCIES[c].label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
        {PLANS.map((p) => {
          const price = planPrice(p, cur, annual);
          const annualTotal = planPrice(p, cur, true);
          return (
            <div key={p.id} className={`rounded-2xl border p-6 flex flex-col ${p.highlight ? "border-primary ring-1 ring-primary bg-primary/5" : "bg-card"}`}>
              {p.highlight && <div className="text-xs font-semibold text-primary mb-2 flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Most popular</div>}
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="text-sm text-muted-foreground mt-1 min-h-[40px]">{p.tagline}</p>
              <div className="mt-4 mb-4">
                {price === null ? <div className="font-display text-4xl tracking-tightest">Custom</div> : (
                  <div>
                    <span className="font-display text-4xl tracking-tightest">{formatMoney(annual ? Math.round((annualTotal || 0) / 12) : price, cur)}</span>
                    <span className="text-sm text-muted-foreground">/mo</span>
                    {annual && <div className="text-xs text-muted-foreground">{formatMoney(annualTotal || 0, cur)} billed yearly</div>}
                  </div>
                )}
              </div>
              <button onClick={() => openForm(p.name)} className={`w-full rounded-full h-11 text-sm font-medium transition-colors ${p.highlight ? "btn-ink" : "border hover:bg-accent"}`}>{p.cta}</button>
              <ul className="mt-5 space-y-2 text-sm">
                {p.features.map((f) => <li key={f} className="flex gap-2"><Check className="h-4 w-4 text-success shrink-0 mt-0.5" /><span>{f}</span></li>)}
              </ul>
            </div>
          );
        })}
      </div>

      {cur === "USD" && (
        <p className="text-center text-xs text-muted-foreground mt-6 max-w-xl mx-auto">
          USD prices are indicative. Card billing is processed in INR via Cashfree at checkout; international customers are onboarded by our team — just request a plan and we&rsquo;ll set you up.
        </p>
      )}

      {open && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm grid place-items-center p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-semibold">Request the {plan} plan</h3>
              <button onClick={() => setOpen(false)} aria-label="Close"><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Leave your details — we&rsquo;ll set up your access, or message us on WhatsApp instantly.</p>
            {status === "done" ? (
              <div className="text-center py-6">
                <Check className="h-10 w-10 text-success mx-auto" />
                <p className="mt-3 font-medium">Thanks, {form.name}!</p>
                <p className="text-sm text-muted-foreground">We&rsquo;ve got your request for the {plan} plan ({cur}) and will be in touch to activate your access.</p>
                <a href={waLink} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#25D366] text-white h-10 px-4 text-sm font-medium"><MessageCircle className="h-4 w-4" /> Also message on WhatsApp</a>
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
                  <span>I agree to be contacted about MNB Cortex and consent to my details being processed for this request.</span>
                </label>
                {status === "error" && <p className="text-xs text-danger">Something went wrong sending the email — please use WhatsApp below.</p>}
                <button disabled={status === "sending"} className="w-full rounded-full btn-ink h-11 text-sm font-medium">{status === "sending" ? "Sending…" : "Request access"}</button>
                <a href={waLink} target="_blank" rel="noopener noreferrer" className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] text-white h-11 text-sm font-medium"><MessageCircle className="h-4 w-4" /> Message on WhatsApp</a>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
