"use client";
import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { updateOrgProfile, seedDemoData } from "@/lib/actions";
import { Check, Sparkles, ArrowRight, Building2, Database } from "lucide-react";
import { Logo } from "@/components/logo";

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", industry: "manufacturing", currency: "INR" });
  const inp = "w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring";

  async function saveProfile() {
    setBusy(true);
    try { const fd = new FormData(); fd.set("name", form.name || "My Company"); fd.set("industry", form.industry); fd.set("currency", form.currency); await updateOrgProfile(fd); setStep(1); }
    catch (e: any) { alert(e.message || "Please sign in first."); } finally { setBusy(false); }
  }
  async function loadDemo() { setBusy(true); try { await seedDemoData(); setStep(2); } catch (e: any) { alert(e.message); } finally { setBusy(false); } }

  return (
    <Card className="relative p-6 max-w-xl mx-auto overflow-hidden">
      <div className="aurora opacity-60" aria-hidden />
      <div className="relative z-10">
      <div className="flex flex-col items-center gap-2 mb-5">
        <div className="animate-float"><Logo size={52} /></div>
        <div className="text-center">
          <div className="font-semibold tracking-tight">Welcome to MNB Cortex</div>
          <div className="text-xs text-muted-foreground">Let's set up your AI COO in three quick steps</div>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-6">
        {[0, 1, 2].map((i) => <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "brand-gradient" : "bg-secondary"}`} />)}
      </div>
      {step === 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> Tell us about your company</h2>
          <input className={inp} placeholder="Company name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className={inp} value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })}>
            {["manufacturing", "trading", "distribution", "education", "retail", "d2c"].map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select className={inp} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            {["INR", "USD", "EUR", "GBP", "AED", "SGD"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <Button onClick={saveProfile} disabled={busy} className="w-full">{busy ? "Saving…" : <>Continue <ArrowRight className="h-4 w-4" /></>}</Button>
        </div>
      )}
      {step === 1 && (
        <div className="space-y-3 text-center">
          <h2 className="text-lg font-semibold flex items-center justify-center gap-2"><Database className="h-5 w-5 text-primary" /> Add your data</h2>
          <p className="text-sm text-muted-foreground">Load a realistic demo dataset to explore everything instantly, or import your own.</p>
          <Button onClick={loadDemo} disabled={busy} className="w-full"><Sparkles className="h-4 w-4" /> {busy ? "Loading…" : "Load demo data"}</Button>
          <Link href="/import" className="block text-sm text-primary">Import my own data →</Link>
          <button onClick={() => setStep(2)} className="text-xs text-muted-foreground">Skip for now</button>
        </div>
      )}
      {step === 2 && (
        <div className="text-center py-4">
          <div className="h-12 w-12 rounded-full bg-success/15 grid place-items-center mx-auto"><Check className="h-6 w-6 text-success" /></div>
          <h2 className="mt-3 text-lg font-semibold">You're all set!</h2>
          <p className="text-sm text-muted-foreground">Your AI COO is ready. Ask it "How is my business?"</p>
          <Link href="/dashboard" className="mt-4 inline-flex items-center gap-2 rounded-lg brand-gradient text-white h-10 px-5 text-sm font-medium shadow-sm hover:opacity-90 transition-opacity">Go to dashboard <ArrowRight className="h-4 w-4" /></Link>
        </div>
      )}
      </div>
    </Card>
  );
}
