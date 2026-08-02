import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { Kinetic } from "@/components/loco";

/** Shared chrome for public legal pages (terms, privacy, refund, contact). */
export function LegalShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <PublicHeader />

      <section className="px-5 lg:px-10 pt-32 lg:pt-40 pb-12 border-b">
        <div className="max-w-3xl mx-auto">
          <div className="eyebrow mb-5">Legal</div>
          <Kinetic as="h1" text={title} className="font-display display-3 tracking-tightest" stagger={45} />
          {subtitle && <p className="mt-4 text-muted-foreground">{subtitle}</p>}
        </div>
      </section>

      <section className="px-5 lg:px-10 py-14">
        <article className="max-w-3xl mx-auto prose-legal">{children}</article>
      </section>

      <PublicFooter />
    </main>
  );
}

/** Kept for backward-compatibility; renders the shared editorial footer. */
export function LegalFooter() {
  return <PublicFooter />;
}

/** Small building blocks so each policy reads cleanly without a markdown pipeline. */
export function H2({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`text-xl font-semibold mt-10 mb-3 scroll-mt-20 ${className}`}>{children}</h2>;
}
export function P({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-[15px] leading-7 text-foreground/90 mb-4 ${className}`}>{children}</p>;
}
export function UL({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <ul className={`list-disc pl-6 space-y-1.5 text-[15px] leading-7 text-foreground/90 mb-4 ${className}`}>{children}</ul>;
}
