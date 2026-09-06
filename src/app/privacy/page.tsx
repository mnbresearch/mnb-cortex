import Link from "next/link";
import { LegalShell, H2, P, UL } from "@/components/legal-shell";

export const metadata = {
  title: "Privacy Policy — MNB Cortex",
  description: "How MNB Cortex (Abrobot Technologies Pvt Ltd) collects, protects, and processes your business data.",
};

export default function Privacy() {
  return (
    <LegalShell title="Privacy Policy" subtitle="How we protect your data · Abrobot Technologies Pvt Ltd · Last updated September 2026">
      <P>
        At <strong>MNB Cortex</strong>, powered by <strong>Abrobot Technologies Pvt Ltd</strong>, your trust is our highest priority. Every
        piece of information you share with us — your account details, business data, documents, and the memory you build inside Cortex — is
        stored, processed, and protected with strong security and transparency. This policy explains what we collect, why, and how we keep it safe.
      </P>

      <H2>1. Our Commitment</H2>
      <P>We operate under four principles:</P>
      <UL>
        <li><strong>Transparency</strong> — you always know what data we collect and why.</li>
        <li>
          <strong>Lawful basis</strong> &mdash; we process your own account and business data to provide the
          service you asked for. Data you import about <em>your</em> customers is processed on your
          instructions, and you are responsible for having a lawful basis to hold it. We do not claim to have
          collected consent from those individuals, because we have no relationship with them.
        </li>
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
          <strong>Deletion.</strong> Deleting an invoice or customer removes it from your workspace, and deleting
          the workspace removes everything in it. If one of your customers asks you to erase their data, write to
          us with the workspace and the identifying details and we will remove their records and the history of
          messages sent to them, subject to anything we are legally required to keep. This is handled manually
          today and we will confirm by email when it is done &mdash; we would rather say that than imply a
          self-service control that does not exist.
        </li>
        <li>
          <strong>No profiling of third parties.</strong> Cortex does not build profiles of your customers beyond what is
          needed to chase a specific invoice, and never shares one workspace&rsquo;s parties with another — even where the
          same company appears in both.
        </li>
      </UL>

      <H2>6. Data Sharing</H2>
      <P>MNB Cortex <strong>does not sell or trade</strong> your personal or business information. We share limited data only with:</P>
      {/*
        NAMED, not gestured at.

        This list previously read "infrastructure & AI sub-processors (hosting,
        database, AI model, and email providers)" — which names nobody, while
        the page claimed alignment with GDPR. A GDPR claim with no sub-processor
        list is worse than making no claim, because it invites the comparison.

        Every entry below is verifiable in the code. Keep it that way: if a
        provider is added, it belongs here before it ships.
      */}
      <UL>
        <li>
          <strong>Supabase</strong> — database, authentication and file storage. This is where your
          workspace data lives.
        </li>
        <li>
          <strong>Vercel</strong> — application hosting. Requests and server logs pass through it.
        </li>
        <li>
          <strong>Google (Gemini)</strong> — the AI model behind analysis, chat, the weekly brief and
          document reading. The business context relevant to a request is sent with it.
        </li>
        <li>
          <strong>Groq, Anthropic, OpenAI</strong> — used only as fallbacks when the primary model is
          unavailable, so that a request does not simply fail. The same context is sent.
        </li>
        <li>
          <strong>Resend</strong> — outbound email: alerts, the weekly brief, and collections messages
          sent from a workspace that has not connected its own sending domain.
        </li>
        <li>
          <strong>Meta (WhatsApp Cloud API)</strong> — only for workspaces that have connected their own
          WhatsApp Business account, and only for messages they have approved.
        </li>
        <li>
          <strong>Cashfree Payments</strong> — to complete transactions you initiate.
        </li>
        <li>
          <strong>Authorities</strong>, where required by applicable law.
        </li>
      </UL>
      <P>All sub-processors are bound to maintain confidentiality and equivalent levels of protection.</P>

      {/*
        BYO keys materially change WHO processes the data, and the policy said
        nothing about it. Including the fallback, which the code itself flags as
        the dangerous case: a workspace that connected only Anthropic still has
        its Gemini-served requests go through OUR key. Saying "your data goes to
        your own provider" without that caveat would be a false statement about
        data handling.
      */}
      <H2>6a. If you connect your own AI provider</H2>
      <P>
        You can connect your own Gemini, OpenAI, Anthropic or Groq key. When you do, requests served by that
        provider go to <strong>your</strong> account, under your agreement with them and their retention
        settings — not ours. Two things to be clear about:
      </P>
      <UL>
        <li>
          We store the key encrypted, and we make one call to that provider when you connect it, to check the
          key works before we rely on it.
        </li>
        <li>
          The switch is <strong>per provider</strong>. If a request is served by a provider you have not
          connected — including our fallback chain when your provider is unavailable — it runs on our key and
          the data goes to our account. Your workspace shows which provider is serving you.
        </li>
      </UL>

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
        We retain personal and business data for as long as your workspace is active or as needed to provide the
        service, comply with legal obligations, resolve disputes, and enforce our agreements. Routine backups
        are purged on a rolling schedule.
      </P>
      <P>
        <strong>What survives a deletion, and why.</strong> When a workspace is deleted we remove its business
        data, but we keep the <em>financial record</em> of payments and subscriptions with the workspace link
        removed. We are required to retain proof of transactions for tax and audit purposes, and a payment
        record with no workspace attached to it is no longer personal data about you. Everything else goes.
        You can export the workspace before deleting it.
      </P>

      <H2>9. Compliance</H2>
      <P>
        We operate under India&rsquo;s Digital Personal Data Protection Act, 2023 (DPDP). We follow
        data-minimisation and purpose-limitation across the platform.
      </P>
      {/*
        The GDPR/CCPA claim was removed rather than kept.

        Asserting GDPR alignment with no sub-processor list, no stated transfer
        mechanism, no EU representative and no DPA is worse than making no claim
        at all, because it invites exactly the comparison it fails. The
        sub-processors are now named above, but the rest is genuinely not in
        place — so the honest position is to say what IS true, which is DPDP.

        If EU or California customers are targeted later, that claim can be
        reinstated alongside the machinery it requires.
      */}

      <H2>9a. Grievance Officer</H2>
      {/*
        DPDP s.13(3) REQUIRES a published Grievance Officer contact. There was
        none anywhere in the product — "grievance" appeared zero times. The same
        requirement comes separately from the IT Rules 2021 and the consumer
        e-commerce rules.

        OPERATOR: replace the name below with a real person before launch. A
        role mailbox alone does not satisfy the section, which asks for a
        contactable officer.
      */}
      <P>
        If you are unhappy with how we have handled your data or your request, you can escalate to our
        Grievance Officer:
      </P>
      <UL>
        <li><strong>Designation:</strong> Grievance Officer, Abrobot Technologies Pvt Ltd</li>
        <li><strong>Email:</strong> <a href="mailto:grievance@mnbresearch.com" className="text-primary underline">grievance@mnbresearch.com</a></li>
        <li><strong>Response:</strong> we acknowledge within 48 hours and aim to resolve within 30 days</li>
      </UL>
      <P>
        If you are not satisfied with our response, you may complain to the Data Protection Board of India.
      </P>

      <H2>9b. If something goes wrong</H2>
      <P>
        If a personal data breach affects you, we will notify you and the Data Protection Board of India as
        required under the DPDP Act, without undue delay once we have established what happened and who is
        affected. We will tell you what data was involved and what we are doing about it, rather than waiting
        until the investigation is complete.
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
