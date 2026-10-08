import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { SafeForm } from "@/components/safe-form";
import { SubmitButton } from "@/components/form-buttons";
import { MfaPanel } from "@/components/mfa-panel";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { securitySettings, assurance } from "@/lib/strong-auth";
import { saveSecuritySettings } from "@/lib/security-actions";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

/*
  /settings/security — two-step sign-in, and what Cortex sends to AI vendors.

  Every sentence on this page describes code that exists:
    · strong-auth.ts gates the operations listed under "What needs it"
    · ai/dlp.ts tokenises what the "AI privacy" setting says before a prompt
      leaves for an external model, and puts the real values back after
*/
export default async function SecurityPage() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) {
    return (<><Topbar title="Security" /><PageShell><p className="text-sm"><Link href="/login" className="text-primary underline">Sign in</Link> first.</p></PageShell></>);
  }
  const [settings, aal, isAdmin] = await Promise.all([securitySettings(orgId), assurance(), hasRole("admin")]);

  return (
    <>
      <Topbar title="Security" subtitle="Two-step sign-in and AI privacy" />
      <PageShell>
        <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Settings</Link>

        <Section title="Two-step sign-in" desc="A code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy…), asked for only when you do something high-impact.">
          <MfaPanel current={aal.current} next={aal.next} />
          <div className="mt-4 text-sm">
            <div className="font-medium">What needs it{settings.requireMfa ? "" : " (currently optional in this workspace)"}</div>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground space-y-0.5">
              <li>Approving or undoing anything that changes money records or contacts someone outside your team</li>
              <li>Letting such an action run on its own (Approvals → Rules)</li>
              <li>Approving a collections message</li>
              <li>Issuing an API key, adding a webhook, connecting an integration</li>
              <li>Lowering either setting below</li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">Emailed decision links can reject anything, but cannot approve these — they carry no second factor. Every approval is signed over the exact details approved; if anything changes before it runs, it does not run.</p>
          </div>
        </Section>

        <Section title="Workspace settings" desc={isAdmin ? "Admins only. Lowering a protection asks for your second factor." : "Only an admin can change these."}>
          {!settings.migrated && (
            <p className="text-xs text-warning mb-3">These settings need a one-time database update before they can be changed. Until then Cortex uses the strict defaults shown.</p>
          )}
          <SafeForm action={saveSecuritySettings} className="space-y-4">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="require_mfa" defaultChecked={settings.requireMfa} disabled={!isAdmin} className="mt-1" />
              <span><span className="font-medium">Require a second factor for high-impact actions</span><br /><span className="text-muted-foreground text-xs">Recommended. Off means a password alone can approve payments-related changes and outgoing messages.</span></span>
            </label>
            <div className="text-sm">
              <label htmlFor="ai_redaction" className="font-medium">AI privacy — what is hidden from AI vendors</label>
              <select id="ai_redaction" name="ai_redaction" defaultValue={settings.redaction} disabled={!isAdmin} className="mt-1 block w-full max-w-md rounded-lg border bg-background h-10 px-3 text-sm">
                <option value="strict">Strict — names, contact details, tax IDs, account numbers AND every rupee amount</option>
                <option value="pii">Personal data (default) — names, emails, phones, PAN, GSTIN, Aadhaar, IFSC, account and card numbers</option>
                <option value="off">Off — send prompts as written</option>
              </select>
              <p className="mt-1 text-xs text-muted-foreground">Hidden values are replaced with placeholders like [CUSTOMER_3] or [AMOUNT_2] before a prompt leaves for Google, Groq, OpenAI or Anthropic, and put back in the answer you see. Strict makes answers about money less specific. Documents you upload for reading (bank statements, GST returns, spreadsheets) must be read with their figures, so amounts are kept for those even on Strict; names and IDs are still hidden.</p>
            </div>
            {isAdmin && <SubmitButton className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground h-10 px-4 text-sm font-medium disabled:opacity-60"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Save</SubmitButton>}
          </SafeForm>
        </Section>
      </PageShell>
    </>
  );
}
