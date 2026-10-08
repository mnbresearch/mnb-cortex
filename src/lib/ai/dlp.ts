/*
  DATA-LOSS PREVENTION FOR PROMPTS — tokenise before a prompt leaves, restore
  after the answer comes back.

  Cortex routes prompts to up to four vendors (Google, Groq, OpenAI,
  Anthropic). Whatever is in a prompt can end up in that vendor's logs, and on
  some free tiers in its training data. So, before any prompt leaves:

    customer / supplier / employee names   → [CUSTOMER_1] [SUPPLIER_2] [PERSON_3]
    emails, Indian phone numbers           → [EMAIL_1] [PHONE_1]
    PAN, GSTIN, Aadhaar, IFSC              → [PAN_1] [GSTIN_1] [AADHAAR_1] [IFSC_1]
    bank account and card numbers          → [ACCOUNT_1] [CARD_1]
    every rupee amount (strict level only) → [AMOUNT_1]

  The same value always gets the same token within one Vault, so the model can
  still reason ("[CUSTOMER_3] owes the most and is also the oldest overdue").
  restore() swaps the real values back into the answer the owner reads, and
  restoreDeep() into the arguments of any tool the model calls — so a lookup
  for "[CUSTOMER_3]" finds the real customer, and an action proposed for
  [CUSTOMER_3] is proposed for the real one.

  Names come from the workspace's own records (dlp-server.ts loads them):
  a regex cannot know that "Shree Balaji" is a customer, the customer list
  can. Structured identifiers come from the patterns below.

  What this is not: a guarantee. A name that is in no record, typed in a
  novel spelling, is not caught. The levels are offered honestly on
  /settings/security and the page says what each one hides.

  Pure — executed by scripts/test-dlp.mjs.
*/

export type RedactionLevel = "off" | "pii" | "strict";
export type EntityKind = "CUSTOMER" | "SUPPLIER" | "PERSON";
export type Entity = { value: string; kind: EntityKind };

const KINDS = ["CUSTOMER", "SUPPLIER", "PERSON", "EMAIL", "PHONE", "PAN", "GSTIN", "AADHAAR", "IFSC", "ACCOUNT", "CARD", "AMOUNT"] as const;
type Kind = (typeof KINDS)[number];
const TOKEN_RE = new RegExp(`\\[(${KINDS.join("|")})_(\\d+)\\]`, "g");

/* Words that appear as "party" in real books but identify nobody. */
const STOP = new Set([
  "cash", "sales", "sale", "purchase", "purchases", "other", "others", "misc", "miscellaneous", "general", "customer",
  "customers", "supplier", "suppliers", "vendor", "walk-in", "walkin", "walk in", "test", "demo", "sample", "unknown",
  "n/a", "none", "bank", "self", "owner", "admin", "staff", "salary", "rent", "transfer", "online", "retail", "wholesale",
]);

function luhn(digits: string): boolean {
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export class Vault {
  readonly level: RedactionLevel;
  private readonly keepAmounts: boolean;
  private readonly byValue = new Map<string, string>();     // normalised value → token
  private readonly byToken = new Map<string, string>();     // token → original value
  private readonly counters = new Map<Kind, number>();
  private readonly nameRe: RegExp | null;
  private readonly nameKind = new Map<string, EntityKind>();

  constructor(level: RedactionLevel, entities: Entity[] = [], opts: { keepAmounts?: boolean } = {}) {
    this.level = level;
    this.keepAmounts = opts.keepAmounts === true;
    const names: string[] = [];
    for (const e of entities) {
      const v = String(e?.value ?? "").replace(/\s+/g, " ").trim();
      if (v.length < 4 || STOP.has(v.toLowerCase()) || /^\d+$/.test(v)) continue;
      const k = v.toLowerCase();
      if (!this.nameKind.has(k)) { this.nameKind.set(k, e.kind); names.push(v); }
      if (names.length >= 3000) break;
    }
    // Longest first, so "Acme Traders Pvt Ltd" wins over "Acme Traders".
    names.sort((a, b) => b.length - a.length);
    this.nameRe = names.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.map(escapeRe).join("|")})(?![\\p{L}\\p{N}])`, "giu") : null;
  }

  get active(): boolean { return this.level !== "off"; }
  get size(): number { return this.byToken.size; }

  private token(kind: Kind, original: string, key = original.toLowerCase()): string {
    const k = `${kind}:${key}`;
    const have = this.byValue.get(k);
    if (have) return have;
    const n = (this.counters.get(kind) || 0) + 1;
    this.counters.set(kind, n);
    const t = `[${kind}_${n}]`;
    this.byValue.set(k, t);
    this.byToken.set(t, original);
    return t;
  }

  redact(text: string): string {
    if (!this.active || !text) return text ?? "";
    /* UUIDs are record ids the tools need verbatim, and their digit runs can
       look like a card number. Set aside, put back at the end. */
    const held: string[] = [];
    let s = String(text).replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, (m) => `\u0000${held.push(m) - 1}\u0000`);
    s = s.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}/g, (m) => this.token("EMAIL", m));
    s = s.replace(/\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g, (m) => this.token("GSTIN", m));
    s = s.replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, (m) => this.token("PAN", m));
    s = s.replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/g, (m) => this.token("IFSC", m));
    s = s.replace(/(?<!\d)(?<!\d[.,])(?:\d[ -]?){12,18}\d(?!\d|[.,]\d)/g, (m) => {
      const d = m.replace(/[ -]/g, "");
      if (d.length < 13 || d.length > 19) return m;
      // 13–19 digits is never a rupee amount; if it is not a card it is an account or reference number.
      return luhn(d) ? this.token("CARD", m, d) : this.token("ACCOUNT", m, d);
    });
    s = s.replace(/(?<!\d[ -]?)(?<!\d[.,])[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}(?![ -]?\d|[.,]\d)/g, (m) => this.token("AADHAAR", m, m.replace(/[ -]/g, "")));
    s = s.replace(/(\b(?:a\/c|acct|account|ac)\.?\s*(?:no\.?|number|#)?\s*[:\-]?\s*)(\d{9,18})\b/gi, (_m, pre, num) => pre + this.token("ACCOUNT", num));
    s = s.replace(/(?<!\d[ -]?)(?<!\d[.,])(?:\+91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?![ -]?\d|[.,]\d)/g, (m) => this.token("PHONE", m, m.replace(/\D/g, "").slice(-10)));
    if (this.nameRe) s = s.replace(this.nameRe, (m) => {
      const kind = this.nameKind.get(m.replace(/\s+/g, " ").toLowerCase()) || "CUSTOMER";
      return this.token(kind, m, m.replace(/\s+/g, " ").toLowerCase());
    });
    if (this.level === "strict" && !this.keepAmounts) {
      s = s.replace(/(?:₹|\brs\.?|\binr)\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:cr|crore|crores|lakh|lakhs|lac|l|k)\b)?/gi, (m) => this.token("AMOUNT", m));
      s = s.replace(/(?<![\w\-/.:\[])\d{1,3}(?:,\d{2,3})+(?:\.\d+)?(?![\w\-/\]])/g, (m) => this.token("AMOUNT", m));
      s = s.replace(/(?<![\w\-/.:\[])\d{4,}(?:\.\d+)?(?![\w\-/:\]])/g, (m) => {
        const n = Number(m);
        return Number.isInteger(n) && n >= 1900 && n <= 2100 ? m : this.token("AMOUNT", m);   // years stay
      });
    }
    return held.length ? s.replace(/\u0000(\d+)\u0000/g, (_m, i) => held[Number(i)]) : s;
  }

  restore(text: string): string {
    if (!text || !this.byToken.size) return text ?? "";
    return String(text).replace(TOKEN_RE, (m) => this.byToken.get(m) ?? m);
  }

  redactDeep<T>(v: T): T { return this.walk(v, "redact"); }
  restoreDeep<T>(v: T): T { return this.walk(v, "restore"); }

  /** Tokens that stood for a NUMBER in structured data, so restoreDeep gives a number back. */
  private readonly numeric = new Set<string>();

  private walk<T>(v: T, mode: "redact" | "restore"): T {
    if (typeof v === "string") {
      if (mode === "restore") {
        const whole = v.trim();
        if (this.numeric.has(whole)) return Number(this.byToken.get(whole)) as unknown as T;
        return this.restore(v) as unknown as T;
      }
      return this.redact(v) as unknown as T;
    }
    if (Array.isArray(v)) return v.map((x) => this.walk(x, mode)) as unknown as T;
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = this.walk(x, mode);
      return out as T;
    }
    // Numbers in structured tool results: strict hides them too (years stay).
    if (mode === "redact" && typeof v === "number" && this.level === "strict" && !this.keepAmounts
        && Math.abs(v) >= 1000 && !(Number.isInteger(v) && v >= 1900 && v <= 2100)) {
      const t = this.token("AMOUNT", String(v), `n:${v}`);
      this.numeric.add(t);
      return t as unknown as T;
    }
    return v;
  }
}

/** A vault that changes nothing — for signed-out paths, or redaction off. */
export const NO_REDACTION = new Vault("off");
