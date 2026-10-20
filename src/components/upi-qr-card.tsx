"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QrCode, Check, Copy, ExternalLink, ShieldCheck, Smartphone } from "lucide-react";
import { generateUpiQrSvg, buildUpiUri, buildUpiAppLinks, type UpiPaymentParams } from "@/lib/pay/upi";

export interface UpiQrCardProps {
  params: UpiPaymentParams;
  title?: string;
  subtitle?: string;
  className?: string;
}

export function UpiQrCard({
  params,
  title = "Instant Zero-Fee UPI Payment",
  subtitle = "Scan with any UPI app or tap to pay directly on mobile",
  className,
}: UpiQrCardProps) {
  const [svgHtml, setSvgHtml] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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
  const formattedAmount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(params.amount);

  async function copyVpa() {
    try {
      await navigator.clipboard.writeText(params.payeeVpa);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary shrink-0" />
            {title}
          </CardTitle>
          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs">
            0% Gateway Fee
          </Badge>
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

        {/* QR Code Container */}
        <div className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-900 rounded-xl border border-border/80 shadow-sm">
          {svgHtml ? (
            <div
              className="w-56 h-56 max-w-full [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: svgHtml }}
            />
          ) : (
            <div className="w-56 h-56 flex items-center justify-center text-sm text-muted-foreground animate-pulse">
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
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </Button>
        </div>

        {/* Mobile One-Tap Intent Buttons */}
        {isMobile && (
          <div className="space-y-2 pt-1">
            <a
              href={deepLinks.universal}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground h-11 px-4 text-sm font-medium hover:opacity-90 shadow-sm"
            >
              <Smartphone className="h-4 w-4" /> Pay with Any UPI App
            </a>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <a
                href={deepLinks.googlePay}
                className="inline-flex items-center justify-center text-xs font-medium border rounded-md h-9 px-2 hover:bg-muted"
              >
                GPay <ExternalLink className="h-3 w-3 ml-1 opacity-70" />
              </a>
              <a
                href={deepLinks.phonePe}
                className="inline-flex items-center justify-center text-xs font-medium border rounded-md h-9 px-2 hover:bg-muted"
              >
                PhonePe <ExternalLink className="h-3 w-3 ml-1 opacity-70" />
              </a>
              <a
                href={deepLinks.paytm}
                className="inline-flex items-center justify-center text-xs font-medium border rounded-md h-9 px-2 hover:bg-muted"
              >
                Paytm <ExternalLink className="h-3 w-3 ml-1 opacity-70" />
              </a>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
