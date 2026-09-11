import { Card } from "@/components/ui/card";
import { Info, ShieldAlert, Mail, MessageCircle, CircleSlash } from "lucide-react";
import type { CollectionsPreview } from "@/lib/collections/preview";

/*
  THE "OFF" STATE, SHOWING WHAT WOULD HAPPEN RATHER THAN DESCRIBING IT.

  What was here: a card saying "Collections is off. Turn it on below, generate
  the drafts, and read them." Accurate, and it asks the owner to make the
  decision from a description — to let software write, in their name, to the
  people who owe them money, on the strength of a paragraph.

  Most owners will not do that. Which means the feature that would prove this
  product's value is the one least likely to be switched on, and the recovery
  ledger that justifies the renewal never gets its first number.

  So the off state now runs the real pipeline — same findCandidates, same
  policy, same drafting — and shows the answer:

    what it would chase, and for how much
    the exact message it would send, in full
    who it would NOT chase, and why

  That last part does the most work. "Cortex would chase 7 of your 34 overdue
  invoices" invites the obvious question, and the answer — no contact details,
  inside the waiting period, already chased three times — is more persuasive
  than the seven. An owner who sees the software decline to write to twenty-seven
  people believes it about the seven.

  Nothing is drafted, stored or sent to produce this. See lib/collections/preview.
*/

const rupee = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export function CollectionsDryRun({ preview }: { preview: CollectionsPreview }) {
  /* The true count, not the display slice — see CollectionsPreview.wouldChaseCount. */
  const count = preview.wouldChaseCount;
  const nothing = count === 0;
  const excludedCount = preview.excluded.reduce((n, e) => n + e.count, 0);

  return (
    <Card className="p-5 border-primary/20 bg-primary/5">
      <div className="flex items-start gap-2.5">
        <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm">
            <span className="font-medium">Collections is off.</span>{" "}
            Nothing has been drafted and nothing can be sent. Here is exactly what it would do if you turned it on.
          </p>
          {/*
            Conditional, and it must stay conditional. "You would still approve
            every message" is a reassurance, and a workspace that has already
            saved auto-send would be reading a false one — the single most
            damaging sentence this card could contain.
          */}
          <p className="text-sm text-muted-foreground mt-1">
            {preview.autoSend
              ? "Your settings have auto-send on, so once you switch collections on these would go out without a further review. Turn auto-send off below if you would rather approve each one."
              : "You would still approve every message before it left."}
          </p>
        </div>
      </div>

      {/*
        The owner's own signature or payment note containing a phrase we refuse
        to send. Shown FIRST and loudest: without this it is discovered at send
        time, with the reason buried in a cron response nobody reads, and every
        reminder silently refused.
      */}
      {preview.blockedPhrase && (
        <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-3 flex items-start gap-2.5 text-sm">
          <ShieldAlert className="h-4 w-4 text-danger mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <b className="text-danger">Your signature or payment note contains &ldquo;{preview.blockedPhrase}&rdquo;.</b>{" "}
            Cortex will not send a reminder containing that, so every message would be refused. Reminders never threaten
            legal action, agents, credit reporting or penalties — that is what keeps them lawful and keeps your customer
            relationship intact. Edit it in the settings below and this clears.
          </div>
        </div>
      )}

      {nothing ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Nothing qualifies today — either nothing is past due beyond your waiting period, or the overdue invoices have
          no contact details on them. {preview.excludedValue > 0 ? `${rupee(preview.excludedValue)} is excluded for the reasons below.` : ""}
        </p>
      ) : (
        <div className="mt-4">
          <div className="text-sm">
            It would chase <b>{count} invoice{count === 1 ? "" : "s"}</b>{" "}
            worth <b>{rupee(preview.wouldChaseValue)}</b>, starting tonight.
            {preview.perDayCap > 0 && count > preview.perDayCap && (
              <>
                {" "}Your daily limit is {preview.perDayCap}, so the first {preview.perDayCap} would go tonight and the
                rest over the following days.
              </>
            )}
          </div>
          <div className="mt-3 rounded-xl border bg-background overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th scope="col" className="text-left px-3 py-2 font-medium">Who</th>
                  <th scope="col" className="text-left px-3 py-2 font-medium">Invoice</th>
                  <th scope="col" className="text-right px-3 py-2 font-medium">Amount</th>
                  <th scope="col" className="text-right px-3 py-2 font-medium">Overdue</th>
                  <th scope="col" className="text-left px-3 py-2 font-medium">Via</th>
                </tr>
              </thead>
              <tbody>
                {preview.wouldChase.slice(0, 8).map((l, i) => (
                  <tr key={`${l.party}-${l.invoiceNo}-${i}`} className="border-t">
                    <td className="px-3 py-2 truncate max-w-[180px]" title={l.party}>{l.party}</td>
                    <td className="px-3 py-2 text-muted-foreground">{l.invoiceNo || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{rupee(l.amount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.daysPastDue}d</td>
                    <td className="px-3 py-2">
                      {l.channel === "email"
                        ? <span className="inline-flex items-center gap-1 text-xs"><Mail className="h-3.5 w-3.5" aria-hidden="true" /> Email</span>
                        : l.channel === "whatsapp"
                          ? <span className="inline-flex items-center gap-1 text-xs"><MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> WhatsApp</span>
                          : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><CircleSlash className="h-3.5 w-3.5" aria-hidden="true" /> No contact</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {count > 8 && (
            <p className="text-xs text-muted-foreground mt-2">…and {count - 8} more.</p>
          )}
        </div>
      )}

      {/*
        The actual sentence. An owner deciding whether to let software write to
        their customers wants to read it, not read about it.
      */}
      {preview.sample && (
        <div className="mt-5">
          <div className="text-sm font-medium">The first message, in full</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            To {preview.sample.to}. This is the real draft, from the same code that would send it — not an example.
          </p>
          <div className="mt-2 rounded-xl border bg-background p-4">
            {preview.sample.subject && (
              <div className="text-sm font-medium mb-2 pb-2 border-b">{preview.sample.subject}</div>
            )}
            <pre className="text-sm whitespace-pre-wrap font-sans leading-6">{preview.sample.body}</pre>
          </div>
        </div>
      )}

      {/*
        Why it would NOT chase the rest. The most trust-building part of this
        screen, and the one an owner did not know to ask for.
      */}
      {preview.excluded.length > 0 && (
        <div className="mt-5">
          <div className="text-sm font-medium">
            What it would leave alone — {excludedCount} invoice{excludedCount === 1 ? "" : "s"} worth{" "}
            {rupee(preview.excludedValue)}
          </div>
          <ul className="mt-2 space-y-1.5">
            {preview.excluded.slice(0, 6).map((e) => (
              <li key={e.reason} className="text-sm flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">{e.reason}</span>
                <span className="tabular-nums shrink-0">{e.count} · {rupee(e.value)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground mt-2">
            Cortex declining to write to these is the point. Anything with no contact on file, inside your waiting
            period, on your do-not-contact list, or already chased the maximum number of times stays untouched.
          </p>
        </div>
      )}
    </Card>
  );
}
