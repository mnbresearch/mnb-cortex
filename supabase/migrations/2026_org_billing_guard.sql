/*
  Stop a workspace owner from granting themselves unlimited credits.

  THE HOLE.

  `2026_tenancy.sql` grants UPDATE on `organizations` to anyone with rank >= 4:

      create policy "member update org" on organizations for update
        using (user_org_rank(id) >= 4) with check (user_org_rank(id) >= 4);

  That is correct as far as it goes — an admin should be able to rename their
  workspace. But RLS is ROW-level. It says WHICH ROWS you may update, never
  WHICH COLUMNS. There is no column-level GRANT on this table and there was no
  trigger, so the `authenticated` role held UPDATE on every column of any row it
  could see.

  Every signup becomes the owner of their own workspace (lib/workspace.ts:56,
  role 'owner' = rank 5). So any customer, from their browser console, with
  nothing but the public anon key and their own valid session:

      PATCH /rest/v1/organizations?id=eq.<their-own-org>
      { "credits_allowance": -1, "plan": "enterprise",
        "subscription_status": "active", "subscription_ends_at": "2099-01-01" }

  `credits_allowance = -1` is the one that matters. lib/credits.ts:134:

      if (superAdmin || allowance < 0)
        return { ok: true, enforced: false, cost, balance: -1 };

  That is the single choke point for the entire product. Every AI action — chat,
  deep dive, reports, image agents, Veo video — returns ok and unmetered, free,
  forever. At the pricing model's own figure of ~₹77 per Veo clip, this is
  unbounded cost of goods on a self-serve account. The plan and subscription
  columns additionally defeat the paywall in requireWorkspace()/isLapsed().

  This is not cross-tenant: user_org_rank() is correctly scoped to auth.uid(),
  so you can only rewrite an org you already administer. It is a complete
  billing and cost-control bypass, which is worse commercially than it sounds.

  THE FIX, AND WHY IT IS A TRIGGER RATHER THAN COLUMN GRANTS.

  The textbook answer is `revoke update on organizations from authenticated`
  followed by `grant update (name, industry, ...)`. That works, but it FAILS
  CLOSED IN THE WRONG DIRECTION: the day someone adds a `timezone` column to
  this table, it is not in the grant list, and saving workspace settings starts
  throwing a permission error in production for a reason nobody will connect to
  a migration written months earlier.

  A trigger inverts that. It names the columns that are DANGEROUS, and anything
  new is allowed by default. Adding a column can now cause a security gap
  instead of an outage — so the accompanying test (scripts/test-billing-guard)
  asserts this list still covers every billing column the application reads.

  WHO IS ALLOWED THROUGH.

  Keyed on `current_user`, not auth.role(). PostgREST does `SET LOCAL ROLE` per
  request, so a request made with the anon key runs as `anon` and one carrying a
  user's JWT runs as `authenticated`. A request made with the service-role key
  runs as `service_role`, and psql/the SQL editor run as `postgres` or
  `supabase_admin`. Blocking exactly the two browser-reachable roles leaves the
  webhook, settle, superadmin and charge_credits paths — all service-role —
  untouched, and leaves migrations able to backfill.

  Verified before writing: the only two places the app updates this table with
  the USER's client are api/workspace/industry (industry) and
  actions.ts:updateOrgProfile (name, industry, annual_revenue_cr, currency,
  accent, logo_url). Neither touches a protected column, so nothing breaks.
*/

create or replace function cortex_guard_org_billing()
returns trigger
language plpgsql
/*
  SECURITY INVOKER (the default) — deliberately, and this was got wrong once.

  Written first as SECURITY DEFINER out of habit. That silently disables the
  whole guard: inside a definer function `current_user` becomes the function's
  OWNER (postgres), so the `not in ('authenticated','anon')` test is true for
  everybody and the trigger returns NEW without checking anything. The
  migration looked correct and blocked nothing; the test caught it by actually
  performing the attack.

  `session_user` is not the answer either — PostgREST connects as `authenticator`
  and does SET LOCAL ROLE, which moves current_user but not session_user.

  So: invoker rights, and read current_user. This function only inspects OLD and
  NEW and raises. It needs no privileges of its own.
*/
set search_path = public
as $$
declare
  -- Every column that decides what the customer is entitled to or has paid for.
  protected constant text[] := array[
    'credits',              -- the balance itself
    'credits_allowance',    -- -1 here disables metering entirely
    'credits_reset_at',     -- moving this backwards re-triggers the monthly top-up
    'plan',
    'subscription_status',
    'subscription_ends_at',
    'subscription_cycle',
    'subscription_ref',
    'trial_ends_at',
    'autorenew_status',
    'autorenew_next'
  ];
  col       text;
  old_json  jsonb := to_jsonb(OLD);
  new_json  jsonb := to_jsonb(NEW);
begin
  -- service_role, postgres, supabase_admin and the migration runner pass freely.
  if current_user not in ('authenticated', 'anon') then
    return NEW;
  end if;

  foreach col in array protected loop
    /*
      Compared through jsonb rather than named fields on purpose. A column in
      the list above that does not exist yet on this database is simply absent
      from both objects and compares equal, so this migration is safe to apply
      regardless of the order the other migrations ran in. `is distinct from`
      is the null-safe comparison; `<>` would let a NULL -> value change slip
      through silently, which is exactly how credits_allowance starts out.
    */
    if (old_json -> col) is distinct from (new_json -> col) then
      raise exception
        'column "%" on organizations is billing-controlled and cannot be changed by role "%"',
        col, current_user
        using errcode = '42501',   -- insufficient_privilege
              hint = 'Credits, plan and subscription state are written only by the payment webhook and platform admins.';
    end if;
  end loop;

  return NEW;
end;
$$;

revoke all on function cortex_guard_org_billing() from public, anon, authenticated;

drop trigger if exists cortex_org_billing_guard on organizations;
create trigger cortex_org_billing_guard
  before update on organizations
  for each row
  execute function cortex_guard_org_billing();
