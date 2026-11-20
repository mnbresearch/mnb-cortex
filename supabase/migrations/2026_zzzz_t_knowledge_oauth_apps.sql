/*
  2026_zzzz_t_knowledge_oauth_apps.sql — a company's OWN Microsoft / Google app
  for Company Knowledge (optional).

  By default every company connects through Cortex's shared, multi-tenant
  app (MICROSOFT_CLIENT_ID / GOOGLE_CLIENT_ID in Vercel). A company may
  instead register its own app in its own Entra ID tenant or Google Cloud
  organisation and paste its id and secret into Settings → Company Knowledge.
  Why a company would:
    - Google: an INTERNAL app inside the company's own Workspace needs no Google
      verification, so Gmail and Drive work the same day.
    - Microsoft: some tenants only allow apps registered inside the tenant.
    - Either: the company's IT controls and can revoke the app themselves.

  The client secret is AES-256-GCM encrypted (lib/crypto.ts). Nobody reads this
  table through PostgREST at all — not even the workspace's own members; the
  server reads it with the service role after an admin check.

  Idempotent and additive. Also shipped as supabase/RUN-2026-11-20-knowledge-apps.sql.
*/

create table if not exists knowledge_oauth_apps (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  provider      text not null check (provider in ('microsoft365', 'google_workspace')),
  client_id     text not null,
  client_secret text not null,          -- encrypted
  tenant        text,                   -- Microsoft tenant id or domain; null for Google
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, provider)
);

alter table knowledge_oauth_apps enable row level security;
/* No policies: invisible to anon and authenticated. Server-only. */
revoke all on knowledge_oauth_apps from anon, authenticated;
