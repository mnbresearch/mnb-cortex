import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { OnboardingWizard } from "@/components/onboarding-wizard";
export const dynamic = "force-dynamic";
export default function Onboarding() {
  return (<><Topbar title="Welcome to MNB Cortex" subtitle="Set up what Cortex watches — 3 steps" /><PageShell><OnboardingWizard /></PageShell></>);
}
