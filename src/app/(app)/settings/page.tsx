import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Field, ActionForm } from "@/components/forms";
import { getOrgProfile, getUserAndOrg } from "@/lib/data";
import { updateOrgProfile, seedDemoData, signOut } from "@/lib/actions";
import { Database, LogOut, Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const { user } = await getUserAndOrg();
  const profile = await getOrgProfile();
  const inp = "rounded-lg border bg-background px-3 h-9 text-sm w-full outline-none focus:ring-2 focus:ring-ring";
  const btn = "inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground h-9 px-4 text-sm font-medium hover:opacity-90";

  return (
    <>
      <Topbar title="Settings" subtitle="Your workspace, company profile & data" />
      <PageShell>
        {!user && (
          <Card className="p-5 bg-warning/10 border-warning/20">
            <p className="text-sm">You're viewing the <b>demo workspace</b>. <a href="/login" className="text-primary underline">Sign in</a> to create your own company workspace with private data.</p>
          </Card>
        )}

        {user && (
          <>
            <Section title="Company profile" desc="This is the company your AI COO manages">
              <form action={updateOrgProfile} className="grid sm:grid-cols-3 gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-1">Company name
                  <input className={inp} name="name" defaultValue={profile?.name || ""} required />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">Industry
                  <select className={inp} name="industry" defaultValue={profile?.industry || "manufacturing"}>
                    {["manufacturing","trading","distribution","education","retail","d2c"].map((o)=> <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">Annual revenue (₹ Cr)
                  <input className={inp} name="annual_revenue_cr" type="number" step="any" defaultValue={profile?.annual_revenue_cr || ""} />
                </label>
                <div className="sm:col-span-3"><button className={btn} type="submit"><Building2 className="h-4 w-4" /> Save profile</button></div>
              </form>
            </Section>

            <Section title="Workspace data" desc="Load a full set of realistic demo data into your workspace so every module comes alive">
              <div className="flex flex-wrap items-center gap-3">
                <ActionForm action={seedDemoData} label="Load demo data into my workspace" primary />
                <span className="text-xs text-muted-foreground">Safe to re-run — it resets demo rows for your org only.</span>
              </div>
            </Section>

            <Section title="Account">
              <div className="flex items-center justify-between">
                <div className="text-sm"><span className="text-muted-foreground">Signed in as</span> {user.email}</div>
                <form action={signOut}>
                  <button className="inline-flex items-center gap-2 rounded-lg border h-9 px-4 text-sm hover:bg-accent" type="submit"><LogOut className="h-4 w-4" /> Sign out</button>
                </form>
              </div>
            </Section>
          </>
        )}
      </PageShell>
    </>
  );
}
