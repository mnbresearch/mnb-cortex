"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { INTEGRATIONS, CATEGORIES, planAllows, limitForPlan, type Integration } from "@/lib/integrations";
import { Plug, Check, Lock, Loader2, X, ExternalLink, ShieldCheck, Search, Zap } from "lucide-react";
import Link from "next/link";

type Conn = { provider: string; status: string; config: any };

async function call(op: string, id: string, credentials?: Record<string, string>) {
  const r = await fetch("/api/integrations", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op, id, credentials }),
  });
  return r.json();
}

export function IntegrationsManager({ plan, connections, canManage }: { plan: string; connections: Conn[]; canManage: boolean }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [open, setOpen] = useState<Integration | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState("");

  const connMap = useMemo(() => Object.fromEntries(connections.map((c) => [c.provider, c])), [connections]);
  const used = connections.length;
  const limit = limitForPlan(plan);

  const list = useMemo(() => INTEGRATIONS.filter((i) =>
    (cat === "All" || i.category === cat) &&
    (!q || i.name.toLowerCase().includes(q.toLowerCase()) || i.desc.toLowerCase().includes(q.toLowerCase()))
  ), [q, cat]);

  function openModal(i: Integration) {
    setOpen(i); setValues({}); setMsg(null);
  }

  async function connect() {
    if (!open) return;
    setBusy(true); setMsg(null);
    const j = await call("connect", open.id, values);
    setBusy(false);
    if (j.ok) { setMsg({ ok: true, text: j.message || "Connected" }); setTimeout(() => location.reload(), 1000); }
    else setMsg({ ok: false, text: j.error || "Could not connect" });
  }

  async function disconnect(id: string) {
    setBusy(true);
    await call("disconnect", id);
    location.reload();
  }

  async function test(id: string) {
    setTesting(id);
    const j = await call("test", id);
    setTesting("");
    alert(j.ok ? `✅ ${j.message}` : `⚠️ ${j.error || j.message}`);
  }

  return (
    <div className="space-y-5">
      <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="text-muted-foreground">Plan </span><Badge className="border-border capitalize">{plan}</Badge>
          <span className="text-muted-foreground ml-3">Connected </span>
          <b className={used >= limit ? "text-warning" : ""}>{used}</b>
          <span className="text-muted-foreground"> / {limit === 999 ? "unlimited" : limit}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-success" /> Keys are encrypted (AES-256-GCM) and never shown again after saving.
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search integrations…"
            className="w-full rounded-lg border bg-background pl-9 pr-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring">
          <option>All</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.map((i) => {
          const conn = connMap[i.id];
          const allowed = planAllows(plan, i);
          return (
            <Card key={i.id} className={`p-4 flex flex-col gap-3 hover-lift ${!allowed ? "opacity-75" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <div className={`h-9 w-9 shrink-0 rounded-lg grid place-items-center ${conn ? "brand-gradient text-white" : "bg-secondary"}`}>
                    <Plug className={`h-4 w-4 ${conn ? "" : "text-muted-foreground"}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{i.name}</div>
                    <div className="text-xs text-muted-foreground">{i.desc}</div>
                  </div>
                </div>
                {conn ? (
                  <Badge className={conn.status === "connected" ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20"}>
                    <Check className="h-3 w-3 mr-1" />{conn.status === "connected" ? "Live" : "Check"}
                  </Badge>
                ) : !allowed ? (
                  <Badge className="bg-warning/10 text-warning border-warning/20"><Lock className="h-3 w-3 mr-1" />{i.minPlan}</Badge>
                ) : null}
              </div>

              {conn?.config?.hint && <div className="text-xs text-muted-foreground font-mono">{conn.config.hint}</div>}

              {!canManage ? (
                <p className="text-xs text-muted-foreground">Workspace admins can manage integrations.</p>
              ) : conn ? (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => test(i.id)} disabled={testing === i.id}>
                    {testing === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />} Test
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => disconnect(i.id)}>Disconnect</Button>
                </div>
              ) : allowed ? (
                <Button size="sm" onClick={() => openModal(i)}>Connect</Button>
              ) : (
                <Link href="/pricing"><Button variant="outline" size="sm" className="w-full">Upgrade to {i.minPlan}</Button></Link>
              )}
            </Card>
          );
        })}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => !busy && setOpen(null)}>
          <Card className="w-full max-w-md p-5 space-y-4 animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">Connect {open.name}</div>
                <div className="text-sm text-muted-foreground">{open.desc}</div>
              </div>
              <button onClick={() => setOpen(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>

            {open.fields.map((f) => (
              <label key={f.key} className="block">
                <span className="text-sm text-muted-foreground">{f.label}{f.required && <span className="text-danger"> *</span>}</span>
                <input type={f.type === "password" ? "password" : "text"} placeholder={f.placeholder}
                  value={values[f.key] || ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  autoComplete="off"
                  className="mt-1 w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring" />
                {f.help && <span className="text-xs text-muted-foreground">{f.help}</span>}
              </label>
            ))}

            <div className="rounded-lg border p-3 text-xs text-muted-foreground flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-success mt-0.5 shrink-0" />
              Credentials are encrypted before storage and never sent back to your browser. We verify them with the provider before saving.
            </div>

            {msg && <p className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}

            <div className="flex items-center justify-between gap-2">
              {open.docs ? <a href={open.docs} target="_blank" rel="noopener noreferrer" className="text-sm text-primary inline-flex items-center gap-1">Where to find this <ExternalLink className="h-3 w-3" /></a> : <span />}
              <Button onClick={connect} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{busy ? "Verifying…" : "Connect securely"}</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
