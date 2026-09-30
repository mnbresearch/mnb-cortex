import { Topbar } from "@/components/topbar";
import { SafeForm } from "@/components/safe-form";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getActivity } from "@/lib/data";
import { getLastAnalysedAt } from "@/lib/last-analysed";
import { runAutopilot } from "@/lib/actions";
import { AUTOPILOT_TIME_IST } from "@/lib/cron-schedule";
import { Bot, Sparkles, Clock } from "lucide-react";

export const dynamic = "force-dynamic";
export default async function Autopilot() {
  const { rows, live } = await getActivity();
  const findings = rows.filter((r: any) => r.type === "ai");
  const lastRead = await getLastAnalysedAt();
  const lastReadLabel = lastRead
    ? `Your numbers were last read ${lastRead}.`
    : "Your numbers have not been read yet — import something, or run it now.";
  return (
    <>
      <Topbar title="AI Autopilot" subtitle="Let the COO watch your business on its own" />
      <PageShell>
        <Card className="p-5 bg-gradient-to-br from-primary/10 to-purple-500/5 border-primary/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/15 p-2.5"><Bot className="h-6 w-6 text-primary" /></div>
              <div>
                <p className="font-medium">Autopilot analyses your business and posts findings automatically.</p>
                {/*
                  This said "daily 8:00 AM" while the cron in vercel.json is
                  `30 4 * * *`, which Vercel evaluates in UTC — 10:00 IST.
                  An owner who checked at 8:15 and saw nothing would conclude
                  either that the feature was broken or, worse, that there was
                  nothing to warn them about. Now derived from the cron, and
                  scripts/test-cron-schedule.mjs fails if the two drift apart.
                */}
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5"><Clock className="h-3.5 w-3.5" /> Scheduled: daily at {AUTOPILOT_TIME_IST} · findings appear in Activity &amp; Notifications</p>
                {/*
                  THE CLAIM, CHECKED AGAINST THIS WORKSPACE.

                  Six public surfaces say Cortex "re-reads your numbers every
                  day". The schedule genuinely is daily — but the nightly
                  sweep is capped and rotated, so as the number of paying
                  workspaces grows, "every day" stops being true for any
                  particular one. The features page already admitted this in
                  a code comment nobody outside the repo reads.

                  A cadence promise the customer cannot verify is the same
                  shape of defect as a cash figure with no date on it, which
                  this codebase already fixed once. So the real answer is
                  printed here: when THIS workspace was last read. If the cap
                  ever starts biting, the owner sees it before we do.
                */}
                <p className="text-sm text-muted-foreground mt-0.5">{lastReadLabel}</p>
              </div>
            </div>
            {live ? (
              <SafeForm action={runAutopilot}>
                <button className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground h-10 px-5 text-sm font-medium hover:opacity-90"><Sparkles className="h-4 w-4" /> Run Autopilot now</button>
              </SafeForm>
            ) : <a href="/login" className="text-sm text-primary underline">Sign in to run</a>}
          </div>
        </Card>
        <Section title="Recent Autopilot findings" desc="AI-generated analyses">
          {findings.length === 0 ? <p className="text-sm text-muted-foreground">No findings yet. Run Autopilot to generate the first analysis.</p> : (
            <div className="space-y-2">
              {findings.slice(0, 15).map((f: any) => (
                <div key={f.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <Sparkles className="h-4 w-4 text-primary mt-0.5" />
                  <div className="flex-1"><div className="text-sm">{f.message}</div><div className="text-xs text-muted-foreground mt-0.5">{String(f.created_at).slice(0, 16).replace("T", " ")}</div></div>
                  <Badge className="border-border text-muted-foreground">AI</Badge>
                </div>
              ))}
            </div>
          )}
        </Section>
      </PageShell>
    </>
  );
}
