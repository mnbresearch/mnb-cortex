import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { ExcelTransform } from "@/components/excel-transform";

export const dynamic = "force-dynamic";

/*
  /excel — "do this in Excel", the way it can actually be done from a web app.

  Two things, both real and both deliberately bounded:

    1. Workbooks OUT. Every dataset Cortex holds can be downloaded as a proper
       .xlsx with formulas, from the Approvals ledger (export_xlsx) or from
       chat ("export my receivables ageing").

    2. Workbooks THROUGH. Upload your own sheet, say what to change in plain
       English, read the plan and the before/after, approve, download. The
       model only translates your sentence into a short list of typed
       operations; deterministic code applies them. No formula text from the
       model ever reaches a cell.

  What this page does NOT do, stated here so nobody expects it: it does not
  control Excel on your computer. A web product cannot, and a half-working
  attempt would be worse than a clear boundary.
*/
export default async function ExcelPage() {
  const { orgId } = await getUserAndOrg();
  const canUse = orgId ? await hasRole("analyst") : false;
  return (
    <>
      <Topbar title="Excel" subtitle="Upload a sheet, say what to change, approve the plan, download the result" />
      <PageShell>
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
          <p><span className="font-medium text-foreground">What Cortex can do to a sheet:</span> filter rows, sort, rename / keep / remove columns, remove duplicates and blank rows, trim spaces, change case, add a calculated column (arithmetic over your columns, e.g. <code>Amount * 0.18</code>), and add a subtotals sheet.</p>
          <p>Your file is processed in memory for the length of the request and is not stored. The plan is validated against your sheet's own column names before anything runs, and the download is the approval — nothing in your workspace changes.</p>
          <p>Need Cortex's own data as a workbook instead? Ask in chat: "export my receivables ageing to Excel".</p>
        </Card>
      </PageShell>
    </>
  );
}
