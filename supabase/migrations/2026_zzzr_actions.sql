/*
  CORTEX ACTIONS — THE LEDGER THAT LETS THE PRODUCT DO THINGS.

  ============================================================================
  WHY THIS EXISTS
  ============================================================================

  Everything Cortex does today is analysis. It reads, warns and drafts; it
  closes no loop. The 438 "agents" are prompt templates. /approvals renders
  purchase orders and flips a status string. The one subsystem that acts on
  its own — collections — is deliberately template-driven, and the entire
  security posture of the product rests on one sentence that three separate
  reviews have each verified: EVERY AI TOOL IS READ-ONLY.

  The owner wants Cortex to act: update a due date, mark an invoice paid,
  send the reminder, produce the workbook, on its own when it is sure and with
  a tap when it is not. That is the right ambition and it is the one thing
  that would separate this product. It is also the single most dangerous
  change that can be made to it, because it means that sentence stops being
  true.

  This migration is how it stops being true SAFELY. The model never executes
  anything. It PROPOSES — a typed action from a fixed catalogue, with
  arguments, a rationale and the evidence it looked at — into this ledger. A
  policy the WORKSPACE OWNER controls decides whether that proposal runs by
  itself, waits for a human, or is refused. A deterministic executor, not the
  model, carries it out, records what it did, and keeps what it needs to undo
  it. Every step is a row somebody can read later.

  Autonomy is EARNED PER ACTION, not switched on globally:

    · the default for anything that changes state is "needs approval"
    · the owner may grant "auto" per action class, with caps the SERVER
      enforces — a rupee ceiling, a daily count, "known parties only"
    · anything that leaves the building (a message to a customer) or touches
      money cannot be set to auto without caps; the schema refuses it
    · "blocked" always wins, and the platform kill switch sits above all of it

  ============================================================================
  TWO TABLES
  ============================================================================

  action_proposals  — the ledger. One row per thing Cortex wanted to do, from
                      proposal through decision to execution and, where
                      possible, reversal. Append-mostly; status moves forward.

  action_policies   — the owner's standing instructions, one row per
                      (workspace, action). Absent row = catalogue default.

  Daily usage for caps is COUNTED from action_proposals (status done, today,
  this action) rather than kept in a counter — a counter can drift from the
  ledger; a count over the ledger cannot.

  ============================================================================
  WHO MAY DO WHAT
  ============================================================================

  Members read their own workspace's rows. Nothing else is granted to the
  browser roles: every write goes through the server with the service role,
  after assertRole() — proposing needs analyst, deciding needs admin, editing
  policy needs admin. This mirrors how the rest of the product treats
  consequential writes (see 2026_rls_privilege_fix.sql).

  The idempotency_key is UNIQUE so the same proposal cannot be created twice
  by a retried cron or a double-click, and the executor claims a row with a
  conditional UPDATE … RETURNING, so two workers cannot both run it. PostgREST
  reports a zero-row update as success with no error; the executor checks the
  returned row count, not the absence of an error. That lesson is written into
  this codebase in several places already and applies here with real
  consequences.
*/

create table if not exists action_proposals (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,

  /* what */
  action           text not null,                 -- catalogue key, e.g. 'update_invoice_due_date'
  args             jsonb not null default '{}'::jsonb,
  rationale        text,                          -- why Cortex wants to do this, in words a human reads
  evidence         jsonb not null default '[]'::jsonb,  -- the rows/figures it looked at

  /* where it came from */
  source           text not null check (source in ('chat', 'autopilot', 'workflow', 'user', 'api')),
  proposed_by      uuid,                          -- auth user when a human or their chat proposed it

  /* lifecycle */
  status           text not null default 'proposed'
                   check (status in ('proposed', 'approved', 'rejected', 'executing',
                                     'done', 'failed', 'blocked', 'expired', 'undone')),
  policy_verdict   text check (policy_verdict in ('auto', 'approve', 'blocked')),
  policy_reason    text,
  decided_by       uuid,
  decided_at       timestamptz,
  executed_at      timestamptz,

  /* outcome */
  result           jsonb,
  error            text,
  undo             jsonb,                         -- what the executor needs to reverse it; null = irreversible
  undone_at        timestamptz,
  undone_by        uuid,

  /* safety */
  idempotency_key  text not null unique,
  expires_at       timestamptz not null default (now() + interval '7 days'),
  created_at       timestamptz not null default now()
);

create index if not exists idx_action_proposals_org_status
  on action_proposals(org_id, status, created_at desc);
create index if not exists idx_action_proposals_org_action_done
  on action_proposals(org_id, action, executed_at)
  where status = 'done';

create table if not exists action_policies (
  org_id       uuid not null references organizations(id) on delete cascade,
  action       text not null,
  mode         text not null check (mode in ('approve', 'auto', 'blocked')),
  /*
    caps: { max_amount_inr: number|null, max_per_day: number|null,
            known_parties_only: boolean }
    Enforced by the server at BOTH propose and execute time. Stored here so
    the owner can read back exactly what they granted.
  */
  caps         jsonb not null default '{}'::jsonb,
  updated_by   uuid,
  updated_at   timestamptz not null default now(),
  primary key (org_id, action),
  /*
    THE RULE THE SCHEMA ITSELF ENFORCES: an outbound or money action may not
    be set to auto without a ceiling. The catalogue marks which actions those
    are; the application passes the class in. A check constraint cannot see
    the catalogue, so the application sets `requires_caps` and the constraint
    holds it to its word.
  */
  requires_caps boolean not null default false,
  constraint action_policies_auto_needs_caps check (
    not (mode = 'auto' and requires_caps
         and (coalesce((caps->>'max_per_day')::int, 0) <= 0))
  )
);

alter table action_proposals enable row level security;
alter table action_policies  enable row level security;

/* Members read their own workspace's ledger and rules. */
drop policy if exists "members read proposals" on action_proposals;
create policy "members read proposals" on action_proposals
  for select using (org_id in (select user_org_ids()));

drop policy if exists "members read policies" on action_policies;
create policy "members read policies" on action_policies
  for select using (org_id in (select user_org_ids()));

/*
  No insert/update/delete policies for anon/authenticated — deliberately.
  Writes are service-role only, behind assertRole() in the server actions.
  A ledger that the browser can write to is a ledger that can be forged.
*/
revoke insert, update, delete on action_proposals from anon, authenticated;
revoke insert, update, delete on action_policies  from anon, authenticated;

/*
  TELL POSTGREST THE SCHEMA CHANGED. New tables are invisible to the API
  until its cache reloads; see 2026_zzzq for the day this bit us.
*/
notify pgrst, 'reload schema';

/* ---------------------------------------------------------------- verify ---
   Both true, and the third row empty.
   -------------------------------------------------------------------------- */
select
  exists (select 1 from information_schema.tables where table_name = 'action_proposals') as proposals_table,
  exists (select 1 from information_schema.tables where table_name = 'action_policies')  as policies_table;

/* Anything the browser roles can WRITE here is a defect. Expect zero rows. */
select grantee, table_name, privilege_type
  from information_schema.role_table_grants
 where table_name in ('action_proposals', 'action_policies')
   and grantee in ('anon', 'authenticated')
   and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
