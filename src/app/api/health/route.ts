import { NextResponse } from "next/server";
import { hasSupabase, serviceClient } from "@/lib/supabase/server";
import { encryptionAvailable } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Verifies the integrations migration has been applied (column exists). */
async function integrationsReady(): Promise<boolean> {
  const sb = serviceClient();
  if (!sb) return false;
  try {
    const { error } = await sb.from("integrations").select("credentials_encrypted").limit(1);
    return !error;
  } catch { return false; }
}

export async function GET() {
  const ai = Boolean(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
  const db = hasSupabase();
  const email = Boolean(process.env.RESEND_API_KEY);
  const serviceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const encryption = encryptionAvailable();
  const integrations = await integrationsReady();

  return NextResponse.json({
    ok: true,
    services: [
      { name: "Web app", status: "operational" },
      { name: "AI engine (Groq)", status: ai ? "operational" : "degraded" },
      { name: "Database (Supabase)", status: db ? "operational" : "degraded" },
      { name: "Public API", status: "operational" },
      { name: "Email (Resend)", status: email ? "operational" : "degraded" },
      { name: "Scheduled Autopilot", status: serviceRole ? "operational" : "degraded" },
      { name: "Credential encryption", status: encryption ? "operational" : "degraded" },
      { name: "Integrations store", status: integrations ? "operational" : "degraded" },
    ],
    // Booleans only — never the values themselves.
    config: { serviceRole, encryption, integrationsMigrated: integrations },
    updated: new Date().toISOString(),
  });
}
