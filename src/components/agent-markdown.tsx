import { Fragment } from "react";

/*
  A small, safe renderer for agent answers.

  Agents write light Markdown: headings, bullet and numbered lists, **bold**,
  and the occasional pipe table. Rendering it as React elements (never as
  HTML) means a customer or supplier name that contains markup is shown as
  text — the same reason lib/agents/runtime.ts escapes template output.
*/

function inline(text: string, key: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4
      ? <strong key={`${key}-${i}`} className="font-semibold">{p.slice(2, -2)}</strong>
      : <Fragment key={`${key}-${i}`}>{p}</Fragment>);
}

export function AgentMarkdown({ text, className = "" }: { text: string; className?: string }) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { i++; continue; }

    const h = t.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      out.push(<p key={i} className={lvl <= 2 ? "text-base font-semibold mt-3" : "text-sm font-semibold mt-2"}>{inline(h[2], `h${i}`)}</p>);
      i++; continue;
    }

    if (t.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      if (rows.length) {
        out.push(
          <div key={`t${i}`} className="overflow-x-auto my-2">
            <table className="text-xs border-collapse min-w-full">
              <thead><tr>{rows[0].map((c, j) => <th key={j} className="border px-2 py-1 text-left font-semibold bg-muted/50">{inline(c, `th${i}${j}`)}</th>)}</tr></thead>
              <tbody>{rows.slice(1).map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j} className="border px-2 py-1 align-top">{inline(c, `td${i}${ri}${j}`)}</td>)}</tr>)}</tbody>
            </table>
          </div>);
      }
      continue;
    }

    if (/^([-*•])\s+/.test(t) || /^\d+[.)]\s+/.test(t)) {
      const ordered = /^\d+[.)]\s+/.test(t);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\s*\d+[.)]\s+/.test(lines[i]) : /^\s*[-*•]\s+/.test(lines[i]))) {
        items.push(lines[i].trim().replace(ordered ? /^\d+[.)]\s+/ : /^[-*•]\s+/, ""));
        i++;
      }
      const L = ordered ? "ol" : "ul";
      out.push(<L key={`l${i}`} className={`${ordered ? "list-decimal" : "list-disc"} pl-5 space-y-1 my-1`}>{items.map((it, j) => <li key={j}>{inline(it, `li${i}${j}`)}</li>)}</L>);
      continue;
    }

    out.push(<p key={i} className="my-1.5">{inline(t, `p${i}`)}</p>);
    i++;
  }
  return <div className={`text-sm leading-relaxed ${className}`}>{out}</div>;
}
