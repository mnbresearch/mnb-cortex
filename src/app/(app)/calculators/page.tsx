import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { CALCULATORS } from "@/lib/nav";
import Link from "next/link";

export const dynamic = "force-dynamic";

/*
  This page has its own metadata for the same reason every calculator now does:
  it served the root layout's generic title, so the one page that could rank for
  "free business calculators india" was indistinguishable from the home page.

  THE COUNT IS DERIVED, AND IT USED TO BE WRONG.

  The title and description were written by hand and said "29" and "25 more".
  There are 28. The page BODY has always rendered {CALCULATORS.length}, so the
  heading said 28 while the <title> Google indexes said 29 — the product
  disagreeing with itself in the one place a stranger sees first.

  It survived a claims suite of 147 assertions because that suite's SURFACES
  list did not include this file. Deriving both from CALCULATORS is the fix;
  adding the file to SURFACES is what stops the next one.
*/
const N = CALCULATORS.length;
/* "and N more" counts the four named ahead of it, not all of them. */
const NAMED_IN_TITLE = 4;

export const metadata = {
  title: `Free Business Calculators for Indian SMEs — GST, TDS, EPF, gratuity and ${N - NAMED_IN_TITLE} more`,
  description:
    `${N} free calculators, no signup: GST and reverse GST, TDS by section, EPF and ESI, gratuity, advance tax, depreciation, break-even, EMI and amortisation, cash runway, DSCR and more. Built on current Indian rates.`,
  alternates: { canonical: "/calculators" },
};

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
        {/*
          THIS PARAGRAPH WAS WRITTEN FOR A CUSTOMER AND SHOWN TO A STRANGER.

          It used to end "use the modules in the sidebar instead" — an
          instruction that means nothing to the anonymous search traffic these
          pages exist to attract, and which points at a sidebar they have no
          account for. This page is public and returns 200 to anybody.

          The rewrite keeps the honest distinction (these compute, they do not
          watch) but states it in a way that works for both readers, and names
          the free thing a visitor can do next.
        */}
        <Card className="p-4 text-sm text-muted-foreground leading-6">
          All {CALCULATORS.length} are free and need no account: they work out an answer from the numbers you type and
          save nothing. What they cannot do is <span className="text-foreground font-medium">watch</span> — nobody types
          their receivables in every morning. That is the part Cortex does: it reads your Tally, Busy, Vyapar or Excel
          exports and emails you when something crosses a line.{" "}
          <Link href="/health-check" className="text-primary link-sweep">Try it on your own receivables</Link>{" "}
          — also free, also no account.
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
