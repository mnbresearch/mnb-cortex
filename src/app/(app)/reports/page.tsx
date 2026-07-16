"use client";
import { useState } from "react";
import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Sparkles, Printer } from "lucide-react";

export default function Reports() {
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true); setReport("");
    try {
      const r = await fetch("/api/report", { method: "POST" });
      const j = await r.json();
      setReport(j.report || "No report generated.");
    } catch { setReport("Could not generate report."); }
    finally { setLoading(false); }
  }

  const md = (s: string) => s
    .replace(/^## (.*)$/gm, "<h2 class='text-lg font-semibold mt-5 mb-2'>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1 class='text-xl font-bold mt-4 mb-2'>$1</h1>")
    .replace(/^\- (.*)$/gm, "<li class='ml-5 list-disc'>$1</li>")
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
    .replace(/\n/g, "<br/>");

  return (
    <>
      <Topbar title="Reports" subtitle="AI-generated business review (MIS)" />
      <PageShell>
        <Card className="p-5 flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/15 p-2"><FileText className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="font-medium">Monthly business review</p>
              <p className="text-sm text-muted-foreground">Your AI COO writes a board-ready MIS from your live numbers.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={generate} disabled={loading}><Sparkles className="h-4 w-4" /> {loading ? "Writing…" : "Generate report"}</Button>
            {report && <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> PDF</Button>}
          </div>
        </Card>

        {loading && <Card className="p-6 text-sm text-muted-foreground">Analysing your metrics and drafting the report…</Card>}

        {report && (
          <Card className="p-8 leading-relaxed text-sm">
            <div className="mb-6 pb-4 border-b">
              <h1 className="text-2xl font-bold">MNB Cortex — Business Review</h1>
              <p className="text-muted-foreground text-sm mt-1">Generated {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
            </div>
            <div dangerouslySetInnerHTML={{ __html: md(report) }} />
          </Card>
        )}

        {!report && !loading && (
          <Card className="p-10 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2" />
            Click <b className="text-foreground">Generate report</b> to have your AI COO write this month's business review.
          </Card>
        )}
      </PageShell>
    </>
  );
}
