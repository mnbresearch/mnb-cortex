import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isSuperAdmin, getAllOrgs, getPortfolioStatus, currentEmail } from "@/lib/superadmin";
import { provisionBusinesses, grantOrgAccess, joinOrg } from "@/lib/superadmin-actions";
import { ShieldAlert, Building2, Users, Activity, Lock, ExternalLink } from "lucide-react";
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

  const [{ rows, live, reason }, portfolio] = await Promise.all([getAllOrgs(), getPortfolioStatus()]);
  const totalMembers = rows.reduce((s, r) => s + r.members, 0);

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
          <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Activity className="h-4 w-4 text-primary" /> Orgs with live data</div><div className="text-2xl font-bold mt-1">{rows.filter((r) => r.metrics > 0).length}</div></Card>
        </div>

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
                <div className="mt-3 flex gap-2">
                  <a href={b.site} target="_blank" rel="noopener noreferrer" className="text-sm text-primary inline-flex items-center gap-1">Website <ExternalLink className="h-3 w-3" /></a>
                  {b.org && (
                    <form action={joinOrg}><input type="hidden" name="org_id" value={b.org.id} /><Button size="sm" variant="outline">Make me owner</Button></form>
                  )}
                </div>
              </Card>
            ))}
          </div>
          <form action={provisionBusinesses} className="mt-3">
            <Button><Building2 className="h-4 w-4" /> Create / repair my business workspaces</Button>
          </form>
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

        <Section title="Grant access" desc="Provision an admin (or any role) on any organization">
          <form action={grantOrgAccess} className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="text-muted-foreground block mb-1">Organization</span>
              <select name="org_id" className="rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring min-w-[200px]">
                {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-muted-foreground block mb-1">Email</span>
              <input name="email" type="email" required placeholder="person@company.com" className="rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring min-w-[220px]" />
            </label>
            <label className="text-sm">
              <span className="text-muted-foreground block mb-1">Role</span>
              <select name="role" defaultValue="admin" className="rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring">
                {["viewer", "analyst", "manager", "admin", "owner"].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <Button type="submit">Grant access</Button>
          </form>
          <p className="text-xs text-muted-foreground mt-2">Creates a pending invite — it activates automatically when that person signs up or next signs in.</p>
        </Section>
      </PageShell>
    </>
  );
}
