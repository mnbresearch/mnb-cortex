import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Playbooks } from "@/components/playbooks";

export const dynamic = "force-dynamic";

export default function PlaybooksPage() {
  return (
    <>
      <Topbar title="AI Playbooks" subtitle="One click for a complete, tailored action plan" />
      <PageShell>
        <Playbooks />
      </PageShell>
    </>
  );
}
