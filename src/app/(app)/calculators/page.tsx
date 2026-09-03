import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { CALCULATORS } from "@/lib/nav";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Every standalone calculator, in one place.
 *
 * These used to sit in the main navigation beside Receivables and Cash Flow.
 * They are useful, but they take numbers you type and store nothing — so mixing
 * them with the screens that watch your business buried the important ones and
 * made a ₹4,999/month product read as a free-tools site.
 *
 * Nothing was deleted. Every calculator is still at its own URL and still
 * indexable; they are good acquisition surface. They are simply collected here
 * instead of competing for attention with the product.
 */
export default function Calculators() {
  const byGroup = new Map<string, typeof CALCULATORS>();
  for (const c of CALCULATORS) {
    const g = c.group || "Other";
    if (!byGroup.has(g)) byGroup.set(g, [] as any);
    (byGroup.get(g) as any).push(c);
  }

  return (
    <>
      <Topbar title="Calculators" subtitle={`${CALCULATORS.length} quick tools — type numbers in, get an answer out`} />
      <PageShell>
        <Card className="p-4 text-sm text-muted-foreground leading-6">
          These are standalone: they work out an answer from what you type and don&rsquo;t save anything to your
          workspace. For anything that should be <span className="text-foreground font-medium">watched</span> — receivables,
          supplier deadlines, stock — use the modules in the sidebar instead, which read your real data and warn you.
        </Card>

        {[...byGroup.entries()].map(([group, items]) => (
          <div key={group}>
            <div className="text-sm font-medium mb-2">{group}</div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {items.map((c) => {
                const Icon = c.icon;
                return (
                  <Link key={c.href} href={c.href}
                    className="rounded-xl border p-3 flex items-center gap-2.5 text-sm hover:bg-accent transition-colors">
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{c.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </PageShell>
    </>
  );
}
