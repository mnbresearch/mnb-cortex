"use client";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, statusBg } from "@/lib/utils";

export function Notifications() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [read, setRead] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/alerts").then((r) => r.json()).then((d) => setAlerts(d.alerts || [])).catch(() => {});
  }, []);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  const unread = read ? 0 : alerts.filter((a) => a.severity !== "green").length;
  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" onClick={() => setOpen((o) => !o)} className="relative">
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-danger" />}
      </Button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border bg-card shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="font-medium text-sm">Notifications</span>
            <button className="text-xs text-primary" onClick={() => setRead(true)}>Mark all read</button>
          </div>
          <div className="max-h-80 overflow-y-auto p-2 space-y-1.5">
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
