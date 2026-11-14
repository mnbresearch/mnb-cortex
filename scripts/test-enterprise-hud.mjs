/*
  EXECUTIVE COMMAND HUD, FORENSIC AUDIT SENTINEL & DIGITAL TWIN TEST SUITE

  Proves end-to-end:
    1. Forensic Audit Scoring Engine:
       - Big-4 pre-flight score (0-100), letter grade (A+, A, B, C, D), and audit readiness status.
       - MSME Section 43B(h) vector: overdue supplier tax disallowance (30% penalty + 3x interest).
       - GSTR-2B Rule 88D ITC vector: vendor match & ITC clawback risk.
       - TDS 194Q / 194C / 194J deduction compliance vector.
       - Forensic invoice anomaly detection: duplicate invoices and suspicious round-number disbursements.
    2. Digital Twin Macroeconomic & Balance Sheet Simulator:
       - Shock simulation under debtor delay, counterparty default, MSME 45-day compression, COGS inflation.
       - Monotonicity & non-negative invariant bounds (simulated runway >= 0, cash shortfall >= 0).
       - Autonomous mitigation playbooks generation (Dynamic UPI QR acceleration, selective factoring).
    3. Database Migration & RLS Security via PGlite:
       - Schema validation for enterprise_audit_snapshots and digital_twin_scenarios.
       - Row Level Security (RLS) enforcement and role-rank gates (Viewer read-only, Analyst write, Manager delete).
       - Multi-tenant strict isolation between distinct orgs.
    4. Server Action & Component Wiring:
       - getEnterpriseHudData, runForensicAuditSnapshot, saveDigitalTwinScenario.
       - Integration into Dashboard page shell.
*/

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

let pass = 0;
const failures = [];
const check = (cond, name, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name} — ${detail}`);
  }
};

console.log("\n=== 1. Forensic Audit Scoring & Statutory Vectors ===");

const { generateEnterpriseAuditReport } = await import("../src/lib/forensic-audit.ts");

// 1.1 Pristine audit report
{
  const report = generateEnterpriseAuditReport({
    msmeExposure: { atRisk: 0, atRiskCount: 0, unclassified: 0 },
    closeStatus: { status: "closed", items: [{ id: "1", status: "reconciled", title: "Bank clearing" }] },
    invoices: [
      { id: "inv-1", party: "Tata Consultancy", amount: 154230, created_at: "2026-11-01" },
      { id: "inv-2", party: "Infosys Ltd", amount: 284190, created_at: "2026-11-05" },
    ],
  });

  check(report.overallScore >= 85, "pristine books score >= 85", `got ${report.overallScore}`);
  check(["A+", "A"].includes(report.grade), "pristine books receive Grade A+ or A", `got ${report.grade}`);
  check(report.status === "audit_ready", "pristine books status is audit_ready", `got ${report.status}`);
  check(report.anomalies.length === 0, "no forensic anomalies on clean invoices", `found ${report.anomalies.length}`);
}

// 1.2 High-exposure report: MSME 43B(h) overdue + un-reconciled month-end + duplicate invoices
{
  const report = generateEnterpriseAuditReport({
    msmeExposure: { atRisk: 1500000, atRiskCount: 8, unclassified: 300000 },
    closeStatus: {
      status: "in_progress",
      items: [
        { id: "1", status: "exception", title: "Clearing mismatch" },
        { id: "2", status: "pending", title: "Inventory count" },
      ],
    },
    invoices: [
      { id: "dup-1", party: "Reliance Petro", amount: 500000, created_at: "2026-11-01" },
      { id: "dup-2", party: "Reliance Petro", amount: 500000, created_at: "2026-11-03" }, // duplicate
      { id: "round-1", party: "Vendor X", amount: 1000000, created_at: "2026-11-04" }, // round number spike
    ],
  });

  check(report.overallScore < 75, "high exposure books score < 75", `got ${report.overallScore}`);
  check(["C", "D"].includes(report.grade), `high exposure receives Grade C or D (got ${report.grade})`);
  check(
    ["needs_attention", "critical_risk"].includes(report.status),
    `high exposure status flags audit qualification risk (got ${report.status})`
  );

  const msmeVec = report.vectors.find((v) => v.id === "msme_43bh");
  check(!!msmeVec && ["critical", "warning"].includes(msmeVec.status), "MSME 43B(h) vector status flags risk under high exposure");

  const dupAnomaly = report.anomalies.find((a) => a.type === "duplicate_invoice");
  check(!!dupAnomaly, "forensic sentinel flagged duplicate invoice anomaly");
  check(dupAnomaly?.party === "Reliance Petro" && dupAnomaly?.amount === 500000, "duplicate anomaly party & amount match");

  const roundAnomaly = report.anomalies.find((a) => a.type === "round_number_spike");
  check(!!roundAnomaly, "forensic sentinel flagged suspicious round number disbursement spike");
}

console.log("\n=== 2. Digital Twin Macroeconomic Shock Simulator ===");

const { simulateFinancialShocks, DEFAULT_BASELINE_FINANCIALS, DEFAULT_SHOCK_PARAMETERS } = await import(
  "../src/lib/digital-twin.ts"
);

// 2.1 Default baseline simulation
{
  const result = simulateFinancialShocks(DEFAULT_BASELINE_FINANCIALS, DEFAULT_SHOCK_PARAMETERS);
  check(result.impact.simulatedRunwayMonths > 0, "default baseline maintains positive simulated runway");
  check(result.impact.immediateCashShortfall >= 0, "default baseline immediate cash shortfall is calculated");
}

// 2.2 Stress test: severe macroeconomic shock
{
  const severeShocks = {
    debtorDelayDays: 60,
    debtorDefaultPct: 25,
    msmeTermsCompression: true,
    cogsInflationPct: 20,
    interestRateHikeBps: 200,
  };

  const result = simulateFinancialShocks(DEFAULT_BASELINE_FINANCIALS, severeShocks);

  check(
    result.impact.simulatedRunwayMonths < DEFAULT_BASELINE_FINANCIALS.currentRunwayMonths,
    "severe shocks monotonically compress runway",
    `baseline: ${DEFAULT_BASELINE_FINANCIALS.currentRunwayMonths}m -> post-shock: ${result.impact.simulatedRunwayMonths}m`
  );
  check(result.impact.runwayContractedMonths > 0, "runway contracted months is positive under stress");
  check(result.impact.simulatedRunwayMonths >= 0, "simulated runway respects non-negative mathematical bound");
  check(result.impact.immediateCashShortfall >= 0, "immediate cash shortfall respects non-negative bound");
  check(result.impact.workingCapitalGap >= 0, "working capital gap respects non-negative bound");

  // Mitigations
  check(result.mitigations.length >= 2, "autonomous mitigation playbooks generated", `count: ${result.mitigations.length}`);
  const upiMitigation = result.mitigations.find((m) => m.category === "receivables" && m.title.includes("Dynamic UPI"));
  check(!!upiMitigation, "dynamic UPI QR acceleration playbook is present in mitigations");
  const tredsMitigation = result.mitigations.find((m) => m.category === "liquidity" && m.title.includes("TReDS"));
  check(!!tredsMitigation, "TReDS invoice discounting mitigation playbook is present");
}

console.log("\n=== 3. Database Migration, Schema & RLS Security via PGlite ===");

{
  const db = new PGlite();

  // Create baseline schema required for user_org_rank, user_org_ids and foreign keys
  await db.exec(`
    create table organizations (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      created_at timestamptz not null default now()
    );

    create table memberships (
      id uuid primary key default gen_random_uuid(),
      org_id uuid not null references organizations(id) on delete cascade,
      user_id uuid not null,
      role text not null check (role in ('viewer', 'member', 'analyst', 'manager', 'admin', 'owner')),
      created_at timestamptz not null default now(),
      unique(org_id, user_id)
    );

    create or replace function user_org_rank(target_org uuid) returns integer as $$
    declare
      cur_role text;
      jwt_uid text;
    begin
      jwt_uid := current_setting('request.jwt.claim.sub', true);
      if jwt_uid is null or jwt_uid = '' then
        return 0;
      end if;
      select role into cur_role from memberships
        where org_id = target_org and user_id = jwt_uid::uuid;
      if cur_role is null then
        return 0;
      end if;
      case cur_role
        when 'owner' then return 4;
        when 'admin' then return 4;
        when 'manager' then return 3;
        when 'analyst' then return 2;
        when 'member' then return 2;
        when 'viewer' then return 1;
        else return 0;
      end case;
    end;
    $$ language plpgsql stable security definer;

    create or replace function user_org_ids() returns setof uuid as $$
    declare
      jwt_uid text;
    begin
      jwt_uid := current_setting('request.jwt.claim.sub', true);
      if jwt_uid is null or jwt_uid = '' then
        return;
      end if;
      return query select org_id from memberships where user_id = jwt_uid::uuid;
    end;
    $$ language plpgsql stable security definer;

    create role authenticated nologin;
    create role app_user nologin;
    grant authenticated to app_user;
    grant usage on schema public to app_user;
  `);

  // Apply HUD migration
  const migrationSql = read("supabase/migrations/2026_zzzz_q_enterprise_hud.sql");
  await db.exec(migrationSql);

  // Grant privileges to app_user and force RLS
  await db.exec(`
    grant select, insert, update, delete on all tables in schema public to app_user;
    grant execute on all functions in schema public to app_user;
    alter table enterprise_audit_snapshots force row level security;
    alter table digital_twin_scenarios force row level security;
  `);

  // Seed two distinct orgs
  const orgA = "11111111-1111-1111-1111-111111111111";
  const orgB = "22222222-2222-2222-2222-222222222222";
  const userViewer = "33333333-3333-3333-3333-333333333333";
  const userAnalyst = "44444444-4444-4444-4444-444444444444";
  const userManager = "55555555-5555-5555-5555-555555555555";
  const orgBUser = "66666666-6666-6666-6666-666666666666";

  await db.exec(`
    insert into organizations (id, name) values ('${orgA}', 'Apex Industries'), ('${orgB}', 'Zenith Logistics');
    insert into memberships (org_id, user_id, role) values
      ('${orgA}', '${userViewer}', 'viewer'),
      ('${orgA}', '${userAnalyst}', 'analyst'),
      ('${orgA}', '${userManager}', 'manager'),
      ('${orgB}', '${orgBUser}', 'admin');
  `);

  // Helper to run query as a specific user under app_user role
  const asUser = async (userId, sql) => {
    await db.exec(`reset role;`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
    await db.exec(`set role app_user;`);
    return await db.exec(sql);
  };

  // Test RLS on enterprise_audit_snapshots:
  // 1. Analyst inserts a snapshot into orgA -> OK
  await asUser(
    userAnalyst,
    `insert into enterprise_audit_snapshots (org_id, score, grade, status, checks, anomalies)
     values ('${orgA}', 88, 'A', 'audit_ready', '[]', '[]');`
  );
  check(true, "Analyst (rank 2) successfully inserted audit snapshot");

  // 2. Viewer tries to insert into orgA -> must fail by RLS
  try {
    await asUser(
      userViewer,
      `insert into enterprise_audit_snapshots (org_id, score, grade, status, checks, anomalies)
       values ('${orgA}', 45, 'D', 'high_risk', '[]', '[]');`
    );
    failures.push("Viewer was able to insert audit snapshot (expected RLS rejection)");
    console.log("  FAIL  Viewer insert was not blocked by RLS");
  } catch {
    check(true, "Viewer (rank 1) insert blocked by enterprise_audit_snapshots RLS");
  }

  // 3. Viewer can SELECT rows for own org
  const viewRes = await asUser(userViewer, `select count(*)::int as c from enterprise_audit_snapshots where org_id = '${orgA}';`);
  const viewCount = viewRes[0]?.rows[0]?.c || 0;
  check(viewCount === 1, "Viewer (rank 1) can select snapshots in their org", `count: ${viewCount}`);

  // 4. Multi-tenant isolation: check that orgB cannot see orgA snapshot
  const orgBView = await asUser(orgBUser, `select count(*)::int as c from enterprise_audit_snapshots where org_id = '${orgA}';`);
  const orgBCount = orgBView[0]?.rows[0]?.c || 0;
  check(orgBCount === 0, "Org B user cannot select Org A snapshots (strict multi-tenant isolation)");

  // 5. Test RLS on digital_twin_scenarios:
  // Analyst inserts a scenario -> OK
  await asUser(
    userAnalyst,
    `insert into digital_twin_scenarios (org_id, name, shocks, impact, mitigations)
     values ('${orgA}', 'Q4 Supply Shock', '{"cogsInflationPct":15}', '{"runwayContractedMonths":1.8}', '[]');`
  );
  check(true, "Analyst successfully saved digital twin scenario");

  // Analyst tries to delete -> must fail (delete requires rank >= 3)
  try {
    await asUser(userAnalyst, `delete from digital_twin_scenarios where org_id = '${orgA}';`);
    const afterDel = await db.exec(`select count(*)::int as c from digital_twin_scenarios where org_id = '${orgA}';`);
    check(afterDel[0]?.rows[0]?.c === 1, "Analyst delete blocked by RLS (row preserved)");
  } catch {
    check(true, "Analyst delete prevented by digital_twin_scenarios RLS policy");
  }

  // Manager (rank 3) can delete
  await asUser(userManager, `delete from digital_twin_scenarios where org_id = '${orgA}';`);
  const afterMgrDel = await db.exec(`select count(*)::int as c from digital_twin_scenarios where org_id = '${orgA}';`);
  check(afterMgrDel[0]?.rows[0]?.c === 0, "Manager (rank 3) successfully deleted scenario");
}

console.log("\n=== 4. Server Actions & Dashboard Integration Wiring ===");

{
  const actions = read("src/lib/actions.ts");
  check(/export async function getEnterpriseHudData/.test(actions), "getEnterpriseHudData exported in actions.ts");
  check(/export async function runForensicAuditSnapshot/.test(actions), "runForensicAuditSnapshot exported in actions.ts");
  check(/export async function saveDigitalTwinScenario/.test(actions), "saveDigitalTwinScenario exported in actions.ts");
  check(/requireRole\("analyst"\)[\s\S]*?runForensicAuditSnapshot|runForensicAuditSnapshot[\s\S]*?requireRole\("analyst"\)/.test(actions), "runForensicAuditSnapshot requires analyst rank");
  check(/requireRole\("analyst"\)[\s\S]*?saveDigitalTwinScenario|saveDigitalTwinScenario[\s\S]*?requireRole\("analyst"\)/.test(actions), "saveDigitalTwinScenario requires analyst rank");

  const dash = read("src/app/(app)/dashboard/page.tsx");
  check(/EnterpriseCommandHud/.test(dash), "EnterpriseCommandHud rendered in dashboard/page.tsx");
  check(/getEnterpriseHudData/.test(dash), "getEnterpriseHudData called in dashboard/page.tsx");

  const backup = read("src/lib/backup.ts");
  check(/enterprise_audit_snapshots/.test(backup), "enterprise_audit_snapshots included in BACKUP_TABLES");
  check(/digital_twin_scenarios/.test(backup), "digital_twin_scenarios included in BACKUP_TABLES");

  const order = read("supabase/migrations/ORDER.txt");
  check(/2026_zzzz_q_enterprise_hud\.sql/.test(order), "ORDER.txt includes enterprise HUD migration");
}

console.log(`\n------------------------------------------------`);
console.log(`Total checks passed: ${pass}`);
if (failures.length > 0) {
  console.log(`Failures (${failures.length}):`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
} else {
  console.log("All tests passed cleanly! No regressions found.\n");
}
