import { Workflow, Sparkles, Table2, Database, Route, FileText, Share2, Mic, ShieldCheck, BadgeCheck, Inbox, Code2 } from "lucide-react";

/*
  THE WHOLE PLATFORM, ON ONE SCREEN (homepage).

  Every card names something that exists in this repo today, with the file
  that does it in the comment beside it — the same rule the comparison page
  is tested to. Nothing here is "coming soon".
*/
const CAPS = [
  { icon: Workflow, t: "Agent Workspace", d: "Delegate an outcome. A lead agent plans it, specialist agents run it in the background, on a schedule if you like, within a credit ceiling." },     // lib/agents/tasks.ts
  { icon: Sparkles, t: "Agent Studio", d: "Build your own agents in plain words, each with a permission card: the tools it may use, what it may propose, what it can never do." },          // lib/agents/studio.ts
  { icon: Table2, t: "Grids", d: "Ask the same questions across hundreds of contracts, emails and reports at once. Every cell quoted from its document, and the quote checked." },     // lib/grids
  { icon: Database, t: "Company Knowledge", d: "Outlook, Teams, SharePoint, OneDrive, Gmail, Drive, your documents and MCP servers — read-only, searched together, cited in every answer." }, // lib/knowledge
  { icon: Route, t: "Model Router", d: "Never locked to one lab. Choose Balanced, Speed or Frontier — Gemini, Groq, Claude, GPT — with your own keys if you have them. Each step shows who answered." }, // lib/ai/routing.ts
  { icon: FileText, t: "Finished deliverables", d: "Any agent result out as a Word document, a PowerPoint deck or an Excel workbook — with the Veritas line and the work log inside." },          // lib/deliverables
  { icon: Share2, t: "Live share links", d: "Send a result or a grid as a live, read-only page that stays current, expires when you say, counts its views and can be revoked." },        // lib/share.ts
  { icon: Mic, t: "Notetaker", d: "Upload a meeting recording; get a speaker-labelled transcript (Hindi and Hinglish kept), then minutes, decisions and actions." },               // api/meetings/transcribe
  { icon: ShieldCheck, t: "Document Review", d: "Before a board pack or lender note goes out: placeholders, totals that don't add up, figures stated two ways — and what changed since the last draft." }, // lib/review
  { icon: BadgeCheck, t: "Veritas v1", d: "Every rupee figure an agent states is traced to the rows it read. Anything it cannot trace is flagged on the answer, never hidden." },       // lib/veritas.ts
  { icon: Inbox, t: "Approvals & Autopilot", d: "Agents propose; people approve. Autopilot rules with amount caps and daily limits are the only exception — and you write them." }, // lib/engine
  { icon: Code2, t: "API and MCP, both ways", d: "Call Cortex agents from Claude or any MCP client, or over the REST API — and connect your own systems to Cortex the same way." }, // api/v1, api/mcp
];

export function PlatformCapabilities() {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border border rounded-2xl overflow-hidden">
      {CAPS.map((c) => (
        <div key={c.t} className="bg-card p-6 lg:p-7">
          <c.icon className="h-5 w-5 text-primary" aria-hidden />
          <h3 className="mt-4 font-display text-xl tracking-tightest">{c.t}</h3>
          <p className="mt-2 text-sm text-muted-foreground leading-6">{c.d}</p>
        </div>
      ))}
    </div>
  );
}
