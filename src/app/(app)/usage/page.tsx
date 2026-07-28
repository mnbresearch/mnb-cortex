import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { UsagePanel } from "@/components/usage-panel";
import { getCreditState, getLedger } from "@/lib/credits";
import { getUserAndOrg } from "@/lib/data";
import { CREDIT_COSTS, CREDIT_PACKS } from "@/lib/config";
import { Coins, Infinity as InfinityIcon, Sparkles, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

const COST_SHOWCASE: [string, string][] = [
  ["AI CEO chat message", "chat"], ["Dashboard pulse", "pulse"], ["Document draft", "document"],
  ["Meeting summary", "meeting"], ["Strategy memo", "strategy"], ["Executive report", "report"],
  ["Forecast / scenario", "forecast"], ["Board deck", "board"], ["Marketing kit", "marketing"],
  ["Contract review", "contract"], ["Investor update", "investor"], ["Negotiation prep", "negotiate"],
];

function fmt(n: number) { return n.toLocaleString("en-IN"); }

export default async function Usage() {
  const [state, { orgId }] = await Promise.all([getCreditState(), getUserAndOrg()]);
  const ledger = orgId ? await getLedger(orgId, 60) : [];

  // Daily spend for the last 14 days (from negative ledger deltas).
  const days: { key: string; label: string; spent: number }[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    days.push({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString("en-IN", { day: "numeric" }), spent: 0 });
  }
  const byDay = new Map(days.map((d) => [d.key, d]));
  for (const e of ledger) {
    if (e.delta < 0) { const k = String(e.created_at).slice(0, 10); const d = byDay.get(k); if (d) d.spent += -e.delta; }
  }
  const maxSpend = Math.max(...days.map((d) => d.spent), 1);
  const spent30 = ledger.filter((e) => e.delta < 0).reduce((s, e) => s + -e.delta, 0);

  const resetLabel = state.resetAt ? new Date(state.resetAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <>
      <Topbar title="Usage & Credits" subtitle="Your AI credit balance, history, and top-ups" />
      <PageShell>
        {!state.enforceable && (
          <Card className="p-4 border-warning/30 bg-warning/5 text-sm">
            <b className="text-warning">Metering inactive.</b> Credit tracking turns on once the database migration is applied. Until then, AI runs freely and balances aren't charged.
          </Card>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4 border-primary/30 bg-primary/5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Coins className="h-4 w-4 text-primary" /> Balance</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{state.unlimited ? <span className="inline-flex items-center gap-1"><InfinityIcon className="h-6 w-6" /> Unlimited</span> : fmt(state.balance)}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="h-4 w-4 text-primary" /> Monthly allowance</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{state.unlimited ? "—" : fmt(state.allowance)}</div>
            <div className="text-xs text-muted-foreground capitalize">{state.plan} plan</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4 text-primary" /> Allowance resets</div>
            <div className="text-lg font-semibold mt-1">{state.unlimited ? "—" : resetLabel}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Coins className="h-4 w-4 text-primary" /> Spent (recent)</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{fmt(spent30)}</div>
          </Card>
        </div>

        {!state.unlimited && (
          <Section title="Usage — last 14 days" desc="Credits spent per day">
            <Card className="p-5">
              <div className="flex items-end gap-1.5 h-36">
                {days.map((d) => (
                  <div key={d.key} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full rounded-t bg-primary/70 min-h-[2px]" style={{ height: `${(d.spent / maxSpend) * 100}%` }} title={`${d.label}: ${d.spent} credits`} />
                    <span className="text-[10px] text-muted-foreground">{d.label}</span>
                  </div>
                ))}
              </div>
            </Card>
          </Section>
        )}

        <Section title="Top up credits" desc="One-time credit packs — added instantly on payment">
          <UsagePanel packs={CREDIT_PACKS} />
        </Section>

        <Section title="What each action costs" desc="Heavier AI generations use more credits">
          <Card className="p-5">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
              {COST_SHOWCASE.map(([label, key]) => (
                <div key={key} className="flex items-center justify-between border-b last:border-0 py-1">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium tabular-nums">{CREDIT_COSTS[key] ?? 2} cr</span>
                </div>
              ))}
            </div>
          </Card>
        </Section>

        <Section title="History" desc="Every credit added or spent in this workspace">
          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">No credit activity yet.</p>
          ) : (
            <Card className="p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-muted-foreground border-b bg-muted/30">
                    <th className="py-2 px-4 font-medium">When</th>
                    <th className="py-2 px-3 font-medium">Reason</th>
                    <th className="py-2 px-3 font-medium text-right">Change</th>
                    <th className="py-2 px-4 font-medium text-right">Balance</th>
                  </tr></thead>
                  <tbody>
                    {ledger.map((e) => (
                      <tr key={e.id} className="border-b last:border-0">
                        <td className="py-1.5 px-4 text-muted-foreground whitespace-nowrap">{new Date(e.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="py-1.5 px-3">{String(e.reason || "").replace(/^ai:/, "AI · ").replace(/^topup:/, "Top-up · ").replace(/_/g, " ")}</td>
                        <td className={`py-1.5 px-3 text-right tabular-nums font-medium ${e.delta < 0 ? "text-danger" : "text-success"}`}>{e.delta > 0 ? "+" : ""}{fmt(e.delta)}</td>
                        <td className="py-1.5 px-4 text-right tabular-nums text-muted-foreground">{e.balance_after == null ? "—" : fmt(e.balance_after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </Section>
      </PageShell>
    </>
  );
}
