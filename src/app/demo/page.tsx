import Link from "next/link";
import { Check, MessageCircle, CalendarClock } from "lucide-react";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { ContactForm } from "@/components/contact-form";
import { SectionLabel } from "@/components/loco";

export const metadata = {
  title: "Book a demo — MNB Cortex",
  description: "See MNB Cortex's agents work on your own finance and operations workflows: month-end close, collections, compliance and board reporting, with every answer cited.",
  alternates: { canonical: "/demo" },
};

/*
  /demo — the primary door on the redesigned site.

  It is the contact form (components/contact-form.tsx → /api/access-request,
  rate-limited, stored in `leads`, operator notified) with the message
  pre-filled as a demo request, and a plain statement of what the call is.
  Nothing here promises a slot time we cannot keep: the reply comes from a
  person, within the support hours on /contact.
*/
const EXPECT = [
  "A 30-minute call with the team that builds Cortex — not a reseller.",
  "Agents run live on a sample workspace; bring an export if you want to see your own numbers.",
  "We scope one workflow for a pilot: close, collections, compliance or reporting.",
  "Security questions answered on the call: data isolation, read-only connectors, approvals.",
];

export default function Demo() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <PublicHeader />
      <section className="relative px-5 lg:px-10 pt-32 lg:pt-40 pb-24 overflow-hidden">
        <div className="absolute inset-0 grid-fade" aria-hidden />
        <div className="relative max-w-6xl mx-auto grid lg:grid-cols-[1fr_1.05fr] gap-12 lg:gap-16 items-start">
          <div>
            <SectionLabel n="◆">Book a demo</SectionLabel>
            <h1 className="font-display display-2 tracking-tightest mt-5">See your agent team <span className="serif-em">at work.</span></h1>
            <p className="mt-5 text-muted-foreground leading-7 max-w-lg">
              Tell us a little about your company and the work you want off your team&rsquo;s desk. A person from MNB Research replies to
              set a time — usually within two business days, often the same day.
            </p>
            <ul className="mt-8 space-y-3">
              {EXPECT.map((e) => (
                <li key={e} className="flex gap-3 text-sm leading-6"><Check className="h-4 w-4 text-primary shrink-0 mt-1" aria-hidden />{e}</li>
              ))}
            </ul>
            <div className="mt-10 grid sm:grid-cols-2 gap-3 text-sm">
              <a href="https://wa.me/919711488480" target="_blank" rel="noopener noreferrer" className="rounded-2xl border bg-card p-5 hover:bg-accent transition-colors">
                <MessageCircle className="h-5 w-5 text-primary" aria-hidden />
                <div className="mt-3 text-muted-foreground">Prefer WhatsApp?</div>
                <div className="font-medium">+91 97114 88480</div>
              </a>
              <Link href="/business" className="rounded-2xl border bg-card p-5 hover:bg-accent transition-colors">
                <CalendarClock className="h-5 w-5 text-primary" aria-hidden />
                <div className="mt-3 text-muted-foreground">Owner-run business?</div>
                <div className="font-medium">Start on your own in minutes</div>
              </Link>
            </div>
          </div>
          <div className="rounded-[22px] border bg-card p-6 lg:p-8 glow-gold">
            <ContactForm defaultMessage="I'd like a demo of MNB Cortex. The workflow we most want agents on: " submitLabel="Request a demo" />
          </div>
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
