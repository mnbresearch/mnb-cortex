import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { getPractice } from "@/lib/practice";
import { ClientSwitchLink } from "@/components/client-switch-link";
import { AlertTriangle, Info, Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

const rupee = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/**
 * The Practice console.
 *
 * A CA holding thirty clients currently opens thirty files to find out which one
 * is in trouble. Tally, Zoho and Vyapar are single-business tools; no screen
 * anywhere answers "across all my clients, who needs me this week?"
 *
 * That question is the whole page, and the answer must be RANKED. Thirty rows of
 * green is the same as no screen — so the worst three are at the top, and a firm
 * that looks at nothing else still gets the value.
 */
export default async function Practice() {
  const p = await getPractice();

  /*
    Not on a plan that includes Practice.

    This console was previously open to every workspace on every plan, which
    made the ₹29,999 tier's headline feature free. The upsell is deliberately
    specific about what the plan buys rather than being a generic paywall — a
    firm reading this should be able to decide, not have to ask.
  */
  if (!p.allowed) {
    return (
      <>
        <Topbar title="Practice" subtitle="Every client you watch, ranked by who needs you" />
        <PageShell>
          <Card className="p-6 text-sm max-w-2xl">
            <div className="font-medium">Practice is part of the Practice plan.</div>
            <p className="text-muted-foreground mt-2 leading-6">
              It puts every client workspace you have access to on one screen, ordered by who needs you:
              whose supplier bills have crossed the 43B(h) window, whose receivables moved this week, who
              has alerts nobody has read. Up to 25 client workspaces, with credits pooled across all of
              them rather than capped per client.
            </p>
            <p className="text-muted-foreground mt-2 leading-6">
              You can still open each client&rsquo;s workspace one at a time from the workspace switcher —
              this page is the view across all of them at once.
            </p>
            <a href="/billing" className="inline-block mt-4 rounded-lg bg-primary text-primary-foreground px-4 h-10 leading-10 text-sm font-medium">
              See Practice pricing
            </a>
          </Card>
        </PageShell>
      </>
    );
  }

  if (!p.live || p.clients.length === 0) {
    return (
      <>
        <Topbar title="Practice" subtitle="Every client you watch, ranked by who needs you" />
        <PageShell>
          <Card className="p-6 text-sm">
            <div className="font-medium">No client workspaces yet.</div>
            <p className="text-muted-foreground mt-1 leading-6 max-w-2xl">
              The Practice console shows every business you have access to on one screen, ordered by who needs
              attention: whose supplier bills have crossed the 43B(h) window, whose receivables have moved, who has
              alerts nobody has read. Add yourself to a client&rsquo;s workspace and they appear here automatically.
            </p>
          </Card>
        </PageShell>
      </>
    );
  }

  const quiet = p.clients.filter((c) => c.rank === 2).length;

  return (
    <>
      <Topbar title="Practice" subtitle={`${p.clients.length} client${p.clients.length === 1 ? "" : "s"} · ranked by who needs you`} />
      <PageShell>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className={`p-4 ${p.needAttention > 0 ? "border-danger/30 bg-danger/5" : ""}`}>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className={`h-4 w-4 ${p.needAttention > 0 ? "text-danger" : "text-muted-foreground"}`} />
              Need you now
            </div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{p.needAttention}</div>
            <div className="text-xs text-muted-foreground mt-0.5">of {p.clients.length} clients</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Deductions at risk</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{rupee(p.totalMsmeAtRisk)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">43B(h), across the book</div>
          </Card>
          <Card className={`p-4 ${p.totalRecovered > 0 ? "border-success/30 bg-success/5" : ""}`}>
            <div className="text-sm text-muted-foreground">Collected for your clients</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{rupee(p.totalRecovered)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">last 90 days, after a Cortex reminder</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Overdue to your clients</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{rupee(p.totalOverdue)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">receivables past due</div>
          </Card>
        </div>

        <div className="space-y-2">
          {p.clients.map((c) => (
            <Card
              key={c.orgId}
              className={`p-4 ${c.rank === 0 ? "border-danger/30 bg-danger/5" : ""}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{c.name}</span>
                    {c.rank === 0 && (
                      <span className="rounded-full border border-danger/20 bg-danger/10 text-danger px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
                        Now
                      </span>
                    )}
                  </div>
                  <div className={`text-sm mt-1 ${c.rank === 0 ? "text-danger font-medium" : "text-muted-foreground"}`}>
                    {c.headline}
                  </div>
                  {c.detail.length > 1 && (
                    <div className="text-xs text-muted-foreground mt-1">{c.detail.join(" · ")}</div>
                  )}
                </div>
                {/*
                  Switching workspace is a POST (it sets a cookie server-side and
                  re-verifies membership), so this is a form rather than a link.
                */}
                <ClientSwitchLink orgId={c.orgId} />
              </div>
            </Card>
          ))}
        </div>

        {/*
          Over the plan's client cap. Said plainly, with the number, rather than
          silently truncating — a CA who cannot find a client on this screen
          needs to know it is a plan limit and not a bug.
        */}
        {p.overLimit > 0 && (
          <Card className="p-4 text-sm flex items-start gap-2.5 border-warning/30 bg-warning/5">
            <Info className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div className="leading-6">
              Your plan covers <b>{p.limit}</b> client workspaces and you have access to{" "}
              <b>{p.limit + p.overLimit}</b>. {p.overLimit} {p.overLimit === 1 ? "is" : "are"} not shown here.
              You can still open them individually from the workspace switcher —{" "}
              <a className="underline" href="/billing">add capacity</a> to see them all on this screen.
            </div>
          </Card>
        )}

        {quiet > 0 && (
          <Card className="p-4 text-sm flex items-start gap-2.5">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-muted-foreground leading-6">
              {quiet} client{quiet === 1 ? " is" : "s are"} quiet this week — nothing past a statutory window, no
              material overdue, no unread alerts. Cortex will move them up this list the moment that changes, and email
              you if it is serious.
            </div>
          </Card>
        )}
      </PageShell>
    </>
  );
}
