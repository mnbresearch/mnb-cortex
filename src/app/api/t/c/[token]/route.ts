import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Click-tracking redirect: /api/t/c/<token>?u=<encoded-url> */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const token = params.token || "";
  const u = new URL(req.url).searchParams.get("u") || "";

  // Only follow http(s) — never javascript:/data: (open-redirect protection).
  let dest = "https://mnb-cortex.vercel.app";
  try { const p = new URL(u); if (p.protocol === "http:" || p.protocol === "https:") dest = p.toString(); } catch { /* keep default */ }

  if (token) {
    const sb = serviceClient();
    if (sb) {
      try {
        const { data } = await sb.from("campaign_recipients").select("id,click_count,clicked_at,open_count,opened_at").eq("token", token).maybeSingle();
        if (data) {
          const now = new Date().toISOString();
          await sb.from("campaign_recipients").update({
            click_count: ((data as any).click_count || 0) + 1,
            clicked_at: (data as any).clicked_at || now,
            open_count: Math.max((data as any).open_count || 0, 1), // a click implies an open
            opened_at: (data as any).opened_at || now,
          }).eq("id", (data as any).id);
        }
      } catch { /* never block the redirect */ }
    }
  }
  return NextResponse.redirect(dest, 302);
}
