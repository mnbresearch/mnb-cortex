-- Rollback 2026_zzzz_x_model_router.sql
alter table organizations drop constraint if exists organizations_ai_routing_check;
alter table organizations drop column if exists ai_routing;
alter table agent_task_steps drop column if exists served_by;
