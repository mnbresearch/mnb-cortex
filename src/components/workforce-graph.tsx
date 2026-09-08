"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEPARTMENTS, agentsForDepartment, type Agent } from "@/lib/agents/catalog";
import { Search, Plus, Minus, Maximize2, BrainCircuit } from "lucide-react";

type Node = { id: string; kind: "brain" | "dept" | "agent"; label: string; x: number; y: number; agent?: Agent; dept?: string };
type Edge = { x1: number; y1: number; x2: number; y2: number; strong?: boolean; dept?: string; agentId?: string };
type View = { tx: number; ty: number; s: number };

const CX = 600, CY = 400, R_DEPT = 210;
const FIT: View = { tx: 240, ty: 160, s: 0.6 };
const clampS = (s: number) => Math.max(0.3, Math.min(2.8, s));

export function WorkforceGraph() {
  const [activated, setActivated] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const [view, setView] = useState<View>(FIT);
  const viewRef = useRef(view); viewRef.current = view;
  const svgRef = useRef<SVGSVGElement>(null);
  const raf = useRef<number | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ dist: number; s: number } | null>(null);
  const dragging = useRef(false);

  /*
    A network of ~130 nodes with a signal travelling down every branch is a lot
    of simultaneous motion, and that is precisely the pattern that triggers
    vestibular symptoms. The pulses are decorative — the graph is fully usable
    without them — so anyone who has asked their system for less motion simply
    does not get them.
  */
  const [animate, setAnimate] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setAnimate(!mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => { fetch("/api/agents").then((r) => r.json()).then((j) => setActivated(new Set(j.activated || []))).catch(() => {}); }, []);

  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [{ id: "brain", kind: "brain", label: "Second Brain", x: CX, y: CY }];
    const edges: Edge[] = [];
    DEPARTMENTS.forEach((d, i) => {
      const ang = (i / DEPARTMENTS.length) * Math.PI * 2 - Math.PI / 2;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      const px = CX + dx * R_DEPT, py = CY + dy * R_DEPT;
      nodes.push({ id: d.id, kind: "dept", label: d.name, x: px, y: py, dept: d.id });
      edges.push({ x1: CX, y1: CY, x2: px, y2: py, strong: true, dept: d.id });
      const agents = agentsForDepartment(d.id);
      const perp = { x: -dy, y: dx };
      agents.forEach((a, j) => {
        const row = Math.floor(j / 2), col = j % 2 === 0 ? -1 : 1;
        const rad = 120 + row * 58;
        const ox = px + dx * rad + perp.x * col * 78;
        const oy = py + dy * rad + perp.y * col * 78;
        nodes.push({ id: a.id, kind: "agent", label: a.name, x: ox, y: oy, agent: a, dept: d.id });
        edges.push({ x1: px, y1: py, x2: ox, y2: oy, dept: d.id, agentId: a.id });
      });
    });
    return { nodes, edges };
  }, []);

  const ql = q.trim().toLowerCase();
  const match = (n: Node) => !ql || n.label.toLowerCase().includes(ql) || (n.dept || "").includes(ql);

  // ---- animation ----
  function animateTo(target: View, ms = 420) {
    if (raf.current) cancelAnimationFrame(raf.current);
    const start = { ...viewRef.current }; const t0 = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms); const e = ease(p);
      setView({ tx: start.tx + (target.tx - start.tx) * e, ty: start.ty + (target.ty - start.ty) * e, s: start.s + (target.s - start.s) * e });
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  function factor() { const r = svgRef.current?.getBoundingClientRect(); return r ? 1200 / r.width : 1; }
  function zoomAroundCenter(s2: number) { const v = viewRef.current; const s = clampS(s2); setView({ s, tx: v.tx + CX * (v.s - s), ty: v.ty + CY * (v.s - s) }); }

  function focusDept(id: string) {
    const ns = nodes.filter((n) => n.dept === id);
    if (!ns.length) return;
    const xs = ns.map((n) => n.x), ys = ns.map((n) => n.y);
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    const bcx = (minx + maxx) / 2, bcy = (miny + maxy) / 2;
    const pad = 160;
    const s = clampS(Math.min(1200 / (maxx - minx + pad), 800 / (maxy - miny + pad), 1.5));
    animateTo({ s, tx: CX - s * bcx, ty: CY - s * bcy });
    setFocus(id);
  }
  function resetView() { animateTo(FIT); setFocus(null); }

  // ---- pointer / gesture ----
  function onDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), s: viewRef.current.s };
    } else { dragging.current = true; }
  }
  function onMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId); if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAroundCenter(pinch.current.s * (dist / pinch.current.dist));
      return;
    }
    if (dragging.current) {
      const f = factor();
      setView((v) => ({ ...v, tx: v.tx + (e.clientX - prev.x) * f, ty: v.ty + (e.clientY - prev.y) * f }));
    }
  }
  function onUp(e: React.PointerEvent) { pointers.current.delete(e.pointerId); if (pointers.current.size < 2) pinch.current = null; if (pointers.current.size === 0) dragging.current = false; }
  function onWheel(e: React.WheelEvent) { e.preventDefault(); zoomAroundCenter(viewRef.current.s * (1 - e.deltaY * 0.0012)); }

  function openNode(n: Node) {
    if (n.kind === "brain") { window.location.href = "/memory"; return; }
    if (n.kind === "agent") { window.location.href = `/agents?run=${encodeURIComponent(n.id)}`; return; }
    if (n.kind === "dept") { focus === n.id ? (window.location.href = `/agents?tab=${encodeURIComponent(n.id)}`) : focusDept(n.id); }
  }

  return (
    <div className="rounded-2xl border bg-card overflow-hidden relative" style={{ height: 560 }}>
      <div className="absolute z-10 top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border bg-background/90 px-2 h-9 backdrop-blur">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agents…" aria-label="Search agents" className="bg-transparent text-sm outline-none w-40" />
        </div>
        <div className="pointer-events-auto flex items-center gap-1">
          <button onClick={() => zoomAroundCenter(view.s - 0.25)} aria-label="Zoom out" className="h-9 w-9 min-h-11 min-w-11 grid place-items-center rounded-lg border bg-background/90 backdrop-blur hover:bg-accent"><Minus className="h-4 w-4" /></button>
          <div className="h-9 px-2 grid place-items-center rounded-lg border bg-background/90 backdrop-blur text-xs tabular-nums">{Math.round(view.s * 100)}%</div>
          <button onClick={() => zoomAroundCenter(view.s + 0.25)} aria-label="Zoom in" className="h-9 w-9 min-h-11 min-w-11 grid place-items-center rounded-lg border bg-background/90 backdrop-blur hover:bg-accent"><Plus aria-hidden="true" className="h-4 w-4" /></button>
          <button onClick={resetView} className="h-9 px-3 min-h-11 rounded-lg border bg-background/90 backdrop-blur hover:bg-accent inline-flex items-center gap-1 text-xs"><Maximize2 aria-hidden="true" className="h-3.5 w-3.5" /> Fit</button>
        </div>
      </div>

      <svg ref={svgRef} viewBox="0 0 1200 800" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"
        onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp}
        style={{ cursor: dragging.current ? "grabbing" : "grab", touchAction: "none", background: "radial-gradient(circle at 50% 45%, hsl(var(--primary)/0.06), transparent 60%)" }}>
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.s})`}>
          {/*
            THE LINKS, AND THE SIGNAL TRAVELLING ALONG THEM.

            The graph already showed the workforce as connected; what it did not
            show is that it is RUNNING. A static diagram of an org chart says
            "here are the agents". A pulse moving out from the brain, down each
            department, and on to the agents says "this thing is working right
            now", which is the actual claim the page is making.

            Done with SVG <animate> rather than a requestAnimationFrame loop:
            the browser animates these on the compositor, so ~130 travelling
            dots cost no JavaScript per frame and do not compete with the
            pan/pinch handlers above. A JS loop redrawing this many nodes would
            make dragging feel heavy on exactly the mid-range Android phones
            this product is for.

            Trunk links (brain → department) carry a brighter, faster pulse;
            branch links (department → agent) a slower, dimmer one, so the eye
            reads the direction of travel — out from the centre — rather than
            seeing uniform noise.
          */}
          {edges.map((e, i) => {
            const dimmed = focus ? e.dept !== focus : false;
            const lit = e.agentId ? activated.has(e.agentId) : false;
            return (
              <line
                key={"l" + i}
                x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                stroke={lit ? "hsl(var(--primary))" : "hsl(var(--border))"}
                strokeWidth={e.strong ? 2 : 1}
                opacity={dimmed ? 0.12 : lit ? 0.55 : e.strong ? 0.9 : 0.5}
              />
            );
          })}

          {animate && edges.map((e, i) => {
            // Hidden entirely when a department is focused and this link is not
            // part of it — a pulse on a branch you have zoomed away from is
            // motion with nothing to say.
            if (focus && e.dept !== focus) return null;

            /*
              Stagger. Every pulse starting at once reads as a single flash
              rather than as traffic; offsetting each one by a deterministic
              fraction of its own cycle makes the network look continuously
              busy. Deterministic (from the index) rather than random, so the
              picture does not reshuffle on every React re-render.
            */
            const dur = e.strong ? 2.4 : 3.6;
            const delay = ((i * 137) % 100) / 100 * dur;   // 137 is coprime with 100: an even spread
            const lit = e.agentId ? activated.has(e.agentId) : false;

            return (
              <circle
                key={"p" + i}
                r={e.strong ? 3.4 : 2.2}
                fill="hsl(var(--primary))"
                opacity={e.strong ? 0.95 : lit ? 0.9 : 0.55}
              >
                <animate attributeName="cx" from={e.x1} to={e.x2} dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
                <animate attributeName="cy" from={e.y1} to={e.y2} dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
                {/* Fade in and out at the ends so a dot never appears to pop
                    into existence on top of a node. */}
                <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.85;1" dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
              </circle>
            );
          })}
          {nodes.map((n) => {
            const dim = ql ? !match(n) : (focus && n.dept && n.dept !== focus && n.kind === "agent" ? true : false);
            if (n.kind === "brain") {
              return (
                <g key={n.id} onClick={(ev) => { ev.stopPropagation(); openNode(n); }} style={{ cursor: "pointer" }} opacity={dim ? 0.3 : 1}>
                  <circle cx={n.x} cy={n.y} r={54} fill="hsl(var(--primary))" />
                  <circle cx={n.x} cy={n.y} r={54} fill="none" stroke="hsl(var(--primary))" strokeWidth={10} opacity={0.25} />
                  {/*
                    An expanding ring leaving the brain on the same 2.4s cycle as
                    the trunk pulses, so the centre reads as the SOURCE of the
                    traffic rather than just another node that happens to be
                    bigger. Two rings half a cycle apart make it continuous.
                  */}
                  {animate && [0, 1.2].map((begin) => (
                    <circle key={begin} cx={n.x} cy={n.y} r={54} fill="none" stroke="hsl(var(--primary))" strokeWidth={2}>
                      <animate attributeName="r" from={54} to={96} dur="2.4s" begin={`${begin}s`} repeatCount="indefinite" />
                      <animate attributeName="opacity" from={0.45} to={0} dur="2.4s" begin={`${begin}s`} repeatCount="indefinite" />
                    </circle>
                  ))}
                  <text x={n.x} y={n.y - 2} textAnchor="middle" fontSize={13} fontWeight={700} fill="hsl(var(--primary-foreground))">Second</text>
                  <text x={n.x} y={n.y + 14} textAnchor="middle" fontSize={13} fontWeight={700} fill="hsl(var(--primary-foreground))">Brain</text>
                </g>
              );
            }
            if (n.kind === "dept") {
              const isF = focus === n.id;
              return (
                <g key={n.id} onClick={(ev) => { ev.stopPropagation(); openNode(n); }} style={{ cursor: "pointer" }} opacity={ql && !match(n) ? 0.3 : 1}>
                  <circle cx={n.x} cy={n.y} r={isF ? 34 : 30} fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth={isF ? 3.5 : 2.5} />
                  <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="hsl(var(--foreground))">{n.label}</text>
                </g>
              );
            }
            const on = activated.has(n.id);
            return (
              <g key={n.id} onClick={(ev) => { ev.stopPropagation(); openNode(n); }} style={{ cursor: "pointer" }} opacity={dim ? 0.18 : 1}>
                <circle cx={n.x} cy={n.y} r={7} fill={on ? "hsl(var(--primary))" : "hsl(var(--card))"} stroke={on ? "hsl(var(--primary))" : "hsl(var(--border))"} strokeWidth={2} />
                {on && <circle cx={n.x} cy={n.y} r={12} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} opacity={0.4} />}
                <text x={n.x + 11} y={n.y + 4} fontSize={11} fill="hsl(var(--muted-foreground))">{n.label.length > 22 ? n.label.slice(0, 22) + "…" : n.label}</text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute bottom-3 left-3 text-xs text-muted-foreground pointer-events-none flex items-center gap-3">
        <span className="inline-flex items-center gap-1"><BrainCircuit className="h-3.5 w-3.5 text-primary" />
          {focus ? "Tap the department again to open it · tap a node to run it" : "Drag / pinch to explore · tap a department to zoom in · tap a node to run it"}</span>
      </div>
    </div>
  );
}
