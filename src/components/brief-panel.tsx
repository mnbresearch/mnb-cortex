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
    ? `Generated at ${generatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}, from your figures as they stood then`
    : "Nothing generated yet today — press the button to build it from your current figures";

  return (
    <Section title="Today's brief" desc={desc}>
      <AIPanel
        inputOptional
        mode="brief"
        placeholder=""
        cta={generatedAt ? "Regenerate today's brief" : "Generate today's brief"}
        saveMode="strategy"
        onResult={(_text, at) => setGeneratedAt(at)}
      />
      {generatedAt && (
        <p className="text-xs text-muted-foreground mt-2">
          A brief reflects the moment it was built. Regenerate it after importing data or recording a payment.
        </p>
      )}
    </Section>
  );
}
