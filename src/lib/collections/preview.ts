import { draftReminder, containsForbidden } from "@/lib/collections/draft";
import { shapePreview } from "@/lib/collections/preview-shape";
import type { PreviewLine } from "@/lib/collections/preview-shape";
import type { Policy } from "@/lib/collections-shared";
import type { Candidate } from "@/lib/collections";

/*
  WHAT COLLECTIONS WOULD DO, SHOWN BEFORE IT DOES ANYTHING.

  THE ADOPTION PROBLEM THIS SOLVES

  Collections is the feature that most directly makes a customer money — it
  chases their overdue invoices and the recovery ledger proves what came back.
  It also ships DISABLED, which is correct: it sends mail to the customer's own
  customers, in their name, and nobody should be opted into that.

  But "correct" and "adopted" are different things. The screen a new customer
  meets is a switch, some settings, and a promise. Turning it on means deciding,
  from a description, whether to let software write to the people who owe them
  money. Most owners will not make that decision from a description — so the
  feature that would prove the product's value is the one least likely to be
  switched on.

  This removes the guessing. It shows exactly which invoices would be chased,
  exactly what the first message would say, and exactly who is excluded and why.

  THREE PROPERTIES

  1. NOTHING IS WRITTEN, SENT, OR EVEN READ. This function performs no I/O at
     all — it is handed the policy and candidate list the page has already
     fetched for the console below, and composes. A preview with side effects is
     not a preview, and a preview that costs three extra round trips on a page
     with a 30-second budget is a preview that gets deleted the first time the
     page times out.

  2. IT USES THE REAL PATH, OVER THE REAL DATA. Not a simplified illustration,
     and not a second independent read. If the preview says seven invoices
     qualify and shows a message, that is the same seven the console below is
     working from and the same message the cron would produce tonight — because
     it is the same rows through the same draftReminder(). Two separate reads
     would be two chances to disagree, on one screen, about the same invoices.

  3. IT SHOWS THE EXCLUSIONS TOO. "Cortex would chase 7 of your 34 overdue
     invoices" invites the obvious question, and the answer builds more trust
     than the seven do: no contact details, inside the waiting period, on the
     do-not-contact list, already chased three times. An owner who sees that
     Cortex declines to chase 27 invoices believes the seven.

  Pure, and therefore executable: scripts/test-collections-preview.mjs runs the
  arithmetic in preview-shape.ts directly. The `import type` lines above are
  erased at compile time, so importing the server-only @/lib/collections for its
  Candidate shape creates no runtime edge.
*/

export type { PreviewLine };

export type CollectionsPreview = {
  /** True when the policy row exists and the switch is on. */
  enabled: boolean;
  /**
   * True when the saved policy would send without asking. `enabled` is off, so
   * nothing is going anywhere either way — but the card must not promise "you
   * would approve every message" to a workspace that has already opted out of
   * approving them. A false reassurance is worse than none.
   */
  autoSend: boolean;
  /** Would-be sends, worst first. Capped for display — see wouldChaseCount. */
  wouldChase: PreviewLine[];
  /**
   * How many would ACTUALLY be chased. Not wouldChase.length, which is a display
   * slice: a workspace with 40 qualifying invoices would otherwise read
   * "25 invoices worth ₹18,40,000" — a count from one set and a total from
   * another, which is the kind of number that destroys trust in every other
   * number on the screen.
   */
  wouldChaseCount: number;
  wouldChaseValue: number;
  /**
   * The workspace's max_per_day. The sweep stops there, so when
   * wouldChaseCount exceeds it the rest wait for the following days — and the
   * card has to say so, or "it would chase 200 invoices, starting tonight" is a
   * promise the product will not keep on night one.
   */
  perDayCap: number;
  /** Skipped, grouped by the reason — the answer to "why only seven". */
  excluded: { reason: string; count: number; value: number }[];
  excludedValue: number;
  /** The exact first message for the top candidate. Null when none qualify. */
  sample: { to: string; subject: string | null; body: string } | null;
  /** A signature or payment note containing a phrase we refuse to send. */
  blockedPhrase: string | null;
};

/**
 * A dry run of tonight's collections sweep.
 *
 * `businessName` is the workspace's own name — it appears in the drafted
 * message as the sender, exactly as it would in a real send.
 */
export function previewCollections(
  candidates: Candidate[],
  policy: Policy,
  businessName: string,
): CollectionsPreview {
  /*
    THE OWNER'S OWN TEXT IS CHECKED FIRST, and it is the most useful thing this
    preview can surface.

    The templates cannot produce a forbidden phrase, but the signature and the
    payment note are free text. Someone who has written "pay within 3 days or we
    will take legal action" into their signature would find every reminder
    silently refused at send time, with the reason buried in a cron response
    nobody reads. Here it is visible BEFORE they switch anything on.
  */
  const blockedPhrase =
    containsForbidden(policy.signature || "") ||
    containsForbidden(policy.payment_note || "");

  /*
    All the counting happens in preview-shape.ts, which has no imports and can
    therefore be executed by a test. Passing `candidates` here is also the
    compile-time check that the real `Candidate` still satisfies the structural
    `ShapeCandidate` that file declares — if a field is renamed upstream, this
    line stops building rather than the numbers quietly going wrong.
  */
  const { wouldChase, wouldChaseCount, wouldChaseValue, excluded, excludedValue, top } =
    shapePreview(candidates || []);

  /*
    THE SAMPLE IS THE POINT.

    An owner deciding whether to let software write to their customers wants to
    read the actual sentence, not a description of its tone. Drafted through the
    real draftReminder() with the real policy — first attempt, because that is
    what tonight would send.
  */
  let sample: CollectionsPreview["sample"] = null;
  if (top) {
    const channel: "email" | "whatsapp" = top.contact.email ? "email" : "whatsapp";
    const d = draftReminder({
      party: top.party,
      businessName,
      amount: top.amount,
      invoiceNo: top.invoiceNo,
      dueDate: top.dueDate,
      daysPastDue: top.daysPastDue,
      attempt: 1,
      tone: policy.tone,
      channel,
      signature: policy.signature || undefined,
      paymentNote: policy.payment_note || undefined,
    });
    sample = {
      to: top.contact.email || top.contact.phone || "no contact on file",
      subject: d.subject,
      body: d.body,
    };
  }

  return {
    enabled: Boolean(policy.enabled),
    autoSend: Boolean(policy.auto_send),
    wouldChase,
    wouldChaseCount,
    wouldChaseValue,
    perDayCap: Number(policy.max_per_day) || 0,
    excluded,
    excludedValue,
    sample,
    blockedPhrase,
  };
}
