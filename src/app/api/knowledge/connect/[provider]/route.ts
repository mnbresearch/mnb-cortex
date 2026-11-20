import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { consentUrl, signState, configured, type OAuthProvider } from "@/lib/knowledge/oauth";
import { mayConnect } from "@/lib/knowledge/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/knowledge/connect/microsoft365 | google_workspace — sends an admin to the provider's consent screen (read-only scopes). */
export async function GET(req: Request, { params }: { params: { provider: string } }) {
  const back = (msg: string) => NextResponse.redirect(new URL(`/knowledge?error=${encodeURIComponent(msg)}`, req.url));
  const p = params.provider as OAuthProvider;
  if (p !== "microsoft365" && p !== "google_workspace") return back("Unknown provider.");
  const { user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return NextResponse.redirect(new URL("/login", req.url));
  if (!(await hasRole("admin"))) return back("Connecting a company account needs the admin role.");
  const gate = await mayConnect(orgId, p);
  if (!gate.ok) return back(gate.error);
  if (!configured(p)) return back(`${p === "microsoft365" ? "Microsoft 365" : "Google Workspace"} is not switched on for this deployment yet. MNB enables it with your IT team.`);
  const state = signState({ orgId, userId: user.id, provider: p });
  const url = state ? consentUrl(req, p, state) : null;
  return url ? NextResponse.redirect(url) : back("Sign-in could not be started (ENCRYPTION_KEY is not configured).");
}
