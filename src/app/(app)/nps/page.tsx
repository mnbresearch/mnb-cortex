// NPS & customer sentiment module
import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { NpsTracker } from "@/components/nps-tracker";
import { listWorkbench, canSaveWorkbench } from "@/lib/workbench";
import type { NpsData } from "@/lib/workbench-types";

export const dynamic = "force-dynamic";

export default async function Nps() {
  const [history, canSave] = await Promise.all([
    listWorkbench<NpsData>("nps", 24),
    canSaveWorkbench(),
  ]);
  return (
    <>
      <Topbar title="NPS & Customer Sentiment" subtitle="The number that predicts churn before revenue shows it" />
      <PageShell>
        <NpsTracker history={history} canSave={canSave} />
        <Section title="Why NPS is worth tracking" desc="It moves before your revenue does">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Sentiment turns before the numbers do. Customers usually go quiet, then stop renewing — by the time revenue dips, the decision was made months ago. NPS gives you that early warning.</p>
            <p>The fastest gains are usually in <b>passives</b>, not detractors. They already like you; they just aren't impressed. A small fix in onboarding or responsiveness often flips a passive to a promoter cheaply.</p>
            <p>Always pair the score with the <b>why</b> — the themes field feeds the AI so recommendations target real causes rather than the number.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
