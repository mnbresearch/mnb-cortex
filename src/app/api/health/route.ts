import { NextResponse } from "next/server";
import { hasSupabase } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const ai = Boolean(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
  const db = hasSupabase();
  const email = Boolean(process.env.RESEND_API_KEY);
  return NextResponse.json({
    ok: true,
    services: [
      { name: "Web app", status: "operational" },
      { name: "AI engine (Groq)", status: ai ? "operational" : "degraded" },
      { name: "Database (Supabase)", status: db ? "operational" : "degraded" },
      { name: "Public API", status: "operational" },
      { name: "Email (Resend)", status: email ? "operational" : "degraded" },
    ],
    updated: new Date().toISOString(),
  });
}
