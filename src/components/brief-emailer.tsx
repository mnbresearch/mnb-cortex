"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, Check } from "lucide-react";

/**
 * The brief is always sent to the signed-in account's own email address — the
 * server ignores any other recipient, so there's no address field to fill in.
 */
export function BriefEmailer() {
  const [status, setStatus] = useState<null | "ok" | "pending" | "err">(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function send() {
    setLoading(true); setStatus(null); setMsg("");
    try {
      const r = await fetch("/api/brief/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => ({} as any));
      if (r.status === 401) { setStatus("err"); setMsg("Sign in to email yourself the brief."); return; }
      if (r.status === 402) { setStatus("err"); setMsg(j.error || "You're out of AI credits."); return; }
      if (j.sent) { setStatus("ok"); setMsg(`Sent to ${j.to}.`); }
      else { setStatus("pending"); setMsg(j.reason === "no RESEND_API_KEY" ? "Email isn't configured yet (add RESEND_API_KEY) — but here's the brief on screen." : `Couldn't send${j.reason ? " (" + j.reason + ")" : ""}.`); }
    } catch { setStatus("err"); setMsg("Network error."); }
    finally { setLoading(false); }
  }

  return (
    <Card className="p-4">
      {/*
        "Email me THIS brief" was wrong in a way worth naming. /api/brief/email
        builds its own brief server-side; it does not send whatever is on
        screen. So after generating one and pressing this, a customer could
        receive a different brief from the one they had just read, with nothing
        explaining the difference.

        The suggested fix elsewhere was to disable this until a brief had been
        generated on screen — but that would be wrong here, because this button
        genuinely works on its own and is the point of "never open the app".
        The copy is what needed correcting, not the behaviour.
      */}
      <div className="font-semibold text-sm flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /> Email me a brief</div>
      <div className="text-sm text-muted-foreground mt-1">Builds a fresh brief from your current figures and sends it to your account email address — it does not email the one shown above.</div>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <Button onClick={send} disabled={loading}>{status === "ok" ? <Check className="h-4 w-4" /> : <Mail className="h-4 w-4" />} {loading ? "Sending…" : "Send brief"}</Button>
      </div>
      {msg && <p className={`text-sm mt-2 ${status === "ok" ? "text-success" : "text-muted-foreground"}`}>{msg}</p>}
    </Card>
  );
}
