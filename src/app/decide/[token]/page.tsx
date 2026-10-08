import Link from "next/link";
import { Logo } from "@/components/logo";
import { verifyDecision } from "@/lib/engine/decision-links";
import { serviceClient } from "@/lib/supabase/server";
import { CATALOGUE_BY_KEY } from "@/lib/engine/catalogue";
import { DecideButtons } from "./decide-buttons";
import { isHighImpact } from "@/lib/engine/policy";

export const dynamic = "force-dynamic";
/* The URL is a bearer link: never send it onward as a Referer, never index it. */
export const metadata = { referrer: "no-referrer" as const, robots: { index: false, follow: false } };

/*
  /decide/<token> — one proposal, two buttons.

  Rendering this page changes nothing. The token identifies a proposal and the
  member it was addressed to; the server action behind the buttons verifies it
  again and moves the ledger row. A link that has been used, decided in the
  app, or has expired shows the current state instead of buttons.
*/
export default async function DecidePage({ params }: { params: { token: string } }) {
  /* A malformed %-escape must read as an invalid link, not a 500. */
  const token = (() => { try { return decodeURIComponent(params.token || ""); } catch { return ""; } })();
  const p = verifyDecision(token);
  let proposal: any = null;
  if (p) {
    const svc = serviceClient();
    if (svc) {
      const { data } = await svc.from("action_proposals")
        .select("id, org_id, action, args, rationale, evidence, source, status, policy_reason, expires_at, created_at, decided_at, result, error")
        .eq("id", p.p).eq("org_id", p.o).maybeSingle();
      proposal = data || null;
    }
  }
  const def = proposal ? CATALOGUE_BY_KEY[proposal.action] : null;
  const what = (() => { try { return def ? def.describe(proposal.args || {}) : proposal?.action; } catch { return def?.title || proposal?.action; } })();
  const waiting = proposal?.status === "proposed" && new Date(proposal.expires_at).getTime() > Date.now();

  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-6 lg:px-12 h-16 border-b">
        <Link href="/" className="flex items-center gap-2"><Logo size={32} /><span className="font-semibold">MNB Cortex</span></Link>
        <span className="text-xs text-muted-foreground">Decision link · one proposal</span>
      </header>
      <section className="max-w-xl mx-auto px-6 py-12">
        {!p || !proposal ? (
          <div className="rounded-2xl border p-6 text-sm">
            <div className="font-medium">This link is invalid or has expired.</div>
            <p className="mt-2 text-muted-foreground">Decision links live as long as the proposal does (7 days). Nothing was changed. <Link href="/approvals" className="text-primary underline">Open the Approvals page</Link> to decide there.</p>
          </div>
        ) : (
          <div className="rounded-2xl border p-6 space-y-4">
            <div className="text-xs text-muted-foreground">{def?.title || proposal.action} · proposed {new Date(proposal.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · from {proposal.source}</div>
            <h1 className="text-xl font-semibold tracking-tight">{what}</h1>
            {proposal.rationale && <p className="text-sm"><span className="text-muted-foreground">Why: </span>{proposal.rationale}</p>}
            {Array.isArray(proposal.evidence) && proposal.evidence.length > 0 && (
              <div className="text-xs text-muted-foreground">Looked at: {proposal.evidence.slice(0, 5).map((e: unknown) => String(e)).join("; ")}</div>
            )}
            <div className="text-xs text-muted-foreground">
              {def?.reversible ? "Reversible — can be undone from Approvals after it runs." : "Cannot be undone once it runs."}
              {proposal.policy_reason ? ` · ${proposal.policy_reason}` : ""}
            </div>
            {waiting ? (
              <DecideButtons token={token} canApprove={!(def && isHighImpact(def))} />
            ) : (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                {proposal.status === "done" && <>Already approved and run{proposal.decided_at ? ` on ${new Date(proposal.decided_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` : ""}.</>}
                {proposal.status === "rejected" && <>Already rejected. Nothing was changed.</>}
                {proposal.status === "failed" && <>Approved earlier, but it did not go through: {proposal.error || "unknown error"}.</>}
                {proposal.status === "expired" && <>This proposal expired before anyone decided. Nothing was changed.</>}
                {proposal.status === "undone" && <>This action was run and later undone.</>}
                {["approved", "executing", "blocked"].includes(proposal.status) && <>This proposal is {proposal.status}; it is no longer waiting on you.</>}
                {proposal.status === "proposed" && <>This proposal has expired. Nothing was changed.</>}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Opening this page changed nothing. Only the buttons do. <Link href="/approvals" className="text-primary underline">See every proposal</Link>.</p>
          </div>
        )}
      </section>
    </main>
  );
}
