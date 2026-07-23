import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { ActionBoard } from "@/components/action-board";

export const dynamic = "force-dynamic";

export default function Tasks() {
  return (
    <>
      <Topbar title="Action Board" subtitle="Turn advice into things that actually get done" />
      <PageShell>
        <ActionBoard />
      </PageShell>
    </>
  );
}
