import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { SafeForm } from "@/components/safe-form";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { CATALOGUE } from "@/lib/engine/catalogue";
import { requiresCaps, describeCaps } from "@/lib/engine/policy";
import { listPolicies } from "@/lib/engine/ledger";
import { savePolicy } from "@/lib/engine/server-actions";
import { ArrowLeft, ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

/*
  AUTONOMY RULES — where the owner decides what Cortex may do without asking.

  One row per action in the catalogue. The default for anything that changes
  state is "ask me first". The owner may move an action to "run it" — but for
  anything that sends a message or affects money, "run it" is refused unless
  a daily limit is set, by the server AND by a check constraint in the
  database. "Never" blocks the action entirely, including by hand.

  This page writes nothing itself; savePolicy() in server-actions does, behind
  assertRole("admin").
*/

const EFFECT_LABEL: Record<string, string> = {
  internal_write: "changes data in your workspace",
  outbound: "sends a message to a third party",
  money: "affects money owed to you",
  export: "produces a file for you",
};

export default async function Rules() {
  const { orgId } = await getUserAndOrg();
  const [policies, isAdmin] = orgId ? await Promise.all([listPolicies(orgId), hasRole("admin")]) : [[], false];
  const byAction = new Map(policies.map((p) => [p.action, p]));

  return (
    <>
      <Topbar title="Autonomy rules" subtitle="What Cortex may do on its own, and within what limits" />
      <PageShell>
        <Link href="/approvals" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to approvals</Link>

        <Card className="p-4 text-sm text-muted-foreground">
          Nothing runs on its own until you say so here. Anything that sends a message or affects money can only run
          automatically with a daily limit — the database refuses the rule otherwise. "Never" switches an action off
          entirely, even by hand. Every automatic run still appears in the ledger with Undo where that is possible.
        </Card>

        {!isAdmin && (
          <Card className="p-4 text-sm flex items-start gap-2 bg-warning/10 border-warning/20">
            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>Only an admin or owner can change these rules. You can read them.</span>
          </Card>
        )}

        <Section title="Actions" desc="One rule per action. Blank limits mean no limit — allowed only for actions that cannot send or spend.">
          <div className="space-y-4">
            {CATALOGUE.map((def) => {
              const pol = byAction.get(def.key);
              const mode = pol?.mode ?? def.defaultMode;
              const caps = pol?.caps ?? { max_per_day: null, max_amount_inr: null, known_parties_only: false };
              const needsCaps = requiresCaps(def);
              return (
                <SafeForm key={def.key} action={savePolicy} successMessage="Rule saved." className="rounded-xl border p-4">
                  <input type="hidden" name="action" value={def.key} />
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 md:w-1/2">
                      <div className="font-medium text-sm">{def.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {EFFECT_LABEL[def.effect]} · {def.reversible ? "can be undone" : "cannot be undone"}
                        {needsCaps && " · needs a daily limit to run on its own"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Now: <span className="font-medium text-foreground">{mode === "auto" ? "runs on its own" : mode === "blocked" ? "never" : "asks first"}</span>
                        {pol && mode === "auto" && <> — {describeCaps(caps)}</>}
                        {!pol && <> (default)</>}
                      </div>
                    </div>

                    <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs md:w-1/2" disabled={!isAdmin}>
                      <legend className="sr-only">Rule for {def.title}</legend>
                      <label className="flex flex-col gap-1">
                        <span className="text-muted-foreground">Mode</span>
                        <select name="mode" defaultValue={mode} className="rounded-md border bg-background h-9 px-2">
                          <option value="approve">Ask me first</option>
                          <option value="auto">Run it on its own</option>
                          <option value="blocked">Never</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-muted-foreground">Max per day{needsCaps ? " (required for auto)" : ""}</span>
                        <input name="max_per_day" type="number" min={0} step={1} defaultValue={caps.max_per_day ?? ""} placeholder={needsCaps ? "e.g. 5" : "no limit"} className="rounded-md border bg-background h-9 px-2" />
                      </label>
                      {def.blastRadius.rupees !== undefined && def.blastRadius.rupees !== null && (
                        <label className="flex flex-col gap-1">
                          <span className="text-muted-foreground">Max ₹ per action</span>
                          <input name="max_amount_inr" type="number" min={0} step={100} defaultValue={caps.max_amount_inr ?? ""} placeholder="no limit" className="rounded-md border bg-background h-9 px-2" />
                        </label>
                      )}
                      {(def.effect === "outbound" || def.effect === "money") && (
                        <label className="flex items-center gap-2 sm:col-span-2 mt-1">
                          <input name="known_parties_only" type="checkbox" defaultChecked={caps.known_parties_only === true} className="h-4 w-4" />
                          <span>Only for parties Cortex has dealt with before</span>
                        </label>
                      )}
                      <div className="sm:col-span-2 flex justify-end">
                        <button disabled={!isAdmin} className="rounded-lg bg-primary text-primary-foreground h-9 px-4 text-xs font-medium disabled:opacity-50">Save rule</button>
                      </div>
                    </fieldset>
                  </div>
                </SafeForm>
              );
            })}
          </div>
        </Section>
      </PageShell>
    </>
  );
}
