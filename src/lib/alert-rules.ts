/**
 * Threshold rules, and whether they are breached.
 *
 * Pure and dependency-free so it can be unit-tested — the same treatment
 * entitlement.ts gets, and for the same reason: this decides when to interrupt
 * a business owner. Both failure directions are expensive. A rule that does not
 * fire makes the product a liar ("get warned the moment a number crosses your
 * line"). A rule that fires when nothing is wrong trains the owner to ignore
 * the next one, which is worse, because it breaks the alert that matters.
 */

export type RuleOp = "<" | ">";

export type AlertRule = {
  id: string;
  metric_key: string;
  op: RuleOp;
  threshold: number;
  enabled?: boolean;
};

export type MetricValue = {
  metric_key: string;
  label: string;
  value: number;
  unit: string;
};

export type Breach = {
  rule: AlertRule;
  metric: MetricValue;
  title: string;
  body: string;
  severity: "red" | "yellow";
};

/** Format a metric value the way the card shows it. */
export function fmtMetric(value: number, unit: string): string {
  if (unit === "INR") {
    const a = Math.abs(value);
    const s = value < 0 ? "-" : "";
    if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`;
    if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)} L`;
    if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(1)}k`;
    return `${s}₹${Math.round(a)}`;
  }
  const n = Number.isInteger(value) ? String(value) : value.toFixed(1);
  if (!unit || unit === "count" || unit === "score" || unit === "index") return n;
  return `${n}${unit === "%" ? "%" : ` ${unit}`}`;
}

export function isBreached(rule: AlertRule, m: MetricValue | undefined): boolean {
  if (!m) return false;                       // rule watches a KPI we no longer compute
  if (rule.enabled === false) return false;
  if (!Number.isFinite(m.value)) return false;
  if (!Number.isFinite(rule.threshold)) return false;
  return rule.op === "<" ? m.value < rule.threshold : m.value > rule.threshold;
}

/**
 * Evaluate every rule against the current metrics.
 *
 * A rule whose metric is missing is silently skipped rather than treated as
 * zero — "cash runway below 6" must not fire simply because the workspace has
 * not uploaded a bank statement, which would be a false alarm about the
 * scariest number on the dashboard.
 */
export function evaluateRules(rules: AlertRule[], metrics: MetricValue[]): Breach[] {
  const byKey = new Map(metrics.map((m) => [m.metric_key, m]));
  const out: Breach[] = [];

  for (const rule of rules) {
    const m = byKey.get(rule.metric_key);
    if (!isBreached(rule, m) || !m) continue;

    const now = fmtMetric(m.value, m.unit);
    const limit = fmtMetric(rule.threshold, m.unit);
    const direction = rule.op === "<" ? "below" : "above";

    // How far past the line, as a share of the line itself. A KPI 2% past a
    // threshold is a nudge; one 60% past it is an emergency, and the two should
    // not look identical in a list.
    const over = rule.threshold !== 0
      ? Math.abs((m.value - rule.threshold) / rule.threshold)
      : 1;

    out.push({
      rule,
      metric: m,
      severity: over >= 0.25 ? "red" : "yellow",
      title: `${m.label} is ${direction} your limit`,
      body: `${m.label} is now ${now}, ${direction} the ${limit} you set. `
        + (over >= 0.25
          ? `That is ${(over * 100).toFixed(0)}% past the line, so it is unlikely to correct on its own.`
          : `It has only just crossed, so this may still settle back.`),
    });
  }

  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "red" ? -1 : 1));
}
