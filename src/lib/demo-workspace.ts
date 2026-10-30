/**
 * MNB Cortex — Custom 7-Day Demo Account & Feature Configuration Engine.
 *
 * Provides Super Admins with granular control to provision custom demo workspaces:
 * - 7-day strictly enforced trial duration (compulsory upgrade upon expiry).
 * - Custom feature selection matrix across Finance, Compliance, Growth, Automation, and Advisory.
 * - 1-click industry-specific demo presets (Enterprise Full, CFO & Tax, Cash Flow & Recovery, AI COO).
 * - Realistic Indian SME sample data pre-seeding (invoices, 43B(h) payables, GST figures).
 * - Compulsory upgrade gating that locks demo workspaces upon expiry regardless of credit balance.
 *
 * Pure statutory and configuration logic — safe across client, server, and test runners.
 */

export const DEMO_TRIAL_DURATION_DAYS = 7;
export const DEMO_DEFAULT_STARTING_CREDITS = 2500;

export type DemoCategory = "finance" | "compliance" | "growth" | "automation" | "advisory";

export interface DemoFeatureDefinition {
  id: string;
  name: string;
  category: DemoCategory;
  description: string;
  defaultInEnterprise: boolean;
  routes: string[];
}

export const DEMO_FEATURE_CATALOGUE: DemoFeatureDefinition[] = [
  // --- Finance & Working Capital
  {
    id: "receivables",
    name: "Receivables & DSO Velocity",
    category: "finance",
    description: "Overdue debtor ranking, DSO tracking, and automated reminder drafting.",
    defaultInEnterprise: true,
    routes: ["/receivables", "/finance"],
  },
  {
    id: "collections",
    name: "Autonomous Collections Engine",
    category: "finance",
    description: "Polite multi-tone WhatsApp/email recovery with quiet hours and safety kill switch.",
    defaultInEnterprise: true,
    routes: ["/collections", "/approvals"],
  },
  {
    id: "msme_samadhaan",
    name: "MSME Samadhaan & MSEFC Notice Engine",
    category: "finance",
    description: "Statutory 15-day legal notices and pre-formatted petitions with 75% pre-deposit demand.",
    defaultInEnterprise: true,
    routes: ["/receivables"],
  },
  {
    id: "treds_arbitrage",
    name: "RBI TReDS Reverse Factoring Calculator",
    category: "finance",
    description: "48h non-recourse invoice auction liquidity against corporate buyer ratings.",
    defaultInEnterprise: true,
    routes: ["/forecast"],
  },
  {
    id: "upi_invoicing",
    name: "Native NPCI Dynamic UPI Invoicing",
    category: "finance",
    description: "Zero-fee vector UPI QR codes embedded directly on tax invoices for instant settlement.",
    defaultInEnterprise: true,
    routes: ["/invoice"],
  },
  {
    id: "bank_intelligence",
    name: "Bank Statement Intelligence",
    category: "finance",
    description: "CSV and PDF transaction reader, spend categorization, and net burn calculation.",
    defaultInEnterprise: true,
    routes: ["/bank", "/cashflow"],
  },

  // --- Compliance & Statutory Safeguards
  {
    id: "msme_43bh",
    name: "Section 43B(h) 45-Day Deduction Guard",
    category: "compliance",
    description: "Monitors overdue payments to Micro & Small vendors to prevent tax deduction loss.",
    defaultInEnterprise: true,
    routes: ["/msme"],
  },
  {
    id: "form3cd_clause22",
    name: "Tax Audit Form 3CD Clause 22 Pack",
    category: "compliance",
    description: "Statutory 6-part ICAI schedule, Section 16 penal interest, and 31.2% tax impact.",
    defaultInEnterprise: true,
    routes: ["/msme"],
  },
  {
    id: "gst_sentinel",
    name: "GST Rule 88C/88D Notice Risk Sentinel",
    category: "compliance",
    description: "GSTR-1 vs 3B and 3B vs 2B scanner (>20% & >₹25k) and DRC-01B/C reply templates.",
    defaultInEnterprise: true,
    routes: ["/gst"],
  },
  {
    id: "itc_reconciliation",
    name: "Statutory GSTR-2B ITC Matching Engine",
    category: "compliance",
    description: "Section 16(2)(aa) invoice-by-invoice matching and Rule 37A reversal defenses.",
    defaultInEnterprise: true,
    routes: ["/itc", "/gst-reader"],
  },
  {
    id: "tds_compliance",
    name: "TDS Section 206AB & Section 201 Shield",
    category: "compliance",
    description: "Non-filer higher rate withholding filter and 1.5% delay interest estimator.",
    defaultInEnterprise: true,
    routes: ["/tds"],
  },

  // --- Foresight & Advisory
  {
    id: "multi_agent_council",
    name: "Autonomous Multi-Agent Executive Council",
    category: "advisory",
    description: "4-Persona C-Suite Deliberation Chamber (Fractional CFO, COO, CRO, Tax Counsel).",
    defaultInEnterprise: true,
    routes: ["/strategy", "/boardroom"],
  },
  {
    id: "stress_testing",
    name: "Altman Z' Score & Stress-Test Engine",
    category: "advisory",
    description: "Emerging-market solvency index ($Z'$) with multi-vector delay and inflation shocks.",
    defaultInEnterprise: true,
    routes: ["/forecast"],
  },
  {
    id: "solvency_scorecard",
    name: "Cortex Solvency & Resilience Scorecard",
    category: "advisory",
    description: "0–100 objective health index with sector-specific benchmark weighting.",
    defaultInEnterprise: true,
    routes: ["/dashboard"],
  },

  // --- Automation & Autopilot
  {
    id: "workflows",
    name: "Autonomous Scheduled Workflows",
    category: "automation",
    description: "Custom multi-step business automations triggered on schedules or events.",
    defaultInEnterprise: true,
    routes: ["/workflows"],
  },
  {
    id: "alert_rules",
    name: "Nightly KPI Alert Monitoring Rules",
    category: "automation",
    description: "Custom threshold alerts delivered in a daily morning digest.",
    defaultInEnterprise: true,
    routes: ["/alerts"],
  },
  {
    id: "autopilot",
    name: "Autopilot AI Operations",
    category: "automation",
    description: "Automated reminder dispatching and operational actions within approved limits.",
    defaultInEnterprise: true,
    routes: ["/approvals"],
  },
  {
    id: "persistent_memory",
    name: "Cortex Business Memory",
    category: "automation",
    description: "Persistent storage of vendor agreements, payment terms, and operating preferences.",
    defaultInEnterprise: true,
    routes: ["/memory"],
  },
];

export type DemoPresetId = "enterprise_full" | "cfo_compliance" | "cashflow_recovery" | "ai_coo_foresight" | "custom";

export interface DemoPreset {
  id: DemoPresetId;
  name: string;
  badge: string;
  description: string;
  featureIds: string[];
}

export const DEMO_PRESETS: DemoPreset[] = [
  {
    id: "enterprise_full",
    name: "Full Enterprise Suite",
    badge: "🏆 18 Features",
    description: "Complete unrestricted access to all financial, statutory, foresight, and automation engines.",
    featureIds: DEMO_FEATURE_CATALOGUE.map((f) => f.id),
  },
  {
    id: "cfo_compliance",
    name: "CFO & Statutory Tax Compliance",
    badge: "🛡️ 6 Key Modules",
    description: "MSME Section 43B(h), Tax Audit Form 3CD Clause 22, GST Sentinel, GSTR-2B ITC, TDS, and Stress-Testing.",
    featureIds: [
      "msme_43bh",
      "form3cd_clause22",
      "gst_sentinel",
      "itc_reconciliation",
      "tds_compliance",
      "stress_testing",
    ],
  },
  {
    id: "cashflow_recovery",
    name: "Cash Flow & Collections Accelerator",
    badge: "⚡ 5 Key Modules",
    description: "Receivables & DSO, Collections WhatsApp Engine, MSME Samadhaan Petitions, TReDS Factoring, and Dynamic UPI.",
    featureIds: [
      "receivables",
      "collections",
      "msme_samadhaan",
      "treds_arbitrage",
      "upi_invoicing",
    ],
  },
  {
    id: "ai_coo_foresight",
    name: "AI COO & Autonomous Foresight",
    badge: "🤖 5 Key Modules",
    description: "Autonomous Multi-Agent Council, Solvency Scorecard, Workflows, Bank Intelligence, and Cortex Memory.",
    featureIds: [
      "multi_agent_council",
      "solvency_scorecard",
      "workflows",
      "bank_intelligence",
      "persistent_memory",
    ],
  },
  {
    id: "custom",
    name: "Custom Tailored Demo",
    badge: "🎛️ Selective",
    description: "Custom selection of individual modules tailored to prospect requirements.",
    featureIds: [],
  },
];

export interface DemoWorkspaceRecord {
  orgId: string;
  email: string;
  name?: string;
  company?: string;
  preset: DemoPresetId;
  features: string[];
  credits: number;
  durationDays: number;
  createdAt: string;
  expiresAt: string;
  compulsoryUpgrade: boolean;
}

/**
 * Calculates the exact expiry timestamp for a 7-day demo.
 */
export function calculateDemoExpiry(
  startDate: Date = new Date(),
  durationDays: number = DEMO_TRIAL_DURATION_DAYS
): { createdAt: string; expiresAt: string; daysRemaining: number } {
  const startMs = startDate.getTime();
  const endMs = startMs + durationDays * 86_400_000;
  return {
    createdAt: new Date(startMs).toISOString(),
    expiresAt: new Date(endMs).toISOString(),
    daysRemaining: durationDays,
  };
}

/**
 * Checks if a demo workspace is expired and subject to compulsory upgrade.
 */
export function isDemoCompulsoryUpgradeRequired(
  expiresAtIso: string | null | undefined,
  nowMs: number = Date.now()
): { expired: boolean; daysRemaining: number } {
  if (!expiresAtIso) return { expired: false, daysRemaining: 0 };
  const expMs = new Date(expiresAtIso).getTime();
  if (isNaN(expMs)) return { expired: false, daysRemaining: 0 };

  const diffMs = expMs - nowMs;
  if (diffMs <= 0) {
    return { expired: true, daysRemaining: 0 };
  }
  const days = Math.ceil(diffMs / 86_400_000);
  return { expired: false, daysRemaining: days };
}

/**
 * Generates the branded customer onboarding email body for the demo workspace.
 */
export function generateDemoWelcomeEmail(opts: {
  recipientName: string;
  email: string;
  companyName: string;
  presetName: string;
  features: string[];
  expiresAtDateStr: string;
  credits: number;
  appUrl: string;
  magicLinkUrl?: string;
}): string {
  const featureList = opts.features
    .map((fid) => {
      const def = DEMO_FEATURE_CATALOGUE.find((f) => f.id === fid);
      return def ? `• ${def.name}: ${def.description}` : null;
    })
    .filter(Boolean)
    .join("\n");

  const directAccessSection = opts.magicLinkUrl
    ? `Direct 1-Click Access (No password required):\n${opts.magicLinkUrl}\n\nOr sign in at:\n${opts.appUrl}/login?email=${encodeURIComponent(opts.email)}&demo=1`
    : `To activate your workspace, sign in using this email address (${opts.email}):\n${opts.appUrl}/login?email=${encodeURIComponent(opts.email)}&demo=1`;

  const loginInstructions = `How to sign in (no password has been preset):
• One-Click Email Link: Click "Email me a one-time login link" on the login screen to sign in passwordless via email OTP.
• Google Workspace: Click "Continue with Google" if your organization uses Google.
• Choose Your Own Password: Click "Create account" to set your own secure password.`;

  return `Hi ${opts.recipientName},

Welcome to MNB Cortex! Your 7-day customized demo workspace is ready.

Workspace: ${opts.companyName}
Demo Package: ${opts.presetName}
Valid Until: ${opts.expiresAtDateStr} (7-Day Evaluation Period)
Starting AI Credits: ${opts.credits.toLocaleString("en-IN")}

Key Capabilities Configured For Your Workspace:
${featureList}

${directAccessSection}

${loginInstructions}

Important Note on Demo Validity:
This evaluation workspace is active for exactly 7 days. After the 7-day trial period, a compulsory plan upgrade is required to preserve your live data, configured rules, and historical intelligence.

If you have questions or would like a guided walkthrough, simply reply to this email.

Best regards,
Team MNB Cortex · MNB Research
https://cortex.mnbresearch.com`;
}

/* ------------------------------------------------------------------ route gate */

/**
 * May a demo workspace with `features` open `path`?
 *
 * The provisioning screen let a super-admin pick features, and the choice was
 * stored and then read by nothing — every demo got the whole product. This is
 * the rule the app shell now applies:
 *
 *   - `null` / empty features = no restriction (not a demo, or a full demo).
 *   - DEMO_ALWAYS_OPEN (dashboard, chat, settings, billing…) and any route
 *     that NO catalogue feature owns are always open: the demo must be usable
 *     and payable.
 *   - A route owned by one or more features is open if ANY of those features
 *     was granted (several features share /receivables, /msme and so on).
 *
 * Matching is by path segment, so "/gst" covers "/gst/123" but not "/gst-calc".
 */
/** Always reachable in a demo, whatever was chosen: the home screen and the way to pay. */
export const DEMO_ALWAYS_OPEN = ["/dashboard", "/chat", "/settings", "/billing", "/pricing", "/onboarding", "/usage", "/help"] as const;

export function demoRouteAllowed(features: string[] | null | undefined, path: string | null | undefined): boolean {
  if (!features || !features.length) return true;
  const p = String(path || "").split(/[?#]/)[0] || "/";
  if (DEMO_ALWAYS_OPEN.some((r) => p === r || p.startsWith(r + "/"))) return true;
  const covers = (route: string) => p === route || p.startsWith(route + "/");
  const owners = DEMO_FEATURE_CATALOGUE.filter((f) => f.routes.some(covers));
  if (!owners.length) return true;
  const granted = new Set(features);
  return owners.some((f) => granted.has(f.id));
}
