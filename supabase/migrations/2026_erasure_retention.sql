/*
  Somewhere to keep the records we are legally required to keep, after the
  workspace they belonged to is gone.

  THE PROBLEM WITH THE OBVIOUS APPROACH.

  Workspace erasure anonymises financial records instead of destroying them:
  a completed payment is a tax record, Indian law requires books and vouchers to
  be retained for years, and both parties need them in a dispute or chargeback.
  Our privacy policy says exactly this, and the delete dialog repeats it.

  For `payments` that works — `org_id` is nullable, so severing the link leaves
  the row in place.

  For `subscriptions` it does NOT. That column is:

      org_id uuid not null references organizations(id) on delete cascade

  NOT NULL, so `update ... set org_id = null` cannot succeed. And the way it
  fails is the dangerous part: supabase-js RETURNS an error rather than throwing
  one, so a `try/catch` around it never fires. The update silently did nothing,
  the count was undefined, nothing was recorded — and then the org delete
  cascaded the subscription rows away entirely, while the UI told the customer
  their payment history had been retained.

  A promise that fails silently is worse than one that fails loudly, and this
  one failed silently in the direction of destroying records we had said we
  would keep.

  THE FIX.

  A table with NO foreign key to organizations, so nothing can cascade it away.
  Erasure copies into it BEFORE deleting, and refuses to proceed at all if the
  copy fails — because "we could not keep what we promised to keep" is a reason
  to stop, not to continue.

  WHAT IS DELIBERATELY NOT COPIED.

  No org_id, no user id, no email, no workspace name. The retention obligation
  is over the FINANCIAL FACT — that an amount was paid, under which plan,
  against which provider reference — not over who paid it. Keeping the identity
  would turn a tax-retention exception into a way of holding personal data after
  someone asked us to erase it, which is the opposite of the point.

  `original_id` and `reference` are kept because a dispute is looked up by the
  provider's reference, and without it the row cannot be matched to anything.
*/

create table if not exists erased_subscriptions (
  id           uuid primary key default gen_random_uuid(),

  /* The subscription's own id, so a provider dispute can be traced back. */
  original_id  uuid,

  plan         text,
  status       text,
  provider     text,
  amount       numeric,
  /* The payment provider's reference — how a chargeback is actually looked up. */
  reference    text,

  /* When the subscription was created, and when the workspace was erased. */
  created_at   timestamptz,
  erased_at    timestamptz not null default now()
);

create index if not exists erased_subscriptions_reference on erased_subscriptions (reference);
create index if not exists erased_subscriptions_erased_at on erased_subscriptions (erased_at desc);

/*
  RLS on, with NO policy for anon or authenticated.

  These rows belong to no workspace by construction, so there is no tenant who
  could legitimately be shown them — and a row with no owner and no policy is
  reachable only by the service role, which is what we want. Finance and support
  read it out of band.

  Enabling RLS with no policy is deny-all, which is the correct default here and
  is worth stating explicitly rather than leaving to the reader to infer from
  the absence of a `create policy`.
*/
alter table erased_subscriptions enable row level security;

revoke all on table erased_subscriptions from public, anon, authenticated;
grant select, insert on table erased_subscriptions to service_role;

comment on table erased_subscriptions is
  'Subscription records retained after workspace erasure, for tax and dispute '
  'purposes. No org_id, no user identity — the retention obligation is over the '
  'financial fact, not over who transacted. See lib/erasure.ts.';
