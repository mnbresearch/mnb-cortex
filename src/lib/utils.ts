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
