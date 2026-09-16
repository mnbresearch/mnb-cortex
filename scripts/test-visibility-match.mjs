/**
 * Reading an AI answer correctly.
 *
 * The visibility score is the whole product on that page: a customer pays 89
 * credits to be told whether AI engines recommend them. Both halves of the
 * reading were wrong, and wrong in the direction that flatters — a brand that
 * is invisible scored as visible, and a brand listed eighth was reported first.
 *
 * Every case below is a string the old logic got wrong, or a regression guard
 * for the fix. Real strings, in the shape models actually answer.
 */

import {
  tokens, brandAliases, listItems, findBrand, namedBrands, citations, score,
} from "../src/lib/ai/visibility-match.ts";

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));

/* ======================================================= false positives === */
/*
  The bug that mattered most. `indexOf` on a lowercased answer meant a business
  called Apex was "recommended" by any answer containing the English word.
*/
{
  const a = "The apex predator of this market is price competition, and the apex of demand is festive season.";
  const hit = findBrand(a, "Apex");
  check(hit.mentioned === false,
    "a common-word brand is NOT matched by the lowercase English word",
    `"apex predator" must not count as a recommendation — got mentioned=${hit.mentioned}`);

  /* …but the real brand, capitalised, still counts. */
  const b = "For clutch plates, Apex is the most frequently recommended supplier in Pune.";
  check(findBrand(b, "Apex").mentioned === true,
    "…while the capitalised brand in the same answer does count");

  check(findBrand("Capex planning matters. Apexx Ltd is unrelated.", "Apex").mentioned === false,
    "substrings inside longer words never match (Capex, Apexx)");

  check(findBrand("We rate Elite Drivetrain highly.", "Elite").mentioned === true,
    "a weak brand name inside a longer capitalised phrase still matches");
  check(findBrand("an elite service, frankly", "Elite").mentioned === false,
    "…but the adjective does not");
}

/* ======================================================= false negatives === */
/*
  The mirror failure: a workspace's company name carries "Pvt Ltd" and a model's
  prose never does, so genuine recommendations scored zero.
*/
{
  const answer = "1. Apex Auto Traders — strong range of clutch plates.\n2. Deccan Spares — cheapest.";
  for (const name of [
    "Apex Auto Traders Pvt Ltd",
    "Apex Auto Traders Private Limited",
    "APEX AUTO TRADERS",
    "Apex  Auto   Traders",
  ]) {
    const h = findBrand(answer, name);
    check(h.mentioned && h.position === 1,
      `"${name}" matches the answer that recommends it, at #1`,
      `got mentioned=${h.mentioned} position=${h.position}`);
  }

  check(findBrand("Try Shree Balaji Motors Pvt. Ltd. first.", "Shree Balaji Motors").mentioned,
    "the suffix may be in the ANSWER rather than the brand and still match");
  check(findBrand("Shree-Balaji Motors is reliable.", "Shree Balaji Motors").mentioned,
    "hyphenated separators match");
  check(findBrand("Patel and Sons handle bulk orders.", "Patel & Sons").mentioned,
    "\"&\" in the brand matches \"and\" in the answer");
  check(findBrand("Patel & Sons handle bulk orders.", "Patel and Sons").mentioned,
    "…and the reverse");
  check(findBrand("Ask Deccan Spares's manager.", "Deccan Spares").mentioned,
    "a possessive still matches");
}

/* ============================================================== position === */
{
  /* The exact shape that produced "#1" for an eighth-place listing. */
  const answer = [
    "Several suppliers are worth contacting, including Om Sai Components and others.",
    "",
    "1. Kirloskar Distributors — widest range.",
    "2. Deccan Spares — best pricing.",
    "3. Bharat Gears Supply — fastest delivery.",
    "4. Om Sai Components — good for bulk.",
  ].join("\n");

  const h = findBrand(answer, "Om Sai Components");
  check(h.position === 4,
    "position is the BEST list placement, not the first textual mention",
    `named in the intro then listed 4th — old code said #1, got #${h.position}`);
  check(h.occurrences === 2, "both mentions are counted", `got ${h.occurrences}`);

  /* Mentioned in prose only: honest about having no rank. */
  const prose = "Om Sai Components is a reasonable option, though I'd compare quotes.";
  const p = findBrand(prose, "Om Sai Components");
  check(p.mentioned && p.position === null && p.unranked === true,
    "a prose-only mention is reported as unranked rather than given a rank",
    `got position=${p.position} unranked=${p.unranked}`);

  /* Continuous numbering across two lists, because that is what a reader sees. */
  const two = "1. Alpha Co\n2. Beta Co\n\nAlso worth a look:\n\n1. Gamma Co\n2. Nova Mobility";
  check(listItems(two).length === 4, "items from both lists are collected", `got ${listItems(two).length}`);
  check(findBrand(two, "Nova Mobility").position === 4,
    "the second list's second entry is #4, not joint-#2",
    `got #${findBrand(two, "Nova Mobility").position}`);

  check(listItems("- Apex Auto\n• Deccan Spares\n* Nova Mobility").length === 3,
    "dash, bullet and asterisk markers all parse");
}

/* =============================================================== aliases === */
{
  const al = brandAliases("Apex Auto Traders Pvt Ltd");
  check(al.includes("apex auto traders"), "suffixes are stripped to form an alias");
  check(al.includes("apex auto"), "a specific two-token prefix is allowed");
  check(!al.includes("apex"), "a bare generic first token is NOT an alias",
    `that is the substring bug again — got ${JSON.stringify(al)}`);
  check(brandAliases("Om Sai Components")[0] === "om sai components", "longest alias comes first");
  check(tokens("Café & Sons, Pvt. Ltd.").join(" ") === "cafe and sons pvt ltd",
    "diacritics and & fold predictably", tokens("Café & Sons, Pvt. Ltd.").join(" "));
}

/* ==================================================== competitor discovery = */
{
  const answer = [
    "Here are strong options:",
    "1. **Kirloskar Distributors** — widest range in Maharashtra.",
    "2. Deccan Spares: cheapest for bulk.",
    "3. Bharat Gears Supply (Faridabad) — fast delivery.",
    "4. Consider checking local dealers too.",
    "5. Nova Mobility India Pvt Ltd, strong in Bengaluru.",
  ].join("\n");

  const found = namedBrands(answer);
  check(found.includes("Kirloskar Distributors"), "a bold-led name is extracted", JSON.stringify(found));
  check(found.includes("Deccan Spares"), "a colon-led name is extracted");
  check(found.includes("Bharat Gears Supply"), "a parenthetical is trimmed off the name");
  check(found.includes("Nova Mobility India Pvt Ltd"), "a comma-led description is trimmed off");
  check(!found.some((f) => /^Consider/i.test(f)),
    "an instruction is not mistaken for a brand", JSON.stringify(found));
  check(namedBrands("1. you should really compare at least three local suppliers first").length === 0,
    "a lowercase sentence yields no brand");
}

/* ============================================================= citations === */
{
  const chunks = [
    { web: { title: "justdial.com", uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc" } },
    { web: { title: "IndiaMART", uri: "https://www.indiamart.com/pune/clutch-plates" } },
    { web: { title: "justdial.com", uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/xyz" } },
    { web: { title: "Some Article", uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/zzz" } },
    { web: {} },
  ];
  const c = citations(chunks);
  const domains = c.map((x) => x.domain);
  check(domains.includes("justdial.com"), "a domain-shaped title is used as the domain");
  check(domains.includes("indiamart.com"), "otherwise the real host is parsed from the URL");
  check(domains.filter((d) => d === "justdial.com").length === 1, "duplicates collapse");
  check(!domains.some((d) => /google|vertexai/.test(d)),
    "an unresolvable Google redirect is DROPPED, not shown as a source",
    JSON.stringify(domains));
  check(c.length === 2, "only real sources survive", `got ${c.length}`);
}

/* ================================================================ scoring === */
{
  /* Presence cannot tell these two apart; prominence must. */
  const first = [{ mentioned: true, position: 1, competitors: [] }, { mentioned: false, position: null, competitors: [] }];
  const last = [{ mentioned: true, position: 8, competitors: [] }, { mentioned: false, position: null, competitors: [] }];

  check(score(first).presence === score(last).presence,
    "presence treats #1 and #8 identically — which is why it is not the only number");
  check(score(first).prominence > score(last).prominence,
    "prominence separates leading the list from trailing it",
    `#1 ${score(first).prominence} vs #8 ${score(last).prominence}`);
  check(score(first).prominence === 50, "one first place out of two prompts is 50", `got ${score(first).prominence}`);
  check(score(last).prominence === 6, "one eighth place out of two prompts is 6", `got ${score(last).prominence}`);

  const unranked = [{ mentioned: true, position: null, competitors: [] }];
  check(score(unranked).prominence === 50,
    "a named-but-unranked mention counts half", `got ${score(unranked).prominence}`);

  const avg = score([
    { mentioned: true, position: 2, competitors: [] },
    { mentioned: true, position: 5, competitors: [] },
    { mentioned: false, position: null, competitors: [] },
  ]);
  check(avg.avgPosition === 3.5, "average position ignores the answers that never named us", `got ${avg.avgPosition}`);
  check(avg.presence === 67, "presence rounds to 67", `got ${avg.presence}`);

  const sov = score([
    { mentioned: true, position: 1, competitors: ["A", "B", "C"] },
    { mentioned: false, position: null, competitors: ["A", "B"] },
  ]);
  check(sov.shareOfVoice === 17, "share of voice is our appearances over all appearances", `got ${sov.shareOfVoice}`);
  check(score([]).presence === 0 && score([]).avgPosition === null,
    "no prompts means no score and no fabricated average");
  check(score([{ mentioned: false, position: null, competitors: [] }]).shareOfVoice === null,
    "share of voice is null, not 0, when nobody at all was named",
    "0% would claim we lost a race that had no runners");
}


/* ==================================== wiring the engine cannot get wrong === */
/*
  Static, because these three facts are about cost and honesty and none of them
  is visible in the pure functions above.
*/
{
  const { readFileSync } = await import("node:fs");
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const lib = strip(readFileSync("src/lib/ai/visibility.ts", "utf8"));
  const pub = strip(readFileSync("src/app/api/visibility/public/route.ts", "utf8"));
  const ui = strip(readFileSync("src/components/visibility.tsx", "utf8"));
  const cfg = readFileSync("src/lib/config.ts", "utf8");

  check(/crossCheck:\s*0/.test(pub),
    "the free public endpoint runs ONE engine",
    "a second engine there doubles spend on an unauthenticated route anybody can loop");
  check(/opts\.crossCheck \?\? CROSS_CHECK/.test(lib),
    "the paid route gets the cross-check engine by default");

  /* The price on the button must be the price that is charged. */
  const charged = (cfg.match(/visibility:\s*(\d+)/) || [])[1];
  check(!!charged, "the credit cost is findable in config", "cannot verify the label without it");
  check(ui.includes(`${charged} credits`),
    `the button quotes ${charged} credits, matching what config charges`,
    "it said 10 while config charged 89 — a price quoted nine times under the real one");
  check(!/·\s*10 credits/.test(ui), "the old 10-credit label is gone");

  check(/citations:\s*report\.citations/.test(strip(readFileSync("src/app/api/visibility/route.ts", "utf8"))),
    "the drafted fix is given the cited sources to work from");
}

console.log(`\nvisibility matching: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("  Mentions, positions, competitors, citations and scores read honestly.");
