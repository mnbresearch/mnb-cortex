/*
  2026_zzzz_x_model_router.sql — MODEL ROUTER.

  organizations.ai_routing   the workspace's routing mode (lib/ai/routing.ts):
                             auto | speed | frontier. Read by loadOrgAiKeys and
                             used by BOTH providerChain (who answers) and
                             firstServingProvider (who pays).
  agent_task_steps.served_by which provider answered each agent step, shown as
                             "answered by" in the task timeline.

  The runner probes for served_by before writing it, so an unmigrated database
  keeps working. Idempotent, additive.
  Also shipped as supabase/RUN-2026-11-20-model-router.sql.
*/

alter table organizations add column if not exists ai_routing text not null default 'auto';
do $$ begin
  alter table organizations add constraint organizations_ai_routing_check check (ai_routing in ('auto', 'speed', 'frontier'));
exception when duplicate_object then null; end $$;

alter table agent_task_steps add column if not exists served_by text;
