"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Gift, Share2 } from "lucide-react";

/**
 * The share half of Refer & Earn.
 *
 * WHAT CHANGED AND WHY IT MATTERED.
 *
 * This component used to invent its own referral code with `Math.random()` and
 * keep it in localStorage. That made it per-DEVICE — the same owner on a phone
 * and a laptop had two different codes — and nothing in the codebase ever read
 * `?ref=`, so neither one meant anything. Alongside it, three cards promised
 * "They start a 14-day trial — no card needed" and "you each get a free month".
 *
 * Both promises were false. TRIAL_DAYS is 0 and the Terms page says outright
 * that there is no free trial, so the product was contradicting the contract
 * the customer had already accepted; and with no referrals table there was no
 * mechanism to notice a referral, let alone honour one.
 *
 * The code is now passed in from the database via the page (stable, unique,
 * ambiguous characters excluded), and the copy describes the reward that the
 * settlement path actually grants.
 */
export function ReferralWidget({
  code,
  reward,
  signedIn,
}: {
  code: string | null;
  reward: number;
  signedIn: boolean;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://cortex.mnbresearch.com";
  const link = code ? `${origin}/?ref=${code}` : origin;
  const msg =
    `I run my business on MNB Cortex — an AI COO that reads your numbers, spots problems early ` +
    `and tells you what to do next. Have a look: ${link}`;

  function copy(text: string, what: string) {
    navigator.clipboard?.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="space-y-4">
      <Card className="p-6 text-center relative overflow-hidden">
        <div className="aurora opacity-60" aria-hidden />
        <div className="relative z-10">
          <div className="h-12 w-12 rounded-full brand-gradient grid place-items-center text-white mx-auto">
            <Gift className="h-6 w-6" />
          </div>
          <h2 className="mt-3 text-xl font-bold">Introduce a business, you both get credits</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl mx-auto leading-6">
            When a business you introduce starts a paid plan, you each receive{" "}
            <span className="font-medium text-foreground tabular-nums">{reward.toLocaleString("en-IN")} AI credits</span>.
          </p>

          {signedIn && code ? (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <code className="rounded-lg border bg-background px-3 h-10 inline-flex items-center text-sm font-mono tracking-wider">
                {code}
              </code>
              <Button variant="outline" onClick={() => copy(link, "link")}>
                {copied === "link" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied === "link" ? "Copied" : "Copy link"}
              </Button>
              <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer">
                <Button><Share2 className="h-4 w-4" /> Share on WhatsApp</Button>
              </a>
            </div>
          ) : (
            /*
              No invented placeholder code. The old version rendered "MNB-XXXX"
              before hydration and a random one after, both meaningless.
            */
            <p className="mt-5 text-sm text-muted-foreground">
              Sign in to get your referral link.
            </p>
          )}
        </div>
      </Card>

      <div className="grid sm:grid-cols-3 gap-3">
        {[
          ["1. Share your link", "Send it to another business owner who would get something out of it."],
          ["2. They sign up and subscribe", "The link is remembered for 90 days, so they can take their time deciding."],
          ["3. You both get credits", `${reward.toLocaleString("en-IN")} credits each, added automatically once their plan is active.`],
        ].map(([t, d]) => (
          <Card key={t} className="p-4">
            <div className="font-medium text-sm">{t}</div>
            <div className="text-sm text-muted-foreground mt-1 leading-6">{d}</div>
          </Card>
        ))}
      </div>

      {/*
        Stated up front rather than discovered later. The previous copy created
        an expectation of a reward at signup; making the qualifying event
        explicit is the difference between a programme and a complaint.
      */}
      <p className="text-xs text-muted-foreground px-1">
        Credits are granted once, when the business you introduced first pays for a plan. A workspace can
        only be referred by one person, and you cannot refer yourself.
      </p>
    </div>
  );
}
