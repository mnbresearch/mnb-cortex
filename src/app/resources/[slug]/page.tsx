import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, ArrowLeft } from "lucide-react";
import { SmoothScroll, Cursor, Kinetic } from "@/components/loco";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { ARTICLES, getArticle } from "@/lib/resources";

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const a = getArticle(params.slug);
  if (!a) return { title: "Resource — MNB Cortex" };
  return { title: `${a.title} — MNB Cortex`, description: a.dek };
}

export default function ArticlePage({ params }: { params: { slug: string } }) {
  const a = getArticle(params.slug);
  if (!a) notFound();

  const more = ARTICLES.filter((x) => x.slug !== a.slug).slice(0, 2);

  return (
    <main className="min-h-screen overflow-x-hidden">
      <SmoothScroll />
      <Cursor />
      <PublicHeader />

      <article className="px-5 lg:px-10 pt-32 lg:pt-40 pb-16">
        <div className="max-w-3xl mx-auto">
          <Link href="/resources" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground link-sweep mb-8"><ArrowLeft className="h-4 w-4" /> All resources</Link>
          <div className="eyebrow mb-4">{a.tag} · {a.readTime}</div>
          <Kinetic as="h1" text={a.title} className="font-display display-3 tracking-tightest" stagger={40} />
          <p className="mt-5 text-lg text-muted-foreground">{a.dek}</p>

          <div className="mt-12 space-y-10">
            {a.sections.map((s) => (
              <section key={s.h}>
                <h2 className="font-display text-2xl tracking-tightest mb-3">{s.h}</h2>
                <p className="text-[15px] leading-7 text-foreground/90">{s.p}</p>
              </section>
            ))}
          </div>

          <div className="mt-14 rounded-2xl border bg-primary/5 p-6">
            <div className="font-display text-xl tracking-tightest">See your own numbers in minutes.</div>
            <p className="text-sm text-muted-foreground mt-1">Run the free Business Health Check — no account needed — then start from ₹149 of credits.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/health-check" className="inline-flex items-center gap-2 rounded-full border px-5 h-11 text-sm font-medium hover:bg-accent transition-colors">Free health check</Link>
              <Link href="/login" className="inline-flex items-center gap-2 rounded-full btn-ink px-5 h-11 text-sm font-medium" data-cursor>Start free <ArrowUpRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </div>
      </article>

      <section className="px-5 lg:px-10 pb-24 border-t">
        <div className="max-w-3xl mx-auto pt-10">
          <div className="eyebrow mb-4">Keep reading</div>
          <div className="grid sm:grid-cols-2 gap-4">
            {more.map((m) => (
              <Link key={m.slug} href={`/resources/${m.slug}`} className="rounded-2xl border p-5 bg-card hover:border-primary/40 transition-colors">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{m.tag}</div>
                <div className="font-display text-xl tracking-tightest mt-2">{m.title}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
