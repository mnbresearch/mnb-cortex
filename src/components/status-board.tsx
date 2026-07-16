"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";

export function StatusBoard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); try { const r = await fetch("/api/health"); setData(await r.json()); } catch { setData({ services: [] }); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  const services = data?.services || [];
  const allOk = services.length > 0 && services.every((s: any) => s.status === "operational");
  return (
    <div className="max-w-2xl mx-auto">
      <div className={`rounded-2xl border p-5 mb-4 flex items-center gap-3 ${allOk ? "bg-success/10 border-success/20" : "bg-warning/10 border-warning/20"}`}>
        {allOk ? <CheckCircle2 className="h-6 w-6 text-success" /> : <AlertTriangle className="h-6 w-6 text-warning" />}
        <div className="flex-1"><div className="font-semibold">{loading ? "Checking…" : allOk ? "All systems operational" : "Some systems degraded"}</div>
          <div className="text-xs text-muted-foreground">{data?.updated ? new Date(data.updated).toLocaleString() : ""}</div></div>
        <button onClick={load} className="text-muted-foreground hover:text-foreground"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
      </div>
      <div className="rounded-2xl border divide-y">
        {services.map((s: any) => (
          <div key={s.name} className="flex items-center justify-between p-4">
            <span className="text-sm font-medium">{s.name}</span>
            <span className={`inline-flex items-center gap-1.5 text-xs ${s.status === "operational" ? "text-success" : "text-warning"}`}>
              <span className={`h-2 w-2 rounded-full ${s.status === "operational" ? "bg-success" : "bg-warning"}`} /> {s.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
