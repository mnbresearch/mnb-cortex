import Link from "next/link";
import { LegalShell, H2, P, UL } from "@/components/legal-shell";

export const metadata = {
  title: "Refund & Cancellation Policy — MNB Cortex",
  description: "MNB Cortex refund, cancellation, and billing policy for subscription plans and AI credit top-ups.",
};

export default function Refund() {
  return (
    <LegalShell title="Refund & Cancellation Policy" subtitle="Abrobot Technologies Pvt Ltd · Last updated August 2026 · Delhi, India">
      <P>
        This policy explains how refunds and cancellations work for <strong>MNB Cortex</strong>, an AI-COO software-as-a-service platform
        operated by <strong>Abrobot Technologies Pvt Ltd</strong>. By purchasing a subscription or credit pack, you agree to the terms below,
        which should be read together with our <Link href="/terms" className="text-primary underline">Terms &amp; Conditions</Link>.
      </P>

      <H2>1. Nature of the Service</H2>
      <P>
        MNB Cortex is a digital subscription service. Access to AI features, agents, memory, and image generation is delivered instantly and
        consumed as AI credits the moment you use them. Because the value is delivered digitally and in real time, purchases are treated as
        consumed on use.
      </P>

      <H2>2. General Refund Policy</H2>
      <P>
        All payments — including subscription plans (monthly and annual) and one-time credit top-up packs — are{" "}
        <strong>generally non-refundable</strong> once processed. This includes cases of change of mind, partial or non-usage of credits, or
        dissatisfaction with AI-generated outputs (which are inherently probabilistic and provided for your review, not as guaranteed results).
      </P>

      <H2>3. Exceptions — When We Do Refund</H2>
      <P>We will review and, where valid, issue a refund in these situations:</P>
      <UL>
        <li><strong>Duplicate or accidental charge:</strong> you were billed more than once for the same subscription or pack.</li>
        <li><strong>Billing error:</strong> you were charged an incorrect amount due to a system error on our side.</li>
        <li><strong>Failed delivery:</strong> your payment succeeded but the corresponding plan or credits were not activated in your workspace, and we are unable to activate them.</li>
        <li><strong>Verified service failure:</strong> a sustained, confirmed platform outage on our side that prevented you from using the service for a material part of your billing period, which we are unable to remedy.</li>
      </UL>
      <P>
        Approved refunds are credited to your original payment method (via Cashfree) within <strong>5–7 working days</strong> of approval.
        Refunds do not apply to credits that have already been consumed.
      </P>

      <H2>4. Cancellation</H2>
      <UL>
        <li>You can cancel your subscription at any time from your billing settings or by emailing us.</li>
        <li>Cancellation stops future renewals. Your plan remains active until the end of the current paid cycle.</li>
        <li>No prorated refund is issued for the unused portion of a monthly or annual cycle after cancellation.</li>
        <li>After the cycle ends, your workspace moves to a limited/expired state; your data is retained per our <Link href="/privacy" className="text-primary underline">Privacy Policy</Link> so you can resubscribe.</li>
      </UL>

      <H2>5. Free Trial</H2>
      <P>
        Where a free trial is offered, it includes a small one-time credit grant so you can evaluate the platform. No payment is taken to
        start a trial. When the trial ends, you must choose a paid plan to continue — you are never auto-charged without explicitly
        purchasing a plan.
      </P>

      <H2>6. Credit Top-Ups</H2>
      <P>
        One-time credit packs are non-refundable once purchased, except in the duplicate-charge, billing-error, or failed-delivery cases in
        Section 3. Purchased credits follow the validity stated at the time of purchase.
      </P>

      <H2>7. How to Request a Refund</H2>
      <P>
        Email <a href="mailto:contact@mnbresearch.com" className="text-primary underline">contact@mnbresearch.com</a> from your registered
        email address with your <strong>transaction / order ID</strong> and a short description of the issue. Our team will review within{" "}
        <strong>3 business days</strong> and respond with a decision. Please raise concerns with us first — chargebacks filed outside this
        process may result in suspension of your workspace while we investigate.
      </P>

      <H2>8. Contact</H2>
      <UL>
        <li><strong>Company:</strong> Abrobot Technologies Pvt Ltd (MNB Cortex), Delhi, India</li>
        <li><strong>Email:</strong> <a href="mailto:contact@mnbresearch.com" className="text-primary underline">contact@mnbresearch.com</a></li>
        <li><strong>Phone / WhatsApp:</strong> <a href="https://wa.me/919711488480" className="text-primary underline">+91 97114 88480</a></li>
        <li><strong>Response time:</strong> within 2 business days</li>
      </UL>

      <P>© 2026 Abrobot Technologies Pvt Ltd. All rights reserved. Delhi, India.</P>
    </LegalShell>
  );
}
