"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Building2, Check, Loader2 } from "lucide-react";

type Org = { id: string; name: string };

async function call(op: string, extra: Record<string, string> = {}) {
  const r = await fetch("/api/superadmin", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op, ...extra }),
  });
  return r.json();
}

export function ProvisionButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function go() {
    setBusy(true); setMsg("");
    const j = await call("provision");
    setMsg(j.ok ? (j.created?.length ? `Created: ${j.created.join(", ")}` : "Workspaces already exist — you're the owner.") : j.error || "Failed");
    setBusy(false);
    if (j.ok) setTimeout(() => location.reload(), 900);
  }
  return (
    <div className="mt-3">
      <Button onClick={go} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
        {busy ? "Working…" : "Create / repair my business workspaces"}
      </Button>
      {msg && <p className="text-sm mt-2 text-muted-foreground">{msg}</p>}
    </div>
  );
}

export function JoinButton({ orgId }: { orgId: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function go() {
    setBusy(true);
    const j = await call("join", { org_id: orgId });
    setBusy(false); setDone(Boolean(j.ok));
    if (j.ok) setTimeout(() => location.reload(), 700);
  }
  return (
    <Button size="sm" variant="outline" onClick={go} disabled={busy || done}>
      {done ? <Check className="h-4 w-4" /> : null}{busy ? "…" : done ? "Done" : "Make me owner"}
    </Button>
  );
}

export function GrantAccessForm({ orgs }: { orgs: Org[] }) {
  const [orgId, setOrgId] = useState(orgs[0]?.id || "");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("admin");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !email) return;
    setBusy(true); setMsg("");
    const j = await call("grant", { org_id: orgId, email, role });
    setMsg(j.ok ? `Access granted to ${email} as ${role}.` : j.error || "Failed");
    setBusy(false);
    if (j.ok) setEmail("");
  }

  const I = "rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <form onSubmit={go} className="flex flex-wrap items-end gap-2">
      <label className="text-sm">
        <span className="text-muted-foreground block mb-1">Organization</span>
        <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className={I + " min-w-[200px]"}>
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </label>
      <label className="text-sm">
        <span className="text-muted-foreground block mb-1">Email</span>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@company.com" className={I + " min-w-[220px]"} />
      </label>
      <label className="text-sm">
        <span className="text-muted-foreground block mb-1">Role</span>
        <select value={role} onChange={(e) => setRole(e.target.value)} className={I}>
          {["viewer", "analyst", "manager", "admin", "owner"].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      <Button type="submit" disabled={busy}>{busy ? "Granting…" : "Grant access"}</Button>
      {msg && <p className="text-sm w-full text-muted-foreground">{msg}</p>}
    </form>
  );
}
