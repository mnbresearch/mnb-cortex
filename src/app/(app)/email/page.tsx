import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmailConsole } from "@/components/email-console";
import { EmailStudio } from "@/components/email-studio";
import { isSuperAdmin, currentEmail } from "@/lib/superadmin";
import { getLeads } from "@/lib/data";
import { getEmailStudio } from "@/lib/email-campaigns";
import { Lock, Mail } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function EmailPage() {
  const allowed = await isSuperAdmin();
  const email = await currentEmail();

  if (!allowed) {
    return (
      <>
        <Topbar title="Email Console" subtitle="Send and track email" />
        <PageShell>
          <Card className="p-8 text-center max-w-lg mx-auto">
            <div className="h-12 w-12 rounded-full bg-danger/10 grid place-items-center mx-auto"><Lock className="h-6 w-6 text-danger" /></div>
            <h2 className="mt-3 font-semibold">Restricted area</h2>
            <p className="text-sm text-muted-foreground mt-1">
              The email console is limited to platform super-admins.{email ? ` You're signed in as ${email}.` : " You are not signed in."}
            </p>
            <Link href="/dashboard"><Button variant="outline" className="mt-4">Back to dashboard</Button></Link>
          </Card>
        </PageShell>
      </>
    );
  }

  const { rows, live } = await getLeads();
  const studio = await getEmailStudio();
  const leadRecipients = rows.map((l: any) => ({ name: l.name, email: l.email, plan: l.plan }));

  return (
    <>
      <Topbar title="Email Console" subtitle="Send mail, track delivery, and see who's coming in" />
      <PageShell>
        <Card className="p-4 border-primary/30 bg-primary/5">
          <div className="text-sm flex items-start gap-2">
            <Mail className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span>Mail sends from your verified domain <b>updates.mnbresearch.com</b> via Resend, so it reaches any recipient. Delivery events come straight from the Resend API.</span>
          </div>
        </Card>

        <Section title="Campaigns" desc="Pick a template, choose recipients, send a personalised mail-merge and track opens & clicks">
          <EmailStudio templates={studio.templates} campaigns={studio.campaigns} leads={leadRecipients} />
        </Section>

        <Section title="Quick single email" desc="Send a one-off message without a campaign">
          <EmailConsole />
        </Section>

        <Section title="Captured leads" desc={live ? "People who submitted the pricing enquiry form" : "Sign in with a workspace to see stored leads"}>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leads captured yet. Submissions from the pricing page land here automatically, and are emailed to you and the enquirer.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">Email</th>
                  <th className="py-2 pr-3 font-medium">Phone</th>
                  <th className="py-2 pr-3 font-medium">Plan</th>
                  <th className="py-2 font-medium">Received</th>
                </tr></thead>
                <tbody>
                  {rows.slice(0, 50).map((l: any) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{l.name}</td>
                      <td className="py-2 pr-3"><a href={`mailto:${l.email}`} className="text-primary">{l.email}</a></td>
                      <td className="py-2 pr-3 text-muted-foreground">{l.phone || "—"}</td>
                      <td className="py-2 pr-3"><Badge className="border-border text-muted-foreground">{l.plan || "—"}</Badge></td>
                      <td className="py-2 text-muted-foreground">{l.created_at ? new Date(l.created_at).toLocaleDateString("en-IN") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </PageShell>
    </>
  );
}
