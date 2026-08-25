"use client";
import { useEffect, useState } from "react";
import { Loader2, Check, Sparkles, Wand2 } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * Where a customer tunes how Cortex answers.
 *
 * Cortex already knows their numbers. What it never knew is how they want to be
 * spoken to, what their words mean ("units" = cartons of twelve), which
 * competitors matter, or what they consider a good margin. Two businesses with
 * identical figures need different advice.
 *
 * The presets exist because a blank box gets a blank answer. Most owners have
 * never written a prompt and won't start now — but they will happily click
 * "Blunt and direct" and then edit one line, which gets them 80% of the value
 * in ten seconds.
 */

const PRESETS: { label: string; hint: string; text: string }[] = [
  {
    label: "Blunt and direct",
    hint: "No hedging, lead with the problem",
    text: `Be blunt. Lead with the single most important problem, not a summary.
Never hedge — if the data supports a conclusion, state it. If it doesn't, say
you can't tell and what data you'd need.
Skip pleasantries and preamble. No "great question".`,
  },
  {
    label: "Explain like I'm not an accountant",
    hint: "Plain language, define the jargon",
    text: `I'm the owner, not a finance person. Use plain language.
When you use a term like EBITDA, DSO, working capital or contribution margin,
add a five-word plain-English gloss the first time.
Always end with what I should actually DO, in order of impact.`,
  },
  {
    label: "Manufacturing context",
    hint: "Units, batches, lead times",
    text: `We are a manufacturer. "Units" means finished goods; production is in
batches, and supplier lead times are 30-45 days, so any reorder advice must
account for that.
Prioritise: inventory holding cost, machine utilisation, scrap and rework, and
receivables from distributors.`,
  },
  {
    label: "Cash is the priority",
    hint: "Judge everything by cash impact",
    text: `Cash is my binding constraint, not profit on paper.
Judge every recommendation by its effect on cash in the next 90 days, and say
roughly how many days it moves my runway.
Flag anything that improves reported profit but worsens cash.`,
  },
];

export function AiInstructionsPanel({ canEdit = true }: { canEdit?: boolean }) {
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const max = 4000;

  useEffect(() => {
    fetch("/api/ai/instructions")
      .then((r) => r.json())
      .then((j) => { if (j?.ok) setText(j.text || ""); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true); setErr(""); setSaved(false);
    try {
      const r = await fetch("/api/ai/instructions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const j = await r.json();
      if (j?.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
      else setErr(j?.error || "Could not save.");
    } catch { setErr("Network error."); }
    finally { setSaving(false); }
  }

  function applyPreset(t: string) {
    setText((cur) => (cur.trim() ? `${cur.trim()}\n\n${t}` : t));
  }

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/15 p-2 shrink-0"><Sparkles className="h-5 w-5 text-primary" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold tracking-tight">How Cortex should work for you</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Cortex already reads your numbers. This is where you tell it how you want to be answered —
            your tone, your vocabulary, what you care about most. It applies to
            <b> every</b> answer: chat, agents, reports, Deep Dive and your daily autopilot.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.text)}
                disabled={!canEdit}
                title={p.hint}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 h-8 text-xs hover:bg-accent disabled:opacity-50"
              >
                <Wand2 className="h-3.5 w-3.5 text-primary" /> {p.label}
              </button>
            ))}
          </div>

          <textarea
            value={loaded ? text : ""}
            onChange={(e) => setText(e.target.value.slice(0, max))}
            disabled={!canEdit || !loaded}
            rows={10}
            placeholder={loaded
              ? `e.g. We sell to distributors on 60-day credit, so receivables matter more than revenue.\nCall out anything over 75 days overdue by name.\nKeep answers under 200 words unless I ask for detail.`
              : "Loading…"}
            className="mt-3 w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring font-mono leading-relaxed disabled:opacity-60"
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground tabular">
              {text.length} / {max} characters
              {text.length > max * 0.9 && " — longer instructions crowd out your business data"}
            </span>
            <div className="flex items-center gap-2">
              {saved && <span className="text-xs text-success inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Saved · applies to your next answer</span>}
              <button
                onClick={save}
                disabled={saving || !canEdit || !loaded}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground h-9 px-4 text-sm font-medium hover:opacity-90 disabled:opacity-60 sheen"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save instructions
              </button>
            </div>
          </div>

          {err && <p className="mt-2 text-sm text-danger">{err}</p>}
          {!canEdit && (
            <p className="mt-2 text-xs text-muted-foreground">
              These apply to everyone in the workspace, so only an admin or owner can change them.
            </p>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            One rule Cortex will not break for you: it won't invent, inflate or hide a number to match an
            instruction. If what you've asked for conflicts with your actual data, it follows the data and tells you.
          </p>
        </div>
      </div>
    </Card>
  );
}
