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
};
