import Link from "next/link";
import { LegalShell, H2, P, UL } from "@/components/legal-shell";

export const metadata = {
  title: "Privacy Policy — MNB Cortex",
  description: "How MNB Cortex (Abrobot Technologies Pvt Ltd) collects, protects, and processes your business data.",
};

export default function Privacy() {
  return (
    <LegalShell title="Privacy Policy" subtitle="How we protect your data · Abrobot Technologies Pvt Ltd · Last updated August 2026">
      <P>
        At <strong>MNB Cortex</strong>, powered by <strong>Abrobot Technologies Pvt Ltd</strong>, your trust is our highest priority. Every
        piece of information you share with us — your account details, business data, documents, and the memory you build inside Cortex — is
        stored, processed, and protected with strong security and transparency. This policy explains what we collect, why, and how we keep it safe.
      </P>

      <H2>1. Our Commitment</H2>
      <P>We operate under four principles:</P>
      <UL>
        <li><strong>Transparency</strong> — you always know what data we collect and why.</li>
        <li><strong>Consent</strong> — we process your data only after your explicit permission.</li>
        <li><strong>Control</strong> — you can access, export, modify, or delete your data at any time.</li>
        <li><strong>Security by design</strong> — data protection is embedded at every layer of the platform.</li>
      </UL>

      <H2>2. Information We Collect</H2>
      <UL>
        <li><strong>Account data:</strong> name, email, phone, organisation name, and login credentials.</li>
        <li><strong>Business data:</strong> the figures, notes, customers, vendors, documents, and memory you enter into your workspace.</li>
        <li><strong>Usage data:</strong> feature usage, AI credit consumption, and diagnostic logs used to run and improve the service.</li>
        <li><strong>Payment data:</strong> processed by our payment gateway (Cashfree). We do <strong>not</strong> store your full card, UPI, or bank details on our servers.</li>
      </UL>

      <H2>3. Secure Infrastructure</H2>
      <UL>
        <li><strong>Cloud protection:</strong> the platform is hosted on reputable cloud infrastructure with industry-standard security controls.</li>
        <li><strong>Encryption in transit:</strong> all traffic is protected with SSL/TLS (HTTPS).</li>
        <li><strong>Encryption at rest:</strong> stored data and secrets are encrypted; sensitive API keys are encrypted with AES-256-GCM.</li>
        <li><strong>Workspace isolation:</strong> every organisation&rsquo;s data is isolated using database row-level security (RLS), so one workspace can never read another&rsquo;s data.</li>
        <li><strong>Access control:</strong> only authorised, role-restricted team members can access production systems, monitored by audit logs.</li>
      </UL>

      <H2>4. How We Use AI &amp; Your Data</H2>
      <P>
        MNB Cortex sends your prompts and relevant workspace context to AI model providers to generate responses, agents, and images. This
        is done only to deliver the feature you requested. Your business data and memory are used to ground AI outputs for <em>your</em>
        workspace and are not used to train third-party foundation models on your identifiable data. Uploaded files are processed to
        deliver the requested result and are not resold or made public.
      </P>

      <H2>5. Data About Your Customers And Suppliers</H2>
      <P>
        This section exists because Cortex now holds information about people who are not our users, and sends messages to
        them on your instruction. It is the part of this policy most worth reading carefully.
      </P>
      <UL>
        <li>
          <strong>What we hold.</strong> When you import invoices, orders or a customer list, that data includes the names,
          and often the email addresses and phone numbers, of your customers and suppliers. Cortex stores it in your
          workspace so it can age your receivables, match a payment to a party, and — if you enable collections — send a
          reminder.
        </li>
        <li>
          <strong>You are the controller; we are the processor.</strong> That data is yours. We process it only to provide
          the Service to you, on your instructions. We do not sell it, rent it, share it between workspaces, or use it to
          build products for anyone else.
        </li>
        <li>
          <strong>Your lawful basis is yours.</strong> You are responsible for having a proper basis to hold your
          customers&rsquo; and suppliers&rsquo; contact details and to contact them about money owed. Cortex gives you the
          controls — a do-not-contact list, sending hours, limits, and approval of every message — but the decision to
          contact any particular person is yours.
        </li>
        <li>
          <strong>Messages are sent as you.</strong> Where you connect your own WhatsApp Business or email-sending account,
          messages leave through that account and appear as coming from your business. Where you use Cortex&rsquo;s email
          sender, the message identifies your business as the sender.
        </li>
        <li>
          <strong>Deletion.</strong> Deleting an invoice or customer removes it from your workspace. Ask us and we will
          delete a specific individual&rsquo;s data across your workspace, including any record of messages sent to them,
          subject to any record we are legally required to keep.
        </li>
        <li>
          <strong>No profiling of third parties.</strong> Cortex does not build profiles of your customers beyond what is
          needed to chase a specific invoice, and never shares one workspace&rsquo;s parties with another — even where the
          same company appears in both.
        </li>
      </UL>

      <H2>6. Data Sharing</H2>
      <P>MNB Cortex <strong>does not sell or trade</strong> your personal or business information. We share limited data only with:</P>
      <UL>
        <li><strong>Infrastructure &amp; AI sub-processors</strong> (hosting, database, AI model, and email providers) strictly to operate the service;</li>
        <li><strong>Payment processors</strong> (e.g. Cashfree) to complete transactions you initiate;</li>
        <li><strong>Authorities</strong>, where required by applicable law.</li>
      </UL>
      <P>All sub-processors are bound to maintain confidentiality and equivalent levels of protection.</P>

      <H2>7. Your Rights &amp; Control</H2>
      <P>You remain in control of your data at all times. You can:</P>
      <UL>
        <li>access and update your information from your account settings;</li>
        <li>export your workspace memory and data (JSON / Markdown);</li>
        <li>withdraw consent for optional processing;</li>
        <li>request permanent deletion of your records by emailing <a href="mailto:contact@mnbresearch.com" className="text-primary underline">contact@mnbresearch.com</a>.</li>
      </UL>
      <P>Upon a verified request, we delete your personal data within a reasonable period and confirm by email.</P>

      <H2>8. Data Retention</H2>
      <P>
        We retain personal and business data only for as long as your workspace is active or as needed to provide the service, comply with
        legal obligations, resolve disputes, and enforce our agreements. After this period, data is securely deleted or anonymised. Routine
        backups are purged on a rolling schedule.
      </P>

      <H2>9. Compliance</H2>
      <P>
        We align our practices with India&rsquo;s Digital Personal Data Protection Act (DPDP) and, where applicable to users in those
        regions, the GDPR (EU) and CCPA (USA). We follow data-minimisation and purpose-limitation principles across the platform.
      </P>

      <H2>10. Cookies</H2>
      <P>
        We use essential cookies to keep you signed in and to run the app securely, and limited analytics to understand usage and improve
        the product. You can control non-essential cookies through your browser settings.
      </P>

      <H2>11. Breach Response</H2>
      <P>
        We perform regular reviews and monitoring to prevent unauthorised access. In the unlikely event of a data breach affecting your
        personal data, we will notify affected users and relevant authorities as required by law, and take prompt corrective action.
      </P>

      <H2>12. Contact — Data Protection</H2>
      <UL>
        <li><strong>Company:</strong> Abrobot Technologies Pvt Ltd (MNB Cortex), Delhi, India</li>
        <li><strong>Email:</strong> <a href="mailto:contact@mnbresearch.com" className="text-primary underline">contact@mnbresearch.com</a></li>
        <li><strong>Phone / WhatsApp:</strong> <a href="https://wa.me/919711488480" className="text-primary underline">+91 97114 88480</a></li>
      </UL>

      <P>
        <strong>Summary:</strong> Your data with MNB Cortex is encrypted, workspace-isolated, and never sold. You can access, export, or
        delete it at any time, and every verified deletion request is honoured. See also our{" "}
        <Link href="/terms" className="text-primary underline">Terms &amp; Conditions</Link> and{" "}
        <Link href="/refund" className="text-primary underline">Refund Policy</Link>.
      </P>
    </LegalShell>
  );
}
