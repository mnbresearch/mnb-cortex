import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "MNB Cortex — The AI COO for SMEs",
  description: "An AI Operating System that monitors, predicts, recommends, and executes for your business.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "MNB Cortex", statusBarStyle: "black-translucent" },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/apple-touch-icon.png" },
  metadataBase: new URL("https://mnb-cortex.vercel.app"),
  openGraph: { title: "MNB Cortex — The AI COO for SMEs", description: "An AI Operating System that monitors, predicts, recommends and executes for your business.", type: "website", url: "https://mnb-cortex.vercel.app" },
  twitter: { card: "summary_large_image", title: "MNB Cortex — The AI COO for SMEs", description: "Run your company by asking, not by opening spreadsheets." },
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
