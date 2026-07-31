"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Building2, Check, Loader2, Coins, CalendarPlus, Save } from "lucide-react";

type Org = { id: string; name: string };

const PLAN_OPTS = ["solo", "starter", "growth", "premium", "business", "enterprise"];
const STATUS_OPTS = ["trialing", "active", "expired", "suspended", "cancelled"];

async function call(op: string, extra: Record<string, any> = {}) {
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

type ManagedOrg = {
  id: string; name: string; plan: string | null; subscription_status: string | null;
  credits: number; credits_allowance: number | null; trial_ends_at: string | null; members: number;
};

const statusTone: Record<string, string> = {
  active: "text-success", trialing: "text-primary",
  expired: "text-danger", suspended: "text-danger", cancelled: "text-muted-foreground",
};

export function OrgManager({ org }: { org: ManagedOrg }) {
  const [plan, setPlan] = useState(org.plan || "growth");
  const [status, setStatus] = useState(org.subscription_status || "trialing");
  const [credits, setCredits] = useState(org.credits || 0);
  const [amount, setAmount] = useState(1000);
  const [allowance, setAllowance] = useState(org.credits_allowance ?? 0);
  const [busy, setBusy] = useState<string>("");
  const [msg, setMsg] = useState("");

  const dirty = plan !== (org.plan || "growth") || status !== (org.subscription_status || "trialing");

  async function run(tag: string, extra: Record<string, any>) {
    setBusy(tag); setMsg("");
    const j = await call("manage", { org_id: org.id, ...extra });
    setBusy("");
    if (!j.ok) { setMsg(j.error || "Failed"); return; }
    if (typeof j.credits === "number") setCredits(j.credits);
    setMsg(j.creditsWarning || "Saved.");
  }

  const trialLabel = org.trial_ends_at
    ? new Date(org.trial_ends_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "—";
  const I = "rounded-lg border bg-background px-2 h-9 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{org.name}</div>
          <div className="text-xs text-muted-foreground">{org.members} member{org.members === 1 ? "" : "s"} · trial ends {trialLabel}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Credits</div>
          <div className="text-lg font-bold tabular-nums flex items-center gap-1 justify-end"><Coins className="h-4 w-4 text-primary" />{credits.toLocaleString("en-IN")}</div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm"><span className="text-muted-foreground block mb-1">Plan</span>
          <select className={I + " w-full capitalize"} value={plan} onChange={(e) => setPlan(e.target.value)}>
            {PLAN_OPTS.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
          </select>
        </label>
        <label className="text-sm"><span className="text-muted-foreground block mb-1">Status</span>
          <select className={`${I} w-full capitalize ${statusTone[status] || ""}`} value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTS.map((s) => <option key={s} value={s} className="capitalize text-foreground">{s}</option>)}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm"><span className="text-muted-foreground block mb-1">Credit amount</span>
          <input className={I + " w-28"} type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></label>
        <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => run("add", { creditsDelta: Math.abs(amount) })}>
          {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />} Add
        </Button>
        <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => run("revoke", { creditsDelta: -Math.abs(amount) })}>Revoke</Button>
        <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => run("set", { creditsSet: Math.abs(amount) })}>Set to</Button>
        <div className="w-px h-8 bg-border mx-1" />
        <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => run("t14", { extendTrialDays: 14 })}>
          {busy === "t14" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />} +14d trial
        </Button>
        <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => run("t30", { extendTrialDays: 30 })}>+30d</Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm"><span className="text-muted-foreground block mb-1">Monthly allowance override</span>
          <input className={I + " w-32"} type="number" value={allowance} onChange={(e) => setAllowance(Number(e.target.value))} /></label>
        <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => run("allow", { creditsAllowance: allowance })}>
          {busy === "allow" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Set allowance
        </Button>
        <span className="text-xs text-muted-foreground">0 = plan default · -1 = unlimited</span>
      </div>

      <div className="flex items-center gap-3">
        <Button size="sm" disabled={!dirty || Boolean(busy)} onClick={() => run("save", { plan, subscription_status: status })}>
          {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save plan &amp; status
        </Button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}
