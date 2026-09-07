import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { SetupPath } from "@/components/setup-path";
import { getFirstRun } from "@/lib/first-run";
import { getOrgProfile } from "@/lib/data";

export const dynamic = "force-dynamic";

/*
  SETUP IS NOW RESUMABLE, AND IT REMEMBERS WHAT YOU ALREADY TOLD IT.

  This page used to be a one-shot: /api/workspace/bootstrap returned
  "/onboarding" only on the request that created the workspace, and the wizard
  held its answers in useState with no initial values. So a customer who
  refreshed, closed the tab, or signed in on their phone lost the flow
  permanently — and if they found the URL again, the form asked for a company
  name they had already given, defaulted the industry back to "manufacturing",
  and started at step one regardless of what was done.

  Two changes fix that without any new state to keep in sync:

    - The wizard is seeded from the org profile that is already in the database,
      so returning to this page shows what you last saved rather than a blank
      form pretending you had never been here.
    - The progress panel above it is derived (lib/first-run.ts), so it is
      accurate on a second device and for workspaces that predate this code.
*/
export default async function Onboarding() {
  const [firstRun, profile] = await Promise.all([getFirstRun(), getOrgProfile()]);

  return (
    <>
      <Topbar title="Welcome to MNB Cortex" subtitle="Set up what Cortex watches" />
      <PageShell>
        <SetupPath run={firstRun} />
        <OnboardingWizard
          initialName={(profile as any)?.name || ""}
          initialIndustry={(profile as any)?.industry || ""}
          initialCurrency={(profile as any)?.currency || "INR"}
        />
      </PageShell>
    </>
  );
}
