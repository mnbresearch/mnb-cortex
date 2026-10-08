/*
  IMAGE & VIDEO GENERATION — PAID FOR, KEPT, AND REFUNDED WHEN IT FAILS.

    1. A video job that fails AFTER Veo accepted it is refunded exactly once,
       whether the browser poll or the nightly sweep notices first.
    2. A finished video is copied into the workspace's own storage.
    3. A job nobody finishes within the hour is refunded, not left hanging.
    4. A job that was not charged (own key, unlimited plan) is never "refunded".
    5. Veo gets the right personGeneration per mode, a numeric duration, and
       the UGC agent gets a UGC brief.
    6. Wiring: jobs are scoped to their workspace, polled on its own key,
       images carry an aspect ratio and are kept, the weekly cap ignores
       refunded attempts, the wizard can start from the business's products.

  Run: node --experimental-strip-types --no-warnings scripts/test-media.mjs
*/
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

let pass = 0; const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? `\n      ${d}` : ""}`));
const read = (p) => readFileSync(p, "utf8");

/* ── executed: media.ts against an in-memory table ─────────────────────── */
const dir = mkdtempSync(join(tmpdir(), "media-"));
const src = read("src/lib/media.ts")
  .replace(/^import ["']server-only["'];?\s*$/m, "")
  .replace(/^import \{ serviceClient \} from .*$/m, "const serviceClient = () => globalThis.__svc;")
  .replace(/^import \{ grantCredits \} from .*$/m, "const grantCredits = async (...a) => { globalThis.__grants.push(a); return 0; };");
writeFileSync(join(dir, "media.ts"), src);
const M = await import(pathToFileURL(join(dir, "media.ts")).href);

function fakeSvc(rows, uploads) {
  const from = () => {
    const st = { patch: null, filters: [] };
    const run = () => {
      const hit = rows.filter((r) => st.filters.every(([k, v]) => r[k] === v));
      if (st.patch) for (const r of hit) Object.assign(r, st.patch);
      return { data: hit.map((r) => ({ ...r })), error: null };
    };
    const b = {
      update(p) { st.patch = p; return b; }, select() { return b; },
      eq(k, v) { st.filters.push([k, v]); return b; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return b;
  };
  return { from, storage: { from: () => ({ upload: async (path) => { uploads.push(path); return { error: null }; } }) } };
}
const job = (over = {}) => ({ id: "11111111-1111-4111-8111-111111111111", org_id: "org-1", status: "running", operation: "models/veo/operations/abc", cost: 571, charged: true, refunded: false, created_at: new Date().toISOString(), error: null, ...over });

{
  globalThis.__grants = []; const rows = [job()]; const uploads = [];
  globalThis.__svc = fakeSvc(rows, uploads);
  const s1 = await M.settleVideoJob(rows[0], async () => ({ state: "error", error: "blocked by safety filter" }), async () => null);
  check(s1.state === "error" && s1.refunded === true, "refund: a job Veo fails after acceptance is refunded", JSON.stringify(s1));
  check(globalThis.__grants.length === 1 && globalThis.__grants[0][0] === "org-1" && globalThis.__grants[0][1] === 571, "refund: the exact charge goes back to that workspace", JSON.stringify(globalThis.__grants));
  check(rows[0].status === "failed" && rows[0].refunded === true, "refund: the row records it");
  // The sweep and the browser race: the second settle must not refund again.
  const stale = { ...job() };
  const again = await M.failAndRefund(stale, "again");
  check(again === false && globalThis.__grants.length === 1, "refund: never twice, whoever notices second");
}
{
  globalThis.__grants = []; const rows = [job({ charged: false, cost: 571 })]; const uploads = [];
  globalThis.__svc = fakeSvc(rows, uploads);
  await M.settleVideoJob(rows[0], async () => ({ state: "error", error: "x" }), async () => null);
  check(globalThis.__grants.length === 0 && rows[0].status === "failed", "refund: an uncharged job (own key, unlimited) is marked failed but never credited");
}
{
  globalThis.__grants = []; const rows = [job()]; const uploads = [];
  globalThis.__svc = fakeSvc(rows, uploads);
  const res = new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), { headers: { "content-type": "video/mp4" } });
  const s = await M.settleVideoJob(rows[0], async () => ({ state: "done", url: "https://generativelanguage.googleapis.com/v1beta/files/x:download" }), async () => res);
  check(s.state === "done" && s.url === `/api/media/${rows[0].id}`, "done: served from our own library route", JSON.stringify(s));
  check(uploads.length === 1 && uploads[0] === `org-1/${rows[0].id}.mp4`, "done: the file is copied into the workspace's folder", JSON.stringify(uploads));
  check(rows[0].status === "done" && rows[0].storage_path && globalThis.__grants.length === 0, "done: recorded, nothing refunded");
}
{
  globalThis.__grants = []; const rows = [job()]; const uploads = [];
  globalThis.__svc = fakeSvc(rows, uploads);
  const s = await M.settleVideoJob(rows[0], async () => ({ state: "done", url: "https://generativelanguage.googleapis.com/v1beta/files/y" }), async () => null);
  check(s.state === "done" && /\/api\/agents\/video\?file=/.test(s.url) && rows[0].result_uri, "done: if storing fails, the scoped proxy still serves it", JSON.stringify(s));
}
{
  globalThis.__grants = []; const rows = [job({ created_at: new Date(Date.now() - 2 * 3600_000).toISOString() })];
  globalThis.__svc = fakeSvc(rows, []);
  const s = await M.settleVideoJob(rows[0], async () => ({ state: "running" }), async () => null, { giveUpAfterMs: 3600_000 });
  check(s.state === "error" && s.refunded && globalThis.__grants.length === 1, "timeout: a job unfinished after an hour is refunded");
  const fresh = [job()]; globalThis.__svc = fakeSvc(fresh, []); globalThis.__grants = [];
  const s2 = await M.settleVideoJob(fresh[0], async () => ({ state: "running" }), async () => null, { giveUpAfterMs: 3600_000 });
  check(s2.state === "running" && globalThis.__grants.length === 0, "timeout: a young job is left running");
}
check(M.isMissingTable({ code: "42P01", message: 'relation "media_assets" does not exist' }) && M.isMissingTable({ code: "PGRST205", message: "Could not find the table 'public.media_assets' in the schema cache" }), "fallback: a missing table is recognised (pre-migration behaviour kicks in)");
check(!M.isMissingTable({ code: "23505", message: "duplicate key" }), "fallback: a real error is not mistaken for a missing table");
const d = M.fromDataUrl("data:image/jpeg;base64,/9j/4AAQ");
check(d && d.mime === "image/jpeg" && d.bytes.length > 0 && M.extFor("image/jpeg") === "jpg" && M.extFor("video/mp4") === "mp4", "files: data URLs decode and keep their real type");

/* ── executed: Veo parameters and prompts ──────────────────────────────── */
writeFileSync(join(dir, "visual-prompts.ts"), read("src/lib/ai/visual-prompts.ts").replace(/^import ["']server-only["'];?\s*$/m, ""));
const V = await import(pathToFileURL(join(dir, "visual-prompts.ts")).href);
check(V.veoParameters("16:9", false).personGeneration === "allow_all", "veo: text-to-video sends allow_all (allow_adult is refused for it)");
check(V.veoParameters("9:16", true).personGeneration === "allow_adult", "veo: image-to-video sends allow_adult");
check(V.veoParameters("9:16").aspectRatio === "9:16", "veo: the chosen aspect ratio is sent");
process.env.VEO_RESOLUTION = "1080p";
check(V.veoParameters("16:9").durationSeconds === 8, "veo: duration is a number");
delete process.env.VEO_RESOLUTION;
const ugc = V.buildVideoPrompt({ brief: "herbal soap", style: "ugc", aspect: "9:16" });
const film = V.buildVideoPrompt({ brief: "herbal soap", aspect: "16:9" });
check(/user-generated|creator/i.test(ugc) && /handheld/i.test(ugc) && !/gimbal/.test(ugc), "veo: the UGC agent gets a creator-to-camera brief", ugc.slice(0, 160));
check(/gimbal/.test(film) && /16:9/.test(film), "veo: the product film is unchanged");

/* ── wiring ────────────────────────────────────────────────────────────── */
const route = read("src/app/api/agents/video/route.ts");
const post = route.slice(route.indexOf("export async function POST"), route.indexOf("export async function GET"));
const get = route.slice(route.indexOf("export async function GET"));
check(/createMedia\(\{[\s\S]*status: "running", operation: started\.operation/.test(post), "wiring: every started video is recorded as a job");
check(/charged: Boolean\(gate\.ok && gate\.enforced\)/.test(post), "wiring: the job knows whether it was paid for");
check(/aspect,[\s\S]*style/.test(post) && /b\.style === "ugc"/.test(post), "wiring: aspect and style reach the prompt");
check(/enterOrgAiKeys\(await loadOrgAiKeys\(orgId\)\)/.test(get), "wiring: status and download use the workspace's own key");
check(/jobByOperation\(orgId, op\)/.test(get) && /if \(!job\.missing\) return NextResponse\.json\(\{ ok: false, state: "error", error: "That video job was not found in this workspace\." \}, \{ status: 404 \}\)/.test(get), "wiring: another workspace's job is refused");
check(/eq\("org_id", orgId\)\.eq\("result_uri", file\)/.test(get), "wiring: the file proxy only serves this workspace's results");
check(/settleVideoJob\(job\.row, pollVideo, fetchVideo\)/.test(get), "wiring: the poll settles (and refunds) through the one function");
const run = read("src/app/api/agents/run/route.ts");
check(/generateImages\(prompt, b\.image \? String\(b\.image\) : undefined, aspect\)/.test(run), "wiring: images get the chosen aspect ratio");
check(/createMedia\(\{ org_id: orgId[\s\S]*kind: "image"/.test(run) && /storeBytes\(orgId, m\.id/.test(run), "wiring: every generated image is kept in the library");
const img = read("src/lib/ai/image.ts");
check(/imageConfig = \{ aspectRatio: aspect \}/.test(img), "image: the aspect ratio is a setting, not words");
check(/for \(const model of geminiImageModels\(\)\)/.test(img) && /if \(r\.status === 404\) continue/.test(img), "image: a retired model falls through to the next");
check(/AbortSignal\.timeout/.test(img) && /AbortSignal\.timeout/.test(read("src/lib/ai/video.ts")), "timeouts: provider calls are bounded so refunds can run");
const credits = read("src/lib/credits.ts");
check(/like\("reason", `refund:agent_\$\{kind\}%`\)/.test(credits) && /Math\.max\(0, \(count \|\| 0\) - \(refunds \|\| 0\)\)/.test(credits), "quota: a refunded attempt does not use up the weekly allowance");
const ui = read("src/components/agents-console.tsx");
check(/VIDEO_ASPECTS/.test(ui) && /IMAGE_ASPECTS/.test(ui) && /aspect, *\n?\s*style:/.test(ui), "ui: shape picker for video and image, sent with the request");
check(/\(isImage \|\| isVideo\) && \(\s*<div>/.test(ui) && /Product photo to animate/.test(ui), "ui: video agents can animate a product photo");
check(/Your library/.test(ui) && /\/api\/media/.test(ui) && /removeMedia/.test(ui), "ui: a library with download and delete");
check(/task: sel\.desc/.test(ui), "ui: the wizard is told what the agent is for");
const imp = read("src/app/api/ai/improve-prompt/route.ts");
check(/brief\.length < 3 && !products\.length && !task/.test(imp) && /topProducts\(orgId\)/.test(imp), "wizard: an empty box is written from the business's own products");
check(/sweepVideoJobs\(budget\.slice\(SHARE\.media\)\)/.test(read("src/app/api/cron/autopilot/route.ts")), "cron: abandoned video jobs are settled nightly");
const mig = read("supabase/migrations/2026_zzzv_media_sales_watch.sql");
check(/create table if not exists media_assets/.test(mig) && /enable row level security/.test(mig) && /revoke insert, update, delete on media_assets from anon, authenticated/.test(mig), "db: media rows are read-only to members, written only by the server");
check(/insert into storage\.buckets \(id, name, public\)\s*values \('media', 'media', false\)/.test(mig), "db: the bucket is private");

console.log(`\nmedia: ${pass} passed, ${failures.length} failed`);
for (const x of failures) console.log("  ✗ " + x);
process.exit(failures.length ? 1 : 0);
