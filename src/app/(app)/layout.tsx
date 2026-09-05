import { NavProgress } from "@/components/nav-progress";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { CommandPalette } from "@/components/command-palette";
import { PWA } from "@/components/pwa";
import { Branding } from "@/components/branding";
import { ConsentBanner } from "@/components/consent-banner";
import { Copilot } from "@/components/copilot";
import { Shortcuts } from "@/components/shortcuts";
import { Toaster } from "@/components/toaster";
import { WhatsNew } from "@/components/whats-new";
import { CreditBanner } from "@/components/credit-banner";
import { DailyNudge } from "@/components/daily-nudge";
import { OnboardingTour } from "@/components/onboarding-tour";
import { getOrgProfile, getMyOrgs, getUserAndOrg } from "@/lib/data";
import { isSuperAdmin } from "@/lib/superadmin";
import { getBillingStatus } from "@/lib/billing";
import { TrialGuard } from "@/components/trial-guard";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [profile, superAdmin, orgs, { orgId }, billing] = await Promise.all([
    getOrgProfile(), isSuperAdmin(), getMyOrgs(), getUserAndOrg(), getBillingStatus(),
  ]);
  return (
    <div className="flex min-h-screen">
      {/*
        Skip link. Visually hidden until focused, which is the point: the first
        Tab on any page offers a jump past ~122 sidebar links straight to the
        content. Without it a keyboard user traverses the whole nav every time.
      */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      <NavProgress />
      <Sidebar superAdmin={superAdmin} orgs={orgs} activeOrgId={orgId} />
      <div className="flex-1 min-w-0 app-canvas">{children}</div>
      <MobileNav />
      <CommandPalette />
      <PWA />
      <Branding accent={profile?.accent} />
      <ConsentBanner />
      <Copilot />
      <Shortcuts />
      <Toaster />
      <WhatsNew />
      <OnboardingTour signedIn={Boolean(orgId)} />
      {/* Super-admins operate the platform and are never gated. */}
      {/* billing.known is false for a logged-out visitor — they have no trial to count down. */}
      {!superAdmin && billing.known && <TrialGuard status={billing.status} daysLeft={billing.daysLeft} locked={billing.locked} lapsedSubscription={billing.lapsedSubscription} subscriptionEndsAt={billing.subscriptionEndsAt} />}
      {!superAdmin && <CreditBanner />}
      {!superAdmin && <DailyNudge status={billing.status} daysLeft={billing.daysLeft} />}
    </div>
  );
}
