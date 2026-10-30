import Link from "next/link";
import { LegalShell, H2, P, UL } from "@/components/legal-shell";

/*
  THIS PAGE USED TO BE A STALE COPY OF THE PRIVACY POLICY.

  /help rendered an old Privacy Policy under its own metadata title — and it
  was linked as "Talk to us" from the trial screen, "Help centre" from the
  setup guides, "contact our team" from the bring-your-own-key card, and
  listed in the sitemap. Someone asking for help got a legal document.

  It is now a short, real help page: how to start, how to import, how
  approvals work, billing, and how to reach a person. Every link goes to a
  route that exists; the in-app ones say they need a sign-in. "Talk to us"
  style links point straight at /contact.
*/
export const metadata = {
  title: "Help — MNB Cortex",
  description: "Getting started with MNB Cortex: create a workspace, import your Tally, Vyapar or Busy export, approve actions, manage billing, and reach our team.",
};

const A = "text-primary underline";

export default function Help() {
  return (
    <LegalShell title="Help" subtitle="Getting started, importing, approvals, billing — and how to reach a person.">
      <P>
        Can&rsquo;t find what you need here? <Link href="/contact" className={A}>Contact us</Link> — the form,
        email and WhatsApp all reach the team.
      </P>

      <H2>1. Getting started</H2>
      <UL>
        <li>
          <Link href="/login?mode=signup" className={A}>Create your workspace</Link> with an email and password,
          a one-time email link, or Google where it is offered.
        </li>
        <li>
          A short onboarding asks for your business name, industry and currency. You can come back to it any time
          from the app&rsquo;s navigation.
        </li>
        <li>
          Not ready to use your own numbers? Load the sample dataset under Settings to see how Cortex reads a
          business. Sample rows are tagged, and &ldquo;Remove sample data&rdquo; clears them without touching
          anything you imported.
        </li>
      </UL>

      <H2>2. Importing your data</H2>
      <UL>
        <li>
          Export a CSV from Tally, Vyapar, Busy or your spreadsheet and drop it on the Import page (in the app,
          after you sign in). Cortex matches your column headings itself and tells you which columns it could not
          find, rather than importing blanks.
        </li>
        <li>
          Zoho Books, Odoo, Shopify, Razorpay, Stripe and Google Sheets can sync directly — connect them under Integrations. Step-by-step
          instructions for each are in the Setup guides (in the app, after you sign in).
        </li>
        <li>
          Cortex reads your export and never writes back to your accounting software.
        </li>
      </UL>

      <H2>3. Approvals — nothing runs without you</H2>
      <UL>
        <li>
          When Cortex suggests an action — a payment reminder, a due-date change, marking an invoice paid — it
          appears as a proposal on the Approvals page and runs only when you approve it.
        </li>
        <li>
          On plans that include Autopilot you can let specific actions run on their own, within limits you set
          per action — a daily count, a rupee ceiling, known parties only.
        </li>
      </UL>

      <H2>4. Billing &amp; credits</H2>
      <UL>
        <li>
          Compare plans on <Link href="/pricing" className={A}>Pricing</Link>. Once signed in, choose or change your
          plan, and turn auto-renew on or off, on the Billing page.
        </li>
        <li>
          AI work uses credits. Your balance, what each action costs and credit packs are on the Usage page in
          the app.
        </li>
        <li>
          Refunds and cancellations follow our <Link href="/refund" className={A}>Refund &amp; Cancellation Policy</Link>.
        </li>
      </UL>

      <H2>5. Your data</H2>
      <UL>
        <li>
          Export every table in your workspace as JSON from Settings, and delete the workspace there when you are
          done. See the <Link href="/privacy" className={A}>Privacy Policy</Link> for what is kept and why.
        </li>
      </UL>

      <H2>6. Developers</H2>
      <P>
        The read API and its keys are managed on the Developers page in the app. The machine-readable reference
        is at <a href="/api/v1/openapi.json" className={A}>/api/v1/openapi.json</a>.
      </P>

      <H2>7. Is something down?</H2>
      <P>
        Check the <Link href="/status" className={A}>status page</Link>. Recent changes are listed in the{" "}
        <Link href="/changelog" className={A}>changelog</Link>.
      </P>

      <H2>8. Talk to us</H2>
      <P>
        Use the form on the <Link href="/contact" className={A}>Contact page</Link>, email{" "}
        <a href="mailto:contact@mnbresearch.com" className={A}>contact@mnbresearch.com</a>, or message us on{" "}
        <a href="https://wa.me/919711488480" target="_blank" rel="noopener noreferrer" className={A}>WhatsApp</a>.
        Support hours are Mon–Sat, 10:00–19:00 IST, and we usually reply within 2 business days.
      </P>
    </LegalShell>
  );
}
