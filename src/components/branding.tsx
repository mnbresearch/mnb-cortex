"use client";
import { useEffect } from "react";
import { ACCENTS } from "@/lib/utils";
export function Branding({ accent }: { accent?: string }) {
  useEffect(() => {
    // Only override the brand teal when the org explicitly picks an accent.
    const hsl = accent ? ACCENTS[accent] : null;
    if (hsl) { document.documentElement.style.setProperty("--primary", hsl); document.documentElement.style.setProperty("--ring", hsl); }
  }, [accent]);
  return null;
}
