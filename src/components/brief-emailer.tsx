"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, Check } from "lucide-react";

export function BriefEmailer() {
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<null | "ok" | "pending" | "err">(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function send() {
    setLoading(true); setStatus(null); setMsg("");
    try {
      const r = await fetch("/api/brief/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to }) });
      const j = await r.json();
      if (j.sent) { setStatus("ok"); setMsg(`Sent to ${j.to}.`); }
      else { setStatus("pending"); setMsg(j.reason === "no RESEND_API_KEY" ? "Email isn't configured yet (add RESEND_API_KEY) — but here's the brief on screen." : `Couldn't send${j.reason ? " (" + j.reason + ")" : ""}.`); }
    } catch { setStatus("err"); setMsg("Network error."); }
    finally { setLoading(false); }
  }

  return (
    <Card className="p-4">
      <div className="font-semibold text-sm flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /> Email me this brief</div>
      <div className="text-sm text-muted-foreground mt-1">Get today's brief in your inbox. Leave blank to use your account email.</div>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@company.com (optional)"
          className="rounded-lg border bg-background px-3 h-10 text-sm flex-1 min-w-[220px] outline-none focus:ring-2 focus:ring-ring" />
        <Button onClick={send} disabled={loading}>{status === "ok" ? <Check className="h-4 w-4" /> : <Mail className="h-4 w-4" />} {loading ? "Sending…" : "Send brief"}</Button>
      </div>
      {msg && <p className={`text-sm mt-2 ${status === "ok" ? "text-success" : "text-muted-foreground"}`}>{msg}</p>}
    </Card>
  );
}
