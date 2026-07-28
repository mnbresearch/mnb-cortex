import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { MemoryConsole } from "@/components/memory-console";
import { getUserAndOrg } from "@/lib/data";
import { listMemories, listEntities, getProfile, memoryStats } from "@/lib/memory";
import { Brain, Pin, Network } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const { orgId } = await getUserAndOrg();
  const [memories, entities, profile, stats] = orgId
    ? await Promise.all([listMemories(orgId, { limit: 200 }), listEntities(orgId), getProfile(orgId), memoryStats(orgId)])
    : [[], [], null, { total: 0, pinned: 0, entities: 0, byKind: {} as Record<string, number> }];

  return (
    <>
      <Topbar title="Cortex Memory" subtitle="The long-term memory of your AI COO — it remembers so you don't have to" />
      <PageShell>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4 border-primary/30 bg-primary/5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Brain className="h-4 w-4 text-primary" /> Memories</div><div className="text-2xl font-bold mt-1">{stats.total}</div></Card>
          <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Pin className="h-4 w-4 text-primary" /> Pinned</div><div className="text-2xl font-bold mt-1">{stats.pinned}</div></Card>
          <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Network className="h-4 w-4 text-primary" /> Entities</div><div className="text-2xl font-bold mt-1">{stats.entities}</div></Card>
          <Card className="p-4"><div className="text-sm text-muted-foreground">Kinds</div><div className="text-xs mt-1 text-muted-foreground">{Object.entries(stats.byKind).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"}</div></Card>
        </div>

        <Card className="p-4 border-primary/20 bg-primary/5 text-sm">
          Everything here is fed into <b>every</b> AI action automatically — chat, reports, forecasts, strategy. Cortex recalls the most relevant memories on each request, so its answers stay grounded in your business over time.
        </Card>

        <MemoryConsole
          initialMemories={memories as any}
          entities={entities as any}
          profileMd={(profile as any)?.profile_md ?? null}
          updatedAt={(profile as any)?.updated_at ?? null}
        />
      </PageShell>
    </>
  );
}
