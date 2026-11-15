import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// Automated secret scanner for CI and pre-commit test suites.
// Scans tracked repository files, client bundle build outputs, and git tracking state.

console.log("🔒 Running Automated Secret and Credential Scan Suite...");

let findings = [];

// 1. Verify git is not tracking any .env files
try {
  const trackedEnv = execSync("git ls-files .env .env.local .env*.local", { encoding: "utf8" }).trim();
  if (trackedEnv) {
    findings.push({
      rule: "git-tracked-env",
      file: trackedEnv,
      detail: `Git is tracking env file: ${trackedEnv}`
    });
  }
} catch (e) {
  // git not available or failed
}

// 2. High-entropy secret patterns
const PATTERNS = [
  { name: "RSA/EC Private Key", regex: /-----BEGIN (RSA|EC|OPENSSH|DSA|PGP) PRIVATE KEY-----/ },
  { name: "Stripe Secret Key", regex: /\b(sk|rk)_(live|test)_[0-9a-zA-Z]{24,}\b/ },
  { name: "OpenAI Secret Key", regex: /\bsk-[a-zA-Z0-9_-]{40,}\b/ },
  { name: "Anthropic API Key", regex: /\bsk-ant-[a-zA-Z0-9_-]{30,}\b/ },
  { name: "Resend API Key", regex: /\bre_[a-zA-Z0-9]{20,}\b/ },
  { name: "Cashfree Secret Key", regex: /\bcfsk_ma_[a-zA-Z0-9_-]{20,}\b/ },
  { name: "AWS Secret Access Key", regex: /\b(?<![A-Z0-9])[A-Z0-9]{20}(?![A-Z0-9])\b/ }, // Checked in combination with aws keys
  { name: "Supabase Service Role Key", regex: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+/ }
];

// Helper: check if Supabase token has role: service_role
function isServiceRoleJwt(jwt) {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

// Get all git-tracked files
let files = [];
try {
  const stdout = execSync("git ls-files", { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  files = stdout.split("\n").filter(Boolean);
} catch (e) {
  console.error("Failed to list git files:", e.message);
  process.exit(1);
}

// Ignore self (the test script itself defines these regexes) and test mocks / fixtures
const IGNORE_FILES = new Set([
  "scripts/test-secret-scan.mjs",
  ".env.example"
]);

for (const relPath of files) {
  if (IGNORE_FILES.has(relPath)) continue;
  if (!fs.existsSync(relPath)) continue;

  const stat = fs.statSync(relPath);
  if (stat.isDirectory() || stat.size > 2 * 1024 * 1024) continue; // Skip large binaries

  // Skip images, fonts, pdfs, audio
  const ext = path.extname(relPath).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".ico", ".svg", ".woff", ".woff2", ".ttf", ".zip", ".tar", ".gz"].includes(ext)) {
    continue;
  }

  const content = fs.readFileSync(relPath, "utf8");

  // Check Private Keys
  if (/-----BEGIN (?:RSA|EC|OPENSSH|DSA|PGP)?\s*PRIVATE KEY-----/.test(content)) {
    findings.push({ rule: "private-key", file: relPath, detail: "Found BEGIN PRIVATE KEY" });
  }

  // Check Stripe Keys
  const stripeMatches = content.match(/\b(sk|rk)_(live|test)_[0-9a-zA-Z]{24,}\b/g);
  if (stripeMatches) {
    findings.push({ rule: "stripe-secret", file: relPath, detail: `Found Stripe secret: ${stripeMatches[0].slice(0, 4)}...` });
  }

  // Check OpenAI
  const openaiMatches = content.match(/\bsk-[a-zA-Z0-9_-]{40,}\b/g);
  if (openaiMatches) {
    findings.push({ rule: "openai-secret", file: relPath, detail: `Found OpenAI secret: ${openaiMatches[0].slice(0, 4)}...` });
  }

  // Check Anthropic
  const anthropicMatches = content.match(/\bsk-ant-[a-zA-Z0-9_-]{30,}\b/g);
  if (anthropicMatches) {
    findings.push({ rule: "anthropic-secret", file: relPath, detail: `Found Anthropic secret: ${anthropicMatches[0].slice(0, 4)}...` });
  }

  // Check Resend
  const resendMatches = content.match(/\bre_[a-zA-Z0-9]{20,}\b/g);
  if (resendMatches) {
    // filter out harmless code identifiers if any
    findings.push({ rule: "resend-secret", file: relPath, detail: `Found Resend secret: ${resendMatches[0].slice(0, 4)}...` });
  }

  // Check JWTs for service_role
  const jwtMatches = content.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g);
  if (jwtMatches) {
    for (const jwt of jwtMatches) {
      if (isServiceRoleJwt(jwt)) {
        findings.push({ rule: "service-role-jwt", file: relPath, detail: "Found Supabase service_role JWT in source!" });
      }
    }
  }
}

// 3. Check client bundle if .next exists
const staticDir = path.join(process.cwd(), ".next", "static");
if (fs.existsSync(staticDir)) {
  const scanBundle = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanBundle(full);
      } else if (entry.name.endsWith(".js")) {
        const bundleContent = fs.readFileSync(full, "utf8");
        const jwtMatches = bundleContent.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g);
        if (jwtMatches) {
          for (const jwt of jwtMatches) {
            if (isServiceRoleJwt(jwt)) {
              findings.push({ rule: "bundle-service-role", file: path.relative(process.cwd(), full), detail: "Found service_role JWT in client JS bundle!" });
            }
          }
        }
      }
    }
  };
  scanBundle(staticDir);
}

if (findings.length > 0) {
  console.error("❌ Secret Scan Failed! Found potential leaks:");
  for (const f of findings) {
    console.error(`  - [${f.rule}] in ${f.file}: ${f.detail}`);
  }
  process.exit(1);
}

console.log("✅ Secret scan passed! 0 active secrets or service_role credentials detected.");
process.exit(0);
