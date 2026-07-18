import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function inr(n: number, compact = true): string {
  if (n == null || isNaN(n)) return "—";
  if (compact) {
    if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
    if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
    if (Math.abs(n) >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  }
  return `₹${n.toLocaleString("en-IN")}`;
}

export function pct(n: number): string {
  if (n == null) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export const statusColor: Record<string, string> = {
  green: "text-success",
  yellow: "text-warning",
  red: "text-danger",
};
export const statusBg: Record<string, string> = {
  green: "bg-success/10 text-success border-success/20",
  yellow: "bg-warning/10 text-warning border-warning/20",
  red: "bg-danger/10 text-danger border-danger/20",
};

export function mdToHtml(s: string): string {
  return (s || "")
    .replace(/^### (.*)$/gm, "<h3 class='font-semibold mt-4 mb-1'>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2 class='text-base font-semibold mt-4 mb-1.5'>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1 class='text-lg font-bold mt-4 mb-2'>$1</h1>")
    .replace(/^\s*[-*] (.*)$/gm, "<li class='ml-5 list-disc'>$1</li>")
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
    .replace(/_(.*?)_/g, "<i>$1</i>")
    .replace(/\n/g, "<br/>");
}

export function leadScore(c: any): number {
  let s = 40;
  if (c.status === "active") s += 30; else if (c.status === "lead") s += 10; else s -= 20;
  const v = Number(c.value) || 0; s += Math.min(25, (v / 50000) * 25);
  if (c.last_touch) { const days = (Date.now() - new Date(c.last_touch).getTime()) / 864e5; if (days < 7) s += 10; else if (days > 60) s -= 15; }
  return Math.max(1, Math.min(100, Math.round(s)));
}
export function scoreTone(n: number): string {
  return n >= 70 ? "bg-success/10 text-success border-success/20" : n >= 45 ? "bg-warning/10 text-warning border-warning/20" : "bg-danger/10 text-danger border-danger/20";
}

export const ACCENTS: Record<string, string> = {
  teal: "178 74% 33%", emerald: "158 74% 38%", cyan: "190 85% 40%",
  indigo: "244 75% 59%", violet: "271 76% 53%", rose: "347 77% 50%",
  amber: "34 94% 48%", sky: "199 89% 48%",
};
