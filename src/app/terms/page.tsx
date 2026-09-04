import Link from "next/link";
import { LegalShell, H2, P, UL } from "@/components/legal-shell";

export const metadata = {
  title: "Terms & Conditions — MNB Cortex",
  description: "The terms that govern your use of MNB Cortex, an AI-COO SaaS platform by Abrobot Technologies Pvt Ltd.",
};

export default function Terms() {
  return (
    <LegalShell title="Terms & Conditions" subtitle="Abrobot Technologies Pvt Ltd · Effective 1 August 2026 · Delhi, India">
      <H2>1. Acceptance of Terms</H2>
      <P>
        These Terms and Conditions (&ldquo;Terms&rdquo;) form a legally binding agreement between you (&ldquo;User,&rdquo;
        &ldquo;Subscriber,&rdquo; &ldquo;you&rdquo;) and <strong>Abrobot Technologies Pvt Ltd</strong> (&ldquo;MNB Cortex,&rdquo;
        &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), a company incorporated under the laws of India with its principal place of
        business in Delhi. MNB Cortex is our AI-COO software-as-a-service platform. By accessing or using the platform, creating a
        workspace or purchasing any plan — through our website, payment portal, or any other channel — you confirm
        that you have read, understood, and agree to be bound by these Terms. If you do not agree, you must discontinue use of the service.
      </P>

      <H2>2. Eligibility</H2>
      <P>
        You must be at least <strong>18 years of age</strong> and legally capable of entering a binding contract to register for or use
        MNB Cortex. If you register on behalf of a business, you represent that you are authorised to bind that business to these Terms.
        You are responsible for keeping your account credentials confidential and for all activity under your workspace.
      </P>

      <H2>3. The Service &amp; Plans</H2>
      <P>
        MNB Cortex provides an AI-powered operations platform for small and medium businesses — including Ask Cortex, a memory
        layer, AI agents across multiple departments and industries, business calculators, dashboards, automations, and image agents.
        We offer the following subscription plans, billed in Indian Rupees (INR):
      </P>
      {/*
        These must match lib/config.ts exactly, including the credit allowances.
        They were wrong: the page listed retired tiers with allowances that had
        never been correct (1,000 / 5,000 / 20,000 against real values of
        1,350 / 4,600 / 13,850). This page is linked from the checkout, so a
        customer agreeing to it is agreeing to numbers we then do not honour.
        scripts/test-legal.mjs now asserts the two files agree.
      */}
      <UL>
        <li><strong>Watch</strong> — ₹4,999/month or ₹49,990/year · 4,600 AI credits/month</li>
        <li><strong>Watch Pro</strong> — ₹14,999/month or ₹1,49,990/year · 13,850 AI credits/month</li>
        <li><strong>Practice</strong> — ₹29,999/month or ₹2,99,990/year · 27,750 AI credits/month, pooled across up to 25 client workspaces</li>
        <li><strong>Command</strong> — ₹39,999/month or ₹3,99,990/year · 37,000 AI credits/month</li>
        <li><strong>Enterprise</strong> — custom pricing · 1,50,000 AI credits/month on a fair-use basis (contact us)</li>
      </UL>
      <P>
        Plans previously sold as Starter, Growth, Business and AI COO have been retired and are no longer available to new
        customers. Existing workspaces on those plans keep the price, credit allowance and seat count they purchased until
        they choose to change.
      </P>
      <P>
        We also offer one-time <strong>credit top-up packs</strong> for workspaces that need more AI usage within a cycle. Credit packs can be used with no subscription at all. We do not currently offer a free trial; the public Business Health Check is free and needs no account. MNB Cortex reserves the right to modify, add, or
        discontinue features, credit allowances, image limits, or pricing at any time with reasonable notice, without affecting purchases
        already completed.
      </P>

      <H2>4. Payment &amp; Billing</H2>
      <P>
        All payments are processed securely through <strong>Cashfree Payments</strong> (and, where applicable, other authorised payment
        gateways). All prices are in Indian Rupees (INR). Monthly subscriptions renew every 30 days; annual subscriptions renew every 365
        days. Credit top-up packs are billed as a one-time payment. Applicable GST will be shown at checkout. Failed or reversed payments
        may result in suspension of your workspace until payment is completed.
      </P>

      <H2>5. Refunds &amp; Cancellation</H2>
      <P>
        Our full refund and cancellation terms are set out in our <Link href="/refund" className="text-primary underline">Refund &amp; Cancellation Policy</Link>.
        In summary: subscription payments and credit top-ups are digital and consumed on access, and are therefore <strong>generally
        non-refundable</strong>, except in cases of a verified billing error or a service failure demonstrably on our part. You may cancel
        your subscription at any time; cancellation takes effect at the end of the current billing cycle and no prorated refund is issued
        for the remaining period.
      </P>

      <H2>6. Credits &amp; Fair Use</H2>
      <P>
        AI credits are allocated per billing cycle and, unless expressly stated otherwise, do not roll over — unused monthly credits
        expire at the end of the cycle. Purchased top-up credits remain available per their pack terms. Credits are non-transferable, have
        no independent monetary value, and cannot be redeemed for cash. Image generation is subject to weekly limits by plan. We may
        throttle, limit, or suspend usage where we detect abnormal patterns, automated abuse, resale, or attempts to circumvent limits.
      </P>

      <H2>7. Messages Cortex Sends On Your Behalf</H2>
      <P>
        Cortex can draft and send payment reminders to <strong>your</strong> customers, in <strong>your</strong> name, using
        the email address or WhatsApp account you connect. This section governs that, because it is the one part of the
        Service that communicates with people who are not our users.
      </P>
      <UL>
        <li>
          <strong>You control it.</strong> Collections is switched off by default. Nothing is drafted until you enable it,
          and nothing is sent until you approve it — unless you separately switch on automatic sending, which is off by
          default and which you may turn off at any time.
        </li>
        <li>
          <strong>You are the sender.</strong> Messages are sent on your instruction and in your name. You remain
          responsible for the lawfulness of contacting each recipient, for the accuracy of the amounts claimed, and for
          holding a lawful basis to hold and use their contact details.
        </li>
        <li>
          <strong>What Cortex will not write.</strong> Reminders never threaten legal action, notices, courts, recovery
          agents or credit reporting, and never assert interest, penalties or late fees that were not on the invoice.
          Escalation changes only how direct the wording is. If your own signature or payment note contains such language,
          Cortex refuses to draft the message rather than send it.
        </li>
        <li>
          <strong>Limits you set.</strong> You choose how long to wait, how far apart reminders go, how many are sent per
          invoice, a daily ceiling, the hours during which messages may be sent, and a do-not-contact list. Cortex stops
          immediately and permanently for an invoice once it is marked paid.
        </li>
        <li>
          <strong>A full record.</strong> Every message drafted, approved, sent, failed or cancelled is retained in your
          workspace so you can always see exactly what was said to whom, and when.
        </li>
        <li>
          <strong>We may stop it.</strong> We may suspend outbound messaging for a workspace, or across the Service, if we
          reasonably believe it is being used for harassment, for debts that are not genuinely owed, or in breach of any
          messaging provider&rsquo;s terms.
        </li>
      </UL>
      <P>
        Where you connect your own WhatsApp Business or email-sending account, your use of that account remains subject to
        that provider&rsquo;s own terms, and any charges they levy are billed to you directly by them.
      </P>

      <H2>8. Acceptable Use</H2>
      <P>You agree not to:</P>
      <UL>
        <li>use the platform for unlawful, fraudulent, defamatory, or misleading purposes;</li>
        <li>generate content that infringes intellectual property, is harmful, or violates any person&rsquo;s rights;</li>
        <li>reverse-engineer, scrape, or attempt to extract the platform&rsquo;s source, models, or prompts;</li>
        <li>resell, sublicense, or share your account credentials or credits without authorisation;</li>
        <li>upload malware or interfere with the security or integrity of the service.</li>
      </UL>
      <P>Violations may result in immediate suspension or termination without refund.</P>

      <H2>9. AI Output &amp; No Professional Advice</H2>
      <P>
        MNB Cortex uses AI to generate suggestions, drafts, calculations, and analyses. Outputs may contain errors and are provided for
        your consideration only. They do not constitute professional legal, financial, tax, accounting, or investment advice. You are
        responsible for reviewing and verifying all outputs before relying on or acting on them. We are not a licensed financial advisor,
        chartered accountant, or law firm.
      </P>

      <H2>10. Intellectual Property</H2>
      <P>
        All software, algorithms, designs, logos, and branding of MNB Cortex are the exclusive property of Abrobot Technologies Pvt Ltd,
        protected under Indian and international IP laws. Subject to these Terms, you retain ownership of the business data and content you
        input, and of the outputs generated for your workspace, and grant us a limited licence to process them solely to provide and
        improve the service.
      </P>

      <H2>11. Privacy &amp; Data</H2>
      <P>
        Your use of the service is also governed by our <Link href="/privacy" className="text-primary underline">Privacy Policy</Link>. We
        do not sell your personal data. Data is isolated per workspace and protected with encryption and row-level security. You may
        request access to or deletion of your data by contacting <a href="mailto:contact@mnbresearch.com" className="text-primary underline">contact@mnbresearch.com</a>.
      </P>

      <H2>12. Limitation of Liability</H2>
      <P>
        The service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. We do not guarantee specific business
        outcomes. To the maximum extent permitted by law, Abrobot Technologies Pvt Ltd and its affiliates shall not be liable for any
        indirect, incidental, or consequential damages. Our total aggregate liability for any claim shall not exceed the amount you paid to
        us in the 30 days preceding the event giving rise to the claim.
      </P>

      <H2>13. Termination</H2>
      <P>
        You may cancel your subscription at any time from your billing settings; cancellation takes effect at the end of the current cycle
        with no prorated refund. We may suspend or terminate your access without notice for breach of these Terms, non-payment, or
        fraudulent activity, with no refund issued for the remaining period.
      </P>

      <H2>14. Governing Law &amp; Disputes</H2>
      <P>
        These Terms are governed by the laws of the Republic of India. Any disputes are subject to the exclusive jurisdiction of the courts
        of <strong>Delhi, India</strong>. Both parties agree to attempt good-faith resolution for 30 days before initiating legal proceedings.
      </P>

      <H2>15. Amendments</H2>
      <P>
        We may revise these Terms from time to time. We will update the effective date and, where appropriate, notify users. Continued use
        after changes are posted constitutes acceptance of the revised Terms.
      </P>

      <H2>16. Contact</H2>
      <UL>
        <li><strong>Company:</strong> Abrobot Technologies Pvt Ltd, Delhi, India</li>
        <li><strong>Email:</strong> <a href="mailto:contact@mnbresearch.com" className="text-primary underline">contact@mnbresearch.com</a></li>
        <li><strong>WhatsApp &amp; Phone:</strong> <a href="https://wa.me/919711488480" className="text-primary underline">+91 97114 88480</a></li>
      </UL>
      <P>© 2026 Abrobot Technologies Pvt Ltd. All rights reserved. Delhi, India. Last updated August 2026.</P>
    </LegalShell>
  );
}
