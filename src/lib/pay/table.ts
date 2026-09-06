import "server-only";

/**
 * The payment ledger table name, in one place.
 *
 * WHY A CONSTANT RATHER THAN A STRING LITERAL AT EACH CALL SITE.
 *
 * Cortex used `public.payments`, which is shared with the school/tuition app in
 * this Supabase project. That coupling produced three separate failures — the
 * admin dashboard counting their revenue as ours, and two of their NOT NULL
 * columns (owner_id, then student_id) rejecting every Cortex insert, which
 * meant a customer could pay and receive nothing.
 *
 * Moving to `cortex_payments` touches fourteen call sites across settle, the
 * webhook, refunds, erasure, backup, admin metrics and the operator tooling.
 * Missing one would be worse than not moving at all: settle would claim in one
 * table while the webhook checked the other, and the idempotency guard — the
 * thing that stops one payment granting twice — would silently stop working.
 *
 * So the name lives here, every caller imports it, and scripts/test-payments-
 * adversarial.mjs fails if a bare "payments" string reappears in the payment
 * paths. A constant makes the next rename a one-line change instead of a
 * fourteen-line one that has to be perfect.
 */
export const PAYMENTS_TABLE = "cortex_payments";

/**
 * The old shared table. Referenced only where we must still READ history that
 * predates the split — never written.
 */
export const LEGACY_PAYMENTS_TABLE = "payments";
