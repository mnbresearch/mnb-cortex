import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";
import { collectWorkspace } from "./collect";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
  Settings → "Export workspace (JSON)". Every workspace table, paged to the end
  (see ./collect.ts). Read with the member's own session, so RLS decides what a
  given role can see — the file says so. Any read error fails the whole export
  with a 500 rather than handing over a file that silently lacks a table.
*/
export async function GET() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ error: "sign in" }, { status: 401 });
  const sb = await createClient();
  const r = await collectWorkspace(sb, orgId);
  if (!r.ok) {
    return NextResponse.json(
      { error: `Export failed — nothing was exported. ${r.error} Please try again; if it keeps failing, contact support.`, table: r.table },
      { status: 500 },
    );
  }
  return new NextResponse(JSON.stringify({
    exported: new Date().toISOString(),
    org: orgId,
    note: "Every workspace table, read in full with your sign-in, so rows your role is not permitted to see are not included. "
        + "API keys, webhook secrets, integration credentials, share-link tokens and secret settings are redacted.",
    counts: r.counts,
    absent: r.absent,
    data: r.data,
  }, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename=mnb-cortex-backup.json` },
  });
}
