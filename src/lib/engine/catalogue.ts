/*
  THE ACTION CATALOGUE — everything Cortex is permitted to DO, as a closed list.

  ============================================================================
  WHY A CLOSED LIST
  ============================================================================

  The alternative is to hand the model a write-capable client and a prompt
  that says "be careful". Every agent incident of the last two years has that
  shape: an instruction arrives inside data the model was asked to read — a
  customer name in a CSV, a line in an inbound email — and the model, which
  cannot tell data from instruction, does what the data says.

  A catalogue turns "what can go wrong" from an open question into a finite
  one. The model may only name an entry here and fill its typed arguments.
  Each entry declares, in a form the policy engine and the UI both read:

    effect        internal_write  — changes rows in this workspace only
                  outbound        — a message leaves to a third party
                  money           — moves or reclassifies money
                  export          — produces a file for the person who asked

    reversible    whether the executor can undo it. Un-sending is not a thing,
                  so every outbound action is irreversible, which is why they
                  default to approval and stay there until the owner grants
                  otherwise WITH caps.

    blastRadius   what one execution can touch at most: rows, recipients,
                  rupees. The policy engine compares caps against this.

    minRank       the role needed to approve it by hand. Proposing is always
                  analyst; approving money or outbound is admin.

    defaultMode   what happens before the owner has configured anything.
                  State-changing actions default to 'approve'. An export to
                  the person who asked for it defaults to 'auto', because
                  making someone approve their own download is theatre, not
                  safety.

  ============================================================================
  WHAT IS DELIBERATELY NOT HERE (v1)
  ============================================================================

  · delete anything                 — soft paths exist in the UI; the engine
                                      does not get a destructive verb yet
  · pay anything                    — no payment rail is wired to the engine
  · change plan / credits / billing — the billing guard trigger forbids it to
                                      every role but the service role, and the
                                      engine will not be the thing that
                                      launders that privilege
  · send to an address the model chose — send_payment_reminder resolves the
                                      recipient from the invoice's party, never
                                      from an argument

  Adding an entry is a product decision, not a refactor: it must declare all
  five properties, have a handler in handlers.ts, and be covered in
  scripts/test-actions-engine.mjs, which fails on any entry missing a handler
  or any handler missing an entry.
*/

export type Effect = "internal_write" | "outbound" | "money" | "export";

export type ArgSpec = {
  type: "string" | "number" | "uuid" | "date" | "enum" | "boolean";
  required?: boolean;
  description: string;
  values?: readonly string[];          // for enum
  min?: number; max?: number;          // for number
  maxLength?: number;                  // for string
};

export type ActionDef = {
  key: string;
  title: string;                       // shown on the approval card
  describe: (args: Record<string, unknown>) => string;  // one human sentence of what WILL happen
  effect: Effect;
  reversible: boolean;
  blastRadius: { rows?: number; recipients?: number; rupees?: "arg:amount" | number | null };
  minRank: "analyst" | "manager" | "admin" | "owner";
  defaultMode: "approve" | "auto" | "blocked";
  args: Record<string, ArgSpec>;
};

const INVOICE_ID: ArgSpec = { type: "uuid", required: true, description: "The invoice's id in this workspace." };

export const CATALOGUE: readonly ActionDef[] = [
  {
    key: "update_invoice_due_date",
    title: "Change an invoice's due date",
    describe: (a) => `Move the due date of invoice ${a.invoice_no ?? a.invoice_id} to ${a.due_date}.`,
    effect: "internal_write",
    reversible: true,
    blastRadius: { rows: 1 },
    minRank: "manager",
    defaultMode: "approve",
    args: {
      invoice_id: INVOICE_ID,
      due_date: { type: "date", required: true, description: "New due date, YYYY-MM-DD." },
      invoice_no: { type: "string", description: "For the card only; the id is authoritative.", maxLength: 64 },
    },
  },
  {
    key: "mark_invoice_paid",
    title: "Mark an invoice as paid",
    describe: (a) => `Mark invoice ${a.invoice_no ?? a.invoice_id} as paid${a.paid_on ? ` on ${a.paid_on}` : ""}.`,
    /*
      Classified as MONEY, not internal_write, even though no rupee moves:
      it removes an amount from receivables, which changes what the owner
      believes they are owed. Getting this wrong by automation is how a real
      debt disappears from the chase list.
    */
    effect: "money",
    reversible: true,
    blastRadius: { rows: 1, rupees: "arg:amount" },
    minRank: "admin",
    defaultMode: "approve",
    args: {
      invoice_id: INVOICE_ID,
      paid_on: { type: "date", description: "Date the payment was received, YYYY-MM-DD." },
      amount: { type: "number", min: 0, description: "The invoice amount, for the cap check; the row is authoritative." },
      invoice_no: { type: "string", description: "For the card only.", maxLength: 64 },
    },
  },
  {
    key: "add_do_not_contact",
    title: "Stop chasing a party",
    describe: (a) => `Add "${a.party}" to the do-not-contact list, so no collections message is sent to them.`,
    effect: "internal_write",
    reversible: true,
    blastRadius: { rows: 1 },
    minRank: "manager",
    /*
      The one state change that defaults to AUTO. It can only ever make Cortex
      do LESS — the failure mode of a wrong auto-execution is a reminder not
      sent, which is recoverable, and the opposite default (auto-send) is not.
    */
    defaultMode: "auto",
    args: {
      party: { type: "string", required: true, maxLength: 200, description: "The customer or supplier name exactly as it appears on their invoices." },
      reason: { type: "string", maxLength: 300, description: "Why — shown in the ledger." },
    },
  },
  {
    key: "add_customer_note",
    title: "Note something about a customer",
    describe: (a) => `Append to the notes on customer ${a.customer_name ?? a.customer_id}: "${String(a.note ?? "").slice(0, 80)}${String(a.note ?? "").length > 80 ? "…" : ""}".`,
    effect: "internal_write",
    reversible: true,
    blastRadius: { rows: 1 },
    minRank: "analyst",
    /*
      Auto by default: it is append-only (a dated line on the record), touches
      no money and no message, and undo restores the exact previous text. The
      wrong note on a customer record is a nuisance, not a loss.
    */
    defaultMode: "auto",
    args: {
      customer_id: { type: "uuid", required: true, description: "The customer's id in this workspace (look it up with find_party first)." },
      note: { type: "string", required: true, maxLength: 500, description: "What to record. Dated automatically." },
      customer_name: { type: "string", maxLength: 120, description: "For the card only; the id is authoritative." },
    },
  },
  {
    key: "set_customer_status",
    title: "Change a customer's status",
    describe: (a) => `Mark customer ${a.customer_name ?? a.customer_id} as ${a.status}.`,
    effect: "internal_write",
    reversible: true,
    blastRadius: { rows: 1 },
    minRank: "manager",
    /* Approve by default: "churned" removes a customer from pipeline figures and retention views. */
    defaultMode: "approve",
    args: {
      customer_id: { type: "uuid", required: true, description: "The customer's id in this workspace." },
      status: { type: "enum", required: true, values: ["lead", "active", "churned"] as const, description: "The new status." },
      customer_name: { type: "string", maxLength: 120, description: "For the card only." },
    },
  },
  {
    key: "send_payment_reminder",
    title: "Send a payment reminder",
    describe: (a) => `Send a ${a.channel ?? "email"} reminder to the party on invoice ${a.invoice_no ?? a.invoice_id}, through the collections engine.`,
    effect: "outbound",
    reversible: false,
    blastRadius: { recipients: 1, rupees: "arg:amount" },
    minRank: "admin",
    defaultMode: "approve",
    args: {
      invoice_id: INVOICE_ID,
      channel: { type: "enum", values: ["email", "whatsapp"] as const, description: "Which channel; defaults to email." },
      amount: { type: "number", min: 0, description: "Outstanding amount, for the cap check." },
      invoice_no: { type: "string", maxLength: 64, description: "For the card only." },
    },
  },
  {
    key: "raise_alert",
    title: "Raise an in-app alert",
    describe: (a) => `Show an alert on the dashboard: "${String(a.message ?? "").slice(0, 80)}".`,
    effect: "internal_write",
    reversible: true,
    blastRadius: { rows: 1 },
    minRank: "analyst",
    defaultMode: "auto",
    args: {
      message: { type: "string", required: true, maxLength: 500, description: "What the alert says." },
      severity: { type: "enum", values: ["info", "warning", "critical"] as const, description: "Defaults to warning." },
    },
  },
  {
    key: "export_xlsx",
    title: "Produce an Excel workbook",
    describe: (a) => a.dataset === "mis_pack" ? "Generate the monthly MIS pack (.xlsx) for download." : `Generate a .xlsx of ${a.dataset} for download.`,
    effect: "export",
    reversible: true,
    blastRadius: { rows: 10_000 },
    minRank: "analyst",
    defaultMode: "auto",
    args: {
      dataset: {
        type: "enum", required: true,
        values: ["receivables_ageing", "payables", "customers", "sales_orders", "inventory", "invoices", "mis_pack"] as const,
        description: "Which dataset to export. mis_pack is the monthly management pack: KPI overview, 24-month trend, receivables ageing, payables, top customers, collections — one workbook.",
      },
      days: { type: "number", min: 1, max: 3650, description: "Look-back window in days where it applies; defaults to 365." },
    },
  },
  {
    key: "transform_workbook",
    title: "Transform an uploaded workbook",
    describe: (a) => `Apply ${Array.isArray(a.steps) ? a.steps.length : "the planned"} step${Array.isArray(a.steps) && a.steps.length === 1 ? "" : "s"} to ${a.source ?? "the uploaded file"} and download the result.`,
    /*
      Recorded, not executed, through the engine. The file lives in the
      person's browser for the length of the request and nowhere else, so the
      executor cannot run this later from a queue — there is nothing to run it
      on. The Excel page does the work inline and writes a done row for the
      history; the handler exists so a chat proposal gets a clear answer
      instead of a dead entry.
    */
    effect: "export",
    reversible: false,
    blastRadius: { rows: 10_000 },
    minRank: "analyst",
    defaultMode: "auto",
    args: {
      source: { type: "string", maxLength: 200, description: "The uploaded file's name." },
    },
  },
] as const;

export const CATALOGUE_BY_KEY: Readonly<Record<string, ActionDef>> = Object.freeze(
  Object.fromEntries(CATALOGUE.map((d) => [d.key, d])),
);

export function isActionKey(k: unknown): k is string {
  return typeof k === "string" && k in CATALOGUE_BY_KEY;
}

/**
 * Validate and normalise arguments against the spec. Returns the cleaned args
 * or a list of problems. Strict: unknown keys are dropped, not passed through.
 */
export function validateArgs(def: ActionDef, raw: unknown): { ok: true; args: Record<string, unknown> } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const out: Record<string, unknown> = {};
  const src = (raw && typeof raw === "object") ? (raw as Record<string, unknown>) : {};

  for (const [name, spec] of Object.entries(def.args)) {
    const v = src[name];
    const absent = v === undefined || v === null || v === "";
    if (absent) {
      if (spec.required) problems.push(`${name} is required`);
      continue;
    }
    switch (spec.type) {
      case "string": {
        const s = String(v);
        if (spec.maxLength && s.length > spec.maxLength) problems.push(`${name} is longer than ${spec.maxLength} characters`);
        else out[name] = s;
        break;
      }
      case "number": {
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(n)) problems.push(`${name} must be a number`);
        else if (spec.min !== undefined && n < spec.min) problems.push(`${name} must be at least ${spec.min}`);
        else if (spec.max !== undefined && n > spec.max) problems.push(`${name} must be at most ${spec.max}`);
        else out[name] = n;
        break;
      }
      case "uuid": {
        const s = String(v);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) problems.push(`${name} is not an id`);
        else out[name] = s.toLowerCase();
        break;
      }
      case "date": {
        const s = String(v);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) problems.push(`${name} must be a date like 2026-10-31`);
        else out[name] = s;
        break;
      }
      case "enum": {
        const s = String(v);
        if (!spec.values || !spec.values.includes(s)) problems.push(`${name} must be one of ${(spec.values || []).join(", ")}`);
        else out[name] = s;
        break;
      }
      case "boolean": {
        out[name] = v === true || v === "true";
        break;
      }
    }
  }
  return problems.length ? { ok: false, problems } : { ok: true, args: out };
}
