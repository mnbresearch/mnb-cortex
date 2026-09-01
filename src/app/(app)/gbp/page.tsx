import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { GbpStudio } from "@/components/gbp-studio";
import { getOrgProfile } from "@/lib/data";
import { Info, ArrowUpRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function GoogleBusinessProfile() {
  const profile = await getOrgProfile().catch(() => null);
  const name = (profile as any)?.name || null;

  return (
    <>
      <Topbar
        title="Google Business Profile"
        subtitle="The listing most of your customers actually see before they call you"
      />
      <PageShell>
        {/*
          Stated up front rather than buried. Cortex writes the content; it does
          not publish it, because publishing needs the Google Business Profile
          API — an OAuth consent flow, a verified Cloud project, per-location
          authorisation from the owner, and Google's approval of the app for
          that scope. Implying otherwise would mean somebody clicks a button and
          nothing ever reaches Google.
        */}
        <Card className="p-4 border-primary/20 bg-primary/5 text-sm flex items-start gap-2.5">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div>
            <span className="font-medium">Cortex writes it, you paste it.</span>{" "}
            Everything here is written to Google&rsquo;s own field limits and content rules, so it publishes
            first time. Cortex does not post to Google directly — that needs Google&rsquo;s Business Profile API
            and its approval, which we have not connected. You copy each piece into your profile.
          </div>
        </Card>

        <GbpStudio businessName={name} />

        <Section title="Why this is worth doing" desc="For a local business, the profile usually outranks the website">
          <div className="grid md:grid-cols-3 gap-3 text-sm">
            {[
              {
                h: "Posts expire",
                p: "A What's-new post stops showing after about a week. A profile with no recent post looks dormant to someone deciding where to go, which is why this is a weekly habit rather than a one-off.",
              },
              {
                h: "Replies are public",
                p: "Your reply to a bad review is read by the next person considering you — often more carefully than the review itself. A calm, specific reply is worth more than the star it cost you.",
              },
              {
                h: "Q&A is answerable by anyone",
                p: "If you leave the questions blank, strangers answer them for you, and Google shows whatever gets the most votes. Seeding them yourself is the only way to control it.",
              },
            ].map((c) => (
              <div key={c.h} className="rounded-xl border p-4">
                <div className="font-medium">{c.h}</div>
                <p className="text-muted-foreground mt-1 leading-6">{c.p}</p>
              </div>
            ))}
          </div>
        </Section>

        <Card className="p-5 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-muted-foreground">
            Need a poster or product image to go with a post? The image agents generate them, styled for your industry.
          </div>
          <Link
            href="/agents"
            className="inline-flex items-center gap-1.5 rounded-lg brand-gradient text-white px-4 h-9 text-sm font-medium"
          >
            Open AI Agents <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Card>
      </PageShell>
    </>
  );
}
