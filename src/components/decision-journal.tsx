"use client";
import { useEffect, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Plus, Trash2, Loader2, Gavel, CloudUpload } from "lucide-react";
import { mdToHtml } from "@/lib/utils";
import { saveWorkbenchEntry, deleteWorkbenchEntry, patchWorkbenchEntry } from "@/lib/actions";
import type { DecisionData, WorkbenchEntry } from "@/lib/workbench-types";

/**
 * THE DECISION JOURNAL NOW REMEMBERS THINGS.
 *
 * Its whole value is being able to read, months later, what you decided and
 * why. It stored that in `localStorage.cortex_decisions`: one browser, one
 * device, gone on a cache clear, invisible to a co-founder, absent from every
 * other machine the same person signs in on. The "Devil's advocate" button
 * spends 14 credits on an AI critique and threw the result away on refresh.
 *
 * Entries now live in the workspace (see lib/workbench.ts). Three things
 * about how that was done:
 *
 * 1. NOTHING IS LOST. A journal that has been quietly collecting decisions in
 *    one browser for months must not come back empty after this ships. On
 *    first load, anything in localStorage is offered for import — explicitly,
 *    with a button, rather than silently — and the local copy is left exactly
 *    where it is afterwards. If the import fails, or the owner never clicks,
 *    they still have everything.
 *
 * 2. A SIGNED-OUT VISITOR KEEPS THE OLD BEHAVIOUR. /decisions is reachable
 *    without an account. For that visitor the page works precisely as before,
 *    on localStorage, because the alternative is a Save button that redirects
 *    to /login and loses the paragraph they just typed.
 *
 * 3. THE CRITIQUE IS BOUGHT ONCE. It is written back to the entry, so the
 *    14 credits buy a permanent answer rather than one that survives until
 *    the next refresh.
 */

type LocalDecision = { id: string; title: string; rationale: string; date: string; status: DecisionData["status"] };
const LOCAL_KEY = "cortex_decisions";

export function DecisionJournal({
  entries = [],
  canSave = false,
}: {
  entries?: WorkbenchEntry<DecisionData>[];
  canSave?: boolean;
}) {
  const [local, setLocal] = useState<LocalDecision[]>([]);
  const [strays, setStrays] = useState<LocalDecision[]>([]);
  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState("");
  const [critique, setCritique] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  /* Read the local journal once. For a signed-out visitor this IS the journal;
     for a signed-in one it is a migration candidate. */
  useEffect(() => {
    try {
      const s = localStorage.getItem(LOCAL_KEY);
      const parsed: LocalDecision[] = s ? JSON.parse(s) : [];
      if (!Array.isArray(parsed) || !parsed.length) return;
      setLocal(parsed);
      if (canSave) setStrays(parsed);
    } catch { /* corrupt or unavailable storage is not worth an error state */ }
  }, [canSave]);

  /* Only the signed-out path writes back — a signed-in owner's source of truth
     is the workspace, and mirroring would create two journals that drift. */
  useEffect(() => {
    if (canSave) return;
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(local)); } catch { /* ignore */ }
  }, [local, canSave]);

  /* A saved entry and a local one render identically below. */
  const items: Array<{ id: string; title: string; rationale: string; date: string; status: DecisionData["status"]; saved: boolean; critique?: string }> =
    canSave
      ? entries.map((e) => ({
          id: e.id, title: e.title,
          rationale: e.data?.rationale ?? "",
          date: e.createdAt,
          status: e.data?.status ?? "considering",
          saved: true,
          critique: e.data?.critique,
        }))
      : local.map((d) => ({ ...d, saved: false }));

  function add() {
    const t = title.trim();
    if (!t) return;
    if (!canSave) {
      setLocal((d) => [{ id: "d" + Date.now(), title: t, rationale: rationale.trim(), date: new Date().toISOString(), status: "considering" }, ...d]);
      setTitle(""); setRationale("");
      return;
    }
    const fd = new FormData();
    fd.set("kind", "decision");
    fd.set("title", t);
    fd.set("data", JSON.stringify({ rationale: rationale.trim(), status: "considering" } satisfies DecisionData));
    startTransition(async () => {
      const r = await saveWorkbenchEntry(fd);
      if (r && !r.ok) { setNote(r.error); return; }
      setTitle(""); setRationale(""); setNote("");
    });
  }

  function del(id: string, saved: boolean) {
    if (!saved) { setLocal((d) => d.filter((x) => x.id !== id)); return; }
    const fd = new FormData();
    fd.set("kind", "decision"); fd.set("id", id);
    startTransition(async () => {
      const r = await deleteWorkbenchEntry(fd);
      if (r && !r.ok) setNote(r.error);
    });
  }

  function setStatus(id: string, saved: boolean, status: DecisionData["status"]) {
    if (!saved) { setLocal((d) => d.map((x) => x.id === id ? { ...x, status } : x)); return; }
    const fd = new FormData();
    fd.set("kind", "decision"); fd.set("id", id);
    fd.set("patch", JSON.stringify({ status }));
    startTransition(async () => {
      const r = await patchWorkbenchEntry(fd);
      if (r && !r.ok) setNote(r.error);
    });
  }

  /* Explicit, one-button import. Not automatic: writing a dozen rows into
     someone's workspace without asking is the kind of helpfulness nobody
     wants, and an owner who has been using this on a shared machine may not
     want the local entries in the company journal at all. */
  function importStrays() {
    startTransition(async () => {
      let failed = 0;
      for (const d of strays) {
        const fd = new FormData();
        fd.set("kind", "decision");
        fd.set("title", d.title || "Untitled decision");
        fd.set("data", JSON.stringify({ rationale: d.rationale ?? "", status: d.status ?? "considering" } satisfies DecisionData));
        const r = await saveWorkbenchEntry(fd);
        if (r && !r.ok) failed++;
      }
      /* localStorage is deliberately NOT cleared. If some rows failed, or the
         owner wants them back, they are still there. Dismissing the banner is
         a UI state, not a deletion. */
      setStrays([]);
      setNote(failed
        ? `Imported ${strays.length - failed} of ${strays.length}. The rest are still in this browser.`
        : `Imported ${strays.length} decision${strays.length === 1 ? "" : "s"} into your workspace. The browser copy is untouched.`);
    });
  }

  async function stressTest(d: { id: string; title: string; rationale: string; saved: boolean }) {
    setLoading(d.id);
    try {
      const r = await fetch("/api/ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "critique", input: `Decision: ${d.title}\nMy rationale: ${d.rationale || "(none given)"}` }),
      });
      const j = await r.json();
      const text = j.text || "No response.";
      setCritique((c) => ({ ...c, [d.id]: text }));

      /* Write it back, so 14 credits buy a permanent answer rather than one
         that lasts until the next refresh. A failure here is not worth an
         error banner — the critique is on screen either way — but it must not
         claim to have saved. */
      if (d.saved && j.text) {
        const fd = new FormData();
        fd.set("kind", "decision"); fd.set("id", d.id);
        fd.set("patch", JSON.stringify({ critique: text }));
        const res = await patchWorkbenchEntry(fd);
        if (res && !res.ok) setNote("The critique is shown below but could not be saved to this decision.");
      }
    } catch {
      setCritique((c) => ({ ...c, [d.id]: "Network error reaching the AI." }));
    } finally { setLoading(""); }
  }

  const tone: Record<string, string> = {
    considering: "bg-warning/10 text-warning border-warning/20",
    decided: "bg-success/10 text-success border-success/20",
    revisit: "bg-primary/10 text-primary border-primary/20",
  };

  return (
    <div className="space-y-4">
      {strays.length > 0 && (
        <Card className="p-4 border-primary/30 bg-primary/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <b>{strays.length} decision{strays.length === 1 ? "" : "s"} found in this browser.</b>{" "}
              <span className="text-muted-foreground">
                They were saved before this journal could store anything in your workspace, so they exist only here —
                on this device, in this browser. Import them and they follow you everywhere and your team can see them.
              </span>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" onClick={importStrays} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />} Import
              </Button>
              <Button size="sm" variant="outline" onClick={() => setStrays([])} disabled={pending}>Not now</Button>
            </div>
          </div>
        </Card>
      )}

      {note && <p className="text-sm text-muted-foreground" role="status">{note}</p>}

      <Card className="p-5 space-y-3">
        <div className="font-semibold flex items-center gap-2"><Gavel className="h-4 w-4 text-primary" /> Log a decision</div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The decision (e.g. Enter the UAE market in Q3)" aria-label="The decision (e.g. Enter the UAE market in Q3)"
          className="w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={3} placeholder="Why — your reasoning and the key assumptions" aria-label="Why — your reasoning and the key assumptions"
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y" />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={add} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save decision
          </Button>
          {/* Say where it goes. An owner deciding whether to type a candid
              paragraph about a co-founder deserves to know whether their team
              will be able to read it. */}
          <span className="text-xs text-muted-foreground">
            {canSave
              ? "Saved to your workspace — visible to your team and on every device you sign in on."
              : "Saved in this browser only. Sign in to keep your journal in your workspace."}
          </span>
        </div>
      </Card>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No decisions logged yet. Writing them down — with your reasoning — makes it far easier to learn from what worked and what didn&apos;t.</p>
      ) : items.map((d) => {
        const shown = critique[d.id] ?? d.critique;
        return (
          <Card key={d.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">{d.title}</div>
                <div className="text-xs text-muted-foreground">{d.date ? new Date(d.date).toLocaleDateString("en-IN") : ""}</div>
                {d.rationale && <p className="text-sm text-muted-foreground mt-1">{d.rationale}</p>}
              </div>
              <button onClick={() => del(d.id, d.saved)} className="text-muted-foreground hover:text-danger shrink-0 min-h-11 min-w-11 p-2" aria-label="Remove"><Trash2 aria-hidden="true" className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(["considering", "decided", "revisit"] as const).map((s) => (
                <button key={s} onClick={() => setStatus(d.id, d.saved, s)} aria-label={`Mark as ${s}`}>
                  <Badge className={d.status === s ? tone[s] : "border-border text-muted-foreground"}>{s}</Badge>
                </button>
              ))}
              <Button variant="outline" size="sm" className="ml-auto" onClick={() => stressTest(d)} disabled={loading === d.id}>
                {loading === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Devil&apos;s advocate
              </Button>
            </div>
            {shown && <div className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(shown) }} />}
          </Card>
        );
      })}
    </div>
  );
}
