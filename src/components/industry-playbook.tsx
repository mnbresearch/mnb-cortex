import Link from "next/link";
import { Card } from "@/components/ui/card";
import { resolveIndustry } from "@/lib/industries";
import { ArrowUpRight, Settings2 } from "lucide-react";

// Shows the workspace's industry playbook — its real problems mapped to the exact
// Cortex tools that solve them. Renders nothing if the industry isn't set/known.
export function IndustryPlaybook({ industry }: { industry?: string | null }) {
  const ind = resolveIndustry(industry);
  if (!ind) return null;
  const Icon = ind.icon;
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-xl bg-primary/10 grid place-items-center shrink-0"><Icon className="h-5 w-5 text-primary" /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">Tailored to your industry</div>
            <Link href="/settings" className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><Settings2 className="h-3 w-3" /> change</Link>
          </div>
          <div className="font-semibold">Built for {ind.name}</div>
          <p className="text-sm text-muted-foreground mt-0.5">{ind.outcome}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ind.fixes.slice(0, 4).map((f) => (
              <Link key={f.href} href={f.href} className="inline-flex items-center gap-1 rounded-lg border px-2.5 h-8 text-xs hover:bg-accent hover:border-primary/40 transition-colors">
                {f.tool}<ArrowUpRight className="h-3 w-3 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
