/*
  DLP — WHAT LEAVES FOR AN AI VENDOR, EXECUTED.

    1. Each identifier class is tokenised (and ordinary text is not).
    2. Names come from the workspace's records, longest first, case-insensitive,
       never from a stoplist word like "Cash".
    3. strict hides amounts — in prose AND as numbers in tool results — but
       not years, dates, invoice numbers or record ids.
    4. Round trip: restore(redact(x)) === x, and a tool argument the model
       writes with a token reaches the database as the real value (a number
       comes back as a number).
    5. keepAmounts: documents read for their figures keep them on strict.
    6. off changes nothing.
    7. Wiring: every module that sends workspace data to a vendor goes
       through a vault, and the vault is scoped to the right workspace on
       request and cron paths.

  Run: node --experimental-strip-types --no-warnings scripts/test-dlp.mjs
*/
import { readFileSync } from "node:fs";

let pass = 0; const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? `\n      ${d}` : ""}`));
const read = (p) => readFileSync(p, "utf8");

const { Vault, NO_REDACTION } = await import("../src/lib/ai/dlp.ts");
const ENT = [
  { value: "Acme Traders", kind: "CUSTOMER" },
  { value: "Acme Traders Pvt Ltd", kind: "CUSTOMER" },
  { value: "Shree Balaji Steel", kind: "SUPPLIER" },
  { value: "Ravi Kumar", kind: "PERSON" },
  { value: "Cash", kind: "CUSTOMER" },
  { value: "abc", kind: "CUSTOMER" },
  { value: "Sales", kind: "CUSTOMER" },
];

/* 1. identifiers */
{
  const v = new Vault("pii", ENT);
  const cases = [
    ["ravi@acme.in", "EMAIL"], ["+91 98765 43210", "PHONE"], ["09876543210", "PHONE"], ["9876543210", "PHONE"],
    ["27AAPFU0939F1ZV", "GSTIN"], ["AAPFU0939F", "PAN"], ["HDFC0001234", "IFSC"],
    ["2345 6789 0123", "AADHAAR"], ["4111 1111 1111 1111", "CARD"], ["4111-1111-1111-1111", "CARD"],
  ];
  for (const [val, kind] of cases) {
    const r = v.redact(`x ${val}.`);
    check(new RegExp(`\\[${kind}_\\d+\\]`).test(r) && !r.includes(val), `id: ${val} → ${kind}`, r);
  }
  check(/A\/c no: \[ACCOUNT_\d+\]/.test(v.redact("A/c no: 123456789012")), "id: an account number is tokenised when labelled as one");
  check(v.redact("27AAPFU0939F1ZV").includes("[GSTIN_") && !v.redact("27AAPFU0939F1ZV").includes("[PAN_"), "id: a GSTIN is one GSTIN token, not a PAN inside it");
  const nl = v.redact("ref 4111 1111 1111 1112 ok");
  check(/\[ACCOUNT_\d+\]/.test(nl) && !/CARD|AADHAAR/.test(nl), "id: a 16-digit run that fails Luhn is an account/reference number, not a card or Aadhaar", nl);
  check(!/AADHAAR/.test(v.redact("UTR 123456789012345 credited")), "id: a long reference number is not mistaken for an Aadhaar inside it");
  const benign = "Invoice INV-1042 dated 2026-07-01 for 1,20,000 — GST 18% — order #5521, FY 2026-27, 05/07/2026, 10:30";
  check(v.redact(benign) === benign, "id: pii level leaves amounts, dates, invoice and order numbers alone", v.redact(benign));
  const uuid = "11111111-1111-4111-8111-111111111111";
  check(v.redact(`id ${uuid}`) === `id ${uuid}`, "id: a record uuid passes through untouched (tools need it)");
}

/* 2. names */
{
  const v = new Vault("pii", ENT);
  const r = v.redact("Acme Traders Pvt Ltd and ACME TRADERS both owe; Shree Balaji Steel supplies; Ravi Kumar approves. Cash sales were fine. The abc of it.");
  check(!/acme|balaji|ravi/i.test(r), "names: every known name is gone", r);
  check(/\[CUSTOMER_1\] and \[CUSTOMER_2\]/.test(r) || /\[CUSTOMER_\d\] and \[CUSTOMER_\d\]/.test(r), "names: the longer name is matched whole, before its prefix");
  check(/\[SUPPLIER_1\]/.test(r) && /\[PERSON_1\]/.test(r), "names: suppliers and employees are labelled by kind");
  check(/Cash sales/.test(r) && /The abc of it/.test(r), "names: stoplist words and too-short names are not treated as names", r);
  check(v.redact("Acme Tradersville") === "Acme Tradersville", "names: matched on word boundaries only");
  const same = new Vault("pii", ENT); const a = same.redact("Acme Traders"); const b = same.redact("acme traders");
  check(a === b, "names: the same party gets the same token regardless of case");
}

/* 3. strict */
{
  const v = new Vault("strict", ENT);
  const r = v.redact("Acme Traders owes ₹1,20,000 (Rs. 45000, INR 2.5 lakh) since 2026-07-01; INV-1042; FY 2026; 120000 more.");
  check(!/1,20,000|45000|2\.5 lakh|120000/.test(r), "strict: rupee amounts in every written form are hidden", r);
  check(/2026-07-01/.test(r) && /INV-1042/.test(r) && /FY 2026/.test(r), "strict: dates, invoice numbers and years stay", r);
  const deep = v.redactDeep({ rows: [{ party: "Acme Traders", amount: 120000, days: 47, year: 2026, id: "11111111-1111-4111-8111-111111111111" }] });
  check(typeof deep.rows[0].amount === "string" && deep.rows[0].amount.startsWith("[AMOUNT_"), "strict: a numeric amount in a tool result is hidden", JSON.stringify(deep));
  check(deep.rows[0].days === 47 && deep.rows[0].year === 2026, "strict: small counts and years stay numbers");
  check(deep.rows[0].id === "11111111-1111-4111-8111-111111111111", "strict: record ids stay intact");
}

/* 4. round trip, and tool arguments */
{
  const v = new Vault("strict", ENT);
  const text = "Acme Traders (27AAPFU0939F1ZV) owes ₹1,20,000; call Ravi Kumar on 9876543210 or ravi@acme.in.";
  check(v.restore(v.redact(text)) === text, "round trip: restore(redact(x)) === x");
  const toolResult = v.redactDeep({ rows: [{ customer: "Acme Traders", amount: 120000, invoice_id: "11111111-1111-4111-8111-111111111111" }] });
  const tok = toolResult.rows[0].customer, amt = toolResult.rows[0].amount;
  // The model, seeing only tokens, calls a tool with them:
  const args = v.restoreDeep({ name: tok, args: { amount: amt, invoice_id: toolResult.rows[0].invoice_id }, note: `chase ${tok}` });
  check(args.name === "Acme Traders" && args.note === "chase Acme Traders", "tools: a token in the model's arguments reaches the lookup as the real name", JSON.stringify(args));
  check(args.args.amount === 120000 && typeof args.args.amount === "number", "tools: a hidden number comes back as the same number, typed", JSON.stringify(args));
  check(v.restore("[CUSTOMER_99] is unknown") === "[CUSTOMER_99] is unknown", "tools: an invented token is left alone, never guessed");
  check(v.size > 0, "vault: tokens were issued");
  const other = new Vault("pii", ENT);
  check(other.restore(v.redact("Acme Traders")) === v.redact("Acme Traders"), "isolation: one vault cannot restore another's tokens");
}

/* 5. keepAmounts, 6. off */
{
  const v = new Vault("strict", ENT, { keepAmounts: true });
  const r = v.redact("NEFT Acme Traders 1,20,000.00 Cr balance 4,55,210.50 GSTIN 27AAPFU0939F1ZV");
  check(/1,20,000\.00/.test(r) && /4,55,210\.50/.test(r) && !/Acme|27AAPFU/.test(r), "documents: figures kept for reading, names and IDs still hidden", r);
  const off = new Vault("off", ENT);
  const t = "Acme Traders 27AAPFU0939F1ZV ₹1,20,000 ravi@acme.in";
  check(off.redact(t) === t && off.restore(t) === t && !off.active, "off: nothing changes");
  check(NO_REDACTION.redact(t) === t, "off: the shared no-op vault changes nothing");
  check(new Vault("pii", []).redact("ravi@acme.in").includes("[EMAIL_"), "no dictionary: structured identifiers are still hidden");
}

/* 7. wiring */
{
  const cx = read("src/lib/ai/cortex.ts");
  check(/vault = await vaultFor\(sessionOrg\)/.test(cx), "wiring: chat/reports/agents load the workspace's vault");
  check(/fence\("business snapshot", vault\.redact\(context\)\)/.test(cx), "wiring: the snapshot is redacted (then fenced) before it leaves");
  check(/messages\.map\(\(m\) => \(\{ \.\.\.m, content: vault\.redact\(m\.content\) \}\)\)/.test(cx), "wiring: the conversation is redacted");
  check(/runOnce\(provider, outbound,/.test(cx), "wiring: providers get the redacted conversation, not the original");
  check(/if \(out !== null\) return vault\.restore\(out\)/.test(cx), "wiring: the answer is restored before the owner sees it");
  check((cx.match(/runTool\(fname, vault\.restoreDeep\(/g) || []).length === 2, "wiring: both tool loops restore the model's arguments before a lookup");
  check((cx.match(/vault\.redactDeep\(forModel\(result, guard\)\)/g) || []).length === 2, "wiring: both tool loops redact results before the model sees them");
  check((cx.match(/guard, vault\);/g) || []).length === 2, "wiring: both OpenAI-compatible providers get the vault");
  for (const [f, needle] of [
    ["src/lib/ai/bankstatement.ts", /vaultFor\(null, \{ keepAmounts: true \}\)[\s\S]*callJson\(buildPrompt\(vault\.redact\(scan\.text\)\)\)/],
    ["src/lib/ai/gst.ts", /vaultFor\(null, \{ keepAmounts: true \}\)[\s\S]*callJson\(buildPrompt\(vault\.redact\(scan\.text\)\)\)/],
    ["src/lib/ai/act.ts", /draftOutreachRaw\(kind, vault\.redact\(brief\), vault\.redact\(context\)\)/],
    ["src/lib/ai/priorities.ts", /callJson\(vault\.redact\(prompt\), sys\)/],
    ["src/lib/engine/transform-server.ts", /askJson\(vault\.redact\(prompt\)\)/],
    ["src/lib/engine/automation-server.ts", /askJson\(vault\.redact\(/],
  ]) check(needle.test(read(f)), `wiring: ${f} redacts before sending and restores after`);
  const bank = read("src/lib/ai/bankstatement.ts");
  check(/groundBank\(raw, scan\.text/.test(bank), "wiring: bank figures are grounded against the ORIGINAL text, not the redacted one");
  check(/enterDlp\(orgId\)/.test(read("src/lib/credits.ts")), "scope: request paths scope the vault where credits are charged");
  check(/runWithDlp\(orgId, fn\)/.test(read("src/lib/ai/byo.ts")), "scope: cron paths scope the vault in withOrgAiKeys");
  const srv = read("src/lib/ai/dlp-server.ts");
  check(/if \(redaction === "off"\) return NO_REDACTION/.test(srv) && /return new Vault\(redaction, await entitiesFor\(id\), opts\)/.test(srv), "scope: the workspace's own setting decides the level");
  check(/if \(!id\) return NO_REDACTION/.test(srv), "scope: no workspace (public demo) → nothing to redact against");
  check(/const strict: SecuritySettings = \{ requireMfa: true, redaction: "pii"/.test(read("src/lib/strong-auth.ts")), "scope: an unreadable setting means pii, never off");
}

/* 8. coverage: every module that calls a model is either redacted or declared exempt, with the reason shown to the owner */
{
  const { readdirSync, statSync } = await import("node:fs");
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = `${d}/${f}`; return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : []; });
  const callers = walk("src").filter((f) => /aiKey\("(GEMINI|GROQ|OPENAI|ANTHROPIC)_API_KEY"\)/.test(read(f)) && /fetch\(/.test(read(f)));
  const EXEMPT = new Map([
    ["src/lib/ai/image.ts", "image prompts the owner writes"],
    ["src/lib/ai/video.ts", "video prompts the owner writes"],
    ["src/lib/ai/visibility.ts", "asks engines about the business by name, by design"],
  ]);
  check(callers.length >= 8, "coverage: found the model callers", callers.join(", "));
  for (const f of callers) {
    const s = read(f);
    const redacted = /vaultFor\(/.test(s) || /vault\.redact/.test(s);
    check(redacted || EXEMPT.has(f), `coverage: ${f} redacts, or is a declared exemption`, "a new model caller must use vaultFor() or be added to EXEMPT and to the /settings/security text");
  }
  const page = read("src/app/(app)/settings/security/page.tsx");
  check(/Image and video prompts you write yourself/.test(page) && /AI-visibility check/.test(page), "coverage: the exemptions are disclosed on the settings page");
}

console.log(`\ndlp: ${pass} passed, ${failures.length} failed`);
for (const x of failures) console.log("  ✗ " + x);
process.exit(failures.length ? 1 : 0);
