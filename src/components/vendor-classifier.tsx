"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Check, Loader2 } from "lucide-react";
import { setVendorUdyam } from "@/lib/actions";

/**
 * Classify each supplier's Udyam category.
 *
 * This is the one thing Cortex cannot work out for itself: Udyam registration
 * status is not derivable from anything else in the workspace, and 43B(h)
 * applies only to micro and small. So the exposure figure is only as good as
 * this screen, which is why it is a single click per supplier rather than a
 * form — anything slower and it does not get filled in, and an unfilled
 * classification means the whole feature reports "unknown" forever.
 */
const OPTIONS: { id: string; label: string; hint: string }[] = [
  { id: "micro", label: "Micro", hint: "Covered by 43B(h)" },
  { id: "small", label: "Small", hint: "Covered by 43B(h)" },
  { id: "medium", label: "Medium", hint: "Not covered" },
  { id: "not_registered", label: "Not registered", hint: "Not covered" },
];

export function VendorClassifier({ vendors }: { vendors: any[] }) {
  const [state, setState] = useState<Record<string, string>>(
    Object.fromEntries(vendors.map((v) => [v.id, v.udyam_category || ""])),
  );
  const [busy, setBusy] = useState<string | null>(null);

  async function set(id: string, category: string) {
    const prev = state[id] || "";
    setState((s) => ({ ...s, [id]: category }));   // optimistic
    setBusy(id);
    try {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("udyam_category", category);
      const res = await setVendorUdyam(fd);
      if (!res?.ok) setState((s) => ({ ...s, [id]: prev }));   // put it back
    } catch {
      setState((s) => ({ ...s, [id]: prev }));
    } finally { setBusy(null); }
  }

  if (!vendors.length) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        No suppliers on file yet. They appear here automatically from your payable bills —
        import or add a purchase invoice and this list fills itself.
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="divide-y">
        {vendors.map((v) => (
          <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{v.name}</div>
              <div className="text-xs text-muted-foreground">
                {state[v.id]
                  ? OPTIONS.find((o) => o.id === state[v.id])?.hint
                  : "Not classified — counted as unknown, not as zero"}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {busy === v.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              {OPTIONS.map((o) => {
                const on = state[v.id] === o.id;
                const covered = o.id === "micro" || o.id === "small";
                return (
                  <button
                    key={o.id}
                    onClick={() => set(v.id, o.id)}
                    className={`rounded-lg border px-2.5 h-8 text-xs font-medium transition-colors ${
                      on
                        ? covered
                          ? "bg-danger/10 text-danger border-danger/30"
                          : "bg-secondary text-foreground border-border"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {on && <Check className="h-3 w-3 inline mr-1" />}
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        Ask each supplier for their Udyam registration number — it states the category. Micro and small are covered
        by Section 43B(h); medium and unregistered are not.
      </p>
    </Card>
  );
}
