/*
  THE READ API'S RESOURCES — one table, used by the routes AND by the OpenAPI
  document, so the docs cannot describe a field or filter the route does not
  serve (scripts/test-api-v1.mjs checks both directions).

  Pure: no database, no server-only.

  Every resource is read with the service role and ALWAYS filtered by the
  key's org_id (lib/api/list.ts) — the key decides the tenant, never a
  parameter. Columns are an explicit allow-list: a new internal column added
  to a table does not appear in the API until someone puts it here.
*/
import type { ApiScope } from "@/lib/api-keys";

export type FilterSpec =
  | { name: string; kind: "slug"; column: string; doc: string }
  | { name: string; kind: "enum"; column: string; values: readonly string[]; doc: string }
  | { name: string; kind: "date_gte" | "date_lte"; column: string; doc: string };

export type FieldSpec = { name: string; type: "string" | "number" | "date" | "date-time"; nullable?: boolean };

export type Resource = {
  path: string;
  table: string;
  scope: ApiScope;
  summary: string;
  fields: FieldSpec[];
  filters: FilterSpec[];
  /** Extra fixed filter, e.g. hide sample data. Applied server-side, not a parameter. */
  hideDemo?: boolean;
};

const id: FieldSpec = { name: "id", type: "string" };
const created: FieldSpec = { name: "created_at", type: "date-time" };

export const RESOURCES: Resource[] = [
  {
    path: "/api/v1/invoices", table: "invoices", scope: "invoices:read",
    summary: "Invoices — receivable and payable — newest first.",
    fields: [id, { name: "invoice_no", type: "string", nullable: true }, { name: "party", type: "string", nullable: true },
      { name: "amount", type: "number", nullable: true }, { name: "status", type: "string", nullable: true },
      { name: "type", type: "string", nullable: true }, { name: "issue_date", type: "date", nullable: true },
      { name: "due_date", type: "date", nullable: true }, created],
    filters: [
      { name: "type", kind: "enum", column: "type", values: ["receivable", "payable"], doc: "receivable or payable" },
      { name: "status", kind: "slug", column: "status", doc: "e.g. pending, paid, overdue (lower case)" },
      { name: "due_from", kind: "date_gte", column: "due_date", doc: "due on or after (YYYY-MM-DD)" },
      { name: "due_to", kind: "date_lte", column: "due_date", doc: "due on or before (YYYY-MM-DD)" },
    ],
  },
  {
    path: "/api/v1/customers", table: "customers", scope: "customers:read",
    summary: "Customers, newest first. Sample (demo) records are never returned.",
    hideDemo: true,
    fields: [id, { name: "name", type: "string", nullable: true }, { name: "company", type: "string", nullable: true },
      { name: "email", type: "string", nullable: true }, { name: "phone", type: "string", nullable: true },
      { name: "status", type: "string", nullable: true }, { name: "value", type: "number", nullable: true },
      { name: "last_touch", type: "date", nullable: true }, created],
    filters: [{ name: "status", kind: "slug", column: "status", doc: "e.g. lead, active, churned" }],
  },
  {
    path: "/api/v1/sales-orders", table: "sales_orders", scope: "sales:read",
    summary: "Sales orders, newest first.",
    fields: [id, { name: "order_no", type: "string", nullable: true }, { name: "customer_name", type: "string", nullable: true },
      { name: "region", type: "string", nullable: true }, { name: "product", type: "string", nullable: true },
      { name: "amount", type: "number", nullable: true }, { name: "status", type: "string", nullable: true },
      { name: "order_date", type: "date", nullable: true }, created],
    filters: [
      { name: "status", kind: "enum", column: "status", values: ["won", "open", "lost"], doc: "won, open or lost" },
      { name: "from", kind: "date_gte", column: "order_date", doc: "ordered on or after (YYYY-MM-DD)" },
      { name: "to", kind: "date_lte", column: "order_date", doc: "ordered on or before (YYYY-MM-DD)" },
    ],
  },
  {
    path: "/api/v1/leads", table: "leads", scope: "leads:read",
    summary: "Leads, newest first.",
    fields: [id, { name: "name", type: "string", nullable: true }, { name: "email", type: "string", nullable: true },
      { name: "phone", type: "string", nullable: true }, { name: "company", type: "string", nullable: true },
      { name: "plan", type: "string", nullable: true }, { name: "source", type: "string", nullable: true },
      { name: "note", type: "string", nullable: true }, created],
    filters: [{ name: "source", kind: "slug", column: "source", doc: "e.g. api, pricing, referral" }],
  },
];

export const resourceByPath = (p: string) => RESOURCES.find((r) => r.path === p) || null;

/** Validate one filter value. Values reach PostgREST only through .eq/.gte/.lte (parameterised), never a filter string. */
export function readFilter(f: FilterSpec, raw: string | null): { value: string | null } | { error: string } {
  if (raw === null || raw === "") return { value: null };
  const v = raw.trim();
  if (f.kind === "enum") {
    const low = v.toLowerCase();
    return f.values.includes(low) ? { value: low } : { error: `${f.name} must be one of: ${f.values.join(", ")}` };
  }
  if (f.kind === "slug") {
    return /^[a-z0-9_-]{1,40}$/i.test(v) ? { value: v.toLowerCase() } : { error: `${f.name} must be a short word (letters, digits, - or _)` };
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z")) ? { value: v } : { error: `${f.name} must be a date, YYYY-MM-DD` };
}
