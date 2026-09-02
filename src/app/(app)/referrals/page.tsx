import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { ReferralWidget } from "@/components/referral-widget";
import { Card } from "@/components/ui/card";
import { getUserAndOrg } from "@/lib/data";
import { getReferralCode, listReferrals } from "@/lib/referrals";
import { REFERRAL_REWARD_CREDITS } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * Refer & Earn — now backed by an actual referral programme.
 *
 * This page used to render a code produced by `Math.random()` in localStorage
 * and promise "a 14-day trial, no card needed" plus "a free month" to both
 * sides. Nothing read the code, no referrals table existed, and TRIAL_DAYS is 0
 * — the Terms page states there is no trial. It promised customers something
 * the business had no way to deliver or even detect.
 *
 * The code now comes from the database (stable across every device), the
 * reward is credits granted by the payment settlement path, and the table below
 * shows what has actually happened rather than what might.
 */
export default async function Referrals() {
  const { orgId } = await getUserAndOrg();
  const code = orgId ? await getReferralCode(orgId) : null;
  const rows = orgId ? await listReferrals(orgId) : [];

  const rewarded = rows.filter((r) => r.status === "rewarded");
  const earned = rewarded.reduce((n, r) => n + r.reward_credits, 0);

  return (
    <>
      <Topbar title="Refer & Earn" subtitle="Introduce another business, you both get credits" />
      <PageShell>
        <ReferralWidget code={code} reward={REFERRAL_REWARD_CREDITS} signedIn={!!orgId} />

        {orgId && (
          <Card className="p-5">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h3 className="font-semibold">Your referrals</h3>
              <div className="text-sm text-muted-foreground tabular-nums">
                {rows.length} introduced · {rewarded.length} subscribed · {earned.toLocaleString("en-IN")} credits earned
              </div>
            </div>

            {rows.length === 0 ? (
              /*
                An honest empty state. The old page implied a programme was
                running and results were accruing; this says plainly that
                nothing has happened yet and what has to happen for it to.
              */
              <p className="text-sm text-muted-foreground mt-3 leading-6">
                No one has signed up through your link yet. Credits are granted when a business you
                introduced starts a paid plan — not when they sign up — so nothing appears here until
                that happens.
              </p>
            ) : (
              <div className="mt-3 divide-y">
                {rows.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.referred_name || "A business"}</div>
                      <div className="text-xs text-muted-foreground">
                        Joined {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                    </div>
                    {r.status === "rewarded" ? (
                      <span className="shrink-0 rounded-full bg-success/10 text-success border border-success/20 px-2.5 py-1 text-xs font-medium tabular-nums">
                        +{r.reward_credits.toLocaleString("en-IN")} credits
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-secondary text-muted-foreground px-2.5 py-1 text-xs font-medium">
                        Signed up, not subscribed yet
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </PageShell>
    </>
  );
}
