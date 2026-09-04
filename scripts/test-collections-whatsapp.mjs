/**
 * WhatsApp collections: the three things that must stay true.
 *
 * WHAT WENT WRONG, so the assertions below have a reason to exist.
 *
 * (1) Collections called `whatsappConfigFor(orgId)`, which falls back to the
 *     PLATFORM Meta credentials when a workspace has not connected its own. So
 *     a debtor of Sharma Steel got a demand for money from MNB Research's
 *     WhatsApp number, and their "already paid, UTR 4471" reply arrived on our
 *     number instead of the owner's. Worse at scale: WhatsApp rates senders on
 *     recipient blocks, and one shared number carrying every tenant's dunning
 *     is a number that gets rated badly and then throttled — for everyone.
 *
 * (2) It sent with `sendText`. Meta permits free-form only inside a 24-hour
 *     window the RECIPIENT opened by messaging the business first. Someone
 *     being chased for money has never done that, so every send returned error
 *     131047 and failed. Not sometimes — always.
 *
 * (3) Those guaranteed failures were recorded as `failed`, and the circuit
 *     breaker trips on `failed > 0 && sent === 0`. An unconfigured WhatsApp
 *     therefore switched the entire collections policy off within a day and
 *     took the EMAIL channel — which was working — down with it. That is the
 *     compounding failure: the broken channel disabled the working one.
 *
 * These are properties of code paths that only run against Meta's live API, so
 * this reads the shipped source and asserts on its structure. That is weaker
 * than executing it, and the checks are written to be specific enough that they
 * cannot pass by accident: each names the exact call that must not appear, or
 * the exact status that must be written.
 */

import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}\n      ${d}`));

const ENGINE = readFileSync("src/lib/collections/index.ts", "utf8");
const GATE = readFileSync("src/lib/collections/whatsapp.ts", "utf8");
const ACTIONS = readFileSync("src/lib/actions.ts", "utf8");
const MIG = readFileSync("supabase/migrations/2026_collections_whatsapp.sql", "utf8");
const BREAKER = readFileSync("supabase/migrations/2026_collections_safety.sql", "utf8");

/* Strip comments before looking for calls: this whole file is about paths that
   must not be TAKEN, and every one of them is NAMED in a comment explaining
   why. Searching raw source would match the explanation and pass regardless. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const CODE = strip(ENGINE);
const GATE_CODE = strip(GATE);

/* ------------------------------------------- (1) never send as the platform */

check(!/sendText\s*\(/.test(CODE),
  "the collections engine no longer calls sendText()",
  "free-form WhatsApp cannot reach a recipient who has not messaged the business first — every send fails with 131047");

check(/sendReminderTemplate/.test(CODE),
  "it sends through the template path instead");

check(!/whatsappConfigFor|hasWhatsAppFor/.test(CODE),
  "the engine does not use whatsappConfigFor()",
  "that helper falls back to the PLATFORM number — a debtor would receive a demand for money from a company they have never dealt with, and reply to us");

check(/credentialsFor\(orgId, "whatsapp"\)/.test(GATE_CODE),
  "the gate reads the workspace's OWN credentials directly");

check(!/whatsappConfig\(\)/.test(GATE_CODE),
  "the gate never falls back to the platform credentials",
  "this is the whole point of the module: no own account means no WhatsApp, not our account");

/* Prove the fallback it is avoiding is real, so the check above is not vacuous. */
const WA = strip(readFileSync("src/lib/whatsapp.ts", "utf8"));
check(/export async function whatsappConfigFor[\s\S]*?return whatsappConfig\(\);/.test(WA),
  "whatsappConfigFor really does fall back to the platform account",
  "if it no longer does, the assertions above are testing nothing and should be rewritten");

/* --------------------------------- (2) a template, and a real one, or refuse */

check(/if \(!own\)/.test(GATE_CODE) && /setup: true/.test(GATE_CODE),
  "no own account produces a setup refusal, not a send");

check(/\^\[a-z0-9_\]\{1,512\}\$/.test(GATE_CODE),
  "the gate validates the template name against Meta's rule");

check(/whatsapp_template/.test(ACTIONS) && /channels\.includes\("whatsapp"\) && !waTemplate/.test(strip(ACTIONS)),
  "saving a policy with WhatsApp on and no template is refused at the form",
  "otherwise the owner learns it from an empty outbox two days later");

check(/add column if not exists whatsapp_template/i.test(MIG) &&
      /add column if not exists whatsapp_lang/i.test(MIG),
  "the migration adds somewhere to store the template and its language");

/* ------------- (3) a setup refusal must never disable the working channel */

check(/status: "skipped"[\s\S]{0,120}waGate\.reason/.test(CODE) ||
      /waGate\.reason[\s\S]{0,120}status: "skipped"/.test(CODE) ||
      /m\.channel === "whatsapp" && waGate && !waGate\.ok/.test(CODE),
  "a WhatsApp setup refusal is written as 'skipped'",
  "'failed' would feed the breaker and switch email off too");

const skipBlock = CODE.match(/m\.channel === "whatsapp" && waGate && !waGate\.ok[\s\S]{0,400}?\n    \}/);
check(skipBlock && /status: "skipped"/.test(skipBlock[0]) && !/status: "failed"/.test(skipBlock[0]),
  "…and that block writes ONLY 'skipped'",
  skipBlock ? "it also writes 'failed' somewhere in the same block" : "could not find the refusal block to check");

check(/status = 'failed'/.test(BREAKER) && !/status = 'skipped'/.test(BREAKER),
  "the breaker counts 'failed' and does not count 'skipped'",
  "if it ever counts skipped, an unconnected WhatsApp switches off the whole policy including email");

check(/skipped/.test(CODE) && /held: skipped/.test(CODE),
  "skips are reported back to the caller rather than swallowed",
  "a run that sends nothing must say why");

/* ------------------------------------------- the two clock bugs, same file */

check(/export function istStartOfDay/.test(CODE) && !/setHours\(0, 0, 0, 0\)/.test(CODE),
  "the daily cap resets on the IST day, not the server's UTC day",
  "Vercel functions run in UTC, so 'today' ended at 05:30 for every Indian customer");

check(/from < to \? h >= from && h < to : h >= from \|\| h < to/.test(CODE),
  "an overnight sending window is read as wrapping",
  "`h >= 19 && h < 9` is false at every hour — collections reported 'outside your sending window' forever and sent nothing, with no error to explain it");

check(/from === to\) return true/.test(CODE),
  "a zero-length window means always, not never",
  "someone who set both hours the same has misread the field, not asked for permanent silence");

/* ---------------------------------------------- the help has to be findable */

const SETUP = readFileSync("SETUP.md", "utf8");
check(/template/i.test(SETUP) && /Utility/.test(SETUP),
  "SETUP.md explains how to get a template approved",
  "we are asking the customer to do something in Meta's console; the instructions must exist");

console.log(`\ncollections-whatsapp: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("  Sends as the customer, via an approved template, and a setup gap never disables email.");
