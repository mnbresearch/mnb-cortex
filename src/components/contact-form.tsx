"use client";
import { useState } from "react";
import { Check, MessageCircle, Send } from "lucide-react";

/*
  THE PAGE EVERY "TALK TO US" BUTTON POINTS AT CAPTURED NOTHING.

  /contact offered three cards — mailto, tel, wa.me — and no form. So a visitor
  arriving from /industries ("Talk to us"), /investors, or a pricing page they
  did not want to self-serve from had to leave the site and compose an email
  themselves. Most people do not. That is the highest-intent traffic on the
  site being handed a dead end and asked to do the work.

  Meanwhile /api/access-request already existed, fully built: name, email,
  company, phone, message; rate-limited per email and per IP so it cannot be
  used as a spam relay against our sending domain; persists a row in `leads`
  even if the mail fails; notifies the operator; sends the visitor a
  confirmation. It had ZERO callers anywhere in the codebase — a finished
  endpoint that no button reached.

  So this is not new machinery. It is the missing front end for machinery that
  was already there, which is why it is small.

  WhatsApp stays alongside rather than being replaced. A large share of Indian
  SME buyers will pick WhatsApp over a form every time, and the form existing
  does not change that — it just stops us losing the ones who prefer typing.
*/

const WA = "https://wa.me/919711488480";

export function ContactForm() {
  const [f, setF] = useState({ name: "", email: "", company: "", phone: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim() || !f.email.trim()) return;
    setStatus("sending"); setErr("");
    try {
      const r = await fetch("/api/access-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const j = await r.json().catch(() => ({}));
      /*
        The endpoint answers 429 with a friendly `error` when it rate-limits.
        Show what it actually said rather than a generic failure — "we've
        already received your request" is reassuring, and "something went
        wrong" after a successful submission is not.
      */
      if (j?.ok) { setStatus("done"); return; }
      setErr(j?.error || "Could not send that just now.");
      setStatus("error");
    } catch {
      setErr("Could not reach us just now — WhatsApp below always works.");
      setStatus("error");
    }
  }

  const I = "w-full rounded-lg border bg-background px-3 h-11 text-sm outline-none focus:ring-2 focus:ring-ring";

  if (status === "done") {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center not-prose">
        <Check className="h-9 w-9 text-success mx-auto" aria-hidden="true" />
        <p className="mt-3 font-medium">Thanks, {f.name.split(" ")[0]}.</p>
        <p className="text-sm text-muted-foreground mt-1">
          We have your message and usually reply within two business days. A confirmation is on its way to {f.email}.
        </p>
        <a href={WA} target="_blank" rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#25D366] text-white h-10 px-4 text-sm font-medium">
          <MessageCircle className="h-4 w-4" aria-hidden="true" /> Message us on WhatsApp too
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border bg-card p-5 space-y-3 not-prose" aria-labelledby="contact-form-heading">
      <h3 id="contact-form-heading" className="font-semibold">Send us a message</h3>
      <p className="text-sm text-muted-foreground -mt-1">
        Tell us what you are trying to work out and we will reply with a straight answer, not a sales sequence.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-muted-foreground block mb-1">Your name</span>
          <input required className={I} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Your name" />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground block mb-1">Work email</span>
          <input required type="email" className={I} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} aria-label="Work email" />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground block mb-1">Business name <span className="opacity-60">(optional)</span></span>
          <input className={I} value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} aria-label="Business name" />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground block mb-1">Phone <span className="opacity-60">(optional)</span></span>
          <input className={I} inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} aria-label="Phone number" />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-muted-foreground block mb-1">What would you like to know?</span>
        <textarea rows={4} className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} aria-label="Your message"
          placeholder="We run a fabrication unit in Ludhiana and want to know whether Cortex reads Busy exports." />
      </label>
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" required className="mt-0.5" />
        <span>I agree to be contacted about MNB Cortex and consent to my details being processed for this enquiry.</span>
      </label>
      {status === "error" && <p role="alert" className="text-xs text-danger">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={status === "sending"} className="inline-flex items-center gap-2 rounded-full btn-ink h-11 px-5 text-sm font-medium">
          <Send className="h-4 w-4" aria-hidden="true" /> {status === "sending" ? "Sending…" : "Send message"}
        </button>
        <a href={WA} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-[#25D366] text-white h-11 px-5 text-sm font-medium">
          <MessageCircle className="h-4 w-4" aria-hidden="true" /> WhatsApp instead
        </a>
      </div>
    </form>
  );
}
