import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "MNB Cortex — The AI operating brain for your business",
  description: "The AI that runs your business and never forgets it. One brain across your whole company — it reads all your data, predicts what's coming, tells you exactly what to do, and does it.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "MNB Cortex", statusBarStyle: "black-translucent" },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/apple-touch-icon.png" },
  metadataBase: new URL("https://cortex.mnbresearch.com"),
  openGraph: { title: "MNB Cortex — The AI operating brain for your business", description: "Your business now has a brain of its own. It reads everything, remembers everything, predicts what's coming, and acts.", type: "website", url: "https://cortex.mnbresearch.com" },
  twitter: { card: "summary_large_image", title: "MNB Cortex — The AI operating brain for your business", description: "Your business now has a brain of its own — one AI that runs it and never forgets." },
};

export const viewport = { themeColor: "#0f9d8e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={jakarta.variable}>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
