import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { CommissionCalc } from "@/components/commission-calc";
import { getEmployees } from "@/lib/data";

export const dynamic = "force-dynamic";

const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

export default async function Commission() {
  // Real people, so the payout table is about the team the owner actually has.
  // Quota and sales are not stored per employee, so they start at zero and are
  // filled in here — which is honest: an invented quota is worse than a blank.
  const { rows, live } = await getEmployees();
  const seed = (live ? rows : [])
    .filter((e) => /sales|business development|bd/i.test(String(e.department || "")))
    .map((e) => ({ id: String(e.id), name: String(e.name || "Unnamed"), quota: 0, sales: 0 }))
    .slice(0, 40);

  return (
    <>
      <Topbar title="Sales Commission" subtitle="Design incentives that reward the right behaviour" />
      <PageShell><CommissionCalc seed={seed} /></PageShell>
    </>
  );
}
