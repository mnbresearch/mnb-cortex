"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Play, Pause, RotateCcw, ChevronRight, Info } from "lucide-react";
import { STORIES, STATIONS, ACTORS, STORY_TABS, storyFor, type ActorId, type StationId, type Story } from "@/lib/agent-stories";

/*
  THE AGENT FLOOR — Cortex's agents walking between desks and handing work to
  each other, one real scenario at a time, per industry.

  Honest by construction: every line comes from lib/agent-stories.ts, where
  each step names the module that really does it (and a test checks that).
  The walking and talking is the illustration; the steps are the product.
  The caption under the floor says exactly that.

  Built from HTML and CSS rather than canvas so it reflows on a phone and the
  speech bubbles wrap like text. Positions are percentages of the floor; a
  move is a CSS transition whose duration is proportional to the distance, so
  agents walk at one pace whatever the screen size. Legs swing only while
  moving.

  prefers-reduced-motion: no walking, no auto-advance — the agents appear at
  each desk and the owner steps through with "Next".
*/

/*
  A position is a desk plus a slot. Agents stand BESIDE the desk card — below
  it on the top half of the floor, above it on the bottom half — so they never
  cover its label. The px parts (card half-height, agent height, slot spread)
  are CSS variables set per breakpoint on the stage, so spacing holds on a
  phone and on a wide screen alike; the transition interpolates the calc().
*/
type Pos = { x: number; y: number; k: number };
const PACE = 26; // ms per % of floor travelled
const READ_MS = (s: string) => Math.min(4200, 1400 + s.length * 38);
const below = (y: number) => y <= 50;
const standAt = (p: Pos) => ({
  left: `calc(${p.x}% + ${p.k} * var(--af-spread))`,
  top: below(p.y)
    ? `calc(${p.y}% + var(--af-card) + var(--af-agent) + 4px)`
    : `calc(${p.y}% - var(--af-card) - 4px)`,
});

function Agent({ id, pos, walking, speaking, carry, dim }: { id: ActorId; pos: Pos; walking: number; speaking: string | null; carry?: string; dim?: boolean }) {
  const a = ACTORS[id];
  /* Bubbles open sideways: never over a desk label, never off the edge. Edge desks open toward the middle;
     middle desks open away from whoever else stands there (slot -1 opens left, +1 right). */
  const right = pos.x > 35 && pos.x < 65 && pos.k !== 0 ? pos.k > 0 : pos.x < 50;
  return (
    <div
      className="absolute"
      style={{
        ...standAt(pos),
        transform: "translate(-50%, -100%)",
        transition: walking ? `left ${walking}ms linear, top ${walking}ms linear` : "none",
        opacity: dim ? 0.5 : 1,
        zIndex: speaking ? 25 : 20,
      }}
      aria-hidden="true"
    >
      {speaking && (
        <div className={`agent-bubble absolute top-1/2 -translate-y-1/2 ${right ? "left-full ml-2 origin-left" : "right-full mr-2 origin-right"} w-max max-w-[9.5rem] sm:max-w-[15rem] rounded-xl border bg-card px-2.5 py-1.5 text-[11px] sm:text-xs leading-snug shadow-lg`}>
          <span className="font-semibold" style={{ color: a.color }}>{a.name}: </span>{speaking}
          <span className={`absolute top-1/2 -translate-y-1/2 border-y-[6px] border-y-transparent ${right ? "right-full border-r-[6px]" : "left-full border-l-[6px]"}`}
            style={right ? { borderRightColor: "hsl(var(--border))" } : { borderLeftColor: "hsl(var(--border))" }} />
        </div>
      )}
      <div className={`relative ${walking ? "agent-walk" : "agent-idle"}`}>
        {carry && walking ? (
          <span className="absolute -right-7 top-1 rounded-md bg-background border px-1 py-0.5 text-[9px] sm:text-[10px] font-medium whitespace-nowrap shadow-sm">{carry}</span>
        ) : null}
        <svg viewBox="0 0 30 40" className="block h-[var(--af-agent)] w-auto">
          <ellipse cx="15" cy="38.5" rx="9" ry="1.6" fill="currentColor" opacity="0.12" />
          <g className="agent-leg-l"><rect x="10" y="27" width="4" height="10" rx="2" fill={a.color} opacity="0.85" /></g>
          <g className="agent-leg-r"><rect x="16" y="27" width="4" height="10" rx="2" fill={a.color} opacity="0.85" /></g>
          <rect x="6" y="13" width="18" height="17" rx="7" fill={a.color} />
          <circle cx="15" cy="8" r="6.5" fill="#fbe8d3" stroke={a.color} strokeWidth="1.5" />
          <circle cx="12.8" cy="7.6" r="0.9" fill="#3a2a1c" />
          <circle cx="17.2" cy="7.6" r="0.9" fill="#3a2a1c" />
          <text x="15" y="25" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff">{a.initial}</text>
        </svg>
      </div>
    </div>
  );
}

export function AgentFloor({ industry, compact = false, showTabs = true }: { industry?: string | null; compact?: boolean; showTabs?: boolean }) {
  const initial = storyFor(industry);
  const [storyId, setStoryId] = useState(initial.id);
  const story: Story = useMemo(() => STORIES.find((s) => s.id === storyId) || STORIES[0], [storyId]);
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [inView, setInView] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  /* Positions: everyone starts at home. Each agent keeps one slot, so two at the same desk stand side by side. */
  const actorsInStory = useMemo(() => Array.from(new Set(story.steps.map((s) => s.actor))), [story]);
  const slot = (id: ActorId) => (id === "you" ? 0 : actorsInStory.indexOf(id) % 2 ? 1 : -1);
  const home = (id: ActorId): Pos => { const s = STATIONS[ACTORS[id].home]; return { x: s.x, y: s.y, k: 0 }; };
  const [pos, setPos] = useState<Record<string, Pos>>({});
  const [walk, setWalk] = useState<Record<string, number>>({});
  const [speech, setSpeech] = useState<{ actor: ActorId; text: string } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply(); mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  /* Only run while on screen — a landing page should not animate something nobody is looking at. */
  useEffect(() => {
    const el = rootRef.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.25 });
    io.observe(el); return () => io.disconnect();
  }, []);

  /* Reset when the story changes, or on replay. */
  const [runId, setRunId] = useState(0);
  useEffect(() => {
    const p: Record<string, Pos> = {};
    for (const a of Object.keys(ACTORS) as ActorId[]) p[a] = home(a);
    setPos(p); setWalk({}); setSpeech(null); setStep(-1);
  }, [storyId, runId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* A step: walk to the desk, then speak. Advancing is a separate effect, so pausing is just "stop scheduling". */
  useEffect(() => {
    if (step < 0 || step >= story.steps.length) return;
    const s = story.steps[step];
    const from = pos[s.actor] || home(s.actor);
    const st = STATIONS[s.to];
    const target: Pos = { x: st.x, y: st.y, k: slot(s.actor) };
    const dist = Math.max(4, Math.hypot(target.x - from.x, (target.y - from.y) * 0.6));
    const ms = reduced ? 0 : Math.round(dist * PACE);
    setSpeech(null);
    setWalk((w) => ({ ...w, [s.actor]: ms }));
    setPos((p) => ({ ...p, [s.actor]: target }));
    const t = setTimeout(() => {
      setWalk((w) => ({ ...w, [s.actor]: 0 }));
      setSpeech({ actor: s.actor, text: s.say });
    }, ms + 60);
    return () => clearTimeout(t);
  }, [step, story]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Advance: only while playing, on screen and motion is allowed. Loops to the next business at the end. */
  useEffect(() => {
    if (reduced || !playing || !inView) return;
    if (step === -1) { const t = setTimeout(() => setStep(0), 500); return () => clearTimeout(t); }
    if (!speech) return;
    if (step < story.steps.length - 1) {
      const t = setTimeout(() => setStep((n) => n + 1), READ_MS(speech.text));
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      if (!showTabs) { setRunId((n) => n + 1); return; }
      setStoryId((id) => STORY_TABS[(STORY_TABS.indexOf(id as any) + 1) % STORY_TABS.length]);
    }, READ_MS(speech.text) + 2200);
    return () => clearTimeout(t);
  }, [step, speech, playing, inView, reduced, story.steps.length, showTabs]);

  const current = step >= 0 ? story.steps[step] : null;
  const used = new Set<StationId>(story.uses);
  const stations = Object.values(STATIONS).filter((s) => used.has(s.id));

  return (
    <div ref={rootRef} className="w-full" data-agent-floor="">
      {showTabs && (
        <div className="flex flex-wrap gap-1.5 mb-3" role="tablist" aria-label="Choose a business">
          {STORY_TABS.map((id) => {
            const s = STORIES.find((x) => x.id === id)!;
            const on = id === storyId;
            return (
              <button key={id} role="tab" aria-selected={on} onClick={() => { setStoryId(id); setPlaying(true); }}
                className={`rounded-full border px-3 min-h-9 text-xs sm:text-sm transition-colors ${on ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}>
                {s.who}
              </button>
            );
          })}
        </div>
      )}

      <div className={`relative w-full overflow-hidden rounded-2xl border bg-gradient-to-br from-card via-background to-card [--af-card:15px] [--af-agent:38px] [--af-spread:28px] sm:[--af-card:21px] sm:[--af-agent:50px] sm:[--af-spread:40px] ${compact ? "aspect-[16/12] sm:aspect-[16/8] lg:aspect-[16/7]" : "aspect-[16/13] sm:aspect-[16/8.5] lg:aspect-[16/7.2]"}`}>
        {/* floor grid */}
        <div className="absolute inset-0 opacity-[0.35]" style={{ backgroundImage: "linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)", backgroundSize: "6% 9%" }} aria-hidden="true" />
        {/* hand-off paths */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {stations.filter((s) => s.id !== "approvals").map((s) => (
            <line key={s.id} x1={s.x} y1={s.y} x2={STATIONS.approvals.x} y2={STATIONS.approvals.y}
              stroke="hsl(var(--primary))" strokeOpacity={current && (current.to === s.id) ? 0.55 : 0.14}
              strokeWidth="0.35" strokeDasharray="1.2 1.2" vectorEffect="non-scaling-stroke" className={reduced ? "" : "agent-path"} />
          ))}
        </svg>
        {/* desks */}
        {stations.map((s) => {
          const hot = current?.to === s.id;
          return (
            <div key={s.id} className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
              <div className={`flex items-center gap-1.5 rounded-xl border px-2 py-1 sm:px-2.5 sm:py-1.5 bg-card/95 shadow-sm transition-all ${hot ? "border-primary ring-2 ring-primary/30 scale-105" : ""} ${s.id === "approvals" ? "border-primary/50" : ""}`}>
                <span className="text-sm sm:text-base" aria-hidden="true">{s.icon}</span>
                <span className="leading-tight">
                  <span className="block text-[10px] sm:text-xs font-semibold whitespace-nowrap">{s.label}</span>
                  <span className="hidden sm:block text-[10px] text-muted-foreground whitespace-nowrap">{s.sub}</span>
                </span>
              </div>
            </div>
          );
        })}
        {/* agents */}
        {(Object.keys(ACTORS) as ActorId[]).filter((id) => actorsInStory.includes(id)).map((id) => (
          <Agent key={id} id={id} pos={pos[id] || home(id)} walking={walk[id] || 0}
            speaking={speech?.actor === id ? speech.text : null}
            carry={current?.actor === id ? current.carry : undefined}
            dim={!!current && current.actor !== id && speech?.actor !== id} />
        ))}
        {/* title */}
        <div className="absolute left-3 top-3 z-30 rounded-lg bg-background/85 border px-2 py-1 text-[10px] sm:text-xs font-medium">{story.title}</div>
        {/* controls */}
        <div className="absolute right-3 bottom-3 z-30 flex gap-1">
          {!reduced && (
            <button onClick={() => setPlaying((p) => !p)} className="rounded-lg border bg-background/90 min-h-9 min-w-9 grid place-items-center hover:bg-accent" aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
          )}
          <button onClick={() => { setRunId((n) => n + 1); setPlaying(true); }} className="rounded-lg border bg-background/90 min-h-9 min-w-9 grid place-items-center hover:bg-accent" aria-label="Replay">
            <RotateCcw className="h-4 w-4" />
          </button>
          {(reduced || !playing) && (
            <button onClick={() => setStep((n) => Math.min(story.steps.length - 1, n + 1))} className="rounded-lg border bg-background/90 min-h-9 px-2 text-xs inline-flex items-center gap-1 hover:bg-accent">
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* the steps, as text — readable without the animation, and each links to the real module */}
      {!compact && (
        <ol className="mt-3 grid gap-1.5 sm:grid-cols-2" aria-label={`${story.title}, step by step`}>
          {story.steps.map((s, i) => (
            <li key={i}>
              <button onClick={() => { setPlaying(false); setStep(i); }}
                className={`w-full text-left rounded-lg border px-3 py-2 text-xs sm:text-sm transition-colors ${i === step ? "border-primary bg-primary/5" : i < step ? "opacity-80" : "opacity-60 hover:opacity-100"}`}>
                <span className="font-semibold" style={{ color: ACTORS[s.actor].color }}>{ACTORS[s.actor].name}</span>
                <span className="text-muted-foreground"> · {STATIONS[s.to].label}</span>
                {s.commandOnly && <span className="ml-1 rounded bg-primary/10 text-primary px-1 text-[10px]">Command</span>}
                <span className="block mt-0.5">{s.say}</span>
                <Link href={s.module} onClick={(e) => e.stopPropagation()} className="text-[11px] text-primary underline-offset-2 hover:underline">{s.module}</Link>
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground flex items-start gap-1.5">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        An illustration of what runs in your workspace. The steps are Cortex&apos;s real ones and each links to the page that does it; names and amounts are examples. Anything that contacts a customer waits for your approval unless you set an Autopilot rule (Command).
      </p>
    </div>
  );
}
