"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ArrowRight, Loader2, Zap } from "lucide-react";

type P = { title: string; why: string; tool: string; href: string; urgency: "high" | "medium" | "low" };
const dot: Record<string, string> = { high: "bg-danger", medium: "bg-warning", low: "bg-primary" };
const uLabel: Record<string, string> = { high: "Now", medium: "This week", low: "Soon" };

export function NextBestActions() {
  const [items, setItems] = useState<P[] | null>(null);
  const [mode, setMode] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/priorities", { method: "POST" })
      .then((r) => r.json())
      .then((j) => { if (!alive) return; setItems(j.priorities || []); setMode(j.mode || ""); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <span className="h-8 w-8 rounded-lg brand-gradient grid place-items-center text-white"><Zap className="h-4 w-4" /></span>
        <div>
          <div className="font-semibold leading-tight">Do this now</div>
          <div className="text-xs text-muted-foreground">
            {mode === "setup" ? "Get set up in a minute — then Cortex reads your business" : "Your top priorities, chosen from 120+ modules for you"}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {items === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="h-4 w-4 animate-spin" /> Cortex is prioritising your actions…</div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Add your data and Cortex will tell you exactly what to do next.</p>
        ) : (
          items.map((p, i) => {
            const href = p.href === "/act" ? `/act?brief=${encodeURIComponent(`${p.title} — ${p.why}`)}` : p.href;
            return (
            <Link key={i} href={href} style={{ animationDelay: `${i * 40}ms` }}
              className="rise-in group flex items-start gap-3 rounded-xl border p-3 hover:border-primary/40 hover:bg-accent/40 transition-all">
              <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${dot[p.urgency] || "bg-primary"}`} />
              <div className="flex-1 min-w-0">
                <div className="font-medium flex items-center gap-2 flex-wrap">
                  {p.title}
                  <span className="text-[10px] uppercase tracking-wide rounded-full border px-1.5 py-0.5 text-muted-foreground">{uLabel[p.urgency] || "This week"}</span>
                </div>
                <div className="text-sm text-muted-foreground mt-0.5">{p.why}</div>
                <div className="text-xs text-primary mt-1 inline-flex items-center gap-1 font-medium">{p.tool} <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" /></div>
              </div>
            </Link>
          ); })
        )}
      </div>
    </Card>
  );
}
