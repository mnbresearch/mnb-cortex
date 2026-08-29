import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { CREDIT_COSTS } from "@/lib/config";
import { NAV } from "@/lib/nav";
import {
  Landmark, ReceiptText, Upload, Database, Telescope, MessageSquare, Brain, LineChart,
  FileBarChart, Megaphone, Radio, Bot, Radar, BrainCircuit, ArrowRight, Zap, Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const metadata = { title: "AI Tools — MNB Cortex" };

type Tool = { href: string; name: string; icon: LucideIcon; blurb: string; you: string; cost: number | null };
type Group = { title: string; desc: string; tools: Tool[] };

const c = (k: string) => CREDIT_COSTS[k] ?? null;

const GROUPS: Group[] = [
  {
    title: "Read your real data",
    desc: "Turn raw files into your real numbers — grounded, not guessed.",
    tools: [
      { href: "/bank", name: "Bank Statement Intelligence", icon: Landmark, blurb: "Upload a statement; Cortex reads every transaction.", you: "Money in/out, cashflow health, monthly trend, recurring payments, top payees.", cost: c("bankstatement") },
      { href: "/gst-reader", name: "GST Return Reader", icon: ReceiptText, blurb: "Read a GSTR-1 / 3B / 2B in seconds.", you: "Turnover, tax split, ITC utilisation, net payable, filing-readiness check.", cost: c("gst") },
      { href: "/import", name: "Import data", icon: Upload, blurb: "Bring in CSV / Excel or a Google Sheet.", you: "Your ledgers and KPIs power the whole dashboard.", cost: null },
      { href: "/data", name: "Data Explorer", icon: Database, blurb: "Browse and query everything you've connected.", you: "Search, filter and export your business tables.", cost: null },
    ],
  },
  {
    title: "Think & decide",
    desc: "An operating brain that reasons over your real numbers and Cortex Memory.",
    tools: [
      { href: "/deepdive", name: "Cortex Deep Dive", icon: Telescope, blurb: "Agentic analysis in three passes: diagnose → decide → draft.", you: "Root cause, three costed options, a 30-day plan and a ready first action.", cost: c("deepdive") },
      { href: "/chat", name: "AI CEO Chat", icon: MessageSquare, blurb: "Ask anything in plain language — English or Hinglish.", you: "Answers grounded in your data, with memory across chats.", cost: c("chat") },
      { href: "/strategy", name: "Strategy Consultant", icon: Brain, blurb: "SWOT, growth levers and a prioritised plan.", you: "A board-ready strategy tailored to your business.", cost: c("strategy") },
      { href: "/forecast", name: "Forecasting & Scenarios", icon: LineChart, blurb: "90-day forecast with interactive what-ifs.", you: "See the impact of a price, cost or volume change before you make it.", cost: c("forecast") },
      { href: "/reports", name: "Executive Reports", icon: FileBarChart, blurb: "One-click business review, exportable to PDF.", you: "A polished report you can send to a bank, board or investor.", cost: c("report") },
    ],
  },
  {
    title: "Act on your behalf",
    desc: "Cortex drafts the work; you review and approve; it goes out.",
    tools: [
      { href: "/act", name: "AI Outreach", icon: Megaphone, blurb: "Payment reminders, follow-ups and supplier notes.", you: "You approve; it sends by email (your domain) or WhatsApp.", cost: c("act") },
      { href: "/marketing", name: "Marketing Studio", icon: Sparkles, blurb: "Full campaign kits — copy, posts, emails.", you: "A launch-ready marketing pack in one click.", cost: c("marketing") },
      { href: "/broadcast", name: "WhatsApp Broadcast", icon: Radio, blurb: "Compose and personalise a broadcast.", you: "Ready-to-send wa.me messages for your list.", cost: c("broadcast") },
      { href: "/agents", name: "AI Agents & Workforce", icon: Bot, blurb: "380+ department agents across 25 Indian industries.", you: "Run, approve, revise and export specialist work.", cost: null },
    ],
  },
  {
    title: "Get discovered & remember",
    desc: "Win the AI-search era, and never lose context.",
    tools: [
      { href: "/visibility", name: "AI Visibility (AEO)", icon: Radar, blurb: "See if ChatGPT, Gemini & Perplexity recommend you.", you: "A visibility score, who's cited instead, and the content that fixes it.", cost: c("visibility") },
      { href: "/memory", name: "Cortex Memory", icon: BrainCircuit, blurb: "A permanent, evolving memory of your business.", you: "Every tool gets sharper because Cortex remembers.", cost: null },
    ],
  },
];

function Badge({ cost }: { cost: number | null }) {
  if (cost == null) return <span className="text-[11px] font-medium rounded-full bg-success/10 text-success px-2 py-0.5">Included</span>;
  return <span className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full bg-primary/10 text-primary px-2 py-0.5"><Zap className="h-3 w-3" />{cost} credit{cost === 1 ? "" : "s"}</span>;
}

export default function ToolsHub() {
  const total = GROUPS.reduce((s, g) => s + g.tools.length, 0);

  // Grouped in the sidebar's own order, so the page reads the way the app is
  // organised rather than inventing a second taxonomy to keep in sync.
  // NAV is inferred as a readonly tuple, so group by its ELEMENT type rather
  // than by `typeof NAV` — the tuple type would demand all 122 entries per group.
  type NavItem = (typeof NAV)[number];
  const byGroup = new Map<string, NavItem[]>();
  for (const n of NAV) {
    const list = byGroup.get(n.group);
    if (list) list.push(n);
    else byGroup.set(n.group, [n]);
  }
  const navGroups = Array.from(byGroup);
  return (
    <>
      <Topbar title="AI Tools" subtitle="Every Cortex capability, organised by the job it does for you." />
      <PageShell>
        {/* Hero */}
        <Card className="p-6 brand-gradient text-white overflow-hidden relative">
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium bg-white/15 rounded-full px-2.5 py-1"><Sparkles className="h-3.5 w-3.5" /> {total} flagship tools · {NAV.length} modules</div>
            <h2 className="mt-3 text-2xl font-display font-semibold tracking-tight">One brain, many hands.</h2>
            <p className="mt-1.5 text-white/85 text-sm leading-6">
              MNB Cortex isn't a chatbot bolted onto a dashboard. It reads your real data, reasons over it, acts on your behalf and remembers everything —
              so each tool below gets sharper the more you use it. Pick a job to get started.
            </p>
          </div>
        </Card>

        {GROUPS.map((g) => (
          <section key={g.title}>
            <div className="mb-3">
              <h3 className="text-lg font-semibold tracking-tight">{g.title}</h3>
              <p className="text-sm text-muted-foreground">{g.desc}</p>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {g.tools.map((t) => {
                const Icon = t.icon;
                return (
                  <Link key={t.href} href={t.href} className="group">
                    <Card className="p-5 h-full transition-all hover:border-primary/40 hover:shadow-md">
                      <div className="flex items-start justify-between gap-2">
                        <div className="h-11 w-11 rounded-xl bg-primary/10 grid place-items-center group-hover:bg-primary/15 transition-colors"><Icon className="h-5 w-5 text-primary" /></div>
                        <Badge cost={t.cost} />
                      </div>
                      <div className="mt-3 font-semibold flex items-center gap-1">{t.name}<ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" /></div>
                      <p className="text-sm text-muted-foreground mt-1">{t.blurb}</p>
                      <p className="text-xs text-muted-foreground/90 mt-2 pt-2 border-t"><span className="font-medium text-foreground/80">You get: </span>{t.you}</p>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

        {/*
          THE COMPLETE INDEX.

          This page is titled "Every Cortex capability" and listed fifteen of a
          hundred and twenty-two modules. Receivables, payables, P&L, forecasting,
          RFM, churn and reorder — the things people actually come looking for —
          were all absent, and the page closed by telling the reader to go hunt
          through the sidebar instead. A discovery page that cannot discover is
          worse than none, because the reader concludes the product is smaller
          than it is.

          Generated from NAV rather than hand-listed, so it cannot drift: add a
          module to the sidebar and it appears here the same day. The curated
          cards above stay, because a flagship tool deserves a paragraph and a
          hundred and twenty do not.
        */}
        <section>
          <div className="mb-3">
            <h3 className="text-lg font-semibold tracking-tight">Every module, A–Z</h3>
            <p className="text-sm text-muted-foreground">
              All {NAV.length} modules in Cortex, grouped the way the sidebar groups them. Everything here is included in your plan unless a credit cost is shown above.
            </p>
          </div>
          <div className="space-y-4">
            {navGroups.map(([group, items]) => (
              <Card key={group} className="p-4">
                <div className="flex items-baseline justify-between gap-2 mb-2.5">
                  <h4 className="font-semibold text-sm">{group}</h4>
                  <span className="text-xs text-muted-foreground">{items.length} modules</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((n) => {
                    const Icon = n.icon;
                    return (
                      <Link
                        key={n.href}
                        href={n.href}
                        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 h-8 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-accent transition-colors"
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        {n.label}
                      </Link>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        </section>

        <Card className="p-5 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-muted-foreground">Not sure which one you need? Describe the problem and Cortex will take you straight there.</div>
          <Link href="/chat" className="inline-flex items-center gap-1.5 rounded-lg brand-gradient text-white px-4 h-9 text-sm font-medium">Ask Cortex <ArrowRight className="h-4 w-4" /></Link>
        </Card>
      </PageShell>
    </>
  );
}
