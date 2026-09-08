"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Sparkles, Printer } from "lucide-react";
import { mdToHtml } from "@/lib/utils";

export function ReportGenerator() {
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

  /*
    THIS USED TO BE A PRIVATE COPY OF mdToHtml WITH THE ESCAPING LEFT OUT.

    It interpolated the model's report straight into dangerouslySetInnerHTML.
    That is reachable: a workspace ADMIN can set custom AI instructions
    (POST /api/ai/instructions), those instructions are prepended to every
    Cortex call including generateReport, and the model will reproduce a literal
    string it is told to open with. So an admin could plant
    `<img src=x onerror=…>`, wait for the OWNER to click Generate, and read the
    owner's session out of document.cookie — Supabase's SSR client sets those
    cookies httpOnly:false. Admin -> owner takeover through a page that looks
    like it only renders our own text.

    The shared helper escapes first and is the only renderer allowed near
    dangerouslySetInnerHTML; test-xss.mjs now fails the build if a hand-rolled
    one reappears anywhere in src/.
  */

  return (
    <>
      <>
        <Card className="p-5 flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/15 p-2"><FileText className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="font-medium">Monthly business review</p>
              <p className="text-sm text-muted-foreground">Cortex writes a board-ready MIS from your live numbers.</p>
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
            <div dangerouslySetInnerHTML={{ __html: mdToHtml(report) }} />
          </Card>
        )}

        {!report && !loading && (
          <Card className="p-10 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2" />
            Click <b className="text-foreground">Generate report</b> to have Cortex write this month's business review.
          </Card>
        )}
      </>
    </>
  );
}
