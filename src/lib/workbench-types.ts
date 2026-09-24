/**
 * The shapes the workbench stores, and nothing else.
 *
 * Separate from lib/workbench.ts for the same reason lib/seed-types.ts is
 * separate from lib/workspace-seed.ts: the reader is a server module that
 * opens a Supabase client and carries `import "server-only"`, while the
 * consumers are `"use client"` components that need the types to declare
 * their props. A types-only module with no imports of its own cannot violate
 * the client/server boundary in either direction, so scripts/test-boundaries
 * has nothing to reason about.
 *
 * WORKBENCH_KINDS lives here rather than in workbench.ts because the server
 * action validates against it and the client passes it — both sides need the
 * same list, and a list that exists twice is a list that will disagree.
 */

/** The kinds this layer owns inside `strategy_docs.framework`. */
export const WORKBENCH_KINDS = ["decision", "captable", "nps"] as const;
export type WorkbenchKind = (typeof WORKBENCH_KINDS)[number];

export type WorkbenchEntry<T = any> = {
  id: string;
  title: string;
  data: T;
  createdAt: string;
};

/** /decisions — one logged decision, its reasoning, and any AI critique. */
export type DecisionData = {
  rationale: string;
  status: "considering" | "decided" | "revisit";
  /**
   * The "Devil's advocate" output.
   *
   * Persisted because it costs 14 credits and was previously discarded on
   * refresh — the workspace paid for an answer it could not keep.
   */
  critique?: string;
};

/** /captable — the whole waterfall, so a model survives the browser. */
export type CapTableData = {
  founderShares: number;
  /* Field names mirror components/cap-table.tsx exactly — `preMoney`, not
     `pre` — so a saved model round-trips without a translation layer that
     could silently drop a column. */
  rounds: Array<{ id: string; name: string; raise: number; preMoney: number; esop: number }>;
};

/** /nps — one reading. A series of these is what makes the trend claim true. */
export type NpsData = {
  promoters: number;
  passives: number;
  detractors: number;
  themes: string;
  /**
   * The score as computed at the time of saving.
   *
   * Stored rather than recomputed on read, so that a later change to the
   * formula cannot silently rewrite what the business recorded last quarter.
   */
  score: number;
  analysis?: string;
};
