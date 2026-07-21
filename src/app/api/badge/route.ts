import { hasSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live status badge (SVG) — embed anywhere with <img src="/api/badge" />. */
export async function GET() {
  const ai = Boolean(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
  const db = hasSupabase();
  const email = Boolean(process.env.RESEND_API_KEY);
  const allUp = ai && db && email;

  const label = "MNB Cortex";
  const value = allUp ? "operational" : "degraded";
  const color = allUp ? "#0f9d8e" : "#f59e0b";
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
