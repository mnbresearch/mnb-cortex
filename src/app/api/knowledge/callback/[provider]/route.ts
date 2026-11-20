import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { verifyState, exchangeCode, type OAuthProvider } from "@/lib/knowledge/oauth";
import { microsoftAccount, googleAccount } from "@/lib/knowledge/workspace-sync";
import { createSource, listSources, updateSource, getSource } from "@/lib/knowledge/store";
import { syncSource } from "@/lib/knowledge/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/*
  The OAuth callback. The signed state must name THIS signed-in user and this
  provider and be under 15 minutes old. The refresh token is encrypted before
  it is stored; reconnecting the same account replaces its token rather than
  adding a duplicate source. The first sync runs before the redirect, so the
  owner lands on a page that already shows what was read.
*/
export async function GET(req: Request, { params }: { params: { provider: string } }) {
  const back = (q: string) => NextResponse.redirect(new URL(`/knowledge?${q}`, req.url));
  const p = params.provider as OAuthProvider;
  if (p !== "microsoft365" && p !== "google_workspace") return back("error=Unknown%20provider");
  const u = new URL(req.url);
  if (u.searchParams.get("error")) return back(`error=${encodeURIComponent(u.searchParams.get("error_description") || u.searchParams.get("error") || "Sign-in was cancelled.")}`);
  const { user } = await getUserAndOrg();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const st = verifyState(String(u.searchParams.get("state") || ""), p, user.id);
  if (!st) return back("error=That%20sign-in%20link%20expired%20or%20was%20not%20yours.%20Try%20again.");
  const tok = await exchangeCode(req, p, String(u.searchParams.get("code") || ""));
  if ("error" in tok) return back(`error=${encodeURIComponent(tok.error)}`);
  if (!tok.refresh_token) return back("error=The%20provider%20did%20not%20grant%20offline%20access.%20Try%20again%20and%20accept%20all%20permissions.");
  const account = p === "microsoft365" ? await microsoftAccount(tok.access_token) : await googleAccount(tok.access_token);
  const label = `${p === "microsoft365" ? "Microsoft 365" : "Google Workspace"}${account ? ` — ${account}` : ""}`;
  const scopes = p === "microsoft365" ? ["mail", "chats", "files"] : ["mail", "files"];

  const existing = (await listSources(st.orgId)).find((s) => s.provider === p && s.account === account);
  let id: string;
  if (existing) {
    await updateSource(st.orgId, existing.id, { secret: tok.refresh_token, status: "active", status_reason: "Reconnected.", scopes } as any);
    id = existing.id;
  } else {
    const r = await createSource({ orgId: st.orgId, userId: user.id, provider: p, label, account, scopes, secret: tok.refresh_token });
    if (!r.ok) return back(`error=${encodeURIComponent(r.error)}`);
    id = r.source.id;
  }
  const source = await getSource(st.orgId, id);
  if (source) await syncSource(source).catch(() => null);
  return back(`connected=${p}`);
}
