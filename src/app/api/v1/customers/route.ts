import { listResource } from "@/lib/api/list";
import { resourceByPath } from "@/lib/api/resources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Fields, filters and scope live in lib/api/resources.ts — the same table the OpenAPI document is built from. */
export async function GET(req: Request) {
  return listResource(req, resourceByPath("/api/v1/customers")!);
}
