"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Upload, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";

/*
  THE SECOND HALF OF THE FREE CHECK — REAL NUMBERS, NO ACCOUNT.

  The six-question quiz above this scores what the visitor SAYS about their
  business. Useful as a mirror, and everyone knows it is a quiz. This scores
  what is actually in their ledger, which is the only number that would make
  someone believe the product.

  It is deliberately the least demanding thing on the site: no signup, no card,
  no email required to see the result. The email form stays where it was — for
  the written report — but it is not a gate in front of the analysis. Gating
  the useful part is how a free tool becomes a lead-capture form that nobody
  recommends.

  The file never leaves the browser except as text in one request, and
  /api/free-check stores none of it. That is stated on screen rather than
  buried in a privacy policy, because a business owner being asked to paste
  their debtor list deserves to be told plainly, at the moment of asking.
*/

type Result = {
  rows: number; usable: number;
  totalOutstanding: number; overdueCount: number; overdueValue: number;
  oldestOverdueDays: number; oldestOverdueParty?: string;
  topDebtors: { party: string; amount: number; overdue: number }[];
  msmeAtRisk: number; msmeCount: number;
  findings: string[]; datesMissing: boolean;
};

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/** Keep the browser responsive and match the server's own ceiling. */
const MAX_BYTES = 1_000_000;

export function LedgerCheck() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [cols, setCols] = useState<{ field: string; column: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setErr("That file is over 1 MB. Trim it to the last 12 months and try again.");
      return;
    }
    setErr("");
    setText(await f.text());
  }

  async function run() {
    if (!text.trim()) { setErr("Paste some rows, or choose a CSV file."); return; }
    setBusy(true); setErr(""); setRes(null);
    try {
      const r = await fetch("/api/free-check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j?.ok) { setErr(j?.error || "Could not read that file."); return; }
      setRes(j.result); setCols(j.matchedColumns || []);
    } catch {
      setErr("Could not reach the analyser. Try again in a moment.");
    } finally { setBusy(false); }
  }

  return (
    <div id="ledger" className="rounded-2xl border bg-card p-6 lg:p-8 max-w-2xl scroll-mt-24">
      <div className="eyebrow">The real version</div>
      <h2 className="font-display text-2xl tracking-tightest mt-1">Now check your actual numbers.</h2>
      <p className="text-sm text-muted-foreground mt-2">
        The score above is built from six answers about how you work. This one is built from your ledger.
        Export your receivables from Tally, Busy, Vyapar, Zoho or Excel and drop the file in — you will get
        your real overdue total, the oldest one, who holds the concentration, and what is past 45 days for
        section 43B(h).
      </p>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-success/25 bg-success/5 p-3 text-xs">
        <ShieldCheck className="h-4 w-4 text-success shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          <b className="font-medium">Nothing is stored.</b> Your rows are read to produce the summary below and
          then discarded — no account is created and no file is kept. No AI is involved either; this is arithmetic,
          which is why it is instant and free.
        </span>
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-full border h-11 px-5 text-sm font-medium hover:bg-accent transition-colors">
            <Upload className="h-4 w-4" aria-hidden="true" /> Choose a CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={onFile} className="sr-only" aria-label="Choose a CSV file of your receivables" />
          <button type="button" onClick={run} disabled={busy || !text.trim()}
            className="inline-flex items-center gap-2 rounded-full btn-ink h-11 px-5 text-sm font-medium disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {busy ? "Reading…" : "Show me the numbers"}
          </button>
        </div>
        <label className="block text-sm">
          <span className="text-muted-foreground block mb-1">…or paste the rows straight in</span>
          <textarea
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Paste your receivables rows, including the header row"
            placeholder={"Invoice No,Party,Amount,Invoice Date,Due Date,Status\nINV-001,Sharma Steel,\"3,00,000\",01-01-2026,01-02-2026,Pending"}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      </div>

      {res && (
        <div className="mt-6" aria-live="polite">
          {/*
            Column mapping shown first, because the single most useful thing a
            visitor can learn here is whether we understood their export. If we
            read "Bill Amount" as the amount, they know the total below means
            what they think it means.
          */}
          {cols.length > 0 && (
            <p className="text-xs text-muted-foreground mb-4">
              Read from your file: {cols.map((c) => `${c.column} → ${c.field.replace(/_/g, " ")}`).join(" · ")}
            </p>
          )}

          <div className="grid sm:grid-cols-3 gap-3">
            <div className="rounded-xl border p-4">
              <div className="text-xs text-muted-foreground">Outstanding</div>
              <div className="font-display text-2xl tracking-tightest mt-1">{inr(res.totalOutstanding)}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{res.usable} open {res.usable === 1 ? "entry" : "entries"}</div>
            </div>
            <div className={`rounded-xl border p-4 ${res.overdueValue > 0 ? "border-danger/30 bg-danger/5" : ""}`}>
              <div className="text-xs text-muted-foreground">Past due</div>
              <div className={`font-display text-2xl tracking-tightest mt-1 ${res.overdueValue > 0 ? "text-danger" : ""}`}>{inr(res.overdueValue)}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{res.overdueCount} {res.overdueCount === 1 ? "invoice" : "invoices"}</div>
            </div>
            <div className={`rounded-xl border p-4 ${res.msmeAtRisk > 0 ? "border-warning/30 bg-warning/5" : ""}`}>
              <div className="text-xs text-muted-foreground">Past 45 days · 43B(h)</div>
              <div className="font-display text-2xl tracking-tightest mt-1">{inr(res.msmeAtRisk)}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{res.msmeCount} to check</div>
            </div>
          </div>

          {res.findings.length > 0 && (
            <ul className="mt-5 space-y-2.5">
              {res.findings.map((f, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}

          {res.topDebtors.length > 0 && (
            <div className="mt-6">
              <div className="text-sm font-medium mb-2">Who to chase first</div>
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th scope="col" className="text-left px-3 py-2 font-medium">Party</th>
                      <th scope="col" className="text-right px-3 py-2 font-medium">Overdue</th>
                      <th scope="col" className="text-right px-3 py-2 font-medium">Total open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.topDebtors.map((d) => (
                      <tr key={d.party} className="border-t">
                        <td className="px-3 py-2 truncate max-w-[220px]" title={d.party}>{d.party}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{d.overdue > 0 ? inr(d.overdue) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{inr(d.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/*
            The CTA earns itself off the number just shown, rather than being a
            generic "sign up". What Cortex adds over this page is repetition and
            delivery — the same arithmetic, every night, arriving by email
            before it costs them money. That is the honest difference.
          */}
          <div className="mt-6 rounded-xl bg-primary/5 border border-primary/15 p-5">
            <p className="text-sm">
              {res.overdueValue > 0
                ? <>You have <b>{inr(res.overdueValue)}</b> sitting past due right now. Cortex runs exactly this every night on your books and emails you when it moves — so the next one does not reach {res.oldestOverdueDays || 90} days.</>
                : <>Nothing is overdue today. Cortex runs exactly this every night and emails you the moment something crosses the line, so it stays that way.</>}
            </p>
            <Link href="/pricing" className="mt-4 inline-flex items-center gap-2 rounded-full btn-ink px-6 h-11 text-sm font-medium">
              See plans — from ₹799/month <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
