"use client";
import { useState } from "react";
import Link from "next/link";
import { INDUSTRIES } from "@/lib/industries";
import { ArrowUpRight, Check, X } from "lucide-react";

export function IndustryPicker() {
  const [active, setActive] = useState(0);
  const ind = INDUSTRIES[active];
  const Icon = ind.icon;

  return (
    <div>
      {/* Industry chips */}
      <div className="flex flex-wrap gap-2">
        {INDUSTRIES.map((i, idx) => {
          const I = i.icon;
          const on = idx === active;
          return (
            <button
              key={i.slug}
              onClick={() => setActive(idx)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 h-9 text-sm transition-all ${on ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent hover:border-primary/40"}`}
              aria-pressed={on}
            >
              <I className="h-3.5 w-3.5" /> {i.name}
            </button>
          );
        })}
      </div>

      {/* Panel */}
      <div key={ind.slug} className="mt-8 rounded-2xl border overflow-hidden" style={{ animation: "ipIn .35s ease" }}>
        <style>{`@keyframes ipIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
        <div className="p-6 lg:p-8 bg-card border-b flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 grid place-items-center shrink-0"><Icon className="h-6 w-6 text-primary" /></div>
          <div>
            <div className="font-display text-2xl lg:text-3xl tracking-tightest">{ind.name}</div>
            <p className="text-muted-foreground mt-1">{ind.tagline}</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-px bg-border">
          {/* Pains */}
          <div className="bg-card p-6 lg:p-8">
            <div className="eyebrow">What keeps you up at night</div>
            <ul className="mt-4 space-y-3">
              {ind.pains.map((p) => (
                <li key={p} className="flex items-start gap-3 text-sm lg:text-base">
                  <span className="h-5 w-5 rounded-full bg-danger/10 grid place-items-center shrink-0 mt-0.5"><X className="h-3 w-3 text-danger" /></span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
          {/* Fixes */}
          <div className="bg-primary/[0.04] p-6 lg:p-8">
            <div className="eyebrow text-primary">How Cortex handles it</div>
            <ul className="mt-4 space-y-3">
              {ind.fixes.map((f) => (
                <li key={f.tool} className="flex items-start gap-3 text-sm lg:text-base">
                  <span className="h-5 w-5 rounded-full bg-primary/15 grid place-items-center shrink-0 mt-0.5"><Check className="h-3 w-3 text-primary" /></span>
                  <span>{f.tool}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bg-card p-6 lg:p-8 border-t flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm lg:text-base max-w-xl"><span className="text-primary font-medium">The outcome:</span> {ind.outcome}</p>
          <Link href="/login" className="inline-flex items-center gap-1.5 rounded-full btn-ink px-5 h-11 text-sm font-medium shrink-0" data-cursor>
            Get started for {ind.name.split(" ")[0].toLowerCase() === "any" ? "your business" : ind.name} <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
