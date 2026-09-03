import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "MNB Cortex — Know what's going wrong, before it costs you",
  description: "The early-warning system for Indian businesses. Cortex reads your Tally, Vyapar or Excel exports and tells you who hasn't paid, what's due and what's about to run out — by email, before it costs you. Keep your accounting software.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "MNB Cortex", statusBarStyle: "black-translucent" },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/apple-touch-icon.png" },
  metadataBase: new URL("https://cortex.mnbresearch.com"),
  openGraph: { title: "MNB Cortex — Your books tell you what happened. Cortex tells you what's about to.", description: "Reads your Tally, Vyapar or Excel exports and warns you who hasn't paid, what's due and what's about to run out — by email, before it costs you.", type: "website", url: "https://cortex.mnbresearch.com" },
  twitter: { card: "summary_large_image", title: "MNB Cortex — Know what's going wrong, before it costs you", description: "The early-warning system for Indian businesses. Keep your accounting software; this is the part it was never built to do." },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F1E8" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1116" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={jakarta.variable}>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
