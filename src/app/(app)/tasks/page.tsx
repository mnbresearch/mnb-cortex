import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { ActionBoard } from "@/components/action-board";
import { listTasks } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function Tasks() {
  // Fetched on the server so the board is populated in the first paint rather
  // than flashing empty — and, more to the point, so it is the same board on
  // every device. It used to live in localStorage.
  const initial = await listTasks();

  return (
    <>
      <Topbar title="Action Board" subtitle="Turn advice into things that actually get done" />
      <PageShell>
        <ActionBoard initial={initial} />
      </PageShell>
    </>
  );
}
