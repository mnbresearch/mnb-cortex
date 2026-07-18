"use client";
import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Mail, ArrowRight } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const configured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

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
        <div className="rounded-xl border bg-card p-6">
          <h1 className="text-xl font-semibold">Welcome back</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to your AI COO.</p>

          {sent ? (
            <p className="mt-6 text-sm">Check your inbox — we sent a magic link to <b>{email}</b>.</p>
          ) : (
            <>
              <Button variant="outline" className="w-full mt-6" onClick={signInGoogle}>Continue with Google</Button>
              <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
              </div>
              <form onSubmit={signInEmail} className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg border px-3 h-11">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <input value={email} onChange={(e) => setEmail(e.target.value)} required type="email"
                    placeholder="you@company.com" className="flex-1 bg-transparent outline-none text-sm" />
                </div>
                <Button className="w-full" disabled={loading}>
                  {loading ? "Sending…" : <>Email me a magic link <ArrowRight className="h-4 w-4" /></>}
                </Button>
              </form>
            </>
          )}
          {err && <p className="mt-3 text-xs text-danger">{err}</p>}
          {!configured && (
            <p className="mt-4 text-xs text-muted-foreground">
              Supabase isn’t configured yet — you can still <Link href="/dashboard" className="text-primary underline">explore the live demo</Link>.
            </p>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground mt-4">
          <Link href="/dashboard" className="underline">Skip and view demo →</Link>
        </p>
      </div>
    </main>
  );
}
