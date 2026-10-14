/*
  THE PUBLIC API, END TO END — keys, scopes, tenancy, paging, errors, docs.

  The real route handlers and lib/api/auth.ts are compiled and run against an
  in-memory Supabase (two workspaces, synthetic data only). Nothing here
  touches a network or a real database.

    1. Key format and hashing: 256-bit secret, prefix, only a hash stored.
    2. judgeKey: valid, expired, revoked, insufficient scope, legacy (pre-scopes).
    3. Routes: missing / invalid / revoked / expired / wrong-scope keys refused
       with the right status and code; a valid key reads its OWN workspace and
       never the other one (cross-tenant), whatever parameters it sends.
    4. Paging: keyset cursor walks every row exactly once; a forged cursor is a 400.
    5. Validation: unknown parameter, bad enum, bad date, limit bounds → 400.
    6. Rate limit → 429 with Retry-After; usage and last_used recorded.
    7. OpenAPI: every route file has a path and every path a route file;
       webhook events match lib/webhooks.ts.
    8. Server actions: lifecycle via service role, MFA on create/rotate,
       revoke keeps the row; migration revokes browser writes.

  Run: node --experimental-strip-types --no-warnings scripts/test-api-v1.mjs
*/
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
let pass = 0; const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? `\n      ${d}` : ""}`));
const read = (p) => readFileSync(join(root, p), "utf8");
const sha = (s) => createHash("sha256").update(s).digest("hex");

/* ---------------- 1–2. pure ---------------- */
const K = await import("../src/lib/api-keys.ts");
{
  let n = 0;
  const rand = (len) => Uint8Array.from({ length: len }, () => (n++ * 37 + 11) & 0xff);
  const k = K.newKey(rand, sha);
  check(/^mnbc_[0-9a-f]{10}_[0-9a-f]{64}$/.test(k.key), "key: mnbc_<10 hex>_<64 hex> (256-bit secret)", k.key);
  check(k.hash === sha(k.key) && k.hash.length === 64 && !k.hash.includes(k.key.slice(16)), "key: stored value is SHA-256 of the whole key");
  check(k.prefix === k.key.slice(0, 15) && !k.prefix.includes(k.key.slice(16, 30)), "key: prefix identifies it without the secret");
  let threw = false; try { K.newKey(() => new Uint8Array(3), sha); } catch { threw = true; }
  check(threw, "key: a short random source is refused, not padded");
  const { randomBytes } = await import("node:crypto");
  const a = K.newKey((x) => randomBytes(x), sha), b = K.newKey((x) => randomBytes(x), sha);
  check(a.key !== b.key && a.prefix !== b.prefix, "key: two real keys differ");
  check(K.plausibleKey(a.key) && K.plausibleKey("mnb_" + "a".repeat(64)) && !K.plausibleKey("") && !K.plausibleKey("x".repeat(201)) && !K.plausibleKey("abc def ghi jkl mno"),
    "plausibleKey: v2 and v1 shapes pass; empty, huge and spaced do not");
}
{
  const H = (o) => ({ get: (n) => o[n.toLowerCase()] ?? null });
  check(K.keyFromHeaders(H({ authorization: "Bearer abc123" })) === "abc123", "header: Authorization Bearer");
  check(K.keyFromHeaders(H({ "x-api-key": "xyz" })) === "xyz", "header: x-api-key still honoured");
  check(K.keyFromHeaders(H({ authorization: "Basic abc" })) === "", "header: other schemes are not a key");
}
{
  const now = Date.parse("2026-10-13T00:00:00Z");
  const base = { id: "k", org_id: "o", scopes: ["metrics:read"], expires_at: null, revoked_at: null };
  check(K.judgeKey(base, "metrics:read", now).ok === true, "judge: valid key, right scope");
  const ex = K.judgeKey({ ...base, expires_at: "2026-10-12T23:59:59Z" }, "metrics:read", now);
  check(!ex.ok && ex.status === 401 && ex.code === "expired_key", "judge: expired → 401 expired_key");
  check(!K.judgeKey({ ...base, expires_at: "2026-10-13T00:00:00Z" }, "metrics:read", now).ok, "judge: expiring exactly now is expired");
  const rv = K.judgeKey({ ...base, revoked_at: "2026-10-01T00:00:00Z" }, "metrics:read", now);
  check(!rv.ok && rv.status === 401 && rv.code === "revoked_key", "judge: revoked → 401 revoked_key");
  const sc = K.judgeKey(base, "ingest:write", now);
  check(!sc.ok && sc.status === 403 && sc.code === "insufficient_scope", "judge: missing scope → 403 insufficient_scope");
  check(!K.judgeKey(null, "metrics:read", now).ok, "judge: no row → invalid");
  check(K.judgeKey({ ...base, scopes: undefined }, "ingest:write", now).ok && !K.judgeKey({ ...base, scopes: undefined }, "invoices:read", now).ok,
    "judge: pre-migration key keeps exactly its v1 powers (metrics:read, ingest:write), nothing more");
  check(!K.judgeKey({ ...base, scopes: [] }, "metrics:read", now).ok && !K.judgeKey({ ...base, scopes: null }, "metrics:read", now).ok,
    "judge: after migration, no scopes means no powers");
  check(!K.judgeKey({ ...base, scopes: ["admin", "*"] }, "metrics:read", now).ok, "judge: invented scopes grant nothing");
  check(K.judgeKey(base, ["ingest:write", "metrics:read"], now).ok && !K.judgeKey(base, [], now).ok, "judge: any-of list (whoami), empty list grants nothing");
  check(K.expiryFrom("never", now) === null && K.expiryFrom("30", now) === "2026-11-12T00:00:00.000Z" && K.expiryFrom("forever-please", now) === "2027-10-13T00:00:00.000Z",
    "expiry: never / 30 days / unknown input falls back to a year, never to 'never'");
  check(K.graceHours("0") === 0 && K.graceHours("168") === 168 && K.graceHours("99999") === 24, "rotation grace: 0, 24h, 7d only");
  check(K.hourlyLimit("command", "write") > K.hourlyLimit("watchpro", "write") && K.hourlyLimit("", "read") === 600, "limits: bigger plans get more; unknown gets the floor");
  check(K.keyStatus({ revoked_at: "x" }, now).usable === false && K.keyStatus({ expires_at: "2026-10-20T00:00:00Z" }, now).state === "expiring", "status: revoked unusable; under 14 days shows expiring");
  check(K.shouldTouch(null, now) && !K.shouldTouch(new Date(now - 60_000).toISOString(), now) && K.shouldTouch(new Date(now - 6 * 60_000).toISOString(), now), "last_used: written at most every 5 minutes");
}

/* ---------------- http helpers ---------------- */
const Hh = await import("../src/lib/api/http.ts");
{
  const row = { created_at: "2026-10-01T10:00:00.123456+00:00", id: "6f1c2b9e-1111-4222-8333-944455556666" };
  const c = Hh.encodeCursor(row);
  check(JSON.stringify(Hh.decodeCursor(c)) === JSON.stringify({ c: row.created_at, i: row.id }), "cursor: round-trips");
  const evil = Buffer.from(JSON.stringify({ c: "2026-10-01T10:00:00Z),org_id.neq.x,(", i: row.id })).toString("base64url");
  check(Hh.decodeCursor(evil) === "bad", "cursor: a filter-injection payload is refused");
  check(Hh.decodeCursor("!!!") === "bad" && Hh.decodeCursor("a".repeat(300)) === "bad", "cursor: junk and oversize refused");
  const u = (q) => new URL("https://x.test/api?" + q);
  check(Hh.isErr(Hh.parsePage(u("limit=0"))) && Hh.isErr(Hh.parsePage(u("limit=201"))) && Hh.isErr(Hh.parsePage(u("limit=1e3"))) && Hh.parsePage(u("limit=200")).limit === 200,
    "limit: 1–200 whole numbers only");
}

/* ---------------- 3–6. routes against an in-memory Supabase ---------------- */
const out = mkdtempSync(join(tmpdir(), "apiv1-"));
const cfg = join(out, "tsconfig.json");
const entries = ["src/lib/api/auth.ts", "src/lib/api/list.ts", "src/app/api/v1/invoices/route.ts", "src/app/api/v1/customers/route.ts",
  "src/app/api/v1/whoami/route.ts", "src/app/api/v1/metrics/route.ts", "src/app/api/v1/sales-orders/route.ts", "src/app/api/v1/leads/route.ts",
  "src/app/api/v1/ingest/route.ts", "src/lib/api/openapi.ts"];
writeFileSync(cfg, JSON.stringify({
  compilerOptions: { outDir: out, module: "esnext", target: "es2022", moduleResolution: "bundler", skipLibCheck: true, noCheck: true,
    baseUrl: root, paths: { "@/*": ["src/*"] }, rootDir: join(root, "src") },
  files: entries.map((f) => join(root, f)),
}));
try { execFileSync(join(root, "node_modules/.bin/tsc"), ["-p", cfg], { cwd: root, stdio: "pipe" }); }
catch (e) { console.error((e.stdout || "").toString().slice(0, 1500)); }
const walk = (d, acc = []) => { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? walk(p, acc) : (p.endsWith(".js") && acc.push(p)); } return acc; };
const nextServer = pathToFileURL(join(root, "node_modules/next/server.js")).href;
for (const p of walk(out)) {
  const up = relative(dirname(p), out) || ".";
  writeFileSync(p, readFileSync(p, "utf8")
    .replace(/^import ["']server-only["'];?\s*$/m, "")
    .replace(/from "next\/server"/g, `from "${nextServer}"`)
    .replace(/(from |import\()"@\/([a-zA-Z0-9_.\/-]+?)(\.ts)?"/g, (_, kw, m) => `${kw}"${up}/${m}.js"`)
    /* Pure libs import each other as "./x.ts" (so tests can load them directly); the emitted JS needs ".js". */
    .replace(/(from |import\()"(\.{1,2}\/[a-zA-Z0-9_.\/-]+?)\.ts"/g, (_, kw, m) => `${kw}"${m}.js"`));
}
/* Fakes for the two modules that would reach the network. */
mkdirSync(join(out, "lib/supabase"), { recursive: true });
writeFileSync(join(out, "lib/supabase/server.js"), `export const hasSupabase = () => true; export const serviceClient = () => globalThis.__svc;`);
writeFileSync(join(out, "lib/ratelimit.js"), `export async function enforce(rules) { (globalThis.__rl ||= []).push(...rules); return globalThis.__overLimit ? rules[0] : null; }`);
writeFileSync(join(out, "lib/metrics.js"), `export async function recomputeQuietly(o) { (globalThis.__recomputed ||= []).push(o); }`);
writeFileSync(join(out, "lib/ingest-scan.js"), `export async function flagSuspiciousRows() {}`);

/* ---- the fake database ---- */
const A = "aaaaaaaa-0000-4000-8000-000000000001", B = "bbbbbbbb-0000-4000-8000-000000000002";
const C = "cccccccc-0000-4000-8000-000000000003", D = "dddddddd-0000-4000-8000-000000000004", E = "eeeeeeee-0000-4000-8000-000000000005";
const keyFor = (s) => "mnbc_" + s.padEnd(10, "0").slice(0, 10) + "_" + sha(s).slice(0, 64);
const KEYS = {
  aRead: keyFor("aread"), aIngest: keyFor("aingest"), aRevoked: keyFor("arev"), aExpired: keyFor("aexp"), bRead: keyFor("bread"), aMetrics: keyFor("amet"),
  cIngest: keyFor("cingest"), cRead: keyFor("cread"), dRead: keyFor("dread"), eLegacy: keyFor("elegacy"),
};
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const db = {
  /* A is on Practice (api + api_write). C is on Watch Pro (api, no api_write). D is on Command but its period ended. E is on Watch (no api). */
  organizations: [{ id: A, name: "Acme Synthetic", plan: "practice" }, { id: B, name: "Beta Synthetic", plan: "command" },
    { id: C, name: "Gamma Synthetic", plan: "watchpro", subscription_status: "active" },
    { id: D, name: "Delta Synthetic", plan: "command", subscription_status: "active", subscription_ends_at: "2026-01-01T00:00:00Z", credits: 9000 },
    { id: E, name: "Eps Synthetic", plan: "watch", subscription_status: "active" }],
  api_keys: [
    { id: uuid(901), org_id: A, key_hash: sha(KEYS.aRead), key_prefix: KEYS.aRead.slice(0, 15), scopes: ["invoices:read", "customers:read", "sales:read", "leads:read"], expires_at: null, revoked_at: null, last_used_at: null, label: "read" },
    { id: uuid(902), org_id: A, key_hash: sha(KEYS.aIngest), key_prefix: "p2", scopes: ["ingest:write"], expires_at: null, revoked_at: null, last_used_at: null },
    { id: uuid(903), org_id: A, key_hash: sha(KEYS.aRevoked), key_prefix: "p3", scopes: ["invoices:read"], expires_at: null, revoked_at: "2026-10-01T00:00:00Z", last_used_at: null },
    { id: uuid(904), org_id: A, key_hash: sha(KEYS.aExpired), key_prefix: "p4", scopes: ["invoices:read"], expires_at: "2020-01-01T00:00:00Z", revoked_at: null, last_used_at: null },
    { id: uuid(905), org_id: B, key_hash: sha(KEYS.bRead), key_prefix: "p5", scopes: ["invoices:read", "customers:read"], expires_at: null, revoked_at: null, last_used_at: null },
    { id: uuid(906), org_id: A, key_hash: sha(KEYS.aMetrics), key_prefix: "p6", scopes: ["metrics:read"], expires_at: null, revoked_at: null, last_used_at: null },
    { id: uuid(907), org_id: C, key_hash: sha(KEYS.cIngest), key_prefix: "p7", scopes: ["ingest:write"], expires_at: null, revoked_at: null, last_used_at: null },
    { id: uuid(908), org_id: C, key_hash: sha(KEYS.cRead), key_prefix: "p8", scopes: ["invoices:read"], expires_at: null, revoked_at: null, last_used_at: null },
    { id: uuid(909), org_id: D, key_hash: sha(KEYS.dRead), key_prefix: "p9", scopes: ["invoices:read"], expires_at: null, revoked_at: null, last_used_at: null },
    /* A key from before scopes: LEGACY_SCOPES give it ingest:write on any plan — the capability check must still refuse it on Watch. */
    { id: uuid(910), org_id: E, key_hash: sha(KEYS.eLegacy), key_prefix: "p10", expires_at: null, revoked_at: null, last_used_at: null },
  ],
  invoices: [], customers: [], sales_orders: [], leads: [],
  health_metrics: [{ org_id: A, metric_key: "dso", label: "DSO", value: 41, unit: "days", delta_pct: 2, status: "warn" }, { org_id: B, metric_key: "dso", label: "DSO", value: 99, unit: "days", delta_pct: 0, status: "bad" }],
};
for (let i = 0; i < 7; i++) db.invoices.push({ id: uuid(100 + i), org_id: A, invoice_no: `A-${i}`, party: "P", amount: 1000 + i, status: i % 2 ? "paid" : "pending", type: i < 5 ? "receivable" : "payable", issue_date: "2026-09-01", due_date: `2026-10-0${i + 1}`, created_at: `2026-10-0${i + 1}T10:00:00.000000+00:00`, secret_internal: "never-exposed" });
db.invoices.push({ id: uuid(107), org_id: A, invoice_no: "A-tie", party: "P", amount: 1, status: "pending", type: "receivable", issue_date: null, due_date: null, created_at: "2026-10-07T10:00:00.000000+00:00" });
for (let i = 0; i < 3; i++) db.invoices.push({ id: uuid(200 + i), org_id: B, invoice_no: `B-${i}`, party: "Q", amount: 9e6, status: "pending", type: "receivable", issue_date: null, due_date: null, created_at: `2026-10-0${i + 1}T11:00:00.000000+00:00` });
db.customers.push({ id: uuid(300), org_id: A, name: "Real", is_demo: false, created_at: "2026-10-01T00:00:00+00:00" }, { id: uuid(301), org_id: A, name: "Sample", is_demo: true, created_at: "2026-10-02T00:00:00+00:00" }, { id: uuid(302), org_id: A, name: "Old", is_demo: null, created_at: "2026-10-03T00:00:00+00:00" });

const usage = []; const updates = []; const rpcs = [];
function q(table) {
  let rows = (db[table] || []).slice(); let cols = null; let lim = Infinity; const orders = []; let mode = "select"; let patch = null; let single = null;
  const api = {
    select(c) { if (mode === "select") cols = c.split(",").map((s) => s.trim()); return api; },
    eq(c, v) { rows = rows.filter((r) => r[c] === v); return api; },
    not(c, op, v) { if (op === "is") rows = rows.filter((r) => r[c] !== v); return api; },
    is(c, v) { rows = rows.filter((r) => (r[c] ?? null) === v); return api; },
    gte(c, v) { rows = rows.filter((r) => r[c] != null && r[c] >= v); return api; },
    lte(c, v) { rows = rows.filter((r) => r[c] != null && r[c] <= v); return api; },
    or(f) {
      const m = /^created_at\.lt\."([^"]+)",and\(created_at\.eq\."([^"]+)",id\.lt\.([0-9a-f-]+)\)$/.exec(f);
      if (!m) throw new Error("unexpected or filter: " + f);
      const t = (s) => Date.parse(s);
      rows = rows.filter((r) => t(r.created_at) < t(m[1]) || (t(r.created_at) === t(m[2]) && r.id < m[3]));
      return api;
    },
    order(c, o) { orders.push([c, o?.ascending !== false]); return api; },
    limit(n) { lim = n; return api; },
    update(p) { mode = "update"; patch = p; return api; },
    insert(p) { mode = "insert"; patch = p; return api; },
    maybeSingle() { single = "maybe"; return api; },
    single() { single = "one"; return api; },
    then(res, rej) {
      try {
        if (mode === "update") { for (const r of rows) Object.assign(r, patch); updates.push({ table, patch, n: rows.length }); return Promise.resolve({ data: rows, error: null }).then(res, rej); }
        if (mode === "insert") { db[table].push(patch); return Promise.resolve({ data: patch, error: null }).then(res, rej); }
        let out = rows.slice();
        for (const [c, asc] of orders.slice().reverse()) out.sort((x, y) => (x[c] < y[c] ? -1 : x[c] > y[c] ? 1 : 0) * (asc ? 1 : -1));
        out = out.slice(0, lim);
        if (cols && !cols.includes("*")) out = out.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null])));
        const data = single ? (out[0] ?? null) : out;
        return Promise.resolve({ data, error: null }).then(res, rej);
      } catch (e) { return Promise.reject(e).then(res, rej); }
    },
  };
  return api;
}
globalThis.__svc = {
  from: q,
  rpc: async (fn, args) => {
    rpcs.push({ fn, args });
    if (fn === "api_usage_bump") { usage.push(args); return { data: null, error: null }; }
    if (fn === "api_ingest") {
      const row = db.api_keys.find((k) => k.key_hash === sha(args.p_key) && !k.revoked_at && k.scopes.includes("ingest:write"));
      if (!row) return { data: { ok: false, error: "invalid api key" }, error: null };
      return { data: { ok: true, written: args.p_rows.length, skipped_no_key: 0, note: null }, error: null };
    }
    return { data: null, error: { message: "unknown fn" } };
  },
};

const route = async (p) => import(pathToFileURL(join(out, p)).href);
const inv = await route("app/api/v1/invoices/route.js");
const cus = await route("app/api/v1/customers/route.js");
const who = await route("app/api/v1/whoami/route.js");
const met = await route("app/api/v1/metrics/route.js");
const ing = await route("app/api/v1/ingest/route.js");
const call = async (mod, method, path, key, init = {}) => {
  const headers = new Headers(init.headers || {}); if (key) headers.set("authorization", `Bearer ${key}`);
  const res = await mod[method](new Request("https://cortex.test" + path, { method, headers, body: init.body }));
  let body = null; try { body = await res.json(); } catch {}
  return { status: res.status, body, headers: res.headers };
};

{
  let r = await call(inv, "GET", "/api/v1/invoices", null);
  check(r.status === 401 && r.body?.code === "missing_key" && /^req_/.test(r.body?.request_id) && r.headers.get("x-request-id") === r.body.request_id, "route: no key → 401 missing_key with request_id", JSON.stringify(r.body));
  r = await call(inv, "GET", "/api/v1/invoices", keyFor("nobody"));
  check(r.status === 401 && r.body?.code === "invalid_key", "route: unknown key → 401 invalid_key");
  r = await call(inv, "GET", "/api/v1/invoices", KEYS.aRevoked);
  check(r.status === 401 && r.body?.code === "revoked_key", "route: revoked key → 401 revoked_key");
  r = await call(inv, "GET", "/api/v1/invoices", KEYS.aExpired);
  check(r.status === 401 && r.body?.code === "expired_key", "route: expired key → 401 expired_key");
  r = await call(inv, "GET", "/api/v1/invoices", KEYS.aIngest);
  check(r.status === 403 && r.body?.code === "insufficient_scope", "route: push-only key cannot read invoices → 403");
  check(usage.some((u) => u.p_key === uuid(903) && u.p_ok === false) && usage.some((u) => u.p_key === uuid(902) && u.p_ok === false), "usage: refused calls by real keys are counted as denied");

  r = await call(inv, "GET", "/api/v1/invoices?limit=200", KEYS.aRead);
  check(r.status === 200 && r.body.ok && r.body.data.length === 8 && r.body.data.every((x) => x.invoice_no.startsWith("A-")), "tenancy: workspace A's key sees only A's invoices", JSON.stringify(r.body).slice(0, 300));
  check(r.body.data.every((x) => !("secret_internal" in x) && !("org_id" in x)), "fields: only the allow-listed columns leave the server");
  const rb = await call(inv, "GET", "/api/v1/invoices?limit=200", KEYS.bRead);
  check(rb.status === 200 && rb.body.data.length === 3 && rb.body.data.every((x) => x.invoice_no.startsWith("B-")), "tenancy: workspace B's key sees only B's invoices");
  /* Every parameter an attacker might try to widen the tenant with is refused, not honoured. */
  for (const p of [`org_id=${B}`, `org=${B}`, "select=*", `or=(org_id.eq.${B})`]) {
    const x = await call(inv, "GET", `/api/v1/invoices?${p}`, KEYS.aRead);
    check(x.status === 400 && x.body.code === "bad_request", `tenancy: parameter "${p.split("=")[0]}" is refused (400), never applied`);
  }
  r = await call(inv, "GET", "/api/v1/invoices?type=payable", KEYS.aRead);
  check(r.status === 200 && r.body.data.length === 2 && r.body.data.every((x) => x.type === "payable"), "filter: type=payable");
  r = await call(inv, "GET", "/api/v1/invoices?due_from=2026-10-03&due_to=2026-10-04", KEYS.aRead);
  check(r.status === 200 && r.body.data.map((x) => x.invoice_no).sort().join() === "A-2,A-3", "filter: due date range");
  for (const [qs, why] of [["type=everything", "enum"], ["due_from=13/10/2026", "date"], ["limit=500", "limit"], ["status=paid;drop", "slug"], ["cursor=zzz", "cursor"]]) {
    const x = await call(inv, "GET", `/api/v1/invoices?${qs}`, KEYS.aRead);
    check(x.status === 400 && x.body.code === "bad_request", `validation: bad ${why} → 400`);
  }

  /* Keyset paging: every row exactly once, including two rows sharing a timestamp. */
  const seen = []; let cursor = null; let pages = 0;
  do {
    const x = await call(inv, "GET", `/api/v1/invoices?limit=3${cursor ? `&cursor=${cursor}` : ""}`, KEYS.aRead);
    if (x.status !== 200) { failures.push("paging: page failed " + JSON.stringify(x.body)); break; }
    seen.push(...x.body.data.map((d) => d.id)); cursor = x.body.page.next_cursor; pages++;
  } while (cursor && pages < 10);
  check(seen.length === 8 && new Set(seen).size === 8 && pages === 3, "paging: 8 rows in pages of 3 → 3 pages, each row once (ties on created_at included)", `${seen.length} rows, ${pages} pages`);

  r = await call(cus, "GET", "/api/v1/customers", KEYS.aRead);
  check(r.status === 200 && r.body.data.map((c) => c.name).sort().join() === "Old,Real", "customers: sample (is_demo) records never returned; null kept");

  r = await call(who, "GET", "/api/v1/whoami", KEYS.aIngest);
  check(r.status === 200 && r.body.data.workspace.id === A && r.body.data.key.scopes.join() === "ingest:write", "whoami: any working key learns its workspace and scopes");
  r = await call(who, "GET", "/api/v1/whoami", KEYS.aRevoked);
  check(r.status === 401, "whoami: a revoked key is still refused");

  r = await call(met, "GET", "/api/v1/metrics", KEYS.aMetrics);
  check(r.status === 200 && r.body.metrics.length === 1 && r.body.metrics[0].value === 41, "metrics: own workspace only, v1 shape kept");
  r = await call(met, "GET", "/api/v1/metrics", KEYS.aRead);
  check(r.status === 403, "metrics: a key without metrics:read is refused");

  const body = JSON.stringify({ table: "invoices", rows: [{ invoice_no: "Z-1", amount: 5 }] });
  r = await call(ing, "POST", "/api/v1/ingest", KEYS.aIngest, { body, headers: { "content-type": "application/json" } });
  check(r.status === 200 && r.body.ok && r.body.written === 1 && (globalThis.__recomputed || []).includes(A), "ingest: push-only key writes, and its own workspace is recomputed", JSON.stringify(r.body));
  r = await call(ing, "POST", "/api/v1/ingest", KEYS.aRead, { body });
  check(r.status === 403, "ingest: a read key cannot write");
  r = await call(ing, "POST", "/api/v1/ingest", KEYS.aIngest, { body: JSON.stringify({ table: "memberships", rows: [{}] }) });
  check(r.status === 400 && /table must be one of/.test(r.body.error), "ingest: tables outside the list refused before the database");
  r = await call(ing, "POST", "/api/v1/ingest", KEYS.aIngest, { body: "{nope" });
  check(r.status === 400 && r.body.code === "bad_request", "ingest: invalid JSON → 400");
  r = await call(ing, "POST", "/api/v1/ingest", KEYS.aIngest, { body: "x".repeat(10), headers: { "content-length": String(6 * 1024 * 1024) } });
  check(r.status === 413 && r.body.code === "payload_too_large", "ingest: declared body over 5 MB → 413 before parsing");

  /* THE PLAN AT USE TIME (audit P0-8): a key keeps no power its workspace's live plan does not include. */
  r = await call(ing, "POST", "/api/v1/ingest", KEYS.cIngest, { body, headers: { "content-type": "application/json" } });
  check(r.status === 403 && /Pushing data in/.test(r.body?.error || ""), "plan: Watch Pro (no api_write) cannot push data in, even with an ingest key", JSON.stringify(r.body));
  r = await call(inv, "GET", "/api/v1/invoices", KEYS.cRead);
  check(r.status === 200, "plan: …but Watch Pro can still read (api)");
  r = await call(inv, "GET", "/api/v1/invoices", KEYS.dRead);
  check(r.status === 403 && /plan has ended/i.test(r.body?.error || ""), "plan: a LAPSED Command workspace's key is refused, credits notwithstanding", JSON.stringify(r.body));
  r = await call(ing, "POST", "/api/v1/ingest", KEYS.eLegacy, { body, headers: { "content-type": "application/json" } });
  check(r.status === 403, "plan: a pre-scopes key (legacy ingest:write) on Watch is refused", JSON.stringify(r.body));
  check(usage.some((u) => u.p_key === uuid(909) && u.p_ok === false), "plan: refusals are counted as denied usage");

  check((globalThis.__rl || []).some((x) => x.key === `api:read:${uuid(901)}` && x.limit === K.hourlyLimit("practice", "read")) &&
        (globalThis.__rl || []).every((x) => !Object.values(KEYS).some((k) => x.key.includes(k))),
    "rate limit: bucket is the key's row id at the plan's allowance — the secret never becomes a bucket name");
  globalThis.__overLimit = true;
  r = await call(inv, "GET", "/api/v1/invoices", KEYS.aRead);
  globalThis.__overLimit = false;
  check(r.status === 429 && r.body.code === "rate_limited" && r.headers.get("retry-after"), "rate limit: 429 rate_limited with Retry-After");
  check(db.api_keys.find((k) => k.id === uuid(901)).last_used_at !== null, "last_used_at: recorded on a successful call");
  check(usage.some((u) => u.p_key === uuid(901) && u.p_ok === true && u.p_endpoint === "/api/v1/invoices"), "usage: successful calls counted per key and endpoint");
}

/* ---------------- 7. OpenAPI ↔ routes ---------------- */
{
  const O = await import(pathToFileURL(join(out, "lib/api/openapi.js")).href);
  const doc = O.buildOpenApi();
  const files = [];
  const scan = (d) => { for (const e of readdirSync(join(root, d))) { const p = join(d, e); statSync(join(root, p)).isDirectory() ? scan(p) : e === "route.ts" && files.push("/" + dirname(p).replace(/^src\/app\//, "")); } };
  scan("src/app/api/v1");
  const documented = new Set([...Object.keys(doc.paths), "/api/v1/openapi.json"]);
  const missingDoc = files.filter((f) => !documented.has(f));
  const missingRoute = Object.keys(doc.paths).filter((p) => !files.includes(p));
  check(!missingDoc.length && !missingRoute.length, "openapi: every v1 route documented, every documented path has a route", `undocumented: ${missingDoc} · no route: ${missingRoute}`);
  check(doc.openapi === "3.1.0" && doc.components.securitySchemes.bearer.scheme === "bearer", "openapi: 3.1 with bearer auth");
  const hooks = /WEBHOOK_EVENTS = \[([\s\S]*?)\] as const/.exec(read("src/lib/webhooks.ts"))[1].match(/"([a-z.]+)"/g).map((s) => s.slice(1, -1));
  check(hooks.join() === O.DOC_WEBHOOK_EVENTS.join() && Object.keys(doc.webhooks).join() === hooks.join(), "openapi: webhook events match lib/webhooks.ts", hooks.join());
  check(/timestamp \+ \\"\.\\" \+ rawBody|timestamp \+ "\." \+ rawBody/.test(JSON.stringify(doc.webhooks)) && /update\(`\$\{timestamp\}\.\$\{body\}`\)/.test(read("src/lib/webhooks.ts")),
    "openapi: the documented signature is the one webhooks.ts computes");
  check(doc.paths["/api/v1/invoices"].get.parameters.some((p) => p.name === "due_from"), "openapi: filters come from the resource table");
}

/* ---------------- 8. actions + migration (source) ---------------- */
{
  const acts = read("src/lib/actions.ts");
  const fn = (name) => { const i = acts.indexOf(`export async function ${name}`); const j = acts.indexOf("\nexport ", i + 10); return acts.slice(i, j); };
  const gen = fn("generateApiKey"), rot = fn("rotateApiKey"), rev = fn("revokeApiKey");
  check(/requireRole\("admin"\)/.test(gen) && /apiKeyGate\(orgId, "issue an API key"\)/.test(gen) && /requireCapability\(orgId, "api"/.test(gen), "create: admin + second factor + plan (live)");
  check(/svc\.from\("api_keys"\)\.insert/.test(gen) && !/sb\.from\("api_keys"\)\.insert/.test(gen), "create: written by the service role (browser writes are revoked)");
  check(/key_hash: k\.hash/.test(gen) && !/key: k\.key,/.test(gen.split("return { key: k.key")[0]), "create: only the hash is stored; plaintext only in the return value");
  check(/normaliseScopes/.test(gen) && /SCOPE_PRESETS\.read/.test(gen) && /expiryFrom/.test(gen), "create: scopes filtered to the catalogue, read-only default, expiry chosen");
  check(/keyAudit\(svc, \{[^}]*event: "created"/.test(gen) && !/keyAudit\([^)]*k\.key/.test(acts) && !/keyAudit\([^)]*k\.hash/.test(acts), "audit: created logged with the prefix, never the key or hash");
  check(/apiKeyGate\(orgId, grace === 0/.test(rot) && /rotated_from: id/.test(rot) && /revoked_at: new Date\(now\)/.test(rot) && /grace \* 3_600_000/.test(rot), "rotate: second factor; new key linked; old revoked (regenerate) or expires after grace");
  check(/\.eq\("org_id", orgId\)/.test(rot) && /\.eq\("org_id", orgId\)/.test(rev), "rotate/revoke: scoped to the caller's workspace");
  check(/\.update\(\{ revoked_at/.test(rev) && !/\.delete\(\)/.test(rev.split("isMissingCol(error)")[0]) && /\.is\("revoked_at", null\)/.test(rev) && /moved|data\?\.length/.test(rev), "revoke: marks revoked (row kept), only active keys, zero-row update is not success");
  check(/return revokeApiKey\(fd\)/.test(fn("deleteApiKey")), "delete: now revokes, so the trail survives");
  const mig = read("supabase/migrations/2026_zzzw_api_platform.sql");
  check(/revoke insert, update, delete on api_keys from anon, authenticated/.test(mig), "db: the browser can no longer write api_keys (MFA/plan bypass closed)");
  check(/update api_keys set scopes = array\['metrics:read', 'ingest:write'\] where scopes is null/.test(mig), "db: existing keys keep exactly their v1 powers");
  check((mig.match(/and revoked_at is null\s+and \(expires_at is null or expires_at > now\(\)\)/g) || []).length === 2, "db: both SQL entry points refuse revoked and expired keys");
  check(/'ingest:write' = any\(scopes\)/.test(mig) && /'metrics:read' = any\(scopes\)/.test(mig), "db: both SQL entry points check scope");
  check(/grant execute on function public\.api_usage_bump[^;]*to service_role/.test(mig) && /revoke all on function public\.api_usage_bump[^;]*from anon, authenticated/.test(mig), "db: usage counter is service-role only");
  check(!/drop table|drop column|truncate|delete from/i.test(mig.replace(/\/\*[\s\S]*?\*\//g, "")), "db: additive — no drops, truncates or deletes");
  check(read("supabase/migrations/ORDER.txt").includes("2026_zzzw_api_platform.sql"), "db: migration listed in ORDER.txt");
  const data = read("src/lib/data.ts");
  check(/map\(\(\{ key_hash, key, \.\.\.r \}\) => r\)/.test(data), "dashboard: key_hash never leaves the server");
  const page = read("src/app/(app)/developers/page.tsx");
  check(!/\?key=/.test(page) && /Authorization: Bearer YOUR_KEY/.test(page), "docs: header auth only, never a query-string key");
}

console.log(`\napi-v1: ${pass} passed, ${failures.length} failed`);
for (const x of failures) console.log("  ✗ " + x);
process.exit(failures.length ? 1 : 0);
