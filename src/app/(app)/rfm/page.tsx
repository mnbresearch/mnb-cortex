import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { RfmSegments } from "@/components/rfm-segments";

export const dynamic = "force-dynamic";

export default function Rfm() {
  return (
    <>
      <Topbar title="Customer Segmentation (RFM)" subtitle="Know who to reward, who to win back, who to let go" />
      <PageShell>
        <RfmSegments />
        <Section title="What RFM tells you" desc="Recency · Frequency · Monetary">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>RFM scores each customer on how <b>recently</b> they bought, how <b>often</b>, and how <b>much</b> — the three signals that best predict future value. It turns a flat customer list into clear action groups.</p>
            <p>Champions deserve loyalty perks; At-risk high-value accounts need a call this week; Lost customers rarely justify heavy spend. Focus your time where the RFM score says the money is.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
