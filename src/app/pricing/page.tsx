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
          <Kinetic as="h1" text={"Run your company\non AI."} className="font-display display-1 tracking-tightest mt-6" />
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
            One AI COO with 300+ agents, memory and automation — from <span className="text-foreground font-medium">₹799/mo</span>.
            Start with a free {TRIAL_DAYS}-day trial. No card required.
          </p>
        </div>
      </section>

      <section className="px-5 lg:px-10 pb-16"><PricingClient signedIn={Boolean(orgId)} /></section>

      <section className="px-5 lg:px-10 pb-24 text-center text-sm text-muted-foreground">
        Payments processed securely via Cashfree. By subscribing you agree to our{" "}
        <Link href="/terms" className="text-primary link-sweep">Terms</Link>,{" "}
        <Link href="/privacy" className="text-primary link-sweep">Privacy Policy</Link> and{" "}
        <Link href="/refund" className="text-primary link-sweep">Refund Policy</Link>.
      </section>

      <PublicFooter />
    </main>
  );
}
