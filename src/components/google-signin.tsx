"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Google sign-in that happens ON THIS DOMAIN.
 *
 * There are two ways to do Google with Supabase, and they need different things
 * from Google Cloud:
 *
 *  1. Redirect OAuth (signInWithOAuth). The browser leaves for Google, comes
 *     back to SUPABASE's callback, and Supabase forwards to us. Google must
 *     whitelist an "Authorised redirect URI" belonging to supabase.co, and
 *     Supabase needs the client SECRET.
 *
 *  2. Google Identity Services + signInWithIdToken — this component. Google
 *     issues an ID token in the page, we hand it to Supabase, and the user
 *     never leaves cortex.mnbresearch.com. Google only needs OUR domain as an
 *     "Authorised JavaScript origin", and the only value we hold is the client
 *     ID, which is public by design and ships in the page source.
 *
 * The second is what an operator usually means by "whitelist my domain", it
 * looks better (no full-page bounce to Google), and it keeps a client secret
 * out of one more place. Supabase still validates the token's audience, so the
 * same client ID must also be set on Supabase's Google provider — Supabase is
 * where the user record and session live, and that isn't optional whichever
 * route you take.
 *
 * Renders nothing when NEXT_PUBLIC_GOOGLE_CLIENT_ID is absent, so an
 * unconfigured deployment shows no broken button.
 */

declare global { interface Window { google?: any } }

const GSI_SRC = "https://accounts.google.com/gsi/client";

export function GoogleSignIn({ onSignedIn }: { onSignedIn: () => void | Promise<void> }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const holder = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!clientId || !holder.current) return;
    let cancelled = false;

    async function handle(credential: string) {
      setBusy(true); setErr("");
      try {
        const supabase = createClient();
        const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: credential });
        if (error) throw error;
        await onSignedIn();
      } catch (e: any) {
        // Named causes rather than "sign-in failed" — the audience mismatch is
        // by far the most common, and its fix is one specific setting.
        const m = String(e?.message || "");
        setErr(
          /audience|aud|client/i.test(m)
            ? "Google signed you in, but this app's client ID isn't registered on the Supabase project. Add it under Authentication → Providers → Google."
            : (m || "Google sign-in failed."),
        );
      } finally {
        setBusy(false);
      }
    }

    function init() {
      if (cancelled || !window.google?.accounts?.id || !holder.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (res: any) => { if (res?.credential) handle(res.credential); },
        // Chrome's third-party cookie removal breaks the older iframe flow.
        use_fedcm_for_prompt: true,
        auto_select: false,
      });
      window.google.accounts.id.renderButton(holder.current, {
        theme: "outline", size: "large", width: 320,
        text: "continue_with", shape: "rectangular", logo_alignment: "left",
      });
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing && window.google?.accounts?.id) { init(); return () => { cancelled = true; }; }

    const s = existing || document.createElement("script");
    if (!existing) { s.src = GSI_SRC; s.async = true; s.defer = true; document.head.appendChild(s); }
    s.addEventListener("load", init);
    return () => { cancelled = true; s.removeEventListener("load", init); };
  }, [clientId, onSignedIn]);

  if (!clientId) return null;

  return (
    <div className="space-y-2">
      {/* Google renders its own button in here — its branding rules require
          using their widget rather than a lookalike. */}
      <div ref={holder} className={busy ? "opacity-60 pointer-events-none" : ""} />
      {busy && <p className="text-xs text-muted-foreground">Signing you in…</p>}
      {err && <p className="text-xs text-danger">{err}</p>}
    </div>
  );
}
