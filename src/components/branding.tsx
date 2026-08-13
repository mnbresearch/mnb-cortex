"use client";
import { useEffect } from "react";
import { ACCENTS } from "@/lib/utils";
export function Branding({ accent }: { accent?: string }) {
  useEffect(() => {
    // Fall through to the brand gold CSS variable for the default accents
    // ("gold"/legacy "teal") so it stays theme-aware; only override when an
    // org explicitly picks a different color.
    const isBrandDefault = !accent || accent === "gold" || accent === "teal";
    const hsl = isBrandDefault ? null : ACCENTS[accent];
    if (hsl) { document.documentElement.style.setProperty("--primary", hsl); document.documentElement.style.setProperty("--ring", hsl); }
  }, [accent]);
  return null;
}
