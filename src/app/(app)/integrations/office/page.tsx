import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/section";
import Link from "next/link";
import {
  FileSpreadsheet,
  Mail,
  Download,
  Copy,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Server,
  Layers,
  ArrowRight,
  Monitor,
  Laptop,
  Check,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default function OfficeAddinsPage() {
  return (
    <>
      <Topbar
        title="Microsoft Office Add-ins"
        subtitle="Run MNB Cortex natively inside Microsoft Excel and Microsoft Outlook"
      />
      <PageShell>
        {/* Hero Banner */}
        <div className="p-6 rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900/90 relative overflow-hidden">
          <div className="relative z-10 max-w-3xl space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
              <Sparkles className="h-3.5 w-3.5" />
              Native Office 365 Architecture
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              Cortex Intelligence where your team works every day
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Unlike generic platforms that only export static files, MNB Cortex provides official Microsoft Office
              Add-ins that run alongside your live spreadsheets and emails. Audit books with Big-4 pre-flight checks,
              inject live 43B(h) statutory schedules into Excel with 1 click, and send verified UPI payment reminders directly
              from Outlook.
            </p>
          </div>
        </div>

        {/* The Two Add-in Cards */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* EXCEL ADD-IN */}
          <Card className="p-5 border-slate-800 bg-slate-900/80 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <FileSpreadsheet className="h-6 w-6" />
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono">
                  Excel Taskpane
                </span>
              </div>

              <div>
                <h3 className="text-lg font-bold text-white">MNB Cortex for Excel</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Works on Excel for Windows, Mac, and Excel on the Web.
                </p>
              </div>

              <div className="space-y-2 text-xs text-slate-300">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">1-Click Live Ledger Tables:</strong> Insert live Receivables Aging,
                    Section 43B(h) exposure schedules, and Month-End variance tables with native Excel formulas.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">Read Active Range:</strong> Select any cells in your workbook; Cortex
                    agents analyze formulas, verify sums, and spot irregularities.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">Veritas Formula Sentinel:</strong> Detects hardcoded constants posing as
                    formulas and discontinuous calculation patterns before external audits.
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 space-y-2.5">
              <div className="flex flex-col sm:flex-row gap-2">
                <a
                  href="/office/manifest-excel.xml"
                  download="MNB-Cortex-Excel-Manifest.xml"
                  className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Manifest XML
                </a>
                <Link
                  href="/office/excel"
                  target="_blank"
                  className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center justify-center gap-1 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Simulator
                </Link>
              </div>
              <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800">
                <span className="truncate">https://cortex.mnbresearch.com/api/office/manifest/excel</span>
              </div>
            </div>
          </Card>

          {/* OUTLOOK ADD-IN */}
          <Card className="p-5 border-slate-800 bg-slate-900/80 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="h-10 w-10 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                  <Mail className="h-6 w-6" />
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-sky-400 font-mono">
                  Outlook Taskpane
                </span>
              </div>

              <div>
                <h3 className="text-lg font-bold text-white">MNB Cortex for Outlook</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Works on Outlook Desktop (Windows, Mac) and Outlook Web.
                </p>
              </div>

              <div className="space-y-2 text-xs text-slate-300">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">Sender &amp; Domain Intelligence:</strong> Auto-detects sender email to
                    surface current ledger balance, days overdue, and 43B(h) MSME status instantly.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">1-Click Invoice &amp; UPI QR Reply:</strong> Inserts verified invoice
                    breakdown, bank NEFT/RTGS credentials, and dynamic UPI QR deep link directly into draft.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">Save to Company Knowledge:</strong> 1-click parses promises to pay
                    or dispute notes and syncs them to Cortex Knowledge for autonomous agents.
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 space-y-2.5">
              <div className="flex flex-col sm:flex-row gap-2">
                <a
                  href="/office/manifest-outlook.xml"
                  download="MNB-Cortex-Outlook-Manifest.xml"
                  className="flex-1 py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Manifest XML
                </a>
                <Link
                  href="/office/outlook"
                  target="_blank"
                  className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center justify-center gap-1 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Simulator
                </Link>
              </div>
              <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800">
                <span className="truncate">https://cortex.mnbresearch.com/api/office/manifest/outlook</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Step-by-Step Installation Guides */}
        <Section title="Deployment Guides" desc="How to install across your organization or on your personal machine">
          <div className="grid md:grid-cols-3 gap-4 text-xs">
            {/* Guide 1 */}
            <Card className="p-4 bg-slate-900/60 border-slate-800 space-y-2.5">
              <div className="flex items-center gap-2 font-semibold text-white">
                <Server className="h-4 w-4 text-emerald-400" />
                <span>1. Microsoft 365 Admin Center</span>
              </div>
              <div className="text-[10px] text-emerald-400 font-mono">Company-wide (All Users)</div>
              <ol className="list-decimal pl-4 space-y-1.5 text-slate-300 text-[11px]">
                <li>Sign in to <strong>admin.microsoft.com</strong> with your tenant admin credentials.</li>
                <li>Go to <strong>Settings</strong> &gt; <strong>Integrated Apps</strong> &gt; <strong>Deploy Add-in</strong>.</li>
                <li>Choose <strong>Deploy a custom add-in</strong> &gt; <strong>Provide link</strong> or <strong>Upload XML file</strong>.</li>
                <li>Paste the Manifest URL above or upload the downloaded XML file.</li>
                <li>Assign to <strong>Entire Organization</strong> or selected finance/ops groups and click <strong>Deploy</strong>.</li>
              </ol>
            </Card>

            {/* Guide 2 */}
            <Card className="p-4 bg-slate-900/60 border-slate-800 space-y-2.5">
              <div className="flex items-center gap-2 font-semibold text-white">
                <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                <span>2. Sideload in Microsoft Excel</span>
              </div>
              <div className="text-[10px] text-emerald-400 font-mono">Excel Web / Desktop</div>
              <ol className="list-decimal pl-4 space-y-1.5 text-slate-300 text-[11px]">
                <li>Open Excel (Desktop or <span className="font-mono">office.com</span>).</li>
                <li>In the top ribbon, navigate to <strong>Insert</strong> &gt; <strong>Add-ins</strong> (or <strong>Get Add-ins</strong>).</li>
                <li>Select <strong>Manage My Add-ins</strong> &gt; <strong>Upload My Add-in</strong>.</li>
                <li>Select the downloaded <code className="text-emerald-400">MNB-Cortex-Excel-Manifest.xml</code>.</li>
                <li>The <strong>Cortex</strong> tab appears in your Excel ribbon with the <strong>Open Cortex Copilot</strong> button!</li>
              </ol>
            </Card>

            {/* Guide 3 */}
            <Card className="p-4 bg-slate-900/60 border-slate-800 space-y-2.5">
              <div className="flex items-center gap-2 font-semibold text-white">
                <Mail className="h-4 w-4 text-sky-400" />
                <span>3. Sideload in Microsoft Outlook</span>
              </div>
              <div className="text-[10px] text-sky-400 font-mono">Outlook Web / Desktop</div>
              <ol className="list-decimal pl-4 space-y-1.5 text-slate-300 text-[11px]">
                <li>Open Outlook (or <span className="font-mono">outlook.office.com</span>).</li>
                <li>Click <strong>New Mail</strong> or open any existing email from a customer.</li>
                <li>Click the <strong>...</strong> (More actions) menu on the action bar &gt; <strong>Get Add-ins</strong>.</li>
                <li>Click <strong>My add-ins</strong> &gt; <strong>Add a custom add-in</strong> &gt; <strong>Add from file</strong>.</li>
                <li>Upload <code className="text-sky-400">MNB-Cortex-Outlook-Manifest.xml</code> and confirm!</li>
              </ol>
            </Card>
          </div>
        </Section>

        {/* Security & Isolation */}
        <Section title="Enterprise Security Model" desc="How data flows securely between Office and MNB Cortex">
          <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/40 space-y-3 text-xs text-slate-300">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <strong className="text-white">Workspace Isolation &amp; Session Guard:</strong> Add-ins communicate
                exclusively with your authenticated MNB Cortex workspace using secure HTTPS endpoints and encrypted session tokens.
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <strong className="text-white">Strict Content Security Policy (CSP):</strong> Configured with rigorous
                <code className="mx-1 px-1 py-0.5 rounded bg-slate-800 font-mono text-[10px]">frame-ancestors</code> targeting only Microsoft 365 official enterprise domains.
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <strong className="text-white">Veritas Grounding:</strong> No hallucinated figures. Every calculation,
                aging bucket, and statutory exposure inserted into your sheets is verified directly against your underlying books.
              </div>
            </div>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
