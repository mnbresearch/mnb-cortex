import Link from "next/link";
import { ListChecks, MessageSquareWarning, AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";
import type { NeedsYou } from "@/lib/needs-you";

/*
  The strip at the top of the dashboard: four things that wait on a human.
  Every tile is a link to the page where the thing gets handled, and a zero
  is shown as a quiet tick rather than hidden — "nothing waiting" is
  information too. Server-rendered; no client state.
*/
export function NeedsYouStrip({ n }: { n: NeedsYou }) {
  const total = n.proposals + n.drafts + n.alerts + n.deadlines.length;
  const tiles = [
    { href: "/approvals", icon: ListChecks, count: n.proposals, label: n.proposals === 1 ? "action to approve" : "actions to approve", hint: "Cortex wants to do these" },
    { href: "/collections", icon: MessageSquareWarning, count: n.drafts, label: n.drafts === 1 ? "reminder draft to review" : "reminder drafts to review", hint: "Nothing is sent until you approve" },
    { href: "/alerts", icon: AlertTriangle, count: n.alerts, label: n.alerts === 1 ? "open alert" : "open alerts", hint: "A line you set was crossed" },
    { href: "/compliance", icon: CalendarClock, count: n.deadlines.length, label: n.deadlines.length === 1 ? "deadline this week" : "deadlines this week", hint: n.deadlines.map((d) => `${d.name} in ${d.daysAway}d`).join(" · ") || "Filtered by your statutory profile" },
  ];
  return (
    <section aria-label="Needs you" className="rounded-2xl border bg-card p-3">
      <div className="flex items-center justify-between px-2 pb-2">
        <div className="text-sm font-semibold flex items-center gap-2">
          {total === 0 ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" /> : <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />}
          {total === 0 ? "Nothing is waiting on you" : `${total} ${total === 1 ? "thing needs" : "things need"} you`}
        </div>
        <span className="text-xs text-muted-foreground">Live counts from your workspace</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href}
            className={`rounded-xl border p-3 hover:bg-accent/60 transition-colors ${t.count > 0 ? "border-primary/30 bg-primary/5" : ""}`}>
            <div className="flex items-center gap-2">
              <t.icon className={`h-4 w-4 ${t.count > 0 ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
              <span className="text-2xl font-semibold tabular-nums">{t.count}</span>
              <span className="text-sm">{t.label}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground truncate" title={t.hint}>{t.hint}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
