import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { consentUrl, adminConsentUrl, signState, configuredFor, type OAuthProvider } from "@/lib/knowledge/oauth";
import { mayConnect } from "@/lib/knowledge/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  GET /api/knowledge/connect/microsoft365 | google_workspace — sends an admin
  to the provider's consent screen (read-only scopes), through the company's
  own app if it saved one, else Cortex's shared app.
  ?admin=1 for Microsoft: organisation-wide admin consent instead.
*/
export async function GET(req: Request, { params }: { params: { provider: string } }) {
  const back = (msg: string) => NextResponse.redirect(new URL(`/knowledge?error=${encodeURIComponent(msg)}`, req.url));
  const p = params.provider as OAuthProvider;
  if (p !== "microsoft365" && p !== "google_workspace") return back("Unknown provider.");
  const { user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return NextResponse.redirect(new URL("/login", req.url));
  if (!(await hasRole("admin"))) return back("Connecting a company account needs the admin role.");
  const gate = await mayConnect(orgId, p);
  if (!gate.ok) return back(gate.error);
  if (!(await configuredFor(p, orgId))) return back(`${p === "microsoft365" ? "Microsoft 365" : "Google Workspace"} needs an app first. Add your company's own app under Settings → Company Knowledge, or ask MNB to switch on the shared app.`);
  const state = signState({ orgId, userId: user.id, provider: p });
  /* ?admin=1 (Microsoft only): organisation-wide consent by a tenant administrator. */
  const wantsAdmin = p === "microsoft365" && new URL(req.url).searchParams.get("admin") === "1";
  const url = state ? (wantsAdmin ? await adminConsentUrl(req, state, orgId) : await consentUrl(req, p, state, orgId)) : null;
  return url ? NextResponse.redirect(url) : back("Sign-in could not be started (ENCRYPTION_KEY is not configured).");
}
