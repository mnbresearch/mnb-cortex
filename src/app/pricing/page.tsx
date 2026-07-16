import Link from "next/link";
import { PricingClient } from "@/components/pricing-client";

export const metadata = { title: "Pricing — MNB Cortex" };
export default function Pricing() {
  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between px-6 lg:px-12 h-16 border-b">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary grid place-items-center text-primary-foreground font-bold">C</div>
          <span className="font-semibold">MNB Cortex</span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">Live demo</Link>
          <Link href="/login" className="rounded-lg bg-primary text-primary-foreground px-4 py-2 font-medium">Sign in</Link>
        </div>
      </header>
      <section className="px-6 lg:px-12 py-16 text-center">
        <span className="inline-block text-xs font-medium rounded-full border px-3 py-1 text-muted-foreground mb-5">Pricing</span>
        <h1 className="text-4xl lg:text-5xl font-semibold tracking-tight">Run your company on AI — from ₹2,999/mo</h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">One AI COO that watches your business, predicts problems, and executes. Start free for 14 days. No card required.</p>
      </section>
      <section className="px-6 lg:px-12 pb-24"><PricingClient /></section>
    </main>
  );
}
