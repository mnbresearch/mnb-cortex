/*
  The OpenAPI 3.1 document for /api/v1, served at /api/v1/openapi.json.

  BUILT, NOT HAND-WRITTEN: read resources come from lib/api/resources.ts (the
  table the routes themselves use) and scopes from lib/api-keys.ts, so the
  document cannot list a field, filter or permission the API does not serve.
  scripts/test-api-v1.mjs checks every route file under src/app/api/v1 has a
  path here and every path here has a route file.

  Pure — no database, no server-only.
*/
import { API_SCOPES } from "@/lib/api-keys";
import { RESOURCES, type FieldSpec } from "@/lib/api/resources";
import { PAGE_DEFAULT, PAGE_MAX, ERROR_CODES } from "@/lib/api/http";

/* Mirrors WEBHOOK_EVENTS in lib/webhooks.ts (server-only, so not importable here); the test fails if they drift. */
export const DOC_WEBHOOK_EVENTS = [
  "metrics.recomputed", "alert.created", "workflow.completed", "invoice.overdue",
  "payment.succeeded", "payment.refunded", "report.generated",
] as const;

export const API_VERSION = "1.1.0";

const fieldSchema = (f: FieldSpec) => {
  const base = f.type === "number" ? { type: "number" } : f.type === "date" ? { type: "string", format: "date" } : f.type === "date-time" ? { type: "string", format: "date-time" } : { type: "string" };
  return f.nullable ? { ...base, type: [base.type, "null"] } : base;
};

const errorResponses = (extra: Record<string, string> = {}) => ({
  "400": { description: "Invalid parameters or body", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
  "401": { description: "Missing, invalid, revoked or expired key", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
  "403": { description: "The key lacks the required scope", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
  "429": { description: "Per-key hourly limit reached (see Retry-After)", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
  ...Object.fromEntries(Object.entries(extra).map(([k, d]) => [k, { description: d, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }])),
});

export function buildOpenApi(server = "https://cortex.mnbresearch.com") {
  const paths: Record<string, any> = {};

  paths["/api/v1/whoami"] = {
    get: {
      summary: "Check a key: its workspace, scopes and expiry.",
      description: "Any working key with at least one scope.",
      security: [{ bearer: [] }, { apiKeyHeader: [] }],
      responses: { "200": { description: "The key's workspace and permissions" }, ...errorResponses() },
    },
  };
  paths["/api/v1/metrics"] = {
    get: {
      summary: "The workspace's KPIs.",
      description: "Requires scope `metrics:read`.",
      security: [{ bearer: ["metrics:read"] }, { apiKeyHeader: ["metrics:read"] }],
      responses: { "200": { description: "{ ok, metrics: [{ metric, label, value, unit, delta_pct, status }], request_id }" }, ...errorResponses() },
    },
  };
  paths["/api/v1/ingest"] = {
    post: {
      summary: "Push records into the workspace.",
      /*
        What each table ACTUALLY does — read off api_ingest in
        2026_zzzw_api_platform.sql. This used to say "upsert on each table's
        natural key" for all five, which was false for two of them: an
        integrator re-sending inventory got duplicates, and one re-sending
        leads expected updates that never happen.
      */
      description: "Requires scope `ingest:write` — or `connector:write` (every plan; the Tally bridge), which may write sales_orders, invoices, customers and inventory_items but never leads, with rows per call by plan (Try 2,000, Watch 5,000, higher plans 10,000). At most 10,000 rows and 5 MB per call. Behaviour per table: "
        + "`sales_orders` upserts on order_no, `invoices` on invoice_no, `customers` on name (existing rows are updated). "
        + "`leads` is insert-if-absent: a row whose email (or last 10 phone digits) already exists in the workspace is skipped, and existing leads are never updated. "
        + "`inventory_items` is a plain insert with no de-duplication — every row sent is added, so re-sending the same SKUs creates duplicate items. "
        + "Rows without their key (order_no, invoice_no, name; email or phone for leads) are counted in skipped_no_key and never invented.",
      security: [{ bearer: ["ingest:write"] }, { apiKeyHeader: ["ingest:write"] }, { bearer: ["connector:write"] }, { apiKeyHeader: ["connector:write"] }],
      requestBody: {
        required: true,
        content: { "application/json": { schema: {
          type: "object", required: ["table", "rows"],
          properties: {
            table: { type: "string", enum: ["sales_orders", "invoices", "inventory_items", "customers", "leads"] },
            rows: { type: "array", maxItems: 10000, items: { type: "object" } },
          },
        } } },
      },
      responses: { "200": { description: "{ ok, written, skipped_no_key, note, request_id }" }, ...errorResponses({ "413": "Too many rows or body over 5 MB — nothing written", "500": "Server-side failure (not a problem with your rows) — nothing written; safe to retry" }) },
    },
  };

  paths["/api/v1/ask"] = {
    post: {
      summary: "Ask Cortex a question about the business, in plain language.",
      description: "Requires scope `ai:ask` (Watch Pro and above). Charged in credits at the in-app chat price; refunded if the AI engine does not answer (503). Read-only — the answer cannot send messages or change data. The same capability is available to MCP clients at POST /api/mcp.",
      security: [{ bearer: ["ai:ask"] }, { apiKeyHeader: ["ai:ask"] }],
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["question"], properties: { question: { type: "string", maxLength: 4000 } } } } } },
      responses: { "200": { description: "{ ok, answer, credits_charged, balance, request_id }" }, ...errorResponses({ "402": "Not enough credits — nothing was charged", "503": "The AI engine did not answer — nothing was charged; retry", "413": "Question over 4,000 characters" }) },
    },
  };

  for (const r of RESOURCES) {
    paths[r.path] = {
      get: {
        summary: r.summary,
        description: `Requires scope \`${r.scope}\`. Keyset-paginated, newest first: pass \`next_cursor\` back as \`cursor\`. Unknown parameters are refused.`,
        security: [{ bearer: [r.scope] }, { apiKeyHeader: [r.scope] }],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: PAGE_MAX, default: PAGE_DEFAULT } },
          { name: "cursor", in: "query", schema: { type: "string" } },
          ...r.filters.map((f) => ({
            name: f.name, in: "query", description: f.doc,
            schema: f.kind === "enum" ? { type: "string", enum: [...f.values] } : f.kind === "slug" ? { type: "string", pattern: "^[a-z0-9_-]{1,40}$" } : { type: "string", format: "date" },
          })),
        ],
        responses: {
          "200": {
            description: "A page of records",
            content: { "application/json": { schema: {
              type: "object",
              properties: {
                ok: { const: true },
                data: { type: "array", items: { type: "object", properties: Object.fromEntries(r.fields.map((f) => [f.name, fieldSchema(f)])) } },
                page: { type: "object", properties: { limit: { type: "integer" }, next_cursor: { type: ["string", "null"] } } },
                request_id: { type: "string" },
              },
            } } },
          },
          ...errorResponses(),
        },
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "MNB Cortex API",
      version: API_VERSION,
      description:
        "Read and push your Cortex workspace's records. Authenticate with `Authorization: Bearer <key>` (or the `x-api-key` header). " +
        "Keys are created, rotated and revoked under Developers; each key can do only what its scopes allow, and its workspace is fixed by the key — never by a parameter. " +
        "Every response carries `request_id` and an `X-Request-Id` header. Errors are `{ ok:false, error, code, request_id }`.",
    },
    servers: [{ url: server }],
    components: {
      securitySchemes: {
        bearer: { type: "http", scheme: "bearer", description: "Scopes: " + Object.entries(API_SCOPES).map(([s, d]) => `${s} — ${d}`).join("; ") },
        apiKeyHeader: { type: "apiKey", in: "header", name: "x-api-key" },
      },
      schemas: {
        Error: {
          type: "object", required: ["ok", "error", "code", "request_id"],
          properties: { ok: { const: false }, error: { type: "string" }, code: { type: "string", enum: [...ERROR_CODES] }, request_id: { type: "string" } },
        },
        WebhookEnvelope: {
          type: "object",
          properties: { event: { type: "string", enum: [...DOC_WEBHOOK_EVENTS] }, created_at: { type: "string", format: "date-time" }, data: { type: "object" } },
        },
      },
    },
    paths,
    webhooks: Object.fromEntries(DOC_WEBHOOK_EVENTS.map((e) => [e, {
      post: {
        summary: `Cortex → your endpoint: ${e}`,
        description:
          "Signed. Headers: X-Cortex-Event, X-Cortex-Timestamp, X-Cortex-Signature = base64(HMAC-SHA256(endpoint secret, timestamp + \".\" + rawBody)). " +
          "Recompute and compare in constant time; reject stale timestamps. Failed deliveries are retried up to 5 times.",
        requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/WebhookEnvelope" } } } },
        responses: { "200": { description: "Any 2xx acknowledges the delivery" } },
      },
    }])),
  };
}
