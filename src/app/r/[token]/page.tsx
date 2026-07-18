import { createClient, hasSupabase } from "@/lib/supabase/server";
import Link from "next/link";
import { Logo } from "@/components/logo";

export const dynamic = "force-dynamic";
function fmt(v: number, unit: string) {
  if (unit === "INR") { const n = Number(v); if (n >= 1e7) return `₹${(n/1e7).toFixed(2)} Cr`; if (n >= 1e5) return `₹${(n/1e5).toFixed(2)} L`; return `₹${n}`; }
  if (unit === "%") return `${v}%`; if (unit === "/5") return `${v}/5`; if (unit === "days") return `${v} days`; if (unit === "months") return `${v} mo`; return `${v}`;
}
export default async function PublicReport({ params }: { params: { token: string } }) {
  let data: any = { ok: false };
  if (hasSupabase()) { try { const sb = createClient(); const { data: d } = await sb.rpc("public_report", { p_token: params.token }); data = d || { ok: false }; } catch {} }
  const dot: Record<string, string> = { green: "bg-success", yellow: "bg-warning", red: "bg-danger" };
  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between px-6 lg:px-12 h-16 border-b">
        <Link href="/" className="flex items-center gap-2"><Logo size={32} /><span className="font-semibold">MNB Cortex</span></Link>
        <span className="text-xs text-muted-foreground">Shared business snapshot · read-only</span>
      </header>
      <section className="max-w-4xl mx-auto px-6 py-12">
        {!data.ok ? (
          <div className="text-center py-20 text-muted-foreground">This report link is invalid or was revoked.</div>
        ) : (
          <>
            <h1 className="text-3xl font-semibold tracking-tight">{data.company} — Business Snapshot</h1>
            <p className="text-muted-foreground mt-1">Powered by MNB Cortex, the AI COO for SMEs.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-8">
              {(data.metrics || []).map((m: any, i: number) => (
                <div key={i} className="rounded-xl border p-4 bg-card">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><span className={`h-2 w-2 rounded-full ${dot[m.status] || "bg-muted"}`} />{m.label}</div>
                  <div className="text-2xl font-semibold mt-1">{fmt(m.value, m.unit)}</div>
                  <div className={`text-xs ${m.delta_pct >= 0 ? "text-success" : "text-danger"}`}>{m.delta_pct > 0 ? "+" : ""}{m.delta_pct}%</div>
                </div>
              ))}
            </div>
            {(data.insights || []).length > 0 && (
              <div className="mt-8"><h2 className="font-semibold mb-3">AI insights</h2><div className="space-y-2">
                {data.insights.map((ins: any, i: number) => (<div key={i} className="rounded-xl border p-4"><p className="font-medium text-sm">{ins.title}</p><p className="text-sm text-muted-foreground mt-0.5">{ins.detail}</p></div>))}
              </div></div>
            )}
            <div className="mt-10 text-center"><Link href="/pricing" className="rounded-lg bg-primary text-primary-foreground px-6 h-11 inline-flex items-center font-medium">Get MNB Cortex for your business</Link></div>
          </>
        )}
      </section>
    </main>
  );
}
