"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, MessageSquare, TrendingUp, Boxes, Menu, X } from "lucide-react";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

const primary = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Health" },
  { href: "/chat", icon: MessageSquare, label: "Ask" },
  { href: "/sales", icon: TrendingUp, label: "Sales" },
  { href: "/inventory", icon: Boxes, label: "Stock" },
];

export function MobileNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const groups = Array.from(new Set(NAV.map((n) => n.group)));
  return (
    <>
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 glass border-t flex justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {primary.map((n) => { const Icon = n.icon; const active = path === n.href; return (
          <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-0.5 text-[10px] px-3 py-1", active ? "text-primary" : "text-muted-foreground")}><Icon className="h-5 w-5" />{n.label}</Link>
        ); })}
        <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 text-[10px] px-3 py-1 text-muted-foreground"><Menu className="h-5 w-5" />More</button>
      </nav>

      {open && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)}>
          <div className="absolute bottom-0 inset-x-0 rounded-t-2xl bg-card border-t max-h-[80vh] overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3"><span className="font-semibold">All modules</span><button onClick={() => setOpen(false)}><X className="h-5 w-5 text-muted-foreground" /></button></div>
            {groups.map((g) => (
              <div key={g} className="mb-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{g}</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {NAV.filter((n) => n.group === g).map((n) => { const Icon = n.icon; const active = path === n.href; return (
                    <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={cn("flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm", active ? "bg-primary text-primary-foreground" : "hover:bg-accent")}><Icon className="h-4 w-4" />{n.label}</Link>
                  ); })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
