import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { CommandPalette } from "@/components/command-palette";
import { PWA } from "@/components/pwa";
import { Branding } from "@/components/branding";
import { ConsentBanner } from "@/components/consent-banner";
import { getOrgProfile } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getOrgProfile();
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0">{children}</div>
      <MobileNav />
      <CommandPalette />
      <PWA />
      <Branding accent={profile?.accent} />
      <ConsentBanner />
    </div>
  );
}
