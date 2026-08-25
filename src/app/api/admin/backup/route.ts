import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/superadmin";
import { cronAuthorised } from "@/lib/cron-auth";
import { createBackup } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The export walks 46 tables sequentially. The default limit would cut it off
// partway and hand back a file that looks fine and isn't.
export const maxDuration = 300;

/**
 * Download a full logical backup.
 *
 * Two ways in, both authenticated:
 *   - a signed-in platform super-admin (the human, pressing the button)
 *   - a caller holding CRON_SECRET (a scheduler, unattended)
 *
 * There is no third way. This endpoint returns every row of every customer's
 * data in one file, so it is the single most sensitive route in the app — it
 * deserves more suspicion than any other, and it gets an explicit no-store so
 * no proxy or CDN ever holds a copy.
 *
 * ?meta=1 returns just the manifest, so a monitoring check can confirm the
 * backup still works without transferring the whole database.
 */
export async function GET(req: Request) {
  const authorised = (await isSuperAdmin()) || cronAuthorised(req);
  if (!authorised) {
    // Deliberately vague. This route's existence is not a secret, but which
    // half of the check failed is not something an anonymous caller should learn.
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }

  const res = await createBackup();
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
  }

  const metaOnly = new URL(req.url).searchParams.get("meta") === "1";
  if (metaOnly) {
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
