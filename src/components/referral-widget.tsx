"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Gift, Share2 } from "lucide-react";

export function ReferralWidget() {
  const [code, setCode] = useState("MNB-XXXX");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Stable per-device referral code (kept locally).
    let c = "";
    try { c = localStorage.getItem("cortex_ref") || ""; } catch {}
    if (!c) { c = "MNB-" + Math.random().toString(36).slice(2, 7).toUpperCase(); try { localStorage.setItem("cortex_ref", c); } catch {} }
    setCode(c);
  }, []);

  const link = typeof window !== "undefined" ? `${window.location.origin}/?ref=${code}` : `https://mnb-cortex.vercel.app/?ref=${code}`;
  const msg = `I run my business with MNB Cortex — an AI COO that reads your data, spots problems early and tells you what to do. Try it free: ${link}`;

  function copy(text: string) { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }

  return (
    <div className="space-y-4">
      <Card className="p-6 text-center relative overflow-hidden">
        <div className="aurora opacity-60" aria-hidden />
        <div className="relative z-10">
          <div className="h-12 w-12 rounded-full brand-gradient grid place-items-center text-white mx-auto"><Gift className="h-6 w-6" /></div>
          <h2 className="mt-3 text-xl font-bold">Refer a business, earn rewards</h2>
          <p className="text-sm text-muted-foreground mt-1">Refer another SME. When they subscribe, you both get a month on us.</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <code className="rounded-lg border bg-background px-3 h-10 inline-flex items-center text-sm font-mono">{code}</code>
            <Button variant="outline" onClick={() => copy(link)}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy link</Button>
            <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer"><Button><Share2 className="h-4 w-4" /> Share on WhatsApp</Button></a>
          </div>
        </div>
      </Card>

      <div className="grid sm:grid-cols-3 gap-3">
        {[["1. Share your link", "Send it to another business owner who'd benefit."], ["2. They try it free", "They start a 14-day trial — no card needed."], ["3. You both earn", "When they subscribe, you each get a free month."]].map(([t, d]) => (
          <Card key={t} className="p-4"><div className="font-medium text-sm">{t}</div><div className="text-sm text-muted-foreground mt-1">{d}</div></Card>
        ))}
      </div>
    </div>
  );
}
