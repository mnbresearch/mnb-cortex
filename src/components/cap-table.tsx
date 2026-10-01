"use client";
import { useMemo, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Save, Loader2, History } from "lucide-react";
import { inr } from "@/lib/utils";
import { saveWorkbenchEntry, deleteWorkbenchEntry } from "@/lib/actions";
import type { CapTableData, WorkbenchEntry } from "@/lib/workbench-types";

type Round = { id: string; name: string; raise: number; preMoney: number; esop: number };

const R0: Round[] = [
  { id: "r1", name: "Seed", raise: 20_000_000, preMoney: 80_000_000, esop: 10 },
];

/**
 * A DILUTION MODEL THAT SURVIVES CLOSING THE TAB.
 *
 * This page builds a full waterfall across rounds — the kind of thing a
 * founder puts twenty minutes into before a board conversation — and could
 * not save a single figure. Every visit restarted from the same invented
 * Seed round.
 *
 * Saved scenarios live in the workspace (lib/workbench.ts). The point is
 * comparison as much as recall: "Seed only", "Seed + Series A at 4x", "what
 * if we take the bridge" are three models a founder wants side by side, and
 * a named scenario list is how you get there.
 *
 * Everything below the save bar is untouched. A signed-out visitor, or one
 * whose role cannot write, gets exactly the calculator that shipped before.
 */
export function CapTable({
  scenarios = [],
  canSave = false,
}: {
  scenarios?: WorkbenchEntry<CapTableData>[];
  canSave?: boolean;
}) {
  const [founderShares] = useState(10_000_000); // starting founder shares (100%)
  const [rounds, setRounds] = useState<Round[]>(R0);
  const [scenarioName, setScenarioName] = useState("");
  const [note, setNote] = useState("");

  /* Mirrored from the prop for the reason written at length in
     nps-tracker.tsx: router.refresh() alone left a deleted row on screen. */
  const [saved, setSaved] = useState<WorkbenchEntry<CapTableData>[]>(scenarios);
  useEffect(() => { setSaved(scenarios); }, [scenarios]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function saveScenario() {
    const name = scenarioName.trim();
    if (!name) { setNote("Name this scenario so you can tell it apart from the others."); return; }
    const fd = new FormData();
    fd.set("kind", "captable");
    fd.set("title", name);
    fd.set("data", JSON.stringify({ founderShares, rounds } satisfies CapTableData));
    startTransition(async () => {
      const r = await saveWorkbenchEntry(fd);
      if (r && !r.ok) { setNote(r.error); return; }
      setScenarioName("");
      setNote(`Saved "${name}".`);
      router.refresh();   // same staleness as the delete path above
    });
  }

  /*
    Saved scenarios were also permanent — same gap as /nps, same existing
    server action, never wired up. A cap table is a page people iterate on;
    accumulating "Seed v2 FINAL (2)" with no way to clear it is how a useful
    list becomes one nobody reads.
  */
  function remove(s: WorkbenchEntry<CapTableData>) {
    const fd = new FormData();
    fd.set("kind", "captable"); fd.set("id", String(s.id));
    startTransition(async () => {
      const r = await deleteWorkbenchEntry(fd);
      if (r && !r.ok) { setNote(r.error); return; }
      setSaved((xs) => xs.filter((x) => String(x.id) !== String(s.id)));
      setNote(`Removed "${s.title}".`);
      /*
        THE ROW LEFT THE DATABASE AND STAYED ON THE SCREEN.

        deleteWorkbenchEntry calls revalidatePath(), and that genuinely works
        — the entry is gone on the next full load. But this component holds
        its list as a PROP from the server render, and marking a route stale
        does not re-render a client component that is already mounted. So the
        delete succeeded, the note said "Removed", and the row sat there until
        the owner pressed reload.

        That is worse than the bug it replaced. "Permanent by omission" at
        least looked permanent; this tells you it is gone and keeps showing it.

        router.refresh() re-fetches the server tree and hands this component
        fresh props. collections-console.tsx is the only other place in the
        repo that needed it, for the same reason.

        After SUCCESS only: refreshing on failure would discard the error note
        before it could be read.
      */
      router.refresh();
    });
  }

  function load(s: WorkbenchEntry<CapTableData>) {
    const rs = s.data?.rounds;
    if (!Array.isArray(rs) || !rs.length) { setNote("That scenario has no rounds in it."); return; }
    /* Coerced field by field rather than trusted wholesale: a row could have
       been written by an older shape, and a NaN in `preMoney` turns every
       percentage on this page into "NaN%" with no clue where it came from. */
    setRounds(rs.map((r, i) => ({
      id: String(r?.id ?? `r${i}`),
      name: String(r?.name ?? `Round ${i + 1}`),
      raise: Number(r?.raise) || 0,
      preMoney: Number(r?.preMoney) || 0,
      esop: Number(r?.esop) || 0,
    })));
    setNote(`Loaded "${s.title}". Editing here does not change the saved copy — save again under a new name to keep both.`);
  }

  const model = useMemo(() => {
    let totalShares = founderShares;
    let founder = founderShares;
    let esopPool = 0;
    const investors: { name: string; shares: number }[] = [];
    const steps: { name: string; founderPct: number; investorPct: number; esopPct: number; postMoney: number; price: number }[] = [];

    for (const r of rounds) {
      const postMoney = r.preMoney + r.raise;
      // ESOP top-up (pre-money, dilutes founders): add pool to reach r.esop% post
      const targetEsopShares = 0; // simplified: treat esop as a % added to pool below
      /*
        A ZERO PRE-MONEY TURNED EVERY PERCENTAGE ON THE PAGE INTO "NaN%".

        Clear the Pre-money cell (plain type="number"; `upd()` does
        `Number("")` → 0) and the chain is:

          pricePerShare     = 0 / 10,000,000      = 0
          newInvestorShares = raise / 0           = Infinity
          totalShares                             = Infinity
          investorPct       = Infinity / Infinity = NaN
          esopPct           = Infinity / Infinity = NaN

        The summary then read "Investors NaN%" and "ESOP pool NaN%" while
        "Founders now own" read a confident 0.0% (finite / Infinity), and the
        ownership bar got `width: NaN%` and collapsed.

        The existing guard at load() — `Number(r?.preMoney) || 0` — was aimed
        at this and cannot reach it: it maps a NaN arriving from a saved
        scenario to 0, and 0 is precisely the input that regenerates NaN
        through the live edit path. The fix has to sit at the arithmetic.

        A round at zero pre-money is not a modelling case to approximate; it is
        an incomplete form. Issuing no shares leaves the round a no-op, the
        founders' percentage unchanged, and every figure finite — so the page
        stays readable while the owner is still typing.
      */
      const pricePerShare = r.preMoney > 0 && totalShares > 0 ? r.preMoney / totalShares : 0;
      const newInvestorShares = pricePerShare > 0 ? r.raise / pricePerShare : 0;
      // ESOP: expand pool so esop% of post-round belongs to pool
      let poolAdd = 0;
      const preRoundTotal = totalShares + newInvestorShares;
      if (r.esop > 0) {
        // pool should be esop% of final; solve: (esopPool+poolAdd)/(preRoundTotal+poolAdd) = esop/100
        const e = r.esop / 100;
        poolAdd = Math.max(0, (e * preRoundTotal - esopPool) / (1 - e));
      }
      totalShares = preRoundTotal + poolAdd;
      esopPool += poolAdd;
      investors.push({ name: r.name, shares: newInvestorShares });
      const invTotal = investors.reduce((s, i) => s + i.shares, 0);
      steps.push({
        name: r.name,
        founderPct: (founder / totalShares) * 100,
        investorPct: (invTotal / totalShares) * 100,
        esopPct: (esopPool / totalShares) * 100,
        postMoney, price: pricePerShare,
      });
      void targetEsopShares;
    }
    const last = steps[steps.length - 1];
    return { steps, last, totalShares, founder, esopPool, investors };
  }, [rounds, founderShares]);

  function add() { setRounds((r) => [...r, { id: "r" + Date.now(), name: "Series " + String.fromCharCode(65 + r.length), raise: 50_000_000, preMoney: 250_000_000, esop: 0 }]); }
  function del(id: string) { setRounds((r) => r.filter((x) => x.id !== id)); }
  function upd(id: string, f: keyof Round, v: string) { setRounds((r) => r.map((x) => x.id === id ? { ...x, [f]: f === "name" ? v : Number(v) } : x)); }

  const I = "rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <div className="space-y-4">
      {canSave && (
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-[12rem]">
              <span className="text-sm text-muted-foreground">Save this scenario as</span>
              <input
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                placeholder="e.g. Seed + Series A at 4x"
                aria-label="Scenario name"
                className="mt-1 w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <Button onClick={saveScenario} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </Button>
          </div>
          {saved.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
              <span className="text-xs text-muted-foreground flex items-center gap-1 pt-2"><History className="h-3.5 w-3.5" /> Saved:</span>
              {saved.map((s) => (
                <span key={s.id} className="mt-2 inline-flex items-center rounded-full border text-xs overflow-hidden">
                  <button
                    onClick={() => load(s)}
                    className="px-3 min-h-11 hover:bg-secondary"
                  >
                    {s.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(s)}
                    disabled={pending}
                    aria-label={`Remove the scenario "${s.title}"`}
                    title="Remove this scenario"
                    className="px-3 min-h-11 min-w-11 grid place-items-center border-l text-muted-foreground hover:text-danger hover:bg-danger/10 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {note && <p className="text-sm text-muted-foreground" role="status">{note}</p>}
        </Card>
      )}

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Funding rounds</div>
          <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add round</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b">
              <th className="py-2 pr-2 font-medium">Round</th><th className="py-2 pr-2 font-medium">Raise ₹</th><th className="py-2 pr-2 font-medium">Pre-money ₹</th><th className="py-2 pr-2 font-medium">New ESOP %</th><th className="py-2 font-medium"></th>
            </tr></thead>
            <tbody>
              {rounds.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-2"><input className={I + " w-24"} value={r.name} onChange={(e) => upd(r.id, "name", e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className={I + " w-28"} type="number" value={r.raise} onChange={(e) => upd(r.id, "raise", e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className={I + " w-32"} type="number" value={r.preMoney} onChange={(e) => upd(r.id, "preMoney", e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className={I + " w-16"} type="number" value={r.esop} onChange={(e) => upd(r.id, "esop", e.target.value)} /></td>
                  <td className="py-1.5"><button onClick={() => del(r.id)} className="text-muted-foreground hover:text-danger min-h-11 min-w-11 p-2" aria-label="Remove"><Trash2 aria-hidden="true" className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="font-semibold">Ownership after each round</div>
        <div className="space-y-3">
          {model.steps.map((s) => (
            <div key={s.name}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium">{s.name} <span className="text-xs text-muted-foreground">· post-money {inr(s.postMoney)}</span></span>
                <span className="text-xs text-muted-foreground">Founders {s.founderPct.toFixed(1)}%</span>
              </div>
              <div className="flex h-4 rounded-full overflow-hidden">
                <div className="brand-gradient" style={{ width: `${s.founderPct}%` }} title={`Founders ${s.founderPct.toFixed(1)}%`} />
                <div className="bg-primary/50" style={{ width: `${s.investorPct}%` }} title={`Investors ${s.investorPct.toFixed(1)}%`} />
                <div className="bg-warning/60" style={{ width: `${s.esopPct}%` }} title={`ESOP ${s.esopPct.toFixed(1)}%`} />
              </div>
            </div>
          ))}
        </div>
        {model.last && (
          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Founders now own</div><div className="text-xl font-bold">{model.last.founderPct.toFixed(1)}%</div></div>
            <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Investors</div><div className="text-xl font-bold">{model.last.investorPct.toFixed(1)}%</div></div>
            <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">ESOP pool</div><div className="text-xl font-bold">{model.last.esopPct.toFixed(1)}%</div></div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Simplified model (priced rounds, ESOP as post-round %). Real term sheets add liquidation preferences, SAFEs, anti-dilution and more — use this to build intuition, not for legal docs.</p>
      </Card>
    </div>
  );
}
