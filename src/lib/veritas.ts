/*
  VERITAS v1 — Cortex's checking layer, named.

  Cortex has always checked what a model says against what the workspace's
  data actually contains; the pieces lived in lib/ai/untrusted.ts and were
  used one feature at a time (the bank-statement reader, the insight cleaner).
  Veritas v1 is that same code, given one name and one job on every Agent
  Workspace answer:

    1. GROUNDING  every rupee figure the answer states must appear in what the
                  agents actually read — tool rows, tool summaries, or the
                  findings of an earlier step that were themselves read from
                  tools. A figure that appears nowhere is "unsupported".
    2. ROUNDING   owners write "₹4.2 lakh", tools return 4,19,850. A figure
                  written at a stated precision (lakh, crore, k, one decimal)
                  is supported when a source value rounds to it — and only
                  then. ₹4.2 lakh does NOT ground ₹4,40,000.
    3. INJECTION  the answer itself is scanned for instruction-shaped text
                  (scanForInjection), so a poisoned row cannot ride through an
                  agent into the owner's report unflagged.

  What v1 deliberately does not do, and says so in its result: it does not
  check percentages, ratios or day counts (they are usually derived), and it
  does not judge reasoning. "Not checked" is reported as not checked — never
  as verified.

  Pure: no I/O, no model. scripts/test-agent-workspace.mjs runs it directly.
*/
import { numbersIn, isGrounded, scanForInjection } from "./ai/untrusted";

export { numbersIn, isGrounded, scanForInjection };

export const VERITAS_VERSION = "Veritas v1";

export type FigureCheck = { text: string; value: number; supported: boolean };
export type Verification = {
  engine: typeof VERITAS_VERSION;
  status: "verified" | "partial" | "unverified" | "no_figures";
  checked: number;
  supported: number;
  unsupported: FigureCheck[];
  injection: string[];
  note: string;
};

/* ₹ 4,19,850 · Rs. 4.2 lakh · INR 1.5 crore · ₹42k · 4.2 lakh · 1.5 cr */
const MONEY_RE = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(lakh|lakhs|lac|lacs|l|crore|crores|cr|k|thousand|million|mn|m)?\b|([\d,]+(?:\.\d+)?)\s*(lakh|lakhs|lac|lacs|crore|crores|cr)\b/gi;

const UNIT: Record<string, number> = {
  lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, l: 1e5,
  crore: 1e7, crores: 1e7, cr: 1e7,
  k: 1e3, thousand: 1e3, million: 1e6, mn: 1e6, m: 1e6,
};

/** Every rupee figure written in a text, with the precision it was written at. */
export function moneyFigures(text: string): { text: string; value: number; step: number }[] {
  const out: { text: string; value: number; step: number }[] = [];
  for (const m of String(text || "").matchAll(MONEY_RE)) {
    const digits = (m[1] ?? m[3] ?? "").replace(/,/g, "");
    const unitWord = String(m[2] ?? m[4] ?? "").toLowerCase();
    const n = Number(digits);
    if (!Number.isFinite(n) || !digits) continue;
    const mult = UNIT[unitWord] ?? 1;
    const decimals = digits.includes(".") ? digits.split(".")[1].length : 0;
    /* The smallest unit the writer committed to: "4.2 lakh" is precise to 0.1 lakh. */
    const step = mult === 1 ? (decimals ? Math.pow(10, -decimals) : 1) : mult * Math.pow(10, -decimals);
    out.push({ text: m[0].trim(), value: n * mult, step });
  }
  return out;
}

/** Every number in a pile of evidence: rows, summaries, earlier findings. */
export function evidenceNumbers(evidence: unknown[]): number[] {
  const nums = new Set<number>();
  const walk = (v: unknown, depth = 0) => {
    if (depth > 6 || v === null || v === undefined) return;
    if (typeof v === "number" && Number.isFinite(v)) { nums.add(v); return; }
    if (typeof v === "string") {
      for (const f of moneyFigures(v)) nums.add(f.value);
      for (const n of numbersIn(v)) nums.add(n / 100);
      return;
    }
    if (Array.isArray(v)) { for (const x of v.slice(0, 500)) walk(x, depth + 1); return; }
    if (typeof v === "object") for (const x of Object.values(v as Record<string, unknown>).slice(0, 80)) walk(x, depth + 1);
  };
  for (const e of evidence) walk(e);
  return [...nums];
}

/** Is a written figure supported by any evidence value, at the precision it was written? */
export function figureSupported(value: number, step: number, evidence: number[]): boolean {
  if (value === 0) return true;
  const exact = new Set(evidence.map((n) => Math.round(Math.abs(n) * 100)));
  if (isGrounded(value, exact)) return true;
  if (step <= 1) return false;
  const half = step / 2;
  return evidence.some((n) => Math.abs(Math.abs(n) - value) <= half + 1e-6);
}

export function verifyAnswer(answer: string, evidence: unknown[]): Verification {
  const figures = moneyFigures(answer);
  const pool = evidenceNumbers(evidence);
  const seen = new Set<string>();
  const unsupported: FigureCheck[] = [];
  let supported = 0, checked = 0;
  for (const f of figures) {
    const key = `${f.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    checked++;
    if (figureSupported(f.value, f.step, pool)) supported++;
    else unsupported.push({ text: f.text, value: f.value, supported: false });
  }
  const injection = scanForInjection(answer).hits;
  const status: Verification["status"] = checked === 0 ? "no_figures" : unsupported.length === 0 ? "verified" : supported > 0 ? "partial" : "unverified";
  const note = status === "no_figures"
    ? "No rupee figures to check. Percentages, ratios and day counts are not checked by v1."
    : status === "verified"
      ? `All ${checked} rupee figure(s) trace to your data. Percentages and day counts are not checked by v1.`
      : `${unsupported.length} of ${checked} rupee figure(s) could not be traced to your data: ${unsupported.map((u) => u.text).join(", ")}. Treat them as unconfirmed.`;
  return { engine: VERITAS_VERSION, status, checked, supported, unsupported: unsupported.slice(0, 12), injection, note };
}
