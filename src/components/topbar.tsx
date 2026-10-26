"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Notifications } from "@/components/notifications";
import { UserMenu } from "@/components/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    router.push(`/chat?q=${encodeURIComponent(q)}`);
    setQ("");
  }
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b glass px-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        <form onSubmit={ask} className="hidden md:flex items-center gap-2 rounded-lg border px-3 h-9 text-sm w-72 focus-within:ring-2 focus-within:ring-ring">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask Cortex about your numbers…" aria-label="Ask Cortex about your numbers" className="flex-1 bg-transparent outline-none" />
        </form>
        <Notifications />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
