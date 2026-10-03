/**
 * A form with no submit control is a control that does nothing.
 *
 * /pipeline rendered `<SafeForm action={moveDeal}>` around a <select> and a
 * hidden input, and nothing else. A <select> change does not submit a form,
 * and a form with no submit control has no implicit submission either, so the
 * action was unreachable from the UI — while the line under the board told the
 * owner "Change a card's stage dropdown to move the deal."
 *
 * moveDeal() is the only path from a won deal to a sales_orders row, so the
 * damage was not a stuck dropdown: every closed deal stayed out of revenue,
 * out of the dashboard and out of the AI's context. The file's own comment
 * says a founder could otherwise "close their biggest deal of the year and
 * watch the dashboard not move".
 *
 * SafeForm has no submit-on-change behaviour — `requestSubmit` appears nowhere
 * in src/ — so "it has a select, that's enough" is never true here.
 */
import { readFileSync, readdirSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
let pass = 0; const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));

function walk(dir, out = []) {
  for (const e of readdirSync(new URL(dir + "/", ROOT), { withFileTypes: true })) {
    if (e.isDirectory()) walk(`${dir}/${e.name}`, out);
    else if (/\.tsx$/.test(e.name)) out.push(`${dir}/${e.name}`);
  }
  return out;
}

/* Balance <SafeForm …> against </SafeForm> to get each element's own body,
   so a page with several forms is checked form by form rather than as a blob. */
function bodies(src) {
  const out = [];
  let i = 0;
  while ((i = src.indexOf("<SafeForm", i)) !== -1) {
    const end = src.indexOf("</SafeForm>", i);
    if (end === -1) break;
    out.push(src.slice(i, end));
    i = end + 1;
  }
  return out;
}

/*
  A <button> INSIDE A FORM IS A SUBMIT BUTTON BY DEFAULT.

  My first version required a literal `type="submit"` and failed ten forms
  that are perfectly fine — /leads renders `<button>Make customer</button>`
  with no type attribute, which submits, because "submit" is the HTML default
  for button-in-form. A checker that flags ten correct forms to catch one
  broken one gets switched off, and then it protects nothing.

  So the rule is the real one: the form needs a button that has NOT been
  opted out with type="button". Counting those is what distinguishes /pipeline
  — which had no <button> element at all, only a <select> — from every other
  form in the product.
*/
function hasSubmit(body) {
  /* A component whose name ends in Submit — forms.tsx has <DeleteSubmit />,
     which wraps the button and the pending state together. */
  /* `\b` after Submit failed on <SubmitButton>, where the next char is a
     word character. Match the prefix, not a boundary. */
  if (/<\w*Submit/.test(body) || /formAction=/.test(body)) return true;

  /*
    Both the raw element and the shared <Button>. src/components/ui/button.tsx
    sets no `type`, so it forwards the HTML default — inside a form that is
    "submit". Treating only lowercase <button> as a submit flagged four
    components that submit perfectly well through <Button>.
  */
  for (const m of body.matchAll(/<[Bb]utton\b([^>]*)>/g)) {
    if (!/type=["']button["']/.test(m[1])) return true;
  }
  return false;
}

for (const f of walk("src/app").concat(walk("src/components"))) {
  const src = read(f);
  if (!src.includes("<SafeForm")) continue;
  for (const [n, body] of bodies(src).entries()) {
    check(hasSubmit(body),
      `${f.replace("src/", "")} SafeForm #${n + 1} has a submit control`,
      "without one the action cannot be invoked: a <select> change does not " +
      "submit, and a form with no submit control has no implicit submission");
  }
}

console.log(`\nform submittable: ${pass} passed, ${failures.length} failed`);
if (!failures.length) console.log("  every SafeForm in the product can actually be submitted.");
if (failures.length) { console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n"); process.exit(1); }
