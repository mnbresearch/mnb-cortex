import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getStatutoryProfile } from "@/lib/data";

/*
  "NEEDS YOU" — the four counts an owner should see before anything else.

  Each one is a thing that waits on a human and goes stale if ignored:
    · proposals Cortex wants to run (action_proposals, status proposed)
    · collection drafts waiting to be approved before they go out
    · alerts raised and not yet dismissed
    · statutory deadlines inside seven days, filtered by this workspace's
      own statutory profile so a rule that does not apply is not shown as due

  Read with the SESSION client (RLS), never the service role: this is shown to
  every member, and a count the member could not open is a count they should
  not see. Each query is independent and failure-isolated — a table not yet
  migrated yields 0 for that tile, not an empty strip.
*/
export type NeedsYou = {
  proposals: number;
  drafts: number;
  alerts: number;
  deadlines: Array<{ name: string; daysAway: number }>;
};

export async function getNeedsYou(orgId: string): Promise<NeedsYou> {
  const sb = await createClient();
  const nowIso = new Date().toISOString();

  const count = async (table: string, apply: (q: any) => any): Promise<number> => {
    try {
      const { count: c, error } = await apply(sb.from(table).select("id", { count: "exact", head: true }).eq("org_id", orgId));
      if (error) return 0;
      return c || 0;
    } catch { return 0; }
  };

  const [proposals, drafts, alerts, deadlines] = await Promise.all([
    count("action_proposals", (q) => q.eq("status", "proposed").gt("expires_at", nowIso)),
    count("collection_messages", (q) => q.eq("status", "draft")),
    count("alerts", (q) => q.eq("is_read", false).neq("severity", "green")),
    (async () => {
      try {
        const { upcomingDeadlines, splitByProfile } = await import("@/lib/statutory");
        const profile = await getStatutoryProfile();
        const { shown } = splitByProfile(upcomingDeadlines(7), profile);
        return shown.slice(0, 3).map((d) => ({ name: d.name, daysAway: d.daysAway }));
      } catch { return []; }
    })(),
  ]);

  return { proposals, drafts, alerts, deadlines };
}
