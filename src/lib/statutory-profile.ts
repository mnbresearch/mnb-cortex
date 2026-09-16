/*
  WHOSE CALENDAR IS IT?

  THE PROBLEM THIS SOLVES, IN THE CODEBASE'S OWN WORDS.

  lib/statutory.ts opens by saying Cortex is never told whether a business is
  GST-registered, has employees, or deducts TDS at all — so every deadline is
  phrased conditionally and `appliesIf` carries the condition in words. That
  discipline is right, and it has a cost: the product shows nineteen Indian
  statutory rules to every workspace and asks the owner to work out which four
  are theirs. Every month. For ever.

  For a product whose entire promise is "tell me what is about to go wrong
  before it costs me", that is the wrong trade. Noise is not a neutral
  side-effect of caution — it is the failure mode. An owner who has learned
  that most lines on the compliance page are not theirs has learned to skim it,
  which is exactly when the one that IS theirs goes past.

  Six questions, asked once, turn nineteen rules into the three or four that
  are actually theirs.

  ============================================================================
  THE SAFETY RULES. THIS IS TAX COMPLIANCE, SO HIDING IS DANGEROUS.
  ============================================================================

  If we hide a filing and the owner was wrong about their own circumstances,
  they miss it and pay a penalty we caused. Three rules follow, and they are
  not negotiable:

  1. ABSENCE OF INFORMATION HIDES NOTHING. Every field defaults to "unknown",
     and "unknown" means show — with the conditional wording, exactly as
     today. A workspace that never answers is no worse off than before this
     file existed. Nothing hides on a guess, an inference from their data, or
     an industry default.

  2. EXCLUDED IS NOT "DOES NOT APPLY". We never assert that a rule is
     inapplicable. We say: hidden because YOU told us X. The claim stays
     attributed to the owner, is quoted back in their own words, and the
     answer is one click from being changed.

  3. EXCLUDED IS RECOVERABLE, NEVER DELETED. The caller always keeps the
     ability to list what was excluded and why. A filter that silently
     shortens a list is indistinguishable from a bug.

  Pure and dependency-free so scripts/test-statutory-profile.mjs can execute
  it. A wrong branch here makes someone miss a statutory filing, which is the
  most expensive kind of wrong this product can be.
*/

/** How the workspace files GST, if at all. */
export type GstCadence = "none" | "monthly" | "qrmp" | "unknown";

/** Self-declared yes/no, with "I'm not sure" as a first-class answer. */
export type YesNoUnknown = "yes" | "no" | "unknown";

export type StatutoryProfile = {
  /** Not registered, monthly filer, or QRMP (quarterly return, monthly tax). */
  gst: GstCadence;
  /** Employees covered by EPF or ESI. */
  employees: YesNoUnknown;
  /** Deducts TDS on payments it makes. */
  tds: YesNoUnknown;
  /** A company registered with the MCA (so ROC filings apply). */
  company: YesNoUnknown;
  /** Turnover crosses the section 44AB tax-audit threshold. */
  audit: YesNoUnknown;
  /** Required to deduct or collect tax UNDER GST — GSTR-7 / GSTR-8. */
  gstTds: YesNoUnknown;
};

/**
 * What a workspace that has told us nothing looks like.
 *
 * Every field "unknown" — which by rule 1 above means every deadline shows.
 * This is also what a malformed or partial stored profile decays to, field by
 * field, so a bad value can never turn into a hidden filing.
 */
export const UNKNOWN_PROFILE: StatutoryProfile = {
  gst: "unknown",
  employees: "unknown",
  tds: "unknown",
  company: "unknown",
  audit: "unknown",
  gstTds: "unknown",
};

/** Has the owner actually answered anything? */
export function profileIsSet(p: StatutoryProfile): boolean {
  return (Object.values(p) as string[]).some((v) => v !== "unknown");
}

export type Applicability = "applies" | "excluded" | "unknown";

/*
  WHICH RULE IS GATED BY WHICH ANSWER.

  Keyed by the rule ids in lib/statutory.ts. A rule absent from this map is
  never excluded by anything — which is the safe default, and is why advance
  tax is deliberately missing: "your annual tax liability will exceed ₹10,000"
  is true of very nearly every business with a profit, so gating it would risk
  hiding four real payment dates to remove almost no noise.
*/
type Gate = (p: StatutoryProfile) => Applicability;

const gstMonthlyOnly: Gate = (p) =>
  p.gst === "monthly" ? "applies"
    : p.gst === "none" || p.gst === "qrmp" ? "excluded"
      : "unknown";

const gstQrmpOnly: Gate = (p) =>
  p.gst === "qrmp" ? "applies"
    : p.gst === "none" || p.gst === "monthly" ? "excluded"
      : "unknown";

const yesNo = (key: keyof StatutoryProfile): Gate => (p) => {
  const v = p[key];
  return v === "yes" ? "applies" : v === "no" ? "excluded" : "unknown";
};

const GATES: Record<string, Gate> = {
  /* ---- GST ------------------------------------------------------------- */
  gstr1: gstMonthlyOnly,
  gstr3b: gstMonthlyOnly,
  pmt06: gstQrmpOnly,
  /*
    GSTR-6 / IFF is "an ISD, or files under QRMP". A monthly filer who is not
    an ISD does not have it; a QRMP filer does. "none" excludes it. We do not
    ask about ISD separately — it is rare enough that leaving a monthly filer
    at "unknown" here would reintroduce the noise this file exists to remove,
    so the QRMP answer decides it and the wording still carries the ISD
    condition for anyone who is one.
  */
  iff: gstQrmpOnly,
  /* Deducting tax UNDER GST is its own registration, not implied by filing. */
  gstr7: yesNo("gstTds"),

  /* ---- Payroll --------------------------------------------------------- */
  pf: yesNo("employees"),

  /* ---- TDS ------------------------------------------------------------- */
  tds: yesNo("tds"),
  "tds-q1": yesNo("tds"),
  "tds-q2": yesNo("tds"),
  "tds-q3": yesNo("tds"),
  "tds-q4": yesNo("tds"),

  /* ---- ROC ------------------------------------------------------------- */
  roc: yesNo("company"),
  mgt7: yesNo("company"),

  /*
    ---- Income tax return: the two are MUTUALLY EXCLUSIVE ----------------

    A business files ITR by the non-audit date OR the audit date, never both,
    and showing both has been the single most confusing pair on the compliance
    page. `audit === "yes"` excludes the non-audit date and vice versa.

    Both stay visible at "unknown", because guessing this one wrong is the
    worst outcome in the file: the two dates are three months apart, so hiding
    the right one means missing the return by a quarter.
  */
  itr: (p) => (p.audit === "no" ? "applies" : p.audit === "yes" ? "excluded" : "unknown"),
  "itr-audit": yesNo("audit"),
  /*
    Same gate as the return it precedes: if they are in audit, both the report
    and the return are theirs. Gated separately rather than folded into
    "itr-audit" so that the 30 Sep date can be warned about on its own — which
    is the entire point of splitting them.
  */
  "tax-audit-report": yesNo("audit"),
};

/** Does this rule apply to this workspace? "unknown" unless they told us. */
export function applicability(ruleId: string, p: StatutoryProfile): Applicability {
  const gate = GATES[ruleId];
  return gate ? gate(p) : "unknown";
}

/**
 * Why a rule was hidden, phrased as the owner's own statement.
 *
 * Returns null when the rule is not excluded. The wording matters: it is
 * always "you told us …", never "this does not apply to you", because the
 * second is a claim about their tax affairs that we are in no position to
 * make. See safety rule 2.
 */
export function excludedBecause(ruleId: string, p: StatutoryProfile): string | null {
  if (applicability(ruleId, p) !== "excluded") return null;
  switch (ruleId) {
    case "gstr1":
    case "gstr3b":
      return p.gst === "none"
        ? "you told us this business is not GST-registered"
        : "you told us you file GST under QRMP, so the monthly returns are not yours";
    case "pmt06":
    case "iff":
      return p.gst === "none"
        ? "you told us this business is not GST-registered"
        : "you told us you file GST monthly, not under QRMP";
    case "gstr7":
      return "you told us you do not deduct or collect tax under GST";
    case "pf":
      return "you told us you have no employees covered by EPF or ESI";
    case "tds":
    case "tds-q1":
    case "tds-q2":
    case "tds-q3":
    case "tds-q4":
      return "you told us you do not deduct TDS";
    case "roc":
    case "mgt7":
      return "you told us this is not a company registered with the MCA";
    case "itr":
      return "you told us your accounts are subject to a 44AB audit, so the later ITR date applies instead";
    case "itr-audit":
    case "tax-audit-report":
      return "you told us your accounts are not subject to a 44AB audit";
    default:
      /*
        Unreachable while GATES and this switch agree, and
        scripts/test-statutory-profile.mjs asserts they do — in both
        directions, so a new gate without a reason cannot ship. Returning a
        generic string rather than null keeps the caller's contract ("excluded
        implies a reason") true even if that assertion is ever removed.
      */
      return "you told us this does not apply to your business";
  }
}

/**
 * Parse whatever is stored on the organisation row.
 *
 * Decays field by field rather than wholesale: a row with a good `gst` and a
 * corrupt `tds` keeps the GST filtering and shows every TDS date, which is
 * strictly safer than either trusting the corrupt value or discarding the
 * good one.
 */
export function parseProfile(raw: unknown): StatutoryProfile {
  const out: StatutoryProfile = { ...UNKNOWN_PROFILE };
  if (!raw || typeof raw !== "object") return out;
  const o = raw as Record<string, unknown>;
  const yn = (v: unknown): YesNoUnknown => (v === "yes" || v === "no" ? v : "unknown");
  const cad = (v: unknown): GstCadence =>
    v === "none" || v === "monthly" || v === "qrmp" ? v : "unknown";
  out.gst = cad(o.gst);
  out.employees = yn(o.employees);
  out.tds = yn(o.tds);
  out.company = yn(o.company);
  out.audit = yn(o.audit);
  out.gstTds = yn(o.gstTds);
  return out;
}

/** The questions, in the order they should be asked. One screen, six answers. */
export const PROFILE_QUESTIONS: Array<{
  key: keyof StatutoryProfile;
  question: string;
  help: string;
  options: Array<{ value: string; label: string }>;
}> = [
  {
    key: "gst",
    question: "How do you file GST?",
    help: "QRMP means you file returns quarterly but pay tax monthly. If you are not sure which you are on, leave it — nothing will be hidden.",
    options: [
      { value: "monthly", label: "Monthly (GSTR-1 and GSTR-3B every month)" },
      { value: "qrmp", label: "QRMP (quarterly returns, monthly payment)" },
      { value: "none", label: "Not GST-registered" },
      { value: "unknown", label: "I'm not sure" },
    ],
  },
  {
    key: "employees",
    question: "Do you have employees covered by EPF or ESI?",
    help: "This decides whether the 15th-of-the-month PF and ESI deadline is yours.",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No employees on EPF or ESI" },
      { value: "unknown", label: "I'm not sure" },
    ],
  },
  {
    key: "tds",
    question: "Do you deduct TDS on payments you make?",
    help: "Rent, contractors, professional fees, commission. This decides the monthly deposit and the four quarterly returns.",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "unknown", label: "I'm not sure" },
    ],
  },
  {
    key: "company",
    question: "Is this a company registered with the MCA?",
    help: "Private limited, LLP or public company — as opposed to a proprietorship or partnership firm. This decides the AOC-4 and MGT-7 ROC filings.",
    options: [
      { value: "yes", label: "Yes — Pvt Ltd, LLP or Ltd" },
      { value: "no", label: "No — proprietorship or partnership" },
      { value: "unknown", label: "I'm not sure" },
    ],
  },
  {
    key: "audit",
    question: "Are your accounts subject to a tax audit under section 44AB?",
    help: "Your CA will know. It decides whether your income tax return is due on 31 July or 31 October — three months apart, so both dates stay visible until you tell us.",
    options: [
      { value: "yes", label: "Yes — audited" },
      { value: "no", label: "No — not audited" },
      { value: "unknown", label: "I'm not sure" },
    ],
  },
  {
    key: "gstTds",
    question: "Are you required to deduct or collect tax under GST?",
    help: "GSTR-7 and GSTR-8. This is uncommon — mostly government bodies and e-commerce operators.",
    options: [
      { value: "no", label: "No" },
      { value: "yes", label: "Yes" },
      { value: "unknown", label: "I'm not sure" },
    ],
  },
];
