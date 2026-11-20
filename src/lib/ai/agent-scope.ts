import { AsyncLocalStorage } from "node:async_hooks";

/*
  AGENT SCOPE — how an agent step runs through the ONE model loop.

  The Agent Workspace does not have its own model loop. Every agent step calls
  runCortex(..., { tools: true }) exactly like Ask Cortex does, so provider
  failover, BYO keys, DLP tokenisation, the injection guard and the tool-round
  limits all apply unchanged. What an agent needs on top is carried here, in
  request-scoped storage, instead of being threaded through eight signatures:

    orgId / userId  whose workspace the step is for. Background steps have no
                    cookie session, so the session cannot be the source; the
                    task row is. Set only by lib/agents/runtime.ts, from a task
                    the server loaded — never from model output.
    brief           the agent's role, appended to the system prompt.
    declarations    the tools THIS agent may call (a subset plus extras).
    run             dispatches a call the model made. Unknown names are refused
                    in cortex.ts before this is reached.
    calls           an append-only trace of what the step looked up, for the
                    task timeline and for Veritas v1 to check figures against.
    serviceDb       tools read through the service client (still filtered by
                    org_id on every query — scripts/test-ai-tools.mjs pins it)
                    because a background step has no cookie to build an RLS
                    client from.

  Outside an agent step currentAgentScope() is null and everything behaves
  exactly as it did before this file existed.
*/

export type AgentToolDecl = { name: string; description: string; parameters: unknown };
export type AgentToolResult = { ok: boolean; rows?: any[]; summary?: string; error?: string };
export type AgentGuard = { tainted: boolean; suspicious: string[] };
export type AgentToolCall = { name: string; args: unknown; ok: boolean; summary: string; rows: number; at: number; sample?: unknown[] };

export type AgentScope = {
  orgId: string;
  userId: string | null;
  brief: string;
  declarations: readonly AgentToolDecl[];
  run: (name: string, args: any, guard: AgentGuard) => Promise<AgentToolResult>;
  calls: AgentToolCall[];
  serviceDb: boolean;
};

const store = new AsyncLocalStorage<AgentScope>();

export function runInAgentScope<T>(scope: AgentScope, fn: () => Promise<T>): Promise<T> {
  return store.run(scope, fn);
}

export function currentAgentScope(): AgentScope | null {
  return store.getStore() ?? null;
}
