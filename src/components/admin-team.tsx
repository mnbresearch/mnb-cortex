"use client";
import { SafeForm } from "@/components/safe-form";
import { Badge } from "@/components/ui/badge";
import { changeMemberRole, removeMember } from "@/lib/actions";
import { UserMinus } from "lucide-react";

/*
  Team management on /admin: change a role, remove a member.

  There was no way to do either — a departing employee kept full access until
  the whole workspace was erased. The rules are enforced by the server actions
  (and RLS); this only hides controls the viewer cannot use:
    · only admins/owners see controls
    · no controls on your own row, or on anyone ranked above you
    · the role list stops at your own rank
  Removing asks for confirmation first — it takes effect immediately.
*/

const RANK: Record<string, number> = { viewer: 1, analyst: 2, manager: 3, admin: 4, owner: 5 };
const ROLES = ["owner", "admin", "manager", "analyst", "viewer"];

export type TeamMember = { id: string; name: string; role: string };

export function AdminTeam({ members, myId, myRole }: { members: TeamMember[]; myId: string | null; myRole: string }) {
  const mine = RANK[String(myRole || "").toLowerCase()] || 0;
  const canManage = mine >= RANK.admin;
  const inp = "rounded-lg border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <div className="space-y-2">
      {members.map((m) => {
        const theirs = RANK[String(m.role || "").toLowerCase()] || 0;
        const self = m.id === myId;
        const editable = canManage && !self && theirs <= mine;
        return (
          <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-purple-500 shrink-0" />
              <div className="font-medium text-sm truncate">{m.name}{self ? " (you)" : ""}</div>
            </div>
            {editable ? (
              <div className="flex flex-wrap items-center gap-2">
                <SafeForm key={`${m.id}:${m.role}`} action={changeMemberRole} successMessage="Role updated." className="flex items-center gap-2">
                  <input type="hidden" name="user_id" value={m.id} />
                  <select name="role" defaultValue={String(m.role || "viewer").toLowerCase()} className={inp} aria-label={`Role for ${m.name}`}>
                    {ROLES.filter((r) => RANK[r] <= mine).map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button type="submit" className="inline-flex items-center rounded-lg border h-8 px-3 text-xs font-medium hover:bg-accent">Save role</button>
                </SafeForm>
                <SafeForm action={removeMember} successMessage="Removed from the workspace.">
                  <input type="hidden" name="user_id" value={m.id} />
                  <button
                    type="submit"
                    onClick={(e) => {
                      if (!window.confirm(`Remove ${m.name} from this workspace? They lose access immediately.`)) e.preventDefault();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border h-8 px-3 text-xs font-medium text-danger hover:bg-danger/10"
                  >
                    <UserMinus className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                  </button>
                </SafeForm>
              </div>
            ) : (
              <Badge className="border-border capitalize">{m.role}</Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}
