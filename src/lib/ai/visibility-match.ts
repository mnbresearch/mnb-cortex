/**
 * Reading an AI answer: did this brand get recommended, and where.
 *
 * WHY THIS IS ITS OWN PURE MODULE.
 *
 * All of it used to be two functions inside lib/ai/visibility.ts, and both were
 * wrong in ways that moved the headline number the customer is sold on.
 *
 *   MENTION was `answer.toLowerCase().indexOf(brand.toLowerCase()) >= 0`.
 *   A plain substring search, so:
 *     · "Apex" scored a hit on "apex predator" and on "the apex of the market".
 *       Common-word brands — Apex, Elite, Nova, Summit, Pioneer — inflated
 *       their own score, and an inflated visibility score is false
 *       reassurance about the one thing the customer paid to find out.
 *     · "Apex Auto Traders Pvt Ltd" scored ZERO against an answer that
 *       recommended "Apex Auto Traders", because the registered suffix is in
 *       the workspace's company name and never in the model's prose.
 *     · "Shree Balaji Motors" missed "Shree Balaji Motors Pvt. Ltd." and
 *       "Shree-Balaji Motors", and "Patel & Sons" missed "Patel and Sons".
 *
 *   POSITION counted list markers before the FIRST occurrence. So a brand
 *   named once in the intro sentence and then listed eighth was reported as
 *   #1 — the best possible rank, for the worst real placement. And a brand
 *   mentioned only in prose got a confident "#1" with no list to rank in.
 *
 * Both failures point the same way: they make the product look like it is
 * working. That is the failure mode this codebase keeps having to design
 * against, so the logic now lives here, takes no I/O, and is tested against
 * the exact strings that used to break it.
 */

/* Whole tokens only, so "Coastal" is never mistaken for a "co" suffix. */
const SUFFIXES = new Set([
  "pvt", "private", "ltd", "limited", "llp", "inc", "incorporated", "llc",
  "plc", "co", "company", "corp", "corporation", "gmbh", "bv", "srl", "sa",
  "enterprises", "enterprise", "industries", "group", "holdings",
]);

/* Brands that are also ordinary English. A bare lowercase hit on one of these
   is almost certainly the word, not the business, so they need capitalisation
   in the source to count. The list is a hint, not the rule — see isWeak(). */
const COMMON_WORDS = new Set([
  "apex", "elite", "nova", "summit", "pioneer", "prime", "premier", "vertex",
  "zenith", "paramount", "eagle", "phoenix", "delta", "alpha", "omega", "core",
  "spark", "pulse", "shift", "bloom", "crown", "atlas", "orbit", "quest",
]);

/** Fold to comparable tokens: diacritics, punctuation, "&" and case all go. */
export function tokens(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * The strings worth searching for, longest first.
 *
 * Includes the name as given, the name with corporate suffixes removed, and —
 * only when it stays specific — a two-token prefix, so "Apex Auto Traders Pvt
 * Ltd" also matches the "Apex Auto" a model might write. The specificity bar
 * (two tokens AND eight characters) is what stops that generosity turning into
 * the substring bug it replaced.
 */
export function brandAliases(brand: string, extra: string[] = []): string[] {
  const out = new Set<string>();
  const add = (t: string[]) => {
    if (!t.length) return;
    const s = t.join(" ");
    if (s.length >= 3) out.add(s);
  };

  for (const name of [brand, ...extra]) {
    const t = tokens(name);
    if (!t.length) continue;
    add(t);
    const bare = t.filter((x) => !SUFFIXES.has(x));
    add(bare);
    if (bare.length > 2 && bare.slice(0, 2).join(" ").length >= 8) add(bare.slice(0, 2));
  }
  return [...out].sort((a, b) => b.length - a.length);
}

/**
 * Does this alias need a capital letter in the source to be believable?
 *
 * A single ordinary word does. "apex predator" must not count as a hit for a
 * business called Apex, and no amount of word-boundary matching fixes that —
 * "apex" IS a whole word there. Capitalisation is the signal that separates
 * the brand from the noun, and models capitalise brands essentially always.
 */
function isWeak(alias: string): boolean {
  const t = alias.split(" ");
  if (t.length > 1) return false;
  return COMMON_WORDS.has(alias) || alias.length <= 5;
}

/** Separators a model might put between the words of a name. */
const SEP = "[\\s\\-–—.,'’]+";
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function aliasRegex(alias: string): RegExp {
  const parts = alias.split(" ").map((w) => (w === "and" ? "(?:and|&)" : esc(w)));
  /* Boundaries are letter/digit-aware rather than \b, so "Apexx" and "Capex"
     never match "Apex". Trailing "'s" is allowed. */
  return new RegExp(`(?<![A-Za-z0-9])${parts.join(SEP)}(?:['’]s)?(?![A-Za-z0-9])`, "gi");
}

export type ListItem = { position: number; start: number; end: number; text: string };

/**
 * The answer's ranked items, in the order a reader sees them.
 *
 * Numbering follows the reader, not the markup: models restart "1." for a
 * second list, and a buyer reading the answer does not treat the second list's
 * first entry as joint-first. Positions therefore run continuously through the
 * answer, which is also the only interpretation that makes "average position"
 * mean anything.
 */
export function listItems(answer: string): ListItem[] {
  const out: ListItem[] = [];
  if (!answer) return out;
  const re = /^[ \t]*(?:(\d{1,2})[.)]|[-*•‣◦])[ \t]+(.+)$/gm;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(answer))) {
    n += 1;
    out.push({ position: n, start: m.index, end: m.index + m[0].length, text: m[2].trim() });
  }
  return out;
}

export type BrandHit = {
  mentioned: boolean;
  /** Best (lowest) list position the brand appears at, or null if never in a list. */
  position: number | null;
  /** True when named but not inside any ranked item — honest "mentioned, unranked". */
  unranked: boolean;
  /** How many distinct places it was named. */
  occurrences: number;
  /** Which alias matched, for explaining a result to a sceptical customer. */
  matchedAs: string | null;
};

const MISS: BrandHit = { mentioned: false, position: null, unranked: false, occurrences: 0, matchedAs: null };

/**
 * Find a brand in one answer, and rank it.
 *
 * Takes the BEST position across every occurrence. The old code took the
 * first, which rewarded a passing mention in the opening sentence over an
 * actual eighth-place listing — reporting #1 for the worse outcome.
 */
export function findBrand(answer: string, brand: string, extraAliases: string[] = []): BrandHit {
  if (!answer || !brand.trim()) return MISS;
  const items = listItems(answer);
  let best: number | null = null;
  let count = 0;
  let matchedAs: string | null = null;
  let anyOutsideList = false;

  for (const alias of brandAliases(brand, extraAliases)) {
    const weak = isWeak(alias);
    let m: RegExpExecArray | null;
    const re = aliasRegex(alias);
    while ((m = re.exec(answer))) {
      /* A weak alias must look like a name where it appears. */
      if (weak && !/^[A-Z]/.test(m[0])) continue;
      count += 1;
      if (!matchedAs) matchedAs = alias;
      const at = m.index;
      const item = items.find((it) => at >= it.start && at < it.end);
      if (item) best = best === null ? item.position : Math.min(best, item.position);
      else anyOutsideList = true;
    }
    /* Longest alias wins; once it has matched, shorter prefixes of the same
       name would only double-count the same mention. */
    if (count > 0) break;
  }

  if (!count) return MISS;
  return {
    mentioned: true,
    position: best,
    unranked: best === null && anyOutsideList,
    occurrences: count,
    matchedAs,
  };
}

/* Words that lead a list item without naming anything. */
const NOT_A_NAME = new Set([
  "best", "top", "consider", "check", "look", "ask", "visit", "search", "note",
  "however", "finally", "also", "additionally", "remember", "tip", "option",
  "recommended", "popular", "local", "online", "budget", "premium", "overall",
]);

/**
 * The brands an answer actually recommends.
 *
 * Competitors were previously only counted if the customer typed them in, so
 * the most useful fact on the page — who is being recommended INSTEAD of you —
 * depended on already knowing the answer. Models lead a ranked item with the
 * name ("3. Deccan Spares — good for…", "**Nova Mobility**: strong in…"), so
 * the name is recoverable from the item's head without another model call.
 *
 * Heuristic and therefore conservative: it would rather miss a competitor than
 * invent one, because an invented competitor is a claim about the customer's
 * market.
 */
export function namedBrands(answer: string): string[] {
  const out: string[] = [];
  for (const it of listItems(answer)) {
    let head = it.text;
    const bold = head.match(/^\*\*(.+?)\*\*/) || head.match(/^__(.+?)__/);
    if (bold) head = bold[1];
    else head = head.split(/\s+[–—-]\s+|[:(]|\.\s|,\s/)[0];
    head = head.replace(/\*\*/g, "").replace(/^\W+|\W+$/g, "").trim();

    const words = head.split(/\s+/);
    if (head.length < 2 || head.length > 60 || words.length > 6) continue;
    if (!/[A-Z]/.test(head)) continue;
    if (NOT_A_NAME.has(words[0].toLowerCase())) continue;
    /* A whole sentence is not a name. */
    if (words.length > 3 && head === head.toLowerCase()) continue;
    out.push(head);
  }
  return out;
}

export type Citation = { domain: string; url: string; title: string };

/**
 * The sources behind a grounded answer.
 *
 * Gemini returns these in candidates[0].groundingMetadata.groundingChunks and
 * the code threw them away — the single most actionable thing in the response,
 * already paid for. Knowing the AI cited justdial and three directory pages
 * tells an owner exactly where to be listed; a visibility score alone tells
 * them only that they are absent.
 *
 * Google proxies the real URL through vertexaisearch redirect links, so the
 * host of `uri` is usually Google's, not the source's. The chunk's `title` is
 * the publisher domain in practice. Anything that cannot be resolved to a real
 * domain is DROPPED rather than shown as a Google URL, because a citation list
 * that quietly reads "vertexaisearch.cloud.google.com" eight times is worse
 * than no citation list.
 */
export function citations(chunks: any[]): Citation[] {
  const seen = new Map<string, Citation>();
  for (const c of chunks || []) {
    const web = c?.web || c?.retrievedContext || {};
    const title = String(web.title ?? "").trim();
    const uri = String(web.uri ?? "").trim();
    let domain = "";

    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(title)) domain = title.toLowerCase();
    else {
      try {
        const h = new URL(uri).hostname.replace(/^www\./, "").toLowerCase();
        if (!/(^|\.)google\.com$|vertexaisearch|googleusercontent/.test(h)) domain = h;
      } catch { /* not a URL */ }
    }
    if (!domain) continue;
    if (!seen.has(domain)) seen.set(domain, { domain, url: uri, title: title || domain });
  }
  return [...seen.values()];
}

export type PromptOutcome = { mentioned: boolean; position: number | null; competitors: string[] };

export type Scores = {
  /** Share of answers naming the brand at all, 0–100. The existing headline. */
  presence: number;
  /**
   * Position-weighted, 0–100. Reciprocal rank: #1 scores 1, #2 a half, #4 a
   * quarter; named-but-unranked counts a half, because being in the answer
   * without being in the list is real but weaker than leading it.
   *
   * Reported BESIDE presence rather than replacing it. Presence already means
   * something specific to anyone who has run a check, and quietly redefining a
   * number a customer has seen is its own kind of dishonesty.
   */
  prominence: number;
  /** Mean list position where the brand was ranked, or null if never ranked. */
  avgPosition: number | null;
  /** Brand appearances as a share of all brand appearances, 0–100, or null. */
  shareOfVoice: number | null;
};

export function score(outcomes: PromptOutcome[]): Scores {
  const n = outcomes.length;
  if (!n) return { presence: 0, prominence: 0, avgPosition: null, shareOfVoice: null };

  const hits = outcomes.filter((o) => o.mentioned);
  const ranked = hits.filter((o) => o.position !== null) as Array<PromptOutcome & { position: number }>;

  const weight = outcomes.reduce((s, o) => s + (!o.mentioned ? 0 : o.position ? 1 / o.position : 0.5), 0);

  const compAppearances = outcomes.reduce((s, o) => s + o.competitors.length, 0);
  const total = hits.length + compAppearances;

  return {
    presence: Math.round((hits.length / n) * 100),
    prominence: Math.round((weight / n) * 100),
    avgPosition: ranked.length
      ? Math.round((ranked.reduce((s, o) => s + o.position, 0) / ranked.length) * 10) / 10
      : null,
    shareOfVoice: total > 0 ? Math.round((hits.length / total) * 100) : null,
  };
}
