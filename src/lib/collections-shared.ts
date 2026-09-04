/**
 * Collections types the BROWSER needs.
 *
 * `lib/collections/index.ts` is server-only — it imports the service-role
 * client — so a client component importing the Policy type from it would fail
 * the build with "you're importing a component that needs server-only". Same
 * split as gbp/gbp-shared and referrals/referral-shared, and
 * scripts/test-boundaries.mjs is what stops it regressing.
 */
export type Tone = "polite" | "neutral" | "firm";
export type Channel = "email" | "whatsapp";

export type Policy = {
  enabled: boolean;
  auto_send: boolean;
  tone: Tone;
  channels: Channel[];
  first_after_days: number;
  min_gap_days: number;
  max_attempts: number;
  max_per_day: number;
  send_from_hour: number;
  send_to_hour: number;
  do_not_contact: string[];
  signature: string | null;
  payment_note: string | null;

  /*
    The name of a message template the WORKSPACE had approved by Meta, and its
    language. WhatsApp refuses free-form messages to anyone who has not messaged
    the business first — which a debtor never has — so without one of these
    there is no legal way to open the conversation and Cortex declines to try.
    See lib/collections/whatsapp.ts for why the refusal must not be recorded as
    a delivery failure.
  */
  whatsapp_template: string | null;
  whatsapp_lang: string;
};
