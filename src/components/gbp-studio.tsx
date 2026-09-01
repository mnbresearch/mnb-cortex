"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Sparkles, Loader2, AlertTriangle } from "lucide-react";
import { GBP_KINDS, limitFor, type GbpKind } from "@/lib/gbp";

/**
 * Google Business Profile studio.
 *
 * The character counter is not decoration. Google enforces these limits at
 * publication, so a 900-character description is rejected AFTER the owner has
 * written it, with no explanation of which field was too long. Showing the
 * count against the real limit as the text arrives is the difference between
 * copy that publishes and copy that wastes a trip.
 */
export function GbpStudio({ businessName }: { businessName?: string | null }) {
  const [kind, setKind] = useState<GbpKind>("description");
  const [city, setCity] = useState("");
  const [detail, setDetail] = useState("");
  const [rating, setRating] = useState(5);
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  const spec = GBP_KINDS.find((k) => k.id === kind)!;
  const limit = limitFor(kind);
  const over = out.length > limit;

  async function run() {
    setBusy(true); setErr(""); setOut("");
    try {
      const r = await fetch("/api/gbp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, city, detail, rating: kind === "review_reply" ? rating : undefined }),
      });
      const j = await r.json();
      if (j.ok) setOut(j.text || ""); else setErr(j.error || "Could not generate.");
    } catch { setErr("Network error."); } finally { setBusy(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(out); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {}
  }

  const I = "w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-4">
      <Card className="p-5 space-y-4 h-fit">
        <div>
          <label className="text-xs text-muted-foreground">What do you need?</label>
          <select className={I + " mt-1"} value={kind} onChange={(e) => { setKind(e.target.value as GbpKind); setOut(""); }}>
            {GBP_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
          <p className="text-xs text-muted-foreground mt-1.5">{spec.blurb}</p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">City / area you serve</label>
          <input className={I + " mt-1"} value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Karol Bagh, Delhi" />
        </div>

        {spec.needsDetail && (
          <div>
            <label className="text-xs text-muted-foreground">{spec.needsDetail}</label>
            <textarea
              className="w-full mt-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring min-h-[110px]"
              value={detail} onChange={(e) => setDetail(e.target.value)}
              placeholder={kind === "review_reply" ? "Paste the customer's review here…" : "Describe it in your own words…"}
            />
          </div>
        )}

        {kind === "review_reply" && (
          <div>
            <label className="text-xs text-muted-foreground">Star rating</label>
            <select className={I + " mt-1"} value={rating} onChange={(e) => setRating(Number(e.target.value))}>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n === 1 ? "" : "s"}</option>)}
            </select>
            <p className="text-xs text-muted-foreground mt-1.5">
              The tone changes with the rating — a one-star reply should acknowledge and move offline, not argue.
            </p>
          </div>
        )}

        <Button onClick={run} disabled={busy} className="w-full">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Writing…</> : <><Sparkles className="h-4 w-4" /> Generate</>}
        </Button>
        {err && <p className="text-xs text-danger">{err}</p>}
      </Card>

      <Card className="p-5 min-h-[320px] flex flex-col">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="font-semibold text-sm">{spec.label}</div>
          {out && (
            <div className="flex items-center gap-3">
              <span className={`text-xs tabular-nums ${over ? "text-danger font-medium" : "text-muted-foreground"}`}>
                {out.length.toLocaleString("en-IN")} / {limit.toLocaleString("en-IN")}
              </span>
              <button onClick={copy} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                {copied ? <><Check className="h-3.5 w-3.5 text-success" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
              </button>
            </div>
          )}
        </div>

        {over && (
          <div className="mb-3 rounded-lg border border-danger/30 bg-danger/5 p-3 text-xs flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
            <span>
              Over Google&rsquo;s {limit.toLocaleString("en-IN")}-character limit for this field. Google rejects it at
              publication without saying which field was too long — trim before pasting.
            </span>
          </div>
        )}

        {out ? (
          <pre className="whitespace-pre-wrap text-sm leading-6 flex-1">{out}</pre>
        ) : (
          <div className="flex-1 grid place-items-center text-sm text-muted-foreground text-center px-6">
            {busy ? "Writing…" : `Pick what you need on the left${businessName ? ` for ${businessName}` : ""} and generate.`}
          </div>
        )}
      </Card>
    </div>
  );
}
