import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { ActionBoard } from "@/components/action-board";
import { CommitmentsPanel } from "@/components/commitments-panel";
import { listTasks, listCommitments } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function Tasks() {
  const [initialTasks, initialCommitments] = await Promise.all([
    listTasks(),
    listCommitments(),
  ]);

  return (
    <>
      <Topbar title="Executive Action & Commitments" subtitle="Prioritized P0–P3 triage and automated counterparty follow-up tracking" />
      <PageShell>
        <ActionBoard initial={initialTasks} />
        <CommitmentsPanel initial={initialCommitments} />
      </PageShell>
    </>
  );
}
