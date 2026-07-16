"use client";
import { useEffect } from "react";
import { ACCENTS } from "@/lib/utils";
export function Branding({ accent }: { accent?: string }) {
  useEffect(() => {
    const hsl = ACCENTS[accent || "indigo"];
    if (hsl) { document.documentElement.style.setProperty("--primary", hsl); document.documentElement.style.setProperty("--ring", hsl); }
  }, [accent]);
  return null;
}
