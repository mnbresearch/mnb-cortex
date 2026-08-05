import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Megaphone } from "lucide-react";
import { ActCenter } from "@/components/act-center";

export const dynamic = "force-dynamic";

export default function Act() {
  return (
    <>
      <Topbar title="AI Outreach" subtitle="Cortex writes it, you approve it, it sends — payment reminders, follow-ups, supplier notes." />
      <PageShell>
        <Card className="p-4 border-primary/30 bg-primary/5">
          <div className="text-sm flex items-start gap-2">
            <Megaphone className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span>
              This is the part where Cortex acts on your behalf. Tell it who and why in one line — it drafts a ready-to-send message,
              you review and edit, then send by email (from your own domain, replies to you) or WhatsApp. You approve every send.
            </span>
          </div>
        </Card>
        <ActCenter />
      </PageShell>
    </>
  );
}
