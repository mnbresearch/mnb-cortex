import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { FeatureAtlas } from "@/components/feature-atlas";
import { getUserAndOrg, getOrgProfile } from "@/lib/data";
import { usedModes, atlasRows, suggestions } from "@/lib/feature-usage";
import { FEATURES, JOBS } from "@/lib/feature-atlas";
import { Compass, ArrowRight, Network } from "lucide-react";

export const dynamic = "force-dynamic";

/*
  /discover — "what can Cortex do for me?", answered by job, with the
  workspace's own plan and recent use. The sidebar lists modules; this page
  introduces them.
*/
export default async function Discover() {
  const { orgId } = await getUserAndOrg();
  const org = orgId ? await getOrgProfile().catch(() => null) : null;
  const plan = (org as any)?.plan ? String((org as any).plan) : null;
  const used = await usedModes(orgId);
  const rows = atlasRows(plan, used);
  const next = suggestions(plan, used, 3);

  return (
    <>
      <Topbar title="Explore Cortex" subtitle={`Everything it can do for you — ${FEATURES.length} things, by the job they do`} />
      <PageShell>
        <Card className="p-5 border-primary/20 bg-primary/5">
          <div className="flex items-start gap-3">
            <Compass className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
            <div className="text-sm leading-6">
              <div className="font-medium">Start with the job, not the menu.</div>
              <p className="text-muted-foreground">
                Pick what you are trying to get done — {JOBS.map((j) => j.label.toLowerCase()).slice(0, 4).join(", ")} and more — and Cortex shows you where it does it, and whether your plan includes it.
                Not sure? Ask in <Link href="/chat" className="text-primary underline-offset-2 hover:underline">Ask Cortex</Link> — it can point you to the right page.
              </p>
            </div>
          </div>
        </Card>

        {next.length > 0 && (
          <div>
            <div className="eyebrow mb-3">Worth trying next</div>
            <div className="grid gap-3 sm:grid-cols-3">
              {next.map((f) => (
                <Link key={f.id} href={f.route} className="group rounded-xl border bg-card p-4 hover:border-primary/40 transition-colors">
                  <div className="font-medium text-sm flex items-center gap-1">{f.title}<ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" /></div>
                  <p className="mt-1 text-xs text-muted-foreground leading-5">{f.outcome}</p>
                </Link>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Picked from what your plan includes and you have not used in the last 90 days (counted since October 2026).</p>
          </div>
        )}

        <Link href="/workforce" className="block rounded-xl border p-4 hover:border-primary/40 transition-colors">
          <div className="flex items-center gap-3 text-sm">
            <Network className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
            <span><span className="font-medium">See your agents at work.</span> <span className="text-muted-foreground">Watch how the night watch, collections, compliance and sales agents hand work to each other — and to you.</span></span>
            <ArrowRight className="h-4 w-4 ml-auto shrink-0" aria-hidden="true" />
          </div>
        </Link>

        <FeatureAtlas rows={rows} variant="app" />
      </PageShell>
    </>
  );
}
