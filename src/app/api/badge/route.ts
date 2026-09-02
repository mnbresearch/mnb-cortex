import { anyEnvKey, envKey } from "@/lib/env";
import { hasSupabase } from "@/lib/supabase/server";
import { getHealth } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live status badge (SVG) — embed anywhere with <img src="/api/badge" />. */
export async function GET(req: Request) {
  // Was computed from Boolean(process.env.X): the badge said "operational"
  // while the AI was returning 404s. It now reflects the real health check.
  /*
    Reads the cached health snapshot directly. This used to fetch /api/health
    over HTTP from inside the same deployment: a second lambda invocation per
    badge render, each running the full provider fan-out. Since the badge is
    meant to be embedded on other people's pages, that made an <img> tag on any
    site a way to spend this account's Gemini and Resend quota.
  */
  let value = "operational";
  try {
    const j: any = await getHealth();
    value = j?.status === "down" ? "down" : j?.status === "degraded" ? "degraded" : "operational";
  } catch { value = "unknown"; }

  const label = "MNB Cortex";
  const color = value === "operational" ? "#B8912F" : value === "down" ? "#dc2626" : "#f59e0b";
  const lw = 84, vw = value.length * 7 + 22, w = lw + vw;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${label}: ${value}">
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset=".1" stop-color="#aaa" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <rect rx="4" width="${w}" height="20" fill="#333"/>
  <rect rx="4" x="${lw}" width="${vw}" height="20" fill="${color}"/>
  <rect rx="4" width="${w}" height="20" fill="url(#s)"/>
  <g fill="#fff" text-anchor="middle" font-family="system-ui,DejaVu Sans,Verdana,sans-serif" font-size="11">
    <text x="${lw / 2}" y="14">${label}</text>
    <text x="${lw + vw / 2}" y="14">${value}</text>
  </g>
</svg>`;

  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-cache, no-store, must-revalidate" },
  });
}
