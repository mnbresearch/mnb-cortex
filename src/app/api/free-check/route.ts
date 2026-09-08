import { NextResponse } from "next/server";
import { parseCsv } from "@/lib/csv";
import { resolveHeaders } from "@/lib/import-map";
import { analyseLedger, parseAmount, type FreeCheckRow } from "@/lib/free-check";
import { clientIp, enforce } from "@/lib/ratelimit";
import { recordQuietly } from "@/lib/funnel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/*
  A REAL ANALYSIS FOR SOMEONE WITH NO ACCOUNT.

  The visitor pastes a receivables or payables export and gets back the actual
  numbers: what is outstanding, what is overdue and by how long, who holds the
  concentration, and what is sitting past 45 days for section 43B(h).

  FOUR PROPERTIES THIS ENDPOINT HAS, DELIBERATELY

  1. NOTHING IS STORED. The rows exist for the length of this request. Someone
     pasting their debtor list has not agreed to us keeping it, and asking for
     that trust before they have any reason to give it is the wrong order. Only
     the SHAPE of the result is returned; nothing is written to any table.

  2. NO MODEL IS CALLED. Every number below is arithmetic (see lib/free-check).
     An unauthenticated endpoint that spends money per request is a bill a
     stranger controls, and the first figure this product ever shows someone
     should not be a guess dressed as a total.

  3. THE HEADER MATCHING IS THE PRODUCT'S OWN. resolveHeaders and IMPORT_COLS
     are the same maps the real importer uses — the ones that already know that
     Tally writes "Particulars" and Busy writes "Voucher No". If a visitor's
     file works here it will work after they sign up, and if it does not, we
     have learned something real about their export rather than about a
     throwaway parser written for a marketing page.

  4. IT IS BOUNDED. Size, row count and rate are all capped below, because this
     is a public endpoint that does work.
*/

/** ~1 MB of text. A 12-month receivables export is well under 200 KB. */
const MAX_CHARS = 1_000_000;
/** Enough for several years of invoices; past this the answer does not change. */
const MAX_ROWS = 5_000;

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    /*
      Generous, because this is cheap and a genuine prospect may try twice with
      a better file. Tight enough that it cannot be used as a free CSV parser.
    */
    const over = await enforce([
      { key: `freecheck:ip:${ip}`, limit: 20, windowSecs: 3600 },
      { key: `freecheck:ip:day:${ip}`, limit: 60, windowSecs: 86_400 },
    ]);
    if (over) {
      return NextResponse.json({
        ok: false,
        error: "You've run a few of these already. Try again in a little while, or create a workspace to analyse as much as you like.",
      }, { status: 429 });
    }

    const body = await req.json().catch(() => ({} as any));
    const text = String((body as any)?.text || "");
    if (!text.trim()) {
      return NextResponse.json({ ok: false, error: "Paste some rows first, or choose a CSV file." }, { status: 200 });
    }
    if (text.length > MAX_CHARS) {
      return NextResponse.json({
        ok: false,
        error: "That file is larger than this free check handles. Trim it to the last 12 months, or create a workspace to import the lot.",
      }, { status: 200 });
    }

    const parsed = parseCsv(text);
    if (!parsed.length) {
      return NextResponse.json({
        ok: false,
        error: "We couldn't read any rows from that. It should be a CSV with a header row — an export from Tally, Busy, Vyapar, Zoho or Excel all work.",
      }, { status: 200 });
    }

    /*
      Reuse the importer's own column resolution. `invoices` is the right spec:
      it covers party, amount, issue date, due date and status, which is exactly
      what the analysis needs, and its synonym lists already handle the shapes
      Indian accounting software produces.
    */
    const headers = Object.keys(parsed[0] || {});
    const match = resolveHeaders("invoices", headers);

    if (!match.map.amount) {
      return NextResponse.json({
        ok: false,
        /*
          Name the columns we DID see. "Could not read your file" with no
          detail is the least useful error in software — the visitor cannot
          tell whether the problem is their file, their export settings, or us.
        */
        error: `We found the columns ${headers.slice(0, 6).map((h) => `"${h}"`).join(", ")}${headers.length > 6 ? "…" : ""}, but none of them looks like an amount. Make sure one column holds the invoice value.`,
      }, { status: 200 });
    }

    const rows: FreeCheckRow[] = parsed.slice(0, MAX_ROWS).map((row: any) => ({
      party: match.map.party ? String(row[match.map.party] ?? "") : "",
      amount: parseAmount(row[match.map.amount!]),
      issueDate: match.map.issue_date ? String(row[match.map.issue_date] ?? "") : undefined,
      dueDate: match.map.due_date ? String(row[match.map.due_date] ?? "") : undefined,
      status: match.map.status ? String(row[match.map.status] ?? "") : undefined,
    }));

    const result = analyseLedger(rows);

    /*
      THE HIGHEST-INTENT ANONYMOUS STEP IN THE WHOLE FUNNEL.

      Someone who exports their receivables and pastes them into a stranger's
      website is closer to buying than anyone who merely read the pricing page.
      Worth counting on its own, and worth knowing the shape of: `overdue`
      tells us whether the people who reach this actually HAVE a problem we
      solve, which decides whether the tool is attracting the right visitors or
      just curious ones.

      Row counts and rupee bands only — never the parties, never the amounts.
      The whole promise of this endpoint is that the file is not kept.
    */
    recordQuietly("ledger_check_run", {
      ip,
      path: "/health-check",
      meta: {
        rows: result.rows,
        usable: result.usable,
        overdue: result.overdueCount,
        hasOverdue: result.overdueValue > 0,
        datesMissing: result.datesMissing,
      },
    });

    return NextResponse.json({
      ok: true,
      result,
      truncated: parsed.length > MAX_ROWS ? parsed.length - MAX_ROWS : 0,
      matchedColumns: Object.entries(match.map)
        .filter(([, v]) => v)
        .map(([k, v]) => ({ field: k, column: v })),
    });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: "Something went wrong reading that file. If it opens in Excel, it should work here — do tell us if it doesn't.",
    }, { status: 200 });
  }
}
