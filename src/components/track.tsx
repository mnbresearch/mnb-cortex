"use client";
import { useEffect } from "react";

/*
  Client-side funnel beacon. Sends ONE event per mount to /api/t, which
  accepts only a fixed list (lib/funnel.ts CLIENT_EVENTS) and honours Global
  Privacy Control / Do Not Track. No cookies, no third-party script.

  `navigator.sendBeacon` so a view is not lost when the visitor clicks away,
  and so it never delays rendering.
*/
type ClientEvent = "landing_view" | "pricing_view" | "calculator_view" | "plan_selected" | "signup_started" | "healthcheck_start" | "login_failed";

export function beacon(e: ClientEvent, extra: { plan?: string; cycle?: "monthly" | "annual"; reason?: "bad_credentials" | "already_registered" | "other" } = {}) {
  try {
    /* Honour the browser's own opt-out before anything leaves the page (the server checks the headers too). */
    const nav: any = typeof navigator !== "undefined" ? navigator : {};
    if (nav.globalPrivacyControl === true || nav.doNotTrack === "1") return;
    const body = JSON.stringify({ e, p: typeof location !== "undefined" ? location.pathname : null, ...extra });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/t", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/t", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
    }
  } catch { /* a counter must never break the page */ }
}

export function Track({ event }: { event: ClientEvent }) {
  useEffect(() => { beacon(event); }, [event]);
  return null;
}
