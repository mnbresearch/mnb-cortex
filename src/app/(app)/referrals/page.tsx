import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { ReferralWidget } from "@/components/referral-widget";

export const dynamic = "force-dynamic";

export default function Referrals() {
  return (
    <>
      <Topbar title="Refer & Earn" subtitle="Grow the network, get rewarded" />
      <PageShell>
        <ReferralWidget />
      </PageShell>
    </>
  );
}
