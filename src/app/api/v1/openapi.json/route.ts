import { NextResponse } from "next/server";
import { buildOpenApi } from "@/lib/api/openapi";

export const dynamic = "force-static";

/* Public on purpose: the contract is not a secret, the keys are. */
export function GET() {
  return NextResponse.json(buildOpenApi(), { headers: { "Cache-Control": "public, max-age=300" } });
}
