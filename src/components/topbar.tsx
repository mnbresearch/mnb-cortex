"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Moon, Sun, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notifications } from "@/components/notifications";

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const { theme, setTheme } = useTheme();
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask your AI COO anything…" className="flex-1 bg-transparent outline-none" />
        </form>
        <Notifications />
        <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          <Sun className="h-4 w-4 dark:hidden" /><Moon className="hidden h-4 w-4 dark:block" />
        </Button>
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-purple-500" />
      </div>
    </header>
  );
}
