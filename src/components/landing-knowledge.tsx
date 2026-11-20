import Link from "next/link";
import { Mail, MessageSquare, FileText, Plug, ShieldCheck, Lock, Building2, ScrollText, Users, KeyRound, ArrowRight, Quote } from "lucide-react";

/*
  Homepage sections for the 7.1 position: Cortex knows the company, not just
  the books. Every capability named here exists in the code it points at:
    Microsoft 365 / Google Workspace  lib/knowledge/workspace-sync.ts (read-only scopes, lib/knowledge/core.ts)
    MCP servers                       lib/knowledge/mcp-client.ts (read-only tools the owner allows)
    Documents                         lib/knowledge/files.ts (PDF, Word, Excel, CSV, text)
    Citations                         lib/knowledge/core.ts citationFor, agent briefs in lib/agents/teams.ts
    Approvals, audit, isolation       lib/engine/, RLS on every table
  The sample answer is labelled illustrative — no figure in it is a claim
  about any customer.
*/

const SOURCES = [
  { icon: Mail, t: "Outlook & Teams", d: "Mail, Teams chats, OneDrive and SharePoint files, through Microsoft 365. Read-only." },
  { icon: Mail, t: "Gmail & Drive", d: "Mail, Docs, Sheets and files, through Google Workspace. Read-only." },
  { icon: FileText, t: "Your documents", d: "Policies, contracts, board packs, SOPs and reports — PDF, Word, Excel, CSV." },
  { icon: Plug, t: "Any system, via MCP", d: "CRM, ERP, ticketing or a data warehouse with an MCP server. Only read-only tools you allow." },
];

export function KnowledgeSection({ label }: { label: React.ReactNode }) {
  return (
    <section id="knowledge" className="px-5 lg:px-10 py-20 lg:py-24">
      <div className="max-w-7xl mx-auto">
        {label}
        <h2 className="font-display display-2 tracking-tightest mt-5 max-w-4xl">
          It knows your books.<br /><span className="text-primary">And now it knows your company.</span>
        </h2>
        <p className="mt-4 text-muted-foreground max-w-2xl leading-7">
          Connect the company&rsquo;s mail, chats, drives, documents and systems. Your agents search them alongside your accounts —
          and every answer names the email, chat or document it came from, so you can open it and check.
        </p>
        <div className="mt-10 grid lg:grid-cols-[1.1fr_1fr] gap-6 items-stretch">
          <div className="grid sm:grid-cols-2 gap-px bg-border border rounded-2xl overflow-hidden hairline">
            {SOURCES.map((s) => (
              <div key={s.t} className="bg-card p-6">
                <s.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                <div className="mt-3 font-display text-xl tracking-tightest">{s.t}</div>
                <p className="mt-2 text-sm text-muted-foreground leading-6">{s.d}</p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border bg-card p-6 flex flex-col">
            <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Agent Workspace</span><span className="rounded border px-1.5 py-0.5">ILLUSTRATIVE</span></div>
            <p className="mt-4 text-sm font-medium">&ldquo;What did the bank say about renewing our working-capital limit, and are we ready?&rdquo;</p>
            <div className="mt-4 rounded-xl border bg-background p-4 text-sm leading-6 flex-1">
              <p><span className="font-semibold">The bank wants the audited FY26 statements and a stock statement before the 30th.</span> The audit is signed off; the stock statement for October has not been sent.</p>
              <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                <li className="flex gap-2"><Quote className="h-3.5 w-3.5 shrink-0 mt-0.5" />Outlook · Email · &ldquo;CC limit renewal — documents required&rdquo; · from the relationship manager</li>
                <li className="flex gap-2"><Quote className="h-3.5 w-3.5 shrink-0 mt-0.5" />SharePoint · Document · &ldquo;FY26 Audited Financials.pdf&rdquo;</li>
                <li className="flex gap-2"><Quote className="h-3.5 w-3.5 shrink-0 mt-0.5" />Teams chat · &ldquo;Stock statement Oct&rdquo; · from the accounts team</li>
              </ul>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Every rupee figure in an answer is also checked against the source by Veritas v1.</p>
          </div>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Documents and MCP servers are on Pro and above. Microsoft 365 and Google Workspace are part of Command and Enterprise and are switched on with your IT team.{" "}
          <Link href="/solutions/finance" className="underline underline-offset-4">See Cortex for Finance</Link>.
        </p>
      </div>
    </section>
  );
}

const USES = [
  { t: "Close the month", d: "The close checklist from your open receivables, payables and filing dates, and the MIS pack ready to approve.", who: "Finance" },
  { t: "Get paid faster", d: "Who owes you, ranked; reminders drafted in your name; chasing that stops the moment an invoice is paid.", who: "Finance" },
  { t: "Never miss a filing", d: "GST, TDS, advance tax, ROC and 43B(h), filtered to your registration, with alerts before the date.", who: "Finance" },
  { t: "Board and lender reporting", d: "Commentary written from your own figures, with the emails and documents behind it cited.", who: "Finance" },
  { t: "Answer from the company's memory", d: "What a customer agreed by email, what the policy says, what the auditor asked for — with the source named.", who: "Everyone" },
  { t: "Keep stock and suppliers in line", d: "What to reorder, which suppliers you pay late, and the SOPs your team runs on.", who: "Operations" },
  { t: "Win back the customers slipping away", d: "Who has gone quiet, what they last said to you, and a message drafted to bring them back.", who: "Sales & Growth" },
  { t: "Run a group of companies", d: "Group workspaces for every company, one priority run each morning, audit log export for your auditors.", who: "Enterprise" },
];

export function UseCasesSection({ label }: { label: React.ReactNode }) {
  return (
    <section id="uses" className="px-5 lg:px-10 py-20 lg:py-24">
      <div className="max-w-7xl mx-auto">
        {label}
        <h2 className="font-display display-2 tracking-tightest mt-5 max-w-3xl">The work companies hand to Cortex.</h2>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {USES.map((u) => (
            <div key={u.t} className="rounded-2xl border bg-card p-6 flex flex-col">
              <span className="text-[11px] font-medium text-primary">{u.who}</span>
              <div className="mt-2 font-display text-xl tracking-tightest">{u.t}</div>
              <p className="mt-2 text-sm text-muted-foreground leading-6 flex-1">{u.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const TRUST = [
  { icon: Lock, t: "Read-only connectors", d: "Mail, chat and drive access uses read scopes only. Cortex cannot send, delete or change anything in them." },
  { icon: ScrollText, t: "Every answer cited", d: "Agents name the email, chat, document or system behind what they say. You can open it and check." },
  { icon: ShieldCheck, t: "Nothing runs unasked", d: "Agents propose; you approve. Only an Autopilot rule you set, with limits, lets an action run on its own." },
  { icon: Users, t: "Admins decide what's connected", d: "Only admins connect or remove sources. Removing one deletes everything read from it." },
  { icon: KeyRound, t: "Isolated and encrypted", d: "Each workspace is isolated at the database level; sign-in tokens are encrypted; names and IDs are masked before reaching an AI model." },
  { icon: Building2, t: "Built for groups", d: "Group workspaces, audit log export, SSO and a dedicated environment on request." },
];

export function EnterpriseSection({ label }: { label: React.ReactNode }) {
  return (
    <section id="enterprise" className="px-5 lg:px-10 py-20 lg:py-24 bg-secondary/20">
      <div className="max-w-7xl mx-auto">
        {label}
        <div className="mt-5 grid lg:grid-cols-[1fr_auto] gap-6 items-end">
          <h2 className="font-display display-2 tracking-tightest max-w-3xl">Your company&rsquo;s data, under your company&rsquo;s rules.</h2>
          <Link href="/contact" className="inline-flex items-center gap-2 rounded-full border px-6 h-12 text-sm font-medium hover:bg-accent transition-colors">Talk to us about Enterprise <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-border border rounded-2xl overflow-hidden hairline">
          {TRUST.map((x) => (
            <div key={x.t} className="bg-card p-6">
              <x.icon className="h-5 w-5 text-primary" aria-hidden="true" />
              <div className="mt-3 font-medium">{x.t}</div>
              <p className="mt-2 text-sm text-muted-foreground leading-6">{x.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
