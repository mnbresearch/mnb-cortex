import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { AppraisalPlanner } from "@/components/appraisal-planner";
import { getEmployees } from "@/lib/data";

export const dynamic = "force-dynamic";

const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** Band the real team by recorded performance, with their real payroll. */
export default async function Appraisal() {
  const { rows, live } = await getEmployees();
  const staff = live ? rows : [];

  const BANDS = [
    { id: "b1", label: "Top performers",      test: (p: number) => p >= 4.5, hike: 15 },
    { id: "b2", label: "Strong",              test: (p: number) => p >= 4,   hike: 10 },
    { id: "b3", label: "Meets expectations",  test: (p: number) => p >= 3,   hike: 7 },
    { id: "b4", label: "Below",               test: (p: number) => p > 0,    hike: 3 },
  ];

  const assigned = new Set<string>();
  const seed = BANDS.map((b) => {
    const members = staff.filter((e) => {
      const id = String(e.id);
      if (assigned.has(id)) return false;
      if (!b.test(n(e.performance))) return false;
      assigned.add(id);
      return true;
    });
    const avg = members.length ? members.reduce((s, e) => s + n(e.monthly_ctc), 0) / members.length : 0;
    return { id: b.id, label: b.label, count: members.length, avg: Math.round(avg), hike: b.hike };
  }).filter((b) => b.count > 0);

  return (
    <>
      <Topbar title="Appraisal & Hike Planner" subtitle="Distribute your raise budget across performance bands" />
      <PageShell><AppraisalPlanner seed={seed} /></PageShell>
    </>
  );
}
