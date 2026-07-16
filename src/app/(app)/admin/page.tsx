import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getMembers, getInvites } from "@/lib/data";
import { inviteMember, cancelInvite } from "@/lib/actions";
import { UserPlus, Plug, Mail, X } from "lucide-react";

export const dynamic = "force-dynamic";
const sampleMembers = [ { id: "s1", name: "You (Owner)", role: "owner" }, { id: "s2", name: "Sneha Iyer", role: "manager" }, { id: "s3", name: "Priya Nair", role: "analyst" } ];

export default async function Admin() {
  const { rows: members, live } = await getMembers();
  const { rows: invites } = await getInvites();
  const list = live && members.length ? members : sampleMembers;
  const inp = "rounded-lg border bg-background px-3 h-9 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <>
      <Topbar title="Admin & Permissions" subtitle="Team, roles & integrations" />
      <PageShell>
        <Section title="Team members" desc={live ? "Live members of your workspace" : "Sign in to manage your real team"}>
          <div className="space-y-2">
            {list.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3"><div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-purple-500" /><div className="font-medium text-sm">{m.name}</div></div>
                <Badge className="border-border capitalize">{m.role}</Badge>
              </div>
            ))}
          </div>
          {live && (
            <form action={inviteMember} className="mt-4 flex flex-wrap items-end gap-2">
              <input name="email" type="email" required placeholder="teammate@company.com" className={`${inp} flex-1 min-w-[200px]`} />
              <select name="role" defaultValue="analyst" className={inp}>{["admin","manager","analyst","viewer"].map((r)=><option key={r} value={r}>{r}</option>)}</select>
              <button className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground h-9 px-4 text-sm font-medium hover:opacity-90"><UserPlus className="h-4 w-4" /> Send invite</button>
            </form>
          )}
          {live && invites.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-xs text-muted-foreground">Pending invites</div>
              {invites.filter((i:any)=>i.status==="pending").map((i: any) => (
                <div key={i.id} className="flex items-center justify-between rounded-lg border border-dashed p-3 text-sm">
                  <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> {i.email} <Badge className="border-border capitalize">{i.role}</Badge></div>
                  <form action={cancelInvite}><input type="hidden" name="id" value={i.id} /><button className="text-muted-foreground hover:text-danger"><X className="h-4 w-4" /></button></form>
                </div>
              ))}
            </div>
          )}
        </Section>
        <Section title="Integrations" desc="Manage on the Integrations page" right={<a href="/integrations" className="text-sm text-primary">Open →</a>}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {["Tally","Zoho Books","Shopify","WhatsApp Business","Salesforce","Google Workspace"].map((n) => (
              <Card key={n} className="p-4 flex items-center gap-2"><Plug className="h-4 w-4 text-muted-foreground" /><span className="text-sm font-medium">{n}</span></Card>
            ))}
          </div>
        </Section>
      </PageShell>
    </>
  );
}
