import { apiAuth, apiError, apiOk } from "@/lib/api/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  "Is my key working, and what can it do?" — the first call an integrator
  makes. Any valid, unexpired, unrevoked key with at least one scope may ask.
*/
export async function GET(req: Request) {
  const { ALL_SCOPES } = await import("@/lib/api-keys");
  const auth = await apiAuth(req, ALL_SCOPES, "read", "/api/v1/whoami");
  if (!auth.ok) return auth.res;
  const { ctx, svc } = auth;
  const [{ data: org }, { data: key }] = await Promise.all([
    svc.from("organizations").select("name").eq("id", ctx.orgId).maybeSingle(),
    svc.from("api_keys").select("label, expires_at, created_at").eq("id", ctx.keyId).maybeSingle(),
  ]);
  if (!org) return apiError(ctx.rid, 500, "internal", "Workspace not found for this key.");
  return apiOk(ctx.rid, {
    data: {
      workspace: { id: ctx.orgId, name: (org as any).name ?? null, plan: ctx.plan || null },
      key: { prefix: ctx.prefix, label: (key as any)?.label ?? null, scopes: ctx.scopes, expires_at: (key as any)?.expires_at ?? null, created_at: (key as any)?.created_at ?? null },
    },
  });
}
