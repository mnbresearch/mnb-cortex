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
      <UL>
        <li><strong>Starter</strong> — ₹1,499/month or ₹14,990/year · 1,000 AI credits/month</li>
        <li><strong>Growth</strong> — ₹4,999/month or ₹49,990/year · 5,000 AI credits/month</li>
        <li><strong>Business</strong> — ₹14,999/month or ₹1,49,990/year · 20,000 AI credits/month</li>
        <li><strong>Command</strong> — ₹39,999/month or ₹3,99,990/year · 37,000 AI credits/month</li>
        <li><strong>Enterprise</strong> — custom pricing · unlimited credits (contact us)</li>
      </UL>
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

      <H2>7. Acceptable Use</H2>
      <P>You agree not to:</P>
      <UL>
        <li>use the platform for unlawful, fraudulent, defamatory, or misleading purposes;</li>
        <li>generate content that infringes intellectual property, is harmful, or violates any person&rsquo;s rights;</li>
        <li>reverse-engineer, scrape, or attempt to extract the platform&rsquo;s source, models, or prompts;</li>
        <li>resell, sublicense, or share your account credentials or credits without authorisation;</li>
        <li>upload malware or interfere with the security or integrity of the service.</li>
      </UL>
      <P>Violations may result in immediate suspension or termination without refund.</P>

      <H2>8. AI Output &amp; No Professional Advice</H2>
      <P>
        MNB Cortex uses AI to generate suggestions, drafts, calculations, and analyses. Outputs may contain errors and are provided for
        your consideration only. They do not constitute professional legal, financial, tax, accounting, or investment advice. You are
        responsible for reviewing and verifying all outputs before relying on or acting on them. We are not a licensed financial advisor,
        chartered accountant, or law firm.
      </P>

      <H2>9. Intellectual Property</H2>
      <P>
        All software, algorithms, designs, logos, and branding of MNB Cortex are the exclusive property of Abrobot Technologies Pvt Ltd,
        protected under Indian and international IP laws. Subject to these Terms, you retain ownership of the business data and content you
        input, and of the outputs generated for your workspace, and grant us a limited licence to process them solely to provide and
        improve the service.
      </P>

      <H2>10. Privacy &amp; Data</H2>
      <P>
        Your use of the service is also governed by our <Link href="/privacy" className="text-primary underline">Privacy Policy</Link>. We
        do not sell your personal data. Data is isolated per workspace and protected with encryption and row-level security. You may
        request access to or deletion of your data by contacting <a href="mailto:contact@mnbresearch.com" className="text-primary underline">contact@mnbresearch.com</a>.
      </P>

      <H2>11. Limitation of Liability</H2>
      <P>
        The service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. We do not guarantee specific business
        outcomes. To the maximum extent permitted by law, Abrobot Technologies Pvt Ltd and its affiliates shall not be liable for any
        indirect, incidental, or consequential damages. Our total aggregate liability for any claim shall not exceed the amount you paid to
        us in the 30 days preceding the event giving rise to the claim.
      </P>

      <H2>12. Termination</H2>
      <P>
        You may cancel your subscription at any time from your billing settings; cancellation takes effect at the end of the current cycle
        with no prorated refund. We may suspend or terminate your access without notice for breach of these Terms, non-payment, or
        fraudulent activity, with no refund issued for the remaining period.
      </P>

      <H2>13. Governing Law &amp; Disputes</H2>
      <P>
        These Terms are governed by the laws of the Republic of India. Any disputes are subject to the exclusive jurisdiction of the courts
        of <strong>Delhi, India</strong>. Both parties agree to attempt good-faith resolution for 30 days before initiating legal proceedings.
      </P>

      <H2>14. Amendments</H2>
      <P>
        We may revise these Terms from time to time. We will update the effective date and, where appropriate, notify users. Continued use
        after changes are posted constitutes acceptance of the revised Terms.
      </P>

      <H2>15. Contact</H2>
      <UL>
        <li><strong>Company:</strong> Abrobot Technologies Pvt Ltd, Delhi, India</li>
        <li><strong>Email:</strong> <a href="mailto:contact@mnbresearch.com" className="text-primary underline">contact@mnbresearch.com</a></li>
        <li><strong>WhatsApp &amp; Phone:</strong> <a href="https://wa.me/919711488480" className="text-primary underline">+91 97114 88480</a></li>
      </UL>
      <P>© 2026 Abrobot Technologies Pvt Ltd. All rights reserved. Delhi, India. Last updated August 2026.</P>
    </LegalShell>
  );
}
