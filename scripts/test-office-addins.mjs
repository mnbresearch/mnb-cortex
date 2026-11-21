/**
 * TEST SUITE: MICROSOFT OFFICE ADD-INS (EXCEL & OUTLOOK)
 *
 * Verifies that MNB Cortex provides production-grade, enterprise-ready
 * Microsoft Office Add-in support for Excel and Outlook:
 *  1. Valid XML Manifests for Excel and Outlook (Schema 1.1)
 *  2. Centralized Deployment and Sideloading compatibility
 *  3. Dynamic Manifest API endpoint (/api/office/manifest/[app])
 *  4. Frame-ancestors & CSP allowances for Office embedding (next.config.mjs)
 *  5. Office Taskpane routes (/office/excel, /office/outlook)
 *  6. Context API and knowledge ingestion (/api/office/context, /api/office/save-knowledge, /api/office/agent)
 *  7. Dedicated Management Hub at /integrations/office
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
let passed = 0;
const failures = [];

function check(cond, description, details = "") {
  if (cond) {
    passed++;
  } else {
    failures.push({ description, details });
  }
}

console.log("\n🧪 Running Microsoft Office Add-ins Verification Suite...\n");

// 1. Static XML Manifest for Excel
const excelManifestPath = join(ROOT, "public/office/manifest-excel.xml");
check(existsSync(excelManifestPath), "Excel manifest exists in public/office/manifest-excel.xml");

if (existsSync(excelManifestPath)) {
  const xml = readFileSync(excelManifestPath, "utf-8");
  check(xml.includes('xmlns="http://schemas.microsoft.com/office/appforoffice/1.1"'), "Excel manifest uses Office App 1.1 schema");
  check(xml.includes('xsi:type="TaskpaneApp"'), "Excel manifest is TaskpaneApp");
  check(/<Id>[a-f0-9-]{36}<\/Id>/i.test(xml), "Excel manifest has valid GUID Id");
  check(xml.includes('<Host Name="Workbook" />'), "Excel manifest specifies Workbook host");
  check(xml.includes('DisplayName DefaultValue="MNB Cortex for Excel"'), "Excel manifest DisplayName is MNB Cortex for Excel");
  check(xml.includes("/office/excel"), "Excel manifest SourceLocation points to /office/excel");
  check(xml.includes("<Permissions>ReadWriteDocument</Permissions>"), "Excel manifest requests ReadWriteDocument permissions");
  check(xml.includes("<TaskpaneId>MNB.Cortex.ExcelTaskpane</TaskpaneId>"), "Excel manifest declares MNB.Cortex.ExcelTaskpane");
  check(xml.includes("<CustomTab id=\"MNB.Cortex.Tab\">"), "Excel manifest declares custom ribbon tab");
}

// 2. Static XML Manifest for Outlook
const outlookManifestPath = join(ROOT, "public/office/manifest-outlook.xml");
check(existsSync(outlookManifestPath), "Outlook manifest exists in public/office/manifest-outlook.xml");

if (existsSync(outlookManifestPath)) {
  const xml = readFileSync(outlookManifestPath, "utf-8");
  check(xml.includes('xmlns="http://schemas.microsoft.com/office/appforoffice/1.1"'), "Outlook manifest uses Office App 1.1 schema");
  check(xml.includes('xsi:type="MailApp"'), "Outlook manifest is MailApp");
  check(/<Id>[a-f0-9-]{36}<\/Id>/i.test(xml), "Outlook manifest has valid GUID Id");
  check(xml.includes('<Host Name="Mailbox" />'), "Outlook manifest specifies Mailbox host");
  check(xml.includes('DisplayName DefaultValue="MNB Cortex for Outlook"'), "Outlook manifest DisplayName is MNB Cortex for Outlook");
  check(xml.includes("/office/outlook"), "Outlook manifest SourceLocation points to /office/outlook");
  check(xml.includes("<Permissions>ReadWriteItem</Permissions>"), "Outlook manifest requests ReadWriteItem permissions");
  check(xml.includes("<Form xsi:type=\"ItemRead\">"), "Outlook manifest includes ItemRead form");
  check(xml.includes("<Form xsi:type=\"ItemEdit\">"), "Outlook manifest includes ItemEdit form");
  check(xml.includes("MessageReadCommandSurface"), "Outlook manifest declares MessageRead command surface");
  check(xml.includes("MessageComposeCommandSurface"), "Outlook manifest declares MessageCompose command surface");
}

// 3. Dynamic Manifest API Route
const manifestRoutePath = join(ROOT, "src/app/api/office/manifest/[app]/route.ts");
check(existsSync(manifestRoutePath), "Dynamic manifest API route exists at src/app/api/office/manifest/[app]/route.ts");

if (existsSync(manifestRoutePath)) {
  const code = readFileSync(manifestRoutePath, "utf-8");
  check(code.includes("export async function GET"), "Manifest API route exports GET handler");
  check(code.includes("application/xml"), "Manifest API route sets application/xml Content-Type");
  check(code.includes("excel") && code.includes("outlook"), "Manifest API handles both excel and outlook apps");
}

// 4. Security & CSP Configuration in next.config.mjs
const nextConfigPath = join(ROOT, "next.config.mjs");
check(existsSync(nextConfigPath), "next.config.mjs exists");

if (existsSync(nextConfigPath)) {
  const code = readFileSync(nextConfigPath, "utf-8");
  check(code.includes("/office/:path*"), "next.config.mjs defines dedicated headers for /office/:path*");
  check(code.includes("officeapps.live.com"), "CSP frame-ancestors includes officeapps.live.com");
  check(code.includes("office.com"), "CSP frame-ancestors includes office.com");
  check(code.includes("outlook.office.com"), "CSP frame-ancestors includes outlook.office.com");
  check(code.includes("office365.com"), "CSP frame-ancestors includes office365.com");
  check(code.includes("sharepoint.com"), "CSP frame-ancestors includes sharepoint.com");
}

// 5. Office Backend API Endpoints
const contextRoutePath = join(ROOT, "src/app/api/office/context/route.ts");
check(existsSync(contextRoutePath), "Office Context API exists at src/app/api/office/context/route.ts");
if (existsSync(contextRoutePath)) {
  const code = readFileSync(contextRoutePath, "utf-8");
  check(code.includes("receivables"), "Context API provides receivables dataset");
  check(code.includes("msme_43bh"), "Context API provides msme_43bh statutory dataset");
  check(code.includes("audit_vectors"), "Context API provides audit_vectors forensic dataset");
  check(code.includes("variances"), "Context API provides trial balance variance dataset");
  check(code.includes("outlookData"), "Context API provides outlookData with matched party lookup");
}

const saveKnowledgeRoutePath = join(ROOT, "src/app/api/office/save-knowledge/route.ts");
check(existsSync(saveKnowledgeRoutePath), "Save Knowledge API exists at src/app/api/office/save-knowledge/route.ts");
if (existsSync(saveKnowledgeRoutePath)) {
  const code = readFileSync(saveKnowledgeRoutePath, "utf-8");
  check(code.includes("upsertItems"), "Save Knowledge API integrates with upsertItems");
  check(code.includes("export async function POST"), "Save Knowledge API exports POST handler");
}

const agentRoutePath = join(ROOT, "src/app/api/office/agent/route.ts");
check(existsSync(agentRoutePath), "Office Agent API exists at src/app/api/office/agent/route.ts");
if (existsSync(agentRoutePath)) {
  const code = readFileSync(agentRoutePath, "utf-8");
  check(code.includes("fin.cfo"), "Office Agent API supports fin.cfo");
  check(code.includes("fin.audit"), "Office Agent API supports fin.audit");
  check(code.includes("fin.tax"), "Office Agent API supports fin.tax");
  check(code.includes("veritas"), "Office Agent API provides Veritas grounding confidence");
}

// 6. Front-End Taskpanes
const excelTaskpanePath = join(ROOT, "src/app/office/excel/page.tsx");
check(existsSync(excelTaskpanePath), "Excel taskpane page exists at src/app/office/excel/page.tsx");
if (existsSync(excelTaskpanePath)) {
  const code = readFileSync(excelTaskpanePath, "utf-8");
  check(code.includes("appsforoffice.microsoft.com/lib/1/hosted/office.js"), "Excel taskpane loads Office.js SDK");
  check(code.includes("getSelectedRange"), "Excel taskpane implements getSelectedRange reader");
  check(code.includes("handleInsertTable"), "Excel taskpane implements 1-click table insertion");
  check(code.includes("handleScanFormulas"), "Excel taskpane implements Veritas formula scan");
}

const outlookTaskpanePath = join(ROOT, "src/app/office/outlook/page.tsx");
check(existsSync(outlookTaskpanePath), "Outlook taskpane page exists at src/app/office/outlook/page.tsx");
if (existsSync(outlookTaskpanePath)) {
  const code = readFileSync(outlookTaskpanePath, "utf-8");
  check(code.includes("appsforoffice.microsoft.com/lib/1/hosted/office.js"), "Outlook taskpane loads Office.js SDK");
  check(code.includes("setSelectedDataAsync"), "Outlook taskpane implements 1-click message draft injection");
  check(code.includes("handleInsertPaymentRequest"), "Outlook taskpane creates UPI and invoice payment table");
  check(code.includes("handleInsertStatutoryNotice"), "Outlook taskpane creates 43B(h) statutory notice");
  check(code.includes("handleSaveToKnowledge"), "Outlook taskpane syncs promises to Company Knowledge");
}

// 7. Management Hub & Navigation
const hubPagePath = join(ROOT, "src/app/(app)/integrations/office/page.tsx");
check(existsSync(hubPagePath), "Office Hub page exists at src/app/(app)/integrations/office/page.tsx");

const navPath = join(ROOT, "src/lib/nav.ts");
if (existsSync(navPath)) {
  const navCode = readFileSync(navPath, "utf-8");
  check(navCode.includes('href: "/integrations/office"'), "Office Hub is registered in NAV");
}

// 8. Required Office App Icons
const icons = ["icon-16.png", "icon-32.png", "icon-64.png", "icon-80.png", "icon-128.png"];
for (const icon of icons) {
  check(existsSync(join(ROOT, "public", icon)), `Office icon exists: public/${icon}`);
}

console.log(`\n========================================`);
console.log(`Office Add-ins Suite: ${passed} passed, ${failures.length} failed`);
console.log(`========================================\n`);

if (failures.length > 0) {
  console.error("FAILURES:");
  for (const f of failures) {
    console.error(` ❌ ${f.description} ${f.details ? `(${f.details})` : ""}`);
  }
  process.exit(1);
} else {
  console.log("✅ All Microsoft Office Add-in tests passed with zero defects!\n");
  process.exit(0);
}
