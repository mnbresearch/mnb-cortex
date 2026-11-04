"use client";
import { useState } from "react";
import { Section } from "@/components/section";
import { AIPanel } from "@/components/ai-panel";

/**
 * The daily brief, with a state that matches reality.
 *
 * WHAT IT REPLACED: a server-rendered section headed
 *
 *     Today's brief · Freshly generated from your live business snapshot
 *
 * printed unconditionally, above an empty panel and a "Generate today's brief"
 * button that had not been pressed. There was no brief. The page asserted that
 * one existed, described it as fresh, and asked the reader to create it, all at
 * once — and it said the same thing on every visit, including the first of the
 * day and every reload after.
 *
 * "Freshly generated" is also a claim about TIME, which a static string can
 * never honour: a brief generated at 6am is not fresh at 6pm. So the state
 * carries the moment it was produced and shows it, rather than asserting a
 * quality it cannot know.
 */
export function BriefPanel() {
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  const desc = generatedAt
    ? `Generated at ${generatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}, from your live operational and financial figures`
    : "Nothing generated yet today — decision-grade morning brief: what moved, who is waiting on you, top P0/P1 priorities, and cash runway";

  return (
    <Section title="Executive Morning Brief" desc={desc}>
      <AIPanel
        inputOptional
        mode="brief"
        placeholder=""
        cta={generatedAt ? "Regenerate Executive Brief" : "Generate Executive Morning Brief"}
        saveMode="strategy"
        onResult={(_text, at) => setGeneratedAt(at)}
      />
      {generatedAt && (
        <p className="text-xs text-muted-foreground mt-2">
          Decision-grade briefing reflects the moment it was produced. Regenerate after updating commitments or recording payments.
        </p>
      )}
    </Section>
  );
}
