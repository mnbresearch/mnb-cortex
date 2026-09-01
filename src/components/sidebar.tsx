"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { KeyRound, ShieldAlert, Mail, ChevronDown, Sun, Moon, Search } from "lucide-react";
import { OrgSwitcher } from "@/components/org-switcher";
import { useTheme } from "next-themes";

const OPEN_KEY = "cortex_nav_open_v1";

export function Sidebar({ superAdmin = false, orgs = [], activeOrgId = null }: { superAdmin?: boolean; orgs?: { id: string; name: string }[]; activeOrgId?: string | null }) {
  const path = usePathname();
  const groups = Array.from(new Set(NAV.map((n) => n.group)));
  const activeGroup = NAV.find((n) => n.href === path)?.group;
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState<Record<string, boolean>>({ Overview: true });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    let saved: Record<string, boolean> = {};
    try { saved = JSON.parse(localStorage.getItem(OPEN_KEY) || "{}"); } catch {}
    // Overview always open; the section you're in is force-opened; everything else remembers your choice.
    setOpen({ Overview: true, ...saved, ...(activeGroup ? { [activeGroup]: true } : {}) });
  }, [activeGroup]);

  function toggle(g: string) {
    setOpen((o) => { const n = { ...o, [g]: !o[g] }; try { localStorage.setItem(OPEN_KEY, JSON.stringify(n)); } catch {} return n; });
  }

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r sidebar-surface h-screen sticky top-0">
      <div className="flex items-center gap-2.5 px-5 h-16 border-b">
        <Logo size={34} />
        <div>
          <div className="font-semibold leading-none tracking-tight">MNB Cortex</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">The AI COO for SMEs</div>
        </div>
      </div>
      <OrgSwitcher orgs={orgs} activeId={activeOrgId} />

      {/*
        A visible front door to the command palette. It already searched every
        module, but only opened on Ctrl/Cmd-K — a shortcut a business owner has
        no reason to guess, which is most of why 122 modules felt unfindable.
        Typing the name of a tool is faster than remembering which of six
        sections it lives under.
      */}
      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("cortex:open-palette"))}
          className="w-full flex items-center gap-2 rounded-lg border px-2.5 h-9 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-accent/50 transition-colors"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left">Search modules…</span>
          <kbd className="text-[10px] rounded border px-1 py-0.5 font-sans opacity-60">⌘K</kbd>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {groups.map((g) => {
          const items = NAV.filter((n) => n.group === g);
          const isOpen = open[g] ?? false;
          const hasActive = items.some((n) => n.href === path);
          return (
            <div key={g}>
              <button
                onClick={() => toggle(g)}
                className={cn(
                  "w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors",
                  hasActive && !isOpen ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
              >
                <span className="flex items-center gap-2">{g}<span className="text-[10px] font-normal opacity-50">{items.length}</span></span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", isOpen ? "" : "-rotate-90")} />
              </button>
              {isOpen && (
                <div className="mt-0.5 mb-1 space-y-0.5">
                  {items.map((n, i) => {
                    const active = path === n.href;
                    const Icon = n.icon;
                    /*
                      Sub-headings inside the big groups. "Money" alone held 42
                      modules — Cash Flow sat two pixels from Gratuity, and
                      finding the TDS calculator meant reading all forty-two.
                      A list that long is storage, not navigation.

                      The heading is printed when the sub-section CHANGES rather
                      than by grouping the array, so ordering stays exactly as
                      nav.ts declares it and one label can never be silently
                      dropped by a regroup.
                    */
                    const sub = (n as { sub?: string }).sub;
                    const prevSub = i > 0 ? (items[i - 1] as { sub?: string }).sub : undefined;
                    const heading = sub && sub !== prevSub ? sub : null;
                    return (
                      <div key={n.href}>
                        {heading && (
                          <div className="px-3 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                            {heading}
                          </div>
                        )}
                      <Link href={n.href}
                        className={cn("nav-item relative flex items-center gap-3 rounded-lg pl-3 pr-2.5 py-2 text-sm text-muted-foreground hover:text-foreground", active && "is-active")}>
                        {/* A single shared element that physically travels to the
                            newly-selected item rather than one highlight vanishing
                            and another appearing. It's the detail that makes a
                            sidebar feel built rather than assembled — and because
                            layoutId is shared across every group, it animates even
                            when you jump between sections. */}
                        {active && (
                          <motion.span
                            layoutId="nav-active"
                            className="absolute inset-0 rounded-lg bg-primary/10"
                            transition={{ type: "spring", stiffness: 520, damping: 42, mass: 0.7 }}
                          />
                        )}
                        <Icon className="relative h-4 w-4 shrink-0" />
                        <span className="relative">{n.label}</span>
                      </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {superAdmin && (
          <div className="pt-1">
            <div className="px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Platform</div>
            <Link href="/superadmin" className={cn("nav-item flex items-center gap-3 rounded-lg pl-3 pr-2.5 py-2 text-sm text-muted-foreground hover:text-foreground", path === "/superadmin" && "is-active")}>
              <ShieldAlert className="h-4 w-4 shrink-0" /> Super Admin
            </Link>
            <Link href="/email" className={cn("nav-item flex items-center gap-3 rounded-lg pl-3 pr-2.5 py-2 text-sm text-muted-foreground hover:text-foreground mt-0.5", path === "/email" && "is-active")}>
              <Mail className="h-4 w-4 shrink-0" /> Email Console
            </Link>
            <Link href="/setup" className={cn("nav-item flex items-center gap-3 rounded-lg pl-3 pr-2.5 py-2 text-sm text-muted-foreground hover:text-foreground mt-0.5", path === "/setup" && "is-active")}>
              <KeyRound className="h-4 w-4 shrink-0" /> Setup status
            </Link>
          </div>
        )}
      </nav>

      {/* Theme toggle — discoverable, pinned to the bottom. */}
      <div className="border-t p-3">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        >
          <span className="flex items-center gap-2">
            {mounted && theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            {mounted ? (theme === "dark" ? "Dark mode" : "Light mode") : "Theme"}
          </span>
          <span className="text-[10px] uppercase tracking-wider opacity-60">switch</span>
        </button>
      </div>
    </aside>
  );
}
