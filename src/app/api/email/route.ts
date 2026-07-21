import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/superadmin";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = () => process.env.RESEND_API_KEY;

async function resend(path: string) {
  const key = KEY();
  if (!key) return { ok: false, error: "RESEND_API_KEY not set" };
  try {
    const r = await fetch(`https://api.resend.com${path}`, { headers: { Authorization: `Bearer ${key}` } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j?.message || `Resend ${r.status}` };
    return { ok: true, data: j };
  } catch (e: any) { return { ok: false, error: e?.message || "Network error" }; }
}

export async function POST(req: Request) {
  try {
    // Account-level email data is platform data — super-admin only.
    if (!(await isSuperAdmin())) return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
    const body = await req.json().catch(() => ({} as any));
    const op = String(body?.op || "");

    if (op === "send") {
      const to = String(body.to || "").trim();
      const subject = String(body.subject || "").trim();
      const text = String(body.body || "");
      if (!to || !subject) return NextResponse.json({ ok: false, error: "Recipient and subject are required." });
      const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;font-size:14px;line-height:1.6;color:#111">
        ${text.split("\n").map((l) => `<p style="margin:0 0 10px">${l.replace(/</g, "&lt;")}</p>`).join("")}
        <p style="font-size:12px;color:#888;margin-top:24px">Sent from MNB Cortex</p></div>`;
      const res = await sendEmail(to, subject, html);
      return NextResponse.json({ ok: res.sent, error: res.sent ? undefined : res.reason, to });
    }

    if (op === "list")    return NextResponse.json(await resend("/emails"));
    if (op === "domains") return NextResponse.json(await resend("/domains"));
    if (op === "audiences") return NextResponse.json(await resend("/audiences"));

    return NextResponse.json({ ok: false, error: "Unknown operation" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 200 });
  }
}
