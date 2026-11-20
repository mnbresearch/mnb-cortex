import { NextResponse } from "next/server";
import { cronAuthorised } from "@/lib/cron-auth";
import { sweep, agentTablesReady } from "@/lib/agents/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/*
  GET /api/cron/agents — the Agent Workspace's background runner.

  Starts any scheduled agent tasks that are due, then advances background
  tasks (plans with background running) whose lease has lapsed, four at a
  time, within a 280-second budget. Triggered every 5 minutes by
  .github/workflows/agents.yml and daily by vercel.json as a backstop.

  Idempotent and safe to overlap with itself and with open Workspace tabs:
  every task is claimed with a lease before any step runs, and every schedule
  is claimed with a conditional update before a task is created for it.
*/
export async function GET(req: Request) {
  if (!cronAuthorised(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!(await agentTablesReady())) return NextResponse.json({ ok: true, skipped: "agent tables not migrated" });
  const out = await sweep(280_000);
  return NextResponse.json({ ok: true, ...out });
}
