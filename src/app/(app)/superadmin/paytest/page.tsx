import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/superadmin";
import { getUserAndOrg } from "@/lib/data";
import { serviceClient } from "@/lib/supabase/server";
import { PAYMENTS_TABLE } from "@/lib/pay/table";
import { CREDIT_PACKS } from "@/lib/config";
import { Card } from "@/components/ui/card";
import { PayTestClient } from "@/components/pay-test-client";

export const dynamic = "force-dynamic";

/**
 * Live payment test — ₹1, real money, the real chain.
 *
 * WHY THIS EXISTS.
 *
 * Everything upstream of the grant is third-party infrastructure: Cashfree's
 * checkout, its webhook delivery, its HMAC. None of that can be honestly
 * mocked, so the whole payment path had never actually been executed
 * end-to-end — only its pieces, in isolation, against fixtures I wrote.
 *
 * The adversarial pass changed the parts of that chain that decide whether a
 * customer gets what they paid for: which events settle, whether a failed grant
 * is retried, the amount tolerance, the idempotency claim. Those are exactly
 * the changes a unit test is least able to vouch for.
 *
 * So: one rupee, through the real gateway, and read the result out of the
 * database afterwards rather than trusting the success screen.
 *
 * Super-admin only, and the pack it buys is hidden and refused to anyone else
 * server-side.
 */
export default async function PayTestPage() {
  if (!(await isSuperAdmin())) redirect("/dashboard");

  const { orgId } = await getUserAndOrg();
  const pack = CREDIT_PACKS.find((p) => p.id === "pack_test");
  const svc = serviceClient();

  /* The BEFORE state, so the after is a comparison and not a vibe. */
  let credits = 0;
  let priorTests: any[] = [];
  if (svc && orgId) {
    const { data: org } = await svc.from("organizations").select("credits").eq("id", orgId).maybeSingle();
    credits = Number((org as any)?.credits ?? 0);
    const { data: rows } = await svc.from(PAYMENTS_TABLE)
      .select("order_id, status, amount, kind, ref, created_at")
      .eq("org_id", orgId).eq("ref", "pack_test")
      .order("created_at", { ascending: false }).limit(10);
    priorTests = (rows as any[]) || [];
  }

  return (
    <main className="p-6 space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Live payment test</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Buys {pack?.credits} credit for ₹{pack?.price} with real money, through the real gateway,
          to prove the whole chain works. Operator only.
        </p>
      </div>

      <Card className="p-5 space-y-3">
        <div className="text-sm font-medium">What this exercises</div>
        <ol className="text-sm text-muted-foreground space-y-1 list-decimal pl-5">
          <li>Order creation, with the price read server-side from the catalogue</li>
          <li>Cashfree checkout and the return redirect</li>
          <li>Webhook delivery and HMAC verification against the raw body</li>
          <li>
            Event routing — the new precise match, so <code>REFUND_SUCCESS</code> no
            longer reaches the grant path
          </li>
          <li>The amount check, now at one paisa rather than one rupee</li>
          <li>The idempotency claim on <code>payments.order_id</code></li>
          <li>
            <code>grant_credits</code> and the ledger row — the thing that proves the
            money actually turned into product
          </li>
        </ol>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="text-sm font-medium">Before</div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums">{credits.toLocaleString("en-IN")}</span>
          <span className="text-sm text-muted-foreground">credits in this workspace</span>
        </div>
        <p className="text-xs text-muted-foreground">
          After paying, this should be exactly {credits + (pack?.credits ?? 1)} — no more, no less.
          More than that would mean the grant ran twice.
        </p>
      </Card>

      <PayTestClient packId="pack_test" price={pack?.price ?? 1} before={credits} />

      {priorTests.length > 0 && (
        <Card className="p-5">
          <div className="text-sm font-medium mb-2">Previous test payments</div>
          <div className="space-y-1 text-xs font-mono">
            {priorTests.map((p) => (
              <div key={p.order_id} className="flex justify-between gap-3 border-b pb-1">
                <span className="truncate">{p.order_id}</span>
                <span className={p.status === "paid" ? "text-success" : "text-warning"}>{p.status}</span>
                <span className="tabular-nums">₹{p.amount}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Each row is one claim on <code>payments</code>. A second row for the same order id
            would mean the idempotency guard failed.
          </p>
        </Card>
      )}
    </main>
  );
}
