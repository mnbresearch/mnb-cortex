"use client";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, statusBg } from "@/lib/utils";
import { dismissAllAlerts } from "@/lib/actions";

export function Notifications() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/alerts").then((r) => r.json()).then((d) => setAlerts(d.alerts || [])).catch(() => {});
  }, []);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  const unread = alerts.filter((a) => a.severity !== "green").length;

  /*
    "Mark all read" used to set a local boolean: the badge vanished until the
    next navigation and every alert came straight back. It now dismisses on
    the server and reflects what the server did — including a refusal.
  */
  async function markAllRead() {
    if (busy) return;
    setBusy(true); setNote(null);
    try {
      const r = await dismissAllAlerts();
      if (r.ok) { setAlerts([]); setNote(r.count ? `${r.count} dismissed` : "Nothing to dismiss"); }
      else setNote(r.error);
    } catch { setNote("Could not reach the server — nothing was changed."); }
    finally { setBusy(false); }
  }
  return (
    <div className="relative" ref={ref}>
      {/*
        The aria-label and aria-haspopup used to sit on the "Mark all read"
        button below, which already has visible text — so the attributes did
        nothing there, and the bell that actually opens the panel had no name at
        all. It is on every page of the app.

        The unread count goes in the name rather than being left as a bare red
        dot, which is invisible to a screen reader and is the only thing that
        distinguishes "you have alerts" from "you do not".
      */}
      <Button
        variant="ghost" size="icon" onClick={() => setOpen((o) => !o)} className="relative"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unread > 0 && <span aria-hidden="true" className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-danger" />}
      </Button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border bg-card shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="font-medium text-sm">Notifications</span>
            {alerts.length > 0
              ? <button className="text-xs text-primary disabled:opacity-60" onClick={markAllRead} disabled={busy}>{busy ? "Dismissing…" : "Mark all read"}</button>
              : note && <span className="text-xs text-muted-foreground">{note}</span>}
          </div>
          <div className="max-h-80 overflow-y-auto p-2 space-y-1.5">
            {note && alerts.length > 0 && <p className="text-xs text-destructive px-3 pt-1" role="status">{note}</p>}
            {alerts.length === 0 && <p className="text-sm text-muted-foreground p-3">No alerts.</p>}
            {alerts.map((a) => (
              <div key={a.id} className={cn("rounded-lg border p-3", statusBg[a.severity])}>
                <p className="text-sm font-medium">{a.title}</p>
                <p className="text-xs opacity-80 mt-0.5">{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
