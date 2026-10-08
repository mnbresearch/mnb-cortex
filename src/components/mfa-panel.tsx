"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ShieldCheck, ShieldAlert, Loader2, KeyRound } from "lucide-react";

/*
  TOTP two-step sign-in, using Supabase Auth's own MFA API. Nothing here is a
  security boundary — the server reads the session's assurance level from the
  JWT Supabase mints (lib/strong-auth.ts). This panel only lets a person
  enrol a factor and raise their current session to aal2.
*/
type Aal = "aal1" | "aal2" | null;
type Factor = { id: string; status: string; friendly_name?: string | null; factor_type?: string };

export function MfaPanel({ current, next }: { current: Aal; next: Aal }) {
  const router = useRouter();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enrol, setEnrol] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const sb = createClient();
    const { data, error } = await sb.auth.mfa.listFactors();
    if (error) { setMsg({ ok: false, text: error.message }); setFactors([]); return; }
    setFactors(((data?.all as Factor[]) || []).filter((f) => (f.factor_type || "totp") === "totp"));
  }
  useEffect(() => { void load(); }, []);

  const verified = (factors || []).find((f) => f.status === "verified");

  async function startEnrol() {
    setBusy(true); setMsg(null);
    try {
      const sb = createClient();
      // A half-finished enrolment from an earlier attempt blocks a new one with the same name.
      for (const f of (factors || []).filter((x) => x.status !== "verified")) await sb.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `Cortex ${new Date().toISOString().slice(0, 10)}` });
      if (error || !data) throw new Error(error?.message || "Could not start.");
      setEnrol({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (e: any) { setMsg({ ok: false, text: e?.message || "Could not start." }); }
    finally { setBusy(false); }
  }

  async function verify(factorId: string) {
    if (!/^\d{6}$/.test(code.trim())) { setMsg({ ok: false, text: "Enter the 6-digit code from your app." }); return; }
    setBusy(true); setMsg(null);
    try {
      const sb = createClient();
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
      if (error) throw new Error(error.message);
      setEnrol(null); setCode("");
      setMsg({ ok: true, text: "Confirmed. High-impact actions are unlocked for this sign-in." });
      await load();
      router.refresh();
    } catch (e: any) { setMsg({ ok: false, text: /invalid|expired/i.test(String(e?.message)) ? "That code didn't match — codes change every 30 seconds; try the current one." : e?.message || "Could not verify." }); }
    finally { setBusy(false); }
  }

  async function remove(factorId: string) {
    if (!confirm("Turn off two-step sign-in? If this workspace requires it, you won't be able to approve high-impact actions until you turn it back on.")) return;
    setBusy(true); setMsg(null);
    try {
      const sb = createClient();
      const { error } = await sb.auth.mfa.unenroll({ factorId });
      if (error) throw new Error(error.message);
      await sb.auth.refreshSession();
      setMsg({ ok: true, text: "Two-step sign-in is off." });
      await load(); router.refresh();
    } catch (e: any) { setMsg({ ok: false, text: e?.message || "Could not turn it off." }); }
    finally { setBusy(false); }
  }

  const codeInput = (
    <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
      aria-label="6-digit code" placeholder="123456" className="w-32 rounded-lg border bg-background h-10 px-3 text-sm tracking-widest" />
  );

  return (
    <div className="space-y-3 text-sm">
      {factors === null ? (
        <div className="text-muted-foreground inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking…</div>
      ) : verified ? (
        current === "aal2" ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 text-success"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> On, and confirmed for this sign-in.</span>
            <button type="button" onClick={() => remove(verified.id)} disabled={busy} className="text-xs text-muted-foreground underline">Turn off</button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2"><KeyRound className="h-4 w-4" aria-hidden="true" /> On. Confirm it's you to unlock high-impact actions for this sign-in.</div>
            <div className="flex items-center gap-2">{codeInput}
              <button type="button" onClick={() => verify(verified.id)} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground h-10 px-4 font-medium disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Confirm</button>
            </div>
          </div>
        )
      ) : enrol ? (
        <div className="space-y-3">
          <p>Scan this with your authenticator app, then enter the 6-digit code it shows.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrol.qr} alt="QR code to add Cortex to your authenticator app" width={180} height={180} className="rounded-lg border bg-white p-2" />
          <p className="text-xs text-muted-foreground">Can't scan? Enter this key by hand: <code className="select-all break-all">{enrol.secret}</code></p>
          <div className="flex items-center gap-2">{codeInput}
            <button type="button" onClick={() => verify(enrol.id)} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground h-10 px-4 font-medium disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Turn on</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 text-warning"><ShieldAlert className="h-4 w-4" aria-hidden="true" /> Off.</span>
          <button type="button" onClick={startEnrol} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground h-10 px-4 font-medium disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Turn on two-step sign-in</button>
        </div>
      )}
      {msg && <div role="status" className={`rounded-lg p-2.5 text-xs ${msg.ok ? "bg-success/10 border border-success/30" : "bg-destructive/5 border border-destructive/30"}`}>{msg.text}</div>}
      {next === "aal2" && current !== "aal2" && !verified && factors !== null && <p className="text-xs text-muted-foreground">Your account has a second factor that isn't visible here; refresh the page.</p>}
    </div>
  );
}
