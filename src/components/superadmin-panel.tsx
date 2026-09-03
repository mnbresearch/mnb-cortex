"use client";
import { PLANS } from "@/lib/config";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Building2, Check, Loader2, Coins, CalendarPlus, Save, UserPlus, Download } from "lucide-react";

type Org = { id: string; name: string };

// Derived from the catalogue, never typed out. This list was a hardcoded copy
// of the old six-tier ladder, so after the repricing the console physically
// could not assign `aicoo` — the ₹39,999 tier was unreachable from the one
// screen built to assign it. The server-side allowlist had the same bug.
// Legacy ids are appended so an existing row on `solo`/`premium` stays editable.
const LEGACY_PLAN_OPTS = ["solo", "premium"];
const PLAN_OPTS = [...PLANS.map((p) => p.id), ...LEGACY_PLAN_OPTS];
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

const INPUT = "rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring";

/** One-click: create a customer's workspace, set plan + credits, invite & email them. */
export function ProvisionCustomerForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [plan, setPlan] = useState("watch");
  const [credits, setCredits] = useState("4000");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setBusy(true); setRes(null);
    const j = await call("provisionCustomer", { email: email.trim(), name: name.trim(), company: company.trim(), plan, credits: Number(credits) || 0 });
    setBusy(false); setRes(j);
    if (j.ok) setTimeout(() => location.reload(), 2500);
  }

  return (
    <form onSubmit={go} className="grid sm:grid-cols-2 gap-3 max-w-2xl">
      <input required type="email" placeholder="Customer email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${INPUT} sm:col-span-2`} />
      <input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
      <input placeholder="Company / workspace name (optional)" value={company} onChange={(e) => setCompany(e.target.value)} className={INPUT} />
      <label className="text-sm">
        <span className="text-xs text-muted-foreground">Plan</span>
        <select value={plan} onChange={(e) => setPlan(e.target.value)} className={`${INPUT} w-full mt-1`}>
          {PLAN_OPTS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label className="text-sm">
        <span className="text-xs text-muted-foreground">Starting credits</span>
        <input type="number" min={0} value={credits} onChange={(e) => setCredits(e.target.value)} className={`${INPUT} w-full mt-1`} />
      </label>
      <div className="sm:col-span-2">
        <Button disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          {busy ? "Provisioning…" : "Provision & invite customer"}
        </Button>
      </div>
      {res && (
        <div className={`sm:col-span-2 text-sm rounded-lg border p-3 ${res.ok ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5"}`}>
          {res.ok ? (
            <>
              Created <b>{res.orgName}</b> on the <b>{res.plan}</b> plan{res.credits ? <> with <b>{Number(res.credits).toLocaleString("en-IN")}</b> credits</> : null}.{" "}
              {res.emailed ? "Activation email sent." : "Workspace ready — email not sent (check email config)."}
              {res.creditsWarning ? <> Note: {res.creditsWarning}</> : null}
              <div className="mt-1 text-muted-foreground">They own it automatically when they sign up with that email. Reloading…</div>
            </>
          ) : (res.error || "Failed")}
        </div>
      )}
    </form>
  );
}

export function OrgManager({ org }: { org: ManagedOrg }) {
  const [plan, setPlan] = useState(org.plan || "watch");
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
        {/* Grants a PAID period, not a trial — trials no longer exist. This
            button used to write trial_ends_at, which nothing reads any more. */}
        <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => run("t14", { subscriptionDays: 14 })}>
          {busy === "t14" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />} +14d paid
        </Button>
        <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => run("t30", { subscriptionDays: 30 })}>+30d paid</Button>
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

/**
 * Take a backup, now, to a file on your own machine.
 *
 * Deliberately a button and not just a URL. A backup procedure that depends on
 * remembering an undocumented endpoint is the kind that turns out to be three
 * weeks stale on the day it matters.
 *
 * The download is driven through fetch rather than a plain link so that the
 * X-Backup-Complete header can be read and surfaced. A partial backup that
 * looks identical to a good one is worse than an obvious failure, because you
 * will find out which it was at the worst possible moment.
 */
export function BackupButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [warn, setWarn] = useState(false);

  async function go() {
    setBusy(true); setMsg("Reading every table… this can take a minute."); setWarn(false);
    try {
      const r = await fetch("/api/admin/backup");
      if (!r.ok) {
        const j = await r.json().catch(() => ({} as any));
        setWarn(true);
        setMsg(j?.error || `Backup failed (HTTP ${r.status}).`);
        return;
      }

      const complete = r.headers.get("X-Backup-Complete") === "true";
      const rows = Number(r.headers.get("X-Backup-Rows") || 0);
      const blob = await r.blob();

      const name = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") || "")?.[1]
        || `cortex-backup-${new Date().toISOString().slice(0, 10)}.json.gz`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      // Revoking immediately can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);

      const size = blob.size < 1_048_576
        ? `${Math.max(1, Math.round(blob.size / 1024))} KB`
        : `${(blob.size / 1_048_576).toFixed(1)} MB`;

      setWarn(!complete);
      setMsg(complete
        ? `Saved ${name} — ${rows.toLocaleString()} rows, ${size}.`
        : `Saved ${name}, but it is INCOMPLETE (${rows.toLocaleString()} rows). Some tables were capped or unreadable — open the manifest inside the file before relying on it.`);
    } catch (e: any) {
      setWarn(true);
      setMsg(e?.message || "Backup failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <Button onClick={go} disabled={busy} variant="outline">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {busy ? "Backing up…" : "Download a backup now"}
      </Button>
      {msg && (
        <p className={`text-xs mt-2 ${warn ? "text-danger" : "text-muted-foreground"}`}>{msg}</p>
      )}
    </div>
  );
}
