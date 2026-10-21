"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  QrCode,
  Check,
  Copy,
  ExternalLink,
  ShieldCheck,
  Smartphone,
  CheckCircle2,
  Share2,
  RefreshCw,
  Coins,
} from "lucide-react";
import { generateUpiQrSvg, buildUpiUri, buildUpiAppLinks, type UpiPaymentParams } from "@/lib/pay/upi";

export interface UpiQrCardProps {
  params: UpiPaymentParams;
  title?: string;
  subtitle?: string;
  className?: string;
  onPaymentSettled?: () => void;
}

export function UpiQrCard({
  params,
  title = "Instant Zero-Fee UPI Payment",
  subtitle = "Scan with any UPI app or tap to pay directly on mobile",
  className,
  onPaymentSettled,
}: UpiQrCardProps) {
  const [svgHtml, setSvgHtml] = useState<string>("");
  const [copiedVpa, setCopiedVpa] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState<"qr" | "intent" | "savings">("qr");
  const [isSettled, setIsSettled] = useState(false);

  useEffect(() => {
    let active = true;
    generateUpiQrSvg(params, { margin: 1 })
      .then((svg) => {
        if (active) setSvgHtml(svg);
      })
      .catch((err) => {
        console.error("Failed to generate UPI QR SVG:", err);
      });

    if (typeof window !== "undefined") {
      setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    }
    return () => {
      active = false;
    };
  }, [params.payeeVpa, params.amount, params.invoiceNo, params.note]);

  const deepLinks = buildUpiAppLinks(params);
  const upiUri = buildUpiUri(params);

  const formattedAmount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(params.amount);

  // Standard 2% gateway commission calculation for transparency
  const gatewayFee2Pct = Math.round(params.amount * 0.02);
  const formattedGatewayFee = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(gatewayFee2Pct);

  async function copyVpa() {
    try {
      await navigator.clipboard.writeText(params.payeeVpa);
      setCopiedVpa(true);
      setTimeout(() => setCopiedVpa(false), 2000);
    } catch {
      // Fallback
    }
  }

  async function copyUri() {
    try {
      await navigator.clipboard.writeText(upiUri);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback
    }
  }

  function handleSimulateSettlement() {
    setIsSettled(true);
    if (onPaymentSettled) onPaymentSettled();
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary shrink-0" />
            {title}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs">
              0% Gateway Fee
            </Badge>
            {isSettled && (
              <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-xs flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Settled
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Amount & Beneficiary Banner */}
        <div className="rounded-lg bg-muted/50 p-3.5 flex flex-wrap items-center justify-between gap-2 border">
          <div>
            <div className="text-xs text-muted-foreground">Amount to Pay</div>
            <div className="text-2xl font-bold tracking-tight text-foreground">{formattedAmount}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Payee Name</div>
            <div className="text-sm font-medium text-foreground">{params.payeeName}</div>
            {params.invoiceNo && (
              <div className="text-xs text-muted-foreground">Ref: {params.invoiceNo}</div>
            )}
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("qr")}
            className={`flex-1 py-1 px-2 rounded-md font-medium transition-all ${
              activeTab === "qr" ? "bg-background shadow-xs text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Dynamic QR
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("intent")}
            className={`flex-1 py-1 px-2 rounded-md font-medium transition-all ${
              activeTab === "intent" ? "bg-background shadow-xs text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            App Intent Links
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("savings")}
            className={`flex-1 py-1 px-2 rounded-md font-medium transition-all ${
              activeTab === "savings" ? "bg-background shadow-xs text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            MDR Fee Analysis
          </button>
        </div>

        {/* Tab 1: Dynamic Vector QR */}
        {activeTab === "qr" && (
          <div className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-900 rounded-xl border border-border/80 shadow-xs">
            {svgHtml ? (
              <div
                className="w-52 h-52 max-w-full [&>svg]:w-full [&>svg]:h-full"
                dangerouslySetInnerHTML={{ __html: svgHtml }}
              />
            ) : (
              <div className="w-52 h-52 flex items-center justify-center text-sm text-muted-foreground animate-pulse">
                Generating dynamic QR...
              </div>
            )}
            <div className="mt-3 text-center">
              <p className="text-xs font-medium text-muted-foreground flex items-center justify-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                NPCI Unified Payments Interface Verified
              </p>
            </div>
          </div>
        )}

        {/* Tab 2: Intent Deep Links */}
        {activeTab === "intent" && (
          <div className="space-y-3 p-3 rounded-xl border bg-muted/20 text-sm">
            <div className="text-xs text-muted-foreground">
              Direct deep link for customers on mobile or messaging apps:
            </div>
            <div className="flex items-center gap-2 p-2 bg-background border rounded-lg">
              <code className="text-xs font-mono truncate flex-1 text-muted-foreground">{upiUri}</code>
              <Button size="sm" variant="outline" onClick={copyUri} className="shrink-0 h-7 text-xs gap-1">
                {copiedLink ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                {copiedLink ? "Copied" : "Copy Link"}
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <a
                href={deepLinks.googlePay}
                className="inline-flex items-center justify-center text-xs font-medium border rounded-md h-8 px-2 hover:bg-muted bg-background"
              >
                GPay <ExternalLink className="h-3 w-3 ml-1 opacity-70" />
              </a>
              <a
                href={deepLinks.phonePe}
                className="inline-flex items-center justify-center text-xs font-medium border rounded-md h-8 px-2 hover:bg-muted bg-background"
              >
                PhonePe <ExternalLink className="h-3 w-3 ml-1 opacity-70" />
              </a>
              <a
                href={deepLinks.paytm}
                className="inline-flex items-center justify-center text-xs font-medium border rounded-md h-8 px-2 hover:bg-muted bg-background"
              >
                Paytm <ExternalLink className="h-3 w-3 ml-1 opacity-70" />
              </a>
              <a
                href={deepLinks.bhim}
                className="inline-flex items-center justify-center text-xs font-medium border rounded-md h-8 px-2 hover:bg-muted bg-background"
              >
                BHIM <ExternalLink className="h-3 w-3 ml-1 opacity-70" />
              </a>
            </div>
          </div>
        )}

        {/* Tab 3: Zero MDR Analysis */}
        {activeTab === "savings" && (
          <div className="space-y-3 p-3.5 rounded-xl border bg-emerald-500/5 text-sm">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium text-xs">
              <Coins className="h-4 w-4" /> Direct Bank Settlement Architecture
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Standard payment gateways charge 2% MDR + 18% GST. On this {formattedAmount} invoice, that would deduct approximately{" "}
              <strong className="text-foreground">{formattedGatewayFee}</strong> from your collection.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="p-2.5 rounded-lg border bg-background text-xs">
                <div className="text-muted-foreground">Gateway MDR</div>
                <div className="font-semibold text-rose-500 line-through mt-0.5">2.0% + GST</div>
              </div>
              <div className="p-2.5 rounded-lg border bg-background text-xs">
                <div className="text-muted-foreground">Cortex UPI Fee</div>
                <div className="font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">0.0% (Zero)</div>
              </div>
            </div>
          </div>
        )}

        {/* VPA Copy Row */}
        <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg border bg-background text-sm">
          <div className="truncate">
            <span className="text-xs text-muted-foreground block">UPI ID / VPA:</span>
            <code className="text-xs font-mono font-semibold">{params.payeeVpa}</code>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={copyVpa}
            className="shrink-0 h-8 gap-1.5"
            aria-label="Copy UPI VPA address"
          >
            {copiedVpa ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedVpa ? "Copied" : "Copy"}</span>
          </Button>
        </div>

        {/* Mobile One-Tap Intent Buttons */}
        {isMobile && (
          <div className="space-y-2 pt-1">
            <a
              href={deepLinks.universal}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground h-11 px-4 text-sm font-medium hover:opacity-90 shadow-xs"
            >
              <Smartphone className="h-4 w-4" /> Pay with Any UPI App
            </a>
          </div>
        )}

        {/* Settlement Simulator Switch */}
        <div className="pt-1 flex items-center justify-between border-t border-border/60 text-xs">
          <span className="text-muted-foreground">Testing collection workflow:</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSimulateSettlement}
            disabled={isSettled}
            className="h-7 text-xs text-primary hover:text-primary gap-1"
          >
            {isSettled ? (
              <>
                <Check className="h-3 w-3 text-emerald-500" /> Settled in Books
              </>
            ) : (
              <>
                <RefreshCw className="h-3 w-3" /> Simulate Settlement
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
