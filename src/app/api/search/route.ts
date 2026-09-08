import { NextResponse } from "next/server";
import { searchAll, getUserAndOrg } from "@/lib/data";
import { enforce } from "@/lib/ratelimit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  One keystroke in the search box fans out to five parallel queries across
  sales_orders, invoices, inventory_items, employees and customers. Unlimited,
  that is both a cheap way to load the database from a single free account and —
  before the filter-syntax fix in searchAll — a cheap way to iterate a boolean
  oracle over columns the response never returns. The pattern is fixed at the
  source; this stops anyone grinding whatever the next one turns out to be.

  600/hour is ten searches a minute sustained for an hour, which is well past
  human typing (the client debounces) and well short of useful automation.
*/
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") || "";
  try {
    const { orgId } = await getUserAndOrg();
    if (!orgId) return NextResponse.json({ results: [] });
    if (await enforce([{ key: `search:org:${orgId}`, limit: 600, windowSecs: 3600 }])) {
      return NextResponse.json({ results: [], error: "Too many searches. Try again in a minute." }, { status: 429 });
    }
    return NextResponse.json({ results: await searchAll(q) });
  } catch { return NextResponse.json({ results: [] }); }
}
