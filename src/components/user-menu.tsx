"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { CreditCard, LogOut, Moon, Plug, Settings, Sun, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/lib/actions";

/**
 * The account menu in the top-right.
 *
 * WHAT THIS REPLACES. The "profile button" was literally this:
 *
 *   <div className="h-8 w-8 rounded-full brand-gradient ring-2 ring-background" />
 *
 * — a decorative div. Not a <button>, no onClick, no href, no menu, no label,
 * and no indication of who was signed in. It looked like an avatar, so people
 * clicked it and nothing happened, and there was no way out of the app except
 * to navigate to /settings and find the sign-out form by hand. Keyboard and
 * screen-reader users had nothing to find at all.
 *
 * WHY THE USER IS FETCHED CLIENT-SIDE. Topbar is a client component that ~90
 * pages render as <Topbar title subtitle />. Threading the session through
 * every one of those call sites would mean editing 90 files and converting
 * Topbar's callers to pass server data down. The session already lives in a
 * cookie the browser client reads, so one auth.getUser() here gets the same
 * answer without touching a single page.
 */

type Me = { email: string; name: string | null } | null;

function initialsFrom(name: string | null, email: string): string {
  const source = (name || "").trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
    return parts[0][0].toUpperCase();
  }
  // Fall back to the email's local part, which every account has.
  const local = email.split("@")[0] || "?";
  const cleaned = local.replace(/[^a-zA-Z0-9]/g, "");
  return (cleaned.slice(0, 2) || "?").toUpperCase();
}

export function UserMenu() {
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<Me>(null);
  const [loaded, setLoaded] = useState(false);
  const { theme, setTheme } = useTheme();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = createClient();
        const { data } = await sb.auth.getUser();
        if (!alive) return;
        const u = data?.user;
        if (u?.email) {
          const meta: any = u.user_metadata || {};
          setMe({ email: u.email, name: meta.full_name || meta.name || null });
        }
      } catch {
        /* Supabase not configured, or offline. The menu still works; it just
           shows the generic icon rather than initials. */
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Close on outside click and on Escape. Escape also returns focus to the
  // trigger, or a keyboard user is stranded at the top of the document.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); buttonRef.current?.focus(); }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = me ? initialsFrom(me.name, me.email) : null;
  const label = me ? `Account menu for ${me.name || me.email}` : "Account menu";
  const itemClass =
    "flex w-full items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors hover:bg-accent focus-visible:bg-accent outline-none";

  return (
    <div className="relative" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={me?.email || "Account"}
        className="grid h-8 w-8 place-items-center rounded-full brand-gradient ring-2 ring-background shadow-sm text-[11px] font-bold text-white transition-transform hover:scale-105 focus-visible:outline-2"
      >
        {initials ? <span>{initials}</span> : <User className="h-4 w-4" aria-hidden="true" />}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 mt-2 w-60 z-50 overflow-hidden rounded-xl border bg-card shadow-lg card-elevated"
        >
          <div className="px-3 py-2.5 border-b">
            {me ? (
              <>
                {me.name && <p className="text-sm font-semibold truncate">{me.name}</p>}
                <p className="text-xs text-muted-foreground truncate" title={me.email}>{me.email}</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {loaded ? "Not signed in" : "Loading…"}
              </p>
            )}
          </div>

          <Link href="/settings" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
            <Settings className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Settings
          </Link>
          <Link href="/billing" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
            <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Plan &amp; billing
          </Link>
          <Link href="/setup-guides" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
            <Plug className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Connections
          </Link>

          {/* Duplicated from the topbar icon on purpose: on mobile the icon-only
              toggle is easy to miss, and this is where people look for it. */}
          <button
            type="button"
            role="menuitem"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className={`${itemClass} border-t`}
          >
            <Sun className="h-4 w-4 text-muted-foreground dark:hidden" aria-hidden="true" />
            <Moon className="hidden h-4 w-4 text-muted-foreground dark:block" aria-hidden="true" />
            <span className="dark:hidden">Switch to dark</span>
            <span className="hidden dark:inline">Switch to light</span>
          </button>

          {/* A real POST via the existing server action, so the session cookie is
              cleared server-side rather than only in this tab. */}
          <form action={signOut} className="border-t">
            <button type="submit" role="menuitem" className={`${itemClass} text-danger`}>
              <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
