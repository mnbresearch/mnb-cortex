"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MessageSquare, TrendingUp, Boxes, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
const items = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Health" },
  { href: "/chat", icon: MessageSquare, label: "Ask" },
  { href: "/sales", icon: TrendingUp, label: "Sales" },
  { href: "/inventory", icon: Boxes, label: "Stock" },
  { href: "/strategy", icon: Brain, label: "Strategy" },
];
export function MobileNav() {
  const path = usePathname();
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 glass border-t flex justify-around py-2">
      {items.map((n) => {
        const Icon = n.icon; const active = path === n.href;
        return (
          <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-0.5 text-[10px]", active ? "text-primary" : "text-muted-foreground")}>
            <Icon className="h-5 w-5" />{n.label}
          </Link>
        );
      })}
    </nav>
  );
}
