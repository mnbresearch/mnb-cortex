"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { saveCollectionPolicy } from "@/lib/actions";
import type { Policy } from "@/lib/collections-shared";

const I = "rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring";

/**
 * The rules Cortex chases by.
 *
 * Every control here is a limit rather than a capability — how long to wait,
 * how far apart, how many, between what hours, and who never. That is
 * deliberate: the risk in this module is doing too much, not too little, so the
 * settings screen is shaped like a set of brakes.
 *
 * Auto-send is presented last and framed honestly, because it is the one switch
 * that removes the human from the loop.
 */
export function CollectionsSettings({ policy, whatsappReady }: { policy: Policy; whatsappReady: boolean }) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [channels, setChannels] = useState<string[]>(policy.channels);

  async function onSubmit(fd: FormData) {
    setSaving(true); setMsg(null);
    fd.set("channels", channels.join(","));
    try {
      const r = await saveCollectionPolicy(fd);
      setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error || "Could not save." });
    } catch { setMsg({ ok: false, text: "Could not reach the server." }); }
    finally { setSaving(false); }
  }

  return (
    <Card className="p-5">
      <form action={onSubmit} className="space-y-5">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="enabled" value="1" defaultChecked={policy.enabled} className="mt-1" />
          <span>
            <span className="font-medium">Collections is on</span>
            <span className="block text-muted-foreground">Cortex drafts reminders for overdue invoices. Nothing sends until you approve it.</span>
          </span>
        </label>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="text-sm">
            <span className="text-muted-foreground block mb-1">First reminder after</span>
            <input className={I + " w-full"} type="number" name="first_after_days" min={0} max={90} defaultValue={policy.first_after_days} />
            <span className="text-xs text-muted-foreground">days past the due date</span>
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground block mb-1">Wait between reminders</span>
            <input className={I + " w-full"} type="number" name="min_gap_days" min={1} max={90} defaultValue={policy.min_gap_days} />
            <span className="text-xs text-muted-foreground">days</span>
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground block mb-1">Most reminders per invoice</span>
            <input className={I + " w-full"} type="number" name="max_attempts" min={1} max={10} defaultValue={policy.max_attempts} />
            <span className="text-xs text-muted-foreground">then Cortex stops</span>
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground block mb-1">Most per day</span>
            <input className={I + " w-full"} type="number" name="max_per_day" min={1} max={200} defaultValue={policy.max_per_day} />
            <span className="text-xs text-muted-foreground">across the whole workspace</span>
          </label>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="text-muted-foreground block mb-1">Tone</span>
            <select className={I + " w-full"} name="tone" defaultValue={policy.tone}>
              <option value="polite">Polite</option>
              <option value="neutral">Neutral</option>
              <option value="firm">Firm</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground block mb-1">Send from</span>
            <input className={I + " w-full"} type="number" name="send_from_hour" min={0} max={23} defaultValue={policy.send_from_hour} />
            <span className="text-xs text-muted-foreground">hour, IST</span>
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground block mb-1">Send until</span>
            <input className={I + " w-full"} type="number" name="send_to_hour" min={0} max={23} defaultValue={policy.send_to_hour} />
            <span className="text-xs text-muted-foreground">nothing sends at night</span>
          </label>
        </div>

        <div>
          <div className="text-sm text-muted-foreground mb-1.5">Channels</div>
          <div className="flex flex-wrap gap-2">
            {(["email", "whatsapp"] as const).map((c) => {
              const on = channels.includes(c);
              const blocked = c === "whatsapp" && !whatsappReady;
              return (
                <button key={c} type="button" disabled={blocked}
                  onClick={() => setChannels((s) => on ? s.filter((x) => x !== c) : [...s, c])}
                  className={`rounded-lg border px-3 h-9 text-sm transition-colors ${
                    on ? "bg-primary/10 text-primary border-primary/30" : "text-muted-foreground hover:text-foreground"
                  } ${blocked ? "opacity-50 cursor-not-allowed" : ""}`}>
                  {on && <Check className="h-3.5 w-3.5 inline mr-1" />}
                  {c === "email" ? "Email" : "WhatsApp"}
                  {blocked && " — connect your account first"}
                </button>
              );
            })}
          </div>
        </div>

        {/*
          The approved template.

          Only shown when WhatsApp is selected, because it is meaningless
          otherwise — but it is REQUIRED once it is, and the copy below says so
          plainly rather than letting an owner discover it from a run of
          skipped messages. WhatsApp does not allow a business to message
          somebody who has not messaged them first unless the message uses a
          template Meta approved in advance, and a customer being chased for
          money has never messaged them. There is no way around that from our
          side, so the honest thing is to explain it here.
        */}
        {channels.includes("whatsapp") && (
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-2">
            <label className="text-sm block">
              <span className="text-muted-foreground block mb-1">Your approved WhatsApp template name</span>
              <input className={I + " w-full"} name="whatsapp_template"
                defaultValue={policy.whatsapp_template || ""}
                placeholder="payment_reminder" autoCapitalize="none" spellCheck={false} />
            </label>
            <p className="text-xs text-muted-foreground">
              WhatsApp will not deliver a message to someone who has not messaged you first unless it
              uses a template Meta approved in advance. Create one in Meta Business Manager →
              WhatsApp Manager → Message templates, category <strong>Utility</strong>, with four
              variables in this order: customer name, your business name, invoice number, amount.
              Approval usually takes under an hour. Then paste the template&rsquo;s exact name here.
              Until you do, WhatsApp reminders are skipped — your email reminders are unaffected.
            </p>
            <label className="text-sm block">
              <span className="text-muted-foreground block mb-1">Template language code</span>
              <input className={I + " w-32"} name="whatsapp_lang"
                defaultValue={policy.whatsapp_lang || "en"} placeholder="en"
                autoCapitalize="none" spellCheck={false} />
              <span className="text-xs text-muted-foreground block mt-1">
                Meta treats <code>en</code> and <code>en_US</code> as different templates. Copy
                whichever appears next to yours.
              </span>
            </label>
          </div>
        )}

        <label className="text-sm block">
          <span className="text-muted-foreground block mb-1">Never contact these customers</span>
          <textarea className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y"
            rows={3} name="do_not_contact" defaultValue={policy.do_not_contact.join("\n")}
            placeholder={"One name per line\nSharma Traders\nYour biggest client"} />
          <span className="text-xs text-muted-foreground">
            Matched loosely, so &ldquo;Sharma Traders&rdquo; also covers &ldquo;Sharma Traders Pvt Ltd&rdquo;.
          </span>
        </label>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm block">
            <span className="text-muted-foreground block mb-1">Sign off as</span>
            <input className={I + " w-full"} name="signature" defaultValue={policy.signature || ""} placeholder="Ramesh, Accounts — Sharma Steel" />
          </label>
          <label className="text-sm block">
            <span className="text-muted-foreground block mb-1">How to pay</span>
            <input className={I + " w-full"} name="payment_note" defaultValue={policy.payment_note || ""} placeholder="UPI: sharmasteel@hdfc · A/c 5011… IFSC HDFC0000…" />
          </label>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          A reminder without payment details is just nagging — this line goes at the end of every message.
        </p>

        {/*
          Presented last and described honestly. This is the only setting that
          removes the human, and an owner should choose it with their eyes open
          rather than discover it in a checkbox they skimmed.
        */}
        <label className="flex items-start gap-3 text-sm rounded-lg border border-warning/30 bg-warning/5 p-3">
          <input type="checkbox" name="auto_send" value="1" defaultChecked={policy.auto_send} className="mt-1" />
          <span>
            <span className="font-medium">Send without asking me</span>
            <span className="block text-muted-foreground">
              Cortex approves its own drafts and sends them within your limits and hours. Most workspaces should leave
              this off — the drafting and tracking is where the value is, and the cost of one wrong message to a good
              customer is far higher than the minute it takes to approve.
            </span>
          </span>
        </label>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save settings
          </Button>
          {msg && (
            <span className={`text-sm inline-flex items-center gap-1.5 ${msg.ok ? "text-success" : "text-danger"}`}>
              {msg.ok ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />} {msg.text}
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}
