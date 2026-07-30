"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEPARTMENTS, agentsForDepartment, type Agent } from "@/lib/agents/catalog";
import { Search, Plus, Minus, Maximize2, BrainCircuit } from "lucide-react";

type Node = { id: string; kind: "brain" | "dept" | "agent"; label: string; x: number; y: number; agent?: Agent; dept?: string };
type Edge = { x1: number; y1: number; x2: number; y2: number; strong?: boolean };

const CX = 600, CY = 400, R_DEPT = 210;
const FIT = { tx: 240, ty: 160, s: 0.6 };

export function WorkforceGraph() {
  const [activated, setActivated] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [view, setView] = useState(FIT);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { fetch("/api/agents").then((r) => r.json()).then((j) => setActivated(new Set(j.activated || []))).catch(() => {}); }, []);

  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [{ id: "brain", kind: "brain", label: "Second Brain", x: CX, y: CY }];
    const edges: Edge[] = [];
    DEPARTMENTS.forEach((d, i) => {
      const ang = (i / DEPARTMENTS.length) * Math.PI * 2 - Math.PI / 2;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      const px = CX + dx * R_DEPT, py = CY + dy * R_DEPT;
      nodes.push({ id: d.id, kind: "dept", label: d.name, x: px, y: py, dept: d.id });
      edges.push({ x1: CX, y1: CY, x2: px, y2: py, strong: true });
      const agents = agentsForDepartment(d.id);
      const perp = { x: -dy, y: dx };
      agents.forEach((a, j) => {
        const row = Math.floor(j / 2), col = j % 2 === 0 ? -1 : 1;
        const rad = 120 + row * 58;
        const ox = px + dx * rad + perp.x * col * 78;
        const oy = py + dy * rad + perp.y * col * 78;
        nodes.push({ id: a.id, kind: "agent", label: a.name, x: ox, y: oy, agent: a, dept: d.id });
        edges.push({ x1: px, y1: py, x2: ox, y2: oy });
      });
    });
    return { nodes, edges };
  }, []);

  const ql = q.trim().toLowerCase();
  const match = (n: Node) => !ql || n.label.toLowerCase().includes(ql) || (n.dept || "").includes(ql);

  function factor() { const r = svgRef.current?.getBoundingClientRect(); return r ? 1200 / r.width : 1; }
  function zoomTo(s2: number) {
    setView((v) => { const s = Math.max(0.3, Math.min(2.6, s2)); return { s, tx: v.tx + CX * (v.s - s), ty: v.ty + CY * (v.s - s) }; });
  }
  function onWheel(e: React.WheelEvent) { e.preventDefault(); zoomTo(view.s * (1 - e.deltaY * 0.0012)); }
  function onDown(e: React.PointerEvent) { drag.current = { x: e.clientX, y: e.clientY }; (e.target as Element).setPointerCapture?.(e.pointerId); }
  function onMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const f = factor();
    setView((v) => ({ ...v, tx: v.tx + (e.clientX - drag.current!.x) * f, ty: v.ty + (e.clientY - drag.current!.y) * f }));
    drag.current = { x: e.clientX, y: e.clientY };
  }
  function onUp() { drag.current = null; }
  function openNode(n: Node) {
    if (n.kind === "brain") { window.location.href = "/memory"; return; }
    if (n.kind === "agent") { window.location.href = `/agents?run=${encodeURIComponent(n.id)}`; return; }
    if (n.kind === "dept") { window.location.href = `/agents?tab=${encodeURIComponent(n.id)}`; }
  }

  return (
    <div className="rounded-2xl border bg-card overflow-hidden relative" style={{ height: 560 }}>
      {/* Controls */}
      <div className="absolute z-10 top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border bg-background/90 px-2 h-9 backdrop-blur">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agents…" className="bg-transparent text-sm outline-none w-40" />
        </div>
        <div className="pointer-events-auto flex items-center gap-1">
          <button onClick={() => zoomTo(view.s - 0.25)} className="h-9 w-9 grid place-items-center rounded-lg border bg-background/90 backdrop-blur hover:bg-accent"><Minus className="h-4 w-4" /></button>
          <div className="h-9 px-2 grid place-items-center rounded-lg border bg-background/90 backdrop-blur text-xs tabular-nums">{Math.round(view.s * 100)}%</div>
          <button onClick={() => zoomTo(view.s + 0.25)} className="h-9 w-9 grid place-items-center rounded-lg border bg-background/90 backdrop-blur hover:bg-accent"><Plus className="h-4 w-4" /></button>
          <button onClick={() => setView(FIT)} className="h-9 px-2 grid place-items-center rounded-lg border bg-background/90 backdrop-blur hover:bg-accent inline-flex gap-1 text-xs"><Maximize2 className="h-3.5 w-3.5" /> Fit</button>
        </div>
      </div>

      <svg ref={svgRef} viewBox="0 0 1200 800" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"
        onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
        style={{ cursor: drag.current ? "grabbing" : "grab", touchAction: "none", background: "radial-gradient(circle at 50% 45%, hsl(var(--primary)/0.06), transparent 60%)" }}>
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.s})`}>
          {edges.map((e, i) => (
            <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
              stroke="hsl(var(--border))" strokeWidth={e.strong ? 2 : 1} opacity={e.strong ? 0.9 : 0.5} />
          ))}
          {nodes.map((n) => {
            const dim = ql ? !match(n) : false;
            if (n.kind === "brain") {
              return (
                <g key={n.id} onClick={(ev) => { ev.stopPropagation(); openNode(n); }} style={{ cursor: "pointer" }} opacity={dim ? 0.25 : 1}>
                  <circle cx={n.x} cy={n.y} r={54} fill="hsl(var(--primary))" />
                  <circle cx={n.x} cy={n.y} r={54} fill="none" stroke="hsl(var(--primary))" strokeWidth={10} opacity={0.25} />
                  <text x={n.x} y={n.y - 2} textAnchor="middle" fontSize={13} fontWeight={700} fill="hsl(var(--primary-foreground))">Second</text>
                  <text x={n.x} y={n.y + 14} textAnchor="middle" fontSize={13} fontWeight={700} fill="hsl(var(--primary-foreground))">Brain</text>
                </g>
              );
            }
            if (n.kind === "dept") {
              return (
                <g key={n.id} onClick={(ev) => { ev.stopPropagation(); openNode(n); }} style={{ cursor: "pointer" }} opacity={dim ? 0.25 : 1}>
                  <circle cx={n.x} cy={n.y} r={30} fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth={2.5} />
                  <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="hsl(var(--foreground))">{n.label}</text>
                </g>
              );
            }
            const on = activated.has(n.id);
            return (
              <g key={n.id} onClick={(ev) => { ev.stopPropagation(); openNode(n); }} style={{ cursor: "pointer" }} opacity={dim ? 0.2 : 1}>
                <circle cx={n.x} cy={n.y} r={7} fill={on ? "hsl(var(--primary))" : "hsl(var(--card))"} stroke={on ? "hsl(var(--primary))" : "hsl(var(--border))"} strokeWidth={2} />
                {on && <circle cx={n.x} cy={n.y} r={12} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} opacity={0.4} />}
                <text x={n.x + 11} y={n.y + 4} fontSize={11} fill="hsl(var(--muted-foreground))">{n.label.length > 22 ? n.label.slice(0, 22) + "…" : n.label}</text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute bottom-3 left-3 text-xs text-muted-foreground pointer-events-none flex items-center gap-3">
        <span className="inline-flex items-center gap-1"><BrainCircuit className="h-3.5 w-3.5 text-primary" /> Drag to pan · scroll to zoom · tap a node to run it</span>
      </div>
    </div>
  );
}
