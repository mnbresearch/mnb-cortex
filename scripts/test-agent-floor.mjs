/*
  THE AGENT FLOOR MUST ONLY ACT OUT WHAT THE PRODUCT DOES.

    1. Every step names a real route (lib/nav.ts) and a real desk and agent.
    2. Every agent's home desk is on the floor of the story it appears in.
    3. Nothing is "sent" unless the owner approved it in that story, or the
       step is the Command-only Autopilot variant.
    4. No step claims what the code does not do (attachments, "your own email
       address", sell-out forecasts, guarantees).
    5. Every industry on the site maps to a story; the main trades get their own.
    6. The component labels itself an illustration, respects reduced motion,
       pauses off-screen, and stores nothing.

  Run: node --experimental-strip-types --no-warnings scripts/test-agent-floor.mjs
*/
import { readFileSync } from "node:fs";

let pass = 0; const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? `\n      ${d}` : ""}`));
const read = (p) => readFileSync(p, "utf8");

const S = await import("../src/lib/agent-stories.ts");
const NAV = new Set([...read("src/lib/nav.ts").matchAll(/href: "([^"]+)"/g)].map((m) => m[1]));

for (const st of S.STORIES) {
  for (const [i, step] of st.steps.entries()) {
    check(NAV.has(step.module), `${st.id}#${i}: module ${step.module} is a real page`);
    check(!!S.STATIONS[step.to], `${st.id}#${i}: desk ${step.to} exists`);
    check(!!S.ACTORS[step.actor], `${st.id}#${i}: agent ${step.actor} exists`);
    check(st.uses.includes(step.to), `${st.id}#${i}: desk ${step.to} is drawn on this story's floor`);
    check(step.say.length > 8 && step.say.length <= 140, `${st.id}#${i}: line is readable in a bubble (${step.say.length} chars)`);
  }
  for (const a of new Set(st.steps.map((s) => s.actor))) {
    check(st.uses.includes(S.ACTORS[a].home), `${st.id}: ${a}'s home desk (${S.ACTORS[a].home}) is on the floor`);
  }
  /* 3. approval before anything leaves */
  let approved = false;
  for (const [i, step] of st.steps.entries()) {
    if (step.actor === "you") approved = true;
    if (step.to === "outbox" && step.actor !== "watch") {
      check(approved || step.commandOnly, `${st.id}#${i}: something is sent only after the owner approved it (or it is the Command Autopilot step)`, step.say);
      approved = false;
    }
  }
  /* 4. no invented capability */
  const text = st.steps.map((s) => s.say).join(" ");
  check(!/attach|own email address|sells? out in|guarantee|100%|always gets paid|automatically sends/i.test(text), `${st.id}: no claim the code cannot back`, text.match(/attach|own email address|sells? out in|guarantee|100%|always gets paid|automatically sends/i)?.[0]);
  const auto = st.steps.filter((s) => s.commandOnly);
  check(auto.length === 0 || st.id === "commanded", `${st.id}: Autopilot steps appear only in the Command story`);
}
check(S.STORY_TABS.every((id) => S.STORIES.some((s) => s.id === id)), "every tab has a story");
check(S.STORIES.find((s) => s.id === "commanded").steps.some((s) => s.actor === "you"), "even on Autopilot, over-limit items still wait for the owner");

/* 5. industries */
const catalog = [...read("src/lib/agents/catalog.ts").matchAll(/\{ id: "([a-z-]+)", name: "[^"]+", emoji:/g)].map((m) => m[1]);
const slugs = [...read("src/lib/industries.ts").matchAll(/slug: "([a-z-]+)"/g)].map((m) => m[1]);
check(catalog.length >= 20 && slugs.length >= 20, "parsed the industry lists", `${catalog.length} / ${slugs.length}`);
const general = [...catalog, ...slugs].filter((id) => id !== "generic" && S.storyFor(id).id === "general");
check(general.length === 0, "every industry on the site opens on a story made for its kind of business", general.join(", "));
for (const [ind, want] of [["manufacturing", "manufacturing"], ["distribution", "distribution"], ["retail-d2c", "retail"], ["professional-services", "practice"], ["Retail & D2C", "retail"], ["Manufacturing", "manufacturing"], ["", "general"], [null, "general"]]) {
  check(S.storyFor(ind).id === want, `storyFor(${JSON.stringify(ind)}) → ${want}`, S.storyFor(ind).id);
}

/* 6. component */
const C = read("src/components/agent-floor.tsx");
check(/An illustration of what runs in your workspace/.test(C) && /names and amounts are examples/.test(C), "the floor says it is an illustration with example figures");
check(/prefers-reduced-motion: reduce/.test(C) && /reduced \? 0 : Math\.round\(dist \* PACE\)/.test(C) && /if \(reduced \|\| !playing \|\| !inView\) return;/.test(C), "reduced motion: no walking, no auto-advance; nothing runs off-screen");
check(!/localStorage|sessionStorage|fetch\(/.test(C), "stores nothing and calls nothing");
check(/<Link href=\{s\.module\}/.test(C), "each step links to the page that does it");
const css = read("src/app/globals.css");
check(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.agent-walk/.test(css), "CSS animations are off under reduced motion");
for (const [f, re] of [["src/app/page.tsx", /<AgentFloor \/>/], ["src/app/features/page.tsx", /<AgentFloor \/>/], ["src/app/industries/[slug]/page.tsx", /<AgentFloor industry=\{ind\.slug\} showTabs=\{false\} \/>/], ["src/app/(app)/workforce/page.tsx", /<AgentFloor industry=/]]) {
  check(re.test(read(f)), `${f} shows the floor`);
}

console.log(`\nagent-floor: ${pass} passed, ${failures.length} failed`);
for (const x of failures) console.log("  ✗ " + x);
process.exit(failures.length ? 1 : 0);
