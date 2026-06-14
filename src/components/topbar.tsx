"use client";
import { useTheme } from "next-themes";
import { Moon, Sun, Search, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b glass px-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden md:flex items-center gap-2 rounded-lg border px-3 h-9 text-sm text-muted-foreground w-64">
          <Search className="h-4 w-4" /> Ask anything…
        </div>
        <Button variant="ghost" size="icon"><Bell className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          <Sun className="h-4 w-4 dark:hidden" /><Moon className="hidden h-4 w-4 dark:block" />
        </Button>
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-purple-500" />
      </div>
    </header>
  );
}
