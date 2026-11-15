/*
  Rollback for 2026_zzzz_q_enterprise_hud.sql
  Reverts enterprise_audit_snapshots and digital_twin_scenarios tables.
*/

drop table if exists enterprise_audit_snapshots cascade;
drop table if exists digital_twin_scenarios cascade;
