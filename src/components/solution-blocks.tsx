import Link from "next/link";
import { ArrowUpRight, Bot, ShieldCheck, Inbox, Database, Crown, Wrench } from "lucide-react";
import { agentsInTeam, type TeamId } from "@/lib/agents/teams";

/*
  Shared blocks for the solution pages and the homepage: the agent team for a
  solution, and the four-step "how the agents work" strip. Server components;
  everything they say is read from lib/agents/teams.ts, so the marketing page
  and the product cannot disagree about who the agents are or what they can do.
*/

const TOOL_LABEL: Record<string, string> = {
  top_receivables: "Receivables", top_payables: "Payables", top_customers: "Top customers", recent_orders: "Recent orders",
  low_stock: "Low stock", find_party: "Customer & supplier lookup", collections_status: "Collections", revenue_by_month: "Revenue by month",
  propose_action: "Proposes actions", business_snapshot: "KPI snapshot", msme_exposure: "43B(h) exposure",
  statutory_deadlines: "Statutory calendar", customer_segments: "Customer segments", recall_memory: "Memory", remember_fact: "Writes memory",
};

export function AgentTeamGrid({ team }: { team: TeamId }) {
  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-px bg-border border rounded-2xl overflow-hidden hairline">
      {agentsInTeam(team).map((a) => (
        <div key={a.id} className="bg-card p-6 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            {a.lead ? <Crown className="h-4 w-4 text-primary" aria-label="Team lead" /> : <Bot className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
            <div className="font-display text-xl tracking-tightest">{a.name}</div>
          </div>
          <p className="text-sm text-muted-foreground leading-6 flex-1">{a.role}</p>
          <div className="flex flex-wrap gap-1.5">
            {a.tools.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                <Wrench className="h-3 w-3" aria-hidden="true" />{TOOL_LABEL[t] || t}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const STEPS = [
  { icon: Database, t: "Connect your books", d: "Live sync from Zoho Books, Odoo, Shopify, Razorpay, Stripe and Google Sheets; a bridge for Tally; file import for Vyapar, Busy and CSV. You keep your accounting software." },
  { icon: Bot, t: "Delegate in plain words", d: "Ask for the outcome. Cortex routes it to the right agent, or a team lead plans it across specialists. Tasks keep running after you close the tab, and can run on a schedule." },
  { icon: Inbox, t: "Approve what matters", d: "Agents only propose. A reminder, a status change or an export waits on your Approvals page until you say yes, unless you've set an Autopilot rule with limits." },
  { icon: ShieldCheck, t: "Every figure checked", d: "Veritas v1 traces every rupee figure in an answer back to the rows the agents read, and flags any it can't. Names and identifiers are masked before anything reaches an AI model." },
];

export function HowAgentsWork() {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-px bg-border border rounded-2xl overflow-hidden hairline">
      {STEPS.map((s, i) => (
        <div key={s.t} className="bg-card p-7 flex flex-col">
          <div className="flex items-center gap-3"><span className="font-display text-3xl tracking-tightest text-primary">0{i + 1}</span><s.icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" /></div>
          <div className="mt-4 font-display text-xl tracking-tightest">{s.t}</div>
          <p className="mt-3 text-sm text-muted-foreground leading-6">{s.d}</p>
        </div>
      ))}
    </div>
  );
}

export function SolutionCta({ label = "Start your agent team" }: { label?: string }) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <Link href="/login?mode=signup" className="inline-flex items-center justify-center gap-2 rounded-full btn-ink px-7 h-12 text-sm font-medium" data-cursor>{label} <ArrowUpRight className="h-4 w-4" /></Link>
      <Link href="/contact" className="inline-flex items-center justify-center gap-2 rounded-full border px-7 h-12 text-sm font-medium hover:bg-accent transition-colors">Book a walkthrough</Link>
    </div>
  );
}
