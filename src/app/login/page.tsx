"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/client";
import { GoogleSignIn } from "@/components/google-signin";
import { Mail, ArrowRight, Loader2, CheckCircle2, Eye, EyeOff, Lock, Sparkles } from "lucide-react";

type Mode = "signin" | "signup";

export default function Login() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");         // e.g. "confirm your email"
  const [linkSent, setLinkSent] = useState(false);
  const configured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

  /**
   * Only offer Google if the project actually has it switched on.
   *
   * The button was rendered unconditionally while Supabase had only email
   * enabled, so "Continue with Google" — the most prominent control on the
   * signup screen, and the one most people reach for first — failed with
   * "Unsupported provider". On a page you're about to send paid traffic to,
   * that is worse than not offering Google at all.
   *
   * Supabase publishes its enabled providers at /auth/v1/settings, so this
   * asks rather than assumes: switch Google on in the dashboard and the button
   * appears by itself, with no code change or redeploy.
   */
  // The auth callback redirects here with ?error=… when a sign-in fails —
  // cancelled Google consent, an expired magic link, or a workspace that
  // couldn't be created. Without this the user is bounced back to a blank login
  // form with no idea why, which reads as "the site is broken".
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const e = u.searchParams.get("error");
      if (!e) return;
      setErr(e);
      u.searchParams.delete("error");
      window.history.replaceState(null, "", u.pathname + u.search);
    } catch { /* ignore */ }
  }, []);

  const [googleOn, setGoogleOn] = useState(false);
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    let cancelled = false;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.external?.google) setGoogleOn(true); })
      .catch(() => { /* leave it hidden — a hidden button beats a broken one */ });
    return () => { cancelled = true; };
  }, []);

  async function afterAuthed() {
    // Guarantee a workspace exists, then enter the app.
    // Land new workspaces on onboarding, returning users on the dashboard.
    let next = "/dashboard";
    try {
      const r = await fetch("/api/workspace/bootstrap", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company }),
      });
      const j = await r.json().catch(() => ({} as any));
      if (j?.next) next = j.next;
    } catch {}
    window.location.href = next;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setNotice(""); setLoading(true);
    const supabase = createClient();
    try {
      if (mode === "signup") {
        if (password.length < 8) { setErr("Use a password of at least 8 characters."); setLoading(false); return; }
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: { company: company.trim() || undefined, full_name: company.trim() || undefined },
          },
        });
        if (error) throw error;
        if (data.session) { await afterAuthed(); return; }        // confirmation disabled → straight in
        setNotice(`We've sent a confirmation link to ${email}. Click it, then sign in.`);
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        await afterAuthed(); return;
      }
    } catch (e: any) {
      const m = String(e?.message || "");
      if (/already registered/i.test(m)) setErr("That email already has an account — sign in instead.");
      else if (/invalid login credentials/i.test(m)) setErr("Wrong email or password. Try again, or create an account.");
      else setErr(m || "Something went wrong. Please try again.");
    } finally { setLoading(false); }
  }

  async function magicLink() {
    if (!email.trim()) { setErr("Enter your email first."); return; }
    setErr(""); setNotice(""); setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
      if (error) throw error;
      setLinkSent(true);
    } catch (e: any) { setErr(e?.message || "Could not send the link."); }
    finally { setLoading(false); }
  }

  async function google() {
    setErr("");
    try {
      const supabase = createClient();
      await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback` } });
    } catch (e: any) { setErr(e?.message || "Google sign-in failed."); }
  }

  return (
    <main className="relative min-h-screen grid place-items-center px-6 overflow-hidden">
      <div className="grid-bg absolute inset-0" aria-hidden />
      <div className="aurora opacity-50" aria-hidden />

      <div className="relative z-10 w-full max-w-sm">
        <Link href="/" className="flex items-center gap-2 mb-8 justify-center">
          <Logo size={38} />
          <span className="font-semibold text-lg">MNB Cortex</span>
        </Link>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl border bg-card/70 backdrop-blur p-1 mb-4 text-sm">
          <button onClick={() => { setMode("signin"); setErr(""); setNotice(""); }} className={`flex-1 rounded-lg py-2 font-medium transition-all ${mode === "signin" ? "brand-gradient text-white shadow-sm" : "text-muted-foreground hover:bg-accent"}`}>Sign in</button>
          <button onClick={() => { setMode("signup"); setErr(""); setNotice(""); }} className={`flex-1 rounded-lg py-2 font-medium transition-all ${mode === "signup" ? "brand-gradient text-white shadow-sm" : "text-muted-foreground hover:bg-accent"}`}>Create account</button>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-xl shadow-black/[0.03]">
          {!configured ? (
            <p className="text-sm text-muted-foreground">Authentication isn&rsquo;t configured yet. Add your Supabase keys to enable sign-in.</p>
          ) : linkSent ? (
            <div className="text-center py-4">
              <CheckCircle2 className="h-8 w-8 text-success mx-auto" />
              <p className="mt-3 text-sm">Check your inbox — we sent a one-time login link to <b>{email}</b>.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="h-9 w-9 rounded-xl brand-gradient grid place-items-center text-white"><Sparkles className="h-4 w-4" /></span>
                <div>
                  <h1 className="font-semibold leading-tight">{mode === "signin" ? "Welcome back" : "Create your workspace"}</h1>
                  <p className="text-xs text-muted-foreground">{mode === "signin" ? "Sign in to your operating brain." : "Free to create · credits from ₹149."}</p>
                </div>
              </div>

              {notice && <div className="mt-4 text-sm rounded-lg border border-primary/30 bg-primary/5 p-3 text-primary">{notice}</div>}

              <form onSubmit={submit} className="mt-4 space-y-3">
                {mode === "signup" && (
                  <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Business name (optional)"
                    className="w-full rounded-lg border bg-background px-3 h-11 text-sm outline-none focus:ring-2 focus:ring-ring" />
                )}
                <div className="relative">
                  <Mail className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" autoComplete="email"
                    className="w-full rounded-lg border bg-background pl-9 pr-3 h-11 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div className="relative">
                  <Lock className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type={showPw ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "signup" ? "Create a password (8+ chars)" : "Your password"} autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    className="w-full rounded-lg border bg-background pl-9 pr-10 h-11 text-sm outline-none focus:ring-2 focus:ring-ring" />
                  <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Toggle password">
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {err && <p className="text-sm text-danger">{err}</p>}

                <button type="submit" disabled={loading} className="w-full inline-flex items-center justify-center gap-2 rounded-lg brand-gradient text-white h-11 text-sm font-medium disabled:opacity-70">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (mode === "signin" ? "Sign in" : "Create my workspace")}
                  {!loading && <ArrowRight className="h-4 w-4" />}
                </button>
              </form>

              <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>

              <div className="space-y-2">
                {/* On-domain Google (Identity Services). Needs only the public
                    client ID, and the user never leaves cortex.mnbresearch.com. */}
                <GoogleSignIn onSignedIn={afterAuthed} />

                {/* Classic redirect OAuth — shown only when the on-domain route
                    isn't configured but Supabase does have Google enabled, so
                    the two can never appear at once. */}
                {googleOn && !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
                <button onClick={google} className="w-full inline-flex items-center justify-center gap-2 rounded-lg border h-11 text-sm font-medium hover:bg-accent transition-colors">
                  <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"/></svg>
                  Continue with Google
                </button>
                )}
                <button onClick={magicLink} disabled={loading} className="w-full inline-flex items-center justify-center gap-2 rounded-lg border h-11 text-sm text-muted-foreground hover:bg-accent transition-colors">
                  <Mail className="h-4 w-4" /> Email me a one-time login link
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-5">
          {mode === "signin" ? <>New here? <button onClick={() => setMode("signup")} className="text-primary font-medium">Create an account</button></> : <>Already have an account? <button onClick={() => setMode("signin")} className="text-primary font-medium">Sign in</button></>}
          <span className="mx-2">·</span>
          <Link href="/" className="hover:text-foreground">Back to site</Link>
        </p>
        <p className="text-center text-[11px] text-muted-foreground/70 mt-2">By continuing you agree to our <Link href="/terms" className="underline">Terms</Link> &amp; <Link href="/privacy" className="underline">Privacy Policy</Link>.</p>
      </div>
    </main>
  );
}
