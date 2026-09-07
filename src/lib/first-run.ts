import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";
import { getBillingStatus } from "@/lib/billing";

/*
  WHAT A NEW WORKSPACE STILL HAS TO DO, DERIVED FROM WHAT IS ACTUALLY THERE.

  THE PROBLEM THIS REPLACES

  Setup was a single redirect: /api/workspace/bootstrap returned "/onboarding"
  when it had just created the workspace, and never again. There was no
  completion record anywhere — the only first-run state in the product was four
  localStorage keys for modals. So refreshing the page, closing the tab, or
  signing in on a second device lost the wizard permanently, with no nav entry
  and no way back. A customer who got interrupted halfway through setting up
  their business was simply finished with onboarding, whether or not they had
  onboarded.

  Meanwhile the empty dashboard offered NINE calls to action across four
  destinations, and the largest, most central empty card — "No business data
  yet" — carried no link at all.

  WHY THIS IS DERIVED RATHER THAN A FLAG

  Every step below is computed from the database on each request: does the
  workspace have a real name, does it have a plan, are there invoices, is any
  receivable actually overdue. Nothing is remembered.

  That matters more than it sounds. A stored "onboarding_complete = true" drifts
  the moment reality disagrees with it — a customer deletes their test invoices
  and the product still believes they are set up, or a step is added later and
  every existing workspace is silently marked as having done it. Derived state
  cannot drift, is correct for a workspace that existed before this code, and
  self-heals: import data and the step ticks itself off.

  THE ORDER IS THE PRODUCT'S OWN PROMISE

  MNB Cortex is sold as an early-warning system: "one email on Monday with the
  three things worth your attention". The shortest honest path from signup to
  that promise is company → plan → receivables → a real warning. Anything else
  on the dashboard is a detour until those four are done, which is why this
  returns exactly one `next` and not a menu.
*/

export type SetupStep = {
  id: "company" | "plan" | "data" | "warning";
  title: string;
  /** What the customer gets out of it — not what the software does. */
  why: string;
  done: boolean;
  href: string;
  cta: string;
};

export type FirstRun = {
  /** False for a logged-out visitor, or when there is no workspace yet. */
  known: boolean;
  steps: SetupStep[];
  /** The one thing to do now. Null once everything is done. */
  next: SetupStep | null;
  doneCount: number;
  /** True once every step is complete — the caller hides the whole panel. */
  complete: boolean;
};

const EMPTY: FirstRun = { known: false, steps: [], next: null, doneCount: 0, complete: false };

/** Cheap existence probe. Never throws; a broken read counts as "not done". */
async function hasAny(svc: any, table: string, orgId: string, filter?: (q: any) => any): Promise<boolean> {
  try {
    let q = svc.from(table).select("id", { count: "exact", head: true }).eq("org_id", orgId);
    if (filter) q = filter(q);
    const { count, error } = await q;
    if (error) return false;
    return (count || 0) > 0;
  } catch { return false; }
}

export async function getFirstRun(): Promise<FirstRun> {
  const { user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return EMPTY;

  const svc = serviceClient();
  if (!svc) return EMPTY;

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

  const [org, billing, hasInvoices, hasOverdue, hasAnyData] = await Promise.all([
    // Wrapped in Promise.resolve() because the Supabase builder is a
    // PromiseLike, not a Promise — it has .then() but no .catch().
    Promise.resolve(svc.from("organizations").select("name,industry").eq("id", orgId).single())
      .then((r: any) => r?.data ?? null).catch(() => null),
    getBillingStatus().catch(() => null),
    hasAny(svc, "invoices", orgId),
    /*
      The actual promise. Not "you have invoices" but "one of them is past due
      and Cortex can tell you about it" — which is the moment the product first
      does the thing it is sold for.
    */
    hasAny(svc, "invoices", orgId, (q: any) =>
      q.neq("status", "paid").not("due_date", "is", null).lt("due_date", today)),
    Promise.all([
      hasAny(svc, "invoices", orgId),
      hasAny(svc, "sales_orders", orgId),
      hasAny(svc, "inventory_items", orgId),
      hasAny(svc, "employees", orgId),
    ]).then((r) => r.some(Boolean)),
  ]);

  /*
    A name counts only if the customer chose it. ensureWorkspace() falls back to
    the email local-part or "My workspace" when it has nothing better, and the
    old database trigger used "My Company" — none of which is an answer to
    "what is your business called", so none of them should tick the step.
  */
  const rawName = String((org as any)?.name || "").trim();
  const placeholder = !rawName ||
    /^(my workspace|my company|untitled)$/i.test(rawName) ||
    rawName.toLowerCase() === String(user.email || "").split("@")[0].toLowerCase();
  const companyDone = !placeholder && Boolean((org as any)?.industry);

  // `locked` is what the paywall reads, so it is what "has a plan" must mean.
  const planDone = Boolean(billing && !billing.locked);

  const steps: SetupStep[] = [
    {
      id: "company",
      title: "Tell Cortex about your business",
      why: "Your industry decides which warnings matter — a 90-day receivable is normal for one and an emergency for another.",
      done: companyDone,
      href: "/onboarding",
      cta: "Add your details",
    },
    {
      id: "plan",
      title: "Choose a plan",
      why: "Cortex reads your ledger and runs the AI that finds problems in it. There is no free tier, so this unlocks the rest.",
      done: planDone,
      href: "/billing",
      cta: "See plans",
    },
    {
      id: "data",
      title: "Bring in your invoices",
      why: "This is the one that matters. Cortex cannot warn you about money you are owed until it can see who owes it.",
      done: hasInvoices || hasAnyData,
      href: "/import",
      cta: "Import your data",
    },
    {
      id: "warning",
      title: "See your first warning",
      why: "Once a bill is past due, Cortex shows you exactly who to chase and drafts the message for you.",
      done: hasOverdue,
      href: "/receivables",
      cta: "Open receivables",
    },
  ];

  const next = steps.find((s) => !s.done) ?? null;
  const doneCount = steps.filter((s) => s.done).length;

  return { known: true, steps, next, doneCount, complete: doneCount === steps.length };
}
