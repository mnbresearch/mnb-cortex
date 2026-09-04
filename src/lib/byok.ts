/**
 * Keys the customer must bring themselves.
 *
 * WHY CORTEX CANNOT SUPPLY THESE.
 *
 * Some capabilities cannot be resold. WhatsApp Business messaging is the clear
 * case: Meta issues credentials against a specific business, verified against
 * that business's own registration, and messages sent through them appear as
 * coming from that business. There is no legitimate way for Cortex to send a
 * payment reminder that shows up as YOUR company using OUR account — and a
 * product that tried would be putting its customers on the wrong side of Meta's
 * terms, with their number as the one that gets banned.
 *
 * So the honest design is: the customer connects their own account, Cortex
 * stores it encrypted, and uses it on their behalf.
 *
 * WHAT THIS MODULE IS FOR.
 *
 * Telling them that WELL. "Add your API key" with an empty box is where most
 * products stop, and it is why most BYO-key integrations never get connected.
 * Each entry below carries: why we cannot provide it, exactly where to get it,
 * how long it takes, what it costs, and what to do when stuck. That last part
 * matters — an owner who cannot finish this alone should be able to hand it to
 * someone, not abandon the feature.
 *
 * Kept as pure data with no imports so the setup screen, the collections page
 * and the integrations page all describe the same thing in the same words.
 */

export type SetupStep = { title: string; detail: string };

export type ByoKey = {
  id: string;
  /** What the customer gains by connecting it. */
  capability: string;
  provider: string;
  /** Stated plainly, because "contact support" for something we structurally
   *  cannot do wastes everyone's time. */
  whyNotIncluded: string;
  /** Realistic, not optimistic. */
  timeEstimate: string;
  cost: string;
  fields: { key: string; label: string; hint: string; secret: boolean }[];
  steps: SetupStep[];
  docs: { label: string; url: string }[];
  /** True when the product works fine without it, just with less reach. */
  optional: boolean;
  withoutIt: string;
};

export const BYO_KEYS: ByoKey[] = [
  {
    id: "whatsapp",
    capability: "Send payment reminders on WhatsApp",
    provider: "Meta (WhatsApp Cloud API)",
    whyNotIncluded:
      "Meta issues WhatsApp Business credentials to one specific business, and messages sent with them show that business as the sender. "
      + "Cortex cannot send as your company using our account — Meta does not permit it, and if we tried, the number that gets restricted would be yours. "
      + "So you connect your own WhatsApp Business account and Cortex sends through it, on your behalf.",
    timeEstimate: "30–60 minutes, plus Meta's business verification which can take a few days",
    cost:
      "Meta charges per conversation, billed to you directly. Utility conversations in India are a few paise to a couple of rupees each. "
      + "Cortex adds nothing on top and never touches your Meta billing.",
    fields: [
      { key: "api_key", label: "Permanent access token", hint: "A long token starting with EAA…", secret: true },
      { key: "phone_number_id", label: "Phone number ID", hint: "A numeric id from the API Setup screen — NOT your phone number", secret: false },
    ],
    steps: [
      { title: "Create a Meta Business account",
        detail: "At business.facebook.com. If your business already has a Facebook Page, you likely have one." },
      { title: "Add the WhatsApp product in Meta for Developers",
        detail: "developers.facebook.com → My Apps → Create App → Business → add WhatsApp. This gives you a test number immediately." },
      { title: "Add and verify your own phone number",
        detail: "A number NOT currently registered on the WhatsApp app. Verification is by SMS or call." },
      { title: "Copy the Phone number ID",
        detail: "WhatsApp → API Setup. It sits under your number and is a long string of digits. This is not the phone number itself." },
      { title: "Create a PERMANENT access token",
        detail: "Business Settings → Users → System Users → add a system user with admin access to your app, then Generate Token with whatsapp_business_messaging and whatsapp_business_management. "
          + "The temporary token on the API Setup screen expires in 24 hours — using it means reminders stop the next day." },
      { title: "Paste both into Cortex and send a test",
        detail: "Integrations → WhatsApp. Cortex verifies the credentials before saving, so a wrong value is caught here rather than when a reminder fails." },
    ],
    docs: [
      { label: "WhatsApp Cloud API — get started", url: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" },
      { label: "Creating a permanent access token", url: "https://developers.facebook.com/docs/whatsapp/business-management-api/get-started" },
      { label: "Meta business verification", url: "https://www.facebook.com/business/help/2058515294227817" },
      { label: "WhatsApp conversation pricing", url: "https://developers.facebook.com/docs/whatsapp/pricing" },
    ],
    optional: true,
    withoutIt:
      "Collections still works over email, and every reminder is still drafted, tracked and stopped when the invoice is paid. "
      + "You only lose the WhatsApp channel, which for many Indian customers is the one they actually read.",
  },
  {
    id: "resend",
    capability: "Send reminders from your own domain",
    provider: "Resend",
    whyNotIncluded:
      "Cortex can send email for you out of the box. But a reminder about money is more likely to be read — and far less likely to land in spam — "
      + "when it comes from your own domain rather than ours. That requires DNS records only you can add.",
    timeEstimate: "15–30 minutes, plus up to a few hours for DNS to propagate",
    cost: "Resend has a free tier that covers a typical SME's reminder volume.",
    fields: [
      { key: "api_key", label: "Resend API key", hint: "Starts with re_", secret: true },
      { key: "from_email", label: "From address", hint: "e.g. accounts@yourcompany.com — must be on a verified domain", secret: false },
    ],
    steps: [
      { title: "Create a Resend account", detail: "resend.com — the free tier is enough to start." },
      { title: "Add and verify your domain",
        detail: "Resend gives you DKIM and SPF records. Add them at your domain registrar. Verification usually completes within an hour." },
      { title: "Create an API key", detail: "Resend → API Keys → Create. Sending permission is enough; it does not need full access." },
      { title: "Paste it into Cortex",
        detail: "Integrations → Resend. Reminders then arrive from your address, and replies come back to you rather than to us." },
    ],
    docs: [
      { label: "Resend — domain verification", url: "https://resend.com/docs/dashboard/domains/introduction" },
      { label: "Resend — API keys", url: "https://resend.com/docs/dashboard/api-keys/introduction" },
      { label: "Why SPF and DKIM matter for deliverability", url: "https://resend.com/docs/knowledge-base/introduction" },
    ],
    optional: true,
    withoutIt: "Reminders send from Cortex's domain on your behalf. They work; they just look less like you.",
  },
];

export function byoKey(id: string): ByoKey | null {
  return BYO_KEYS.find((k) => k.id === id) || null;
}
