-- Rollback 2026_zzzz_r_agent_workspace.sql
drop table if exists agent_schedules cascade;
drop table if exists agent_task_steps cascade;
drop table if exists agent_tasks cascade;
