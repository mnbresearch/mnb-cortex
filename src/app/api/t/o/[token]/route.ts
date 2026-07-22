import { serviceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 42-byte transparent GIF.
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** Open-tracking pixel: /api/t/o/<token>.gif */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const token = (params.token || "").replace(/\.gif$/i, "");
  if (token) {
    const sb = serviceClient();
    if (sb) {
      try {
        const { data } = await sb.from("campaign_recipients").select("id,open_count,opened_at").eq("token", token).maybeSingle();
        if (data) {
          const now = new Date().toISOString();
          await sb.from("campaign_recipients").update({
            open_count: ((data as any).open_count || 0) + 1,
            opened_at: (data as any).opened_at || now,   // COALESCE — keep first open
            last_opened_at: now,
          }).eq("id", (data as any).id);
        }
      } catch { /* never block the pixel */ }
    }
  }
  return new Response(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-cache, no-store, must-revalidate, private",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}
