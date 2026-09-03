import Link from "next/link";
import { PricingClient } from "@/components/pricing-client";
import { SmoothScroll, Cursor, Kinetic, SectionLabel } from "@/components/loco";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { getUserAndOrg } from "@/lib/data";
import { TRIAL_DAYS } from "@/lib/config";

export const metadata = { title: "Pricing — MNB Cortex" };

export const dynamic = "force-dynamic";

export default async function Pricing() {
  const { orgId } = await getUserAndOrg();
  return (
    <main className="min-h-screen overflow-x-hidden">
      <SmoothScroll />
      <Cursor />
      <PublicHeader />

      <section className="px-5 lg:px-10 pt-32 lg:pt-40 pb-12">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="00">Pricing</SectionLabel>
          <Kinetic as="h1" text={"Find out first,\nnot last."} className="font-display display-1 tracking-tightest mt-6" />
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
            Cortex watches your receivables, your supplier deadlines and your stock, and emails you before any of them
            costs you money. From <span className="text-foreground font-medium">₹4,999/month</span>.
            Keep Tally or Zoho — this is the part they were never built to do.
          </p>
          {/*
            One line for CAs, on the pricing page rather than buried.

            A firm is worth roughly thirty businesses and arrives through a
            different door: they are not looking for software for themselves,
            they are looking for a way to see thirty clients at once. Practice is
            the only tier that answers that, so it says so where they will look.
          */}
          <p className="mt-3 text-sm text-muted-foreground max-w-2xl">
            <span className="text-foreground font-medium">Running a CA or advisory practice?</span>{" "}
            Practice puts every client on one screen, ranked by who needs you this week.
          </p>
        </div>
      </section>

      <section className="px-5 lg:px-10 pb-16"><PricingClient signedIn={Boolean(orgId)} /></section>

      <section className="px-5 lg:px-10 pb-24 text-center text-sm text-muted-foreground">
        MNB Cortex is a product of <span className="text-foreground font-medium">Abrobot Technologies</span> — payments and card
        statements show <span className="text-foreground font-medium">ABROBOT TECHNOLOGIES</span>.
        <br />
        Payments processed securely via Cashfree. By subscribing you agree to our{" "}
        <Link href="/terms" className="text-primary link-sweep">Terms</Link>,{" "}
        <Link href="/privacy" className="text-primary link-sweep">Privacy Policy</Link> and{" "}
        <Link href="/refund" className="text-primary link-sweep">Refund Policy</Link>.
      </section>

      <PublicFooter />
    </main>
  );
}
