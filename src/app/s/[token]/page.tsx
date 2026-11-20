import Link from "next/link";
import { Check, AlertTriangle, Clock } from "lucide-react";
import { Logo } from "@/components/logo";
import { AgentMarkdown } from "@/components/agent-markdown";
import { resolveShare } from "@/lib/share";
import { serviceClient } from "@/lib/supabase/server";
import { cellKey, type Grid } from "@/lib/grids/core";
import { veritasLine } from "@/lib/deliverables/blocks";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared from MNB Cortex", robots: { index: false, follow: false } };

/*
  /s/<token> — a LIVE share link (lib/share.ts). Re-reads the task or grid on
  every view, scoped by the link's own org_id; expired or revoked links show
  nothing. Read-only, not indexed, and it says what it is: a page shared from
  a workspace, with the date it stops working.
*/
export default async function SharedPage({ params }: { params: { token: string } }) {
  const link = await resolveShare(params.token).catch(() => null);
  const db = serviceClient() as any;
  let org = "", task: any = null, steps: any[] = [], grid: Grid | null = null;
  if (link && db) {
    const { data: o } = await db.from("organizations").select("name").eq("id", link.org_id).maybeSingle();
    org = o?.name || "";
    if (link.kind === "agent_task") {
      const { data } = await db.from("agent_tasks").select("title, request, status, result, verification, finished_at").eq("id", link.ref_id).eq("org_id", link.org_id).maybeSingle();
      task = data;
      const { data: st } = await db.from("agent_task_steps").select("agent_name, instruction, status, kind, seq").eq("task_id", link.ref_id).eq("org_id", link.org_id).order("seq");
      steps = ((st as any[]) || []).filter((s) => s.kind === "agent" && s.status === "done");
    } else {
      const { data } = await db.from("grids").select("id, name, rows, columns, cells").eq("id", link.ref_id).eq("org_id", link.org_id).maybeSingle();
      grid = data as any;
    }
  }
  const missing = !link || (!task && !grid);
  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between px-6 lg:px-12 h-16 border-b">
        <Link href="/" className="flex items-center gap-2"><Logo size={30} /><span className="font-semibold"><span className="text-[10px] font-bold tracking-[0.18em] text-muted-foreground mr-1">MNB</span>Cortex</span></Link>
        {!missing && <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Live · shared by {org || "a workspace"} · until {new Date(link!.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>}
      </header>
      <section className="max-w-5xl mx-auto px-6 py-12">
        {missing ? (
          <div className="text-center py-24 text-muted-foreground">This link has expired, was revoked, or never existed.</div>
        ) : task ? (
          <article className="space-y-6">
            <p className="eyebrow">Agent result</p>
            <h1 className="font-display text-4xl tracking-tightest">{task.title}</h1>
            <p className="text-muted-foreground">{task.request}</p>
            {task.status !== "done" ? <p className="text-sm text-muted-foreground">The agents are still working on this. Refresh to see the latest.</p> : (
              <>
                <div className="rounded-2xl border bg-card p-6"><AgentMarkdown text={String(task.result || "")} /></div>
                <p className="text-sm text-muted-foreground italic">{veritasLine(task.verification)}</p>
              </>
            )}
            {steps.length > 0 && (
              <div><h2 className="text-sm font-semibold mb-2">Who worked on it</h2>
                <ul className="text-sm text-muted-foreground space-y-1">{steps.map((s, i) => <li key={i}><span className="text-foreground">{s.agent_name}</span> — {s.instruction}</li>)}</ul></div>
            )}
          </article>
        ) : grid && (
          <article className="space-y-6">
            <p className="eyebrow">Grid</p>
            <h1 className="font-display text-4xl tracking-tightest">{grid.name}</h1>
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full text-sm border-collapse">
                <thead><tr className="border-b bg-secondary/40"><th className="text-left p-3">Document</th>{grid.columns.map((c) => <th key={c.id} className="text-left p-3 font-medium">{c.question}</th>)}</tr></thead>
                <tbody>{grid.rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 align-top">
                    <th scope="row" className="text-left p-3 font-medium">{r.title}<span className="block text-[11px] font-normal text-muted-foreground">{r.citation}</span></th>
                    {grid!.columns.map((c) => { const x = grid!.cells[cellKey(r.id, c.id)]; return (
                      <td key={c.id} className="p-3">{!x ? "—" : x.status === "done" ? (<><span>{x.answer}</span>{x.quote && <span className="block mt-1 text-[11px] text-muted-foreground">&ldquo;{x.quote}&rdquo;</span>}<span className={`mt-1 flex items-center gap-1 text-[11px] ${x.verified ? "text-success" : "text-warning"}`}>{x.verified ? <><Check className="h-3 w-3" /> Quote found in document</> : <><AlertTriangle className="h-3 w-3" /> Quote not found — check</>}</span></>) : x.status === "not_found" ? <span className="italic text-muted-foreground">Not in document</span> : "—"}</td>
                    ); })}
                  </tr>))}</tbody>
              </table>
            </div>
          </article>
        )}
        <p className="mt-16 text-xs text-muted-foreground">Prepared with MNB Cortex agents from the sharing workspace&rsquo;s own data. Read-only. <Link href="/" className="underline">What is MNB Cortex?</Link></p>
      </section>
    </main>
  );
}
