import { NextResponse } from "next/server";
import { CLIENT_EVENTS, record, type ClientEvent } from "@/lib/funnel";
import { clientIp, enforce } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  THE ONE DOOR A BROWSER HAS INTO THE FUNNEL.

  Page views and plan clicks happen in the browser, so something has to carry
  them. This route accepts ONLY the events in CLIENT_EVENTS — never a payment,
  a signup or a subscription, which are recorded server-side where they really
  happen (a payment is counted from a verified Cashfree event, not because a
  page said "thank you").

  PRIVACY, ENFORCED HERE:
    - Global Privacy Control (`Sec-GPC: 1`) or Do Not Track (`DNT: 1`) → we
      record nothing and say so. That is the opt-out, honoured without a banner.
    - No cookie is read or set. The IP is used only to make lib/funnel.ts's
      daily salted hash and is never stored.
    - The path is reduced to its pathname (no query string) by record().
    - meta is limited to three short, enumerated keys: plan, cycle, reason.
  ABUSE: 120 events per IP per hour, so a script cannot inflate the funnel.
  Always 204 on success/no-op — the beacon has nothing to read.
*/
const PLAN_RE = /^[a-z]{2,20}$/;

export async function POST(req: Request) {
  if (req.headers.get("sec-gpc") === "1" || req.headers.get("dnt") === "1") {
    return new NextResponse(null, { status: 204, headers: { "X-Analytics": "opted-out" } });
  }
  const len = Number(req.headers.get("content-length") || 0);
  if (len > 2048) return new NextResponse(null, { status: 413 });

  let b: any = {};
  try { b = JSON.parse((await req.text()).slice(0, 2048)); } catch { return new NextResponse(null, { status: 400 }); }
  const e = String(b?.e || "");
  if (!(CLIENT_EVENTS as readonly string[]).includes(e)) return new NextResponse(null, { status: 400 });

  const ip = clientIp(req);
  const over = await enforce([{ key: `t:ip:${ip}`, limit: 120, windowSecs: 3600 }]);
  if (over) return new NextResponse(null, { status: 204 });

  const meta: Record<string, string> = {};
  if (typeof b?.plan === "string" && PLAN_RE.test(b.plan)) meta.plan = b.plan;
  if (b?.cycle === "monthly" || b?.cycle === "annual") meta.cycle = b.cycle;
  /* login_failed from the password form: a reason KIND only, never the address or the provider's message. */
  if (b?.reason === "bad_credentials" || b?.reason === "already_registered" || b?.reason === "other") meta.reason = b.reason;

  await record(e as ClientEvent, { ip, path: typeof b?.p === "string" ? b.p : null, meta });
  return new NextResponse(null, { status: 204 });
}
