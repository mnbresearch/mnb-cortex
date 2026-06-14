import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, FileSpreadsheet, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";
const docs = [
  { name: "Supplier_Contract_PetroChem.pdf", type: "contract", summary: "3-year supply contract; price revision every 6 months.", flags: ["No price cap on revisions", "Auto-renewal unless 60-day notice"] },
  { name: "GST_Return_May.pdf", type: "pdf", summary: "GSTR-3B for May. Net tax ₹4.1 L. Filed on time.", flags: [] },
];
export default function Documents() {
  return (
    <>
      <Topbar title="Document Intelligence" subtitle="Upload anything — AI reads, extracts & flags risk" />
      <PageShell>
        <Card className="p-8 border-dashed grid place-items-center text-center">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="mt-2 font-medium">Drop PDFs, Excel, Word, invoices or contracts</p>
          <p className="text-sm text-muted-foreground">AI will summarize, extract tables, compare versions and highlight risks.</p>
          <Button className="mt-4"><Upload className="h-4 w-4" /> Upload document</Button>
        </Card>
        <Section title="Recent documents">
          <div className="space-y-2">
            {docs.map((d) => (
              <Card key={d.name} className="p-4">
                <div className="flex items-start gap-3">
                  {d.type === "contract" ? <FileText className="h-5 w-5 text-primary mt-0.5" /> : <FileSpreadsheet className="h-5 w-5 text-primary mt-0.5" />}
                  <div className="flex-1">
                    <div className="font-medium text-sm">{d.name}</div>
                    <div className="text-sm text-muted-foreground mt-0.5">{d.summary}</div>
                    {d.flags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {d.flags.map((f) => <Badge key={f} className="bg-danger/10 text-danger border-danger/20"><AlertTriangle className="h-3 w-3 mr-1" />{f}</Badge>)}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      </PageShell>
    </>
  );
}
