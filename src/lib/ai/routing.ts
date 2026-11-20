/*
  MODEL ROUTING — which AI provider serves a workspace's calls, in what order.

  ONE function decides the order, and both places that need it call it:
    - lib/ai/cortex.ts providerChain()        — who actually answers
    - lib/ai/byo.ts firstServingProvider()    — whether that call is on the
      workspace's own key (credits waived) or ours (metered)
  If those two ever disagreed, a workspace could be billed for its own key, or
  run free on ours. scripts/test-model-router.mjs holds them to this file.

  A provider is skipped when no key exists for it, so every mode degrades to
  whatever is available — a workspace with no keys of its own is served by the
  platform's providers in the mode's order.

  Pure: no imports.
*/

export type RoutingMode = "auto" | "speed" | "frontier";
export const ROUTING_MODES: RoutingMode[] = ["auto", "speed", "frontier"];
export type ProviderId = "gemini" | "groq" | "xai" | "anthropic" | "openai";

export const ROUTING_LABEL: Record<RoutingMode, { name: string; d: string }> = {
  auto: { name: "Balanced (recommended)", d: "Gemini first for quality at low cost, then the next available provider if one is busy or down." },
  speed: { name: "Speed", d: "Groq first, for the fastest answers; Gemini and the rest as fallback." },
  frontier: { name: "Frontier models", d: "Claude, then GPT, first — using your own Anthropic or OpenAI key from AI keys below; falls back to the platform's models if you have none." },
};

const ORDER: Record<RoutingMode, ProviderId[]> = {
  auto: ["gemini", "groq", "xai", "anthropic", "openai"],
  speed: ["groq", "gemini", "xai", "openai", "anthropic"],
  frontier: ["anthropic", "openai", "gemini", "xai", "groq"],
};

export const asRoutingMode = (v: unknown): RoutingMode => (ROUTING_MODES as string[]).includes(String(v)) ? (v as RoutingMode) : "auto";
export const routeOrder = (mode: unknown): ProviderId[] => [...ORDER[asRoutingMode(mode)]];

export const PROVIDER_LABEL: Record<string, string> = { gemini: "Gemini", groq: "Groq", xai: "Grok", anthropic: "Claude", openai: "GPT" };
