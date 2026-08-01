import Link from "next/link";
import { Mail, Phone, MessageCircle, MapPin, Clock } from "lucide-react";
import { LegalShell, H2, P } from "@/components/legal-shell";

export const metadata = {
  title: "Contact Us — MNB Cortex",
  description: "Get in touch with the MNB Cortex team at Abrobot Technologies Pvt Ltd.",
};

export default function Contact() {
  const cards = [
    { icon: Mail, label: "Email", value: "contact@mnbresearch.com", href: "mailto:contact@mnbresearch.com" },
    { icon: Phone, label: "Phone", value: "+91 97114 88480", href: "tel:+919711488480" },
    { icon: MessageCircle, label: "WhatsApp", value: "Chat with us", href: "https://wa.me/919711488480" },
  ];
  return (
    <LegalShell title="Contact Us" subtitle="We usually reply within 2 business days.">
      <div className="grid sm:grid-cols-3 gap-4 not-prose mb-8">
        {cards.map((c) => (
          <a key={c.label} href={c.href} target="_blank" rel="noopener noreferrer"
            className="rounded-2xl border p-5 bg-card hover:bg-accent transition-colors">
            <c.icon className="h-5 w-5 text-primary" />
            <div className="mt-3 text-sm text-muted-foreground">{c.label}</div>
            <div className="font-medium">{c.value}</div>
          </a>
        ))}
      </div>

      <H2>Company</H2>
      <P>
        <strong>Abrobot Technologies Pvt Ltd</strong> — the company behind MNB Cortex, an AI-COO platform for Indian small and medium
        businesses. MNB Cortex is built by the MNB Research team.
      </P>
      <P className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Delhi, India</P>
      <P className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Support hours: Mon–Sat, 10:00–19:00 IST</P>

      <H2>Sales &amp; plans</H2>
      <P>
        Looking for the right plan or an Enterprise quote? See <Link href="/pricing" className="text-primary underline">Pricing</Link> or
        message us on WhatsApp — we&rsquo;ll help you pick.
      </P>

      <H2>Legal</H2>
      <P>
        Read our <Link href="/terms" className="text-primary underline">Terms &amp; Conditions</Link>,{" "}
        <Link href="/privacy" className="text-primary underline">Privacy Policy</Link>, and{" "}
        <Link href="/refund" className="text-primary underline">Refund &amp; Cancellation Policy</Link>.
      </P>
    </LegalShell>
  );
}
