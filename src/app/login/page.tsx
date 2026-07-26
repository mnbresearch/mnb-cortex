"use client";
import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Mail, ArrowRight, KeyRound, Loader2, CheckCircle2 } from "lucide-react";

const CONTACT_URL = "https://www.mnbresearch.com/contactus";

export default function Login() {
  const [mode, setMode] = useState<"signin" | "request">("signin");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const configured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

  // Access-request form
  const [req, setReq] = useState({ name: "", email: "", company: "", phone: "", message: "" });
  const [reqBusy, setReqBusy] = useState(false);
  const [reqDone, setReqDone] = useState(false);

  async function requestAccess(e: React.FormEvent) {
    e.preventDefault();
    setReqBusy(true); setErr("");
    try {
      const r = await fetch("/api/access-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
      const j = await r.json();
      if (j.ok) {
        setReqDone(true);
        // Point them to the MNB Research contact page.
        setTimeout(() => { window.location.href = j.contactUrl || CONTACT_URL; }, 3500);
      } else { setErr(j.error || "Could not submit. Please email us instead."); }
    } catch { setErr("Network error. Please try again."); }
    finally { setReqBusy(false); }
  }

  async function signInEmail(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setSent(true);
    } catch (e: any) { setErr(e.message || "Could not send link. Check Supabase config."); }
    finally { setLoading(false); }
  }

  async function signInGoogle() {
    try {
      const supabase = createClient();
      await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback` } });
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <main className="min-h-screen grid place-items-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <Logo size={38} />
          <span className="font-semibold text-lg">MNB Cortex</span>
        </div>
        <div className="flex gap-1 rounded-lg border p-1 mb-4 text-sm">
          <button onClick={() => setMode("signin")} className={`flex-1 rounded-md py-1.5 transition-colors ${mode === "signin" ? "brand-gradient text-white" : "text-muted-foreground hover:bg-accent"}`}>Sign in</button>
          <button onClick={() => setMode("request")} className={`flex-1 rounded-md py-1.5 transition-colors ${mode === "request" ? "brand-gradient text-white" : "text-muted-foreground hover:bg-accent"}`}>Request access</button>
        </div>

        <div className="rounded-xl border bg-card p-6">
          {mode === "signin" ? (
            <>
              <h1 className="text-xl font-semibold">Welcome back</h1>
              <p className="text-sm text-muted-foreground mt-1">Sign in to your AI COO.</p>
              {sent ? (
                <p className="mt-6 text-sm">Check your inbox — we sent a magic link to <b>{email}</b>.</p>
              ) : (
                <>
                  <Button variant="outline" className="w-full mt-6" onClick={signInGoogle}>Continue with Google</Button>
                  <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" /></div>
                  <form onSubmit={signInEmail} className="space-y-3">
                    <div className="flex items-center gap-2 rounded-lg border px-3 h-11">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" placeholder="you@company.com" className="flex-1 bg-transparent outline-none text-sm" />
                    </div>
                    <Button className="w-full" disabled={loading}>{loading ? "Sending…" : <>Email me a magic link <ArrowRight className="h-4 w-4" /></>}</Button>
                  </form>
                  <p className="mt-4 text-xs text-muted-foreground text-center">Don't have access yet? <button onClick={() => setMode("request")} className="text-primary underline">Request access</button></p>
                </>
              )}
            </>
          ) : reqDone ? (
            <div className="text-center py-4">
              <div className="h-12 w-12 rounded-full bg-success/10 grid place-items-center mx-auto"><CheckCircle2 className="h-6 w-6 text-success" /></div>
              <h1 className="mt-3 text-lg font-semibold">Request received</h1>
              <p className="text-sm text-muted-foreground mt-1">Our team has been notified and will reach out shortly. Taking you to our contact page…</p>
              <a href={CONTACT_URL} className="mt-4 inline-flex items-center gap-2 rounded-lg brand-gradient text-white h-10 px-5 text-sm font-medium">Contact MNB Research <ArrowRight className="h-4 w-4" /></a>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /> Request access</h1>
              <p className="text-sm text-muted-foreground mt-1">Tell us about your business — we'll set you up and reach out.</p>
              <form onSubmit={requestAccess} className="space-y-3 mt-5">
                <input required placeholder="Your name" value={req.name} onChange={(e) => setReq({ ...req, name: e.target.value })} className="w-full rounded-lg border bg-background px-3 h-11 text-sm outline-none focus:ring-2 focus:ring-ring" />
                <input required type="email" placeholder="Work email" value={req.email} onChange={(e) => setReq({ ...req, email: e.target.value })} className="w-full rounded-lg border bg-background px-3 h-11 text-sm outline-none focus:ring-2 focus:ring-ring" />
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Company" value={req.company} onChange={(e) => setReq({ ...req, company: e.target.value })} className="w-full rounded-lg border bg-background px-3 h-11 text-sm outline-none focus:ring-2 focus:ring-ring" />
                  <input placeholder="Phone" value={req.phone} onChange={(e) => setReq({ ...req, phone: e.target.value })} className="w-full rounded-lg border bg-background px-3 h-11 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <textarea placeholder="What would you like to use it for? (optional)" rows={2} value={req.message} onChange={(e) => setReq({ ...req, message: e.target.value })} className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y" />
                <Button className="w-full" disabled={reqBusy}>{reqBusy ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <>Request access <ArrowRight className="h-4 w-4" /></>}</Button>
              </form>
              <p className="mt-3 text-xs text-muted-foreground text-center">Prefer to talk? <a href={CONTACT_URL} className="text-primary underline">Contact us</a></p>
            </>
          )}
          {err && <p className="mt-3 text-xs text-danger">{err}</p>}
          {!configured && mode === "signin" && (
            <p className="mt-4 text-xs text-muted-foreground">Supabase isn’t configured yet — you can still <Link href="/dashboard" className="text-primary underline">explore the live demo</Link>.</p>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground mt-4"><Link href="/dashboard" className="underline">Skip and view demo →</Link></p>
      </div>
    </main>
  );
}
