import Link from "next/link";
import { WHATSAPP_NUMBER } from "@/lib/config";
import { Logo } from "@/components/logo";
export const metadata = { title: "Help & FAQ — MNB Cortex" };
const faqs = [
  { q: "What is MNB Cortex?", a: "An AI Operating System — your 'AI COO' — that monitors your business, predicts problems, recommends actions, and executes them, so you can run your company by asking instead of opening spreadsheets." },
  { q: "How do I get my own data in?", a: "Sign in, then use Settings → Load demo data to explore, or Import data (CSV/Excel/Google Sheets), the public API, or connect an integration." },
  { q: "Is my data secure?", a: "Yes. Every workspace is isolated with Postgres Row-Level Security, traffic is HTTPS-only (HSTS), and API keys stay server-side." },
  { q: "Which AI does it use?", a: "It runs on fast open models via Groq by default, and also supports Gemini, OpenAI and Anthropic — grounded in your live business data." },
  { q: "Can I install it as an app?", a: "Yes — open the dashboard on your phone and tap Install (or on iPhone, Share → Add to Home Screen). It runs full-screen and works offline." },
  { q: "How do I add my team?", a: "Admin → invite by email. They get an email and auto-join your workspace with the role you set when they sign in." },
];
export default function Help() {
  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between px-6 lg:px-12 h-16 border-b">
        <Link href="/" className="flex items-center gap-2"><Logo size={32} /><span className="font-semibold">MNB Cortex</span></Link>
        <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground">Pricing</Link>
      </header>
      <section className="max-w-2xl mx-auto px-6 py-14">
        <h1 className="text-3xl font-semibold tracking-tight">Help & FAQ</h1>
        <div className="mt-8 space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="rounded-xl border bg-card p-4">
              <summary className="font-medium cursor-pointer">{f.q}</summary>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-8 rounded-xl border p-5 text-center">
          <p className="font-medium">Still need help?</p>
          <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hi, I need help with MNB Cortex")}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#25D366] text-white h-10 px-5 text-sm font-medium">Chat on WhatsApp</a>
        </div>
      </section>
    </main>
  );
}
