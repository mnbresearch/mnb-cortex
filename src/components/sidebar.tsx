"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { ShieldAlert } from "lucide-react";

export function Sidebar({ superAdmin = false }: { superAdmin?: boolean }) {
  const path = usePathname();
  const groups = Array.from(new Set(NAV.map((n) => n.group)));
  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r bg-card/40 h-screen sticky top-0">
      <div className="flex items-center gap-2.5 px-5 h-16 border-b">
        <Logo size={34} />
        <div>
          <div className="font-semibold leading-none tracking-tight">MNB Cortex</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">The AI COO for SMEs</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {groups.map((g) => (
          <div key={g}>
            <div className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g}</div>
            <div className="space-y-0.5">
              {NAV.filter((n) => n.group === g).map((n) => {
                const active = path === n.href;
                const Icon = n.icon;
                return (
                  <Link key={n.href} href={n.href}
                    className={cn("flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                      active ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
                    <Icon className="h-4 w-4" />
                    {n.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
        {superAdmin && (
          <div>
            <div className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Platform</div>
            <Link href="/superadmin"
              className={cn("flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                path === "/superadmin" ? "brand-gradient text-white font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
              <ShieldAlert className="h-4 w-4" />
              Super Admin
            </Link>
          </div>
        )}
      </nav>
    </aside>
  );
}
