"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Plus } from "lucide-react";
import { createGroupWorkspace } from "@/lib/actions";

/*
  "Add a company" — for an Enterprise group or a Practice firm.

  Creates the workspace, makes you its owner and links it to this one
  (createGroupWorkspace → cortex_practice_claim). It then appears in the list
  below and in the workspace switcher. The server decides everything; this
  only collects a name.
*/
export function GroupWorkspaceCreator({ group }: { group: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const noun = group ? "company" : "client";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("industry", industry);
      const r = await createGroupWorkspace(fd);
      if (r.ok) {
        setMsg({ ok: true, text: `${name.trim()} is ready. ${group ? "It uses the group's plan and credits" : "It uses your firm's credits"} — open it from the workspace switcher.` });
        setName(""); setIndustry("");
        router.refresh();
      } else {
        setMsg({ ok: false, text: r.error || "Could not create it." });
      }
    });
  }

  return (
    <form onSubmit={submit} className="rounded-xl border p-4 space-y-3" aria-label={`Add a ${noun} workspace`}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <Building2 className="h-4 w-4 text-primary" aria-hidden="true" /> Add a {noun} workspace
      </div>
      <p className="text-xs text-muted-foreground leading-5">
        {group
          ? "Each company gets its own books, team and dashboard, with this group's plan, features and shared credits. You become its owner and can invite its team."
          : "Set up a client's workspace yourself. It uses your firm's shared credits; invite the client's team once it exists."}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="gw-name" className="block text-xs text-muted-foreground mb-1">{group ? "Company name" : "Client name"}</label>
          <input id="gw-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required
            placeholder={group ? "e.g. Nanda Textiles Pvt Ltd" : "e.g. Sharma Forgings"}
            className="w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="w-44">
          <label htmlFor="gw-industry" className="block text-xs text-muted-foreground mb-1">Industry (optional)</label>
          <input id="gw-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} maxLength={40}
            placeholder="manufacturing"
            className="w-full rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <button type="submit" disabled={pending || name.trim().length < 2}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground min-h-10 px-4 text-sm font-medium hover:opacity-90 disabled:opacity-60">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          {pending ? "Creating…" : "Create"}
        </button>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
    </form>
  );
}
