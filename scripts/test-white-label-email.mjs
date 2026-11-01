/**
 * White-label email: alert and decision digests carry the workspace's (or its
 * firm's / group's) name, logo and colour on plans that include white-label.
 */
import { readFileSync } from "node:fs";
const B = await import("../src/lib/email-brand.ts");
let pass = 0; const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(n + (d ? `\n      ${d}` : "")));
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const future = new Date(Date.now() + 30 * 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();
const live = (o) => ({ subscription_status: "active", subscription_ends_at: future, ...o });

/* accent hex matches the app palette */
const utils = read("src/lib/utils.ts");
const hslHex = (h, s, l) => {
  s /= 100; l /= 100; const k = (n) => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return "#" + [f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, "0")).join("");
};
for (const m of utils.matchAll(/(\w+):\s*\{ light: "(\d+) (\d+)% (\d+)%"/g)) {
  const want = hslHex(+m[2], +m[3], +m[4]);
  const got = B.ACCENT_HEX[m[1]];
  check(got && Math.max(...[1, 3, 5].map((i) => Math.abs(parseInt(got.slice(i, i + 2), 16) - parseInt(want.slice(i, i + 2), 16)))) <= 1, `accent ${m[1]} hex matches the app`, `${got} vs ${want}`);
}

/* own plan */
const cmd = live({ id: "o1", plan: "command", name: "Sharma Steel", logo_url: "https://sharma.in/logo.png", accent: "rose" });
const b1 = B.pickEmailBrand(cmd);
check(b1 && b1.name === "Sharma Steel" && b1.logoUrl === "https://sharma.in/logo.png" && b1.color === B.ACCENT_HEX.rose, "a Command workspace brands its own email");
check(B.pickEmailBrand(live({ id: "o2", plan: "watchpro", name: "X" })) === null, "Watch Pro does not include white-label");
check(B.pickEmailBrand({ ...cmd, subscription_status: "cancelled", subscription_ends_at: past }) === null, "a lapsed Command workspace goes back to Cortex branding");
check(B.pickEmailBrand({ ...cmd, subscription_status: "suspended" }) === null, "a suspended workspace never brands");
check(B.pickEmailBrand({ ...cmd, logo_url: "http://x.in/l.png" }).logoUrl === null, "a non-https logo is dropped");
check(B.pickEmailBrand({ ...cmd, logo_url: "javascript:alert(1)" }).logoUrl === null, "a script URL is not a logo");
check(B.pickEmailBrand({ ...cmd, accent: "nope" }).color === B.DEFAULT_BRAND_COLOR, "unknown accent → neutral colour");
check(B.pickEmailBrand({ ...cmd, name: "  " }) === null, "no name → no white-label");
check(!/[<>"]/.test(B.pickEmailBrand({ ...cmd, name: 'Evil <script>"x' }).name), "name is cleaned");

/* group company */
const group = live({ id: "g1", plan: "enterprise", name: "Tata Group", logo_url: "https://g.in/l.png", accent: "indigo" });
const company = { id: "k1", plan: "watch", subscription_status: "trialing", trial_ends_at: past, practice_org_id: "g1", name: "Tata Steel Pune" };
const b2 = B.pickEmailBrand(company, group);
check(b2 && b2.name === "Tata Steel Pune", "a group company uses its own name");
check(b2 && b2.logoUrl === "https://g.in/l.png" && b2.color === B.ACCENT_HEX.indigo, "…and the group's logo and colour when it has none");
check(B.pickEmailBrand({ ...company, logo_url: "https://k.in/me.png", accent: "sky" }, group).logoUrl === "https://k.in/me.png", "its own logo wins");
check(B.pickEmailBrand(company, { ...group, subscription_status: "cancelled", subscription_ends_at: past }) === null, "a lapsed group stops branding its companies");

/* CA firm client */
const firm = live({ id: "f1", plan: "practice", name: "Mehta & Co CA", logo_url: "https://mehta.in/l.png", accent: "emerald" });
const client = live({ id: "c1", plan: "watch", name: "Client Ltd", practice_org_id: "f1" });
const b3 = B.pickEmailBrand(client, firm);
check(b3 && b3.name === "Mehta & Co CA" && b3.color === B.ACCENT_HEX.emerald, "a pooled client of a Practice firm gets the firm's brand");
check(B.pickEmailBrand(client, { ...firm, subscription_status: "cancelled", subscription_ends_at: past }) === null, "a lapsed firm brands nothing");
check(B.pickEmailBrand({ ...client, practice_org_id: "other" }, firm) === null, "not linked to that firm → Cortex branding");
check(B.pickEmailBrand(client, { ...firm, plan: "watchpro" }) === null, "a firm without white-label lends no brand");

/* sender */
check(B.brandedSenderName(b1) === "Sharma Steel (via Cortex)" && b1.sender === "Sharma Steel (via Cortex)", "From name says who, and that Cortex relayed it");
check(!/[(),:;@<>"]/.test(B.brandedSenderName({ name: 'A, B: "C" <d@e>' , logoUrl: null, color: "#000"}).replace(/ \(via Cortex\)$/, "")), "From name cannot break the header");

/* renderer + call sites */
const be = strip(read("src/lib/branded-email.ts"));
check(/brand\?: OrgBrand \| null/.test(be), "renderBrandedEmail accepts a brand");
check(/if \(brand\) \{[\s\S]*Sent by \$\{esc\(brand\.name\)\} using Cortex/.test(be), "the branded shell keeps one line of provenance");
const shell = be.slice(be.indexOf("if (brand) {"), be.indexOf("</html>`;", be.indexOf("if (brand) {")));
check(!/BRAND\.(BADGES|TAGLINE|PHONE|WEBSITE|PRODUCT_NAME|COMPANY_NAME)/.test(shell) && !/\$\{badges\}/.test(shell), "the branded shell carries no MNB marketing");
check(/esc\(brand\.logoUrl\)/.test(shell) && /esc\(brand\.name\)/.test(shell), "brand values are escaped");
check(/export function brandFrom\(brand\?: OrgBrand \| null\)/.test(be), "brandFrom takes the brand");
for (const f of ["src/lib/alert-delivery.ts", "src/lib/engine/decision-digest.ts"]) {
  const src = strip(read(f));
  check(/orgEmailBrand\(svc, orgId\)/.test(src) && /brand \}\)/.test(src) && /brandFrom\(brand\)/.test(src), `${f} sends white-labelled`);
}
check(/capabilityPlanOf\(/.test(read("src/app/(app)/layout.tsx")) && /capabilityPlanOf\(/.test(read("src/app/(app)/settings/page.tsx")), "group companies can brand their workspace chrome");

if (failures.length) { console.error(`white-label-email: ${failures.length} failed\n  ✗ ` + failures.join("\n  ✗ ")); process.exit(1); }
console.log(`white-label-email: ${pass} checks passed`);
