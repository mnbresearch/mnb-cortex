/* ===========================================================================
   THE HIGHEST-INTENT DATA IN THE FUNNEL WAS BEING THROWN AWAY.

   The Business Health Check asks six questions, computes a score out of 100,
   names the specific weak areas, and takes the visitor's name, work email,
   phone and business name. All of that is assembled into a `note` string by
   health-check-client.tsx and POSTed to /api/inquiry.

   The `leads` table is (id, name, email, phone, plan, source, created_at).

   So the score, the band, the weak areas and the business name were dropped on
   the floor. They survived in exactly one place — the prose of the notification
   email sent to the operator — which cannot be queried, segmented, sorted or
   re-read six weeks later when someone finally follows up.

   The consequence in practice: every person who completes the check is a warm,
   self-qualified lead who has just told us precisely which part of their
   business is weakest, and the CRM row records only that somebody called
   Rakesh once visited. A follow-up call cannot open on their actual problem
   because nothing remembers what it was.

   Three columns. `company` and `note` because they were already being sent and
   discarded; `score` as its own integer because "everyone below 40" is the
   segment worth calling first, and you cannot ORDER BY a sentence.

   Safe to run, and safe to run twice.
   =========================================================================== */

alter table leads add column if not exists company text;
alter table leads add column if not exists note    text;
alter table leads add column if not exists score   int;

/*
  A score is 0-100 or absent. Constrained because this feeds a "call the
  at-risk ones first" sort, and a stray 10000 from a future caller would put
  a healthy business at the top of the list permanently.
*/
do $$
begin
  alter table leads add constraint leads_score_range check (score is null or (score >= 0 and score <= 100));
exception when duplicate_object then null;
end $$;

/* The operator's working query is "worst first, newest first". */
create index if not exists idx_leads_score_created on leads(score, created_at desc);

/* ---------------------------------------------------------------- verify ---
   Expect three rows.
   -------------------------------------------------------------------------- */
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'leads'
   and column_name in ('company', 'note', 'score')
 order by column_name;
