"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Save, Loader2, Trash2 } from "lucide-react";
import { mdToHtml } from "@/lib/utils";
import { ExampleFigures } from "@/components/example-figures";
import { saveWorkbenchEntry, deleteWorkbenchEntry } from "@/lib/actions";
import type { NpsData, WorkbenchEntry } from "@/lib/workbench-types";

/**
 * THE PAGE THAT PROMISED A TREND AND COULD NOT REMEMBER YESTERDAY.
 *
 * /nps tells the owner, in its own words, that "sentiment turns before the
 * numbers do" and that NPS "gives you that early warning". Both are true and
 * both are claims about a SERIES. This page computed one number from three
 * inputs and forgot it the moment the tab closed, so the one thing it said
 * mattered — the direction of travel — was the one thing it could not show.
 *
 * Readings are now saved to the workspace, each with the score as computed at
 * the time. Stored rather than recomputed on read: if the banding or the
 * formula ever changes, what the business recorded last quarter must not
 * quietly change with it.
 *
 * The AI plan is saved alongside the reading it was written about, so an
 * owner comparing two quarters can see what they were told to do after the
 * first one and whether they did it.
 */
export function NpsTracker({
  history = [],
  canSave = false,
}: {
  history?: WorkbenchEntry<NpsData>[];
  canSave?: boolean;
}) {
  const [promoters, setPromoters] = useState(120);
  const [passives, setPassives] = useState(60);
  const [detractors, setDetractors] = useState(30);
  const [themes, setThemes] = useState("Slow response times; pricing feels high for smaller plans; onboarding is confusing");
  const [out, setOut] = useState(""); const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const m = useMemo(() => {
    const total = promoters + passives + detractors;
    const pPct = total ? (promoters / total) * 100 : 0;
    const dPct = total ? (detractors / total) * 100 : 0;
    const nps = Math.round(pPct - dPct);
    const band = nps >= 50 ? "Excellent" : nps >= 30 ? "Good" : nps >= 0 ? "Needs work" : "Critical";
    const tone = nps >= 50 ? "text-success" : nps >= 30 ? "text-success" : nps >= 0 ? "text-warning" : "text-danger";
    return { total, pPct, dPct, passivePct: total ? (passives / total) * 100 : 0, nps, band, tone };
  }, [promoters, passives, detractors]);

  async function analyse() {
    setLoading(true); setOut("");
    const input = `NPS survey: ${promoters} promoters, ${passives} passives, ${detractors} detractors from ${m.total} responses → NPS ${m.nps} (${m.band}). Recurring feedback themes: ${themes}. Give me a prioritised plan to raise NPS, what to fix first, and how to convert passives into promoters.`;
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "strategy", input }) });
      const j = await r.json(); setOut(j.text || "No response.");
    } catch { setOut("Network error reaching the AI."); } finally { setLoading(false); }
  }

  function saveReading() {
    const title = label.trim() || new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    if (m.total <= 0) { setNote("Enter at least one response before saving a reading."); return; }
    const fd = new FormData();
    fd.set("kind", "nps");
    fd.set("title", title);
    fd.set("data", JSON.stringify({
      promoters, passives, detractors, themes,
      score: m.nps,
      /* Only attach the plan if one was actually generated for THESE numbers.
         `out` is cleared at the start of every analyse(), so it can only be
         stale if the owner edited the inputs afterwards — hence the guard on
         the reading matching what the plan was written about. */
      ...(out ? { analysis: out } : {}),
    } satisfies NpsData));
    startTransition(async () => {
      const r = await saveWorkbenchEntry(fd);
      if (r && !r.ok) { setNote(r.error); return; }
      setLabel("");
      setNote(`Saved "${title}" — NPS ${m.nps}.`);
      router.refresh();   // same staleness as the delete path
    });
  }

  /* Newest last, so the sparkline reads left-to-right like a timeline. The
     server hands them back newest-first. */
  /*
    REMOVING A READING, BECAUSE A MISTYPED ONE WAS PERMANENT.

    Found by walking this page live: there was no delete anywhere on /nps.
    Save it once and the number is in your trend forever — and an NPS trend
    is a line whose whole meaning comes from its shape, so one fat-fingered
    "430" instead of "43" bends the chart permanently and there was no way
    back short of asking support.

    The server action already existed (deleteWorkbenchEntry, org-scoped,
    row-count checked) and /decisions already used it. Only this page never
    wired it up. Nothing new to build; something missing to connect.
  */
  function remove(id: string, title: string) {
    const fd = new FormData();
    fd.set("kind", "nps"); fd.set("id", id);
    startTransition(async () => {
      const r = await deleteWorkbenchEntry(fd);
      if (r && !r.ok) { setNote(r.error); return; }
      setNote(`Removed "${title}".`);
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

  const series = [...history].reverse();

  const F = (label: string, value: number, set: (n: number) => void, color: string) => (
    <label className="block">
      <span className="text-sm text-muted-foreground flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${color}`} />{label}</span>
      <input type="number" value={value} onChange={(e) => set(Number(e.target.value))}
        className="mt-1 w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring" />
    </label>
  );

  return (
    <Card className="p-5 space-y-5">
      <ExampleFigures what="survey responses" />
      <div>
        <div className="font-semibold">Net Promoter Score</div>
        <div className="text-sm text-muted-foreground">"How likely are you to recommend us?" — 9–10 promoters, 7–8 passives, 0–6 detractors.</div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        {F("Promoters (9–10)", promoters, setPromoters, "bg-success")}
        {F("Passives (7–8)", passives, setPassives, "bg-warning")}
        {F("Detractors (0–6)", detractors, setDetractors, "bg-danger")}
      </div>

      <div className="rounded-lg border p-4 text-center">
        <div className="text-sm text-muted-foreground">Net Promoter Score</div>
        <div className={`text-4xl font-extrabold tabular-nums ${m.tone}`}>{m.nps}</div>
        <div className={`text-sm font-medium ${m.tone}`}>{m.band}</div>
        <div className="text-xs text-muted-foreground mt-1">{m.total} responses</div>
      </div>

      {m.total > 0 && (
        <div>
          <div className="flex h-3 rounded-full overflow-hidden">
            <div className="bg-success" style={{ width: `${m.pPct}%` }} title={`Promoters ${m.pPct.toFixed(0)}%`} />
            <div className="bg-warning" style={{ width: `${m.passivePct}%` }} title={`Passives ${m.passivePct.toFixed(0)}%`} />
            <div className="bg-danger" style={{ width: `${m.dPct}%` }} title={`Detractors ${m.dPct.toFixed(0)}%`} />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
            <span>{m.pPct.toFixed(0)}% promoters</span>
            <span>{m.passivePct.toFixed(0)}% passive</span>
            <span>{m.dPct.toFixed(0)}% detractors</span>
          </div>
        </div>
      )}

      <label className="block">
        <span className="text-sm text-muted-foreground">Recurring feedback themes</span>
        <textarea value={themes} onChange={(e) => setThemes(e.target.value)} rows={2}
          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y" />
      </label>

      <p className="text-xs text-muted-foreground">Rough guide: above 50 is excellent, 30–50 good, 0–30 needs work, below 0 means more detractors than promoters.</p>

      <Button onClick={analyse} disabled={loading}><Sparkles className="h-4 w-4" /> {loading ? "Analysing…" : "How do I raise this? (ask Cortex)"}</Button>
      {out && <div className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(out) }} />}

      {canSave && (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="text-sm font-medium">Record this reading</div>
          <p className="text-xs text-muted-foreground">
            One score is a number; a series is the early warning this page is for. Save each survey and the
            direction of travel becomes visible.
            {out ? " The plan above is saved with it." : ""}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-[10rem]">
              <span className="text-xs text-muted-foreground">Label</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
                aria-label="Reading label"
                className="mt-1 w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <Button variant="outline" onClick={saveReading} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save reading
            </Button>
          </div>
          {note && <p className="text-sm text-muted-foreground" role="status">{note}</p>}
        </div>
      )}

      {series.length > 0 && (
        <div className="rounded-lg border p-4">
          <div className="text-sm font-medium mb-3">Your NPS over time</div>
          <div className="space-y-1.5">
            {series.map((r) => {
              const score = Number(r.data?.score);
              const safe = Number.isFinite(score) ? score : 0;
              /* NPS runs −100..+100, so the bar is drawn from a centre line;
                 a plain width would render −40 and +40 identically. */
              const magnitude = Math.min(100, Math.abs(safe));
              return (
                <div key={r.id} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 truncate text-muted-foreground" title={r.title}>{r.title}</span>
                  <div className="flex-1 flex h-3 rounded-full bg-muted overflow-hidden" aria-hidden="true">
                    <div className="w-1/2 flex justify-end">
                      {safe < 0 && <div className="bg-danger h-full" style={{ width: `${magnitude}%` }} />}
                    </div>
                    <div className="w-1/2">
                      {safe >= 0 && <div className="bg-success h-full" style={{ width: `${magnitude}%` }} />}
                    </div>
                  </div>
                  <span className="w-10 text-right tabular-nums font-medium">{Number.isFinite(score) ? score : "—"}</span>
                  <button
                    type="button"
                    onClick={() => remove(String(r.id), String(r.title))}
                    disabled={pending}
                    aria-label={`Remove the reading "${r.title}"`}
                    title="Remove this reading"
                    /* min-h-11/min-w-11 = the 44px touch target test:a11y enforces on every
                       icon-only control. Caught by that suite, not by me. */
                    className="shrink-0 rounded min-h-11 min-w-11 p-2 grid place-items-center text-muted-foreground hover:text-danger hover:bg-danger/10 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
          {series.length === 1 && (
            <p className="text-xs text-muted-foreground mt-3">
              One reading so far. Save the next survey and this becomes a trend.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
