-- Invites expire.
--
-- An invite used to be claimable forever by whoever signed in with a matching
-- address (lib/workspace.ts claimInvites). The code now also requires a
-- CONFIRMED email; this adds the expiry half.
--
-- Idempotent and non-destructive:
--   * the column is added WITHOUT a default first, so Postgres does not evaluate
--     now() + 14 days for every existing row (that would silently extend every
--     old invite by another fortnight);
--   * then the default is set, so new invites get now() + 14 days;
--   * pending invites with no expiry are aged from created_at (the rule the app
--     already applies when expires_at is null), never extended.
-- Nothing is deleted; an expired invite simply stops being claimable and can be
-- re-sent.

alter table public.invites add column if not exists expires_at timestamptz;
alter table public.invites alter column expires_at set default (now() + interval '14 days');

update public.invites
   set expires_at = coalesce(created_at, now()) + interval '14 days'
 where expires_at is null
   and status = 'pending';

-- Verify: the column exists with its default, and no pending invite lacks an expiry.
select
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'invites' and column_name = 'expires_at') as expires_at_default,
  (select count(*) from public.invites where status = 'pending' and expires_at is null)   as pending_without_expiry,
  (select count(*) from public.invites where status = 'pending' and expires_at <= now())  as pending_already_expired;
