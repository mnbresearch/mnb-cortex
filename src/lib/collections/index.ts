import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { normalizeCustomerName } from "@/lib/customer-match";
import { draftReminder, containsForbidden, type Tone, type Channel } from "@/lib/collections/draft";

/**
 * The collections engine.
 *
 * Cortex already knows who is overdue. This is the part that does something
 * about it: pick the invoices that qualify, draft a reminder, wait for approval
 * (unless the owner has explicitly opted out of approving), send it, and stop
 * the moment the money arrives.
 *
 * EVERY GATE HERE EXISTS BECAUSE OF A SPECIFIC WAY THIS COULD GO WRONG.
 *
 * These messages go to the customer's OWN customers, signed with their name.
 * The cost of a mistake is not a support ticket, it is a business relationship.
 * So the pipeline refuses far more often than it sends:
 *
 *   paid            → the trigger in SQL closes the thread; nothing is drafted
 *   no contact      → skipped, because a reminder with nowhere to go is noise
 *                     in the log and a false sense that chasing is happening
 *   do-not-contact  → skipped, matched on NORMALISED name so "Sharma Traders"
 *                     and "sharma traders pvt ltd" are the same instruction
 *   too soon        → min_gap_days since the last message to that party
 *   too many        → max_attempts, ever, per invoice
 *   too much        → max_per_day across the whole workspace
 *   quiet hours     → nothing sends outside the owner's chosen window
 *   forbidden words → refuses to draft at all
 *
 * Nothing here sends without a row in `collection_messages` recording exactly
 * what was said, to whom, and when.
 */

/*
  Defined in lib/collections-shared so the settings form (a client component)
  can use it without importing this server-only module. Re-exported here so
  server callers keep one import.
*/
export type { Policy } from "@/lib/collections-shared";
import type { Policy } from "@/lib/collections-shared";

export const DEFAULT_POLICY: Policy = {
  enabled: false,
  auto_send: false,
  tone: "polite",
  channels: ["email"],
  first_after_days: 3,
  min_gap_days: 7,
  max_attempts: 3,
  max_per_day: 25,
  send_from_hour: 9,
  send_to_hour: 19,
  do_not_contact: [],
  signature: null,
  payment_note: null,
  whatsapp_template: null,
  whatsapp_lang: "en",
};

export type Candidate = {
  invoiceId: string;
  invoiceNo: string | null;
  party: string;
  amount: number;
  dueDate: string | null;
  daysPastDue: number;
  attempts: number;
  threadId: string | null;
  /** null when it qualifies; otherwise why it was skipped. */
  blockedBy: string | null;
  contact: { email: string | null; phone: string | null };
};

export async function getPolicy(orgId: string): Promise<Policy> {
  const svc = serviceClient();
  if (!svc) return DEFAULT_POLICY;
  try {
    const { data } = await svc.from("collection_policies").select("*").eq("org_id", orgId).maybeSingle();
    if (!data) return DEFAULT_POLICY;
    return {
      ...DEFAULT_POLICY,
      ...(data as any),
      channels: Array.isArray((data as any).channels) && (data as any).channels.length
        ? (data as any).channels : DEFAULT_POLICY.channels,
      do_not_contact: Array.isArray((data as any).do_not_contact) ? (data as any).do_not_contact : [],
    };
  } catch { return DEFAULT_POLICY; }
}

/** Local hour in IST, which is where every customer of this product is. */
export function istHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false,
  }).format(now));
}

/**
 * Midnight IST, as an instant.
 *
 * Not `setHours(0,0,0,0)`, which uses the server's timezone — UTC on Vercel.
 * Built from the IST calendar date so the daily cap resets when the owner's day
 * does, not at 05:30 their time.
 */
export function istStartOfDay(now = new Date()): Date {
  const [d, m, y] = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(now).split("/");
  // IST is UTC+5:30 with no daylight saving, so this is exact.
  return new Date(`${y}-${m}-${d}T00:00:00+05:30`);
}

/**
 * Is now inside the workspace's sending window?
 *
 * THE INVERTED CASE, which used to silently disable sending entirely.
 *
 * The old expression was `h >= from && h < to`. Set from=19 and to=9 — an
 * overnight window, which is not a sensible dunning window but IS a thing the
 * settings form accepts — and that is `h >= 19 && h < 9`, false at every hour
 * of the day. Collections then reported "outside your sending window" forever
 * and nothing ever went out, with no error anywhere to explain it.
 *
 * A wrapping window is now read as wrapping. Equal hours mean a zero-length
 * window, which we treat as "always" rather than "never": someone who has set
 * from and to the same has not asked for silence, they have misunderstood the
 * field, and refusing to send forever is the worse reading of it.
 */
export function withinQuietHours(p: Policy, now = new Date()): boolean {
  const h = istHour(now);
  const from = Number(p.send_from_hour), to = Number(p.send_to_hour);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return true;
  return from < to ? h >= from && h < to : h >= from || h < to;
}

/**
 * Everything overdue, annotated with whether it may be chased and why not.
 *
 * Returns blocked candidates too, rather than filtering them out. An owner
 * looking at this screen needs to see "Patel & Co — no email on file" or
 * "excluded by you", because a silently short list looks like the feature is
 * not working.
 */
export async function findCandidates(orgId: string, policy?: Policy): Promise<Candidate[]> {
  const svc = serviceClient();
  if (!svc) return [];
  const p = policy ?? await getPolicy(orgId);

  let invoices: any[] = [];
  try {
    const { data } = await svc.from("invoices")
      .select("id, invoice_no, party, amount, due_date, status")
      .eq("org_id", orgId).eq("type", "receivable").or("status.is.null,status.not.ilike.paid")
      .limit(500);
    invoices = (data as any[]) || [];
  } catch { return []; }

  const [threadsRes, customersRes] = await Promise.all([
    svc.from("collection_threads").select("id, invoice_id, attempts, status, last_sent_at").eq("org_id", orgId).limit(500),
    svc.from("customers").select("name, company, email, phone").eq("org_id", orgId).limit(2000),
  ]);
  const threads = new Map(((threadsRes.data as any[]) || []).map((t) => [String(t.invoice_id), t]));

  // Contact lookup by normalised name, so "Sharma Traders Pvt Ltd" on the
  // invoice finds "Sharma Traders" in the customer list.
  const contacts = new Map<string, { email: string | null; phone: string | null }>();
  for (const c of ((customersRes.data as any[]) || [])) {
    for (const key of [c.name, c.company] as (string | null)[]) {
      const n = normalizeCustomerName(String(key ?? ""));
      if (n && !contacts.has(n)) contacts.set(n, { email: c.email || null, phone: c.phone || null });
    }
  }

  const dnc = new Set(p.do_not_contact.map((x) => normalizeCustomerName(x)).filter((x): x is string => Boolean(x)));
  const now = Date.now();
  const out: Candidate[] = [];

  for (const inv of invoices) {
    const due = inv.due_date ? new Date(inv.due_date).getTime() : null;
    const daysPastDue = due ? Math.floor((now - due) / 86_400_000) : 0;
    const thread = threads.get(String(inv.id));
    /*
      normalizeCustomerName returns null for a name that normalises to nothing
      (blank, or punctuation only). Falling back to "" keeps the lookup honest:
      an unnamed party matches no contact and no do-not-contact entry, which is
      the safe outcome — rather than matching everything, which is what a
      non-null assertion here would risk.
    */
    const norm = normalizeCustomerName(String(inv.party || "")) || "";
    const contact = (norm && contacts.get(norm)) || { email: null, phone: null };

    let blockedBy: string | null = null;

    if (!due) blockedBy = "No due date on this invoice";
    else if (daysPastDue < p.first_after_days) {
      blockedBy = daysPastDue < 0
        ? "Not due yet"
        : `Waiting until ${p.first_after_days} days past due`;
    } else if (dnc.has(norm)) blockedBy = "On your do-not-contact list";
    else if (thread?.status === "recovered") blockedBy = "Already paid";
    else if (thread?.status === "excluded") blockedBy = "Excluded by you";
    else if ((thread?.attempts ?? 0) >= p.max_attempts) blockedBy = `Reached ${p.max_attempts} reminders`;
    else if (thread?.last_sent_at &&
             now - new Date(thread.last_sent_at).getTime() < p.min_gap_days * 86_400_000) {
      blockedBy = `Last reminder was under ${p.min_gap_days} days ago`;
    } else if (!contact.email && !contact.phone) {
      blockedBy = "No email or phone on file for this customer";
    }

    out.push({
      invoiceId: String(inv.id),
      invoiceNo: inv.invoice_no ?? null,
      party: String(inv.party || "Unknown"),
      amount: Number(inv.amount) || 0,
      dueDate: inv.due_date ?? null,
      daysPastDue: Math.max(0, daysPastDue),
      attempts: thread?.attempts ?? 0,
      threadId: thread ? String(thread.id) : null,
      blockedBy,
      contact,
    });
  }

  // Biggest and oldest first — that is the order an owner would chase in.
  out.sort((a, b) =>
    (a.blockedBy ? 1 : 0) - (b.blockedBy ? 1 : 0) ||
    b.amount - a.amount ||
    b.daysPastDue - a.daysPastDue);
  return out;
}

export type PrepareResult = { drafted: number; skipped: number; reasons: Record<string, number> };

/**
 * Draft the next reminder for every invoice that qualifies.
 *
 * Creates the thread if it does not exist, writes ONE message per invoice in
 * `draft` status, and stops there. Nothing is sent by this function — sending
 * is a separate, explicit step, because a single function that both decides and
 * sends is one bug away from mailing everybody.
 */
export async function prepareDrafts(orgId: string, businessName: string, limit = 25): Promise<PrepareResult> {
  const svc = serviceClient();
  const reasons: Record<string, number> = {};
  if (!svc) return { drafted: 0, skipped: 0, reasons };

  const p = await getPolicy(orgId);
  if (!p.enabled) return { drafted: 0, skipped: 0, reasons: { "Collections is switched off": 1 } };

  const candidates = await findCandidates(orgId, p);
  let drafted = 0, skipped = 0;

  /* Resolved once, and only when WhatsApp is a channel this policy uses. */
  const waGate = p.channels.includes("whatsapp")
    ? await (await import("@/lib/collections/whatsapp")).collectionsWhatsAppGate(
        orgId, p.whatsapp_template, p.whatsapp_lang)
    : null;

  for (const c of candidates) {
    if (drafted >= Math.min(limit, p.max_per_day)) break;
    if (c.blockedBy) { skipped++; reasons[c.blockedBy] = (reasons[c.blockedBy] || 0) + 1; continue; }

    const channel: Channel = c.contact.email ? "email" : "whatsapp";

    /*
      Do not draft a WhatsApp reminder a workspace cannot send.

      The send-time gate would catch it, but only after the owner had read the
      draft, approved it, and watched it not go out. Refusing at draft time puts
      the reason on the screen where they are already looking, and keeps the
      queue honest about what will actually happen.
    */
    if (channel === "whatsapp" && waGate && !waGate.ok) {
      skipped++;
      reasons[waGate.reason] = (reasons[waGate.reason] || 0) + 1;
      continue;
    }

    if (!p.channels.includes(channel)) {
      skipped++;
      const why = `Only ${p.channels.join(" and ")} is enabled, and this customer has no ${p.channels.join("/")}`;
      reasons[why] = (reasons[why] || 0) + 1;
      continue;
    }

    const { subject, body } = draftReminder({
      party: c.party, invoiceNo: c.invoiceNo, amount: c.amount, dueDate: c.dueDate,
      daysPastDue: c.daysPastDue, attempt: c.attempts + 1, tone: p.tone,
      businessName, signature: p.signature, paymentNote: p.payment_note, channel,
    });

    /*
      The signature and payment note are free text the OWNER typed. If they have
      written something that reads as a threat, refuse rather than append it —
      it would otherwise go out under their name on every reminder.
    */
    const bad = containsForbidden(body);
    if (bad) {
      skipped++;
      const why = `Your signature or payment note contains "${bad}" — Cortex will not send that`;
      reasons[why] = (reasons[why] || 0) + 1;
      continue;
    }

    let threadId = c.threadId;
    if (!threadId) {
      const { data, error } = await svc.from("collection_threads").insert({
        org_id: orgId, invoice_id: c.invoiceId, party: c.party,
        amount: c.amount, due_date: c.dueDate, status: "open",
      }).select("id").single();
      if (error || !data) { skipped++; continue; }
      threadId = String((data as any).id);
    }

    /*
      Never queue a second unsent message for the same thread.

      `attempts` and `last_sent_at` only advance on a real SEND, so between
      drafting and sending nothing in findCandidates() blocks a repeat. Without
      this check the daily cron drafted the same reminder every day, and the
      owner approving the list would fire N identical emails at one debtor in
      one run.
    */
    const { data: already } = await svc.from("collection_messages")
      .select("id").eq("thread_id", threadId).in("status", ["draft", "approved"]).limit(1);
    if (already && already.length) {
      skipped++;
      const why = "A reminder is already waiting to be sent for this invoice";
      reasons[why] = (reasons[why] || 0) + 1;
      continue;
    }

    const { error: msgErr } = await svc.from("collection_messages").insert({
      org_id: orgId, thread_id: threadId, attempt: c.attempts + 1,
      channel, recipient: channel === "email" ? c.contact.email : c.contact.phone,
      subject, body,
      // auto_send still produces a row first; it is approved, not skipped.
      status: p.auto_send ? "approved" : "draft",
      approved_at: p.auto_send ? new Date().toISOString() : null,
    });
    if (msgErr) { skipped++; continue; }
    drafted++;

    /*
      `invoice.overdue` is offered in the webhook UI and had no emitter — a
      customer could subscribe and wait forever. Here is the right place for
      it: this is the moment the product first decides an invoice is past due
      AND chaseable, so the event carries the same judgement the reminder does
      rather than a bare date comparison a customer could make themselves.

      Once per thread, on the FIRST reminder only. Firing on every attempt
      would turn one late invoice into three identical webhooks.
    */
    if (c.attempts === 0) {
      try {
        const { emitQuietly } = await import("@/lib/webhooks");
        emitQuietly(orgId, "invoice.overdue", {
          invoice_id: c.invoiceId, invoice_no: c.invoiceNo, party: c.party,
          amount: c.amount, due_date: c.dueDate, days_past_due: c.daysPastDue,
        });
      } catch { /* webhooks are best-effort; never block a draft */ }
    }
  }

  return { drafted, skipped, reasons };
}

export type SendResult = { sent: number; failed: number; held: number; note?: string };

/**
 * Send everything that has been approved.
 *
 * Only `approved` messages. A draft is never sent, whatever else is true —
 * which is what makes the approval step meaningful rather than decorative.
 */
export async function sendApproved(orgId: string, origin?: string): Promise<SendResult> {
  const svc = serviceClient();
  if (!svc) return { sent: 0, failed: 0, held: 0 };

  /*
    Who the reminder is FROM. The workspace name, and its own sending address if
    it has connected one — never ours. Resolved once per run rather than per
    message.
  */
  let businessName = "our company";
  const sender: { from: string | null; replyTo: string | null } = { from: null, replyTo: null };
  try {
    const { data: org } = await svc.from("organizations").select("name").eq("id", orgId).single();
    businessName = String((org as any)?.name || businessName);
  } catch { /* fall back to the generic name */ }
  try {
    const { credentialsFor } = await import("@/lib/credentials");
    const c = await credentialsFor(orgId, "resend");
    const own = String((c as any)?.from_email || "").trim();
    if (own) { sender.from = `${businessName} <${own}>`; sender.replyTo = own; }
  } catch { /* no own domain connected — relay, clearly labelled */ }
  if (!sender.replyTo) {
    try {
      const { data: p2 } = await svc.from("collection_policies").select("reply_to").eq("org_id", orgId).maybeSingle();
      sender.replyTo = String((p2 as any)?.reply_to || "").trim() || null;
    } catch { /* column not migrated yet */ }
  }

  /*
    The platform switch, checked HERE rather than only in the UI.

    A kill switch that lives in a page is not a kill switch — the cron does not
    render pages. This is the last gate before a message leaves, so flipping the
    switch stops every workspace within one cron cycle without a deploy.

    Fails OPEN on error, deliberately. If the switches table is unreachable the
    correct behaviour is to keep working: a database blip must not silently stop
    every customer's collections with no indication why. The switch exists to be
    used deliberately, not to become a single point of failure.
  */
  try {
    const { data } = await svc.rpc("cortex_collections_enabled");
    if (data === false) {
      return { sent: 0, failed: 0, held: 0, note: "Sending is paused across Cortex right now. Your drafts are safe and will go out once it resumes." };
    }
  } catch { /* switch unreadable — carry on rather than halt everyone */ }

  const p = await getPolicy(orgId);
  if (!p.enabled) return { sent: 0, failed: 0, held: 0, note: "Collections is switched off." };
  if (!withinQuietHours(p)) {
    return { sent: 0, failed: 0, held: 0, note: `Outside your sending window (${p.send_from_hour}:00–${p.send_to_hour}:00 IST).` };
  }

  /*
    Daily ceiling, counted from what has actually gone out today — where
    "today" means the IST day.

    `new Date().setHours(0,0,0,0)` uses the SERVER's timezone, and the server is
    a Vercel function running in UTC. So the counter reset at 05:30 IST, in the
    middle of the night but before the 09:00 sending window: harmless. The real
    problem is the other end — a send at 23:00 IST on Monday is 17:30 UTC
    Monday, but one at 06:00 IST Tuesday is 00:30 UTC Tuesday, so the window
    that the cap governs does not line up with the day the owner set it for.
    Someone who sets "25 a day" is talking about their working day.
  */
  const startOfDay = istStartOfDay();
  const { count: sentToday } = await svc.from("collection_messages")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId).eq("status", "sent").gte("sent_at", startOfDay.toISOString());
  const room = Math.max(0, p.max_per_day - (sentToday || 0));
  if (room === 0) return { sent: 0, failed: 0, held: 0, note: `Daily limit of ${p.max_per_day} already reached.` };

  const { data: queue } = await svc.from("collection_messages")
    .select("id, thread_id, channel, recipient, subject, body, attempt")
    .eq("org_id", orgId).eq("status", "approved")
    .order("created_at", { ascending: true }).limit(room);

  let sent = 0, failed = 0, skipped = 0;

  /*
    Resolve the WhatsApp gate ONCE, and only if the queue actually contains a
    WhatsApp message — the check decrypts credentials, and an email-only
    workspace should not pay for it.

    See lib/collections/whatsapp.ts for the two bugs this closes: sending every
    tenant's dunning from OUR number, and using free-form text on recipients
    who by definition have not opened a 24-hour window.
  */
  const wantsWhatsApp = ((queue as any[]) || []).some((m) => m.channel === "whatsapp");
  const waGate = wantsWhatsApp
    ? await (await import("@/lib/collections/whatsapp")).collectionsWhatsAppGate(
        orgId, p.whatsapp_template, p.whatsapp_lang)
    : null;

  for (const m of ((queue as any[]) || [])) {
    if (!m.recipient) {
      await svc.from("collection_messages").update({ status: "skipped", error: "No recipient on file" }).eq("id", m.id);
      continue;
    }

    /*
      Re-assert the limits HERE, per message, not only at draft time.

      A queue built over several days outlives the state it was checked against.
      Without this: the attempt cap is bypassed (five queued messages all send,
      taking attempts to 5 against a max of 3), the minimum gap is bypassed
      (everything goes in one run), and — worst — a party the owner added to the
      do-not-contact list AFTER the draft existed still gets messaged. That last
      one is precisely the "I told it not to contact them and it did" incident.
    */
    /*
      `invoices(invoice_no)` is embedded rather than fetched separately: the
      WhatsApp template needs the invoice number as a positional parameter, and
      one round trip per message in a 25-message run is not free.
    */
    const { data: th0 } = await svc.from("collection_threads")
      .select("attempts, last_sent_at, status, party, amount, invoices(invoice_no)")
      .eq("id", m.thread_id).single();
    const t0: any = th0 || {};
    const partyNorm = normalizeCustomerName(String(t0.party || "")) || "";
    const dncNow = new Set(p.do_not_contact.map((x) => normalizeCustomerName(x)).filter((x): x is string => Boolean(x)));

    let refuse: string | null = null;
    if (t0.status === "recovered") refuse = "Invoice was paid";
    else if (t0.status === "excluded") refuse = "Excluded from collections";
    else if (Number(t0.attempts || 0) >= p.max_attempts) refuse = `Already sent ${p.max_attempts} reminders`;
    else if (partyNorm && dncNow.has(partyNorm)) refuse = "Added to your do-not-contact list";
    else if (t0.last_sent_at &&
             Date.now() - new Date(t0.last_sent_at).getTime() < p.min_gap_days * 86_400_000) {
      refuse = `Last reminder was under ${p.min_gap_days} days ago`;
    }
    if (refuse) {
      await svc.from("collection_messages")
        .update({ status: "cancelled", error: refuse }).eq("id", m.id);
      continue;
    }

    /*
      WhatsApp not set up: skip, do not fail.

      This is the fix for the failure that disabled the working channel. A
      workspace with no Meta account produces a refusal on EVERY run — it is a
      standing fact, not a transient error — and the breaker trips on
      `failed > 0 && sent === 0`. Recording it as a failure therefore guaranteed
      that an unconfigured WhatsApp would switch the entire policy off within
      one day, silently stopping the email reminders that were working fine.

      'skipped' is not counted by cortex_collections_trip_check. The message
      stays visible with the reason attached, so the owner sees the sentence
      that tells them what to connect.
    */
    if (m.channel === "whatsapp" && waGate && !waGate.ok) {
      await svc.from("collection_messages")
        .update({ status: "skipped", error: waGate.reason.slice(0, 300) }).eq("id", m.id);
      skipped++;
      continue;
    }

    /*
      Claim before sending, exactly as the alert digest and workflow scheduler
      do. Two overlapping cron runs must not both deliver the same reminder —
      a duplicate dunning message is the specific thing this module exists to
      avoid doing.
    */
    const { data: claimed } = await svc.from("collection_messages")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", m.id).eq("status", "approved").select("id");
    if (!claimed || !claimed.length) continue;

    let ok = false; let err: string | undefined; let providerId: string | undefined;
    try {
      if (m.channel === "email") {
        const { sendEmail } = await import("@/lib/email");
        const { reminderEnvelope } = await import("@/lib/collections/envelope");
        /*
          NOT brandFrom()/renderBrandedEmail(). Those are our product wrapper —
          using them here sent a debt notice from "MNB Cortex" with a reply-to
          at contact@mnbresearch.com, so the debtor's "already paid" reply came
          to us and the owner never saw it. See lib/collections/envelope.ts.
        */
        const env = reminderEnvelope({
          businessName, body: m.body,
          ownFrom: sender.from, replyTo: sender.replyTo,
        });
        const r = await sendEmail(m.recipient, m.subject || "Payment reminder", env.html,
          { from: env.from, replyTo: env.replyTo });
        ok = r.sent; err = r.reason;
      } else if (waGate && waGate.ok) {
        /*
          A template, never sendText().

          Meta permits free-form only inside a 24-hour window the RECIPIENT
          opened by messaging the business. Someone being chased for money has
          not done that, so every sendText() here returned error 131047 — an
          error that could not be fixed by retrying, because the channel was
          being used in a way the platform does not allow.

          The parameters are positional and their order is fixed by the template
          the customer had approved. TEMPLATE_VARIABLES and SETUP.md both
          document the order, so what they submit and what we fill agree.
        */
        const { sendReminderTemplate } = await import("@/lib/collections/whatsapp");
        const r = await sendReminderTemplate({
          orgId, to: m.recipient,
          template: waGate.template, lang: waGate.lang,
          party: String(t0.party || "there"),
          businessName,
          invoiceNo: String((t0 as any)?.invoices?.invoice_no || "").trim() || "your invoice",
          amount: `₹${Number(t0.amount || 0).toLocaleString("en-IN")}`,
        });
        ok = r.sent; err = r.error; providerId = r.id;
      } else {
        /* Unreachable: the gate check above skips these. Belt and braces —
           never fall through to a send with no verified sender. */
        ok = false; err = "WhatsApp is not configured for this workspace.";
      }
    } catch (e: any) { ok = false; err = e?.message || "send failed"; }

    if (ok) {
      sent++;
      await svc.from("collection_messages").update({ provider_id: providerId ?? null }).eq("id", m.id);
      // Advance the thread only on a real send.
      const { data: th } = await svc.from("collection_threads")
        .select("attempts").eq("id", m.thread_id).single();
      const attempts = Number((th as any)?.attempts || 0) + 1;
      await svc.from("collection_threads").update({
        attempts,
        last_sent_at: new Date().toISOString(),
        next_due_at: new Date(Date.now() + p.min_gap_days * 86_400_000).toISOString(),
        status: attempts >= p.max_attempts ? "exhausted" : "open",
      }).eq("id", m.thread_id);
    } else {
      failed++;
      // Put it back so a transient failure is retried rather than lost.
      await svc.from("collection_messages")
        .update({ status: "failed", sent_at: null, error: (err || "send failed").slice(0, 300) })
        .eq("id", m.id);
    }
  }

  /*
    Let the workspace trip its own breaker.

    The realistic failure is an expired WhatsApp token: every send fails, and
    without this the same messages are re-presented every run, burning the
    customer's provider quota to rediscover the same broken credential. The SQL
    only trips when there have been repeated failures AND nothing has got
    through, so an occasional bounce on a busy workspace does not switch it off.
  */
  if (failed > 0 && sent === 0) {
    try { await svc.rpc("cortex_collections_trip_check", { p_org: orgId }); }
    catch { /* breaker not migrated yet — the sends already failed safely */ }
  }

  /*
    `skipped` is reported but deliberately excluded from the breaker condition
    above. A run of 10 WhatsApp skips and 0 sends means "you have not connected
    WhatsApp", which switching collections off would not fix — it would only
    also stop the email that works.
  */
  return {
    sent, failed, held: skipped,
    note: skipped > 0 && sent === 0 && failed === 0
      ? `${skipped} reminder${skipped === 1 ? "" : "s"} could not be sent by WhatsApp — see the reason on each. Email reminders are unaffected.`
      : undefined,
  };
}

export type Recovery = {
  invoicesRecovered: number; amountRecovered: number;
  messagesSent: number; stillChasing: number; amountChasing: number;
};

/** What Cortex actually recovered. Conservative by construction — see the SQL. */
export async function getRecovery(orgId: string, days = 90): Promise<Recovery> {
  const svc = serviceClient();
  const empty: Recovery = { invoicesRecovered: 0, amountRecovered: 0, messagesSent: 0, stillChasing: 0, amountChasing: 0 };
  if (!svc) return empty;
  try {
    const { data, error } = await svc.rpc("cortex_recovery_summary", { p_org: orgId, p_days: days });
    if (error) return empty;
    const r = (Array.isArray(data) ? data[0] : data) as any;
    return {
      invoicesRecovered: Number(r?.invoices_recovered) || 0,
      amountRecovered: Number(r?.amount_recovered) || 0,
      messagesSent: Number(r?.messages_sent) || 0,
      stillChasing: Number(r?.still_chasing) || 0,
      amountChasing: Number(r?.amount_chasing) || 0,
    };
  } catch { return empty; }
}
