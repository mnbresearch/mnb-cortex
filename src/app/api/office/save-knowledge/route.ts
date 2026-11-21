import { NextRequest, NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { listSources, createSource, upsertItems } from "@/lib/knowledge/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { orgId, user } = await getUserAndOrg().catch(() => ({ orgId: null, user: null }));
    const body = await req.json().catch(() => ({}));

    const email = String(body.email || "").slice(0, 200);
    const subject = String(body.subject || "Outlook Thread").slice(0, 300);
    const sender = String(body.sender || email || "Unknown Sender").slice(0, 200);
    const content = String(body.content || "").slice(0, 15000);
    const noteType = String(body.type || "promise_to_pay").slice(0, 50);

    if (!content.trim()) {
      return NextResponse.json({ ok: false, error: "Content is required to save knowledge." }, { status: 400 });
    }

    if (!orgId) {
      // In unauthenticated preview mode, acknowledge success so testing in taskpane is transparent
      return NextResponse.json({
        ok: true,
        preview: true,
        savedItem: {
          id: `preview-${Date.now()}`,
          title: subject,
          author: sender,
          content: content.slice(0, 150) + "...",
          type: noteType,
        },
        message: "Saved in preview mode. Sign in to your MNB Cortex workspace to persist permanently across agent swarms.",
      });
    }

    // Find or create Outlook knowledge source
    const existingSources = await listSources(orgId);
    let source = existingSources.find((s) => s.provider === "microsoft365" || s.label.toLowerCase().includes("outlook"));

    if (!source) {
      const res = await createSource({
        orgId,
        userId: user?.id || null,
        provider: "microsoft365",
        label: "Outlook Taskpane Add-in",
        account: email || user?.email || null,
        scopes: ["Mail.Read"],
        config: { channel: "outlook_taskpane" },
      });
      if (res.ok) {
        source = res.source;
      }
    }

    if (!source) {
      return NextResponse.json({ ok: false, error: "Unable to provision knowledge source for Outlook." }, { status: 500 });
    }

    const externalId = `outlook_mail_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const written = await upsertItems(source, [
      {
        kind: "email",
        external_id: externalId,
        title: subject,
        author: sender,
        occurred_at: new Date().toISOString(),
        content: `[Outlook Add-in | ${noteType.toUpperCase()}] From: ${sender} (${email})\nSubject: ${subject}\n\n${content}`,
        metadata: {
          source: "outlook_add_in",
          sender_email: email,
          note_type: noteType,
        },
      },
    ]);

    return NextResponse.json({
      ok: true,
      written,
      item: {
        externalId,
        title: subject,
        author: sender,
      },
      message: "Successfully synchronized into Company Knowledge. Autonomous Cortex agents will ground future decisions on this commitment.",
    });
  } catch (error: any) {
    console.error("Save knowledge error:", error);
    return NextResponse.json({ ok: false, error: error?.message || "Failed to save into Company Knowledge" }, { status: 500 });
  }
}
