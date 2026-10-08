/*
  CONFUSED DEPUTY / OVER-PERMISSIONED CONNECTORS, EXECUTED AND PINNED.

  1. Cortex refuses a connector key broader than it needs (Stripe secret key,
     Shopify token with write scopes), before anything is stored.
  2. No credential is reachable from the agent: the AI tools, the action
     handlers, the ledger and the model runner never read connector
     credentials, and credentialsFor() is called only from an explicit list of
     modules that need a credential to do their one job.
  3. The agent's tools make no outbound HTTP calls at all.
  4. Every connected-system call the product makes is a read, except the two
     sends the owner configures (WhatsApp, email) — the payment and commerce
     connectors only GET.

  Run: node --experimental-strip-types --no-warnings scripts/test-least-privilege.mjs
*/
import { readFileSync, readdirSync, statSync } from "node:fs";

let pass = 0; const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? `\n      ${d}` : ""}`));
const read = (p) => readFileSync(p, "utf8");
const walk = (d) => readdirSync(d).flatMap((f) => { const p = `${d}/${f}`; return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : []; });

const P = await import("../src/lib/least-privilege.ts");

/* 1. verdicts */
check(P.stripeKeyVerdict("rk_live_51Habcdefghijklmnop").ok, "stripe: a restricted live key is accepted");
check(P.stripeKeyVerdict("rk_test_51Habcdefghijklmnop").ok, "stripe: a restricted test key is accepted");
const sk = P.stripeKeyVerdict("sk_live_51Habcdefghijklmnop");
check(!sk.ok && /refunds and payouts/.test(sk.error) && /rk_/.test(sk.error), "stripe: the account secret key is refused, and the message says what to create instead", JSON.stringify(sk));
check(!P.stripeKeyVerdict("sk_test_x").ok, "stripe: a test secret key is refused too");
check(!P.stripeKeyVerdict("pk_live_abc").ok && !P.stripeKeyVerdict("").ok && !P.stripeKeyVerdict("rk_live_").ok, "stripe: publishable, empty and truncated keys are refused");
check(P.shopifyScopesVerdict(["read_orders", "read_customers"]).ok, "shopify: read-only scopes are accepted");
const w = P.shopifyScopesVerdict(["read_orders", "write_orders", "write_products"]);
check(!w.ok && /write_orders/.test(w.error), "shopify: any write scope is refused, and named", JSON.stringify(w));
check(!P.shopifyScopesVerdict(["read_products"]).ok, "shopify: a token that cannot read orders is refused");
check(!P.shopifyScopesVerdict([]).ok, "shopify: an empty scope list is refused (cannot confirm read-only)");
check(typeof P.UNSCOPEABLE_NOTE.razorpay === "string" && /cannot be limited/.test(P.UNSCOPEABLE_NOTE.razorpay), "razorpay: the unscopeable key is disclosed");

/* 1b. wiring in the connect path */
{
  const r = read("src/app/api/integrations/route.ts");
  const conn = r.slice(r.indexOf('if (op === "connect")'));
  const iStripe = conn.indexOf("stripeKeyVerdict(creds.api_key");
  const iTest = conn.indexOf("await testCredentials(id, creds)");
  const iSave = conn.indexOf("encryptSecret(JSON.stringify(creds))");
  check(iStripe > -1 && iStripe < iTest && iStripe < iSave, "connect: the Stripe key is checked before it is tested or stored");
  check(/if \(id === "stripe"\) \{\s*const pv = stripeKeyVerdict\(creds\.api_key \|\| ""\);\s*if \(!pv\.ok\) return NextResponse\.json\(\{ ok: false/.test(conn), "connect: a refused Stripe key returns before anything else happens");
  check(/if \(id === "shopify" && test\.ok && test\.verified\) \{/.test(conn), "connect: every proven Shopify token has its scopes checked");
  const iShop = conn.indexOf("shopifyScopesVerdict(scopes)");
  check(iShop > iTest && iShop < iSave, "connect: Shopify scopes are checked after the token is proven and before it is stored");
  check(/if \(scopes === null\)[\s\S]{0,200}Nothing was saved/.test(conn), "connect: if Shopify's scopes cannot be read, nothing is stored (fail closed)");
  check(/admin\/oauth\/access_scopes\.json/.test(r), "connect: scopes come from Shopify itself");
  const cat = read("src/lib/integrations.ts");
  check(/id: "stripe"[\s\S]{0,600}"rk_live_…"/.test(cat) && !/id: "stripe"[\s\S]{0,600}"sk_live_…"/.test(cat), "catalogue: the Stripe field asks for a restricted key");
  check(/id: "razorpay"[\s\S]{0,300}cannot be limited to read-only/.test(cat), "catalogue: Razorpay's card discloses the unscopeable key");
  check(/i\.id === "stripe" && \/\^sk_\//.test(read("src/components/integrations-manager.tsx")), "card: an existing Stripe connection on a secret key is flagged");
}

/* 2. no credential reachable from the agent */
{
  const AGENT = ["src/lib/ai/tools.ts", "src/lib/engine/handlers.ts", "src/lib/engine/ledger.ts", "src/lib/engine/policy.ts", "src/lib/engine/catalogue.ts", "src/lib/ai/cortex.ts", "src/lib/ai/untrusted.ts", "src/lib/ai/dlp.ts"];
  for (const f of AGENT) {
    const s = read(f);
    check(!/credentialsFor|@\/lib\/credentials|decryptSecret|from\("integrations"\)/.test(s), `agent: ${f} cannot read connector credentials`);
  }
  const ALLOWED = new Set([
    "src/lib/credentials.ts",           // the definition
    "src/lib/ai/byo.ts",                 // the workspace's own AI key, to call the AI provider
    "src/lib/sync/index.ts",             // read-only pulls from the four sync connectors
    "src/lib/whatsapp.ts",               // sending a WhatsApp message the owner approved
    "src/lib/collections/whatsapp.ts",   // the same, for collections
    "src/lib/collections/index.ts",      // the collections sender's credential lookup
    "src/lib/data.ts",                   // comment only (documents the allowlist)
  ]);
  const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const users = walk("src").filter((f) => /credentialsFor\(/.test(code(f)));
  const stray = users.filter((f) => !ALLOWED.has(f));
  check(stray.length === 0, "allowlist: credentialsFor() is used only by the modules that need one credential for one job", stray.join(", "));
  check(users.length >= 4, "allowlist: found the real callers (the check is not vacuous)", users.join(", "));
}

/* 3. the agent's tools make no outbound calls */
{
  const t = read("src/lib/ai/tools.ts");
  check(!/\bfetch\(|safeFetch\(|https?:\/\//.test(t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")), "tools: no outbound HTTP from any tool");
  const h = read("src/lib/engine/handlers.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  check(!/\bfetch\(|safeFetch\(/.test(h), "handlers: no direct outbound HTTP from an action handler (sends go through the collections/email modules, behind approval)");
}

/* 4. payment/commerce connectors only read */
{
  const sync = read("src/lib/sync/index.ts").replace(/\/\*[\s\S]*?\*\//g, "");
  const methods = [...sync.matchAll(/method:\s*"([A-Z]+)"/g)].map((m) => m[1]);
  check(methods.every((m) => m === "GET"), "sync: every connector call is a GET (or the default GET)", methods.join(","));
  check(!/api\.stripe\.com\/v1\/(refunds|payouts|transfers|charges\/[^"`]*\/capture)/.test(sync) && !/api\.razorpay\.com\/v1\/(refunds|payouts|payments\/[^"`]*\/capture)/.test(sync), "sync: no refund, payout, transfer or capture endpoint is ever referenced");
}

console.log(`\nleast privilege: ${pass} passed, ${failures.length} failed`);
for (const x of failures) console.log("  ✗ " + x);
process.exit(failures.length ? 1 : 0);
