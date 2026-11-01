import "server-only";
import { pickEmailBrand, type OrgBrand } from "@/lib/email-brand";

/*
  Server side of lib/email-brand.ts: read the workspace and the firm/group it
  is linked to, and decide whose name goes on its email. Never throws — a
  failed read means the mail goes out MNB-branded, as it always did, rather
  than not at all.
*/
const COLS = "id, name, logo_url, accent, plan, subscription_status, subscription_ends_at, trial_ends_at, autorenew_status, credits_allowance, practice_org_id";

export async function orgEmailBrand(svc: any, orgId: string): Promise<OrgBrand | null> {
  try {
    if (!svc || !orgId) return null;
    const { data: org } = await svc.from("organizations").select(COLS).eq("id", orgId).maybeSingle();
    if (!org) return null;
    let firm: any = null;
    if ((org as any).practice_org_id) {
      const { data } = await svc.from("organizations").select(COLS).eq("id", (org as any).practice_org_id).maybeSingle();
      firm = data || null;
    }
    return pickEmailBrand(org as any, firm);
  } catch {
    return null;
  }
}
