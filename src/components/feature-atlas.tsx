"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ArrowUpRight, Check, Lock } from "lucide-react";
import { JOBS, FEATURES, matches, type JobId } from "@/lib/feature-atlas";

/*
  Everything Cortex does, by the job it does — searchable.
  Data and plan rules come from lib/feature-atlas.ts; the server passes in
  per-feature `included`/`label`/`used` so nothing here guesses.

  `variant="app"`  — links open the feature; locked ones say which plan has it.
  `variant="public"` — every link goes through sign-up with ?next= to the feature.
*/
export type AtlasRow = { id: string; included: boolean; label: string; used: boolean };

export function FeatureAtlas({ rows, variant }: { rows: AtlasRow[]; variant: "app" | "public" }) {
  const [q, setQ] = useState("");
  const [job, setJob] = useState<JobId | "all">("all");
  const meta = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const list = FEATURES.filter((f) => (job === "all" || f.job === job) && matches(f, q));
  const byJob = JOBS.map((j) => ({ ...j, items: list.filter((f) => f.job === j.id) })).filter((j) => j.items.length);

  return (
    <div data-feature-atlas="">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search what Cortex can do</span>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try “GST”, “overdue”, “WhatsApp”, “stock”…"
            className="w-full rounded-xl border bg-background pl-9 pr-3 min-h-11 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </label>
        <span className="text-xs text-muted-foreground">{list.length} of {FEATURES.length}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by job">
        <button onClick={() => setJob("all")} aria-pressed={job === "all"} className={`rounded-full border px-3 min-h-9 text-xs ${job === "all" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}>Everything</button>
        {JOBS.map((j) => (
          <button key={j.id} onClick={() => setJob(j.id)} aria-pressed={job === j.id}
            className={`rounded-full border px-3 min-h-9 text-xs ${job === j.id ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}>
            <span aria-hidden="true">{j.emoji}</span> {j.label}
          </button>
        ))}
      </div>

      {byJob.length === 0 && <p className="mt-6 text-sm text-muted-foreground">Nothing matches “{q}”. Try a simpler word — or ask in Ask Cortex.</p>}

      <div className="mt-6 space-y-8">
        {byJob.map((j) => (
          <section key={j.id} aria-labelledby={`job-${j.id}`}>
            <div className="flex items-baseline gap-2">
              <h3 id={`job-${j.id}`} className="font-semibold"><span aria-hidden="true">{j.emoji}</span> {j.label}</h3>
              <span className="text-xs text-muted-foreground">{j.blurb}</span>
            </div>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {j.items.map((f) => {
                const m = meta.get(f.id) || { included: variant === "public", label: "", used: false };
                const href = variant === "public" ? `/login?mode=signup&next=${encodeURIComponent(f.route)}` : f.route;
                return (
                  <Link key={f.id} href={href} className="group rounded-xl border bg-card p-4 hover:border-primary/40 transition-colors flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-sm">{f.title}</span>
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" aria-hidden="true" />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground leading-5 flex-1">{f.outcome}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                      {variant === "app" ? (
                        m.included
                          ? <span className="inline-flex items-center gap-1 rounded-md bg-success/10 text-success px-1.5 py-0.5"><Check className="h-3 w-3" aria-hidden="true" />In your plan</span>
                          : <span className="inline-flex items-center gap-1 rounded-md bg-secondary text-muted-foreground px-1.5 py-0.5"><Lock className="h-3 w-3" aria-hidden="true" />{m.label}</span>
                      ) : (
                        <span className="rounded-md bg-secondary text-muted-foreground px-1.5 py-0.5">{m.label}</span>
                      )}
                      {m.used && <span className="rounded-md bg-primary/10 text-primary px-1.5 py-0.5">Used recently</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
