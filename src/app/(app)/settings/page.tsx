import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { AiInstructionsPanel } from "@/components/ai-instructions-panel";
import { hasRole } from "@/lib/roles";
import { Card } from "@/components/ui/card";
import { Field, ActionForm } from "@/components/forms";
import { getOrgProfile, getUserAndOrg } from "@/lib/data";
import { updateOrgProfile, seedDemoData, clearDemoData, hasDemoData, signOut } from "@/lib/actions";
import { APP_VERSION } from "@/lib/config";
import { ACCENT_NAMES } from "@/lib/utils";
import { INDUSTRIES as AGENT_INDUSTRIES, SECTORS } from "@/lib/agents/catalog";
import { BackupButton } from "@/components/backup-button";
import { Database, LogOut, Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Settings() {
  // Instructions apply to everyone in the workspace, so writing them is an
  // admin action. Read is open — people should be able to see why the AI
  // behaves the way it does.
  const canEditAi = await hasRole("admin");
  const { user } = await getUserAndOrg();
  const profile = await getOrgProfile();
  const demoPresent = await hasDemoData();
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
            {/* Highest-leverage setting in the product: it changes every AI
                answer the workspace receives. Deliberately placed above the
                company profile, which is filled in once and forgotten. */}
            <AiInstructionsPanel canEdit={canEditAi} />

            <Section title="Company profile" desc="This is the company your AI COO manages">
              <form action={updateOrgProfile} className="grid sm:grid-cols-3 gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-1">Company name
                  <input className={inp} name="name" defaultValue={profile?.name || ""} required />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">Industry
                  <select className={inp} name="industry" defaultValue={profile?.industry || "manufacturing"}>
                    {/* Grouped by sector: 28 industries in one flat list is a wall
                        of text to read past, and the one you want is never near the top. */}
                    {SECTORS.map((sec) => {
                      const inSector = AGENT_INDUSTRIES.filter((o) => o.sector === sec);
                      if (!inSector.length) return null;
                      return (
                        <optgroup key={sec} label={sec}>
                          {inSector.map((o) => <option key={o.id} value={o.id}>{o.emoji} {o.name}</option>)}
                        </optgroup>
                      );
                    })}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">Annual revenue (Cr)
                  <input className={inp} name="annual_revenue_cr" type="number" step="any" defaultValue={profile?.annual_revenue_cr || ""} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">Currency
                  <select className={inp} name="currency" defaultValue={profile?.currency || "INR"}>
                    {["INR","USD","EUR","GBP","AED","SGD"].map((c)=> <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">Brand accent
                  <select className={inp} name="accent" defaultValue={profile?.accent || "gold"}>
                    {ACCENT_NAMES.map((c)=> <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-3">Logo URL (white-label)
                  <input className={inp} name="logo_url" placeholder="https://…/logo.png" defaultValue={profile?.logo_url || ""} />
                </label>
                <div className="sm:col-span-3"><button className={btn} type="submit"><Building2 className="h-4 w-4" /> Save profile</button></div>
              </form>
            </Section>

            <Section title="Sample data" desc="Fill every module with a realistic example business so you can see how Cortex behaves">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <ActionForm action={seedDemoData} label={demoPresent ? "Reload the sample dataset" : "Load a sample dataset"} />
                  {demoPresent && <ActionForm action={clearDemoData} label="Remove sample data" primary />}
                </div>
                {demoPresent ? (
                  <p className="text-sm text-warning">
                    This workspace currently contains sample rows. They are tagged as samples and are
                    counted in your KPIs while present — remove them before reading your dashboard as fact.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Sample rows are tagged, so loading them will not touch data you have entered or imported,
                    and removing them later takes one click.
                  </p>
                )}
              </div>
            </Section>

            <Section title="Account">
              <div className="flex items-center justify-between">
                <div className="text-sm"><span className="text-muted-foreground">Signed in as</span> {user.email}<span className="ml-3 text-xs text-muted-foreground">· App v{APP_VERSION}</span></div>
                <div className="flex items-center gap-2">
                  <BackupButton />
                  <form action={signOut}>
                    <button className="inline-flex items-center gap-2 rounded-lg border h-9 px-4 text-sm hover:bg-accent" type="submit"><LogOut className="h-4 w-4" /> Sign out</button>
                  </form>
                </div>
              </div>
            </Section>
          </>
        )}
      </PageShell>
    </>
  );
}
