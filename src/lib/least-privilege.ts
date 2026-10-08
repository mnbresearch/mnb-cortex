/*
  LEAST PRIVILEGE FOR CONNECTED SYSTEMS — the confused-deputy defence.

  Cortex only READS from the payment and commerce systems it connects to
  (lib/sync: Stripe charges, Shopify orders, Razorpay payments). A key that
  can also refund, pay out, cancel orders or edit products gives every bug,
  and every model output that reaches code, the power to do those things
  "as" the workspace. So, where a provider lets the key be scoped, Cortex
  refuses a key broader than it needs, at the moment it is handed one:

    Stripe   a restricted key (rk_…) — never the account secret key (sk_…),
             which can create charges, refunds and payouts. Needed
             permissions: Charges → Read, Balance → Read.
    Shopify  a custom-app token whose scopes are read_* only. Any write_*
             scope is refused. read_orders is required.
    Razorpay keys cannot be scoped by the provider. Cortex calls only GET
             endpoints; the connect card says so and suggests a dedicated key
             the owner can revoke.

  And independently of scoping, no credential is reachable from the agent:
  lib/ai/tools.ts and lib/engine/handlers.ts never read the integrations
  table or credentialsFor() (pinned by scripts/test-least-privilege.mjs).

  Pure — tested directly.
*/

export type PrivilegeVerdict = { ok: true } | { ok: false; error: string };

export function stripeKeyVerdict(key: string): PrivilegeVerdict {
  const k = String(key || "").trim();
  if (/^rk_(live|test)_[A-Za-z0-9]{10,}$/.test(k)) return { ok: true };
  if (/^sk_(live|test)_/.test(k)) {
    return { ok: false, error: "That is your Stripe account's secret key, which can create charges, refunds and payouts. Cortex only reads, so it does not accept it. In Stripe → Developers → API keys, create a restricted key with Charges: Read and Balance: Read, and paste that (it starts rk_)." };
  }
  if (/^pk_(live|test)_/.test(k)) return { ok: false, error: "That is a publishable key, which cannot read payments. Create a restricted key (rk_…) with Charges: Read and Balance: Read." };
  return { ok: false, error: "That does not look like a Stripe restricted key (it should start rk_live_ or rk_test_)." };
}

export const SHOPIFY_REQUIRED_SCOPES = ["read_orders"] as const;

export function shopifyScopesVerdict(handles: string[]): PrivilegeVerdict {
  const list = (handles || []).map((h) => String(h || "").trim()).filter(Boolean);
  const write = list.filter((h) => /^write_/.test(h) || /^unauthenticated_write/.test(h));
  if (write.length) {
    return { ok: false, error: `This token can change your store (${write.slice(0, 4).join(", ")}${write.length > 4 ? "…" : ""}). Cortex only reads orders, so it does not accept it. In your custom app, give the Admin API token only read_orders (and read_customers if you like), then paste the new token.` };
  }
  const missing = SHOPIFY_REQUIRED_SCOPES.filter((s) => !list.includes(s));
  if (missing.length) return { ok: false, error: `This token is missing ${missing.join(", ")}, which Cortex needs to read your orders.` };
  return { ok: true };
}

/** Providers whose keys cannot be scoped: shown on the connect card so the owner chooses knowingly. */
export const UNSCOPEABLE_NOTE: Record<string, string> = {
  razorpay: "Razorpay keys cannot be limited to read-only. Cortex only calls read (GET) endpoints — never refunds, payouts or captures. Use a separate key you can revoke from the Razorpay dashboard at any time.",
};
