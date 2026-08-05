import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/server";
import { verifyUnsub } from "@/lib/weekly-update";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(s: string) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function page(title: string, msg: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" /><title>${esc(title)} — MNB Cortex</title></head>
<body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f6f5;min-height:100vh;display:grid;place-items:center">
<div style="background:#fff;border-radius:14px;padding:34px 30px;max-width:460px;width:92%;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.06)">
  <div style="font-size:20px;font-weight:800;color:#1f4a3b;letter-spacing:-.01em">MNB Cortex</div>
  <h1 style="font-size:19px;margin:16px 0 8px;color:#12281f">${esc(title)}</h1>
  <p style="color:#5b6b64;font-size:14px;line-height:1.6;margin:0">${msg}</p>
  <a href="https://cortex.mnbresearch.com" style="display:inline-block;margin-top:20px;color:#2f6b54;font-weight:600;text-decoration:none;font-size:14px">Back to MNB Cortex →</a>
</div></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function optOut(rawEmail: string, token: string) {
  const email = (rawEmail || "").toLowerCase().trim();
  if (!email || !verifyUnsub(email, token)) {
    return page("Invalid link", "This unsubscribe link is invalid or has expired. To stop these emails, write to <a href=\"mailto:contact@mnbresearch.com\" style=\"color:#2f6b54\">contact@mnbresearch.com</a> and we'll remove you right away.", 400);
  }
  const sb = serviceClient();
  if (sb) {
    try {
      await sb.from("email_optouts").upsert({ email, reason: "user_unsubscribe" }, { onConflict: "email" });
    } catch { /* best effort */ }
  }
  return page("You're unsubscribed", `We've removed <b>${esc(email)}</b> from MNB Cortex product-update emails. You won't receive these any more. Changed your mind? Email <a href="mailto:contact@mnbresearch.com" style="color:#2f6b54">contact@mnbresearch.com</a>.`);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  return optOut(url.searchParams.get("e") || "", url.searchParams.get("t") || "");
}

// One-click unsubscribe (RFC 8058) — inbox providers POST this URL.
export async function POST(req: Request) {
  const url = new URL(req.url);
  return optOut(url.searchParams.get("e") || "", url.searchParams.get("t") || "");
}
