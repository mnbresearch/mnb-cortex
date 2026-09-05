import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/* Resolved from this file, not hardcoded — the suite has to run on any machine
   and in CI, not just the box it was written on. */
const root = resolve(import.meta.dirname, "..");
const out = mkdtempSync(join(tmpdir(), "byo-"));
const cfg = join(out, "tsconfig.json");

writeFileSync(cfg, JSON.stringify({
  compilerOptions: {
    outDir: out, module: "esnext", target: "es2022", moduleResolution: "bundler",
    skipLibCheck: true, baseUrl: root, paths: { "@/*": ["src/*"] }, rootDir: join(root, "src"),
  },
  files: [join(root, "src/lib/ai/byo.ts")],
}));
try { execFileSync(join(root, "node_modules/.bin/tsc"), ["-p", cfg], { cwd: root, stdio: "pipe" }); }
catch (e) { console.error((e.stdout || "").toString().slice(0, 800)); process.exit(1); }

/*
  Rewrite for plain Node: drop the `server-only` build marker, and turn the
  `@/` alias into a relative path from each emitted file back to the out root.
*/
const walk = (d, acc = []) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    statSync(p).isDirectory() ? walk(p, acc) : (p.endsWith(".js") && acc.push(p));
  }
  return acc;
};
for (const p of walk(out)) {
  const up = relative(dirname(p), out) || ".";
  writeFileSync(p, readFileSync(p, "utf8")
    .replace(/^import ["']server-only["'];?\s*$/m, "")
    .replace(/from "@\/([a-zA-Z0-9_\/-]+)"/g, (_, m) => `from "${up}/${m}.js"`));
}

const m = await import(pathToFileURL(join(out, "lib/ai/byo.js")).href);

let bad = 0;
const t = (name, got, want) => {
  const ok = got === want; if (!ok) bad++;
  console.log(`  ${ok ? "ok  " : "!!  "} ${name}${ok ? "" : `   got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

const PLATFORM = "PLATFORM-key-aaaaaaaaaaaaaaaaaaaaaaaa";
process.env.GEMINI_API_KEY = PLATFORM;

console.log("No workspace key in scope — must behave exactly as before:");
t("falls back to the platform key", m.aiKey("GEMINI_API_KEY"), PLATFORM);
t("usingOwnKey() is false", m.usingOwnKey(), false);

console.log("\nWorkspace key in scope:");
m.enterOrgAiKeys({ keys: { GEMINI_API_KEY: "WORKSPACE-key-bbbbbbbbbbbbbbbbbbbb" }, own: true });
t("the WORKSPACE key wins", m.aiKey("GEMINI_API_KEY"), "WORKSPACE-key-bbbbbbbbbbbbbbbbbbbb");
t("usingOwnKey() is true", m.usingOwnKey(), true);
t("a provider they did NOT configure falls back", m.aiKey("OPENAI_API_KEY"), undefined);

console.log("\nA half-pasted key must not take their AI down:");
m.enterOrgAiKeys({ keys: { GEMINI_API_KEY: "sk-short" }, own: true });
t("too-short workspace value is ignored", m.aiKey("GEMINI_API_KEY"), PLATFORM);

console.log("\nPlaceholder rejection still applies:");
process.env.OPENAI_API_KEY = "your-key-here-xxxxxxxxxxxxxxx";
t("a placeholder platform key is not used", m.aiKey("OPENAI_API_KEY"), undefined);

console.log("\nCatalogue:");
t("four providers offered", m.PROVIDERS.length, 4);
t("each names where to get a key", m.PROVIDERS.every((p) => p.where.startsWith("https://")), true);

console.log(bad ? `\n>>> ${bad} WRONG` : "\n>>> resolver behaves correctly");
process.exit(bad ? 1 : 0);
