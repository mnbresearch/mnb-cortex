/*
  THE STATUTORY PROFILE: WHAT MAY BE HIDDEN, AND WHAT MAY NEVER BE.

  This suite exists because a wrong branch in lib/statutory-profile.ts makes
  somebody miss a tax filing. It is not testing formatting; it is testing the
  three safety rules that file opens with, the way a compliance auditor would:
  by asserting the DANGEROUS direction, not the convenient one.

    rule 1 — absence of information hides nothing. UNKNOWN_PROFILE must produce
             hidden === [] for every rule in the catalogue, and every partially
             answered profile must hide only what its OWN answer covers.
    rule 2 — excluded is never "does not apply". Every reason string is
             attributed to the owner, and no reason may assert a fact.
    rule 3 — excluded is recoverable. splitByProfile must conserve: every
             input deadline appears in exactly one of the two halves.

  Plus the structural invariants that let a reviewer trust the gate map at a
  glance: every gated id exists in the catalogue, every gated id has a reason,
  every reason belongs to a gated id, and the two ITR dates can never both be
  hidden or both be shown once the audit question is answered.

  Run: node scripts/test-statutory-profile.mjs
*/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const failures = [];
function t(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; failures.push(`${name}: ${e.message}`); }
}

const {
  UNKNOWN_PROFILE, applicability, excludedBecause, parseProfile,
  profileIsSet, PROFILE_QUESTIONS,
} = await import("../src/lib/statutory-profile.ts");
const { STATUTORY_CATALOGUE, splitByProfile, upcomingDeadlines } =
  await import("../src/lib/statutory.ts");

const ALL_IDS = STATUTORY_CATALOGUE.map((r) => r.id);
const P = (over = {}) => ({ ...UNKNOWN_PROFILE, ...over });

/* Deadlines for every rule, so splitByProfile is exercised over the whole
   catalogue rather than only over whatever falls in the next ten days. */
const everyDeadline = STATUTORY_CATALOGUE.map((r) => ({
  id: r.id, name: r.name, what: r.what, appliesIf: r.appliesIf,
  severity: r.severity, due: new Date("2026-10-20T00:00:00Z"), daysAway: 5,
}));

/* ========================================================================
   RULE 1 — ABSENCE OF INFORMATION HIDES NOTHING
   ======================================================================== */

t("R1.1 unknown profile: no rule is excluded", () => {
  for (const id of ALL_IDS) {
    assert.notEqual(applicability(id, UNKNOWN_PROFILE), "excluded", `${id} was excluded`);
  }
});

t("R1.2 unknown profile: splitByProfile hides nothing at all", () => {
  const { shown, hidden } = splitByProfile(everyDeadline, UNKNOWN_PROFILE);
  assert.equal(hidden.length, 0);
  assert.equal(shown.length, everyDeadline.length);
});

t("R1.3 unknown profile is not 'set'", () => {
  assert.equal(profileIsSet(UNKNOWN_PROFILE), false);
});

t("R1.4 one answer makes it set", () => {
  for (const q of PROFILE_QUESTIONS) {
    const v = q.options.find((o) => o.value !== "unknown").value;
    assert.equal(profileIsSet(P({ [q.key]: v })), true, `${q.key} did not set`);
  }
});

t("R1.5 an answer of 'unknown' is identical to no answer", () => {
  const explicit = { gst: "unknown", employees: "unknown", tds: "unknown", company: "unknown", audit: "unknown", gstTds: "unknown" };
  assert.equal(profileIsSet(explicit), false);
  assert.equal(splitByProfile(everyDeadline, explicit).hidden.length, 0);
});

t("R1.6 answering ONE question hides only that question's rules", () => {
  /*
    The blast-radius test. If gates leak across questions, a single answer
    could silently remove an unrelated filing — the exact failure that would
    cost a customer a penalty. Each answer's hidden set must be a subset of
    the ids that answer is allowed to touch.
  */
  const allowed = {
    gst: ["gstr1", "gstr3b", "pmt06", "iff"],
    employees: ["pf"],
    tds: ["tds", "tds-q1", "tds-q2", "tds-q3", "tds-q4"],
    company: ["roc", "mgt7"],
    audit: ["itr", "itr-audit"],
    gstTds: ["gstr7"],
  };
  for (const q of PROFILE_QUESTIONS) {
    for (const o of q.options) {
      if (o.value === "unknown") continue;
      const { hidden } = splitByProfile(everyDeadline, P({ [q.key]: o.value }));
      for (const h of hidden) {
        assert.ok(
          allowed[q.key].includes(h.id),
          `${q.key}=${o.value} hid ${h.id}, which it has no business touching`,
        );
      }
    }
  }
});

t("R1.7 advance tax is never hidden by any single answer", () => {
  /*
    Deliberately ungated, and the file says why: nearly every profitable
    business owes it, so gating would hide four real payment dates to remove
    almost no noise. Asserted here so a future edit cannot quietly gate it.
  */
  const adv = ["adv-q1", "adv-q2", "adv-q3", "adv-q4"];
  for (const q of PROFILE_QUESTIONS) {
    for (const o of q.options) {
      for (const id of adv) {
        assert.notEqual(
          applicability(id, P({ [q.key]: o.value })), "excluded",
          `${id} hidden by ${q.key}=${o.value}`,
        );
      }
    }
  }
});

t("R1.8 advance tax is not hidden by a FULLY answered profile either", () => {
  const full = { gst: "none", employees: "no", tds: "no", company: "no", audit: "no", gstTds: "no" };
  for (const id of ["adv-q1", "adv-q2", "adv-q3", "adv-q4"]) {
    assert.notEqual(applicability(id, full), "excluded", id);
  }
});

/* ========================================================================
   RULE 2 — EXCLUDED IS NEVER "DOES NOT APPLY"
   ======================================================================== */

t("R2.1 every exclusion carries a reason", () => {
  for (const q of PROFILE_QUESTIONS) {
    for (const o of q.options) {
      const p = P({ [q.key]: o.value });
      for (const id of ALL_IDS) {
        if (applicability(id, p) !== "excluded") continue;
        const why = excludedBecause(id, p);
        assert.ok(why && why.length > 10, `${id} excluded with no reason under ${q.key}=${o.value}`);
      }
    }
  }
});

t("R2.2 every reason is attributed to the owner", () => {
  for (const q of PROFILE_QUESTIONS) {
    for (const o of q.options) {
      const p = P({ [q.key]: o.value });
      for (const id of ALL_IDS) {
        if (applicability(id, p) !== "excluded") continue;
        const why = excludedBecause(id, p);
        assert.ok(
          why.startsWith("you told us"),
          `${id}: reason is not attributed to the owner — "${why}"`,
        );
      }
    }
  }
});

t("R2.3 no reason asserts a fact about their tax affairs", () => {
  /*
    Safety rule 2 in prose form. "This does not apply to you" is a claim about
    somebody's tax position; "you told us X" is a record of what they said.
    Banned phrasings are checked as substrings of the whole reason, after the
    attributed prefix, so a reason cannot smuggle an assertion into its tail.
  */
  const banned = ["does not apply to you", "is not applicable", "you are not required", "you do not need to file"];
  const seen = new Set();
  for (const q of PROFILE_QUESTIONS) {
    for (const o of q.options) {
      const p = P({ [q.key]: o.value });
      for (const id of ALL_IDS) {
        const why = excludedBecause(id, p);
        if (why) seen.add(why);
      }
    }
  }
  assert.ok(seen.size >= 8, `only ${seen.size} distinct reasons exercised`);
  for (const why of seen) {
    for (const b of banned) {
      assert.ok(!why.toLowerCase().includes(b), `reason asserts a fact: "${why}"`);
    }
  }
});

t("R2.4 no reason is returned when the rule is not excluded", () => {
  for (const q of PROFILE_QUESTIONS) {
    for (const o of q.options) {
      const p = P({ [q.key]: o.value });
      for (const id of ALL_IDS) {
        if (applicability(id, p) === "excluded") continue;
        assert.equal(excludedBecause(id, p), null, `${id} gave a reason but is shown`);
      }
    }
  }
});

t("R2.5 the GST reason distinguishes 'not registered' from 'wrong cadence'", () => {
  const notReg = excludedBecause("gstr1", P({ gst: "none" }));
  const qrmp = excludedBecause("gstr1", P({ gst: "qrmp" }));
  assert.ok(notReg.includes("not GST-registered"), notReg);
  assert.ok(qrmp.includes("QRMP"), qrmp);
  assert.notEqual(notReg, qrmp);
  const p6none = excludedBecause("pmt06", P({ gst: "none" }));
  const p6month = excludedBecause("pmt06", P({ gst: "monthly" }));
  assert.ok(p6none.includes("not GST-registered"), p6none);
  assert.ok(p6month.includes("monthly"), p6month);
});

/* ========================================================================
   RULE 3 — EXCLUDED IS RECOVERABLE, NEVER DELETED
   ======================================================================== */

t("R3.1 splitByProfile conserves every deadline", () => {
  for (const q of PROFILE_QUESTIONS) {
    for (const o of q.options) {
      const p = P({ [q.key]: o.value });
      const { shown, hidden } = splitByProfile(everyDeadline, p);
      assert.equal(
        shown.length + hidden.length, everyDeadline.length,
        `lost a deadline at ${q.key}=${o.value}`,
      );
      const ids = [...shown, ...hidden].map((d) => d.id).sort();
      assert.deepEqual(ids, everyDeadline.map((d) => d.id).sort());
    }
  }
});

t("R3.2 nothing appears in both halves", () => {
  const full = { gst: "qrmp", employees: "no", tds: "no", company: "no", audit: "yes", gstTds: "no" };
  const { shown, hidden } = splitByProfile(everyDeadline, full);
  const s = new Set(shown.map((d) => d.id));
  for (const h of hidden) assert.ok(!s.has(h.id), `${h.id} in both halves`);
});

t("R3.3 hidden entries keep their date and their name", () => {
  const { hidden } = splitByProfile(everyDeadline, P({ tds: "no" }));
  assert.ok(hidden.length >= 5, `expected the TDS deposit plus four returns, got ${hidden.length}`);
  for (const h of hidden) {
    assert.ok(h.due instanceof Date, `${h.id} lost its date`);
    assert.ok(h.name && h.what && h.appliesIf, `${h.id} lost its wording`);
    assert.equal(typeof h.daysAway, "number");
    assert.ok(h.hiddenBecause.startsWith("you told us"), h.hiddenBecause);
  }
});

t("R3.4 the '-next' suffix is gated the same as the bare id", () => {
  /*
    upcomingDeadlines() suffixes the second occurrence of a monthly rule
    inside the window. If the gate map were consulted with the suffixed id it
    would return "unknown" and the rule would reappear — showing next month's
    TDS deposit to somebody who told us they deduct no TDS.
  */
  const p = P({ tds: "no" });
  const withNext = [
    { ...everyDeadline.find((d) => d.id === "tds") },
    { ...everyDeadline.find((d) => d.id === "tds"), id: "tds-next" },
  ];
  const { shown, hidden } = splitByProfile(withNext, p);
  assert.equal(shown.length, 0, "the -next occurrence leaked through the gate");
  assert.equal(hidden.length, 2);
  assert.ok(hidden.every((h) => h.hiddenBecause.includes("do not deduct TDS")));
});

t("R3.5 a quarterly TDS return's -next form is also gated", () => {
  const { shown } = splitByProfile(
    [{ ...everyDeadline.find((d) => d.id === "tds-q3"), id: "tds-q3-next" }],
    P({ tds: "no" }),
  );
  assert.equal(shown.length, 0);
});

/* ========================================================================
   THE GST CADENCE MATRIX — the answer that hides the most
   ======================================================================== */

const CADENCE = {
  monthly: { applies: ["gstr1", "gstr3b"], excluded: ["pmt06", "iff"] },
  qrmp: { applies: ["pmt06", "iff"], excluded: ["gstr1", "gstr3b"] },
  none: { applies: [], excluded: ["gstr1", "gstr3b", "pmt06", "iff"] },
};

t("G1 each GST cadence shows its own returns and hides the others", () => {
  for (const [cadence, spec] of Object.entries(CADENCE)) {
    const p = P({ gst: cadence });
    for (const id of spec.applies) {
      assert.equal(applicability(id, p), "applies", `${cadence}: ${id} should apply`);
    }
    for (const id of spec.excluded) {
      assert.equal(applicability(id, p), "excluded", `${cadence}: ${id} should be excluded`);
    }
  }
});

t("G2 'not registered' hides all four GST returns and nothing else GST-ish", () => {
  const { hidden } = splitByProfile(everyDeadline, P({ gst: "none" }));
  assert.deepEqual(hidden.map((h) => h.id).sort(), ["gstr1", "gstr3b", "iff", "pmt06"]);
  /* GSTR-7/8 is a SEPARATE registration. Not being a normal GST filer does
     not settle it, and asserting otherwise could hide a real filing. */
  assert.equal(applicability("gstr7", P({ gst: "none" })), "unknown");
});

t("G3 an unanswered GST question leaves all four at unknown", () => {
  for (const id of ["gstr1", "gstr3b", "pmt06", "iff"]) {
    assert.equal(applicability(id, UNKNOWN_PROFILE), "unknown", id);
  }
});

t("G4 a monthly filer keeps PMT-06 visible if they have not answered", () => {
  /* Guards the difference between "excluded" and "not applies": a rule at
     "unknown" must be SHOWN, not filtered as merely-not-applying. */
  const { shown } = splitByProfile(
    [everyDeadline.find((d) => d.id === "pmt06")], UNKNOWN_PROFILE,
  );
  assert.equal(shown.length, 1);
});

/* ========================================================================
   THE TWO ITR DATES — mutually exclusive, three months apart
   ======================================================================== */

t("I1 audit=yes shows the October date and hides the July one", () => {
  const p = P({ audit: "yes" });
  assert.equal(applicability("itr-audit", p), "applies");
  assert.equal(applicability("itr", p), "excluded");
});

t("I2 audit=no shows the July date and hides the October one", () => {
  const p = P({ audit: "no" });
  assert.equal(applicability("itr", p), "applies");
  assert.equal(applicability("itr-audit", p), "excluded");
});

t("I3 unanswered shows BOTH — the expensive one to guess", () => {
  assert.equal(applicability("itr", UNKNOWN_PROFILE), "unknown");
  assert.equal(applicability("itr-audit", UNKNOWN_PROFILE), "unknown");
  const { hidden } = splitByProfile(
    everyDeadline.filter((d) => d.id.startsWith("itr")), UNKNOWN_PROFILE,
  );
  assert.equal(hidden.length, 0);
});

t("I4 the two ITR dates are never both hidden, under any profile", () => {
  /*
    The worst single outcome in this file: a business with no income tax
    return date at all. Checked across the full cross-product of answers, not
    just the audit question, in case another gate ever touches these ids.
  */
  const vals = {
    gst: ["none", "monthly", "qrmp", "unknown"],
    employees: ["yes", "no", "unknown"],
    tds: ["yes", "no", "unknown"],
    company: ["yes", "no", "unknown"],
    audit: ["yes", "no", "unknown"],
    gstTds: ["yes", "no", "unknown"],
  };
  let checked = 0;
  for (const gst of vals.gst)
    for (const employees of vals.employees)
      for (const tds of vals.tds)
        for (const company of vals.company)
          for (const audit of vals.audit)
            for (const gstTds of vals.gstTds) {
              const p = { gst, employees, tds, company, audit, gstTds };
              const a = applicability("itr", p) === "excluded";
              const b = applicability("itr-audit", p) === "excluded";
              assert.ok(!(a && b), `both ITR dates hidden at ${JSON.stringify(p)}`);
              checked++;
            }
  assert.equal(checked, 4 * 3 * 3 * 3 * 3 * 3);
});

/* ========================================================================
   STRUCTURAL INVARIANTS — the gate map and the reason switch must agree
   ======================================================================== */

t("S1 every gated rule id exists in the catalogue", () => {
  /*
    A typo in a gate key is silent: the gate never fires and the rule shows
    for ever, so the feature appears to work while doing nothing. Read from
    the source because GATES is deliberately not exported.
  */
  const src = readFileSync(new URL("../src/lib/statutory-profile.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("const GATES:"), src.indexOf("/** Does this rule apply"));
  assert.ok(body.length > 200, "could not locate the GATES map");
  const keys = [...body.matchAll(/^\s{2}"?([a-z0-9-]+)"?:\s/gm)].map((m) => m[1]);
  assert.ok(keys.length >= 14, `found only ${keys.length} gate keys`);
  for (const k of keys) {
    assert.ok(ALL_IDS.includes(k), `gate "${k}" matches no rule in the catalogue`);
  }
});

t("S2 every gated rule can produce a reason", () => {
  /* For each rule, find SOME profile that excludes it, and demand a reason.
     This is what stops a new gate shipping with no explanation. */
  const vals = ["yes", "no", "none", "monthly", "qrmp"];
  for (const id of ALL_IDS) {
    let excludable = false;
    for (const q of PROFILE_QUESTIONS) {
      for (const v of vals) {
        const p = P({ [q.key]: v });
        if (applicability(id, p) === "excluded") {
          excludable = true;
          const why = excludedBecause(id, p);
          assert.ok(why && why.startsWith("you told us"), `${id}: "${why}"`);
          assert.ok(
            !why.includes("this does not apply to your business"),
            `${id} fell through to the generic default reason — add a case for it`,
          );
        }
      }
    }
    /* Ungated rules are fine; we only require that gated ones explain. */
    if (!excludable) assert.ok(id.startsWith("adv-"), `${id} is gated nowhere and is not advance tax`);
  }
});

t("S3 every question key is a real profile field", () => {
  for (const q of PROFILE_QUESTIONS) {
    assert.ok(q.key in UNKNOWN_PROFILE, `question key "${q.key}" is not a profile field`);
  }
  assert.equal(PROFILE_QUESTIONS.length, Object.keys(UNKNOWN_PROFILE).length);
});

t("S4 every question offers 'I'm not sure', and its value is 'unknown'", () => {
  for (const q of PROFILE_QUESTIONS) {
    const u = q.options.filter((o) => o.value === "unknown");
    assert.equal(u.length, 1, `${q.key} has ${u.length} unknown options`);
    assert.ok(/not sure/i.test(u[0].label), `${q.key}: "${u[0].label}"`);
  }
});

t("S5 every option value parses back to itself", () => {
  /*
    The form posts option values straight into parseProfile. If an option
    value is not a value parseProfile recognises, the answer decays to
    "unknown" and the owner's save appears to do nothing.
  */
  for (const q of PROFILE_QUESTIONS) {
    for (const o of q.options) {
      const parsed = parseProfile({ [q.key]: o.value });
      assert.equal(parsed[q.key], o.value, `${q.key}="${o.value}" parsed to "${parsed[q.key]}"`);
    }
  }
});

t("S6 every question has help text that is not the question again", () => {
  for (const q of PROFILE_QUESTIONS) {
    assert.ok(q.help && q.help.length > 20, `${q.key} has no help`);
    assert.notEqual(q.help, q.question);
  }
});

/* ========================================================================
   parseProfile — a corrupt column must never hide a filing
   ======================================================================== */

t("P1 null, undefined and non-objects decay to all-unknown", () => {
  for (const raw of [null, undefined, 0, "", "gst", [], true, NaN]) {
    assert.deepEqual(parseProfile(raw), UNKNOWN_PROFILE, `${JSON.stringify(raw)}`);
  }
});

t("P2 an empty object is all-unknown", () => {
  assert.deepEqual(parseProfile({}), UNKNOWN_PROFILE);
});

t("P3 unrecognised values decay to unknown, not to a hiding answer", () => {
  const p = parseProfile({ gst: "MONTHLY", employees: "true", tds: 1, company: "y", audit: {}, gstTds: [] });
  assert.deepEqual(p, UNKNOWN_PROFILE);
  assert.equal(splitByProfile(everyDeadline, p).hidden.length, 0);
});

t("P4 decay is field by field: a good answer survives a corrupt neighbour", () => {
  const p = parseProfile({ gst: "qrmp", tds: "maybe" });
  assert.equal(p.gst, "qrmp");
  assert.equal(p.tds, "unknown");
  assert.equal(applicability("gstr1", p), "excluded");
  assert.equal(applicability("tds", p), "unknown");
});

t("P5 extra keys are ignored, not merged", () => {
  const p = parseProfile({ gst: "monthly", isd: "yes", turnover: 5e7 });
  assert.deepEqual(Object.keys(p).sort(), Object.keys(UNKNOWN_PROFILE).sort());
});

t("P6 'yes'/'no' are not accepted for the cadence field", () => {
  assert.equal(parseProfile({ gst: "yes" }).gst, "unknown");
  assert.equal(parseProfile({ gst: "no" }).gst, "unknown");
});

t("P7 the cadence values are not accepted for yes/no fields", () => {
  for (const k of ["employees", "tds", "company", "audit", "gstTds"]) {
    assert.equal(parseProfile({ [k]: "qrmp" })[k], "unknown", k);
    assert.equal(parseProfile({ [k]: "monthly" })[k], "unknown", k);
  }
});

t("P8 parseProfile never mutates UNKNOWN_PROFILE", () => {
  const p = parseProfile({ gst: "monthly", tds: "yes" });
  p.gst = "none";
  assert.equal(UNKNOWN_PROFILE.gst, "unknown");
  assert.equal(UNKNOWN_PROFILE.tds, "unknown");
});

/* ========================================================================
   A FULLY ANSWERED, REALISTIC WORKSPACE — the whole point of the feature
   ======================================================================== */

t("W1 a QRMP proprietorship with two staff sees a short, correct list", () => {
  const p = { gst: "qrmp", employees: "yes", tds: "yes", company: "no", audit: "no", gstTds: "no" };
  const { shown, hidden } = splitByProfile(everyDeadline, p);
  const s = shown.map((d) => d.id).sort();
  const h = hidden.map((d) => d.id).sort();
  /* Hidden: monthly GST returns, GST TDS, both ROC filings, the audit ITR. */
  assert.deepEqual(h, ["gstr1", "gstr3b", "gstr7", "itr-audit", "mgt7", "roc"]);
  /* Shown: their quarterly GST, PF, all five TDS obligations, advance tax, ITR. */
  for (const id of ["pmt06", "iff", "pf", "tds", "tds-q1", "tds-q4", "itr", "adv-q1"]) {
    assert.ok(s.includes(id), `${id} should be shown`);
  }
  assert.equal(s.length + h.length, ALL_IDS.length);
  assert.ok(h.length >= 6 && s.length >= 12, `${s.length} shown / ${h.length} hidden`);
});

t("W2 a monthly Pvt Ltd under audit sees the other half", () => {
  const p = { gst: "monthly", employees: "yes", tds: "yes", company: "yes", audit: "yes", gstTds: "no" };
  const { shown, hidden } = splitByProfile(everyDeadline, p);
  const h = hidden.map((d) => d.id).sort();
  assert.deepEqual(h, ["gstr7", "iff", "itr", "pmt06"]);
  const s = shown.map((d) => d.id);
  for (const id of ["gstr1", "gstr3b", "roc", "mgt7", "itr-audit", "pf"]) {
    assert.ok(s.includes(id), `${id} should be shown`);
  }
});

t("W3 a not-registered, no-staff proprietorship still sees income tax", () => {
  /*
    The smallest possible business, and the case where over-eager filtering
    would leave the compliance page empty and the product looking broken —
    or worse, leave a real ITR and four advance-tax dates unmentioned.
  */
  const p = { gst: "none", employees: "no", tds: "no", company: "no", audit: "no", gstTds: "no" };
  const { shown } = splitByProfile(everyDeadline, p);
  const s = shown.map((d) => d.id).sort();
  assert.deepEqual(s, ["adv-q1", "adv-q2", "adv-q3", "adv-q4", "itr"]);
  assert.ok(shown.length > 0, "a real business was left with an empty calendar");
});

t("W4 no profile can empty the calendar entirely", () => {
  const vals = {
    gst: ["none", "monthly", "qrmp", "unknown"],
    employees: ["yes", "no", "unknown"],
    tds: ["yes", "no", "unknown"],
    company: ["yes", "no", "unknown"],
    audit: ["yes", "no", "unknown"],
    gstTds: ["yes", "no", "unknown"],
  };
  for (const gst of vals.gst)
    for (const employees of vals.employees)
      for (const tds of vals.tds)
        for (const company of vals.company)
          for (const audit of vals.audit)
            for (const gstTds of vals.gstTds) {
              const p = { gst, employees, tds, company, audit, gstTds };
              const { shown } = splitByProfile(everyDeadline, p);
              assert.ok(shown.length >= 5, `only ${shown.length} shown at ${JSON.stringify(p)}`);
            }
});

/* ========================================================================
   THE REAL WINDOW — splitByProfile over actual upcomingDeadlines() output
   ======================================================================== */

t("U1 a real 14-day window is conserved and never all-hidden", () => {
  const all = upcomingDeadlines(14, new Date("2026-01-08T12:00:00Z"));
  assert.ok(all.length > 0, "the fixture window is empty; pick another date");
  const p = { gst: "none", employees: "no", tds: "no", company: "no", audit: "no", gstTds: "no" };
  const { shown, hidden } = splitByProfile(all, p);
  assert.equal(shown.length + hidden.length, all.length);
  for (const h of hidden) assert.ok(h.hiddenBecause.startsWith("you told us"), h.id);
});

t("U2 the unanswered window is byte-identical to the unfiltered one", () => {
  /*
    The safety property the /compliance and /gst pages rely on: until somebody
    answers, these pages must behave exactly as they did before this feature
    existed. Compared by identity, not by value, so a copy that drops a field
    would still fail.
  */
  const all = upcomingDeadlines(10, new Date("2026-09-14T12:00:00Z"));
  const { shown, hidden } = splitByProfile(all, UNKNOWN_PROFILE);
  assert.equal(hidden.length, 0);
  assert.equal(shown.length, all.length);
  shown.forEach((d, i) => assert.equal(d, all[i], `entry ${i} is not the same object`));
});

/* ========================================================================
   THE CALL SITES — filtering without showing what was filtered is the bug

   The pure module can be perfect and the feature still dangerous: if a page
   consumes only the `shown` half and drops `hidden` on the floor, the
   customer gets a silently shortened compliance list, which is exactly what
   safety rule 3 forbids. These read the real files, with comments stripped,
   so a reason written only in a comment cannot satisfy them.
   ======================================================================== */

const { readCode } = await import("./lib/read-code.mjs");

t("C1 /compliance consumes BOTH halves and renders the hidden one", () => {
  const src = readCode(import.meta.url, "../src/app/(app)/compliance/page.tsx",
    ["splitByProfile", "hidden.map"]);
  assert.ok(/shown:\s*soon,\s*hidden/.test(src), "does not destructure both halves");
  assert.ok(src.includes("hidden.map("), "never renders the hidden half");
  assert.ok(src.includes("hiddenBecause"), "renders hidden entries without their reason");
  assert.ok(src.includes("hidden.length"), "does not gate or count the hidden section");
});

t("C2 /gst narrows the grid but still renders what it hid", () => {
  const src = readCode(import.meta.url, "../src/app/(app)/gst/page.tsx",
    ["applicability", "hidden.map"]);
  assert.ok(src.includes("live.map("), "the visible grid is not the narrowed list");
  assert.ok(src.includes("hidden.map("), "never renders the hidden half");
  assert.ok(src.includes("excludedBecause"), "hides rules without carrying the reason");
  assert.ok(src.includes("getStatutoryProfile"), "does not read the profile at all");
});

t("C3 the AI context filters the deadline list", () => {
  const src = readCode(import.meta.url, "../src/lib/data.ts", ["splitByProfile"]);
  assert.ok(src.includes("splitByProfile("), "the model still sees every rule");
  assert.ok(src.includes("getStatutoryProfile()"), "does not read the profile");
});

t("C4 the AI context keeps the 'if' caveat after narrowing", () => {
  /*
    Narrowing the list is a convenience; asserting applicability is a
    liability. Six answers do not settle nineteen rules — advance tax is
    ungated by design — so the instruction that stops the model telling
    somebody they MUST file something has to survive this feature.
  */
  const src = readCode(import.meta.url, "../src/lib/data.ts", ["STATUTORY DEADLINES COMING UP"]);
  const i = src.indexOf("STATUTORY DEADLINES COMING UP");
  const block = src.slice(i, i + 700);
  assert.ok(/keep the .if. condition/.test(block), "dropped the conditional instruction");
  assert.ok(/never state that they have missed or must file/.test(block),
    "dropped the prohibition on asserting an obligation");
});

t("C5 the profile is given to the model as the owner's claim, not as fact", () => {
  const src = readCode(import.meta.url, "../src/lib/data.ts", ["WHAT THE OWNER TOLD US"]);
  const i = src.indexOf("WHAT THE OWNER TOLD US");
  const block = src.slice(i, i + 500);
  assert.ok(/their own answers/.test(block), "presents self-declared answers as verified");
  assert.ok(/not verified facts|may be out of date/.test(block), "no caveat on the answers");
});

t("C6 the public /deadlines pages are NOT narrowed", () => {
  /*
    Deliberate. Those pages are a public reference with no workspace behind
    them — narrowing them would be both impossible and wrong, since a visitor
    searching "GSTR-3B due date" wants the rule, not somebody's profile.
    Asserted so a future "apply the filter everywhere" pass has to think.
  */
  for (const rel of ["../src/app/deadlines/page.tsx"]) {
    const src = readCode(import.meta.url, rel, ["STATUTORY_CATALOGUE"]);
    assert.ok(!src.includes("splitByProfile"), `${rel} narrows a public page`);
    assert.ok(!src.includes("getStatutoryProfile"), `${rel} reads a workspace profile`);
  }
});

t("C7 the save action validates against the question options", () => {
  /*
    The form posts free-form strings. If the action wrote them through
    unchecked, a crafted value could land in the column and — depending on
    the gate — hide a filing for a value no question ever offered.
  */
  const src = readCode(import.meta.url, "../src/lib/actions.ts", ["updateStatutoryProfile"]);
  const i = src.indexOf("export async function updateStatutoryProfile");
  assert.ok(i > 0, "the action does not exist");
  const body = src.slice(i, i + 1400);
  assert.ok(body.includes("PROFILE_QUESTIONS"), "does not iterate the known questions");
  assert.ok(/options\.some/.test(body), "does not check the value against the options");
  assert.ok(body.includes('"unknown"'), "an unrecognised value does not fall back to unknown");
  assert.ok(body.includes("parseProfile"), "does not parse before writing");
  assert.ok(/\.select\(/.test(body), "does not read the row back — a zero-row update would look like a save");
  assert.ok(/requireRole\("manager"\)/.test(body), "not rank-gated");
});

/* ========================================================================
   THE MIGRATION'S CHECK CONSTRAINT — operator precedence, in SQL

   I wrote this constraint wrong the first time. Each field is an
   "absent OR valid" pair, and the pairs are ANDed; SQL binds AND tighter than
   OR, so a single unbracketed pair turns the whole constraint into
   "first_field_absent OR (everything else)" — satisfied by the first field
   simply being missing, which is the common case. The constraint would have
   looked fine and enforced almost nothing.

   Parsing SQL properly is out of scope here, so this checks the property that
   was actually violated: every `is null or … in (…)` pair is wrapped, and the
   joins between pairs are `and`.
   ======================================================================== */

const MIGRATION = "../supabase/migrations/2026_zzzf_statutory_profile.sql";

t("Q1 the migration adds the column idempotently", () => {
  const sql = readFileSync(new URL(MIGRATION, import.meta.url), "utf8");
  assert.ok(/add column if not exists statutory_profile jsonb/i.test(sql), "not idempotent");
  assert.ok(/default '\{\}'::jsonb/i.test(sql), "does not default to an empty object");
  assert.ok(/not null/i.test(sql), "nullable column — reads would need a second empty case");
});

t("Q2 every field clause in the CHECK is parenthesised", () => {
  const sql = readFileSync(new URL(MIGRATION, import.meta.url), "utf8");
  const i = sql.indexOf("organizations_statutory_profile_shape check");
  assert.ok(i > 0, "could not find the constraint");
  const body = sql.slice(i, sql.indexOf("end $$", i));
  const pairs = [...body.matchAll(/->>'(\w+)'\)\s+is null or/g)].map((m) => m[1]);
  assert.equal(pairs.length, Object.keys(UNKNOWN_PROFILE).length,
    `found ${pairs.length} field clauses for ${Object.keys(UNKNOWN_PROFILE).length} fields`);
  for (const f of pairs) {
    /*
      The bracket must open BEFORE the field's own reference, not after the
      "is null or". Matched as: "((…->>'field') is null or (…->>'field') in (…))"
      — the outer paren is what AND/OR precedence needs.
    */
    const re = new RegExp(
      `\\(\\(statutory_profile->>'${f}'\\)\\s+is null or \\(statutory_profile->>'${f}'\\)\\s+in \\([^)]*\\)\\)`,
    );
    assert.ok(re.test(body), `the "${f}" clause is not wrapped in its own parentheses`);
  }
});

t("Q3 the CHECK joins its clauses with AND, never OR", () => {
  const sql = readFileSync(new URL(MIGRATION, import.meta.url), "utf8");
  const i = sql.indexOf("organizations_statutory_profile_shape check");
  const body = sql.slice(i, sql.indexOf("end $$", i));
  /* Strip the inner "is null or" — those ORs are correct and expected. */
  const joins = body.replace(/is null or/g, "").match(/\bor\b/g) || [];
  assert.equal(joins.length, 0, `${joins.length} stray OR(s) between field clauses`);
  const ands = body.match(/^\s+and \(\(/gm) || [];
  assert.equal(ands.length, Object.keys(UNKNOWN_PROFILE).length - 1,
    `${ands.length} AND joins for ${Object.keys(UNKNOWN_PROFILE).length} fields`);
});

t("Q4 the CHECK accepts exactly the values the parser accepts", () => {
  /*
    Two independent lists of allowed values — one in SQL, one in
    parseProfile — is how they drift. If SQL is stricter, a legitimate save
    throws at the database; if looser, the column holds values the app treats
    as unknown, which shows every deadline and is baffling to debug.
  */
  const sql = readFileSync(new URL(MIGRATION, import.meta.url), "utf8");
  const i = sql.indexOf("organizations_statutory_profile_shape check");
  const body = sql.slice(i, sql.indexOf("end $$", i));
  for (const f of Object.keys(UNKNOWN_PROFILE)) {
    const m = body.match(new RegExp(`->>'${f}'\\)\\s+in \\(([^)]*)\\)`));
    assert.ok(m, `no value list for ${f}`);
    const sqlVals = m[1].split(",").map((v) => v.trim().replace(/^'|'$/g, "")).sort();
    /* What parseProfile will actually keep, probed rather than assumed. */
    const candidates = ["none", "monthly", "qrmp", "yes", "no", "unknown"];
    const tsVals = candidates.filter((v) => parseProfile({ [f]: v })[f] === v).sort();
    assert.deepEqual(sqlVals, tsVals,
      `${f}: SQL allows [${sqlVals}] but parseProfile keeps [${tsVals}]`);
  }
});

t("Q5 the question options are a subset of what the CHECK allows", () => {
  /*
    The form can only ever post option values; the column must accept them.

    Sliced to the constraint body, not matched against the whole file. Written
    the loose way first, this test failed claiming the constraint rejected
    gst="monthly" — because it had matched the ILLUSTRATIVE snippet in the
    migration's own comment, where the value list is an ellipsis. A test that
    reads a comment as if it were the schema is worse than no test, so every
    assertion in this block reads `body`.
  */
  const sql = readFileSync(new URL(MIGRATION, import.meta.url), "utf8");
  const start = sql.indexOf("organizations_statutory_profile_shape check");
  const body = sql.slice(start, sql.indexOf("end $$", start));
  for (const q of PROFILE_QUESTIONS) {
    const m = body.match(new RegExp(`->>'${q.key}'\\)\\s+in \\(([^)]*)\\)`));
    assert.ok(m, `no value list for ${q.key} in the constraint`);
    const allowed = m[1].split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
    for (const o of q.options) {
      assert.ok(allowed.includes(o.value),
        `the form offers ${q.key}="${o.value}" but the constraint rejects it`);
    }
  }
});

/* ======================================================================== */

console.log(`\nstatutory profile: ${pass} passed, ${fail} failed`);
if (fail) { failures.forEach((f) => console.log("  FAIL " + f)); process.exit(1); }
