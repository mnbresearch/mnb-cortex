"use client";
import { useRef, useState } from "react";
import { SafeForm } from "@/components/safe-form";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Upload } from "lucide-react";
import { mdToHtml } from "@/lib/utils";
import { saveArtifact } from "@/lib/actions";
import { Save } from "lucide-react";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") return reject();
    if ([...document.scripts].some((sc) => sc.src === src)) return resolve();
    const el = document.createElement("script");
    el.src = src; el.onload = () => resolve(); el.onerror = () => reject();
    document.head.appendChild(el);
  });
}

async function extractPdf(f: File): Promise<string> {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.js");
  const pdfjs: any = (window as any).pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js";
  const data = await f.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    const tc = await pg.getTextContent();
    out += tc.items.map((x: any) => x.str).join(" ") + "\n";
    if (out.length > 20000) break;
  }
  return out;
}

export function AIPanel({
  mode, placeholder, cta, multiline = false, allowFile = false, saveMode,
  suggestions, inputOptional = false,
  "aria-label": ariaLabel,
}: {
  mode: string; placeholder: string; cta: string; multiline?: boolean; allowFile?: boolean; saveMode?: string;
  /**
   * Starting points, rendered as real buttons that fill the field.
   *
   * WHY THIS PROP EXISTS. Three pages (/sops, /proposals, /marketing) showed a
   * row of example prompts under copy that said "Tap one, paste it above, and
   * generate". The chips were `<Badge>`, which is a bare non-interactive
   * `<span>` — no onClick, no clipboard, no wiring to this panel. Tapping did
   * nothing, so the instruction was simply wrong, and the user had to retype a
   * sentence that was already on their screen.
   *
   * They belong in here rather than on each page because only this component
   * owns `input`. A page-level chip would have to reach into this state, which
   * is how the three pages ended up telling the user to be the integration.
   */
  suggestions?: string[];
  /**
   * True when the analysis runs off workspace data and the box is a refinement.
   *
   * WHY THIS EXISTS. `run()` opened with `if (!input.trim()) return;` — a bare
   * early return, before the loading state, before the output was cleared, and
   * with nothing rendered. Nine panels label the field "Optional: focus…", so
   * the documented way to use them was to press Generate with it empty. That
   * did nothing at all: no spinner, no result, no error. Worse, because the
   * return came before `setOut("")`, a previous answer stayed on screen, so the
   * failure looked like a refreshed result.
   *
   * With this set the empty case is the normal case and runs. Without it, an
   * empty box is a real validation error and now says so instead of going
   * quiet — a required field is allowed, a silently required one is not.
   */
  inputOptional?: boolean;
  /**
   * ACTUALLY APPLIED NOW.
   *
   * /sops, /investor and /contracts already passed `aria-label`, and this
   * component neither destructured it nor spread rest props — so it was
   * dropped on the floor and the accessibility fix those three lines were
   * added for never reached the DOM.
   */
  "aria-label"?: string;
}) {
  const [input, setInput] = useState("");
  const [out, setOut] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsInput, setNeedsInput] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  /*
    Fill the field and put the cursor in it. Focusing matters: the point of a
    starting point is that you edit it, so landing the caret in the box is the
    difference between a shortcut and a surprise.
  */
  function useSuggestion(s: string) {
    setInput(s);
    const el = fieldRef.current;
    if (el) {
      el.focus();
      const n = s.length;
      try { el.setSelectionRange(n, n); } catch { /* not all inputs support it */ }
    }
  }

  async function run() {
    /*
      Empty and required is a validation error the user can see and act on.
      Empty and optional runs. Neither is a silent return any more.
    */
    if (!input.trim() && !inputOptional && mode !== "pulse") {
      setNeedsInput(true);
      fieldRef.current?.focus();
      return;
    }
    setNeedsInput(false);
    setLoading(true); setOut("");
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, input }) });
      const j = await r.json();
      setOut(j.text || "No response.");
    } catch { setOut("Network error reaching the AI."); }
    finally { setLoading(false); }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setLoading(true);
    try {
      let text = "";
      if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) text = await extractPdf(f);
      else text = await f.text();
      setInput(text.slice(0, 20000));
    } catch { alert("Couldn't read that file automatically — please paste the text instead."); }
    finally { setLoading(false); }
  }

  return (
    <Card className="p-4 space-y-3">
      {allowFile && (
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".txt,.md,.csv,.json,.pdf,text/*,application/pdf" className="hidden" onChange={onFile} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Upload PDF / text</Button>
          <span className="text-xs text-muted-foreground">PDF text is auto-extracted, or paste below</span>
        </div>
      )}
      {multiline ? (
        <textarea ref={fieldRef as React.RefObject<HTMLTextAreaElement>}
          value={input} onChange={(e) => { setInput(e.target.value); if (needsInput) setNeedsInput(false); }} placeholder={placeholder}
          aria-invalid={needsInput || undefined} rows={5}
          aria-label={ariaLabel || placeholder}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y" />
      ) : (
        <input ref={fieldRef as React.RefObject<HTMLInputElement>}
          value={input} onChange={(e) => { setInput(e.target.value); if (needsInput) setNeedsInput(false); }} placeholder={placeholder}
          aria-invalid={needsInput || undefined}
          aria-label={ariaLabel || placeholder}
          onKeyDown={(e) => { if (e.key === "Enter") run(); }}
          className="w-full rounded-lg border bg-background px-3 h-11 text-sm outline-none focus:ring-2 focus:ring-ring" />
      )}

      {/*
        REAL BUTTONS. A chip that says "tap one" has to be tappable — with a
        mouse, with a finger, and with the keyboard, which a <span> never was.
      */}
      {Boolean(suggestions?.length) && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Start from one of these — it fills the box above, then edit it:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions!.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => useSuggestion(s)}
                className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <Button onClick={run} disabled={loading}><Sparkles className="h-4 w-4" aria-hidden="true" /> {loading ? "Working…" : cta}</Button>

      {/* The error the silent return never showed. role="alert" so it is
          announced, not just drawn. */}
      {needsInput && (
        <p role="alert" className="text-sm text-danger">
          Add something to work from first — this one needs your input, not just the button.
        </p>
      )}

      {/*
        ANNOUNCED, because this is the product's main interaction and it was
        completely silent.

        The user presses the button, a model call runs for several seconds, and
        markdown is then injected into the panel below. Nothing told a screen
        reader that anything was happening, that it had finished, or that it had
        failed — the only feedback was visual. AIPanel is used on 27 pages, so
        this one region covers most of the app's async surface.

        `aria-busy` marks the pending state; the polite live region announces
        the transition. Polite rather than assertive because the result is not
        an interruption — the user asked for it and is waiting.

        The status line is separate from the output div on purpose: announcing
        the whole rendered markdown would read the entire analysis aloud the
        moment it lands, over whatever the user was doing. They are told it is
        ready and can then read it at their own pace.
      */}
      <p role="status" aria-live="polite" className={loading ? "text-sm text-muted-foreground" : "sr-only"}>
        {loading ? "Cortex is analysing…" : out ? "Analysis ready." : ""}
      </p>

      {out && (
        <div
          aria-busy={loading}
          className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: mdToHtml(out) }}
        />
      )}
      {out && saveMode && (
        <SafeForm action={saveArtifact} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="mode" value={saveMode} />
          <input type="hidden" name="content" value={out} />
          <input name="title" placeholder="Title to save as…" defaultValue={input.slice(0, 60)} className="rounded-lg border bg-background px-3 h-9 text-sm flex-1 min-w-[200px] outline-none focus:ring-2 focus:ring-ring"  aria-label="Title to save as"/>
          <Button type="submit" variant="outline"><Save className="h-4 w-4" /> Save to workspace</Button>
        </SafeForm>
      )}
    </Card>
  );
}

export function AIPulse() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true);
    try { const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "pulse" }) }); const j = await r.json(); setText(j.text || ""); }
    catch { setText("Could not refresh."); } finally { setLoading(false); }
  }
  return (
    <div className="mt-2">
      <button onClick={run} disabled={loading} className="text-sm text-primary font-medium inline-flex items-center gap-1">
        <Sparkles className="h-3.5 w-3.5" /> {loading ? "Analysing…" : "Refresh AI pulse"}
      </button>
      {text && <p className="mt-2 text-sm">{text}</p>}
    </div>
  );
}
