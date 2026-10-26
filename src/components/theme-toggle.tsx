"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

/**
 * Universal Theme Toggle Component for MNB Cortex
 *
 * Provides a high-craft, accessible segmented switch between Light (White/Ivory)
 * and Dark (Graphite/Black) modes. Designed to sit elegantly in top navigation bars
 * without crowding text or CTA buttons.
 */
export function ThemeToggle({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const current = mounted ? (resolvedTheme || theme || "dark") : "dark";
  const isDark = current === "dark";

  return (
    <div
      className={`inline-flex items-center rounded-full border border-border/80 bg-secondary/50 p-0.5 backdrop-blur-xs transition-colors shrink-0 ${className}`}
      role="group"
      aria-label="Color theme toggle"
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-200 ${
          !isDark
            ? "bg-background text-foreground shadow-xs font-semibold"
            : "text-muted-foreground hover:text-foreground"
        }`}
        aria-label="Switch to light theme (white background)"
        title="White background (Light mode)"
      >
        <Sun className={`h-3.5 w-3.5 transition-transform ${!isDark ? "text-amber-600 dark:text-amber-400 scale-110" : ""}`} />
        {!compact && <span className="hidden sm:inline text-[11px]">Light</span>}
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-200 ${
          isDark
            ? "bg-card text-foreground shadow-xs font-semibold"
            : "text-muted-foreground hover:text-foreground"
        }`}
        aria-label="Switch to dark theme (black background)"
        title="Black background (Dark mode)"
      >
        <Moon className={`h-3.5 w-3.5 transition-transform ${isDark ? "text-sky-400 scale-110" : ""}`} />
        {!compact && <span className="hidden sm:inline text-[11px]">Dark</span>}
      </button>
    </div>
  );
}
