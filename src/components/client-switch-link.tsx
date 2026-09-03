"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Loader2 } from "lucide-react";

/**
 * Open one client's workspace from the Practice console.
 *
 * A POST rather than a link: /api/org/switch sets the active-workspace cookie
 * server-side AND re-verifies membership before doing so. Making this a plain
 * <a href="?org=..."> would move the choice of workspace into a URL, which is
 * exactly the shape of bug where someone edits the id and lands somewhere they
 * were never added to.
 */
export function ClientSwitchLink({ orgId }: { orgId: string }) {
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      const r = await fetch("/api/org/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId }),
      });
      if (r.ok) window.location.href = "/dashboard";
      else setBusy(false);
    } catch { setBusy(false); }
  }

  return (
    <Button variant="outline" size="sm" onClick={open} disabled={busy} className="shrink-0">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
      {busy ? "Opening…" : "Open"}
    </Button>
  );
}
