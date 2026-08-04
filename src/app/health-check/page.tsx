import { SmoothScroll, Cursor, Kinetic, SectionLabel } from "@/components/loco";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { HealthCheckClient } from "@/components/health-check-client";

export const metadata = {
  title: "Free Business Health Check — MNB Cortex",
  description: "A free 60-second check of your business's financial and operational health, with a score and a tailored fix plan.",
};

export default function HealthCheck() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <SmoothScroll />
      <Cursor />
      <PublicHeader />

      <section className="px-5 lg:px-10 pt-32 lg:pt-40 pb-8">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="00">Free tool</SectionLabel>
          <Kinetic as="h1" text={"Business Health Check."} className="font-display display-1 tracking-tightest mt-6" />
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
            Six quick questions. Get your Business Health Score, see exactly where you&rsquo;re exposed, and a plan to fix it — in about 60 seconds. Free, no signup to see your score.
          </p>
        </div>
      </section>

      <section className="px-5 lg:px-10 pb-28">
        <div className="max-w-7xl mx-auto"><HealthCheckClient /></div>
      </section>

      <PublicFooter />
    </main>
  );
}
