import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Check, ArrowRight } from "lucide-react";
import type { FirstRun } from "@/lib/first-run";

/*
  ONE NEXT ACTION, AND THE ROAD BEHIND IT.

  The empty dashboard used to offer nine calls to action across four
  destinations — /bank three times, /import three times, /gst-reader twice,
  /connect once, plus /chat and /visibility from the priorities card — while the
  largest and most central empty state, "No business data yet", carried no link
  at all. A new owner arrived at a screen that was simultaneously insistent and
  directionless.

  This shows all four steps so the path is legible, but only ONE is actionable:
  the first unfinished one. Done steps are ticked and quiet. Later steps are
  visible and greyed, because knowing what is coming is what makes a first step
  feel worth taking — and because hiding them would make the product feel like
  it is dripping work out one task at a time.

  Every state here is derived from the database (see lib/first-run.ts), so this
  panel is correct on a second device, after a refresh, and for a workspace that
  existed before it was written.
*/
export function SetupPath({ run, compact = false }: { run: FirstRun; compact?: boolean }) {
  if (!run.known || run.complete) return null;

  const total = run.steps.length;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Get Cortex watching your business</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {run.doneCount === 0
              ? "Four steps. The whole thing takes a few minutes."
              : `${run.doneCount} of ${total} done — ${total - run.doneCount} to go.`}
          </p>
        </div>
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {run.steps.map((s) => (
            <span
              key={s.id}
              className={`h-1.5 w-8 rounded-full ${s.done ? "bg-success" : s.id === run.next?.id ? "brand-gradient" : "bg-secondary"}`}
            />
          ))}
        </div>
        {/* The bar above is decorative; this is what a screen reader is told. */}
        <span className="sr-only">{run.doneCount} of {total} setup steps complete.</span>
      </div>

      <ol className="mt-4 space-y-2">
        {run.steps.map((s, i) => {
          const isNext = s.id === run.next?.id;
          return (
            <li
              key={s.id}
              className={`rounded-lg border p-3 ${isNext ? "border-primary/40 bg-primary/5" : s.done ? "" : "opacity-60"}`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] font-medium ${
                    s.done ? "border-success/30 bg-success/10 text-success" : "text-muted-foreground"
                  }`}
                  aria-hidden="true"
                >
                  {s.done ? <Check className="h-3 w-3" /> : i + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-medium ${s.done ? "text-muted-foreground line-through" : ""}`}>
                    {s.title}
                  </div>
                  {/* The reason is shown only for the step being asked for. On
                      the others it is noise, and on the done ones it is a
                      justification for work already finished. */}
                  {isNext && !compact && (
                    <p className="mt-1 text-sm text-muted-foreground">{s.why}</p>
                  )}
                </div>

                {isNext && (
                  <Link
                    href={s.href}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    {s.cta} <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                )}
                {s.done && <span className="sr-only">Done.</span>}
              </div>
            </li>
          );
        })}
      </ol>

      {/*
        Named honestly. This loads another company's figures so the product can
        be looked at before the customer's own data is in — useful, and
        previously offered only inside the onboarding wizard and Settings, so a
        new user who wanted to see what they had bought had nowhere to click.
        "Sample" is in the label because everything it creates is badged sample
        elsewhere in the app, and the two must agree.
      */}
      <p className="mt-3 text-xs text-muted-foreground">
        Want to look around first?{" "}
        <Link href="/settings" className="text-primary underline">
          Load a sample dataset
        </Link>{" "}
        — it fills every screen with an example business, clearly marked, and you can remove it in one click.
      </p>
    </Card>
  );
}
