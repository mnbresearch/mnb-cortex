import Link from "next/link";
import { Card } from "@/components/ui/card";
import { getIntegrationState } from "@/lib/data";
import { Plug, KeyRound, ArrowRight, CheckCircle2 } from "lucide-react";

/**
 * The dashboard's entry point to connecting things.
 *
 * WHY IT SHOWS STATE RATHER THAN BEING A BUTTON.
 *
 * A permanent "Connect your tools" call to action is noise the moment somebody
 * has connected their tools, and people stop seeing it long before that. This
 * reads the workspace and says a different, true thing in each case:
 *
 *   nothing connected  — the offer, with the reason
 *   own AI key         — confirmation, and that credits are not being charged
 *   tools but no key   — the one thing they have not done yet
 *
 * A server component on purpose: the state is already in the database and
 * fetching it from the browser would mean a flash of the wrong message.
 */
export async function ConnectBanner() {
  let state;
  try { state = await getIntegrationState(); }
  catch { return null; }               // never let this break the dashboard

  if (!state.live) return null;

  const ownKey = state.connections.some((c) => c.provider === "ai");
  const others = state.connections.filter((c) => c.provider !== "ai").length;

  /*
    Fully set up — say so once, quietly, and stop taking up room. The link stays
    because "where do I change my key" is a real question, but the card stops
    being an advertisement.
  */
  if (ownKey && others > 0) {
    return (
      <Card className="p-4 text-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
          <span>
            Running on your own AI key, with {others} other connection{others === 1 ? "" : "s"}.
            No AI credits are being charged.
          </span>
        </div>
        <Link href="/connect" className="text-primary font-medium shrink-0 inline-flex items-center gap-1">
          Manage <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Card>
    );
  }

  const headline = ownKey
    ? "You're on your own AI key — connect your data next"
    : "Use your own AI key, and pay no AI credits";

  const body = ownKey
    ? "Cortex is running on your provider account. Connect Shopify, Razorpay, Stripe or a Google Sheet to pull your numbers in automatically, or upload a Tally, Vyapar or Busy export."
    : "Bring a Gemini, OpenAI, Anthropic or Groq key and Cortex runs on your account — your data-processing terms, your spend controls, and no AI credits charged, because the model cost is already yours.";

  return (
    <Card className="p-5 border-primary/30 bg-primary/5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-primary/10 grid place-items-center shrink-0">
            {ownKey ? <Plug className="h-4 w-4 text-primary" /> : <KeyRound className="h-4 w-4 text-primary" />}
          </div>
          <div className="min-w-0">
            <div className="font-medium">{headline}</div>
            <p className="text-sm text-muted-foreground mt-1 leading-6 max-w-2xl">{body}</p>
          </div>
        </div>
        <Link
          href="/connect"
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground h-10 px-4 text-sm font-medium hover:opacity-90 shrink-0"
        >
          {ownKey ? "Connect your data" : "Connect a key"} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </Card>
  );
}
