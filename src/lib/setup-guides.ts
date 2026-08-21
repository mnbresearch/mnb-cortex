/**
 * Step-by-step guides for the credentials a CUSTOMER supplies.
 *
 * Cortex is bring-your-own-key for anything that sends from, or reads out of,
 * an account that belongs to the customer: their Meta business number, their
 * Shopify store, their Stripe account. That is the right design — messages come
 * from their brand, and their data never routes through a shared platform
 * account — but it puts a setup task in front of a busy SME owner.
 *
 * "Add your WhatsApp token" is not a usable instruction to someone who has
 * never opened developers.facebook.com. Every guide below is written for
 * somebody who has not done this before: exact page names, exact button labels,
 * what the value looks like, and the mistakes that actually catch people out.
 *
 * No secrets here — this is only instructions, so it is safe to import from a
 * client component.
 */

export type SetupStep = { title: string; detail: string };

export type SetupGuide = {
  provider: string;          // matches the integrations catalogue id
  name: string;
  /** What the customer gets once it's connected. */
  unlocks: string;
  /** Roughly how long it takes, honestly stated. */
  time: string;
  /** Anything that costs money or needs approval — said up front, not buried. */
  caveat?: string;
  docs: string;
  steps: SetupStep[];
  /** Common failure the support inbox will otherwise see. */
  gotchas: string[];
};

export const SETUP_GUIDES: SetupGuide[] = [
  {
    provider: "whatsapp",
    name: "WhatsApp Business (Meta Cloud API)",
    unlocks: "Send reminders, payment chases and broadcasts from your own WhatsApp business number, and let Cortex agents message customers directly.",
    time: "20–30 minutes, plus Meta's review for your first message template",
    caveat:
      "This must be your own Meta account — WhatsApp bills you directly per conversation, and messages must come from a number you own. Meta gives 1,000 free service conversations a month; beyond that India rates apply. Cortex adds no charge on top.",
    docs: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
    steps: [
      {
        title: "Create a Meta developer account",
        detail: "Go to developers.facebook.com and sign in with the Facebook account that owns (or will own) your business page. Accept the developer terms. This is free.",
      },
      {
        title: "Create an app of type “Business”",
        detail: "My Apps → Create App → choose “Business” → give it any name (e.g. “Cortex Messaging”). Ignore the other app types; only Business exposes WhatsApp.",
      },
      {
        title: "Add the WhatsApp product",
        detail: "On the app dashboard, find WhatsApp in the product list and click “Set up”. Meta creates a test number for you automatically, and links a WhatsApp Business Account (WABA).",
      },
      {
        title: "Copy your Phone number ID",
        detail: "WhatsApp → API Setup. You'll see “From” with a phone number and, directly beneath it, a Phone number ID — a long number like 123456789012345. That ID is what Cortex needs, NOT the phone number itself.",
      },
      {
        title: "Generate a PERMANENT access token",
        detail: "The token shown on the API Setup page expires in 24 hours — don't use it. Instead: Business Settings → Users → System Users → Add, create a system user with the Admin role, click “Generate New Token”, pick your app, tick the whatsapp_business_messaging and whatsapp_business_management permissions, and set the expiry to Never. Copy the token immediately; Meta shows it once.",
      },
      {
        title: "Add your own business number",
        detail: "WhatsApp → API Setup → “Add phone number”. It must be a number NOT currently registered on the normal WhatsApp or WhatsApp Business app — if it is, delete that account first and wait a few minutes. Verify by SMS or call.",
      },
      {
        title: "Paste both values into Cortex",
        detail: "Integrations → WhatsApp Business → Connect. Put the system-user token in “Permanent access token” and the ID from step 4 in “Phone number ID”. Cortex encrypts both with AES-256-GCM before storing them, and never shows them again.",
      },
      {
        title: "Create and submit a message template",
        detail: "To START a conversation you need an approved template (free-form replies are only allowed within 24 hours of the customer messaging you). WhatsApp Manager → Message Templates → Create. Approval is usually under an hour. Use the template name in Cortex when sending.",
      },
    ],
    gotchas: [
      "Using the temporary 24-hour token from the API Setup page. It works in testing and then silently stops the next day — always create a system-user token with expiry Never.",
      "Entering the phone NUMBER instead of the Phone number ID. The ID is the long numeric string underneath it.",
      "Trying to register a number that is already in use on the WhatsApp app. Delete that account first.",
      "Expecting free-form messages to reach a new contact. Outside the 24-hour customer-initiated window, only approved templates are delivered.",
    ],
  },
  {
    provider: "shopify",
    name: "Shopify",
    unlocks: "Cortex pulls your orders and customers every night, so revenue, order counts and repeat-customer KPIs stay current without any manual import.",
    time: "5 minutes",
    docs: "https://help.shopify.com/en/manual/apps/app-types/custom-apps",
    steps: [
      { title: "Open app development", detail: "Shopify admin → Settings → Apps and sales channels → Develop apps. Click “Allow custom app development” if you haven't before (owner account only)." },
      { title: "Create an app", detail: "“Create an app” → name it “MNB Cortex” → Create." },
      { title: "Grant read scopes", detail: "Configuration → Admin API integration → Configure. Tick read_orders, read_customers and read_products. Cortex only ever reads; no write scope is needed or requested." },
      { title: "Install and copy the token", detail: "API credentials → Install app → reveal the Admin API access token. It starts with shpat_ and is shown once." },
      { title: "Connect in Cortex", detail: "Integrations → Shopify. “Shop domain” is your myshopify address (e.g. mystore.myshopify.com — not your custom domain). Paste the shpat_ token as the access token." },
    ],
    gotchas: [
      "Using your public custom domain instead of the .myshopify.com one.",
      "Missing read_orders — the connection tests fine and then syncs nothing.",
    ],
  },
  {
    provider: "stripe",
    name: "Stripe",
    unlocks: "Paid charges arrive as settled receivables, so your cash position reflects money that has actually landed.",
    time: "2 minutes",
    docs: "https://docs.stripe.com/keys",
    steps: [
      { title: "Open API keys", detail: "Stripe Dashboard → Developers → API keys." },
      { title: "Create a restricted key", detail: "“Create restricted key”. Grant READ on Charges and Balance transactions, and nothing else. A restricted key limits the damage if it ever leaks — prefer it to the secret key." },
      { title: "Paste it into Cortex", detail: "Integrations → Stripe → Connect. The key begins rk_live_ (restricted) or sk_live_ (secret)." },
    ],
    gotchas: ["Pasting a test-mode key (sk_test_/rk_test_) — it connects but returns no live payments."],
  },
  {
    provider: "razorpay",
    name: "Razorpay",
    unlocks: "Captured payments become paid receivables automatically, so collections and cash figures stay accurate.",
    time: "2 minutes",
    docs: "https://razorpay.com/docs/api/authentication/",
    steps: [
      { title: "Open API keys", detail: "Razorpay Dashboard → Account & Settings → API Keys." },
      { title: "Generate a key", detail: "“Generate Key”. Razorpay shows the Key Secret exactly once — copy it before closing the dialog." },
      { title: "Paste both into Cortex", detail: "Integrations → Razorpay. Key ID starts rzp_live_; the secret is the value you just copied." },
    ],
    gotchas: ["Using rzp_test_ credentials — no live payments will appear."],
  },
  {
    provider: "google_sheets",
    name: "Google Sheets",
    unlocks: "Cortex reads a sheet you already maintain and turns it into live KPIs — the fastest way in if your data isn't in any system yet.",
    time: "1 minute",
    docs: "https://support.google.com/docs/answer/183965",
    steps: [
      { title: "Publish the sheet", detail: "In your sheet: File → Share → Publish to web → publish the specific tab as CSV." },
      { title: "Copy the published link", detail: "Use the URL Google gives you after publishing, not the normal address bar link." },
      { title: "Paste it into Cortex", detail: "Integrations → Google Sheets. Cortex matches columns by header name, so amount / customer / date are found whatever order they're in." },
    ],
    gotchas: [
      "Sharing the edit link instead of publishing. An unpublished sheet returns a login page and the sync fails.",
      "Amounts formatted as text with symbols — Cortex strips ₹ and commas, but a column of genuine text won't total.",
    ],
  },
];

export function guideFor(provider: string): SetupGuide | undefined {
  return SETUP_GUIDES.find((g) => g.provider === String(provider || "").toLowerCase());
}
