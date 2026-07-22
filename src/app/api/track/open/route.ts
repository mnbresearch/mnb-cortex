import { serviceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 1x1 transparent GIF
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** Open-tracking pixel. Increments the recipient's open counter. */
export async function GET(req: Request) {
  const r = new URL(req.url).searchParams.get("r");
  if (r) {
    const sb = serviceClient();
    if (sb) {
      try {
        const { data } = await sb.from("campaign_recipients").select("open_count,opened_at").eq("id", r).maybeSingle();
        if (data) {
          await sb.from("campaign_recipients").update({
            open_count: ((data as any).open_count || 0) + 1,
            opened_at: (data as any).opened_at || new Date().toISOString(),
          }).eq("id", r);
        }
      } catch { /* never block the pixel */ }
    }
  }
  return new Response(PIXEL, {
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-cache, no-store, must-revalidate", "Content-Length": String(PIXEL.length) },
  });
}
