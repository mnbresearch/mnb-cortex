import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, ArrowLeft, ExternalLink } from "lucide-react";
import { SectionLabel } from "@/components/loco";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { AS_OF, NOT_STATED, CORTEX, COMPETITORS, ROW_LABELS, ROW_ORDER, bySlug } from "@/lib/competitors";

/*
  /compare/<competitor>-alternative — one page per named competitor, written for
  the search "<competitor> alternative" from a buyer whose job is running a
  company's finance rather than a deal. Same data and the same rules as /compare
  (lib/competitors.ts): their cells are sourced from their own site on AS_OF,
  silence is reported as silence, and the page says when they are the better
  choice.
*/

export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ slug: c.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const c = bySlug(params.slug);
  if (!c) return {};
  return {
    title: `${c.name} alternative for company finance teams — MNB Cortex vs ${c.name}`,
    description: `MNB Cortex vs ${c.name}: ${c.name} is ${c.is}. MNB Cortex is the agent workspace for finance and operations teams running a company — Tally and Zoho Books, GST, TDS and 43B(h), custom agents with approvals. Sourced comparison, ${AS_OF}.`,
    alternates: { canonical: `/compare/${c.slug}` },
    keywords: c.keywords,
  };
}

export default function Alternative({ params }: { params: { slug: string } }) {
  const c = bySlug(params.slug);
  if (!c) notFound();
  const faqs = [
    { q: `Is MNB Cortex an alternative to ${c.name}?`, a: `For a different job. ${c.name} is ${c.is}. MNB Cortex is built for finance and operations teams running a company: agents that work from your books and your company's mail, chats and documents, handle Indian statutory work, and wait for your approval before anything goes out.` },
    { q: `When should we choose ${c.name} instead?`, a: c.chooseThem },
    { q: "When is MNB Cortex the better fit?", a: c.chooseCortex },
    { q: "Can we build our own agents in MNB Cortex?", a: "Yes. In Agent Studio you describe a job in plain words, Cortex drafts the agent, and you choose exactly which tools it may use. Its permission card shows what it may read and propose; every action it wants waits in Approvals, and every rupee figure it states is checked by Veritas v1." },
    { q: "Where did the information about the other product come from?", a: `From ${c.name}'s own website, read on ${AS_OF}. Where their site does not say something, we say "${NOT_STATED}" rather than guess.` },
  ];
  const jsonLd = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  const others = COMPETITORS.filter((o) => o.slug !== c.slug);

  return (
    <main className="min-h-screen overflow-x-hidden">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PublicHeader />
      <section className="px-5 lg:px-10 pt-32 lg:pt-40 pb-12">
        <div className="max-w-5xl mx-auto">
          <Link href="/compare" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All comparisons</Link>
          <div className="mt-6"><SectionLabel n="vs">{c.name} alternative</SectionLabel></div>
          <h1 className="font-display display-2 tracking-tightest mt-5">MNB Cortex vs {c.name}.</h1>
          <p className="mt-6 text-lg text-muted-foreground leading-8 max-w-3xl">
            {c.name} is {c.is}. MNB Cortex is the agent workspace for <span className="text-foreground font-medium">finance and operations teams running a company</span>:
            agents that work from your books and your company&rsquo;s knowledge, handle GST, TDS and 43B(h), and wait for your approval. Different jobs — here is how to tell which one is yours.
          </p>
          <div className="mt-8 grid sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border bg-card p-6"><p className="eyebrow">Choose {c.name} if</p><p className="mt-3 text-sm leading-6 text-muted-foreground">{c.chooseThem}</p></div>
            <div className="rounded-2xl border border-primary/40 bg-primary/5 p-6"><p className="eyebrow text-primary">Choose MNB Cortex if</p><p className="mt-3 text-sm leading-6">{c.chooseCortex}</p></div>
          </div>
        </div>
      </section>

      <section className="px-5 lg:px-10 pb-16">
        <div className="max-w-5xl mx-auto overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[640px]">
            <caption className="sr-only">MNB Cortex compared with {c.name}, as of {AS_OF}</caption>
            <thead><tr className="border-b"><th scope="col" className="w-48"></th><th scope="col" className="text-left py-4 px-3 font-semibold text-primary">MNB Cortex</th><th scope="col" className="text-left py-4 px-3 font-medium">{c.name}</th></tr></thead>
            <tbody>
              {ROW_ORDER.map((k) => (
                <tr key={k} className="border-b border-border/60 align-top">
                  <th scope="row" className="text-left py-4 pr-4 font-medium">{ROW_LABELS[k]}</th>
                  <td className="py-4 px-3 bg-primary/5 leading-6">{CORTEX[k]}</td>
                  <td className={`py-4 px-3 leading-6 ${c.cells[k] === NOT_STATED ? "text-muted-foreground/70 italic" : "text-muted-foreground"}`}>{c.cells[k]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-xs text-muted-foreground leading-6">
            {c.name} column from {c.sources.map((s, i) => <span key={s.url}>{i > 0 ? ", " : ""}<a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="underline inline-flex items-center gap-0.5">{s.label}<ExternalLink className="h-3 w-3" /></a></span>)}, read on {AS_OF}.
            &ldquo;{NOT_STATED}&rdquo; is not a claim that {c.name} lacks it. {c.name} is a trademark of its owner; MNB Cortex is not affiliated. Corrections: <a href="mailto:contact@mnbresearch.com" className="underline">contact@mnbresearch.com</a>.
          </p>
        </div>
      </section>

      <section className="px-5 lg:px-10 py-16 border-t">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-display display-3 tracking-tightest">Questions</h2>
          <dl className="mt-8 divide-y border-y">
            {faqs.map((f) => (
              <div key={f.q} className="py-5"><dt className="font-medium">{f.q}</dt><dd className="mt-2 text-sm text-muted-foreground leading-6">{f.a}</dd></div>
            ))}
          </dl>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/demo" className="inline-flex items-center gap-2 rounded-full btn-ink px-6 h-12 text-sm font-medium">Book a demo <ArrowUpRight className="h-4 w-4" /></Link>
            <Link href="/login?mode=signup" className="inline-flex items-center gap-2 rounded-full border px-6 h-12 text-sm font-medium hover:bg-accent transition-colors">Create account</Link>
          </div>
          <p className="mt-10 text-sm text-muted-foreground">Also compared: {others.map((o, i) => <span key={o.slug}>{i > 0 ? " · " : ""}<Link href={`/compare/${o.slug}`} className="underline hover:text-foreground">MNB Cortex vs {o.name}</Link></span>)}.</p>
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
