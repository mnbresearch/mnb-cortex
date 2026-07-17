import Link from "next/link";
import { APP_VERSION } from "@/lib/config";
export const metadata = { title: "Changelog — MNB Cortex" };
const releases = [
  { v: "1.1.0", date: "Latest", items: ["Global AI Copilot on every page", "Owner analytics dashboard", "Public API + webhooks", "Deals pipeline, CRM & lead scoring", "White-label theming, billing & Razorpay", "Installable app with forced-update flow", "Public status page & shareable reports"] },
  { v: "1.0.0", date: "Launch", items: ["13 AI modules & streaming AI CEO chat", "Business Health Dashboard + Cortex Score", "AI Reports, Documents, Meetings, Market, Strategy", "Approvals, workflows, activity log", "CSV/Excel/PDF import & export", "Supabase auth + RLS, Groq AI"] },
];
export default function Changelog() {
  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between px-6 lg:px-12 h-16 border-b">
        <Link href="/" className="flex items-center gap-2"><div className="h-8 w-8 rounded-lg bg-primary grid place-items-center text-primary-foreground font-bold">C</div><span className="font-semibold">MNB Cortex</span></Link>
        <div className="flex gap-4 text-sm"><Link href="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</Link><Link href="/status" className="text-muted-foreground hover:text-foreground">Status</Link></div>
      </header>
      <section className="max-w-2xl mx-auto px-6 py-14">
        <h1 className="text-3xl font-semibold tracking-tight">Changelog</h1>
        <p className="text-muted-foreground mt-1">What's new in MNB Cortex. Current: v{APP_VERSION}</p>
        <div className="mt-10 space-y-10">
          {releases.map((r) => (
            <div key={r.v} className="relative border-l pl-6">
              <span className="absolute -left-2 top-1 h-4 w-4 rounded-full bg-primary" />
              <div className="flex items-center gap-2"><span className="font-semibold">v{r.v}</span><span className="text-xs text-muted-foreground">{r.date}</span></div>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground list-disc ml-4">{r.items.map((i) => <li key={i}>{i}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
