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
import { AnonToolBar } from "@/components/anon-tool-bar";
import { OnboardingTour } from "@/components/onboarding-tour";
import { getOrgProfile, getMyOrgs, getUserAndOrg } from "@/lib/data";
import { isSuperAdmin } from "@/lib/superadmin";
import { getBillingStatus } from "@/lib/billing";
import { planIncludes } from "@/lib/config";
import { getFirstRun } from "@/lib/first-run";
import { TrialGuard } from "@/components/trial-guard";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [profile, superAdmin, orgs, { orgId }, billing, firstRun] = await Promise.all([
    getOrgProfile(), isSuperAdmin(), getMyOrgs(), getUserAndOrg(), getBillingStatus(), getFirstRun(),
  ]);

  /*
    WHITE-LABEL, FINALLY ENFORCED AND FINALLY DELIVERED.

    `planIncludes(plan, "whitelabel")` had no call sites anywhere in the app —
    the capability was declared on three plans, listed in the pricing table as
    "Custom accent colour & logo" (Command, ₹39,999) and "Your accent colour
    across the workspace" (Practice, ₹29,999), and enforced nowhere. Both halves
    of that were wrong at once, in opposite directions:

      - The ACCENT was applied for every workspace regardless of plan, so a
        ₹4,999 customer already had the thing ₹29,999 was charging for.
      - The LOGO was captured in Settings, written to organizations.logo_url,
        and read by nothing. Nobody on any plan ever saw it.

    So the more expensive plan's differentiator was free, and its headline
    feature did not exist. This is the one place that decides both.
  */
  const brandable = superAdmin || planIncludes(billing.plan, "whitelabel");
  const logoUrl = brandable && typeof profile?.logo_url === "string" && profile.logo_url.startsWith("https://")
    ? profile.logo_url
    : null;

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
      <Sidebar superAdmin={superAdmin} orgs={orgs} activeOrgId={orgId} logoUrl={logoUrl} brandName={brandable ? (profile?.name || null) : null} setupIncomplete={firstRun.known && !firstRun.complete} />
      <div className="flex-1 min-w-0 app-canvas">
        {/*
          Search traffic lands on the calculators — all 29 are public — inside
          the logged-in application chrome, with no explanation and no way
          onward. This says what the surrounding software is and offers a next
          step, for logged-out visitors only, on the tool pages only. It never
          covers or gates the calculator itself.
        */}
        {!orgId && <AnonToolBar />}
        {children}
      </div>
      <MobileNav />
      <CommandPalette />
      <PWA />
      <Branding accent={brandable ? profile?.accent : undefined} />
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
