import { Card } from "@/components/ui/card";
import { DeleteButton } from "@/components/forms";
import { ExportButton } from "@/components/export-button";
import { mdToHtml } from "@/lib/utils";

/*
  SAVED AI OUTPUT YOU CAN ACTUALLY READ BACK.

  "Save to workspace" on the AI panel persists the full analysis — into
  strategy_docs.content as `{ text }`, documents.summary, meetings.summary or
  market_reports.recommendation depending on the mode. Every one of those four
  pages then listed the rows in a DataTable showing a title, a type and a date.

  No detail view. No expansion. The text column was not among the exported
  columns either. So on all four pages, the analysis the customer deliberately
  chose to keep became unreachable through the product the instant they saved
  it — and the button that did this was labelled "Save to workspace", which is
  the one thing it did not accomplish.

  A server component with <details> is the whole fix: no client JavaScript, the
  text renders through the same escaping markdown helper the AI panel already
  uses, and each row stays deletable and exportable.
*/

type Row = Record<string, any> & { id: string; created_at?: string | null };

/** The saved text, wherever this table happens to keep it. */
function textOf(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v?.text === "string") return v.text;      // strategy_docs.content
  if (typeof v?.body === "string") return v.body;
  try { return JSON.stringify(v, null, 2); } catch { return ""; }
}

export function SavedAnalyses({
  rows, live, table, path,
  title = "Saved analyses",
  titleKey = "question",
  metaKey = "framework",
  textKey = "content",
  emptyHint = "Run an analysis above and choose “Save to workspace” — it will be here, in full, whenever you come back.",
}: {
  rows: Row[]; live: boolean; table: string; path: string;
  title?: string; titleKey?: string; metaKey?: string; textKey?: string; emptyHint?: string;
}) {
  // The export carries the text itself. Exporting a list of titles was the same
  // omission as the missing detail view, in a different place.
  const exportRows = rows.map((r) => ({
    title: String(r[titleKey] || "Untitled"),
    type: String(r[metaKey] || ""),
    saved: String(r.created_at || "").slice(0, 10),
    content: textOf(r[textKey]),
  }));

  return (
    <Card>
      <div className="flex items-center justify-between p-5 pb-3">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">
            {live ? `${rows.length} saved in your workspace — open one to read it in full` : "Sign in to save and revisit these"}
          </p>
        </div>
        <ExportButton rows={exportRows} filename={`${table}.csv`} columns={["title", "type", "saved", "content"]} />
      </div>

      <div className="px-5 pb-5">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing saved yet. {emptyHint}</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const body = textOf(r[textKey]);
              const meta = String(r[metaKey] || "");
              return (
                <li key={r.id} className="rounded-lg border">
                  <details className="group">
                    <summary className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm hover:bg-accent/40">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{String(r[titleKey] || "Untitled")}</span>
                        <span className="text-xs text-muted-foreground">
                          {meta}{meta && r.created_at ? " · " : ""}{r.created_at ? `saved ${String(r.created_at).slice(0, 10)}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground group-open:hidden">Read →</span>
                      <span className="hidden shrink-0 text-xs text-muted-foreground group-open:inline">Close</span>
                    </summary>
                    <div className="border-t px-4 py-3">
                      {body ? (
                        <div className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(body) }} />
                      ) : (
                        /* Honest about the one case this cannot rescue: rows
                           saved with no text to begin with. */
                        <p className="text-sm text-muted-foreground">
                          This was saved without any text, so there is nothing to show. Re-run it above to save a full copy.
                        </p>
                      )}
                      {live && (
                        <div className="mt-3 flex justify-end">
                          <DeleteButton table={table} id={r.id} path={path} />
                        </div>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
