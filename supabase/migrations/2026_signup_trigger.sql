-- ============================================================
-- MNB CORTEX — stop the signup trigger creating a Cortex workspace
-- for users of the OTHER products on this Supabase project.
--
-- ⚠️  DO NOT RUN THIS BLIND. Read the section below first.
-- ============================================================
--
-- WHY
-- The original handle_new_user() fires on every INSERT into auth.users and
-- creates a Cortex organization + owner membership. This Supabase project
-- (krklgsmeamnxeawdlmka) also backs Toppers Hub Academy, so every Toppers Hub
-- signup silently produces an empty "My Company" Cortex workspace.
--
-- Cortex no longer needs the trigger to create workspaces. ensureWorkspace()
-- in src/lib/workspace.ts runs after sign-in on Cortex only (via
-- /api/workspace/bootstrap and /auth/callback), is idempotent, reuses an
-- existing membership, names the workspace from what the user typed, and
-- starts the trial + grants trial credits. The trigger is now redundant here.
--
-- ------------------------------------------------------------
-- STEP 1 — Check what the LIVE function actually does.
--
-- This file replaces handle_new_user() wholesale. If Toppers Hub has since
-- added its own logic to that function (a student profile row, a role, a
-- default class, anything), replacing it will BREAK THEIR SIGNUP.
--
-- Run this first and read the output:
--
--     select prosrc from pg_proc where proname = 'handle_new_user';
--
-- If the body is exactly the profile + organizations + memberships insert
-- from supabase/rls.sql, continue to STEP 2.
-- If it contains anything else, merge that logic into the body below by hand
-- instead of running this as-is.
--
-- ------------------------------------------------------------
-- STEP 2 — Prerequisite.
--
-- SUPABASE_SERVICE_ROLE_KEY must be set in the Cortex environment.
-- ensureWorkspace() returns early without it, and once this trigger no longer
-- creates workspaces there is no fallback: new users would land in an empty
-- app. Confirm it's present in Vercel before running this.
-- ------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Profile only. Workspace creation belongs to each product's own app code.
  insert into public.profiles (id, full_name)
       values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;

-- ------------------------------------------------------------
-- ROLLBACK — restores the previous behaviour if anything goes wrong.
--
-- create or replace function public.handle_new_user()
-- returns trigger language plpgsql security definer set search_path = public as $$
-- declare new_org uuid;
-- begin
--   insert into public.profiles (id, full_name)
--     values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
--   insert into public.organizations (name, industry, annual_revenue_cr)
--     values ('My Company', 'manufacturing', 25) returning id into new_org;
--   insert into public.memberships (org_id, user_id, role)
--     values (new_org, new.id, 'owner');
--   return new;
-- end $$;
-- ------------------------------------------------------------
