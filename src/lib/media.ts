import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { grantCredits, resolvePayerOrgId, refundReason } from "@/lib/credits";

/*
  THE MEDIA LIBRARY — every generated image and video, kept, and a video job
  that cannot be lost or left unpaid-for.

  A video is a job: submitted, then polled for one to three minutes. Before
  this file the job existed only in the browser's memory, so:
    · closing the tab lost a clip that cost ~₹77 of Veo time;
    · a failure AFTER Veo accepted the job (safety filter, model error) was
      never refunded — only submit-time failures were;
    · any signed-in user holding an operation id could poll or download it.
  Now each job is a media_assets row, scoped to its workspace, settled exactly
  once by settleVideoJob() — from the status poll or from the nightly sweep.

  Before 2026_zzzv is applied the table does not exist. Every function here
  reports that as `missing` so the routes fall back to yesterday's behaviour
  instead of failing.
*/

export const BUCKET = "media";

export type MediaRow = {
  id: string; org_id: string; user_id: string | null; kind: "image" | "video";
  agent_id: string | null; title: string | null; prompt: string | null; aspect: string | null;
  status: "running" | "done" | "failed"; operation: string | null; result_uri: string | null;
  storage_path: string | null; mime: string | null; cost: number; charged: boolean; refunded: boolean;
  byo: boolean; error: string | null; created_at: string; finished_at: string | null;
};

/** The table is not migrated yet (or the cache has not reloaded). */
export function isMissingTable(err: unknown): boolean {
  const m = `${(err as any)?.code || ""} ${(err as any)?.message || ""}`;
  return /42P01|PGRST205|PGRST204|media_assets/.test(m) && /does not exist|not find|schema cache|42P01|PGRST20/.test(m);
}

export async function createMedia(row: Partial<MediaRow> & { org_id: string; kind: "image" | "video" }): Promise<{ id: string | null; missing: boolean }> {
  const svc = serviceClient();
  if (!svc) return { id: null, missing: true };
  const { data, error } = await svc.from("media_assets").insert(row).select("id").maybeSingle();
  if (error) {
    if (!isMissingTable(error)) console.error(`[media] insert failed: ${error.message}`);
    return { id: null, missing: isMissingTable(error) };
  }
  return { id: (data as any)?.id ?? null, missing: false };
}

export async function jobByOperation(orgId: string, operation: string): Promise<{ row: MediaRow | null; missing: boolean }> {
  const svc = serviceClient();
  if (!svc) return { row: null, missing: true };
  const { data, error } = await svc.from("media_assets").select("*").eq("org_id", orgId).eq("operation", operation).maybeSingle();
  if (error) return { row: null, missing: isMissingTable(error) };
  return { row: (data as MediaRow) || null, missing: false };
}

export async function mediaById(orgId: string, id: string): Promise<MediaRow | null> {
  const svc = serviceClient();
  if (!svc || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await svc.from("media_assets").select("*").eq("org_id", orgId).eq("id", id).maybeSingle();
  return (data as MediaRow) || null;
}

export async function listMedia(orgId: string, limit = 60): Promise<{ rows: MediaRow[]; missing: boolean }> {
  const svc = serviceClient();
  if (!svc) return { rows: [], missing: true };
  const { data, error } = await svc.from("media_assets").select("*").eq("org_id", orgId)
    .neq("status", "failed").order("created_at", { ascending: false }).limit(limit);
  if (error) return { rows: [], missing: isMissingTable(error) };
  return { rows: (data as MediaRow[]) || [], missing: false };
}

const EXT: Record<string, string> = { "video/mp4": "mp4", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
export const extFor = (mime: string | null | undefined) => EXT[String(mime || "").toLowerCase()] || (String(mime || "").startsWith("video") ? "mp4" : "png");

/** Put bytes in the private bucket. Returns the object path, or null. */
export async function storeBytes(orgId: string, id: string, bytes: Uint8Array, mime: string): Promise<string | null> {
  const svc = serviceClient();
  if (!svc) return null;
  const path = `${orgId}/${id}.${extFor(mime)}`;
  try {
    const { error } = await svc.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: true });
    if (error) { console.error(`[media] upload failed: ${error.message}`); return null; }
    return path;
  } catch (e: any) { console.error(`[media] upload threw: ${e?.message}`); return null; }
}

export async function signedUrl(path: string, seconds = 3600, download?: string): Promise<string | null> {
  const svc = serviceClient();
  if (!svc) return null;
  try {
    const { data, error } = await svc.storage.from(BUCKET).createSignedUrl(path, seconds, download ? { download } : undefined);
    if (error) return null;
    return data?.signedUrl || null;
  } catch { return null; }
}

export async function deleteMedia(orgId: string, id: string): Promise<{ ok: boolean; error?: string }> {
  const svc = serviceClient();
  if (!svc) return { ok: false, error: "Server not configured." };
  const row = await mediaById(orgId, id);
  if (!row) return { ok: false, error: "Not found." };
  if (row.status === "running") return { ok: false, error: "This video is still being made — delete it once it finishes." };
  /*
    The FILE first, and its result read. supabase-js REPORTS a failed remove as
    `{ error }` rather than throwing, so the old try/catch never saw one: the
    row was deleted anyway and the object stayed in the bucket with nothing
    pointing at it — a private file the customer believes is gone. If the file
    cannot be removed, keep the row so the delete can be retried.
  */
  if (row.storage_path) {
    try {
      const { error: rmErr } = await svc.storage.from(BUCKET).remove([row.storage_path]);
      if (rmErr) { console.error(`[media] storage remove failed for ${row.id}: ${rmErr.message}`); return { ok: false, error: "Could not delete the file from storage — please try again." }; }
    } catch (e: any) {
      console.error(`[media] storage remove threw for ${row.id}: ${e?.message}`);
      return { ok: false, error: "Could not delete the file from storage — please try again." };
    }
  }
  const { data, error } = await svc.from("media_assets").delete().eq("org_id", orgId).eq("id", id).select("id");
  if (error) return { ok: false, error: error.message };
  return data && data.length === 1 ? { ok: true } : { ok: false, error: "Not found." };
}

/** Decode a data: URL into bytes + mime. */
export function fromDataUrl(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const m = String(dataUrl || "").match(/^data:([\w/+.-]+);base64,(.+)$/);
  if (!m) return null;
  try { return { mime: m[1], bytes: new Uint8Array(Buffer.from(m[2], "base64")) }; } catch { return null; }
}

/* ------------------------------------------------------------ settling a job */

export type Settled =
  | { state: "running" }
  | { state: "done"; mediaId: string | null; url: string }
  | { state: "error"; error: string; refunded: boolean };

/**
 * Fail a running job and refund it — at most once, whoever gets there first.
 * The claim is the conditional UPDATE (status running → failed, refunded false
 * → true); only the caller that flips it grants the credits back.
 *
 * `refunded: true` is the LOCK, and it is only allowed to stay true if the
 * grant actually happened. It used to be set before grantCredits and never
 * undone, so a grant that threw left the row saying "refunded" with no credits
 * returned and nothing that would ever try again. Now a failed grant releases
 * the lock (refunded → false), and retryRefund() picks the row up later.
 */
export async function failAndRefund(row: MediaRow, reason: string): Promise<boolean> {
  const svc = serviceClient();
  if (!svc) return false;
  const { data } = await svc.from("media_assets")
    .update({ status: "failed", error: reason.slice(0, 500), refunded: true, finished_at: new Date().toISOString() })
    .eq("id", row.id).eq("org_id", row.org_id).eq("status", "running").eq("refunded", false)
    .select("id, cost, charged");
  const won = ((data as any[]) || [])[0];
  if (!won) return false;
  return grantClaimedRefund(row, won);
}

/**
 * A job that FAILED but whose refund did not go through (the grant threw and
 * the lock was released). Claims refunded false → true on a failed row; only
 * the caller that flips it grants. Same release-on-failure rule.
 */
export async function retryRefund(row: MediaRow): Promise<boolean> {
  const svc = serviceClient();
  if (!svc || row.status !== "failed" || row.refunded || !row.charged || !(Number(row.cost) > 0)) return false;
  const { data } = await svc.from("media_assets")
    .update({ refunded: true })
    .eq("id", row.id).eq("org_id", row.org_id).eq("status", "failed").eq("refunded", false)
    .select("id, cost, charged");
  const won = ((data as any[]) || [])[0];
  if (!won) return false;
  return grantClaimedRefund(row, won);
}

/** Grant a claimed refund to WHOEVER PAID; on failure, release the claim so it can be retried. */
async function grantClaimedRefund(row: MediaRow, won: { cost: any; charged: any }): Promise<boolean> {
  const svc = serviceClient();
  if (!(won.charged && Number(won.cost) > 0)) {
    /* Nothing was charged (BYO key, unmetered) — there is nothing to give back. */
    return false;
  }
  try {
    /* A pooled workspace's clip was paid by the Practice firm, so the firm gets it back. */
    const payer = await resolvePayerOrgId(row.org_id);
    const base = refundReason(`agent_video:${row.id}`, null);
    await grantCredits(payer.payerOrgId, Number(won.cost), payer.pooledFor ? `${base}:client:${payer.pooledFor}` : base);
    return true;
  } catch (e: any) {
    console.error(`[media] refund failed for ${row.id}: ${e?.message} — releasing the claim for a retry`);
    try {
      const { error } = await svc!.from("media_assets").update({ refunded: false }).eq("id", row.id).eq("org_id", row.org_id).eq("refunded", true);
      if (error) console.error(`[media] could not release refund claim for ${row.id}: ${error.message} — needs a manual refund of ${won.cost}`);
    } catch (e2: any) { console.error(`[media] could not release refund claim for ${row.id}: ${e2?.message} — needs a manual refund of ${won.cost}`); }
    return false;
  }
}

/**
 * Take a Veo status and make the row match it. `poll` and `fetchFile` are
 * passed in (they need the right API key in scope — the workspace's own key
 * when it submitted with one), which also keeps this testable.
 */
export async function settleVideoJob(
  row: MediaRow,
  poll: (op: string) => Promise<{ state: "running" } | { state: "done"; url: string } | { state: "error"; error: string }>,
  fetchFile: (uri: string) => Promise<Response | null>,
  opts: { giveUpAfterMs?: number } = {},
): Promise<Settled> {
  const svc = serviceClient();
  if (row.status === "done") return { state: "done", mediaId: row.id, url: `/api/media/${row.id}` };
  if (row.status === "failed") {
    /* A failed job whose refund did not land gets another attempt here. */
    const refunded = row.refunded || await retryRefund(row);
    return { state: "error", error: row.error || "Generation failed.", refunded };
  }
  if (!row.operation) return { state: "error", error: "No operation recorded.", refunded: false };

  const st = await poll(row.operation);
  if (st.state === "running") {
    const age = Date.now() - new Date(row.created_at).getTime();
    if (opts.giveUpAfterMs && age > opts.giveUpAfterMs) {
      const refunded = await failAndRefund(row, "Veo did not finish within an hour.");
      return { state: "error", error: "The video never finished.", refunded };
    }
    return { state: "running" };
  }
  if (st.state === "error") {
    const refunded = await failAndRefund(row, st.error);
    return { state: "error", error: st.error, refunded };
  }

  /* Done: copy the file into our own storage, so it outlives Google's ~48h. */
  let path: string | null = null;
  try {
    const res = await fetchFile(st.url);
    if (res && res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      const mime = res.headers.get("content-type") || "video/mp4";
      if (bytes.byteLength > 0) path = await storeBytes(row.org_id, row.id, bytes, mime.startsWith("video") ? mime : "video/mp4");
    }
  } catch { path = null; }

  if (svc) {
    await svc.from("media_assets").update({
      status: "done", result_uri: st.url, storage_path: path, mime: "video/mp4", finished_at: new Date().toISOString(),
    }).eq("id", row.id).eq("org_id", row.org_id).eq("status", "running");
  }
  /* Stored → our signed-URL route. Not stored (bucket missing, upload failed)
     → the scoped proxy, which only serves a result_uri this workspace owns. */
  return { state: "done", mediaId: row.id, url: path ? `/api/media/${row.id}` : `/api/agents/video?file=${encodeURIComponent(st.url)}` };
}
