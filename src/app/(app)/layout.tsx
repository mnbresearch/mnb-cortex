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
import { getOrgProfile, getMyOrgs, getUserAndOrg } from "@/lib/data";
import { isSuperAdmin } from "@/lib/superadmin";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [profile, superAdmin, orgs, { orgId }] = await Promise.all([
    getOrgProfile(), isSuperAdmin(), getMyOrgs(), getUserAndOrg(),
  ]);
  return (
    <div className="flex min-h-screen">
      <Sidebar superAdmin={superAdmin} orgs={orgs} activeOrgId={orgId} />
      <div className="flex-1 min-w-0">{children}</div>
      <MobileNav />
      <CommandPalette />
      <PWA />
      <Branding accent={profile?.accent} />
      <ConsentBanner />
      <Copilot />
      <Shortcuts />
      <Toaster />
      <WhatsNew />
    </div>
  );
}
