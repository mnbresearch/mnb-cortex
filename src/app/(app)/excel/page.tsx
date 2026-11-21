import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { ExcelTransform } from "@/components/excel-transform";
import Link from "next/link";
import { Sparkles, ArrowRight, FileSpreadsheet } from "lucide-react";

export const dynamic = "force-dynamic";

/*
  /excel — Work with Excel two ways:

    1. Native Microsoft Excel Add-in: Run Cortex directly inside Excel (Windows,
       Mac, Web) to insert live ledger tables (receivables aging, 43B(h), trial
       balance variances) and query autonomous finance agents on active ranges.
       See /integrations/office.

    2. Web Workbook Transform: Upload a sheet, say what to change in plain
       English, review the plan and the before/after, approve, and download.
*/
export default async function ExcelPage() {
  const { orgId } = await getUserAndOrg();
  const canUse = orgId ? await hasRole("analyst") : false;
  return (
    <>
      <Topbar title="Excel" subtitle="Transform sheets in your browser or run the native MNB Cortex Excel Add-in" />
      <PageShell>
        {/* Office Add-in Callout */}
        <Card className="p-4 bg-emerald-950/20 border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                Run Cortex natively inside Microsoft Excel
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono font-medium">New</span>
              </div>
              <div className="text-xs text-slate-300">
                1-click live ledger table insertion, Big-4 forensic audit sentinel, and autonomous CFO co-pilot in your active spreadsheet.
              </div>
            </div>
          </div>
          <Link
            href="/integrations/office"
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1.5 transition-colors shrink-0 shadow-sm"
          >
            Get Excel Add-in <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Card>

        {!orgId && (
          <Card className="p-5 bg-warning/10 border-warning/20 text-sm">
            <a href="/login" className="text-primary underline">Sign in</a> to transform a workbook.
          </Card>
        )}
        {orgId && !canUse && (
          <Card className="p-5 text-sm text-muted-foreground">This needs the analyst role or higher.</Card>
        )}
        {orgId && canUse && <ExcelTransform />}
        <Card className="p-4 text-xs text-muted-foreground space-y-1">
          <p><span className="font-medium text-foreground">Two ways to work with Excel:</span> (1) Install the native Microsoft Excel Taskpane Add-in from <Link href="/integrations/office" className="text-emerald-400 underline">Office Add-ins Hub</Link> to query agents and insert live ledger tables directly into your active sheet; or (2) Upload your sheet above for deterministic, in-memory transformations (filter, sort, rename columns, add calculated columns, add subtotals).</p>
          <p>Your uploaded file is processed in memory for the length of the request and is not stored. The plan is validated against your sheet&apos;s own column names before anything runs, and the download is the approval — nothing in your workspace changes.</p>
          <p>Need Cortex&apos;s own data as a workbook instead? Ask in chat: &ldquo;export my receivables ageing to Excel&rdquo; or install the Excel Add-in.</p>
        </Card>
      </PageShell>
    </>
  );
}
