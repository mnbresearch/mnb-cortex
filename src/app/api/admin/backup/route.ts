import { NextResponse } from "next/server";
import { isSuperAdmin, currentEmail } from "@/lib/superadmin";
import { serviceClient } from "@/lib/supabase/server";
import { createBackup } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The export walks every table Cortex uses sequentially. A shorter limit would cut it off
// partway and hand back a file that looks fine and isn't.
export const maxDuration = 300;

/**
 * Download a full logical backup.
 *
 * SUPER-ADMIN ONLY. An earlier draft also accepted CRON_SECRET so a scheduler
 * could pull backups. That was dropped, for two reasons:
 *
 *  1. cronAuthorised() accepts the secret as a ?secret= QUERY PARAMETER. On a
 *     cron route that is merely untidy. On this route the URL would become a
 *     self-contained bearer credential that downloads every customer's data —
 *     and URLs land in platform request logs, shell history, and the config of
 *     whatever uptime monitor you paste it into. Long-lived secret, permanent
 *     exposure.
 *  2. CRON_SECRET already authorises three cron endpoints. Adding this one
 *     would have widened the blast radius of a single leaked value from "sends
 *     some emails early" to "exfiltrates the entire platform".
 *
 * If unattended backups are wanted later, they should use a separate secret,
 * accepted only via the Authorization header, and preferably push to storage
 * rather than exposing a pull endpoint at all.
 *
 * ?meta=1 returns the manifest without the payload. Note this still performs
 * the FULL export server-side and only skips the transfer — it is a way to
 * inspect what a backup would contain, not a cheap health check.
 */
export async function GET(req: Request) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }

  const who = (await currentEmail()) || "unknown";
  const res = await createBackup();

  // Record every export attempt. A full-database download is the one action
  // where, if an operator account is ever compromised, you need evidence that
  // it happened — and the absence of a record is indistinguishable from the
  // absence of an incident.
  try {
    const sb = serviceClient();
    if (sb) {
      await sb.from("system_status").upsert(
        {
          key: "last_backup",
          value: JSON.stringify({
            at: new Date().toISOString(),
            by: who,
            ok: res.ok,
            rows: res.ok ? res.manifest.totalRows : 0,
            complete: res.ok ? res.manifest.complete : false,
            error: res.ok ? undefined : res.error,
          }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
    }
  } catch { /* an audit write must never be the reason a backup fails */ }

  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
  }

  if (new URL(req.url).searchParams.get("meta") === "1") {
    return NextResponse.json(
      { ok: true, ...res.manifest, bytes: res.gz.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return new Response(new Uint8Array(res.gz), {
    status: 200,
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${res.filename}"`,
      "Content-Length": String(res.gz.length),
      // If the backup is partial the caller must be able to tell without
      // unzipping it, so the warning travels on the response itself.
      "X-Backup-Complete": String(res.manifest.complete),
      "X-Backup-Rows": String(res.manifest.totalRows),
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}
