/*
  DELIVERABLES — the pure part. An agent's result is markdown; Word, PowerPoint
  and Excel each need structure. parseBlocks() turns the markdown into a small
  set of blocks every builder understands (headings, paragraphs, bullet lists,
  tables), and inlineRuns() splits **bold** spans. Anything unrecognised
  becomes a paragraph, so no text is ever dropped.

  No imports: scripts/test-deliverables.mjs loads this file directly.
*/

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; ordered: boolean; items: string[] }
  | { type: "table"; header: string[]; rows: string[][] };

const isTableLine = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isDivider = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cellsOf = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function parseBlocks(md: string): Block[] {
  const lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ type: "paragraph", text: para.join(" ").trim() }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flush(); out.push({ type: "heading", level: Math.min(3, h[1].length) as 1 | 2 | 3, text: h[2].trim() }); continue; }
    if (isTableLine(l) && i + 1 < lines.length && isDivider(lines[i + 1])) {
      flush();
      const header = cellsOf(l); const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableLine(lines[i])) { rows.push(cellsOf(lines[i])); i++; }
      i--;
      out.push({ type: "table", header, rows });
      continue;
    }
    const b = l.match(/^\s*([-*•]|\d+[.)])\s+(.*)$/);
    if (b) {
      flush();
      const ordered = /\d/.test(b[1]);
      const items = [b[2].trim()];
      while (i + 1 < lines.length) {
        const n = lines[i + 1].match(/^\s*([-*•]|\d+[.)])\s+(.*)$/);
        if (!n || /\d/.test(n[1]) !== ordered) break;
        items.push(n[2].trim()); i++;
      }
      out.push({ type: "bullets", ordered, items });
      continue;
    }
    if (!l.trim()) { flush(); continue; }
    para.push(l.trim());
  }
  flush();
  return out;
}

/** "**bold** rest" → [{text:"bold",bold:true},{text:" rest"}]; other markdown marks are stripped. */
export function inlineRuns(s: string): { text: string; bold: boolean }[] {
  const clean = String(s || "").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)").replace(/`([^`]+)`/g, "$1").replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1$2");
  const out: { text: string; bold: boolean }[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    if (m.index > last) out.push({ text: clean.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < clean.length) out.push({ text: clean.slice(last), bold: false });
  return out.filter((r) => r.text.length);
}
export const plain = (s: string) => inlineRuns(s).map((r) => r.text).join("");

/** Slides: one per heading-led section; long sections are split so no slide overflows. */
export function toSlides(blocks: Block[], maxLines = 9): { title: string; lines: string[]; table?: { header: string[]; rows: string[][] } }[] {
  const slides: { title: string; lines: string[]; table?: { header: string[]; rows: string[][] } }[] = [];
  let cur = { title: "Summary", lines: [] as string[] };
  const push = () => { if (cur.lines.length) slides.push(cur); };
  for (const b of blocks) {
    if (b.type === "heading") { push(); cur = { title: plain(b.text), lines: [] }; continue; }
    if (b.type === "table") { push(); slides.push({ title: cur.title, lines: [], table: { header: b.header.map(plain), rows: b.rows.slice(0, 12).map((r) => r.map(plain)) } }); cur = { title: cur.title, lines: [] }; continue; }
    const add = b.type === "bullets" ? b.items.map(plain) : [plain(b.text)];
    for (const line of add) {
      if (cur.lines.length >= maxLines) { push(); cur = { title: `${cur.title} (cont.)`.replace(/( \(cont\.\))+$/, " (cont.)"), lines: [] }; }
      cur.lines.push(line.length > 220 ? line.slice(0, 217) + "…" : line);
    }
  }
  push();
  return slides;
}

export type VerificationLike = { status: string; checked: number; supported: number; unsupported: { figure?: string; text?: string }[]; note?: string } | null;

/** The Veritas v1 line every deliverable and share page carries — never reworded into "verified". */
export function veritasLine(v: VerificationLike): string {
  if (!v) return "Veritas v1: not run on this result.";
  if (v.status === "no_figures") return "Veritas v1: no rupee figures to check.";
  const bad = (v.unsupported || []).map((u) => u.figure || u.text).filter(Boolean);
  return `Veritas v1: ${v.checked} rupee figure${v.checked === 1 ? "" : "s"} checked, ${v.supported} supported${bad.length ? `; not supported by the data read: ${bad.join(", ")}` : ""}.`;
}
