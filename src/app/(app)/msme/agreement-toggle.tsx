"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Check, Loader2 } from "lucide-react";
import { setVendorAgreement } from "./actions";

type V = { id: string; name: string; has_written_agreement?: boolean | null; written_agreement_recorded_at?: string | null };

/**
 * One row per supplier: "Is there a written agreement?" Yes / No.
 *
 * Unrecorded means UNKNOWN, and the exposure above uses the 15-day window for
 * it — the shorter one, so an unknown can never make a late bill look safe.
 * Errors are shown inline and the choice is put back; a failed save never
 * looks like a saved one.
 */
export function AgreementToggle({ vendors }: { vendors: V[] }) {
  const router = useRouter();
  const initial = (v: V) => (v.written_agreement_recorded_at ? (v.has_written_agreement ? "yes" : "no") : "");
  const [state, setState] = useState<Record<string, string>>(Object.fromEntries(vendors.map((v) => [v.id, initial(v)])));
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});

  async function set(id: string, value: "yes" | "no") {
    const prev = state[id] || "";
    setState((s) => ({ ...s, [id]: value }));
    setErr((e) => ({ ...e, [id]: "" }));
    setBusy(id);
    try {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("has_written_agreement", value);
      const res = await setVendorAgreement(fd);
      if (!res?.ok) {
        setState((s) => ({ ...s, [id]: prev }));
        setErr((e) => ({ ...e, [id]: res?.error || "Could not save." }));
        return;
      }
      router.refresh();
    } catch {
      setState((s) => ({ ...s, [id]: prev }));
      setErr((e) => ({ ...e, [id]: "Could not reach the server — nothing was saved." }));
    } finally { setBusy(null); }
  }

  if (!vendors.length) return null;
  const unknown = vendors.filter((v) => !state[v.id]).length;

  return (
    <Card className="p-4">
      {unknown > 0 && (
        <p className="text-xs text-muted-foreground mb-2">
          {unknown} of {vendors.length} supplier{vendors.length === 1 ? "" : "s"} not recorded — their bills are aged
          against the <b>15-day</b> window until you say a written agreement exists.
        </p>
      )}
      <div className="divide-y">
        {vendors.map((v) => (
          <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{v.name}</div>
              <div className="text-xs text-muted-foreground">
                {state[v.id] === "yes" ? "Written agreement — 45-day window"
                  : state[v.id] === "no" ? "No written agreement — 15-day window"
                  : "Not recorded — 15-day window assumed"}
              </div>
              {err[v.id] ? <div role="alert" className="text-xs text-danger mt-0.5">{err[v.id]}</div> : null}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {busy === v.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              {(["yes", "no"] as const).map((opt) => {
                const on = state[v.id] === opt;
                return (
                  <button key={opt} onClick={() => set(v.id, opt)} disabled={busy === v.id}
                    aria-pressed={on}
                    className={`rounded-lg border px-2.5 h-8 text-xs font-medium transition-colors ${on ? "bg-secondary text-foreground border-border" : "text-muted-foreground hover:text-foreground"}`}>
                    {on && <Check className="h-3 w-3 inline mr-1" />}
                    {opt === "yes" ? "Written agreement" : "No agreement"}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
