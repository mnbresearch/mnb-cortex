import Link from "next/link";
import { Logo } from "@/components/logo";

/** Shared chrome for public legal pages (terms, privacy, refund, contact). */
export function LegalShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between px-6 lg:px-12 h-16 border-b">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={32} />
          <span className="font-semibold">MNB Cortex</span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</Link>
          <Link href="/login" className="rounded-lg bg-primary text-primary-foreground px-4 py-2 font-medium">Sign in</Link>
        </div>
      </header>

      <section className="px-6 lg:px-12 py-12 border-b bg-secondary/30">
        <div className="max-w-3xl mx-auto">
          <span className="inline-block text-xs font-medium rounded-full border px-3 py-1 text-muted-foreground mb-4">Legal</span>
          <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-3 text-muted-foreground">{subtitle}</p>}
        </div>
      </section>

      <section className="px-6 lg:px-12 py-12">
        <article className="max-w-3xl mx-auto prose-legal">{children}</article>
      </section>

      <LegalFooter />
    </main>
  );
}

export function LegalFooter() {
  return (
    <footer className="px-6 lg:px-12 py-8 border-t text-sm text-muted-foreground flex flex-wrap gap-4 justify-center">
      <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
      <Link href="/terms" className="hover:text-foreground">Terms</Link>
      <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
      <Link href="/refund" className="hover:text-foreground">Refund Policy</Link>
      <Link href="/contact" className="hover:text-foreground">Contact</Link>
      <Link href="/status" className="hover:text-foreground">Status</Link>
      <span>© 2026 MNB Cortex · a brand of Abrobot Technologies Pvt Ltd</span>
    </footer>
  );
}

/** Small building blocks so each policy reads cleanly without a markdown pipeline. */
export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-semibold mt-10 mb-3 scroll-mt-20">{children}</h2>;
}
export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-7 text-foreground/90 mb-4">{children}</p>;
}
export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-6 space-y-1.5 text-[15px] leading-7 text-foreground/90 mb-4">{children}</ul>;
}
