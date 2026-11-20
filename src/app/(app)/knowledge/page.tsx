import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { CompanyKnowledge } from "@/components/company-knowledge";

export const dynamic = "force-dynamic";

/*
  /knowledge — Company Knowledge. Connect the company's mail, chats, drives,
  documents and systems; search them; see exactly what the agents can see.
  Everything is read-only, and every agent answer drawn from it names its
  source (lib/knowledge/core.ts citationFor).
*/
export default function KnowledgePage({ searchParams }: { searchParams?: { connected?: string; error?: string } }) {
  const notice = searchParams?.connected === "microsoft365" ? "Microsoft 365 connected. The first read is done; new mail, chats and files are read every 6 hours."
    : searchParams?.connected === "google_workspace" ? "Google Workspace connected. The first read is done; new mail and files are read every 6 hours." : undefined;
  return (
    <>
      <Topbar title="Company Knowledge" subtitle="Your company's mail, chats, documents and systems — searchable by your agents, cited in every answer." />
      <PageShell>
        <CompanyKnowledge notice={notice} error={searchParams?.error ? String(searchParams.error).slice(0, 300) : undefined} />
      </PageShell>
    </>
  );
}
