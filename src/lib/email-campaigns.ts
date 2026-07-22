import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";

export type TemplateRow = { id: string; name: string; subject: string; body: string; updated_at: string };
export type CampaignRow = {
  id: string; name: string | null; subject: string; created_at: string;
  total: number; opened: number; clicked: number;
};

export async function getEmailStudio() {
  const { user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return { live: false, templates: [] as TemplateRow[], campaigns: [] as CampaignRow[] };
  const sb = createClient();
  const [{ data: templates }, { data: campaigns }] = await Promise.all([
    sb.from("email_templates").select("id,name,subject,body,updated_at").eq("org_id", orgId).order("updated_at", { ascending: false }),
    sb.from("email_campaigns").select("id,name,subject,created_at").eq("org_id", orgId).order("created_at", { ascending: false }).limit(50),
  ]);

  const rows: CampaignRow[] = [];
  for (const c of (campaigns as any[]) || []) {
    const { data: recs } = await sb.from("campaign_recipients").select("open_count,click_count").eq("campaign_id", c.id);
    const list = (recs as any[]) || [];
    rows.push({
      id: c.id, name: c.name, subject: c.subject, created_at: c.created_at,
      total: list.length,
      opened: list.filter((r) => (r.open_count || 0) > 0).length,
      clicked: list.filter((r) => (r.click_count || 0) > 0).length,
    });
  }

  return { live: true, templates: ((templates as any[]) || []) as TemplateRow[], campaigns: rows };
}

export async function getCampaignDetail(id: string) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return null;
  const sb = createClient();
  const { data: campaign } = await sb.from("email_campaigns").select("*").eq("id", id).eq("org_id", orgId).single();
  if (!campaign) return null;
  const { data: recipients } = await sb.from("campaign_recipients").select("*").eq("campaign_id", id).order("created_at", { ascending: true });
  return { campaign, recipients: ((recipients as any[]) || []) };
}
