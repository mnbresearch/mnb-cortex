import Link from "next/link";
import { APP_VERSION } from "@/lib/config";
import { Logo } from "@/components/logo";
export const metadata = { title: "Changelog — MNB Cortex" };
const releases = [
  { v: "2.3.0", date: "Latest", items: ["KPI Alert rules — get warned when a metric crosses your line", "Action Board — kanban with one-click AI task generation", "Decision Journal with an AI devil's advocate", "New critique reasoning mode", "\"Do not reply\" notice + reply-to on campaign emails"] },
  { v: "2.2.0", date: "Earlier", items: ["Fully branded email template (header, footer, badges, legal)", "Inbound reply capture with Svix-verified webhooks", "Replies inbox with unread tracking + campaign linking", "Token-based open/click tracking", "One-click webhook setup + reply simulator"] },
  { v: "2.1.0", date: "Earlier", items: ["Email campaigns — reusable templates with {{merge}} tokens", "Personalised mail-merge to selected leads (name/email swapped per person)", "Open tracking (pixel) and click tracking (redirect)", "Per-campaign insights: open rate, click rate, per-recipient outcomes", "AI email drafting inside the composer"] },
  { v: "2.0.0", date: "Earlier", items: ["Integration marketplace — 27 tools across 7 categories", "AES-256-GCM encryption for all stored API keys", "Credentials verified with the provider before saving", "Per-plan integration gating and quotas", "Admin-only access with row-level security"] },
  { v: "1.9.0", date: "Earlier", items: ["Email Console — send mail from the dashboard, AI-draft, templates", "Live delivery log + sending-domain status from Resend", "Captured leads visible alongside email", "Embeddable live uptime badge at /api/badge"] },
  { v: "1.8.0", date: "Earlier", items: ["AI Proposal & Quote generator", "Team capacity & utilisation planner", "Business valuation (multiples + DCF)", "NPS & customer sentiment tracker", "2 new AI reasoning modes (proposal, valuation)"] },
  { v: "1.7.0", date: "Earlier", items: ["Workspace switcher — run multiple businesses from one login", "SaaS metrics: MRR, ARR, LTV:CAC, CAC payback, retention projection", "Project & client profitability with effective hourly rate", "13-week rolling cash flow with crunch warning", "Platform Super Admin console"] },
  { v: "1.6.0", date: "Earlier", items: ["Inventory Reorder Optimizer (EOQ + safety stock)", "WhatsApp Broadcast Composer with wa.me links", "Sales Target Planner (annual → monthly, per-rep)", "Board Deck Generator", "Cost Optimizer", "3 new AI reasoning modes (broadcast, board, costs)"] },
  { v: "1.5.0", date: "Earlier", items: ["Working-capital / cash-conversion-cycle simulator", "Unit economics & break-even calculator", "Loan / EMI calculator with AI CFO advice", "GST invoice generator with PDF export", "Vendor Scorecard & SOP Builder", "3 new AI reasoning modes (loan, vendor, SOP)"] },
  { v: "1.4.0", date: "Earlier", items: ["Investor & Board Update generator", "Marketing Studio — full campaign kits in one click", "Competitor Intelligence battlecards", "Hindi & Hinglish replies in the AI CEO chat", "Email now delivers from your verified domain"] },
  { v: "1.3.0", date: "Earlier", items: ["Daily CEO Brief — generated + emailed to your inbox", "Customer Churn Predictor with editable risk model", "Negotiation Coach & Hiring/Org Advisor", "GST & Compliance assistant with filing calendar", "New GST-aware AI reasoning mode"] },
  { v: "1.2.0", date: "Earlier", items: ["Foresight Suite: 90-day AI forecasting + interactive what-if scenario planner", "AI Action Center — every decision ranked by impact", "Goals & OKR tracker with live progress rings", "Risk Radar, Industry Benchmarks & AI Pricing Optimizer", "Voice input in the AI CEO chat", "8 new CFO-grade AI reasoning modes"] },
  { v: "1.1.0", date: "Earlier", items: ["Global AI Copilot on every page", "Owner analytics dashboard", "Public API + webhooks", "Deals pipeline, CRM & lead scoring", "White-label theming, billing & Razorpay", "Installable app with forced-update flow", "Public status page & shareable reports"] },
  { v: "1.0.0", date: "Launch", items: ["13 AI modules & streaming AI CEO chat", "Business Health Dashboard + Cortex Score", "AI Reports, Documents, Meetings, Market, Strategy", "Approvals, workflows, activity log", "CSV/Excel/PDF import & export", "Supabase auth + RLS, Groq AI"] },
];
export default function Changelog() {
  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between px-6 lg:px-12 h-16 border-b">
        <Link href="/" className="flex items-center gap-2"><Logo size={32} /><span className="font-semibold">MNB Cortex</span></Link>
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
