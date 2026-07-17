"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn, statusBg } from "@/lib/utils";
export function Toaster() {
  const [toasts, setToasts] = useState<any[]>([]);
  useEffect(() => {
    let seen: string[] = []; try { seen = JSON.parse(localStorage.getItem("mnb-seen-alerts") || "[]"); } catch {}
    let first = true;
    async function poll() {
      try {
        const r = await fetch("/api/alerts"); const d = await r.json(); const alerts = d.alerts || [];
        if (first) { seen = alerts.map((a: any) => a.id); localStorage.setItem("mnb-seen-alerts", JSON.stringify(seen)); first = false; return; }
        const fresh = alerts.filter((a: any) => a.id && !seen.includes(a.id) && a.severity !== "green");
        if (fresh.length) { setToasts((t) => [...fresh.slice(0, 3), ...t].slice(0, 4)); seen = alerts.map((a: any) => a.id); localStorage.setItem("mnb-seen-alerts", JSON.stringify(seen)); }
      } catch {}
    }
    poll(); const id = setInterval(poll, 60000); return () => clearInterval(id);
  }, []);
  if (!toasts.length) return null;
  return (
    <div className="fixed top-4 right-4 z-[90] space-y-2 w-80 no-print">
      {toasts.map((a, i) => (
        <div key={a.id + i} className={cn("rounded-xl border shadow-lg p-3 flex items-start gap-2", statusBg[a.severity])}>
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1"><p className="text-sm font-medium">{a.title}</p><p className="text-xs opacity-80">{a.body}</p></div>
          <button onClick={() => setToasts((t) => t.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5 opacity-70" /></button>
        </div>
      ))}
    </div>
  );
}
