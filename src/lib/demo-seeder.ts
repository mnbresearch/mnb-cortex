import "server-only";
import { serviceClient } from "@/lib/supabase/server";

/**
 * Pre-populates a demo workspace with realistic Indian SME operational & financial data.
 *
 * Ensures the prospective customer experiences a live, populated executive cockpit
 * rather than an empty dashboard on first login:
 * - 3 active customers with overdue invoices for Collections & MSME Samadhaan.
 * - 3 suppliers with an overdue Micro vendor for Section 43B(h) and Form 3CD Clause 22.
 * - Standard statutory profile so GST, TDS, and audit deadlines light up.
 * - Core financial health metrics for the Altman Z' score and Solvency scorecard.
 */
export async function seedDemoWorkspace(orgId: string): Promise<{ ok: boolean; error?: string }> {
  const sb = serviceClient();
  if (!sb) return { ok: false, error: "Service role not configured." };

  try {
    const today = new Date();
    const dMinus = (days: number) => new Date(today.getTime() - days * 86_400_000).toISOString().slice(0, 10);
    const dPlus = (days: number) => new Date(today.getTime() + days * 86_400_000).toISOString().slice(0, 10);

    // 1. Set Statutory Profile on Organization
    await sb.from("organizations").update({
      statutory_profile: {
        gst: "monthly",
        employees: "yes",
        tds: "yes",
        company: "yes",
        audit: "yes",
        gstTds: "no",
      },
    }).eq("id", orgId);

    // 2. Pre-seed Customers & Invoices (Receivables & Collections)
    const sampleInvoices = [
      {
        org_id: orgId,
        party: "Apex Precision Engineering Ltd",
        invoice_no: "INV-2026-001",
        amount: 450000,
        due_date: dMinus(68), // 68 days overdue -> Triggers MSME Samadhaan 75% pre-deposit notice
        issue_date: dMinus(113),
        status: "overdue",
        type: "receivable",
      },
      {
        org_id: orgId,
        party: "Bharat Global Logistics LLP",
        invoice_no: "INV-2026-002",
        amount: 280000,
        due_date: dMinus(35), // 35 days overdue -> Triggers Collections WhatsApp draft
        issue_date: dMinus(80),
        status: "overdue",
        type: "receivable",
      },
      {
        org_id: orgId,
        party: "Zenith Retail & Distribution",
        invoice_no: "INV-2026-003",
        amount: 320000,
        due_date: dPlus(15), // Current / inside terms
        issue_date: dMinus(15),
        status: "open",
        type: "receivable",
      },
    ];

    // 3. Pre-seed Payables (MSME 43B(h) & Form 3CD Clause 22)
    const samplePayables = [
      {
        org_id: orgId,
        party: "Shree Ganesh Forgings Micro",
        invoice_no: "BILL-8821",
        amount: 350000,
        due_date: dMinus(22), // Past 45 days statutory limit -> Section 43B(h) exposure!
        issue_date: dMinus(67),
        status: "unpaid",
        type: "payable",
      },
      {
        org_id: orgId,
        party: "Mahalaxmi Packaging Small",
        invoice_no: "BILL-8840",
        amount: 125000,
        due_date: dPlus(25), // Inside 45 days limit
        issue_date: dMinus(20),
        status: "unpaid",
        type: "payable",
      },
      {
        org_id: orgId,
        party: "Standard Industrial Lubricants",
        invoice_no: "BILL-8855",
        amount: 90000,
        due_date: dMinus(25),
        issue_date: dMinus(40),
        status: "unpaid",
        type: "payable",
      },
    ];

    try {
      await sb.from("invoices").insert([...sampleInvoices, ...samplePayables]);
    } catch {
      /* Invoices table insert best-effort if custom schema */
    }

    // 4. Pre-seed Vendors Table for 43B(h) classification
    const sampleVendors = [
      {
        org_id: orgId,
        name: "Shree Ganesh Forgings Micro",
        udyam_category: "micro",
        has_written_agreement: true,
        written_agreement_recorded_at: new Date().toISOString(),
      },
      {
        org_id: orgId,
        name: "Mahalaxmi Packaging Small",
        udyam_category: "small",
        has_written_agreement: true,
        written_agreement_recorded_at: new Date().toISOString(),
      },
      {
        org_id: orgId,
        name: "Standard Industrial Lubricants",
        udyam_category: "unclassified", // Prompts classification
        has_written_agreement: false,
      },
    ];

    try {
      await sb.from("vendors").insert(sampleVendors);
    } catch {
      /* Vendors table insert best-effort */
    }

    // 5. Pre-seed Core Health Metrics
    const sampleMetrics = [
      { org_id: orgId, metric_key: "revenue", label: "Monthly Revenue", value: 3850000, unit: "INR", status: "green", delta_pct: 12.4 },
      { org_id: orgId, metric_key: "profit", label: "Operating Margin", value: 16.8, unit: "%", status: "green", delta_pct: 2.1 },
      { org_id: orgId, metric_key: "cash", label: "Liquid Cash Reserves", value: 1820000, unit: "INR", status: "green", delta_pct: -4.5 },
      { org_id: orgId, metric_key: "receivables", label: "Overdue Receivables", value: 730000, unit: "INR", status: "yellow", delta_pct: 8.2 },
      { org_id: orgId, metric_key: "dso", label: "Days Sales Outstanding", value: 48, unit: "days", status: "yellow", delta_pct: 4.0 },
      { org_id: orgId, metric_key: "working_capital", label: "Net Working Capital", value: 2450000, unit: "INR", status: "green", delta_pct: 5.6 },
    ];

    try {
      await sb.from("health_metrics").insert(sampleMetrics);
    } catch {
      /* Health metrics insert best-effort */
    }

    return { ok: true };
  } catch (e: any) {
    console.error("[demo-seeder] failed to seed demo data:", e?.message);
    return { ok: false, error: e?.message || "Failed to seed demo data" };
  }
}
