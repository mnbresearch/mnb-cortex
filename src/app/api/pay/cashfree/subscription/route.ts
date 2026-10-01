import { NextResponse } from "next/server";
import { getUserAndOrg, getOrgProfile } from "@/lib/data";
import { serviceClient } from "@/lib/supabase/server";
import { createSubscription, cancelSubscription, getSubscription, hasSubscriptions } from "@/lib/pay/subscription";
import { enforce } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { plan, annual, phone } -> authorisation link. DELETE -> cancel auto-renew. */
export async function POST(req: Request) {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to set up auto-renewal." }, { status: 401 });

  /*
    Billing is an ADMIN action, and none of these routes checked a role.

    Any member \u2014 including a viewer, a role handed to junior staff and in
    Practice mode to the client \u2014 could set up a recurring mandate against the
    workspace. Worse than the mandate itself is what the success path does
    below: it overwrites `organizations.subscription_ref`. The previous mandate
    is NOT cancelled, so Cashfree keeps debiting the customer for it, but its
    renewal webhooks then look up the org by the new ref and find nothing
    (`if (!org) return` in the webhook) \u2014 the customer is charged every cycle
    and receives nothing, with no error raised anywhere.

    So: admin, matching every other billing surface.
  */
  const { hasRole } = await import("@/lib/roles");
  if (!(await hasRole("admin"))) {
    return NextResponse.json(
      { ok: false, error: "Only an admin or owner can set up auto-renewal." }, { status: 403 });
  }

  if (!hasSubscriptions()) return NextResponse.json({ ok: false, needsConfig: true, error: "Online payments aren\u2019t set up yet." }, { status: 200 });

  /*
    Refuse to clobber a live mandate. Replacing the ref while the old mandate is
    still active is the orphaning bug described above; the customer has to
    cancel first, which also stops the debits.
  */
  try {
    const { data: cur } = await serviceClient()!.from("organizations")
      .select("subscription_ref, autorenew_status").eq("id", orgId).maybeSingle();
    const existing = (cur as any)?.subscription_ref;
    const status = String((cur as any)?.autorenew_status || "").toUpperCase();
    if (existing && !["CANCELLED", "EXPIRED", "FAILED", ""].includes(status)) {
      return NextResponse.json({
        ok: false,
        error: "Auto-renewal is already set up for this workspace. Turn the existing one off before creating a new mandate, or you will be charged for both.",
      }, { status: 409 });
    }
  } catch { /* cannot read \u2014 fall through rather than block a first-time setup */ }

  const b = await req.json().catch(() => ({} as any));
  const profile = await getOrgProfile();
  const digits = String(b.phone || (profile as any)?.billing_phone || "").replace(/\D/g, "").slice(-10);

  const origin = new URL(req.url).origin;
  const res = await createSubscription({
    orgId,
    planId: String(b.plan || "").toLowerCase(),
    annual: Boolean(b.annual),
    customer: {
      email: (profile as any)?.userEmail || user?.email || undefined,
      phone: /^[6-9]\d{9}$/.test(digits) ? digits : undefined,
      name: (profile as any)?.name,
    },
    returnUrl: `${origin}/billing?sub={subscription_id}`,
  });

  /*
    ==========================================================================
    THIS IS THE ONLY PLACE `subscription_ref` IS EVER WRITTEN
    ==========================================================================

    Nothing else in the codebase sets it. The webhook only READS by it
    (`.eq("subscription_ref", ref)`), so if this write does not land, the
    mandate exists at Cashfree and nothing in our database points at it.

    What then happens, every cycle, forever:

      Cashfree charges the card
        \u2192 webhook fires with the subscription id
        \u2192 `organizations where subscription_ref = <id>` matches nothing
        \u2192 `if (!org) return;`  \u2014 a silent HTTP 200
        \u2192 the customer is debited and granted nothing, and no error is raised
          anywhere in the system

    The comment that used to sit here said "the mandate still works; we'll
    reconcile on return". Both halves were wrong.

      \u00b7 `catch` CANNOT FIRE. PostgREST reports a failed update by returning
        `{ error }`; it does not throw. Nor does a zero-row update \u2014 matching
        no rows is a successful statement. So the one guard on the product's
        most expensive write was unreachable code.

      \u00b7 THE NAMED REMEDY CANNOT RUN. The GET reconciler proves ownership with
        `.eq("id", orgId).eq("subscription_ref", ref)` \u2014 it filters on the
        very column that failed to store. With the ref missing it returns 403
        and refuses. The fallback was structurally incapable of recovering
        from the failure it was cited for. (It can now; see GET below.)

    An earlier commit on this file described this orphaning precisely \u2014 "the
    customer is charged every cycle and receives nothing, with no error raised
    anywhere" \u2014 and then fixed only the two ways to REACH it: the missing role
    check, and clobbering a live ref. The plain path, this write quietly
    failing, was left exactly as it was. Describing a bug is not fixing it.

    --------------------------------------------------------------------------
    WHY REFUSING IS SAFE HERE, AND WHY IT IS THE RIGHT ANSWER
    --------------------------------------------------------------------------

    createSubscription returns an `authLink` the customer has NOT yet opened.
    At this moment the mandate is created but unauthorised: no card has been
    charged and no recurring permission exists. So declining to hand back the
    link costs nothing and moves no money, while handing it back after we have
    failed to record the reference creates the one state we can never repair
    from \u2014 an active mandate nobody can attribute and the customer cannot turn
    off from the billing page, because that page cancels by `subscription_ref`.

    A mandate never authorised is an inconvenience. A mandate we cannot see is
    a recurring charge with no delivery and no off switch.
  */
  if (res.ok && res.subscriptionId) {
    const stored = await recordRef(orgId, res.subscriptionId);

    if (!stored) {
      /*
        Cancel what we just created, so nothing can be charged against a
        reference we do not hold. If the cancel ALSO fails we have an
        unauthorised mandate at Cashfree and no record of it \u2014 the customer
        still cannot be charged without opening the link we are not returning,
        but an operator must know the id exists.
      */
      const undo = await cancelSubscription(res.subscriptionId);
      const { operatorAlert } = await import("@/lib/operator-alert");
      await operatorAlert({
        kind: "subscription_ref_unstored",
        severity: "red",
        orgId,
        title: `Could not record mandate ${res.subscriptionId}`,
        body:
          `A subscription was created at Cashfree for workspace ${orgId} but ` +
          `organizations.subscription_ref could not be written, so no renewal ` +
          `webhook could ever be attributed to this workspace.\n\n` +
          `The authorisation link was NOT returned to the customer, so nothing ` +
          `can be charged.\n\n` +
          (undo.ok
            ? `The unauthorised mandate has been cancelled at Cashfree.`
            : `WARNING: cancelling it also failed (${undo.error || "unknown"}). ` +
              `Cancel ${res.subscriptionId} in the Cashfree dashboard by hand.`),
      });

      return NextResponse.json({
        ok: false,
        error:
          "We couldn't finish setting up auto-renewal, so we've stopped before " +
          "anything was charged. Nothing has been taken from your card. Please " +
          "try again in a minute \u2014 if it happens twice, contact us and we'll set " +
          "it up for you.",
      }, { status: 200 });
    }
  }
  return NextResponse.json(res);
}

/**
 * Write the mandate reference, and answer whether a row actually changed.
 *
 * Returns true only on a confirmed single-row update. Three distinct failures
 * all have to be treated as "not stored", and only one of them is an `error`:
 *
 *   \u00b7 no service client     \u2014 misconfiguration, write never attempted
 *   \u00b7 `error` returned      \u2014 rejected; PostgREST does not throw
 *   \u00b7 zero rows matched     \u2014 accepted, changed nothing, reports no error
 *
 * The third is the quiet one, and it is reachable: the org row could have been
 * removed between the role check and here. `select("id")` makes the row count
 * observable instead of assumed.
 *
 * One retry, because the realistic cause is a transient connection rather than
 * anything a second attempt would repeat. The update is idempotent \u2014 same org,
 * same values \u2014 so retrying is safe.
 */
async function recordRef(orgId: string, subscriptionId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const svc = serviceClient();
      if (!svc) return false;
      const { data, error } = await svc.from("organizations")
        .update({ subscription_ref: subscriptionId, autorenew_status: "INITIALIZED" })
        .eq("id", orgId)
        .select("id");
      if (!error && (data?.length ?? 0) > 0) return true;
      console.error(
        `[pay/subscription] attempt ${attempt + 1} did not store ${subscriptionId} for ${orgId} \u2014`,
        error ? error.message : `matched ${data?.length ?? 0} rows`);
    } catch (e: any) {
      console.error(`[pay/subscription] attempt ${attempt + 1} threw \u2014`, e?.message);
    }
  }
  return false;
}

/** Turn auto-renewal off. The already-paid period is untouched. */
export async function DELETE() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  /* A viewer could cancel the workspace's auto-renewal. The paid period
     survives, so this is not destructive — but it silently sets the workspace
     up to lapse at the end of the cycle, and the owner has no reason to look. */
  const { hasRole } = await import("@/lib/roles");
  if (!(await hasRole("admin"))) {
    return NextResponse.json(
      { ok: false, error: "Only an admin or owner can turn off auto-renewal." }, { status: 403 });
  }

  const svc = serviceClient();
  const { data } = await svc!.from("organizations").select("subscription_ref").eq("id", orgId).maybeSingle();
  const ref = (data as any)?.subscription_ref;
  if (!ref) return NextResponse.json({ ok: true, note: "Auto-renewal wasn\u2019t on." });

  const res = await cancelSubscription(ref);
  if (!res.ok) return NextResponse.json(res);

  /*
    THE CANCEL SUCCEEDED AT CASHFREE. SAYING SO BEFORE WE'VE RECORDED IT IS
    THE WRONG WAY ROUND.

    This was `try { ...update... } catch {}` followed by returning Cashfree's
    ok. As above, the catch could not fire — a rejected or zero-row update
    returns, it does not throw — so a failed write produced a cheerful "done".

    The two sides then disagree in the direction that costs the customer
    money they did not expect to keep paying... and then stop getting:

      Cashfree  : mandate cancelled, no further debits
      our row   : autorenew_status ACTIVE, autorenew_next 1 Nov

    The billing page reads OUR row. So it goes on telling them auto-renewal
    is on and the next charge is on the 1st. They plan around that, no debit
    arrives, and the workspace lapses on a date they were told was a renewal.
    The customer did everything right and the product misinformed them.

    The debits really have stopped, which is what they asked for — so the
    honest answer is "cancelled, but we couldn't update your billing page",
    not a failure and not an unqualified success.
  */
  const { data: recorded, error } = await svc!.from("organizations")
    .update({ autorenew_status: "CANCELLED", autorenew_next: null })
    .eq("id", orgId)
    .select("id");

  if (error || (recorded?.length ?? 0) === 0) {
    const why = error ? error.message : `matched ${recorded?.length ?? 0} rows`;
    console.error(`[pay/subscription] cancelled ${ref} but did not record it for ${orgId} —`, why);
    const { operatorAlert } = await import("@/lib/operator-alert");
    await operatorAlert({
      kind: "autorenew_cancel_unrecorded",
      severity: "amber",
      orgId,
      title: `Auto-renewal cancelled at Cashfree but not recorded (${orgId})`,
      body:
        `Mandate ${ref} is cancelled — no further debits will be taken.\n\n` +
        `organizations.autorenew_status could not be updated (${why}), so the ` +
        `billing page may still show a renewal date that will never happen. ` +
        `Set autorenew_status to CANCELLED and clear autorenew_next by hand.`,
    });
    return NextResponse.json({
      ok: true,
      warning:
        "Auto-renewal has been cancelled and no further payments will be taken. " +
        "We couldn't refresh your billing page, so it may still show a renewal " +
        "date — ignore it, and it will correct itself shortly.",
    });
  }

  return NextResponse.json(res);
}

/** Reconcile status after the customer returns from authorising. */
export async function GET(req: Request) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false }, { status: 401 });
  const ref = new URL(req.url).searchParams.get("sub");
  if (!ref) return NextResponse.json({ ok: false, error: "Missing subscription id." }, { status: 400 });

  /*
    ASK CASHFREE ONLY ABOUT OUR OWN SUBSCRIPTION.

    The write below is correctly scoped — `.eq("id", orgId).eq("subscription_ref", ref)`
    means no entitlement can be diverted. The READ was not scoped at all: any
    signed-in user could pass any `sub` and we would query it with the merchant
    credentials and return its status, plan, cycle and next charge date. That is
    a lookup against our Cashfree account on a stranger's behalf, and it is the
    one billing route that skipped the check its siblings all make (see
    /verify, which refuses another workspace's order outright).

    Confirm ownership from OUR row first, then call out.
  */
  const svcRead = serviceClient();
  const { data: own } = svcRead
    ? await svcRead.from("organizations").select("id").eq("id", orgId).eq("subscription_ref", ref).maybeSingle()
    : { data: null as any };

  /*
    And a limit. Each call is an outbound authenticated request to Cashfree, so
    an unbounded loop burns our API quota from a free account. Reconciling after
    an authorisation happens once or twice; 60/hour is far above that.

    This now sits ABOVE the ownership decision, because the recovery path below
    needs an outbound call to decide ownership at all. Rate-limiting first is
    what keeps that path from becoming a way to probe our Cashfree account.
  */
  const over = await enforce([{ key: `pay:sub:org:${orgId}`, limit: 60, windowSecs: 3600 }]);
  if (over) return NextResponse.json({ ok: false, error: "Too many status checks. Refresh this page in a minute." }, { status: 429 });

  /*
    ==========================================================================
    THE ONE CASE OUR OWN TABLES CANNOT ANSWER
    ==========================================================================

    The check above is `.eq("id", orgId).eq("subscription_ref", ref)` — it
    filters on the very column that the POST may have failed to write. So when
    this route was named as the remedy for that failure ("we'll reconcile on
    return"), it could not possibly have served: with the ref missing, `own`
    is null and this returned 403. The remedy required the thing it was meant
    to repair.

    Our tables are genuinely unable to settle it, so ask the authority. The
    mandate carries `subscription_note`, a string WE sent at mint time as
    `plan:<id>:<cycle>:<orgId>`. It comes back from Cashfree, the caller never
    touches it, and it is already what the renewal webhook trusts to decide
    which plan was bought. If it names this workspace, this workspace owns the
    mandate — on better evidence than our own row would have given.

    This does not widen the IDOR the ownership check was added for. A stranger
    passing somebody else's ref gets the same sentence as before and learns
    nothing about it: the status, plan, cycle and next charge date are only
    returned once the note matches. The only new cost is one rate-limited
    outbound call, and only on the path where our row already missed.
  */
  const st = await getSubscription(ref);

  if (!own) {
    if (!st.ok || !st.orgId || st.orgId !== orgId) {
      return NextResponse.json({ ok: false, error: "That subscription belongs to a different workspace." }, { status: 403 });
    }
    /*
      Ours, and unrecorded. Adopt it — this is the repair, and it is the
      difference between a customer who can see and cancel their own mandate
      and one being charged by something invisible to the whole product.

      `is("subscription_ref", null)` makes the write refuse to overwrite a
      DIFFERENT live reference. Without it, a stale link from an abandoned
      first attempt could point the workspace at the older mandate while the
      newer one keeps debiting — re-creating the orphan in the other
      direction. Recovery must not be able to cause the thing it recovers from.
    */
    const { data: adopted, error: adoptErr } = await svcRead!.from("organizations")
      .update({ subscription_ref: ref, autorenew_status: st.status || "INITIALIZED", autorenew_next: st.nextCharge || null })
      .eq("id", orgId)
      .is("subscription_ref", null)
      .select("id");

    const healed = !adoptErr && (adopted?.length ?? 0) > 0;
    const { operatorAlert } = await import("@/lib/operator-alert");
    await operatorAlert({
      kind: healed ? "subscription_ref_recovered" : "subscription_ref_conflict",
      severity: healed ? "amber" : "red",
      orgId,
      title: healed
        ? `Recovered unrecorded mandate ${ref} for ${orgId}`
        : `Could not adopt mandate ${ref} for ${orgId}`,
      body: healed
        ? `Cashfree held mandate ${ref} for this workspace and our row did not ` +
          `reference it. The reference has now been stored, so renewal webhooks ` +
          `will be attributed correctly. Worth asking why the original write failed.`
        : `Cashfree's note says mandate ${ref} belongs to ${orgId}, but the row ` +
          `already holds a different subscription_ref, so it was not overwritten ` +
          `(${adoptErr ? adoptErr.message : "another reference present"}). Two ` +
          `mandates may be live for one workspace — check Cashfree and cancel ` +
          `whichever is not wanted, or the customer is paying twice.`,
    });

    if (!healed) {
      return NextResponse.json({
        ok: false,
        error: "This workspace already has a different auto-renewal set up. We've flagged it for review — please contact us before trying again.",
      }, { status: 409 });
    }
    return NextResponse.json(st);
  }

  if (st.ok) {
    /*
      Display-only, and genuinely so: these two columns feed the billing page's
      status line and nothing else grants, charges or gates. A failure here is
      a stale label, which the next load corrects — so it is logged rather than
      surfaced. Stated explicitly because "display-only" was asserted in a bare
      `catch {}` two functions up and was false there.
    */
    const { error } = await svcRead!.from("organizations")
      .update({ autorenew_status: st.status || null, autorenew_next: st.nextCharge || null })
      .eq("id", orgId).eq("subscription_ref", ref);
    if (error) console.error(`[pay/subscription] status refresh failed for ${orgId} —`, error.message);
  }
  return NextResponse.json(st);
}
