import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isSuperAdmin, getAllOrgs, getPortfolioStatus, currentEmail } from "@/lib/superadmin";
import { getPlatformEconomics } from "@/lib/admin-metrics";
import { inr } from "@/lib/utils";
import { ProvisionButton, JoinButton, GrantAccessForm, OrgManager, ProvisionCustomerForm } from "@/components/superadmin-panel";
import { ShieldAlert, Building2, Users, Activity, Lock, ExternalLink, IndianRupee, TrendingUp, Cpu, AlertTriangle } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SuperAdmin() {
  const allowed = await isSuperAdmin();
  const email = await currentEmail();

  if (!allowed) {
    return (
      <>
        <Topbar title="Super Admin" subtitle="Platform operations" />
        <PageShell>
          <Card className="p-8 text-center max-w-lg mx-auto">
            <div className="h-12 w-12 rounded-full bg-danger/10 grid place-items-center mx-auto"><Lock className="h-6 w-6 text-danger" /></div>
            <h2 className="mt-3 font-semibold">Restricted area</h2>
            <p className="text-sm text-muted-foreground mt-1">
              This console is limited to platform super-admins.{email ? ` You're signed in as ${email}.` : " You are not signed in."}
            </p>
            <Link href="/dashboard"><Button variant="outline" className="mt-4">Back to dashboard</Button></Link>
          </Card>
        </PageShell>
      </>
    );
  }

  const [{ rows, live, reason }, portfolio, econ] = await Promise.all([getAllOrgs(), getPortfolioStatus(), getPlatformEconomics()]);
  const totalMembers = rows.reduce((s, r) => s + r.members, 0);

  // ---- Adoption ----
  const now = Date.now(); const DAY = 86_400_000;
  const ctime = (r: typeof rows[number]) => (r.created_at ? new Date(r.created_at).getTime() : 0);
  const newWeek = rows.filter((r) => ctime(r) > now - 7 * DAY).length;
  const newMonth = rows.filter((r) => ctime(r) > now - 30 * DAY).length;
  const activated = rows.filter((r) => r.metrics > 0).length;
  const paid = rows.filter((r) => String(r.subscription_status || "") === "active").length;
  const trialing = rows.length - paid;
  const recent = rows.slice(0, 10);
  const fmtDate = (s: string) => { try { return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }); } catch { return "—"; } };
  const statusText = (r: typeof rows[number]) => String(r.subscription_status || "trialing");

  return (
    <>
      <Topbar title="Super Admin" subtitle="Platform-wide control — every organization" />
      <PageShell>
        <Card className="p-4 border-primary/30 bg-primary/5">
          <div className="text-sm flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span>
              You are a <b>platform super-admin</b> ({email}). This is a level above org “owner”: owners control one workspace, you see and provision them all.
              Access is restricted by email allowlist — customers can never reach this page.
            </span>
          </div>
        </Card>

        {!live && (
          <Card className="p-4 border-warning/30 bg-warning/5">
            <div className="text-sm"><b className="text-warning">Platform data unavailable:</b> {reason || "unknown"}. The console needs the service-role key to read across organizations.</div>
          </Card>
        )}

        <div className="grid sm:grid-cols-3 gap-3">
          <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Building2 className="h-4 w-4 text-primary" /> Organizations</div><div className="text-2xl font-bold mt-1">{rows.length}</div></Card>
          <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="h-4 w-4 text-primary" /> Total members</div><div className="text-2xl font-bold mt-1">{totalMembers}</div></Card>
          <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Activity className="h-4 w-4 text-primary" /> Orgs with live data</div><div className="text-2xl font-bold mt-1">{activated}</div></Card>
        </div>

        {/* The screen that answers "is this making money?". Nothing in the product
            showed revenue against what the AI actually costs — which is exactly
            how a ₹270-per-clip loss on video went unnoticed for weeks. */}
        <Section title="Money" desc="Revenue collected against estimated AI cost — the number that decides whether ads are worth it">
          {!econ.live ? (
            <p className="text-sm text-muted-foreground">Not available — {econ.reason}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingUp className="h-4 w-4 text-success" /> MRR</div>
                  <div className="text-2xl font-bold mt-1 tabular">{inr(econ.mrr)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{econ.payingOrgs} paying · {econ.paygOrgs} pay-as-you-go</div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><IndianRupee className="h-4 w-4 text-primary" /> Collected · 30d</div>
                  <div className="text-2xl font-bold mt-1 tabular">{inr(econ.revenue30d)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{inr(econ.revenueTotal)} all time</div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Cpu className="h-4 w-4 text-warning" /> AI cost · 30d</div>
                  <div className="text-2xl font-bold mt-1 tabular">{inr(Math.round(econ.cogs30d))}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">estimated from the credit ledger</div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground">Gross margin · 30d</div>
                  <div className={`text-2xl font-bold mt-1 tabular ${econ.grossMargin30d === null ? "" : econ.grossMargin30d >= 60 ? "text-success" : econ.grossMargin30d >= 0 ? "text-warning" : "text-danger"}`}>
                    {econ.grossMargin30d === null ? "—" : `${econ.grossMargin30d.toFixed(0)}%`}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{econ.grossMargin30d === null ? "no revenue yet" : "revenue minus AI cost"}</div>
                </Card>
              </div>

              {econ.usage.length > 0 && (
                <div className="mt-4">
                  <div className="text-sm font-medium mb-2">Where the AI spend goes · last 30 days</div>
                  <div className="rounded-xl border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr><th className="text-left px-3 py-2 font-medium">Action</th><th className="text-right px-3 py-2 font-medium">Runs</th><th className="text-right px-3 py-2 font-medium">Credits</th><th className="text-right px-3 py-2 font-medium">Est. cost</th></tr>
                      </thead>
                      <tbody>
                        {econ.usage.slice(0, 12).map((u) => (
                          <tr key={u.mode} className="border-t">
                            <td className="px-3 py-2">{u.mode}</td>
                            <td className="px-3 py-2 text-right tabular">{u.runs}</td>
                            <td className="px-3 py-2 text-right tabular">{u.credits}</td>
                            <td className="px-3 py-2 text-right tabular">{inr(Math.round(u.costInr))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {econ.watchlist.length > 0 && (
                <div className="mt-4 rounded-xl border border-warning/40 bg-warning/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="h-4 w-4 text-warning" /> Costing more than a third of what they pay</div>
                  <p className="text-xs text-muted-foreground mt-1">Worth a look before it becomes a loss. A workspace paying ₹0 here is on pay-as-you-go — check the credits cover it.</p>
                  <div className="mt-2 space-y-1.5">
                    {econ.watchlist.map((w) => (
                      <div key={w.org_id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{w.name} <span className="text-muted-foreground">· {w.plan}</span></span>
                        <span className="tabular shrink-0">{inr(Math.round(w.cost30d))} cost vs {w.monthly ? inr(w.monthly) : "PAYG"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Section>

        <Section title="Adoption" desc="Signups, activation and plan mix across the platform">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { l: "New this week", v: newWeek },
              { l: "New this month", v: newMonth },
              { l: "Activated (has data)", v: activated },
              { l: "Paid", v: paid },
              { l: "Trialing", v: trialing },
            ].map((s) => (
              <Card key={s.l} className="p-4"><div className="text-xs text-muted-foreground">{s.l}</div><div className="text-2xl font-bold mt-1">{s.v}</div></Card>
            ))}
          </div>
          <Card className="mt-3 overflow-hidden p-0">
            <div className="p-4 pb-2 text-sm font-semibold">Recent signups</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 px-4 font-normal">Workspace</th>
                  <th className="py-2 px-3 font-normal">Plan</th>
                  <th className="py-2 px-3 font-normal">Status</th>
                  <th className="py-2 px-3 font-normal">Members</th>
                  <th className="py-2 px-3 font-normal">Data</th>
                  <th className="py-2 px-3 font-normal">Joined</th>
                </tr></thead>
                <tbody>
                  {recent.length === 0 ? (
                    <tr><td colSpan={6} className="py-4 px-4 text-muted-foreground">No workspaces yet.</td></tr>
                  ) : recent.map((r) => (
                    <tr key={r.id} className="border-b border-border/60">
                      <td className="py-2 px-4 font-medium">{r.name}</td>
                      <td className="py-2 px-3">{r.plan || "—"}</td>
                      <td className="py-2 px-3"><Badge className={statusText(r) === "active" ? "bg-success/10 text-success border-success/20" : statusText(r) === "trialing" ? "bg-warning/10 text-warning border-warning/20" : "border-border text-muted-foreground"}>{statusText(r)}</Badge></td>
                      <td className="py-2 px-3">{r.members}</td>
                      <td className="py-2 px-3">{r.metrics > 0 ? <span className="text-success">Yes</span> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="py-2 px-3 text-muted-foreground">{fmtDate(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Section>

        <Section title="My portfolio" desc="Your own businesses, tracked as separate workspaces">
          <div className="grid sm:grid-cols-2 gap-3">
            {portfolio.businesses.map((b) => (
              <Card key={b.slug} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{b.name}</div>
                    <div className="text-sm text-muted-foreground">{b.tagline}</div>
                  </div>
                  <Badge className={b.org ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20"}>
                    {b.org ? "Workspace live" : "Not created"}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge className="border-border text-muted-foreground">{b.category}</Badge>
                  {b.sectorsServed.map((s) => <Badge key={s} className="border-border text-muted-foreground">{s}</Badge>)}
                </div>
                <div className="mt-3 text-sm text-muted-foreground">
                  {b.org ? (
                    <>Members: <b className="text-foreground">{b.org.members}</b> · Metrics rows: <b className="text-foreground">{b.org.metrics}</b> · Plan: <b className="text-foreground">{b.org.plan}</b>
                      {b.org.metrics === 0 && <div className="mt-1 text-warning">No business data imported yet — figures will stay empty until you import real numbers.</div>}
                    </>
                  ) : "Create the workspace below, then import real data."}
                </div>
                {b.publicKpis?.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-medium text-muted-foreground mb-1.5">Published figures (from the company's own site — not internal accounts)</div>
                    <div className="grid grid-cols-2 gap-2">
                      {b.publicKpis.map((k) => (
                        <div key={k.label} className="rounded-lg border p-2">
                          <div className="text-sm font-bold">{k.value}</div>
                          <div className="text-[11px] text-muted-foreground leading-tight">{k.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <a href={b.site} target="_blank" rel="noopener noreferrer" className="text-sm text-primary inline-flex items-center gap-1">Website <ExternalLink className="h-3 w-3" /></a>
                  {b.app && <a href={b.app} target="_blank" rel="noopener noreferrer" className="text-sm text-primary inline-flex items-center gap-1">App <ExternalLink className="h-3 w-3" /></a>}
                  {b.org && <JoinButton orgId={b.org.id} />}
                </div>
              </Card>
            ))}
          </div>
          <ProvisionButton />
          <p className="text-xs text-muted-foreground mt-2">
            This creates the workspaces and profiles only. Real revenue, margin and cash figures must come from your own systems — import them via <Link href="/import" className="text-primary">Import data</Link> or the public API. Nothing is invented.
          </p>
        </Section>

        <Section title="All organizations" desc="Every workspace on the platform">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No organizations yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-4 font-medium">Organization</th>
                  <th className="py-2 pr-3 font-medium">Industry</th>
                  <th className="py-2 pr-3 font-medium">Plan</th>
                  <th className="py-2 pr-3 font-medium">Members</th>
                  <th className="py-2 pr-3 font-medium">Data</th>
                  <th className="py-2 font-medium">Created</th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{r.name}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{r.industry || "—"}</td>
                      <td className="py-2 pr-3"><Badge className="border-border text-muted-foreground">{r.plan || "—"}</Badge></td>
                      <td className="py-2 pr-3">{r.members}</td>
                      <td className="py-2 pr-3">{r.metrics > 0 ? <span className="text-success">{r.metrics} metrics</span> : <span className="text-muted-foreground">empty</span>}</td>
                      <td className="py-2 text-muted-foreground">{new Date(r.created_at).toLocaleDateString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Onboard a customer" desc="One click: create their workspace, set plan + credits, and email them an activation link">
          <ProvisionCustomerForm />
          <p className="text-xs text-muted-foreground mt-2">
            Creates the workspace on the chosen plan with starting credits, adds a pending owner invite for their email, and emails them a sign-in link. They own it the moment they sign up with that email — no password handling on your side. Then it appears under “Manage customers” below.
          </p>
        </Section>

        <Section title="Manage customers" desc="Change any workspace's plan, subscription status, credits, or trial — takes effect immediately">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No organizations to manage yet.</p>
          ) : (
            <div className="grid lg:grid-cols-2 gap-3">
              {rows.map((r) => (
                <OrgManager key={r.id} org={{
                  id: r.id, name: r.name, plan: r.plan, subscription_status: r.subscription_status,
                  credits: r.credits, credits_allowance: r.credits_allowance, trial_ends_at: r.trial_ends_at, members: r.members,
                }} />
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Setting status to <b>suspended</b>, <b>cancelled</b>, or <b>expired</b> locks that customer out behind the paywall; <b>active</b> restores full access. Your own portfolio workspaces are never gated.
          </p>
        </Section>

        <Section title="Grant access" desc="Provision an admin (or any role) on any organization">
          <GrantAccessForm orgs={rows.map((r) => ({ id: r.id, name: r.name }))} />
          <p className="text-xs text-muted-foreground mt-2">Creates a pending invite — it activates automatically when that person signs up or next signs in.</p>
        </Section>
      </PageShell>
    </>
  );
}
